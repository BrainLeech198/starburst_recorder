import { DurableObject } from 'cloudflare:workers'
import { FEEDBACK_STATUSES, sanitizeFeedback } from './channel.js'
import { FEEDBACK_WINDOW_MS, feedbackQuota, MAX_FEEDBACK_PER_WEEK } from './feedback-policy.js'

function feedbackRow(row) {
  return {
    id: row.id,
    body: row.body,
    createdAt: Number(row.created_at) || 0,
    developerReply: row.developer_reply || '',
    developerRepliedAt: Number(row.developer_replied_at) || 0,
    status: FEEDBACK_STATUSES.includes(row.status) ? row.status : 'received',
    statusUpdatedAt: Number(row.status_updated_at) || Number(row.created_at) || 0,
  }
}

/** One SQLite-backed object per installation keeps quota checks atomic without a global hot object. */
export class FeedbackService extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS feedback (
          id TEXT PRIMARY KEY,
          body TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          developer_reply TEXT NOT NULL DEFAULT '',
          developer_replied_at INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'received',
          status_updated_at INTEGER NOT NULL
        )
      `)
      this.sql.exec('CREATE INDEX IF NOT EXISTS feedback_created_at ON feedback(created_at DESC)')
    })
  }

  async submitFeedback(input) {
    await this.ready
    const body = sanitizeFeedback(input?.body)
    if (!body) return { error: 'empty feedback', status: 400 }

    const now = Date.now()
    const id = crypto.randomUUID()
    return this.ctx.storage.transactionSync(() => {
      const timestamps = this.sql.exec(
        'SELECT created_at FROM feedback WHERE created_at > ? ORDER BY created_at ASC',
        now - FEEDBACK_WINDOW_MS,
      ).toArray().map((row) => row.created_at)
      const quota = feedbackQuota(timestamps, now)
      if (!quota.accepted) {
        return { error: 'feedback weekly limit reached', status: 429, retryAt: quota.resetsAt }
      }

      this.sql.exec(
        'INSERT INTO feedback (id, body, created_at, status, status_updated_at) VALUES (?, ?, ?, ?, ?)',
        id,
        body,
        now,
        'received',
        now,
      )
      return {
        ok: true,
        feedback: { id, body, createdAt: now, status: 'received', developerReply: '', statusUpdatedAt: now },
        remaining: quota.remaining,
        resetsAt: quota.resetsAt,
      }
    })
  }

  async listFeedback() {
    await this.ready
    const feedback = this.sql.exec(
      'SELECT id, body, created_at, developer_reply, developer_replied_at, status, status_updated_at FROM feedback ORDER BY created_at DESC, rowid DESC',
    ).toArray().map(feedbackRow)
    const cutoff = Date.now() - FEEDBACK_WINDOW_MS
    const activeCount = feedback.filter((item) => item.createdAt > cutoff).length
    const resetsAt = activeCount > 0
      ? Math.min(...feedback.filter((item) => item.createdAt > cutoff).map((item) => item.createdAt)) + FEEDBACK_WINDOW_MS
      : null
    return {
      feedback,
      remaining: Math.max(0, MAX_FEEDBACK_PER_WEEK - activeCount),
      resetsAt,
    }
  }

  async getFeedback(id) {
    await this.ready
    const row = this.sql.exec(
      'SELECT id, body, created_at, developer_reply, developer_replied_at, status, status_updated_at FROM feedback WHERE id = ?',
      id,
    ).toArray()[0]
    return row ? feedbackRow(row) : null
  }

  async updateFeedback(input) {
    await this.ready
    const { id, status, developerReply } = input ?? {}
    if (
      typeof id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(id) ||
      !FEEDBACK_STATUSES.includes(status) ||
      typeof developerReply !== 'string' ||
      developerReply.length > 4000
    ) return null

    const reply = developerReply.trim()
    const now = Date.now()
    const updated = this.ctx.storage.transactionSync(() => {
      const existing = this.sql.exec(
        'SELECT created_at, developer_reply, developer_replied_at FROM feedback WHERE id = ?',
        id,
      ).toArray()[0]
      if (!existing) return null
      const replyChanged = reply !== existing.developer_reply
      const developerRepliedAt = replyChanged ? (reply ? now : 0) : existing.developer_replied_at
      this.sql.exec(
        'UPDATE feedback SET developer_reply = ?, developer_replied_at = ?, status = ?, status_updated_at = ? WHERE id = ?',
        reply,
        developerRepliedAt,
        status,
        now,
        id,
      )
      return true
    })
    return updated ? this.getFeedback(id) : null
  }
}
