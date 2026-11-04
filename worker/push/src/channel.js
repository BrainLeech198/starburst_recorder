/**
 * 「官方频道」：公告、邮箱订阅、用户反馈。
 *
 * 这条线跟 Web Push 是**两件不同的事**，刻意分开放：
 *
 * - Push 只覆盖网页版 / PWA（浏览器才有推送服务）。安卓与 Windows 安装包的用户
 *   收不到任何推送——他们在系统通知里跟应用完全隔离。
 * - 公告、订阅、反馈是**所有平台都要用**的，所以放在自己的模块里，
 *   客户端直接按普通 HTTP 接口调，不依赖推送服务。
 *
 * 存的东西：
 *   `notice:<id>`   一条公告（标题、正文、级别、紧急标记、发布时间）
 *   `sub:<hash>`    一个邮箱订阅者
 *   `fb:<id>`       一条用户反馈
 *
 * **不存的东西**：用户的日记、账目、健康数据——这里一个都不碰。
 * 邮箱只用于收公告，退订即删。
 *
 * 邮箱用 SHA-256 哈希后当 KV 键：键里不出现明文地址，
 * 而同一个地址永远映射到同一个键，退订时能直接删掉。
 */

/** 公告级别：info 是普通通知，urgent 是要立刻处理的那种 */
export const NOTICE_LEVELS = ['info', 'urgent']

/** 一次最多取多少条公告。客户端只要最新的一条，多了没意义 */
export const MAX_NOTICES = 20
/** 反馈正文上限。够写好几段，又不至于拿它当上传通道 */
const MAX_FEEDBACK_LENGTH = 4000
/** 邮箱地址上限。超过这个长度的一定不是邮箱 */
const MAX_EMAIL_LENGTH = 254
/** 待确认地址七天后失效；确认邮件可重新发送。 */
const EMAIL_CONFIRMATION_TTL = 7 * 24 * 60 * 60 * 1000

/**
 * 邮箱校验。
 *
 * 刻意**不**追求 RFC 5322 的完整语法：真正的验证是把邮件发出去看能不能退信，
 * 而我们不做发信（订阅只是收件地址）。这里只挡住明显不是邮箱的输入，
 * 以及把大小写统一掉，避免同一个地址因为大小写不同被存成两条订阅。
 *
 * 允许的点号、加号、横线、下划线；不允许开头或结尾有点、不允许连续两点。
 */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (!email || email.length > MAX_EMAIL_LENGTH) return null
  // 整个串只允许一次 @，且 @ 后面必须有点（域名）
  const at = email.indexOf('@')
  if (at <= 0 || at !== email.lastIndexOf('@')) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!domain.includes('.')) return null
  if (domain.startsWith('.') || domain.endsWith('.')) return null
  // 域名里也不能有连续的点：`a@b..com` 不是合法域名
  if (domain.includes('..')) return null
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null
  if (!/^[a-z0-9.-]+$/.test(domain)) return null
  return email
}

/** 邮箱 → KV 键。哈希后地址不落在键名里，也天然做了去重 */
export async function emailKey(email, salt = '') {
  const digest = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(salt + email))
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `sub:${hex.slice(0, 40)}`
}

const TEXT_ENCODER = new TextEncoder()

/**
 * 一条公告的形状校验。
 *
 * 只留三个字段：级别、标题、正文。时间由服务端打，不信客户端传的时间戳——
 * 否则一条声称「昨天发布」的公告能永远压在最新一条上面。
 */
export function sanitizeNotice(input) {
  if (!input || typeof input !== 'object') return null
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : ''
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 4000) : ''
  if (!title || !body) return null
  const level = NOTICE_LEVELS.includes(input.level) ? input.level : 'info'
  return { title, body, level }
}

/** 反馈正文：去掉首尾空白并截断 */
export function sanitizeFeedback(input) {
  if (typeof input !== 'string') return null
  const body = input.trim().slice(0, MAX_FEEDBACK_LENGTH)
  return body ? body : null
}

