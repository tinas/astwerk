import type { TokenDefinition } from '../../src'

import { boolean, date, defineSchema, enumOf, number, string } from '../../src'

declare module '../../src/schema/token' {
  interface ResolveContext {
    user?: string
  }
}

export interface Issue {
  title: string
  state: IssueState
  labels: Array<string>
  assignee?: string
  author: string
  comments: number
  created: string
  locked: boolean
  milestone?: string
}

export const ISSUE_STATE = {
  open: 'open',
  closed: 'closed',
} as const

export type IssueState = (typeof ISSUE_STATE)[keyof typeof ISSUE_STATE]

export const LABELS = ['bug', 'docs', 'enhancement', 'in progress']

const meToken: TokenDefinition<string> = {
  description: 'The signed-in user',
  resolve: (_, context) => context.user ?? '',
}

const person = string({ tokens: { me: meToken } })

export const issueSchema = defineSchema({
  fields: {
    is: { type: enumOf(Object.values(ISSUE_STATE)), label: 'State', get: (issue: Issue) => issue.state },
    label: {
      type: string({ suggest: prefix => LABELS.filter(label => label.startsWith(prefix)).map(value => ({ value })) }),
      label: 'Label',
      aliases: ['labels'],
      get: issue => issue.labels,
    },
    assignee: { type: person, label: 'Assignee' },
    author: { type: person, label: 'Author' },
    comments: { type: number(), label: 'Comments' },
    created: { type: date(), label: 'Created' },
    locked: { type: boolean(), label: 'Locked' },
    milestone: { type: string(), label: 'Milestone' },
    'target date': { type: date(), label: 'Target date', get: () => undefined },
  },
  text: (issue: Issue) => issue.title,
})

export const issues: Array<Issue> = [
  {
    title: 'Crash when the release notes are empty',
    state: 'open',
    labels: ['bug'],
    assignee: 'ahmet',
    author: 'tinastepe',
    comments: 12,
    created: '2026-01-31T09:15:00Z',
    locked: false,
  },
  {
    title: 'Document the export command',
    state: 'closed',
    labels: ['docs', 'in progress'],
    author: 'ahmet',
    comments: 3,
    created: '2026-02-14T18:00:00Z',
    locked: true,
    milestone: 'v1',
  },
  {
    title: 'Dark mode for the settings page',
    state: 'open',
    labels: [],
    assignee: 'tinastepe',
    author: 'ahmet',
    comments: 40,
    created: '2026-03-01T00:00:00Z',
    locked: false,
  },
]
