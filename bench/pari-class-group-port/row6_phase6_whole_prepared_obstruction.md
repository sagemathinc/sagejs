# Row 6 whole-prepared closure evidence

The f06f whole-root milestone joins the prepared-input prefix, the former
Gate-C/ancestry middle, and the terminal class-and-unit suffix into one
source-transparent native call. The generated
`row6_phase6_whole_prepared_root.generated.py` root starts at the authenticated
prepared number-field input and directly calls the genuine row-6 factor-base
and initial-relation roots. It then runs all 14 authentic collector passes,
the initial HNF, both `hnfadd` continuations, reverse column-ancestry replay,
analytic inverse-hR acceptance, post-HNF/Smith arithmetic, rank-two unit
reconstruction, factor-base and principal-equation authentication, and class
witness projection without returning to the host between those stages.

The connected root retains the live relation, log, HNF-cleanup, continuation,
ancestry, class, and unit owners. It does not destroy and reconstruct collector
scratch at a host boundary, copy relations through `toArray()`, rerun a
detached ancestry HNF, or cross a subprocess, filesystem, JSON, or
mapping-shaped owner boundary inside native execution. There are no host
copies between the connected native stages. Output inspection and projection
do make host copies, but only after the native call has returned and therefore
outside the native execution boundary. The admission factor product is taken
from the live factor-base state rather than the frozen oracle owner. A second
invocation with the same publication owners fails closed, and an authenticated
prepared-input mutation is rejected.

The exact row-6 replay agrees for all 1,137 relations and logs, final HNF
`h/dep/b/c`, the permutation, the complete raw-to-unit and
raw-to-presentation ancestry maps, accepted archimedean rows, signs, and
phase-`pi` data. It returns class number `4`, invariant factors `[2, 2]`, and
the exact rank-two unit result. Generated-source freshness is regenerated and
checked byte for byte; the on-disk and regenerated source SHA-256 are both
`ebca828faf28701ff170b9145d78c6847c1eabcd910a8474c1409276261979b9`.

## Capped validation receipt

The current graph passed under a literal 4 GiB address-space limit and a
600-second CPU limit with Node 26's JIT disabled. Disabling the JavaScript JIT
is a correctness-harness resource control: preparation and inspection are not
timed, while the mathematical kernel is the authenticated native addon.

```bash
/usr/bin/prlimit --as=4294967296 --cpu=600 -- \
  node --jitless --max-old-space-size=512 --expose-gc \
  bench/pari-class-group-port/row6_phase6_whole_prepared_check.cjs
```

The final persisted whole-root receipts are:

- `/scratch/row6-phase6-whole-prepared-check-v1.json`, SHA-256
  `a6c1729e8099c687a7d4134be2a8e5f89b4ef749c489f6b7bd2948a9b50f273d`;
- `/scratch/row6-phase6-whole-prepared-check-v1.resource.txt`, SHA-256
  `371e3b4c9f9a3b2a8e851009560d7535e66f9b9ce78ab6d8e310498b6afd12a7`;
- `/scratch/row6-phase6-whole-prepared-check-v1.stderr.txt`, empty, SHA-256
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

The sampled run exited zero after 65,236,359,606 ns. Across 1,173 `/proc`
samples it reached 595,336 KiB maximum `VmRSS`/`VmHWM` and 3,225,152 KiB
maximum `VmSize`/`VmPeak`. It used authenticated compiler cache key
`d55bb2b7406a041ed50a6a4a8071c6bcd638d47082bc71ee3f0e25accd50fdcc`.

The earlier Gate-C-prefix receipt's
`capacityAudit.packedBytes = 1,865,177,948` is deliberately
narrower than total process or resident-owner storage. It covers exactly the
90 HNF, continuation, and ancestry `IntegerBuffer` owners inspected by that
audit. It excludes prepared factor/initial and collector owners as well as
`Int64Buffer` and `Float64Buffer` storage. Every one of those 90 audited owners
is checked to remain at or below its allocated capacity and the complete
90-owner ledger is hashed. The 88 ordinary owners require strict transactional
headroom; the two compact HNF arena owners may exactly fill their capacity.
Explicit frozen-row high-water values are pinned for 18 of the 90 owners; the
earlier receipt does not claim that all 90 high-water values are independently
pinned. This owner-capacity audit remains supporting evidence; it is not a
claim that the final whole-root process allocated only that many bytes.

## Remaining qualification work

The stale native-call obstruction is closed: the terminal class/unit suffix is
no longer a separate invocation. This does **not** complete Phase 6 or publish
a performance claim. Timing remains disabled until the full matched v2
Sage/PARI adapter and approved host establish identical clock boundaries,
fresh-owner lifecycle, alternating samples, and the plan's independent replay
and qualification gates. The present receipt is correctness and resource
evidence for the development row, not a qualified benchmark.
