import type { Bound, InvalidQuery, Query, QueryOf } from '../query/query'

import { allOf, anyOf, definedBounds, emptyQuery, rangeCondition } from '../query/query'

/** Whether a set also takes items with no value (`no:field`) or leaves them out (`has:field`). */
export const FLAT_EMPTY = {
  include: 'include',
  exclude: 'exclude',
} as const

export type FlatEmpty = (typeof FLAT_EMPTY)[keyof typeof FLAT_EMPTY]

/** Items with any of `include` (all items when it is empty) and none of `exclude`. */
export interface FlatSet {
  kind: 'set'
  include: Array<unknown>
  exclude: Array<unknown>
  empty?: FlatEmpty
}

export interface FlatRange {
  kind: 'range'
  min?: Bound
  max?: Bound
}

export type FlatField = FlatSet | FlatRange

/** A query as the state of a filter panel, field by field. Parts that could not be bound are carried along. */
export interface Flat {
  fields: Record<string, FlatField>
  text: Array<string>
  invalid: Array<InvalidQuery>
}

interface SetPart {
  field: string
  values: Array<unknown>
  empty: boolean
}

interface FlatBuilder {
  fields: Map<string, FlatField>
  text: Array<string>
  invalid: Array<InvalidQuery>
}

type PartAdder<Type extends Query['type']> = (builder: FlatBuilder, query: QueryOf<Type>) => boolean

type SetPartReader<Type extends Query['type']> = (query: QueryOf<Type>) => SetPart | undefined

const ADD_BY_TYPE: { [Type in Query['type']]: PartAdder<Type> } = {
  and: () => false,
  or: (builder, query) => addSetPart(builder, readSetPart(query), FLAT_EMPTY.include),
  not: (builder, query) => addSetPart(builder, readSetPart(query.child), FLAT_EMPTY.exclude),
  in: (builder, query) => addSetPart(builder, readSetPart(query), FLAT_EMPTY.include),
  range: addRange,
  text: addText,
  empty: (builder, query) => addSetPart(builder, readSetPart(query), FLAT_EMPTY.include),
  match: () => false,
  invalid: addInvalid,
}

const READ_SET_PART_BY_TYPE: { [Type in Query['type']]: SetPartReader<Type> } = {
  and: () => undefined,
  or: query => mergeSetParts(query.children.map(readSetPart)),
  not: () => undefined,
  in: query => ({ field: query.field, values: query.values, empty: false }),
  range: () => undefined,
  text: () => undefined,
  empty: query => ({ field: query.field, values: [], empty: true }),
  match: () => undefined,
  invalid: () => undefined,
}

const ADD_TO_SET_BY_POLARITY: Record<FlatEmpty, (set: FlatSet, part: SetPart) => boolean> = {
  include: (set, part) => {
    if (set.include.length > 0 || set.empty == FLAT_EMPTY.include) return false
    set.include = [...part.values]
    return setEmpty(set, part, FLAT_EMPTY.include)
  },
  exclude: (set, part) => {
    set.exclude = [...set.exclude, ...part.values]
    return setEmpty(set, part, FLAT_EMPTY.exclude)
  },
}

const FROM_FLAT_BY_KIND: {
  [Kind in FlatField['kind']]: (field: string, entry: Extract<FlatField, { kind: Kind }>) => Array<Query>
} = {
  set: fromFlatSet,
  range: (field, range) =>
    range.min == undefined && range.max == undefined ? [] : [rangeCondition(field, range.min, range.max)],
}

/**
 * Reads a query as panel state. Returns `undefined` for a query a panel cannot show, such as an `OR` across fields,
 * two lists of values for one field, a negated range, a wildcard or negated free text.
 */
export function toFlat(query: Query): Flat | undefined {
  const builder: FlatBuilder = { fields: new Map(), text: [], invalid: [] }
  const parts = query.type == 'and' ? query.children : [query]
  if (!parts.every(part => addPart(builder, part))) return undefined
  return { fields: Object.fromEntries(builder.fields), text: builder.text, invalid: builder.invalid }
}

/** Builds a query from panel state, field by field in the order of `fields`, then free text and unbound parts. */
export function fromFlat(flat: Flat): Query {
  const fields = Object.entries(flat.fields).flatMap(([field, entry]) => fromFlatField(field, entry))
  const text = flat.text.map((value): Query => ({ type: 'text', value }))
  return allOf([...fields, ...text, ...flat.invalid]) ?? emptyQuery()
}

function addPart(builder: FlatBuilder, query: Query): boolean {
  const adder = ADD_BY_TYPE[query.type] as PartAdder<Query['type']>
  return adder(builder, query)
}

function readSetPart(query: Query): SetPart | undefined {
  const reader = READ_SET_PART_BY_TYPE[query.type] as SetPartReader<Query['type']>
  return reader(query)
}

function mergeSetParts(parts: Array<SetPart | undefined>): SetPart | undefined {
  const known = compact(parts)
  const [first] = known
  if (first == undefined || known.length < parts.length || known.some(part => part.field != first.field))
    return undefined
  return { field: first.field, values: known.flatMap(part => part.values), empty: known.some(part => part.empty) }
}

function addSetPart(builder: FlatBuilder, part: SetPart | undefined, polarity: FlatEmpty): boolean {
  if (part == undefined) return false
  const existing = builder.fields.get(part.field) ?? { kind: 'set', include: [], exclude: [] }
  if (existing.kind != 'set') return false
  const set = { ...existing }
  builder.fields.set(part.field, set)
  return ADD_TO_SET_BY_POLARITY[polarity](set, part)
}

function setEmpty(set: FlatSet, part: SetPart, empty: FlatEmpty): boolean {
  if (!part.empty) return true
  if (set.empty != undefined && set.empty != empty) return false
  set.empty = empty
  return true
}

function addRange(builder: FlatBuilder, query: QueryOf<'range'>): boolean {
  if (builder.fields.has(query.field)) return false
  builder.fields.set(query.field, { kind: 'range', ...definedBounds(query.min, query.max) })
  return true
}

function addText(builder: FlatBuilder, query: QueryOf<'text'>): boolean {
  builder.text.push(query.value)
  return true
}

function addInvalid(builder: FlatBuilder, query: InvalidQuery): boolean {
  builder.invalid.push(query)
  return true
}

function fromFlatField(field: string, entry: FlatField): Array<Query> {
  const build = FROM_FLAT_BY_KIND[entry.kind] as (field: string, entry: FlatField) => Array<Query>
  return build(field, entry)
}

function fromFlatSet(field: string, set: FlatSet): Array<Query> {
  const included = compact([valuesIn(field, set.include), emptyIf(field, set.empty == FLAT_EMPTY.include)])
  const excluded = compact([valuesIn(field, set.exclude), emptyIf(field, set.empty == FLAT_EMPTY.exclude)])
  return compact([anyOf(included), ...excluded.map((child): Query => ({ type: 'not', child }))])
}

function valuesIn(field: string, values: Array<unknown>): Query | undefined {
  return values.length == 0 ? undefined : { type: 'in', field, values }
}

function emptyIf(field: string, condition: boolean): Query | undefined {
  return condition ? { type: 'empty', field } : undefined
}

function compact<Item>(items: Array<Item | undefined>): Array<Item> {
  return items.filter(item => item != undefined)
}
