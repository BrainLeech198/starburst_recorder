/**
 * 「AI 整理成日记」的弹窗。
 *
 * 它只干一件事：拿到这一天的随记 → 让 AI 写一篇草稿 → 给用户改 → 把最终文本交回去。
 * 「新建一条日记」那个动作不在这里，交给日记页做，这样弹窗不用知道数据怎么存。
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryStamp } from '@/core/db/schema'
import { formatDate, weekdayKey } from '@/core/utils/dateKey'
import { dayInfo } from '@/features/diary/diaryRepo'
import { parseWeather, weatherIcons, weatherText } from '@/features/diary/weather'
import { loadAiConfig } from './aiConfig'
import { COMPOSE_STYLES, composeDiary } from './aiCompose'
import type { ComposeStyle } from './aiCompose'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import Dropdown from '@/shared/ui/Dropdown'
import { FIELD } from '@/shared/ui/inputStyles'

const FOOTER_BUTTON =
  'rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg'

export default function AiComposeDialog({
  dateKey,
  stamps,
  onConfirm,
  onCancel,
}: {
  dateKey: string
  stamps: DiaryStamp[]
  onConfirm: (content: string) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [config] = useState(loadAiConfig)
  const day = useLiveQuery(() => dayInfo(dateKey), [dateKey])

  const [style, setStyle] = useState<ComposeStyle>('natural')
  const [text, setText] = useState('')
  /** 上一轮生成出来的原文，用来判断草稿有没有被手改过 */
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ms, setMs] = useState(0)
  /** 打开弹窗不直接请求，等用户点「开始生成」——打开即烧 token 不划算 */
  const [requested, setRequested] = useState(false)

  const states = parseWeather(day?.weather)

  async function generate(next: ComposeStyle) {
    setRequested(true)
    setLoading(true)
    setError('')
    const result = await composeDiary(config, {
      dateKey,
      weather: day?.weather,
      stamps,
      style: next,
    })
    setLoading(false)
    setMs(result.ms)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setText(result.content)
    setOrigin(result.content)
  }

  const edited = text !== origin

  return (
    <Modal
      size="lg"
      label={t('ai.composeTitle')}
      onClose={onCancel}
      // 草稿可能比屏幕高，让面板自己滚，遮罩层始终铺满
      panelClassName="max-h-[85vh] overflow-y-auto"
    >
      <div className="text-sm font-medium">{t('ai.composeTitle')}</div>
      <p className="mt-1 text-xs text-muted">
        {t('ai.composeDesc', {
          date: formatDate(dateKey, t),
          weekday: t(weekdayKey(dateKey)),
          count: stamps.length,
          weather:
            states.length > 0
              ? t('ai.composeWeather', {
                  icons: weatherIcons(states),
                  label: weatherText(states, t),
                })
              : '',
        })}
        <span className="text-fg">{t('ai.composeKeepStamps')}</span>
      </p>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-muted">{t('ai.tone')}</span>
        <Dropdown
          label={t(COMPOSE_STYLES.find((item) => item.id === style)!.labelKey)}
          buttonClassName="rounded-lg border border-line px-3 py-1 text-xs text-fg hover:text-brand transition-colors"
          items={COMPOSE_STYLES.map((item) => ({
            label: t(item.labelKey),
            onSelect: () => {
              if (item.id === style) return
              setStyle(item.id)
              // 草稿没被改过就顺手按新口气重写一遍，改过就先留着，免得覆盖你的修改
              if (requested && !edited) void generate(item.id)
            },
          }))}
        />
        {edited && <span className="text-xs text-muted">{t('ai.draftEdited')}</span>}
      </div>

      <div className="mt-3">
        {loading && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            {t('ai.writing')}
          </p>
        )}

        {!loading && error !== '' && (
          <div className="rounded-lg border border-danger px-3 py-2 text-xs text-danger">
            {error}
            <Link to="/me/agent/ai" className="ml-2 underline">
              {t('ai.goCheckSettings')}
            </Link>
          </div>
        )}

        {!loading && error === '' && text !== '' && (
          <textarea
            value={text}
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
            className={`font-hand min-h-56 w-full resize-y leading-6 ${FIELD}`}
          />
        )}

        {!loading && error === '' && text === '' && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            {requested ? t('ai.nothingYet') : t('ai.composeStartHint')}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {ms > 0 && text !== '' ? t('ai.writeTime', { seconds: (ms / 1000).toFixed(1) }) : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void generate(style)}
            className={`${FOOTER_BUTTON} disabled:opacity-40`}
          >
            {!requested ? t('ai.composeStart') : text === '' ? t('ai.retry') : t('ai.regenerate')}
          </button>
          <button type="button" onClick={onCancel} className={FOOTER_BUTTON}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={loading || text.trim() === ''}
            onClick={() => onConfirm(text.trim())}
            className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors disabled:opacity-40"
          >
            {t('ai.writeDiary')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
