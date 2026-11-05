export type AssistantActionBatchResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown }

/** Sequentially execute an explicitly approved group, recording each outcome before continuing. */
export async function processAssistantActionBatch<Action, Value>(
  items: readonly { index: number; action: Action }[],
  execute: (action: Action) => Promise<Value>,
  settle: (index: number, result: AssistantActionBatchResult<Value>) => void,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0
  let failed = 0
  for (const item of items) {
    try {
      const value = await execute(item.action)
      settle(item.index, { ok: true, value })
      succeeded++
    } catch (error) {
      settle(item.index, { ok: false, error })
      failed++
    }
  }
  return { succeeded, failed }
}
