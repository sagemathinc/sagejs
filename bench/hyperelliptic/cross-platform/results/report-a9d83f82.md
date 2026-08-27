# Hyperelliptic Phase 10 cross-platform acceptance

Generated from the committed JSON receipts for exact source `a9d83f82261c3dc28fb8a79c2f161c57a9efc7cc`. Absolute times across architectures are descriptive only.

The independent all-family package smoke uses test-only overlay `b36aab0335322d404254e04085f61cc8252b21bf` (patched test `40964694c659d1152b5b2fc020fd57593bc0487dc039ad12aeedae2fd23fdc21`) while preserving the frozen mathematical source commit and clean status.

This matrix includes the quiet `bench-1` Linux-x64 Sage.js receipt, but does not duplicate Magma, PARI/GP, or SageMath measurements from their separate equal-contract receipts. Missing competitor cells are not counted as Sage.js wins.

## Host and package matrix

| Platform | CPU | Node | Native source | Wasm | Standalone | Package smoke |
|---|---|---:|---|---|---|---|
| darwin-arm64 | Apple M1 Max | v26.5.0 | dynamic/native exact | available | unavailable | passed |
| linux-arm64 | Neoverse-N1 | v26.5.1 | dynamic/native exact | available | available | passed |
| linux-x64 | AMD EPYC 7B13 | v22.22.2 | dynamic/native exact | available | available | passed |
| win32-x64 | AMD EPYC 7B13 | v26.5.1 | dynamic/native exact | available | unavailable | passed |

## Recorded preflight

The full system/process snapshots are retained in each JSON receipt. The macOS timing rows are descriptive shared-host evidence; transient GUI system work was observed during the long dynamic run.

| Platform | uptime/load at start | compiler probe |
|---|---|---|
| darwin-arm64 | 1:48  up 5 days, 11:43, 3 users, load averages: 3.17 3.21 2.52 | Apple clang version 17.0.0 (clang-1700.4.4.1) |
| linux-arm64 | 08:47:17 up 22:08,  1 user,  load average: 1.00, 1.01, 1.00 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| linux-x64 | 08:42:53 up 2 days, 22:39,  1 user,  load average: 1.23, 0.99, 0.87 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| win32-x64 | Days              : 1 Hours             : 0 Minutes           : 20 Seconds           : 32 Milliseconds      : 102 Ticks             : 876321025539 TotalDays         : 1.01426044622569 TotalHours        : 24.3422507094167 TotalMinutes      : 1460.535042565 TotalSeconds      : 87632.1025539 TotalMilliseconds : 87632102.5539 |  |

## Local factors and Kummer

| Platform | local factors through 100k packed (ms) | coefficient rows (ms) | Kummer 4096 dynamic wall (ms) | native wall (ms) | speedup | peak RSS (MiB) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 6972.48 | 8259.53 | 4290.55 | 215.95 | 19.87x | 412.1 |
| linux-arm64 | 2522.39 | 3767.83 | 3322.09 | 196.94 | 16.87x | 398.1 |
| linux-x64 | 1759.05 | 2767.04 | 2568.18 | 139.44 | 18.42x | 409.6 |
| win32-x64 | 1686.32 | 2820.27 | 2640.14 | 150.69 | 17.52x | 464.7 |

## Public Cantor workloads

The following are end-to-end worker wall times, including the public packed boundary and result handling. Internal arithmetic-only medians remain in the JSON and verifier summary.

