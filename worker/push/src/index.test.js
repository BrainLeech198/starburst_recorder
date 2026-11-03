import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { runDueReminders } from './index.js'
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
  }
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
      Origin: 'https://app.example.com',
      ...(options.adminToken ? { 'x-admin-token': options.adminToken } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
}

describe('官方频道的公开接口', () => {
  it('订阅邮箱后能查到订阅状态，退订后就没了', async () => {
    const env = await makeEnv()

    const subscribe = await worker.fetch(
      channelRequest('/subscribe-email', { method: 'POST', body: { email: 'a@example.com' } }),
      env,
    )
    expect(subscribe.status).toBe(200)

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
    await worker.fetch(
      channelRequest('/subscribe-email', { method: 'POST', body: { email: 'a@example.com' } }),
      env,
    )

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
})
