---
'astwerk': patch
---

A field whose `get` is `undefined` reads the item's own property in `toPredicate`, as a field without `get` does, instead of reading no value.
