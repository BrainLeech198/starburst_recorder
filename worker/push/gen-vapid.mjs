/**
 * 生成一对 VAPID 密钥（P-256）。
 *
 * 用法：node worker/push/gen-vapid.mjs [--save]
 *
 * 私钥（32 字节）设成 Worker 的 secret；公钥（65 字节）两边都要用：
 * Worker 用它填 VAPID 的 k 参数，网页版用它做 `applicationServerKey`。
 * 密钥换一次，所有已订阅的设备都要重新订阅——所以生成后存好，别随手重跑。
 *
 * `--save` 会额外写一份 `.local/keys/vapid.json`（不进 git），省得只留在终端回滚里。
 */
import { webcrypto } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const { subtle } = webcrypto

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])
const jwk = await subtle.exportKey('jwk', pair.privateKey)
const publicKey = new Uint8Array(await subtle.exportKey('raw', pair.publicKey))

if (process.argv.includes('--save')) {
  const dir = join(process.cwd(), '.local', 'keys')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'vapid.json')
  await writeFile(
    file,
    `${JSON.stringify(
      { publicKey: b64url(publicKey), privateKey: jwk.d, createdAt: new Date().toISOString() },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(`已保存到 ${file}（不进 git，请自己再备份一份）\n`)
}

console.log('VAPID_PRIVATE_KEY =', jwk.d)
console.log('VAPID_PUBLIC_KEY  =', b64url(publicKey))
console.log('')
console.log('Worker secret：')
console.log(`  npx wrangler secret put VAPID_PRIVATE_KEY --config worker/push/wrangler.toml`)
console.log(`  npx wrangler secret put VAPID_PUBLIC_KEY  --config worker/push/wrangler.toml`)
console.log(`  npx wrangler secret put VAPID_SUBJECT     --config worker/push/wrangler.toml   # mailto:you@example.com`)
console.log('')
console.log('网页版 .env.local：')
console.log(`  VITE_VAPID_PUBLIC_KEY=${b64url(publicKey)}`)
console.log(`  VITE_PUSH_API=https://starburst-push.<你的子域>.workers.dev`)
