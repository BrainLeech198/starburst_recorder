import { useState } from 'react'
import { WEATHER_PRESETS, joinWeather, parseWeather, weatherIcon } from './weather'

export default function WeatherDialog({
  value,
  onConfirm,
  onCancel,
}: {
  value: string
  onConfirm: (weather: string) => void
  onCancel: () => void
}) {
  const [states, setStates] = useState<string[]>(() => parseWeather(value))
  const [hint, setHint] = useState('')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-line bg-surface p-4"
        onClick={(event) => event.stopPropagation()}
      >
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

        {hint && <p className="mt-3 text-xs text-muted">{hint}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setHint('天气查询还没接入，会在第二步做。现在可以先手动选。')}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
          >
            查询
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
      </div>
    </div>
  )
}
