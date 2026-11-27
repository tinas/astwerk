import type { FieldCondition, Query } from '../query/query'
import type { FieldType } from './field-type'

export interface FieldDefinition<Item, V> {
  type: FieldType<V>
  label?: string
  description?: string
  /** Other names the field answers to, such as the names in older links. Text is written with the field's own name. */
  aliases?: ReadonlyArray<string>
  /**
   * Reads the field from an item for `toPredicate`.
   *
   * @defaultValue the item's own property of the field's name
   */
  get?(item: Item): NoInfer<V> | ReadonlyArray<NoInfer<V>> | null | undefined
  /**
   * Makes the field stand for other conditions when a query is evaluated, as `involves:@me` stands for
   * `author:@me OR assignee:@me`. The text keeps the field as written. Returning `undefined` makes the field filter
   * nothing, for an option such as `sort:` that the app reads with `valuesOf`.
   */
  expand?: (condition: FieldCondition) => Query | undefined
}

/** `has` and `no` take field names as values, so no field can use either name. */
export interface ReservedFieldNames {
  has?: never
  no?: never
}

export interface SchemaDefinition<Item, Values extends Record<string, unknown>> {
  fields: { [Name in keyof Values]: FieldDefinition<Item, Values[Name]> } & Record<
    string,
    FieldDefinition<Item, unknown>
  >
  /** The text that free words search in `toPredicate`. Without it, free words filter nothing there. */
  text?(item: Item): string
}

export interface Schema<Item = unknown> {
  readonly fields: Readonly<Record<string, FieldDefinition<Item, unknown>>>
  text?(item: Item): string
  readonly '~names': ReadonlyMap<string, string>
}

export const PRESENCE_KEYS = ['has', 'no'] as const

export type PresenceKey = (typeof PRESENCE_KEYS)[number]

/** Field names are matched exactly, so `Label:bug` is an unknown field when the field is `label`. */
export function defineSchema<Item = unknown, Values extends Record<string, unknown> & ReservedFieldNames = {}>(
  definition: SchemaDefinition<Item, Values>,
): Schema<Item> {
  const fields = definition.fields as Record<string, FieldDefinition<Item, unknown>>
  const names = new Map<string, string>()
  for (const [name, field] of Object.entries(fields)) {
    names.set(name, name)
    for (const alias of field.aliases ?? []) names.set(alias, name)
  }
  return { ...definition, fields, '~names': names }
}

export function findField<Item>(schema: Schema<Item>, name: string): FieldDefinition<Item, unknown> | undefined {
  return Object.hasOwn(schema.fields, name) ? schema.fields[name] : undefined
}

export function isPresenceKey(key: string): key is PresenceKey {
  return PRESENCE_KEYS.some(presenceKey => presenceKey == key)
}
