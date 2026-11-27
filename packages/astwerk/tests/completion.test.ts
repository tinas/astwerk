import { describe, expect, test } from 'vite-plus/test'

import type { CompletionContext } from '../src'

import { defineSchema, getCompletionContext, getSuggestions, string } from '../src'
import { issueSchema } from './fixtures/issues'

const CURSOR = '|'

function contextAt(textWithCursor: string): CompletionContext | undefined {
  return getCompletionContext(textWithCursor.replace(CURSOR, ''), textWithCursor.indexOf(CURSOR))
}

describe('getCompletionContext', () => {
  const table: Array<[text: string, context: CompletionContext | undefined]> = [
    ['|', { kind: 'key', prefix: '', from: 0, to: 0 }],
    ['lab|', { kind: 'key', prefix: 'lab', from: 0, to: 3 }],
    ['la|bel:bug', { kind: 'key', prefix: 'la', from: 0, to: 6 }],
    ['label:b|', { kind: 'value', key: 'label', prefix: 'b', from: 6, to: 7, taken: [], atEnd: true }],
    ['label:|', { kind: 'value', key: 'label', prefix: '', from: 6, to: 6, taken: [], atEnd: true }],
    ['label:b|ug is:open', { kind: 'value', key: 'label', prefix: 'b', from: 6, to: 9, taken: [], atEnd: false }],
    ['label:bug,|', { kind: 'value', key: 'label', prefix: '', from: 10, to: 10, taken: ['bug'], atEnd: true }],
    [
      'label:bug,d|,ui',
      { kind: 'value', key: 'label', prefix: 'd', from: 10, to: 11, taken: ['bug', 'ui'], atEnd: false },
    ],
    ['|-label:bug', { kind: 'key', prefix: '', from: 0, to: 0 }],
    ['-|', { kind: 'key', prefix: '', from: 1, to: 1 }],
    ['-lab|', { kind: 'key', prefix: 'lab', from: 1, to: 4 }],
    ['is:open |', { kind: 'key', prefix: '', from: 8, to: 8 }],
    ['(|', { kind: 'key', prefix: '', from: 1, to: 1 }],
    ['(is:open OR lab|)', { kind: 'key', prefix: 'lab', from: 12, to: 15 }],
    [
      'comments:>=1|',
      { kind: 'value', key: 'comments', prefix: '1', from: 11, to: 12, taken: [], atEnd: true, operator: '>=' },
    ],
    [
      'comments:>|',
      { kind: 'value', key: 'comments', prefix: '', from: 10, to: 10, taken: [], atEnd: true, operator: '>' },
    ],
    ['created:2026..|', { kind: 'value', key: 'created', prefix: '', from: 14, to: 14, taken: [], atEnd: true }],
    ['created:20|..2027', { kind: 'value', key: 'created', prefix: '20', from: 8, to: 10, taken: [], atEnd: false }],
    ['label:"in pr|', { kind: 'value', key: 'label', prefix: 'in pr', from: 6, to: 12, taken: [], atEnd: true }],
    ['"release no|', undefined],
  ]
  test.each(table)('%j is %j', (text, context) => {
    expect(contextAt(text)).toEqual(context)
  })
})

describe('getSuggestions', () => {
  function suggest(textWithCursor: string) {
    const context = contextAt(textWithCursor)
    if (context == undefined) throw new Error('no completion context')
    return getSuggestions(context, issueSchema)
  }

  test('suggests fields whose name or label starts with the prefix, then has and no', () => {
    expect(suggest('a|')).toEqual([
      { label: 'Assignee', insertText: 'assignee:' },
      { label: 'Author', insertText: 'author:' },
    ])
    expect(suggest('t|')).toEqual([{ label: 'Target date', insertText: '"target date":' }])
    expect(suggest('n|')).toEqual([{ label: 'no', insertText: 'no:' }])
  })

  test('suggests the values of an enum', () => {
    expect(suggest('is:c|')).toEqual([{ label: 'closed', insertText: 'closed' }])
  })

  test('quotes a suggested value that needs it and leaves out values already in the term', () => {
    expect(suggest('label:bug,|')).toEqual([
      { label: 'docs', insertText: 'docs' },
      { label: 'enhancement', insertText: 'enhancement' },
      { label: 'in progress', insertText: '"in progress"' },
    ])
  })

  test('suggests the tokens of the field type after its values', () => {
    expect(suggest('assignee:|')).toEqual([{ label: '@me', insertText: '@me', description: 'The signed-in user' }])
    expect(suggest('created:@t|')).toEqual([{ label: '@today', insertText: '@today', description: 'The current day' }])
  })

  test('suggests field names after has and no', () => {
    expect(suggest('no:mi|')).toEqual([{ label: 'Milestone', insertText: 'milestone' }])
  })

  test('suggests nothing for an unknown field', () => {
    expect(suggest('unknown:|')).toEqual([])
  })

  test('is a promise when the field type suggests asynchronously', async () => {
    const schema = defineSchema({ fields: { label: { type: string({ suggest: async () => [{ value: 'bug' }] }) } } })
    const context = getCompletionContext('label:', 6)
    const suggestions = context && getSuggestions(context, schema)
    expect(suggestions).toBeInstanceOf(Promise)
    await expect(suggestions).resolves.toEqual([{ label: 'bug', insertText: 'bug' }])
  })
})
