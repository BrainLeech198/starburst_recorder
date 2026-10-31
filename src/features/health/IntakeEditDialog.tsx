/**
 * 编辑单条摄入：名称、时间、份量与四项营养值。
 *
 * 普通食物直接改数值；套餐记录改的是成分克数，营养和合计按原比例重算，
 * 这样历史快照不会在编辑后和成分对不上。
 */
import { useState } from 'react'
import type { HealthIntake, IntakeComponent } from '@/core/db/schema'
import { formatDate } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import { round2, sumMacros } from './healthMath'
import { saveIntake } from './healthRepo'

interface ComponentDraft {
  /** 原始成分：克数比例与营养都以它为基准 */
  base: IntakeComponent
  text: string
}

function isClock(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function positiveNumber(text: string) {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null
}

function macroNumber(text: string) {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? round2(value) : null
}

export default function IntakeEditDialog({
  intake,
  onClose,
}: {
  intake: HealthIntake
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const hasComponents = (intake.components?.length ?? 0) > 0
  const [name, setName] = useState(intake.name)
  const [time, setTime] = useState(intake.time)
  const [gramsText, setGramsText] = useState(String(intake.grams))
  const [kcalText, setKcalText] = useState(String(intake.kcal))
  const [proteinText, setProteinText] = useState(String(intake.protein))
  const [carbsText, setCarbsText] = useState(String(intake.carbs))
  const [fatText, setFatText] = useState(String(intake.fat))
  const [componentDrafts, setComponentDrafts] = useState<ComponentDraft[]>(
    (intake.components ?? []).map((component) => ({
      base: component,
      text: String(component.grams),
    })),
  )

  const components = componentDrafts.map(({ base, text }) => {
    const grams = positiveNumber(text)
    const ratio = grams === null || base.grams <= 0 ? 0 : grams / base.grams
    return {
      foodId: base.foodId,
      name: base.name,
      grams: grams ?? 0,
      kcal: round2(base.kcal * ratio),
      protein: round2(base.protein * ratio),
      carbs: round2(base.carbs * ratio),
      fat: round2(base.fat * ratio),
      valid: grams !== null,
    }
  })
  const componentTotals = sumMacros(components)

  const grams = positiveNumber(gramsText)
  const kcal = macroNumber(kcalText)
  const protein = macroNumber(proteinText)
  const carbs = macroNumber(carbsText)
  const fat = macroNumber(fatText)
  const valid =
    name.trim() !== '' &&
    isClock(time) &&
    (hasComponents
      ? components.every((component) => component.valid)
      : grams !== null && kcal !== null && protein !== null && carbs !== null && fat !== null)

  async function handleSave() {
    if (!valid) return
    if (hasComponents) {
      const parts: IntakeComponent[] = components.map((component) => ({
        foodId: component.foodId,
        name: component.name,
        grams: round2(component.grams),
        kcal: component.kcal,
        protein: component.protein,
        carbs: component.carbs,
        fat: component.fat,
      }))
      const totals = sumMacros(parts)
      await saveIntake({
        ...intake,
        name: name.trim(),
        time,
        grams: round2(parts.reduce((sum, part) => sum + part.grams, 0)),
        ...totals,
        components: parts,
      })
    } else {
      await saveIntake({
        ...intake,
        name: name.trim(),
        time,
        grams: round2(grams!),
        kcal: kcal!,
        protein: protein!,
        carbs: carbs!,
        fat: fat!,
      })
    }
    showToast({ message: t('health.intakeUpdated') })
    onClose()
  }

  return (
    <Modal size="sm" label={t('health.intakeEditTitle')} onClose={onClose}>
      <h2 className="text-base font-medium">{t('health.intakeEditTitle')}</h2>
      <p className="mt-1 text-xs text-muted">
        {formatDate(intake.dateKey, t)} · {intake.code}
      </p>

      <label className="mt-4 block">
        <span className="text-xs text-muted">{t('foods.name')}</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={INPUT + ' mt-1 w-full'}
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted">{t('intake.time')}</span>
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className={INPUT + ' mt-1 w-full tabular-nums'}
          />
        </label>
        {!hasComponents && (
          <label className="block">
            <span className="text-xs text-muted">{t('intake.grams')}</span>
            <input
              value={gramsText}
              onChange={(event) => setGramsText(event.target.value)}
              inputMode="decimal"
              className={INPUT + ' mt-1 w-full tabular-nums'}
            />
          </label>
        )}
      </div>

      {hasComponents ? (
        <div className="mt-4">
          <p className="m-0 text-xs font-medium text-muted">{t('health.intakeEditComponents')}</p>
          <ul className="m-0 mt-2 list-none space-y-2 p-0">
            {componentDrafts.map((draft, index) => (
              <li
                key={`${draft.base.foodId ?? 'manual'}-${index}`}
                className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5"
              >
                <span className="min-w-0 truncate text-xs text-fg">{draft.base.name}</span>
                <input
                  value={draft.text}
                  aria-label={`${draft.base.name} ${t('intake.grams')}`}
                  inputMode="decimal"
                  onChange={(event) =>
                    setComponentDrafts((current) =>
                      current.map((item, position) =>
                        position === index ? { ...item, text: event.target.value } : item,
                      ),
                    )
                  }
                  className={INPUT + ' w-20 shrink-0 py-1 text-center tabular-nums'}
                />
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-xs tabular-nums text-muted">
            {t('health.intakeEditTotal', {
              grams: round2(components.reduce((sum, item) => sum + item.grams, 0)),
              kcal: componentTotals.kcal,
              protein: componentTotals.protein,
            })}
          </p>
          <p className="m-0 mt-1 text-[11px] text-muted">{t('health.intakeEditComponentHint')}</p>
        </div>
      ) : (
        <>
          <p className="m-0 mt-4 text-xs font-medium text-muted">{t('health.detailMacros')}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted">{t('foods.kcal')}</span>
              <input
                value={kcalText}
                onChange={(event) => setKcalText(event.target.value)}
                inputMode="decimal"
                className={INPUT + ' mt-1 w-full tabular-nums'}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">{t('foods.protein')}</span>
              <input
                value={proteinText}
                onChange={(event) => setProteinText(event.target.value)}
                inputMode="decimal"
                className={INPUT + ' mt-1 w-full tabular-nums'}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">{t('foods.carbs')}</span>
              <input
                value={carbsText}
                onChange={(event) => setCarbsText(event.target.value)}
                inputMode="decimal"
                className={INPUT + ' mt-1 w-full tabular-nums'}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">{t('foods.fat')}</span>
              <input
                value={fatText}
                onChange={(event) => setFatText(event.target.value)}
                inputMode="decimal"
                className={INPUT + ' mt-1 w-full tabular-nums'}
              />
            </label>
          </div>
          <p className="m-0 mt-2 text-[11px] text-muted">{t('health.intakeEditHint')}</p>
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() => void handleSave()}
          className={SOLID_BUTTON + (valid ? '' : ' opacity-40')}
        >
          {t('health.intakeEditSave')}
        </button>
      </div>
    </Modal>
  )
}
