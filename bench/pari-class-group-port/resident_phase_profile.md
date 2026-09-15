# Generated resident phase profiler

`profile_prepared_attempt.cjs --generated-resident` instruments a copied,
already-qualified resident generated-class cache artifact. It never changes
source mathematics, compiler production behavior or the canonical cache files.
Without this flag the original eight-phase prepared-attempt layout is retained.

The new layout measures 15 inclusive phases: whole resident attempt, degree
catalog, initial base, Kummer catalog, packet construction, metadata gathering,
subfactor selection, analytic inverse hR, relation initialization, collection,
logs, HNF, acceptance, Smith output and host adapter. Each phase has native/GMP
and tagged-function counters. Same-phase nested bridge calls are counted once
in phase totals; individual function counters remain inclusive. Every selected
generated return site is wrapped, including error exits.

All selected component phases are non-overlapping on the qualified initial
success path. The residual subtracts these from the whole attempt. It includes
unselected work such as bad-subfactor/product/scale policies, LOGD conversion,
view construction, argument forwarding and cleanup: it is not simply compiler
overhead. The host-adapter residual excludes the whole attempt. No percentage
of a PARI timing can be inferred from instrumented costs.

Successful replay requires every phase to occur once per warmup or measured
probe invocation and all timer depths to return to zero. The profiler forwards
`--generated-resident` and optional `--warmups` to the existing resident probe,
retaining its result checks, packed-owner construction and reset behavior.
Warmups are included explicitly in timer totals. The same-realm probe process
shim supplies both CPU and resource-usage APIs used by the current probe.

## Preparation validation

Initial prepare-only artifact:
`/tmp/sagejs-phase-profile-r33VpW/instrumentation.json`.
It identifies cached graph
`d607761a328a8ab00f644fbea2e4fa1b3e55609460a2ce7cd326a7b7632589db`,
all 30 generated definitions and their return sites. Preparation used
11.263775 measured CPU seconds, peak 1,734,364 KiB RSS under the unchanged
4 GiB address-space limit. No C build or execution occurred in prepare-only.

A focused layout/masked-C regression passed for both old/new layouts, nested
returns and apparent returns/braces inside comments and strings (0.053866 CPU
seconds). Initial preparation predates only the added profiler/addon hash fields;
instrumented source behavior is unchanged by those metadata additions.

Native build/execution requires root's coordinated slot approval. A final report
will retain original and instrumented source hashes, copied binding flags,
instrumenter/probe hashes and the actually loaded diagnostic addon hash. Timers
change generated code and compilation, so results are diagnostics, not matched
performance measurements or proof of general class-group capability.

## Coordinated build: retained source-version failure

The authorized GMP run started 2026-09-15 18:00:55 UTC with three warmups,
three samples and one repetition, under 4 GiB/600 seconds. Its copied C build
succeeded, but the probe then correctly rejected a stale source receipt:
the fixture/cache referred to `be50e1b7...`, while root had applied a lifecycle
guard fix to the live resident source (`8bfdb3f7...`) during compilation.

The retained diagnostic build is `/tmp/sagejs-phase-profile-fEvI98`, including
`instrumentation.json`, `build.log`, instrumented sources and the built addon.
It was not discarded, relabeled, or rerun against mismatched source metadata.
No mathematical probe calls or valid phase timings were collected. A successful
build alone does not verify clock balance, phase counts or runtime correctness.

This failed diagnostic used 299.719741 measured CPU seconds, 294.818331 wall
seconds and peak 2,008,964 KiB RSS. Limits were unchanged. Root will coordinate
any subsequent profile after qualifying the corrected canonical source; no
additional rebuild was started by this lane.

Retained built-addon SHA256:
`f17fc91e5cd4fa4f73e3c9a6e22d9454a25257a7dc4d57c396d6265a551c8116`.
It was built but not exercised by the rejected probe.

Approximately two additional active-agent minutes were used for launch,
monitoring and failure documentation, excluding compilation wait (about eight
active minutes for the whole profiler task so far).

## Corrected frozen profile: verified

The corrected run passed in `/tmp/sagejs-phase-profile-15ExVM/profile.json`.
It uses source
`8bfdb3f7685b88f0cbc44c4e4cef11062f2c96962fb8d79dcf5ee8a90ef6cf1e`
and canonical cache
`e61a334ae8b199232a989fac68b122bd7c704a61afc5ce4caf625a78d5964e1a`.
Source/probe remained frozen throughout. All 15 phases occurred exactly six
times (three warmups and three single-call samples), every phase depth returned
to zero, and there were no clock errors. Native function counts were six;
corresponding tagged counts were zero in this GMP run.

The candidate remained class number 1 with 73 relations and exact regulator
`[4510874135066530692003455889568986616389323011914280231659,192,20]`.
Generated work remained 1230 degree-catalog primes, 1833 compact groups,
2270 factors, KC66/KCZ48, 48 Kummer decomposition calls, 66 descriptors and
subfactor count4. The collector examined 1046 small elements, 96 factor attempts
and 16 ideals. All three measured samples had zero reported minor/major faults.

Mean inclusive wall milliseconds, dividing phase totals by all six calls:

| Phase | Mean ms |
| --- | ---: |
| Whole resident core | 319.969948 |
| Degree catalog | 156.114815 |
| Initial base | 0.496342 |
| Kummer catalog | 11.514294 |
| Packet construction | 0.785516 |
| Metadata gathering | 0.130678 |
| Subfactor selection | 0.086952 |
| Analytic inverse hR | 0.536512 |
| Relation initialization | 0.369923 |
| Collection | 55.693967 |
| Logs | 30.893530 |
| HNF | 61.746516 |
| Acceptance | 1.190193 |
| Smith output | 0.006093 |
| Whole host adapter, including core | 320.817212 |

The non-overlapping selected component phases account for all but 0.404618 ms
of the core mean. Host adapter minus core is 0.847263 ms. These residuals are
exclusive by subtraction; the table's whole-core/whole-adapter rows must not be
added to their children. Degree catalog accounts for 48.790% of this instrumented
core; HNF 19.298%, collection 17.406%, logs 9.655% and Kummer 3.599%.

This identifies where this particular translated computation spends time, not
why it differs from PARI. In particular, eager degree catalog generation visits
all 1230 supplied primes rather than reproducing source demand-cache scheduling.
Matched primitive/work-count experiments are needed before attributing its
cost solely to language/runtime overhead. No mathematical/source optimization
or competitiveness claim follows from these instrumented observations alone.

The copied build and checked probe used 302.042843 measured CPU seconds,
294.906950 wall seconds and peak 2,008,628 KiB RSS. Limits stayed 4 GiB/600 s.
The probe reports 455,011,308 bytes of packed owners and equal reset snapshots;
reset/setup costs are outside the phase-core measurements.

Provenance:

- Instrumenter: `fe92804b438e7708ed1c301fd704eecf19ce5a193c2eb4739ac0454e55aecd1a`.
- Instrumented core: `159f83a7f20838a4ac8984e4b7ae668cfae7df89287b7d0e93e6bb2a56cb7bcc`.
- Loaded diagnostic addon: `70e19f43a85f73434a5aa30e5a64f00bd79acb12310d589f0d89286e8e5767d2`.
- Probe: `6e906cb535c60d8652e49b1b73fde2d8f207bdc47abc1ce4c60761fd0a454751`.

Approximately two further active-agent minutes were used for this corrected
launch, result inspection and documentation, excluding compilation wait (about
ten active minutes for the profiler task in total). No live process remains.