| Platform | Genus | add 1000 dynamic/native wall (ms) | add materialized wall (ms) | scalar 64 dynamic/native wall (ms) | scalar materialized wall (ms) | progression 1000 dynamic/retained native/materialized native wall (ms) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | 14137.72 / 41.15 | 1518.40 | 123043.32 / 118.84 | 210.00 | 8007.36 / 64.98 / 322.97 |
| darwin-arm64 | 3 | 15133.69 / 41.64 | 1597.00 | 175359.16 / 147.26 | 244.73 | 7770.69 / 63.69 / 336.94 |
| linux-arm64 | 2 | 14297.79 / 31.80 | 1582.24 | 121953.91 / 88.13 | 188.53 | 8183.62 / 49.58 / 323.62 |
| linux-arm64 | 3 | 17442.94 / 33.46 | 1648.81 | 175196.52 / 116.44 | 217.57 | 8561.90 / 49.39 / 328.61 |
| linux-x64 | 2 | 10879.54 / 27.76 | 1186.58 | 91825.38 / 71.40 | 146.25 | 6157.70 / 40.86 / 240.40 |
| linux-x64 | 3 | 13195.34 / 28.62 | 1264.04 | 131791.05 / 86.90 | 168.73 | 6516.58 / 41.19 / 255.97 |
| win32-x64 | 2 | 12023.37 / 29.28 | 1236.99 | 99999.46 / 80.15 | 150.20 | 6552.93 / 42.48 / 254.88 |
| win32-x64 | 3 | 14399.16 / 29.06 | 1294.67 | 139550.82 / 107.46 | 186.66 | 6875.33 / 42.56 / 262.45 |

## Standalone and authenticated Wasm boundary

| Platform | Genus | standalone core 1000 (ms) | native raw fixed / standalone | Wasm 1000 (ms) | Wasm / standalone |
|---|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | unavailable | unavailable | 5.15 | unavailable |
| darwin-arm64 | 3 | unavailable | unavailable | 4.65 | unavailable |
| linux-arm64 | 2 | 1.10 | 1.052 | 4.36 | 3.962 |
| linux-arm64 | 3 | 1.10 | 1.041 | 3.44 | 3.131 |
| linux-x64 | 2 | 1.00 | 1.046 | 2.93 | 2.932 |
| linux-x64 | 3 | 0.99 | 1.058 | 2.56 | 2.573 |
| win32-x64 | 2 | unavailable | unavailable | 2.67 | unavailable |
| win32-x64 | 3 | unavailable | unavailable | 2.67 | unavailable |

## Explicit unavailable cells

- darwin-arm64 standalone: the checked-in standalone harness emits GNU/ELF --gc-sections and --exclude-libs linker flags rejected by native Mach-O ld; macOS native kernels remain covered separately
- win32-x64 standalone: the checked-in standalone harness currently has a POSIX static-archive linker contract; Windows native kernels remain covered separately
- Magma, PARI/GP, and SageMath: not measured on this Phase 10 matrix; `bench-1` was explicitly excluded.

## Exactness and resource behavior

Every primary receipt has a clean source status and matching dynamic/native digests. The verifier additionally requires the same local-factor, Kummer, tiny-Jacobian, Cantor addition, scalar, and progression digests across hosts.

| Platform | Wasm manifest | checked short output | cancellation / recovery | package smoke |
|---|---|---|---|---|
| darwin-arm64 | `8cc40c709513c7e0a79f3497f8702cb3f665ce57559659303deed9396842488d` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `6d7bda51b523c114bec82c75a8760b21878fb04c165c406062a202ce9fb6841f`) |
| linux-arm64 | `8cc40c709513c7e0a79f3497f8702cb3f665ce57559659303deed9396842488d` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `eb6d152b4dc3eb3ffd5e7fd29346df4cc65d14602dea5c387caa0271fda034b2`) |
| linux-x64 | `8cc40c709513c7e0a79f3497f8702cb3f665ce57559659303deed9396842488d` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `981f36e2e9fe5dd6705ad5e683ea0a09a03adb9f2eea206018bda522b11f9bed`) |
| win32-x64 | `8cc40c709513c7e0a79f3497f8702cb3f665ce57559659303deed9396842488d` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `1f1295992be8233970fecff94ce43be1965960b9401f3a73e534289886dc9274`) |

The package-smoke status is an independent all-family test. If a future cell fails, that does not erase its authenticated direct Cantor/Kummer receipt; the failure remains a visible release blocker with complete output in the corresponding JSON.
