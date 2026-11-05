/**
 * 记一次训练：先选入口（一句话 / 点选 / 快速），再填对应的表。
 *
 * 三种入口写的是同一张表，差别只在填了哪些字段：
 * - 点选记：多个动作，每个动作若干组（次数 / 负重 / 休息）
 * - 快速记：一个项目 + 整场时长 + 可选距离，适合有氧、拉伸、球类
 * - 一句话记：模型拆好后回填到点选表单，用户改完再保存
 * 编辑已有记录时直接进点选表单，不再问入口。
 */
import { useState } from 'react'
import type { HealthTraining, TrainingExercise, TrainingKind, TrainingSet } from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import { formatClock } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import Modal from '@/shared/ui/Modal'
import {
  GHOST_BUTTON,
  OUTLINE_BUTTON,
  SOLID_BUTTON,
  SOLID_SMALL_BUTTON,
  choiceTile,
} from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import AiDisclaimer from '@/features/ai/AiDisclaimer'
import { FIELD, INPUT } from '@/shared/ui/inputStyles'
import { useToast } from '@/app/providers/ToastProvider'
import { COMMON_EXERCISES, findExercise, searchExercises } from './exerciseLibrary'
import { latestTraining, saveHealthTraining } from './trainingRepo'
import { analyzeTrainingPhrase } from './trainingPhrase'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'

type Mode = 'mode' | 'pick' | 'quick' | 'phrase'

interface SetDraft {
  reps: string
  weightKg: string
  restSec: string
  rpe: string
}

interface ExerciseDraft {
  id: string
  name: string
  kind: TrainingKind
  muscle: string
  sets: SetDraft[]
  durationMin: string
  distanceKm: string
  note: string
}

const KINDS: TrainingKind[] = ['strength', 'cardio', 'mobility', 'sport', 'other']
const MUSCLES = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'fullBody',
  'cardio',
  'other',
]

function blankSet(): SetDraft {
  return { reps: '', weightKg: '', restSec: '', rpe: '' }
}

function textOf(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

function numberOrNull(text: string, min: number, max: number): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}

function setDraftOf(set: TrainingSet): SetDraft {
  return {
    reps: textOf(set.reps),
    weightKg: textOf(set.weightKg),
    restSec: textOf(set.restSec),
    rpe: textOf(set.rpe),
  }
}

function exerciseDraftOf(exercise: TrainingExercise): ExerciseDraft {
  return {
    id: exercise.id,
    name: exercise.name,
    kind: exercise.kind,
    muscle: exercise.muscle,
    sets: exercise.sets.map(setDraftOf),
    durationMin: textOf(exercise.durationMin),
    distanceKm: textOf(exercise.distanceKm),
    note: exercise.note,
  }
}

function setOfDraft(draft: SetDraft): TrainingSet {
  return {
    reps: numberOrNull(draft.reps, 0, 1000),
    weightKg: numberOrNull(draft.weightKg, 0, 1000),
    durationSec: null,
    restSec: numberOrNull(draft.restSec, 0, 3600),
    rpe: numberOrNull(draft.rpe, 1, 10),
  }
}

/** 小的数字输入：宽度交给父级的网格，桌面上不抢行 */
const NUM_INPUT = `${FIELD} w-full px-1 py-1.5 text-center text-xs tabular-nums`

