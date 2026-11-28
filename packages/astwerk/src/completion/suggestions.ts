import type { FieldSuggestion, FieldType } from '../schema/field-type'
import type { Schema } from '../schema/schema'
import type { CompletionContext, KeyCompletion, ValueCompletion } from './completion-context'

import { equalsIgnoringCase, startsWithIgnoringCase } from '../case-insensitive'
import { fieldNameOf, findField, isPresenceKey, PRESENCE_KEYS } from '../schema/schema'
import { writeKey, writeValue } from '../syntax/write'

/** `insertText` is ready to replace the context's `from` to `to`, quoted where the value needs it. */
export interface Suggestion {
  label: string
  insertText: string
  description?: string
}

export interface SuggestionOptions {
  /**
   * Values the app loaded for the field of a value context, such as the labels of a repository. They follow the
   * field type's values and tokens, unfiltered by the prefix, without the ones the term or the list already has.
   */
  values?: ReadonlyArray<FieldSuggestion<unknown>>
}

/** Suggests field names for a key, and for a value the field type's values, its tokens and then the loaded values. */
export function getSuggestions(
  context: CompletionContext,
  schema: Schema,
  options: SuggestionOptions = {},
): Array<Suggestion> {
  return context.kind == 'key' ? suggestKeys(context, schema) : suggestValues(context, schema, options.values ?? [])
}

function suggestKeys(context: KeyCompletion, schema: Schema): Array<Suggestion> {
  const fields = Object.entries(schema.fields)
    .filter(
      ([name, field]) =>
        startsWithIgnoringCase(name, context.prefix) || startsWithIgnoringCase(field.label ?? '', context.prefix),
    )
    .map(([name, field]) => ({
      label: field.label ?? name,
      insertText: `${writeKey(name)}:`,
      ...describe(field.description),
    }))
  const presence = PRESENCE_KEYS.filter(key => startsWithIgnoringCase(key, context.prefix)).map(key => ({
    label: key,
    insertText: `${key}:`,
  }))
  return [...fields, ...presence]
}

function suggestValues(
  context: ValueCompletion,
  schema: Schema,
  loaded: ReadonlyArray<FieldSuggestion<unknown>>,
): Array<Suggestion> {
  if (isPresenceKey(context.key)) return suggestFieldNames(context, schema)
  const field = findField(schema, fieldNameOf(schema, context.key) ?? '')
  if (field == undefined) return []
  const own = [
    ...toSuggestions(field.type.suggest?.(context.prefix) ?? [], context, field.type),
    ...suggestTokens(context, field.type),
  ]
  const added = toSuggestions(loaded, context, field.type).filter(
    suggestion => !own.some(shown => equalsIgnoringCase(shown.insertText, suggestion.insertText)),
  )
  return [...own, ...added]
}

function suggestFieldNames(context: ValueCompletion, schema: Schema): Array<Suggestion> {
  return Object.entries(schema.fields)
    .filter(([name]) => startsWithIgnoringCase(name, context.prefix) && !isTaken(name, context))
    .map(([name, field]) => ({
      label: field.label ?? name,
      insertText: literalValue(name),
      ...describe(field.description),
    }))
}

function suggestTokens(context: ValueCompletion, type: FieldType<unknown>): Array<Suggestion> {
  return Object.entries(type.tokens ?? {})
    .map(([name, token]) => ({ label: `@${name}`, insertText: `@${name}`, ...describe(token.description) }))
    .filter(
      suggestion =>
        startsWithIgnoringCase(suggestion.insertText, context.prefix) && !isTaken(suggestion.insertText, context),
    )
}

function toSuggestions(
  values: ReadonlyArray<FieldSuggestion<unknown>>,
  context: ValueCompletion,
  type: FieldType<unknown>,
): Array<Suggestion> {
  return values.flatMap(suggestion => {
    const formatted = type.format(suggestion.value)
    if (isTaken(formatted, context)) return []
    return [
      {
        label: suggestion.label ?? formatted,
        insertText: literalValue(formatted),
        ...describe(suggestion.description),
      },
    ]
  })
}

function literalValue(raw: string): string {
  return writeValue({ kind: 'equal', raw, quoted: true, span: { from: 0, to: 0 } })
}

function isTaken(raw: string, context: ValueCompletion): boolean {
  return context.taken.some(taken => equalsIgnoringCase(taken, raw))
}

function describe(description: string | undefined): Pick<Suggestion, 'description'> {
  return description == undefined ? {} : { description }
}
