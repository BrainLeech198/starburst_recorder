import type { ChatAttachment } from './assistantChatStore'

export interface QueuedAssistantMessage {
  id: string
  text: string
  files: ChatAttachment[]
}

export interface AssistantRunSnapshot {
  id: string
  sessionId: string
  messageId: string
  content: string
  phase: 'preparing' | 'generating'
  startedAt: number
}

export interface AssistantSessionRuntime {
  run: AssistantRunSnapshot | null
  queue: QueuedAssistantMessage[]
  guidanceCount: number
}

export interface AssistantRunHandle {
  id: string
  signal: AbortSignal
}

interface RuntimeState {
  snapshot: AssistantSessionRuntime
  controller?: AbortController
  guidance: string[]
}

const EMPTY_RUNTIME: AssistantSessionRuntime = {
  run: null,
  queue: [],
  guidanceCount: 0,
}

const runtimes = new Map<string, RuntimeState>()
const listeners = new Set<() => void>()
let activeRuns: AssistantRunSnapshot[] = []

function stateFor(sessionId: string): RuntimeState {
  let state = runtimes.get(sessionId)
  if (!state) {
    state = { snapshot: { ...EMPTY_RUNTIME }, guidance: [] }
    runtimes.set(sessionId, state)
  }
  return state
}

function publish(sessionId: string, state: RuntimeState) {
  state.snapshot = {
    run: state.snapshot.run,
    queue: [...state.snapshot.queue],
    guidanceCount: state.guidance.length,
  }
  if (!state.snapshot.run && state.snapshot.queue.length === 0 && state.guidance.length === 0) {
    runtimes.delete(sessionId)
  }
  const nextActiveRuns = [...runtimes.values()]
    .flatMap((item) => (item.snapshot.run ? [item.snapshot.run] : []))
  const sameSessions =
    nextActiveRuns.length === activeRuns.length &&
    nextActiveRuns.every((run, index) => run.sessionId === activeRuns[index]?.sessionId)
  if (!sameSessions) activeRuns = nextActiveRuns
  for (const listener of [...listeners]) listener()
}

export function getAssistantRuntime(sessionId: string): AssistantSessionRuntime {
  return runtimes.get(sessionId)?.snapshot ?? EMPTY_RUNTIME
}

export function getActiveAssistantRuns(): readonly AssistantRunSnapshot[] {
  return activeRuns
}

export function getActiveAssistantSessionIds(): readonly string[] {
  return activeRuns.map((run) => run.sessionId)
}

export function subscribeAssistantRuns(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function startAssistantRun(
  sessionId: string,
  messageId: string,
  startedAt: number,
): AssistantRunHandle | null {
  const state = stateFor(sessionId)
  if (state.snapshot.run) return null
  const controller = new AbortController()
  const id = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  state.controller = controller
  state.snapshot = {
    ...state.snapshot,
    run: { id, sessionId, messageId, content: '', phase: 'preparing', startedAt },
  }
  publish(sessionId, state)
  return { id, signal: controller.signal }
}

export function setAssistantRunPhase(
  sessionId: string,
  runId: string,
  phase: AssistantRunSnapshot['phase'],
) {
  const state = runtimes.get(sessionId)
  if (!state?.snapshot.run || state.snapshot.run.id !== runId) return
  state.snapshot = { ...state.snapshot, run: { ...state.snapshot.run, phase } }
  publish(sessionId, state)
}

export function appendAssistantRunContent(sessionId: string, runId: string, chunk: string) {
  const state = runtimes.get(sessionId)
  if (!state?.snapshot.run || state.snapshot.run.id !== runId) return
  state.snapshot = {
    ...state.snapshot,
    run: { ...state.snapshot.run, content: state.snapshot.run.content + chunk },
  }
  publish(sessionId, state)
}

export function clearAssistantRunContent(sessionId: string, runId: string) {
  const state = runtimes.get(sessionId)
  if (!state?.snapshot.run || state.snapshot.run.id !== runId) return
  state.snapshot = { ...state.snapshot, run: { ...state.snapshot.run, content: '' } }
  publish(sessionId, state)
}

export function finishAssistantRun(sessionId: string, runId: string) {
  const state = runtimes.get(sessionId)
  if (!state?.snapshot.run || state.snapshot.run.id !== runId) return
  state.controller = undefined
  state.snapshot = { ...state.snapshot, run: null }
  publish(sessionId, state)
}

export function stopAssistantRun(sessionId: string): boolean {
  const state = runtimes.get(sessionId)
  if (!state?.snapshot.run || !state.controller) return false
  state.controller.abort()
  return true
}

export function stopAllAssistantRuns() {
  for (const [sessionId, state] of runtimes) {
    state.controller?.abort()
    state.snapshot = { ...state.snapshot, queue: [] }
    state.guidance = []
    publish(sessionId, state)
  }
}

export function enqueueAssistantMessage(sessionId: string, message: QueuedAssistantMessage) {
  const state = stateFor(sessionId)
  state.snapshot = {
    ...state.snapshot,
    queue: [...state.snapshot.queue, message].slice(0, 10),
  }
  publish(sessionId, state)
}

export function removeAssistantQueuedMessage(sessionId: string, messageId: string) {
  const state = runtimes.get(sessionId)
  if (!state) return
  state.snapshot = {
    ...state.snapshot,
    queue: state.snapshot.queue.filter((message) => message.id !== messageId),
  }
  publish(sessionId, state)
}

export function takeAssistantQueuedMessage(sessionId: string) {
  const state = runtimes.get(sessionId)
  if (!state || state.snapshot.queue.length === 0) return undefined
  const [next, ...queue] = state.snapshot.queue
  state.snapshot = { ...state.snapshot, queue }
  publish(sessionId, state)
  return next
}

export function addAssistantGuidance(sessionId: string, text: string) {
  const state = stateFor(sessionId)
  state.guidance.push(text)
  publish(sessionId, state)
}

export function takeAssistantGuidance(sessionId: string) {
  const state = runtimes.get(sessionId)
  if (!state) return []
  const guidance = state.guidance.splice(0)
  publish(sessionId, state)
  return guidance
}

export function clearAssistantPendingMessages(sessionId: string) {
  const state = runtimes.get(sessionId)
  if (!state) return
  state.snapshot = { ...state.snapshot, queue: [] }
  state.guidance = []
  publish(sessionId, state)
}
