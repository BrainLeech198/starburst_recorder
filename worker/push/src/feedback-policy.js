/** Feedback quota shared by the Durable Object and its unit tests. */
export const FEEDBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_FEEDBACK_PER_WEEK = 3

/**
 * Decide whether another feedback item fits in the rolling window.
 * The Durable Object calls this inside a synchronous SQLite transaction.
 */
export function feedbackQuota(createdAtValues, now = Date.now()) {
  const cutoff = now - FEEDBACK_WINDOW_MS
  const active = createdAtValues
    .map(Number)
    .filter((createdAt) => Number.isFinite(createdAt) && createdAt > cutoff)
    .sort((a, b) => a - b)

  const resetsAt = active.length > 0 ? active[0] + FEEDBACK_WINDOW_MS : null
  if (active.length >= MAX_FEEDBACK_PER_WEEK) {
    return { accepted: false, remaining: 0, resetsAt }
  }
  return {
    accepted: true,
    remaining: MAX_FEEDBACK_PER_WEEK - active.length - 1,
    resetsAt,
  }
}
