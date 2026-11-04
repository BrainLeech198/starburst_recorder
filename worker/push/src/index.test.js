import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { runDueReminders } from './index.js'
import { PASSWORD_ITERATIONS, createAdminSession } from './admin-auth.js'
import { createUnsubscribeToken } from './email.js'
import { localParts } from './schedule.js'
import { b64urlEncode } from './webpush.js'

/**
 * 服务端整链的集成测试：不碰 Cloudflare，用 Map 假装 KV、用 stub 假装推送服务。
 *
 * 验的是「接线」而不是密码学（那部分在 webpush.test.js 里对着 RFC 样例逐字节比过）：
 * 订阅收得下、到点扫得出来、加密头带对了、同一分钟不会推两次、端点死了会自己清掉。
 */

function createKv() {
  const store = new Map()
  return {
    store,
    async get(key, type) {
      if (!store.has(key)) return null
      const value = store.get(key)
      return type === 'json' ? JSON.parse(value) : value
    },
    async put(key, value) {
      store.set(key, value)
    },
    async delete(key) {
      store.delete(key)
    },
    async list({ prefix = '' } = {}) {
      return {
        keys: [...store.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      }
    },
  }
}

/** 造一份真实的订阅凭据：p256dh 必须是 65 字节未压缩点，否则加密会直接抛错 */
async function makeSubscription(endpoint = 'https://push.example.com/send/abc') {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return {
    endpoint,
    p256dh: b64urlEncode(p256dh),
    auth: b64urlEncode(auth),
  }
}

async function makeEnv() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return {
    PUSH_KV: createKv(),
    VAPID_PRIVATE_KEY: jwk.d,
    VAPID_PUBLIC_KEY: b64urlEncode(publicKey),
    VAPID_SUBJECT: 'mailto:test@example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
    APP_URL: 'https://app.example.com/',
    ADMIN_LOGIN_LIMITER: { async limit() { return { success: true } } },
    EMAIL_SUBSCRIBE_LIMITER: { async limit() { return { success: true } } },
  }
}

