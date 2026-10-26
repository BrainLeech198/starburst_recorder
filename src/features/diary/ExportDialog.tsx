import { useState } from 'react'
import type { ExportFormat } from './diaryExport'
import { formatDate, shiftDay } from '@/core/utils/dateKey'
import { GHOST_BUTTON, OUTLINE_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { INPUT_NARROW } from '@/shared/ui/inputStyles'

export type ExportRange = 'selection' | 'day' | 'range'

/** 弹窗交出去的完整选择，取数由日记页按范围去做 */
export interface ExportRequest {
  format: ExportFormat
  range: ExportRange
  from: string
  to: string
  includeDiary: boolean
  includeStamps: boolean
  includeWeather: boolean
  includeTimestamps: boolean
}

const FORMATS: { id: ExportFormat; label?: string; labelKey?: MessageKey; hintKey: MessageKey }[] = [
  { id: 'markdown', label: 'Markdown', hintKey: 'export.markdownHint' },
  { id: 'text', labelKey: 'export.textLabel', hintKey: 'export.textHint' },
  { id: 'json', label: 'JSON', hintKey: 'export.jsonHint' },
]

const CHIP = 'px-2.5 py-1 text-xs'

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`${choiceTile(active)} ${CHIP}`}>
      {label}
    </button>
  )
}

export default function ExportDialog({
  target,
  dateKey,
  selectedCount,
  onConfirm,
  onCancel,
}: {
  /** 「3 条日记」这类已经带好量词的说法 */
  target: string
  /** 当前停留的日期，默认区间从这里往前数 7 天 */
  dateKey: string
  selectedCount: number
  onConfirm: (request: ExportRequest) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [range, setRange] = useState<ExportRange>(selectedCount > 0 ? 'selection' : 'day')
  const [from, setFrom] = useState(shiftDay(dateKey, -6))
  const [to, setTo] = useState(dateKey)
  const [includeDiary, setIncludeDiary] = useState(true)
  const [includeStamps, setIncludeStamps] = useState(true)
  const [includeWeather, setIncludeWeather] = useState(true)
  const [includeTimestamps, setIncludeTimestamps] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('markdown')

  const noContent = !includeDiary && !includeStamps
  const badRange = range === 'range' && from > to
  const blocked = noContent || badRange || (range === 'selection' && selectedCount === 0)

  const ranges: { id: ExportRange; label: string; disabled?: boolean }[] = [
    {
      id: 'selection',
      label: t('export.rangeSelection', { target }),
      disabled: selectedCount === 0,
    },
    { id: 'day', label: t('export.rangeDay', { date: formatDate(dateKey, t) }) },
    { id: 'range', label: t('export.rangeCustom') },
  ]

  return (
    <Modal size="sm" label={t('export.title')} onClose={onCancel} panelClassName="max-h-[85vh] overflow-y-auto">
      <div className="text-sm font-medium">{t('export.title')}</div>

      <div className="mt-3 text-xs text-muted">{t('export.range')}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {ranges.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            aria-pressed={range === item.id}
            onClick={() => setRange(item.id)}
            className={`${choiceTile(range === item.id)} ${CHIP} disabled:opacity-40`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {range === 'range' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <label className="flex items-center gap-1">
            {t('export.from')}
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              className={INPUT_NARROW}
            />
          </label>
          <label className="flex items-center gap-1">
            {t('export.to')}
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              className={INPUT_NARROW}
            />
          </label>
        </div>
      )}
      {badRange && <p className="mt-1 text-xs text-danger">{t('export.rangeInvalid')}</p>}

      <div className="mt-3 text-xs text-muted">{t('export.content')}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        <ToggleChip
          active={includeDiary}
          label={t('export.includeDiary')}
          onClick={() => setIncludeDiary((value) => !value)}
        />
        <ToggleChip
          active={includeStamps}
          label={t('export.includeStamps')}
          onClick={() => setIncludeStamps((value) => !value)}
        />
      </div>
      {noContent && <p className="mt-1 text-xs text-danger">{t('export.noContent')}</p>}

      <div className="mt-3 text-xs text-muted">{t('export.extras')}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        <ToggleChip
          active={includeWeather}
          label={t('export.includeWeather')}
          onClick={() => setIncludeWeather((value) => !value)}
        />
        <ToggleChip
          active={includeTimestamps}
          label={t('export.includeTimestamps')}
          onClick={() => setIncludeTimestamps((value) => !value)}
        />
      </div>
      <p className="mt-1 text-xs text-muted">{t('export.extrasHint')}</p>

      <div className="mt-3 text-xs text-muted">{t('export.format')}</div>
      <div className="mt-1 flex flex-col gap-2">
        {FORMATS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={format === option.id}
            onClick={() => setFormat(option.id)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              format === option.id ? 'border-brand' : 'border-line hover:border-brand'
            }`}
          >
            <span className="block text-sm text-fg">
              {option.labelKey ? t(option.labelKey) : option.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted">{t(option.hintKey)}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() =>
            onConfirm({
              format,
              range,
              from: range === 'range' ? from : dateKey,
              to: range === 'range' ? to : dateKey,
              includeDiary,
              includeStamps,
              includeWeather,
              includeTimestamps,
            })
          }
          className={`${OUTLINE_BUTTON} disabled:opacity-40`}
        >
          {t('export.confirm')}
        </button>
      </div>
    </Modal>
  )
}
