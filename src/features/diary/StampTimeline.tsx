import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryStamp } from '@/core/db/schema'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { dayInfo, removeStamp, restoreStamp, setWeather, updateStamp } from './diaryRepo'
import { parseWeather, weatherIcons, weatherText } from './weather'
import { formatClock, todayKey } from '@/core/utils/dateKey'
import WeatherDialog from './WeatherDialog'

/** 一笔随记：时间一行（可点改）、内容默认只读，点一下进入编辑态；整笔挂在左侧时间轴上 */
function StampRow({
  stamp,
  autoFocus,
  onDelete,
  selectable,
  selected,
  onToggle,
}: {
  stamp: DiaryStamp
  autoFocus: boolean
  onDelete: (stamp: DiaryStamp) => void
  /** 批量多选：整笔变成可点选的，不再能编辑内容与时间 */
  selectable: boolean
  selected: boolean
  onToggle: () => void
}) {
  const [time, setTime] = useState(stamp.time)
  const [editingTime, setEditingTime] = useState(false)
  const [editingContent, setEditingContent] = useState(autoFocus)
  const [draft, setDraft] = useState(stamp.content)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const originalContentRef = useRef(stamp.content)
  const { showToast } = useToast()
  const { t } = useI18n()

  // 进编辑态时把当前内容存一份原始值，给取消用
  function enterEdit() {
    originalContentRef.current = stamp.content
    setDraft(stamp.content)
    setEditingContent(true)
    // 下一帧聚焦 textarea，避免点击事件还没冒泡完
    requestAnimationFrame(() => areaRef.current?.focus())
  }

  async function handleSave() {
    if (draft === originalContentRef.current) {
      // 没改内容，直接退出，别存一次无效写入
      setEditingContent(false)
      return
    }
    await updateStamp(stamp.id, { content: draft })
    originalContentRef.current = draft
    setEditingContent(false)
    showToast({ message: t('stamp.saved') })
  }

  function handleCancel() {
    setDraft(originalContentRef.current)
    setEditingContent(false)
  }

  // 高度跟着文字长，避免纸面上出现内部滚动条
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
  }, [draft, editingContent])

  return (
    <li className="relative pb-5">
      <span aria-hidden="true" className="timeline-dot" />

      <div className={selected ? 'timeline-row-selected pr-8' : 'pr-8'}>
        {selectable ? (
          <button type="button" onClick={onToggle} className="block w-full px-1 text-left">
            <span className="font-hand block text-lg text-ink">{stamp.time}</span>
            <span className="font-hand mt-0.5 block min-h-6 text-sm leading-6 text-ink">
              {stamp.content.trim() || <span className="text-ink-muted">{t('stamp.noContent')}</span>}
            </span>
          </button>
        ) : (
          <>
            {editingTime ? (
              <input
                type="time"
                value={time}
                autoFocus
                onChange={(event) => {
                  setTime(event.target.value)
                  void updateStamp(stamp.id, { time: event.target.value })
                }}
                onBlur={() => setEditingTime(false)}
                className="font-hand rounded-lg border border-binding bg-paper-strong px-2 py-0.5 text-lg text-ink outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTime(true)}
                title={t('stamp.editTimeHint')}
                className="font-hand rounded-lg px-1 text-lg text-ink transition-colors hover:text-brand"
              >
                {time}
              </button>
            )}

            {editingContent ? (
              <>
                <textarea
                  ref={areaRef}
                  value={draft}
                  rows={1}
                  spellCheck={false}
                  aria-label={t('stamp.placeholder')}
                  placeholder={t('stamp.placeholder')}
                  onChange={(event) => setDraft(event.target.value)}
                  className="font-hand block w-full resize-none bg-transparent text-sm leading-6 text-ink outline-none placeholder:text-ink-muted"
                />
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    className="rounded border border-brand bg-brand/10 px-2 py-0.5 text-brand transition-colors hover:bg-brand/20"
                  >
                    {t('stamp.save')}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded border border-line px-2 py-0.5 text-muted transition-colors hover:text-fg"
                  >
                    {t('stamp.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={enterEdit}
                title={t('stamp.tapToEdit')}
                className="font-hand mt-0.5 block w-full min-h-6 text-left text-sm leading-6 text-ink transition-colors hover:text-brand"
              >
                {stamp.content.trim() || <span className="text-ink-muted">{t('stamp.noContent')}</span>}
              </button>
            )}
          </>
        )}
      </div>

      {selectable ? (
        <span
          aria-hidden="true"
          className={
            selected
              ? 'absolute top-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-on-brand'
              : 'absolute top-0 right-0 h-6 w-6 rounded-full border border-ink-muted opacity-60'
          }
        >
          {selected ? '✓' : ''}
        </span>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(stamp)
          }}
          title={t('stamp.deleteHint')}
          className="absolute top-0 right-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-base text-ink-muted opacity-70 transition-colors hover:text-danger hover:opacity-100"
        >
          <span aria-hidden="true">✕</span>
          <span className="sr-only">{t('stamp.deleteHint')}</span>
        </button>
      )}
    </li>
  )
}

