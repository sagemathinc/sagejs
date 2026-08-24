# Hyperelliptic Phase 10 cross-platform acceptance

Generated from the committed JSON receipts for exact source `b1a059358d8a4325ef5be9998feb55a7a27db0fa`. Absolute times across architectures are descriptive only.

No test-only package-smoke overlay was recorded.

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
| darwin-arm64 | 23:50  up 4 days,  9:45, 3 users, load averages: 1.17 1.26 1.34 | Apple clang version 17.0.0 (clang-1700.4.4.1) |
| linux-arm64 | 05:28:47 up 19:02,  1 user,  load average: 1.04, 1.02, 0.96 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| linux-x64 | 06:08:47 up 1 day, 20:05,  1 user,  load average: 1.00, 0.96, 0.78 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| win32-x64 | Days              : 0 Hours             : 22 Minutes           : 2 Seconds           : 43 Milliseconds      : 843 Ticks             : 793638432706 TotalDays         : 0.91856300081713 TotalHours        : 22.0455120196111 TotalMinutes      : 1322.73072117667 TotalSeconds      : 79363.8432706 TotalMilliseconds : 79363843.2706 |  |

## Local factors and Kummer

| Platform | local factors through 100k packed (ms) | coefficient rows (ms) | Kummer 4096 dynamic wall (ms) | native wall (ms) | speedup | peak RSS (MiB) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 6963.02 | 8270.18 | 4296.33 | 218.57 | 19.66x | 497.1 |
| linux-arm64 | 2517.99 | 3724.01 | 3363.16 | 194.38 | 17.30x | 623.8 |
| linux-x64 | 1765.66 | 2783.47 | 2509.57 | 131.46 | 19.09x | 652.0 |
| win32-x64 | 1731.45 | 2682.68 | 2642.21 | 134.08 | 19.71x | 588.9 |

## Public Cantor workloads

The following are end-to-end worker wall times, including the public packed boundary and result handling. Internal arithmetic-only medians remain in the JSON and verifier summary.

| Platform | Genus | add 1000 dynamic/native wall (ms) | add materialized wall (ms) | scalar 64 dynamic/native wall (ms) | scalar materialized wall (ms) | progression 1000 dynamic/retained native/materialized native wall (ms) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | 13806.00 / 234.04 | 1682.13 | 118715.21 / 134.13 | 223.50 | 7835.50 / 63.44 / 324.95 |
| darwin-arm64 | 3 | 16942.60 / 236.75 | 1776.19 | 171341.67 / 169.27 | 261.59 | 8283.77 / 63.25 / 340.39 |
| linux-arm64 | 2 | 13959.84 / 195.86 | 1701.15 | 119761.69 / 101.90 | 200.11 | 7938.94 / 47.97 / 319.29 |
| linux-arm64 | 3 | 17060.36 / 194.99 | 1751.96 | 173266.38 / 129.41 | 229.87 | 8399.18 / 48.78 / 325.52 |
| linux-x64 | 2 | 10251.12 / 147.42 | 1208.33 | 87545.14 / 81.86 | 149.67 | 5834.01 / 39.48 / 232.01 |
| linux-x64 | 3 | 12435.27 / 150.08 | 1269.63 | 124617.06 / 94.07 | 169.23 | 6095.81 / 39.40 / 240.53 |
| win32-x64 | 2 | 10719.47 / 158.01 | 1259.02 | 90750.00 / 90.69 | 164.88 | 5926.65 / 40.73 / 239.99 |
| win32-x64 | 3 | 12981.41 / 163.95 | 1329.28 | 128304.47 / 113.76 | 187.49 | 6195.91 / 39.80 / 259.53 |

## Standalone and authenticated Wasm boundary

| Platform | Genus | standalone core 1000 (ms) | native raw fixed / standalone | Wasm 1000 (ms) | Wasm / standalone |
|---|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | unavailable | unavailable | 5.46 | unavailable |
| darwin-arm64 | 3 | unavailable | unavailable | 4.67 | unavailable |
| linux-arm64 | 2 | 1.10 | 1.044 | 3.88 | 3.530 |
| linux-arm64 | 3 | 1.10 | 1.042 | 3.48 | 3.172 |
| linux-x64 | 2 | 1.00 | 1.019 | 2.86 | 2.855 |
| linux-x64 | 3 | 1.00 | 1.026 | 2.51 | 2.516 |
| win32-x64 | 2 | unavailable | unavailable | 3.15 | unavailable |
| win32-x64 | 3 | unavailable | unavailable | 2.52 | unavailable |

## Explicit unavailable cells

- darwin-arm64 standalone: the checked-in standalone harness emits GNU/ELF --gc-sections and --exclude-libs linker flags rejected by native Mach-O ld; macOS native kernels remain covered separately
- win32-x64 standalone: the checked-in standalone harness currently has a POSIX static-archive linker contract; Windows native kernels remain covered separately
- Magma, PARI/GP, and SageMath: not measured on this Phase 10 matrix; `bench-1` was explicitly excluded.

## Exactness and resource behavior

Every primary receipt has a clean source status and matching dynamic/native digests. The verifier additionally requires the same local-factor, Kummer, tiny-Jacobian, Cantor addition, scalar, and progression digests across hosts.

| Platform | Wasm manifest | checked short output | cancellation / recovery | package smoke |
|---|---|---|---|---|
| darwin-arm64 | `f6e7dc0bad7e98b7ccfcbb31c1491e77320e3646a71743c32e82a31555464df8` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `82b7cf424815de16b4e82c49aa468bb76e35adc815ecbe81649b49d58b2789e5`) |
| linux-arm64 | `f6e7dc0bad7e98b7ccfcbb31c1491e77320e3646a71743c32e82a31555464df8` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `d6fda167050ea97c28b67e4c8ae89395618128728e1b2281f4260bc328f0ae89`) |
| linux-x64 | `f6e7dc0bad7e98b7ccfcbb31c1491e77320e3646a71743c32e82a31555464df8` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `0a416553e11b67f36dc7c3795aac6fd8f46b23b925933d5636eb7306c15a2987`) |
| win32-x64 | `f6e7dc0bad7e98b7ccfcbb31c1491e77320e3646a71743c32e82a31555464df8` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `1403d133315d569fcc2a336c1bb7b6e1aa521b7c36f7d9e9e27b0d99d8f79f99`) |

The package-smoke status is an independent all-family test. If a future cell fails, that does not erase its authenticated direct Cantor/Kummer receipt; the failure remains a visible release blocker with complete output in the corresponding JSON.

