/**
 * 「图片导入」的进度弹窗。
 *
 * 只干一件事：把选中的照片压缩、交给模型转成文字，成功后把正文交给日记页。
 * 建日记、跳页面都不在这里，跟「AI 整理成日记」保持同一个分工。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Modal from '../../shared/ui/Modal'
import { compressImage, transcribeDiary } from '../ai/aiVision'
import type { AiConfig } from '../ai/aiConfig'

type Phase = 'compressing' | 'recognition' | 'error'

const FOOTER_BUTTON =
  'rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg'

export default function ImageImportDialog({
  file,
  config,
  onDone,
  onCancel,
}: {
  file: File
  config: AiConfig
  /** 识别成功：正文已经拿到，接下来由日记页建条目、跳编辑页 */
  onDone: (content: string) => void
  onCancel: () => void
}) {
  const [phase, setPhase] = useState<Phase>('compressing')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  /** 「再试一次」靠它重新触发下面那个 effect */
  const [attempt, setAttempt] = useState(0)
  /** 开发时 StrictMode 会把 effect 跑两遍，用它挡住第二次请求 */
  const started = useRef(false)
  /** 用户点了取消：请求可能还会回来，但不能再偷偷建一条日记 */
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  const run = useCallback(async () => {
    setPhase('compressing')
    setError('')
    setSeconds(0)
    try {
      const image = await compressImage(file)
      setPhase('recognition')
      const result = await transcribeDiary(config, image)
      if (cancelled.current) return
      if (!result.ok) {
        setError(result.error)
        setPhase('error')
        return
      }
      onDone(result.content)
    } catch (failure) {
      setError((failure as Error).message)
      setPhase('error')
    }
  }, [file, config, onDone])

  // 选完图就开始识别，不用再点一次
  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, [run, attempt])

  // 等的时候给个秒数，让人知道它没卡死
  useEffect(() => {
    if (phase === 'error') return
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [phase])

  function retry() {
    started.current = false
    setAttempt((value) => value + 1)
  }

  return (
    <Modal size="sm" onClose={onCancel}>
      <div className="text-sm font-medium">把这张手写日记转成文字</div>
      <p className="mt-1 text-xs break-all text-muted">{file.name}</p>

      {phase !== 'error' ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-surface-2 px-3 py-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-brand"
          />
          <div className="text-xs">
            <div className="text-fg">
              {phase === 'compressing' ? '正在压缩图片…' : '正在识别手写字…'}
            </div>
            <div className="mt-0.5 text-muted">
              已经等了 {seconds} 秒，一般十几秒；照片大、字多会久一点。
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-4 rounded-lg border border-danger px-3 py-2 text-xs text-danger">
            {error}
          </p>
          <p className="mt-2 text-xs text-muted">
            换个角度、让纸占满画面、光线亮一点，再试一次通常就成了。
          </p>
        </>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {phase === 'error' && (
          <button type="button" onClick={retry} className={FOOTER_BUTTON}>
            再试一次
          </button>
        )}
        <button type="button" onClick={onCancel} className={FOOTER_BUTTON}>
          取消
        </button>
      </div>
    </Modal>
  )
}
