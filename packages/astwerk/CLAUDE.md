# astwerk

## Architecture (src)

| Folder        | Role                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `syntax/`     | the syntax tree types, `parse` (one pass that also collects highlight spans and syntax diagnostics), `highlight`, and the text writer |
| `schema/`     | `defineSchema`, the `FieldType` and token interfaces, and the built-in types in `types/`                                              |
| `query/`      | `bind`, normalization, `stringify` and `canonical`, `evaluable`, `fold`, `toPredicate`, `resolveTokens`, `withoutField`, `valuesOf`   |
| `flat/`       | `toFlat` and `fromFlat`                                                                                                               |
| `completion/` | `getCompletionContext` and `getSuggestions`                                                                                           |

Text flows one way: `parse` gives the syntax tree, `bind` the typed query, and `stringify` writes a query back through an internal tree that `syntax/write.ts` turns into text. `evaluable` prepares a query for `fold` and `toPredicate`. Behaviour per node type or value kind lives in tables keyed by `type` or `kind`, each read by one dispatcher with one cast.

## Decisions

### Reading text

- The parser never throws and keeps the tree shallow, since every later step recurses on it. Groups nest up to 32 deep and a deeper `(` is reported and skipped, and a chain of `NOT` keeps only its parity, so `NOT NOT x` is `x`. Guarded by "deep nesting stops at a limit instead of overflowing the stack", "a long chain of NOT leaves a shallow tree" and "NOT negates what follows it, and two of them cancel out" in `parse.test.ts`, and "reading any text never throws, and neither does anything built on it" in `properties.test.ts`.
- Quoted parts join the word they are written in, and any quoted part makes the whole value literal, so `@` and `*` in it are plain text. GitHub rejects a quote inside a word. A `'` opens a quote only at the start of a value or word, so an apostrophe in `don't` stays text. Guarded by "quoted parts join the word they are written in" and "a single quote opens a value only at its start, so an apostrophe inside a word is text" in `parse.test.ts`.
- Backslashes escape only inside quotes, and only a quote or a backslash, as GitHub's code search documents. Guarded by "inside quotes a backslash writes a quote or a backslash and leaves other characters alone" in `parse.test.ts`.
- Field names match exactly, as in GitHub, but a key in another case is an unknown field with a diagnostic, where GitHub silently searches it as text. Values match without regard to case. Guarded by the "keeps %j in the text as %j and reports it" table in `canonical.test.ts` and "reads a value in any case as the listed one" in `field-types.test.ts`.
- An `OR`, `AND` or `NOT` with nothing to join is dropped, where GitHub matches everything after a trailing `OR`, and an empty term filters nothing, where GitHub searches its key as a word. Guarded by "the operator with nothing to join in %s is dropped" in `parse.test.ts` and "drops the empty parts of %j" in `canonical.test.ts`.

### Writing text

- Quoting is derived by reading back: a value is written bare when parsing the bare form gives the same value, with no special meaning for a literal `@` or `*`, so the writer keeps no list of special characters. Guarded by the "quotes %j only where it reads differently without quotes: %j" table in `canonical.test.ts` and "writing a canonical text again changes nothing" in `properties.test.ts`.
- An `OR` whose parts are all positive terms with one key is written as one comma list, so `label:a OR label:b` and `label:a,b` share a text. Guarded by the `lists` table in `canonical.test.ts`.
- A negated group built in code is written by pushing the negation to its parts, since text cannot negate a group. A negated group read from text stays as written and filters nothing. Guarded by "writes a negated group built in code by negating its parts, since text cannot negate a group" in `canonical.test.ts` and "a negated group filters nothing" in `predicate.test.ts`.
- The canonical text filters the same items as its source. Guarded by "the canonical text filters the same items as the text it came from" in `properties.test.ts`, which runs both through `toPredicate` on the fixture issues.

### Binding

