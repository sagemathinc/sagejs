# Row 23 cyclic class presentation and generator witness

This lane starts only from the authenticated row-23 prepared field. It reruns
the live 31-ideal factor-base construction and the connected 40-relation HNF
root committed in `07f738800`. The answer-bearing W0 events remain unopened
until the immutable owner has been composed, authenticated, and published.

The live HNF has one nonunit row and terminal presentation `W=[6]`. Its two
retained column maps are composed exactly:

```text
raw relation matrix R (31 x 40)
  * cleanup transform T[:,0:13]
  * HNFLLL transform V[:,9]
  = 6 e_0.
```

Column 9 is selected from live state, not from W0: HNFLLL has four rows,
thirteen columns, nine zero columns, and diagonal markers `[0,1,1,1]`. The
resulting signed 40-entry coefficient vector has 22 nonzero entries. Its live
principal generators are retained as a compact famat witness for
`P_0^6=(product alpha_i^c_i)`; no enormous expanded field element is formed.

The translated Smith suffix executes at dimension one and publishes all of
PARI's class-group matrices:

```text
D=[6], U=Ui=V=Ur=Uir=M1=[1], Y=X=M2=[0].
```

Thus the relation-lattice quotient is cyclic of exact order six, its selected
generator is the first terminal factor ideal, and proper divisors 1, 2, and 3
are rejected by the Smith presentation. The live ideal is the prime above 7
with row-major HNF

```text
[7,2,3,2,6, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0, 0,0,0,0,1].
```

After publication, W0 confirms that PARI's reduced `genback` result is exactly
this ideal. That comparison does not enter the owner. The owner deliberately
stops short of claiming a source-derived reduction: generic degree-five
`idealred` and exact degree-five ideal-product replay have not yet been ported.
It likewise does not join the separately computed analytic acceptance owner.
These omissions are explicit completion bits rather than inferred success.

The checker rejects ten output mutations and eight semantic input mutations,
checks read-only content-addressed gzip publication and idempotence, and only
then opens W0 for the class-number, invariant, HNF, and reduced-ideal oracle.

The retained publication is:

```text
/scratch/sagejs-row23-class-witness-owner/
  row23-cyclic-class-witness-beafd37a044a22ae3fdb8996993901b69aee39dec2095d444d88596344a69b50.json.gz
plain SHA256       beafd37a044a22ae3fdb8996993901b69aee39dec2095d444d88596344a69b50
compressed SHA256  38c48a831e9e95dea877220522d1304c0bb370b3c07423eaa4213f9dc0fb7dd3
plain bytes         4950
compressed bytes    2063
```

Run with a lane-private cache:

```bash
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-native-cache-row23-class-witness/cache \
SAGEJS_NATIVE_CACHE_ROOT=/scratch/sagejs-native-cache-row23-class-witness/root \
node bench/pari-class-group-port/check_row23_class_group_witness.cjs
```

The reported time is an unqualified Linux development-host observation.
