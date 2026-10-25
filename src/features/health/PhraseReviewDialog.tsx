/**
 * 一句话解析的核对窗。
 *
 * 命中食物库的项直接用库里的数据，不需要用户操心；没命中的逐条问：
 * 补全营养就新建一条食物并记进这次摄入，不想建就跳过（这一项不记）。
 *
 * 新建只在这里收集草稿，点「完成」才真正写入：中途关掉窗口不会留下半个食物。
 */
import { useMemo, useState } from 'react'
import type { HealthFood } from '@/core/db/schema'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import FoodForm from './FoodForm'
import type { FoodDraft } from './FoodForm'
import { normalizeFoodName } from './intakeDraft'
import type { PhraseItem } from './mealPhrase'
import { matchPhrase, resolvePhrase } from './phraseMatch'
import type { PhraseDecision, PhraseResolution } from './phraseMatch'

export type { PhraseResolution } from './phraseMatch'

type Decision = PhraseDecision

const BADGE = 'shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-none'

export default function PhraseReviewDialog({
  items,
  foods,
  onCancel,
  onDone,
}: {
  items: PhraseItem[]
  foods: HealthFood[]
  onCancel: () => void
  /** 只返回要记的项，跳过的已经在里面过滤掉 */
  onDone: (resolutions: PhraseResolution[]) => void
}) {
  const { t } = useI18n()
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [active, setActive] = useState<number | null>(null)

  const matches = useMemo(() => matchPhrase(items, foods), [items, foods])
  const resolved = useMemo(() => resolvePhrase(items, matches, decisions), [items, matches, decisions])
  const pendingCount = resolved.pending

  function finish() {
    onDone(resolved.resolutions)
  }

  return (
    <Modal
      size="lg"
      label={t('phrase.reviewTitle')}
      onClose={onCancel}
      panelClassName="max-h-[86vh] overflow-y-auto"
    >
      {active === null ? (
        <>
          <h2 className="m-0 text-base font-medium text-fg">{t('phrase.reviewTitle')}</h2>
          <p className="mt-1 text-xs text-muted">{t('phrase.reviewDesc')}</p>

          <ul className="m-0 mt-4 list-none space-y-2 p-0">
            {items.map((item, index) => {
              const match = matches[index].food
              const decision = decisions[index]
              const status = match ? 'library' : decision ? decision.kind : 'pending'
              return (
                <li key={`${item.name}-${index}`}>
                  <button
                    type="button"
                    disabled={Boolean(match)}
                    onClick={() => setActive(index)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand disabled:cursor-default disabled:hover:border-line"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{item.name}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {Math.round(item.grams > 0 ? item.grams : 100)} g
                        {item.unit && !['克', 'g', '毫升', 'ml'].includes(item.unit) &&
                          ` · ${item.count} ${item.unit}`}
                      </span>
                    </span>
                    {status === 'library' && (
                      <span className={`${BADGE} border-brand/40 text-brand`}>
                        {t('phrase.statusLibrary')}
                      </span>
                    )}
                    {status === 'pending' && (
                      <span className={`${BADGE} border-warning/40 text-warning`}>
                        {t('phrase.statusPending')}
                      </span>
                    )}
                    {status === 'new' && (
                      <span className={`${BADGE} border-success/40 text-success`}>
                        {t('phrase.statusNew')}
                      </span>
                    )}
                    {status === 'skipped' && (
                      <span className={`${BADGE} border-line text-muted`}>
                        {t('phrase.statusSkipped')}
                      </span>
                    )}
                    {!match && <span aria-hidden="true" className="text-muted">›</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={GHOST_BUTTON}
            >
              {t('common.cancel')}
            </button>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <span className="text-xs text-muted">{t('phrase.pendingLeft', { n: pendingCount })}</span>
              )}
              <button
                type="button"
                disabled={pendingCount > 0}
                onClick={finish}
                className={`${SOLID_BUTTON} disabled:opacity-40`}
              >
                {t('phrase.done')}
              </button>
            </div>
          </div>
        </>
      ) : (
        <Detail
          key={active}
          item={items[active]}
          existing={decisions[active]}
          foods={foods}
          onBack={() => setActive(null)}
          onSkip={() => {
            setDecisions((current) => ({ ...current, [active]: { kind: 'skipped' } }))
            setActive(null)
          }}
          onApply={(decision) => {
            setDecisions((current) => ({ ...current, [active]: decision }))
            setActive(null)
          }}
        />
      )}
    </Modal>
  )
}

/** 单条未命中的处理页：份量 + 营养表单，提交前先挡住重名 */
function Detail({
  item,
  existing,
  foods,
  onBack,
  onSkip,
  onApply,
}: {
  item: PhraseItem
  existing?: Decision
  foods: HealthFood[]
  onBack: () => void
  onSkip: () => void
  onApply: (decision: Decision) => void
}) {
  const { t } = useI18n()
  const [grams, setGrams] = useState(
    String(existing?.kind === 'new' ? existing.grams : item.grams > 0 ? Math.round(item.grams) : 100),
  )
  const [error, setError] = useState('')

  const amount = Number(grams)
  const valid = Number.isFinite(amount) && amount > 0
  const kcal = valid ? Math.round((item.kcal * amount) / 100) : 0
  const protein = valid ? Math.round((item.protein * amount) / 10) / 10 : 0

  function submit(draft: FoodDraft) {
    const name = draft.name.trim()
    if (name === '') {
      setError(t('foods.nameRequired'))
      return
    }
    if (!valid) {
      setError(t('intake.gramsInvalid'))
      return
    }
    if (foods.some((food) => normalizeFoodName(food.name) === normalizeFoodName(name))) {
      setError(t('phrase.duplicateName', { name }))
      return
    }
    setError('')
    onApply({ kind: 'new', draft: { ...draft, name }, grams: amount })
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted transition-colors hover:text-fg"
        >
          ‹ {t('phrase.backToList')}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-danger transition-opacity hover:opacity-80"
        >
          {t('phrase.skipItem')}
        </button>
      </div>
      <h2 className="mt-2 text-base font-medium text-fg">{t('phrase.detailTitle')}</h2>
      <p className="mt-1 text-xs text-muted">{t('phrase.detailDesc')}</p>

      <label className="mt-4 block">
        <span className="text-xs text-muted">{t('phrase.grams')}</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={grams}
            onChange={(event) => setGrams(event.target.value)}
            inputMode="decimal"
            className={INPUT}
          />
          <span className="shrink-0 text-xs text-muted">g</span>
        </div>
      </label>
      {valid && (
        <p className="mt-2 text-xs text-fg">
          {t('phrase.totalPreview', { kcal, protein })}
        </p>
      )}

      {error !== '' && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-4">
        <FoodForm
          initial={{
            name: (existing?.kind === 'new' ? existing.draft.name : item.name) ?? '',
            kcal: item.kcal,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            servingName: null,
            servingGrams: null,
          }}
          submitLabel={t('phrase.createAndLog')}
          onSubmit={submit}
        />
      </div>

    </>
  )
}
