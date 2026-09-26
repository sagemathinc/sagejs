# Prepared cubic paired diagnostic

## Predeclared measurement

Field: `x^3 - 20010*x + 20018`, PARI 2.17.4, 192-bit initial precision.
Compare the same accepted initial relation/HNF/regulator/invariant computation
from prepared field and factor-base data. This is not polynomial-to-class/unit
group latency, the full frozen panel, or production performance qualification.
Dynamic latency and units/maps remain outside this diagnostic.

Pin all runs to CPU 15 on the current project host, one numerical thread, with
no other agent benchmark or compilation running. Alternate three rounds in
orders PARI/GMP/tagged, tagged/GMP/PARI, PARI/GMP/tagged. Each system gets one
excluded fresh-state warmup. Freeze 20 fresh native computations per sample
and 500 fresh PARI computations per sample. Do not increase counts if a final
sample runs short; record it. Keep the 4 GiB address-space and 600-second
process caps. Record exact results and work counts for every computation.

Pilots are discarded: the tagged batch of 20 took about 2.16 seconds inside
calls and the reference batch of 500 about 1.54 seconds inside its section.
These values select sample sizes only, not the final performance ratio.

Native owners are restored before every invocation; reset and initial packing
costs are separate. Reference cache allocation is inside its section; prepared
field, factor-base, ideal packets, and inverse hR are outside. These differing
allocation boundaries are disclosed rather than called instruction-identical.
Both systems omit ideal generators, unit maps and honesty work. Matching
491 small elements, 54 normalized candidates, 12 ideals and 58 relations rules
out extra outer search, not differences in primitive algorithms or storage.

Input export: `/tmp/sagejs-prepared-class-inputs-JXLwHg/inputs.json`.
Reference build: `/tmp/sagejs-prepared-attempt-reference-r6W2XO/fixtures.json`.
The driver `paired_prepared_diagnostic.cjs` records host/build/source hashes,
raw individual samples, and duration flags before summarization. It keeps
`qualifiedTiming=false`; a controlled native/reference comparison alone does
not satisfy the broader experiment's coverage and dynamic-execution gates.

## Results

All nine final samples exceeded one second; all per-computation result and
work-count checks passed. Raw evidence is `prepared-paired-20260915.json`.
Other agent workloads were paused; this remains a shared project host, not a
dedicated machine reservation. Each measured native batch's thread/process CPU
time was very close to wall time. Host: AMD EPYC 7B13, Linux x64, Node 26.8.1.

| Path | Per-call milliseconds in the three rounds | Median ms | Geometric mean paired slowdown |
| --- | --- | ---: | ---: |
| PARI prepared reference | 3.0813, 3.0761, 3.0642 | 3.0761 | 1 |
| Compiled GMP | 109.0630, 108.8441, 108.1902 | 108.8441 | 35.36x |
| Compiled tagged | 104.7017, 110.8636, 109.2081 | 109.2081 | 35.21x |

The port is not competitive on this case yet. Changing scalar backend alone
does not materially close the gap. Native owner reset adds approximately
29 milliseconds per call outside the reported kernel intervals; initial packing
also remains separate. Those costs must not disappear from any eventual public
API latency claim. The native intervals include the public native wrapper;
copied-artifact profiling will separate that from core phases.

Generated core: 58,205,896 bytes, SHA256
`052512849c16228619410f6c1626b1ed5f32273250e7ddf27b759d56e1c27f10`.
Static inspection rules out whole-helper GMP bridging in the tagged path.
Matching outer search does not rule out different scalar algorithms, repeated
buffer conversion, scratch traffic, or validation costs. This measurement is
evidence for locating those costs, not a verdict on the language's potential.
