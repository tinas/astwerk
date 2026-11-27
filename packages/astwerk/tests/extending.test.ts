import { describe, expect, test } from 'vite-plus/test'

import type { FieldCondition, FieldType, Query, QueryVisitor } from '../src'
import type { Issue } from './fixtures/issues'

import {
  bind,
  canonical,
  defineSchema,
  enumOf,
  fold,
  getCompletionContext,
  getSuggestions,
  isTokenValue,
  number,
  parse,
  string,
  toPredicate,
  valuesOf,
} from '../src'
import { issues } from './fixtures/issues'

declare module '../src/schema/token' {
  interface ResolveContext {
    sprint?: number
  }
}

const PRIORITY = /^p(\d)$/i

const priority: FieldType<number> = {
  parse: raw => {
    const match = PRIORITY.exec(raw)
    return match == undefined ? undefined : Number(match[1])
  },
  format: value => `p${value}`,
  compare: (a, b) => a - b,
}

const sprint = number({
  tokens: {
    current: {
      description: 'The running sprint',
      offsetUnits: [],
      resolve: (offset, context) => (context.sprint ?? 0) + (offset?.amount ?? 0),
    },
  },
})

const person = string({
  tokens: { me: { description: 'The signed-in user', resolve: (_, context) => context.user ?? '' } },
})

const sharedFields = {
  involves: { type: person, expand: involveAuthorOrAssignee },
  sort: { type: enumOf(['created', 'comments']), expand: () => undefined },
}

const schema = defineSchema({
  fields: {
    ...sharedFields,
    author: { type: person, get: (issue: Issue) => issue.author },
    assignee: { type: person, get: issue => issue.assignee },
    is: { type: enumOf(['open', 'closed']), get: issue => issue.state },
    priority: { type: priority, get: issue => issue.comments % 4 },
    sprint: { type: sprint, get: issue => issue.comments % 3 },
  },
  text: issue => issue.title,
})

const fieldVisitor: QueryVisitor<string> = {
  and: children => children.join(' AND '),
  or: children => `(${children.join(' OR ')})`,
  not: child => `NOT ${child}`,
  in: condition =>
    `${condition.field}=${condition.values.map(value => (isTokenValue(value) ? value.raw : String(value))).join('|')}`,
  range: condition => `${condition.field} in range`,
  text: condition => condition.value,
  empty: condition => `${condition.field} is empty`,
  match: condition => `${condition.field}~${condition.pattern}`,
}

function involveAuthorOrAssignee(condition: FieldCondition): Query {
  return {
    type: 'or',
    children: [
      { ...condition, field: 'author' },
      { ...condition, field: 'assignee' },
    ],
  }
}

function queryOf(text: string): Query {
  return bind(parse(text).tree, schema).query
}

function titlesFor(text: string, context = {}): Array<string> {
  return issues.filter(toPredicate(queryOf(text), schema, context)).map(issue => issue.title.split(' ')[0])
}

describe('a field that expands', () => {
  test('stands for the conditions it expands to when the query filters', () => {
    expect(titlesFor('involves:@me', { user: 'tinastepe' })).toEqual(['Crash', 'Dark'])
    expect(titlesFor('-involves:tinastepe')).toEqual(['Document'])
  })

  test('stays in the text as written', () => {
    expect(canonical('involves:@me,ahmet is:open', schema)).toBe('involves:@me,ahmet is:open')
  })

  test('reaches a backend as the conditions it stands for', () => {
    expect(fold(queryOf('involves:ahmet -involves:@me'), schema, fieldVisitor)).toBe(
      '(author=ahmet OR assignee=ahmet) AND NOT (author=@me OR assignee=@me)',
    )
  })

  test('filters nothing when it expands to nothing, and keeps its value for the app', () => {
    const query = queryOf('sort:comments is:open')
    expect(titlesFor('sort:comments is:open')).toEqual(['Crash', 'Dark'])
    expect(valuesOf(query, 'sort')).toEqual(['comments'])
    expect(fold(query, schema, fieldVisitor)).toBe('is=open')
  })

  test('has no value for the whole query when it sits inside OR or NOT', () => {
    expect(valuesOf(queryOf('sort:comments OR is:open'), 'sort')).toEqual([])
    expect(valuesOf(queryOf('-sort:comments'), 'sort')).toEqual([])
  })
})

describe('a field type of the app', () => {
  test('reads, writes and orders its own values', () => {
    expect(canonical('priority:P2..p3 priority:>=p1', schema)).toBe('priority:p2..p3')
    expect(titlesFor('priority:>=p2')).toEqual(['Document'])
    expect(bind(parse('priority:urgent').tree, schema).diagnostics).toMatchObject([{ code: 'invalidValue' }])
  })

  test('resolves its tokens with the context of the app', () => {
    expect(canonical('sprint:@current+1', schema)).toBe('sprint:@current+1')
    expect(titlesFor('sprint:@current+1', { sprint: 0 })).toEqual(['Dark'])
    expect(bind(parse('sprint:@current+1w').tree, schema).diagnostics).toMatchObject([{ code: 'unknownToken' }])
  })

  test('suggests its tokens', () => {
    const context = getCompletionContext('sprint:@', 8)
    expect(context && getSuggestions(context, schema)).toEqual([
      { label: '@current', insertText: '@current', description: 'The running sprint' },
    ])
  })
})
