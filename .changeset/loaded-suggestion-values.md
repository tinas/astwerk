---
'astwerk': minor
---

`getSuggestions` is synchronous and takes the values an app loads at runtime as `values`, which come after the field type's own values and tokens. A field type's `suggest` no longer returns a promise; the editor loads values itself, for the field that the new `fieldNameOf` names.
