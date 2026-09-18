# Row 14 resident Gate-C handle boundary

This audit corrects a timing-boundary defect in the first row-14 resident
matched-kernel experiment. It is a single exact diagnostic, not an alternating
qualification result and not evidence for the frozen 24-field panel.

## Defect

`prepareResident` compiled the initial prepared root and terminal suffixes
before the mathematical clock, but `runPreparedGateC` still called
`compileKernel` for the collector, `hnfspec`, continuation controller, and
`hnfadd` after the clock started. The calls found or rebuilt content-addressed
native addons, but they still parsed, lowered, generated, and inspected large
dependency graphs. The existing exclusive profile measured 50.162 seconds in
those calls. Consequently the old clock did not satisfy its stated
"compilation outside timing" boundary.

`warmPreparedGateC` now returns one frozen four-handle set. `prepareResident`
owns it before the clock, and `runPreparedGateC` consumes those exact handles.
The returned execution evidence records zero compilation inside the run, four
resident handles, and their four cache keys. The matched checker and the
alternating coordinator fail closed unless that evidence is present.

## Exact diagnostic

The immediately preceding uncorrected verification had receipt SHA-256
`e7fa7ec52882713c43ac47f804bae0a5779e0e217067922469f5867e03809fe4`:

```text
Sage.js complete mathematical clock       88.280856420 s
Sage.js relation/HNF stage                86.546872869 s
PARI 2.17.4 bnfinit0                       2.039775144 s
Sage.js maximum RSS                    1,504,916 KiB
```

The corrected run used the same prepared field, same mathematical source, same
native arithmetic, same capacities, and same output checks. Its receipt at
`/tmp/row14-matched-resident-handles-20260918.json` had SHA-256
`b483d223c29186fecf5555799888ec164914aaed18b7e73805687d2ef85d1f18`:

```text
Sage.js complete mathematical clock       37.038292375 s
  initial prepared root                    1.370964979 s
  factor metadata                          0.001966520 s
  relation collection and HNF             35.348026214 s
  accepted-state projection                0.000115800 s
  terminal analytic/unit lattice           0.247624534 s
  unit/getfu                                0.015743440 s
  class generators                         0.053850888 s
PARI 2.17.4 bnfinit0                       2.016838684 s
Sage.js maximum RSS                    1,137,188 KiB
```

Thus the corrected boundary removes 51.242564045 seconds, or 58.0% of the old
Sage.js interval, without changing the algorithm. The remaining single-run
ratio is about 18.36x, but no ratio is promoted from one observation.

Both runs agree exactly on class number 192, normalized invariants `[8,24]`,
both generator-ideal HNF matrices, regulator, torsion, work shape, and all 66
terminal RNG words. The six unit logarithms agree with PARI by 110--115 leading
bits, above the fail-closed 96-bit threshold, and all five semantic mutations
are rejected.

## Next gate

The checked 11-pair ABBA/BAAB coordinator now enforces this resident-handle
boundary. It has not been run. The remaining 35.35-second relation/HNF interval
still includes about 12 seconds of host materialization/allocation from the
earlier profile and about 19 seconds of native roots. Reusable typed transaction
storage is therefore the next same-algorithm mechanism; compiler/private-graph
changes should follow only after that host boundary is removed and remeasured.

Reproduction:

```bash
prlimit --as=4294967296 --rss=4294967296 --cpu=600 -- \
  node --expose-gc \
    bench/pari-class-group-port/check_row14_matched_kernel_clock.cjs
```
