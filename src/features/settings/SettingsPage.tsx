import { useEffect, useState } from 'react'
import { useTheme } from '../../app/providers/ThemeProvider'
import { ACCENT_COLORS } from '../../app/theme'
import { MASCOT_SHAPES, MASCOT_SIZES, useBall } from '../../app/providers/BallProvider'
import { Mascot } from '../assistant/Mascot'

/** 桌面壳（Electron）的预加载脚本会注入这个对象，浏览器里它是 undefined */
declare global {
  interface Window {
    desktop?: {
      isDesktop: boolean
      setSize: (width: number, height: number) => Promise<boolean>
      getSize: () => Promise<{ width: number; height: number } | null>
    }
  }
}

/** 桌面端的窗口尺寸预设 */
const WINDOW_PRESETS = [
  { label: '紧凑', width: 480, height: 820 },
  { label: '标准', width: 1000, height: 760 },
  { label: '宽屏', width: 1280, height: 800 },
]

const FIELD =
  'ml-2 w-20 rounded-lg border border-line bg-surface-2 px-2 py-1 text-sm text-fg outline-none'

/** 只在桌面程序里出现：浏览器里改不了窗口大小，所以整块直接不渲染 */
function WindowSizeSection() {
  const desktop = window.desktop
  const [current, setCurrent] = useState<{ width: number; height: number } | null>(null)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')

  useEffect(() => {
    if (!desktop) return
    void desktop.getSize().then((size) => {
      if (!size) return
      setCurrent(size)
      setWidth(String(size.width))
      setHeight(String(size.height))
    })
  }, [desktop])

  if (!desktop) return null
  const shell = desktop

  async function apply(nextWidth: number, nextHeight: number) {
    const changed = await shell.setSize(nextWidth, nextHeight)
    if (!changed) return
    const size = await shell.getSize()
    if (size) setCurrent(size)
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm text-muted">窗口尺寸</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {WINDOW_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              setWidth(String(preset.width))
              setHeight(String(preset.height))
              void apply(preset.width, preset.height)
            }}
            className="rounded-lg border border-line px-3 py-2 text-sm text-muted transition-colors hover:border-brand hover:text-fg"
          >
            {preset.label}
            <span className="ml-2 text-xs">
              {preset.width}×{preset.height}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          宽
          <input
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            className={FIELD}
          />
        </label>
        <label className="text-xs text-muted">
          高
          <input
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            className={FIELD}
          />
        </label>
        <button
          type="button"
          onClick={() => void apply(Number(width), Number(height))}
          className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors"
        >
          应用
        </button>
      </div>

      <p className="mt-2 text-xs text-muted">
        当前 {current ? `${current.width}×${current.height}` : '读取中…'}，最小 420×560。
        也可以直接拖窗口边框改大小。
      </p>
    </section>
  )
}

const swatchClass = (selected: boolean) =>
  [
    'h-8 w-8 rounded-full border-2 transition-all',
    selected ? 'scale-110 border-fg' : 'border-transparent',
  ].join(' ')

export default function SettingsPage() {
  const { theme, setTheme, themes, accent, setAccent } = useTheme()
  const { prefs, setPrefs } = useBall()

  return (
    <div className="mx-auto w-full max-w-md p-4">
      <h1 className="text-lg font-medium">设置</h1>

      <section className="mt-6">
        <h2 className="text-sm text-muted">外观主题</h2>
        <div className="mt-3 flex gap-3">
          {themes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTheme(item.id)}
              className={[
                'rounded-lg border px-4 py-2 text-sm transition-colors',
                theme === item.id
                  ? 'border-brand text-brand'
                  : 'border-line text-muted hover:text-fg',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <div className="text-xs text-muted">主题色</div>
          <div className="mt-2 flex gap-2">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => setAccent(color)}
                style={{ backgroundColor: color }}
                className={swatchClass(accent === color)}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            一处设置，同时决定导航背景、高亮强调和悬浮球的颜色。
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm text-muted">悬浮球</h2>

        <div className="mt-3">
          <div className="text-xs text-muted">形象</div>
          <div className="mt-2 flex gap-3">
            {MASCOT_SHAPES.map((shape) => (
              <button
                key={shape.id}
                type="button"
                onClick={() => setPrefs({ shape: shape.id })}
                className={[
                  'flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors',
                  prefs.shape === shape.id ? 'border-brand' : 'border-line hover:border-muted',
                ].join(' ')}
              >
                <Mascot shape={shape.id} color={accent} size={32} />
                <span className="text-xs text-muted">{shape.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs text-muted">大小</div>
          <div className="mt-2 flex gap-3">
            {MASCOT_SIZES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPrefs({ size: item.id })}
                className={[
                  'rounded-lg border px-4 py-2 text-sm transition-colors',
                  prefs.size === item.id
                    ? 'border-brand text-brand'
                    : 'border-line text-muted hover:text-fg',
                ].join(' ')}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-3 text-xs text-muted">球的位置可以拖着挪，位置会自动记住。</p>
      </section>

      <WindowSizeSection />
    </div>
  )
}
