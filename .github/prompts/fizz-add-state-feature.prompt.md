---
description: "Implement or extend a Fizz state-machine feature in one package and include matching tests."
name: "Fizz: Add State Feature"
argument-hint: "Describe the feature and target package"
agent: "agent"
---

Implement the requested state-machine feature with minimal, package-scoped changes.

Requirements:

- Identify the target package (`@tdreyno/fizz` or `@tdreyno/fizz-react`).
- Follow existing TypeScript and runtime conventions in that package.
- Preserve backward compatibility unless the request explicitly allows breaking changes.
- Optimize generated code for human readability and simplicity.
- Prefer functional transforms (`map`, `filter`, `flatMap`, `reduce`) over imperative loops when readability and performance are comparable.
- Add or update tests under that package's `src/__tests__` directory.
- Run validation against generated changes before completion:
  - `npx prettier --check <changed-files>` (then `--write` and re-check if needed)
  - `npm run lint` in the touched package (scoped to changed files when possible)
  - `npm run test` in the touched package (or a targeted spec pattern)
  - run local SonarQube scans for changed files and require a passing quality gate (fallback: touched package if changed-files scope is unavailable)

Output format:

1. What changed
2. Files touched
3. Test updates
4. Validation commands executed and outcomes
5. Any follow-up risks
