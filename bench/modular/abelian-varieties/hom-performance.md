# Complete Hom/End performance and exact Sage comparison

Timed workload: construct `J0(N)` and force all generators of its complete
endomorphism group over QQ (`End(J).gens()` in Sage.js, `Hom(J,J).gens()` in
Sage). Startup is excluded; every sample is a fresh process without mathematical
warmup. Three sequential samples per system on the shared AMD EPYC 7B13 Linux
x64 host, Node 26.8.1 and Sage 10.9.post1. No concurrent owned builds or tests.
These are local workload observations, not universal or four-platform latency
qualification.

| Level | Sage seconds | Sage.js native seconds | Node/Wasm seconds |
| --- | ---: | ---: | ---: |
| 101 | 1.632 | 0.523 | 0.521 |
| 121 | 25.508 | 0.802 | 0.849 |
| 169 | 6.288 | 0.590 | 0.710 |

Every sample compares the **complete integral Hom lattice**, after an explicit
unimodular Sage-to-Sage.js homology basis change. The independent comparison is
outside the timer. Expected lattices are not resaturated: an incorrect finite
index would fail. Native improvements in these samples range from about 3x to
32x; portable results also beat the matched Sage workloads.

Final receipt: [complete Sage comparison](hom-performance-final-linux-x64.json).
Earlier-source receipts remain unchanged: [initial campaign](hom-performance-linux-x64.json) and
[prime-square campaign](hom-performance-completed-linux-x64.json).
The initial campaign retains a **300-second Sage timeout at level 242** and
stops before 389; those are not completed Sage comparisons or speed ratios.
The receipts retain source hashes, exact-oracle hashes, versions and artifact
identity. Portable artifact:
`sha256:12514552c5bfb9e69c498180e1ec6119148d7d13e7e54427337eeb628f8a591e`.

Reproduce with:

```sh
node bench/modular/abelian-varieties/hom-performance.cjs results.json 3 101,121,169 native,wasm
```

The shared correctness corpus also passes native, Node/Wasm and real Chromium,
including repeated old copies, quotient models, geometric membership,
noncommutative composition, serialization and primitive-element fallback.
The first browser attempt found a missing precompiled-module declaration;
the corrected artifact above includes it. No native/browser backend was added.
The larger sweep then exposed scalar polynomial indexing failing for a QQ
Hecke factor in Wasm. Blocked matrix evaluation now exports its coefficient
list once, avoiding scalar access. The exact degree-six witness and level389
End rank are part of the passing shared native/Node/Wasm/Chromium corpus.

Supplemental larger-level scaling uses `hom-scaling.cjs`: exact native/Wasm
basis hashes and completeness replay, explicitly **not** a completed Sage Hom
lattice comparison when the Sage oracle did not finish.

[Final scaling receipt](hom-scaling-final-linux-x64.json), three fresh runs:

| Level | End rank | Native seconds | Node/Wasm seconds |
| --- | ---: | ---: | ---: |
| 242 | 42 | 2.699 | 8.066 |
| 389 | 32 | 2.838 | 10.558 |

Every native/Wasm canonical basis hash agrees, and completeness/generator
replay passes outside the timer. The [earlier scaling attempt](hom-scaling-linux-x64.json)
retains the level389 portable failure. No Sage speed ratio is asserted for
these larger levels: 242 timed out in Sage, and 389 was not reached by that
Sage campaign. Both implementations' retained results and misses are explicit.
