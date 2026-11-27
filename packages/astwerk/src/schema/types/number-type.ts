import type { FieldType, FieldTypeOptions } from '../field-type'

const NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i

/** A number with a dot for decimals. It takes comparisons and ranges. */
export function number(options: FieldTypeOptions<number> = {}): FieldType<number> {
  return {
    parse: parseNumber,
    format: value => String(value),
    compare: (a, b) => a - b,
    ...options,
  }
}

function parseNumber(raw: string): number | undefined {
  if (!NUMBER.test(raw)) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}
