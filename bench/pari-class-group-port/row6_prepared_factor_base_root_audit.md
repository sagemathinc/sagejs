# Row-6 prepared factor-base frontier audit

## Result

The authenticated row-6 real cubic now reaches the factor-base frontier from
prepared maximal-order data in one native call.  It reproduces the frozen PARI
2.17.4 trace exactly:

```text
polynomial (ascending)   [2000000000018, -2000000000010, 0, 1]
signature / index                              (3,0) / 3
C1 = C2                                           9,196
KC = KC2                                          1,130
KCZ = KCZ2                                          740
subfactor indices                            [3, 5, 7, 9]
automorphism permutation                               []
```

This is a genuine capacity falsification of the earlier 1,024-ideal policy.
The public admission ceiling was fixed at 2,048 before execution; the live
result admitted 1,130 ideals.  The frontier deliberately allocates **zero**
relation-matrix and HNF-matrix cells, so it does not turn the larger factor
base into an accidental multi-gigabyte quadratic owner.

The successful native invocation took `859,149,050 ns` (0.859149 seconds).
The capped child reported `743,024 KiB` maximum RSS.  This high-water mark
includes compiler/runtime infrastructure and all eager factor-base descriptor
owners.  It is not a standalone packed-buffer size.

## Prepared boundary and index-prime closure

[`row6_prepared_factor_base_root.py`](row6_prepared_factor_base_root.py) accepts
only authenticated maximal-order data, exact embeddings and neutral exhaustive
runtime prime/product tables.  It does not accept a successful bound,
factor-base descriptor, permutation, subfactor choice, relation, HNF state, or
capacity derived from the result.

This field exposed a real dependency not present in the index-one row-14 root:
the rational prime 3 divides the equation-order index.  Consequently the
defining-polynomial-mod-3 Kummer shortcut is mathematically invalid and the
existing catalog correctly rejected it.  The row-6 root now connects the
already translated maximal-order path:

```text
integral multiplication table
  -> p-radical
  -> etale quotient and recursive split
  -> prime complement
  -> uniformizer / prime descriptor
```

That live computation obtains one prime above 3 with `e=3`, `f=1`, generator
`[-1,0,1]`, and the exact PARI multiplication matrix.  Its residue degree is
then merged into the otherwise ordinary `get_fs` catalog.  The ordinary
Kummer traversal skips only this index prime and the independently constructed
descriptor is inserted at its source slot.  Thus no frozen prime packet or
answer-derived splitting pattern crosses the invocation boundary.

The index-prime dependency graph reuses one 2,048-cell exact workspace.  The
factor-base result uses a separate field-neutral 2,048-ideal ceiling.  Neutral
runtime prime products require 1,470 64-bit limbs, below their independent
2,048-limb ceiling.

## Oracle discipline and evidence

The frozen W0 is

```text
/scratch/sagejs-pari-development-panel-a998/panel-06-26fed17015f6479f.json
SHA-256 2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5
```

The manifest records prepared-event SHA-256
`851979721cd098271103588af037b2744b99d84ca4752161efc6ab3dd1974a08`.
The checker streams only the 98 KiB prepared event, authenticates it, and sends
its positive normalized projection to a child capped at 4 GiB address space,
600 CPU seconds and 600 wall seconds.  The 203 MiB W0 object is never parsed
into the native child.  Only after that child exits does the checker
stream-extract the roughly 0.8 MiB PARI factor-base event as a cold oracle.

All 1,130 descriptors agree, including prime, generator, ramification and
residue degrees, and every `tau` entry.  The 740 rational-prime prefix, the
1,130-entry permutation, RNG state, subfactor base and empty automorphism
permutation also agree.  The retained owner additionally contains the live
ideal HNF packets, norms, bad flags and identity minimum-index map.

The first successful receipt retained the following digests:

```text
owner             26854acc8a11c9fc513dd70476d48c7dcb3a25256dde81afe68cb5f321be4ff2
compressed owner  4e05a9d132950677eda68e24f1a9a1c633323e856eff62f62d3c401003644842
descriptors       a85f3e028f96c9f5f29765e5053991ea2f73ccedb90785e11469d74d4d053ea7
packets           a980b1229a9ffaa8a155ad551ceaa91d180c402fd924232ed79bc7c2f3255571
factor owner      931f686a6c3704be2588731f668c960b0f42389693d5c1aa74121ea48af545c4
```

The content-addressed owner is 482,792 bytes uncompressed and 105,086 bytes
gzip-compressed and is published mode 0444.  Three prepared-input mutations
are rejected independently.  Six owner mutations cover ancestry, counters,
an index-prime descriptor, subfactor selection, capacity policy and forbidden
relation allocation.  Mutating cold-oracle answers cannot change the already
executed child projection.

## Scope

This closes the row-6 prepared factor-base frontier only.  It does not allocate
or collect relations, run HNF/SNF, compute units, or claim a class group.  In
particular, continuing row 6 must choose a bounded sparse/reused representation
for the 1,130-row relation and HNF stages; naively applying the earlier dense
owner layout is explicitly not justified by this result.
