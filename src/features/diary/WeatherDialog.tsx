import { useState } from 'react'
import { WEATHER_PRESETS, joinWeather, parseWeather, weatherIcon } from './weather'
import { askWeather, loadWeatherPlace, saveWeatherPlace } from './weatherQuery'
import type { DayWeather } from './weatherQuery'
import Modal from '../../shared/ui/Modal'

export default function WeatherDialog({
  dateKey,
  value,
  onConfirm,
  onCancel,
}: {
  /** 查的是哪一天，格式 YYYY-MM-DD */
  dateKey: string
  value: string
  onConfirm: (weather: string) => void
  onCancel: () => void
}) {
  const [states, setStates] = useState<string[]>(() => parseWeather(value))
  /** 地点是自由文本，记住上次写的，下次打开不用重敲 */
  const [place, setPlace] = useState(loadWeatherPlace)
  const [busy, setBusy] = useState(false)
  const [candidate, setCandidate] = useState<DayWeather | null>(null)
  const [queryError, setQueryError] = useState('')

  /** 点「查天气」：先让 AI 联网查，AI 查不到会自动换程序兜底 */
  async function handleQuery() {
    setCandidate(null)
    setQueryError('')
    setBusy(true)
    try {
      const next = await askWeather(place, dateKey)
      saveWeatherPlace(place)
      setCandidate(next)
    } catch (error) {
      setQueryError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 查到之后要不要留：点「填上」才写进上面的天气链，点「不用」什么都不动 */
  function applyCandidate() {
    if (!candidate) return
    setStates([candidate.state])
    setCandidate(null)
  }

  return (
    <Modal size="xs" onClose={onCancel}>
      <div className="text-sm font-medium">天气</div>

      {/* 上面是已经排好的链条：点标签上的 ✕ 永远是删掉这一个 */}
      <div className="mt-3 min-h-11 rounded-lg border border-line bg-surface-2 px-3 py-2">
        {states.length === 0 ? (
          <span className="text-xs text-muted">还没选，下面点一下加一个</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {states.map((state, index) => (
              <span
                key={`${state}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-brand px-2 py-0.5 text-xs text-brand"
              >
                <span aria-hidden="true">{weatherIcon(state) || '·'}</span>
                {state}
                <button
                  type="button"
                  onClick={() => setStates(states.filter((_, i) => i !== index))}
                  title="删掉这一个"
                  className="ml-0.5 text-muted transition-colors hover:text-danger"
                >
                  <span aria-hidden="true">✕</span>
                  <span className="sr-only">删掉{state}</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 下面是天气按钮：点一下永远是追加到末尾 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {WEATHER_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setStates([...states, preset])}
            className="rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-brand hover:text-brand"
          >
            <span aria-hidden="true">{weatherIcon(preset)}</span> {preset}
          </button>
        ))}
      </div>

      {/* 查天气：自由输入地点，AI 联网查，结果要不要留由用户点 */}
      <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
        <label className="block">
          <span className="text-muted">查天气的地点</span>
          <input
            value={place}
            spellCheck={false}
            placeholder="自由输入，比如 杭州、洛杉矶、京都"
            aria-label="查天气的地点"
            onChange={(event) => setPlace(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleQuery()
              }
            }}
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-fg outline-none focus:border-brand"
          />
        </label>
        <p className="mt-1 text-[11px] text-muted">
          先让 AI 联网查，查不到会自动用天气接口兜底。
        </p>

        {busy && <p className="mt-2 text-muted">正在查这天的天气…</p>}

        {queryError && <p className="mt-2 text-danger">{queryError}</p>}

        {candidate && (
          <div className="mt-2 rounded-md border border-brand/40 bg-surface px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-fg">
                查到：{weatherIcon(candidate.state) || '·'} {candidate.state}
              </span>
              {candidate.source === 'ai' ? (
                <span className="text-muted">AI 联网</span>
              ) : (
                candidate.place && (
                  <span className="min-w-0 truncate text-muted" title={candidate.place}>
                    程序兜底 · {candidate.place}
                  </span>
                )
              )}
              <button
                type="button"
                onClick={applyCandidate}
                className="text-brand transition-opacity hover:opacity-80"
              >
                填上
              </button>
              <button
                type="button"
                onClick={() => setCandidate(null)}
                className="text-muted transition-colors hover:text-fg"
              >
                不用
              </button>
            </div>
            {states.length > 0 && (
              <p className="mt-1 text-muted">「填上」会替换上面已经选好的天气。</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleQuery()}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          查天气
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onConfirm(joinWeather(states))}
          className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors"
        >
          确认
        </button>
      </div>
    </Modal>
  )
}
