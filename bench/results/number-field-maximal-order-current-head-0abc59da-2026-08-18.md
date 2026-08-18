# Maximal-order current-head performance receipt

Measured commit: `0abc59da72b735bbb4d90a03f980e3ffafde7b09` (tree `d8afd700931b9a8cb4ddd89c8d2364e0407404fd`)

Integrity: `73982e4e3e02e4394b86224b85a246a85e7bf8ef2042e336a0368175add67a4e` over canonical JSON excluding the `integrity` member.

> Outcome: exactness is strong for every measured result, but the original project is not performance-complete. Ten original gates fail, including the six-case 4× public gate, T8 25 ms gate, hard-case 2× gate, parallel-speedup gate, and final ratio/budget gates.

This is a read-only benchmark lane. It changes no mathematical algorithm. A prepared `pnpm build` passed at the measured commit and generated 20 production native kernels.

## Reproducibility identity

| Item | Value |
|---|---|
| OS / CPU | Linux 6.17.0-1022-gcp; AMD EPYC 7B13; 16 logical CPUs |
| Node / pnpm | v26.7.0; pnpm 11.9.0 |
| FLINT / PARI | 3.6.0; 2.17.3 |
| Julia / Hecke / Nemo | julia version 1.12.6; 0.39.21 @ eab7e5566e56d8864fe9cd7b895811ab9df2fe32; 0.56.1 @ 1dcc3625f1899332c52660f6eb074352aa3e7f40 |
| Sage / Magma | 10.9.post1; V2.18-5 (installed; disabled in checked profiler) |
| FLINT addon SHA-256 | `f6017e952166adfe0cb87b26e467902dbb607989908d434bdfb70562240cfb1d` |
| Production registry SHA-256 | `825eb5672a84c20f36786ea7ea728a801cc0831aa4201cef8743f9d77d1062e1` |
| Corpus SHA-256 | `695152efb47b614b15f08a140f7f65d11c32d997588c8ccd6f7962f2f025f52f` |

Source and generated-artifact hashes are all retained in the companion JSON. The post-measurement fixture completion `3ecf3eb81cc012f4cf3618230c2b1f14bbb3003e` changes vector010 expectations only, not arithmetic source. The later OM p=2 source commits `bc14914b` / `1d6d23ae` leave public auto-selection disabled, so these `0abc59da` public timings remain path-equivalent.

## Measurement policy and host load

Every retained timing follows an exact-equivalence check. Samples are warmed, medians are reported, raw samples remain in JSON, and public/resource/native/reference boundaries remain separate. Fresh fields prevent cached public order objects.

The shared 16-CPU host had other agent, compiler, and corpus processes. Recorded one-minute load averages ranged from 4.20 to 6.95, except vector010 ended at 6.82. Consequently, small differences are directional; the large gate misses do not depend on interpreting host noise. The separate source-identical 55.671031 s vector010 run had no load metadata and is labeled unavailable rather than inferred.

## Six public and direct-kernel cases

| Case | Checked public median ms | Fused public median ms | Hook speedup | Fused C resource µs | Native order µs | PARI µs | Hecke µs | Native / best ref |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| motivating-degree-7 | 35.943031 | 24.212201 | 1.297× | 121.511 | 1.770 | 3.000 | 34.005 | 0.590× |
| sage-essential-discriminant | 20.858765 | 15.995582 | 1.257× | 21.704 | 12.633 | 3.000 | 37.946 | 4.211× |
| lmfdb-3.1.431.1 | 22.711992 | 16.675790 | 1.118× | 21.798 | 12.826 | 3.000 | 38.026 | 4.275× |
| lmfdb-5.1.17161.1 | 30.631542 | 21.684885 | 1.254× | 106.547 | 49.177 | 5.000 | 53.980 | 9.835× |
| pari-2510 | 48.530579 | 46.934843 | 1.077× | 2496.329 | 1989.901 | 1372.000 | 249.385 | 7.979× |
| pari-1710 | 87.913752 | 75.431108 | 1.018× | 6876.330 | 5523.624 | 1488.000 | 1184.057 | 4.665× |

All six checked public results pass the independent exact lattice verifier. The fused hook uses one fused analysis call and zero legacy order-resource calls, but its 1.018×–1.297× improvement is far below P2's required 4×. Native order kernels span 0.001770–5.523624 ms, while warm public operation remains 15.996–75.431 ms even on the fused-hook boundary. Among the <1 ms reference cases, #2510 misses the 0.25 ms native budget at 1.989901 ms; all eligible cases miss the 2 ms public budget.

