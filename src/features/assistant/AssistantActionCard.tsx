/**
 * 一张待确认的动作卡片。
 *
 * 助手的写操作都先落在这里：写清楚「要记什么」，用户点确认才真的写库；
 * 写完之后还能撤销。卡片状态跟着对话一起存档，刷新后不会变成一团空白。
 */
import { formatDate } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import type { AssistantMemoryKind } from './assistantMemory'
import type { ChatActionState } from './assistantChatStore'
import { categoryKey } from '@/features/finance/financeCategories'
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
}

/** 卡片只做预览：日记正文可能很长，别把整个对话撑成一张纸 */
function preview(text: string, max = 600) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export default function AssistantActionCard({ state, busy, onConfirm, onCancel, onUndo }: Props) {
  const { t } = useI18n()
  const { action } = state
  const date = 'dateKey' in action ? formatDate(action.dateKey, t) : ''

  const body = (() => {
    switch (action.kind) {
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
  const isDelete = action.kind.endsWith('Delete')

  const pending = state.status === 'pending' || state.status === 'failed'
  const tone = pending
    ? 'border-brand/50 bg-brand/5'
    : state.status === 'done'
      ? 'border-line bg-surface-2'
      : 'border-line bg-surface opacity-70'

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

      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-fg">{body}</p>

      {action.kind === 'sleep' && action.overwrite && (
        <p className="mt-1 text-[11px] text-warning">{t('assistant.action.sleepOverwrite')}</p>
      )}
      {state.error && <p className="mt-1 text-[11px] text-danger">{state.error}</p>}

      {state.status === 'pending' && (
        <>
          <p className="mt-1.5 text-[11px] text-muted">{t('assistant.action.note')}</p>
          <div className="mt-2 flex items-center gap-2">
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
          </div>
        </>
      )}

      {state.status === 'failed' && (
        <div className="mt-2 flex items-center gap-2">
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
            className="text-[11px] text-muted transition-colors hover:text-fg"
          >
            {t('assistant.action.cancel')}
          </button>
        </div>
      )}

      {state.status === 'done' && (
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          className="mt-2 text-[11px] text-muted transition-colors hover:text-danger disabled:opacity-50"
        >
          {t('assistant.action.undo')}
        </button>
      )}
    </div>
  )
}
