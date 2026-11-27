import type { FieldType } from '../schema/field-type'
import type { Bound, RangeCondition } from './query'

import { isTokenValue } from '../schema/token'
import { rangeCondition } from './query'

export type RangeIntersection = { kind: 'merged'; range: RangeCondition } | { kind: 'empty' } | { kind: 'separate' }

interface TighterBound {
  bound?: Bound
}

type BoundSide = 'min' | 'max'

export function intersectRanges(a: RangeCondition, b: RangeCondition, type: FieldType<unknown>): RangeIntersection {
  const min = tighterBound(a.min, b.min, 'min', type)
  const max = tighterBound(a.max, b.max, 'max', type)
  if (min == undefined || max == undefined) return { kind: 'separate' }
  const range = rangeCondition(a.field, min.bound, max.bound)
  return isEmptyRange(range, type) ? { kind: 'empty' } : { kind: 'merged', range }
}

export function isEmptyRange(range: RangeCondition, type: FieldType<unknown>): boolean {
  if (range.min == undefined || range.max == undefined) return false
  const order = compareValues(range.min.value, range.max.value, type)
  if (order == undefined) return false
  return order > 0 || (order == 0 && !(range.min.inclusive && range.max.inclusive))
}

function tighterBound(
  a: Bound | undefined,
  b: Bound | undefined,
  side: BoundSide,
  type: FieldType<unknown>,
): TighterBound | undefined {
  if (a == undefined) return { bound: b }
  if (b == undefined) return { bound: a }
  const order = compareValues(a.value, b.value, type)
  if (order == undefined || (order == 0 && type.format(a.value) != type.format(b.value))) return undefined
  if (order == 0) return { bound: a.inclusive ? b : a }
  const aIsTighter = side == 'min' ? order > 0 : order < 0
  return { bound: aIsTighter ? a : b }
}

function compareValues(a: unknown, b: unknown, type: FieldType<unknown>): number | undefined {
  if (type.compare == undefined || isTokenValue(a) || isTokenValue(b)) return undefined
  const order = type.compare(a, b)
  return Number.isNaN(order) ? undefined : order
}
