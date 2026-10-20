/**
 * 「窗口尺寸」卡片：只在桌面程序里出现（浏览器里窗口大小由浏览器自己决定，不给假入口）。
 *
 * 它原来自成一页，现在并进「主题」页当第二张卡——窗口大小也算"看起来怎么样"的一部分，
 * 而且它是一个桌面端专属的小东西，不值得在菜单里单占一行。
 */
import { useEffect, useState } from 'react'
import SettingCard, { SettingBadge, SettingGroup } from '../../shared/ui/SettingCard'
import { choiceTile, OUTLINE_BUTTON } from '../../shared/ui/buttonStyles'
import { INPUT_NARROW } from '../../shared/ui/inputStyles'
import { desktopBridge } from '../../core/desktop'
import type { DesktopBridge } from '../../core/desktop'

/** 桌面端的窗口尺寸预设 */
const WINDOW_PRESETS = [
  { label: '紧凑', width: 480, height: 820 },
  { label: '标准', width: 1000, height: 760 },
  { label: '宽屏', width: 1280, height: 800 },
]

const FIELD_CLASS = `ml-2 w-20 ${INPUT_NARROW}`

export function WindowCard() {
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
      description="只在桌面程序里有这一项；也可以直接拖窗口边框改大小。"
      badge={
        <SettingBadge>{current ? `${current.width}×${current.height}` : '读取中…'}</SettingBadge>
      }
    >
      <SettingGroup label="预设" first>
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
            <input
              value={width}
              onChange={(event) => setWidth(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <label className="text-xs text-muted">
            高
            <input
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              className={FIELD_CLASS}
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
        <p className="mt-2 text-xs text-muted">最小 420×560。</p>
      </SettingGroup>
    </SettingCard>
  )
}
