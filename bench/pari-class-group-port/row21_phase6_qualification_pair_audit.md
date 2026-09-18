# Row 21 symmetric prepared-adapter audit

Date: 2026-09-18

## Scope and deliberately narrow common claim

This is a row-specific, unqualified parity experiment over development row 21.
It does not enable the Phase-6 registry, execute a qualification campaign,
approve a timing host, or open a reserve field.

The common projection proves equality only of the **exact abstract group
structure**:

- field `5.3.1009349859375.3`, defined by
  `x^5 - 90*x^3 - 305*x^2 + 930*x + 36`;
- trivial class group, hence class number one and zero generators;
- free-unit rank three and torsion order two; and
- a nonzero regulator on each side.

It does not claim that PARI and Sage.js select equal fundamental-unit bases or
equal numerical regulator representations. The projection says
`regulatorEvidence: nonzero-only-not-equal-value` explicitly. Consequently this
is not called an exact class-and-unit-value projection.

## Sage.js exact evidence and replay

The Sage.js arm uses `row21_phase6_final_result.cjs`, not a projection directly
over unchecked aggregate buffers. `computeCandidate()` clocks exactly one call
to the complete prepared aggregate. After that clock, the adapter inspects the
capability-backed payload and invokes `replayCandidatePayload()`.

That committed replay independently verifies the exact trivial-class HNF
witness, each of the three nonzero exact units and its exact inverse and norm,
the real signs, the unit change-of-basis determinant, terminal states, and the
nonzero accepted packed regulator. The pair receipt retains hashes of the exact
unit coordinates, inverses, regulator owner, payload, and mathematical replay
authority. All-zero unit or inverse owners are rejected before projection.

The common replay record is derived from that detached capability replay. It is
not a clone of the output projection and has a distinct schema and digest.

## Pristine PARI evidence and clock

The PARI arm authenticates the pinned pristine PARI 2.17.4 archive,
`buch2.c`, and private shared library. Every `runFresh()` starts a new helper.
The helper completes `nfinit0` before `READY`, restores the prepared PARI stack,
sets seed 1, and clocks exactly `bnfinit0(nf, 0, NULL, nbits2prec(192))`.

After emitting the output projection, a separate C path re-reads the `bnf`
objects, independently multiplies the returned invariant factors and checks
that product against a newly read class number. It independently derives the
unit rank from the retained number field, checks the stored fundamental-unit
log-column count, and checks the regulator is nonzero. This path directly emits
the common replay record; JavaScript neither copies projection fields nor
constructs replay from a shared evidence object. Mutation tests independently
reject changes to projection, replay, and call counts. Result inspection, RNG
capture, and serialization remain outside the clock.

## Work, resources, CPU, and RNG

There is no shared constant work record. Sage.js derives its counters from the
live capability-backed payload and obtains `mathematicalCalls` from
`nativeCallsInsideClock`. PARI derives its counters from its independently
checked `bnf` replay and reports a `bnfinit0CallCount` incremented immediately
around the timed call in C. JavaScript does not inject a literal call count. The
execution core requires the derived counter digests to agree.

Sage.js executes synchronously on the worker thread, so its thread-CPU value is
meaningful. PARI runs in a child process. Its protocol thread-CPU value is
`null`, with provenance `{available:false, reason:"subprocess-not-observed"}`;
the former parent Node control-thread measurement and zero sentinel were both
removed. The execution core permits unavailable CPU only for diagnostic tier,
rejects mixed availability across repetitions, and still requires canonical
integer CPU measurements for `flag-zero` and `compact-flag-one`. Only PARI's
kernel wall clock is used diagnostically.

The translated row-21 graph has no RNG owner and performs no RNG call. The
common protocol records the exact matched seed and explicitly sets
`terminalStateMaterialized: false`; it does not pretend Sage.js materialized
PARI's private 66-word state. The checker separately requires full terminal-RNG
digests from two independently started pristine PARI helpers to agree.

## Provenance and receipt authentication

The receipt binds SHA-256 authorities for the checker, fresh normalizer, Sage
adapter, PARI adapter and C helper, qualification execution core, aggregate
composer, generated aggregate, and exact final-result implementation. The Sage
observations additionally bind the prepared-input authority, native cache key,
generated core, and native addon hashes. A receipt-authority digest covers the
canonical entire report, excluding only the self-hash field. Thus calls, CPU,
every replay, both Sage unit observations, notes, clocks, resources, and all
provenance are authenticated. The checker rereads the written receipt and
authenticates it against the live reviewed files. Focused mutations of the
second Sage unit observation, PARI call count, CPU, replay, and note are all
rejected.

## Repeated-fresh protocol and validation

Two Sage.js complete owner resets and two independently prepared PARI processes
must reproduce stable output, independently derived replay, RNG-scope, and
observed-work digests. All four cross-arm digests must agree. The output and
replay digests must differ. The smoke remains bounded by the four-GiB and
600-second gates, and its clocks are development-host diagnostics only.

The focused Node test checks all-zero-unit rejection, detached replay identity,
independent PARI replay, observed counters, unavailable PARI CPU, source and
receipt authorities, clock placement, and closed qualification/reserve gates.
The C helper compiles warning-free against the pinned PARI headers.

The earlier v1 and v2 diagnostic receipts were superseded because their replay,
call-count, CPU, or receipt-authentication claims were too broad. The v3 receipt
was mathematically and evidentially successful, but review subsequently found
three trailing spaces in its then-untracked C helper. They were removed without
changing program tokens. The corrected source passed C, JavaScript, focused,
execution-core, and explicit untracked-file whitespace checks before the final
v4-path smoke was launched.

## Final v4-path diagnostic receipt

Exactly one final bounded v4-path smoke was run after the whitespace-clean
source freeze and scheduling approval. It exited successfully with empty
standard error and wrote:

- receipt: `/scratch/row21-phase6-unqualified-fresh-protocol-v4-20260918.json`;
- receipt SHA-256:
  `c36efb71e52c69e11f36deace836684a86e6aaec7596e9b0ada4916dcfa91d34`;
- receipt-authority SHA-256:
  `23cdb5eb51b3dd6d21527eefc4f002f73ef58fcaabe353c43c14841eb85394a3`;
- captured-standard-output SHA-256:
  `a2221b1c974e63adf2f8b0eb5e0b56091167b08bb16d76526fbb183d5641dce1`;
- standard-error SHA-256, the empty-file digest:
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

The receipt retains the v3 internal protocol schema because the whitespace-only
fix did not alter protocol semantics; “v4-path” distinguishes this final
receipt attempt and its corrected source authority. The two Sage.js repetitions
totaled `8,671,782,465` wall nanoseconds and `9,274,581,000` thread-CPU
nanoseconds, with peak RSS `1,699,424` KiB. The two PARI repetitions totaled
`11,712,186` kernel wall nanoseconds, with peak RSS `681,840` KiB; PARI thread
CPU is honestly unavailable. Each Sage observation
reported exactly one native call inside the clock, and each PARI observation
reported exactly one observed `bnfinit0` call. Exact symmetric group-structure
projection and independent replay parity passed. `qualifiedTiming` remains
false: these measurements are protocol diagnostics, not competitive timing
claims.
