/**
 * 「全部记录」列表的筛选与分页口径。
 *
 * 这些状态全在 URL 里（`?kind=stamp&page=2`），好处是：从这儿点开一条再返回，
 * 真栈返回把原来的地址整条弹回来，筛子和页码都还在——不用另存一份内存状态。
 * 代价是 URL 是用户和别处都能改的：手输、老书签、点到脏链接，都得能兜住。
 *
 * 所以判据集中在这里，全是纯函数，`archiveQuery.test.ts` 直接测：
 *   - 认不出的 kind 一律当「全部」，不报错
 *   - 页码对外从 1 起、对内从 0 起；非数字、0、负数、小数都当第一页
 *   - 越界页码（原来在第 5 页，切到只有 1 页的筛子）夹到最后一页，不显示空列表
 */

export type ArchiveKind = 'all' | 'diary' | 'stamp'

export const ARCHIVE_KINDS: ArchiveKind[] = ['all', 'diary', 'stamp']

/** 一页多少条：20 条大约一屏半，翻页不会太碎 */
export const ARCHIVE_PAGE_SIZE = 20

/** URL 里的 kind：只认这两个值，其余（含 null）都是「全部」 */
export function kindFrom(param: string | null | undefined): ArchiveKind {
  return param === 'diary' || param === 'stamp' ? param : 'all'
}

/** URL 里的 page（1 起）→ 内部页码（0 起）。脏数据一律当第一页 */
export function pageFrom(param: string | null | undefined): number {
  const value = Number(param ?? '1')
  if (!Number.isFinite(value) || value < 1) return 0
  return Math.floor(value) - 1
}

/** 一共几页：没有记录也算 1 页，免得出现「第 1 / 0 页」 */
export function pageCount(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1
  return Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE))
}

/** 把越界页码夹回范围内 */
export function clampPage(page: number, total: number): number {
  const last = pageCount(total) - 1
  if (!Number.isFinite(page) || page < 0) return 0
  return Math.min(Math.floor(page), last)
}

/** 取当前页那一段 */
export function slicePage<T>(items: T[], page: number): T[] {
  const safe = clampPage(page, items.length)
  return items.slice(safe * ARCHIVE_PAGE_SIZE, (safe + 1) * ARCHIVE_PAGE_SIZE)
}

/**
 * 拼回 URL 查询串。
 *
 * 默认值不写进 URL：`all` 与第 1 页都是常态，留空让地址短一点，
 * 也让「切筛子」和「翻页」不会在历史里堆出 `?kind=all&page=1` 这种噪声。
 */
export function queryOf(kind: ArchiveKind, page: number): Record<string, string> {
  return {
    ...(kind === 'all' ? {} : { kind }),
    ...(page <= 0 ? {} : { page: String(page + 1) }),
  }
}
