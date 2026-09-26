# Row 11 presentation, class-generator, and unit authority audit

## Frozen authority

This lane authenticates the mixed-signature quartic at panel row 11:

- field ID
  `generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab`;
- polynomial `x^4 - 2000010*x - 2000018`, signature `(2,1)`, unit rank 2;
- frozen W0
  `/scratch/sagejs-pari-development-panel-a998/panel-11-ce2bfa61425aa681.json`;
- W0 SHA-256
  `6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165`;
- active development-driver manifest SHA-256
  `79e77fbb7b3c8920437ce701a837a05720355cf008dd44705efee6c1e04cd261`;
- historical W0 source-manifest SHA-256
  `abe10f55aa44fbb47560cd23cf8b708268d838720d38b0fc98debbc1b763ef46`.

The coordinator verifies the W0 byte length and digest, exact filename,
prepared-event digest, complete event-list digest, terminal-result digest,
prepared-number-field authentication, and adapter source digest before invoking
ordinary CPython source. Duplicate JSON keys are rejected.

The two manifest digests intentionally have different roles.  A new direct
execution is admitted only through the current active driver manifest.  The
immutable W0 and fresh-prepared corpus were captured under the historical
source manifest, so their published ancestry continues to name that original
byte authority.  Updating active policy therefore neither rewrites old corpus
receipts nor changes the byte identity of the row-11 mathematical owner.

## Exact result reached

The authenticated trace contains the exact retained schedule:

- `24 -> 428` initial relation target;
- HNF at 427 relations: `W 2x2`, `B 3x418`, `dep 1x2`;
- HNF at 428 relations: `W 3x3`, `B 3x418`, `dep 0x3`;
- rejected acceptance `1/32`, followed by target 431;
- HNF at 430 relations: `W 2x2`, `B 2x419`, `dep 0x2`;
- accepted result `0/4`.

The adapter passes the final retained exact `W = diag(2,2)` through the
existing source-transparent Smith implementation. It derives invariant factors
`[2,2]` and class number `4` before consulting the terminal result, then checks
that the detached comparison agrees. It also proves that the final
`class_group_input.W` is byte-for-byte the same integer matrix.

This is an authentic exact presentation boundary, but it is specifically an
`authenticated-retained-exact-hnf` result. It does not claim that this lane has
recomputed the three HNFs from all 430 raw relations.

## Exact stopping point

The frozen trace is not sufficient by itself to publish source-derived class
generators or exact units through the currently committed generic adapters.

- The trace contains 430 relation records and terminal PARI class output, but
  no separately published row-11 relation-to-presentation transform and no two
  independently replayed order-principal factorbacks. Treating PARI's terminal
  generator output as the witness would be answer-derived.
- The `fundamental_units` event contains the floating matrices `A` and `U`, but
  its exact `fu` member is `null`. No authenticated row-11 raw-to-unit transform
  followed by exact quartic factorback has been replayed. Copying `A` or `U`
  into a result would turn an oracle observation into authority.

Consequently the immutable result says:

```text
presentationComplete=true
classWitnessesComplete=false
unitsComplete=false
correspondenceComplete=false
publicComplete=false
```

The next mathematically meaningful connector is a degree-four replay of the
430 exact relation records through the retained HNF permutations/transforms.
That connector must publish a raw-to-presentation transform and derive two
order-two ideal witnesses. The same authentic transform/log ancestry can then
feed rank-two cleanarch/getfu and exact quartic factorback. Until those objects
exist, this lane deliberately exposes the blocker instead of synthesizing
them.

## Validation

Run the bounded specialized check with:

```sh
timeout 600s prlimit --as=4294967296 -- \
  node bench/pari-class-group-port/check_row11_presentation_class_unit.cjs
```

The check executes the authentic 28 MiB W0, publishes only into a temporary
directory, verifies immutable mode `0444`, and rejects eight ancestry, HNF,
acceptance, unit, presentation, and premature-completion mutations. It remains
well inside the 600-second and 4-GiB ceilings.
