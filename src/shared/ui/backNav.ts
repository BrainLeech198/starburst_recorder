/**
 * 「返回上一页」到底回哪儿：先问浏览器历史，退无可退才回页面自己声明的父级。
 *
 * 起因（2026-11-02）：「全部记录 → 点开一条 → 返回」被送回日记首页，而不是刚才那个列表——
 * 因为每个页面的返回目标都是硬编码的 `backTo`，它只知道「我的父级是谁」，
 * 不知道「用户是从哪儿进来的」。同一个详情页可能从列表、从全局搜索、从日历进来，
 * 硬编码只能挑一个，其余全是错的。
 *
 * 这里改成真栈：
 *   - 历史里还有上一页 → `navigate(-1)`，原路退回，从哪儿来回哪儿去
 *   - 没有上一页（直接打开链接、冷启动落到某个子页）→ 退回 `fallback`，避免退到空白页
 *
 * 判据是 `window.history.state.idx`：react-router 自己在 push / replace 时维护这个栈深，
 * 第 0 条是本标签页的第一页。只认 idx 不认 `history.length`——后者算上了进站之前的历史，
 * 深链打开时也会大于 1，拿它判断会退到站外。
 *
 * 降级：万一哪天 react-router 不再写 idx，这里一律返回 false，行为退回「硬编码父级」，
 * 只是少了「回原路」，不会把用户送到站外。
 */
import { useNavigate } from 'react-router'

/** 历史里是否还有上一页；state 传 `window.history.state` */
export function canGoBackFrom(state: unknown): boolean {
  const idx = (state as { idx?: unknown } | null | undefined)?.idx
  return typeof idx === 'number' && Number.isFinite(idx) && idx > 0
}

/**
 * 返回上一页；退无可退时去 fallback。
 * fallback 用 `replace`：这一页本来就是历史里的第一页，不该再压一条新的上去。
 */
export function useBack(fallback: string): () => void {
  const navigate = useNavigate()
  return () => {
    if (canGoBackFrom(window.history.state)) void navigate(-1)
    else void navigate(fallback, { replace: true })
  }
}
