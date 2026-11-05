/** 给内联图片下载用的文件名；下载的是记录里实际保存的那份图片。 */
export function photoDownloadName(src: string, label = ''): string {
  const mime = /^data:(image\/[^;,]+)/i.exec(src)?.[1]?.toLowerCase() ?? ''
  const labelExtension = /\.([a-z0-9]{2,5})$/i.exec(label)?.[1]?.toLowerCase()
  const extension = mime
    ? mime === 'image/jpeg'
      ? 'jpg'
      : mime === 'image/svg+xml'
        ? 'svg'
        : mime.split('/')[1]
    : labelExtension || 'png'
  const base = label
    .trim()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127 || /[<>:"/\\|?*]/.test(character) ? '_' : character
    })
    .join('')
    .replace(/[. ]+$/g, '')
  return `${base || 'starburst-image'}.${extension}`
}
