import { describe, expect, test } from 'vite-plus/test'

import { bind, canonical, DIAGNOSTIC_CODE, parse, stringify } from '../src'
import { issueSchema } from './fixtures/issues'

type Corpus = Array<[input: string, expected: string]>

function expectCanonical([input, expected]: [string, string]): void {
  expect(canonical(input, issueSchema)).toBe(expected)
  expect(canonical(expected, issueSchema)).toBe(expected)
}

function codesOf(text: string): Array<string> {
  const { tree, diagnostics } = parse(text)
  return [...diagnostics, ...bind(tree, issueSchema).diagnostics].map(diagnostic => diagnostic.code)
}

describe('canonical', () => {
  const operators: Corpus = [
    ['is:open   label:bug', 'is:open label:bug'],
    ['a AND b', 'a b'],
    ['a  AND   b OR  c', 'a b OR c'],
    ['a (b OR c)', 'a (b OR c)'],
    ['(a b) OR c', 'a b OR c'],
    ['(a OR (b OR c)) d', '(a OR b OR c) d'],
    ['((a b) c)', 'a b c'],
    ['OR a OR', 'a'],
    ['AND', ''],
    ['NOT label:bug', '-label:bug'],
    ['NOT NOT label:bug', 'label:bug'],
  ]
  test.each(operators)('writes %j as %j', (input, expected) => expectCanonical([input, expected]))

  const names: Corpus = [
    ['labels:bug', 'label:bug'],
    ['is:OPEN locked:TRUE', 'is:open locked:true'],
    ['label:Bug', 'label:Bug'],
    ['"target date":2026-03-01', '"target date":2026-03-01'],
  ]
  test.each(names)('writes %j as %j', (input, expected) => expectCanonical([input, expected]))

  const emptyValues: Corpus = [
    ['is:', ''],
    ['label:bug,', 'label:bug'],
    ['label:,bug', 'label:bug'],
    ['label:"" is:open', 'is:open'],
    ['comments:>= is:open', 'is:open'],
    ['comments:.. is:open', 'is:open'],
  ]
  test.each(emptyValues)('drops the empty parts of %j', (input, expected) => expectCanonical([input, expected]))

  const parentheses: Corpus = [
    ['(is:open label:bug', 'is:open label:bug'],
    ['is:open) label:bug', 'is:open label:bug'],
    ['((is:open)', 'is:open'],
  ]
  test.each(parentheses)('reads %j as far as it goes', (input, expected) => expectCanonical([input, expected]))

  const lists: Corpus = [
    ['label:bug OR label:docs', 'label:bug,docs'],
    ['label:bug,docs OR label:wip', 'label:bug,docs,wip'],
    ['label:bug OR label:docs OR is:open', 'label:bug OR label:docs OR is:open'],
    ['-label:bug OR label:docs', '-label:bug OR label:docs'],
    ['has:label OR has:milestone', 'has:label,milestone'],
  ]
  test.each(lists)('writes %j as %j', (input, expected) => expectCanonical([input, expected]))

  const quoting: Corpus = [
    ['label:"bug"', 'label:bug'],
    ["label:'in progress'", 'label:"in progress"'],
    ['"release notes"', '"release notes"'],
    ['release" notes"', '"release notes"'],
    ['label:"a,b"', 'label:"a,b"'],
    ['label:"10..20"', 'label:"10..20"'],
    ['label:">10"', 'label:">10"'],
    ['label:"-wip"', 'label:-wip'],
    ['"-wip"', '"-wip"'],
    ['"is:open"', '"is:open"'],
    ['label:"@me"', 'label:"@me"'],
    ['label:"*bug*"', 'label:"*bug*"'],
    ['label:OR', 'label:OR'],
    ['"OR" "AND" "NOT"', '"OR" "AND" "NOT"'],
    ["don't", "don't"],
    ['"don\'t"', "don't"],
    [String.raw`label:"say \"hi\""`, String.raw`label:"say \"hi\""`],
    [String.raw`label:"a\\b"`, String.raw`label:a\b`],
    ['label:"a(b)"', 'label:"a(b)"'],
  ]
  test.each(quoting)('quotes %j only where it reads differently without quotes: %j', (input, expected) =>
    expectCanonical([input, expected]),
  )

  const presence: Corpus = [
    ['has:label', 'has:label'],
    ['no:label', 'no:label'],
    ['label:*', 'has:label'],
    ['-no:label', 'has:label'],
    ['-has:label', 'no:label'],
    ['-label:*', 'no:label'],
    ['no:labels', 'no:label'],
    ['-no:label,milestone', '-no:label,milestone'],
  ]
  test.each(presence)('writes %j as %j', (input, expected) => expectCanonical([input, expected]))

  const dynamic: Corpus = [
    ['created:@today-7d..@today', 'created:@today-7d..@today'],
    ['created:>@today-2w', 'created:>@today-2w'],
    ['created:@today+7', 'created:@today+7'],
    ['assignee:@me,ahmet', 'assignee:@me,ahmet'],
    ['@me', '@me'],
  ]
  test.each(dynamic)('keeps the dynamic value in %j as written', (input, expected) =>
    expectCanonical([input, expected]),
  )

  const values: Corpus = [
    ['created:2026-01-31T14:30+03:00', 'created:2026-01-31T11:30:00Z'],
    ['created:2026-01-31T14:30', 'created:2026-01-31T14:30:00Z'],
    ['created:2026-01-31T14:30:15.250Z', 'created:2026-01-31T14:30:15.250Z'],
    ['comments:010', 'comments:10'],
    ['comments:1e21', 'comments:1e+21'],
    ['label:*bug*', 'label:*bug*'],
  ]
  test.each(values)('writes the value in %j the way its type does: %j', (input, expected) =>
    expectCanonical([input, expected]),
  )

  test('keeps the order terms were written in', () => {
    expectCanonical(['label:bug is:open comments:>3 crash', 'label:bug is:open comments:>3 crash'])
  })
})

