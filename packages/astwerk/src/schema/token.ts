/**
 * What tokens are resolved with. Apps add members for their own tokens, such as the signed-in user, by declaration
 * merging.
 */
export interface ResolveContext {
  /** @defaultValue the current time */
  now?: Date
}

export interface TokenOffset {
  amount: number
  unit?: string
}

/** A dynamic value such as `@today-7d`. The query keeps it unresolved, so the text keeps its meaning. */
export interface TokenValue {
  kind: 'token'
  name: string
  offset?: TokenOffset
  raw: string
}

const TOKEN = /^@([A-Za-z][A-Za-z0-9_]*)(?:([+-])(\d+)([A-Za-z]*))?$/

export function readToken(raw: string): TokenValue | undefined {
  const match = TOKEN.exec(raw)
  if (match == undefined) return undefined
  const [, name, sign, digits, unit] = match
  if (digits == undefined) return { kind: 'token', name, raw }
  const amount = Number(digits) * (sign == '-' ? -1 : 1)
  return { kind: 'token', name, offset: unit == '' ? { amount } : { amount, unit }, raw }
}

export function isTokenValue(value: unknown): value is TokenValue {
  return typeof value == 'object' && value != null && 'kind' in value && value.kind == 'token' && 'raw' in value
}
