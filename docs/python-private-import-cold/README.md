# Private compiler import reads: cold comparison

On 2026-09-12, PR263's private compiler option reduced measured cold mpmath
import time by **16.8% and 17.3%** in the two opposite-order comparisons.
Both unchanged **30-second gates timed out**. This is useful progress, not
closure of the cold-package gate, a CPython ratio, or whole-product qualification.

| Fixed launch | Import seconds | Process seconds | Outcome |
| --- | ---: | ---: | --- |
| Control gate | — | 30.075 | timeout |
| Candidate gate | — | 30.074 | timeout |
| Control phase 1 | 41.485 | 42.406 | checked |
| Candidate phase 1 | 34.502 | 35.403 | checked |
| Candidate phase 2 | 34.593 | 35.490 | checked |
| Control phase 2 | 41.808 | 42.738 | checked |

The four phase runs were declared in advance as non-gating 90-second
diagnostics, not retries to turn failed gates green. Each used a fresh process,
home and cache, an explicitly empty precompiled module cache, identical 87
mpmath 1.3.0 Python sources, and checked sqrt(2) and zeta(2) output at 30-digit
precision. The numerical phases remained approximately 4ms and 5ms respectively;
the gain was in cold import. No shipped/precompiled-cache latency is claimed.

## Exact causal boundary

- Candidate source: `9ad99322e`, including PR248's AST predicate prerequisite.
- Control: identical 712 Python source files, but isolated `tools/self.js`
  and its generated driver disable `private_compiler_import_reads`. The compiled
  driver's final newline additionally differs after its source-map comment.
  Both compiler bootstraps converged; no other semantic source change exists.
- Candidate compiler SHA256:
  `3a4f8c162b35ba63b49be64853046a74d8f2e6abbe3a0877b711e1674f5d8f3b`.
- Control compiler SHA256:
  `9b5a78c2e5b024f0caee7ccb02f591255a7b36cf9c2cda5c288b4c5014058d12`.
- Both compiled using Node26.8.1. Execution used Node26.7.0 at
  `/home/user/bin/node` on reserved idle bench-1, SHA256
  `ad19784f7e90ba789a099eccba77ede8dc90a778c424f1c10a70fed3ff903fdc`.
- Remote baseline/candidate trees used the same retained c4 runtime/resources;
  recursive comparison found **only compiler.js different**. This is a causal
  compiler-only experiment, not a comparison of two full product builds.
- All 87 package source hashes were compared with earlier wheel-qualified
  evidence. Their hashes and prelaunch process census are in `report.json`.
- No PR252 optimization is included. Earlier PR248 timing numbers are not
  substituted for this same-source control.

The candidate frozen full build passed, followed by 68 focused/CST checks,
211 portable files, 393 strict modules with zero errors, four pinned package
workflows (packaging, attrs, tomli, sortedcontainers), direct docs check and
parallel check. Control functional tests passed with only the actual compiled
artifact's expected guard presence inverted; semantic tests remained identical.
Its first test launch lacked copied `index.cjs` and failed provisioning; the
subsequent completed check is separate, not an erased runtime failure.

`provenance.json` binds the source list, build receipt and control diagnostics.
The subsequent evidence/claim-only commit changes coordination metadata, so
the original full-build receipt is historical rather than a claim that the
combined evidence head was rebuilt. Source/runtime/compiler hashes remain
unchanged; combined-head qualification belongs to CI. No release was published.

## Reproduction and raw records

`run.cjs`, `gate.py` and `phase.py` are the executed driver and inputs. Stage
the independently converged compilers with identical runtime/resources into
`baseline` and `candidate` under a new directory containing the driver. Its
hardcoded artifact and Node checks intentionally reject other experiments.
Run with the exact Node executable on an explicitly coordinated idle host.
Do not reuse the recorded cache directories or mistake old reports for a run.

Original raw `report.json` SHA256 (no final newline):
`43840ead7be57a7cea26824e98e5bf8cdef5cc762f30c4eaac2f8abb5cee77dc`.
The tracked record has only a final newline added by the patch mechanism;
removing that one byte reproduces the original hash.

Original experiment retained at local
`/tmp/sagejs-private-import-pair.ZHg9JP` and bench-1
`/home/user/sagejs-private-import-pair.ZHg9JP`. The host was released after
the paired experiment and the separate profile, with no background workload.

## Separate CPU diagnostic, not a timing sample

After the six fixed launches, `profile.cjs` ran one fresh-cache candidate
phase under Node's CPU profiler, capped at 90 seconds. It completed checked
outputs. This was **not** included in timings, and was not a gate retry.
The raw 36MB profile is retained at the experiment paths above as
`candidate.cpuprofile`, SHA256
`52a00f873eaad0aacd4dc21436e5d01c0bdf37b7e7ede8e4d0e5af5f22980370`.
The compact `profile-report.json` records launch and completion evidence.

Aggregating sample deltas by function, URL and source line, and counting a
function only once per sample's ancestor chain, yielded 36.796 sampled seconds:

| Function | Self seconds | Inclusive seconds |
| --- | ---: | ---: |
| semantic.js descend | 1.755 | 1.990 |
| optimizer/pass-manager.js visit | 1.674 | 1.952 |
| compiler method_print | 1.460 | 5.300 |
| compiler arraylike | 1.101 | 3.947 |
| compiler len | 0.854 | 4.852 |
| compiler dict | 0.830 | 6.121 |
| runtime legacy keyword binder | 0.001 | 0.656 |
| compiler max | 0.003 | 0.004 |

Inclusive times overlap and must not be summed. This profile does not support
legacy binder `max` as a large cold-import bottleneck here. Shared sequence
classification/allocation and compiler traversal remain plausible next targets;
only another controlled candidate comparison can establish an improvement.
