/**
 * 一张待确认的动作卡片。
 *
 * 助手的写操作都先落在这里：写清楚「要记什么」，用户点确认才真的写库；
 * 写完之后还能撤销。卡片状态跟着对话一起存档，刷新后不会变成一团空白。
 *
 * 确认前可以直接改数字和内容：不然「米饭 150 克记成 250 克」得先写入再走一轮
 * update，既多绕一次模型、也多一条容易记错的中间状态。
 */
import { useState } from 'react'
import { formatDate } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import type { AssistantMemoryKind } from './assistantMemory'
import type { ChatActionState } from './assistantChatStore'
import type { AssistantAction } from './assistantActionBuild'
import { applyEdits, draftOf, draftValid, editFields } from './assistantActionEdit'
import { isDeleteKind } from './assistantPermission'
import { categoryKey } from '@/features/finance/financeCategories'
import { INPUT } from '@/shared/ui/inputStyles'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'

const KIND_KEYS: Record<AssistantMemoryKind, MessageKey> = {
  preference: 'memory.kind.preference',
  goal: 'memory.kind.goal',
  habit: 'memory.kind.habit',
  fact: 'memory.kind.fact',
}

const STATUS_KEYS: Record<ChatActionState['status'], MessageKey> = {
  pending: 'assistant.action.pending',
  done: 'assistant.action.done',
  undone: 'assistant.action.undone',
  canceled: 'assistant.action.canceled',
  failed: 'assistant.action.failed',
}

interface Props {
  state: ChatActionState
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  onUndo: () => void
  /** 确认前改内容：只替换这张卡片里的动作，不写库 */
  onEdit?: (next: AssistantAction) => void
}

