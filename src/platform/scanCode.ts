/**
 * 调系统相机扫二维码。
 *
 * 用 @capacitor/barcode-scanner：安卓走原生相机，网页 / 桌面壳走它的 Web 实现。
 * 用户取消或没有相机权限时插件会抛错，这里统一吞掉返回 null，由界面提示改用手动粘贴。
 */
export async function scanShareCode(): Promise<string | null> {
  try {
    const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint, CapacitorBarcodeScannerScanOrientation, CapacitorBarcodeScannerCameraDirection } =
      await import('@capacitor/barcode-scanner')
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
      cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
    })
    return result.ScanResult?.trim() || null
  } catch {
    return null
  }
}