async function makePasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const digest = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
      key,
      256,
    ),
  )
  const encode = (bytes) => {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${encode(salt)}$${encode(digest)}`
}

function subscribeRequest(subscription, overrides = {}, token = '') {
  return new Request('https://push.example.workers.dev/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://app.example.com',
      ...(token ? { 'x-push-token': token } : {}),
    },
    body: JSON.stringify({
      subscription: { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      tz: 'UTC',
      slots: [{ id: 'weigh-0', category: 'weigh', time: '08:00', weekdays: [1, 4] }],
      copy: { weigh: { title: '该称重了', body: '打开应用记录今天的体重' } },
      ...overrides,
    }),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /subscribe', () => {
  it('收下订阅，回 CORS 头，KV 里只有时间与类别', async () => {
    const env = await makeEnv()
    const subscription = await makeSubscription()
    const response = await worker.fetch(subscribeRequest(subscription), env)

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(await response.json()).toEqual({ ok: true, slots: 1 })

    const [key] = [...env.PUSH_KV.store.keys()]
    expect(key.startsWith('sub:')).toBe(true)
    const record = JSON.parse(env.PUSH_KV.store.get(key))
    expect(record.tz).toBe('UTC')
    expect(record.slots).toEqual([
      { id: 'weigh-0', category: 'weigh', time: '08:00', weekdays: [1, 4] },
    ])
    // 隐私底线：KV 里不许出现任何提醒内容
    expect(JSON.stringify(record.slots)).not.toContain('称重了')
  })

  it('拒绝来路不明的源、非法时区、缺 keys 的订阅', async () => {
    const env = await makeEnv()
    const subscription = await makeSubscription()

    const evil = await worker.fetch(
      new Request('https://push.example.workers.dev/subscribe', {
        method: 'POST',
        headers: { Origin: 'https://evil.example.com' },
        body: '{}',
      }),
      env,
    )
    expect(evil.status).toBe(403)

    const badTz = await worker.fetch(subscribeRequest(subscription, { tz: 'Mars/Olympus' }), env)
    expect(badTz.status).toBe(400)

    const badKeys = await worker.fetch(
      subscribeRequest(subscription, { subscription: { endpoint: subscription.endpoint } }),
      env,
    )
    expect(badKeys.status).toBe(400)
  })

  it('配了 PUSH_TOKEN 时，令牌不对一律 401，对了才收', async () => {
    const env = await makeEnv()
    env.PUSH_TOKEN = 'shared-secret'
    const subscription = await makeSubscription()

    const missing = await worker.fetch(subscribeRequest(subscription), env)
    expect(missing.status).toBe(401)

    const wrong = await worker.fetch(subscribeRequest(subscription, {}, 'not-the-token'), env)
    expect(wrong.status).toBe(401)

    const right = await worker.fetch(subscribeRequest(subscription, {}, 'shared-secret'), env)
    expect(right.status).toBe(200)

    // 健康检查不设门：监控/自检不该需要令牌
    const health = await worker.fetch(new Request('https://push.example.workers.dev/health'), env)
    expect(health.status).toBe(200)
  })

  it('OPTIONS 预检直接 204，并允许 POST', async () => {
    const env = await makeEnv()
    const response = await worker.fetch(
      new Request('https://push.example.workers.dev/subscribe', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.example.com' },
      }),
      env,
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Idempotency-Key')
  })
})

describe('POST /unsubscribe', () => {
  it('删掉对应订阅，之后再扫也不会推', async () => {
    const env = await makeEnv()
    const subscription = await makeSubscription()
    await worker.fetch(subscribeRequest(subscription), env)
    expect(env.PUSH_KV.store.size).toBe(1)

    const response = await worker.fetch(
      new Request('https://push.example.workers.dev/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://app.example.com' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }),
      env,
    )
    expect(response.status).toBe(200)
    expect(env.PUSH_KV.store.size).toBe(0)
  })
})

describe('runDueReminders', () => {
  /** 让提醒位正好命中「现在」这一分钟 */
  async function subscribeNow(env, category = 'weigh') {
    const subscription = await makeSubscription()
    const now = new Date('2026-11-03T08:00:30Z')
    const parts = localParts('UTC', now)
    const slots = [{ id: `${category}-0`, category, time: parts.time, weekdays: [parts.weekday] }]
    const response = await worker.fetch(subscribeRequest(subscription, { slots }), env)
    expect(response.status).toBe(200)
    return { subscription, now }
  }

  it('到点推一条：aes128gcm + VAPID 头都在，载荷是加密的', async () => {
    const env = await makeEnv()
    const { subscription, now } = await subscribeNow(env)
    const sent = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        sent.push({ url, init })
        return new Response(null, { status: 201 })
      }),
    )

    const result = await runDueReminders(env, now)
    expect(result).toEqual({ scanned: 1, sent: 1, failed: 0 })
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe(subscription.endpoint)
    expect(sent[0].init.headers['Content-Encoding']).toBe('aes128gcm')
    expect(sent[0].init.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/)
    expect(sent[0].init.headers.TTL).toBe('86400')
    // 86 字节头 + 密文，且明文不该出现在请求体里
    expect(sent[0].init.body.length).toBeGreaterThan(86)
    expect(new TextDecoder().decode(sent[0].init.body)).not.toContain('该称重了')
  })

  it('同一分钟再扫一次不重复推', async () => {
    const env = await makeEnv()
    const { now } = await subscribeNow(env)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201 })))

    await runDueReminders(env, now)
    const second = await runDueReminders(env, now)
    expect(second).toEqual({ scanned: 1, sent: 0, failed: 0 })
  })

  it('时间没到就不推', async () => {
    const env = await makeEnv()
    await subscribeNow(env)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201 })))

    const result = await runDueReminders(env, new Date('2026-11-03T08:01:30Z'))
    expect(result).toEqual({ scanned: 1, sent: 0, failed: 0 })
  })

  it('一个端点网络失败不影响后面的订阅', async () => {
    const env = await makeEnv()
    const now = new Date('2026-11-03T08:00:30Z')
    const parts = localParts('UTC', now)
    const slots = [{ id: 'weigh-0', category: 'weigh', time: parts.time, weekdays: [parts.weekday] }]
    await worker.fetch(
      subscribeRequest(await makeSubscription('https://push.example.com/bad'), { slots }),
      env,
    )
    await worker.fetch(
      subscribeRequest(await makeSubscription('https://push.example.com/good'), { slots }),
      env,
    )

    const reached = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('/bad')) throw new Error('dns fail')
        reached.push(String(url))
        return new Response(null, { status: 201 })
      }),
    )

    const result = await runDueReminders(env, now)
    expect(result.scanned).toBe(2)
    // 坏端点算 failed、好端点算 sent：日志里的 sent 必须是真发出去了
    expect(result).toEqual({ scanned: 2, sent: 1, failed: 1 })
    expect(reached).toEqual(['https://push.example.com/good'])
  })

  it('推送服务说 410 时顺手删掉这条死订阅', async () => {
    const env = await makeEnv()
    await subscribeNow(env)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 410 })))

    const result = await runDueReminders(env, new Date('2026-11-03T08:00:30Z'))
    expect(result.sent).toBe(0)
    const subscriptionKeys = [...env.PUSH_KV.store.keys()].filter((key) => key.startsWith('sub:'))
    expect(subscriptionKeys).toHaveLength(0)
  })
})

/* ─────────── 官方频道：公告 / 订阅 / 反馈 ─────────── */

function channelRequest(path, options = {}) {
  return new Request(`https://push.example.workers.dev${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.origin === null ? {} : { Origin: options.origin ?? 'https://app.example.com' }),
      ...(options.adminToken ? { 'x-admin-token': options.adminToken } : {}),
      ...(options.sessionToken ? { Authorization: `Bearer ${options.sessionToken}` } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
}

function configureEmail(env, sendBatch = async () => {}) {
  const messages = []
  env.RESEND_API_KEY = 'resend-test-key'
  env.EMAIL_FROM = '星芒记录者 <updates@example.com>'
  env.UNSUBSCRIBE_TOKEN_SECRET = '0123456789abcdef0123456789abcdef'
  env.EMAIL_QUEUE = {
    messages,
    async send(message) {
      messages.push({ body: message })
    },
    async sendBatch(batch) {
      await sendBatch(batch)
      messages.push(...batch)
    },
  }
  return messages
}

async function subscribeAndConfirm(env, email) {
  const subscription = await worker.fetch(
    channelRequest('/subscribe-email', { method: 'POST', body: { email } }),
    env,
  )
  expect(subscription.status).toBe(200)
  const result = await subscription.json()
  if (result.confirmationRequired) {
    const message = env.EMAIL_QUEUE.messages.find(({ body }) => body.type === 'confirm-subscription')
    expect(message).toBeTruthy()
    const confirmationUrl = message.body.confirmationUrl
    expect((await worker.fetch(new Request(confirmationUrl), env)).status).toBe(200)
    const confirmed = await worker.fetch(
      new Request(confirmationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
      }),
      env,
    )
    expect(confirmed.status).toBe(200)
  }
  const queueMessages = env.EMAIL_QUEUE.messages
  const remainingMessages = queueMessages.filter(({ body }) => body.type !== 'confirm-subscription')
  queueMessages.splice(0, queueMessages.length, ...remainingMessages)
  return result
}

