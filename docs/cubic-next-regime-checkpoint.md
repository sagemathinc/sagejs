# Next cubic campaign: diagnostic checkpoint

Status: active research branch; no new PARI win or production promotion.

## Shared exact root-isolation follow-up

The next candidate consolidates the analytic-logarithm, ideal-embedding, and
unit-reconstruction root searches. Safeguarded integer Newton proposals retain
exact sign checks and the existing bounded bisection fallback. Its argument,
resource comparison, and validation scope are recorded in
[the shared-root note](cubic-shared-root-isolation.md).

Source SHA-256:
`777e58921ec188112372f2c984dcb8f2b124c80f46ca11ea58156a60c360b9b0`.
The local whole-native survey matched all 64 output slots on all 1,012 records
(940 accepted, 72 identical declines, no exceptions); eight focused/public
tests subsequently passed, including independent exact replay. Raw survey
SHA-256 is `0c6a12cb5a2a3220b71a2f09ed67dffee63508f962c38bc2f227f5953baf22bd`.
The uncontrolled local alternating pilot has SHA-256
`8199e9f97086e3039f11ea40581a606a95d8a5ca2d30b1d38ba062ab5bc4cd4f`.
Neither observation is retained public timing or a new PARI win.

The source, raw diagnostics, unintegrated precision surveys, and focused
validation logs are preserved in the
[immutable shared-root evidence release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-shared-root-b8698266a-20260906).
The matching query snapshot is in its separate
[immutable optimizer release](https://github.com/sagemathinc/sagejs/releases/tag/optimizer-evidence-campaign-1-13da289a0a48c13550787edea7ba6ec62f56c7f9864d0801a5e5213a3f71c710-ce705fde377b920e).

The ongoing clean public census on `opt` remains pinned to
`bbe1d2ca347942a96835ade8611d28ba0c54f782`, without this root-isolation change.
Do not attribute its eventual results to the follow-up candidate.

## Earlier diagnostic evidence

The integrated baseline is `ea2027439601c4cabe4a4f5be93b226083d7262b`.
Its closed cubic source SHA-256 is
`73321ea581628c90e74f53441e12fc8a26439fe9c45ebdd70f5d7644d3670a7e`.
The Frobenius candidate source SHA-256 is
`b8f8e59fee7864117bbda34912082cfdce4be4d8a0816b43175a61f59120c6da`;
the imported polynomial module SHA-256 is
`6708592b14ef2e8f571af8770ae2771773b6c0b1fc884d93b16574d9b3895369`.

## Retained diagnostics

Raw files and experimental Python sources are published in the
[diagnostic evidence release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-frontier-diagnostics-2df23f133-20260906),
with the JSON content identities below. Copies remain on `opt` in
`/home/user/cubic-next-campaign` and in the branch's ignored
`build/cubic-next-evidence` directory. This auxiliary release is explicitly
not marked latest and is not a Sage.js product release.

| File | SHA-256 |
| --- | --- |
| `frobenius-final-diagnostic.json` | `d37dac7833e0095c1c8316b85ac9077978cb77c5b053a1f82f68d7beaacd9215` |
| `frobenius-final-equivalence.json` | `a0bd99297376bcff8104d8c17ac2182a56c4360c9268c8b38be4e85bfd4159c7` |
| `indexed-diagnostic.json` | `b06e23e6bcee4b0fdb263794d3ea2073fd3f60f87b1f66fc7ba19a9b07551816` |
| `newton-diagnostic.json` | `3942334d794ac102891118f48e877a6e8eca7039c5728e52fe75f4319ea19a18` |

`bench/native-source-compression-cubic.cjs` supplied the timing diagnostic:
four warmup rounds, fifteen retained alternating-order rounds, ten complete
native calls per sample, fresh internal arenas, reused outer transport
buffers, effort five, 1 MiB resident and 3 MiB temporary limits. Commands used
`SAGEJS_NATIVE_REQUIRED=1 taskset -c 0 node` on the dedicated Linux x64 `opt`
VM with Node 26.7.0. No provisioning, profiling or other benchmark ran during
the retained timing windows. This protocol is diagnostic, not the campaign's
public ABBA/BAAB promotion gate.

The baseline native artifact key is
`a6bd803a5785071534b289735d8ce08933714d6c06f427ea688b2b7e09657d98`;
the final Frobenius artifact key is
`ca47741e74942fe81044028ce781856c003a6f431817701234b9b9dec19a6de8`.
The equivalence runner records both identities and the frozen survey's
logical digest. Its 940 accepted and 72 matching declined cases are fixed
native-budget observations, not public coverage or independent replay.

Generated-code review: the reachable closure grows from 101 functions and
240 call edges to 104 functions and 243 edges. The three additions are the
splitting entry, modular powering and modular cubic multiplication. All are
reachable through direct native calls. Generated host-core C grows from
16,813,080 to 17,306,351 bytes (2.9%); the standalone Linux x64 addon grows
from 20,361,968 to 20,370,192 bytes (8,224 bytes). The backend emits multiple
inspectable arithmetic variants, so C text is not resident executable size.
No heap owner, foreign binding, library dependency or capacity limit is added.
The full fmpz closure test still rejects partial backend qualification and
checks resource exhaustion followed by reuse. Four-platform release
qualification remains outstanding.

## Mechanisms and negative evidence

1. **Frobenius splitting:** replace exhaustive modular root scans used only
   for Euler-factor degrees with a bounded polynomial remainder and gcd.
   The full mathematical argument is in
   [cubic-frobenius-splitting.md](cubic-frobenius-splitting.md). This candidate
   is implemented on the branch, but not qualified for production promotion.
   Native-core gains are modest, approximately 0.2 ms on nontrivial cases.
2. **Consume stored analytic value indices:** the plan already stores each
   logarithm-table index. A checked direct lookup preserved all fourteen
   diagnostic outputs but saved only about 1%, with small losses on resumed
   examples. It is not included in the implementation. The experiment artifact
   is `38dd5f7ff76a725be85f9179767fc91b8799bdbfedc00cb8e99e64cf96d1162a`;
   its comparator is the earlier, mathematically identical Frobenius artifact
   `0d77cf909b0721753ddc5b3f3fe13efd17b1e65d6e7b2bc3a4f386ef52e6fa7e`.
3. **Safeguarded exact Newton root isolation:** an exploratory source copy
   proposes integer Newton steps but accepts bounds only by exact polynomial
   signs, and retains bisection whenever a proposal fails to halve the bracket.
   Across 1,006 cubics and seven scales through 1,000 bits, CPython returned
   exactly the same intervals as the original bisection. Native diagnostic
   outputs matched on fourteen fields. Gains were about 3% on ordinary
   examples and 12% on the two resumed-certification examples. This is not
   yet integrated or fully qualified. Artifact:
   `175fe946ed4934f28f4e96060adab8e961c65b5ea1ff9aafe34fd0f1d11d0bff`;
   comparator: final Frobenius artifact above.

The indexed and Newton experiment source copies and compiled artifacts remain
in `/home/user/cubic-next-campaign/{indexed,newton}` on `opt` (generated
code and manifests). The original Python experiment and check-driver files
are preserved in the evidence release above; retain the generated manifests
as well before cleaning the local artifact directories.

## What remains

### Production import preflight correction

A copied production-only checkout on `opt` exposed a packaging omission:
although the parent cubic artifact included the imported splitting body,
Python import still needed the splitting module's own `@native` entry. That
entry was absent from the production catalog. Required-native import failed,
and the public class-group dispatcher correctly used its exact fallback.
The first pilot was stopped and is not timing evidence for this candidate.

The splitting entry is now explicitly catalogued. Public receipt regressions
use `SAGEJS_NATIVE_REQUIRED=1` and the production cache as their exclusive
artifact source, preventing source-adjacent development caches from masking
this omission. All four public receipt/replay regression tests passed under
that hermetic setting. Generated Wasm eligibility and capability inventories
are synchronized; these inventories do not replace testing an actual browser
artifact or four-platform release qualification.

After deploying the corrected pack, all three pilot fields produced native
authenticated receipts and independently replayed successfully. The pilot
suggests these approximate prepared/fresh-complete times:

| Field | Sage.js prepared | PARI prepared | Sage.js fresh | PARI fresh |
| --- | ---: | ---: | ---: | ---: |
| $x^3-x^2-11x-63$ | 4.6 ms | 0.758 ms | 24 ms | 1.194 ms |
| $x^3+9x-55$ | 3.6 ms | 0.744 ms | 22 ms | 1.176 ms |
| $x^3-x^2+3x-4$ | 2.8 ms | 0.588 ms | 21 ms | 1.002 ms |

These are **exploratory, non-promotion** measurements: ten individual Sage.js
samples after two warmups versus five retained PARI 500-call batches after
two warmup batches, serialized and CPU-pinned on `opt`. PARI uses version
2.17.4 with flag-zero BNF, fresh NF objects for prepared calls and full
`bnfinit(P,0)` for fresh calls. Sage.js includes public field construction in
the fresh cell. The copied build was not freshly requalified on `opt`; a
clean-build, common frozen timing protocol is still required.

The public pilot and original profile are preserved in the
[public-pilot diagnostic release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-frontier-public-pilot-042cf6261-20260906).
A subsequent full clean build on `opt` completed with all 42 production
families rebuilt. Repeating the three-field preflight again produced native
authenticated receipts and independent replay; public pilot times remained
similar. The common frozen timing protocol is still outstanding.

### Sampling correction and exact constant work

The first 499 Hz profile attributed 36.5% of self time to modular cubic
multiplication. That attribution is **not stable**: even with randomized
inter-call spacing, a 499 Hz stack profile overweights this region. At
1,999 Hz, both flat and stack profiles instead expose substantial exact
integer management throughout the computation. Treat the earlier percentages
as sampling-biased diagnostics, not a phase ledger or an optimization ranking.
The profiling driver adds seeded 0--1 ms busy waits between calls solely to
vary sampling phase; those runs are not timing claims. The high-rate stack
profile places generator-bound search, relation collection, root isolation,
and analytic evaluation among the remaining contributors. Inclusive percentages
overlap and must not be added.

A reciprocal-reduction experiment replaced bounded word divisions in the
splitting helper. It passed 589,806 reduction boundaries per generated backend
and 4,667 polynomial cases, then all 1,012 native comparisons. Nevertheless,
whole-program gains were only about 1--3%, so it remains outside the branch.

The next retained mechanism is
[exact rounded-tail compression and search-local constants](cubic-arctan-tail-compression.md).
It skips arctangent-series terms only when their exact rounded contributions
can be counted, preserving the old endpoints. It also computes the generator
inequality's bound-independent constants once per search. No precision,
analytic cutoff, proof assumption, stopping inequality or capacity changes.
The combined source SHA-256 is
`f789bc988496c2766f9b29230dcf1e26c2fce4cf7a674e79f05e8240715cd3b0`;
its diagnostic artifact is
`c3daece08992153f455d191b2a12ced0e93806e59aa915300ac42b09c1fa5d72`.

On the selected field, tail compression reduced the native diagnostic median
from 3.137 to 2.845 ms; the separate subsequent comparison of constant hoisting
measured 2.847 to 2.790 ms. On the headline class-number-five field, the latter
comparison measured 2.528 to 2.475 ms. These are successive diagnostic
comparisons, **not one paired end-to-end speedup or a PARI win**.
All 940 accepted frozen-population cases retained identical 64-slot outputs;
all 72 fixed-effort declines matched, with zero errors.

The closure now has 105 functions, 244 edges and 22 host entries: one new
private helper, with no new external boundary or owner. Relative to the
Frobenius candidate, generated core C grows from 17,306,351 to 17,399,276 bytes;
the Linux addon grows from 20,370,192 to 20,382,480 bytes. Header and host adapter
sizes are unchanged. This is not four-platform resource qualification.

| New diagnostic file | SHA-256 |
| --- | --- |
| `arctan-diagnostic.json` | `a8085c8a00b14f33ce02f9269dd025957dc5c8ca5dd2d52f692e955379a176e3` |
| `constants-target-diagnostic.json` | `2ff4e4bb0d11b3f78c6186a4c9f5ae036e356ed0607747c24f550a706fb495e9` |
| `constants-equivalence.json` | `a07023e6b3e3c1cfbb13e317afd66db6b04c8832c8ae744a69e6c23cf5bebb64` |

These files, the combined candidate source, profiling driver/reports, and
rejected experiments are in the
[constant-compression evidence release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-frontier-constants-bbe1d2ca3-20260906).
Commit `bbe1d2ca3` passed all nine focused public/native tests, strict Python,
and the architecture gate. The clean-build full public census on `opt` is
the next qualification step. The separately archived single-field 32-bit
precision probe is exploratory, not integrated or independently certified.

Neither smaller kernel timings nor old pre-staging frontier timings establish
a current public PARI comparison. The next gate is a clean, authenticated
current-source public baseline on `opt`, followed by attribution of the
remaining cost. Do not tune the frozen holdout yet. Full survey replay,
twenty predecessor-sealed unseen neighbors, platform/resource qualification,
reviewed PR and a genuine PARI win remain open.
