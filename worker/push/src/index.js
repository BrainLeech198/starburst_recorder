/**
 * Web Push 服务端（Cloudflare Worker + KV + Cron）。
 *
 * 只做三件事：
 *   1. `/subscribe`   收下订阅端点 + 时区 + 「几点、哪类」的提醒清单；
 *   2. `/unsubscribe` 删掉订阅（用户关推送时调用）；
 *   3. 每分钟被 cron 唤醒一次，把「这一刻该响」的提醒加密后推出去。
 *
 * 刻意不存的东西：提醒的具体内容（日程标题、体重、训练项目）。服务端要知道几点推，
 * 但不需要知道推的是什么，所以文案是客户端订阅时一起交上来的通用版本，
 * 存的是「9:30 有一条日程提醒」，不是「9:30 看牙医」。这条线一旦越过，
 * 一个免费的推送中继就变成了用户的隐私数据库。
 *
 * 部署与密钥见同目录 README.md。
 */
import { dedupeKey, isValidTimeZone, localParts, matchSlot } from './schedule.js'
import { encryptPayload, vapidHeaders } from './webpush.js'
import { createAdminSession, verifyAdminCredentials, verifyAdminSession } from './admin-auth.js'
import {
  createConfirmationToken,
  createUnsubscribeToken,
  formatAnnouncementEmail,
  formatConfirmationEmail,
  subscriptionConfirmationPage,
  unsubscribeConfirmationPage,
  verifyConfirmationToken,
  verifyUnsubscribeToken,
} from './email.js'
import {
  confirmEmailSubscription,
  emailKey,
  isSubscribed,
  listFeedback,
  listNotices,
  listSubscribers,
  normalizeEmail,
  putFeedback,
  putNotice,
  sanitizeNotice,
  subscribeEmail,
  unsubscribeEmail,
} from './channel.js'

/** 与客户端 `MAX_SCHEDULE_SLOTS` 对齐：超出直接拒，免得一份请求把 KV 撑爆 */
const MAX_SLOTS = 20
/** 请求体上限。正常一份订阅约 1KB，16KB 已经非常宽松 */
const MAX_BODY_BYTES = 16 * 1024
/** 去重标记留 26 小时：跨过夏令时切换也不会误重发 */
const DEDUPE_TTL = 60 * 60 * 26
const CATEGORIES = ['weigh', 'training', 'schedule']
const EMAIL_QUEUE_BATCH_SIZE = 15
const EMAIL_SENT_TTL = 60 * 60 * 24 * 30
/** 客户端没交文案时的兜底（正常路径不会走到） */
const FALLBACK_COPY = { title: '星芒记录者', body: '你有一条提醒' }

const TEXT = new TextEncoder()

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

/**
 * 跨域：网页版在 `*.pages.dev`，Worker 在 `*.workers.dev`，是两个源。
 * `ALLOWED_ORIGINS` 用逗号分隔，写 `*` 表示全放行（只建议本地调试时用）。
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin')
  if (!origin) return {}
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (allowed.includes('*')) return { 'Access-Control-Allow-Origin': '*' }
  if (!allowed.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    // 自定义头必须在预检时放行，否则浏览器不会发送真正的请求。
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key, x-push-token, x-admin-token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/**
 * 共享令牌闸门。
 *
 * CORS 只挡得住「别的网页偷偷调」，挡不住终端里 `curl` 一下——而这个地址一旦被
 * 无差别扫描，最直接的后果是 KV 每天 1000 次的写额度被打满，**用户当天的提醒会全部静默**。
 * 这种故障不报错、过一天自愈，最难查，所以宁可多一道门。
 *
 * 它挡不住什么：令牌在网页产物里，真想针对这个应用逆向一次还是能扒出来。
 * 要真正防住需要账号体系，那不属于这个个人应用的范畴。
 *
 * `PUSH_TOKEN` 没配时直接放行（本地调试方便），配了就必须带对。
 */
function tokenRejected(request, env, cors) {
  const expected = env.PUSH_TOKEN
  if (!expected) return null
  const provided = request.headers.get('x-push-token') ?? ''
  if (provided.length !== expected.length) return json({ error: 'unauthorized' }, 401, cors)
  // 定长比较：避免按字符提前返回泄露前缀信息
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return diff === 0 ? null : json({ error: 'unauthorized' }, 401, cors)
}

/** 订阅端点是长 URL，直接当 KV 键太长；取哈希前 40 位，碰撞概率可以忽略 */
async function endpointKey(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', TEXT.encode(endpoint))
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `sub:${hex.slice(0, 40)}`
}

