import type { HighlightSpan } from './highlight-kind'

import { scan } from './parse'

/** Spans to color, in order. Whitespace and nothing else is left out. */
export function highlight(text: string): Array<HighlightSpan> {
  return scan(text).highlights
}
