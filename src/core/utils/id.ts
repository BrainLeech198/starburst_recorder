import { ulid } from 'ulid'

export function newId(): string {
  return ulid()
}

const HEX = '0123456789abcdef'

/** 生成 7 位十六进制短编号，形如 git 的短 hash */
export function newCode(): string {
  let code = ''
  for (let i = 0; i < 7; i += 1) {
    code += HEX[Math.floor(Math.random() * HEX.length)]
  }
  return code
}

/** 为旧记录生成确定性短编号；同一 seed 每次都得到相同结果。 */
export function stableCode(seed: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(-7)
}
