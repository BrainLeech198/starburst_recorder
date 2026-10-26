/**
 * 「AI 整理成日记」的弹窗。
 *
 * 它只干一件事：拿到这一天的素材 → 让 AI 写一篇草稿 → 给用户改 → 把最终文本交回去。
 * 「新建一条日记」那个动作不在这里，交给日记页做，这样弹窗不用知道数据怎么存。
 */
import { GHOST_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryStamp, FinanceEntry, HealthIntake } from '@/core/db/schema'
import { formatDate, shiftDay, weekdayKey } from '@/core/utils/dateKey'
import { dayInfo, exportAllData } from '@/features/diary/diaryRepo'
import { parseWeather, weatherIcons, weatherText } from '@/features/diary/weather'
import { loadAiConfig } from './aiConfig'
import {
  COMPOSE_STYLES,
  buildComposeSystemPrompt,
  buildComposeUserPrompt,
  buildHistoryDays,
  buildStyleSamples,
  composeDiary,
} from './aiCompose'
import type { ComposeContext, ComposeSource, ComposeStyle } from './aiCompose'
import { reviseText } from './aiRevision'
import type { RevisionSeed, RevisionTurn } from './aiRevision'
import RevisionChat from './RevisionChat'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import Dropdown from '@/shared/ui/Dropdown'
import { FIELD, INPUT_NARROW } from '@/shared/ui/inputStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'

type HistoryChoice = 'fourteen' | 'two' | 'today' | 'custom'

const SOURCE_OPTIONS: { id: ComposeSource; labelKey: MessageKey }[] = [
  { id: 'stamps', labelKey: 'ai.sourceStamps' },
  { id: 'health', labelKey: 'ai.sourceHealth' },
  { id: 'finance', labelKey: 'ai.sourceFinance' },
]

const HISTORY_OPTIONS: { id: HistoryChoice; labelKey: MessageKey }[] = [
  { id: 'fourteen', labelKey: 'ai.historyFourteen' },
  { id: 'two', labelKey: 'ai.historyTwo' },
  { id: 'today', labelKey: 'ai.historyToday' },
  { id: 'custom', labelKey: 'ai.historyCustom' },
]

const CHIP = 'px-2.5 py-1 text-xs'

const EMPTY_INTAKES: HealthIntake[] = []
const EMPTY_FINANCE: FinanceEntry[] = []

