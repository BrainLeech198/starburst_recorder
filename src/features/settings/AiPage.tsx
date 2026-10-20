/**
 * 「AI 模型」二级页。
 *
 * AiSection 本来就自带标题、说明与状态徽章（它是完整的一块），
 * 所以页头这里不再写页面名，免得同一个名字出现两遍。
 */
import AiSection from '../ai/AiSection'
import PageShell from '../../shared/ui/PageShell'

export default function AiPage() {
  return (
    <PageShell backTo="/me/agent" backLabel="助手">
      <AiSection />
    </PageShell>
  )
}
