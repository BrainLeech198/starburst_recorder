/**
 * 快速记一笔：桌面版托盘 / 全局快捷键唤出的独立小窗。
 *
 * 这里只做一件事——写一笔随记，写到「今天」这一天，然后关窗。
 * 不读天气、不选日期、不进编辑页，任何多一步的东西都会让人不愿意用它。
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { desktopBridge } from '@/platform/desktop'
import { formatClock, todayKey } from '@/core/utils/dateKey'
import { addStamp, updateStamp } from './diaryRepo'

/** 无边框窗口：标题条整块可拖动，里面的按钮要单独取消拖动 */
const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

export default function QuickCapturePage() {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const bridge = desktopBridge()
  // 打开那一刻的时刻，只用来在标题旁标一下时间，不必逐秒刷新
  const [clock] = useState(() => formatClock(Date.now()))

  function close() {
    void bridge?.quick.close()
  }

  async function save() {
    const content = text.trim()
    if (content === '' || busy) return
    setBusy(true)
    try {
      const stamp = await addStamp(todayKey())
      await updateStamp(stamp.id, { content })
      // 主窗口还开着的时候让它自己刷新，不然要等下次重进才有这条
      bridge?.quick.notifyChange()
    } finally {
      setBusy(false)
    }
    close()
  }

  // 打字时按 Esc 关掉，按 Ctrl/Cmd+Enter 直接存
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    areaRef.current?.focus()
  }, [])

  return (
    <div className="flex h-full flex-col bg-surface text-fg">
      <header
        style={DRAG}
        className="flex items-center justify-between border-b border-line px-4 py-2.5"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{t('quick.title')}</span>
          <span className="text-xs text-muted">{clock}</span>
        </div>
        <button
          type="button"
          style={NO_DRAG}
          onClick={close}
          className="rounded px-2 py-0.5 text-xs text-muted transition-colors hover:text-fg"
        >
          {t('quick.close')}
        </button>
      </header>

      <textarea
        ref={areaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('quick.placeholder')}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-7 text-fg outline-none placeholder:text-muted"
      />

      <footer className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="text-xs text-muted">{t('quick.hint')}</span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || text.trim() === ''}
          className="rounded-lg bg-brand px-3 py-1 text-sm text-on-brand transition-opacity disabled:opacity-40"
        >
          {t('quick.save')}
        </button>
      </footer>
    </div>
  )
}
