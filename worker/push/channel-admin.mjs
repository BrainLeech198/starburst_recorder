#!/usr/bin/env node
/**
 * 官方频道的管理脚本：发公告、导出订阅邮箱、翻用户反馈。
 *
 * 令牌从 `.local/keys/admin-token.txt` 读（不进仓库、不进命令行参数）。
 *
 * 用法：
 *   node worker/push/channel-admin.mjs notice --title "标题" --body "正文" [--urgent]
 *   node worker/push/channel-admin.mjs subscribers
 *   node worker/push/channel-admin.mjs feedback
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TOKEN_FILE = join(ROOT, '.local', 'keys', 'admin-token.txt')
const API = process.env.STARBURST_CHANNEL_API ?? 'https://starburst-push.starburst-recorder.workers.dev'

function readToken() {
  try {
    const value = readFileSync(TOKEN_FILE, 'utf8').trim()
    if (!value) throw new Error('empty')
    return value
  } catch {
    console.error(`找不到管理令牌：${TOKEN_FILE}`)
    console.error('生成一个：node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))"')
    process.exit(1)
  }
}

async function call(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-admin-token': readToken(),
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) {
    console.error(`请求失败 ${response.status}: ${text}`)
    process.exit(1)
  }
  return JSON.parse(text)
}

/** 从命令行参数里取 --key value */
function flag(args, name) {
  const index = args.indexOf(`--${name}`)
  if (index < 0) return null
  return args[index + 1] ?? null
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'notice': {
    const title = flag(args, 'title')
    const body = flag(args, 'body')
    if (!title || !body) {
      console.error('用法：notice --title "标题" --body "正文" [--urgent]')
      process.exit(1)
    }
    const level = args.includes('--urgent') ? 'urgent' : 'info'
    const result = await call('/admin/notices', {
      method: 'POST',
      body: JSON.stringify({ title, body, level }),
    })
    console.log(`已发布（${result.notice.level}）：${result.notice.title}`)
    console.log(`id=${result.notice.id}`)
    break
  }

  case 'subscribers': {
    const result = await call('/admin/subscribers')
    if (!result.count) {
      console.log('还没有人订阅')
      break
    }
    console.log(`共 ${result.count} 人：`)
    for (const person of result.subscribers) {
      console.log(person.email)
    }
    break
  }

  case 'feedback': {
    const result = await call('/admin/feedback')
    if (!result.count) {
      console.log('还没有反馈')
      break
    }
    console.log(`共 ${result.count} 条：`)
    for (const item of result.feedback) {
      const time = new Date(item.createdAt).toLocaleString('zh-CN')
      console.log(`\n── ${time} ──`)
      console.log(item.body)
    }
    break
  }

  default:
    console.error('用法：')
    console.error('  notice --title "标题" --body "正文" [--urgent]')
    console.error('  subscribers')
    console.error('  feedback')
    process.exit(1)
}
