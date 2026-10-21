import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryEntry } from '@/core/db/schema'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import { BACK_BUTTON, SOLID_BUTTON, SOLID_DANGER } from '@/shared/ui/buttonStyles'
import {
  dayInfo,
  entryByCode,
  removeEntry,
  restoreEntry,
  setWeather,
  updateContent,
} from './diaryRepo'
import { formatDateCn, weekdayLabel } from '@/core/utils/dateKey'
import { parseWeather, weatherIcons, weatherLabel } from './weather'
import WeatherDialog from './WeatherDialog'

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
  const startEditable = (location.state as { editable?: boolean } | null)?.editable === true

  const [editing, setEditing] = useState(startEditable)
  const [draft, setDraft] = useState<string | null>(null)
  const [weatherOpen, setWeatherOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const entry = useLiveQuery(async (): Promise<DiaryEntry | null> => {
    if (!code) return null
    return (await entryByCode(code)) ?? null
  }, [code])

  const day = useLiveQuery(async () => {
    if (!entry) return null
    return (await dayInfo(entry.dateKey)) ?? null
  }, [entry?.dateKey])

  const entryId = entry?.id

  // 打字停顿即自动保存
  useEffect(() => {
    if (draft === null || !entryId) return
    const timer = setTimeout(() => {
      void updateContent(entryId, draft)
    }, 600)
    return () => clearTimeout(timer)
  }, [draft, entryId])

  if (entry === undefined) {
    return <p className="p-4 text-sm text-muted">{t('common.reading')}</p>
  }

  if (entry === null) {
    return (
      <div className="p-4">
        <Link to="/diary" className="text-sm text-brand">
          {t('diaryEdit.backLink')}
        </Link>
        <p className="mt-4 text-sm text-muted">{t('diaryEdit.notFound')}</p>
      </div>
    )
  }

  const weather = day?.weather ?? ''
  const weatherStates = parseWeather(weather)
  const value = draft ?? entry.content
  const paragraphs = value.split('\n')

  function flush() {
    if (draft !== null && entryId) void updateContent(entryId, draft)
  }

  async function handleDelete() {
    if (!entry) return
    setConfirmOpen(false)
    const targetId = entry.id
    await removeEntry(targetId)
    showToast({
      message: t('diary.deletedOne'),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void restoreEntry(targetId)
      },
    })
    navigate('/diary')
  }

  return (
    <div className="w-full p-4">
      {/* 顶上一整行都是功能按钮（返回 / 删除 / 编辑），所以套一层底色跟下面的纸分开 */}
      <ToolbarRow>
        <Link to="/diary" className={BACK_BUTTON}>
          {t('diaryEdit.back')}
        </Link>
        <div className="flex items-center gap-2">
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
          <span className="whitespace-nowrap">{formatDateCn(entry.dateKey)}</span>
          <span className="px-2 text-center text-ink-muted">{weekdayLabel(entry.dateKey)}</span>
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
              onChange={(event) => setDraft(event.target.value)}
              onBlur={flush}
              rows={16}
              spellCheck={false}
              // field-sizing-content：输入框跟着内容长高，整页滚动，而不是框内自己滚。
              // 框内自己滚有三个毛病：横线格与文字对不上、手机上在框里拖动会"卡住"、
              // 长日记变成两层滚动。rows={16} 留着给不支持的老引擎兜底。
              className="field-sizing-content block w-full resize-none bg-transparent text-ink outline-none"
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

      {confirmOpen && (
        <ConfirmDialog
          title={t('diary.deleteThisTitle')}
          description={t('diary.deleteThisBody')}
          confirmLabel={t('diary.delete')}
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {weatherOpen && (
        <WeatherDialog
          dateKey={entry.dateKey}
          value={weather}
          onConfirm={async (next) => {
            await setWeather(entry.dateKey, next)
            setWeatherOpen(false)
          }}
          onCancel={() => setWeatherOpen(false)}
        />
      )}
    </div>
  )
}
