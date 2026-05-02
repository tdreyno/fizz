# Size Reports

This folder stores bundle-size impact measurements for `@tdreyno/fizz` integration scenarios.

## Commands

- `npm run size:report`
  - Builds `@tdreyno/fizz`
  - Bundles fixture scenarios
  - Writes:
    - `size-reports/latest.md` (human-readable markdown report)

## Report Shape

The markdown report includes:

1. Scenario summary (minified + gzipped bytes)
2. Largest gzip scenarios
3. Per-scenario top output contributors

## Notes

- `size-reports/latest.md` and `size-reports/generated/` are intentionally gitignored.