/** 卡片只做预览：日记正文可能很长，别把整个对话撑成一张纸 */
function preview(text: string, max = 600) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export default function AssistantActionCard({
  state,
  busy,
  onConfirm,
  onCancel,
  onUndo,
  onEdit,
}: Props) {
  const { t } = useI18n()
  const { action } = state
  const fields = editFields(action)
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const date = 'dateKey' in action ? formatDate(action.dateKey, t) : ''

  const body = (() => {
    switch (action.kind) {
      case 'scheduleCreate': {
        const days = action.weeklyDays.map((day) => t((`date.weekdayShort${day % 7}`) as MessageKey)).join('、')
        const repeat = action.repeat === 'daily'
          ? t('schedule.everyDay')
          : action.repeat === 'weekly'
            ? t('schedule.everyWeek', { days })
            : t('schedule.onlyOnce')
        return `${t('schedule.addTitle')} · ${date}${action.time ? ` ${action.time}` : ''} · ${preview(action.title)} · ${repeat}${action.remind ? ` · ${t('schedule.remindOn')}` : ''}${action.note ? ` · ${preview(action.note, 100)}` : ''}`
      }
      case 'scheduleEdit': {
        const details = [
          action.newDateKey ? `${t('schedule.fieldDate')} ${formatDate(action.newDateKey, t)}` : '',
          action.time === undefined ? '' : `${t('schedule.fieldTime')} ${action.time || '—'}`,
          action.newTitle ? `${t('schedule.fieldTitle')} ${preview(action.newTitle)}` : '',
          action.note === undefined ? '' : `${t('schedule.fieldNote')} ${preview(action.note, 100) || '—'}`,
          action.repeat ? `${t('schedule.fieldRepeat')} ${t(action.repeat === 'daily' ? 'schedule.repeatDaily' : action.repeat === 'weekly' ? 'schedule.repeatWeekly' : 'schedule.repeatNone')}` : '',
          action.weeklyDays?.length ? action.weeklyDays.map((day) => t((`date.weekdayShort${day % 7}`) as MessageKey)).join('、') : '',
          action.remind === undefined ? '' : `${t('schedule.fieldRemind')} ${action.remind ? t('schedule.remindOn') : '—'}`,
        ].filter(Boolean).join(' · ')
        return `${t('schedule.editTitle')} · ${date} · ${preview(action.title)}（${action.code}） · ${details}`
      }
      case 'scheduleDelete':
        return `${t('schedule.deleteTitle')} · ${date} · ${preview(action.title)}（${action.code}）`
      case 'memory':
        return t('assistant.action.memory', { text: preview(action.text) })
      case 'finance':
        return t('assistant.action.finance', {
          date,
          direction: t(
            action.direction === 'income'
              ? 'assistant.action.financeIncome'
              : 'assistant.action.financeExpense',
          ),
          name: action.name,
          amount: action.amount,
        })
      case 'stamp':
        return t('assistant.action.stamp', {
          date,
          time: action.time,
          content: preview(action.content),
        })
      case 'diary':
        return t('assistant.action.diary', { date, content: preview(action.content) })
      case 'sleep':
        return `${t('assistant.action.sleep', {
          date,
          bedtime: action.bedtime,
          wakeTime: action.wakeTime,
        })}${
          action.quality === null
            ? ''
            : t('assistant.action.sleepQuality', { quality: action.quality })
        }`
      case 'weigh':
        return t('assistant.action.weigh', { date, weight: action.weightKg })
      case 'weighEdit':
        return `${t('assistant.action.weigh', { date, weight: action.weightKg })}（${action.previousKg} → ${action.weightKg} kg）`
      case 'intake':
        return t('assistant.action.intake', {
          date,
          time: action.time,
          name: action.name,
          grams: action.grams,
          kcal: action.kcal,
        })
      case 'training': {
        const detail = action.exercises
          .map((exercise) => {
            const sets = exercise.sets
              .map((set) => {
                const reps = set.reps === null ? '—' : String(set.reps)
                const weight = set.weightKg === null ? '' : `×${set.weightKg}`
                return `${reps}${weight}`
              })
              .join('/')
            return sets === '' ? exercise.name : `${exercise.name} ${sets}`
          })
          .join('，')
        return `${t('training.actionAdd')} · ${date} ${action.time}${
          detail === '' ? '' : ` · ${detail}`
        }`
      }
      case 'trainingEdit': {
        const detail = [
          action.time ?? '',
          action.title ?? '',
          action.durationMin === undefined ? '' : `${action.durationMin} min`,
          action.note ?? '',
        ]
          .filter((part) => part !== '')
          .join(' · ')
        return `${t('training.actionUpdate')}（${action.code}）${detail === '' ? '' : ` · ${detail}`}`
      }
      case 'trainingDelete':
        return `${t('training.actionDelete')} · ${date} · ${action.label}`
      case 'profileCreate':
      case 'profileEdit': {
        const fields = [
          action.sex === undefined ? '' : `${t('profile.sex')} ${t(action.sex === 'male' ? 'profile.male' : 'profile.female')}`,
          action.age === undefined ? '' : `${t('profile.age')} ${action.age}`,
          action.heightCm === undefined ? '' : `${t('profile.height')} ${action.heightCm}`,
          action.weightKg === undefined ? '' : `${t('profile.weight')} ${action.weightKg}`,
          action.activity === undefined ? '' : `${t('profile.activity')} ${t(({
            sedentary: 'profile.activitySedentary', light: 'profile.activityLight',
            moderate: 'profile.activityModerate', high: 'profile.activityHigh',
          } as const)[action.activity])}`,
          action.tdee === undefined ? '' : `${t('profile.tdee')} ${action.tdee}`,
          action.targetKcal === undefined ? '' : `${t('profile.target')} ${action.targetKcal}`,
          action.proteinTarget === undefined ? '' : `${t('profile.proteinTarget')} ${action.proteinTarget}`,
          action.idealBedtime === undefined ? '' : `${t('health.idealBedtime')} ${action.idealBedtime}`,
          action.idealWakeTime === undefined ? '' : `${t('health.idealWake')} ${action.idealWakeTime}`,
          action.note === undefined ? '' : `${t('profile.note')} ${preview(action.note, 100)}`,
        ].filter(Boolean)
        return `${t('profile.title')} · ${fields.join(' · ')}`
      }
      case 'profileDelete':
        return `${t('assistant.action.deleteTitle')} · ${t('profile.title')} · ${t('health.trendHistory')} ${action.weighCount}`
      case 'diaryEdit':
        return t('assistant.action.diaryEdit', { date, content: preview(action.content) })
      case 'stampEdit': {
        const detail = [action.time ?? '', action.content ? preview(action.content) : '']
          .filter((part) => part !== '')
          .join(' · ')
        return t('assistant.action.stampEdit', { date, detail })
      }
      case 'financeEdit': {
        const detail = [
          action.name ?? '',
          action.amount === undefined ? '' : String(action.amount),
          action.direction === undefined
            ? ''
            : t(
                action.direction === 'income'
                  ? 'assistant.action.financeIncome'
                  : 'assistant.action.financeExpense',
              ),
          action.category === undefined ? '' : t(categoryKey(action.category)),
          action.note ?? '',
        ]
          .filter((part) => part !== '')
          .join(' · ')
        return t('assistant.action.financeEdit', { date, detail })
      }
      case 'financeDelete':
        return t('assistant.action.financeDelete', {
          date,
          name: action.name,
          amount: action.amount,
        })
      case 'stampDelete':
        return t('assistant.action.stampDelete', { date, content: preview(action.content) })
      case 'intakeDelete':
        return t('assistant.action.intakeDelete', { date, name: action.name, kcal: action.kcal })
      case 'sleepDelete':
        return t('assistant.action.sleepDelete', {
          date,
          bedtime: action.bedtime,
          wakeTime: action.wakeTime,
        })
    }
  })()

  const isEdit = action.kind.endsWith('Edit')
  /** 删除标题走和权限层同一份名单，别让显示与确认策略各认一套 */
  const isDelete = isDeleteKind(action.kind)

  const pending = state.status === 'pending' || state.status === 'failed'
  const tone = pending
    ? 'border-brand/50 bg-brand/5'
    : state.status === 'done'
      ? 'border-line bg-surface-2'
      : 'border-line bg-surface opacity-70'

  /** 只有还没写入的卡片能改；已经写进去的只能撤销，改要走 update 流程 */
  const canEdit = Boolean(onEdit) && fields.length > 0 && pending
  const editing = draft !== null && canEdit
  const valid = draft !== null && draftValid(fields, draft)

  function saveEdits() {
    if (!draft || !onEdit) return
    const next = applyEdits(action, draft)
    if (!next) return
    onEdit(next)
    setDraft(null)
  }

  return (
    <div className={`w-full rounded-xl border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-brand">
          {action.kind === 'memory'
            ? t('assistant.action.memoryKind', {
                kind: t(KIND_KEYS[action.memoryKind]),
              })
            : isDelete
              ? t('assistant.action.deleteTitle')
              : isEdit
                ? t('assistant.action.editTitle')
                : t('assistant.action.title')}
        </span>
        <span
          className={`rounded-full border border-line px-2 py-0.5 text-[10px] ${
            state.status === 'done'
              ? 'text-brand'
              : state.status === 'failed'
                ? 'text-danger'
                : 'text-muted'
          }`}
        >
          {t(STATUS_KEYS[state.status])}
        </span>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          {fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-[11px] text-muted">
              <span>{t(field.label)}</span>
              {field.kind === 'textarea' ? (
                <textarea
                  rows={4}
                  value={draft?.[field.key] ?? ''}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, [field.key]: event.target.value } : current,
                    )
                  }
                  className={`${INPUT} text-sm`}
                />
              ) : (
                <input
                  type={field.kind}
                  step={field.step}
                  value={draft?.[field.key] ?? ''}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, [field.key]: event.target.value } : current,
                    )
                  }
                  className={`${INPUT} text-sm`}
                />
              )}
            </label>
          ))}
          {!valid && <p className="m-0 text-[11px] text-danger">{t('assistant.edit.invalid')}</p>}
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-fg">{body}</p>
      )}

      {action.kind === 'sleep' && action.overwrite && (
        <p className="mt-1 text-[11px] text-warning">{t('assistant.action.sleepOverwrite')}</p>
      )}
      {state.error && <p className="mt-1 text-[11px] text-danger">{state.error}</p>}

      {editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveEdits}
            disabled={busy || !valid}
            className={`${SOLID_BUTTON} disabled:opacity-50`}
          >
            {t('assistant.edit.save')}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className={OUTLINE_BUTTON}
          >
            {t('assistant.edit.cancel')}
          </button>
        </div>
      ) : null}

      {state.status === 'pending' && !editing && (
        <>
          <p className="mt-1.5 text-[11px] text-muted">{t('assistant.action.note')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`${SOLID_BUTTON} disabled:opacity-50`}
            >
              <Icon name="check" />
              {t('assistant.action.confirm')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={`${OUTLINE_BUTTON} disabled:opacity-50`}
            >
              {t('assistant.action.cancel')}
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setDraft(draftOf(action))}
                disabled={busy}
                className="inline-flex min-h-11 items-center text-[11px] text-muted transition-colors hover:text-brand disabled:opacity-50 md:min-h-0"
              >
                {t('assistant.edit.open')}
              </button>
            )}
          </div>
        </>
      )}

      {state.status === 'failed' && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`${OUTLINE_BUTTON} disabled:opacity-50`}
          >
            {t('assistant.retry')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-11 items-center text-[11px] text-muted transition-colors hover:text-fg md:min-h-0"
          >
            {t('assistant.action.cancel')}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setDraft(draftOf(action))}
              disabled={busy}
              className="inline-flex min-h-11 items-center text-[11px] text-muted transition-colors hover:text-brand disabled:opacity-50 md:min-h-0"
            >
              {t('assistant.edit.open')}
            </button>
          )}
        </div>
      )}

      {state.status === 'done' && (
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          className="mt-2 inline-flex min-h-11 items-center text-[11px] text-muted transition-colors hover:text-danger disabled:opacity-50 md:min-h-0"
        >
          {t('assistant.action.undo')}
        </button>
      )}
    </div>
  )
}
