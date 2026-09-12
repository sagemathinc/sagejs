# PR263 plus PR252: compiler-only cold follow-up

On 2026-09-12, adding only PR252's arraylike tag-set change to the PR263
compiler reduced observed cold mpmath import latency by **7.98% and 6.35%**
in two opposite-order pairs. **Both unchanged 30-second gates timed out.**
These measurements do not close the package gate or qualify an integrated
product: PR252 was still unmerged in freshly fetched main `02a683d21`.

| Fixed launch | Import seconds | Process seconds | Outcome |
| --- | ---: | ---: | --- |
| PR263 gate | — | 30.076 | timeout |
| PR263+252 gate | — | 30.082 | timeout |
| PR263 phase 1 | 34.582 | 35.496 | checked |
| PR263+252 phase 1 | 31.823 | 32.701 | checked |
| PR263+252 phase 2 | 32.680 | 33.591 | checked |
| PR263 phase 2 | 34.896 | 35.773 | checked |

The fixed ABBA phase runs had a predeclared 90-second diagnostic cap; they
were not retries to erase the gate failures. Each launch used fresh processes,
home/cache directories and an empty precompiled module cache. All 87 mpmath
1.3.0 source hashes match the preceding wheel-qualified experiment. sqrt(2)
and zeta(2) results were asserted at 30-digit working precision; these numerical
phases remained approximately 4ms and 5ms, not the source of the import gain.

## Derivation and scope

- Baseline: frozen PR263 source `9ad99322e`, evidence head `ed9506f08`, compiler
  `3a4f8c162b35ba63b49be64853046a74d8f2e6abbe3a0877b711e1674f5d8f3b`.
- Candidate: copy that owned source/artifact tree, apply **only** PR252's
  `src/baselib/builtins.py` tag initializer and membership changes. The complete
  resulting file exactly matches PR252 head `7d015d0ce`; the other 711 Python
  sources and both source/generated self-build drivers remain byte-identical.
- Run `node bin/sagejs self --complete` only in the isolated copy. It converged
  in two passes, 93.119s and 84.525s under shared local load. Those durations
  are build diagnostics, **not benchmark evidence**. No full product build was
  performed. PR263's published artifact was not mutated.
- Candidate compiler SHA256:
  `2429c323c002b99b31a50525fb8130afb186d1d55b4515d2a34d2ee35f0b3a50`.
- Both compiler artifacts were built with Node26.8.1; execution used the exact
  reserved bench-1 Node26.7.0 binary, SHA256
  `ad19784f7e90ba789a099eccba77ede8dc90a778c424f1c10a70fed3ff903fdc`.
- Both remote trees used identical retained c4 runtime/resources. Recursive
  comparison found **only compiler.js different**. PR252's runtime change was
  therefore active inside the compiler, not inside the separately held package
  execution runtime. This is the causal boundary of the result.
- Both compiler versions retain PR248 and PR263's private import guards.
  No historical PR248 timing is substituted for a contemporary baseline.

Before timing, the PR252 old/source/shipped oracle passed 63 classifications
and observable tag effects, including foreign realms, spoofed/changing/throwing
tags and revoked proxies. PR263's live/missing-binding regression passed.
`compiler-arraylike-causal.cjs` additionally exercised the actual embedded old
and new compiler helpers, not merely separately compiled source snippets.

## Reproduce and inspect

The executed `run.cjs`, `phase.py`, `gate.py`, source delta, convergence log,
actual-compiler oracle, and provenance are retained here. Stage the separately
derived compiler artifacts in `baseline` and `candidate` next to the driver
with otherwise byte-identical runtime/resources. Its fixed hashes reject other
artifacts. Run on a newly reserved idle host with the exact Node executable;
do not reuse recorded cache directories or treat old reports as fresh runs.

Original raw `report.json` SHA256 without final newline:
`4f90fbfb41a3004fcfbbe8a56e455ac73913ad0885ff250aba9b18310545b298`.
The tracked record adds only one final newline through the patch mechanism;
removing that byte reproduces the original hash. The report preserves every
launch, failure and prelaunch process census. There was no additional profile
or retry in this campaign. bench-1 was explicitly released on completion.

Retained local candidate: `/tmp/sagejs-263-plus-252.VJ1GCw`.
Raw evidence: `/tmp/sagejs-263-plus-252-pair.q2ndoT` locally and
`/home/user/sagejs-263-plus-252-pair.q2ndoT` on bench-1.

This follow-up is evidence-only within the existing documentation claim.
Neither implementation source nor task metadata changed. Earlier full-build
receipts remain historical as already documented; this diagnostic compiler
artifact must not be described as a fully qualified release or product build.
