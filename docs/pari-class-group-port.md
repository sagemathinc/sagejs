# Faithful PARI class-group language experiment

Status: initial audit/prototype checkpoint; native port blocked on an existing
compiler lane's ownership. No class-group or performance result is claimed.

This executes `agents/pari-class-group-language-experiment.md` with the user's
explicit override to **PARI 2.17.4**. The old release identifiers in that plan
are historical and do not govern this experiment. Mathematical choices remain
**upstream-assumed**; this work changes no production default or proof state.

## Reproducible source identity

- Sage.js base: `938ccd425f0a322bafb1375968d5e24b38d5cde5`.
- Official archive: <https://pari.math.u-bordeaux.fr/pub/pari/unix/pari-2.17.4.tar.gz>.
- Archive SHA-256: `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
- `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
- Source archive downloaded and both hashes checked on 2026-09-13.
- Upstream attribution: PARI group, `buch2.c` copyright 2000, GPL version 2
  or later. Translated files must retain that attribution and license notice.

## Resource ledger

Execution began at approximately 2026-09-13 21:32 UTC. Limits remain 16 aggregate
active-agent hours, six aggregate execution CPU-hours, 256 MiB archived evidence,
600 seconds and 4 GiB per field. At most two agents run concurrently. The panel
agent performs selection only. Builds are local, not on the M0 timing host;
no reservation or action on `opt` is authorized by this experiment.

This initial checkpoint used approximately 11 root active minutes plus 12 panel
agent minutes, well below either audit/selection timebox. No benchmark CPU
budget was spent; checks and the single PARI smoke were small diagnostic runs.
Compilation is excluded from the execution CPU budget, not from active time.

## Initial full-path dependency frontier

All source locations below refer to the pinned `src/basemath/buch2.c`.
These are audit findings, not claims of translated coverage.

| Entry / stage | Source | State and dependencies to preserve |
| --- | --- | --- |
| Public dispatch | `bnfinit0`, 3468; `Buchall_param`, 3729 | Prepared `nf`, requested flag/precision; flag zero still requires unit work. |
| Bounds and analytic estimate | `Buchall_param`, 3772–3841 | Roots of unity, automorphisms, cached prime decomposition, `GRHchk`, inverse residue and precision. |
| Factor base / retries | `FBgen`, `subFBgen`, driver `START` | Ordered prime ideals, permutations, subfactor bases, saved relations, changing bounds. |
| Small relations | `small_norm`, 2574; `Fincke_Pohst_ideal`, 2448 | Ideal products; rounded-embedding integer LLL; arbitrary-precision QR; binary64 enumeration; norm rounding; prime-ideal valuations; relation admission. |
| Random relations | `get_random_ideal`, 2631; `rnd_rel` | PARI RNG draw schedule, subfactor-base products and reductions; same relation cache. |
| Coupled linear algebra | driver, 3994 onward | `hnfspec_i` / `hnfadd_i`, exact relation matrices, floating embeddings and transformation history. |
| Regulator / stopping | driver, 4090 onward | `compute_multiple_of_R`, `compute_R`, precision restart and new relations, optional `be_honest`. |
| Final output | driver, 4140 onward | Unit lattice reduction, `getfu`, archimedean cleanup, `class_group_gen`, complete `buchall_end` state. |

The existing exact cubic certification program is not a faithful replacement
for this path: it uses different norm, analytic, and termination policies.
Likewise, replacing PARI's rounded embedding norm in `factorgen` by an exact
determinant would change the work and possibly relation acceptance. Such a
replacement cannot silently be called language-only overhead.

The candidate first connected segment is small-ideal relation discovery,
including enumeration and admission, with any unavailable preparation or
valuation dependencies explicitly separated. Its exact entry/exit boundary
and measured cost still need to be established; an enumeration helper alone
does not fulfill the substantial-segment checkpoint.

## Concrete compiler obstruction and ownership boundary

`bench/pari-class-group-port/mixed_buffer_probe.py` reduces the failure to a
single floating-buffer comparison followed by a signed-buffer read. Calling
`lowerSource` on current base produces:

```text
native indexing currently requires a local constant sequence
```

`tools/native-kernel/float64-ir.cjs:isFloat64Signature` admits only a Float64
return and Float64/uint64/Float64Buffer parameters. A signature containing
Int64Buffer is routed to `lowerIntegerFunction`, which does not lower this
Float64Buffer indexing. The same error occurs on the actual enumeration
prototype. This is a demonstrated language capability gap, not a speed result.

The existing worktree `/home/user/sagejs-worktrees/mixed-exact-float-sidecar`
has an **active native-compiler contract and uncommitted edits** to exactly
these lowering/backends/runtime files. Its recorded architecture/native gates
fail. We inspected that state read-only; none of its edits were copied, changed,
committed or assumed correct. Taking over that prerequisite requires an explicit
ownership decision. Creating another overlapping compiler implementation would
violate the parallel-development contract.

Encoding integer state as doubles is not adopted as a workaround: it changes
the admitted integer range and still leaves conversion/helper-call dependencies.
Calling the interpreter inside the native search is prohibited. Replacing the
search by the existing certified cubic algorithm changes the experiment.

## Current executable evidence

- Unmodified official PARI source builds locally with GCC 15.2.0, GMP 6.3.0,
  single-thread engine, `-O3 -Wall -fno-strict-aliasing`, no readline or graphics.
- `gp -fq` reports `[2,17,4]`; `bnfinit(nfinit(x^3-3*x+1),0)` returns class
  number 1 and empty invariant factors. This is a smoke test, not timing evidence.
- Local comparator `gp-dyn` SHA-256:
  `5ccd82c860757ecdfaa26c3bd75fbba1a5d17d580388e2ed9a993c67a1b1891e`;
  linked `libpari-gmp.so.2.17.4` SHA-256:
  `e0c227a09f01827f58917f2c8f48947792876ef5234e48920a558b17110e4ab6`.
- `bench/pari-class-group-port/enumeration.py` is an attributed ordinary-Python
  translation of `step` and the inner enumeration block only. It retains the
  one-million trial limit and upstream ordering; an explicit resumable boundary
  replaces the outer candidate processing. This is scaffolding, **not** a
  completed expensive connected segment.
- `node test/pari-class-group-port.cjs` checks 24 CPython lattice enumerations
  against exhaustive finite sets (184 vectors) and reproduces both compiler
  failures. These tests do not establish agreement with a PARI execution trace,
  JS/native correctness, class invariants or regulator correctness.
- The frozen 24-field development panel meets all requested historical strata;
  see `bench/pari-class-group-port/panel-notes.md`. It is not a new baseline.
- Root build passes in 7m21s, with absent optional native adapters/production
  pack and unprepared numerical Wasm reactors explicitly skipped. Formatting,
  parallel scope and architecture gates pass; strict Python passes 403 existing
  modules. The new bench prototype is not a migrated production module.
- `pnpm test:changed -- --base 938ccd425` passes merge invariants, then stops
  in `test/algebraic-geometry.cjs` because the optional generated
  `sagejs_flint.node` addon is absent. Remaining selected docs/CLI tests were
  not reached. Full native qualification has not run; the lowering failure
  itself must be resolved first. These limitations keep the PR draft.

There have been no paired measurements, no generated core for this prototype,
and no experiment claim against the 2x target. Dependencies such as rounded
archimedean norm, prime-ideal valuations, rank admission and unit recovery remain
untranslated. The next investment is to finish/integrate the mixed-buffer
compiler prerequisite, then resume the connected small-relation path; this
checkpoint is explicitly inconclusive about whole-engine parity.
