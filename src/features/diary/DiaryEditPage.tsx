import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryEntry } from '@/core/db/schema'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import Modal from '@/shared/ui/Modal'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import { BACK_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON, SOLID_DANGER } from '@/shared/ui/buttonStyles'
import {
  createEntry,
  dayInfo,
  entryByCode,
  moveEntries,
  removeEntry,
  restoreEntry,
  setWeather,
  updateContent,
} from './diaryRepo'
import { formatDateCn, isDateKey, todayKey, weekdayLabel } from '@/core/utils/dateKey'
import { parseWeather, weatherIcons, weatherLabel } from './weather'
import WeatherDialog from './WeatherDialog'
import DatePickerDialog from './DatePickerDialog'

/** 弹窗底部的取消按钮：全站弹窗统一的样子 */
const DIALOG_BUTTON =
  'rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg'

/** 从日记列表进编辑页时带过来的草稿：新增 / 图片导入 / AI 整理都走这里 */
interface DraftNav {
  editable?: boolean
  dateKey?: string
  content?: string
  weather?: string
}

/** 自然段开头的两个方格，占两个字宽，同时形成首行缩进两字 */
function ParagraphMarks() {
  return (
    <span aria-hidden="true" className="inline-flex w-[2em] select-none align-[-0.12em]">
      <span className="h-[1em] w-[1em] border-[1.5px] border-ink-muted" />
      <span className="-ml-[1.5px] h-[1em] w-[1em] border-[1.5px] border-ink-muted" />
    </span>
  )
}

