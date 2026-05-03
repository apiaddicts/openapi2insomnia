import { describe, it, expect } from 'vitest'
import { padIndex, toLetter, tcRequestName, tcVarName, tcVarNameWrong } from '../src/core/tc-namer.js'

describe('padIndex', () => {
  it('pads single digit to 2 chars', () => {
    expect(padIndex(1)).toBe('01')
    expect(padIndex(9)).toBe('09')
  })

  it('does not pad double digits', () => {
    expect(padIndex(10)).toBe('10')
    expect(padIndex(99)).toBe('99')
  })
})

describe('toLetter', () => {
  it('maps 0-based index to letter: 0→a, 1→b, 25→z', () => {
    expect(toLetter(0)).toBe('a')
    expect(toLetter(1)).toBe('b')
    expect(toLetter(25)).toBe('z')
  })

  it('wraps to double letters after z: 26→aa, 27→ab', () => {
    expect(toLetter(26)).toBe('aa')
    expect(toLetter(27)).toBe('ab')
  })
})

describe('tcRequestName', () => {
  it('builds base success name (letter, no suffix)', () => {
    expect(tcRequestName('01', '01', '200', 'a', undefined)).toBe('TC.01.01.200a')
  })

  it('builds per-param success name (letter + suffix)', () => {
    expect(tcRequestName('01', '01', '200', 'b', 'queryString limit')).toBe('TC.01.01.200b queryString limit')
  })

  it('builds 400 error name', () => {
    expect(tcRequestName('01', '02', '400', 'a', 'queryString limit wrong')).toBe('TC.01.02.400a queryString limit wrong')
  })

  it('builds single error name (no letter, no suffix)', () => {
    expect(tcRequestName('02', '01', '401', undefined, undefined)).toBe('TC.02.01.401')
  })
})

describe('tcVarName / tcVarNameWrong', () => {
  it('builds correct var name with underscores', () => {
    expect(tcVarName('01', '01', 'limit')).toBe('TC_01_01_limit')
  })

  it('builds wrong var name with _wrong suffix', () => {
    expect(tcVarNameWrong('01', '02', 'init')).toBe('TC_01_02_init_wrong')
  })
})
