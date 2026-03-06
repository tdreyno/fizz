# Preferences

- Use SonarQube to guide generated code changes.
- For each code change, run SonarQube locally against changed files and require a passing quality gate before finalizing.
- If changed-file Sonar scanning is unavailable, use touched-package scope as fallback.
- Prefer functional style (`map`/`filter`/`flatMap`/`reduce`) over imperative loops when readability and performance are comparable.
- Optimize for readability and simplicity first: clear names, focused helpers, straightforward control flow, minimal cleverness.
- Prettier checks may be skipped for files under `.github`.
- In repos using Changesets, generate a changeset only when package library code changes.
- Do not generate changesets for docs, CI, repo config, instructions, or other non-library-code-only changes.
