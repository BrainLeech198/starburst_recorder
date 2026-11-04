/**
 * 共用的聊天界面：完整页面和悬浮面板跑的是同一份代码，
 * 只是外壳（滚动方式、间距）不一样，免得两处各写一套逻辑。
 *
 * 对话、动作卡片都存在本地（assistantChatStore），两个入口共享；
 * 助手能「查」，也能提出「记一笔」——但写库必须等用户点确认。
 *
 * 除了聊天，这里还负责：多段会话与分支切换、推荐问、图片/文本附件、
 * 运行中的计时与停止、排队发送、消息级操作（复制 / 重新生成 / 编辑分叉 / 删除）、
 * 多选与导出，以及上下文与 token 用量。
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import type { ChatContentPart } from '@/platform/desktop'
import { todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import { exportAllData } from '@/features/health/healthRepo'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import { loadReasoning, saveReasoning } from '@/features/ai/aiReasoning'
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { copyTextToClipboard } from '@/platform/clipboard'
import Modal from '@/shared/ui/Modal'
import Dropdown from '@/shared/ui/Dropdown'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { runAssistant } from './assistantAgent'
import {
  executeAssistantAction,
  undoAssistantAction,
  type ActionDone,
} from './assistantActions'
import { loadMemories, memoryPromptLines } from './assistantMemory'
import { enabledSkills, loadSkills } from './assistantSkills'
import { loadPermission, runsWithoutConfirm } from './assistantPermission'
import AssistantQuestionCard from './AssistantQuestionCard'
import AssistantActionCard from './AssistantActionCard'
import AssistantWorking from './AssistantWorking'
import AssistantExportDialog from './AssistantExportDialog'
import AssistantMarkdown from './AssistantMarkdown'
import AssistantRefPicker from './AssistantRefPicker'
import { buildChatCopy } from './chatExport'
import {
  attachmentPromptText,
  imageParts,
  MAX_ATTACHMENTS,
  readAttachment,
} from './assistantAttachments'
import { contextWindow, formatTokens } from './assistantContext'
import { requestSuggestions, suggestKeys, summarizeSituation } from './assistantSuggest'
import {
  appendChatVariant,
  beginChatRegeneration,
  clearChat,
  createChatMessage,
  deleteChatFrom,
  deleteChatMessages,
  deleteChatSession,
  forkChatSession,
  getChatMessages,
  getChatSessions,
  getCurrentSessionId,
  getForkSiblings,
  newChatMessageId,
  newChatSession,
  patchChatAction,
  patchChatMessage,
  renameChatSession,
  restoreChatVariant,
  subscribeChat,
  switchChatSession,
  switchChatVariant,
  updateChat,
  pendingActionNotes,
  resolvedActionNotes,
  writtenNotes,
  elapsedSince,
  type ChatActionState,
  type ChatAttachment,
  type ChatMessageRecord,
  type ChatQuestionState,
} from './assistantChatStore'

/** 工具结果的第一行：折叠时当作摘要，别整段塞进标题 */
function firstLine(text: string) {
  const line = text.split('\n').find((item) => item.trim() !== '')
  return line?.trim() ?? ''
}

/** 会话列表里的时间：「月-日 时:分」，够用又不占地方 */
function whenLabel(at: number) {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}-${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const PLAN_KEY = 'starburst.assistant.plan'

function readPlanMode() {
  try {
    return localStorage.getItem(PLAN_KEY) === '1'
  } catch {
    return false
  }
}

function savePlanMode(on: boolean) {
  try {
    localStorage.setItem(PLAN_KEY, on ? '1' : '0')
  } catch {
    // 隐私模式写不进去就只在本次会话生效
  }
}

const EXAMPLE_KEYS = [
  'assistant.example1',
  'assistant.example2',
  'assistant.example3',
  'assistant.example4',
  'assistant.example5',
] as const

/**
 * 控件按「形状 + 重量」分档，避免一屏全是同一种圆角胶囊：
 * 圆形主按钮（新对话）、文字 + 计数徽标（历史）、虚线折叠头（推荐问）、
 * 主色芯片（推荐内容）、方形图标钮（附件）、实心胶囊（发送）。
 */
const CHAT_ICON_BRAND =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-sm text-on-brand transition hover:opacity-90 active:scale-[0.94] disabled:opacity-40 md:h-7 md:w-7'
const CHAT_TOOL = 'inline-flex h-11 shrink-0 items-center gap-1 px-1.5 text-[11px] text-muted transition-colors hover:text-brand disabled:opacity-50 md:h-7 md:px-1'
const CHAT_COUNT = 'rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted'
const CHAT_CHIP = 'inline-flex min-h-11 items-center rounded-full bg-brand/10 px-3 py-1.5 text-[11px] text-brand transition-colors hover:bg-brand/20 disabled:opacity-50 md:min-h-0 md:px-2.5 md:py-1'
const CHAT_ICON = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base text-muted transition-colors hover:bg-brand/10 hover:text-brand disabled:opacity-40'
const CHAT_SEND = 'inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-brand px-4 text-sm font-medium text-on-brand transition hover:opacity-90 active:scale-[0.97] disabled:opacity-40'
const CHAT_STOP =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-danger/40 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-40'
const CHAT_ROW = 'flex min-h-12 min-w-0 flex-1 flex-col px-2.5 py-2 text-left transition-colors'
/**
 * 消息下的操作按钮：和市面上的 agent 一样用图标，不再排一行灰字。
 * 40px 的点击区在手机上够用，桌面上收成 28px 的小方块，心里不占地方。
 */
const MESSAGE_ACTION =
  'inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40 md:h-7 md:w-7'
const MESSAGE_ACTION_DANGER = `${MESSAGE_ACTION} hover:text-danger`
/** 模式开关：计划 / 深度思考用同一套芯片，别一个文字键一个开关，看着乱 */
const MODE_CHIP =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] transition-colors disabled:opacity-50 md:h-7'
const MODE_CHIP_ON = 'border-brand/40 bg-brand/10 text-brand'
const MODE_CHIP_OFF = 'border-line text-muted hover:bg-surface-2 hover:text-fg'

interface QueuedMessage {
  id: string
  text: string
  files: ChatAttachment[]
}

interface DeleteRequest {
  /** 从这条开始删到末尾 */
  fromId?: string
  /** 多选删除 */
  ids?: string[]
  title: string
  desc: string
}

/**
 * 一条消息变成请求里的 content。
 * 只有最后一条用户消息带图片——旧图每轮都发一遍，上下文会被图片吃光。
 */
function historyContent(item: ChatMessageRecord, withImages: boolean): string | ChatContentPart[] {
  const body = item.content.trim()
  const text = `${body}${attachmentPromptText(item.attachments ?? [])}`.trim()
  const images = withImages && item.role === 'user' ? imageParts(item.attachments ?? []) : []
  if (images.length === 0) return text
  return [{ type: 'text', text: text || '（图片）' }, ...images]
}

