import { useState } from 'react'

const PRESETS = ['晴', '雨', '阴', '多云', '雪', '风']

export default function WeatherDialog({
  value,
  onConfirm,
  onCancel,
}: {
  value: string
  onConfirm: (weather: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(value)
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

        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="填写或选一个"
          className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg outline-none placeholder:text-muted"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setText(preset)}
              className={[
                'rounded-full border px-3 py-1 text-xs transition-colors',
                text === preset
                  ? 'border-brand text-brand'
                  : 'border-line text-muted hover:text-fg',
              ].join(' ')}
            >
              {preset}
            </button>
          ))}
        </div>

        {hint && <p className="mt-3 text-xs text-muted">{hint}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setHint('天气查询还没接入，会在第二步做。现在可以先手动填。')}
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
            onClick={() => onConfirm(text.trim())}
            className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
