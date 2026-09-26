# Pristine flag-one development capture audit (2026-09-18)

Status: an untimed correctness-authority boundary only. No qualification,
performance result, reserve opening, or same-invocation Sage/PARI match is
claimed.

## Boundary

`capture_pristine_flag_one_development.cjs` generalizes the former hard-coded
row-20 producer to exactly one field selected from the twelve-row
`additional-development` population in `compact-flag-one-manifest.json`. It
cross-checks that selection against `panel.json` and the current qualification
manifest, which must label the row `additional-development`. A sentinel or
final-reserve row therefore fails before compilation or PARI execution.

The capture also authenticates an immutable mode-0444 prepared corpus file
against `fresh-prepared-corpus-manifest.json`, including its byte count, JSON
digest, normalized key set, mathematical prepared-authority digest,
polynomial, degree, and real-place count. The prepared file supplies identity
and input provenance; it does not supply a retained class-group answer. PARI
reconstructs its prepared number field from the authenticated polynomial.

`pari_compact_flag_one_development_authority.c` accepts only the expected
degree, signature, and ascending decimal coefficients. In a cold,
single-threaded process it makes exactly

```text
nfinit0(polynomial,0,nbits2prec(192))
bnfinit0(prepared_nf,1,NULL,nbits2prec(192))
```

and emits the class number, invariant factors, unit rank, torsion order,
bounded work shape, and terminal PARI RNG state. The orchestrator projects
those results into the representation-neutral compact output. There is no
clock call, timing loop, or measurements field with content.

Each immutable authority pins the PARI 2.17.4 archive and `buch2.c`, loaded
library, C producer, JavaScript capture source, compiler arguments, compiled
executable, selected panel identity, prepared JSON, mathematical prepared
authority, exact call, output projection, and canonical output digest.

## Row-21 demonstration

The committed demonstration is
`pristine-row21-flag-one-development-authority.json`:

- panel row: 21, field `5.3.1009349859375.3`;
- prepared JSON SHA-256:
  `f33a1c37bb9f7bcafbe20a0e22b0c0434a29070843fa98e90ea3368db2302397`;
- mathematical prepared-authority SHA-256:
  `63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f`;
- producer source SHA-256:
  `fedabfbee591cd32eacdf862fd60f5517f82c3c44e33ec50a28c2875c8ac8220`;
- capture source SHA-256:
  `91a6263f1b2e0f4c87d31818f04563f3ef6a27e2bdf8c4bdf996e1f5a65c1f48`;
- executable SHA-256:
  `1b09ae60d7853d97da44a59978e590da94ed422775c068fbd8d599c82815a9c9`;
- loaded `libpari` SHA-256:
  `fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f`;
- authority SHA-256:
  `7b0dcc3a6c86cc520f365b3b697559ae6227115fc59f17a29634cc897ac414ff`;
- common-output SHA-256:
  `12c04790d75adf85320499b03b08e3dbd3cf4c64aa5780194bbe9528079132ba`.

The exact projected result is class number one, no nontrivial class invariant
factors, unit rank three, torsion order two, and exact-unit materialization.
This agrees with the frozen panel reference where that reference exists.
As a second, uncommitted regression, the generic producer captured row 20 and
reproduced the older hard-coded producer's common-output SHA-256 exactly:
`ea40bb397941f6fec98881c1d0ce2402a33c02c82c0d1bab3face46b13ae36c2`.

## Checker

`check_pristine_flag_one_development_capture.cjs` validates the committed
authority, performs two more cold captures, and requires all three files to be
byte-identical. It rejects mutations of the prepared-authority pin, call timing
mode, empty-measurement contract, mathematical output, and producer source
pin. It separately rejects a reserve row and a mutable prepared input.

The successful check receipt reports two byte-identical fresh captures,
authority SHA-256 `7b0dcc3a...14ff`, output SHA-256 `12c04790...32ba`, seven
adversarial rejections, zero measurements, and `reserveOpened: false`.

This closes only the systematic pristine-PARI capture cut. A later adapter may
compare this authority with a separately branded fresh Sage result, but this
lane deliberately does not fabricate or claim that matching execution.
