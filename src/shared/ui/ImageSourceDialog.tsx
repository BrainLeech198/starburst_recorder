/**
 * 选图来源弹窗：所有「加一张图片」的入口都先问一句是选文件还是拍照。
 * 安卓原生端拍照走 Capacitor 相机，其它手机走带 capture 的 input。
 */
import { useI18n } from '@/shared/i18n/context'
import Modal from './Modal'
import { OUTLINE_BUTTON, SOLID_BUTTON } from './buttonStyles'
import { canUseCamera } from '@/platform/camera'

export default function ImageSourceDialog({
  onPickFile,
  onTakePhoto,
  onDraw,
  onClose,
}: {
  onPickFile: () => void
  onTakePhoto: () => void
  /** 日记 / 随记才提供手绘；不传就只显示选文件和拍照 */
  onDraw?: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const cameraOK = canUseCamera()

  return (
    <Modal size="xs" label={t('imageSource.title')} onClose={onClose}>
      <div className="text-sm font-medium text-fg">{t('imageSource.title')}</div>
      <p className="m-0 mt-1 text-xs text-muted">{t('imageSource.hint')}</p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            onClose()
            onPickFile()
          }}
          className={`${SOLID_BUTTON} w-full`}
        >
          {t('imageSource.pickFile')}
        </button>
        {onDraw && (
          <button
            type="button"
            onClick={() => {
              onClose()
              onDraw()
            }}
            className={`${OUTLINE_BUTTON} w-full`}
          >
            {t('imageSource.draw')}
          </button>
        )}
        <button
          type="button"
          disabled={!cameraOK}
          title={cameraOK ? undefined : t('imageSource.cameraUnavailable')}
          onClick={() => {
            onClose()
            onTakePhoto()
          }}
          className={`${OUTLINE_BUTTON} w-full disabled:opacity-40`}
        >
          {t('imageSource.camera')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  )
}
