import { describe, expect, it } from 'vitest'
import {
  ADMIN_SESSION_TTL_SECONDS,
  PASSWORD_ITERATIONS,
  createAdminSession,
  verifyAdminCredentials,
  verifyAdminSession,
} from './admin-auth.js'

const text = new TextEncoder()

function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function makePasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', text.encode(password), 'PBKDF2', false, ['deriveBits'])
  const digest = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
      key,
      256,
    ),
  )
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${base64Url(salt)}$${base64Url(digest)}`
}

describe('admin password authentication', () => {
  it('accepts only the configured username and password', async () => {
    const env = {
      ADMIN_USERNAME: 'owner',
      ADMIN_PASSWORD_HASH: await makePasswordHash('correct horse battery staple'),
    }

    await expect(verifyAdminCredentials('owner', 'correct horse battery staple', env)).resolves.toBe(true)
    await expect(verifyAdminCredentials('owner', 'wrong password', env)).resolves.toBe(false)
    await expect(verifyAdminCredentials('other', 'correct horse battery staple', env)).resolves.toBe(false)
  })

  it('fails closed for absent or weak password hashes', async () => {
    await expect(verifyAdminCredentials('owner', 'anything', {})).resolves.toBe(false)
    await expect(
      verifyAdminCredentials('owner', 'anything', {
        ADMIN_USERNAME: 'owner',
        ADMIN_PASSWORD_HASH: 'pbkdf2-sha256$10$YWJjZGVmZ2hpamtsbW5vcA$YWJj',
      }),
    ).resolves.toBe(false)
  })
})

describe('admin sessions', () => {
  const secret = '0123456789abcdef0123456789abcdef'
  const now = Date.UTC(2026, 10, 4, 12)

  it('signs a short-lived session and rejects invalid, expired, or wrong-user tokens', async () => {
    const token = await createAdminSession('owner', secret, now)
    expect(token).toBeTruthy()
    await expect(verifyAdminSession(token, secret, 'owner', now + 1000)).resolves.toBe(true)
    await expect(verifyAdminSession(token, secret, 'someone-else', now + 1000)).resolves.toBe(false)
    await expect(
      verifyAdminSession(token, secret, 'owner', now + (ADMIN_SESSION_TTL_SECONDS + 1) * 1000),
    ).resolves.toBe(false)
    await expect(verifyAdminSession(`${token}x`, secret, 'owner', now)).resolves.toBe(false)
  })

  it('refuses to create a session from a missing or short signing secret', async () => {
    await expect(createAdminSession('owner', '', now)).resolves.toBeNull()
    await expect(createAdminSession('owner', 'too-short', now)).resolves.toBeNull()
  })
})
