import type { ResolveContext, TokenOffset } from './token'

export interface FieldSuggestion<V> {
  value: V
  label?: string
  description?: string
}

export interface TokenDefinition<V> {
  description?: string
  /** Allows an offset such as `+3` or `-7d`. A unit, when written, is one of these. */
  offsetUnits?: ReadonlyArray<string>
  resolve(offset: TokenOffset | undefined, context: ResolveContext & { now: Date }): V
}

/** How a field reads, writes and compares its values. Built-in types and app types implement the same interface. */
export interface FieldType<V> {
  /** Returns `undefined` for text that is not a value of the type, which reports an invalid value. */
  parse(raw: string): V | undefined
  format(value: V): string
  /** Decides `field:value`. Without it, `compare` decides, and without both, `==`. */
  equals?(a: V, b: V): boolean
  /** Orders values. Only a type with `compare` takes comparisons and ranges. */
  compare?(a: V, b: V): number
  /** Lets an unquoted `*` stand for any text, as in `label:*bug*`. */
  wildcards?: boolean
  suggest?(prefix: string): Array<FieldSuggestion<V>> | Promise<Array<FieldSuggestion<V>>>
  /** Dynamic values the type accepts, by name without the `@`. */
  tokens?: Readonly<Record<string, TokenDefinition<V>>>
}

export type FieldTypeOptions<V> = Pick<FieldType<V>, 'suggest' | 'tokens'>