/** 读请求体并解析成 JSON。太大或不是 JSON 都直接判失败 */
async function readJson(request) {
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return { error: 'body too large', status: 413 }
  try {
    return { body: JSON.parse(raw) }
  } catch {
    return { error: 'invalid json', status: 400 }
  }
}

/**
 * 管理令牌闸门。
 *
 * 与客户端令牌**分开**：客户端令牌会打进网页产物，谁都能扒出来；
 * 而「发公告、导出订阅邮箱、翻用户反馈」这些动作不能开放给任何人。
 * 所以这里用独立的 `ADMIN_TOKEN`，只存在于本机与 Worker 的 secret 里。
 *
 * 没配 `ADMIN_TOKEN` 时整个管理面**关闭**（返回 503），而不是放行——
 * 忘了配就等于没开管理后台，而不是「谁都能发公告」。
 */
function adminRejected(request, env, cors) {
  const expected = env.ADMIN_TOKEN
  if (!expected) return json({ error: 'admin disabled' }, 503, cors)
  const provided = request.headers.get('x-admin-token') ?? ''
  if (provided.length !== expected.length) return json({ error: 'unauthorized' }, 401, cors)
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return diff === 0 ? null : json({ error: 'unauthorized' }, 401, cors)
}

/** POST /admin/session：用账号密码换取 30 分钟内有效的签名会话 */
async function postAdminSession(request, env, cors) {
  // 登录只能从配置过的官网页面发起；命令行继续走独立的 ADMIN_TOKEN。
  if (!request.headers.get('Origin')) return json({ error: 'origin required' }, 403, cors)
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD_HASH || !env.ADMIN_SESSION_SECRET) {
    return json({ error: 'admin login not configured' }, 503, cors)
  }
  if (!env.ADMIN_LOGIN_LIMITER) return json({ error: 'admin login limiter not configured' }, 503, cors)

  let allowed
  try {
    const client = request.headers.get('CF-Connecting-IP') || 'unknown'
    allowed = await env.ADMIN_LOGIN_LIMITER.limit({ key: client })
  } catch {
    // 限流器不可用时拒绝登录，避免服务故障退化成无限次密码尝试。
    return json({ error: 'admin login temporarily unavailable' }, 503, cors)
  }
  if (!allowed?.success) return json({ error: 'too many login attempts' }, 429, cors)

  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, parsed.status, cors)
  const { username, password } = parsed.body ?? {}
  if (
    typeof username !== 'string' || username.length < 1 || username.length > 100 ||
    typeof password !== 'string' || password.length < 1 || password.length > 256
  ) {
    return json({ error: 'invalid credentials' }, 400, cors)
  }

  if (!(await verifyAdminCredentials(username, password, env))) {
    return json({ error: 'invalid username or password' }, 401, cors)
  }
  const token = await createAdminSession(env.ADMIN_USERNAME, env.ADMIN_SESSION_SECRET)
  if (!token) return json({ error: 'admin login not configured' }, 503, cors)
  return json({ ok: true, sessionToken: token, expiresIn: 30 * 60 }, 200, cors)
}

/** 管理网页会话闸门：与 CLI 的 x-admin-token 完全分开 */
async function adminSessionRejected(request, env, cors) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_SESSION_SECRET) {
    return json({ error: 'admin login not configured' }, 503, cors)
  }
  const authorization = request.headers.get('Authorization') ?? ''
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization)
  if (!match || !(await verifyAdminSession(match[1], env.ADMIN_SESSION_SECRET, env.ADMIN_USERNAME))) {
    return json({ error: 'unauthorized' }, 401, cors)
  }
  return null
}

/** 邮件发送只有在 API Key、发件地址、退订密钥和队列都已配置时才开放。 */
function getAdminStatus(env, cors) {
  const emailSendingEnabled = emailSendingReady(env)
  return json(
    {
      ok: true,
      emailSendingEnabled,
      emailReason: emailSendingEnabled
        ? ''
        : '邮件发送未配置：需要 Resend API Key、已验证的发件地址、退订密钥和邮件队列',
    },
    200,
    cors,
  )
}
function isValidTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false
  const [hour, minute] = value.split(':').map(Number)
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function sanitizeSlots(slots) {
  if (!Array.isArray(slots)) return null
  const clean = []
  for (const slot of slots.slice(0, MAX_SLOTS)) {
    if (!slot || typeof slot !== 'object') return null
    if (typeof slot.id !== 'string' || !slot.id || slot.id.length > 64) return null
    if (!CATEGORIES.includes(slot.category)) return null
    if (!isValidTime(slot.time)) return null
    const entry = { id: slot.id, category: slot.category, time: slot.time }
    if (Array.isArray(slot.weekdays)) {
      const weekdays = [...new Set(slot.weekdays)]
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        .sort((a, b) => a - b)
      if (weekdays.length) entry.weekdays = weekdays
    }
    if (typeof slot.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(slot.date)) {
      entry.date = slot.date
    }
    // 既没有 weekdays 也没有 date 的提醒永远命中不了，收下来只是垃圾
    if (!entry.weekdays && !entry.date) continue
    clean.push(entry)
  }
  return clean
}