For #2510 and #1710 the native-to-best-reference ratios are 7.979231× and 4.664999×; their geometric mean is 6.101074×.

## T8, precision12, and vector010

| Case / boundary | Median | Key stages | Exactness / outcome |
|---|---:|---|---|
| T(8, 2^32), checked public | 111.084461 ms | decomposition 28.145152 ms; composite 14.920960 ms; native locals 20.126464 ms; certification 30.809600 ms | Independently verified; isolated complete factor discovery timed out |
| T8 compiled BL construction / checker | 12.694784 / 16.428800 ms | packed HNF 2.074880 ms | Internal construction is below 25 ms, complete checked public operation is not |
| Precision degree 12, checked public | 11189.968586 ms | composite 8878.088448 ms; decomposition 784.389888 ms; certification 941.225728 ms | Independently verified; 1.381× vs prior a33 and 10.194× vs old tail |
| Vector010 forced modified Round4 local p=2 | 56.418929 s | 67 characteristic calls; 24 modular; 2901 CRT primes; 3810 max modulus bits | Exact; v2(index)=222, e=16, f=2, compiled Krylov, no fallback |

Vector010 retained samples are 55893.738270, 56664.666653, 56418.928862 ms. The median is 56418.928862 ms. A separate source-identical run was 55.671031 s; because its load metadata is unavailable it is corroboration, not a pooled sample.

## Selector and worker paths

The p=2 microcase selector retains seven samples per forced algorithm. Public `auto` remains native: quadratic median 22.278 ms versus native 21.212 ms; cubic 18.983 ms versus native 18.006 ms. Forced Round2, polygon, Round4, and OM/MaxMin are materially slower on those tiny public boundaries.

The synthetic degree-64/four-prime selector median is 2853.454 ms. Both current and hypothetical schedules are sequential with one worker because capability is unavailable; the public gate remains unselected with reason `native-first-boundary`.

Vector001 exact results agree across native, sequential-local, and requested-parallel paths. Native total is 743.815 ms. Sequential local is 51.330 s; requested parallel is 51.640 s but actually ran sequentially (workers=1, `worker-capability-unavailable`). Peak RSS deltas are 93.2, 365.3, and 371.2 MiB.

## Original acceptance gates

Counts: pass=7, partial=6, fail=10, not_remeasured=11, not_established=2 (36 total).

