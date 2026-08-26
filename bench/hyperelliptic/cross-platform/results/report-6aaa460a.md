# Hyperelliptic Phase 10 cross-platform acceptance

Generated from the committed JSON receipts for exact source `6aaa460afe6615ce599193cc4fb93e603c473b3e`. Absolute times across architectures are descriptive only.

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
| darwin-arm64 | 17:02  up 5 days,  2:56, 3 users, load averages: 1.61 1.56 1.43 | Apple clang version 17.0.0 (clang-1700.4.4.1) |
| linux-arm64 | 00:00:22 up 13:21,  1 user,  load average: 1.30, 1.05, 0.85 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| linux-x64 | 23:56:41 up 2 days, 13:53,  1 user,  load average: 1.01, 0.89, 0.59 | cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0 |
| win32-x64 | Days              : 0 Hours             : 15 Minutes           : 31 Seconds           : 56 Milliseconds      : 363 Ticks             : 559163632457 TotalDays         : 0.647180130158565 TotalHours        : 15.5323231238056 TotalMinutes      : 931.939387428333 TotalSeconds      : 55916.3632457 TotalMilliseconds : 55916363.2457 |  |

## Local factors and Kummer

| Platform | local factors through 100k packed (ms) | coefficient rows (ms) | Kummer 4096 dynamic wall (ms) | native wall (ms) | speedup | peak RSS (MiB) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 6983.49 | 8252.48 | 4276.79 | 219.54 | 19.48x | 395.6 |
| linux-arm64 | 2524.48 | 3695.26 | 3344.36 | 192.89 | 17.34x | 387.1 |
| linux-x64 | 1748.70 | 2676.80 | 2469.41 | 130.50 | 18.92x | 380.5 |
| win32-x64 | 1675.85 | 2646.52 | 2817.10 | 137.44 | 20.50x | 437.7 |

## Public Cantor workloads

The following are end-to-end worker wall times, including the public packed boundary and result handling. Internal arithmetic-only medians remain in the JSON and verifier summary.

| Platform | Genus | add 1000 dynamic/native wall (ms) | add materialized wall (ms) | scalar 64 dynamic/native wall (ms) | scalar materialized wall (ms) | progression 1000 dynamic/retained native/materialized native wall (ms) |
|---|---:|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | 14159.27 / 238.11 | 1685.51 | 121586.87 / 142.95 | 225.54 | 8044.78 / 64.55 / 322.90 |
| darwin-arm64 | 3 | 17320.29 / 238.82 | 1800.02 | 171791.58 / 162.22 | 227.55 | 8501.96 / 63.99 / 338.27 |
| linux-arm64 | 2 | 14288.22 / 194.72 | 1701.22 | 122173.09 / 101.66 | 198.32 | 8158.64 / 48.17 / 324.11 |
| linux-arm64 | 3 | 17397.26 / 194.84 | 1778.91 | 175010.58 / 128.55 | 233.86 | 8530.51 / 48.14 / 330.43 |
| linux-x64 | 2 | 10449.67 / 147.12 | 1263.54 | 89197.98 / 75.19 | 148.19 | 5934.83 / 36.60 / 239.30 |
| linux-x64 | 3 | 12680.83 / 146.70 | 1324.73 | 127345.61 / 94.58 | 168.96 | 6196.55 / 37.90 / 246.32 |
| win32-x64 | 2 | 11160.99 / 162.40 | 1313.53 | 93558.53 / 92.24 | 161.46 | 6171.19 / 40.87 / 242.67 |
| win32-x64 | 3 | 13459.37 / 154.88 | 1337.83 | 132525.29 / 119.59 | 197.27 | 6447.37 / 39.34 / 243.27 |

## Standalone and authenticated Wasm boundary

| Platform | Genus | standalone core 1000 (ms) | native raw fixed / standalone | Wasm 1000 (ms) | Wasm / standalone |
|---|---:|---:|---:|---:|---:|
| darwin-arm64 | 2 | unavailable | unavailable | 5.08 | unavailable |
| darwin-arm64 | 3 | unavailable | unavailable | 4.64 | unavailable |
| linux-arm64 | 2 | 1.10 | 1.042 | 3.71 | 3.362 |
| linux-arm64 | 3 | 1.10 | 1.052 | 3.45 | 3.134 |
| linux-x64 | 2 | 1.01 | 1.014 | 2.67 | 2.635 |
| linux-x64 | 3 | 1.02 | 0.991 | 2.47 | 2.434 |
| win32-x64 | 2 | unavailable | unavailable | 3.04 | unavailable |
| win32-x64 | 3 | unavailable | unavailable | 2.58 | unavailable |

## Explicit unavailable cells

- darwin-arm64 standalone: the checked-in standalone harness emits GNU/ELF --gc-sections and --exclude-libs linker flags rejected by native Mach-O ld; macOS native kernels remain covered separately
- win32-x64 standalone: the checked-in standalone harness currently has a POSIX static-archive linker contract; Windows native kernels remain covered separately
- Magma, PARI/GP, and SageMath: not measured on this Phase 10 matrix; `bench-1` was explicitly excluded.

## Exactness and resource behavior

Every primary receipt has a clean source status and matching dynamic/native digests. The verifier additionally requires the same local-factor, Kummer, tiny-Jacobian, Cantor addition, scalar, and progression digests across hosts.

| Platform | Wasm manifest | checked short output | cancellation / recovery | package smoke |
|---|---|---|---|---|
| darwin-arm64 | `661c7872f30c396db04d8f20788757d9101e8946167b55539332812c5095c8e5` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `a601e2a37d95e7035cdf522c7133ac47898d3b87f8d5273ee69ed4fdb8be2045`) |
| linux-arm64 | `661c7872f30c396db04d8f20788757d9101e8946167b55539332812c5095c8e5` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `9ee5d8e6a25cc21e83915ef2d95de6053d28b5b72d1e3c2031746a7db1821ac1`) |
| linux-x64 | `661c7872f30c396db04d8f20788757d9101e8946167b55539332812c5095c8e5` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `3c8bf172ec7097d492ca097303e5f7b98e63e125c4fbd0db4f8136421dad85b7`) |
| win32-x64 | `661c7872f30c396db04d8f20788757d9101e8946167b55539332812c5095c8e5` | false; unchanged=true | exit 124; recovery=42 | passed (exit 0, stdout `c22a3be7aeb633e3cefafe3f3a9ee2183106b497a411a0c85bee4c019de89ebc`) |

The package-smoke status is an independent all-family test. If a future cell fails, that does not erase its authenticated direct Cantor/Kummer receipt; the failure remains a visible release blocker with complete output in the corresponding JSON.