function sanitizeCopy(copy) {
  const clean = {}
  for (const category of CATEGORIES) {
    const item = copy?.[category]
    const title = typeof item?.title === 'string' ? item.title.slice(0, 60) : ''
    const body = typeof item?.body === 'string' ? item.body.slice(0, 120) : ''
    clean[category] = title ? { title, body } : { ...FALLBACK_COPY }
  }
  return clean
}

async function subscribe(request, env, cors) {
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'body too large' }, 413, cors)

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'invalid json' }, 400, cors)
  }

  const endpoint = body?.subscription?.endpoint
  const keys = body?.subscription?.keys
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) {
    return json({ error: 'invalid endpoint' }, 400, cors)
  }
  if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    return json({ error: 'invalid keys' }, 400, cors)
  }
  if (!isValidTimeZone(body?.tz)) return json({ error: 'invalid tz' }, 400, cors)

  const slots = sanitizeSlots(body?.slots)
  if (!slots) return json({ error: 'invalid slots' }, 400, cors)

  const key = await endpointKey(endpoint)
  await env.PUSH_KV.put(
    key,
    JSON.stringify({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      tz: body.tz,
      slots,
      copy: sanitizeCopy(body?.copy),
      updatedAt: Date.now(),
    }),
  )
  return json({ ok: true, slots: slots.length }, 200, cors)
}

async function unsubscribe(request, env, cors) {
  let body
  try {
    body = JSON.parse(await request.text())
  } catch {
    return json({ error: 'invalid json' }, 400, cors)
  }
  const endpoint = body?.endpoint
  if (typeof endpoint !== 'string' || !endpoint) {
    return json({ error: 'invalid endpoint' }, 400, cors)
  }
  await env.PUSH_KV.delete(await endpointKey(endpoint))
  return json({ ok: true }, 200, cors)
}

/* ─────────────── 官方频道：公告 / 邮箱订阅 / 用户反馈 ───────────────
 *
 * 这一组接口**不要求客户端令牌**：公告是公开信息，订阅与反馈是用户主动发起的。
 * 订阅确认与管理员登录分别走 Cloudflare Rate Limiting；管理员网页使用短期会话，
 * 原有 CLI 管理接口仍使用 `ADMIN_TOKEN`。
 */

/** GET /notices：当前公告列表，新的在前 */
async function getNotices(env, cors) {
  const notices = await listNotices(env.PUSH_KV)
  return json({ ok: true, notices }, 200, cors)
}

/** POST /subscribe-email：订阅邮箱。只为收公告 */
async function postSubscribeEmail(request, env, cors) {
  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, parsed.status, cors)
  const email = normalizeEmail(parsed.body?.email)
  if (!email) return json({ error: 'invalid email' }, 400, cors)
  if (!emailSendingReady(env) || !env.EMAIL_SUBSCRIBE_LIMITER) {
    return json({ error: 'email subscription confirmation is not configured' }, 503, cors)
  }

  let allowed
  try {
    const client = request.headers.get('CF-Connecting-IP') || 'unknown'
    allowed = await env.EMAIL_SUBSCRIBE_LIMITER.limit({ key: client })
  } catch {
    return json({ error: 'email subscription temporarily unavailable' }, 503, cors)
  }
  if (!allowed?.success) return json({ error: 'too many subscription requests' }, 429, cors)

  const record = await subscribeEmail(env.PUSH_KV, email)
  if (!record) return json({ error: 'invalid email' }, 400, cors)
  if (record.alreadySubscribed) return json({ ok: true, subscribed: true }, 200, cors)

  const token = await createConfirmationToken(
    record.email,
    env.UNSUBSCRIBE_TOKEN_SECRET,
    record.subscriptionId,
  )
  if (!token) return json({ error: 'email confirmation unavailable' }, 503, cors)
  const confirmationUrl = new URL('/confirm-email', request.url)
  confirmationUrl.searchParams.set('token', token)
  try {
    await env.EMAIL_QUEUE.send({
      type: 'confirm-subscription',
      id: `confirm-${record.subscriptionId}`,
      to: record.email,
      subscriptionId: record.subscriptionId,
      confirmationUrl: confirmationUrl.toString(),
    })
  } catch {
    return json({ error: 'confirmation email could not be queued' }, 503, cors)
  }
  return json({ ok: true, confirmationRequired: true }, 200, cors)
}

