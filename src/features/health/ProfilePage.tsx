import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router'
import type { HealthActivity, HealthProfile, HealthSex } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON, OUTLINE_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import {
  ACTIVITY_FACTORS,
  activityFromQuestions,
  bmr,
  estimateTdee,
  missingProfileFields,
  suggestProteinForPlan,
} from './healthMath'
import { healthProfile, saveHealthProfile } from './healthRepo'
import ActivityAiDialog from './ActivityAiDialog'

/** 五个计划预设：只改目标热量、蛋白系数和那段说明，TDEE 是身体数据，不跟着计划动 */
const PRESETS = [
  { key: 'maintain', label: 'profile.planMaintain', note: 'profile.noteMaintain', factor: 1 },
  { key: 'cut', label: 'profile.planCut', note: 'profile.noteCut', factor: 0.87 },
  { key: 'bulk', label: 'profile.planBulk', note: 'profile.noteBulk', factor: 1.12 },
  { key: 'lowCarb', label: 'profile.planLowCarb', note: 'profile.noteLowCarb', factor: 0.88 },
  { key: 'steady', label: 'profile.planSteady', note: 'profile.noteSteady', factor: 0.92 },
] as const

const ACTIVITIES = [
  { key: 'sedentary', label: 'profile.activitySedentary', desc: 'profile.activitySedentaryDesc' },
  { key: 'light', label: 'profile.activityLight', desc: 'profile.activityLightDesc' },
  { key: 'moderate', label: 'profile.activityModerate', desc: 'profile.activityModerateDesc' },
  { key: 'high', label: 'profile.activityHigh', desc: 'profile.activityHighDesc' },
] as const

/** 情况标签：只是快捷输入，点一下把整句写进「情况说明」，AI 读的是那段文字 */
const NOTE_SNIPPETS = [
  'profile.snipDesk',
  'profile.snipStand',
  'profile.snipLate',
  'profile.snipIrregular',
  'profile.snipTakeout',
  'profile.snipCook',
  'profile.snipOutside',
  'profile.snipGym',
  'profile.snipCardio',
  'profile.snipLactose',
  'profile.snipAllergy',
  'profile.snipVeg',
] as const

/** 空串算没填，填坏了就当没填，别把 NaN 写进库 */
function parseNumber(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : null
}

