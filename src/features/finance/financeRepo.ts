/** 经济模块的数据入口，和 `health/healthRepo.ts` 同一个套路：页面只认这里。 */
import { store } from '@/core/db'

export const { financeOfMonth, addFinance, saveFinance, removeFinance, restoreFinance } = store
