import { describe, expect, test } from 'vite-plus/test'

import { highlight } from '../src'

function colored(text: string): Array<[string, string]> {
  return highlight(text).map(span => [text.slice(span.from, span.to), span.kind])
}

describe('highlight', () => {
  test('colors every part of a query in order', () => {
    expect(colored('-label:bug,"in progress" OR (NOT assignee:@me comments:>=3 created:1..2) crash')).toEqual([
      ['-', 'negation'],
      ['label', 'key'],
      [':', 'separator'],
      ['bug', 'value'],
      [',', 'separator'],
      ['"in progress"', 'value'],
      ['OR', 'keyword'],
      ['(', 'paren'],
      ['NOT', 'keyword'],
      ['assignee', 'key'],
      [':', 'separator'],
      ['@me', 'dynamic'],
      ['comments', 'key'],
      [':', 'separator'],
      ['>=', 'comparison'],
      ['3', 'value'],
      ['created', 'key'],
      [':', 'separator'],
      ['1', 'value'],
      ['..', 'range'],
      ['2', 'value'],
      [')', 'paren'],
      ['crash', 'text'],
    ])
  })

  test('a quoted token is a plain value', () => {
    expect(colored('assignee:"@me"')).toContainEqual(['"@me"', 'value'])
  })

  test('colors broken text as far as it reads', () => {
    expect(colored('label:"in pr) b')).toEqual([
      ['label', 'key'],
      [':', 'separator'],
      ['"in pr) b', 'value'],
    ])
  })
})
