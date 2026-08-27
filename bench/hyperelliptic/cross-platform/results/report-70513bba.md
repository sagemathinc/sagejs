# Hyperelliptic Phase 10 cross-platform acceptance

Generated from the committed JSON receipts for exact source `70513bba22f7895dfab72e5879f5a5f2ca7d6478`. Absolute times across architectures are descriptive only.

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
| darwin-arm64 | 20:36  up 6 days,  6:31, 3 users, load averages: 1.40 1.48 1.58 | Apple clang version 17.0.0 (clang-1700.4.4.1) |
| linux-arm64 | 03:28:51 up  8:42,  1 user,  load average: 1.00, 1.00, 0.94 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| linux-x64 | 03:25:38 up 3 days, 17:22,  1 user,  load average: 1.05, 0.96, 0.79 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| win32-x64 | Days              : 1 Hours             : 19 Minutes           : 3 Seconds           : 29 Milliseconds      : 250 Ticks             : 1550092507677 TotalDays         : 1.79408855055208 TotalHours        : 43.05812521325 TotalMinutes      : 2583.487512795 TotalSeconds      : 155009.2507677 TotalMilliseconds : 155009250.7677 |  |

## Local factors and Kummer

| Platform | local factors through 100k packed (ms) | coefficient rows (ms) | Kummer 4096 dynamic wall (ms) | native wall (ms) | speedup | peak RSS (MiB) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 6936.19 | 8292.70 | 4313.59 | 219.94 | 19.61x | 603.8 |
| linux-arm64 | 2523.03 | 3698.85 | 3366.20 | 190.27 | 17.69x | 666.3 |
| linux-x64 | 1749.28 | 2737.99 | 2496.14 | 137.99 | 18.09x | 585.2 |
| win32-x64 | 1828.91 | 2912.94 | 2844.30 | 156.22 | 18.21x | 535.8 |

## Public Cantor workloads

The following are end-to-end worker wall times, including the public packed boundary and result handling. Internal arithmetic-only medians remain in the JSON and verifier summary.

| Platform | Genus | add 1000 dynamic/native wall (ms) | add materialized wall (ms) | scalar 64 dynamic/native wall (ms) | scalar materialized wall (ms) | progression 1000 dynamic/retained native/materialized native wall (ms) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | 14073.84 / 41.06 | 1494.88 | 120937.86 / 115.34 | 208.99 | 7988.97 / 64.38 / 322.66 |
| darwin-arm64 | 3 | 17256.95 / 42.99 | 1593.28 | 174182.13 / 134.22 | 217.72 | 8447.97 / 64.11 / 337.02 |
| linux-arm64 | 2 | 14478.29 / 30.75 | 1538.69 | 122931.78 / 87.43 | 184.30 | 8171.96 / 46.85 / 315.71 |
| linux-arm64 | 3 | 17336.57 / 32.36 | 1640.19 | 174889.85 / 114.30 | 220.35 | 8569.25 / 47.69 / 335.66 |
| linux-x64 | 2 | 11337.91 / 24.93 | 1168.02 | 95799.03 / 67.63 | 141.64 | 6414.00 / 37.59 / 242.73 |
| linux-x64 | 3 | 13646.52 / 26.70 | 1250.24 | 135253.22 / 87.29 | 159.73 | 6720.69 / 39.64 / 258.59 |
| win32-x64 | 2 | 12579.26 / 26.85 | 1307.17 | 106269.83 / 85.87 | 174.62 | 6892.71 / 46.00 / 272.36 |
| win32-x64 | 3 | 15393.51 / 30.77 | 1335.62 | 149232.99 / 109.51 | 194.80 | 7346.74 / 44.74 / 278.88 |

## Standalone and authenticated Wasm boundary

| Platform | Genus | standalone core 1000 (ms) | native raw fixed / standalone | Wasm 1000 (ms) | Wasm / standalone |
|---|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | unavailable | unavailable | 5.21 | unavailable |
| darwin-arm64 | 3 | unavailable | unavailable | 4.68 | unavailable |
| linux-arm64 | 2 | 1.10 | 1.044 | 4.54 | 4.133 |
| linux-arm64 | 3 | 1.10 | 1.041 | 3.46 | 3.153 |
| linux-x64 | 2 | 1.00 | 1.042 | 3.30 | 3.286 |
| linux-x64 | 3 | 1.00 | 1.060 | 2.56 | 2.549 |
| win32-x64 | 2 | unavailable | unavailable | 3.26 | unavailable |
| win32-x64 | 3 | unavailable | unavailable | 3.15 | unavailable |

## Explicit unavailable cells

- darwin-arm64 standalone: the checked-in standalone harness emits GNU/ELF --gc-sections and --exclude-libs linker flags rejected by native Mach-O ld; macOS native kernels remain covered separately
- win32-x64 standalone: the checked-in standalone harness currently has a POSIX static-archive linker contract; Windows native kernels remain covered separately
- Magma, PARI/GP, and SageMath: not measured on this Phase 10 matrix; `bench-1` was explicitly excluded.

## Exactness and resource behavior

Every primary receipt has a clean source status and matching dynamic/native digests. The verifier additionally requires the same local-factor, Kummer, tiny-Jacobian, Cantor addition, scalar, and progression digests across hosts.

| Platform | Wasm manifest | checked short output | cancellation / recovery | package smoke |
|---|---|---|---|---|
| darwin-arm64 | `6a83808f00b8be09a61ce77d7aa426c04a55e1d57be48cd695f2aef0b79c984c` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `5fec401927ff4bf632855ed2776ad37a24ffe3b049563aa993105e06b254b4ca`) |
| linux-arm64 | `6a83808f00b8be09a61ce77d7aa426c04a55e1d57be48cd695f2aef0b79c984c` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `75990118e7c10e4b84e5f31118934035e77bb7f406c1cc941830a91b65d3f219`) |
| linux-x64 | `6a83808f00b8be09a61ce77d7aa426c04a55e1d57be48cd695f2aef0b79c984c` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `9e3d876e10c11e053680385f3d28a0461a274c731f0483913708ea7264a3bd68`) |
| win32-x64 | `6a83808f00b8be09a61ce77d7aa426c04a55e1d57be48cd695f2aef0b79c984c` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `b1ca9944b47fff671d4d79aee64b6ccea06790aaee5ef69ed274562b5e4280b7`) |

The package-smoke status is an independent all-family test. If a future cell fails, that does not erase its authenticated direct Cantor/Kummer receipt; the failure remains a visible release blocker with complete output in the corresponding JSON.
