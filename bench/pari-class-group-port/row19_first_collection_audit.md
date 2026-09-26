# Row-19 first authentic collection pass

Status: executable development evidence; relation collection only, with no HNF,
class-group, unit, or regulator claim.

`row19_first_collection_host.cjs` connects the committed prepared-only row-19
prefix to the existing source-translated `pari_collect_and_log_relations`
kernel.  The live worker receives only the authenticated prepared `nfinit`
projection and the prepared prefix.  Its bounded owners have 424 factor-base
rows, 4,350 relation slots, and two logarithmic places.  The initialized 71
relations are retained byte-for-byte while the first authentic small-norm search
adds 352 relations and stops at PARI's first HNF boundary:

```text
before  [71,4350,353,6,0,430]
after   [423,4350,7,0,0,423]
logs    423
```

The host constructs the identity `minidx` map appropriate to this no-
automorphism corridor, reuses the live factor permutation as PARI's first
small-norm search order, and allocates every mutation owner explicitly.  It
does not execute the following HNF or the final seven-relation append.

`check_row19_first_collection.cjs` authenticates pristine W0 SHA-256
`0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9`,
extracts only `.prepared`, derives the committed prefix in a separate Python
process, and runs the native collector under a 4 GiB address-space limit, a
600-second CPU/wall limit, and a 384 MiB V8-old-space limit.  Answer-bearing W0
events are first parsed after that worker exits.  At that point the checker
compares exact SHA-256 projections of all 423 dense relation columns,
logarithm columns, source hashes, provenance metadata, and exact generators.
It separately compares the 71-column initial relation/log prefixes.

The first authenticated run completed in 25,809,873,284 ns with 559,064 KiB
maximum RSS and a 76,368,212-byte explicit owner upper bound.  Its exact
postcompute projections were:

```text
relations   67bff62f49af3bd6e8e5840ef3f0fbe9e16c2b67d3a655733ef38a04bdd3c32e
logs        3a50e2740161c6681b955af95ed065894dd2195ad51af6163442da56d0fd9cf4
hashes      9b1e880094c4a10832c5ec52215ec1c0363c9c982c55a5f427f492154a8192cb
metadata    0b5fa3af6b2faa892535eb28e41139091af0c12c1a2505c37bfd44a41aabe6f4
generators  61942ed1c5ecad699d47cbe5eb09ec865829577d5f8b02cb1352eac33ccccbfd
```

Reproduce with:

```sh
node bench/pari-class-group-port/check_row19_first_collection.cjs
```
