import type { FieldType, FieldTypeOptions } from '../field-type'

import { equalsIgnoringCase } from '../../case-insensitive'

/** Any text. Values match without regard to case, and `*` works as a wildcard. */
export function string(options: FieldTypeOptions<string> = {}): FieldType<string> {
  return {
    parse: raw => raw,
    format: value => value,
    equals: equalsIgnoringCase,
    wildcards: true,
    ...options,
  }
}
