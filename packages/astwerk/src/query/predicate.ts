import type { FieldType } from '../schema/field-type'
import type { Schema } from '../schema/schema'
import type { ResolveContext } from '../schema/token'
import type { Bound, Query, QueryOf } from './query'
import type { QueryVisitor } from './fold'

import { findField } from '../schema/schema'
import { evaluable } from './evaluable'
import { fold } from './fold'
import { resolveTokens } from './resolve-tokens'

type Test<Item> = (item: Item) => boolean

const WORD_CHARACTER = /[\p{L}\p{N}]/u
const WILDCARD = '*'

/**
 * Builds a filter for items in memory. Values match without regard to case, a free word matches the start of a word in
 * the schema's `text`, parts that could not be bound filter nothing, and fields with `expand` filter by what they
 * stand for.
 */
export function toPredicate<Item>(query: Query, schema: Schema<Item>, context: ResolveContext = {}): Test<Item> {
  const visitor: QueryVisitor<Test<Item>> = {
    and: children => item => children.every(test => test(item)),
    or: children => item => children.some(test => test(item)),
    not: child => item => !child(item),
    in: condition => matchesIn(condition, schema),
    range: condition => matchesRange(condition, schema),
    text: condition => matchesText(condition, schema),
    empty: condition => item => fieldValues(item, condition.field, schema).length == 0,
    match: condition => matchesPattern(condition, schema),
  }
  return fold(resolveTokens(evaluable(query, schema), schema, context), schema, visitor)
}

function matchesIn<Item>(condition: QueryOf<'in'>, schema: Schema<Item>): Test<Item> {
  const type = fieldType(condition.field, schema)
  return item =>
    fieldValues(item, condition.field, schema).some(value =>
      condition.values.some(expected => valuesEqual(value, expected, type)),
    )
}

function matchesRange<Item>(condition: QueryOf<'range'>, schema: Schema<Item>): Test<Item> {
  const type = fieldType(condition.field, schema)
  return item =>
    fieldValues(item, condition.field, schema).some(
      value => isAbove(value, condition.min, type) && isBelow(value, condition.max, type),
    )
}

function matchesText<Item>(condition: QueryOf<'text'>, schema: Schema<Item>): Test<Item> {
  const word = condition.value.toLowerCase()
  return item => {
    const text = schema.text?.(item)
    return text == undefined || startsAWord(text.toLowerCase(), word)
  }
}

function matchesPattern<Item>(condition: QueryOf<'match'>, schema: Schema<Item>): Test<Item> {
  const type = fieldType(condition.field, schema)
  const pattern = new RegExp(`^${condition.pattern.split(WILDCARD).map(escapeRegExp).join('.*')}$`, 'is')
  return item => fieldValues(item, condition.field, schema).some(value => pattern.test(formatValue(value, type)))
}

function isAbove(value: unknown, bound: Bound | undefined, type: FieldType<unknown> | undefined): boolean {
  if (bound == undefined) return true
  const order = compareValues(value, bound.value, type)
  return order > 0 || (order == 0 && bound.inclusive)
}

function isBelow(value: unknown, bound: Bound | undefined, type: FieldType<unknown> | undefined): boolean {
  if (bound == undefined) return true
  const order = compareValues(value, bound.value, type)
  return order < 0 || (order == 0 && bound.inclusive)
}

function valuesEqual(a: unknown, b: unknown, type: FieldType<unknown> | undefined): boolean {
  if (type?.equals != undefined) return type.equals(a, b)
  if (type?.compare != undefined) return type.compare(a, b) == 0
  return a == b
}

function compareValues(a: unknown, b: unknown, type: FieldType<unknown> | undefined): number {
  return type?.compare?.(a, b) ?? Number.NaN
}

function formatValue(value: unknown, type: FieldType<unknown> | undefined): string {
  return type == undefined ? String(value) : type.format(value)
}

function startsAWord(text: string, word: string): boolean {
  let index = text.indexOf(word)
  while (index != -1) {
    if (index == 0 || !WORD_CHARACTER.test(text[index - 1])) return true
    index = text.indexOf(word, index + 1)
  }
  return false
}

function fieldValues<Item>(item: Item, field: string, schema: Schema<Item>): Array<unknown> {
  const definition = findField(schema, field)
  const value = definition?.get == undefined ? ownProperty(item, field) : definition.get(item)
  if (value == undefined) return []
  return Array.isArray(value) ? value.filter(element => element != undefined) : [value]
}

function ownProperty(item: unknown, key: string): unknown {
  return typeof item == 'object' && item != null && Object.hasOwn(item, key)
    ? (item as Record<string, unknown>)[key]
    : undefined
}

function fieldType<Item>(field: string, schema: Schema<Item>): FieldType<unknown> | undefined {
  return findField(schema, field)?.type
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
