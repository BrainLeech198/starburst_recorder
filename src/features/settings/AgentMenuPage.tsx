/**
 * 「助手」菜单：跟星芒助手有关的两项——它的形象（悬浮球）和它的脑子（AI 模型）。
 *
 * 跟「设置」那一页分开：这两项改的是助手本身，不是应用的通用设置。
 */
import { MASCOT_SHAPES, MASCOT_SIZES, useBall } from '../../app/providers/BallProvider'
import SettingRow from '../../shared/ui/SettingRow'
import PageShell from '../../shared/ui/PageShell'
import { SettingBadge } from '../../shared/ui/SettingCard'
import { isConfigured, loadAiConfig } from '../ai/aiConfig'

export default function AgentMenuPage() {
  const { prefs } = useBall()
  const shapeLabel = MASCOT_SHAPES.find((item) => item.id === prefs.shape)?.label ?? prefs.shape
  const sizeLabel = MASCOT_SIZES.find((item) => item.id === prefs.size)?.label ?? prefs.size
  const aiReady = isConfigured(loadAiConfig())

  return (
    <PageShell
      title="助手"
      description="星芒助手长什么样、用哪个模型，都在这里。"
      // 菜单也是"里面的一层"，所以同样要有返回：这里回「我的」
      backTo="/me"
      backLabel="我的"
    >
      <SettingRow
        to="/me/agent/ball"
        emoji="🫧"
        title="悬浮球"
        hint="助手的形象与大小"
        value={
          <SettingBadge>
            {shapeLabel} · {sizeLabel}
          </SettingBadge>
        }
      />
      <SettingRow
        to="/me/agent/ai"
        emoji="🤖"
        title="AI 模型"
        hint="厂商、服务地址、密钥"
        value={
          <SettingBadge tone={aiReady ? 'ok' : 'plain'}>
            {aiReady ? '已配置' : '未配置'}
          </SettingBadge>
        }
      />
    </PageShell>
  )
}