/**
 * 读公告列表，按发布时间倒序。
 *
 * 客户端只取最新一条，所以列表本身不需要很长；存太多也是浪费 KV 的读额度。
 */
export async function listNotices(kv, limit = MAX_NOTICES) {
  const notices = []
  let cursor
  do {
    const page = await kv.list({ prefix: 'notice:', cursor })
    for (const key of page.keys) {
      const record = await kv.get(key.name, 'json')
      if (!record?.title || !record?.body) continue
      notices.push({
        id: key.name.slice('notice:'.length),
        title: record.title,
        body: record.body,
        level: NOTICE_LEVELS.includes(record.level) ? record.level : 'info',
        createdAt: Number(record.createdAt) || 0,
        ...(Number.isFinite(Number(record.updatedAt)) && Number(record.updatedAt) > 0
          ? { updatedAt: Number(record.updatedAt) }
          : {}),
      })
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor && notices.length < limit)

  notices.sort((a, b) => b.createdAt - a.createdAt)
  return notices.slice(0, limit)
}

/** 写一条公告。id 由调用方给（一般是时间戳），时间由服务端打 */
export async function putNotice(kv, id, notice, now = Date.now()) {
  const clean = sanitizeNotice(notice)
  if (!clean) return null
  const key = `notice:${id}`
  await kv.put(key, JSON.stringify({ ...clean, createdAt: now }))
  return { id, ...clean, createdAt: now }
}

/** Update an existing notice in place while preserving its original publication time. */
export async function updateNotice(kv, id, notice, now = Date.now()) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,180}$/.test(id)) return null
  const clean = sanitizeNotice(notice)
  if (!clean) return null
  const key = `notice:${id}`
  const existing = await kv.get(key, 'json')
  if (!existing?.title || !existing?.body) return null
  const createdAt = Number(existing.createdAt) || now
  const updatedAt = now
  const record = { ...clean, createdAt, updatedAt }
  await kv.put(key, JSON.stringify(record))
  return { id, ...record }
}

/** Delete an existing notice by its ID. */
export async function deleteNotice(kv, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,180}$/.test(id)) return false
  const key = `notice:${id}`
  if (!(await kv.get(key))) return false
  await kv.delete(key)
  return true
}

/** 新订阅先进入待确认状态；已确认地址重复提交时不重置订阅。 */
export async function subscribeEmail(kv, email, now = Date.now()) {
  const clean = normalizeEmail(email)
  if (!clean) return null
  const key = await emailKey(clean)
  const existing = await kv.get(key, 'json')
  const existingCreatedAt = Number(existing?.createdAt) || 0
  const existingSubscriptionId = typeof existing?.subscriptionId === 'string'
    ? existing.subscriptionId
    : String(existingCreatedAt)
  const existingIsConfirmed = Boolean(existing?.email) &&
    (typeof existing.confirmedAt !== 'number' || existing.confirmedAt > 0)
  if (existingIsConfirmed) {
    return {
      email: clean,
      createdAt: existingCreatedAt,
      subscriptionId: existingSubscriptionId,
      alreadySubscribed: true,
    }
  }
  if (
    existing?.email && existing.confirmedAt === 0 &&
    now - existingCreatedAt <= EMAIL_CONFIRMATION_TTL
  ) {
    return {
      email: clean,
      createdAt: existingCreatedAt,
      subscriptionId: existingSubscriptionId,
      alreadySubscribed: false,
    }
  }

  const subscriptionId = crypto.randomUUID()
  await kv.put(key, JSON.stringify({ email: clean, createdAt: now, subscriptionId, confirmedAt: 0 }))
  return { email: clean, createdAt: now, subscriptionId, alreadySubscribed: false }
}

