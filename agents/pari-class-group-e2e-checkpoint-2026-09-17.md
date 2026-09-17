# PARI class-group end-to-end checkpoint — 2026-09-17

This checkpoint records the honest state of
`pari-class-group-end-to-end-native-plan.md` after integration of the first
complete prepared real-cubic H1 root and the native diagnostic stage clock.
It is not a qualification result and does not weaken any plan gate.

## Current result

One prepared totally real cubic,
`x^3 - 20018*x + 20034`, now has a genuinely connected internal result:

- live relation collection and HNF state;
- exact H1 class correspondence;
- precision-retrying fundamental-unit reconstruction;
- exact unit norms, regulator, torsion, and final atomic publication;
- an independent cold-replay boundary;
- `correspondence_complete = true` and `public_complete = false`.

The last distinction is essential. PARI agreement and its assumed analytic
policy do not constitute Sage.js completion or certification.

The newer seven-pair development-host diagnostic has 14 samples per
implementation and median complete-root times of `942.830 ms` for Sage.js and
`11.488 ms` for PARI 2.17.4, an `82.07x` ratio. It is explicitly unqualified.
Its raw receipt has SHA-256
`45f778c300a0a51a6b3a039693d1a3b9a423afe9c5e4e7bde8f2a8eab1e1306f`
and records clean commit `68a90847708e2fe49ac9b07c13e51d5c53b31969`.
Both implementations now have real exclusive source-local duration partitions,
but their source cuts are not proved to be identical and therefore must not be
compared stage by stage. Within the Sage.js root, the median partitions are
`626.123 ms` for unit/regulator, `251.142 ms` for relation/retry, `64.037 ms`
for sparse HNF/SNF, `0.100 ms` for honesty/final, and `0.011 ms` unattributed.

A read-only allocator-count profile localizes a concrete compiler/runtime
frontier. The unit/regulator visits perform about 2.09 million `malloc` and
2.26 million `realloc` calls; relation/retry performs about 1.35 million and
0.54 million; sparse HNF/SNF performs about 0.67 million and 0.30 million. The
generated root is one native call, so the public JavaScript/native boundary is
not a plausible explanation. The first permitted compiler campaign will test
root-lifetime `fmpz` scratch/limb reuse; it must reduce allocation events by at
least 80% and target-stage time by at least 2x without changing any authority.

The honest predeclared campaign outcome at this checkpoint is therefore **D**.
The correctness prerequisite for Outcome C exists, but the required 80% gap
attribution does not.

## Phase coverage

| Phase | State | Closed evidence | Remaining gate |
| --- | --- | --- | --- |
| 0 — canonical spine | Partial | Required compiler and port histories are ancestors; pinned PARI 2.17.4 replay driver exists; architecture gate passes at `ba140b214`. | Publish a fresh durable full Phase-0 receipt at the combined commit and record the toolchain/resource ledger. |
| 1 — observability and ladder | Partial | Four-plus-twelve identities and the 24-field qualification population are frozen; all 16 development PARI traces are exported and hashed. | Natural random-relation, successful honesty, and precision coverage are absent from the performance population; Sage.js does not execute all 16 end to end. |
| 2 — relation/retry | Partial | Exact cubic collection, quartic repeated nonempty-`W` HNF appends, and isolated random-relation corridors exist. | Generic capacity growth, factor-base enlargement, natural random fallback, and all-sentinel closure remain. |
| 3 — exact envelope | Partial | H1 full Smith replay and field-3 `[2,2]` relation/Smith state exist. The field-3 live process retains and independently cold-replays all 186,560 exact cells. All 301 principal relations now replay exactly against the 288 retained factor-base ideals. A bounded canonical-HNF route proves rank 288, invariant factors `[2,2]`, order 4, exact suffix alignment, and an arbitrary-ideal receipt with an independently checked principal quotient. | Retain and replay the missing 301-by-13 raw-relation-to-accepted-unit transform, join the exact leaves into one transactional result, and close the 12-field envelope. |
| 4 — units/precision | Partial | The real H1 cubic performs exact source-derived units and retries from 192 to 2304 bits. The authentic mixed-quartic class logs pass packed `cleanarch` across CPython, JavaScript, GMP, tagged, and pristine PARI. Neutral 153088-bit packed Python/GMP probes now match pristine PARI exactly for pi, log(2), exp(log(2)), and exp(log(2)+i), including transactional storage/precision rejection, below 1.25 GiB peak RSS. | The mixed-quartic `getfu` path still returns PRECI at 192 bits. Rebuilding its precision-dependent embeddings, all retained relation logs, regulator, and unit solve at high precision remains open; the neutral probe is feasibility evidence, not field-specific closure. |
| 5 — honesty/final | Partial | One atomic H1 internal final result and mutation/replay contract exist. A field-neutral immutable correspondence envelope now provides canonical encoding, independent mathematical authority, tagged exact/PRECI/LARGE unit outcomes, honesty outcomes, atomic publication, and 15 adversarial mutations. A separate predeclared unequal-bound degree-five path authentically executes the successful six-ideal `be_honest` schedule with transactional rejection. | The envelope deliberately has no H1 adapter until Python replay has a trusted data-only cross-runtime identity. The H1 class group is trivial and its honesty path is an equal-bound skip. Nontrivial generator witnesses, mixed units, and a joined general final replay remain. |
| 6 — qualification | Partial | A real mutually exclusive seven-pair matched diagnostic conserves each root and leaves only `0.011 ms` median unattributed in Sage.js. | Source stage cuts are not cross-implementation-identical, the 80% cross-source gap attribution gate remains unmet, and the frozen 24-field qualification has not run. |

## Next falsifiable cuts

1. Retain the bounded 301-by-13 `hnfspec`/`hnfadd` ancestry transform in the
   same live field-3 run and prove both `relationRecords * T == 0` and
   `packedRelationLogs * T == terminalAcceptedA`. The direct generic
   301-row transform exceeded 7 GiB and is excluded from this campaign.
2. Join the exact field-3 class presentation, compact units, torsion, and
   tagged `PRECI/not_given` outcome in the immutable transactional result
   envelope without manufacturing exact expanded units.
3. Connect the live nontrivial mixed quartic
   `x^4 - 2000022*x - 2000042` through its existing signed `genback`, Smith,
   mixed `nf_cxlog`/`getfu`, class-generator, `cleanarch`, and final replay
   leaves. Its authenticated live endpoint has 288 factor-base rows, 301
   relations, `H = diag(2,2)`, and class invariants `[2,2]`.
4. Use the now-qualified neutral 153088-bit packed primitive corridor to
   regenerate the field's precision-dependent embeddings and logs from exact
   owners, then rerun `cleanarch`/`getfu` without answer-derived
   transformations. The successful neutral real and complex probes do not by
   themselves close this field-specific cut.
5. Preserve the full relation/HNF provenance and exact generator-order
   witnesses. A compact identity witness or a rebuilt final-answer fixture is
   not a valid substitute. After those cuts, reassess the next development field from the frozen
   ladder. Do not broaden by selecting easier fields.

The bounded full-presentation checker at integration commit `e635ce176` used
2,637,224 KiB peak aggregate RSS. It reduced the 301-by-288 source lattice to
288 canonical HNF rows with 555 nonzero entries, then verified the presentation
invariants and order. The generic source-transform route is not an alternative:
it exceeded the four-GiB campaign ceiling before reaching a result.

## Resource state

Rebuildable caches and inactive generated worktree products were cleaned before
this checkpoint. Active integration and lane artifacts were preserved. Bulky
corpus and replay artifacts remain under project-scoped `/scratch` storage.
