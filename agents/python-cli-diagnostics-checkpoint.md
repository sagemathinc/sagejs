# Concise Python CLI diagnostics

This slice follows PR #184. Compile-mode failures from the source launcher
and SEA entrypoint use one renderer. Python parser/execution boundaries attach
private diagnostic metadata; a public `pythonDiagnostic` property or an error
name alone is not trusted. Ordinary failures print the exception type/message,
with existing cause/context fields and suppression preserved. Unattached host
failures are labelled. Raw host stacks require `SAGEJS_DIAGNOSTIC_HOST_STACK=1`.

Generated JavaScript construction remains a host/compiler operation, separate
from actual execution. Manual SystemExit and legacy parser exits keep their
existing behavior. A filename supplied by the execution boundary is currently
a fallback in the shared normalizer, not immutable source provenance.

This is not full Python traceback support, implicit exception-context tracking,
or raise-from lowering. No inferred source frames are added. Frozen errors can
be wrapped by the existing attachment mechanism, so the optional host stack
can be the wrapper stack rather than the original thrown value's stack.

## Local validation

The 11 source/mock tests pass. Six real CLI subprocess tests also pass in a
temporary preflight that transpiles only the changed TypeScript modules into
memory while using the previously built runtime. That is useful diagnostic
evidence, not a matching full-build or SEA qualification receipt. Final tests
must run without that preload after the full build.

Final full build passed (10m 22s), followed by 98 focused tests including the
normal CLI integration tests without the preload. Architecture and routine
validation passed; routine took 1m 34s including startup (7s) and strict Python
checks. Generated evidence/docs were completed before final validation.

The 28 adopted upstream statuses are unchanged (13 pass, 15 required failures).
Pinned package workflows remain 8/11, with the seven selected upstream Tomli
tests passing. Pyparsing traceback-dependent parsing, idna warning stderr and
mpmath timeout remain unqualified; concise stderr is not semantic remediation.

No core runtime source or size ceiling changes. SEA control flow is covered
by mocks only; no packaged/four-platform qualification claimed.
