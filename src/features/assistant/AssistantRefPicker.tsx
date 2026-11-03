/**
 * @ 引用：从最近记录里挑一条，把带日期的引用插进输入框。
 * 引用的是一句人话，模型仍然要用工具去读原文；这里只是帮用户把话说准。
 */
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { exportAllData } from '@/features/health/healthRepo'
import type { BackupData } from '@/core/db/store'
import { shiftDay, todayKey } from '@/core/utils/dateKey'
import Modal from '@/shared/ui/Modal'
import { INPUT } from '@/shared/ui/inputStyles'

interface RefOption {
  id: string
  group: string
  label: string
  text: string
}

function snippet(text: string, max = 28) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function alive(item: { deletedAt?: number | null }) {
  return (item.deletedAt ?? null) === null
}

export default function AssistantRefPicker({
  onPick,
  onClose,
}: {
  onPick: (text: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [data, setData] = useState<BackupData | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let canceled = false
    void exportAllData().then((next) => {
      if (!canceled) setData(next)
    })
    return () => {
      canceled = true
    }
  }, [])

  const options = useMemo<RefOption[]>(() => {
    if (!data) return []
    const today = todayKey()
    const list: RefOption[] = [
      { id: 'today', group: t('assistant.refDate'), label: t('assistant.refToday'), text: `@${t('assistant.refToday')}（${today}）` },
      { id: 'yesterday', group: t('assistant.refDate'), label: t('assistant.refYesterday'), text: `@${t('assistant.refYesterday')}（${shiftDay(today, -1)}）` },
      { id: 'week', group: t('assistant.refDate'), label: t('assistant.refWeek'), text: `@${t('assistant.refWeek')}（${shiftDay(today, -6)} ~ ${today}）` },
    ]

    const diaries = data.entries
      .filter(alive)
      .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
      .slice(0, 6)
    for (const entry of diaries) {
      const body = snippet(entry.content)
      list.push({
        id: `diary-${entry.id}`,
        group: t('assistant.refDiary'),
        label: `${entry.dateKey}${body ? ` · ${body}` : ''}`,
        text: `@${t('assistant.refDiary')} ${entry.dateKey}${body ? `「${body}」` : ''}`,
      })
    }

    const stamps = data.stamps
      .filter(alive)
      .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
      .slice(0, 6)
    for (const stamp of stamps) {
      const body = snippet(stamp.content)
      list.push({
        id: `stamp-${stamp.id}`,
        group: t('assistant.refStamp'),
        label: `${stamp.dateKey} ${stamp.time}${body ? ` · ${body}` : ''}`,
        text: `@${t('assistant.refStamp')} ${stamp.dateKey} ${stamp.time}${body ? `「${body}」` : ''}`,
      })
    }

    const finance = data.finance
      .filter(alive)
      .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
      .slice(0, 6)
    for (const entry of finance) {
      list.push({
        id: `finance-${entry.id}`,
        group: t('assistant.refFinance'),
        label: `${entry.dateKey} · ${entry.name} ${entry.amount}`,
        text: `@${t('assistant.refFinance')} ${entry.dateKey} ${entry.name} ${entry.amount}`,
      })
    }

    for (const food of data.foods.filter(alive).slice(0, 8)) {
      list.push({
        id: `food-${food.id}`,
        group: t('assistant.refFood'),
        label: food.name,
        text: `@${t('assistant.refFood')} ${food.name}`,
      })
    }

    for (const meal of data.meals.filter(alive).slice(0, 8)) {
      list.push({
        id: `meal-${meal.id}`,
        group: t('assistant.refMeal'),
        label: meal.name,
        text: `@${t('assistant.refMeal')} ${meal.name}`,
      })
    }

    return list
  }, [data, t])

  const keyword = query.trim().toLowerCase()
  const shown = keyword === ''
    ? options
    : options.filter(
        (item) =>
          item.label.toLowerCase().includes(keyword) || item.text.toLowerCase().includes(keyword),
      )

  return (
    <Modal size="sm" label={t('assistant.refTitle')} onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-medium">{t('assistant.refTitle')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg md:h-7 md:w-7"
        >
          ✕
        </button>
      </div>

      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('assistant.refSearch')}
        aria-label={t('assistant.refSearch')}
        className={`${INPUT} mt-3 h-10 text-xs md:h-8`}
      />

      <div className="mt-2 max-h-[55dvh] overflow-y-auto">
        {data === null ? (
          <p className="m-0 py-3 text-xs text-muted">{t('assistant.refLoading')}</p>
        ) : shown.length === 0 ? (
          <p className="m-0 py-3 text-xs text-muted">{t('assistant.refEmpty')}</p>
        ) : (
          shown.map((item, index) => {
            const first = index === 0 || shown[index - 1].group !== item.group
            return (
              <div key={item.id}>
                {first && (
                  <p className="m-0 mt-2 mb-1 text-[10px] tracking-wide text-muted first:mt-0">
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onPick(item.text)}
                  className="flex min-h-11 w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs text-fg transition-colors hover:bg-brand/10 hover:text-brand md:min-h-0 md:py-1.5"
                >
                  <span className="mt-0.5 shrink-0 text-[10px] text-brand" aria-hidden="true">
                    @
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