| Gate | Status | Requirement | Current-head evidence |
|---|---|---|---|
| P0.1 | **pass** | One command reproduces the baseline table. | The checked manifest profiler produced the seven-case table with retained samples. |
| P0.2 | **pass** | T(8,2^32) attributes factor discovery separately from local order computation. | Public stages are retained; the isolated factor-discovery request timed out while the public lazy path completed. |
| P0.3 | **partial** | Report separate Hecke core and Oscar public/cold rows with shared-family labeling. | Direct Hecke core is measured and family metadata is retained; Oscar public/cold was not rerun in this current-head receipt. |
| P0.4 | **fail** | Record installed Magma version and bounded T8 timeout. | Magma 2.18-5 is identified but was disabled in the checked profiler, so no bounded T8 Magma record was produced here. |
| P0.5 | **pass** | Wrong basis, index, or discriminant cannot enter benchmark output. | All accepted checked timings passed the independent exact lattice verifier; invalid timings are excluded by the driver. |
| P1.1 | **pass** | T8 does not invoke complete integer factorization before local work. | The isolated complete factor-discovery boundary timed out, while warm public maximal_order completed in 111.0844612121582 ms using lazy composite work. |
| P1.2 | **not_remeasured** | Frozen Hecke differential traces agree on splits, primes, local indices, and final HNF. | The receipt records final exact cross-oracle agreement, but does not rerun the complete intermediate Hecke trace suite. |
| P1.3 | **not_remeasured** | Adversarial composite components split correctly and deterministically. | No dedicated adversarial split suite was rerun for this receipt. |
| P1.4 | **not_remeasured** | Prime, semiprime, prime-power, and pseudoprime differential tests pass. | No dedicated decomposition differential suite was rerun for this receipt. |
| P1.5 | **not_remeasured** | Arbitrary-large-prime regression remains exact. | Not selected in this receipt manifest. |
| P1.6 | **pass** | Every returned global order has independent-checker evidence. | All checked public cases, T8, and precision12 passed nonsingularity, containment, closure, discriminant-index, and frozen-certificate checks. |
| P2.1 | **pass** | Ordinary native path has one canonical polynomial-to-basis host crossing. | The direct native boundary is sealed polynomial plus hints to compact canonical HNF, with exact resource output. |
| P2.2 | **partial** | Dynamic/native/PARI/Sage/Hecke/Oscar/Magma agree on the standard corpus when available. | The selected native, PARI, and Hecke cases agree exactly; not all systems and the complete standard corpus were rerun. |
| P2.3 | **not_remeasured** | No machine-word restriction on primes. | The current receipt did not isolate an arbitrary-size-prime native input. |
| P2.4 | **not_remeasured** | Windows passes the path or capability-tested dynamic fallback. | This Linux-only receipt does not establish Windows behavior. |
| P2.5 | **fail** | Six warm public timings improve by at least 4x before Round 4. | The fused public-hook speedups are 1.018x–1.297x, all below 4x. |
| P3.1 | **partial** | Every imported PARI Round-4 regression passes exactly. | The source-identical vector010 local path is exact, and fixture completion landed later as 3ecf3eb8; this base does not itself contain the complete fixture set. |
| P3.2 | **not_remeasured** | Random low-degree locals agree with Round 2, PARI, Hecke, and Magma when available. | No randomized four-oracle suite was rerun. |
| P3.3 | **fail** | T(8,2^32) completes within 25 ms on the baseline host. | Checked public median is 111.0844612121582 ms; compiled BL construction alone is 12.694784 ms and checker is 16.4288 ms. |
| P3.4 | **fail** | #2510 and #1710 are within 2x the faster direct PARI/Hecke native boundary. | Ratios are 7.979231146299898x and 4.6649987860135775x. |
| P3.5 | **not_remeasured** | Coefficient-height corpus keeps the poorly scaling Hecke fallback unselected. | The selector probe covers p=2 microcases and a synthetic many-prime case, not the coefficient-height corpus. |
| P3.6 | **not_remeasured** | Sanitizer, leak, strict Python, architecture, and Windows checks pass. | The build passed, but this receipt does not rerun that entire platform/check matrix. |
| P4.1 | **partial** | OM trace and local-index certificate are independently inspectable. | OM is explicitly selectable; the detailed retained trace here is modified Round4 vector010, not a completed OM certificate trace. |
| P4.2 | **not_remeasured** | Round4, OM/MaxMin, PARI, Hecke/Oscar, and Magma agree on all overlapping standard cases. | No full multi-algorithm, multi-oracle overlap matrix was rerun. |
| P4.3 | **fail** | Degree 96–160 and deep-index families meet the final stress parity gate. | No passing stress-family artifact exists in this receipt; vector010 degree 32 still takes 56.419 s locally. |
| P4.4 | **pass** | Selector uses measured degree, local valuation, factor pattern, and output size, never names. | The selector trace exposes degree, valuation, prime count, predicted work and memory; public selection is native-first. |
| P4.5 | **not_remeasured** | Disabling OM leaves correct Round2/Round4 fallbacks. | Forced algorithms are selectable, but OM-removal fallback behavior was not tested in this receipt. |
| P5.1 | **partial** | Parallel results equal sequential results under randomized completion order. | Vector001 native/sequential/requested-parallel results are exactly equivalent, but the requested path stayed sequential and did not exercise randomized completion. |
| P5.2 | **not_established** | No native pointer or host object identity is transferred. | The pointer-free worker benchmark exists, but worker capability was unavailable, so a live transfer was not exercised. |
| P5.3 | **fail** | Many-prime corpus speeds up without tiny-case regression. | Current and hypothetical schedules both select sequential workers=1; no current public speedup is realized. |
| P5.4 | **fail** | Final contracts pass on reference host and remain bounded on supported CI. | Multiple final performance gates fail and this is a single Linux-host receipt. |
| F.1 | **fail** | For >=1 ms references, geometric-mean ratio <=1.25 and no standard case >2 absent a documented selector issue. | Among these cases #1710 has a >=1 ms best reference and its native ratio is 4.664999x, above both limits. The broader P3 #2510/#1710 geometric mean is 6.101074x. |
| F.2 | **fail** | For <1 ms reference microcases, native <=0.25 ms and warm public <=2 ms. | Warm-public medians exceed 2 ms for every eligible case, and #2510 also misses the native budget at 1.989901 ms versus a 0.249385 ms Hecke core. |
| F.3 | **not_established** | For >=1 s scalable stress references, Sage.js is no slower than the faster reference. | No exact-equivalent scalable reference stress pair was completed in this receipt. |
| F.4 | **fail** | Warm maximal_order is no slower than Sage wrapper over the complete standard corpus. | This receipt has no complete-corpus Sage wrapper comparison, and the available original microcase baselines are not uniformly beaten. |
| F.5 | **partial** | Optimization preserves certification and supported-platform safety. | Certification is preserved for every measured result; supported-platform safety was not re-established by this Linux-only receipt. |

