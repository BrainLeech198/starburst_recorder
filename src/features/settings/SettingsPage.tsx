import { useTheme } from '../../app/providers/ThemeProvider'
import { ACCENT_COLORS } from '../../app/theme'
import { MASCOT_SHAPES, MASCOT_SIZES, useBall } from '../../app/providers/BallProvider'
import { Mascot } from '../assistant/Mascot'

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
    </div>
  )
}
