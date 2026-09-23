# Live retrying H1 native suffix

## Publish authority

`pari_live_retrying_h1_suffix` is one ordinary-Python compiled call graph for
the precision-dependent end of the real-cubic H1 path. It accepts the live
relation, active-HNF, and compact-factor dimensions, their independently
bounded owner capacities, an initial precision, and a caller resource cap.
The root composes and exactly replays the kernel and retained relations before
entering a retry loop driven only by `pari_live_retry_transition`.

Each attempt rebuilds the cubic embeddings and S-unit logarithms in reusable
caller-owned scratch, preserves the characteristic-two phase bits, and
transposes the embedding rebuild's row-major matrix at the signed-getfu
column-major boundary. Signed getfu receives its own reusable exponential
workspace. The relation rows passed to the S-unit leaf use the live logical
relation count as their stride, while padded capacity remains available for
the exact/public relation owners.

The six public result owners are transactional. The root publishes retained
relations, exact units, norms, logs, phases, and the regulator only after
signed getfu succeeds, the returned units agree with independent exact
relation replay up to inversion, and the regulator determinant succeeds. If
the next retry selected by source policy exceeds the caller's resource cap,
the root returns incomplete and leaves every public result owner untouched.

There is no terminal-precision literal, fixture logical dimension, expected
regulator, ULP corridor, or answer-derived success condition in this root.
For the authentic saved resident owners, the observed policy path is p192,
p384, p768, and p1536 with `PRECI`, followed by genuine success at p2304.
That terminal precision is a checker observation, not control flow. The final
state is `[0, 5, 2304, 0, 3, 73, 15, 7, 2, 7, 2, 0, 0, 0, 1, 4096]`, the
exact norms are `[-1, -1]`, and the published phase bits are
`[0, 0, 1, 1, 1, 1]`.

Focused mutations show that caps at p192 and p2048 leave publication owners
at their sentinels, shortening the live active-HNF dimension is rejected, and
changing a principal-generator exact owner is rejected before publication.
The checker injects the already-qualified bridge compact provenance and
factor transform as a component oracle. Consequently this is a genuine native
retrying suffix receipt, not by itself a candidate-to-authority timed-root
receipt.

## Frozen component control

### Closed ownership domain

`pari_unified_full_h1_suffix` is the ordinary-Python native continuation of
the authentic real-cubic resident/bridge path. It consumes only live owners:

- `prep_polynomial`, `prep_zk`, and `basis_table` from prepared field state;
- the 73 principal generators and resident cleanup/HNF transformations;
- the bridge's two-by-seven compact provenance matrix; and
- the accepted resident regulator used only for a final diagnostic delta.

The remaining arguments are caller-owned output or scratch buffers. No
reconstructed unit, retry-precision embedding, logarithm, digest, PARI answer,
or fixture-derived control value is an input.

One native call composes the seven kernel words over all 73 relations, replays
their exact cubic products, checks all seven norms, composes and independently
replays both final units, and checks their norms. The same call then rebuilds
the p2,176 roots and embeddings, transposes `make_M`'s basis-column layout into
the real-place rows expected by the S-unit log consumer, rebuilds the two log
columns, and evaluates the rank-two regulator determinant. The generated core
contains no Python, JavaScript, Node-API, or V8 callback.

This demonstrates how to remove the JavaScript exact-unit implementation from
a future timed root. It is not itself that root: its fixed retry precision and
the observed logical shapes 73, 15, and 7 are frozen component sentinels. A
live completion must derive lengths from resident state, drive precision with
the translated retry policy, and import this work with the neighboring
candidate/bridge root into one compilation unit. Passing buffers between
separately generated addons is explicitly not supported.

### Authentic result

The focused checker uses saved live resident output for
`x^3 - 20018*x + 20034`. It injects the already qualified compact provenance
as a component oracle; therefore the checker cannot be used as a timed-root or
completion receipt. CPython, generated JavaScript, native GMP, and tagged
native storage agree on:

- seven checked kernel factors and two exact final units;
- final unit norms `[-1, -1]`;
- integral-basis unit widths `[1245, 2115]` bits;
- power-basis unit widths `[1239, 2117]` bits;
- `[49, 46]` nonzero retained relation exponents;
- embedding state `[3, 2176, 2496, 1]`; and
- log rebuild state `[0, 73, 2, 2, 2176]`.

The direct resident p192 schedule and the p2,176 schedule rounded back to p192
are not bitwise coherent: the latter regulator mantissa is exactly four final
p192 mantissa units below the accepted resident value. The diagnostic state
records this delta as `[0, 7, 2, 1, 1, 1, 4, 0]`; its final zero explicitly
means authority is incomplete. The delta never controls success. Changing the
resident mantissa by one records delta five and still leaves terminal authority
false. The four-unit observation is a regression fingerprint, not a source
policy, mathematical enclosure, general regulator proof, or unit-saturation
certificate.

Run:

```bash
node bench/pari-class-group-port/check_unified_full_h1_root.cjs
```
