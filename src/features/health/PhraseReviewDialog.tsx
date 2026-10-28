/**
 * 一句话解析的核对窗。
 *
 * 命中食物库的项在解析时就已直接记入，不会出现在这里；这里只处理库里没有的：
 * 补全营养就立即新建一条食物并记进这次摄入，不想建就跳过（这一项不记）。
 *
 * 每一项都是点一下就落库：关掉窗口不会撤销已经记入的项，也不会留下半个食物。
 */
import ErrorNote from '@/shared/ui/ErrorNote'
import { useRef, useState } from 'react'
import type { HealthFood } from '@/core/db/schema'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import FoodForm from './FoodForm'
import type { FoodDraft } from './FoodForm'
import { normalizeFoodName } from './intakeDraft'
import type { PhraseItem } from './mealPhrase'

/** 单项处理结果；没有记录就是还没处理 */
type Handled = 'logged' | 'skipped'

const BADGE = 'shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-none'

export default function PhraseReviewDialog({
  items,
  foods,
  onClose,
  onLog,
}: {
  items: PhraseItem[]
  foods: HealthFood[]
  onClose: () => void
  /** 立即建进食物库并记进这一笔；失败时抛错，表单会停在本项 */
  onLog: (item: PhraseItem, draft: FoodDraft, grams: number) => Promise<void>
}) {
  const { t } = useI18n()
  const [handled, setHandled] = useState<Record<number, Handled>>({})
  const [active, setActive] = useState<number | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  /** 确认框已弹出时，底层的 Esc / 遮罩 / 关闭别再叠一层；用 ref 是因为同一次按键里还会走到底层的监听 */
  const confirmOpen = useRef(false)

  const pendingCount = items.filter((_, index) => !handled[index]).length

  /** 还有没处理的项就先问一句，别让用户以为点了关闭就等于都记好了 */
  function requestClose() {
    if (confirmOpen.current) return
    if (pendingCount > 0) {
      confirmOpen.current = true
      setConfirmClose(true)
      return
    }
    onClose()
  }

  function cancelClose() {
    confirmOpen.current = false
    setConfirmClose(false)
  }

  return (
    <>
      <Modal size="lg" label={t('phrase.reviewTitle')} onClose={requestClose} resetKey={active}>
        {active === null ? (
        <>
          <h2 className="m-0 text-base font-medium text-fg">{t('phrase.reviewTitle')}</h2>
          <p className="mt-1 text-xs text-muted">{t('phrase.reviewDesc')}</p>

          <ul className="m-0 mt-4 list-none space-y-2 p-0">
            {items.map((item, index) => {
              const state = handled[index]
              return (
                <li key={`${item.name}-${index}`}>
                  <button
                    type="button"
                    disabled={state === 'logged'}
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
                    {!state && (
                      <span className={`${BADGE} border-warning/40 text-warning`}>
                        {t('phrase.statusPending')}
                      </span>
                    )}
                    {state === 'logged' && (
                      <span className={`${BADGE} border-success/40 text-success`}>
                        {t('phrase.statusLogged')}
                      </span>
                    )}
                    {state === 'skipped' && (
                      <span className={`${BADGE} border-line text-muted`}>
                        {t('phrase.statusSkipped')}
                      </span>
                    )}
                    {state !== 'logged' && <span aria-hidden="true" className="text-muted">›</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="mt-5 flex items-center justify-between gap-2">
            <button type="button" onClick={requestClose} className={GHOST_BUTTON}>
              {t('common.close')}
            </button>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <span className="text-xs text-muted">{t('phrase.pendingLeft', { n: pendingCount })}</span>
              )}
              <button
                type="button"
                disabled={pendingCount > 0}
                onClick={onClose}
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
          foods={foods}
          onBack={() => setActive(null)}
          onSkip={() => {
            setHandled((current) => ({ ...current, [active]: 'skipped' }))
            setActive(null)
          }}
          onLog={async (draft, grams) => {
            await onLog(items[active], draft, grams)
            setHandled((current) => ({ ...current, [active]: 'logged' }))
            setActive(null)
          }}
        />
      )}
      </Modal>

      {confirmClose && (
        <ConfirmDialog
          title={t('phrase.closeTitle', { n: pendingCount })}
          description={t('phrase.closeDesc')}
          confirmLabel={t('phrase.closeAnyway')}
          cancelLabel={t('phrase.keepWorking')}
          onConfirm={() => {
            confirmOpen.current = false
            onClose()
          }}
          onCancel={cancelClose}
        />
      )}
    </>
  )
}

/** 单条未命中的处理页：份量 + 营养表单，提交即落库，重名先挡住 */
function Detail({
  item,
  foods,
  onBack,
  onSkip,
  onLog,
}: {
  item: PhraseItem
  foods: HealthFood[]
  onBack: () => void
  onSkip: () => void
  onLog: (draft: FoodDraft, grams: number) => Promise<void>
}) {
  const { t } = useI18n()
  const [grams, setGrams] = useState(String(item.grams > 0 ? Math.round(item.grams) : 100))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const amount = Number(grams)
  const valid = Number.isFinite(amount) && amount > 0
  const kcal = valid ? Math.round((item.kcal * amount) / 100) : 0
  const protein = valid ? Math.round((item.protein * amount) / 10) / 10 : 0

  async function submit(draft: FoodDraft) {
    if (busy) return
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
    setBusy(true)
    try {
      await onLog({ ...draft, name }, amount)
    } catch {
      setBusy(false)
      setError(t('phrase.logFailed'))
    }
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

      {error !== '' && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-4">
        <FoodForm
          initial={{
            name: item.name,
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
