import type { Span } from './syntax-tree'

export const HIGHLIGHT_KIND = {
  key: 'key',
  value: 'value',
  dynamic: 'dynamic',
  text: 'text',
  keyword: 'keyword',
  negation: 'negation',
  comparison: 'comparison',
  range: 'range',
  separator: 'separator',
  paren: 'paren',
} as const

export type HighlightKind = (typeof HIGHLIGHT_KIND)[keyof typeof HIGHLIGHT_KIND]

export interface HighlightSpan extends Span {
  kind: HighlightKind
}
