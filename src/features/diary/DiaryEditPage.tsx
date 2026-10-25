import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryEntry } from '@/core/db/schema'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import Dropdown from '@/shared/ui/Dropdown'
import Modal from '@/shared/ui/Modal'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import { BACK_BUTTON, GHOST_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
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
import { formatDate, isDateKey, todayKey, weekdayKey } from '@/core/utils/dateKey'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import type { AiConfig } from '@/features/ai/aiConfig'
import { parseWeather, weatherIcons, weatherText } from './weather'
import WeatherDialog from './WeatherDialog'
import DatePickerDialog from './DatePickerDialog'
import ImageImportDialog from './ImageImportDialog'
import type { ImportSummary } from './importPages'
import CommonPresetDialog from './CommonPresetDialog'
import { polishDiary } from '@/features/ai/aiPolish'

/** 弹窗底部的取消按钮：全站弹窗统一的样子 */

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
  /** 编辑页里继续补图：先开弹窗选图识别，识别出来的正文接在现有内容末尾 */
  const [appendOpen, setAppendOpen] = useState(false)
  const [appendConfig, setAppendConfig] = useState<AiConfig | null>(null)
  /** 常用人物 / 地名快速插入 */
  const [commonOpen, setCommonOpen] = useState(false)
  /** AI 润色：结果先放在弹窗里，确认后才替换正文 */
  const [polishOpen, setPolishOpen] = useState(false)
  const [polishBusy, setPolishBusy] = useState(false)
  const [polishResult, setPolishResult] = useState('')
  const [polishError, setPolishError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
  const storedWeather = isNew ? (navState.weather ?? draftDay?.weather ?? '') : (day?.weather ?? '')
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
      showToast({ message: t('diaryEdit.savedAs', { date: formatDate(dateKey, t) }) })
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
          date: formatDate(next, t),
        }),
      })
    } finally {
      setBusy(false)
    }
  }

  /** 继续导入：先确认模型能看图，再选图；识别完接在正文末尾 */
  function handleAppendPick() {
    const config = loadAiConfig()
    if (config.model.trim() === '') {
      showToast({ message: t('diary.hintNoModelName') })
      return
    }
    if (!isConfigured(config)) {
      showToast({ message: t('diary.hintIncomplete') })
      return
    }
    if (config.vision === 'no') {
      showToast({ message: t('diary.hintNoVision') })
      return
    }
    setAppendConfig(config)
    setAppendOpen(true)
  }

  /** 追加的正文一律接在末尾；失败页的占位也照原样带进来，让用户自己看着删 */
  function handleAppendDone(summary: ImportSummary) {
    setAppendOpen(false)
    const base = value.replace(/\n+$/, '')
    setContentDraft(base === '' ? summary.content : `${base}\n\n${summary.content}`)
    if (weatherValue === '' && summary.weather !== '') setWeatherDraft(summary.weather)
    setEditing(true)
    const others = summary.dateKeys.filter((key) => key !== shownDate)
    if (others.length > 0) {
      showToast({
        message: t('diaryEdit.appendOtherDate', {
          dates: others.map((key) => formatDate(key, t)).join('、'),
        }),
      })
    }
  }

  /** 「常用」里点了个名字：有光标就插在光标处，锁定态先解锁再接在末尾 */
  function insertCommon(name: string) {
    const el = editing ? textareaRef.current : null
    if (el) {
      const start = el.selectionStart ?? value.length
      const end = el.selectionEnd ?? start
      const next = value.slice(0, start) + name + value.slice(end)
      setContentDraft(next)
      requestAnimationFrame(() => {
        el.focus()
        const caret = start + name.length
        el.setSelectionRange(caret, caret)
      })
      return
    }
    const next = value === '' ? name : `${value}${value.endsWith('\n') ? '' : ' '}${name}`
    setContentDraft(next)
    setEditing(true)
  }

  /** AI 润色：先检查配置和正文，再把结果放进弹窗等用户确认 */
  async function openPolish() {
    if (value.trim() === '') {
      showToast({ message: t('diaryEdit.polishEmpty') })
      return
    }
    const config = loadAiConfig()
    if (!isConfigured(config)) {
      showToast({ message: t('diaryEdit.polishNoConfig') })
      return
    }
    setPolishResult('')
    setPolishError('')
    setPolishOpen(true)
    setPolishBusy(true)
    try {
      const result = await polishDiary(config, value)
      if (!result.ok) {
        setPolishError(t('diaryEdit.polishFailed', { message: result.error }))
        return
      }
      setPolishResult(result.content)
    } finally {
      setPolishBusy(false)
    }
  }

  function applyPolish() {
    if (polishResult.trim() === '') return
    setContentDraft(polishResult)
    setEditing(true)
    setPolishOpen(false)
    showToast({ message: t('diaryEdit.polishDone') })
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
    const content = value
    const weather = weatherValue
    const dateKey = shownDate
    // 空草稿没有可留的东西，直接走
    if (content.trim() === '' && weather === '') {
      go(`/diary?date=${dateKey}`)
      return
    }
    // 草稿没落过盘，删除时要先写一条再标删，回收站里才找得到
    void (async () => {
      const created = await createEntry(dateKey)
      await updateContent(created.id, content)
      if (weather !== '') await setWeather(dateKey, weather)
      await removeEntry(created.id)
      showToast({
        message: t('diaryEdit.draftTrashed'),
        actionLabel: t('diary.undo'),
        onAction: () => {
          void restoreEntry(created.id)
        },
      })
      go(`/diary?date=${dateKey}`)
    })()
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
          {/* 文件级操作收进「文件」：保存/迁移/删除；插入类收进「插入」 */}
          <Dropdown
            label={t('diaryEdit.menuInsert')}
            buttonClassName={OUTLINE_BUTTON}
            items={[
              { label: t('diaryEdit.appendImage'), onSelect: handleAppendPick },
              { label: t('diaryEdit.menuCommon'), onSelect: () => setCommonOpen(true) },
            ]}
          />
          <Dropdown
            label={t('diaryEdit.menuFile')}
            buttonClassName={OUTLINE_BUTTON}
            items={[
              { label: t('diaryEdit.save'), onSelect: () => setSaveOpen(true) },
              {
                label: t('diaryEdit.migrate'),
                onSelect: () => setMigrateOpen(true),
                disabled: !hasDiskEntry,
                title: hasDiskEntry ? t('diaryEdit.migrateHint') : t('diaryEdit.migrateDisabled'),
              },
              {
                label: t('diary.delete'),
                onSelect: () => setConfirmOpen(true),
                danger: true,
              },
            ]}
          />
          <Dropdown
            label={t('diaryEdit.menuTools')}
            buttonClassName={OUTLINE_BUTTON}
            items={[{ label: t('diaryEdit.polish'), onSelect: () => void openPolish() }]}
          />
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
          <span className="whitespace-nowrap">{formatDate(shownDate, t)}</span>
          <span className="px-2 text-center text-ink-muted">{t(weekdayKey(shownDate))}</span>
          {/* 天气跟正文一样是内容：锁定态只读，不给点 */}
          <button
            type="button"
            onClick={() => setWeatherOpen(true)}
            disabled={!editing}
            title={editing ? t('weather.editHint') : undefined}
            className="sticker justify-self-end text-xs disabled:cursor-default disabled:opacity-60"
          >
            {weatherStates.length > 0
              ? `${weatherIcons(weatherStates)} ${weatherText(weatherStates, t)}`
              : t('weather.pending')}
          </button>
        </div>

        <div className="ruled font-hand mt-4 min-h-[50vh] text-sm">
          {editing ? (
            <textarea
              ref={textareaRef}
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
            <button type="button" onClick={() => setSaveOpen(false)} className={GHOST_BUTTON}>
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
            <button type="button" onClick={() => blocker.reset()} className={GHOST_BUTTON}>
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
          confirmLabel={hasDiskEntry ? t('diary.delete') : t('diaryEdit.deleteDraft')}
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

      {appendOpen && appendConfig && (
        <ImageImportDialog
          config={appendConfig}
          onDone={handleAppendDone}
          onCancel={() => setAppendOpen(false)}
        />
      )}

      {commonOpen && (
        <CommonPresetDialog onInsert={insertCommon} onClose={() => setCommonOpen(false)} />
      )}

      {polishOpen && (
        <Modal size="sm" label={t('diaryEdit.polishTitle')} onClose={() => setPolishOpen(false)}>
          <div className="text-sm font-medium">{t('diaryEdit.polishTitle')}</div>
          <p className="mt-1 text-xs text-muted">{t('diaryEdit.polishHint')}</p>

          {polishBusy ? (
            <p className="mt-4 text-sm text-muted">{t('diaryEdit.polishBusy')}</p>
          ) : polishError !== '' ? (
            <p className="mt-4 text-xs text-danger">{polishError}</p>
          ) : (
            <textarea
              value={polishResult}
              onChange={(event) => setPolishResult(event.target.value)}
              rows={12}
              className="font-hand mt-3 w-full resize-y rounded-lg border border-line bg-surface-2 p-3 text-sm text-fg outline-none"
            />
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setPolishOpen(false)} className={GHOST_BUTTON}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={applyPolish}
              disabled={polishBusy || polishResult.trim() === ''}
              className={`${SOLID_BUTTON} disabled:opacity-40`}
            >
              {t('diaryEdit.polishApply')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
