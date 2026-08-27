# Hyperelliptic Phase 10 cross-platform acceptance

Generated from the committed JSON receipts for exact source `2f1e296481aef4455ccd0aa35199692e44509116`. Absolute times across architectures are descriptive only.

No test-only package-smoke overlay was recorded.

This matrix includes the quiet `bench-1` Linux-x64 Sage.js receipt, but does not duplicate Magma, PARI/GP, or SageMath measurements from their separate equal-contract receipts. Missing competitor cells are not counted as Sage.js wins.

## Host and package matrix

| Platform | CPU | Node | Native source | Wasm | Standalone | Package smoke |
|---|---|---:|---|---|---|---|
| darwin-arm64 | Apple M1 Max | v26.7.0 | dynamic/native exact | available | unavailable | passed |
| linux-arm64 | Neoverse-N1 | v26.5.1 | dynamic/native exact | available | available | passed |
| linux-x64 | AMD EPYC 7B13 | v26.5.1 | dynamic/native exact | available | available | passed |
| win32-x64 | AMD EPYC 7B13 | v26.5.1 | dynamic/native exact | available | unavailable | passed |

## Recorded preflight

The full system/process snapshots are retained in each JSON receipt. The macOS timing rows are descriptive shared-host evidence; transient GUI system work was observed during the long dynamic run.

| Platform | uptime/load at start | compiler probe |
|---|---|---|
| darwin-arm64 | 16:13  up 6 days,  2:07, 3 users, load averages: 1.60 1.35 1.58 | Apple clang version 17.0.0 (clang-1700.4.4.1) |
| linux-arm64 | 23:05:30 up  4:19,  1 user,  load average: 1.31, 1.08, 1.04 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| linux-x64 | 22:50:16 up 3 days, 12:46,  1 user,  load average: 1.00, 1.03, 0.94 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| win32-x64 | Days              : 1 Hours             : 14 Minutes           : 26 Seconds           : 21 Milliseconds      : 833 Ticks             : 1383818334384 TotalDays         : 1.60164159072222 TotalHours        : 38.4393981773333 TotalMinutes      : 2306.36389064 TotalSeconds      : 138381.8334384 TotalMilliseconds : 138381833.4384 |  |

## Local factors and Kummer

| Platform | local factors through 100k packed (ms) | coefficient rows (ms) | Kummer 4096 dynamic wall (ms) | native wall (ms) | speedup | peak RSS (MiB) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 6976.55 | 8241.59 | 4126.25 | 216.83 | 19.03x | 479.6 |
| linux-arm64 | 2524.63 | 3714.37 | 3270.15 | 192.25 | 17.01x | 640.5 |
| linux-x64 | 1761.86 | 2734.95 | 2505.39 | 142.40 | 17.59x | 635.2 |
| win32-x64 | 1841.72 | 2892.81 | 2803.69 | 141.34 | 19.84x | 570.9 |

## Public Cantor workloads

The following are end-to-end worker wall times, including the public packed boundary and result handling. Internal arithmetic-only medians remain in the JSON and verifier summary.

| Platform | Genus | add 1000 dynamic/native wall (ms) | add materialized wall (ms) | scalar 64 dynamic/native wall (ms) | scalar materialized wall (ms) | progression 1000 dynamic/retained native/materialized native wall (ms) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | 13455.24 / 227.49 | 1610.36 | 115655.32 / 127.06 | 229.92 | 7665.55 / 60.48 / 312.60 |
| darwin-arm64 | 3 | 16488.86 / 228.82 | 1678.65 | 165485.17 / 157.87 | 278.83 | 8099.52 / 60.12 / 330.67 |
| linux-arm64 | 2 | 14030.35 / 194.99 | 1728.26 | 119991.02 / 101.13 | 199.37 | 7951.69 / 47.76 / 332.65 |
| linux-arm64 | 3 | 16868.42 / 192.55 | 1775.96 | 170793.14 / 128.60 | 229.33 | 8326.11 / 47.11 / 333.68 |
| linux-x64 | 2 | 11053.49 / 159.38 | 1294.62 | 93073.67 / 77.87 | 152.55 | 6259.61 / 41.42 / 247.67 |
| linux-x64 | 3 | 13345.31 / 150.97 | 1360.83 | 133067.75 / 97.28 | 178.19 | 6527.51 / 39.73 / 255.87 |
| win32-x64 | 2 | 11739.84 / 179.23 | 1432.96 | 101096.23 / 98.43 | 171.86 | 6693.11 / 46.94 / 274.92 |
| win32-x64 | 3 | 14687.13 / 171.27 | 1505.51 | 141523.22 / 135.94 | 216.76 | 7099.01 / 47.63 / 285.68 |

## Standalone and authenticated Wasm boundary

| Platform | Genus | standalone core 1000 (ms) | native raw fixed / standalone | Wasm 1000 (ms) | Wasm / standalone |
|---|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | unavailable | unavailable | 5.40 | unavailable |
| darwin-arm64 | 3 | unavailable | unavailable | 4.40 | unavailable |
| linux-arm64 | 2 | 1.10 | 1.046 | 3.99 | 3.633 |
| linux-arm64 | 3 | 1.10 | 1.046 | 3.43 | 3.121 |
| linux-x64 | 2 | 1.02 | 1.013 | 4.01 | 3.947 |
| linux-x64 | 3 | 1.02 | 1.009 | 2.67 | 2.630 |
| win32-x64 | 2 | unavailable | unavailable | 3.09 | unavailable |
| win32-x64 | 3 | unavailable | unavailable | 3.28 | unavailable |

## Explicit unavailable cells

- darwin-arm64 standalone: the checked-in standalone harness emits GNU/ELF --gc-sections and --exclude-libs linker flags rejected by native Mach-O ld; macOS native kernels remain covered separately
- win32-x64 standalone: the checked-in standalone harness currently has a POSIX static-archive linker contract; Windows native kernels remain covered separately
- Magma, PARI/GP, and SageMath: not measured on this Phase 10 matrix; `bench-1` was explicitly excluded.

## Exactness and resource behavior

Every primary receipt has a clean source status and matching dynamic/native digests. The verifier additionally requires the same local-factor, Kummer, tiny-Jacobian, Cantor addition, scalar, and progression digests across hosts.

| Platform | Wasm manifest | checked short output | cancellation / recovery | package smoke |
|---|---|---|---|---|
| darwin-arm64 | `f6e7dc0bad7e98b7ccfcbb31c1491e77320e3646a71743c32e82a31555464df8` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `caa8f4738cf32489e7b13aa185485f82118f1b6ae5824076118c18da99ce43af`) |
| linux-arm64 | `f6e7dc0bad7e98b7ccfcbb31c1491e77320e3646a71743c32e82a31555464df8` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `0ad32cb7b6e40f574306d1d37c046558d1289c931651105803fb6bf1d8fb0cb1`) |
| linux-x64 | `f6e7dc0bad7e98b7ccfcbb31c1491e77320e3646a71743c32e82a31555464df8` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `f0596d80c1fabf293351c3c2877e635265aacc467df29fc615e6180068d857d0`) |
| win32-x64 | `f6e7dc0bad7e98b7ccfcbb31c1491e77320e3646a71743c32e82a31555464df8` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `4ce197fc505c585f4ed09ab43f34084da47112a994aaa8b32965510317da8e2a`) |

The package-smoke status is an independent all-family test. If a future cell fails, that does not erase its authenticated direct Cantor/Kummer receipt; the failure remains a visible release blocker with complete output in the corresponding JSON.
