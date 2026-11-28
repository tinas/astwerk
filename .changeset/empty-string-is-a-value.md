---
'astwerk': minor
---

`toPredicate` treats an empty string as a value, as a backend's `IS NULL` does, so `no:field` no longer finds it and `has:field` does. A `get` that means no value returns `undefined`.
