import { emailKey, normalizeEmail } from './channel.js'

const TEXT = new TextEncoder()
const MAX_TOKEN_LENGTH = 2048

function base64UrlEncode(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlDecode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function signingKey(secret, usages) {
  if (typeof secret !== 'string' || TEXT.encode(secret).length < 32) return null
  return crypto.subtle.importKey('raw', TEXT.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages)
}

/** Signs only the opaque subscription KV key; the subscriber's email is not put in the URL. */
async function createSubscriptionToken(email, secret, subscriptionId, purpose) {
  const normalized = normalizeEmail(email)
  const key = await signingKey(secret, ['sign'])
  if (
    !normalized || !key || typeof subscriptionId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(subscriptionId)
  ) return null
  const payload = base64UrlEncode(
    TEXT.encode(JSON.stringify({ key: await emailKey(normalized), subscriptionId, purpose })),
  )
  const signature = await crypto.subtle.sign('HMAC', key, TEXT.encode(payload))
  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`
}

/** Returns signed subscription claims only after validating the HMAC signature. */
async function verifySubscriptionToken(token, secret, expectedPurpose) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signatureText] = parts
  const key = await signingKey(secret, ['verify'])
  const signature = base64UrlDecode(signatureText)
  if (!key || !signature || signature.length !== 32) return null
  if (!(await crypto.subtle.verify('HMAC', key, signature, TEXT.encode(payload)))) return null

  const decoded = base64UrlDecode(payload)
  if (!decoded) return null
  let payloadValue
  try {
    payloadValue = JSON.parse(new TextDecoder().decode(decoded))
  } catch {
    return null
  }
  if (
    !/^sub:[a-f0-9]{40}$/.test(payloadValue?.key ?? '') ||
    typeof payloadValue?.subscriptionId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(payloadValue.subscriptionId) ||
    payloadValue.purpose !== expectedPurpose
  ) {
    return null
  }
  return payloadValue
}

export function createUnsubscribeToken(email, secret, subscriptionId) {
  return createSubscriptionToken(email, secret, subscriptionId, 'unsubscribe')
}

export function verifyUnsubscribeToken(token, secret) {
  return verifySubscriptionToken(token, secret, 'unsubscribe')
}

export function createConfirmationToken(email, secret, subscriptionId) {
  return createSubscriptionToken(email, secret, subscriptionId, 'confirm')
}

export function verifyConfirmationToken(token, secret) {
  return verifySubscriptionToken(token, secret, 'confirm')
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatAnnouncementEmail({ body, unsubscribeUrl }) {
  const safeBody = escapeHtml(body).replace(/\r?\n/g, '<br>')
  const safeUrl = escapeHtml(unsubscribeUrl)
  return {
    text: `${body}\n\n取消订阅：${unsubscribeUrl}`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.7"><p>${safeBody}</p><hr><p style="font-size:12px;color:#667085">不想再收到公告邮件？<a href="${safeUrl}">取消订阅</a></p></div>`,
  }
}

export function formatConfirmationEmail({ confirmationUrl }) {
  const safeUrl = escapeHtml(confirmationUrl)
  return {
    text: `请确认你订阅了星芒记录者的公告邮件：\n${confirmationUrl}\n\n如果不是你本人操作，可以忽略此邮件。`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.7"><h2>确认公告邮件订阅</h2><p>点击下面的按钮，确认接收星芒记录者的官方公告。</p><p><a href="${safeUrl}" style="display:inline-block;padding:10px 15px;border-radius:8px;background:#a8ead7;color:#10201b;text-decoration:none">确认订阅</a></p><p style="font-size:12px;color:#667085">如果不是你本人操作，可以忽略此邮件。</p></div>`,
  }
}

export function unsubscribeConfirmationPage(token) {
  const action = `/unsubscribe-email?token=${encodeURIComponent(token)}`
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"><title>取消邮件订阅</title><body style="margin:0;padding:48px 18px;background:#0c1119;color:#e8edf4;font:16px/1.6 system-ui,sans-serif"><main style="max-width:440px;margin:auto;padding:28px;border:1px solid #344154;border-radius:16px;background:#151d29"><h1 style="font-size:22px">取消邮件订阅</h1><p>确认后将停止向此地址发送星芒记录者的公告邮件。</p><form method="post" action="${action}"><button style="padding:11px 16px;border:0;border-radius:8px;background:#a8ead7;color:#10201b;font-weight:600">确认取消订阅</button></form></main></body></html>`
}

export function subscriptionConfirmationPage(token) {
  const action = `/confirm-email?token=${encodeURIComponent(token)}`
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"><title>确认邮件订阅</title><body style="margin:0;padding:48px 18px;background:#0c1119;color:#e8edf4;font:16px/1.6 system-ui,sans-serif"><main style="max-width:440px;margin:auto;padding:28px;border:1px solid #344154;border-radius:16px;background:#151d29"><h1 style="font-size:22px">确认邮件订阅</h1><p>确认后，你会收到星芒记录者的官方公告邮件。</p><form method="post" action="${action}"><button style="padding:11px 16px;border:0;border-radius:8px;background:#a8ead7;color:#10201b;font-weight:600">确认订阅</button></form></main></body></html>`
}
