/**
 * 记一笔 / 改一笔。
 *
 * 快捷优先：金额、收支方向、分类是必填，名称和备注都可以空着——
 * 名称留空时用分类名兜底，列表里不会出现一行空白。
 */
import ErrorNote from '@/shared/ui/ErrorNote'
import { useRef, useState } from 'react'
import type { FinanceEntry, FinanceKind } from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import { isDateKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import ImageSourceDialog from '@/shared/ui/ImageSourceDialog'
import PhotoPreview from '@/shared/ui/PhotoPreview'
import { takeNativePhoto, usesNativeCamera } from '@/platform/camera'
import { GHOST_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { INPUT } from '@/shared/ui/inputStyles'
import { categoriesOf, categoryKey } from './financeCategories'
import { roundMoney } from './financeMath'
import { compressFinancePhoto } from './financePhoto'
import { addFinance, saveFinance } from './financeRepo'

/** 本地 'HH:MM:SS'，旧记录只有分钟时补 :00 */
function nowClock() {
  return new Date().toTimeString().slice(0, 8)
}

function normalizeClock(value: string) {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value
}

export default function FinanceEntryDialog({
  entry = null,
  defaultDate,
  onClose,
  onSaved,
}: {
  /** 传了就是编辑，没传就是新增 */
  entry?: FinanceEntry | null
  /** 新增时的默认日期，通常是今天或当前查看月份的 1 号 */
  defaultDate: string
  onClose: () => void
  onSaved: (record: FinanceEntry) => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [kind, setKind] = useState<FinanceKind>(entry?.kind ?? 'expense')
  const [amountText, setAmountText] = useState(entry ? String(entry.amount) : '')
  const [category, setCategory] = useState(entry?.category ?? categoriesOf('expense')[0].id)
  const [name, setName] = useState(entry?.name ?? '')
  const [note, setNote] = useState(entry?.note ?? '')
  const [dateKey, setDateKey] = useState(entry?.dateKey ?? defaultDate)
  const [time, setTime] = useState(entry?.time ?? nowClock())
  const [photo, setPhoto] = useState<string | null>(entry?.photo ?? null)
  const [photoPicking, setPhotoPicking] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoFileRef = useRef<HTMLInputElement>(null)
  const photoCameraRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  const amount = Number(amountText.replace(/,/g, ''))
  const valid =
    amountText.trim() !== '' && Number.isFinite(amount) && amount > 0 && isDateKey(dateKey)

  /** 换方向时分类列表整组换掉，别把「工资」留在支出里 */
  function switchKind(next: FinanceKind) {
    if (next === kind) return
    setKind(next)
    setCategory(categoriesOf(next)[0].id)
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return
    setPhotoUploading(true)
    setPhotoError('')
    try {
      setPhoto(await compressFinancePhoto(file))
    } catch (failure) {
      setPhotoError((failure as Error).message || t('finance.photoFailed'))
    } finally {
      setPhotoUploading(false)
    }
  }

  async function takePhoto() {
    setPhotoPicking(false)
    if (!usesNativeCamera()) {
      photoCameraRef.current?.click()
      return
    }
    const shot = await takeNativePhoto()
    if (shot) void uploadPhoto(shot)
  }

  async function submit() {
    if (!valid) {
      setError(t('finance.invalidAmount'))
      return
    }
    const trimmed = name.trim()
    const displayName = trimmed === '' ? t(categoryKey(category)) : trimmed
    const clock = normalizeClock(time)
    const record: FinanceEntry = entry
      ? {
          ...entry,
          dateKey,
          time: clock,
          kind,
          category,
          name: displayName,
          amount: roundMoney(amount),
          photo,
          note: note.trim(),
        }
      : {
          id: newId(),
          code: newCode(),
          dateKey,
          time: clock,
          kind,
          category,
          name: displayName,
          amount: roundMoney(amount),
          photo,
          note: note.trim(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        }
    if (entry) await saveFinance(record)
    else await addFinance(record)
    showToast({ message: t(entry ? 'finance.updated' : 'finance.saved') })
    onSaved(record)
    onClose()
  }

  return (
    <Modal size="sm" label={t(entry ? 'finance.editTitle' : 'finance.addTitle')} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">
        {t(entry ? 'finance.editTitle' : 'finance.addTitle')}
      </h2>

      {/* 收支方向：两个并排的格子，选中态跟全站 choiceTile 一致 */}
      <div className="mt-4 flex gap-2">
        {(['expense', 'income'] as FinanceKind[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={kind === item}
            onClick={() => switchKind(item)}
            className={choiceTile(kind === item, 'flex-1 py-2 text-sm')}
          >
            {t(item === 'expense' ? 'finance.expense' : 'finance.income')}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="text-xs text-muted">{t('finance.amount')}</span>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-lg text-muted">{t('finance.currency')}</span>
          <input
            autoFocus
            value={amountText}
            onChange={(event) => {
              setAmountText(event.target.value)
              setError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
            inputMode="decimal"
            placeholder="0"
            aria-label={t('finance.amount')}
            className={`${INPUT} w-full text-2xl tabular-nums`}
          />
        </div>
      </label>

      <div className="mt-3">
        <span className="text-xs text-muted">{t('finance.category')}</span>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {categoriesOf(kind).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
              className={choiceTile(category === item.id, 'px-1 py-2 text-center text-xs')}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="text-xs text-muted">{t('finance.name')}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('finance.namePlaceholder')}
          className={`${INPUT} mt-1 w-full`}
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted">{t('finance.date')}</span>
          <input
            type="date"
            value={dateKey}
            onChange={(event) => setDateKey(event.target.value)}
            className={`${INPUT} mt-1 w-full tabular-nums`}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">{t('finance.time')}</span>
          <input
            type="time"
            step="1"
            value={normalizeClock(time)}
            onChange={(event) => setTime(event.target.value)}
            className={`${INPUT} mt-1 w-full tabular-nums`}
          />
        </label>
      </div>

      {/* 票据照片：按模块图片设置处理后跟着记录保存 */}
      <div className="mt-3 flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-2.5">
        {photo ? (
          <PhotoPreview
            src={photo}
            alt={t('finance.photo')}
            className="h-16 w-16 rounded-lg"
            wrapperClassName="shrink-0"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-line px-1 text-center text-[11px] text-muted">
            {t('finance.photo')}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] text-muted">{t('finance.photoHint')}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={photoUploading}
              onClick={() => setPhotoPicking(true)}
              className={`${OUTLINE_BUTTON} px-2 py-1 text-xs`}
            >
              <Icon name="image" />
              {photoUploading
                ? t('finance.photoUploading')
                : photo
                  ? t('finance.photoReplace')
                  : t('finance.photoAdd')}
            </button>
            {photo && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-danger"
              >
                {t('finance.photoRemove')}
              </button>
            )}
          </div>
          {photoError !== '' && <ErrorNote>{photoError}</ErrorNote>}
        </div>
      </div>

      <input
        ref={photoFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void uploadPhoto(file)
        }}
      />
      <input
        ref={photoCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void uploadPhoto(file)
        }}
      />
      {photoPicking && (
        <ImageSourceDialog
          onTakePhoto={() => void takePhoto()}
          onPickFile={() => {
            setPhotoPicking(false)
            photoFileRef.current?.click()
          }}
          onClose={() => setPhotoPicking(false)}
        />
      )}

      <label className="mt-3 block">
        <span className="text-xs text-muted">{t('finance.note')}</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={`${INPUT} mt-1 w-full`}
        />
      </label>

      {error !== '' && <p className="m-0 mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() => void submit()}
          className={`${SOLID_BUTTON} disabled:opacity-40`}
        >
          <Icon name="check" />
          {t('finance.save')}
        </button>
      </div>
    </Modal>
  )
}
