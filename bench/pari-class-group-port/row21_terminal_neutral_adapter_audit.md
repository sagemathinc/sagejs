# Row 21 terminal-to-neutral adapter audit

## Scope

`row21_terminal_neutral_adapter.cjs` is a data-only Phase-5 adapter from the
committed `sagejs.pari-class-group/row21-final-buchall-end-v1` result to the
shared `sagejs.pari-class-group/class-unit-correspondence-result-v1` payload.
It does not discover an artifact, open W0, prepare a field, run PARI, or make a
timing claim. The caller must supply the exact canonical source bytes.

Admission requires a branded, detached, synchronous replay authority. The
focused checker implements that capability by invoking the committed
`row21_final_result.cold_replay_row21` entry point in a cold Python process.
The adapter checks the returned source digest, payload digest, mathematical
authority digest, field identity, class number, unit count, and terminal tier
before it projects any data.

## Neutral projection

The payload publishes:

- field `5.3.1009349859375.3`, polynomial
  `x^5 - 90*x^3 - 305*x^2 + 930*x + 36`;
- the exactly replayed trivial class group, with class number one and no
  invariant factors or generators;
- the retained relation presentation, column HNF, unimodular transform, and
  exact right inverse in the `class-presentation` owner;
- three exact integral-basis unit coordinate vectors, their three exact
  inverse vectors, and norms `[-1,-1,-1]`;
- torsion generator and inverse `-1`, with order two;
- the source's packed, floating accepted regulator value;
- the three source assumptions and the complete remaining-boundary record;
- the entire canonical source envelope as integer byte storage.

The neutral helper requires the regulator reference to have role
`regulator-enclosure`. For this row the owner is deliberately named
`accepted-regulator-packed`: its three entries are the upstream packed value,
not a newly rigorous enclosure. The source assumption says that PARI's
floating analytic and regulator acceptance is assumed correct. No stronger
claim is made.

The terminal record remains
`pari-correspondence-complete-internal`, with correspondence complete and
public completion false. All three source assumptions retain disposition
`assumed`, and the correspondence remains
`upstream-assumed-pari-correspondence`.

## Replay and publication

After projection, `class_unit_correspondence_result.cjs` validates and seals
the neutral envelope. A second detached authority must replay that exact
neutral payload before `ClassUnitCorrespondencePublisher` admits it. Equal
republication returns the same immutable object; a different independently
valid envelope raises `ClassUnitResultConflict` without changing the published
result.

For the audited source result:

```text
source SHA-256        92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03
source payload SHA-256 b933bc7e6861b0073c0cff355c7be5e3c0cc6ff695a683040b46f9e399ab569f
authority SHA-256     477e2a905a9170ae806f096790f24b9b34bc48a238f435099e7c1ccc402af348
neutral envelope      035d2df7aadc52d3e884b31e2894d57210ec9ee52c880b8df97a73d5558415a3
```

## Mutation coverage

The checker reseals and independently cold-replays mutations to every major
source projection: relation presentation, unit coordinates, unit inverses,
unit norm, torsion, regulator, assumptions, source ancestry, and terminal
tier. All nine are rejected.

It then reseals neutral payload mutations to field identity, assumptions,
honesty policy, class presentation, unit coordinates, unit inverses, norms,
regulator, torsion, and retained source bytes. All ten are rejected by the
detached neutral replay. It additionally rejects an unbranded source authority,
a source digest mismatch, and a forged replay receipt. The conflict test proves
that failed replacement cannot alter the already-published result.

## Reproduction

The checker takes one explicit path; it performs no artifact search:

```bash
node bench/pari-class-group-port/check_row21_terminal_neutral_adapter.cjs \
  /scratch/sagejs-row21-final-result/row21-final-92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03.json.gz
```

Audited output reports nine rejected source mutations, ten rejected neutral
payload mutations, three rejected identity attacks, successful cold replay,
and atomic, idempotent, conflict-preserving publication.

## Remaining boundary

This adapter establishes correspondence only for this one authenticated row.
It does not provide an independent rigorous regulator enclosure, an independent
class/unit saturation certificate, an unconditional factor-base bound, or a
general-field integration. It makes no performance statement and does not
claim that the source result is publicly complete.
