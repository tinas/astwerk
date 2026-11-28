import { describe, expect, test } from 'vite-plus/test'

import type { ResolveContext, Schema } from '../src'

import { bind, defineSchema, number, parse, string, toPredicate } from '../src'
import { issueSchema, issues } from './fixtures/issues'

const NOW = new Date('2026-03-05T12:00:00Z')

function titlesFor(text: string, context: ResolveContext = { now: NOW, user: 'ahmet' }): Array<string> {
  const { query } = bind(parse(text).tree, issueSchema)
  return issues.filter(toPredicate(query, issueSchema, context)).map(issue => issue.title)
}

function itemsFor<Item>(items: Array<Item>, text: string, schema: Schema): Array<Item> {
  return items.filter(toPredicate(bind(parse(text).tree, schema).query, schema))
}

const CRASH = 'Crash when the release notes are empty'
const EXPORT = 'Document the export command'
const DARK_MODE = 'Dark mode for the settings page'

describe('toPredicate', () => {
  const table: Array<[query: string, titles: Array<string>]> = [
    ['', [CRASH, EXPORT, DARK_MODE]],
    ['is:open', [CRASH, DARK_MODE]],
    ['is:OPEN', [CRASH, DARK_MODE]],
    ['is:open author:ahmet', [DARK_MODE]],
    ['is:closed OR comments:>20', [EXPORT, DARK_MODE]],
    ['-is:open', [EXPORT]],
    ['label:bug,docs', [CRASH, EXPORT]],
    ['label:BUG', [CRASH]],
    ['label:bug label:docs', []],
    ['-label:bug', [EXPORT, DARK_MODE]],
    ['no:label', [DARK_MODE]],
    ['has:assignee', [CRASH, DARK_MODE]],
    ['no:assignee', [EXPORT]],
    ['label:"in progress"', [EXPORT]],
    ['label:*prog*', [EXPORT]],
    ['label:d*', [EXPORT]],
    ['comments:12', [CRASH]],
    ['comments:3..12', [CRASH, EXPORT]],
    ['comments:>12', [DARK_MODE]],
    ['comments:>=12', [CRASH, DARK_MODE]],
    ['comments:<12', [EXPORT]],
    ['comments:<=12', [CRASH, EXPORT]],
    ['comments:<5,>20', [EXPORT, DARK_MODE]],
    ['locked:true', [EXPORT]],
    ['release', [CRASH]],
    ['"release notes"', [CRASH]],
    ['RELEASE', [CRASH]],
    ['elease', []],
    ['the', [CRASH, EXPORT, DARK_MODE]],
    ['-the', []],
  ]
  test.each(table)('%j keeps %j', (query, titles) => {
    expect(titlesFor(query)).toEqual(titles)
  })

  describe('dates', () => {
    const dates: Array<[query: string, titles: Array<string>]> = [
      ['created:2026-01-31', [CRASH]],
      ['created:>2026-01-31', [EXPORT, DARK_MODE]],
      ['created:>=2026-01-31', [CRASH, EXPORT, DARK_MODE]],
      ['created:<2026-02-14', [CRASH]],
      ['created:<=2026-02-14', [CRASH, EXPORT]],
      ['created:2026-01-31..2026-02-14', [CRASH, EXPORT]],
      ['created:>2026-01-31T09:15:00Z', [EXPORT, DARK_MODE]],
      ['created:2026-01-31T09:15:00Z', [CRASH]],
      ['created:>=@today-7d', [DARK_MODE]],
      ['created:@today-1m..@today', [EXPORT, DARK_MODE]],
    ]
    test.each(dates)('%j keeps %j, a day covering all of its hours', (query, titles) => {
      expect(titlesFor(query)).toEqual(titles)
    })
  })

  test('tokens resolve with the context', () => {
    expect(titlesFor('assignee:@me')).toEqual([CRASH])
    expect(titlesFor('assignee:@me', { user: 'tinastepe' })).toEqual([DARK_MODE])
  })

  describe('mistakes', () => {
    test('an unknown field filters nothing', () => {
      expect(titlesFor('unknown:x')).toEqual([CRASH, EXPORT, DARK_MODE])
    })

    test('a negated unknown field does not exclude everything', () => {
      expect(titlesFor('-unknown:x is:open')).toEqual([CRASH, DARK_MODE])
    })

    test('an unknown field in an OR does not widen it to everything', () => {
      expect(titlesFor('is:closed OR unknown:x')).toEqual([EXPORT])
    })

    test('an invalid value in a list leaves the other values', () => {
      expect(titlesFor('comments:12,many')).toEqual([CRASH])
    })

    test('a value outside the list of an enum is reported and filters nothing', () => {
      expect(bind(parse('is:merged').tree, issueSchema).diagnostics.map(diagnostic => diagnostic.code)).toEqual([
        'invalidValue',
      ])
      expect(titlesFor('is:merged')).toEqual([CRASH, EXPORT, DARK_MODE])
    })

    test('a negated group filters nothing', () => {
      expect(titlesFor('-(is:open OR locked:true) label:docs')).toEqual([EXPORT])
    })
  })

  test('a field without get reads the property of its name', () => {
    expect(titlesFor('author:tinastepe')).toEqual([CRASH])
  })

  test('a field whose get is undefined reads the property of its name, as one without get does', () => {
    const schema = defineSchema({ fields: { author: { type: string(), get: undefined } } })
    expect(itemsFor(issues, 'author:tinastepe', schema).map(issue => issue.title)).toEqual([CRASH])
  })

  test('an empty string is a value, so no: leaves it out as a backend does', () => {
    const schema = defineSchema({ fields: { milestone: { type: string() } } })
    const milestones = [{ milestone: '' }, { milestone: undefined }, {}]
    expect(itemsFor(milestones, 'no:milestone', schema)).toEqual([{ milestone: undefined }, {}])
    expect(itemsFor(milestones, 'has:milestone', schema)).toEqual([{ milestone: '' }])
  })

  test('compares case without a locale, so the Turkish İ and ı do not match i and I', () => {
    const schema = defineSchema({ fields: { city: { type: string() } } })
    const cities = [{ city: 'İzmir' }, { city: 'ılgaz' }, { city: 'Iğdır' }]
    expect(itemsFor(cities, 'city:izmir', schema)).toEqual([])
    expect(itemsFor(cities, 'city:ILGAZ', schema)).toEqual([])
    expect(itemsFor(cities, 'city:iğdır', schema)).toEqual([{ city: 'Iğdır' }])
  })

  test('without a text function, free words filter nothing', () => {
    const schema = defineSchema({ fields: { comments: { type: number() } } })
    const { query } = bind(parse('crash comments:12').tree, schema)
    expect(issues.filter(toPredicate(query, schema)).map(issue => issue.title)).toEqual([CRASH])
  })

  test('a field reads only its own property, never one inherited from the prototype', () => {
    const schema = defineSchema({ fields: { constructor: { type: string() } } })
    const { query } = bind(parse('has:constructor').tree, schema)
    expect([{}].filter(toPredicate(query, schema))).toEqual([])
  })
})