/** POST /unsubscribe-email：退订。地址不在表里也算成功 */
async function postUnsubscribeEmail(request, env, cors) {
  const token = new URL(request.url).searchParams.get('token')
  if (token) {
    const contentType = request.headers.get('Content-Type') ?? ''
    let oneClick = false
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData().catch(() => null)
      if (form?.has('List-Unsubscribe') && form.get('List-Unsubscribe') !== 'One-Click') {
        return json({ error: 'invalid unsubscribe request' }, 400, cors)
      }
      oneClick = form?.get('List-Unsubscribe') === 'One-Click'
    }
    const signed = await verifyUnsubscribeToken(token, env.UNSUBSCRIBE_TOKEN_SECRET)
    if (!signed) return json({ error: 'invalid unsubscribe token' }, 400, cors)
    const subscriber = await env.PUSH_KV.get(signed.key, 'json')
    const currentId = subscriber?.subscriptionId ?? String(Number(subscriber?.createdAt) || 0)
    if (subscriber?.email && currentId === signed.subscriptionId) {
      await env.PUSH_KV.delete(signed.key)
    }
    if (contentType.includes('application/x-www-form-urlencoded') && !oneClick) {
      return new Response(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>已取消订阅</title><body style="margin:0;padding:48px 18px;background:#0c1119;color:#e8edf4;font:16px/1.6 system-ui,sans-serif"><main style="max-width:440px;margin:auto;padding:28px;border:1px solid #344154;border-radius:16px;background:#151d29"><h1 style="font-size:22px">已取消邮件订阅</h1><p>之后不会再向此地址发送公告邮件。</p></main></body></html>',
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          },
        },
      )
    }
    return json({ ok: true, unsubscribed: true }, 200, cors)
  }

  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, parsed.status, cors)
  const email = parsed.body?.email
  if (typeof email !== 'string' || !email.trim()) {
    return json({ error: 'invalid email' }, 400, cors)
  }
  await unsubscribeEmail(env.PUSH_KV, email)
  return json({ ok: true }, 200, cors)
}

