import type { FieldType } from '../field-type'

import { equalsIgnoringCase, startsWithIgnoringCase } from '../../case-insensitive'

const BOOLEANS = [true, false]

/** `true` or `false`, in any case. */
export function boolean(): FieldType<boolean> {
  return {
    parse: raw => BOOLEANS.find(value => equalsIgnoringCase(String(value), raw)),
    format: value => String(value),
    suggest: prefix =>
      BOOLEANS.filter(value => startsWithIgnoringCase(String(value), prefix)).map(value => ({ value })),
  }
}
