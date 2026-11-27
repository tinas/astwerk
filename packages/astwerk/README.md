# astwerk

[![CI](https://github.com/tinas/astwerk/actions/workflows/ci.yml/badge.svg)](https://github.com/tinas/astwerk/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/tinas/astwerk)](https://github.com/tinas/astwerk/blob/main/LICENSE)

A filter query language for TypeScript, inspired by GitHub search. People type a filter such as `is:open label:bug,ui amount:10..40`, or pick one from menus that write the same text. astwerk parses that text into a syntax tree for editors, binds it to your schema as a typed query for filter panels and backends, and writes every filter back in one canonical form, so a filter fits in a URL as a link anyone can open. It has no dependencies and runs wherever JavaScript runs, in the browser and on the server.

## Installation

```sh
pnpm add astwerk
```

## Quick Start

A schema names the fields a query can filter and the type of each. With it, the text of a query becomes a typed query that filters a list, and any text can be written back in its canonical form.

```ts
import { bind, canonical, date, defineSchema, enumOf, number, parse, string, toPredicate } from 'astwerk'

interface Issue {
  title: string
  state: 'open' | 'closed'
  labels: Array<string>
  comments: number
  created: string
}

const issueSchema = defineSchema({
  fields: {
    is: { type: enumOf(['open', 'closed']), get: (issue: Issue) => issue.state },
    label: { type: string(), get: issue => issue.labels },
    comments: { type: number(), get: issue => issue.comments },
    created: { type: date(), get: issue => issue.created },
  },
  text: issue => issue.title,
})

const { tree } = parse('is:open label:bug,docs comments:>10 crash')
const { query } = bind(tree, issueSchema)
const busyBugs = issues.filter(toPredicate(query, issueSchema))

canonical('is:OPEN AND (label:bug OR label:docs)', issueSchema) // 'is:open label:bug,docs'
```

The text is the source of truth. Keep it in the URL, and derive the tree, the query and the state of a filter panel from it whenever it changes.

## Syntax

A query is made of terms and words. A term filters one field, such as `label:bug`, and a word outside a term searches the free text.

```text
is:open label:bug,ui -assignee:ahmet amount:10..40 (priority:high OR no:assignee) "release notes"
```

| Query                                                    | Meaning                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `a b`                                                    | both `a` and `b`, and writing `AND` between them is allowed                  |
| `a OR b`                                                 | `a`, `b` or both. `AND` binds tighter, so `a b OR c` is `(a b) OR c`         |
| `label:bug,ui`                                           | either value of the field                                                    |
| `-label:bug`, `NOT label:bug`                            | everything without the value                                                 |
| `(a OR b) c`                                             | a group                                                                      |
| `has:label`, `no:label`                                  | items with any label, or with none                                           |
| `label:*bug*`, `title:api*`, `label:*fix`                | a value that contains, starts with or ends with the text                     |
| `assignee:*`                                             | any value, the same as `has:assignee`                                        |
| `"two words"`                                            | the quoted text as one value, with `..`, `>`, `,` and `*` read as plain text |
| `amount:10..40`                                          | from 10 to 40, both included                                                 |
| `amount:>=10`, `amount:>10`, `amount:<40`, `amount:<=40` | a range with one bound                                                       |
| `amount:10..*`, `amount:*..40`                           | a range with an open end                                                     |
| `amount:<10,>100`                                        | either range                                                                 |
| `sprint:"Sprint 1".."Sprint 4"`, `sprint:<"Sprint 5"`    | bounds with spaces, in quotes                                                |

- Field names are written exactly as the schema names them, and a field written any other way is reported as unknown. Values match without regard to case, so `is:OPEN` finds what `is:open` finds.
- `has` and `no` take a field name as their value, so no field can be named `has` or `no`.
- `OR`, `AND` and `NOT` are operators only in capitals, so a lower-case `or` is free text.
- `-` and `NOT` negate one term or word. A `-` negates only at the start of a word, so `amount:-5..5` runs from -5 to 5.
- A value with spaces goes in quotes, such as `label:"in progress"` or `label:'in progress'`. Inside quotes, a backslash writes the quote (`\"`, `\'`) and a backslash (`\\`). A `'` inside a word, as in `don't`, is plain text.
- Numbers use a dot for decimals (`10.5`), because a comma separates values.
- Dates are ISO 8601, with an optional time (`2026-01-31`, `2026-01-31T14:30:00Z`), in UTC unless the time says otherwise. A day covers all of its hours, so `created:2026-01-31` is any time that day and `created:>2026-01-31` starts the day after.
- `@today`, `@today-7d` and `@today+2w` count from the current day, in days (`d`), weeks (`w`), months (`m`) or years (`y`), and a number without a unit counts days. Other `@` tokens, such as `@me`, mean what the app defines.
- A range splits at its first `..`, so `1.5..2` runs from 1.5 to 2.

A query with mistakes still works. An unclosed quote, a missing parenthesis or a term without a value is read as far as it goes. An unknown field or a value its field cannot take is reported as a diagnostic, stays in the text and filters nothing, so a typo never empties a list.

### Grammar

Whitespace between terms is an implicit `AND`. A missing `)` and an unclosed quote are tolerated, and `-` or `NOT` negates one word, never a group. Groups nest up to 32 deep, and a deeper parenthesis is reported and read as if it were not there.

```ebnf
query     = orExpr ;
orExpr    = andExpr { "OR" andExpr } ;
andExpr   = { primary [ "AND" ] } ;
primary   = "(" orExpr [ ")" ] | word ;
word      = [ "-" | "NOT" ] ( term | text ) ;
term      = key ":" valueList ;
valueList = value { "," value } ;
value     = cmp | range | quoted | bare ;
cmp       = ( ">=" | "<=" | ">" | "<" ) ( quoted | bare ) ;
range     = [ bound ] ".." [ bound ] ;
bound     = quoted | bare | "*" ;
quoted    = '"' { '\"' | '\\' | any-but-double-quote } [ '"' ]
          | "'" { "\'" | '\\' | any-but-single-quote } [ "'" ] ;
text      = quoted | bare ;
```

## Canonical Form

astwerk writes every filter back in one form, so the same filter always gives the same text and the same link. Writing a canonical text again changes nothing, and the canonical text filters the same items as the text it came from.

- Spaces collapse to one, a written `AND` is dropped, and parentheses stay only where an `OR` sits inside an `AND`.
- A negation is written with `-`, so `NOT bug` becomes `-bug`, and `NOT NOT bug` becomes `bug`.
- `label:bug OR label:docs` becomes `label:bug,docs`, since a comma is an `OR` within one field.
- `assignee:*` and `-no:assignee` become `has:assignee`, and `-has:assignee` becomes `no:assignee`.
- An alias becomes the name of the field it stands for.
- A value is written the way its type writes it. An enum or boolean value takes the spelling of the schema, so `is:OPEN` becomes `is:open`, and a time becomes UTC.
- A value is quoted only when it would read differently without quotes, and always with double quotes. That covers a value with a space, a comma, a parenthesis, a quote or a `*`, a value that would read as a range, a comparison or an `@` token, and free text that is `OR`, `AND` or `NOT`, starts with `-` or contains a `:`.
- A range with both bounds included is written `a..b`, and a range with one bound `>=a`, `>a`, `<=b` or `<b`. Two bounds that differ in whether they are included become two terms.
- Ranges on one field in the same `AND` group are intersected, so `amount:>=10 amount:<=40` becomes `amount:10..40`. Ranges with nothing in common both stay, and a diagnostic reports them.
- Empty values and empty terms are dropped.
- Terms keep the order they were written in.
- Dynamic values such as `@today-7d` stay as written, so a link keeps meaning "the last seven days" whenever it is opened.
- Unknown fields and invalid values stay in the text.

## Schemas

`defineSchema` takes the fields a query can filter. Each field has a type, and may have a `label` and a `description` for suggestions, `aliases` it also answers to, and a `get` that reads its values from an item for `toPredicate`. Without `get`, a field reads the item's own property of its name.

```ts
const issueSchema = defineSchema({
  fields: {
    label: { type: string(), label: 'Label', aliases: ['labels'], get: (issue: Issue) => issue.labels },
    milestone: { type: string(), label: 'Milestone' },
  },
  text: issue => issue.title,
})
```

`get` may return one value, a list of values or nothing. A list matches when any of its values does, and an empty list or a missing value is what `no:field` finds. `text` gives the text that free words search, and without it free words filter nothing in `toPredicate`.

### Field Types

| Type             | Values                                                              | Ranges | Wildcards |
| ---------------- | ------------------------------------------------------------------- | ------ | --------- |
| `string()`       | any text, matched without regard to case                            | no     | yes       |
| `enumOf(values)` | one of the listed values, in any case, suggested as you type        | no     | yes       |
| `number()`       | a number with a dot for decimals                                    | yes    | no        |
| `boolean()`      | `true` or `false`, in any case                                      | no     | no        |
| `date()`         | a day or an instant, with `@today`. An item's value may be a `Date` | yes    | no        |

`string()`, `number()` and `date()` take `suggest`, a function from the typed prefix to suggested values that may return a promise, and `tokens`. `enumOf` takes `tokens`.

### Dynamic Values

A token is a value written with `@`, such as `@me`, that stands for something only known when the query is evaluated. A field type lists the tokens it takes, and the query keeps them as written until `toPredicate` or `resolveTokens` resolves them with a context.

```ts
declare module 'astwerk' {
  interface ResolveContext {
    user?: string
  }
}

const person = string({
  tokens: {
    me: { description: 'The signed-in user', resolve: (_, context) => context.user ?? '' },
  },
})

const issueSchema = defineSchema({
  fields: {
    assignee: { type: person, get: (issue: Issue) => issue.assignee },
    author: { type: person, get: issue => issue.author },
  },
})

issues.filter(toPredicate(query, issueSchema, { user: 'ahmet' }))
```

A token with `offsetUnits` takes an offset such as `@current+1` or `@today-7d`. `resolve` receives it as `{ amount, unit }`, and a written unit must be one of `offsetUnits`. The context always has `now`, the current time unless you pass another, and apps add their own members as above.

### Types of Your Own

Any object with `parse` and `format` is a field type. `parse` returns `undefined` for text that is not a value, which reports an invalid value. `compare` orders values and lets the field take comparisons and ranges, `equals` decides `field:value` when it differs from `compare`, and `wildcards: true` lets an unquoted `*` stand for any text.

```ts
const priority: FieldType<number> = {
  parse: raw => (/^p\d$/i.test(raw) ? Number(raw.slice(1)) : undefined),
  format: value => `p${value}`,
  compare: (a, b) => a - b,
}
```

### Fields That Stand for Others

A field with `expand` is a shorthand. When a query filters, each of its conditions is replaced by the query `expand` returns, while the text keeps the field as written. A field whose `expand` returns `undefined` filters nothing, which suits an option such as `sort:`, and `valuesOf` reads its value for the whole query.

```ts
const sharedFields = {
  involves: {
    type: person,
    expand: (condition: FieldCondition): Query => ({
      type: 'or',
      children: [
        { ...condition, field: 'author' },
        { ...condition, field: 'assignee' },
      ],
    }),
  },
  sort: { type: enumOf(['created', 'comments']), expand: () => undefined },
}

const issueSchema = defineSchema({ fields: { ...sharedFields, assignee: { type: person }, author: { type: person } } })

valuesOf(bind(parse('sort:comments involves:@me').tree, issueSchema).query, 'sort') // ['comments']
```

Fields, their types and their tokens are plain values, so schemas share them by spreading the same objects.

## Parsing

`parse` reads any text into a syntax tree, and never throws. Every node has a `span`, the positions in the text it was read from, and terms keep their values as written, so the tree serves editors without a schema.

```ts
const { tree, diagnostics } = parse('label:"in progress')
// tree: { type: 'term', key: 'label', values: [{ kind: 'equal', raw: 'in progress', quoted: true, … }], … }
// diagnostics: [{ code: 'unclosedQuote', severity: 'warning', from: 6, to: 18 }]
```

`bind` applies a schema to the tree and reports what the schema cannot read. Show the diagnostics of both together.

| Code                    | Severity  | When                                                             |
| ----------------------- | --------- | ---------------------------------------------------------------- |
| `unknownField`          | `error`   | a key, or a field named in `has:` or `no:`, is not in the schema |
| `invalidValue`          | `error`   | the field type cannot read a value                               |
| `unknownToken`          | `error`   | the field type has no such token, or not with that offset        |
| `unsupportedOperator`   | `error`   | a comparison, range or wildcard on a type that does not take it  |
| `negatedGroup`          | `error`   | `-` or `NOT` before a group                                      |
| `unclosedQuote`         | `warning` | a quote is not closed                                            |
| `unbalancedParenthesis` | `warning` | a parenthesis is not closed, or closes nothing                   |
| `nestingTooDeep`        | `warning` | groups nest more than 32 deep                                    |
| `emptyRange`            | `warning` | ranges on one field have nothing in common                       |

An `error` marks a part that filters nothing, and a `warning` text that filters but maybe not as meant. Diagnostics carry no message, so the app words them from `code`, and `from` and `to` mark the text to underline.

## Editors

`highlight` gives the spans to color, in order, with a kind for each: `key`, `value`, `dynamic` for a token, `text`, `keyword` for `OR`, `AND` and `NOT`, `negation`, `comparison`, `range`, `separator` and `paren`.

`getCompletionContext` tells what the cursor is on. On a word that may become a field name it gives a `key` context, and on a value a `value` context with the field's key, the values already in the term and any comparison written before the value. Pass the context to `getSuggestions` for the suggestions, whose `insertText` replaces the text from `from` to `to`, quoted where the value needs it.

```ts
const context = getCompletionContext('is:open,c', 9)
// { kind: 'value', key: 'is', prefix: 'c', from: 8, to: 9, taken: ['open'], atEnd: true }

if (context != undefined) {
  const suggestions = await getSuggestions(context, issueSchema)
  // [{ label: 'closed', insertText: 'closed' }]
}
```

`getSuggestions` returns a promise only when the field type's `suggest` does, so an editor that offers the latest answer should drop the answers to older prefixes. Inside quoted free text there is no context to complete.

## Queries

`bind` returns the query as a tree of these parts. Values are the field type's values, and a token stays a `TokenValue` until it is resolved, which `isTokenValue` tells apart.

| Type        | Means                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `and`, `or` | all or any of `children`                                              |
| `not`       | not `child`                                                           |
| `in`        | the field has any of `values`                                         |
| `range`     | the field is above `min` and below `max`, each `inclusive` or not     |
| `text`      | a free word or phrase                                                 |
| `empty`     | the field has no value                                                |
| `match`     | the field has a value that fits `pattern`, where each `*` is any text |
| `invalid`   | text that could not be bound, kept as written, filtering nothing      |

`stringify` writes a query as canonical text, so a query built in code becomes a link like any other. `canonical` is `parse`, `bind` and `stringify` in one call.

### Filtering in Memory

`toPredicate` turns a query into a function for `Array.prototype.filter`. Values match without regard to case, a day covers all of its hours, and a free word matches the start of a word in the schema's `text`, so `release` finds "release notes" and `elease` does not.

```ts
const keep = toPredicate(query, issueSchema, { user: 'ahmet', now: new Date() })
const shown = issues.filter(keep)
```

### Backends

`fold` turns a query into a backend's query, one function per part, after leaving out the parts that could not be bound and replacing fields with `expand`. A query with nothing left folds as an empty `and`. Map field names to columns of your own and pass values as parameters, since the text of a query is user input.

```ts
const COLUMNS: Record<string, string> = { is: 'state', label: 'labels.name', comments: 'comment_count' }

function toSql(query: Query): { where: string; params: Array<unknown> } {
  const params: Array<unknown> = []
  const param = (value: unknown) => `$${params.push(value)}`
  const where = fold<string>(resolveTokens(query, issueSchema, { user: currentUser }), issueSchema, {
    and: parts => (parts.length == 0 ? 'TRUE' : `(${parts.join(' AND ')})`),
    or: parts => `(${parts.join(' OR ')})`,
    not: part => `NOT ${part}`,
    in: ({ field, values }) => `${COLUMNS[field]} IN (${values.map(param).join(', ')})`,
    range: ({ field, min, max }) =>
      [
        min && `${COLUMNS[field]} ${min.inclusive ? '>=' : '>'} ${param(min.value)}`,
        max && `${COLUMNS[field]} ${max.inclusive ? '<=' : '<'} ${param(max.value)}`,
      ]
        .filter(Boolean)
        .join(' AND '),
    text: ({ value }) => `title ILIKE ${param(`%${value}%`)}`,
    empty: ({ field }) => `${COLUMNS[field]} IS NULL`,
    match: ({ field, pattern }) => `${COLUMNS[field]} ILIKE ${param(pattern.replaceAll('*', '%'))}`,
  })
  return { where, params }
}
```

`resolveTokens` replaces tokens with their values for a backend that needs them. A server can also leave `@me` unresolved in the query it receives and resolve it with the signed-in user itself.

### Filter Panels

`toFlat` reads a query as the state of a filter panel, field by field: a set of values to include and exclude, with `empty` for `no:` and `has:`, or one range. Free words and parts that could not be bound are carried along. A query a panel cannot show, such as an `OR` across fields, a negated range or a wildcard, gives `undefined`, and the panel can lock until the text changes.

```ts
const flat = toFlat(query)
// { fields: { is: { kind: 'set', include: ['open'], exclude: [] } }, text: ['crash'], invalid: [] }
```

`fromFlat` builds the query back, field by field in the order of `fields`, so a field the panel adds goes after the others. `withoutField` removes every condition on one field and keeps the rest of the query as it was, which also works on a query `toFlat` cannot read.

```ts
if (flat != undefined) {
  const label: FlatSet =
    flat.fields.label?.kind == 'set' ? flat.fields.label : { kind: 'set', include: [], exclude: [] }
  const next = { ...flat, fields: { ...flat.fields, label: { ...label, include: [...label.include, 'docs'] } } }
  const text = stringify(fromFlat(next), issueSchema)
}

const cleared = stringify(withoutField(query, 'label'), issueSchema)
```

## Requirements

TypeScript 5.4 or later. The package is published as ES modules.

## License

MIT
