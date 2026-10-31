import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryImage, DiaryStamp } from '@/core/db/schema'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { dayInfo, removeStamp, restoreStamp, setWeather, updateStamp } from './diaryRepo'
import { parseWeather, weatherIcons, weatherText } from './weather'
import { formatClock, todayKey } from '@/core/utils/dateKey'
import WeatherDialog from './WeatherDialog'
import TimeMeta from '@/shared/ui/TimeMeta'
import CommonPresetDialog from './CommonPresetDialog'
import ImageSourceDialog from '@/shared/ui/ImageSourceDialog'
import ImageViewer from './ImageViewer'
import { MAX_IMAGES, prepareImages } from './imageAssets'
import SketchDialog from './SketchDialog'
import { buildSingleRecordExport } from '@/features/records/recordExport'
import { describeSave, saveTextFile } from '@/platform/saveFile'

/**
 * 一笔随记里带的图片：小缩略图铺开，点开是灯箱。
 * 编辑态右上角带删除按钮，删掉立刻写回。
 */
function StampImages({
  images,
  editing,
  onRemove,
  onOpen,
}: {
  images: DiaryImage[]
  editing: boolean
  onRemove: (id: string) => void
  onOpen: (index: number) => void
}) {
  const { t } = useI18n()
  if (images.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {images.map((image, index) => (
        <span key={image.id} className="relative">
          {/* 用 span 而不是 button：批量多选时整体已经包在一个 button 里，按钮不能嵌套 */}
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation()
              onOpen(index)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                onOpen(index)
              }
            }}
            className="block cursor-zoom-in"
            title={t('imageImport.view')}
          >
            <img
              src={image.dataUrl}
              alt=""
              loading="lazy"
              className="h-16 w-16 rounded-lg border border-binding object-cover"
            />
          </span>
          {editing && images.length > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(image.id)
              }}
              title={t('stamp.removeImage')}
              className="absolute -top-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white transition-colors hover:bg-black/80"
            >
              <span aria-hidden="true">✕</span>
              <span className="sr-only">{t('stamp.removeImage')}</span>
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

/** 一笔随记：时间一行（可点改）、内容默认只读，双击进入编辑态；整笔挂在左侧时间轴上 */
function StampRow({
  stamp,
  editing,
  draft,
  onDraftChange,
  onRequestEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onExportJson,
  selectable,
  selected,
  onToggle,
}: {
  stamp: DiaryStamp
  /** 编辑态由时间轴统一管：同一时刻最多只有一条在编辑 */
  editing: boolean
  draft: string
  onDraftChange: (next: string) => void
  onRequestEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDelete: (stamp: DiaryStamp) => void
  /** 单条导出 JSON：时间和天气由时间轴统一取 */
  onExportJson: () => void
  /** 批量多选：整笔变成可点选的，不再能编辑内容与时间 */
  selectable: boolean
  selected: boolean
  onToggle: () => void
}) {
  const [time, setTime] = useState(stamp.time)
  const [editingTime, setEditingTime] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [presetOpen, setPresetOpen] = useState(false)
  const { t } = useI18n()
  const { showToast } = useToast()
  /** 随记配图：选来源（相册 / 拍照 / 手绘）→ 转码 → 立刻写回这条随记 */
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sketchOpen, setSketchOpen] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  async function addImages(files: File[]) {
    if (files.length === 0 || imageBusy) return
    setImageBusy(true)
    try {
      const prepared = await prepareImages(files)
      if (stamp.images.length + prepared.length > MAX_IMAGES) {
        showToast({ message: t('stamp.imageLimit', { max: MAX_IMAGES }) })
      }
      const next = [...stamp.images, ...prepared].slice(0, MAX_IMAGES)
      await updateStamp(stamp.id, { images: next })
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : String(error) })
    } finally {
      setImageBusy(false)
    }
  }

  function handleImagePick(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    // 清掉 value：同一个文件再选一次也能触发 change
    event.target.value = ''
    void addImages(files)
  }

  function removeImage(id: string) {
    void updateStamp(stamp.id, { images: stamp.images.filter((image) => image.id !== id) })
  }

  /** 把预设名插到光标处；没有焦点时追加到末尾 */
  function insertPreset(name: string) {
    const area = areaRef.current
    if (!area) {
      onDraftChange(`${draft}${name}`)
      return
    }
    const start = area.selectionStart ?? draft.length
    const end = area.selectionEnd ?? start
    const next = `${draft.slice(0, start)}${name}${draft.slice(end)}`
    onDraftChange(next)
    requestAnimationFrame(() => {
      area.focus()
      const position = start + name.length
      area.setSelectionRange(position, position)
    })
  }

  // 进入编辑态时把光标放进正文，避免手还要再点一次
  useEffect(() => {
    if (!editing) return
    // 下一帧聚焦 textarea，避免点击事件还没冒泡完
    requestAnimationFrame(() => areaRef.current?.focus())
  }, [editing])

  // 高度跟着文字长，避免纸面上出现内部滚动条
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
  }, [draft, editing])

  return (
    <li className="stamp-row relative pb-5">
      <span aria-hidden="true" className="timeline-dot" />

      <div
        className={[
          '-my-1 -ml-2 rounded-lg py-1 pl-2 transition-colors',
          selected ? 'timeline-row-selected' : '',
          editing ? 'bg-brand/5 outline outline-1 outline-brand/25 outline-offset-2' : '',
        ].join(' ')}
      >
        {selectable ? (
          <button type="button" onClick={onToggle} className="block w-full py-1 pr-8 pl-1 text-left">
            <span className="flex items-baseline gap-2">
              <span className="font-hand text-lg text-ink">{stamp.time}</span>
              <span className="font-mono text-[10px] text-ink-muted opacity-70">{stamp.code}</span>
            </span>
            <span className="font-hand mt-0.5 block min-h-6 text-sm leading-6 text-ink">
              {stamp.content.trim() ||
                (stamp.images.length === 0 && (
                  <span className="text-ink-muted">{t('stamp.noContent')}</span>
                ))}
            </span>
            <StampImages
              images={stamp.images}
              editing={false}
              onRemove={removeImage}
              onOpen={setViewerIndex}
            />
          </button>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
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
              <span className="font-mono text-[10px] text-ink-muted opacity-70">{stamp.code}</span>
            </div>

            {editing ? (
              <>
                <textarea
                  ref={areaRef}
                  value={draft}
                  rows={1}
                  spellCheck={false}
                  aria-label={t('stamp.placeholder')}
                  placeholder={t('stamp.placeholder')}
                  onChange={(event) => onDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    // 键盘直接收尾：Ctrl/⌘+Enter 存，Esc 退，不用去够按钮
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      onCancelEdit()
                    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault()
                      onSaveEdit()
                    }
                  }}
                  className="font-hand block w-full resize-none bg-transparent text-sm leading-6 text-ink outline-none placeholder:text-ink-muted"
                />
                <StampImages
                  images={stamp.images}
                  editing
                  onRemove={removeImage}
                  onOpen={setViewerIndex}
                />
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={onSaveEdit}
                    className="rounded border border-brand bg-brand/10 px-2 py-0.5 text-brand transition-colors hover:bg-brand/20"
                  >
                    {t('stamp.save')}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded border border-line px-2 py-0.5 text-muted transition-colors hover:text-fg"
                  >
                    {t('stamp.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetOpen(true)}
                    className="rounded border border-line px-2 py-0.5 text-muted transition-colors hover:text-fg"
                  >
                    {t('stamp.insertPreset')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceOpen(true)}
                    disabled={imageBusy || stamp.images.length >= MAX_IMAGES}
                    className="rounded border border-line px-2 py-0.5 text-muted transition-colors hover:text-fg disabled:opacity-40"
                  >
                    {t('stamp.addImage')}
                  </button>
                  {/* 手机上没键盘，这行提示只在能看见键盘的宽度显示 */}
                  <span className="ml-auto hidden text-ink-muted sm:inline">{t('stamp.saveHint')}</span>
                </div>
              </>
            ) : (
              <button
                type="button"
                onDoubleClick={onRequestEdit}
                // 单击只留给框选文字和误触；键盘没有双击手势，Enter / 空格照样能进编辑
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onRequestEdit()
                  }
                }}
                title={t('stamp.tapToEdit')}
                className="font-hand mt-0.5 block w-full min-h-6 text-left text-sm leading-6 text-ink transition-colors hover:text-brand"
              >
                {stamp.content.trim() ||
                  (stamp.images.length === 0 && (
                    <span className="text-ink-muted">{t('stamp.noContent')}</span>
                  ))}
              </button>
            )}
            {!editing && (
              <>
                <StampImages
                  images={stamp.images}
                  editing={false}
                  onRemove={removeImage}
                  onOpen={setViewerIndex}
                />
                <TimeMeta createdAt={stamp.createdAt} updatedAt={stamp.updatedAt} tone="paper" />
              </>
            )}
          </>
        )}
      </div>

      {presetOpen && (
        <CommonPresetDialog
          onInsert={(name) => insertPreset(name)}
          onClose={() => setPresetOpen(false)}
        />
      )}

      {selectable ? (
        <span
          aria-hidden="true"
          className={
            selected
              ? 'pointer-events-none absolute top-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-on-brand'
              : 'pointer-events-none absolute top-0 right-0 h-6 w-6 rounded-full border border-ink-muted opacity-60'
          }
        >
          {selected ? '✓' : ''}
        </span>
      ) : (
        !editing && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onExportJson()
              }}
              title={t('records.export')}
              className="absolute top-0 right-9 inline-flex h-8 items-center justify-center rounded-lg px-1.5 font-mono text-[10px] text-ink-muted transition-colors hover:text-brand"
            >
              JSON
              <span className="sr-only">{t('records.export')}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(stamp)
              }}
              title={t('stamp.deleteHint')}
              className="stamp-delete absolute top-0 right-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-base text-ink-muted transition-colors hover:text-danger"
            >
              <span aria-hidden="true">✕</span>
              <span className="sr-only">{t('stamp.deleteHint')}</span>
            </button>
          </>
        )
      )}

      {sourceOpen && (
        <ImageSourceDialog
          onPickFile={() => {
            setSourceOpen(false)
            galleryRef.current?.click()
          }}
          onTakePhoto={() => {
            setSourceOpen(false)
            cameraRef.current?.click()
          }}
          onDraw={() => setSketchOpen(true)}
          onClose={() => setSourceOpen(false)}
        />
      )}
      {sketchOpen && (
        <SketchDialog
          onCancel={() => setSketchOpen(false)}
          onDone={(file) => {
            setSketchOpen(false)
            void addImages([file])
          }}
        />
      )}
      {viewerIndex !== null && viewerIndex < stamp.images.length && (
        <ImageViewer
          images={stamp.images.map((image) => ({ preview: image.dataUrl }))}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
      {/* 相册可以多选；拍照一次一张（多按几次就是多张） */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImagePick}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleImagePick}
      />
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
  /** 同一时刻只允许一条在编辑；草稿放在这一层，切换时才判断得出有没有没存的东西 */
  const [editingId, setEditingId] = useState('')
  const [draft, setDraft] = useState('')
  const originalRef = useRef('')
  /** 已经自动进过编辑的那条，取消后不要再把它拽回来 */
  const autoEditRef = useRef('')
  const [pendingSwitch, setPendingSwitch] = useState<DiaryStamp | null>(null)

  const day = useLiveQuery(() => dayInfo(dateKey), [dateKey])

  function startEdit(stamp: DiaryStamp) {
    originalRef.current = stamp.content
    setDraft(stamp.content)
    setEditingId(stamp.id)
  }

  /** 点另一条要编辑：当前这条有改动就先问一句，别悄悄丢 */
  function requestEdit(stamp: DiaryStamp) {
    if (editingId === stamp.id) return
    if (editingId !== '' && draft !== originalRef.current) {
      setPendingSwitch(stamp)
      return
    }
    startEdit(stamp)
  }

  function cancelEdit() {
    setEditingId('')
    setDraft(originalRef.current)
  }

  async function saveEdit(stamp: DiaryStamp) {
    const next = draft
    setEditingId('')
    // 没改内容，直接退出，别存一次无效写入
    if (next === originalRef.current) return
    await updateStamp(stamp.id, { content: next })
    originalRef.current = next
    showToast({ message: t('stamp.saved') })
  }

  // 新记下的一笔直接进编辑态，光标落到正文。
  // 这是对父组件 focusId 的响应（点「新增」后把光标送进来），不是在渲染期改状态。
  useEffect(() => {
    if (selectMode || !focusId || autoEditRef.current === focusId) return
    const target = stamps?.find((stamp) => stamp.id === focusId)
    if (!target) return
    autoEditRef.current = focusId
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 响应父组件的 focusId，不是渲染期改状态
    startEdit(target)
  }, [focusId, selectMode, stamps])

  // 进批量多选时由 DiaryPage 用 key 重挂载本组件，编辑态随之清掉，不需要再写一个 effect

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
          editing={!selectMode && editingId === stamp.id}
          draft={editingId === stamp.id ? draft : stamp.content}
          onDraftChange={setDraft}
          onRequestEdit={() => requestEdit(stamp)}
          onCancelEdit={cancelEdit}
          onSaveEdit={() => void saveEdit(stamp)}
          onDelete={setPendingDelete}
          onExportJson={() => void handleExportJson(stamp)}
          selectable={selectMode}
          selected={selected.includes(stamp.id)}
          onToggle={() => onToggleSelect(stamp.id)}
        />,
      )
    })
    if (markerAt === stamps.length) items.push(<NowRow key="now-tail" clock={now.clock} />)
  }

  /** 单条随记导出：结构和「挑选记录导出」的 JSON 一样，带上当天天气 */
  async function handleExportJson(stamp: DiaryStamp) {
    const file = buildSingleRecordExport('stamp', stamp, day ?? null)
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(outcome, t('records.exported', { count: 1, label: file.label }), t),
    })
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

      {pendingSwitch && (
        <ConfirmDialog
          title={t('stamp.unsavedTitle')}
          description={t('stamp.unsavedSwitch')}
          confirmLabel={t('stamp.discardAndEdit')}
          onConfirm={() => {
            const target = pendingSwitch
            setPendingSwitch(null)
            startEdit(target)
          }}
          onCancel={() => setPendingSwitch(null)}
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
