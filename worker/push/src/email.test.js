import { describe, expect, it } from 'vitest'
import {
  createConfirmationToken,
  createUnsubscribeToken,
  escapeHtml,
  formatAnnouncementEmail,
  verifyConfirmationToken,
  verifyUnsubscribeToken,
} from './email.js'

const secret = '0123456789abcdef0123456789abcdef'

describe('email unsubscribe tokens', () => {
  it('signs the opaque subscription key without putting the email address in the URL', async () => {
    const token = await createUnsubscribeToken('User@example.com', secret, 'subscription-001')
    expect(token).toBeTruthy()
    expect(token).not.toContain('User@example.com')
    expect(await verifyUnsubscribeToken(token, secret)).toMatchObject({
      key: expect.stringMatching(/^sub:[a-f0-9]{40}$/),
      subscriptionId: 'subscription-001',
    })
    expect(await verifyUnsubscribeToken(`${token}x`, secret)).toBeNull()
    expect(await verifyUnsubscribeToken(token, 'different secret with enough bytes')).toBeNull()
    const confirmation = await createConfirmationToken('User@example.com', secret, 'subscription-001')
    expect(await verifyConfirmationToken(confirmation, secret)).toMatchObject({
      subscriptionId: 'subscription-001',
      purpose: 'confirm',
    })
    expect(await verifyUnsubscribeToken(confirmation, secret)).toBeNull()
  })

  it('rejects invalid addresses and weak secrets', async () => {
    await expect(createUnsubscribeToken('not-an-email', secret, 'sub-001')).resolves.toBeNull()
    await expect(createUnsubscribeToken('user@example.com', 'short', 'sub-001')).resolves.toBeNull()
    await expect(createUnsubscribeToken('user@example.com', secret, '')).resolves.toBeNull()
    await expect(verifyUnsubscribeToken('bad', secret)).resolves.toBeNull()
  })
})

describe('announcement email rendering', () => {
  it('escapes markup and includes a visible unsubscribe link', () => {
    expect(escapeHtml(`<img src=x onerror="bad"> & 'test'`)).toBe(
      '&lt;img src=x onerror=&quot;bad&quot;&gt; &amp; &#39;test&#39;',
    )
    const email = formatAnnouncementEmail({
      body: '<script>alert(1)</script>',
      unsubscribeUrl: 'https://mailer.example/unsubscribe?token=opaque',
    })
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(email.html).toContain('href="https://mailer.example/unsubscribe?token=opaque"')
    expect(email.text).toContain('取消订阅：https://mailer.example/unsubscribe?token=opaque')
  })
})
