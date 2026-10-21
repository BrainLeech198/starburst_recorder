/**
 * 「AI 模型」二级页。
 *
 * AiSection 自带标题、说明、状态徽章，以及返回行里的新增 / 测试 / 批量动作，
 * 所以它自己就是完整的一页；这里只负责把路由页接上。
 */
import AiSection from '@/features/ai/AiSection'

export default function AiPage() {
  return <AiSection />
}
