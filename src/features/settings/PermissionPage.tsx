/**
 * 「编辑权限」二级页：决定助手能不能改记录、改之前要不要问。
 *
 * 三档从紧到松，选完立刻生效；删除类动作不管哪一档都要确认，
 * 免得模型一句话把记录删掉——这一点写在页面底部。
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import PageShell from '@/shared/ui/PageShell'
import { choiceTile } from '@/shared/ui/buttonStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import {
  loadPermission,
  savePermission,
  type AssistantPermission,
} from '@/features/assistant/assistantPermission'

const OPTIONS: { id: AssistantPermission; label: MessageKey; hint: MessageKey }[] = [
  { id: 'readonly', label: 'permission.readonly', hint: 'permission.readonlyHint' },
  { id: 'confirm', label: 'permission.confirm', hint: 'permission.confirmHint' },
  { id: 'auto', label: 'permission.auto', hint: 'permission.autoHint' },
]

export default function PermissionPage() {
  const { t } = useI18n()
  const [permission, setPermission] = useState<AssistantPermission>(() => loadPermission())
  const current = OPTIONS.find((item) => item.id === permission)

  function choose(next: AssistantPermission) {
    setPermission(next)
    savePermission(next)
  }

  return (
    <PageShell
      title={t('agent.permission')}
      backTo="/me/agent"
      backLabel={t('me.agent')}
      badge={<SettingBadge>{current ? t(current.label) : permission}</SettingBadge>}
      description={t('permission.description')}
    >
      <SettingCard>
        <SettingGroup label={t('permission.title')} first>
          <div className="flex flex-col gap-2">
            {OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option.id)}
                className={choiceTile(
                  permission === option.id,
                  'flex flex-col items-start gap-1 px-3 py-2 text-left',
                )}
              >
                <span className="flex items-center gap-2 text-sm">
                  {t(option.label)}
                  {permission === option.id && <span aria-hidden="true">✓</span>}
                </span>
                <span className="text-xs text-muted">{t(option.hint)}</span>
              </button>
            ))}
          </div>
          <p className="m-0 mt-2 text-[11px] text-muted">{t('permission.deleteNote')}</p>
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