/** Keep the existing App flow working while the mail sender is unavailable. */
export async function subscribeEmailWithoutConfirmation(kv, email, now = Date.now()) {
  const clean = normalizeEmail(email)
  if (!clean) return null
  const key = await emailKey(clean)
  const existing = await kv.get(key, 'json')
  if (existing?.email && (typeof existing.confirmedAt !== 'number' || existing.confirmedAt > 0)) {
    return { email: clean, createdAt: Number(existing.createdAt) || now, alreadySubscribed: true }
  }

  const createdAt = now
  // Records without confirmedAt retain the legacy explicit-subscription state.
  await kv.put(key, JSON.stringify({ email: clean, createdAt }))
  return { email: clean, createdAt, alreadySubscribed: false }
}

/** Confirm only the current pending subscription; old links cannot confirm a later re-subscription. */
export async function confirmEmailSubscription(kv, key, subscriptionId, now = Date.now()) {
  if (!/^sub:[a-f0-9]{40}$/.test(key) || typeof subscriptionId !== 'string') return false
  const record = await kv.get(key, 'json')
  if (!record?.email) return false
  const currentId = typeof record.subscriptionId === 'string'
    ? record.subscriptionId
    : String(Number(record.createdAt) || 0)
  if (currentId !== subscriptionId) return false
  // A legacy record has no confirmedAt field and already represents explicit consent.
  if (typeof record.confirmedAt !== 'number' || record.confirmedAt > 0) return true
  if (record.confirmedAt !== 0 || now - (Number(record.createdAt) || 0) > EMAIL_CONFIRMATION_TTL) {
    await kv.delete(key)
    return false
  }
  await kv.put(key, JSON.stringify({ ...record, confirmedAt: now }))
  return true
}

/** 退订：邮箱不在订阅表里也算成功——用户要的是「别再给我发」，不是「真的有删掉东西」 */
export async function unsubscribeEmail(kv, email) {
  const clean = normalizeEmail(email)
  if (!clean) return false
  await kv.delete(await emailKey(clean))
  return true
}

/** 这个地址是不是已订阅 */
export async function isSubscribed(kv, email) {
  const clean = normalizeEmail(email)
  if (!clean) return false
  const record = await kv.get(await emailKey(clean), 'json')
  return Boolean(record?.email) && (typeof record.confirmedAt !== 'number' || record.confirmedAt > 0)
}

/** 取全部订阅者。管理端用，按订阅时间排序 */
export async function listSubscribers(kv) {
  const people = []
  let cursor
  do {
    const page = await kv.list({ prefix: 'sub:', cursor })
    for (const key of page.keys) {
      const record = await kv.get(key.name, 'json')
      if (!record?.email) continue
      if (typeof record.confirmedAt === 'number' && record.confirmedAt === 0) continue
      const createdAt = Number(record.createdAt) || 0
      people.push({
        email: record.email,
        createdAt,
        // Older records do not have an ID; their creation timestamp still invalidates old links on re-subscribe.
        subscriptionId: typeof record.subscriptionId === 'string'
          ? record.subscriptionId
          : String(createdAt),
      })
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  people.sort((a, b) => a.createdAt - b.createdAt)
  return people
}

/** 存一条反馈。id 用时间戳加随机后缀，同一秒提交两条也不会撞 */
export async function putFeedback(kv, body, now = Date.now(), rand = Math.random()) {
  const clean = sanitizeFeedback(body)
  if (!clean) return null
  const suffix = Math.floor(rand * 1e6)
    .toString(36)
    .padStart(4, '0')
  const id = `${now.toString(36)}-${suffix}`
  const record = { body: clean, createdAt: now }
  await kv.put(`fb:${id}`, JSON.stringify(record))
  return { id, ...record }
}

/** 取全部反馈。管理端用，按时间倒序（新的在前） */
export async function listFeedback(kv) {
  const items = []
  let cursor
  do {
    const page = await kv.list({ prefix: 'fb:', cursor })
    for (const key of page.keys) {
      const record = await kv.get(key.name, 'json')
      if (!record?.body) continue
      items.push({
        id: key.name.slice('fb:'.length),
        body: record.body,
        createdAt: Number(record.createdAt) || 0,
      })
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  items.sort((a, b) => b.createdAt - a.createdAt)
  return items
}