/** “现在”那个小标记：只插在今天的时间轴上，箭头指回时间轴 */
function NowRow({ clock }: { clock: string }) {
  return (
    <li className="relative pb-5">
      <span aria-hidden="true" className="timeline-dot timeline-dot-now" />
      <span className="font-hand text-lg text-ink-muted">
        {clock} <span className="text-xs">◀</span>
      </span>
    </li>
  )
}

export default function StampTimeline({
  dateKey,
  focusId,
  stamps,
  selectMode,
  selected,
  onToggleSelect,
}: {
  dateKey: string
  focusId: string
  /** 这一天的随记，由日记页统一查好传进来，批量多选要用同一份 */
  stamps: DiaryStamp[] | undefined
  selectMode: boolean
  selected: string[]
  onToggleSelect: (id: string) => void
}) {
  const { showToast } = useToast()
  const { t } = useI18n()
  const [pendingDelete, setPendingDelete] = useState<DiaryStamp | null>(null)
  const [weatherOpen, setWeatherOpen] = useState(false)

  const day = useLiveQuery(() => dayInfo(dateKey), [dateKey])

  const states = parseWeather(day?.weather)

  /** 当前时刻与今天，每分钟自己走一格，这样“现在”标记不会停在打开页面的那一刻 */
  const [now, setNow] = useState({ clock: '', dateKey: '' })
  useEffect(() => {
    const tick = () => setNow({ clock: formatClock(Date.now()), dateKey: todayKey() })
    tick()
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [])

  // “现在”该插在第几笔之前；不是今天就不插；批量多选时也不插（它没法被选）
  const markerAt =
    !selectMode && now.clock !== '' && now.dateKey === dateKey && stamps
      ? (() => {
          const index = stamps.findIndex((stamp) => stamp.time > now.clock)
          return index === -1 ? stamps.length : index
        })()
      : -1

  const items: ReactNode[] = []
  if (stamps) {
    stamps.forEach((stamp, index) => {
      if (index === markerAt) items.push(<NowRow key={`now-${stamp.id}`} clock={now.clock} />)
      items.push(
        <StampRow
          key={stamp.id}
          stamp={stamp}
          autoFocus={!selectMode && stamp.id === focusId}
          onDelete={setPendingDelete}
          selectable={selectMode}
          selected={selected.includes(stamp.id)}
          onToggle={() => onToggleSelect(stamp.id)}
        />,
      )
    })
    if (markerAt === stamps.length) items.push(<NowRow key="now-tail" clock={now.clock} />)
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const targetId = pendingDelete.id
    setPendingDelete(null)
    await removeStamp(targetId)
    showToast({
      message: t('stamp.deleted'),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void restoreStamp(targetId)
      },
    })
  }

  return (
    <>
      <div className="paper paper-timeline mt-4">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setWeatherOpen(true)}
            title={t('weather.editHint')}
            className="sticker font-hand text-xs text-ink"
          >
            {states.length > 0
              ? `${weatherIcons(states)} ${weatherText(states, t)}`
              : t('weather.pending')}
          </button>
        </div>

        {stamps === undefined && (
          <p className="m-0 text-sm text-ink-muted">{t('stamp.reading')}</p>
        )}

        {stamps !== undefined && stamps.length === 0 && (
          <p className="m-0 text-sm text-ink-muted">{t('stamp.empty')}</p>
        )}

        {stamps !== undefined && stamps.length > 0 && <ul>{items}</ul>}
      </div>

      {weatherOpen && (
        <WeatherDialog
          dateKey={dateKey}
          value={day?.weather ?? ''}
          onConfirm={async (next) => {
            await setWeather(dateKey, next)
            setWeatherOpen(false)
          }}
          onCancel={() => setWeatherOpen(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('stamp.deleteTitle')}
          description={`${pendingDelete.time} ${pendingDelete.content || t('stamp.noContent')}`}
          confirmLabel={t('diary.delete')}
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  )
}
