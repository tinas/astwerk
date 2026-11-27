import { describe, expect, test } from 'vite-plus/test'

import type { Flat } from '../src'

import { bind, FLAT_EMPTY, fromFlat, parse, stringify, toFlat } from '../src'
import { issueSchema } from './fixtures/issues'

function flatOf(text: string): Flat | undefined {
  return toFlat(bind(parse(text).tree, issueSchema).query)
}

describe('toFlat', () => {
  test('reads each field as a set of values or one range', () => {
    expect(flatOf('is:open label:bug,docs -label:wip no:milestone comments:5..10 crash')).toEqual({
      fields: {
        is: { kind: 'set', include: ['open'], exclude: [] },
        label: { kind: 'set', include: ['bug', 'docs'], exclude: ['wip'] },
        milestone: { kind: 'set', include: [], exclude: [], empty: FLAT_EMPTY.include },
        comments: { kind: 'range', min: { value: 5, inclusive: true }, max: { value: 10, inclusive: true } },
      },
      text: ['crash'],
      invalid: [],
    })
  })

  test('several negated terms of a field add up to one list to exclude', () => {
    expect(flatOf('-label:bug -label:docs')?.fields.label).toEqual({
      kind: 'set',
      include: [],
      exclude: ['bug', 'docs'],
    })
  })

  test('a value or no value at all is one set', () => {
    expect(flatOf('label:bug OR no:label')?.fields.label).toEqual({
      kind: 'set',
      include: ['bug'],
      exclude: [],
      empty: FLAT_EMPTY.include,
    })
    expect(flatOf('has:label')?.fields.label).toEqual({
      kind: 'set',
      include: [],
      exclude: [],
      empty: FLAT_EMPTY.exclude,
    })
  })

  test('carries the parts that could not be bound', () => {
    expect(flatOf('is:open unknown:x')?.invalid).toMatchObject([{ type: 'invalid', syntax: { key: 'unknown' } }])
  })

  test.each([
    'is:open OR label:bug',
    'label:bug label:docs',
    'no:label has:label',
    '-comments:5..10',
    'comments:<5,>10',
    'comments:5 comments:>3',
    'label:*bug*',
    '-crash',
  ])('%j does not fit a panel', text => {
    expect(flatOf(text)).toBeUndefined()
  })
})

describe('fromFlat', () => {
  test('builds the query back, field by field', () => {
    const text = 'is:open label:bug,docs -label:wip no:milestone comments:5..10 crash'
    const flat = flatOf(text)
    expect(flat).toBeDefined()
    expect(stringify(fromFlat(flat as Flat), issueSchema)).toBe(text)
  })

  test('a new field goes after the others', () => {
    const flat = flatOf('is:open crash') as Flat
    const changed: Flat = { ...flat, fields: { ...flat.fields, label: { kind: 'set', include: ['bug'], exclude: [] } } }
    expect(stringify(fromFlat(changed), issueSchema)).toBe('is:open label:bug crash')
  })

  test('a field with nothing chosen leaves no term', () => {
    const flat: Flat = {
      fields: { label: { kind: 'set', include: [], exclude: [] }, comments: { kind: 'range' } },
      text: [],
      invalid: [],
    }
    expect(stringify(fromFlat(flat), issueSchema)).toBe('')
  })

  test('a range with bounds of both kinds is written as two terms', () => {
    const flat: Flat = {
      fields: { comments: { kind: 'range', min: { value: 5, inclusive: false }, max: { value: 10, inclusive: true } } },
      text: [],
      invalid: [],
    }
    expect(stringify(fromFlat(flat), issueSchema)).toBe('comments:>5 comments:<=10')
  })

  test('a field named after an Object member stays a field', () => {
    const flat: Flat = {
      fields: { ['__proto__']: { kind: 'set', include: ['x'], exclude: [] } },
      text: [],
      invalid: [],
    }
    expect(Object.keys(toFlat(fromFlat(flat))?.fields ?? {})).toEqual(['__proto__'])
  })
})
