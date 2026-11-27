import { describe, expect, test, vi } from 'vite-plus/test'

import type { Query, QueryVisitor } from '../src'

import { bind, fold, isTokenValue, parse, resolveTokens, stringify, withoutField } from '../src'
import { issueSchema } from './fixtures/issues'

function queryOf(text: string): Query {
  return bind(parse(text).tree, issueSchema).query
}

const sqlVisitor: QueryVisitor<string> = {
  and: children => (children.length == 0 ? 'TRUE' : `(${children.join(' AND ')})`),
  or: children => `(${children.join(' OR ')})`,
  not: child => `NOT ${child}`,
  in: condition => `${condition.field} IN (${condition.values.map(value => JSON.stringify(value)).join(', ')})`,
  range: condition =>
    [
      condition.min &&
        `${condition.field} ${condition.min.inclusive ? '>=' : '>'} ${JSON.stringify(condition.min.value)}`,
      condition.max &&
        `${condition.field} ${condition.max.inclusive ? '<=' : '<'} ${JSON.stringify(condition.max.value)}`,
    ]
      .filter(Boolean)
      .join(' AND '),
  text: condition => `title LIKE ${JSON.stringify(`%${condition.value}%`)}`,
  empty: condition => `${condition.field} IS NULL`,
  match: condition => `${condition.field} LIKE ${JSON.stringify(condition.pattern.replaceAll('*', '%'))}`,
}

describe('fold', () => {
  test('folds each part of a query into a backend query', () => {
    expect(
      fold(queryOf('is:open (label:bug,docs OR no:assignee) comments:>3 -label:*wip* crash'), issueSchema, sqlVisitor),
    ).toBe(
      '(is IN ("open") AND (label IN ("bug", "docs") OR assignee IS NULL) AND comments > 3 AND NOT label LIKE "%wip%" AND title LIKE "%crash%")',
    )
  })

  test('leaves out the parts that could not be bound', () => {
    expect(fold(queryOf('is:open unknown:x -comments:many'), issueSchema, sqlVisitor)).toBe('is IN ("open")')
  })

  test('a query with nothing left folds as an empty AND', () => {
    expect(fold(queryOf('unknown:x'), issueSchema, sqlVisitor)).toBe('TRUE')
    expect(fold(queryOf(''), issueSchema, sqlVisitor)).toBe('TRUE')
  })

  test('passes tokens through unresolved, so a server can resolve them itself', () => {
    const values: Array<unknown> = []
    fold(queryOf('assignee:@me'), issueSchema, {
      ...sqlVisitor,
      in: condition => (values.push(...condition.values), ''),
    })
    expect(values).toMatchObject([{ kind: 'token', name: 'me', raw: '@me' }])
    expect(isTokenValue(values[0])).toBe(true)
  })
})

describe('resolveTokens', () => {
  test('replaces tokens with what they stand for in the context', () => {
    const resolved = resolveTokens(queryOf('assignee:@me created:>=@today-7d'), issueSchema, {
      user: 'ahmet',
      now: new Date('2026-03-05T12:00:00Z'),
    })
    expect(resolved).toEqual({
      type: 'and',
      children: [
        { type: 'in', field: 'assignee', values: ['ahmet'] },
        { type: 'range', field: 'created', min: { value: '2026-02-26', inclusive: true } },
      ],
    })
  })

  test('resolves with the current time when the context has none', () => {
    vi.useFakeTimers({ now: new Date('2026-03-05T12:00:00Z') })
    try {
      expect(resolveTokens(queryOf('created:@today'), issueSchema)).toEqual({
        type: 'in',
        field: 'created',
        values: ['2026-03-05'],
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test('leaves the text of the query untouched', () => {
    const query = queryOf('created:>=@today-7d')
    resolveTokens(query, issueSchema)
    expect(stringify(query, issueSchema)).toBe('created:>=@today-7d')
  })
})

describe('withoutField', () => {
  test('removes every condition on a field and keeps the rest in place', () => {
    const query = queryOf('label:bug is:open (no:label OR comments:>3) -label:wip crash')
    expect(stringify(withoutField(query, 'label'), issueSchema)).toBe('is:open comments:>3 crash')
  })

  test('works on a query that does not fit a panel', () => {
    expect(stringify(withoutField(queryOf('label:bug OR is:open'), 'is'), issueSchema)).toBe('label:bug')
  })

  test('removes the invalid values of the field too', () => {
    expect(stringify(withoutField(queryOf('comments:many is:open'), 'comments'), issueSchema)).toBe('is:open')
  })
})
