/** 经济模块的数据入口，和 `health/healthRepo.ts` 同一个套路：页面只认这里。 */
import { store } from '@/core/db'

export const {
  financeOfMonth,
  financeDays,
  addFinance,
  saveFinance,
  removeFinance,
  removeFinances,
  restoreFinance,
  restoreFinances,
  trashedFinance,
  purgeFinance,
  purgeTrashedFinance,
  // 整库取数：经济页的「导出」要把所选流水放进四类记录里一起挑
  exportAllData,
} = store
