/**
 * 图片导入弹窗：先选图、排页序，再手动开始识别，识别完留在弹窗里核对，最后才进编辑页。
 *
 * 不让系统文件选择器一选完就跳走——多数人只会选一张，等发现自己还得再选一次时，
 * 页面已经换了。所以入口先弹这个窗口，「继续添加」可以反复加图。
 *
 * 识别结果按缩略图当前的页序拼成一篇；失败页在正文里留占位，可以原地重试。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import Modal from '@/shared/ui/Modal'
import { compressImage, transcribeDiary } from '@/features/ai/aiVision'
import type { Transcript } from '@/features/ai/aiVision'
import type { AiConfig } from '@/features/ai/aiConfig'
import { useI18n } from '@/shared/i18n/context'
import { MAX_IMPORT_IMAGES, mergePages } from './importPages'
import type { ImportSummary } from './importPages'
import ImageViewer from './ImageViewer'

type PageStatus = 'pending' | 'running' | 'done' | 'failed'

interface Page {
  id: string
  file: File
  preview: string
  status: PageStatus
  transcript: Transcript | null
  error: string
}

const OUTLINE_BUTTON =
  'rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg disabled:opacity-40'
const SOLID_BUTTON =
  'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-on-brand transition-opacity hover:opacity-90 disabled:opacity-40'
const TILE_BUTTON =
  'flex h-6 w-6 items-center justify-center rounded bg-black/55 text-xs text-white transition-opacity hover:bg-black/75 disabled:opacity-30'

export default function ImageImportDialog({
  config,
  onDone,
  onCancel,
}: {
  config: AiConfig
  /** 点「进入编辑」：合并好的正文、日期、天气 */
  onDone: (summary: ImportSummary) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [pages, setPages] = useState<Page[]>([])
  const [running, setRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [dragId, setDragId] = useState('')
  const [hint, setHint] = useState('')
  /** 全屏看图时停在第几张；null = 没在看 */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  /** 点过「开始识别」才显示进度和结果，空窗口时不占地方 */
  const [hasRun, setHasRun] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  /** 文件对象在弹窗生命周期里不变，重试时不用翻 state */
  const filesById = useRef(new Map<string, File>())
  const previewUrls = useRef<string[]>([])
  /** 用户点了退出或弹窗卸载：请求可能还会回来，但不能再改状态 */
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    // 拿 ref 本体而不是当时的数组：关窗时要把这一路加进来的 blob URL 全部放掉
    const urls = previewUrls
    return () => {
      cancelled.current = true
      urls.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  // 等的时候给个秒数，让人知道它没卡死
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [running])

  const updatePage = useCallback((id: string, patch: Partial<Page>) => {
    setPages((current) =>
      current.map((page) => (page.id === id ? { ...page, ...patch } : page)),
    )
  }, [])

  /** 逐张识别。一张一请求，既能看到进度，也不会因为一张失败拖垮整批 */
  const recognize = useCallback(
    async (ids: string[]) => {
      setRunning(true)
      for (const id of ids) {
        if (cancelled.current) return
        const file = filesById.current.get(id)
        if (!file) continue
        updatePage(id, { status: 'running', error: '' })
        try {
          const image = await compressImage(file)
          const result = await transcribeDiary(config, image)
          if (cancelled.current) return
          if (!result.ok || !result.transcript) {
            updatePage(id, { status: 'failed', transcript: null, error: result.error })
          } else {
            updatePage(id, { status: 'done', transcript: result.transcript, error: '' })
          }
        } catch (failure) {
          if (cancelled.current) return
          updatePage(id, { status: 'failed', transcript: null, error: (failure as Error).message })
        }
      }
      if (!cancelled.current) setRunning(false)
    },
    [config, updatePage],
  )

  /** 「继续添加」：把新选的照片接在列表末尾，不覆盖已有的识别结果 */
  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (picked.length === 0) return

    const room = MAX_IMPORT_IMAGES - pages.length
    if (room <= 0) {
      setHint(t('imageImport.limit', { max: MAX_IMPORT_IMAGES }))
      return
    }
    const accepted = picked.slice(0, room)
    if (picked.length > room) setHint(t('imageImport.limit', { max: MAX_IMPORT_IMAGES }))
    else setHint('')

    const added = accepted.map((file) => {
      const id = `page-${(seq.current += 1)}`
      filesById.current.set(id, file)
      const preview = URL.createObjectURL(file)
      previewUrls.current.push(preview)
      return {
        id,
        file,
        preview,
        status: 'pending' as PageStatus,
        transcript: null,
        error: '',
      }
    })
    setPages((current) => [...current, ...added])
  }

  /** 识别还没成功的页（新加的、失败的），已经成功的不重跑，省时间也省钱 */
  function startRecognize() {
    if (running) return
    const ids = pages
      .filter((page) => page.status === 'pending' || page.status === 'failed')
      .map((page) => page.id)
    if (ids.length === 0) return
    setPages((current) =>
      current.map((page) =>
        ids.includes(page.id) ? { ...page, status: 'pending', error: '' } : page,
      ),
    )
    setHint('')
    setHasRun(true)
    void recognize(ids)
  }

  function move(id: string, delta: number) {
    if (running) return
    setPages((current) => {
      const index = current.findIndex((page) => page.id === id)
      const target = index + delta
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  function dropOn(targetId: string) {
    if (running || dragId === '' || dragId === targetId) return
    setPages((current) => {
      const from = current.findIndex((page) => page.id === dragId)
      const to = current.findIndex((page) => page.id === targetId)
      if (from < 0 || to < 0) return current
      const next = [...current]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    setDragId('')
  }

  function remove(id: string) {
    if (running) return
    setPages((current) => current.filter((page) => page.id !== id))
  }

  const doneCount = pages.filter((page) => page.status === 'done').length
  const failedCount = pages.filter((page) => page.status === 'failed').length
  const waitingCount = pages.length - doneCount - failedCount

  const summary = mergePages(
    pages.map((page) => (page.status === 'done' ? page.transcript : null)),
    (pageNumber) => t('imageImport.pageFailed', { page: pageNumber }),
  )

  function finish() {
    if (doneCount === 0) return
    onDone(summary)
  }

  return (
    <Modal
      size="sm"
      label={t('imageImport.dialogTitle')}
      onClose={() => {
        // 看图这一层盖在导入弹窗上面：Esc / 遮罩先关它，不要连导入一起关掉
        if (viewerIndex !== null) {
          setViewerIndex(null)
          return
        }
        onCancel()
      }}
    >
      <div className="text-sm font-medium">{t('imageImport.dialogTitle')}</div>
      <p className="mt-1 text-xs text-muted">
        {pages.length === 0
          ? t('imageImport.emptyHint')
          : t('imageImport.countHint', { count: pages.length, max: MAX_IMPORT_IMAGES })}
      </p>

      {pages.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted transition-colors hover:border-brand hover:text-brand"
        >
          {t('imageImport.add')}
        </button>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {pages.map((page, index) => (
            <li
              key={page.id}
              draggable={!running}
              onDragStart={(event) => {
                setDragId(page.id)
                // Firefox 不带 dataTransfer 就起不来拖拽
                event.dataTransfer.setData('text/plain', page.id)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(page.id)}
              title={page.error || undefined}
              className={[
                'relative overflow-hidden rounded-lg border-2 bg-surface-2',
                page.status === 'done'
                  ? 'border-success'
                  : page.status === 'failed'
                    ? 'border-danger'
                    : 'border-line',
              ].join(' ')}
            >
              <img
                src={page.preview}
                alt=""
                onDoubleClick={() => setViewerIndex(index)}
                className="aspect-[3/4] w-full object-cover"
              />
              <span className="absolute top-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[11px] leading-none text-white">
                {index + 1}
              </span>
              <span
                aria-hidden="true"
                className={[
                  'absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] leading-none text-white',
                  page.status === 'done'
                    ? 'bg-success'
                    : page.status === 'failed'
                      ? 'bg-danger'
                      : 'bg-black/55',
                ].join(' ')}
              >
                {page.status === 'done' && '✓'}
                {page.status === 'failed' && '✕'}
                {page.status === 'running' && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {page.status === 'pending' && <span className="text-white/70">·</span>}
              </span>

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/40 py-1">
                <button
                  type="button"
                  disabled={running || index === 0}
                  onClick={() => move(page.id, -1)}
                  aria-label={t('imageImport.moveUp')}
                  className={TILE_BUTTON}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => setViewerIndex(index)}
                  aria-label={t('imageImport.view')}
                  title={t('imageImport.view')}
                  className={TILE_BUTTON}
                >
                  🔍
                </button>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => remove(page.id)}
                  aria-label={t('imageImport.remove')}
                  className={TILE_BUTTON}
                >
                  ✕
                </button>
                <button
                  type="button"
                  disabled={running || index === pages.length - 1}
                  onClick={() => move(page.id, 1)}
                  aria-label={t('imageImport.moveDown')}
                  className={TILE_BUTTON}
                >
                  →
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages.length > 1 && (
        <p className="mt-2 text-xs text-muted">{t('imageImport.orderHint')}</p>
      )}
      {hint && <p className="mt-2 text-xs text-warning">{hint}</p>}

      {hasRun && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
          <div className="text-fg">
            {t('imageImport.progress', {
              done: doneCount,
              total: pages.length,
            })}
          </div>
          {running ? (
            <div className="mt-0.5 text-muted">{t('imageImport.waited', { seconds })}</div>
          ) : failedCount > 0 ? (
            <div className="mt-0.5 text-danger">
              {t('imageImport.failedSummary', { failed: failedCount })}
            </div>
          ) : (
            <div className="mt-0.5 text-muted">{t('imageImport.reviewHint')}</div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {doneCount > 0 && (
          <button type="button" onClick={finish} disabled={running} className={SOLID_BUTTON}>
            {t('imageImport.enterEdit')}
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={running || pages.length >= MAX_IMPORT_IMAGES}
          className={OUTLINE_BUTTON}
        >
          {t('imageImport.add')}
        </button>
        <button
          type="button"
          onClick={startRecognize}
          disabled={running || pages.length === 0 || waitingCount + failedCount === 0}
          className={OUTLINE_BUTTON}
        >
          {t('imageImport.start')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          {t('imageImport.exit')}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handlePick}
        className="hidden"
      />

      {viewerIndex !== null && (
        <ImageViewer
          images={pages.map((page) => ({ preview: page.preview }))}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </Modal>
  )
}