export default function DiaryEditPage() {
  const { code } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { t } = useI18n()

  /** /diary/new 没有 :code，等于一份还只在内存里的草稿 */
  const isNew = code === undefined
  const navState = (location.state ?? {}) as DraftNav

  const [editing, setEditing] = useState(isNew || navState.editable === true)
  const [draftDate, setDraftDate] = useState(() =>
    isDateKey(navState.dateKey) ? navState.dateKey : todayKey(),
  )
  /** null = 还没动过，显示磁盘上的内容；一旦输入就变成草稿 */
  const [contentDraft, setContentDraft] = useState<string | null>(null)
  const [weatherDraft, setWeatherDraft] = useState<string | null>(null)
  /** 这一轮里最后一次写盘的内容：用来判断「改了没有」 */
  const [saved, setSaved] = useState<{ content: string; weather: string } | null>(null)

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  /** 另存为是从「离开前保存」弹窗里点的：存完就走，不留在编辑页 */
  const [saveAsLeave, setSaveAsLeave] = useState(false)
  const [migrateOpen, setMigrateOpen] = useState(false)
  const [weatherOpen, setWeatherOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const entry = useLiveQuery(async (): Promise<DiaryEntry | null> => {
    if (!code) return null
    return (await entryByCode(code)) ?? null
  }, [code])

  const day = useLiveQuery(async () => {
    if (isNew) return null
    if (!entry) return null
    return (await dayInfo(entry.dateKey)) ?? null
  }, [isNew, entry?.dateKey])

  /** 新草稿落笔那一天已有的天气：先拿来当底，用户改了才算改 */
  const draftDay = useLiveQuery(async () => {
    if (!isNew) return null
    return (await dayInfo(draftDate)) ?? null
  }, [isNew, draftDate])

  const storedContent = isNew ? (navState.content ?? '') : (entry?.content ?? '')
  const storedWeather = isNew
    ? (navState.weather ?? draftDay?.weather ?? '')
    : (day?.weather ?? '')
  const baseContent = saved?.content ?? storedContent
  const baseWeather = saved?.weather ?? storedWeather
  const value = contentDraft ?? baseContent
  const weatherValue = weatherDraft ?? baseWeather

  const shownDate = isNew ? draftDate : (entry?.dateKey ?? draftDate)
  const hasDiskEntry = !isNew && entry != null
  const changed = value !== baseContent || weatherValue !== baseWeather
  /** 已经落盘的看「改没改」；内存草稿只要有点东西就算没保存 */
  const hasUnsaved = hasDiskEntry ? changed : isNew && (value.trim() !== '' || weatherValue !== '')

  const bypass = useRef(false)
  const blocker = useBlocker(() => !bypass.current && hasUnsaved)

  /** 离开时用：先把守卫放行，再跳走 */
  function go(path: string, options?: { replace?: boolean; state?: unknown }) {
    bypass.current = true
    if (blocker.state === 'blocked') blocker.reset()
    void navigate(path, options)
  }

  // 路由真的换了（或页面卸载）之后才把守卫恢复回来：
  // 不能提前恢复，否则导航还在路上就被自己拦一次
  useEffect(() => {
    bypass.current = false
  }, [location.key])

  /** 被拦住的那次导航本来要去哪：默认回列表，并带上当前这天 */
  function proceedTarget() {
    const target = blocker.location
    if (!target || target.pathname === '/diary') return `/diary?date=${shownDate}`
    return target.pathname + target.search + target.hash
  }

  // 关窗口 / 刷新前也拦一下，别让整份草稿悄悄没了
  useEffect(() => {
    if (!hasUnsaved) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsaved])

  if (!isNew && entry === undefined) {
    return <p className="p-4 text-sm text-muted">{t('common.reading')}</p>
  }

  if (!isNew && entry === null) {
    return (
      <div className="p-4">
        <Link to="/diary" className="text-sm text-brand">
          {t('diaryEdit.backLink')}
        </Link>
        <p className="mt-4 text-sm text-muted">{t('diaryEdit.notFound')}</p>
      </div>
    )
  }

  const weatherStates = parseWeather(weatherValue)
  const paragraphs = value.split('\n')

  /** 把编辑区的内容写回磁盘上这篇日记；草稿没有指向，不给存 */
  async function saveExisting() {
    if (!entry) return
    const nextContent = value
    const nextWeather = weatherValue
    await updateContent(entry.id, nextContent)
    if (nextWeather !== (day?.weather ?? '')) await setWeather(entry.dateKey, nextWeather)
    setSaved({ content: nextContent, weather: nextWeather })
    showToast({ message: t('diaryEdit.saved') })
  }

  /** 另存为：挑一天，新开一条，再把编辑区指过去（不覆盖那天已有的日记） */
  async function saveAs(dateKey: string) {
    if (busy) return
    setBusy(true)
    try {
      const created = await createEntry(dateKey)
      await updateContent(created.id, value)
      if (weatherValue !== '') await setWeather(dateKey, weatherValue)
      setSaved({ content: value, weather: weatherValue })
      showToast({ message: t('diaryEdit.savedAs', { date: formatDateCn(dateKey) }) })
      if (saveAsLeave) {
        const target = proceedTarget()
        const toList = target.split('?')[0] === '/diary'
        go(toList ? `/diary?date=${dateKey}` : target)
      } else {
        go(`/diary/${created.code}`, { replace: true, state: { editable: true } })
      }
    } finally {
      setBusy(false)
    }
  }

  /** 迁移：日记整篇换到另一天；天气按天存，迁移后重新读新那天的 */
  async function migrate(next: string) {
    if (!entry || busy) return
    setBusy(true)
    try {
      const contentDirty = value !== baseContent ? value : null
      await moveEntries([entry.id], next)
      setContentDraft(contentDirty)
      // 天气是按天存的：迁移后天气基线换成新那天的；用户手改过的那份还留着
      setSaved(null)
      setDraftDate(next)
      showToast({
        message: t('diary.moved', {
          target: t('diary.targetDiary', { count: 1 }),
          date: formatDateCn(next),
        }),
      })
    } finally {
      setBusy(false)
    }
  }

  function handleDeleteOrDiscard() {
    setConfirmOpen(false)
    if (hasDiskEntry && entry) {
      const targetId = entry.id
      const dateKey = entry.dateKey
      void (async () => {
        await removeEntry(targetId)
        showToast({
          message: t('diary.deletedOne'),
          actionLabel: t('diary.undo'),
          onAction: () => {
            void restoreEntry(targetId)
          },
        })
        go(`/diary?date=${dateKey}`)
      })()
      return
    }
    go(`/diary?date=${shownDate}`)
  }

  async function handleSave() {
    if (!hasDiskEntry || busy) return
    setBusy(true)
    try {
      await saveExisting()
    } finally {
      setBusy(false)
    }
  }

  async function handleLeaveSave() {
    if (!hasDiskEntry || busy) return
    setBusy(true)
    try {
      await saveExisting()
    } finally {
      setBusy(false)
    }
    go(proceedTarget())
  }

  return (
    <div className="w-full p-4">
      {/* 顶上一整行都是功能按钮，所以套一层底色跟下面的纸分开 */}
      <ToolbarRow className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/diary?date=${shownDate}`} className={BACK_BUTTON}>
            {t('diaryEdit.back')}
          </Link>
          {/* 编辑区指向哪儿：落盘的显示编号，红=有改动，绿=跟磁盘一致 */}
          <span
            title={
              hasDiskEntry
                ? changed
                  ? t('diaryEdit.statusDirty')
                  : t('diaryEdit.statusSaved')
                : t('diaryEdit.statusUnsaved')
            }
            className={[
              'font-mono text-xs',
              hasDiskEntry && !changed ? 'text-success' : 'text-danger',
            ].join(' ')}
          >
            {hasDiskEntry && entry ? entry.code : t('diaryEdit.unsaved')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setSaveOpen(true)} className={SOLID_BUTTON}>
            {t('diaryEdit.save')}
          </button>
          <button
            type="button"
            onClick={() => setMigrateOpen(true)}
            disabled={!hasDiskEntry}
            title={hasDiskEntry ? t('diaryEdit.migrateHint') : t('diaryEdit.migrateDisabled')}
            className={`${OUTLINE_BUTTON} disabled:opacity-40`}
          >
            {t('diaryEdit.migrate')}
          </button>
          <button type="button" onClick={() => setConfirmOpen(true)} className={SOLID_DANGER}>
            {t('diary.delete')}
          </button>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            title={editing ? t('diaryEdit.lockHint') : t('diaryEdit.editHint')}
            className={SOLID_BUTTON}
          >
            {editing ? t('diaryEdit.lock') : t('diaryEdit.edit')}
          </button>
        </div>
      </ToolbarRow>

      <div className={editing ? 'paper mt-4' : 'paper paper-locked mt-4'}>
        <span aria-hidden="true" className="paper-binding">
          <span className="paper-hole" />
          <span className="paper-hole" />
          <span className="paper-hole" />
        </span>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center font-hand text-sm">
          <span className="whitespace-nowrap">{formatDateCn(shownDate)}</span>
          <span className="px-2 text-center text-ink-muted">{weekdayLabel(shownDate)}</span>
          <button
            type="button"
            onClick={() => setWeatherOpen(true)}
            title={t('weather.editHint')}
            className="sticker justify-self-end text-xs"
          >
            {weatherStates.length > 0
              ? `${weatherIcons(weatherStates)} ${weatherLabel(weatherStates)}`
              : t('weather.pending')}
          </button>
        </div>

        <div className="ruled font-hand mt-4 min-h-[50vh] text-sm">
          {editing ? (
            <textarea
              value={value}
              onChange={(event) => setContentDraft(event.target.value)}
              placeholder={t('diaryEdit.placeholder')}
              rows={16}
              spellCheck={false}
              // field-sizing-content：输入框跟着内容长高，整页滚动，而不是框内自己滚。
              // 框内自己滚有三个毛病：横线格与文字对不上、手机上在框里拖动会"卡住"、
              // 长日记变成两层滚动。rows={16} 留着给不支持的老引擎兜底。
              className="field-sizing-content block w-full resize-none bg-transparent text-ink outline-none placeholder:text-ink-muted"
            />
          ) : value.trim() === '' ? (
            <p className="m-0 text-ink-muted">{t('diaryEdit.placeholder')}</p>
          ) : (
            paragraphs.map((paragraph, index) =>
              paragraph === '' ? (
                <p key={index} className="m-0">
                  &nbsp;
                </p>
              ) : (
                <p key={index} className="m-0 break-words">
                  <ParagraphMarks />
                  {paragraph}
                </p>
              ),
            )
          )}
        </div>
      </div>

      {saveOpen && (
        <Modal size="xs" label={t('diaryEdit.saveTitle')} onClose={() => setSaveOpen(false)}>
          <div className="text-sm font-medium">{t('diaryEdit.saveTitle')}</div>
          <p className="mt-2 text-xs text-muted">
            {hasDiskEntry ? t('diaryEdit.saveHint') : t('diaryEdit.neverSaved')}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={!hasDiskEntry || busy}
              onClick={() => {
                setSaveOpen(false)
                void handleSave()
              }}
              className={`${SOLID_BUTTON} w-full disabled:opacity-40`}
            >
              {t('diaryEdit.save')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSaveOpen(false)
                setSaveAsLeave(false)
                setSaveAsOpen(true)
              }}
              className={`${OUTLINE_BUTTON} w-full disabled:opacity-40`}
            >
              {t('diaryEdit.saveAs')}
            </button>
            <button type="button" onClick={() => setSaveOpen(false)} className={DIALOG_BUTTON}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}

      {blocker.state === 'blocked' && !saveAsOpen && (
        <Modal size="xs" label={t('diaryEdit.leaveTitle')} onClose={() => blocker.reset()}>
          <div className="text-sm font-medium">{t('diaryEdit.leaveTitle')}</div>
          <p className="mt-2 text-xs text-muted">{t('diaryEdit.leaveBody')}</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={!hasDiskEntry || busy}
              onClick={() => void handleLeaveSave()}
              className={`${SOLID_BUTTON} w-full disabled:opacity-40`}
            >
              {t('diaryEdit.save')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSaveAsLeave(true)
                setSaveAsOpen(true)
              }}
              className={`${OUTLINE_BUTTON} w-full disabled:opacity-40`}
            >
              {t('diaryEdit.saveAs')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => go(proceedTarget())}
              className="w-full rounded-lg border border-danger px-3 py-1.5 text-sm text-danger transition-colors hover:opacity-80 disabled:opacity-40"
            >
              {t('diaryEdit.discard')}
            </button>
            <button type="button" onClick={() => blocker.reset()} className={DIALOG_BUTTON}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}

      {saveAsOpen && (
        <DatePickerDialog
          value={shownDate}
          onConfirm={(next) => {
            setSaveAsOpen(false)
            void saveAs(next)
          }}
          onCancel={() => setSaveAsOpen(false)}
        />
      )}

      {migrateOpen && (
        <DatePickerDialog
          value={shownDate}
          onConfirm={(next) => {
            setMigrateOpen(false)
            if (next !== shownDate) void migrate(next)
          }}
          onCancel={() => setMigrateOpen(false)}
        />
      )}

      {confirmOpen && (
        <ConfirmDialog
          title={hasDiskEntry ? t('diary.deleteThisTitle') : t('diaryEdit.discardDraftTitle')}
          description={hasDiskEntry ? t('diary.deleteThisBody') : t('diaryEdit.discardDraftBody')}
          confirmLabel={hasDiskEntry ? t('diary.delete') : t('diaryEdit.discard')}
          onConfirm={handleDeleteOrDiscard}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {weatherOpen && (
        <WeatherDialog
          dateKey={shownDate}
          value={weatherValue}
          onConfirm={(next) => {
            setWeatherDraft(next)
            setWeatherOpen(false)
          }}
          onCancel={() => setWeatherOpen(false)}
        />
      )}
    </div>
  )
}
