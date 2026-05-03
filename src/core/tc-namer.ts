export function padIndex(n: number): string {
  return n.toString().padStart(2, '0')
}

// 0 → 'a', 25 → 'z', 26 → 'aa', 27 → 'ab', ...
export function toLetter(n: number): string {
  if (n < 26) return String.fromCharCode(97 + n)
  return String.fromCharCode(97 + Math.floor(n / 26) - 1) + String.fromCharCode(97 + (n % 26))
}

export function tcRequestName(
  fi: string,
  oi: string,
  status: string,
  letter: string | undefined,
  suffix: string | undefined,
): string {
  const base = `TC.${fi}.${oi}.${status}${letter ?? ''}`
  return suffix ? `${base} ${suffix}` : base
}

export function tcVarName(fi: string, oi: string, paramName: string): string {
  return `TC_${fi}_${oi}_${paramName}`
}

export function tcVarNameWrong(fi: string, oi: string, paramName: string): string {
  return `TC_${fi}_${oi}_${paramName}_wrong`
}