export default function TrainingForm({
  dateKey,
  training = null,
  onClose,
}: {
  dateKey: string
  /** 传了就是编辑 */
  training?: HealthTraining | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [mode, setMode] = useState<Mode>(training ? 'pick' : 'mode')
  const [error, setError] = useState('')

  // ── 共用字段 ──
  const [time, setTime] = useState(() => training?.time ?? formatClock(Date.now()))
  const [title, setTitle] = useState(training?.title ?? '')
  const [kind, setKind] = useState<TrainingKind>(training?.kind ?? 'strength')
  const [feeling, setFeeling] = useState<number | null>(training?.feeling ?? null)
  const [note, setNote] = useState(training?.note ?? '')
  const [durationText, setDurationText] = useState(textOf(training?.durationMin))

  // ── 点选记 ──
  const [exercises, setExercises] = useState<ExerciseDraft[]>(
    (training?.exercises ?? []).map(exerciseDraftOf),
  )
  const [query, setQuery] = useState('')

  // ── 快速记 ──
  const [quickName, setQuickName] = useState('')
  const [quickKind, setQuickKind] = useState<TrainingKind>('cardio')
  const [quickDuration, setQuickDuration] = useState('')
  const [quickDistance, setQuickDistance] = useState('')

  // ── 一句话记 ──
  const [phrase, setPhrase] = useState('')
  const [phraseBusy, setPhraseBusy] = useState(false)
  const [phraseError, setPhraseError] = useState('')

  const kindName = (value: TrainingKind) => t(`training.kind.${value}` as MessageKey)
  const muscleName = (value: string) => t(`training.muscle.${value}` as MessageKey)

  function addExercise(name: string) {
    const trimmed = name.trim()
    if (trimmed === '') return
    const known = findExercise(trimmed)
    setExercises((current) => [
      ...current,
      {
        id: newId(),
        name: known?.name ?? trimmed,
        kind: known?.kind ?? kind,
        muscle: known?.muscle ?? 'other',
        sets: [blankSet()],
        durationMin: '',
        distanceKm: '',
        note: '',
      },
    ])
    setQuery('')
  }

  function updateExercise(index: number, patch: Partial<ExerciseDraft>) {
    setExercises((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    )
  }

  function updateSet(index: number, setIndex: number, patch: Partial<SetDraft>) {
    setExercises((current) =>
      current.map((item, position) =>
        position === index
          ? {
              ...item,
              sets: item.sets.map((set, at) => (at === setIndex ? { ...set, ...patch } : set)),
            }
          : item,
      ),
    )
  }

  function addSet(index: number) {
    setExercises((current) =>
      current.map((item, position) =>
        position === index
          ? {
              ...item,
              sets: [
                ...item.sets,
                item.sets.length > 0 ? { ...item.sets[item.sets.length - 1] } : blankSet(),
              ],
            }
          : item,
      ),
    )
  }

  function removeSet(index: number, setIndex: number) {
    setExercises((current) =>
      current.map((item, position) =>
        position === index
          ? { ...item, sets: item.sets.filter((_, at) => at !== setIndex) }
          : item,
      ),
    )
  }

  /** 复制上次同动作的组；没有同名动作就给一句提示，不弹错 */
  async function copyLast(index: number) {
    const target = exercises[index]
    if (!target) return
    const last = await latestTraining()
    const same = last?.exercises.find(
      (exercise) => exercise.name.trim() === target.name.trim(),
    )
    if (!same || same.sets.length === 0) {
      showToast({ message: t('training.copyEmpty') })
      return
    }
    updateExercise(index, { sets: same.sets.map(setDraftOf) })
  }

  async function runPhrase() {
    const text = phrase.trim()
    if (text === '' || phraseBusy) return
    const config = loadAiConfig()
    if (!isConfigured(config)) {
      setPhraseError(t('training.phraseFailed'))
      return
    }
    setPhraseBusy(true)
    setPhraseError('')
    try {
      const result = await analyzeTrainingPhrase(config, text, dateKey)
      if (!result.ok || !result.training) {
        setPhraseError(result.error || t('training.phraseEmpty'))
        return
      }
      const parsed = result.training
      setKind(parsed.kind)
      setTitle(parsed.title)
      setTime(parsed.time)
      setDurationText(textOf(parsed.durationMin))
      setFeeling(parsed.feeling)
      setNote(parsed.note)
      setExercises(parsed.exercises.map(exerciseDraftOf))
      setMode('pick')
    } catch (failure) {
      setPhraseError((failure as Error).message || t('training.phraseFailed'))
    } finally {
      setPhraseBusy(false)
    }
  }

  async function save() {
    setError('')
    if (mode === 'quick') {
      const minutes = numberOrNull(quickDuration, 0, 1440)
      const distance = numberOrNull(quickDistance, 0, 1000)
      if (quickKind === 'cardio' && minutes === null && distance === null) {
        setError(t('training.empty'))
        return
      }
      const now = Date.now()
      const base = training ?? {
        id: newId(),
        code: newCode(),
        dateKey,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      const name = quickName.trim() || kindName(quickKind)
      await saveHealthTraining({
        ...base,
        time,
        kind: quickKind,
        title: quickName.trim(),
        exercises: [
          {
            id: newId(),
            name,
            kind: quickKind,
            muscle: quickKind === 'cardio' ? 'cardio' : 'fullBody',
            sets: [],
            durationMin: minutes,
            distanceKm: distance,
            note: '',
          },
        ],
        durationMin: minutes,
        feeling,
        note,
      })
      showToast({ message: t(training ? 'training.updated' : 'training.saved') })
      onClose()
      return
    }

    const drafts = exercises.filter((item) => item.name.trim() !== '')
    const filled: TrainingExercise[] = drafts.map((item) => ({
      id: item.id || newId(),
      name: item.name.trim(),
      kind: item.kind,
      muscle: item.muscle,
      sets: item.sets.map(setOfDraft).filter((set) => hasSetValue(set)),
      durationMin: numberOrNull(item.durationMin, 0, 1440),
      distanceKm: numberOrNull(item.distanceKm, 0, 1000),
      note: item.note.trim(),
    }))

    // 只记了时长、只记了动作名、只记了备注都算合法记录；完全空白才拦
    const minutes = numberOrNull(durationText, 0, 1440)
    if (filled.length === 0 && minutes === null && note.trim() === '') {
      setError(t('training.empty'))
      return
    }

    const now = Date.now()
    const base = training ?? {
      id: newId(),
      code: newCode(),
      dateKey,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await saveHealthTraining({
      ...base,
      time,
      kind,
      title: title.trim(),
      exercises: filled,
      durationMin: minutes,
      feeling,
      note: note.trim(),
    })
    showToast({ message: t(training ? 'training.updated' : 'training.saved') })
    onClose()
  }

  const results = query.trim() === '' ? COMMON_EXERCISES : searchExercises(query, 8)

  return (
    <Modal size="lg" label={training ? t('training.editTitle') : t('training.add')} onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base font-medium text-fg">
          {training ? t('training.editTitle') : t('training.add')}
        </h2>
        {mode !== 'mode' && !training && (
          <button
            type="button"
            onClick={() => setMode('mode')}
            className="rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
          >
            {t('training.chooseMode')}
          </button>
        )}
      </div>

      {mode === 'mode' && (
        <div className="mt-4 space-y-2">
          <p className="m-0 text-xs text-muted">{t('training.chooseMode')}</p>
          {(
            [
              ['phrase', 'training.modePhrase', 'training.modePhraseHint'],
              ['pick', 'training.modePick', 'training.modePickHint'],
              ['quick', 'training.modeQuick', 'training.modeQuickHint'],
            ] as const
          ).map(([next, label, hint]) => (
            <button
              key={next}
              type="button"
              onClick={() => setMode(next)}
              className={`${SOLID_BUTTON} w-full flex-col gap-0`}
            >
              <span>{t(label)}</span>
              <span className="text-[11px] font-normal text-on-brand/80">{t(hint)}</span>
            </button>
          ))}
        </div>
      )}

      {mode === 'phrase' && (
        <div className="mt-4 space-y-2">
          <textarea
            autoFocus
            value={phrase}
            onChange={(event) => {
              setPhrase(event.target.value)
              setPhraseError('')
            }}
            rows={3}
            placeholder={t('training.phraseHint')}
            className={`${INPUT} w-full resize-none`}
          />
          {phraseError !== '' && <p className="m-0 text-xs text-danger">{phraseError}</p>}
          <button
            type="button"
            disabled={phraseBusy || phrase.trim() === ''}
            onClick={() => void runPhrase()}
            className={`${SOLID_BUTTON} w-full disabled:opacity-40`}
          >
            <Icon name="sparkles" />
            {phraseBusy ? t('training.phraseParsing') : t('training.confirm')}
          </button>
          <button type="button" onClick={() => setMode('pick')} className={`${OUTLINE_BUTTON} w-full`}>
            {t('training.phraseManual')}
          </button>
          <AiDisclaimer />
        </div>
      )}

      {mode === 'quick' && (
        <div className="mt-4 space-y-3">
          <div>
            <span className="text-xs text-muted">{t('training.kindLabel')}</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {KINDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={quickKind === value}
                  onClick={() => setQuickKind(value)}
                  className={choiceTile(quickKind === value, 'px-2.5 py-1.5 text-xs')}
                >
                  {kindName(value)}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-muted">{t('training.quickName')}</span>
            <input
              value={quickName}
              onChange={(event) => setQuickName(event.target.value)}
              placeholder={t('training.quickPlaceholder')}
              className={`${INPUT} mt-1 w-full`}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted">{t('training.totalDuration')}</span>
              <input
                value={quickDuration}
                inputMode="decimal"
                onChange={(event) => setQuickDuration(event.target.value)}
                placeholder={t('training.durationMin')}
                className={`${INPUT} mt-1 w-full tabular-nums`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">{t('training.distanceKm')}</span>
              <input
                value={quickDistance}
                inputMode="decimal"
                onChange={(event) => setQuickDistance(event.target.value)}
                placeholder="km"
                className={`${INPUT} mt-1 w-full tabular-nums`}
              />
            </label>
          </div>
          <TimeRow time={time} onTime={setTime} />
          <FeelingRow feeling={feeling} onChange={setFeeling} />
          <label className="block">
            <span className="text-xs text-muted">{t('training.note')}</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className={`${INPUT} mt-1 w-full resize-none`}
            />
          </label>
        </div>
      )}

      {mode === 'pick' && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-muted">{t('training.time')}</span>
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className={`${INPUT} mt-1 w-full tabular-nums`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">{t('training.totalDuration')}</span>
              <input
                value={durationText}
                inputMode="decimal"
                onChange={(event) => setDurationText(event.target.value)}
                placeholder={t('training.durationMin')}
                className={`${INPUT} mt-1 w-full tabular-nums`}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-muted">{t('training.titleField')}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={`${INPUT} mt-1 w-full`}
            />
          </label>

          <div>
            <span className="text-xs text-muted">{t('training.kindLabel')}</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {KINDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                  className={choiceTile(kind === value, 'px-2.5 py-1.5 text-xs')}
                >
                  {kindName(value)}
                </button>
              ))}
            </div>
          </div>

          {/* 动作搜索：没输入时给常用八个，输入后按中文名与英文别名搜 */}
          <div>
            <span className="text-xs text-muted">{t('training.addExercise')}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('training.searchExercise')}
              className={`${INPUT} mt-1 w-full`}
            />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {query.trim() !== '' && (
                <button
                  type="button"
                  onClick={() => addExercise(query)}
                  className={choiceTile(false, 'border-brand px-2.5 py-1.5 text-xs text-brand')}
                >
                  {t('training.custom')}「{query.trim()}」
                </button>
              )}
              {results.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => addExercise(item.name)}
                  className={choiceTile(false, 'px-2.5 py-1.5 text-xs')}
                >
                  {item.name}
                </button>
              ))}
            </div>
            {query.trim() === '' && (
              <p className="m-0 mt-1 text-[11px] text-muted">{t('training.common')}</p>
            )}
          </div>

          {exercises.length === 0 ? (
            <p className="m-0 rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
              {t('training.noExercises')}
            </p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {exercises.map((item, index) => (
                <li key={item.id} className="rounded-xl border border-line bg-surface-2 p-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      value={item.name}
                      aria-label={t('training.addExercise')}
                      onChange={(event) => updateExercise(index, { name: event.target.value })}
                      className={`${INPUT} min-w-0 flex-1 text-sm`}
                    />
                    <button
                      type="button"
                      aria-label={t('training.removeExercise')}
                      onClick={() =>
                        setExercises((current) => current.filter((_, at) => at !== index))
                      }
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-danger"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <select
                      value={item.kind}
                      aria-label={t('training.exerciseType')}
                      onChange={(event) =>
                        updateExercise(index, { kind: event.target.value as TrainingKind })
                      }
                      className={`${FIELD} px-1.5 py-1 text-xs`}
                    >
                      {KINDS.map((value) => (
                        <option key={value} value={value}>
                          {kindName(value)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={item.muscle}
                      aria-label={t('training.targetArea')}
                      onChange={(event) => updateExercise(index, { muscle: event.target.value })}
                      className={`${FIELD} px-1.5 py-1 text-xs`}
                    >
                      {MUSCLES.map((value) => (
                        <option key={value} value={value}>
                          {muscleName(value)}
                        </option>
                      ))}
                    </select>
                    <input
                      value={item.durationMin}
                      inputMode="decimal"
                      aria-label={t('training.durationMin')}
                      placeholder={t('training.durationMin')}
                      onChange={(event) =>
                        updateExercise(index, { durationMin: event.target.value })
                      }
                      className={`${FIELD} w-20 px-1.5 py-1 text-xs tabular-nums`}
                    />
                    <input
                      value={item.distanceKm}
                      inputMode="decimal"
                      aria-label={t('training.distanceKm')}
                      placeholder="km"
                      onChange={(event) =>
                        updateExercise(index, { distanceKm: event.target.value })
                      }
                      className={`${FIELD} w-16 px-1.5 py-1 text-xs tabular-nums`}
                    />
                  </div>

                  {item.sets.length > 0 && (
                    <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1 text-[10px] text-muted">
                      <span className="text-center">{t('training.reps')}</span>
                      <span className="text-center">{t('training.weightKg')}</span>
                      <span className="text-center">{t('training.restSec')}</span>
                      <span className="text-center">{t('training.rpe')}</span>
                      <span className="w-7" />
                    </div>
                  )}
                  <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                    {item.sets.map((set, setIndex) => (
                      <li
                        key={setIndex}
                        className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-1"
                      >
                        <input
                          value={set.reps}
                          inputMode="numeric"
                          aria-label={t('training.reps')}
                          onChange={(event) =>
                            updateSet(index, setIndex, { reps: event.target.value })
                          }
                          className={NUM_INPUT}
                        />
                        <input
                          value={set.weightKg}
                          inputMode="decimal"
                          aria-label={t('training.weightKg')}
                          onChange={(event) =>
                            updateSet(index, setIndex, { weightKg: event.target.value })
                          }
                          className={NUM_INPUT}
                        />
                        <input
                          value={set.restSec}
                          inputMode="numeric"
                          aria-label={t('training.durationMin')}
                          onChange={(event) =>
                            updateSet(index, setIndex, { restSec: event.target.value })
                          }
                          className={NUM_INPUT}
                        />
                        <input
                          value={set.rpe}
                          inputMode="numeric"
                          aria-label={t('training.rpe')}
                          onChange={(event) =>
                            updateSet(index, setIndex, { rpe: event.target.value })
                          }
                          className={NUM_INPUT}
                        />
                        <button
                          type="button"
                          aria-label={t('training.deleteSet')}
                          onClick={() => removeSet(index, setIndex)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-xs text-muted transition-colors hover:text-danger"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => addSet(index)}
                      className={SOLID_SMALL_BUTTON}
                    >
                      <Icon name="plus" />
                      {t('training.addSet')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyLast(index)}
                      className={`${OUTLINE_BUTTON} px-2 py-1 text-xs`}
                    >
                      <Icon name="copy" />
                      {t('training.copyLast')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <FeelingRow feeling={feeling} onChange={setFeeling} />

          <label className="block">
            <span className="text-xs text-muted">{t('training.note')}</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className={`${INPUT} mt-1 w-full resize-none`}
            />
          </label>
        </div>
      )}

      {error !== '' && <p className="m-0 mt-3 text-xs text-danger">{error}</p>}

      {mode !== 'mode' && mode !== 'phrase' && (
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={GHOST_BUTTON}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => void save()} className={SOLID_BUTTON}>
            <Icon name="check" />
            {t('training.save')}
          </button>
        </div>
      )}
    </Modal>
  )
}

function hasSetValue(set: TrainingSet) {
  return (
    set.reps !== null ||
    set.weightKg !== null ||
    set.restSec !== null ||
    set.rpe !== null
  )
}

function TimeRow({ time, onTime }: { time: string; onTime: (next: string) => void }) {
  const { t } = useI18n()
  return (
    <label className="block">
      <span className="text-xs text-muted">{t('training.time')}</span>
      <input
        type="time"
        value={time}
        onChange={(event) => onTime(event.target.value)}
        className={`${INPUT} mt-1 w-full tabular-nums`}
      />
    </label>
  )
}

function FeelingRow({
  feeling,
  onChange,
}: {
  feeling: number | null
  onChange: (next: number | null) => void
}) {
  const { t } = useI18n()
  return (
    <div>
      <span className="text-xs text-muted">{t('training.feeling')}</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={feeling === value}
            onClick={() => onChange(feeling === value ? null : value)}
            className={choiceTile(feeling === value, 'h-8 w-8 text-center text-xs tabular-nums')}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  )
}