describe('canonical with mistakes', () => {
  const kept: Array<[input: string, expected: string, codes: Array<string>]> = [
    ['LABEL:bug', 'LABEL:bug', [DIAGNOSTIC_CODE.unknownField]],
    ['-unknown:x is:open', '-unknown:x is:open', [DIAGNOSTIC_CODE.unknownField]],
    ['comments:many', 'comments:many', [DIAGNOSTIC_CODE.invalidValue]],
    ['label:bug,@nope', 'label:bug,@nope', [DIAGNOSTIC_CODE.unknownToken]],
    ['created:@today+7h', 'created:@today+7h', [DIAGNOSTIC_CODE.unknownToken]],
    ['assignee:@me+1', 'assignee:@me+1', [DIAGNOSTIC_CODE.unknownToken]],
    ['comments:*5', 'comments:*5', [DIAGNOSTIC_CODE.unsupportedOperator]],
    ['label:>bug', 'label:>bug', [DIAGNOSTIC_CODE.unsupportedOperator]],
    ['has:unknown', 'has:unknown', [DIAGNOSTIC_CODE.unknownField]],
    ['created:2026-02-30', 'created:2026-02-30', [DIAGNOSTIC_CODE.invalidValue]],
    ['-(a OR b) c', '-(a OR b) c', [DIAGNOSTIC_CODE.negatedGroup]],
    ['label:"in progress', 'label:"in progress"', [DIAGNOSTIC_CODE.unclosedQuote]],
  ]
  test.each(kept)('keeps %j in the text as %j and reports it', (input, expected, codes) => {
    expectCanonical([input, expected])
    expect(codesOf(input)).toEqual(codes)
  })
})

describe('stringify', () => {
  test('writes a negated group built in code by negating its parts, since text cannot negate a group', () => {
    const query = bind(parse('is:open label:bug,docs').tree, issueSchema).query
    expect(stringify({ type: 'not', child: query }, issueSchema)).toBe('-is:open OR -label:bug,docs')
    expect(canonical('-is:open OR -label:bug,docs', issueSchema)).toBe('-is:open OR -label:bug,docs')
  })
})
