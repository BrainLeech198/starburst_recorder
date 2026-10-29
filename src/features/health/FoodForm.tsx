import ErrorNote from '@/shared/ui/ErrorNote'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { INPUT } from '@/shared/ui/inputStyles'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { useI18n } from '@/shared/i18n/context'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import { compressImage } from '@/features/ai/aiVision'
import ImageSourceDialog from '@/shared/ui/ImageSourceDialog'
import { takeNativePhoto, usesNativeCamera } from '@/platform/camera'
import FoodAiChat from './FoodAiChat'
import { compressFoodPhoto } from './foodPhoto'
import { analyzeFoodPhoto, type PhotoMode } from './foodVision'
import { parseAmount } from './parseAmount'

/** 食物库与「记一笔」共用的表单；营养一律按每 100g 填 */
export interface FoodDraft {
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  servingName: string | null
  servingGrams: number | null
  /** 食物照片的 data URL；没上传就是 null */
  photo: string | null
}

function asText(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

export default function FoodForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<FoodDraft>
  submitLabel: string
  onSubmit: (draft: FoodDraft) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [kcal, setKcal] = useState(asText(initial?.kcal))
  const [protein, setProtein] = useState(asText(initial?.protein))
  const [carbs, setCarbs] = useState(asText(initial?.carbs))
  const [fat, setFat] = useState(asText(initial?.fat))
  const [servingName, setServingName] = useState(initial?.servingName ?? '')
  const [servingGrams, setServingGrams] = useState(asText(initial?.servingGrams))
  /** 食物照片；压缩后直接是 data URL，跟其它字段一起提交 */
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null)
  const [photoPicking, setPhotoPicking] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoUploadError, setPhotoUploadError] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  // 第一次打开后就不再卸载对话面板：收起只是藏起来，记录和进行中的请求都留着
  const [aiMounted, setAiMounted] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  /** 正在识别哪张图；null 表示空闲 */
  const [photoBusy, setPhotoBusy] = useState<PhotoMode | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [photoNote, setPhotoNote] = useState('')
  const [error, setError] = useState('')
  /** 正在选来源的拍照模式：label＝成分表、dish＝实物 */
  const [photoMode, setPhotoMode] = useState<PhotoMode | null>(null)
  /** 弹窗先关、文件选择后完成：模式要留在 ref 里，等 onChange 回来再取 */
  const photoModeRef = useRef<PhotoMode | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  /** 食物照片自己的选图 input，别和上面「拍照识别营养」混用 */
  const photoFileRef = useRef<HTMLInputElement>(null)
  const photoCameraRef = useRef<HTMLInputElement>(null)

  const aiReady = isConfigured(loadAiConfig())

  function openAi() {
    setAiMounted(true)
    setAiOpen(true)
  }

  /** 只改营养和份量这几格，名字一起带上；照片不跟着 AI 结果走 */
  function fill(draft: Omit<FoodDraft, 'photo'>) {
    setName(draft.name)
    setKcal(asText(draft.kcal))
    setProtein(asText(draft.protein))
    setCarbs(asText(draft.carbs))
    setFat(asText(draft.fat))
    setServingName(draft.servingName ?? '')
    setServingGrams(asText(draft.servingGrams))
  }

  /** AI 估算结果只负责填字，不改用户已经手填的其他字段 */
  function applyAi(draft: FoodDraft) {
    fill(draft)
    setAiOpen(false)
    setError('')
  }

  /** 拍成分表读数字，或者拍实物估一份；填完还能自己改 */
  async function importPhoto(file: File, mode: PhotoMode) {
    setPhotoBusy(mode)
    setPhotoError('')
    setPhotoNote('')
    try {
      const dataUrl = await compressImage(file)
      const result = await analyzeFoodPhoto(loadAiConfig(), dataUrl, [], mode)
      if (!result.ok || !result.guess) {
        setPhotoError(result.error || t('foods.photoFailed'))
        return
      }
      const guess = result.guess
      fill({
        name: guess.name,
        kcal: guess.kcal,
        protein: guess.protein,
        carbs: guess.carbs,
        fat: guess.fat,
        servingName: guess.servingName,
        servingGrams: guess.servingGrams,
      })
      setPhotoNote(mode === 'label' ? t('foods.photoLabelDone') : t('foods.photoDishDone'))
    } catch (failure) {
      setPhotoError((failure as Error).message || t('foods.photoFailed'))
    } finally {
      setPhotoBusy(null)
    }
  }

  /** 选来源：两种拍照模式共用同一层来源弹窗 */
  function startPhoto(mode: PhotoMode) {
    photoModeRef.current = mode
    setPhotoMode(mode)
    setPhotoError('')
    setPhotoNote('')
  }

  async function takePhoto() {
    const mode = photoModeRef.current
    if (!mode) return
    if (!usesNativeCamera()) {
      cameraRef.current?.click()
      return
    }
    const shot = await takeNativePhoto()
    photoModeRef.current = null
    setPhotoMode(null)
    if (shot) void importPhoto(shot, mode)
  }

  function handlePhotoFile(file: File | undefined) {
    const mode = photoModeRef.current
    photoModeRef.current = null
    setPhotoMode(null)
    if (file && mode) void importPhoto(file, mode)
  }

  /** 只压图、不识别：照片只是列表和详情里的参考图 */
  async function uploadFoodPhoto(file: File | undefined) {
    if (!file) return
    setPhotoUploading(true)
    setPhotoUploadError('')
    try {
      setPhoto(await compressFoodPhoto(file))
    } catch (failure) {
      setPhotoUploadError((failure as Error).message || t('foods.photoFailed'))
    } finally {
      setPhotoUploading(false)
    }
  }

  async function takeFoodPhoto() {
    if (!usesNativeCamera()) {
      photoCameraRef.current?.click()
      return
    }
    const shot = await takeNativePhoto()
    if (shot) void uploadFoodPhoto(shot)
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('foods.nameRequired'))
      return
    }
    const numbers = [kcal, protein, carbs, fat].map(parseAmount)
    if (numbers.some((value) => value === null)) {
      setError(t('foods.numberInvalid'))
      return
    }
    const grams = servingName.trim() === '' ? 0 : parseAmount(servingGrams)
    if (grams === null) {
      setError(t('foods.numberInvalid'))
      return
    }
    setError('')
    onSubmit({
      name: trimmed,
      kcal: numbers[0] as number,
      protein: numbers[1] as number,
      carbs: numbers[2] as number,
      fat: numbers[3] as number,
      servingName: servingName.trim() === '' ? null : servingName.trim(),
      servingGrams: grams > 0 ? grams : null,
      photo,
    })
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-muted">{t('foods.name')}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('foods.namePlaceholder')}
          className={`${INPUT} mt-1`}
        />
      </label>

      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-2.5">
        {photo ? (
          <img
            src={photo}
            alt={t('foods.photoField')}
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-line px-1 text-center text-[11px] text-muted">
            {t('foods.photoField')}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] text-muted">{t('foods.photoHint')}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={photoUploading}
              onClick={() => setPhotoPicking(true)}
              className={`${OUTLINE_BUTTON} px-2 py-1 text-xs`}
            >
              {photoUploading
                ? t('foods.photoUploading')
                : photo
                  ? t('foods.photoReplace')
                  : t('foods.photoAdd')}
            </button>
            {photo && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-danger"
              >
                {t('foods.photoRemove')}
              </button>
            )}
          </div>
          {photoUploadError !== '' && <ErrorNote>{photoUploadError}</ErrorNote>}
        </div>
      </div>

      <input
        ref={photoFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void uploadFoodPhoto(file)
        }}
      />
      <input
        ref={photoCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void uploadFoodPhoto(file)
        }}
      />
      {photoPicking && (
        <ImageSourceDialog
          onTakePhoto={() => void takeFoodPhoto()}
          onPickFile={() => photoFileRef.current?.click()}
          onClose={() => setPhotoPicking(false)}
        />
      )}

      {!aiOpen && (
        <button type="button" onClick={openAi} className={`${OUTLINE_BUTTON} w-full`}>
          {t('foods.aiAsk')}
        </button>
      )}
      {aiMounted && (
        <div className={aiOpen ? undefined : 'hidden'}>
          <FoodAiChat
            open={aiOpen}
            initialName={name}
            onApply={applyAi}
            onClose={() => setAiOpen(false)}
          />
        </div>
      )}

      {!photoOpen && (
        <button
          type="button"
          onClick={() => setPhotoOpen(true)}
          className={`${OUTLINE_BUTTON} w-full`}
        >
          {t('foods.photoAsk')}
        </button>
      )}
      {photoOpen && (
        <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="m-0 text-sm text-fg">{t('foods.photoTitle')}</p>
              <p className="m-0 mt-0.5 text-xs text-muted">{t('foods.photoDesc')}</p>
            </div>
            <button
              type="button"
              onClick={() => setPhotoOpen(false)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
            >
              {t('foods.aiClose')}
            </button>
          </div>

          {!aiReady ? (
            <div className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
              {t('foods.aiNoConfig')}
              <div className="mt-2">
                <Link to="/me/agent/ai" className="text-brand underline">
                  {t('foods.aiGoSettings')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(['label', 'dish'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={photoBusy !== null}
                    onClick={() => startPhoto(mode)}
                    className={`${OUTLINE_BUTTON} justify-center text-center`}
                  >
                    {photoBusy === mode
                      ? t('foods.photoReading')
                      : t(mode === 'label' ? 'foods.photoLabel' : 'foods.photoDish')}
                  </button>
                ))}
              </div>
              {photoError !== '' && <ErrorNote>{photoError}</ErrorNote>}
              {photoNote !== '' && <p className="m-0 text-xs text-brand">{photoNote}</p>}
            </>
          )}
        </div>
      )}

      <div>
        <span className="text-xs text-muted">{t('foods.per100')}</span>
        {/* 每个框都带固定标签：只在 placeholder 里写名字，填上数字后就分不清是热量还是蛋白 */}
        <div className="mt-1 grid grid-cols-2 gap-2">
          {[
            { label: t('foods.kcal'), value: kcal, onChange: setKcal },
            { label: t('foods.protein'), value: protein, onChange: setProtein },
            { label: t('foods.carbs'), value: carbs, onChange: setCarbs },
            { label: t('foods.fat'), value: fat, onChange: setFat },
          ].map((field) => (
            <label key={field.label} className="block">
              <span className="text-[11px] text-muted">{field.label}</span>
              <input
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className={`${INPUT} mt-0.5`}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-muted">{t('foods.servingName')}</span>
          <input
            value={servingName}
            onChange={(event) => setServingName(event.target.value)}
            placeholder={t('foods.servingNamePlaceholder')}
            className={`${INPUT} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">{t('foods.servingGrams')}</span>
          <input
            value={servingGrams}
            onChange={(event) => setServingGrams(event.target.value)}
            inputMode="decimal"
            placeholder="120"
            className={`${INPUT} mt-1`}
          />
        </label>
      </div>

      {error !== '' && <ErrorNote>{error}</ErrorNote>}

      <button type="button" onClick={submit} className={`${SOLID_BUTTON} w-full`}>
        {submitLabel}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          handlePhotoFile(file)
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          handlePhotoFile(file)
        }}
      />

      {photoMode !== null && (
        <ImageSourceDialog
          onPickFile={() => fileRef.current?.click()}
          onTakePhoto={() => void takePhoto()}
          onClose={() => setPhotoMode(null)}
        />
      )}
    </div>
  )
}