async function makeAdminSession(env = {}) {
  env.ADMIN_USERNAME = 'owner'
  env.ADMIN_SESSION_SECRET = '0123456789abcdef0123456789abcdef'
  return { env, sessionToken: await createAdminSession('owner', env.ADMIN_SESSION_SECRET) }
}

describe('官方频道的公开接口', () => {
  it('邮件服务未配置时保持旧订阅接口可用', async () => {
    const env = await makeEnv()
    const response = await worker.fetch(
      channelRequest('/subscribe-email', {
        method: 'POST',
        body: { email: 'legacy-flow@example.com' },
      }),
      env,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, subscribed: true })
    const status = await worker.fetch(
      channelRequest('/subscription?email=legacy-flow@example.com'),
      env,
    )
    expect((await status.json()).subscribed).toBe(true)
  })

  it('新邮箱先收确认邮件；点击确认页后才进入有效订阅名单', async () => {
    const env = await makeEnv()
    configureEmail(env)
    const subscribed = await worker.fetch(
      channelRequest('/subscribe-email', { method: 'POST', body: { email: 'new@example.com' } }),
      env,
    )
    expect(await subscribed.json()).toMatchObject({ ok: true, confirmationRequired: true })
    const [queuedConfirmation] = env.EMAIL_QUEUE.messages
    expect(queuedConfirmation.body.type).toBe('confirm-subscription')

    const sent = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        sent.push({ url, init })
        return Response.json({ id: 'confirm_email_1' }, { status: 200 })
      }),
    )
    const message = { body: queuedConfirmation.body, ack: vi.fn(), retry: vi.fn() }
    await worker.queue({ messages: [message] }, env)
    expect(message.ack).toHaveBeenCalledOnce()
    const confirmationEmail = JSON.parse(sent[0].init.body)
    expect(confirmationEmail.subject).toContain('确认订阅')
    expect(confirmationEmail.html).toContain('确认订阅')
    expect(confirmationEmail.headers).toBeUndefined()

    const before = await worker.fetch(
      channelRequest('/subscription?email=new@example.com'),
      env,
    )
    expect((await before.json()).subscribed).toBe(false)

    const link = queuedConfirmation.body.confirmationUrl
    const page = await worker.fetch(new Request(link), env)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('确认订阅')
    const confirmed = await worker.fetch(
      new Request(link, { method: 'POST', body: '' }),
      env,
    )
    expect(confirmed.status).toBe(200)
    const after = await worker.fetch(
      channelRequest('/subscription?email=new@example.com'),
      env,
    )
    expect((await after.json()).subscribed).toBe(true)
  })

  it('订阅邮箱后能查到订阅状态，退订后就没了', async () => {
    const env = await makeEnv()
    configureEmail(env)
    await subscribeAndConfirm(env, 'a@example.com')

    const status = await worker.fetch(channelRequest('/subscription?email=a@example.com'), env)
    expect(await status.json()).toEqual({ ok: true, subscribed: true })

    const unsubscribe = await worker.fetch(
      channelRequest('/unsubscribe-email', { method: 'POST', body: { email: 'a@example.com' } }),
      env,
    )
    expect(unsubscribe.status).toBe(200)

    const after = await worker.fetch(channelRequest('/subscription?email=a@example.com'), env)
    expect(await after.json()).toEqual({ ok: true, subscribed: false })
  })

  it('非法邮箱被拒，不落库', async () => {
    const env = await makeEnv()
    const response = await worker.fetch(
      channelRequest('/subscribe-email', { method: 'POST', body: { email: 'nope' } }),
      env,
    )
    expect(response.status).toBe(400)
    expect(env.PUSH_KV.store.size).toBe(0)
  })

  it('反馈收得下，公告读得到', async () => {
    const env = await makeEnv()
    const feedback = await worker.fetch(
      channelRequest('/feedback', { method: 'POST', body: { body: '用着别扭' } }),
      env,
    )
    expect(feedback.status).toBe(200)

    const notices = await worker.fetch(channelRequest('/notices'), env)
    expect((await notices.json()).notices).toEqual([])
  })

  it('来路不明的源照样被挡', async () => {
    const env = await makeEnv()
    const evil = await worker.fetch(
      new Request('https://push.example.workers.dev/notices', {
        headers: { Origin: 'https://evil.example.com' },
      }),
      env,
    )
    expect(evil.status).toBe(403)
  })

  it('这些接口不需要客户端令牌——它们不是推送订阅', async () => {
    const env = await makeEnv()
    env.PUSH_TOKEN = 'shared-secret'
    const response = await worker.fetch(channelRequest('/notices'), env)
    expect(response.status).toBe(200)
  })
})