function asText(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

interface Draft {
  sex: HealthSex | null
  age: string
  height: string
  weight: string
  activity: HealthActivity | null
  tdee: string
  target: string
  protein: string
  plan: string
  note: string
}

const BLANK: Draft = {
  sex: null,
  age: '',
  height: '',
  weight: '',
  activity: null,
  tdee: '',
  target: '',
  protein: '',
  plan: '',
  note: '',
}

function draftOf(profile: HealthProfile | undefined): Draft {
  if (!profile) return BLANK
  return {
    sex: profile.sex,
    age: asText(profile.age),
    height: asText(profile.heightCm),
    weight: asText(profile.weightKg),
    activity: profile.activity,
    tdee: asText(profile.tdee),
    target: asText(profile.targetKcal),
    protein: asText(profile.proteinTarget),
    plan: profile.plan,
    note: profile.note,
  }
}

/** 带 +/− 的数字输入：比纯键盘敲数字快，年龄/身高/体重都用它 */
function Stepper({
  value,
  onChange,
  step = 1,
  inputMode = 'numeric',
  suffix,
}: {
  value: string
  onChange: (next: string) => void
  step?: number
  inputMode?: 'numeric' | 'decimal'
  suffix?: string
}) {
  function bump(delta: number) {
    const current = Number(value)
    const base = Number.isFinite(current) && current > 0 ? current : 0
    const next = Math.max(0, Math.round((base + delta) * 100) / 100)
    onChange(String(next === 0 ? '' : next))
  }
  return (
    <div className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={() => bump(-step)}
        className="w-9 shrink-0 rounded-lg border border-line text-lg text-muted transition-colors hover:text-fg"
        aria-label="−"
      >
        −
      </button>
      <div className="relative flex-1">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode={inputMode}
          className={`${INPUT} pr-8 text-center`}
        />
        {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
      </div>
      <button
        type="button"
        onClick={() => bump(step)}
        className="w-9 shrink-0 rounded-lg border border-line text-lg text-muted transition-colors hover:text-fg"
        aria-label="+"
      >
        +
      </button>
    </div>
  )
}

/** 身体档案：填完这些数，健康页才画得出一条有刻度的进度条 */
export default function ProfilePage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const profile = useLiveQuery(() => healthProfile(), [])
  const [draft, setDraft] = useState<Draft>(BLANK)
  const [step, setStep] = useState<1 | 2>(1)
  const [guessOpen, setGuessOpen] = useState(false)
  const [guessFreq, setGuessFreq] = useState('')
  const [guessDuration, setGuessDuration] = useState('')
  const [activityAiOpen, setActivityAiOpen] = useState(false)

  // 档案从库里读回来时同步一次；之后保存会更新 updatedAt，再同步一次即可
  useEffect(() => {
    setDraft(draftOf(profile))
  }, [profile?.updatedAt])

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  const age = parseNumber(draft.age)
  const heightCm = parseNumber(draft.height)
  const weightKg = parseNumber(draft.weight)
  const tdee = parseNumber(draft.tdee)
  const estimate = estimateTdee({ sex: draft.sex, age, heightCm, weightKg, activity: draft.activity })
  const baseBmr = bmr({ sex: draft.sex, age, heightCm, weightKg })
  const step1Valid = Boolean(draft.sex && age && heightCm && weightKg && draft.activity)

  // 跟库里那份比，决定左上角显示什么、以及离开时要不要拦
  const baseline = draftOf(profile)
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)
  const blocker = useBlocker(dirty)

  function adoptEstimate() {
    if (estimate === null) return
    patch({ tdee: String(estimate) })
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    if (!tdee) {
      showToast({ message: t('profile.calcMissing') })
      return
    }
    const target = Math.round((tdee * preset.factor) / 10) * 10
    const protein = suggestProteinForPlan(weightKg, preset.key)
    patch({
      plan: preset.key,
      target: String(target),
      protein: protein === null ? '' : String(protein),
    })
    showToast({ message: t('profile.presetApplied', { name: t(preset.label) }) })
  }

  /** 改 TDEE 时，如果目标还是上次预设算出来的，就跟着重算；用户手改过的就不动 */
  function changeTdee(next: string) {
    setDraft((current) => {
      const value = parseNumber(next)
      const preset = PRESETS.find((item) => item.key === current.plan)
      const oldTdee = parseNumber(current.tdee)
      if (!value || !preset || !oldTdee) return { ...current, tdee: next }
      const oldTarget = String(Math.round((oldTdee * preset.factor) / 10) * 10)
      if (current.target.trim() !== oldTarget) return { ...current, tdee: next }
      return { ...current, tdee: next, target: String(Math.round((value * preset.factor) / 10) * 10) }
    })
  }

  async function handleSave() {
    const nextWeight = weightKg
    const next: HealthProfile = {
      id: 'me',
      sex: draft.sex,
      age,
      heightCm,
      weightKg: nextWeight,
      weightAt:
        nextWeight !== profile?.weightKg
          ? nextWeight === null
            ? null
            : Date.now()
          : profile?.weightAt ?? null,
      activity: draft.activity,
      tdee,
      targetKcal: parseNumber(draft.target),
      proteinTarget: parseNumber(draft.protein),
      plan: draft.plan,
      note: draft.note.trim(),
      updatedAt: Date.now(),
    }
    await saveHealthProfile(next)
    showToast({ message: t('profile.saved') })
  }

  /** 点标签往「情况说明」里追加一整句；再点一次把这句去掉，不单独存标签 */
  function toggleSnippet(text: string) {
    setDraft((current) => {
      const note = current.note.trim()
      if (!note.includes(text)) {
        if (note === '') return { ...current, note: text }
        return { ...current, note: `${/[。！？.!?]$/.test(note) ? note : `${note}。`}${text}` }
      }
      // 取消时连同紧跟的分隔符一起去掉，别留下「。。」或者开头一个逗号
      const removed = note
        .replace(`${text}。`, '')
        .replace(`${text}；`, '')
        .replace(`${text};`, '')
        .replace(`${text}，`, '')
        .replace(text, '')
      return { ...current, note: removed.replace(/^[。；;，,\s]+/, '').replace(/[。；;，,\s]+$/, '') }
    })
  }

  const missing = missingProfileFields(profile)

  return (
    <PageShell
      wide
      title={t('profile.title')}
      description={t('profile.description')}
      backTo="/health"
      backLabel={t('nav.health')}
      status={
        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
            dirty ? 'border-warning/40 bg-warning/10 text-warning' : 'border-line text-muted',
          ].join(' ')}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dirty ? 'bg-warning' : 'bg-muted'}`} />
          {dirty ? t('profile.statusDirty') : profile ? t('profile.statusSaved') : t('profile.statusEmpty')}
        </span>
      }
      actions={
        <button type="button" onClick={() => void handleSave()} className={SOLID_BUTTON}>
          {t('profile.save')}
        </button>
      }
    >
      {/* 两步指示器：点哪步跳哪步，但第一步没填完跳过去也没意义，只是方便回看 */}
      <div className="mb-4 flex items-center gap-2 text-xs">
        {[1, 2].map((n) => {
          const active = step === n
          const title = n === 1 ? t('profile.step1Title') : t('profile.step2Title')
          return (
            <button
              key={n}
              type="button"
              onClick={() => setStep(n as 1 | 2)}
              className={[
                'flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                active ? 'border-brand text-brand' : 'border-line text-muted hover:text-fg',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]',
                  active ? 'bg-brand text-on-brand' : 'bg-line text-muted',
                ].join(' ')}
              >
                {n}
              </span>
              <span className="font-medium">{title}</span>
            </button>
          )
        })}
      </div>

      {step === 1 && (
        <>
          <p className="mb-3 text-xs text-muted">{t('profile.step1Desc')}</p>

          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <div>
              <span className="text-xs text-muted">{t('profile.sex')}</span>
              <div className="mt-1 flex gap-2">
                {(['male', 'female'] as const).map((sex) => (
                  <button
                    key={sex}
                    type="button"
                    onClick={() => patch({ sex })}
                    className={choiceTile(draft.sex === sex, 'flex-1 px-3 py-2')}
                  >
                    {t(sex === 'male' ? 'profile.male' : 'profile.female')}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-muted">{t('profile.age')}</span>
                <div className="mt-1">
                  <Stepper value={draft.age} onChange={(v) => patch({ age: v })} step={1} />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-muted">{t('profile.height')}</span>
                <div className="mt-1">
                  <Stepper value={draft.height} onChange={(v) => patch({ height: v })} step={1} suffix="cm" />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-muted">{t('profile.weight')}</span>
                <div className="mt-1">
                  <Stepper value={draft.weight} onChange={(v) => patch({ weight: v })} step={0.1} inputMode="decimal" suffix="kg" />
                </div>
              </label>
            </div>

            <div>
              <span className="text-xs text-muted">{t('profile.activity')}</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {ACTIVITIES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => patch({ activity: item.key })}
                    className={choiceTile(draft.activity === item.key, 'px-3 py-2 text-left')}
                  >
                    <span className="block text-sm">{t(item.label)}</span>
                    <span className="mt-0.5 block text-[11px] opacity-80">{t(item.desc)}</span>
                    <span className="mt-1 block text-[11px] opacity-60">
                      {t('profile.activityFactor', { factor: ACTIVITY_FACTORS[item.key] })}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => setGuessOpen((v) => !v)}
                  className="text-xs text-brand"
                >
                  {t('profile.guessActivity')}
                </button>
                <span className="text-xs text-line">·</span>
                <button
                  type="button"
                  onClick={() => setActivityAiOpen(true)}
                  className="text-xs text-brand"
                >
                  {t('profile.activityAiEntry')}
                </button>
              </div>
              {guessOpen && (
                <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs text-muted">{t('profile.guessFreq')}</span>
                      <input
                        value={guessFreq}
                        onChange={(e) => setGuessFreq(e.target.value)}
                        inputMode="numeric"
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted">{t('profile.guessDuration')}</span>
                      <input
                        value={guessDuration}
                        onChange={(e) => setGuessDuration(e.target.value)}
                        inputMode="numeric"
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const f = Number(guessFreq) || 0
                      const d = Number(guessDuration) || 0
                      patch({ activity: activityFromQuestions(f, d) })
                      setGuessOpen(false)
                    }}
                    className={`${OUTLINE_BUTTON} mt-2`}
                  >
                    {t('profile.guessApply')}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 实时估算：填齐身体数据就立刻显示，不用点按钮 */}
          {estimate !== null && (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-brand/30 bg-brand/5 p-4">
              <div>
                <div className="text-sm text-fg">{t('profile.tdeeEstimate', { value: estimate })}</div>
                {baseBmr !== null && (
                  <div className="mt-0.5 text-[11px] text-muted">
                    {t('profile.tdeeFormula', {
                      bmr: baseBmr,
                      factor: ACTIVITY_FACTORS[draft.activity ?? 'sedentary'],
                    })}
                  </div>
                )}
              </div>
              <button type="button" onClick={adoptEstimate} className={OUTLINE_BUTTON}>
                {t('profile.tdeeAdopt')}
              </button>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (!step1Valid) {
                  showToast({ message: t('profile.step1Need') })
                  return
                }
                if (tdee === null && estimate !== null) adoptEstimate()
                setStep(2)
              }}
              className={SOLID_BUTTON}
            >
              {t('profile.next')}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="mb-3 text-xs text-muted">{t('profile.step2Desc')}</p>

          {/* 先定计划，数值跟着变，顺序上比先看 TDEE 更符合「我要干什么」的直觉 */}
          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <span className="text-xs text-muted">{t('profile.plan')}</span>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={choiceTile(draft.plan === preset.key, 'px-3 py-2 text-left')}
                >
                  <span className="block text-sm">{t(preset.label)}</span>
                  <span className="mt-0.5 block text-[11px] opacity-70">
                    {tdee ? `${Math.round((tdee * preset.factor) / 10) * 10} kcal` : '—'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-3 space-y-3 rounded-2xl border border-line bg-surface p-4">
            <label className="block">
              <span className="text-xs text-muted">{t('profile.tdee')}</span>
              <input
                value={draft.tdee}
                onChange={(event) => changeTdee(event.target.value)}
                inputMode="numeric"
                className={`${INPUT} mt-1`}
              />
              <span className="mt-1 block text-[11px] text-muted">{t('profile.tdeeHint')}</span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-muted">{t('profile.target')}</span>
                <input
                  value={draft.target}
                  onChange={(event) => patch({ target: event.target.value })}
                  inputMode="numeric"
                  className={`${INPUT} mt-1`}
                />
                <span className="mt-1 block text-[11px] text-muted">{t('profile.targetHint')}</span>
              </label>
              <label className="block">
                <span className="text-xs text-muted">{t('profile.proteinTarget')}</span>
                <input
                  value={draft.protein}
                  onChange={(event) => patch({ protein: event.target.value })}
                  inputMode="decimal"
                  className={`${INPUT} mt-1`}
                />
                <span className="mt-1 block text-[11px] text-muted">{t('profile.proteinHint')}</span>
              </label>
            </div>
          </section>

          <section className="mt-3 space-y-3 rounded-2xl border border-line bg-surface p-4">
            <span className="text-xs text-muted">{t('profile.tags')}</span>
            <div className="flex flex-wrap gap-2">
              {NOTE_SNIPPETS.map((key) => {
                const text = t(key)
                const used = draft.note.includes(text)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSnippet(text)}
                    className={[
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      used ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-fg',
                    ].join(' ')}
                  >
                    {text}
                  </button>
                )
              })}
            </div>
            <label className="block">
              <span className="text-xs text-muted">{t('profile.noteFree')}</span>
              <textarea
                value={draft.note}
                onChange={(event) => patch({ note: event.target.value })}
                rows={4}
                placeholder={t('profile.notePlaceholder')}
                className={`${INPUT} mt-1 resize-none`}
              />
              <span className="mt-1 block text-[11px] text-muted">{t('profile.noteHint')}</span>
            </label>
          </section>

          <div className="mt-4 flex justify-between">
            <button type="button" onClick={() => setStep(1)} className={OUTLINE_BUTTON}>
              {t('profile.prev')}
            </button>
            <button type="button" onClick={() => void handleSave()} className={SOLID_BUTTON}>
              {t('profile.save')}
            </button>
          </div>
        </>
      )}

      {/* 顶部缺项提示：保存后从库算，不随草稿变，免得还没填就一直闪 */}
      {missing.length > 0 && (
        <p className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-fg">
          {t('health.setupNeeded')}
        </p>
      )}

      {activityAiOpen && (
        <ActivityAiDialog
          note={draft.note}
          onApply={(activity) => {
            patch({ activity })
            setActivityAiOpen(false)
          }}
          onClose={() => setActivityAiOpen(false)}
        />
      )}
      {/* 有没保存的改动时，任何离开（返回、底栏、系统返回键）都先问一句 */}
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title={t('profile.unsavedLeaveTitle')}
          description={t('profile.unsavedLeaveDesc')}
          confirmLabel={t('profile.unsavedLeaveConfirm')}
          cancelLabel={t('profile.unsavedLeaveCancel')}
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
    </PageShell>
  )
}
