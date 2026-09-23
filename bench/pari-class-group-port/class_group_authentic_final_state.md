# Authentic `h=1` final-state frontier

`class_group_authentic_final_state.py` joins the currently available live
outputs for the qualified totally real cubic
`x^3 - 20018*x + 20034`. It deliberately publishes an **incomplete** result:
the resident unit reconstruction stops with `fupb_PRECI`, so neither Phase 5
nor the public class-and-unit result is complete.

The joined class-side evidence is authentic rather than synthetic:

- the active relation matrix is `A = hnf_matbnew`, of shape `8 x 15`;
- the active presentation is the trailing `8 x 8` block `H` of `hnf_full_h`;
- the live relation/HNF checker derives `R2P` and `P2R` and replays
  `A R2P = H` and `H P2R = A`;
- the live Smith leaf obtains `D = I_8`, class number one, and no nontrivial
  invariant factors;
- the class-generator list is therefore genuinely empty; and
- live Buchall arrays retain explicit shapes. In particular, `M1`, `Ga`,
  `Ge`, and `GD` have zero cells only because their active-class dimensions
  are zero. `Ur`, `M2`, and the transformed logarithm array `ga` remain
  nonempty.

The unit bridge runs prepare, rank-two factorization, signed reconstruction,
and provenance composition from the pinned fixture. Its immutable frontier
records the exact `fupb_PRECI` state and the retry requirements:

- packed logarithm precision: 2176 bits;
- embedding precision: 2240 bits; and
- working capacity: 2304 bits.

The unit-component slot stays `None`. A later precision retry can supply the
existing connected-final-state `UnitComponentOutput`; no schema change is
needed. Exact ideal replay, exact unit principality and norm replay,
factor-base authentication, and rigorous regulator acceptance also remain
listed as unverified requirements.

## Publication and replay

`AuthenticFrontierPublisher` canonicalizes and validates before taking its
lock, then publishes exactly once. Repeated publication of the same state is
idempotent. `cold_replay_authentic_frontier` requires both internal hashes and
an out-of-band publication hash, and independently checks the relation/HNF and
Smith identities, the shaped Buchall state, empty-generator semantics, unit
provenance, and the exact incomplete terminal claim.

Run the focused live checker with the qualified resident output:

```bash
node bench/pari-class-group-port/check_class_group_authentic_final_state.cjs \
  /tmp/sagejs-resident-generated-class-3qtnS5/output.json
```

The checker executes ordinary CPython leaves, performs concurrent idempotent
publication, and rejects stale-hash and coordinated/rehashed mutations,
including false-empty and wrong-shape zero-dimensional arrays.
