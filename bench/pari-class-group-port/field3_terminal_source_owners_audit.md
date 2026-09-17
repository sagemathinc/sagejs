# Field-3 terminal source owners

## Purpose

`field3_terminal_source_owners.cjs` closes the two narrow serialization gaps
between the retained field-3 computation and the terminal adapters. It does not
search for relations, infer a class group from expected output, or perform the
authentic 153,088-bit logarithm computation.

The frozen inputs are:

- resident authority SHA-256
  `246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c`;
- live class join SHA-256
  `b8df9b99acb501d8ea0faf3034c1059d451ffd84180735c89c982b0f014da814`;
- and, for the class operation, the future content-addressed full15 owner and
  the relation owner produced by the first operation.

Every input must be a mode-0444 regular file and match an explicit SHA-256.
Both JavaScript and Python parse JSON with duplicate-key rejection, and Python
rehashes every file after JavaScript authentication.

## Relation owner

The `relation` operation reruns `pari_field3_full_owner_authority` over all 26
retained owners and checks its 48 fingerprints and 24-word state. It then calls
`replay_field3_principal_relations` with the live integral-basis multiplication
table. That replay checks all 288 factor-base ideal HNFs and all 301 exact
equalities between a relation ideal product and its retained principal
generator.

Only after that replay succeeds does it publish
`field3-full-owner-authority-v1`. Its `exactOwners` retain the complete
288-by-301 relation matrix, all 301 power-basis principal generators, the
factor-base HNFs and norms, metadata, basis multiplication table, and terminal
permutation. Established packed-array latches are:

- relation records:
  `5df8c4bb02cd481965fdb01bac424f58d419216e3cefd4883ac985631da0e719`;
- principal generators:
  `31e9c9b4c0245417ce9265d5233d1a67fb717206e9811975cb85a59af03ab5de`.

These latches use SHA-256 of decimal cells joined by line feeds, without a
terminal line feed. They are diagnostics; the exact arrays and replay remain
the mathematical authority.

## Class owner

The `class` operation independently recreates the relation owner rather than
trusting a matching schema label. It requires full15's authenticated terminal
state and authority ancestry, checks its packed `A | Ce` split, and replays

```text
R * T = [0 | permutation^-1(H)]
```

against the complete exact relation matrix. It then reruns
`pari_field3_live_class_suffix`, substituting the authentic high-precision
`full15.packedCe` for the earlier low-precision class logarithms.

The exact retained suffix must reproduce:

- selected packet prefix `[11, 2]` and primes `[13, 3]`;
- both multiplication matrices `tau` from the packet generators and basis
  multiplication table;
- Smith invariants `[2, 2]` and class number `4`;
- `M1 = Uir = -I`;
- principal factors `1/13` and `1/3` with exponent one; and
- the complete 63-cell suffix replay state.

The full permutations are deliberately not compared. The authentic resident
permutation begins `[11,2,4,148,238,6,...]`, whereas the earlier live join
begins `[11,2,6,148,238,4,...]`. Only the first two entries select class
generators. Comparing the unused suffix would incorrectly reject authentic
evidence.

The output `field3-live-class-suffix-owner-v1` copies `W` and high-precision
`packedC` from full15, `B` unchanged from the resident authority, and the two
replayed descriptors. It names the exact full15 and relation-owner digests.

## Transaction and qualification

Outputs are canonical newline-terminated JSON named by their SHA-256. They are
written mode 0400 to a unique temporary file, atomically renamed, and sealed
mode 0444. Existing output is accepted only when mode and content still match;
therefore repeated publication is idempotent. Failure does not add an output.

The focused check uses the authentic resident authority, class join, and local
HNF protocol. It replays all 301 authentic principal relations. For the class
boundary only, it uses a bounded full15 qualification owner whose exact
transform comes from the authentic HNF protocol but whose `Ce` is the already
qualified low-precision class logarithm. This exercises the identical exact
suffix without claiming an authentic high-precision result. It checks both
successful publications, idempotency, mode 0444, the known packed latches, the
authentic tail-permutation discrepancy, and fail-atomic rejection of digest,
duplicate-key, selected-prefix, full15-image, and relation mutations.

```bash
node bench/pari-class-group-port/check_field3_terminal_source_owners.cjs
```

Production relation publication is:

```bash
node bench/pari-class-group-port/field3_terminal_source_owners.cjs \
  --operation relation \
  --authority AUTHORITY.json --authority-sha256 AUTHORITY_SHA256 \
  --live-join LIVE_JOIN.json --live-join-sha256 LIVE_JOIN_SHA256 \
  --output-dir OUTPUT
```

After authentic full15 publication, class publication adds
`--full15`, `--full15-sha256`, `--relation`, and `--relation-sha256` and uses
`--operation class`. No production class owner has been published by this
bounded qualification.