/** GET /unsubscribe-email?token=… never unsubscribes on page load, to avoid email scanner clicks. */
async function getUnsubscribeConfirmation(request, env) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const signed = await verifyUnsubscribeToken(token, env.UNSUBSCRIBE_TOKEN_SECRET)
  const subscriber = signed ? await env.PUSH_KV.get(signed.key, 'json') : null
  const currentId = subscriber?.subscriptionId ?? String(Number(subscriber?.createdAt) || 0)
  const isCurrent = subscriber?.email && currentId === signed?.subscriptionId
  const html = isCurrent
    ? unsubscribeConfirmationPage(token)
    : '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>邮件订阅</title><body><p>此退订链接无效，或该地址已取消订阅。</p></body></html>'
  return new Response(html, {
    status: isCurrent ? 200 : 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

function confirmationResultPage(confirmed) {
  const heading = confirmed ? '订阅已确认' : '确认链接无效'
  const message = confirmed
    ? '之后会通过邮件发送星芒记录者的官方公告。'
    : '链接可能已过期，或已被新的订阅请求替代。请重新提交邮箱订阅。'
  return new Response(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${heading}</title><body style="margin:0;padding:48px 18px;background:#0c1119;color:#e8edf4;font:16px/1.6 system-ui,sans-serif"><main style="max-width:440px;margin:auto;padding:28px;border:1px solid #344154;border-radius:16px;background:#151d29"><h1 style="font-size:22px">${heading}</h1><p>${message}</p></main></body></html>`,
    {
      status: confirmed ? 200 : 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  )
}

/** Confirmation GET only shows a form; mail scanners cannot activate subscriptions by opening links. */
async function getEmailConfirmation(request, env) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const claims = await verifyConfirmationToken(token, env.UNSUBSCRIBE_TOKEN_SECRET)
  const record = claims ? await env.PUSH_KV.get(claims.key, 'json') : null
  const currentId = typeof record?.subscriptionId === 'string'
    ? record.subscriptionId
    : String(Number(record?.createdAt) || 0)
  const matches = record?.email && currentId === claims?.subscriptionId
  if (matches && (typeof record.confirmedAt !== 'number' || record.confirmedAt > 0)) {
    return confirmationResultPage(true)
  }
  const pendingAndFresh = matches && record.confirmedAt === 0 &&
    Date.now() - (Number(record.createdAt) || 0) <= 7 * 24 * 60 * 60 * 1000
  if (!pendingAndFresh) return confirmationResultPage(false)
  return new Response(subscriptionConfirmationPage(token), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

async function postEmailConfirmation(request, env) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const claims = await verifyConfirmationToken(token, env.UNSUBSCRIBE_TOKEN_SECRET)
  if (!claims) return confirmationResultPage(false)
  const confirmed = await confirmEmailSubscription(
    env.PUSH_KV,
    claims.key,
    claims.subscriptionId,
  )
  return confirmationResultPage(confirmed)
}

/** GET /subscription?email=…：这个地址是不是已订阅 */
async function getSubscription(request, env, cors) {
  const email = new URL(request.url).searchParams.get('email') ?? ''
  const subscribed = await isSubscribed(env.PUSH_KV, email)
  return json({ ok: true, subscribed }, 200, cors)
}

/** POST /feedback：用户提交给官方的反馈 */
async function postFeedback(request, env, cors) {
  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, parsed.status, cors)
  const record = await putFeedback(env.PUSH_KV, parsed.body?.body)
  if (!record) return json({ error: 'empty feedback' }, 400, cors)
  return json({ ok: true, id: record.id }, 200, cors)
}

/* ─────────────── 管理面：需要 ADMIN_TOKEN ─────────────── */

async function storeAdminNotice(input, env) {
  const clean = sanitizeNotice(input)
  if (!clean) return null
  const id = `${Date.now()}-${crypto.randomUUID()}`
  return putNotice(env.PUSH_KV, id, clean)
}

/** POST /admin/notices：发一条公告。level 传 urgent 就是紧急公告 */
async function postAdminNotice(request, env, cors) {
  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, parsed.status, cors)
  const record = await storeAdminNotice(parsed.body, env)
  if (!record) return json({ error: 'invalid notice' }, 400, cors)
  return json({ ok: true, notice: record }, 200, cors)
}

function emailSendingReady(env) {
  return Boolean(
    env.RESEND_API_KEY &&
    env.EMAIL_FROM &&
    env.UNSUBSCRIBE_TOKEN_SECRET &&
    new TextEncoder().encode(env.UNSUBSCRIBE_TOKEN_SECRET).length >= 32 &&
    env.EMAIL_QUEUE,
  )
}

/** One queue message per email; IDs stay stable if the browser retries the same operation. */
async function enqueueAnnouncementEmails(request, env, { title, body, subject }) {
  const idempotencyKey = request.headers.get('Idempotency-Key') ?? ''
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
    return { total: 0, queued: 0, failed: 0, error: 'missing idempotency key' }
  }

  const subscribers = await listSubscribers(env.PUSH_KV)
  const result = { total: subscribers.length, queued: 0, failed: 0 }
  const queueBatch = []
  const unsubscribeBase = new URL('/unsubscribe-email', request.url)

  async function flush() {
    if (!queueBatch.length) return
    const outgoing = queueBatch.splice(0, queueBatch.length)
    try {
      await env.EMAIL_QUEUE.sendBatch(outgoing.map((message) => ({ body: message, contentType: 'json' })))
      result.queued += outgoing.length
    } catch {
      result.failed += outgoing.length
      // 不写收件地址或公告内容到日志。
      console.error(JSON.stringify({ event: 'admin_email_enqueue_failed', count: outgoing.length }))
    }
  }

  for (const subscriber of subscribers) {
    const subscriptionKey = await emailKey(subscriber.email)
    const token = await createUnsubscribeToken(
      subscriber.email,
      env.UNSUBSCRIBE_TOKEN_SECRET,
      subscriber.subscriptionId,
    )
    if (!token) {
      result.failed += 1
      continue
    }
    const unsubscribeUrl = new URL(unsubscribeBase)
    unsubscribeUrl.searchParams.set('token', token)
    queueBatch.push({
      type: 'announcement',
      id: `${idempotencyKey}-${subscriptionKey.slice('sub:'.length)}-${subscriber.subscriptionId}`,
      subscriptionId: subscriber.subscriptionId,
      to: subscriber.email,
      title,
      subject,
      body,
      unsubscribeUrl: unsubscribeUrl.toString(),
    })
    if (queueBatch.length >= EMAIL_QUEUE_BATCH_SIZE) await flush()
  }
  await flush()
  return result
}

/** POST /admin/api/messages: publish the in-app notice, queue subscriber email, or do both. */
async function postAdminMessage(request, env, cors) {
  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, parsed.status, cors)
  const input = parsed.body ?? {}
  const delivery = input.delivery
  if (!['notice', 'email', 'both'].includes(delivery)) {
    return json({ error: 'invalid delivery' }, 400, cors)
  }
  const clean = sanitizeNotice(input)
  if (!clean) return json({ error: 'invalid notice' }, 400, cors)

  const subject = typeof input.subject === 'string' && input.subject.trim()
    ? input.subject.trim()
    : clean.title
  if (subject.length > 180 || /[\r\n]/.test(subject)) {
    return json({ error: 'invalid email subject' }, 400, cors)
  }
  if (delivery !== 'notice' && !/^[A-Za-z0-9_-]{8,100}$/.test(request.headers.get('Idempotency-Key') ?? '')) {
    return json({ error: 'missing or invalid idempotency key' }, 400, cors)
  }
  if (delivery !== 'notice' && !emailSendingReady(env)) {
    return json({ error: 'email sending is not configured' }, 503, cors)
  }

  let notice = null
  if (delivery === 'notice' || delivery === 'both') {
    notice = await storeAdminNotice(clean, env)
    if (!notice) return json({ error: 'invalid notice' }, 400, cors)
  }

  if (delivery === 'notice') return json({ ok: true, delivery, notice }, 200, cors)

  let email
  try {
    email = await enqueueAnnouncementEmails(request, env, {
      title: clean.title,
      body: clean.body,
      subject,
    })
  } catch {
    email = { total: 0, queued: 0, failed: 0, error: 'subscriber list unavailable' }
  }

  if (email.error || email.failed > 0) {
    return json(
      { ok: false, delivery, notice, email: { ...email, status: 'partial_or_failed' } },
      207,
      cors,
    )
  }
  return json(
    {
      ok: true,
      delivery,
      notice,
      email: {
        ...email,
        status: email.total === 0 ? 'no_subscribers' : 'queued',
      },
    },
    200,
    cors,
  )
}

async function deliverQueuedEmail(message, env) {
  const job = message?.body
  const recipient = typeof job?.to === 'string' ? job.to : ''
  const email = normalizeEmail(recipient)
  const id = typeof job?.id === 'string' ? job.id : ''
  const type = job?.type
  const subscriptionId = typeof job?.subscriptionId === 'string' ? job.subscriptionId : ''
  if (
    !email || email !== recipient || !/^[A-Za-z0-9_-]{8,240}$/.test(id) ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(subscriptionId)
  ) {
    return 'invalid'
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.PUSH_KV) return 'retry'

  const marker = `email:sent:${id}`
  if (await env.PUSH_KV.get(marker)) return 'already-sent'

  const key = await emailKey(email)
  const subscription = await env.PUSH_KV.get(key, 'json')
  const currentId = subscription?.subscriptionId ?? String(Number(subscription?.createdAt) || 0)
  if (subscription?.email !== email || currentId !== subscriptionId) return 'unsubscribed'

  let subject
  let rendered
  let headers = {}
  if (type === 'confirm-subscription') {
    const confirmationUrl = typeof job.confirmationUrl === 'string' ? job.confirmationUrl : ''
    let confirmation
    try {
      confirmation = new URL(confirmationUrl)
    } catch {
      return 'invalid'
    }
    if (
      confirmation.protocol !== 'https:' || confirmation.pathname !== '/confirm-email' ||
      subscription.confirmedAt !== 0 || Date.now() - (Number(subscription.createdAt) || 0) > 7 * 24 * 60 * 60 * 1000
    ) return 'unsubscribed'
    subject = '请确认订阅星芒记录者公告邮件'
    rendered = formatConfirmationEmail({ confirmationUrl })
  } else if (type === 'announcement') {
    const requestedSubject = typeof job.subject === 'string' ? job.subject : ''
    const body = typeof job.body === 'string' ? job.body : ''
    const unsubscribeUrl = typeof job.unsubscribeUrl === 'string' ? job.unsubscribeUrl : ''
    let unsubscribe
    try {
      unsubscribe = new URL(unsubscribeUrl)
    } catch {
      return 'invalid'
    }
    if (
      !requestedSubject || requestedSubject.length > 180 || /[\r\n]/.test(requestedSubject) ||
      !body || body.length > 4000 || unsubscribe.protocol !== 'https:' ||
      unsubscribe.pathname !== '/unsubscribe-email' ||
      (typeof subscription.confirmedAt === 'number' && subscription.confirmedAt === 0)
    ) return 'invalid'
    subject = requestedSubject
    rendered = formatAnnouncementEmail({ body, unsubscribeUrl })
    headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }
  } else {
    return 'invalid'
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': id,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject,
      text: rendered.text,
      html: rendered.html,
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    console.warn(JSON.stringify({ event: 'announcement_email_retry', jobId: id, status: response.status }))
    return 'retry'
  }

  await env.PUSH_KV.put(marker, JSON.stringify({ sentAt: Date.now() }), {
    expirationTtl: EMAIL_SENT_TTL,
  })
  console.log(JSON.stringify({ event: 'announcement_email_sent', jobId: id }))
  return 'sent'
}

async function consumeAnnouncementEmails(batch, env) {
  for (const message of batch.messages) {
    try {
      const outcome = await deliverQueuedEmail(message, env)
      if (
        outcome === 'sent' || outcome === 'already-sent' || outcome === 'unsubscribed' ||
        outcome === 'invalid'
      ) {
        message.ack()
        if (outcome === 'invalid') {
          console.warn(JSON.stringify({
            event: 'announcement_email_invalid_job',
            jobId: typeof message.body?.id === 'string' ? message.body.id : 'invalid',
          }))
        }
      } else {
        message.retry({ delaySeconds: 60 })
      }
    } catch {
      console.error(JSON.stringify({
        event: 'announcement_email_error',
        jobId: typeof message.body?.id === 'string' ? message.body.id : 'invalid',
      }))
      message.retry({ delaySeconds: 60 })
    }
  }
}

/** GET /admin/subscribers：导出订阅邮箱表 */
async function getAdminSubscribers(env, cors) {
  const subscribers = await listSubscribers(env.PUSH_KV)
  return json({ ok: true, count: subscribers.length, subscribers }, 200, cors)
}

/** GET /admin/feedback：翻用户反馈 */
async function getAdminFeedback(env, cors) {
  const items = await listFeedback(env.PUSH_KV)
  return json({ ok: true, count: items.length, feedback: items }, 200, cors)
}

/** 推一条。返回 HTTP 状态码，调用方据此判断订阅是否已经死了 */
async function deliver(record, payload, env) {
  const body = await encryptPayload(TEXT.encode(JSON.stringify(payload)), {
    keys: record.keys,
  })
  const headers = {
    ...(await vapidHeaders(record.endpoint, env)),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: '86400',
    Urgency: 'normal',
  }
  try {
    const response = await fetch(record.endpoint, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.log('push failed', response.status, detail.slice(0, 200))
    }
    return response.status
  } catch (error) {
    // 一个端点的 DNS / 超时不能把整轮扫描带走：后面还有别的订阅要推
    console.log('push error', error?.message ?? String(error))
    return 0
  }
}

/**
 * 每分钟跑一次：把所有订阅翻出来，各自换算到自己的时区，命中就推。
 *
 * 去重标记**先写再推**：宁可掉一条，也不要同一分钟内重复弹两次——
 * cron 偶尔会重叠执行，用户看到的重复通知比晚一分钟更烦。
 */async function runDueReminders(env, now = new Date()) {
  let cursor
  let sent = 0
  let failed = 0
  let scanned = 0

  do {
    const page = await env.PUSH_KV.list({ prefix: 'sub:', cursor })
    for (const key of page.keys) {
      scanned += 1
      const record = await env.PUSH_KV.get(key.name, 'json')
      if (!record?.endpoint || !isValidTimeZone(record.tz)) continue

      const parts = localParts(record.tz, now)
      for (const slot of record.slots ?? []) {
        if (!matchSlot(slot, parts)) continue

        const marker = dedupeKey(key.name, slot, parts)
        if (await env.PUSH_KV.get(marker)) continue
        await env.PUSH_KV.put(marker, '1', { expirationTtl: DEDUPE_TTL })

        const copy = record.copy?.[slot.category] ?? FALLBACK_COPY
        const status = await deliver(
          record,
          {
            title: copy.title,
            body: copy.body,
            tag: `starburst-${slot.category}`,
            ...(env.APP_URL ? { url: env.APP_URL } : {}),
          },
          env,
        )
        if (status === 404 || status === 410) {
          // 推送服务说这个端点没了（用户卸载 / 清数据）：顺手清掉，别再白推
          await env.PUSH_KV.delete(key.name)
          break
        }
        // 只有真的被推送服务收下才算发出去了：日志里「sent 1」必须是能看见的通知，
        // 网络失败要单独计一个 failed，否则排错时会被误导
        if (status >= 200 && status < 300) sent += 1
        else failed += 1
      }
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  return { scanned, sent, failed }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)
    if (cors === null) return json({ error: 'origin not allowed' }, 403, {})

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    // 预检请求不带自定义头，所以令牌校验只能放在 OPTIONS 之后
    if (url.pathname === '/subscribe' || url.pathname === '/unsubscribe') {
      const rejected = tokenRejected(request, env, cors)
      if (rejected) return rejected
    }

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      return subscribe(request, env, cors)
    }
    if (url.pathname === '/unsubscribe' && request.method === 'POST') {
      return unsubscribe(request, env, cors)
    }

    // ─── 官方频道（公开读 + 用户主动写）───
    if (url.pathname === '/notices' && request.method === 'GET') {
      return getNotices(env, cors)
    }
    if (url.pathname === '/subscribe-email' && request.method === 'POST') {
      return postSubscribeEmail(request, env, cors)
    }
    if (url.pathname === '/unsubscribe-email' && request.method === 'POST') {
      return postUnsubscribeEmail(request, env, cors)
    }
    if (url.pathname === '/unsubscribe-email' && request.method === 'GET') {
      return getUnsubscribeConfirmation(request, env)
    }
    if (url.pathname === '/confirm-email' && request.method === 'GET') {
      return getEmailConfirmation(request, env)
    }
    if (url.pathname === '/confirm-email' && request.method === 'POST') {
      return postEmailConfirmation(request, env)
    }
    if (url.pathname === '/subscription' && request.method === 'GET') {
      return getSubscription(request, env, cors)
    }
    if (url.pathname === '/feedback' && request.method === 'POST') {
      return postFeedback(request, env, cors)
    }

    // ─── 管理网页账号登录与短期会话 ───
    if (url.pathname === '/admin/session' && request.method === 'POST') {
      return postAdminSession(request, env, cors)
    }
    if (url.pathname.startsWith('/admin/api/')) {
      const rejected = await adminSessionRejected(request, env, cors)
      if (rejected) return rejected
      if (url.pathname === '/admin/api/status' && request.method === 'GET') {
        return getAdminStatus(env, cors)
      }
      if (url.pathname === '/admin/api/notices' && request.method === 'POST') {
        return postAdminNotice(request, env, cors)
      }
      if (url.pathname === '/admin/api/messages' && request.method === 'POST') {
        return postAdminMessage(request, env, cors)
      }
      if (url.pathname === '/admin/api/subscribers' && request.method === 'GET') {
        return getAdminSubscribers(env, cors)
      }
      if (url.pathname === '/admin/api/feedback' && request.method === 'GET') {
        return getAdminFeedback(env, cors)
      }
    }

    // ─── 管理 CLI（需要 ADMIN_TOKEN）───
    if (url.pathname.startsWith('/admin/')) {
      const rejected = adminRejected(request, env, cors)
      if (rejected) return rejected
      if (url.pathname === '/admin/notices' && request.method === 'POST') {
        return postAdminNotice(request, env, cors)
      }
      if (url.pathname === '/admin/subscribers' && request.method === 'GET') {
        return getAdminSubscribers(env, cors)
      }
      if (url.pathname === '/admin/feedback' && request.method === 'GET') {
        return getAdminFeedback(env, cors)
      }
    }

    if (url.pathname === '/health') return json({ ok: true }, 200, cors)
    if (url.pathname === '/') return json({ name: 'starburst-push', ok: true }, 200, cors)
    return json({ error: 'not found' }, 404, cors)
  },

  async queue(batch, env) {
    await consumeAnnouncementEmails(batch, env)
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runDueReminders(env).then(
        (result) => console.log('cron', controller.cron, JSON.stringify(result)),
        (error) => console.error('cron failed', error?.stack ?? String(error)),
      ),
    )
  },
}

// 导出给单测用（Worker 运行时不会用到这些名字）
export { runDueReminders, sanitizeSlots }