export default function AiComposeDialog({
  dateKey,
  stamps,
  onConfirm,
  onCancel,
}: {
  dateKey: string
  stamps: DiaryStamp[]
  onConfirm: (content: string) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [config] = useState(loadAiConfig)
  const day = useLiveQuery(() => dayInfo(dateKey), [dateKey])
  /** 摄入和收支不在日记页手里，打开弹窗时整库读一次，够当天和历史用 */
  const snapshot = useLiveQuery(() => exportAllData(), [dateKey])

  const dayIntakes = (snapshot?.intakes ?? EMPTY_INTAKES).filter(
    (item) => item.dateKey === dateKey && item.deletedAt === null,
  )
  const dayFinance = (snapshot?.finance ?? EMPTY_FINANCE).filter(
    (item) => item.dateKey === dateKey && item.deletedAt === null,
  )

  const counts: Record<ComposeSource, number> = {
    stamps: stamps.length,
    health: dayIntakes.length,
    finance: dayFinance.length,
  }

  /** 有内容的来源默认全勾上；用户一旦点过，就按用户的选法来 */
  const [pickedSources, setPickedSources] = useState<ComposeSource[] | null>(null)
  const availableSources = SOURCE_OPTIONS.map((item) => item.id).filter((id) => counts[id] > 0)
  const sources = pickedSources ?? availableSources

  const [style, setStyle] = useState<ComposeStyle>('natural')
  const [historyChoice, setHistoryChoice] = useState<HistoryChoice>('fourteen')
  const [customFrom, setCustomFrom] = useState(shiftDay(dateKey, -14))
  const [customTo, setCustomTo] = useState(shiftDay(dateKey, -1))
  const [text, setText] = useState('')
  /** 上一轮生成出来的原文，用来判断草稿有没有被手改过 */
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ms, setMs] = useState(0)
  /** 打开弹窗不直接请求，等用户点「开始生成」——打开即烧 token 不划算 */
  const [requested, setRequested] = useState(false)
  /** 生成之后的改稿对话：第一次请求的固定输入，以及每一轮的要求与结果 */
  const [seed, setSeed] = useState<RevisionSeed | null>(null)
  const [turns, setTurns] = useState<RevisionTurn[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState('')

  const states = parseWeather(day?.weather)
  const hasMaterial = sources.some((source) => counts[source] > 0)
  /** 有素材、但用户把来源全取消了：跟「这天本来就没东西」是两种提示 */
  const noSourcePicked = availableSources.length > 0 && sources.length === 0
  const customInvalid =
    historyChoice === 'custom' && customTo < customFrom
  const yesterday = shiftDay(dateKey, -1)

  function toggleSource(source: ComposeSource) {
    setPickedSources(
      sources.includes(source)
        ? sources.filter((item) => item !== source)
        : [...sources, source],
    )
  }

  function historyWindow(): { from: string; to: string } | null {
    if (historyChoice === 'today') return null
    if (historyChoice === 'two') return { from: shiftDay(dateKey, -2), to: yesterday }
    if (historyChoice === 'fourteen') return { from: shiftDay(dateKey, -14), to: yesterday }
    return { from: customFrom, to: customTo > yesterday ? yesterday : customTo }
  }

  async function generate(next: ComposeStyle) {
    if (!hasMaterial) return
    setRequested(true)
    setLoading(true)
    setError('')
    setSeed(null)
    setTurns([])
    setChatError('')
    const data = await exportAllData()
    const window = historyWindow()
    const context: ComposeContext = {
      dateKey,
      today: {
        weather: day?.weather ?? null,
        stamps,
        intakes: data.intakes.filter(
          (item) => item.dateKey === dateKey && item.deletedAt === null,
        ),
        finance: data.finance.filter(
          (item) => item.dateKey === dateKey && item.deletedAt === null,
        ),
      },
      sources,
      history: window ? buildHistoryDays(data, window.from, window.to, dateKey) : [],
      styleSamples: buildStyleSamples(
        data.entries.filter((item) => item.deletedAt === null && item.dateKey < dateKey),
      ),
    }
    const result = await composeDiary(config, { ...context, style: next })
    setLoading(false)
    setMs(result.ms)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setText(result.content)
    setOrigin(result.content)
    // 改稿沿用这次的素材与口气，用户后面提要求时不再重复读库、拼提示词
    setSeed({
      systemPrompt: buildComposeSystemPrompt(next),
      seedUser: buildComposeUserPrompt(context),
    })
  }

  /** 按用户这一轮的要求改稿，结果直接顶掉当前草稿，不满意可以接着提 */
  async function handleRevise(request: string) {
    if (!seed) return
    setChatBusy(true)
    setChatError('')
    const result = await reviseText(config, { ...seed, draft: text, turns, request }, 0.5)
    setChatBusy(false)
    if (!result.ok) {
      setChatError(t('ai.chatFailed', { message: result.error }))
      return
    }
    setTurns([...turns, { request, content: result.content }])
    setText(result.content)
    setOrigin(result.content)
    setMs(result.ms)
  }

  const edited = text !== origin

  return (
    <Modal
      size="lg"
      label={t('ai.composeTitle')}
      onClose={onCancel}
      // 草稿可能比屏幕高，让面板自己滚，遮罩层始终铺满
      panelClassName="max-h-[85vh] overflow-y-auto"
    >
      <div className="text-sm font-medium">{t('ai.composeTitle')}</div>
      <p className="mt-1 text-xs text-muted">
        {t('ai.composeDesc', {
          date: formatDate(dateKey, t),
          weekday: t(weekdayKey(dateKey)),
          weather:
            states.length > 0
              ? t('ai.composeWeather', {
                  icons: weatherIcons(states),
                  label: weatherText(states, t),
                })
              : '',
        })}
        <span className="text-fg">{t('ai.composeKeepStamps')}</span>
      </p>

      <div className="mt-3 text-xs text-muted">{t('ai.sources')}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {SOURCE_OPTIONS.map((option) => {
          const active = sources.includes(option.id)
          const count = counts[option.id]
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              disabled={count === 0}
              onClick={() => toggleSource(option.id)}
              className={`${choiceTile(active)} ${CHIP} disabled:opacity-40`}
            >
              {t(option.labelKey)}
              <span className="ml-1 opacity-70">
                {count > 0 ? t('ai.sourceCount', { n: count }) : t('ai.sourceEmpty')}
              </span>
            </button>
          )
        })}
      </div>
      {availableSources.length === 0 && (
        <p className="mt-1 text-xs text-danger">{t('ai.noMaterial')}</p>
      )}
      {noSourcePicked && <p className="mt-1 text-xs text-danger">{t('ai.selectSource')}</p>}

      <div className="mt-3 text-xs text-muted">{t('ai.history')}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {HISTORY_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={historyChoice === option.id}
            onClick={() => setHistoryChoice(option.id)}
            className={`${choiceTile(historyChoice === option.id)} ${CHIP}`}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
      {historyChoice === 'custom' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <label className="flex items-center gap-1">
            {t('ai.historyFrom')}
            <input
              type="date"
              value={customFrom}
              max={customTo < yesterday ? customTo : yesterday}
              onChange={(event) => setCustomFrom(event.target.value)}
              className={INPUT_NARROW}
            />
          </label>
          <label className="flex items-center gap-1">
            {t('ai.historyTo')}
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={yesterday}
              onChange={(event) => setCustomTo(event.target.value)}
              className={INPUT_NARROW}
            />
          </label>
        </div>
      )}
      {customInvalid && <p className="mt-1 text-xs text-danger">{t('ai.historyInvalid')}</p>}
      <p className="mt-1 text-xs text-muted">{t('ai.historyHint')}</p>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-muted">{t('ai.tone')}</span>
        <Dropdown
          label={t(COMPOSE_STYLES.find((item) => item.id === style)!.labelKey)}
          buttonClassName="rounded-lg border border-line px-3 py-1 text-xs text-fg hover:text-brand transition-colors"
          items={COMPOSE_STYLES.map((item) => ({
            label: t(item.labelKey),
            onSelect: () => {
              if (item.id === style) return
              setStyle(item.id)
              // 草稿没被改过、也还没开始对话，就顺手按新口气重写一遍；
              // 已经聊过几轮时保留当前版本，只让后面的改稿换一套口气规矩
              if (requested && !edited && turns.length === 0) {
                void generate(item.id)
              } else if (seed) {
                setSeed({ ...seed, systemPrompt: buildComposeSystemPrompt(item.id) })
              }
            },
          }))}
        />
        {edited && <span className="text-xs text-muted">{t('ai.draftEdited')}</span>}
      </div>

      <div className="mt-3">
        {loading && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            {t('ai.writing')}
          </p>
        )}

        {!loading && error !== '' && (
          <div className="rounded-lg border border-danger px-3 py-2 text-xs text-danger">
            {error}
            <Link to="/me/agent/ai" className="ml-2 underline">
              {t('ai.goCheckSettings')}
            </Link>
          </div>
        )}

        {!loading && error === '' && text !== '' && (
          <>
            <textarea
              value={text}
              spellCheck={false}
              onChange={(event) => setText(event.target.value)}
              className={`font-hand min-h-56 w-full resize-y leading-6 ${FIELD}`}
            />
            <RevisionChat
              turns={turns}
              busy={chatBusy}
              error={chatError}
              onSend={(request) => void handleRevise(request)}
            />
          </>
        )}

        {!loading && error === '' && text === '' && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            {requested ? t('ai.nothingYet') : t('ai.composeStartHint')}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {ms > 0 && text !== '' ? t('ai.writeTime', { seconds: (ms / 1000).toFixed(1) }) : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || chatBusy || !hasMaterial || customInvalid}
            onClick={() => void generate(style)}
            className={`${GHOST_BUTTON} disabled:opacity-40`}
          >
            {!requested ? t('ai.composeStart') : text === '' ? t('ai.retry') : t('ai.regenerate')}
          </button>
          <button type="button" onClick={onCancel} className={GHOST_BUTTON}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={loading || chatBusy || text.trim() === ''}
            onClick={() => onConfirm(text.trim())}
            className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            {t('ai.writeDiary')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
