# Stage G `shift_right` direct-result diagnostic

## Result

The proposed four-edge `int64_shift_right` experiment stops at the compiler's
direct-result authorization gate. The current generic machinery cannot certify
the function's preserved floor-division body, so it emits **zero** direct-result
variants and **zero** direct calls. No candidate artifact was generated, no
semantic or malformed replay was attempted, and this diagnostic makes no
performance claim.

The machine-readable evidence is in
[`stage_g_shift_right_direct.json`](./stage_g_shift_right_direct.json).

## Frozen target

The probe used compiler commit `83dc2cd3206837262ed8374ba01b1c069e16cc46`
and the frozen Stage G manifest from `/tmp/sagejs-stage-a-catalog-zGI1yt`.
Walking that manifest's IR identifies exactly four private calls, all from
`int64_pari_flxq_powu`:

| operation origin | packet-zero calls |
| --- | ---: |
| `int64_pari_flxq_powu:200` | 652 |
| `int64_pari_flxq_powu:285` | 5,525 |
| `int64_pari_flxq_powu:303` | 5,525 |
| `int64_pari_flxq_powu:355` | 8,272 |
| **packet-zero total** | **19,974** |

The supplied frozen profile counts 21,138 calls across all four packets; the
other three packets contribute 1,164 calls in aggregate. These counts describe
the opportunity only. They are not timing evidence.

The frozen identities are:

```text
fixture SHA-256   f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
manifest SHA-256  5294654d534a40d6bb0fe6782f6bffa53ced20344732da89b8a351e6da088d6a
core SHA-256      7c4f789106c56c4e62ef46534892a92ef3a4f382cadb47c1f9910c46d6726bfe
```

## Authorization probe

The diagnostic supplied the ordinary `int64_shift_right` function to the
existing generic local-variant mechanism with `mode: "direct-result"`, no
source rewrite, no guard, and no compiler modification. This is the narrow
shape needed to let the four already-proved private call states authenticate
the direct edges while retaining the ordinary checked function as the public
and unproved fallback.

Preparation returned zero direct-result variants. The failure occurs before C
generation: `directResultFailureFree()` admits authenticated `int64.binary`
operations only when they are `add`, `sub`, or `mul`. Its following catch-all
rejects every other `int64.binary`, including the `floordiv` at operation origin
`int64_shift_right:3`.

That rejection is safe. The source implements right shift as repeated Python
floor division by two:

```python
while shift > 0:
    value //= 2
    shift -= 1
```

Replacing this body with C truncating division or a signed shift would risk
changing negative-value behavior. The experiment therefore does not bypass
the authorization gate or substitute a different body.

## Required compiler prerequisite

A future compiler lane must add a generic proved-`int64`-floor-division rule.
It must require both:

1. the divisor is nonzero; and
2. the `INT64_MIN // -1` overflow case is impossible.

For this function the divisor is the constant `2`, so both obligations are
straightforward. Once authenticated, direct emission must retain
`sagejs_word_fdiv_int64` semantics and omit the status path only under that
proof. The loop's guarded decrement remains subject to the existing proved
`int64` subtraction rule.

After that compiler prerequisite lands, this unchanged experiment can generate
the candidate, replay the four frozen packets and nine malformed public cases,
and inspect relocations, text size, and paired timings. Until then there is no
safe candidate to measure.