describe('官方频道的管理面', () => {
  it('没配 ADMIN_TOKEN 时管理面整个关掉，不是放行', async () => {
    const env = await makeEnv()
    const response = await worker.fetch(channelRequest('/admin/subscribers'), env)
    expect(response.status).toBe(503)
  })

  it('令牌不对一律 401，对了才能发公告和导出订阅表', async () => {
    const env = await makeEnv()
    env.ADMIN_TOKEN = 'admin-secret'

    const missing = await worker.fetch(channelRequest('/admin/subscribers'), env)
    expect(missing.status).toBe(401)

    const wrong = await worker.fetch(
      channelRequest('/admin/subscribers', { adminToken: 'wrong' }),
      env,
    )
    expect(wrong.status).toBe(401)

    // 先订阅一个人，管理面才能导出到他
    configureEmail(env)
    await subscribeAndConfirm(env, 'a@example.com')

    const right = await worker.fetch(
      channelRequest('/admin/subscribers', { adminToken: 'admin-secret' }),
      env,
    )
    expect(right.status).toBe(200)
    const body = await right.json()
    expect(body.count).toBe(1)
    expect(body.subscribers[0].email).toBe('a@example.com')
  })

  it('发出来的公告能从公开接口读到，紧急标记也带着', async () => {
    const env = await makeEnv()
    env.ADMIN_TOKEN = 'admin-secret'

    const posted = await worker.fetch(
      channelRequest('/admin/notices', {
        method: 'POST',
        adminToken: 'admin-secret',
        body: { title: '请删除旧的 API Key', body: '之前的备份里有明文密钥', level: 'urgent' },
      }),
      env,
    )
    expect(posted.status).toBe(200)

    const notices = await worker.fetch(channelRequest('/notices'), env)
    const body = await notices.json()
    expect(body.notices.length).toBe(1)
    expect(body.notices[0].title).toBe('请删除旧的 API Key')
    expect(body.notices[0].level).toBe('urgent')
  })

  it('反馈也能从管理面翻出来', async () => {
    const env = await makeEnv()
    env.ADMIN_TOKEN = 'admin-secret'
    await worker.fetch(
      channelRequest('/feedback', { method: 'POST', body: { body: '某个按钮找不到' } }),
      env,
    )

    const response = await worker.fetch(
      channelRequest('/admin/feedback', { adminToken: 'admin-secret' }),
      env,
    )
    const body = await response.json()
    expect(body.count).toBe(1)
    expect(body.feedback[0].body).toBe('某个按钮找不到')
  })

  it('网页登录先校验密码，再用短期会话发布公告并读取管理状态', async () => {
    const env = await makeEnv()
    env.ADMIN_USERNAME = 'owner'
    env.ADMIN_PASSWORD_HASH = await makePasswordHash('correct horse battery staple')
    env.ADMIN_SESSION_SECRET = '0123456789abcdef0123456789abcdef'

    const wrong = await worker.fetch(
      channelRequest('/admin/session', {
        method: 'POST',
        body: { username: 'owner', password: 'incorrect' },
      }),
      env,
    )
    expect(wrong.status).toBe(401)

    const login = await worker.fetch(
      channelRequest('/admin/session', {
        method: 'POST',
        body: { username: 'owner', password: 'correct horse battery staple' },
      }),
      env,
    )
    expect(login.status).toBe(200)
    const { sessionToken, expiresIn } = await login.json()
    expect(sessionToken).toContain('.')
    expect(expiresIn).toBe(1800)

    const noSession = await worker.fetch(channelRequest('/admin/api/subscribers'), env)
    expect(noSession.status).toBe(401)

    const status = await worker.fetch(
      channelRequest('/admin/api/status', { sessionToken }),
      env,
    )
    expect(await status.json()).toMatchObject({ ok: true, emailSendingEnabled: false })

    const publish = await worker.fetch(
      channelRequest('/admin/api/notices', {
        method: 'POST',
        sessionToken,
        body: { title: '维护通知', body: '服务正常', level: 'info' },
      }),
      env,
    )
    expect(publish.status).toBe(200)

    const notices = await worker.fetch(channelRequest('/notices'), env)
    expect((await notices.json()).notices[0].title).toBe('维护通知')
  })

  it('登录限流器拒绝时返回 429；原 CLI 令牌仍独立可用', async () => {
    const env = await makeEnv()
    env.ADMIN_LOGIN_LIMITER = { async limit() { return { success: false } } }
    env.ADMIN_USERNAME = 'owner'
    env.ADMIN_PASSWORD_HASH = await makePasswordHash('correct horse battery staple')
    env.ADMIN_SESSION_SECRET = '0123456789abcdef0123456789abcdef'

    const limited = await worker.fetch(
      channelRequest('/admin/session', {
        method: 'POST',
        body: { username: 'owner', password: 'correct horse battery staple' },
      }),
      env,
    )
    expect(limited.status).toBe(429)

    env.ADMIN_TOKEN = 'cli-secret'
    const cli = await worker.fetch(
      channelRequest('/admin/notices', {
        method: 'POST',
        adminToken: 'cli-secret',
        body: { title: 'CLI 公告', body: '兼容仍在', level: 'info' },
      }),
      env,
    )
    expect(cli.status).toBe(200)
  })

  it('网页登录必须有官网 Origin 和限流器配置', async () => {
    const env = await makeEnv()
    env.ADMIN_USERNAME = 'owner'
    env.ADMIN_PASSWORD_HASH = await makePasswordHash('correct horse battery staple')
    env.ADMIN_SESSION_SECRET = '0123456789abcdef0123456789abcdef'
    env.ADMIN_LOGIN_LIMITER = undefined

    const noOrigin = await worker.fetch(
      channelRequest('/admin/session', {
        method: 'POST',
        origin: null,
        body: { username: 'owner', password: 'correct horse battery staple' },
      }),
      env,
    )
    expect(noOrigin.status).toBe(403)

    const noLimiter = await worker.fetch(
      channelRequest('/admin/session', {
        method: 'POST',
        body: { username: 'owner', password: 'correct horse battery staple' },
      }),
      env,
    )
    expect(noLimiter.status).toBe(503)
  })

  it('邮件单发与公告+邮件分别排队', async () => {
    const env = await makeEnv()
    const queued = configureEmail(env)
    const { sessionToken } = await makeAdminSession(env)
    await subscribeAndConfirm(env, 'a@example.com')

    const status = await worker.fetch(channelRequest('/admin/api/status', { sessionToken }), env)
    expect((await status.json()).emailSendingEnabled).toBe(true)

    const emailOnly = await worker.fetch(
      channelRequest('/admin/api/messages', {
        method: 'POST',
        sessionToken,
        idempotencyKey: 'campaign-email-001',
        body: { delivery: 'email', title: '版本更新', body: '新版本已发布' },
      }),
      env,
    )
    const emailOnlyBody = await emailOnly.json()
    expect(emailOnly.status).toBe(200)
    expect(emailOnlyBody.notice).toBeNull()
    expect(emailOnlyBody.email).toMatchObject({ total: 1, queued: 1, failed: 0, status: 'queued' })
    expect(queued[0].body.subject).toBe('版本更新')
    expect(queued[0].body.unsubscribeUrl).toContain('/unsubscribe-email?token=')

    const both = await worker.fetch(
      channelRequest('/admin/api/messages', {
        method: 'POST',
        sessionToken,
        idempotencyKey: 'campaign-both-001',
        body: { delivery: 'both', title: '紧急维护', body: '请稍后再试', level: 'urgent' },
      }),
      env,
    )
    const bothBody = await both.json()
    expect(both.status).toBe(200)
    expect(bothBody.notice.level).toBe('urgent')
    expect(bothBody.email.status).toBe('queued')

    const notices = await worker.fetch(channelRequest('/notices'), env)
    const noticeList = (await notices.json()).notices
    expect(noticeList).toHaveLength(1)
    expect(noticeList[0].title).toBe('紧急维护')
    expect(queued).toHaveLength(2)
  })

  it('组合发送部分失败时保留已发布公告并明确返回 207', async () => {
    const env = await makeEnv()
    configureEmail(env, async () => { throw new Error('queue unavailable') })
    const { sessionToken } = await makeAdminSession(env)
    await subscribeAndConfirm(env, 'a@example.com')

    const response = await worker.fetch(
      channelRequest('/admin/api/messages', {
        method: 'POST',
        sessionToken,
        idempotencyKey: 'campaign-partial-001',
        body: { delivery: 'both', title: '通知', body: '内容' },
      }),
      env,
    )
    const result = await response.json()
    expect(response.status).toBe(207)
    expect(result.notice.title).toBe('通知')
    expect(result.email).toMatchObject({ total: 1, queued: 0, failed: 1 })
    const notices = await worker.fetch(channelRequest('/notices'), env)
    expect((await notices.json()).notices[0].title).toBe('通知')
  })

  it('只发邮件时队列部分失败也返回可由管理页展示的 207 结果', async () => {
    const env = await makeEnv()
    configureEmail(env, async () => { throw new Error('queue unavailable') })
    const { sessionToken } = await makeAdminSession(env)
    await subscribeAndConfirm(env, 'a@example.com')

    const response = await worker.fetch(
      channelRequest('/admin/api/messages', {
        method: 'POST',
        sessionToken,
        idempotencyKey: 'campaign-email-partial-001',
        body: { delivery: 'email', title: '通知', body: '内容' },
      }),
      env,
    )
    const result = await response.json()

    expect(response.status).toBe(207)
    expect(result.notice).toBeNull()
    expect(result.email).toMatchObject({ total: 1, queued: 0, failed: 1, status: 'partial_or_failed' })
  })

  it('邮件队列使用稳定幂等键、退订头，并跳过已处理的重复消息', async () => {
    const env = await makeEnv()
    configureEmail(env)
    await subscribeAndConfirm(env, 'a@example.com')
    const [subscriptionKey] = [...env.PUSH_KV.store.keys()].filter((key) => key.startsWith('sub:'))
    const subscription = await env.PUSH_KV.get(subscriptionKey, 'json')
    const token = await createUnsubscribeToken(
      'a@example.com',
      env.UNSUBSCRIBE_TOKEN_SECRET,
      subscription.subscriptionId,
    )
    const unsubscribeUrl = `https://push.example.workers.dev/unsubscribe-email?token=${token}`
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        calls.push({ url, init })
        return Response.json({ id: 'email_123' }, { status: 200 })
      }),
    )
    const job = {
      type: 'announcement',
      id: `campaign-001-abcdefabcdefabcdefabcdefabcdefabcdefabcd-${subscription.subscriptionId}`,
      to: 'a@example.com',
      subscriptionId: subscription.subscriptionId,
      title: '公告',
      subject: '星芒记录者公告',
      body: '<script>提醒</script>',
      unsubscribeUrl,
    }
    const message = { body: job, ack: vi.fn(), retry: vi.fn() }

    await worker.queue({ messages: [message] }, env)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.resend.com/emails')
    expect(calls[0].init.headers['Idempotency-Key']).toBe(job.id)
    const mail = JSON.parse(calls[0].init.body)
    expect(mail.to).toEqual(['a@example.com'])
    expect(mail.headers['List-Unsubscribe']).toBe(`<${unsubscribeUrl}>`)
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(mail.html).toContain('&lt;script&gt;提醒&lt;/script&gt;')
    expect(message.ack).toHaveBeenCalledOnce()

    const duplicate = { body: job, ack: vi.fn(), retry: vi.fn() }
    await worker.queue({ messages: [duplicate] }, env)
    expect(calls).toHaveLength(1)
    expect(duplicate.ack).toHaveBeenCalledOnce()
  })

  it('Resend 暂时拒绝时保留队列任务并按配置延迟重试', async () => {
    const env = await makeEnv()
    configureEmail(env)
    await subscribeAndConfirm(env, 'a@example.com')
    const [subscriptionKey] = [...env.PUSH_KV.store.keys()].filter((key) => key.startsWith('sub:'))
    const subscription = await env.PUSH_KV.get(subscriptionKey, 'json')
    const token = await createUnsubscribeToken(
      'a@example.com',
      env.UNSUBSCRIBE_TOKEN_SECRET,
      subscription.subscriptionId,
    )
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'rate limited' }, { status: 429 })))
    const message = {
      body: {
        type: 'announcement',
        id: `campaign-retry-${subscription.subscriptionId}`,
        to: 'a@example.com',
        subscriptionId: subscription.subscriptionId,
        subject: '公告',
        body: '内容',
        unsubscribeUrl: `https://push.example.workers.dev/unsubscribe-email?token=${token}`,
      },
      ack: vi.fn(),
      retry: vi.fn(),
    }

    await worker.queue({ messages: [message] }, env)

    expect(message.ack).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 })
  })

  it('退订页不在 GET 时删除订阅，确认 POST 后通过签名链接退订', async () => {
    const env = await makeEnv()
    configureEmail(env)
    await subscribeAndConfirm(env, 'a@example.com')
    const [subscriptionKey] = [...env.PUSH_KV.store.keys()].filter((key) => key.startsWith('sub:'))
    const subscription = await env.PUSH_KV.get(subscriptionKey, 'json')
    const token = await createUnsubscribeToken(
      'a@example.com',
      env.UNSUBSCRIBE_TOKEN_SECRET,
      subscription.subscriptionId,
    )

    const page = await worker.fetch(
      new Request(`https://push.example.workers.dev/unsubscribe-email?token=${token}`),
      env,
    )
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('确认取消订阅')

    const statusBefore = await worker.fetch(channelRequest('/subscription?email=a@example.com'), env)
    expect((await statusBefore.json()).subscribed).toBe(true)

    const post = await worker.fetch(
      new Request(`https://push.example.workers.dev/unsubscribe-email?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
      env,
    )
    expect(post.status).toBe(200)
    expect(await post.json()).toMatchObject({ ok: true, unsubscribed: true })
    const statusAfter = await worker.fetch(channelRequest('/subscription?email=a@example.com'), env)
    expect((await statusAfter.json()).subscribed).toBe(false)
  })

  it('旧退订链接不能取消后来重新订阅的地址', async () => {
    const env = await makeEnv()
    configureEmail(env)
    await subscribeAndConfirm(env, 'a@example.com')
    const [subscriptionKey] = [...env.PUSH_KV.store.keys()].filter((key) => key.startsWith('sub:'))
    const oldSubscription = await env.PUSH_KV.get(subscriptionKey, 'json')
    const oldToken = await createUnsubscribeToken(
      'a@example.com',
      env.UNSUBSCRIBE_TOKEN_SECRET,
      oldSubscription.subscriptionId,
    )

    await worker.fetch(
      channelRequest('/unsubscribe-email', { method: 'POST', body: { email: 'a@example.com' } }),
      env,
    )
    await subscribeAndConfirm(env, 'a@example.com')
    const oldLink = `https://push.example.workers.dev/unsubscribe-email?token=${oldToken}`
    const stalePage = await worker.fetch(new Request(oldLink), env)
    expect(stalePage.status).toBe(400)
    const stalePost = await worker.fetch(new Request(oldLink, { method: 'POST' }), env)
    expect(stalePost.status).toBe(200)

    const status = await worker.fetch(channelRequest('/subscription?email=a@example.com'), env)
    expect((await status.json()).subscribed).toBe(true)
  })
})
