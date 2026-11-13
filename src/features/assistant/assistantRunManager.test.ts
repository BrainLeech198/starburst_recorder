import { afterEach, describe, expect, it } from 'vitest'
import {
  addAssistantGuidance,
  appendAssistantRunContent,
  clearAssistantPendingMessages,
  enqueueAssistantMessage,
  finishAssistantRun,
  getActiveAssistantRuns,
  getAssistantRuntime,
  startAssistantRun,
  stopAssistantRun,
  takeAssistantGuidance,
  takeAssistantQueuedMessage,
} from './assistantRunManager'

const sessionIds = ['run-manager-test-a', 'run-manager-test-b']

afterEach(() => {
  for (const sessionId of sessionIds) {
    stopAssistantRun(sessionId)
    clearAssistantPendingMessages(sessionId)
    const run = getAssistantRuntime(sessionId).run
    if (run) finishAssistantRun(sessionId, run.id)
  }
})

describe('助手会话运行管理器', () => {
  it('并行保存不同会话的请求和增量内容', () => {
    const first = startAssistantRun(sessionIds[0], 'message-a', 1)
    const second = startAssistantRun(sessionIds[1], 'message-b', 2)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()

    appendAssistantRunContent(sessionIds[0], first!.id, 'A 的回答')
    appendAssistantRunContent(sessionIds[1], second!.id, 'B 的回答')

    expect(getAssistantRuntime(sessionIds[0]).run?.content).toBe('A 的回答')
    expect(getAssistantRuntime(sessionIds[1]).run?.content).toBe('B 的回答')
    expect(getActiveAssistantRuns().map((run) => run.sessionId)).toEqual(sessionIds)
  })

  it('同一会话只允许一个活动请求，停止只中断该请求', () => {
    const first = startAssistantRun(sessionIds[0], 'message-a', 1)
    expect(first).not.toBeNull()
    expect(startAssistantRun(sessionIds[0], 'message-a2', 2)).toBeNull()

    expect(stopAssistantRun(sessionIds[0])).toBe(true)
    expect(first!.signal.aborted).toBe(true)
    expect(getAssistantRuntime(sessionIds[1]).run).toBeNull()
  })

  it('路由切换期间保留排队消息和插话', () => {
    const run = startAssistantRun(sessionIds[0], 'message-a', 1)
    enqueueAssistantMessage(sessionIds[0], { id: 'queued-a', text: '继续', files: [] })
    addAssistantGuidance(sessionIds[0], '补充条件')

    expect(getAssistantRuntime(sessionIds[0]).queue).toHaveLength(1)
    expect(getAssistantRuntime(sessionIds[0]).guidanceCount).toBe(1)
    expect(takeAssistantGuidance(sessionIds[0])).toEqual(['补充条件'])
    expect(takeAssistantQueuedMessage(sessionIds[0])?.id).toBe('queued-a')

    finishAssistantRun(sessionIds[0], run!.id)
    expect(getAssistantRuntime(sessionIds[0]).run).toBeNull()
  })
})
