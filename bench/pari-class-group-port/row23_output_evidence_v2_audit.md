# Row 23 complete output-evidence v2 boundary

## Result

Row 23 now publishes a valid
`sagejs.pari-class-group/class-unit-output-evidence-v2` sidecar. The sidecar
is bound to retained terminal source
`fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318`,
neutral correspondence
`5e993b9b3434c9e097531a34254bce07a832e6e4f436a45c4ae77e3ad69d4f8c`,
and raw Smith proof
`d81fd9858417a3f13ec6c65bf5de535923cfe5bdc19090755f2178ebea7ba350`.
Its canonical digest is
`d0975e456e5509e8a788fdc7a493b2271c1235f2699820f173edc6015ffd53d1`.

This closes the evidence boundary; it does not change the retained final
result's separate `publicComplete=false` status and makes no timing or
qualification claim.

## Same-run relation and logarithm evidence

Starting only from the immutable prepared row-23 item, the checker recomputes
the factor base and complete relation/HNF transaction. Before those owners
leave the process, `row23_logs_supported_maps_owner.cjs` requires:

```text
relation state       [40, 450, 0, 1, 0, 40]
completed logs       40
relation matrix      40 x 31
packed relation logs 40 x 35
```

It binds the relation matrix both to the raw Smith input and to the retained
terminal source. The 1,400 packed log words are copied from the actual
`log_embeddings` owner, not reconstructed from a terminal fixture. The
log/map receipt has transaction-local `WeakSet` authority and fails closed if
copied or synthesized.

## Raw presentation

The raw proof has `U` 40-by-40, `W` and `D` 40-by-31, and `V` 31-by-31. The
adapter starts from identities and `W`, replays all 2,227 primitive operations
(including 2,164 determinant-one Bezout certificates), and proves
`U W V = D`. The normalized diagonal is 30 ones followed by 6. The final nine
rows of `U` are retained as explicit dependency evidence.

## Supported-ideal maps

`row23_supported_ideal_maps.py` implements the public map domain

```text
arbitrary integral degree-five ideal HNFs whose complete prime-ideal support
is contained in the retained 31-prime factor base
```

Factor uses the translated prepared prime-ideal valuation algorithm and a
complete norm-support check. An ideal with any outside support fails closed.
The Smith identity maps an authenticated factor tape to `C6`: multiply by
`V`, reduce the final coordinate modulo 6, select the published generator
representative, then multiply the exactly divisible diagonal coordinates by
`U` to recover a signed combination of the 40 principal relations. Combine
adds signed factor tapes and repeats the same reduction.

The focused replay proves all 31 factor-base-prime round trips, the published
class generator maps to 1, generator plus generator maps to 2, the identity
maps to 0, every returned relation witness replays exactly, and outside norm
support is rejected. No external PARI process or answer fixture participates
in these map calls.

The bounded Smith reduce/combine core is ordinary readable Python compiled by
Sage.js to the GMP native backend. Four probes execute through that native
entry point, including the actual class-generator factorization. The ideal
HNF factor front end remains ordinary CPython-parseable Python calling the
translated exact valuation primitive; evidence says this explicitly and does
not mislabel the full factor front end as native.

## Focused check

```bash
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 \
node bench/pari-class-group-port/check_row23_output_evidence_v2.cjs \
  /scratch/sagejs-row23-final-result-correspondence-v3/\
row23-final-fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318.json.gz
```

The check authenticates all authorities, validates the complete shared v2
schema, checks four exact units and regulator evidence, executes four native
map probes, and rejects source, receipt, Smith transcript, copied live owner,
and structural v2 mutations.
