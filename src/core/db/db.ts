import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import { newCode } from '@/core/utils/id'
import type {
  DiaryDay,
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthProfile,
} from './schema'

export const db = new Dexie('starburst') as Dexie & {
  diaryEntries: EntityTable<DiaryEntry, 'id'>
  diaryDays: EntityTable<DiaryDay, 'dateKey'>
  diaryStamps: EntityTable<DiaryStamp, 'id'>
  diaryPresets: EntityTable<DiaryPreset, 'id'>
  healthProfile: EntityTable<HealthProfile, 'id'>
  healthFoods: EntityTable<HealthFood, 'id'>
  healthIntakes: EntityTable<HealthIntake, 'id'>
  healthMeals: EntityTable<HealthMeal, 'id'>
  financeEntries: EntityTable<FinanceEntry, 'id'>
}

db.version(1).stores({
  diaryEntries: 'id, code, dateKey, createdAt, deletedAt',
  diaryDays: 'dateKey, updatedAt',
})

// 随记：一天多笔，按 time 升序取用
db.version(2).stores({
  diaryStamps: 'id, dateKey, time, createdAt, deletedAt',
})

// 健康：档案单行，食物库与摄入都按名称/日期查
db.version(3).stores({
  healthProfile: 'id',
  healthFoods: 'id, name, deletedAt',
  healthIntakes: 'id, dateKey, createdAt, deletedAt',
})

// 套餐：整体食物的组合，按名称查，同样软删除
db.version(4).stores({
  healthMeals: 'id, name, deletedAt',
})

// 经济：占位表，先让分块备份有东西可带
db.version(5).stores({
  financeEntries: 'id, dateKey, deletedAt',
})

// 食物和摄入也带 7 位短编号：这里只给旧记录补齐，表结构不变
db.version(6)
  .stores({})
  .upgrade((tx) =>
    tx
      .table('healthFoods')
      .toCollection()
      .modify((food: HealthFood) => {
        if (!food.code) food.code = newCode()
      })
      .then(() =>
        tx
          .table('healthIntakes')
          .toCollection()
          .modify((intake: HealthIntake) => {
            if (!intake.code) intake.code = newCode()
          }),
      )
      .then(() => undefined),
  )

// 日记预设库：常用人物 / 常用地名，按分类和名称查，同样软删除
db.version(7).stores({
  diaryPresets: 'id, code, kind, name, deletedAt',
})
