# Row 18 Phase-6 resident root

Row 18 now has one compiled mathematical boundary from authenticated prepared
NF data through its rejected 47-relation initial attempt and accepted
49-relation retry. `row18_phase6_resident_source.cjs` mechanically emits an
explicit typed Python ABI from the two reviewed source signatures. Reflection
is confined to compile preparation; emitted mathematical source contains no
`inspect`, `deepcopy`, Python allocation, subprocess, filesystem, replay, or
publication work.

The root calls `pari_resident_generated_class_attempt`, retains its live
owners, reconstructs selected retry descriptors in bounded storage, and calls
`pari_prepared_class_group_resumable`. Twenty-six retry owners are separate
because the ordinary Python path changes their logical length; native buffer
capacity is observable through `len()` and therefore cannot safely reuse the
initial graph's zero-capacity or oversized placeholders. All other owners are
reused directly.

The inclusive clock surrounds exactly one native entry call. Authentication,
compilation, allocation, result inspection, class-witness replay, exact-unit
factorback and publication remain outside it. The live projection is the
reviewed mixed cubic, class number 18, invariant factors `[18]`, unit rank one,
nonzero regulator, factor-base size 41, 49 terminal relations and kernel rank
eight. The existing fresh transaction independently reconstructs the exact
order witness and exact norm-one unit from those terminal owners.

Validation uses an address-space/RSS limit of 4 GiB and CPU/wall limit of 600
seconds. It rejects a changed prepared polynomial before compilation, verifies
the 415-owner explicit ABI, and rejects reflection or process/filesystem calls
in the emitted root.

```sh
prlimit --as=4294967296 --rss=4294967296 --cpu=600 -- \
  timeout 600 node --expose-gc \
  bench/pari-class-group-port/row18_phase6_resident_check.cjs \
  /scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-18-6d8bf8dae39c664783ebf105c6186cdfa7554b98693d512b16c3b294147c6cbc.json
```
