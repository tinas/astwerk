# astwerk

## 0.2.0

### Minor Changes

- [#2](https://github.com/tinas/astwerk/pull/2) [`1e04e96`](https://github.com/tinas/astwerk/commit/1e04e96ba1a07bbb0f33a4c9b1bac4584720096b) Thanks [@tinas](https://github.com/tinas)! - `toPredicate` treats an empty string as a value, as a backend's `IS NULL` does, so `no:field` no longer finds it and `has:field` does. A `get` that means no value returns `undefined`.

- [#2](https://github.com/tinas/astwerk/pull/2) [`1e04e96`](https://github.com/tinas/astwerk/commit/1e04e96ba1a07bbb0f33a4c9b1bac4584720096b) Thanks [@tinas](https://github.com/tinas)! - `getSuggestions` is synchronous and takes the values an app loads at runtime as `values`, which come after the field type's own values and tokens. A field type's `suggest` no longer returns a promise; the editor loads values itself, for the field that the new `fieldNameOf` names.

### Patch Changes

- [#2](https://github.com/tinas/astwerk/pull/2) [`1e04e96`](https://github.com/tinas/astwerk/commit/1e04e96ba1a07bbb0f33a4c9b1bac4584720096b) Thanks [@tinas](https://github.com/tinas)! - A field whose `get` is `undefined` reads the item's own property in `toPredicate`, as a field without `get` does, instead of reading no value.

## 0.1.0

### Minor Changes

- Initial release.
