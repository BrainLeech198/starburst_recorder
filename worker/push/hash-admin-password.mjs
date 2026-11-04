#!/usr/bin/env node
/** Securely prompt for an administrator password and print its PBKDF2 hash. */
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'

const iterations = 310_000

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  console.error('请在交互式终端中运行此脚本；密码不会显示，也不要通过命令行参数传入。')
  process.exit(1)
}

const decoder = new StringDecoder('utf8')
let password = ''
let finished = false
process.stdout.write('输入管理员密码（至少 12 个字符，输入时不会显示）：')
process.stdin.setRawMode(true)
process.stdin.resume()

function finish(cancelled = false) {
  if (finished) return
  finished = true
  process.stdin.setRawMode(false)
  process.stdin.pause()
  process.stdout.write('\n')

  if (cancelled) {
    console.error('已取消。')
    process.exitCode = 1
    return
  }

  if ([...password].length < 12 || Buffer.byteLength(password, 'utf8') > 256) {
    console.error('密码长度需为 12–256 字节。')
    process.exitCode = 1
    return
  }
  const salt = randomBytes(16)
  const digest = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const encode = (value) => value.toString('base64url')
  console.log(`pbkdf2-sha256$${iterations}$${encode(salt)}$${encode(digest)}`)
}

process.stdin.on('data', (chunk) => {
  for (const character of decoder.write(chunk)) {
    if (character === '\u0003') {
      finish(true)
      return
    }
    if (character === '\r' || character === '\n') {
      finish()
      return
    }
    if (character === '\u0008' || character === '\u007f') {
      password = [...password].slice(0, -1).join('')
      continue
    }
    password += character
  }
})
