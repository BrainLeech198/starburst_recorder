import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import type { DiaryEntry } from '../../core/db/schema'
import { useToast } from '../../app/providers/ToastProvider'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import {
  dayInfo,
  entryByCode,
  removeEntry,
  restoreEntry,
  setWeather,
  updateContent,
} from './diaryRepo'
import { formatDateCn, weekdayLabel } from '../../core/utils/dateKey'
import WeatherDialog from './WeatherDialog'

/** 顶部两个按钮统一用这套样式 */
const HEADER_BUTTON = 'rounded-lg border px-3 py-1.5 text-sm transition-colors'
const HEADER_BUTTON_IDLE = `${HEADER_BUTTON} border-line text-muted hover:text-fg`

/** 自然段开头的两个方格，占两个字宽，同时形成首行缩进两字 */
function ParagraphMarks() {
  return (
    <span aria-hidden="true" className="inline-flex w-[2em] select-none align-[-0.12em]">
      <span className="h-[1em] w-[1em] border border-line" />
      <span className="-ml-px h-[1em] w-[1em] border border-line" />
    </span>
  )
}

export default function DiaryEditPage() {
  const { code } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
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
    return <p className="p-4 text-sm text-muted">读取中…</p>
  }

  if (entry === null) {
    return (
      <div className="p-4">
        <Link to="/diary" className="text-sm text-brand">
          回到列表
        </Link>
        <p className="mt-4 text-sm text-muted">没有找到这条日记。</p>
      </div>
    )
  }

  const weather = day?.weather ?? ''
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
      message: '已删除这条日记',
      actionLabel: '撤销',
      onAction: () => {
        void restoreEntry(targetId)
      },
    })
    navigate('/diary')
  }

  return (
    <div className="w-full p-4">
      <div className="flex items-center justify-between gap-2">
        <Link to="/diary" className={HEADER_BUTTON_IDLE}>
          回到列表
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className={`${HEADER_BUTTON} border-danger text-danger`}
          >
            删除
          </button>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className={editing ? `${HEADER_BUTTON} border-brand text-brand` : HEADER_BUTTON_IDLE}
          >
            {editing ? '编辑开启' : '锁定开启'}
          </button>
        </div>
      </div>

      {!editing && (
        <p className="mt-4 text-xs text-muted">当前只读。点右上角切换成「编辑开启」即可修改。</p>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-line">
        <div className="flex items-center justify-center gap-2 border-b border-line px-4 py-2 text-sm">
          <span>{formatDateCn(entry.dateKey)}</span>
          <span>{weekdayLabel(entry.dateKey)}</span>
          <button
            type="button"
            onClick={() => setWeatherOpen(true)}
            className="text-brand underline decoration-dotted underline-offset-4"
          >
            （{weather || '天气待填写'}）
          </button>
        </div>

        <div className="ruled min-h-[50vh] px-4 text-sm text-fg">
          {editing ? (
            <textarea
              value={value}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={flush}
              rows={16}
              spellCheck={false}
              className="block w-full resize-none bg-transparent text-fg outline-none"
            />
          ) : value.trim() === '' ? (
            <p className="m-0 text-muted">（还没有内容）</p>
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
          title="确定删除这条日记？"
          description="删除后可以在回收站里找回来。"
          confirmLabel="删除"
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {weatherOpen && (
        <WeatherDialog
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
