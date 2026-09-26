# Arbitrary ideal reduction qualification

This isolated crate exercises the public bounded reduction boundary without
PARI, subprocesses, runtime files, or stored answer data. Row6 enters through
the strict neutral-input parser and an exact allowlist over its input ID,
canonical field-data digest, and source SHA-256. This produces a distinctly
typed **upstream-assumed** qualification context; it is not Rust proof of
maximality. The small cubic enters through Rust's squarefree-discriminant
maximal-order proof, which alone mints the production maximal-order
capability. The crate then
constructs the factor bases in Rust,
reduces one factor-base ideal from each field, and independently replays

```text
(alpha) = input_ideal * product_j P_j^exponent_j.
```

The row6 case uses the ramified maximal-order prime above the index prime 3
and requires a nonzero quotient exponent. The small case is `x^3 - x + 1`.
The executable also mutates the row6 element and exponent vector and requires
both counterfeit certificates to fail exact replay.

Run from this directory with:

```sh
cargo run --release
```

The output reports cursor counts and the sparse certified quotient vectors;
success is indicated by the final `qualification=passed` line. The checked
qualification run is recorded in `expected-output.txt`; in particular, row6
replays `(3) = P_3 * P_3^2` for the maximal-order index-prime ideal.

## Genuine row6 class-map authority evidence

`evidence/row6-map-authority.json` is a qualification-only, closed-schema
fixture derived from the retained prepared-v2 row6 artifact. It binds that
artifact's SHA-256, the neutral input ID, the complete ordered 1,130-ideal
catalog, all 1,137 principal relation records and integral-basis principal
elements, and the genuine `C2 x C2` generator coordinate map. Tests regenerate
the Rust factor base, compare every catalog field, replay every principal ideal
identity, verify every relation maps to zero, and only then mint the sealed map
authority used for arbitrary-ideal class coordinates. Production source does
not embed this answer-bearing fixture or its digest.

The deterministic extractor is `evidence/derive_row6_map_authority.py`. Given
the retained source artifact, regenerate the minified fixture with:

```sh
python3 evidence/derive_row6_map_authority.py \
  /tmp/row6-prepared-v2.json \
  evidence/row6-map-authority.json
```

Current scope is deliberately bounded: the cursor uses the collector's single
small-norm ellipsoid and the quotient norm must factor wholly over complete
rational-prime groups already present in the prepared factor base. Exhaustion
returns an error and never publishes a partial certificate. Replay takes the
same valuation limit, rejects oversized exponents before constructing powers,
and exposes the signed handoff `class(input) = -quotient_exponents` together
with its maximal-order evidence status. The hard implementation ceiling is
256 for both search and replay, regardless of caller-supplied limits.
