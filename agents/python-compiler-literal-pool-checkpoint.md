# Pool numeric literals in the self-hosted compiler

This small slice follows PR #185. The compiler implementation now uses the
existing per-module numeric-literal pool when building itself. Its sources do
not shadow the literal constructors. Baselib compilation and public output
defaults are unchanged. Stage zero probes the options and retains its existing
fallback. The probe uses a copy because OutputStream fills defaults into its
input object; copying those defaults back would overwrite bootstrap settings.

## Diagnosis and limits

The pinned mpmath 1.3.0 workflow still exceeds the unchanged 30-second gate.
A separate bounded diagnostic, using the same pristine wheel and fresh writable
cache, establishes that compilation/import dominates; sqrt and zeta then return
the expected values in milliseconds. A populated-cache import on the preceding
candidate took about 0.52 seconds. This is not a warm-throughput comparison.

On this Linux x64 development host with Node 26.8.1, the earlier cache-empty
CPU-profiled import took about 57 seconds. The final rebuilt pooling candidate
took 48.34 seconds (49.58 seconds including launch/profile shutdown). Repeated
integer-literal parsing, previously about 8.15 seconds of sampled self time,
is no longer among the major entries. Module-name resolution remains a major
cost, at about 6.60 seconds of sampled self time.

These single-run profiles are diagnostic evidence, not seven-sample paired
benchmarks, independent confirmation, CPython performance parity, or closure
of the import cliff. No package timeout or performance policy was relaxed.

## Validation

- Full build passed in 8m 23s; self-hosting converged in two passes.
- 78 focused tests passed, including pooling, exact integer/floating literals,
  nested scopes, CST lowering, lazy class annotations, and CLI diagnostics.
- The broader compiler suite passed all 21 enabled fixtures; 28 historical
  stage-zero/disabled fixtures retain their pre-existing exclusions.
- Architecture and routine validation passed. Routine took 1m 32s, including
  strict Python and the unchanged startup gate (7s).
- The 28 adopted upstream outcomes are unchanged: 13 pass, 15 required failures.
- Pinned package workflows remain 8/11; seven selected upstream Tomli tests
  pass. Pyparsing, idna stderr, and mpmath timeout remain unqualified.
- Compiler output grew from 4,137,277 to 4,140,387 bytes (+3,110). No core-runtime
  source, native dependency, startup budget, or size ceiling was changed.

No four-platform or packaged/browser qualification is claimed for this slice.
The persistent hosts remain reserved for the independent release lane.
