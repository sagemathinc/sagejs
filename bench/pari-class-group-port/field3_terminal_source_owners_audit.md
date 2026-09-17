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
- local HNF protocol SHA-256
  `892afa9a63da8353cce50eead03b12f031812182a3229a48ed8fbdfa60b94e72`;
- and, for the class operation, the content-addressed raw-log, full15, and
  relation owners.

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
trusting a matching schema label. It authenticates the raw-log and local-HNF
protocol files named by full15, reruns `transform_authenticated_owners`, and
requires equality of the entire reconstructed full15 owner. Thus high-precision
`Ce` is not accepted merely because it has the right shape. It also replays

```text
R * T = [0 | permutation^-1(H)]
```

against the complete exact relation matrix.

Selection is derived from the authenticated suffix and must equal the common
prefix of the full15, resident, and live permutations. No packet number or
answer from `live_join.expected` is an acceptance input. The exact suffix:

- recomputes the antiuniformizer using PARI's dependence selection and its
  column-major `tau` from the authenticated uniformizer and basis table;
- reconstructs each selected packet ideal from its descriptor;
- proves the generated integral ideal is `p P^-1` both by an independent ideal
  inverse and by the exact identity `P * (p P^-1) = (p)`;
- Smith invariants `[2, 2]` and class number `4`;
- derives `M1`, `Uir`, and each positive-rational principal factor rather than
  comparing them with a fixture; and
- proves the order relations from the exact full15 image, all 301 replayed
  principal relations, and exact ideal products.

This corrects an important masked error in the earlier suffix experiment:
multiplication by PARI's uniformizer `u` describes `P`, while `pr_get_tau`
uses the dependence-selected antiuniformizer and describes `p P^-1`. Since
both selected classes have order two, the wrong ideal happened to have the
same class and the fixture comparison did not expose it.

The full permutations are deliberately not compared. The authentic resident
permutation begins `[11,2,4,148,238,6,...]`, whereas the earlier live join
begins `[11,2,6,148,238,4,...]`. Only the first two entries select class
generators. Comparing the unused suffix would incorrectly reject authentic
evidence.

Terminal `B` is not copied on trust. Starting with the authenticated local
protocol's post-HNF initial owner, the serializer reruns `hnffinal` and the
three exact `hnfadd` stages, checks every checkpoint hash, and requires all 572
cells to equal the independent resident authority. Its defining layout is the
column-major reduced `2 x 286` trailing block:

```text
C_B[j] = g_perm[2+j] + sum_i B[i,j] g_perm[i].
```

Every entry is independently checked to be the canonical residue modulo
`H = diag(2,2)`. The output names the raw, protocol, full15, relation,
resident-authority, and live-join digests.

## Transaction and qualification

Outputs are canonical newline-terminated JSON named by their SHA-256. They are
written mode 0400 to a unique temporary file, atomically renamed, and sealed
mode 0444. Existing output is accepted only when mode and content still match;
therefore repeated publication is idempotent. Failure does not add an output.

The focused check uses the authentic resident authority, class join, and local
HNF protocol. It replays all 301 authentic principal relations. For the class
boundary only, it creates one sparse synthetic 153,088-bit raw-log owner and
derives every full15 cell from that raw owner and the authentic protocol. It
does not substitute an expected `Ce` and does not claim an authentic
high-precision result. It checks both
successful publications, idempotency, mode 0444, the known packed latches, the
authentic tail-permutation discrepancy, and fail-atomic rejection of digest,
duplicate-key, selected-prefix, full15-image, relation, and raw-owner mutations.

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
`--full15`, `--full15-sha256`, `--relation`, `--relation-sha256`, `--raw-owner`,
`--raw-owner-sha256`, `--protocol-owner`, and `--protocol-owner-sha256`, and
uses `--operation class`. No production class owner has been published by this
bounded qualification.
