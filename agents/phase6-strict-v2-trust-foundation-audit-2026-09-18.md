# Phase 6 strict-v2 trust-foundation audit (2026-09-18)

This note records the contract implemented by
`bench/pari-class-group-port/phase6_prepared_adapter_registry.cjs`. It does not
admit a field. `TRUSTED_V2_ADMISSIONS` remains an immutable empty array, so
qualification execution and reserve opening remain disabled.

## Trust authority

The committed `TRUSTED_V2_ADMISSIONS` array is the sole production trust root.
Registration construction consumes its entries centrally. Panel indices must be
unique in both the field inventory and trust root, a trust entry must name an
inventoried row, and every entry must be consumed exactly once. The runtime
factory accepts only the exact registration and capability objects created by
that wiring. A registrant, verifier return value, environment variable, or
factory caller cannot inject an admission capability.

Trust is additionally limited to `DISPATCHABLE_PANEL_INDICES`, the centrally
reviewed set for which the generic wrapper has both Sage.js and PARI arms. The
set itself must contain unique inventoried rows. Row 19 remains useful
diagnostic inventory, but cannot be trusted until its missing wrapper dispatch
is implemented and the central dispatch set is deliberately updated.

The exported audit-only shape and index checkers cannot update the trust root or
create a runtime registration. They exist so the rejection and positive-shape
contracts can be tested while the production root is empty.

## Three deliberately separate contracts

1. `expectedDiagnosticProjection` and `diagnosticProjectionSchema` describe the
   existing development adapter's narrow diagnostic view. They do not imply a
   matched result or timing eligibility.
2. `sageCorrectness` authenticates the untimed, full Sage.js evidence bundle and
   its independent verifier. That evidence must cover class-generator ideals,
   orders and exact principal witnesses, units and log-lattice/regulator replay,
   torsion, terminal/precision/retry state, all mutation families, and source
   provenance. Its verifier also authenticates the digest of the lean semantic
   projection used by the timed arms.
3. `matchedSample` describes the standard semantic result returned by each
   timed arm. It contains class invariants, ordinary unit/regulator/torsion
   output and terminal state, but deliberately does not require PARI's timed arm
   to serialize Sage.js-only principal witnesses or the independent replay
   bundle. A stronger symmetric serialized-witness experiment would require a
   separate contract and timing series.

Thus full correctness is a prerequisite for admitting the Sage.js
implementation, while the headline paired sample remains the matched boundary
specified by Phase 6 of the campaign plan.

## Central sample invariants

The registry independently checks the following even after the row-specific
sample verifier returns:

- field id and the complete ascending polynomial equal the central inventory;
- class number, exact invariant-factor list, unit rank, and torsion order equal
  the central field expectation; nontrivial invariant factors multiply to the
  class number and each divides the next;
- the complete lean semantic projection (field, class group, units, regulator,
  torsion, and terminal result) hashes to the digest authenticated by the full
  Sage.js correctness verifier, preventing two timed arms from agreeing on the
  same validly shaped but wrong result;
- work counters are nonnegative (zero is legitimate) and native-call counts are
  positive;
- each implementation reports its own immutable provenance manifest, containing
  uniquely named artifact roles and SHA-256 values;
- observed work, native calls and provenance agree with the sample;
- terminal, precision and retry envelopes use the pinned schemas; and
- mutually exclusive stage leaves plus the explicit remainder equal the
  inclusive root time.

## CPU authority

CPU observations are explicit tagged records, not an unlabeled number. Sage.js
must provide current-thread CPU with authority `process-thread-self`. PARI may
provide `pari-child-rusage`; otherwise it must state that CPU is unavailable
with authority `unavailable-parent-cannot-measure-child`. Parent Node thread CPU
is never accepted as PARI child CPU. Wall/kernel time remains mandatory for both
arms.

## Current disposition

The trust root is empty. All inventoried rows remain diagnostic-only,
`executionEnabled` is false, and `reserveOpeningEnabled` is false. The next trust
entry must include reviewed, hash-bound full Sage correctness evidence and a
separate row-specific matched-sample verifier satisfying this contract. Adding
only a diagnostic pair, a self-declared capability, or a shallow common
projection cannot enable qualification.
