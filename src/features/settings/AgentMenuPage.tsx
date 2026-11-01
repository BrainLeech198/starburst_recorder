/**
 * 「助手」菜单：跟星芒助手有关的两项——它的形象（悬浮球）和它的脑子（AI 模型）。
 *
 * 跟「设置」那一页分开：这两项改的是助手本身，不是应用的通用设置。
 */
import { MASCOT_SHAPES, MASCOT_SIZES, useBall } from '@/app/providers/BallProvider'
import { useI18n } from '@/shared/i18n/context'
import SettingRow from '@/shared/ui/SettingRow'
import PageShell from '@/shared/ui/PageShell'
import { SettingBadge } from '@/shared/ui/SettingCard'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import { loadMemories } from '@/features/assistant/assistantMemory'
import { loadSkills } from '@/features/assistant/assistantSkills'
import { loadPermission, type AssistantPermission } from '@/features/assistant/assistantPermission'
import { loadReasoning } from '@/features/ai/aiReasoning'
import type { MessageKey } from '@/shared/i18n/messages/zh'

const PERMISSION_LABEL_KEYS: Record<AssistantPermission, MessageKey> = {
  readonly: 'permission.readonly',
  confirm: 'permission.confirm',
  auto: 'permission.auto',
}

export default function AgentMenuPage() {
  const { prefs } = useBall()
  const { t } = useI18n()
  const shapeOption = MASCOT_SHAPES.find((item) => item.id === prefs.shape)
  const shapeLabel = shapeOption ? t(shapeOption.labelKey) : prefs.shape
  const sizeOption = MASCOT_SIZES.find((item) => item.id === prefs.size)
  const sizeLabel = sizeOption ? t(sizeOption.labelKey) : prefs.size
  const aiReady = isConfigured(loadAiConfig())
  const memoryCount = loadMemories().length
  const skillCount = loadSkills().filter((skill) => skill.enabled).length
  const permission = loadPermission()
  const reasoning = loadReasoning()

  return (
    <PageShell
      title={t('me.agent')}
      description={t('agent.description')}
      // 菜单也是"里面的一层"，所以同样要有返回：这里回「我的」
      backTo="/me"
      backLabel={t('me.title')}
    >
      <SettingRow
        to="/me/agent/ball"
        emoji="🫧"
        title={t('agent.ball')}
        hint={t('agent.ballHint')}
        value={
          <SettingBadge>
            {shapeLabel} · {sizeLabel}
          </SettingBadge>
        }
      />
      <SettingRow
        to="/me/agent/ai"
        emoji="🤖"
        title={t('agent.ai')}
        hint={t('agent.aiHint')}
        value={
          <SettingBadge tone={aiReady ? 'ok' : 'plain'}>
            {aiReady ? t('agent.configured') : t('agent.notConfigured')}
          </SettingBadge>
        }
      />
      <SettingRow
        to="/me/agent/memory"
        emoji="🧠"
        title={t('agent.memory')}
        hint={t('agent.memoryHint')}
        value={<SettingBadge>{t('agent.memoryCount', { count: memoryCount })}</SettingBadge>}
      />
      <SettingRow
        to="/me/agent/skills"
        emoji="🧩"
        title={t('agent.skills')}
        hint={t('agent.skillsHint')}
        value={<SettingBadge>{t('agent.skillCount', { count: skillCount })}</SettingBadge>}
      />
      <SettingRow
        to="/me/agent/permission"
        emoji="🔐"
        title={t('agent.permission')}
        hint={t('agent.permissionHint')}
        value={<SettingBadge>{t(PERMISSION_LABEL_KEYS[permission])}</SettingBadge>}
      />
      <SettingRow
        to="/me/agent/reasoning"
        emoji="🧭"
        title={t('agent.reasoning')}
        hint={t('agent.reasoningHint')}
        value={<SettingBadge>{reasoning ? t('reasoning.on') : t('reasoning.off')}</SettingBadge>}
      />
    </PageShell>
  )
}
