import type { DateValue, FieldType, Query, QueryVisitor, Schema } from '../src'
import type { Issue } from './fixtures/issues'

import { describe, expectTypeOf, test } from 'vite-plus/test'

import { bind, date, defineSchema, enumOf, fold, number, parse, string, toPredicate } from '../src'

declare const query: Query
declare const visitor: QueryVisitor<string>

describe('defineSchema', () => {
  test('takes the item type from the functions that read items', () => {
    const schema = defineSchema({
      fields: { comments: { type: number(), get: (issue: Issue) => issue.comments } },
      text: issue => issue.title,
    })
    expectTypeOf(toPredicate(query, schema)).toEqualTypeOf<(item: Issue) => boolean>()
  })

  test('a field reads values of its own type', () => {
    defineSchema({
      fields: {
        labels: { type: string(), get: (issue: Issue) => issue.labels },
        created: { type: date(), get: (issue: Issue) => new Date(issue.created) },
      },
    })
    defineSchema({
      fields: {
        // @ts-expect-error a number field cannot read text
        comments: { type: number(), get: (issue: Issue) => issue.title },
      },
    })
  })

  test('a schema of any item fits the functions that do not read items', () => {
    const schema = defineSchema({ fields: { comments: { type: number(), get: (issue: Issue) => issue.comments } } })
    expectTypeOf(schema).toExtend<Schema>()
    expectTypeOf(bind(parse('comments:3').tree, schema).query).toEqualTypeOf<Query>()
    expectTypeOf(fold<string>(query, schema, visitor)).toEqualTypeOf<string>()
  })

  test('has and no cannot be field names', () => {
    defineSchema({
      // @ts-expect-error has takes field names as values
      fields: { has: { type: string() } },
    })
  })
})

describe('field types', () => {
  test('enumOf keeps the listed values as its type', () => {
    expectTypeOf(enumOf(['open', 'closed'])).toEqualTypeOf<FieldType<'open' | 'closed'>>()
  })

  test('a date is a day or an instant as text, or a Date', () => {
    expectTypeOf(date()).toEqualTypeOf<FieldType<DateValue>>()
    expectTypeOf<DateValue>().toEqualTypeOf<string | Date>()
  })
})
