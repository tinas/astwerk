import type { OfType } from '../types'

export interface Span {
  from: number
  to: number
}

export const COMPARE_OPERATORS = ['>=', '<=', '>', '<'] as const

export type CompareOperator = (typeof COMPARE_OPERATORS)[number]

/** A value as written. `quoted` is true when any part of it was in quotes, which makes `@` and `*` plain text. */
export interface EqualValue {
  kind: 'equal'
  raw: string
  quoted: boolean
  span: Span
}

export interface CompareValue {
  kind: 'compare'
  operator: CompareOperator
  raw: string
  quoted: boolean
  span: Span
}

/** An open end, written as `*` or left empty, has no bound. */
export interface RangeValue {
  kind: 'range'
  min?: RangeBound
  max?: RangeBound
  separator: Span
  span: Span
}

export interface RangeBound {
  raw: string
  quoted: boolean
}

export type RawValue = EqualValue | CompareValue | RangeValue

export interface SyntaxGroup {
  type: 'and' | 'or'
  children: Array<SyntaxNode>
  span: Span
}

export interface SyntaxNot {
  type: 'not'
  child: SyntaxNode
  span: Span
}

export interface SyntaxTerm {
  type: 'term'
  key: string
  keySpan: Span
  values: Array<RawValue>
  span: Span
}

export interface SyntaxText {
  type: 'text'
  value: string
  quoted: boolean
  span: Span
}

export type SyntaxNode = SyntaxGroup | SyntaxNot | SyntaxTerm | SyntaxText

export type SyntaxOf<Type extends SyntaxNode['type']> = OfType<SyntaxNode, Type>
