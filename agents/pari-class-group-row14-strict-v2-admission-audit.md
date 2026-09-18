# Row 14 strict-v2 admission audit

Row 14 is the first—and currently only—trusted Phase-6 matched-state
admission. This changes neither the disabled qualification runner nor the
sealed reserves. The admission proves that the standard prepared-field
Sage.js and PARI arms can publish the same complete *timed-state* contract,
while a separate static Sage authority retains the evidence that is
intentionally not serialized by standard `bnfinit0(nf, 0)`.

The frozen admission authorities for this revision are:

- evidence JSON SHA-256
  `29420bd4190155d099bfb77ed366db7752e4841c07419aea7c45cca7287c71d5`;
- verifier SHA-256
  `1a335637ee8d7d89067c1928f6e6c5dfa3f3f3f51ad91cab0cb3bf0acf6c7aae`;
- replay summary SHA-256
  `bd290b08da5fd6b2835f15fd57a19f004f430b78369f7b4a8ab55513558dd291`.

## Static Sage authority

`row14_phase6_matched_state_evidence_v2.json` embeds the validated
`class-unit-output-evidence-v2` result. Its verifier reads and hashes a durable
4.6 MiB compressed replay bundle and then independently checks:

- all 643,994 cells of `U R V = D`, and independently checks that both `U` and
  `V` have determinant `-1`;
- invariant factors `[8, 24]`, both exact signed generator-ideal reductions,
  both exact order/principal-witness equations in the same public order, and
  all 806 raw principal ideal equations (4,962 exact ideal products);
- two compact/factored units, their relation transforms and packed logarithms,
  plus the exact flag-zero `not_given(LARGE)` outcome;
- the accepted packed regulator through the detached rank-two C5/log-lattice
  replay, all 799 supported ideal map roundtrips, terminal state, and retry
  state;
- torsion completeness: the polynomial has exactly two real roots, hence the
  field has a real embedding and every root of unity is `+/-1`; the exact
  multiplication table verifies the retained `-1` squares to `1`; and
- every immutable fixture and every source used by the replay.

All thirteen required envelope mutation families are executed by the verifier,
and are explicitly reported as authenticated-envelope rejection rather than
mathematical replay. Seven additional source-owner arithmetic mutations reach
the Smith, principal-witness, compact-unit, raw-principal, regulator/log,
general-map, and signed-generator equations themselves.

## The 192/256 precision distinction

The old output sidecar called `256` the algorithm precision. Source evidence
shows that both the translated root and pristine PARI call request
`nbits2prec(192)`. PARI rounds that request to a word-backed real whose emitted
triplet reports 256 storage bits. The strict evidence now records both facts:

- `requestedBits = 192` governs the computation and retry state;
- `packedRealBits = 256` describes the serialized real representation.

The packed regulator remains exactly the same value; only the misleading
precision label was corrected.

## Live matched state

The live verifier retains class number/invariants and the two standard PARI
generator ideals, the exact `not_given(LARGE)` unit state, regulator triplet,
torsion generator, terminal state, requested/packed precision, and retry
state. It does **not** add principal-witness serialization to PARI.

Work counters come independently from live Sage owner shapes or PARI's post-clock
`bnf` accessors. Sage native entries are derived from the executed call graph;
PARI reports the single `bnfinit0` entry. Sage CPU comes from
`process.threadCpuUsage()` around the native root, while PARI CPU is measured
inside its child with `getrusage(RUSAGE_SELF)`. A single exclusive root now
switches at the actual native-call boundaries for relation/retry, sparse
HNF/SNF, and unit/regulator work. Both the mixed post-806 analytic/Smith root
and the class-assembly root—which begins with a full Smith transform before
constructing generators—remain in the explicit unattributed remainder. The
`honestyGeneratorsFinal` leaf is therefore zero. The legacy kernel and
exclusive root differ by a measured,
asserted start/end offset equation, so the named leaves and remainder close
the published kernel clock exactly. PARI remains a whole-root clock and is
entirely unattributed.

After warmup, the live wrapper hashes the complete closure of all 13 resident
native builds: cache/source identities, manifests, generated adapter/core/header
sources, addon binaries, loader route, transitive source and foreign-library
dependencies, runtime shared libraries, compiler sources and declarations,
and the C/Node/node-gyp toolchain. The next diagnostic receipt retains this
full observation rather than only a hand-selected source list.

## Deliberate non-claims

- `executionEnabled` remains false.
- `reserveOpeningEnabled` remains false.
- no long campaign or approved timing run is performed;
- no ratio is promoted from the single fresh diagnostic pair; and
- no current receipt proves the plan's 80% gap-attribution threshold after
  this conservative mixed-root classification; it must be recomputed by the
  separately authorized fresh v2 pair rather than inferred from legacy clocks;
- the other fifteen development rows remain unadmitted.
- the packed regulator is replayed through the retained C5/log-lattice
  semantics; this is not a detached analytic interval proof of the regulator.

The signed-generator replay reconstructs the inverse/principal scaling from
the authenticated field table, rounded T2 owner, and factor-base ideals. It
checks `G^n = principal(raw product * Ge^(-n))` for both generators and rejects
the opposite correction sign; no PARI witness serialization is added.

Run the static gate with:

```bash
node bench/pari-class-group-port/check_row14_phase6_strict_admission.cjs
node --test test/pari-class-group-row14-strict-v2-admission.cjs
```

The optional `--live OUTPUT.json` mode is one bounded diagnostic pair only.
No current v2 receipt exists yet. Its finalizer deliberately requires every
evidence, verifier, fixture, provenance, and stage source blob to be present
byte-for-byte in the recorded source commit, then marks the generated receipt
as post-commit rather than circularly claiming the receipt is in that commit.
The commit closure also includes every Sage and PARI implementation source
whose bytes the live verifier authenticates: the matched host, initial root,
Gate-C host, post-terminal host/root, class and unit roots, registered wrapper,
and PARI helper/adapter. The expensive exact replay may be cached within one
process, but every verifier call re-reads and reauthenticates all three fixture
files before using that cache.

## Single fresh diagnostic pair

An earlier authorized fresh pair completed successfully under a 4 GiB address
space limit and 600-second CPU/wall limits. The immutable receipt is outside
the repository at
`/scratch/row14-phase6-strict-v2-single-pair-v1.json` with SHA-256
`e50bf348c30560f77d43c6a6d6a0b1e6934afabf279728dcfcd0838389fce8f2`.
It records `exactMatchedState = true` and `exactObservedWork = true`, but it
predates the current verifier and does not retain verifier observations or
evidence/verifier/commit bindings. It is **superseded legacy diagnostic
history**, not a replayable strict-v2 receipt and never corrected evidence. No
current admission or performance claim may cite it as authority.

The observed Sage.js root took 30,927,599,967 ns wall and 30,299,717,000 ns
thread CPU with 35 derived native entries. Its normalized leaves predate the
exclusive ownership audit and therefore cannot be remapped into the current
source-aligned leaves. The historical receipt bytes and hash are retained
rather than rewritten and must not be cited as containing the corrected
leaves. The PARI
`bnfinit0` root took 2,043,637,296 ns wall and 2,043,442,000 ns child CPU with
one native entry; its whole-root clock is deliberately the unattributed
remainder. Peak RSS was 1,070,020 KiB for Sage.js and 227,408 KiB for PARI.

This receipt is diagnostic evidence for the admission plumbing, not a timing
qualification: it retains `qualifiedTiming = false`, does not execute a
campaign, and does not open reserves. In particular, its approximately 15.1x
single-pair wall-time ratio is not promoted as a benchmark result.
