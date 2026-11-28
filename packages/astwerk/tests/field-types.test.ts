import { describe, expect, test } from 'vite-plus/test'

import { boolean, date, enumOf, number, string } from '../src'

describe('number', () => {
  const type = number()

  test.each([
    ['10', 10],
    ['-5', -5],
    ['10.5', 10.5],
    ['.5', 0.5],
    ['1e3', 1000],
  ])('reads %j as %d', (raw, value) => {
    expect(type.parse(raw)).toBe(value)
  })

  test.each(['10,5', '1.2.3', 'ten', '', '1e999', '+5'])('rejects %j', raw => {
    expect(type.parse(raw)).toBeUndefined()
  })

  test('writes a value back so that it reads the same', () => {
    for (const value of [10, -5, 0.1, 1e21, 1e-7]) expect(type.parse(type.format(value))).toBe(value)
  })
})

describe('date', () => {
  const type = date()
  const now = new Date('2026-03-31T22:00:00Z')

  test.each([
    ['2026-01-31', '2026-01-31'],
    ['2026-01-31T14:30', '2026-01-31T14:30:00Z'],
    ['2026-01-31T14:30:00+03:00', '2026-01-31T11:30:00Z'],
    ['2026-01-31T14:30:00.5Z', '2026-01-31T14:30:00.500Z'],
  ])('reads %j as %j', (raw, value) => {
    expect(type.parse(raw)).toBe(value)
  })

  test.each(['2026-02-30', '2026-13-01', '31.01.2026', '2026-1-31', '9999-12-31T23:00-05:00'])('rejects %j', raw => {
    expect(type.parse(raw)).toBeUndefined()
  })

  test('a day compares equal to every instant in it, in UTC', () => {
    expect(type.compare?.('2026-01-31', '2026-01-31T00:00:00Z')).toBe(0)
    expect(type.compare?.('2026-01-31', '2026-01-31T23:59:59.999Z')).toBe(0)
    expect(type.compare?.('2026-01-31', '2026-02-01T00:00:00Z')).toBe(-1)
    expect(type.compare?.(new Date('2026-01-30T23:59:59Z'), '2026-01-31')).toBe(-1)
  })

  test.each([
    [undefined, '2026-03-31'],
    [{ amount: -7, unit: 'd' }, '2026-03-24'],
    [{ amount: 7 }, '2026-04-07'],
    [{ amount: -1, unit: 'w' }, '2026-03-24'],
    [{ amount: -1, unit: 'm' }, '2026-02-28'],
    [{ amount: -1, unit: 'y' }, '2025-03-31'],
  ])('@today with offset %j is %j, in UTC and within the month', (offset, day) => {
    expect(type.tokens?.today.resolve(offset, { now })).toBe(day)
  })

  test('takes tokens of the app next to @today', () => {
    const withRelease = date({ tokens: { release: { resolve: () => '2026-06-01' } } })
    expect(Object.keys(withRelease.tokens ?? {})).toEqual(['today', 'release'])
  })
})

describe('enumOf', () => {
  const type = enumOf(['open', 'closed'])

  test('reads a value in any case as the listed one', () => {
    expect(type.parse('OPEN')).toBe('open')
  })

  test('rejects a value outside its list, since the schema closes the list', () => {
    expect(type.parse('merged')).toBeUndefined()
  })

  test('suggests the values that start with the prefix', () => {
    expect(type.suggest?.('C')).toEqual([{ value: 'closed' }])
  })
})

describe('boolean', () => {
  test('reads true and false in any case', () => {
    const type = boolean()
    expect([type.parse('TRUE'), type.parse('false'), type.parse('yes')]).toEqual([true, false, undefined])
  })
})

describe('string', () => {
  test('matches values without regard to case and takes wildcards', () => {
    const type = string()
    expect(type.equals?.('Bug', 'bUG')).toBe(true)
    expect(type.wildcards).toBe(true)
    expect('compare' in type).toBe(false)
  })
})
