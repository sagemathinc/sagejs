# Row-19 principal class-group owner

Status: complete immutable class-group-internal owner. The only remaining
boundary is joining the separately authenticated rank-one unit owner and
packaging the public result.

## Authenticated inputs

[`row19_class_group_principal_owner.py`](row19_class_group_principal_owner.py)
accepts no W0 class/group/generator answer. It binds these immutable inputs:

- terminal continuation owner `f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76`;
- first-HNF owner `076d334e302d880b2a7da80366fe492d62b118e2a495f15c422908137aa66258`;
- prepared authority `1b3e3f6f97701556492edfe8576bf1337537096bb4d5eda357d7f92fc2fa5c35`;
- the freshly recomputed prepared-prefix projection.

The worker pins independent semantic hashes of the first cleanup transform,
both HNF transforms, all 430 relation records, and all 430 principal
generators. Mutating any of these authenticated computations fails closed.

## Raw-to-terminal relation map

The owner reconstructs the full 430-by-430 integer map from raw principal
relations to terminal HNF columns. It composes the 423-column cleanup map,
the active 84-column first HNF transform, both descending `hnffinal` tail
quotient schedules, the exact unit/nonunit permutations, seven `hnfadd`
adjustments through retained `B`, and the final 16-column HNF transform. It
checks the entire 424-by-423 first-stage valuation product against `W/dep/B`
and the entire 424-by-430 terminal product against `W/B` plus all 415 unit
tail pivots. Its 184,900 entries have SHA-256

```text
21ecc1bbcda3511c8af06d6e387f039d6ebee29c0db57aa8131c06136acdec95
```

Applying `M1` to the nine terminal class columns gives an explicit raw
principal-relation coefficient vector for every `J_j^d_j`. Each witness
retains the corresponding exact factored algebraic number and independently
replays its 424 factor-base valuations. Each resulting vector is required to
equal the complete sparse valuation vector of `J_j^d_j`, including zeros in
all other 423-prime coordinates. The nine factored witnesses contain
respectively 353, 355, 354, 353, 353, 353, 354, 353, and 352 nonzero factors.
Together with the presentation witnesses, this proves the exact generator
orders `6,3,3,3,3,3,3,3,3` and class number `39366` at the retained relation
boundary.

The witness exponent rows are independently interpretable: the same owner
contains all 424 ordered prime-ideal HNFs, norms, rational primes,
ramification indices, residue degrees, inert flags, local generators, tau
matrices, and catalog indices. A single projection hash binds that full
factor base (`fae3cead1f6c3d551af2044ffeac26f681397899de1d38b0428677446e56c16a`);
every 424-entry witness valuation vector explicitly names these ordered HNFs
as its coordinates.

## Final class-group internals

The owner contains all Smith and inverse-HNF matrices
`D,U,Ui,V,Ur,Y,Uir,X,M1,M2`, the nine reduced ideal HNFs, the full retained
factor base, `Ge`, `Ga`, `GD`, `ga`, and the six-component `clg2` object.

The HNF logarithms are not fed directly to `class_group_gen`. The new
[`row19_mixed_cubic_cleanarch.py`](row19_mixed_cubic_cleanarch.py) translates
the pinned PARI `cleanarch` schedule for signature `(1,1)`: it normalizes the
product formula, reduces the real-place argument modulo `2*pi`, and the
complex-place argument modulo `4*pi`. All 424 suffix columns publish
transactionally. This explains the earlier apparent 192/256-bit mismatch:
the requested precision is 192 bits, while the pi constant involved in the
argument correction has PARI's 256-bit stored precision. The cleaned suffix
hash is

```text
a12c73a2e5fb6cbbe7792a81818a4f3dcea7a5abf86c1d0565aef53a10c6ad0d
```

Only after publication does the checker open W0. `Ur`, `ga`, `GD`, `M1`, and
`M2` then agree entry-for-entry, including every packed mantissa, precision,
and exponent. W0 is a differential oracle, never a runtime owner.

## Immutable artifact and reproduction

The accepted content-addressed owner is:

```text
/scratch/sagejs-row19-class-group-principal/
  row19-class-group-principal-1a080b32e3f54e10eb9d525bc0dae139e22d3b1f63defbe332dc0e193f1632e1.json.gz
owner SHA-256:      1a080b32e3f54e10eb9d525bc0dae139e22d3b1f63defbe332dc0e193f1632e1
compressed SHA-256: 8984679d4f8451192d803fef7787235e74f541c2c86a018e0d8584aff2f016ab
```

It is read-only and reproducibly republished by
[`row19_class_group_principal_coordinator.cjs`](row19_class_group_principal_coordinator.cjs).
The coordinator exports `readGzipOwner`, `verifyOwner`, `publishOwner`, and
`buildOwner` for the final composer.

```sh
node bench/pari-class-group-port/check_row19_class_group_principal_owner.cjs
```

The checker verifies idempotent publication, rejects seven output mutations and
three semantic-source mutations, then performs the postcompute W0 comparison.
The owner truthfully leaves `unitsJoined` and `publicComplete` false; its exact
remaining boundary is the public class-and-unit result adapter.
