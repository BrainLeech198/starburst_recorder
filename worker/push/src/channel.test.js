import { describe, expect, it } from 'vitest'
import {
  emailKey,
  confirmEmailSubscription,
  isSubscribed,
  listFeedback,
  listNotices,
  listSubscribers,
  normalizeEmail,
  putFeedback,
  putNotice,
  sanitizeFeedback,
  sanitizeNotice,
  subscribeEmail,
  subscribeEmailWithoutConfirmation,
  unsubscribeEmail,
} from './channel.js'

/**
 * 官方频道的纯逻辑测试。
 *
 * 重点是三件容易出错的事：
 *   1. 邮箱校验别放进乱七八糟的东西（这也关系到能不能挡住垃圾订阅）
 *   2. 同一个邮箱永远映射到同一个键——否则重复订阅会存成两条，退订删不干净
 *   3. 公告只按服务端时间排序，不信客户端传的时间戳
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

describe('normalizeEmail', () => {
  it('收下正常地址，转成小写', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com')
    expect(normalizeEmail('a.b+tag@example.co.uk')).toBe('a.b+tag@example.co.uk')
  })

  it('挡掉明显不是邮箱的输入', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail('nope')).toBeNull()
    expect(normalizeEmail('a@b')).toBeNull()
    expect(normalizeEmail('a@@b.com')).toBeNull()
    expect(normalizeEmail('.a@b.com')).toBeNull()
    expect(normalizeEmail('a.@b.com')).toBeNull()
    expect(normalizeEmail('a..b@b.com')).toBeNull()
    expect(normalizeEmail('a@b..com')).toBeNull()
    expect(normalizeEmail('a b@c.com')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(`${'x'.repeat(300)}@example.com`)).toBeNull()
  })
})

describe('emailKey', () => {
  it('同一个邮箱永远同一个键，且键里不出现明文地址', async () => {
    const a = await emailKey('user@example.com')
    const b = await emailKey('user@example.com')
    expect(a).toBe(b)
    expect(a.startsWith('sub:')).toBe(true)
    expect(a).not.toContain('user@example.com')
  })

  it('不同邮箱的键不同', async () => {
    const a = await emailKey('a@example.com')
    const b = await emailKey('b@example.com')
    expect(a).not.toBe(b)
  })
})

describe('sanitizeNotice', () => {
  it('只留标题、正文与级别', () => {
    const notice = sanitizeNotice({
      title: '  重要提醒  ',
      body: '  请删除旧的 API Key  ',
      level: 'urgent',
      evil: '不该留下',
    })
    expect(notice).toEqual({
      title: '重要提醒',
      body: '请删除旧的 API Key',
      level: 'urgent',
    })
  })

  it('级别不认识就当普通通知，标题或正文空着直接拒', () => {
    expect(sanitizeNotice({ title: 'a', body: 'b', level: 'weird' })?.level).toBe('info')
    expect(sanitizeNotice({ title: '', body: 'b' })).toBeNull()
    expect(sanitizeNotice({ title: 'a', body: '   ' })).toBeNull()
    expect(sanitizeNotice(null)).toBeNull()
  })

  it('超长内容被截断', () => {
    const notice = sanitizeNotice({ title: 'a'.repeat(500), body: 'b'.repeat(5000) })
    expect(notice?.title.length).toBe(120)
    expect(notice?.body.length).toBe(4000)
  })
})

describe('sanitizeFeedback', () => {
  it('去掉首尾空白，空的直接拒', () => {
    expect(sanitizeFeedback('  hello  ')).toBe('hello')
    expect(sanitizeFeedback('   ')).toBeNull()
    expect(sanitizeFeedback(undefined)).toBeNull()
  })
})

describe('订阅', () => {
  it('新订阅须确认后才生效；重复提交与退订都正确处理', async () => {
    const kv = createKv()
    const first = await subscribeEmail(kv, 'a@example.com', 100)
    const repeat = await subscribeEmail(kv, 'a@example.com', 200)
    expect(first.alreadySubscribed).toBe(false)
    expect(repeat.subscriptionId).toBe(first.subscriptionId)
    expect(await isSubscribed(kv, 'a@example.com')).toBe(false)
    expect((await listSubscribers(kv)).length).toBe(0)

    const key = await emailKey('a@example.com')
    expect(await confirmEmailSubscription(kv, key, first.subscriptionId, 300)).toBe(true)
    expect(await isSubscribed(kv, 'a@example.com')).toBe(true)

    const list = await listSubscribers(kv)
    expect(list.length).toBe(1)
    expect(list[0].email).toBe('a@example.com')
    expect(await isSubscribed(kv, 'a@example.com')).toBe(true)

    await unsubscribeEmail(kv, 'a@example.com')
    expect(await isSubscribed(kv, 'a@example.com')).toBe(false)
    expect((await listSubscribers(kv)).length).toBe(0)
  })

  it('大小写不同的同一个地址只算一个订阅', async () => {
    const kv = createKv()
    const first = await subscribeEmail(kv, 'User@Example.com', 100)
    await confirmEmailSubscription(kv, await emailKey('user@example.com'), first.subscriptionId, 200)
    await subscribeEmail(kv, 'user@example.com')
    expect((await listSubscribers(kv)).length).toBe(1)
  })

  it('确认令牌只对当前订阅有效；七天后的待确认项作废', async () => {
    const kv = createKv()
    const first = await subscribeEmail(kv, 'a@example.com', 100)
    const key = await emailKey('a@example.com')
    const expired = 100 + 7 * 24 * 60 * 60 * 1000 + 1
    expect(await confirmEmailSubscription(kv, key, first.subscriptionId, expired)).toBe(false)
    expect(await kv.get(key)).toBeNull()

    const second = await subscribeEmail(kv, 'a@example.com', expired)
    expect(await confirmEmailSubscription(kv, key, first.subscriptionId, expired + 1)).toBe(false)
    expect(await confirmEmailSubscription(kv, key, second.subscriptionId, expired + 1)).toBe(true)
  })

  it('旧版已订阅记录在迁移后仍保留有效状态', async () => {
    const kv = createKv()
    const key = await emailKey('legacy@example.com')
    await kv.put(key, JSON.stringify({ email: 'legacy@example.com', createdAt: 100 }))
    expect(await isSubscribed(kv, 'legacy@example.com')).toBe(true)
    expect((await listSubscribers(kv)).map((person) => person.email)).toEqual(['legacy@example.com'])
  })

  it('邮件发送未配置时保留旧式显式订阅，不创建待确认状态', async () => {
    const kv = createKv()
    const record = await subscribeEmailWithoutConfirmation(kv, 'a@example.com', 100)
    expect(record).toMatchObject({ email: 'a@example.com', createdAt: 100, alreadySubscribed: false })
    expect(await isSubscribed(kv, 'a@example.com')).toBe(true)
    expect(await kv.get(await emailKey('a@example.com'), 'json')).toEqual({
      email: 'a@example.com',
      createdAt: 100,
    })
  })

  it('非法邮箱不落库', async () => {
    const kv = createKv()
    expect(await subscribeEmail(kv, 'not-an-email')).toBeNull()
    expect(kv.store.size).toBe(0)
  })

  it('退订一个没订阅过的地址也不算失败', async () => {
    const kv = createKv()
    expect(await unsubscribeEmail(kv, 'ghost@example.com')).toBe(true)
  })
})

describe('公告', () => {
  it('按发布时间倒序返回', async () => {
    const kv = createKv()
    await putNotice(kv, '1', { title: '早的', body: 'x' }, 100)
    await putNotice(kv, '2', { title: '晚的', body: 'y' }, 300)
    await putNotice(kv, '3', { title: '中的', body: 'z' }, 200)

    const list = await listNotices(kv)
    expect(list.map((item) => item.title)).toEqual(['晚的', '中的', '早的'])
  })

  it('非法公告不写进去', async () => {
    const kv = createKv()
    expect(await putNotice(kv, '1', { title: '', body: 'x' })).toBeNull()
    expect(kv.store.size).toBe(0)
  })

  it('紧急公告的级别原样保留', async () => {
    const kv = createKv()
    await putNotice(kv, '1', { title: '紧急', body: 'x', level: 'urgent' })
    const [notice] = await listNotices(kv)
    expect(notice.level).toBe('urgent')
  })
})

describe('反馈', () => {
  it('存下来并按时间倒序返回', async () => {
    const kv = createKv()
    await putFeedback(kv, '第一条', 100, 0.1)
    await putFeedback(kv, '第二条', 200, 0.2)

    const list = await listFeedback(kv)
    expect(list.length).toBe(2)
    expect(list[0].body).toBe('第二条')
  })

  it('空反馈不存', async () => {
    const kv = createKv()
    expect(await putFeedback(kv, '   ')).toBeNull()
    expect(kv.store.size).toBe(0)
  })

  it('同一秒提交两条也不会撞 id', async () => {
    const kv = createKv()
    const a = await putFeedback(kv, 'x', 100, 0.1)
    const b = await putFeedback(kv, 'y', 100, 0.9)
    expect(a?.id).not.toBe(b?.id)
  })
})
