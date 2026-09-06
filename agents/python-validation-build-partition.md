# Exact compatibility-harness build inputs

Six reviewed validation-only paths now preserve compiled artifact reuse:
`scripts/run-python-conformance.cjs`, `scripts/run-python-compat.cjs`, and
`tools/python-compat/{evidence,manifest,assertion-runner,output-baseline}.cjs`.
They remain part of the complete validation-workspace fingerprint.

Consumers are test runners, package-validation scripts, and regression tests.
The TypeScript configuration does not include these `.cjs` helpers; no
production JS/TS importer or explicit build-tool copy consumes them. Source
package archives include their current source bytes directly, rather than
reusing a compiled version. Qualification still needs its full workspace
identity, even when the compiler output is reusable.

The change is an exact-file allowlist, not a directory exclusion. Unknown
siblings and templates stay conservative. Explicit numerical production
source/tooling requirements still override the allowlist. Eleven synthetic
partition tests cover edits, additions, removal, archive/Git enumeration,
workspace changes, original receipt lineage, and output tampering. A real
build remains required to establish the new artifact-input partition.