## Completion definition

| Item | Status | Requirement | Evidence |
|---|---|---|---|
| C.1 | **partial** | Certified PARI-free public maximal_order for every supported integral simple field. | Measured selected fields are certified and PARI-free; universal support is not established. |
| C.2 | **pass** | No complete factorization when lazy certification suffices. | T8 and precision12 public paths complete while isolated complete factor discovery times out. |
| C.3 | **fail** | All standard, Round4, Hecke, stress, and randomized-generator corpora pass with bounded Magma records. | The full matrix, completed fixture set, stress families, and Magma bounded records are absent from this base receipt. |
| C.4 | **partial** | Dynamic, Round2, Round4, and OM agree on overlapping domains. | Selected exact equivalences exist, but the complete overlap matrix was not rerun. |
| C.5 | **fail** | Final performance contracts are met reproducibly. | P2.5, P3.3, P3.4, P5.3 and final ratio/budget gates fail. |
| C.6 | **partial** | Artifacts report three external implementation families and bounded failures/timeouts. | Families are identified, but Oscar and bounded Magma runs were not rerun; explicit Sage.js factor-discovery timeouts are retained. |
| C.7 | **not_established** | Native boundaries are host-neutral, audited, leak-free and supported on all named platforms. | Only Linux x64 was built and measured here. |
| C.8 | **not_evaluated** | Public documentation covers exactness, caching, diagnostics, and local/certification options. | Documentation was outside this read-only performance lane. |
| C.9 | **partial** | Each coherent phase is committed and pushed with evidence and architecture decisions. | This receipt is durable; completion of every phase is not established by this lane. |

## Remaining bottlenecks

- Warm public overhead is 15.996–75.431 ms even with one fused analysis call; the direct fused C resource is only 21.704–6876.330 us.

- Direct native #2510/#1710 kernels are 7.979x/4.665x slower than the faster PARI/Hecke reference; hard-case geometric mean is 6.102x.

- T8 checked public median is 111.084 ms versus the 25 ms gate; BL construction/checker medians are 12.695/16.429 ms and the public trace still adds decomposition, native-local, and certification stages.

- Precision12 remains 11.190 s; composite local work dominates at about 8.878 s.

- Vector010 modified Round4 local work remains 56.419 s with 24 modular characteristic calls, 2901 CRT primes, and a 3810-bit maximum modulus.

- The current public worker path is disabled by worker-capability-unavailable and native-first selection; requested parallel vector001 execution remains sequential.

- OM p=2 source landed after this base, but auto-selection remains disabled, so it does not alter these public timings.

## Limitations

- Single Linux x64 host; no Windows, Linux arm64, or macOS arm64 validation in this receipt.

- Magma was installed but disabled; Oscar public/cold and complete Sage wrapper comparisons were not rerun.

- Host activity was shared. Exact-equivalent warmed medians and load averages are retained, but small cross-run differences are not attributed solely to code.

- The stock fused-resource benchmark's dynamic-checker assumption did not match the production registry, so its timing was discarded; the exact direct C resource witness was used instead.

## Conclusion

The measured head is exact on every retained case and substantially improves several historical tails, but it is not at PARI/Hecke parity. The next performance work should target the hard native kernels (#2510/#1710), precision12 composite-local work, vector010 modular characteristic reconstruction, and a truly available pointer-free worker path. Public-boundary overhead must also fall by roughly an order of magnitude to meet the microcase budget.

The companion JSON contains raw samples, stage traces, polynomial/certificate digests, source/native hashes, host-load records, selector/worker diagnostics, all 36 gate evaluations, and the nine completion-definition evaluations.
