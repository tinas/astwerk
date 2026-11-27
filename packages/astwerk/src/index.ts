export { getCompletionContext } from './completion/completion-context'
export type { CompletionContext, KeyCompletion, ValueCompletion } from './completion/completion-context'
export { getSuggestions } from './completion/suggestions'
export type { Suggestion } from './completion/suggestions'
export { DIAGNOSTIC_CODE, DIAGNOSTIC_SEVERITY } from './diagnostics'
export type { Diagnostic, DiagnosticCode, DiagnosticSeverity } from './diagnostics'
export { FLAT_EMPTY, fromFlat, toFlat } from './flat/flat'
export type { Flat, FlatEmpty, FlatField, FlatRange, FlatSet } from './flat/flat'
export { bind } from './query/bind'
export type { BindResult } from './query/bind'
export { fold } from './query/fold'
export type { QueryVisitor } from './query/fold'
export { toPredicate } from './query/predicate'
export type {
  Bound,
  Condition,
  EmptyCondition,
  FieldCondition,
  InCondition,
  InvalidQuery,
  MatchCondition,
  Query,
  QueryGroup,
  QueryNot,
  RangeCondition,
  TextCondition,
} from './query/query'
export { resolveTokens } from './query/resolve-tokens'
export { canonical, stringify } from './query/stringify'
export { valuesOf } from './query/values-of'
export { withoutField } from './query/without-field'
export type { FieldSuggestion, FieldType, FieldTypeOptions, TokenDefinition } from './schema/field-type'
export { defineSchema } from './schema/schema'
export type { FieldDefinition, ReservedFieldNames, Schema, SchemaDefinition } from './schema/schema'
export { isTokenValue } from './schema/token'
export type { ResolveContext, TokenOffset, TokenValue } from './schema/token'
export { boolean } from './schema/types/boolean-type'
export { date } from './schema/types/date-type'
export type { DateValue } from './schema/types/date-type'
export { enumOf } from './schema/types/enum-type'
export { number } from './schema/types/number-type'
export { string } from './schema/types/string-type'
export { HIGHLIGHT_KIND } from './syntax/highlight-kind'
export type { HighlightKind, HighlightSpan } from './syntax/highlight-kind'
export { highlight } from './syntax/highlight'
export { parse } from './syntax/parse'
export type { ParseResult } from './syntax/parse'
export type {
  CompareOperator,
  CompareValue,
  EqualValue,
  RangeBound,
  RangeValue,
  RawValue,
  Span,
  SyntaxGroup,
  SyntaxNode,
  SyntaxNot,
  SyntaxTerm,
  SyntaxText,
} from './syntax/syntax-tree'
