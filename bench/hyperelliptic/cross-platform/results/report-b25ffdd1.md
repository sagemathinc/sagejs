# Hyperelliptic Phase 10 cross-platform acceptance

Generated from the committed JSON receipts for exact source `b25ffdd128cb19d95c979133349fb205a40f26e4`. Absolute times across architectures are descriptive only.

No test-only package-smoke overlay was recorded.

This matrix includes the quiet `bench-1` Linux-x64 Sage.js receipt, but does not duplicate Magma, PARI/GP, or SageMath measurements from their separate equal-contract receipts. Missing competitor cells are not counted as Sage.js wins.

## Host and package matrix

| Platform | CPU | Node | Native source | Wasm | Standalone | Package smoke |
|---|---|---:|---|---|---|---|
| darwin-arm64 | Apple M1 Max | v26.5.0 | dynamic/native exact | available | unavailable | passed |
| linux-arm64 | Neoverse-N1 | v26.5.1 | dynamic/native exact | available | available | passed |
| linux-x64 | AMD EPYC 7B13 | v26.5.1 | dynamic/native exact | available | available | passed |
| win32-x64 | AMD EPYC 7B13 | v26.5.1 | dynamic/native exact | available | unavailable | passed |

## Recorded preflight

The full system/process snapshots are retained in each JSON receipt. The macOS timing rows are descriptive shared-host evidence; transient GUI system work was observed during the long dynamic run.

| Platform | uptime/load at start | compiler probe |
|---|---|---|
| darwin-arm64 | 17:46  up 5 days,  3:40, 3 users, load averages: 1.60 1.61 1.47 | Apple clang version 17.0.0 (clang-1700.4.4.1) |
| linux-arm64 | 00:44:51 up 14:06,  1 user,  load average: 1.18, 1.01, 0.73 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| linux-x64 | 00:41:02 up 2 days, 14:37,  1 user,  load average: 1.05, 1.01, 0.95 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| win32-x64 | Days              : 0 Hours             : 16 Minutes           : 17 Seconds           : 8 Milliseconds      : 968 Ticks             : 586289683798 TotalDays         : 0.678576022914352 TotalHours        : 16.2858245499444 TotalMinutes      : 977.149472996667 TotalSeconds      : 58628.9683798 TotalMilliseconds : 58628968.3798 |  |

## Local factors and Kummer

| Platform | local factors through 100k packed (ms) | coefficient rows (ms) | Kummer 4096 dynamic wall (ms) | native wall (ms) | speedup | peak RSS (MiB) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 6983.18 | 8260.33 | 4268.85 | 219.94 | 19.41x | 461.5 |
| linux-arm64 | 2518.87 | 3713.55 | 3282.03 | 198.13 | 16.57x | 459.7 |
| linux-x64 | 1770.42 | 2693.12 | 2481.95 | 134.18 | 18.50x | 436.4 |
| win32-x64 | 1706.23 | 2683.46 | 2588.79 | 136.80 | 18.92x | 480.9 |

## Public Cantor workloads

The following are end-to-end worker wall times, including the public packed boundary and result handling. Internal arithmetic-only medians remain in the JSON and verifier summary.

| Platform | Genus | add 1000 dynamic/native wall (ms) | add materialized wall (ms) | scalar 64 dynamic/native wall (ms) | scalar materialized wall (ms) | progression 1000 dynamic/retained native/materialized native wall (ms) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | 14079.33 / 236.92 | 1706.60 | 121540.81 / 129.02 | 204.52 | 8024.46 / 64.44 / 325.50 |
| darwin-arm64 | 3 | 17362.99 / 237.83 | 1761.04 | 171588.33 / 164.18 | 285.14 | 8457.83 / 64.39 / 338.61 |
| linux-arm64 | 2 | 14552.62 / 191.69 | 1705.74 | 124190.68 / 102.65 | 202.45 | 8255.98 / 48.19 / 319.06 |
| linux-arm64 | 3 | 17630.89 / 192.09 | 1784.28 | 176988.33 / 127.65 | 232.75 | 8723.53 / 47.50 / 330.21 |
| linux-x64 | 2 | 10455.91 / 146.18 | 1272.44 | 89580.84 / 75.99 | 147.54 | 5926.85 / 37.20 / 239.90 |
| linux-x64 | 3 | 12718.15 / 146.09 | 1315.30 | 127818.64 / 91.52 | 169.23 | 6213.61 / 37.74 / 244.17 |
| win32-x64 | 2 | 10976.75 / 155.41 | 1281.31 | 94024.28 / 86.45 | 159.94 | 6145.57 / 39.74 / 246.29 |
| win32-x64 | 3 | 13252.82 / 158.62 | 1393.99 | 132452.57 / 123.52 | 204.61 | 6451.06 / 40.98 / 263.84 |

## Standalone and authenticated Wasm boundary

| Platform | Genus | standalone core 1000 (ms) | native raw fixed / standalone | Wasm 1000 (ms) | Wasm / standalone |
|---|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | unavailable | unavailable | 4.83 | unavailable |
| darwin-arm64 | 3 | unavailable | unavailable | 4.68 | unavailable |
| linux-arm64 | 2 | 1.10 | 1.053 | 3.88 | 3.518 |
| linux-arm64 | 3 | 1.10 | 1.037 | 3.49 | 3.166 |
| linux-x64 | 2 | 1.02 | 0.992 | 3.10 | 3.044 |
| linux-x64 | 3 | 1.02 | 0.994 | 2.47 | 2.425 |
| win32-x64 | 2 | unavailable | unavailable | 2.84 | unavailable |
| win32-x64 | 3 | unavailable | unavailable | 2.70 | unavailable |

## Explicit unavailable cells

- darwin-arm64 standalone: the checked-in standalone harness emits GNU/ELF --gc-sections and --exclude-libs linker flags rejected by native Mach-O ld; macOS native kernels remain covered separately
- win32-x64 standalone: the checked-in standalone harness currently has a POSIX static-archive linker contract; Windows native kernels remain covered separately
- Magma, PARI/GP, and SageMath: not measured on this Phase 10 matrix; `bench-1` was explicitly excluded.

## Exactness and resource behavior

Every primary receipt has a clean source status and matching dynamic/native digests. The verifier additionally requires the same local-factor, Kummer, tiny-Jacobian, Cantor addition, scalar, and progression digests across hosts.

| Platform | Wasm manifest | checked short output | cancellation / recovery | package smoke |
|---|---|---|---|---|
| darwin-arm64 | `3871c4d7cd86f6ea31335c567d6d54accfb47aef43450f80bfee6afea369cb28` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `7de1c8a0d09a22921ac1ad97621b27e1bbb04347e9b09f1ebf566be19ea9b3e2`) |
| linux-arm64 | `3871c4d7cd86f6ea31335c567d6d54accfb47aef43450f80bfee6afea369cb28` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `72333ef788f03e161d430d829c848e23f1db36a99bea2bcb80d19f314be1aeb2`) |
| linux-x64 | `3871c4d7cd86f6ea31335c567d6d54accfb47aef43450f80bfee6afea369cb28` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `f69a47f197c51e6c3340a06b08d551f13bdcdaf6866190db992245b44d521bb1`) |
| win32-x64 | `3871c4d7cd86f6ea31335c567d6d54accfb47aef43450f80bfee6afea369cb28` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `d5af9c449cfd35d1dc2393e251fd868fa0c18b7f12e6f8048a0c984c3dc14e29`) |

The package-smoke status is an independent all-family test. If a future cell fails, that does not erase its authenticated direct Cantor/Kummer receipt; the failure remains a visible release blocker with complete output in the corresponding JSON.
