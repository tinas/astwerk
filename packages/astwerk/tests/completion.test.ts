import { describe, expect, test } from 'vite-plus/test'

import type { CompletionContext, SuggestionOptions } from '../src'

import { fieldNameOf, getCompletionContext, getSuggestions } from '../src'
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
  function suggest(textWithCursor: string, options?: SuggestionOptions) {
    const context = contextAt(textWithCursor)
    if (context == undefined) throw new Error('no completion context')
    return getSuggestions(context, issueSchema, options)
  }

  test('suggests fields whose name or label starts with the prefix, then has and no', () => {
    expect(suggest('a|')).toEqual([
      { label: 'Assignee', insertText: 'assignee:' },
      { label: 'Author', insertText: 'author:' },
    ])
    expect(suggest('t|')).toEqual([{ label: 'Target date', insertText: '"target date":' }])
    expect(suggest('n|')).toEqual([{ label: 'no', insertText: 'no:' }])
  })

  test('suggests every field and token to a context with an empty prefix, for an editor that matches on its own', () => {
    const key = contextAt('lbl|')
    const value = contextAt('created:tdy|')
    if (key == undefined || value == undefined) throw new Error('no completion context')
    expect(suggest('lbl|')).toEqual([])
    expect(getSuggestions({ ...key, prefix: '' }, issueSchema).map(suggestion => suggestion.insertText)).toEqual([
      'is:',
      'label:',
      'assignee:',
      'author:',
      'comments:',
      'created:',
      'locked:',
      'milestone:',
      '"target date":',
      'has:',
      'no:',
    ])
    expect(getSuggestions({ ...value, prefix: '' }, issueSchema).map(suggestion => suggestion.insertText)).toEqual([
      '@today',
    ])
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

  test('suggests the values the app loaded after the values and tokens of the field type', () => {
    expect(suggest('assignee:|', { values: [{ value: 'ahmet', description: 'Ahmet Tinastepe' }] })).toEqual([
      { label: '@me', insertText: '@me', description: 'The signed-in user' },
      { label: 'ahmet', insertText: 'ahmet', description: 'Ahmet Tinastepe' },
    ])
  })

  test('suggests loaded values as given, quoted where they need it, without the ones the term or the list has', () => {
    const values = [{ value: 'BUG' }, { value: 'Docs' }, { value: 'triage' }, { value: 'needs review' }]
    expect(suggest('labels:bug,x|', { values })).toEqual([
      { label: 'Docs', insertText: 'Docs' },
      { label: 'triage', insertText: 'triage' },
      { label: 'needs review', insertText: '"needs review"' },
    ])
    expect(suggest('label:bug,|', { values })).toEqual([
      { label: 'docs', insertText: 'docs' },
      { label: 'enhancement', insertText: 'enhancement' },
      { label: 'in progress', insertText: '"in progress"' },
      { label: 'triage', insertText: 'triage' },
      { label: 'needs review', insertText: '"needs review"' },
    ])
  })

  test('leaves loaded values out of field names and of has and no', () => {
    const values = [{ value: 'bug' }]
    expect(suggest('a|', { values })).toEqual(suggest('a|'))
    expect(suggest('no:mi|', { values })).toEqual(suggest('no:mi|'))
    expect(suggest('unknown:|', { values })).toEqual([])
  })
})

describe('fieldNameOf', () => {
  test('names the field a key or an alias stands for', () => {
    expect(fieldNameOf(issueSchema, 'label')).toBe('label')
    expect(fieldNameOf(issueSchema, 'labels')).toBe('label')
  })

  test('names no field for a key the schema does not know', () => {
    expect(fieldNameOf(issueSchema, 'Label')).toBeUndefined()
    expect(fieldNameOf(issueSchema, 'no')).toBeUndefined()
    expect(fieldNameOf(issueSchema, 'constructor')).toBeUndefined()
  })
})
