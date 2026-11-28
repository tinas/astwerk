import type { FieldType, FieldTypeOptions } from '../field-type'

import { equalsIgnoringCase, startsWithIgnoringCase } from '../../case-insensitive'

/**
 * One of a fixed list. A value written in another case reads as the listed one, so `is:OPEN` is `is:open`, and a value
 * outside the list is an invalid value. Values that come from data, such as labels, belong in a `string()` field.
 */
export function enumOf<const Value extends string>(
  values: ReadonlyArray<Value>,
  options: Pick<FieldTypeOptions<Value>, 'tokens'> = {},
): FieldType<Value> {
  return {
    parse: raw => values.find(value => equalsIgnoringCase(value, raw)),
    format: value => value,
    equals: equalsIgnoringCase,
    wildcards: true,
    suggest: prefix => values.filter(value => startsWithIgnoringCase(value, prefix)).map(value => ({ value })),
    ...options,
  }
}
