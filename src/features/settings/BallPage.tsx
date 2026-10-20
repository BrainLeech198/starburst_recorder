/**
 * 「悬浮球」二级页：形象 + 大小。
 *
 * 形象格子里直接画真的 Mascot，用的是当前主题色——所见即所得，不用想象。
 */
import { MASCOT_SHAPES, MASCOT_SIZES, useBall } from '../../app/providers/BallProvider'
import { useTheme } from '../../app/providers/ThemeProvider'
import { Mascot } from '../assistant/Mascot'
import SettingCard, { SettingBadge, SettingGroup } from '../../shared/ui/SettingCard'
import PageShell from '../../shared/ui/PageShell'
import { choiceTile } from '../../shared/ui/buttonStyles'

export default function BallPage() {
  const { prefs, setPrefs } = useBall()
  const { accent } = useTheme()

  const shapeLabel = MASCOT_SHAPES.find((item) => item.id === prefs.shape)?.label ?? prefs.shape
  const sizeLabel = MASCOT_SIZES.find((item) => item.id === prefs.size)?.label ?? prefs.size

  return (
    <PageShell
      title="悬浮球"
      backTo="/me/agent"
      backLabel="助手"
      badge={
        <SettingBadge>
          {shapeLabel} · {sizeLabel}
        </SettingBadge>
      }
      description="球可以拖着挪位；长时间不动，它会自己贴到屏幕边上只露半边。现在助手还没接通，所以悬浮球默认不显示——这里的设置先存着。"
    >
      <SettingCard>
        <SettingGroup label="形象" first>
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
    </PageShell>
  )
}
