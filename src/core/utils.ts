import { createHash } from 'node:crypto'

export function makeId(prefix: string, content: string): string {
  const hash = createHash('md5').update(content).digest('hex')
  return `${prefix}_${hash}`
}
