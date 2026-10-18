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
