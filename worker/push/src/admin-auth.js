const TEXT = new TextEncoder()
const PASSWORD_SCHEME = 'pbkdf2-sha256'
export const PASSWORD_ITERATIONS = 310_000
const MIN_PASSWORD_ITERATIONS = 100_000
const MAX_PASSWORD_ITERATIONS = 600_000
export const ADMIN_SESSION_TTL_SECONDS = 30 * 60

function encodeBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(left, right)
  }
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

function parsePasswordHash(value) {
  if (typeof value !== 'string') return null
  const [scheme, count, saltText, hashText, extra] = value.split('$')
  const iterations = Number(count)
  const salt = decodeBase64Url(saltText)
  const hash = decodeBase64Url(hashText)
  if (
    extra !== undefined ||
    scheme !== PASSWORD_SCHEME ||
    !Number.isInteger(iterations) ||
    iterations < MIN_PASSWORD_ITERATIONS ||
    iterations > MAX_PASSWORD_ITERATIONS ||
    !salt || salt.length < 16 ||
    !hash || hash.length !== 32
  ) {
    return null
  }
  return { iterations, salt, hash }
}

async function passwordDigest(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', TEXT.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** Password hash format: pbkdf2-sha256$iterations$salt-base64url$digest-base64url */
export async function verifyAdminCredentials(username, password, env) {
  const parsed = parsePasswordHash(env.ADMIN_PASSWORD_HASH)
  const configuredName = typeof env.ADMIN_USERNAME === 'string' ? env.ADMIN_USERNAME : ''
  if (!parsed || !configuredName || typeof username !== 'string' || typeof password !== 'string') {
    return false
  }

  // Always derive the password before returning so an unknown username has similar work cost.
  const digest = await passwordDigest(password, parsed.salt, parsed.iterations)
  const [providedName, expectedName] = await Promise.all([
    crypto.subtle.digest('SHA-256', TEXT.encode(username)),
    crypto.subtle.digest('SHA-256', TEXT.encode(configuredName)),
  ])
  const nameMatches = equalBytes(new Uint8Array(providedName), new Uint8Array(expectedName))
  return nameMatches && equalBytes(digest, parsed.hash)
}

async function sessionKey(secret, usages) {
  if (typeof secret !== 'string' || TEXT.encode(secret).length < 32) return null
  return crypto.subtle.importKey('raw', TEXT.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages)
}

export async function createAdminSession(username, secret, now = Date.now()) {
  const key = await sessionKey(secret, ['sign'])
  if (!key) return null
  const payload = encodeBase64Url(
    TEXT.encode(JSON.stringify({ sub: username, exp: Math.floor(now / 1000) + ADMIN_SESSION_TTL_SECONDS })),
  )
  const signature = await crypto.subtle.sign('HMAC', key, TEXT.encode(payload))
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`
}

export async function verifyAdminSession(token, secret, username, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payloadText, signatureText] = parts
  const payloadBytes = decodeBase64Url(payloadText)
  const signature = decodeBase64Url(signatureText)
  const key = await sessionKey(secret, ['verify'])
  if (!payloadBytes || payloadBytes.length > 1024 || !signature || signature.length !== 32 || !key) {
    return false
  }
  if (!(await crypto.subtle.verify('HMAC', key, signature, TEXT.encode(payloadText)))) return false

  let payload
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    return false
  }
  if (
    payload?.sub !== username ||
    !Number.isInteger(payload?.exp) ||
    payload.exp <= Math.floor(now / 1000)
  ) {
    return false
  }

  return true
}
