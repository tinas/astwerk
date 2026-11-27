import { describe, expect, test } from 'vite-plus/test'

import { bind, canonical, DIAGNOSTIC_CODE, parse } from '../src'
import { issueSchema } from './fixtures/issues'

function bindText(text: string) {
  return bind(parse(text).tree, issueSchema)
}

describe('ranges', () => {
  const table: Array<[input: string, expected: string, range: object]> = [
    [
      'comments:10..40',
      'comments:10..40',
      { min: { value: 10, inclusive: true }, max: { value: 40, inclusive: true } },
    ],
    ['comments:1.5..2', 'comments:1.5..2', { min: { value: 1.5 }, max: { value: 2 } }],
    ['comments:-5..5', 'comments:-5..5', { min: { value: -5 }, max: { value: 5 } }],
    ['comments:*..10', 'comments:<=10', { max: { value: 10, inclusive: true } }],
    ['comments:..10', 'comments:<=10', { max: { value: 10, inclusive: true } }],
    ['comments:10..*', 'comments:>=10', { min: { value: 10, inclusive: true } }],
    ['comments:>=10', 'comments:>=10', { min: { value: 10, inclusive: true } }],
    ['comments:>10', 'comments:>10', { min: { value: 10, inclusive: false } }],
    ['comments:<40', 'comments:<40', { max: { value: 40, inclusive: false } }],
    ['comments:<=40', 'comments:<=40', { max: { value: 40, inclusive: true } }],
    ['comments:>=10 comments:<=40', 'comments:10..40', { min: { value: 10 }, max: { value: 40 } }],
    ['comments:>10 comments:>20', 'comments:>20', { min: { value: 20, inclusive: false } }],
    ['comments:>=20 comments:>20', 'comments:>20', { min: { value: 20, inclusive: false } }],
    [
      'comments:>10 comments:<=40',
      'comments:>10 comments:<=40',
      { min: { value: 10, inclusive: false }, max: { value: 40, inclusive: true } },
    ],
  ]
  test.each(table)('%j binds to one range and is written %j', (input, expected, range) => {
    const { query, diagnostics } = bindText(input)
    expect(query).toMatchObject({ type: 'range', field: 'comments', ...range })
    expect(diagnostics).toEqual([])
    expect(canonical(input, issueSchema)).toBe(expected)
  })

  test('an open end has no bound at all', () => {
    expect(bindText('comments:>=10').query).not.toHaveProperty('max')
  })

  test('a quoted range is a plain value', () => {
    expect(bindText('label:"10..20"').query).toEqual({ type: 'in', field: 'label', values: ['10..20'] })
    expect(bindText('comments:"10..20"').diagnostics).toMatchObject([{ code: DIAGNOSTIC_CODE.invalidValue }])
  })

  test('a comma list of ranges is an OR of ranges', () => {
    expect(bindText('comments:<10,>100').query).toMatchObject({
      type: 'or',
      children: [
        { type: 'range', max: { value: 10 } },
        { type: 'range', min: { value: 100 } },
      ],
    })
  })

  test('ranges with nothing in common stay apart and are reported across both terms', () => {
    const { query, diagnostics } = bindText('comments:>=10 is:open comments:<5')
    expect(query).toMatchObject({ type: 'and', children: [{ type: 'range' }, { type: 'in' }, { type: 'range' }] })
    expect(diagnostics).toEqual([{ code: DIAGNOSTIC_CODE.emptyRange, severity: 'warning', from: 0, to: 33 }])
    expect(canonical('comments:>=10 comments:<5', issueSchema)).toBe('comments:>=10 comments:<5')
  })

  test('a range whose bounds are reversed is reported', () => {
    expect(bindText('comments:40..10').diagnostics).toMatchObject([{ code: DIAGNOSTIC_CODE.emptyRange }])
  })

  test('ranges in different OR branches are not intersected', () => {
    expect(canonical('comments:>10 OR comments:<5', issueSchema)).toBe('comments:>10,<5')
  })

  test('a day and an instant on the same day stay apart, since neither is tighter', () => {
    expect(canonical('created:>=2026-01-31 created:>=2026-01-31T10:00Z', issueSchema)).toBe(
      'created:>=2026-01-31 created:>=2026-01-31T10:00:00Z',
    )
  })

  test('bounds with tokens are joined but never compared', () => {
    expect(canonical('created:>=@today-7d created:<=@today', issueSchema)).toBe('created:@today-7d..@today')
    expect(canonical('created:>=@today-7d created:>=2026-01-01', issueSchema)).toBe(
      'created:>=@today-7d created:>=2026-01-01',
    )
  })

  test('comparisons need a type that orders its values', () => {
    expect(bindText('label:a..b').diagnostics).toMatchObject([{ code: DIAGNOSTIC_CODE.unsupportedOperator }])
  })
})