- The query keeps tokens as `TokenValue`s, so the canonical text never depends on the time and a server can resolve `@me` with its own user. `toPredicate` and `resolveTokens` resolve them, and a resolver always gets `now`. Guarded by "passes tokens through unresolved, so a server can resolve them itself", "leaves the text of the query untouched" and "resolves with the current time when the context has none" in `fold.test.ts`.
- Text that cannot be bound stays in the query as `invalid` with its syntax, and a single invalid value of a known field is kept as a term of that field, so a comma list writes back whole. `evaluable` removes invalid parts before `fold` and `toPredicate`, never counting them true or false, so a typo neither empties nor widens a result. Guarded by "a negated unknown field does not exclude everything", "an unknown field in an OR does not widen it to everything" and "an invalid value in a list leaves the other values" in `predicate.test.ts`, and "leaves out the parts that could not be bound" in `fold.test.ts`.
- Intersecting ranges never changes what a query filters. Bounds with tokens are joined but never compared, two bounds that compare equal but are written differently, such as a day and an instant in it, stay apart, and ranges with nothing in common both stay with a diagnostic. Guarded by "a day and an instant on the same day stay apart, since neither is tighter", "bounds with tokens are joined but never compared" and "ranges with nothing in common stay apart and are reported across both terms" in `ranges.test.ts`.
- `expand` applies only where a query filters, in `fold` and `toPredicate`, so the text keeps the shorthand. There is no plugin registry: field types, tokens on types and `expand` are the extension points, and schemas share fields by spreading them. Guarded by "stands for the conditions it expands to when the query filters", "stays in the text as written" and "filters nothing when it expands to nothing, and keeps its value for the app" in `extending.test.ts`.

### Types and schemas

- A date is an ISO string, a UTC day or a UTC instant, and `compare` returns 0 when two values overlap, so a day covers all of its hours for `=`, `>=` and `<` without a special case. Instants are normalized to UTC, and a year outside 0000 to 9999 is rejected, since `toISOString` would write it in a form the parser does not read. Guarded by "a day compares equal to every instant in it, in UTC" and "rejects %j" in `field-types.test.ts`, and the "%j keeps %j, a day covering all of its hours" table in `predicate.test.ts`.
- `@today` with a month or year offset stays within the target month, so a month before March 31 is February 28. Guarded by "@today with offset %j is %j, in UTC and within the month" in `field-types.test.ts`.
- `number` reads exponents because `String` writes large numbers as `1e+21`, and it rejects what is not finite. Guarded by "writes a value back so that it reads the same" in `field-types.test.ts`.
- A free word matches the start of a word in the schema's `text`, as GitHub Projects matches. Guarded by the "%j keeps %j" table in `predicate.test.ts`.
- `defineSchema` infers the item type from the `Record` half of the type of `fields` and each field's value type from its mapped half, and `get` returns `NoInfer`, so the field type alone sets the value type. `get` and `text` are method signatures, so a `Schema<Issue>` fits `Schema` and every function but `toPredicate` takes any schema. Guarded by "takes the item type from the functions that read items", "a field reads values of its own type" and "a schema of any item fits the functions that do not read items" in `schema.test-d.ts`.
- Field names are read as own properties and panel fields go through a `Map`, so `constructor` and `__proto__` are ordinary field names. Guarded by "a field reads only its own property, never one inherited from the prototype" in `predicate.test.ts` and "a field named after an Object member stays a field" in `flat.test.ts`.

### Panels and editors

- `toFlat` accepts several negated terms of one field as one list to exclude, since `-a -b` is `-a,b`. Guarded by "several negated terms of a field add up to one list to exclude" in `flat.test.ts` and "panel state survives the trip through a query and its text" in `properties.test.ts`.
- A key completion replaces the key with its colon, so inserting `label:` over `la|bel:bug` keeps one colon. Guarded by the `la|bel:bug` row of the "%j is %j" table in `completion.test.ts`.
