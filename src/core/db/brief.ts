import type { DiaryEntry, DiaryStamp, FinanceEntry, HealthFood, HealthMeal } from './schema'
import type {
  DiaryEntryBrief,
  DiaryStampBrief,
  FinanceEntryBrief,
  HealthFoodBrief,
  HealthMealBrief,
} from './store'

/** Drop inline image payloads before list/search data crosses into UI state. */
export function briefEntry(entry: DiaryEntry | DiaryEntryBrief): DiaryEntryBrief {
  const fields = { ...entry }
  const images = 'images' in entry ? entry.images : undefined
  delete (fields as Partial<DiaryEntry>).images
  return {
    ...fields,
    imageCount: 'imageCount' in entry ? entry.imageCount : images?.length ?? 0,
  }
}

/** Drop inline image payloads before list/search data crosses into UI state. */
export function briefStamp(stamp: DiaryStamp | DiaryStampBrief): DiaryStampBrief {
  const fields = { ...stamp }
  const images = 'images' in stamp ? stamp.images : undefined
  delete (fields as Partial<DiaryStamp>).images
  return {
    ...fields,
    imageCount: 'imageCount' in stamp ? stamp.imageCount : images?.length ?? 0,
  }
}

export function briefFinance(entry: FinanceEntry | FinanceEntryBrief): FinanceEntryBrief {
  const fields = { ...entry }
  const photo = 'photo' in entry ? entry.photo : null
  delete (fields as Partial<FinanceEntry>).photo
  return { ...fields, hasPhoto: 'hasPhoto' in entry ? entry.hasPhoto : Boolean(photo) }
}

export function briefFood(food: HealthFood): HealthFoodBrief {
  const { photo, ...fields } = food
  return { ...fields, hasPhoto: Boolean(photo) }
}

export function briefMeal(meal: HealthMeal): HealthMealBrief {
  const { photo, ...fields } = meal
  return { ...fields, hasPhoto: Boolean(photo) }
}

export function briefFoodRow(food: HealthFood | HealthFoodBrief): HealthFoodBrief {
  return 'hasPhoto' in food ? food : briefFood(food)
}

export function briefMealRow(meal: HealthMeal | HealthMealBrief): HealthMealBrief {
  return 'hasPhoto' in meal ? meal : briefMeal(meal)
}
