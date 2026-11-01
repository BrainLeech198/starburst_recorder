/**
 * 「深度思考」二级页：决定助手回答前要不要先想一遍。
 *
 * 一个开关，选完立刻生效；对话页输入框上方也有同一个开关，
 * 两边读写的是同一份 localStorage。
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import PageShell from '@/shared/ui/PageShell'
import RowCheckbox from '@/shared/ui/RowCheckbox'
import { loadReasoning, saveReasoning } from '@/features/ai/aiReasoning'

export default function ReasoningPage() {
  const { t } = useI18n()
  const [enabled, setEnabled] = useState(() => loadReasoning())

  function toggle() {
    const next = !enabled
    setEnabled(next)
    saveReasoning(next)
  }

  return (
    <PageShell
      title={t('agent.reasoning')}
      backTo="/me/agent"
      backLabel={t('me.agent')}
      badge={<SettingBadge>{enabled ? t('reasoning.on') : t('reasoning.off')}</SettingBadge>}
      description={t('reasoning.description')}
    >
      <SettingCard>
        <SettingGroup label={t('reasoning.title')} first>
          <div className="flex items-start gap-2">
            <RowCheckbox
              checked={enabled}
              label={t('reasoning.toggle')}
              onToggle={toggle}
            />
            <button type="button" onClick={toggle} className="min-w-0 flex-1 text-left">
              <span className="block text-sm text-fg">{t('reasoning.toggle')}</span>
              <span className="mt-1 block text-xs text-muted">{t('reasoning.toggleHint')}</span>
            </button>
          </div>
          <p className="m-0 mt-2 text-[11px] text-muted">{t('reasoning.note')}</p>
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
