# Exact class-group transformation oracle

`check_class_group_transformations.cjs` captures the exact integral-matrix
prefix of PARI 2.17.4 `class_group_gen`. It is an oracle and evidence producer,
not a Sage.js implementation and not a complete class-group computation.

## Source boundary

The captured schedule is the prefix at `src/basemath/buch2.c:3115-3156`:

```text
Dfull = ZM_snfall(W, &U, &Vfull)
Ui    = ZM_inv(U)
Ur    = ZM_hnfdivrem(U, Dfull, &Y)   # Ur = U + Dfull Y
Uir   = ZM_hnfdivrem(Ui, W, &X)      # Uir = Ui + W X
M2    = X Ur + Vfull Y
D,V   = nontrivial leading column prefixes of Dfull,Vfull
M1    = V + X D
```

PARI constructs `M2` before shortening `D` and `V`, but constructs `M1` after
shortening them. The fixture therefore retains both `Dfull,Vfull` and the
source-visible active prefixes `D,V`. Matrix entries are decimal strings in
column-major order, with dimensions determined by `n` and `active`.

The checker independently replays these identities with JavaScript `BigInt`:

- `U W Vfull = Dfull`;
- `U Ui = Ui U = I`;
- `Ur = U + Dfull Y`;
- `Uir = Ui + W X`;
- `M1 = V + X D`;
- `M2 = X Ur + Vfull Y`.

It additionally checks the Smith diagonal, decreasing divisibility, exact
active prefixes, input preservation, and direct Bézout identities.

## Cases and convention detection

The caller supplies an already-qualified collector fixture. Exactly two actual
GMP collector outputs must be full-rank; these become the authentic `W` cases.
The checker does not contain their entries or a fallback path to `/tmp`.

Two synthetic upper-HNF matrices use consecutive `F399`, `F400`, and `F401`.
They force both operand orders of a multiword Bézout step. Their exact `U` and
`V` matrices and direct PARI `(gcd,u,v)` triples are retained. Comparing only
`D`, determinants, or transformation identities would miss a different but
valid Bézout convention; a candidate must match `U`, `V`, and the triples
entry-for-entry.

## Provenance and artifact policy

All paths are mandatory caller inputs. The checker rejects a source tree or
archive whose pinned `buch2.c`, `hnf_snf.c`, or archive hash differs from PARI
2.17.4. It records the resolved `libpari` binary hash, generated oracle-source
and oracle-binary hashes, collector-input hash, serialized-input hash, raw
output hash, and final evidence hash.

The caller-provided artifact directory must not exist. The checker creates it
once and writes `fixtures.json` with exclusive-create semantics, so rerunning a
qualification cannot silently replace prior evidence. The build path and
binary hash remain explicit because source hashes alone cannot prove which
library a compiler linked.

Example invocation:

```bash
node bench/pari-class-group-port/check_class_group_transformations.cjs \
  --pari-source /path/to/pristine/pari-2.17.4 \
  --pari-build /path/to/pristine/pari-2.17.4/Olinux-x86_64 \
  --archive /path/to/pari-2.17.4.tar.gz \
  --collector-fixtures /path/to/frozen/collector-fixtures.json \
  --artifact-dir /path/to/new/evidence-directory
```

The result does not cover `genback`, reduced ideal generators, `nf_cxlog`,
`Ga/Ge/GD/ga`, units, regulator reconstruction, honesty, or final BNF
publication. It makes no timing claim and does not turn a candidate relation
matrix into a completeness proof.
