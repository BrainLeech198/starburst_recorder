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
  HealthSleep,
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
  healthSleeps: EntityTable<HealthSleep, 'id'>
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

// 随记也带 7 位短编号：表结构不变，只给旧记录补齐
db.version(8)
  .stores({})
  .upgrade((tx) =>
    tx
      .table('diaryStamps')
      .toCollection()
      .modify((stamp: DiaryStamp) => {
        if (!stamp.code) stamp.code = newCode()
      })
      .then(() => undefined),
  )

// 睡眠：一夜一行，按起床那天查
db.version(9).stores({
  healthSleeps: 'id, dateKey, deletedAt',
})

// 日记与随记可以带图：表结构不变（图片是记录里的一个字段），只给老记录补上空数组
db.version(10)
  .stores({})
  .upgrade((tx) =>
    tx
      .table('diaryEntries')
      .toCollection()
      .modify((entry: DiaryEntry) => {
        if (!Array.isArray(entry.images)) entry.images = []
      })
      .then(() =>
        tx
          .table('diaryStamps')
          .toCollection()
          .modify((stamp: DiaryStamp) => {
            if (!Array.isArray(stamp.images)) stamp.images = []
          }),
      )
      .then(() => undefined),
  )

// 睡眠补夜醒次数与累计分钟：表结构不变，只给老记录补 null
db.version(11)
  .stores({})
  .upgrade((tx) =>
    tx
      .table('healthSleeps')
      .toCollection()
      .modify((sleep: HealthSleep) => {
        if (typeof sleep.wakeCount !== 'number') sleep.wakeCount = null
        if (typeof sleep.wakeMinutes !== 'number') sleep.wakeMinutes = null
      })
      .then(() => undefined),
  )

// 夜醒改成逐条记时间：表结构不变，老记录补空数组，次数/分钟继续按旧字段展示
db.version(12)
  .stores({})
  .upgrade((tx) =>
    tx
      .table('healthSleeps')
      .toCollection()
      .modify((sleep: HealthSleep) => {
        if (!Array.isArray(sleep.wakeEvents)) sleep.wakeEvents = []
      })
      .then(() => undefined),
  )

// 经济：占位表补上短编号、收支方向与分类，老数据按支出读取
db.version(13)
  .stores({})
  .upgrade((tx) =>
    tx
      .table('financeEntries')
      .toCollection()
      .modify((entry: FinanceEntry) => {
        if (!entry.code) entry.code = newCode()
        if (entry.kind !== 'income' && entry.kind !== 'expense') entry.kind = 'expense'
        if (typeof entry.category !== 'string') entry.category = ''
        entry.amount = Math.abs(entry.amount)
      })
      .then(() => undefined),
  )
