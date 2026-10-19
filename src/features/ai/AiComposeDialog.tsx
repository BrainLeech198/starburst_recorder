/**
 * 「AI 整理成日记」的弹窗。
 *
 * 它只干一件事：拿到这一天的随记 → 让 AI 写一篇草稿 → 给用户改 → 把最终文本交回去。
 * 「新建一条日记」那个动作不在这里，交给日记页做，这样弹窗不用知道数据怎么存。
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import type { DiaryStamp } from '../../core/db/schema'
import { formatDateCn, weekdayLabel } from '../../core/utils/dateKey'
import { dayInfo } from '../diary/diaryRepo'
import { parseWeather, weatherIcons, weatherLabel } from '../diary/weather'
import { loadAiConfig } from './aiConfig'
import { COMPOSE_STYLES, composeDiary } from './aiCompose'
import type { ComposeStyle } from './aiCompose'

/** 腔调小按钮：选中就是主题色描边，跟其他弹窗里的一致 */
const styleClass = (active: boolean) =>
  [
    'rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40',
    active ? 'border-brand text-brand' : 'border-line text-muted hover:text-fg',
  ].join(' ')

const FOOTER_BUTTON =
  'rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg'

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
  const [config] = useState(loadAiConfig)
  const day = useLiveQuery(() => dayInfo(dateKey), [dateKey])

  const [style, setStyle] = useState<ComposeStyle>('natural')
  const [text, setText] = useState('')
  /** 上一轮生成出来的原文，用来判断草稿有没有被手改过 */
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ms, setMs] = useState(0)
  /** 开发时 StrictMode 会把 effect 跑两遍，用它挡住第二次请求，免得白花 token */
  const started = useRef(false)

  const states = parseWeather(day?.weather)

  async function generate(next: ComposeStyle) {
    setLoading(true)
    setError('')
    const result = await composeDiary(config, {
      dateKey,
      weather: day?.weather,
      stamps,
      style: next,
    })
    setLoading(false)
    setMs(result.ms)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setText(result.content)
    setOrigin(result.content)
  }

  // 打开就把第一稿写出来，省得用户再点一次
  useEffect(() => {
    if (started.current) return
    started.current = true
    void generate(style)
  }, [generate, style])

  const edited = text !== origin

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-sm font-medium">把今天的随记整理成日记</div>
        <p className="mt-1 text-xs text-muted">
          用 {formatDateCn(dateKey)} {weekdayLabel(dateKey)} 的 {stamps.length} 笔随记
          {states.length > 0 ? `（天气：${weatherIcons(states)} ${weatherLabel(states)}）` : ''}
          ，让 AI 写成一篇日记。这只是一份草稿，你点了「写入日记」才会存进去，
          <span className="text-fg">随记原文一条不动</span>。
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">口气</span>
          {COMPOSE_STYLES.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={loading}
              onClick={() => {
                if (item.id === style) return
                setStyle(item.id)
                // 草稿没被改过就顺手按新口气重写一遍，改过就先留着，免得覆盖你的修改
                if (!edited) void generate(item.id)
              }}
              className={styleClass(style === item.id)}
            >
              {item.label}
            </button>
          ))}
          {edited && <span className="text-xs text-muted">草稿改过了，换口气要点「重新生成」</span>}
        </div>

        <div className="mt-3">
          {loading && (
            <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              AI 正在写…（一般几秒，随记多会久一点）
            </p>
          )}

          {!loading && error !== '' && (
            <div className="rounded-lg border border-danger px-3 py-2 text-xs text-danger">
              {error}
              <Link to="/settings" className="ml-2 underline">
                去设置检查
              </Link>
            </div>
          )}

          {!loading && error === '' && text !== '' && (
            <textarea
              value={text}
              spellCheck={false}
              onChange={(event) => setText(event.target.value)}
              className="font-hand min-h-56 w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm leading-6 text-fg outline-none focus:border-brand"
            />
          )}

          {!loading && error === '' && text === '' && (
            <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              还没写出东西。
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {ms > 0 && text !== '' ? `写完用了 ${(ms / 1000).toFixed(1)} 秒` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void generate(style)}
              className={`${FOOTER_BUTTON} disabled:opacity-40`}
            >
              {text === '' ? '再试一次' : '重新生成'}
            </button>
            <button type="button" onClick={onCancel} className={FOOTER_BUTTON}>
              取消
            </button>
            <button
              type="button"
              disabled={loading || text.trim() === ''}
              onClick={() => onConfirm(text.trim())}
              className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors disabled:opacity-40"
            >
              写入日记
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
