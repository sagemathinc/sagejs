# Four-platform binary64 kernel qualification

Frozen clean source: `c092f9fe7a923da053638569d51f41619b693bcf`.
This qualifies the isolated compensated-sum kernel and its adapters, **not**
the public statistics query, production packaging, or an N2 performance target.
All four final checkouts retained that exact source and were clean.

| Platform | Node | Focused tests | Native reused, 20k | Pack/allocate, 20k | CPython `math.fsum`, 20k |
| --- | --- | --- | --- | --- | --- |
| Linux x64 | 26.5.1 | 6 pass / 3 skip | 0.1164 ms | 0.3212 ms | 0.1957 ms |
| Linux ARM64 | 26.5.1 | 8 pass / 1 skip | 0.1730 ms | 0.3127 ms | 0.1624 ms |
| macOS ARM64 | 26.5.0 | 8 pass / 1 skip | 0.3836 ms | 0.4610 ms | 0.3619 ms |
| Windows x64 | 26.5.1 | 6 pass / 3 skip | 0.1191 ms | 0.2325 ms | 0.1966 ms |

These are per-call medians from seven retained checked batches after three
warmups. Raw batch sizes, elapsed times and a loop/clock control are retained;
the control is not subtracted. CPython versions and host identities are in each
report. This is not a cross-hardware ranking or a paired crossover campaign.
ARM and Mac results where CPython is faster are retained, not excluded.

The six mandatory focused tests pass everywhere, including the 200-case
exact-rational rounding oracle, dynamic/native/JavaScript equivalence and
source-transparent compilation checks. The two additional Node-Wasm tests pass
on ARM and Mac; they skip on x64 Linux and Windows because those checkouts lack
the optional prepared Wasm SDK. The remaining opt-in sanitizer test skips on
all four hosts. The separately retained local qualification passes all nine
tests on both Node 26.8.1 and 22.22.2, including three real browser workers and
ASAN/UBSAN with leak detection. A host skip is not a platform pass for that test.

## Build recovery, with original failures retained

Linux x64 and Windows completed fresh eight-stage builds directly. ARM's first
build passed stages 1–7, then stage 8 rejected the shallow checkout because the
pinned NLopt source ancestor was absent. Fetching that ancestry restored the
unchanged provenance check; only stage 8 was rerun before focused tests.

Mac's first build also passed stages 1–7, then rejected a numerical product's
`gzip_bytes` metadata mismatch. A canonical numerical product published from
the same frozen ARM source was copied to Mac. Its identity is
`sha256:8d4f529c85793565b48ab09f3e34717e8f5f563253e53fcdf3fb0b21fafd2410`.
The unchanged product verifier accepted it. Mac also needed the pinned Git
ancestry before stage 8 could resume. The original failed build logs and the
successful stage-8 resume logs remain in the platform directories; neither
failure was rewritten as a straight build pass. The source did not change.

These isolated numerical checkouts intentionally lacked the optional exact
FLINT adapter and skipped production exact-native packs. This is not a full
release build or an exact-native package qualification. No shared dependency
prefix or other lane's checkout was modified. All four host reservations were
explicitly handed back in Discussion #104 after collection.

## Rechecking the retained evidence

From the repository root:

```sh
node bench/numerics/performance/results/n2-binary64-main-2026-09-12/four-platform/verify.cjs
```

The verifier checks frozen source identity, final clean state, platform,
stage-log SHA-256 values, retained failure/resume boundaries, focused pass/skip
counts, workload and collector hashes, seven-sample batch arithmetic and
medians, and the CPython oracle values. It is an evidence-consistency checker,
not a cryptographic signature or a production dispatch receipt.

The timings exclude public input conversion, summary sorting, independent
public-result validation, trace/result construction, startup and peak memory.
Those costs are measured separately by the prepared-statistics follow-up.
No default dispatch decision follows from this microbenchmark alone.
