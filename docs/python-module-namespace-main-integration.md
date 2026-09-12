# Live module namespace lookup: main integration

PR #241 source `649d880b4` is integrated with main
`ce40da9413dc635a990c174bf594be816ca6d54b` in the separate
`python-module-namespace-integration` worktree. The qualified original is
untouched. Main already includes prerequisites #231 and #239; it also includes
the type-slot resolver repair #242 and lane-policy #245.

Runtime source merged without conflict. Only the generated reference JSON and
HTML conflicted. The original PR241 HTML already contained marker text around
its body tag; the integration removes those markers, preserves main's page
content, and regenerates the catalog from the final integrated runtime instead
of choosing an old catalog. Contract metadata is finalized before the full
build; historical task runs are not qualification receipts for this integration.
The final frozen full build passed in 10m 52s, converging the compiler in two
passes. Receipt `2026-09-12T09:17:06.446Z` records artifact inputs
`665bdafa1de3d0a21508ec24617f2c33630312f2d3b861f4841cc2fb5c01bb21`
and baselib SHA-256
`e31f9f8f8d7e2f45fa3692aaa7d27bc9f19734979b70295c11a488ecd7fd3daa`.
Final sequential checks passed: 16 focused namespace/import/prepared-call tests;
210 portable files in 1m 51s; strict Python 393 modules with zero errors;
format/docstring checks for 864 files; regenerated-doc check and merge checks.
Core source is 900331/903000 bytes, without budget changes.

The generated catalog retains all 323 main API entries; docs/reference/api.md
is byte-identical to main and the HTML differs only in its reference-data hash.
All merge markers are removed. Read-only receipt inspection after generation
reports current artifact inputs and outputs. Contract metadata did not change
after the final source freeze. No additional build or wrapper-induced rebuild
was used for docs qualification. These results qualify the recorded main merge,
not any later main revision or the historical performance comparison below.

Preflight corrected the handoff claim from an unsupported `agents/` path to
the already permitted `docs/` directory; no lane policy was widened. An early
build launcher was stopped before qualification when that claim check failed.
The subsequent frozen build uses finalized contract metadata. While the main
merge is uncommitted, scope checking reports incoming main changes as unclaimed;
the final merged commit must be checked against the recorded main base.

## Historical controlled helper evidence

This evidence belongs to the historical PR231/241 pair, not the new main merge.
Both artifacts were built with Node 26.8.1 and executed on reserved idle bench-1
with Node 26.7.0, executable SHA-256
`ad19784f7e90ba789a099eccba77ede8dc90a778c424f1c10a70fed3ff903fdc`.
Baseline compiler SHA-256:
`30c9ebe92d845ec158b6046cc7ac2386ab8e01c860a903d00b0e08f393986d36`.
Candidate compiler SHA-256:
`dda8a827989489b89f7dbff51332776111746e8a5ed9d31cbd053acb065b9edb`.

Four fresh VM contexts ran A/B/B/A within **one process**, not independent
process repetitions. The probe exposed the actual built resolver without
replacing its implementation. Each context ran three warmups and seven measured
million-lookup samples, checking live mid-sample mutation, namespace precedence,
builtin fallback and Proxy read-once behavior. Compilation/startup was excluded.

| Context | Seven measured samples (ms) | Median (ms) |
|---|---|---:|
| Baseline A | 761.548, 759.190, 761.139, 761.037, 768.856, 760.135, 761.820 | 761.139 |
| Candidate B | 679.915, 680.036, 678.543, 679.148, 680.018, 678.038, 677.735 | 679.148 |
| Candidate B | 662.718, 661.292, 662.990, 663.531, 661.873, 661.711, 666.458 | 662.718 |
| Baseline A | 747.560, 748.986, 748.141, 748.877, 748.642, 748.826, 748.871 | 748.826 |

The paired reductions are 10.8% and 11.5%. This is cross-realm internal-helper
throughput, not a CPython-equivalent ABI, package benchmark or cold-import claim.
Report `verified` is true and artifacts stayed unchanged. Raw report/driver:
`/tmp/sagejs-namespace-pair.AJqtaz`, mirrored on bench-1 under `/home/user/`.
Report SHA-256:
`cb71e9f6fe0d8b8f1c00454e9f53cc34019f792ec8e59cbf79b4c2dfbe76913d`.

## Historical developer-cold mpmath result: gate remains failed

The same compiler pair and Node executable ran in separate fresh processes,
each with fresh writable caches and explicitly empty precompiled module caches.
All 87 vendored mpmath Python files matched the pinned 1.3.0 wheel. This was
vendored-source execution, not fresh installed-wheel or shipped-cache qualification.

Each unchanged 30-second gate-body probe timed out once: baseline 30.075s,
candidate 30.079s. Four predeclared **non-gating 90-second** phase diagnostics
then ran A/B/B/A:

| Runtime | Import (s) | Child total (s) |
|---|---:|---:|
| Baseline | 45.838 | 47.017 |
| Candidate | 45.488 | 46.675 |
| Candidate | 44.751 | 45.882 |
| Baseline | 45.767 | 46.936 |

All four sqrt/zeta checks passed, with operations around 4/5ms. The directional
0.8–2.2% import difference is not robust package-speed qualification; both cold
gates remain failed. No timeout or assertion was changed or retried to pass.
Six earlier launches failed provisioning because architecture-policy resources
were absent; they remain separately recorded and excluded from measurements.
Resources were supplied and a trivial loader preflight passed before the fixed
campaign. The host reservation was explicitly released.

Raw campaign: `/tmp/sagejs-mpmath-pair.2XMOsa`, mirrored on bench-1 under
`/home/user/`. Valid report SHA-256:
`e13c6ac2bdfa38976d39fe763e34cdae2dba247697f35d1b42ac16fe27161c4b`.
Invalid-provisioning report SHA-256:
`f33215a68fb10aa872ae173ee14a20c6b53d50ceee7d029cdc2794be8e4a0bd8`.

Public evidence: PR241 comments
[helper](https://github.com/sagemathinc/sagejs/pull/241#issuecomment-5644520600)
and [cold import](https://github.com/sagemathinc/sagejs/pull/241#issuecomment-5644568940).
No new controlled performance, complete compiler/integration-campaign, browser,
four-platform speed, or performance-cliff closure is claimed by this merge.
