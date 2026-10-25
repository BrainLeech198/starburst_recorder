/**
 * 导入备份时发现冲突 → 让用户一条条决定留哪边。
 *
 * 默认全选「本地」：导入是个加分操作，默认不应该拿走用户手里已有的东西。
 * 想覆盖的人一键「全部用备份」，不用一条条点。
 *
 * 列表里只放得下 48 字摘要，长日记根本判断不了，所以每条都能点开「看全文」：
 * 同一个弹窗里换成对照层（宽屏并排两栏，窄屏上下堆叠），相同的字淡化、不同的字加深。
 * 不另叠一层弹窗——两层都会抢 Esc 和 Tab，焦点陷阱也互相打架。
 */
import { GHOST_BUTTON } from '@/shared/ui/buttonStyles'
import { useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { formatStamp } from '@/core/utils/dateKey'
import { conflictKey, diffText } from './diaryMerge'
import type { ConflictKind, DiffSegment, MergeConflict } from './diaryMerge'

const KIND_LABEL: Record<ConflictKind, MessageKey> = {
  entry: 'data.conflictKindEntry',
  stamp: 'data.conflictKindStamp',
  day: 'data.conflictKindDay',
  preset: 'data.conflictKindPreset',
  food: 'data.conflictKindFood',
  meal: 'data.conflictKindMeal',
  intake: 'data.conflictKindIntake',
  profile: 'data.conflictKindProfile',
}

/** 对照层里的一栏：谁、什么时候改的、多少字、删没删、全文 */
function DetailSide({
  title,
  at,
  deleted,
  body,
  segments,
  chosen,
}: {
  title: string
  at: number
  deleted: boolean
  body: string
  segments: DiffSegment[]
  chosen: boolean
}) {
  const { t } = useI18n()
  return (
    <section
      className={`rounded-xl border px-3 py-2 ${chosen ? 'border-brand bg-brand/5' : 'border-line'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg">{title}</span>
        {chosen && (
          <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[11px] text-brand">
            {t('data.conflictChosen')}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted">
        <span>{t('data.conflictUpdatedAt', { time: formatStamp(at) })}</span>
        <span>{t('data.conflictChars', { count: body.length })}</span>
        {deleted && <span className="text-danger">{t('data.conflictDeleted')}</span>}
      </div>
      <div className="mt-2 max-h-[38vh] overflow-y-auto text-sm leading-6 break-words whitespace-pre-wrap">
        {body.trim() === '' ? (
          <span className="text-muted">{t('data.conflictEmptyText')}</span>
        ) : (
          segments.map((segment, index) => (
            <span key={index} className={segment.same ? 'text-muted' : 'text-fg'}>
              {segment.text}
            </span>
          ))
        )}
      </div>
    </section>
  )
}

export default function ConflictDialog({
  conflicts,
  onCancel,
  onDone,
}: {
  conflicts: MergeConflict[]
  onCancel: () => void
  /** 交回「保留本地」的那些项，其余按备份的版本导入 */
  onDone: (keepLocal: Set<string>) => void
}) {
  const { t } = useI18n()
  // 默认全部保留本地
  const [keepLocal, setKeepLocal] = useState<Set<string>>(
    () => new Set(conflicts.map((item) => conflictKey(item))),
  )
  /** 正在看全文的那一条；非空时弹窗内容换成对照层 */
  const [detail, setDetail] = useState<MergeConflict | null>(null)

  function toggle(item: MergeConflict, keep: boolean) {
    setKeepLocal((previous) => {
      const next = new Set(previous)
      if (keep) next.add(conflictKey(item))
      else next.delete(conflictKey(item))
      return next
    })
  }

  /** 在对照层里直接定夺，选完退回列表 */
  function choose(item: MergeConflict, keep: boolean) {
    toggle(item, keep)
    setDetail(null)
  }

  if (detail) {
    const keep = keepLocal.has(conflictKey(detail))
    const diff = diffText(detail.localBody, detail.incomingBody)
    return (
      <Modal
        size="xl"
        label={detail.label}
        panelClassName="max-h-[90vh] overflow-y-auto"
        onClose={() => setDetail(null)}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => setDetail(null)}
            className="text-xs text-muted transition-colors hover:text-fg"
          >
            ← {t('data.conflictBack')}
          </button>
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
            {t(KIND_LABEL[detail.kind])}
          </span>
        </div>
        <div className="mt-1 text-sm font-medium">
          {detail.label || t(KIND_LABEL[detail.kind])}
        </div>
        <p className="mt-1 text-xs text-muted">{t('data.conflictDetailHint')}</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <DetailSide
            title={t('data.conflictLocal')}
            at={detail.localAt}
            deleted={detail.localDeleted}
            body={detail.localBody}
            segments={diff.local}
            chosen={keep}
          />
          <DetailSide
            title={t('data.conflictIncoming')}
            at={detail.incomingAt}
            deleted={detail.incomingDeleted}
            body={detail.incomingBody}
            segments={diff.incoming}
            chosen={!keep}
          />
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => choose(detail, true)}
            className={GHOST_BUTTON}
          >
            {t('data.conflictKeepLocal')}
          </button>
          <button
            type="button"
            onClick={() => choose(detail, false)}
            className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2"
          >
            {t('data.conflictUseIncoming')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal size="lg" label={t('data.conflictTitle', { count: conflicts.length })} onClose={onCancel}>
      <div className="text-sm font-medium">{t('data.conflictTitle', { count: conflicts.length })}</div>
      <p className="mt-1 text-xs text-muted">{t('data.conflictDesc')}</p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setKeepLocal(new Set(conflicts.map((item) => conflictKey(item))))}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg"
        >
          {t('data.conflictAllLocal')}
        </button>
        <button
          type="button"
          onClick={() => setKeepLocal(new Set())}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg"
        >
          {t('data.conflictAllIncoming')}
        </button>
      </div>

      <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
        {conflicts.map((item) => {
          const key = conflictKey(item)
          const keep = keepLocal.has(key)
          return (
            <li key={key} className="rounded-xl border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                    {t(KIND_LABEL[item.kind])}
                  </span>
                  <span className="text-xs text-fg">
                    {item.label || t(KIND_LABEL[item.kind])}
                  </span>
                </div>
                <div className="flex shrink-0 rounded-lg border border-line p-0.5">
                  <button
                    type="button"
                    onClick={() => toggle(item, true)}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                      keep ? 'bg-brand text-on-brand' : 'text-muted hover:text-fg'
                    }`}
                  >
                    {t('data.conflictLocal')}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(item, false)}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                      keep ? 'text-muted hover:text-fg' : 'bg-brand text-on-brand'
                    }`}
                  >
                    {t('data.conflictIncoming')}
                  </button>
                </div>
              </div>
              <dl className="mt-1.5 space-y-0.5 text-xs">
                <div className="flex gap-1.5">
                  <dt className={`shrink-0 ${keep ? 'text-fg' : 'text-muted'}`}>
                    {t('data.conflictLocal')}
                  </dt>
                  <dd className={`min-w-0 break-all ${keep ? 'text-fg' : 'text-muted'}`}>
                    {item.localDeleted
                      ? t('data.conflictDeleted')
                      : item.localText || t('data.conflictEmptyText')}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className={`shrink-0 ${keep ? 'text-muted' : 'text-fg'}`}>
                    {t('data.conflictIncoming')}
                  </dt>
                  <dd className={`min-w-0 break-all ${keep ? 'text-muted' : 'text-fg'}`}>
                    {item.incomingDeleted
                      ? t('data.conflictDeleted')
                      : item.incomingText || t('data.conflictEmptyText')}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => setDetail(item)}
                className="mt-1 text-[11px] text-brand transition-colors hover:underline"
              >
                {t('data.conflictViewFull')} ›
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={GHOST_BUTTON}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onDone(keepLocal)}
          className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2"
        >
          {t('data.conflictContinue')}
        </button>
      </div>
    </Modal>
  )
}
