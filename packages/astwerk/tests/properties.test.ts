import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import type { Flat, FlatField } from '../src'
import type { Issue } from './fixtures/issues'

import {
  bind,
  canonical,
  FLAT_EMPTY,
  fromFlat,
  getCompletionContext,
  highlight,
  parse,
  stringify,
  toFlat,
  toPredicate,
} from '../src'
import { issueSchema, issues } from './fixtures/issues'

const NUM_RUNS = 1000

const SYNTAX_PARTS = [
  ' ',
  '  ',
  ':',
  ',',
  '"',
  "'",
  '\\',
  '(',
  ')',
  '-',
  '*',
  '..',
  '>',
  '>=',
  '<',
  '<=',
  'OR',
  'AND',
  'NOT',
  'or',
  '@me',
  '@today-7d',
  '@nope',
  'is',
  'open',
  'label',
  'labels',
  'bug',
  'in progress',
  'comments',
  '10',
  '-5',
  '1.5',
  'created',
  '2026-01-31',
  'has',
  'no',
  'assignee',
  'unknown',
  'crash',
  'ı',
]

const queryText = fc.oneof(
  fc.array(fc.constantFrom(...SYNTAX_PARTS), { maxLength: 24 }).map(parts => parts.join('')),
  fc.string({ unit: 'binary', maxLength: 40 }),
)

const labels = fc.constantFrom('bug', 'docs', 'in progress', 'Wip', 'a,b', '"quoted"', '-wip', 'OR', '@me', '*')

function setField(values: fc.Arbitrary<string>): fc.Arbitrary<FlatField> {
  return fc
    .record({
      include: fc.array(values, { maxLength: 3 }),
      exclude: fc.array(values, { maxLength: 3 }),
      empty: fc.constantFrom(undefined, FLAT_EMPTY.include, FLAT_EMPTY.exclude),
    })
    .filter(set => set.include.length > 0 || set.exclude.length > 0 || set.empty != undefined)
    .map(({ empty, ...set }) => ({ kind: 'set', ...set, ...(empty != undefined && { empty }) }))
}

const rangeField: fc.Arbitrary<FlatField> = fc
  .record({
    min: fc.option(fc.record({ value: fc.integer({ min: -100, max: 0 }), inclusive: fc.boolean() }), {
      nil: undefined,
    }),
    max: fc.option(fc.record({ value: fc.integer({ min: 1, max: 100 }), inclusive: fc.boolean() }), { nil: undefined }),
  })
  .filter(range => range.min != undefined || range.max != undefined)
  .map(({ min, max }) => ({ kind: 'range', ...(min != undefined && { min }), ...(max != undefined && { max }) }))

const flat: fc.Arbitrary<Flat> = fc.record({
  fields: fc.record(
    { label: setField(labels), is: setField(fc.constantFrom('open', 'closed')), comments: rangeField },
    { requiredKeys: [] },
  ),
  text: fc.array(fc.constantFrom('crash', 'dark mode', 'export'), { maxLength: 2 }),
  invalid: fc.constant([]),
})

function issuesFor(text: string): Array<Issue> {
  return issues.filter(toPredicate(bind(parse(text).tree, issueSchema).query, issueSchema))
}

describe('properties', () => {
  test('reading any text never throws, and neither does anything built on it', () => {
    fc.assert(
      fc.property(queryText, fc.nat(), (text, cursor) => {
        const { query } = bind(parse(text).tree, issueSchema)
        highlight(text)
        getCompletionContext(text, cursor % (text.length + 1))
        toFlat(query)
        issues.filter(toPredicate(query, issueSchema))
      }),
      { numRuns: NUM_RUNS },
    )
  })

  test('writing a canonical text again changes nothing', () => {
    fc.assert(
      fc.property(queryText, text => {
        const once = canonical(text, issueSchema)
        expect(canonical(once, issueSchema)).toBe(once)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  test('the canonical text filters the same items as the text it came from', () => {
    fc.assert(
      fc.property(queryText, text => {
        expect(issuesFor(canonical(text, issueSchema))).toEqual(issuesFor(text))
      }),
      { numRuns: NUM_RUNS },
    )
  })

  test('panel state survives the trip through a query and its text', () => {
    fc.assert(
      fc.property(flat, state => {
        const text = stringify(fromFlat(state), issueSchema)
        expect(toFlat(bind(parse(text).tree, issueSchema).query)).toEqual(state)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
