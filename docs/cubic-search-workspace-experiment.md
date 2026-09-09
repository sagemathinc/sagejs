# Borrowed cubic search workspace

Research checkpoint, 2026-09-09. This is a source-copy experiment, not a
production change, new mathematical regime, or new PARI win. PR #190 stays draft.

## Representation and equivalence

`CubicSearchWorkspace` borrows thirteen existing owners shared by adjacent and
expanded relation collection: the integer workspace, ideal order/transforms,
adjacent parameters, relations/elements, HNF scratch, and online-lattice scratch.
There is one construction before the first adjacent collection. All owners
already exist and remain in the same arena; no matrix is allocated or copied.

The same bundle passes through the two collectors to the existing ellipsoid
admission helper. The latter does not consume its order or adjacent-parameter
fields. It retains its explicit active-parameter argument: expanded search
uses `expanded_parameters`, not `adjacent_ellipsoid_parameters`. Modular packed
storage, output buffers, scalar bounds, and cursors remain explicit arguments.
This uses the existing compiler feature; no compiler capability was added.

The AST-based diagnostic transformer checks owner names, annotations, call
arity, and non-rebinding. It refuses reapplication and source drift rather than
guessing. An independent test expands the bundle back to explicit arguments and
requires the entire original mathematical AST, not only selected functions.
Negative tests reject changed owner bindings and missing helpers.

A second test lowers the complete original and bundled programs with the actual
native import resolver. It checks parameter types, locals, executable bodies,
dependencies, resource aliases, and return types across the entire call graph.
The only normalization is source provenance, borrowed parameter names/order,
and two parameters independently verified unused in the admission helper.
All arithmetic, branches, loops, owner allocations, and mutations agree.
This is stronger than the AST test alone, but is not a formal proof of the
backend, foreign libraries, or machine code.

## Source and resource measurements

Input is the [shared recovery candidate](cubic-recovery-sharing-experiment.md),
SHA-256 `8911164538c47b5c59a7a6d1d6e3d331574008ae2b0783c28976dd13caab4aa3`.
The measured bundled source SHA-256 is
`500321a9cdcfa3925443cda04f6c5417816bae3ff917a1a5d606ae92889346c8`.

| Artifact, bytes | Shared recovery | Search bundle |
| --- | ---: | ---: |
| Experimental Python | 442,026 | 439,998 |
| Python after pinned formatting | 442,563 | 440,041 |
| Raw generated core C | 15,964,693 | 16,037,496 |
| Core C with source path normalized | 11,430,113 | 11,436,231 |
| Linux x64 addon | 20,411,152 | 20,411,152 |
| ELF executable `.text` section | 17,691,232 | 17,691,232 |

Raw source shrinks 2,028 bytes; the pinned-format comparison saves 2,522 bytes.
The normalized C comparison replaces only the exact source filename with
`source.py`; longer flattened parameter names and signatures remain. Identical
binary/section lengths do not imply identical machine code: their hashes differ.
No peak-memory equivalence is inferred from these measurements.

Integrated production is 437,668 Python bytes and has only 713 bytes left in
its aggregate allowance. The experimental candidate therefore still needs
1,617 bytes removed, or **1,660 bytes after required formatting**. All source
and arena allowances remain unchanged. The first diagnostic bundled only the
two collectors and saved 960 bytes; the measured v2 also bundles admission.

## Correctness and controlled timings

Every observation and every output slot agrees with the shared-recovery
baseline on the frozen 1,012 development fields: 961 accepts, 51 declines,
zero exceptions. All accepted class numbers and invariants agree with the
corpus. No reserved unseen fields were run. This is not independent exact
replay or public receipt qualification of the experimental source.

The original thirteen compiler workspace tests pass, including borrowed-owner
identity, lifetime/escape rejection, exact vectors and FFI matrices, and small
executable-IR erasure witnesses. The new whole-source AST and whole-program
IR tests pass, as do recovery fault/differential tests, architecture, formatting,
and strict Python (382 modules, zero errors).

Two serialized runs on `opt` used the same source/module/addon hashes. Each
used CPU 0, 20 warmups, seven alternating rounds, 64 native calls per sample,
and 256 fresh PARI `bnfinit(f,0)` calls per sample. Native calls include the
existing 5/1/7/8 retry sequence with preallocated external scratch. The second
run reversed the module-load and initial measurement order.

| Polynomial | First run paired ratio | Reversed run paired ratio |
| --- | ---: | ---: |
| $x^3-x^2-7x+122$ | 0.9282 | 1.0107 |
| $x^3+27x-159$ | 0.9820 | 1.0012 |
| $x^3-x^2+56x+99$ | 0.9684 | 1.0068 |
| $x^3+146x-156$ | 0.9654 | 1.0026 |
| $x^3+9x-55$ | 0.9614 | 0.9943 |
| $x^3-x^2+3x-4$ | 0.9654 | 0.9893 |
| $x^3-x^2-11x-63$ | 0.9755 | 0.9924 |

Each entry is the median within-round candidate/baseline time ratio. The
apparent first-run gain does not reproduce under reversed order, so no speedup
is claimed. The reversed run has small mixed changes, including approximately
1% slower target timing. It does not prove strict performance non-regression.
Bundled target medians were 4.294 and 4.297 ms; first-run PARI was 1.535 ms.
Raw reports remain in `build/cubic-next-evidence/search-workspace-opt-timing.json`
and `search-workspace-opt-reverse.json`; survey and validation logs use the
same prefix. Source-size savings, not an arithmetic speedup, motivate this step.

Raw report SHA-256 identities, respectively survey, first timing, reversed timing:

```text
ed82588f93e91f448841488a42b6fab76ea7f898d0a4f0b273782407ae67e171
f7cd0c5105eade47ae7734cb640fbca68a906caafd050a58283740000e304886
64ef823eb31f67dc7e5f9daaf90879c66d4b5769955e5423ab318d49cbaa17d1
```

## Reproduction and next step

```sh
node bench/class-unit-groups/diagnose-cubic-search-workspace-build.cjs ROOT INPUT.py NEW_DIRECTORY
node --test test/cubic-search-workspace.cjs test/cubic-search-workspace-ir.cjs
node --test test/native-workspace-bundles.cjs
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs NEW_DIRECTORY/builds.json FROZEN_CORPUS.jsonl.gz
```

The initial bare `lowerSource` diagnostic omitted the native import resolver
and rejected an imported primality helper. The committed IR test uses the
same resolver setup as native compilation and compares the complete graph.
This was a diagnostic setup issue, not a new compiler obstruction.

Next remove the remaining duplicated coefficient/precision planning or other
shared orchestration, without changing correctness tests or resource budgets.
Then qualify the fully formatted combined candidate at the public boundary.
The inherited parallel gate still reports 395 live task records; full changed
branch regression, public replay, resource-envelope, holdout, and platform
qualification remain outstanding. The main runtime opportunity is still the
adjacent relation search, not this representation-only refactoring.
