export type RecordNavAction =
  | { type: 'navigate'; to: '/diary' | '/health' | '/finance' | '/calendar' }
  | { type: 'collapse' }

/** 根据当前页面和二级栏状态，计算「记录」按钮的下一步动作。 */
export function nextRecordNavAction(pathname: string, recordsOpen: boolean): RecordNavAction {
  const section = pathname.split('/')[1] ?? ''

  if (section === 'finance' && recordsOpen) return { type: 'collapse' }
  if (section === 'diary') return { type: 'navigate', to: '/health' }
  if (section === 'health') return { type: 'navigate', to: '/finance' }
  if (section === 'finance') return { type: 'navigate', to: '/calendar' }
  return { type: 'navigate', to: '/diary' }
}
