import { describe, expect, it } from 'vitest'
import { FEEDBACK_WINDOW_MS, feedbackQuota, MAX_FEEDBACK_PER_WEEK } from './feedback-policy.js'

describe('per-installation feedback quota', () => {
  const now = 2_000_000_000_000

  it('rejects the fourth submission in the rolling seven-day window', () => {
    const submitted = [now - 6 * 60 * 60 * 1000, now - 2 * 24 * 60 * 60 * 1000, now - 6 * 24 * 60 * 60 * 1000]
    expect(feedbackQuota(submitted, now)).toEqual({
      accepted: false,
      remaining: 0,
      resetsAt: submitted[2] + FEEDBACK_WINDOW_MS,
    })
  })

  it('lets an expired item out of the rolling count and reports the next reset', () => {
    const expired = now - FEEDBACK_WINDOW_MS
    const recent = [now - 2 * 24 * 60 * 60 * 1000, now - 60 * 60 * 1000]
    expect(feedbackQuota([expired, ...recent], now)).toEqual({
      accepted: true,
      remaining: MAX_FEEDBACK_PER_WEEK - recent.length - 1,
      resetsAt: recent[0] + FEEDBACK_WINDOW_MS,
    })
  })

  it('ignores malformed stored timestamps', () => {
    expect(feedbackQuota([NaN, 'not-a-time', now - 1000], now)).toMatchObject({
      accepted: true,
      remaining: 1,
    })
  })
})
