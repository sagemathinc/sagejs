# Row-19 prepared prefix reuse probe

Status: honest executable development cut; not qualification evidence and not
a complete class-and-unit computation.

## Boundary and result

[`row19_prepared_prefix_probe.py`](row19_prepared_prefix_probe.py) composes the
existing translated PARI 2.17.4 arithmetic in ordinary Python.  Its only
mathematical input is the authenticated prepared `nfinit` projection for
frozen row 19.  It receives no successful bound, factor-base descriptor,
subfactor choice, relation, HNF state, class invariant, or unit.

The live path computes the maximal-order decompositions at every prime
dividing the equation-order index

```text
254541 = 3 * 7 * 17 * 23 * 31,
```

merges them with the ordinary Kummer catalog, selects and constructs the prime
ideal packets, chooses the subfactor base, and initializes PARI's rational
relation cache.  It reproduces the frozen source boundary exactly:

```text
field               x^3 - 51050867718180330
signature / index   (1,1) / 254541
C1 = C2             3440
KC / KCZ / KCZ2     424 / 307 / 307
subfactor           [12,14,16]
initial relations   71
target / need       430 / 359
relation state      [71,4350,353,6,0,430]
```

All 424 selected descriptors agree with PARI, including `p,e,f,u,tau`; the
424 exact ideal-HNF packets are constructed live; and the full 424-by-424
initial basis plus all 71 dense relation records, hashes, metadata, and exact
principal generators agree.

The current probe is a CPython orchestration over source-transparent kernels,
not yet a single compiled root.  One observed execution, including process
startup and imports, took 975,036,194 ns.  This timing is diagnostic only.

## Oracle discipline

The checker authenticates pristine W0 SHA-256

```text
0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9
```

and sends only its normalized prepared projection to the probe process.  The
prepared authority SHA-256 is

```text
1b3e3f6f97701556492edfe8576bf1337537096bb4d5eda357d7f92fc2fa5c35
```

Answer-bearing W0 events are consulted only after that process exits.  Three
prepared-input mutations are rejected.  Mutations to the factor-base bound,
first descriptor, and first retained relation leave the child payload
unchanged.  The observed live digests are:

```text
source       00ee1b9b8ce19a48091efa7175cd28d93fc03e469088ba3f10d8f0aac144ba99
descriptors  6d08d576823fac4331cb03afe83280bed60bb702448c7e3c50813eed9790b3ae
packets      09aa2ead548aaa755a8c950a3400f814980c0cbd5efec4d11097a0a29841b851
relations    c2e6b2ff92dd61fdd86652a853f8e33d7288ba42f2512a7939a5e3bfb01362e8
```

## Exact next cut

No new mathematical primitive was needed to reach the initial 71 relations.
The first missing connected cut is a row-19 retained-owner/collector adapter
into `pari_collect_and_log_relations`, analogous to
`row6_prepared_gate_c_host.cjs::collectorInput`, with these derived dimensions:

```text
degree=3, real places=1, places=2
rows=424, target=430, reserve=4350
initial relations=71, missing=353
```

That adapter must consume the prepared prefix owner without W0 and run the
first authentic collection pass to 423 relations.  The following HNF and
seven-relation append remain subsequent cuts; this probe makes no claim about
them.

## Reproduction

```sh
node bench/pari-class-group-port/check_row19_prepared_prefix_probe.cjs
```

The check also establishes that random relation search was not executed.
