import { useEffect, useState } from 'react'
import { useTheme } from '../../app/providers/ThemeProvider'
import { ACCENT_COLORS, accentLabel } from '../../app/theme'
import { MASCOT_SHAPES, MASCOT_SIZES, useBall } from '../../app/providers/BallProvider'
import { Mascot } from '../assistant/Mascot'
import { desktopBridge } from '../../core/desktop'
import type { DesktopBridge } from '../../core/desktop'
import SettingCard, { SettingBadge, SettingGroup } from '../../shared/ui/SettingCard'
import { choiceTile, OUTLINE_BUTTON } from '../../shared/ui/buttonStyles'
import AiSection from '../ai/AiSection'

/** 桌面端的窗口尺寸预设 */
const WINDOW_PRESETS = [
  { label: '紧凑', width: 480, height: 820 },
  { label: '标准', width: 1000, height: 760 },
  { label: '宽屏', width: 1280, height: 800 },
]

/** 明暗主题的标记：光看两个字不容易一眼分清 */
const THEME_MARK: Record<string, string> = { deep: '🌌', light: '☀️' }

const FIELD =
  'ml-2 w-20 rounded-lg border border-line bg-surface-2 px-2 py-1 text-sm text-fg outline-none'

/** 卡片右上角那个小圆点：一眼看出当前主题色是什么 */
function AccentDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

/** 只在桌面程序里出现：浏览器里改不了窗口大小，所以整块直接不渲染 */
function WindowSizeCard() {
  // 桌面壳的预加载脚本会注入它，浏览器里是 undefined
  const shell: DesktopBridge | undefined = desktopBridge()
  const [current, setCurrent] = useState<{ width: number; height: number } | null>(null)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')

  useEffect(() => {
    if (!shell) return
    void shell.getSize().then((size) => {
      if (!size) return
      setCurrent(size)
      setWidth(String(size.width))
      setHeight(String(size.height))
    })
  }, [shell])

  if (!shell) return null
  // 收成一个非 undefined 的常量：闭包里 TS 不认上面那句 if 的判断
  const bridge = shell

  async function apply(nextWidth: number, nextHeight: number) {
    const changed = await bridge.setSize(nextWidth, nextHeight)
    if (!changed) return
    const size = await bridge.getSize()
    if (size) setCurrent(size)
  }

  return (
    <SettingCard
      title="窗口尺寸"
      description="只在桌面程序里有这一项；浏览器里的窗口由浏览器自己决定。"
      badge={
        <SettingBadge>
          {current ? `${current.width}×${current.height}` : '读取中…'}
        </SettingBadge>
      }
    >
      <SettingGroup label="预设">
        <div className="grid grid-cols-3 gap-2">
          {WINDOW_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setWidth(String(preset.width))
                setHeight(String(preset.height))
                void apply(preset.width, preset.height)
              }}
              className={choiceTile(
                current?.width === preset.width && current?.height === preset.height,
                'flex flex-col items-center gap-0.5 py-2',
              )}
            >
              <span>{preset.label}</span>
              <span className="font-mono text-xs text-muted">
                {preset.width}×{preset.height}
              </span>
            </button>
          ))}
        </div>
      </SettingGroup>

      <SettingGroup label="自己填">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            宽
            <input value={width} onChange={(event) => setWidth(event.target.value)} className={FIELD} />
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
            className={OUTLINE_BUTTON}
          >
            应用
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">最小 420×560；也可以直接拖窗口边框改大小。</p>
      </SettingGroup>
    </SettingCard>
  )
}

export default function SettingsPage() {
  const { theme, setTheme, themes, accent, setAccent } = useTheme()
  const { prefs, setPrefs } = useBall()

  const themeLabel = themes.find((item) => item.id === theme)?.label ?? theme
  const shapeLabel = MASCOT_SHAPES.find((item) => item.id === prefs.shape)?.label ?? prefs.shape
  const sizeLabel = MASCOT_SIZES.find((item) => item.id === prefs.size)?.label ?? prefs.size

  return (
    <div className="mx-auto w-full max-w-md p-4">
      <h1 className="text-lg font-medium">设置</h1>

      <div className="mt-6 space-y-4">
        <SettingCard
          title="外观主题"
          description="换主题色的时候，导航背景、强调元素和悬浮球的颜色会一起变。"
          badge={
            <SettingBadge>
              {themeLabel} · {accentLabel(accent)}
              <AccentDot color={accent} />
            </SettingBadge>
          }
        >
          <SettingGroup label="明暗">
            <div className="grid grid-cols-2 gap-2">
              {themes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id)}
                  className={choiceTile(theme === item.id, 'flex items-center gap-2 px-3 py-2')}
                >
                  <span aria-hidden="true">{THEME_MARK[item.id] ?? '●'}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </SettingGroup>

          <SettingGroup label="主题色">
            <div className="grid grid-cols-6 gap-2">
              {ACCENT_COLORS.map(({ value, label }) => {
                const active = accent === value
                return (
                  <button
                    key={value}
                    type="button"
                    title={`${label} ${value}`}
                    aria-label={`主题色 ${label}`}
                    onClick={() => setAccent(value)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      style={{ backgroundColor: value }}
                      className={[
                        // 描边必须留着：色块自己不发亮，浅色模式下没边就跟卡片糊成一片
                        'grid h-9 w-full place-items-center rounded-lg border border-line transition-all',
                        active
                          ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface'
                          : 'hover:opacity-80',
                      ].join(' ')}
                    >
                      {/* 色块本身颜色不定，所以勾用一个半透明黑底：深浅模式、明暗色块都压得住 */}
                      {active && (
                        <span
                          aria-hidden="true"
                          className="grid h-5 w-5 place-items-center rounded-full bg-black/35 text-xs text-white"
                        >
                          ✓
                        </span>
                      )}
                    </span>
                    {/* 名字放在色块下面：色值没法念，名字才能说清"我用的是哪个" */}
                    <span className={active ? 'text-xs text-brand' : 'text-xs text-muted'}>
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </SettingGroup>
        </SettingCard>

        <SettingCard
          title="悬浮球"
          description="球可以拖着挪位；长时间不动，它会自己贴到屏幕边上只露半边。"
          badge={
            <SettingBadge>
              {shapeLabel} · {sizeLabel}
            </SettingBadge>
          }
        >
          <SettingGroup label="形象">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MASCOT_SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  onClick={() => setPrefs({ shape: shape.id })}
                  className={choiceTile(
                    prefs.shape === shape.id,
                    'flex flex-col items-center gap-1 py-2',
                  )}
                >
                  <Mascot shape={shape.id} color={accent} size={30} />
                  <span className="text-xs">{shape.label}</span>
                </button>
              ))}
            </div>
          </SettingGroup>

          <SettingGroup label="大小">
            <div className="grid grid-cols-3 gap-2">
              {MASCOT_SIZES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPrefs({ size: item.id })}
                  className={choiceTile(prefs.size === item.id, 'py-2')}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </SettingGroup>
        </SettingCard>

        <AiSection />

        <WindowSizeCard />
      </div>
    </div>
  )
}
