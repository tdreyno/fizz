---
"@tdreyno/fizz": minor
---

Add support for using action creators directly as computed handler keys in state definitions. This reduces duplication and ties the dispatch API directly to handler maps.

**New capability:**

```typescript
const save = action().withPayload<{ content: string }>()
const cancel = action("Cancel")

const Editing = state({
  [save]: (data, payload, { update }) => update({ ...data, content: payload.content }),
  [cancel]: () => Done(),
})
```

**Key improvements:**

- **Reduced duplication:** Handler keys now come from the action creator itself, not a separate string literal
- **Better refactoring:** Renaming an action variable automatically updates the handler key
- **Optional naming:** Action creators can be unnamed with `action()` and use auto-generated IDs, or named with `action("Name")` for debugging
- **Full backward compatibility:** String-keyed handlers remain fully supported and unchanged

**Breaking changes:** None. This is strictly additive; existing string-keyed handlers and named actions continue to work unchanged.

**Type safety:** Payload inference for creator-keyed handlers is fully preserved. TypeScript correctly infers handler payload types from the action creator.

**Debugging:** Debug labels from `action("Name")` are retained and available in logs and error messages. Unnamed actions use generated stable IDs.

Also update architecture.md, api.md, and examples.md to showcase the new creator-key syntax alongside traditional string keys for backward-compatibility reference.