export default function AssistantChat({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useI18n()
  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }),
    [locale],
  )
  const { showToast } = useToast()
  const messages = useSyncExternalStore(subscribeChat, getChatMessages, getChatMessages)
  const sessions = useSyncExternalStore(subscribeChat, getChatSessions, getChatSessions)
  const currentSessionId = useSyncExternalStore(subscribeChat, getCurrentSessionId, getCurrentSessionId)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  /** 当前模型请求已到达的正文片段；只在屏幕暂存，最终消息仍由完整结果写入 */
  const [streamContent, setStreamContent] = useState('')
  /** 「清空对话」的红色确认弹窗：一点即清太容易误触 */
  const [clearOpen, setClearOpen] = useState(false)
  /** 正在等模型回复的那条占位消息 */
  const [pendingId, setPendingId] = useState<string | null>(null)
  /** 正在写入 / 撤销的卡片："消息id:序号" */
  const [working, setWorking] = useState('')
  /** 配好模型之前一直提示去设置；每次发送都重新读一遍，刚在设置页改完回来立刻能用 */
  const [configured, setConfigured] = useState(() => isConfigured(loadAiConfig()))
  /** 深度思考开关：跟设置页共用同一份 localStorage */
  const [reasoning, setReasoning] = useState(() => loadReasoning())
  /** 计划模式：先要步骤，确认后再动手 */
  const [planMode, setPlanMode] = useState(readPlanMode)
  /** 还没发出去的附件 */
  const [drafts, setDrafts] = useState<ChatAttachment[]>([])
  /** 会话列表弹窗 */
  const [sessionOpen, setSessionOpen] = useState(false)
  /** 推荐问默认收起，点标题才展开 */
  const [suggestOpen, setSuggestOpen] = useState(false)
  /** 展开后按最后一条回答 id 缓存，已经生成过的不重复请求 */
  const [suggestions, setSuggestions] = useState<{ id: string; items: string[] } | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  /** 正在改名的会话 id 与输入框内容 */
  const [renamingId, setRenamingId] = useState('')
  const [renameText, setRenameText] = useState('')
  /** 待确认删除的会话 id：避免误点 ✕ 就把对话删掉 */
  const [deletingId, setDeletingId] = useState('')
  /** 正在编辑的用户消息 */
  const [editingId, setEditingId] = useState('')
  const [editText, setEditText] = useState('')
  /** 多选模式与选中的消息 */
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  /** 导出弹窗：null 关闭，[] 表示全部消息 */
  const [exportIds, setExportIds] = useState<string[] | null>(null)
  /** 删除确认 */
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null)
  /** 生成中排队等待的消息 */
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const queueRef = useRef<QueuedMessage[]>([])
  /** 生成中插话：在下一轮请求前交给模型，不打断当前这轮 */
  const [steerMode, setSteerMode] = useState(false)
  const guidanceRef = useRef<string[]>([])
  /** 斜杠命令菜单与 @ 引用弹窗 */
  const [slashOpen, setSlashOpen] = useState(false)
  const [refOpen, setRefOpen] = useState(false)
  /** 当前这一轮的取消句柄 */
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)
  /** 上一轮已经读出来的整库快照，展开推荐问时直接拿来当「当前情况」 */
  const dataRef = useRef<Awaited<ReturnType<typeof exportAllData>> | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  /** 应用在请求途中退出时，localStorage 留下的空占位改成可重试状态。 */
  useEffect(() => {
    if (pendingId !== null) return
    const abandoned = getChatMessages().filter(
      (item) => item.role === 'assistant' && item.content === '' && !item.error && !item.stopped,
    )
    for (const item of abandoned) {
      patchChatMessage(item.id, {
        content: t('assistant.stopped'),
        stopped: true,
        error: false,
      })
    }
  }, [currentSessionId, pendingId, t])

  useEffect(() => {
    if (messages.length === 0 && pendingId === null) return
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pendingId, currentSessionId])

  function patchAction(messageId: string, index: number, patch: Partial<ChatActionState>) {
    patchChatAction(messageId, index, patch)
  }

  function resetComposer() {
    setEditingId('')
    setEditText('')
    setSelectMode(false)
    setSelected([])
    setSlashOpen(false)
    queueRef.current = []
    setQueue([])
    guidanceRef.current = []
    setSteerMode(false)
  }

  function enqueue(text: string, files: ChatAttachment[]) {
    if (text.trim() === '' && files.length === 0) return
    queueRef.current = [...queueRef.current, { id: newChatMessageId(), text, files }].slice(0, 10)
    setQueue([...queueRef.current])
  }

  function removeQueued(id: string) {
    queueRef.current = queueRef.current.filter((item) => item.id !== id)
    setQueue([...queueRef.current])
  }

  /** 停止当前生成，并把还没发出去的排队消息一起取消 */
  function stop() {
    abortRef.current?.abort()
    queueRef.current = []
    setQueue([])
    guidanceRef.current = []
  }

  /**
   * 跑一轮。appendUser=false 是「重试 / 重新生成」：不重复加用户气泡。
   * targetId 指向要重新生成的助手消息；给了它就把新回答追加成一版，旧回答保留。
   */
  async function run(
    text: string,
    appendUser: boolean,
    files: ChatAttachment[] = [],
    targetId?: string,
  ) {
    const config = loadAiConfig()
    if (files.some((file) => typeof file.dataUrl === 'string') && config.vision === 'no') {
      showToast({ message: t('assistant.attachVisionUnsupported') })
      return
    }
    const ready = isConfigured(config)
    setConfigured(ready)

    const attachments = files.slice(0, MAX_ATTACHMENTS)
    const userMessage = appendUser
      ? createChatMessage({
          role: 'user',
          content: text,
          ...(attachments.length > 0 ? { attachments } : {}),
        })
      : null
    const existing = getChatMessages()
    const target = targetId ? existing.find((item) => item.id === targetId) ?? null : null
    const pending = target ?? createChatMessage({ role: 'assistant', content: '' })

    if (target) {
      beginChatRegeneration(target.id)
    } else {
      // 失败气泡先拿掉，重试时不要叠两条
      updateChat((current) => [
        ...current.filter((item) => !item.error),
        ...(userMessage ? [userMessage] : []),
        pending,
      ])
    }
    setPendingId(pending.id)
    setStreamContent('')
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller

    if (!ready) {
      if (target) {
        restoreChatVariant(target.id)
      } else {
        patchChatMessage(pending.id, {
          content: t('assistant.needConfig'),
          error: true,
        })
      }
      setPendingId(null)
      setBusy(false)
      if (abortRef.current === controller) abortRef.current = null
      // 没配模型时也把排队的消息接下去，别让队列卡在第一条
      const next = queueRef.current[0]
      if (next) {
        queueRef.current = queueRef.current.slice(1)
        setQueue([...queueRef.current])
        void run(next.text, true, next.files)
      }
      return
    }

    const permission = loadPermission()
    try {
      // 每轮都取一份最新快照：刚刚在别的页面记的东西也能查到
      const data = await exportAllData()
      dataRef.current = data
      // 历史里只放已经说出口的话；正在加载的占位、错误和停止的消息都不算
      const source = getChatMessages().filter(
        (item) =>
          item.id !== pending.id &&
          !item.error &&
          !item.stopped &&
          (item.content.trim() !== '' || (item.attachments?.length ?? 0) > 0),
      )
      const lastUserIndex = source.reduce(
        (found, item, index) => (item.role === 'user' ? index : found),
        -1,
      )
      const history = source.map((item, index) => ({
        role: item.role,
        content: historyContent(item, index === lastUserIndex),
      }))

      const result = await runAssistant({
        config,
        history,
        data,
        today: todayKey(),
        memories: memoryPromptLines(loadMemories()),
        notes: writtenNotes(),
        pendingNotes: pendingActionNotes(),
        resolvedNotes: resolvedActionNotes(),
        skills: enabledSkills(),
        permission,
        reasoning,
        planMode,
        signal: controller.signal,
        onRequestStart: () => {
          if (mountedRef.current) setStreamContent('')
        },
        onContent: (chunk) => {
          if (mountedRef.current) setStreamContent((current) => current + chunk)
        },
        takeGuidance: () => guidanceRef.current.splice(0),
        onStep: (step) => {
          updateChat((current) =>
            current.map((item) =>
              item.id === pending.id ? { ...item, steps: [...(item.steps ?? []), step] } : item,
            ),
          )
        },
      })

      if (!result.ok) {
        setStreamContent('')
        if (result.cancelled) {
          if (target) {
            restoreChatVariant(target.id)
            showToast({ message: t('assistant.stopped') })
          } else {
            patchChatMessage(pending.id, {
              content: t('assistant.stopped'),
              stopped: true,
              error: false,
              ms: elapsedSince(pending.at),
            })
          }
          return
        }
        if (target) {
          restoreChatVariant(target.id)
          showToast({ message: result.error })
        } else {
          patchChatMessage(pending.id, {
            content: result.error,
            error: true,
            ms: elapsedSince(pending.at),
          })
        }
        return
      }

      const base = result.reply || (result.question ? result.question.question : '')
      setStreamContent('')
      // 卡片没生成时把原因写进正文：模型可能照旧说「卡片来了」，
      // 只有系统自己补这一句，用户才不会被一句空话吊着。
      const content =
        result.actionErrors && result.actionErrors.length > 0
          ? `${base}${base === '' ? '' : '\n\n'}${t('assistant.cardBuildFailed', {
              detail: result.actionErrors.join('；'),
            })}`
          : base
      const actions = result.pending?.map((action) => ({
        action,
        status: 'pending' as const,
      }))
      const question = result.question
        ? ({ ...result.question, status: 'open' } satisfies ChatQuestionState)
        : undefined
      const ms = elapsedSince(pending.at)

      if (target) {
        appendChatVariant(target.id, {
          content,
          ...(result.steps.length > 0 ? { steps: result.steps } : {}),
          ...(actions && actions.length > 0 ? { actions } : {}),
          ...(question ? { question } : {}),
          ...(result.usage ? { usage: result.usage } : {}),
          ...(result.compacted ? { compacted: result.compacted } : {}),
          ms,
          at: pending.at,
        })
      } else {
        patchChatMessage(pending.id, {
          content,
          error: false,
          steps: result.steps.length > 0 ? result.steps : undefined,
          actions: actions && actions.length > 0 ? actions : undefined,
          question,
          ms,
          ...(result.usage ? { usage: result.usage } : {}),
          ...(result.compacted ? { compacted: result.compacted } : {}),
        })
      }

      // 新增自动保存：只有纯新增动作立刻落库，其余仍留在待确认卡片上
      if (result.pending) {
        for (const [index, action] of result.pending.entries()) {
          if (!runsWithoutConfirm(permission, action.kind)) continue
          try {
            const done = await executeAssistantAction(action)
            patchAction(pending.id, index, {
              status: 'done',
              recordId: done.recordId,
              previous: done.previous,
            })
          } catch (error) {
            patchAction(pending.id, index, {
              status: 'failed',
              error: (error as Error).message,
            })
          }
        }
      }
    } catch (error) {
      setStreamContent('')
      if (target) {
        restoreChatVariant(target.id)
        showToast({ message: (error as Error).message })
      } else {
        patchChatMessage(pending.id, {
          content: (error as Error).message,
          error: true,
          ms: elapsedSince(pending.at),
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (mountedRef.current) {
        setPendingId(null)
        setBusy(false)
        setStreamContent('')
        // 这一轮已经结束时还没被工具循环取走的插话，转成普通排队消息，别让用户白打
        const leftover = guidanceRef.current.splice(0, guidanceRef.current.length)
        if (leftover.length > 0) {
          queueRef.current = [
            ...queueRef.current,
            ...leftover.map((text) => ({ id: newChatMessageId(), text, files: [] })),
          ]
          setQueue([...queueRef.current])
        }
        // 当前这一轮结束后，自动接下一条排队消息
        const next = queueRef.current[0]
        if (next) {
          queueRef.current = queueRef.current.slice(1)
          setQueue([...queueRef.current])
          void run(next.text, true, next.files)
        }
      }
    }
  }

  function send() {
    const text = input.trim()
    if (text === '' && drafts.length === 0) return
    const files = drafts
    setInput('')
    setDrafts([])
    setSuggestOpen(false)
    setSlashOpen(false)
    // 用户绕过选择题直接说话：把还挂着的题标成跳过，别让它一直亮着
    updateChat((current) =>
      current.map((item) =>
        item.question?.status === 'open'
          ? { ...item, question: { ...item.question, status: 'skipped' as const } }
          : item,
      ),
    )
    if (busy || abortRef.current !== null) {
      if (steerMode && files.length === 0) {
        guidanceRef.current.push(text)
        showToast({ message: t('assistant.steerQueued') })
        return
      }
      enqueue(text, files)
      return
    }
    void run(text, true, files)
  }

  function retry() {
    if (busy) return
    const lastUser = [...messages].reverse().find((item) => item.role === 'user')
    if (!lastUser) return
    void run(lastUser.content, false, lastUser.attachments ?? [])
  }

  /** 重新生成：最后一条就地加一版；更早的回答开新分支，后面的对话留在原会话里 */
  function regenerate(item: ChatMessageRecord) {
    if (busy) return
    const list = getChatMessages()
    const index = list.findIndex((message) => message.id === item.id)
    if (index < 0) return
    let userIndex = -1
    for (let at = index - 1; at >= 0; at--) {
      if (list[at].role === 'user') {
        userIndex = at
        break
      }
    }
    if (userIndex < 0) return
    const user = list[userIndex]
    const hasLater = index < list.length - 1
    if (hasLater) {
      const forked = forkChatSession(userIndex + 1)
      if (!forked) return
      resetComposer()
      showToast({ message: t('assistant.editForked') })
      void run(user.content, false, user.attachments ?? [])
      return
    }
    void run(user.content, false, user.attachments ?? [], item.id)
  }

  function startEdit(item: ChatMessageRecord) {
    if (busy) return
    setSelectMode(false)
    setSelected([])
    setEditingId(item.id)
    setEditText(item.content)
  }

  /** 编辑用户消息：原会话保留，改写后的这句话在新分支里继续 */
  function submitEdit() {
    if (busy || editingId === '') return
    const text = editText.trim()
    if (text === '') return
    const list = getChatMessages()
    const index = list.findIndex((item) => item.id === editingId)
    if (index < 0) return
    const attachments = list[index].attachments ?? []
    const forked = forkChatSession(index, { content: text, attachments })
    setEditingId('')
    setEditText('')
    if (!forked) return
    showToast({ message: t('assistant.editForked') })
    void run(text, false, attachments)
  }

  /** 选择题选完：卡片留痕，再把「我的选择」作为下一条用户消息继续对话 */
  function answerQuestion(messageId: string, selectedOptions: string[]) {
    if (busy || working !== '' || selectedOptions.length === 0) return
    updateChat((current) =>
      current.map((item) =>
        item.id === messageId && item.question
          ? {
              ...item,
              question: {
                ...item.question,
                status: 'answered' as const,
                selected: selectedOptions,
              },
            }
          : item,
      ),
    )
    void run(t('assistant.questionAnswer', { choices: selectedOptions.join('、') }), true)
  }

  async function confirmAction(messageId: string, index: number, state: ChatActionState) {
    const key = `${messageId}:${index}`
    if (working !== '' || busy) return
    setWorking(key)
    try {
      const done: ActionDone = await executeAssistantAction(state.action)
      patchAction(messageId, index, {
        status: 'done',
        recordId: done.recordId,
        previous: done.previous,
        error: undefined,
      })
      showToast({ message: t('assistant.action.doneToast') })
    } catch (error) {
      patchAction(messageId, index, {
        status: 'failed',
        error: (error as Error).message,
      })
      showToast({
        message: t('assistant.action.failedToast', { error: (error as Error).message }),
      })
    } finally {
      setWorking('')
    }
  }

  async function undoAction(messageId: string, index: number, state: ChatActionState) {
    const key = `${messageId}:${index}`
    if (working !== '' || busy) return
    setWorking(key)
    try {
      await undoAssistantAction(state.action, {
        recordId: state.recordId ?? null,
        previous: state.previous,
      })
      patchAction(messageId, index, { status: 'undone' })
      showToast({ message: t('assistant.action.undoneToast') })
    } catch (error) {
      showToast({
        message: t('assistant.action.failedToast', { error: (error as Error).message }),
      })
    } finally {
      setWorking('')
    }
  }

  /** 一键撤销这一轮所有已写入的动作，按写入的倒序回滚 */
  async function rollbackWrites(item: ChatMessageRecord) {
    if (busy || working !== '') return
    const done = (item.actions ?? [])
      .map((state, index) => ({ state, index }))
      .filter((entry) => entry.state.status === 'done')
    if (done.length === 0) return
    setWorking(`rollback:${item.id}`)
    let failed = 0
    for (const { state, index } of [...done].reverse()) {
      try {
        await undoAssistantAction(state.action, {
          recordId: state.recordId ?? null,
          previous: state.previous,
        })
        patchAction(item.id, index, { status: 'undone' })
      } catch {
        failed++
      }
    }
    setWorking('')
    showToast({
      message:
        failed === 0
          ? t('assistant.rollbackDone', { n: done.length })
          : t('assistant.rollbackFailed', { n: failed }),
    })
  }

  /** 选文件：一次最多带三个，读不了就弹一句原因 */
  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.target.files ?? [])]
    event.target.value = ''
    if (picked.length === 0) return
    const room = MAX_ATTACHMENTS - drafts.length
    if (room <= 0) {
      showToast({ message: t('assistant.attachLimit') })
      return
    }
    for (const file of picked.slice(0, room)) {
      if (file.type.startsWith('image/') && loadAiConfig().vision === 'no') {
        showToast({ message: t('assistant.attachVisionUnsupported') })
        continue
      }
      try {
        const item = await readAttachment(file)
        setDrafts((current) =>
          current.length >= MAX_ATTACHMENTS ? current : [...current, item],
        )
      } catch (error) {
        showToast({ message: (error as Error).message })
      }
    }
  }

  function startNewChat() {
    if (busy) return
    newChatSession()
    setInput('')
    setDrafts([])
    resetComposer()
  }

  /** 提交改名；留空就回到自动命名 */
  function commitRename() {
    if (renamingId === '') return
    renameChatSession(renamingId, renameText)
    setRenamingId('')
    setRenameText('')
  }

  function startRename(id: string, title: string) {
    setDeletingId('')
    setRenamingId(id)
    setRenameText(title)
  }

  async function copy(text: string) {
    const ok = await copyTextToClipboard(text)
    showToast({ message: t(ok ? 'assistant.copied' : 'assistant.copyFailed') })
  }

  function toggleSelect(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function askDeleteFrom(item: ChatMessageRecord) {
    if (busy) return
    const list = getChatMessages()
    const index = list.findIndex((message) => message.id === item.id)
    if (index < 0) return
    setDeleteRequest({
      fromId: item.id,
      title: t('assistant.deleteFromTitle'),
      desc: t('assistant.deleteFromDesc', { n: list.length - index }),
    })
  }

  function askDeleteSelected() {
    if (selected.length === 0 || busy) return
    setDeleteRequest({
      ids: [...selected],
      title: t('assistant.batchDeleteTitle', { n: selected.length }),
      desc: t('assistant.batchDeleteDesc'),
    })
  }

  function confirmDelete() {
    if (!deleteRequest) return
    if (deleteRequest.fromId) {
      const removed = deleteChatFrom(deleteRequest.fromId)
      showToast({ message: t('assistant.deletedToast', { n: removed }) })
    } else if (deleteRequest.ids) {
      deleteChatMessages(deleteRequest.ids)
      showToast({ message: t('assistant.deletedToast', { n: deleteRequest.ids.length }) })
    }
    setDeleteRequest(null)
    setSelectMode(false)
    setSelected([])
  }

  /** 分支之间循环切换；分支共享同一段前缀，各自接着自己的改法往下走 */
  function cycleBranch(delta: number) {
    if (busy) return
    const siblings = getForkSiblings(currentSessionId)
    if (siblings.length < 2) return
    const index = siblings.findIndex((item) => item.id === currentSessionId)
    const next = siblings[(index + delta + siblings.length) % siblings.length]
    switchChatSession(next.id)
    resetComposer()
  }

  function renderActions(item: ChatMessageRecord) {
    if (!item.actions || item.actions.length === 0) return null
    const waiting = item.actions.filter(
      (state) => state.status === 'pending' || state.status === 'failed',
    ).length
    return (
      <div className="flex w-full flex-col gap-2">
        {/* 待确认张数由系统数，不问模型：「卡片来了」这句必须和真实卡片同时成立 */}
        {waiting > 0 && (
          <p className="m-0 text-[11px] text-muted">{t('assistant.cardsReady', { n: waiting })}</p>
        )}
        {item.actions.map((state, index) => (
          <AssistantActionCard
            key={`${item.id}-${index}`}
            state={state}
            busy={working !== '' || busy}
            onConfirm={() => void confirmAction(item.id, index, state)}
            onCancel={() => patchAction(item.id, index, { status: 'canceled' })}
            onUndo={() => void undoAction(item.id, index, state)}
            onEdit={(next) => patchAction(item.id, index, { action: next })}
          />
        ))}
      </div>
    )
  }

  /**
   * 展开下拉栏时才让模型按最近对话与长期记忆现想三条；
   * 没配模型或请求失败就退回按话题挑的预设，保证下拉栏不会空着。
   */
  async function openSuggestions(reply: ChatMessageRecord) {
    setSuggestOpen(true)
    if (suggestions?.id === reply.id || suggestLoading) return
    setSuggestLoading(true)
    try {
      const config = loadAiConfig()
      const items = isConfigured(config)
        ? await requestSuggestions({
            config,
            recent: messages.map((item) => ({ role: item.role, content: item.content })),
            memories: memoryPromptLines(loadMemories()),
            situation: dataRef.current
              ? summarizeSituation(dataRef.current, todayKey())
              : [],
          })
        : []
      setSuggestions({
        id: reply.id,
        items: items.length > 0 ? items : suggestKeys(reply.content).map((key) => t(key)),
      })
    } catch {
      setSuggestions({ id: reply.id, items: suggestKeys(reply.content).map((key) => t(key)) })
    } finally {
      setSuggestLoading(false)
    }
  }

  /** 最后一条正常回答：推荐问以它为锚点 */
  const lastReply = [...messages]
    .reverse()
    .find(
      (item) =>
        item.role === 'assistant' &&
        !item.error &&
        !item.stopped &&
        item.content.trim() !== '',
    )

  /** 上下文进度：以最后一次请求的提示词长度做分子，模型窗口做分母 */
  const lastWithUsage = [...messages]
    .reverse()
    .find((item) => item.role === 'assistant' && (item.usage?.context ?? 0) > 0)
  const contextUsed = lastWithUsage?.usage?.context ?? 0
  const contextTotal = contextUsed > 0 ? contextWindow(loadAiConfig().model) : 0
  const contextPct =
    contextTotal > 0 ? Math.min(100, Math.round((contextUsed / contextTotal) * 100)) : 0

  const currentSession = sessions.find((item) => item.id === currentSessionId)
  const sessionTitle = currentSession?.title || t('assistant.untitled')
  const siblings = getForkSiblings(currentSessionId)
  const branchIndex = Math.max(0, siblings.findIndex((item) => item.id === currentSessionId))
  const allSelected = messages.length > 0 && selected.length === messages.length

  const exportLabels = {
    user: t('assistant.exportUser'),
    assistant: t('assistant.exportAssistant'),
    tools: t('assistant.exportTrace'),
    actions: t('assistant.exportActions'),
    attachments: t('assistant.exportAttachments'),
    exportedAt: t('assistant.exportedAt'),
  }

  /** 斜杠菜单直接从已启用 Skills 生成，点击后在用户消息里明确点名调用 */
  const slashItems = loadSkills().filter((skill) => skill.enabled)
  const slashQuery = input.startsWith('/') ? input.slice(1).trim().toLowerCase() : ''
  const slashShown = slashOpen
    ? slashItems.filter(
        (item) => slashQuery === '' || `${item.name} ${item.description}`.toLowerCase().includes(slashQuery),
      )
    : []

  return (
    <div className={compact ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col'}>
      {/* 会话工具条：标题两行（名字 + 条数），右侧是圆形新建与「历史 + 计数」 */}
      <div className="flex items-center gap-2 border-b border-line pb-2">
        {!compact && (
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/10 text-[11px] text-brand"
            aria-hidden="true"
          >
            ✦
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-xs font-medium text-fg">{sessionTitle}</p>
          <p className="m-0 flex items-center gap-1 text-[10px] text-muted">
            <span>{t('assistant.sessionMeta', { n: messages.length })}</span>
            {siblings.length > 1 && (
              <button
                type="button"
                onClick={() => cycleBranch(1)}
                disabled={busy}
                aria-label={t('assistant.next')}
                className="inline-flex min-h-9 items-center rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted transition-colors hover:text-brand disabled:opacity-40 md:min-h-0"
              >
                {t('assistant.branch', { n: branchIndex + 1, total: siblings.length })}
              </button>
            )}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelectMode((value) => !value)
              setSelected([])
              setEditingId('')
            }}
            aria-pressed={selectMode}
            className={CHAT_TOOL}
          >
            {selectMode ? t('assistant.selectCancel') : t('assistant.select')}
          </button>
        )}
        <button
          type="button"
          onClick={startNewChat}
          disabled={busy}
          aria-label={t('assistant.newChat')}
          title={t('assistant.newChat')}
          className={CHAT_ICON_BRAND}
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => setSessionOpen(true)}
          className={CHAT_TOOL}
        >
          {t('assistant.sessions')}
          <span className={CHAT_COUNT}>{sessions.length}</span>
        </button>
        {/* 悬浮面板里把「清空 / 导出」收进这里，底部就少一整行 */}
        {compact && (
          <Dropdown
            caret={false}
            menuLabel={t('common.more')}
            label="⋯"
            buttonClassName="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] text-muted transition-colors hover:bg-surface-2 hover:text-fg md:h-7 md:w-7"
            items={[
              {
                label: t('assistant.export'),
                icon: 'export',
                onSelect: () => setExportIds([]),
              },
              {
                label: t('assistant.clear'),
                icon: 'trash',
                danger: true,
                disabled: busy,
                onSelect: () => setClearOpen(true),
              },
            ]}
          />
        )}
      </div>

      {/* 多选工具条：批量复制、导出、删除 */}
      {selectMode && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line py-2 text-[11px]">
          <span className="text-muted">
            {t('assistant.selected', { n: selected.length })}
          </span>
          <button
            type="button"
            onClick={() =>
              setSelected(allSelected ? [] : messages.map((item) => item.id))
            }
            className="inline-flex min-h-11 items-center px-1 text-brand transition-opacity hover:opacity-80 md:min-h-0"
          >
            {t('assistant.selectAll')}
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() =>
              void copy(
                buildChatCopy(
                  messages.filter((item) => selected.includes(item.id)),
                  exportLabels,
                ),
              )
            }
            className={MESSAGE_ACTION}
          >
            {t('assistant.batchCopy')}
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => setExportIds([...selected])}
            className={MESSAGE_ACTION}
          >
            {t('assistant.batchExport')}
          </button>
          <button
            type="button"
            disabled={selected.length === 0 || busy}
            onClick={askDeleteSelected}
            className="inline-flex min-h-11 items-center px-1 text-[11px] text-danger transition-opacity hover:opacity-80 disabled:opacity-40 md:min-h-0"
          >
            {t('assistant.batchDelete')}
          </button>
        </div>
      )}

      <div
        className={
          compact
            ? 'min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3'
            : 'flex-1 space-y-4 py-4'
        }
      >
        {!configured && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
            <p className="m-0 text-sm text-fg">{t('assistant.needConfig')}</p>
            <Link to="/me/agent/ai" className={SOLID_BUTTON + ' mt-3'}>
              <Icon name="settings" />
              {t('assistant.goSettings')}
            </Link>
          </div>
        )}

        {messages.length === 0 && (
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="m-0 text-sm text-fg">{t('assistant.intro')}</p>
            <div className="mt-2 flex flex-col gap-1">
              {EXAMPLE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(t(key), true)}
                  className="group flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-left text-xs text-fg transition-colors hover:bg-brand/10 hover:text-brand disabled:opacity-50"
                >
                  <span className="mt-0.5 shrink-0 text-[10px] text-brand" aria-hidden="true">
                    ▸
                  </span>
                  <span className="min-w-0 flex-1">{t(key)}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <Link to="/me/agent/memory" className="transition-colors hover:text-brand">
                {t('assistant.memoryLink', { count: loadMemories().length })}
              </Link>
              <span aria-hidden="true">·</span>
              <Link to="/me/agent/skills" className="transition-colors hover:text-brand">
                {t('assistant.skillsLink', { count: loadSkills().filter((skill) => skill.enabled).length })}
              </Link>
            </div>
          </div>
        )}

        {messages.map((item) => {
          const loading = item.id === pendingId && item.content === ''
          const isEditing = editingId === item.id
          const checked = selected.includes(item.id)
          const timestamp = (
            <time
              dateTime={new Date(item.at).toISOString()}
              className="text-[10px] leading-4 tabular-nums text-muted"
            >
              {timestampFormatter.format(item.at)}
            </time>
          )
          return (
            <div key={item.id} className="flex w-full items-start gap-2">
              {selectMode && (
                <label className="-my-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center md:m-0 md:h-4 md:w-4">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(item.id)}
                    aria-label={t('assistant.select')}
                    className="h-5 w-5 accent-[var(--color-brand)] md:h-4 md:w-4"
                  />
                </label>
              )}
              <div
                className={`flex min-w-0 flex-1 flex-col gap-1.5 ${
                  item.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                {item.role === 'user' ? (
                  isEditing ? (
                    <>
                      <div className="w-full max-w-[92%] rounded-xl border border-brand/40 bg-surface p-2.5">
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setEditingId('')
                              setEditText('')
                            }
                            if (
                              event.key === 'Enter' &&
                              (event.ctrlKey || event.metaKey) &&
                              !event.nativeEvent.isComposing
                            ) {
                              event.preventDefault()
                              submitEdit()
                            }
                          }}
                          rows={3}
                          aria-label={t('assistant.edit')}
                          className={`${INPUT} resize-y text-sm`}
                        />
                        <p className="mt-1.5 text-[10px] text-muted">
                          {t('assistant.editHint')}
                        </p>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId('')
                              setEditText('')
                            }}
                            className="text-[11px] text-muted transition-colors hover:text-fg"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            disabled={busy || editText.trim() === ''}
                            onClick={submitEdit}
                            className="text-[11px] font-medium text-brand transition-opacity hover:opacity-80 disabled:opacity-40"
                          >
                            {t('assistant.editSave')}
                          </button>
                        </div>
                      </div>
                      {timestamp}
                    </>
                  ) : (
                    <>
                      {item.content.trim() !== '' && (
                        <p className="m-0 max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand/15 px-3.5 py-2 text-sm text-fg">
                          {item.content}
                        </p>
                      )}
                      {(item.attachments ?? []).length > 0 && (
                        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                          {(item.attachments ?? []).map((file, index) =>
                            file.dataUrl ? (
                              <img
                                key={`${item.id}-att-${index}`}
                                src={file.dataUrl}
                                alt={file.name}
                                className="h-16 w-16 rounded-lg border border-line object-cover"
                              />
                            ) : (
                              <span
                                key={`${item.id}-att-${index}`}
                                className="max-w-[12rem] truncate rounded-lg border border-line bg-surface-2 px-2 py-1 text-[11px] text-muted"
                              >
                                {file.name}
                              </span>
                            ),
                          )}
                        </div>
                      )}
                      {timestamp}
                      {!selectMode && (
                        <div className="flex items-center gap-0.5">
                          {item.content.trim() !== '' && (
                            <button
                              type="button"
                              onClick={() => void copy(item.content)}
                              aria-label={t('assistant.copy')}
                              title={t('assistant.copy')}
                              className={MESSAGE_ACTION}
                            >
                              <Icon name="copy" className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy || loading}
                            onClick={() => startEdit(item)}
                            aria-label={t('assistant.edit')}
                            title={t('assistant.edit')}
                            className={MESSAGE_ACTION}
                          >
                            <Icon name="edit" className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy || loading}
                            onClick={() => askDeleteFrom(item)}
                            aria-label={t('assistant.deleteFrom')}
                            title={t('assistant.deleteFrom')}
                            className={MESSAGE_ACTION_DANGER}
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <>
                    {((item.steps && item.steps.length > 0) || loading) && (
                      <div className="w-full overflow-hidden rounded-2xl border border-line/70 bg-surface-2/60">
                        <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 text-[11px] text-muted">
                          {loading ? (
                            <AssistantWorking
                              startedAt={item.at}
                              stepName={item.steps?.[item.steps.length - 1]?.name}
                            />
                          ) : (
                            <>
                              <span
                                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                                aria-hidden="true"
                              />
                              <span>{t('assistant.checked', { n: item.steps?.length ?? 0 })}</span>
                            </>
                          )}
                          {!loading && item.ms !== undefined && (
                            <span className="ml-auto shrink-0 font-mono text-[10px]">
                              {t('assistant.traceMs', { s: (item.ms / 1000).toFixed(1) })}
                            </span>
                          )}
                        </div>
                        {loading && item.id === pendingId && streamContent.trim() !== '' && (
                          <div className="px-3 py-2.5 text-sm leading-relaxed text-fg">
                            <AssistantMarkdown text={streamContent} />
                          </div>
                        )}
                        {item.steps && item.steps.length > 0 && (
                          <ul className="m-0 list-none divide-y divide-line p-0">
                            {item.steps.map((step, index) => (
                              <li key={`${item.id}-${index}`}>
                                <details className="group px-2.5 py-1.5">
                                  <summary className="flex cursor-pointer select-none items-center gap-2 text-[11px]">
                                    <span className="font-mono text-[10px] text-brand">{step.name}</span>
                                    <span className="min-w-0 flex-1 truncate text-muted">
                                      {firstLine(step.text)}
                                    </span>
                                    <span
                                      className="text-[10px] text-muted transition-transform group-open:rotate-180"
                                      aria-hidden="true"
                                    >
                                      ▾
                                    </span>
                                  </summary>
                                  <div className="mt-1.5 whitespace-pre-wrap break-words border-l-2 border-brand/30 pl-2 text-[11px] text-muted">
                                    {step.text}
                                  </div>
                                </details>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {!loading && item.content !== '' && (
                      <div
                        className={`max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm leading-relaxed ${
                          item.error
                            ? 'border-danger/40 bg-danger/10 text-fg'
                            : 'border-line bg-surface text-fg'
                        }`}
                      >
                        {item.error ? (
                          <p className="m-0 whitespace-pre-wrap">{item.content}</p>
                        ) : (
                          <AssistantMarkdown text={item.content} />
                        )}
                        {(item.error || item.stopped) && (
                          <button
                            type="button"
                            onClick={retry}
                            disabled={busy}
                            className="mt-2 inline-flex min-h-9 items-center gap-1 text-[11px] text-danger underline-offset-2 transition-colors hover:underline disabled:opacity-50"
                          >
                            {t('assistant.retry')}
                          </button>
                        )}
                      </div>
                    )}
                    {!loading && timestamp}
                    {item.compacted !== undefined && item.compacted > 0 && (
                      <p className="m-0 text-[10px] text-muted">
                        {t('assistant.compacted', { n: item.compacted })}
                      </p>
                    )}
                    {item.question && !selectMode && (
                      <AssistantQuestionCard
                        state={item.question}
                        busy={busy || working !== ''}
                        onAnswer={(selectedOptions) =>
                          answerQuestion(item.id, selectedOptions)
                        }
                      />
                    )}
                    {!selectMode && renderActions(item)}
                    {!selectMode &&
                      (item.actions?.filter((state) => state.status === 'done').length ?? 0) > 0 && (
                        <button
                          type="button"
                          disabled={busy || working !== ''}
                          onClick={() => void rollbackWrites(item)}
                          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[10px] text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40 md:min-h-0"
                        >
                          <Icon name="trash" className="h-3 w-3 shrink-0" />
                          {t('assistant.rollback', {
                            n:
                              item.actions?.filter((state) => state.status === 'done').length ?? 0,
                          })}
                        </button>
                      )}
                    {!selectMode && !loading && (
                      <div className="flex items-center gap-0.5">
                        {item.variants && item.variants.length > 1 && (
                          <span className="mr-1 flex items-center gap-0.5 rounded-full border border-line px-1 text-[10px] text-muted">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => switchChatVariant(item.id, -1)}
                              aria-label={t('assistant.previous')}
                              className="inline-flex h-7 w-6 items-center justify-center text-[12px] transition-colors hover:text-brand disabled:opacity-40"
                            >
                              ‹
                            </button>
                            <span className="tabular-nums">
                              {t('assistant.version', {
                                n: (item.variantIndex ?? 0) + 1,
                                total: item.variants.length,
                              })}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => switchChatVariant(item.id, 1)}
                              aria-label={t('assistant.next')}
                              className="inline-flex h-7 w-6 items-center justify-center text-[12px] transition-colors hover:text-brand disabled:opacity-40"
                            >
                              ›
                            </button>
                          </span>
                        )}
                        {item.content.trim() !== '' && (
                          <button
                            type="button"
                            onClick={() => void copy(item.content)}
                            aria-label={t('assistant.copy')}
                            title={t('assistant.copy')}
                            className={MESSAGE_ACTION}
                          >
                            <Icon name="copy" className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => regenerate(item)}
                          aria-label={t('assistant.regenerate')}
                          title={t('assistant.regenerate')}
                          className={MESSAGE_ACTION}
                        >
                          <Icon name="refresh" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => askDeleteFrom(item)}
                          aria-label={t('assistant.deleteFrom')}
                          title={t('assistant.deleteFrom')}
                          className={MESSAGE_ACTION_DANGER}
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div
        className={
          compact
            ? 'border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'
            : 'sticky bottom-0 border-t border-line bg-bg pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3'
        }
      >
        {/* 上下文用量：只显示服务商真的报了 token 的那种模型。
            悬浮面板里只留一条细线，文字藏起来——那一行本来也读不出什么。 */}
        {contextUsed > 0 && (
          <div className="mb-2">
            {!compact && (
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
                <span className="truncate">
                  {t('assistant.contextUsage', {
                    used: formatTokens(contextUsed),
                    total: formatTokens(contextTotal),
                    pct: contextPct,
                  })}
                </span>
                {lastWithUsage?.usage && (
                  <span className="shrink-0 font-mono">
                    {t('assistant.turnTokens', { n: formatTokens(lastWithUsage.usage.total) })}
                  </span>
                )}
              </div>
            )}
            <div
              title={t('assistant.contextUsage', {
                used: formatTokens(contextUsed),
                total: formatTokens(contextTotal),
                pct: contextPct,
              })}
              className={`w-full overflow-hidden rounded-full bg-surface-2 ${compact ? 'h-0.5' : 'mt-1 h-1'}`}
            >
              <div
                className={`rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none ${compact ? 'h-0.5' : 'h-1'}`}
                style={{ width: `${Math.max(contextPct, 2)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            aria-pressed={planMode}
            disabled={busy}
            onClick={() => {
              const next = !planMode
              setPlanMode(next)
              savePlanMode(next)
            }}
            className={`${MODE_CHIP} ${planMode ? MODE_CHIP_ON : MODE_CHIP_OFF}`}
          >
            <Icon name="list" className="h-3.5 w-3.5" />
            {t('assistant.planMode')}
          </button>
          <button
            type="button"
            aria-pressed={reasoning}
            disabled={busy}
            onClick={() => {
              const next = !reasoning
              setReasoning(next)
              saveReasoning(next)
            }}
            className={`${MODE_CHIP} ${reasoning ? MODE_CHIP_ON : MODE_CHIP_OFF}`}
          >
            <Icon name="sparkles" className="h-3.5 w-3.5" />
            {t('assistant.reasoning')}
            <span
              className={`relative ml-0.5 inline-block h-3.5 w-6 rounded-full transition-colors ${
                reasoning ? 'bg-brand' : 'bg-surface-2 ring-1 ring-inset ring-line'
              }`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] duration-150 motion-reduce:transition-none ${
                  reasoning ? 'left-3' : 'left-0.5'
                }`}
              />
            </span>
          </button>
          {/* 推荐问和模式开关挤成一行：悬浮面板里省下的是一整行高度 */}
          {messages.length > 0 && !busy && lastReply && (
            <button
              type="button"
              aria-expanded={suggestOpen}
              onClick={() => {
                if (suggestOpen) setSuggestOpen(false)
                else void openSuggestions(lastReply)
              }}
              className={`${MODE_CHIP} border-dashed ${suggestOpen ? MODE_CHIP_ON : MODE_CHIP_OFF}`}
            >
              <span aria-hidden="true">✦</span>
              {t('assistant.suggestTitle')}
              <span
                className={`text-[10px] transition-transform ${suggestOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>
          )}
        </div>
        {planMode && (
          <p className="m-0 mb-2 text-[10px] text-brand">{t('assistant.planHint')}</p>
        )}

        {/* 生成中的两种说话方式：排队等下一轮，或插话到当前这轮的工具循环里 */}
        {busy && (
          <div className="mb-2 flex items-center gap-2 text-[10px]">
            <button
              type="button"
              aria-pressed={steerMode}
              onClick={() => setSteerMode((value) => !value)}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3 transition-colors md:min-h-0 md:px-2 md:py-0.5 ${
                steerMode
                  ? 'bg-brand/15 text-brand'
                  : 'bg-surface-2 text-muted hover:text-fg'
              }`}
            >
              {t('assistant.steer')}
            </button>
            <span className="min-w-0 flex-1 truncate text-muted">
              {steerMode ? t('assistant.steerHint') : t('assistant.queueHint')}
            </span>
          </div>
        )}

        {/* 排队中的消息：当前一轮结束后按顺序自动发出 */}
        {queue.length > 0 && (
          <div className="mb-2 flex flex-col gap-1 rounded-lg border border-dashed border-brand/30 bg-brand/[0.04] px-2 py-1.5">
            <span className="text-[10px] text-brand">{t('assistant.queue')}</span>
            {queue.map((item) => (
              <span key={item.id} className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="min-w-0 flex-1 truncate">{item.text || item.files[0]?.name}</span>
                <button
                  type="button"
                  onClick={() => removeQueued(item.id)}
                  aria-label={t('assistant.queueRemove')}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-muted transition-colors hover:text-danger md:h-5 md:w-5"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 推荐问展开后的内容：触发按钮已经并到上面那一行 */}
        {messages.length > 0 && !busy && lastReply && suggestOpen && (
          <div className="mb-2">
            {suggestLoading ? (
              <p className="m-0 text-[11px] text-muted">{t('assistant.suggestLoading')}</p>
            ) : suggestions?.items.length ? (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.items.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => {
                      setSuggestOpen(false)
                      void run(text, true)
                    }}
                    className={CHAT_CHIP}
                  >
                    {text}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Skills：选中后点名技能并留在输入框继续补充任务 */}
        {slashOpen && (
          <div className="mb-2 max-h-[40dvh] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface">
            <p className="m-0 border-b border-line px-2.5 py-1.5 text-[10px] text-muted">
              {t('assistant.slashTitle')}
            </p>
            {slashShown.length === 0 ? (
              <p className="m-0 px-2.5 py-2 text-[11px] text-muted">
                {t('assistant.slashEmpty')}
              </p>
            ) : (
              slashShown.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setInput((current) => {
                      const typed = current.trim()
                      // 输入框里已经有话时接在后面，别把用户打了一半的内容冲掉
                      const invocation = t('assistant.useSkill', { name: item.name })
                      if (typed === '' || typed.startsWith('/')) return `${invocation} `
                      return `${typed}\n${invocation} `
                    })
                    setSlashOpen(false)
                  }}
                  className="flex min-h-11 w-full items-start gap-2 px-2.5 py-2 text-left text-[11px] text-fg transition-colors hover:bg-brand/10 hover:text-brand md:min-h-0 md:py-1.5"
                >
                  <span className="shrink-0 font-mono text-[10px] text-brand">/</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{item.name}</span>
                    <span className="mt-0.5 block text-[10px] text-muted">{item.description}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {drafts.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {drafts.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="flex max-w-[14rem] items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[11px] text-muted"
              >
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setDrafts((current) => current.filter((_, at) => at !== index))}
                  aria-label={t('assistant.attachRemove')}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-muted transition-colors hover:text-fg md:h-5 md:w-5"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.markdown,.json,.csv,.log,.yml,.yaml"
            onChange={(event) => void handleFiles(event)}
            className="hidden"
            aria-label={t('assistant.attach')}
          />
          <input
            value={input}
            onChange={(event) => {
              const value = event.target.value
              setInput(value)
              setSlashOpen(value.startsWith('/'))
            }}
            onKeyDown={(event) => {
              if (slashOpen) {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setSlashOpen(false)
                  return
                }
                if (
                  (event.key === 'Enter' || event.key === 'Tab') &&
                  slashShown.length > 0 &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  setInput(`${t('assistant.useSkill', { name: slashShown[0].name })} `)
                  setSlashOpen(false)
                  return
                }
              }
              if (event.key === 'Escape' && busy) {
                event.preventDefault()
                stop()
                return
              }
              if (
                event.key === 'ArrowUp' &&
                input === '' &&
                drafts.length === 0 &&
                !busy
              ) {
                const lastUser = [...messages].reverse().find((item) => item.role === 'user')
                if (lastUser) {
                  event.preventDefault()
                  startEdit(lastUser)
                  return
                }
              }
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                (!event.shiftKey || event.ctrlKey || event.metaKey)
              ) {
                event.preventDefault()
                send()
              }
            }}
            placeholder={
              busy
                ? steerMode
                  ? t('assistant.steerHint')
                  : t('assistant.queueHint')
                : t('assistant.inputPlaceholder')
            }
            aria-label={t('assistant.inputPlaceholder')}
            className={`${INPUT} order-first w-full md:order-none md:w-auto md:flex-1`}
          />
          {/* 手机上输入框独占一行，图标与发送放到下一行；桌面合成一行 */}
          <div className="flex w-full items-center gap-2 md:contents">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={drafts.length >= MAX_ATTACHMENTS}
              aria-label={t('assistant.attach')}
              title={t('assistant.attach')}
              className={CHAT_ICON}
            >
              ＋
            </button>
            <button
              type="button"
              onClick={() => setRefOpen(true)}
              aria-label={t('assistant.refTitle')}
              title={t('assistant.refTitle')}
              className={`${CHAT_ICON} font-mono text-sm`}
            >
              @
            </button>
            {/* 手机端打不出斜杠：点这里直接展开整份指令清单 */}
            <button
              type="button"
              onClick={() => setSlashOpen((value) => !value)}
              aria-pressed={slashOpen}
              aria-label={t('assistant.slashTitle')}
              title={t('assistant.slashTitle')}
              className={`${CHAT_ICON} font-mono text-sm ${
                slashOpen ? 'text-brand ring-1 ring-brand/40' : ''
              }`}
            >
              /
            </button>
            {busy && (
              <button
                type="button"
                onClick={stop}
                aria-label={t('assistant.stop')}
                title={t('assistant.stop')}
                className={CHAT_STOP}
              >
                ■
              </button>
            )}
            <button
              type="button"
              onClick={send}
              disabled={input.trim() === '' && drafts.length === 0}
              className={`${CHAT_SEND} ml-auto md:ml-0`}
            >
              {busy ? (steerMode ? t('assistant.steer') : t('assistant.queue')) : t('assistant.send')}
            </button>
          </div>
        </div>
        {!compact && messages.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setClearOpen(true)}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-40 md:min-h-8"
              >
                <Icon name="trash" className="h-3.5 w-3.5 shrink-0" />
                {t('assistant.clear')}
              </button>
              <button
                type="button"
                onClick={() => setExportIds([])}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-fg md:min-h-8"
              >
                <Icon name="export" className="h-3.5 w-3.5 shrink-0" />
                {t('assistant.export')}
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted">
              <Link to="/me/agent/memory" className="transition-colors hover:text-brand">
                {t('assistant.memoryLink', { count: loadMemories().length })}
              </Link>
              <span aria-hidden="true">·</span>
              <Link to="/me/agent/skills" className="transition-colors hover:text-brand">
                {t('assistant.skillsLink', { count: loadSkills().filter((skill) => skill.enabled).length })}
              </Link>
            </div>
          </div>
        )}
        {/* 提示单独占一行：和开关挤在同一行时长句会被压成三行，看着最乱。
            悬浮面板里不显示——那点高度留给对话本身。 */}
        {!compact && (
          <p className="m-0 mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
            <Icon name="info" className="mt-px h-3 w-3 shrink-0" />
            <span className="min-w-0">{t('assistant.healthNote')}</span>
          </p>
        )}
      </div>

      {sessionOpen && (
        <Modal
          size="sm"
          label={t('assistant.sessions')}
          onClose={() => {
            setSessionOpen(false)
            setRenamingId('')
            setDeletingId('')
          }}
          panelClassName="flex max-h-[70dvh] flex-col"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-medium">{t('assistant.sessions')}</h2>
            <button
              type="button"
              onClick={() => setSessionOpen(false)}
              aria-label={t('common.close')}
              title={t('common.close')}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg md:h-7 md:w-7"
            >
              ✕
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="m-0 text-xs text-muted">{t('assistant.sessionEmpty')}</p>
          ) : (
            <ul className="m-0 min-h-0 list-none space-y-1.5 overflow-y-auto p-0">
              {[...sessions]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((session) => {
                  const active = session.id === currentSessionId
                  const renaming = renamingId === session.id
                  const confirming = deletingId === session.id
                  return (
                    <li
                      key={session.id}
                      className={`rounded-xl border transition-colors ${
                        active ? 'border-brand/30 bg-brand/[0.06]' : 'border-transparent'
                      }`}
                    >
                      {renaming ? (
                        <div className="flex items-center gap-1.5 p-2">
                          <input
                            autoFocus
                            value={renameText}
                            onChange={(event) => setRenameText(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.nativeEvent.isComposing) commitRename()
                              if (event.key === 'Escape') setRenamingId('')
                            }}
                            placeholder={t('assistant.renameHint')}
                            aria-label={t('assistant.rename')}
                            className={INPUT + ' h-11 flex-1 text-xs md:h-8'}
                          />
                          <button
                            type="button"
                            onClick={commitRename}
                            className="inline-flex min-h-11 shrink-0 items-center px-1 text-[11px] font-medium text-brand transition-colors hover:opacity-80 md:min-h-0"
                          >
                            {t('assistant.renameSave')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId('')}
                            className="inline-flex min-h-11 shrink-0 items-center px-1 text-[11px] text-muted transition-colors hover:text-fg md:min-h-0"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (busy) return
                              switchChatSession(session.id)
                              resetComposer()
                              setSessionOpen(false)
                            }}
                            disabled={busy}
                            className={CHAT_ROW}
                          >
                            <span
                              className={`truncate text-xs ${
                                active ? 'font-medium text-brand' : 'text-fg'
                              }`}
                            >
                              {session.title || t('assistant.untitled')}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
                              {t('assistant.sessionMeta', { n: session.messages.length })}
                              <span aria-hidden="true">·</span>
                              {whenLabel(session.updatedAt)}
                              {session.forkGroup && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-brand">{t('assistant.branchTag')}</span>
                                </>
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startRename(session.id, session.title)}
                            aria-label={t('assistant.rename')}
                            title={t('assistant.rename')}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-brand md:h-7 md:w-7"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId('')
                              setDeletingId(confirming ? '' : session.id)
                            }}
                            aria-label={t('assistant.sessionDelete')}
                            title={t('assistant.sessionDelete')}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] text-muted transition-colors hover:bg-danger/10 hover:text-danger md:h-7 md:w-7"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      {confirming && (
                        <div className="flex items-center justify-between gap-2 border-t border-line px-2.5 py-1.5">
                          <span className="min-w-0 truncate text-[11px] text-danger">
                            {t('assistant.sessionDeleteConfirm', {
                              title: session.title || t('assistant.untitled'),
                            })}
                          </span>
                          <div className="flex shrink-0 items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setDeletingId('')}
                              className="inline-flex min-h-11 items-center px-1 text-muted transition-colors hover:text-fg md:min-h-0"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                deleteChatSession(session.id)
                                setDeletingId('')
                              }}
                              className="inline-flex min-h-11 items-center px-1 font-medium text-danger transition-opacity hover:opacity-80 md:min-h-0"
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
            </ul>
          )}
        </Modal>
      )}

      {clearOpen && (
        <ConfirmDialog
          title={t('assistant.clearTitle')}
          description={t('assistant.clearDesc')}
          confirmLabel={t('assistant.clear')}
          tone="danger"
          onConfirm={() => {
            clearChat()
            resetComposer()
            setClearOpen(false)
          }}
          onCancel={() => setClearOpen(false)}
        />
      )}

      {deleteRequest && (
        <ConfirmDialog
          title={deleteRequest.title}
          description={deleteRequest.desc}
          tone="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteRequest(null)}
        />
      )}

      {exportIds !== null && (
        <AssistantExportDialog
          messages={messages}
          title={sessionTitle}
          selectedIds={exportIds}
          onClose={() => setExportIds(null)}
        />
      )}

      {refOpen && (
        <AssistantRefPicker
          onPick={(text) => {
            setInput((value) => (value.trim() === '' ? text : `${value.trimEnd()} ${text}`))
            setRefOpen(false)
          }}
          onClose={() => setRefOpen(false)}
        />
      )}
    </div>
  )
}
