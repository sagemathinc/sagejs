# Optimization engine workload contracts

`campaign2-specifications.json` is the checked mathematical and public-boundary
definition for the mature-capability calibration campaign. The constructor in
`bench/optimization-engine/campaign2-workloads.cjs` turns those definitions
into six content-addressed optimization workload v2 documents: representative
and held-out workloads for dense integration, cubic factorization, and
hyperelliptic normalization.

The workload source closure hashes every listed source file. The corpus digest
hashes the exact generator or pinned record set, and each oracle digest hashes
its independent contract. The workload identities therefore change when the
candidate source, public route, corpus, or oracle changes.

The discovery evidence schema intentionally contains no historical timing
defaults. A bundle is actionable only when it binds the current epoch and has
both roles, exactly 11 alternating `ABBA`/`BAAB` pairs, exact output digests,
the complete reviewed cost boundary, per-pair crossings/copies/allocations,
balanced resource lifetimes, mature-capability identity, fallbacks, and
negative alternatives. Missing interruption authority produces `investigate`;
a fast phase below the complete-public threshold produces `reject`.

Useful commands:

```sh
node bench/optimization-engine/campaign2-discovery.cjs contracts
node bench/optimization-engine/campaign2-discovery.cjs plan dense-integral-representative
node bench/optimization-engine/campaign2-discovery.cjs measure dense-integral-representative epoch.json dense-integral-evidence.json
node bench/optimization-engine/campaign2-discovery.cjs adjudicate epoch.json bundles.json
```

The bench-only `integral-library-candidate.py` demonstrates the lawful FLINT
block decomposition without changing the production dispatcher. Its exact
witness covers multiple characteristic holes, derivative replay, complete
result equality, deterministic boundary counts, and the untouched singular
exception path.
