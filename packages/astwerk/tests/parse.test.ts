import { describe, expect, test } from 'vite-plus/test'

import { DIAGNOSTIC_CODE, parse } from '../src'

function codesOf(text: string): Array<string> {
  return parse(text).diagnostics.map(diagnostic => diagnostic.code)
}

describe('parse', () => {
  test('a term holds its key and each comma-separated value', () => {
    expect(parse('label:bug,ui').tree).toMatchObject({
      type: 'term',
      key: 'label',
      values: [
        { kind: 'equal', raw: 'bug', quoted: false },
        { kind: 'equal', raw: 'ui', quoted: false },
      ],
    })
  })

  test('whitespace joins with AND, and AND binds tighter than OR', () => {
    expect(parse('a b OR c').tree).toMatchObject({
      type: 'or',
      children: [
        { type: 'and', children: [{ value: 'a' }, { value: 'b' }] },
        { type: 'text', value: 'c' },
      ],
    })
  })

  test('OR, AND and NOT are operators only in capitals', () => {
    expect(parse('a or b and NOT c').tree).toMatchObject({
      type: 'and',
      children: [
        { value: 'a' },
        { value: 'or' },
        { value: 'b' },
        { value: 'and' },
        { type: 'not', child: { value: 'c' } },
      ],
    })
  })

  test('a minus negates at the start of a word and is part of a value anywhere else', () => {
    expect(parse('-label:bug amount:-5..5').tree).toMatchObject({
      type: 'and',
      children: [
        { type: 'not', child: { type: 'term', key: 'label' } },
        { type: 'term', key: 'amount', values: [{ kind: 'range', min: { raw: '-5' }, max: { raw: '5' } }] },
      ],
    })
  })

  test('NOT negates what follows it, and two of them cancel out', () => {
    expect(parse('NOT label:bug').tree).toMatchObject({ type: 'not', child: { key: 'label' } })
    expect(parse('NOT NOT label:bug').tree).toMatchObject({ type: 'term', key: 'label' })
    expect(parse('NOT -label:bug').tree).toMatchObject({ type: 'not', child: { type: 'not' } })
  })

  test('quotes keep spaces, commas and range separators inside one value', () => {
    expect(parse('label:"a,b..c d"').tree).toMatchObject({
      values: [{ kind: 'equal', raw: 'a,b..c d', quoted: true }],
    })
  })

  test('a single quote opens a value only at its start, so an apostrophe inside a word is text', () => {
    expect(parse("label:'in progress' don't").tree).toMatchObject({
      type: 'and',
      children: [{ values: [{ raw: 'in progress', quoted: true }] }, { type: 'text', value: "don't", quoted: false }],
    })
  })

  test('inside quotes a backslash writes a quote or a backslash and leaves other characters alone', () => {
    expect(parse(String.raw`label:"a \"b\" c\\d \e"`).tree).toMatchObject({
      values: [{ raw: String.raw`a "b" c\d \e` }],
    })
  })

  test('quoted parts join the word they are written in', () => {
    expect(parse('release"d notes"').tree).toMatchObject({ type: 'text', value: 'released notes', quoted: true })
  })

  test('a key may contain dots and quoted parts', () => {
    expect(parse('field."target date":>=2026-03-01').tree).toMatchObject({
      type: 'term',
      key: 'field.target date',
      values: [{ kind: 'compare', operator: '>=', raw: '2026-03-01' }],
    })
  })

  test('a word that starts with a colon is free text', () => {
    expect(parse(':bug').tree).toMatchObject({ type: 'text', value: ':bug' })
  })

  test('a range splits at its first two dots', () => {
    expect(parse('amount:1.5..2 version:1..2..3').tree).toMatchObject({
      children: [
        { values: [{ kind: 'range', min: { raw: '1.5' }, max: { raw: '2' } }] },
        { values: [{ kind: 'range', min: { raw: '1' }, max: { raw: '2..3' } }] },
      ],
    })
  })

  test.each(['amount:*..10', 'amount:..10'])('%s has no lower bound', text => {
    const [value] = (parse(text).tree as { values: Array<object> }).values
    expect(value).toMatchObject({ kind: 'range', max: { raw: '10' } })
    expect(value).not.toHaveProperty('min.raw')
  })

  test('quoted bounds may hold spaces, and a quoted star is a bound', () => {
    expect(parse('sprint:"Sprint 1".."*"').tree).toMatchObject({
      values: [{ kind: 'range', min: { raw: 'Sprint 1', quoted: true }, max: { raw: '*', quoted: true } }],
    })
  })

  test('spans point at the text they were read from', () => {
    const { tree } = parse('is:open -label:bug')
    expect(tree).toMatchObject({
      span: { from: 0, to: 18 },
      children: [
        { span: { from: 0, to: 7 }, keySpan: { from: 0, to: 2 }, values: [{ span: { from: 3, to: 7 } }] },
        { type: 'not', span: { from: 8, to: 18 }, child: { span: { from: 9, to: 18 } } },
      ],
    })
  })

  test.each(['', '   '])('%j is an empty AND', text => {
    expect(parse(text)).toEqual({
      tree: { type: 'and', children: [], span: { from: 0, to: text.length } },
      diagnostics: [],
    })
  })
})

describe('parse with broken text', () => {
  test('an unclosed quote is read to the end and reported', () => {
    const { tree, diagnostics } = parse('label:"in progress')
    expect(tree).toMatchObject({ values: [{ raw: 'in progress', quoted: true }] })
    expect(diagnostics).toEqual([{ code: DIAGNOSTIC_CODE.unclosedQuote, severity: 'warning', from: 6, to: 18 }])
  })

  test('a missing closing parenthesis is reported at the opening one', () => {
    const { tree, diagnostics } = parse('(a OR b')
    expect(tree).toMatchObject({ type: 'or' })
    expect(diagnostics).toEqual([{ code: DIAGNOSTIC_CODE.unbalancedParenthesis, severity: 'warning', from: 0, to: 1 }])
  })

  test('an extra closing parenthesis is reported and skipped', () => {
    const { tree, diagnostics } = parse('a) b')
    expect(tree).toMatchObject({ type: 'and', children: [{ value: 'a' }, { value: 'b' }] })
    expect(diagnostics).toMatchObject([{ code: DIAGNOSTIC_CODE.unbalancedParenthesis, from: 1, to: 2 }])
  })

  test.each(['-(a OR b)', 'NOT (a b)'])('negating the group in %s is reported', text => {
    expect(codesOf(text)).toEqual([DIAGNOSTIC_CODE.negatedGroup])
  })

  test.each(['OR a OR', 'AND a AND', 'a NOT', '(OR a)'])('the operator with nothing to join in %s is dropped', text => {
    expect(parse(text)).toMatchObject({ tree: { type: 'text', value: 'a' }, diagnostics: [] })
  })

  test('deep nesting stops at a limit instead of overflowing the stack', () => {
    const depth = 100_000
    const { diagnostics } = parse(`${'('.repeat(depth)}a${')'.repeat(depth)}`)
    expect(diagnostics.map(diagnostic => diagnostic.code)).toContain(DIAGNOSTIC_CODE.nestingTooDeep)
  })

  test('a long chain of NOT leaves a shallow tree', () => {
    expect(parse(`${'NOT '.repeat(100_001)}a`).tree).toMatchObject({ type: 'not', child: { type: 'text', value: 'a' } })
  })
})
