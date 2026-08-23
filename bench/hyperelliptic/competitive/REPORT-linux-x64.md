# Final integrated competitive hyperelliptic receipt

Generated from `/home/user/sagejs/bench/hyperelliptic/competitive/receipt-linux-x64.json` (2026-08-23T15:57:52.721Z).

Source commit: `68ab3bc4e5d076defae0bc0f4160696b58b42c0c`. Corpus: `f58ce393bd5070b0606a919a5132af79e4fd4f4cfab893fc6e42c8e5d9defd2a` (28 acceptance cases).

> This is the after-performance acceptance receipt. Workload-specific gates and unsupported cells remain explicit; it is not a claim that one system is universally faster.

Host: cocalc-vm-51c5044ca6d3406d983e0f10, x64 linux, AMD EPYC 7B13, Node v22.22.2.

> Times are median ± MAD in milliseconds. “Loop/item” is a serial repeated warm loop, not a packed batch. A cache hit is never labeled warm arithmetic. Unsupported and unavailable cells are retained.

> Magma 2.18-5 reports `Realtime()` in 10 ms quanta and PARI/GP reports `getwalltime()` in 1 ms quanta. A displayed zero for those backends means below timer resolution, never zero cost; no finite speed ratio may be inferred from it.

| Case | Backend | Status | Object cold wall | Object cold CPU | Warm wall | Warm CPU | Warm mode | Loop/item wall | Loop/item CPU | Exact digest | Notes |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|
| g2-p13-add-coprime | sagejs | ok | 14.13 ± 1.82 | 14.11 ± 1.82 | 3.53 ± 0.1304 | 3.51 ± 0.1297 | warm-arithmetic | 1.98 ± 0.0205 | 1.98 ± 0.0205 | `2ef2ecec534e…` | — |
| g2-p13-double | sagejs | ok | 8.14 ± 0.5369 | 8.12 ± 0.5476 | 2.50 ± 0.0920 | 2.49 ± 0.0916 | warm-arithmetic | 2.01 ± 0.0139 | 2.01 ± 0.0139 | `09674064d70d…` | — |
| g2-p13-scalar-256 | sagejs | ok | 7.22 ± 0.0458 | 7.20 ± 0.0460 | 3.04 ± 0.0610 | 3.02 ± 0.0749 | warm-arithmetic | 3.09 ± 0.0007 | 3.08 ± 0.0045 | `e9713735b8ce…` | — |
| g2-p13-general-h-shared-factor | sagejs | ok | 7.59 ± 0.0916 | 7.57 ± 0.0939 | 2.55 ± 0.0136 | 2.52 ± 0.0143 | warm-arithmetic | 1.98 ± 0.0186 | 1.98 ± 0.0186 | `99b09d0ab83d…` | — |
| g2-p13-conjugate-cancellation | sagejs | ok | 7.52 ± 0.2873 | 7.50 ± 0.2861 | 2.33 ± 0.0420 | 2.32 ± 0.0329 | warm-arithmetic | 1.96 ± 0.0140 | 1.96 ± 0.0140 | `a7f15699bd21…` | — |
| g2-p13-degree0-validate | sagejs | ok | 1.97 ± 0.0291 | 1.95 ± 0.0286 | 0.0784 ± 0.0098 | 0.0675 ± 0.0093 | warm-arithmetic | 0.0010 ± 0.0001 | 0.0010 ± 0.0001 | `a7f15699bd21…` | — |
| g3-p5-degree3-validate | sagejs | ok | 2.38 ± 0.0479 | 2.36 ± 0.0532 | 0.1001 ± 0.0107 | 0.0896 ± 0.0107 | warm-arithmetic | 0.0010 ± 0.0001 | 0.0010 ± 0.0001 | `a0260df28834…` | — |
| g3-p5-double | sagejs | ok | 6.20 ± 0.2093 | 6.18 ± 0.2091 | 2.49 ± 0.0393 | 2.46 ± 0.0250 | warm-arithmetic | 1.98 ± 0.0109 | 1.98 ± 0.0109 | `f912beca55ec…` | — |
| g3-p5-scalar-1024 | sagejs | ok | 9.24 ± 0.1574 | 9.23 ± 0.1574 | 5.62 ± 0.1111 | 5.59 ± 0.1237 | warm-arithmetic | 5.40 ± 0.0453 | 5.38 ± 0.0436 | `a0260df28834…` | — |
| g3-p5-scalar-64-native | sagejs | ok | 5.70 ± 0.1152 | 5.68 ± 0.1144 | 2.10 ± 0.0167 | 2.09 ± 0.0165 | warm-arithmetic | 2.15 ± 0.0038 | 2.12 ± 0.0083 | `e1ac63614965…` | — |
| g3-p5-scalar-64-reference | sagejs | ok | 423.48 ± 4.59 | 423.46 ± 4.59 | 407.32 ± 0.5350 | 407.30 ± 0.5341 | warm-arithmetic | 412.56 ± 5.81 | 412.53 ± 5.80 | `e1ac63614965…` | — |
| g2-p5-group-rank2 | sagejs | ok | 315.47 ± 7.46 | 315.46 ± 7.46 | 0.2429 ± 0.0212 | 0.2306 ± 0.0217 | cache-hit | 0.2282 ± 0.0162 | 0.2139 ± 0.0098 | `6a0697e30112…` | — |
| g3-p13-group-cyclic | sagejs | ok | 855.28 ± 5.55 | 855.24 ± 5.57 | 0.2270 ± 0.0174 | 0.2155 ± 0.0181 | cache-hit | 0.2494 ± 0.0131 | 0.2370 ± 0.0331 | `cc8eccc094f5…` | — |
| g3-p19-group-cyclic | sagejs | ok | 2448.07 ± 42.73 | 2448.06 ± 42.73 | 0.2112 ± 0.0191 | 0.2003 ± 0.0196 | cache-hit | 0.2100 ± 0.0110 | 0.1981 ± 0.0105 | `cff5cedb61f5…` | — |
| g2-p11-local-factor | sagejs | ok | 2.41 ± 0.0596 | 2.38 ± 0.0436 | 0.7560 ± 0.0215 | 0.7432 ± 0.0210 | warm-arithmetic | 0.5019 ± 0.0063 | 0.5019 ± 0.0063 | `6d893c0d3152…` | — |
| g3-p7-local-factor | sagejs | ok | 128.26 ± 0.2437 | 128.22 ± 0.2494 | 0.7589 ± 0.1040 | 0.7451 ± 0.1025 | warm-arithmetic | 0.7179 ± 0.0064 | 0.6979 ± 0.0055 | `89089dd96b9c…` | — |
| g2-p5-even-local-factor | sagejs | ok | 2.22 ± 0.0274 | 2.20 ± 0.0269 | 0.6728 ± 0.0124 | 0.6595 ± 0.0131 | warm-arithmetic | 0.4961 ± 0.0054 | 0.4960 ± 0.0054 | `ef846163660a…` | — |
| g3-p5-even-local-factor | sagejs | ok | 57.10 ± 1.02 | 57.06 ± 1.04 | 0.7174 ± 0.0799 | 0.7043 ± 0.0794 | warm-arithmetic | 0.7188 ± 0.0081 | 0.7069 ± 0.0207 | `2c1256046956…` | — |
| g2-global-reduction | sagejs | ok | 125.77 ± 8.24 | 125.75 ± 8.26 | 0.1383 ± 0.0045 | 0.1268 ± 0.0050 | cache-hit | 0.1373 ± 0.0124 | 0.1137 ± 0.0007 | `8b2fbc8a4213…` | — |
| g2-qq-general-h-shared-factor | sagejs | ok | 15.66 ± 0.4611 | 15.63 ± 0.4613 | 6.77 ± 0.1047 | 6.75 ± 0.0973 | warm-arithmetic | 5.02 ± 0.1111 | 5.02 ± 0.1111 | `5f8e42de746b…` | — |
| g2-real-period-64 | sagejs | ok | 2.47 ± 0.1042 | 2.44 ± 0.1032 | 1170.83 ± 0.3881 | 1170.81 ± 0.3664 | cache-hit | 1162.92 ± 1.30 | 1162.90 ± 1.29 | — | — |
| g2-central-value-32 | sagejs | ok | 147.45 ± 1.74 | 147.43 ± 1.74 | 4.08 ± 0.1247 | 4.07 ± 0.1254 | cache-hit | 4.12 ± 0.0663 | 4.10 ± 0.0644 | — | — |
| g2-lfunction-init-32-order4 | sagejs | ok | 139.24 ± 1.22 | 139.22 ± 1.22 | 6.12 ± 0.4930 | 6.08 ± 0.4711 | prepared-curve-init | 5.91 ± 0.1268 | 5.89 ± 0.1273 | — | — |
| g3-real-period-64 | sagejs | ok | 2.48 ± 0.2298 | 2.46 ± 0.2277 | 1622.93 ± 4.90 | 1622.91 ± 4.88 | cache-hit | 1612.18 ± 4.34 | 1612.16 ± 4.32 | — | — |
| g3-central-value-16 | sagejs | ok | 1369.70 ± 41.63 | 1369.68 ± 41.63 | 3.71 ± 0.0510 | 3.69 ± 0.0501 | cache-hit | 3.82 ± 0.1135 | 3.80 ± 0.1125 | — | — |
| unsupported-characteristic-2-jacobian | sagejs | ok | 0.5901 ± 0.0000 | 0.6034 ± 0.0000 | — | — | not-applicable | — | — | `a588afe1d1f1…` | — |
| unsupported-even-degree-jacobian | sagejs | ok | 0.5388 ± 0.0000 | 0.5622 ± 0.0000 | — | — | not-applicable | — | — | `693f27ced8b6…` | — |
| unsupported-wild-p2-global | sagejs | ok | 3.59 ± 0.0000 | 3.60 ± 0.0000 | — | — | not-applicable | — | — | `4cdeb2cf7d0f…` | — |
| g2-p13-add-coprime | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-double | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-scalar-256 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-general-h-shared-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-conjugate-cancellation | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-degree0-validate | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-degree3-validate | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-double | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-scalar-1024 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-scalar-64-native | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-scalar-64-reference | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p5-group-rank2 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p13-group-cyclic | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p19-group-cyclic | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p11-local-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p7-local-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p5-even-local-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-even-local-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-global-reduction | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-qq-general-h-shared-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-real-period-64 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-central-value-32 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-lfunction-init-32-order4 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-real-period-64 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-central-value-16 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| unsupported-characteristic-2-jacobian | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| unsupported-even-degree-jacobian | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| unsupported-wild-p2-global | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-add-coprime | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-double | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-scalar-256 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-general-h-shared-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-conjugate-cancellation | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-degree0-validate | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-degree3-validate | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-double | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-scalar-1024 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-scalar-64-native | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-scalar-64-reference | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p5-group-rank2 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p13-group-cyclic | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p19-group-cyclic | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p11-local-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p7-local-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p5-even-local-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-even-local-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-global-reduction | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-qq-general-h-shared-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-real-period-64 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-central-value-32 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-lfunction-init-32-order4 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-real-period-64 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-central-value-16 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| unsupported-characteristic-2-jacobian | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| unsupported-even-degree-jacobian | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| unsupported-wild-p2-global | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-add-coprime | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `2ef2ecec534e…` | 10 ms Realtime resolution; zero means below resolution |
| g2-p13-double | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `09674064d70d…` | 10 ms Realtime resolution; zero means below resolution |
| g2-p13-scalar-256 | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `e9713735b8ce…` | 10 ms Realtime resolution; zero means below resolution |
| g2-p13-general-h-shared-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `99b09d0ab83d…` | 10 ms Realtime resolution; zero means below resolution |
| g2-p13-conjugate-cancellation | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `a7f15699bd21…` | 10 ms Realtime resolution; zero means below resolution |
| g2-p13-degree0-validate | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `a7f15699bd21…` | 10 ms Realtime resolution; zero means below resolution |
| g3-p5-degree3-validate | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `a0260df28834…` | 10 ms Realtime resolution; zero means below resolution |
| g3-p5-double | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `f912beca55ec…` | 10 ms Realtime resolution; zero means below resolution |
| g3-p5-scalar-1024 | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 10.00 ± 0.0000 | — | `a0260df28834…` | 10 ms Realtime resolution; zero means below resolution |
| g3-p5-scalar-64-native | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `e1ac63614965…` | 10 ms Realtime resolution; zero means below resolution |
| g3-p5-scalar-64-reference | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `e1ac63614965…` | 10 ms Realtime resolution; zero means below resolution |
| g2-p5-group-rank2 | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | cache-hit | 0.0000 ± 0.0000 | — | `6a0697e30112…` | 10 ms Realtime resolution; zero means below resolution |
| g3-p13-group-cyclic | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | cache-hit | 0.0000 ± 0.0000 | — | `cc8eccc094f5…` | 10 ms Realtime resolution; zero means below resolution |
| g3-p19-group-cyclic | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | cache-hit | 0.0000 ± 0.0000 | — | `cff5cedb61f5…` | 10 ms Realtime resolution; zero means below resolution |
| g2-p11-local-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `6d893c0d3152…` | 10 ms Realtime resolution; zero means below resolution |
| g3-p7-local-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `89089dd96b9c…` | 10 ms Realtime resolution; zero means below resolution |
| g2-p5-even-local-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `ef846163660a…` | 10 ms Realtime resolution; zero means below resolution |
| g3-p5-even-local-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `2c1256046956…` | 10 ms Realtime resolution; zero means below resolution |
| g2-global-reduction | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable global_reduction contract |
| g2-qq-general-h-shared-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `5f8e42de746b…` | 10 ms Realtime resolution; zero means below resolution |
| g2-real-period-64 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable real_period contract |
| g2-central-value-32 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable central_value contract |
| g2-lfunction-init-32-order4 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable lfunction_init contract |
| g3-real-period-64 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable real_period contract |
| g3-central-value-16 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable central_value contract |
| unsupported-characteristic-2-jacobian | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable unsupported_characteristic_2_jacobian contract |
| unsupported-even-degree-jacobian | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable unsupported_even_degree_jacobian contract |
| unsupported-wild-p2-global | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable unsupported_wild_global contract |
| g2-p13-add-coprime | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_add contract |
| g2-p13-double | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_double contract |
| g2-p13-scalar-256 | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_scalar contract |
| g2-p13-general-h-shared-factor | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_add contract |
| g2-p13-conjugate-cancellation | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_add contract |
| g2-p13-degree0-validate | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_validate contract |
| g3-p5-degree3-validate | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_validate contract |
| g3-p5-double | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_double contract |
| g3-p5-scalar-1024 | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_scalar contract |
| g3-p5-scalar-64-native | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_scalar contract |
| g3-p5-scalar-64-reference | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_scalar contract |
| g2-p5-group-rank2 | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable group_structure contract |
| g3-p13-group-cyclic | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable group_structure contract |
| g3-p19-group-cyclic | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable group_structure contract |
| g2-p11-local-factor | pari | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | resident-recompute | 0.0050 ± 0.0000 | — | `6d893c0d3152…` | 1 ms getwalltime resolution; zero means below resolution; PARI bits n/a→64 |
| g3-p7-local-factor | pari | ok | 1.00 ± 0.0000 | — | 1.00 ± 0.0000 | — | resident-recompute | 1.00 ± 0.0000 | — | `89089dd96b9c…` | 1 ms getwalltime resolution; zero means below resolution; PARI bits n/a→64 |
| g2-p5-even-local-factor | pari | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | resident-recompute | 0.0020 ± 0.0000 | — | `ef846163660a…` | 1 ms getwalltime resolution; zero means below resolution; PARI bits n/a→64 |
| g3-p5-even-local-factor | pari | ok | 1.00 ± 0.0000 | — | 1.00 ± 0.0000 | — | resident-recompute | 1.00 ± 0.0000 | — | `2c1256046956…` | 1 ms getwalltime resolution; zero means below resolution; PARI bits n/a→64 |
| g2-global-reduction | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable global_reduction contract |
| g2-qq-general-h-shared-factor | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_add contract |
| g2-real-period-64 | pari | ok | 2.00 ± 0.0000 | — | 2.00 ± 0.0000 | — | resident-recompute | 2.00 ± 0.0000 | — | — | 1 ms getwalltime resolution; zero means below resolution; PARI bits 64→64 |
| g2-central-value-32 | pari | ok | 3.00 ± 0.0000 | — | 0.0000 ± 0.0000 | — | prepared-analytic-evaluation | 0.0000 ± 0.0000 | — | — | 1 ms getwalltime resolution; zero means below resolution; PARI bits 32→32 |
| g2-lfunction-init-32-order4 | pari | ok | 3.00 ± 0.0000 | — | 3.00 ± 0.0000 | — | prepared-descriptor-init | 3.00 ± 0.0000 | — | — | 1 ms getwalltime resolution; zero means below resolution; PARI bits 32→32 |
| g3-real-period-64 | pari | ok | 4.00 ± 0.0000 | — | 4.00 ± 0.0000 | — | resident-recompute | 4.00 ± 0.0000 | — | — | 1 ms getwalltime resolution; zero means below resolution; PARI bits 64→64 |
| g3-central-value-16 | pari | unsupported | — | — | — | — | — | — | — | — | PARI lfungenus2 is genus-2 only |
| unsupported-characteristic-2-jacobian | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable unsupported_characteristic_2_jacobian contract |
| unsupported-even-degree-jacobian | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable unsupported_even_degree_jacobian contract |
| unsupported-wild-p2-global | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable unsupported_wild_global contract |
| g2-p13-add-coprime | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-double | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-scalar-256 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-general-h-shared-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-conjugate-cancellation | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-degree0-validate | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-degree3-validate | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-double | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-scalar-1024 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-scalar-64-native | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-scalar-64-reference | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p5-group-rank2 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p13-group-cyclic | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p19-group-cyclic | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p11-local-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p7-local-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p5-even-local-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-even-local-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-global-reduction | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-qq-general-h-shared-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-real-period-64 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-central-value-32 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-lfunction-init-32-order4 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-real-period-64 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-central-value-16 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| unsupported-characteristic-2-jacobian | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| unsupported-even-degree-jacobian | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| unsupported-wild-p2-global | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |

## Resident resource envelope

| Backend | Process-cold wall ms | Outer CPU user/system ms | Resident peak RSS KiB | Mathematical user/system s |
|---|---:|---:|---:|---:|
| sagejs | 238626.81 | 1.23 / 0.0740 | 1088032 | 250.25 / 1.55 |
| standalone | — | — | — | — |
| wasm | — | — | — | — |
| magma | 493.70 | 0.0670 / 1.07 | 22432 | 0.3600 / 0.0800 |
| pari | 244.52 | 0.1500 / 1.18 | 13468 | 0.1900 / 0.0000 |
| sagemath | — | — | — | — |

## Validation

Every emitted timing row passed its declared exact or numerical result contract.

Exact cross-backend digests are computed only after normalization (for example, Magma's odd-degree infinity weight is checked but not treated as an extra mathematical result).

## Host preflight

```text
$ uptime
15:57:52 up 1 day,  5:54,  1 user,  load average: 0.08, 0.35, 0.32
$ uname -a
Linux cocalc-vm-51c5044ca6d3406d983e0f10 6.17.0-1022-gcp #25-Ubuntu SMP Sat Jul 25 01:12:40 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux
$ lscpu
Architecture:                            x86_64
CPU op-mode(s):                          32-bit, 64-bit
Address sizes:                           48 bits physical, 48 bits virtual
Byte Order:                              Little Endian
CPU(s):                                  8
On-line CPU(s) list:                     0-7
Vendor ID:                               AuthenticAMD
Model name:                              AMD EPYC 7B13
CPU family:                              25
Model:                                   1
Thread(s) per core:                      1
Core(s) per socket:                      8
Socket(s):                               1
Stepping:                                0
BogoMIPS:                                4899.99
Flags:                                   fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ht syscall nx mmxext fxsr_opt pdpe1gb rdtscp lm constant_tsc rep_good nopl xtopology nonstop_tsc cpuid extd_apicid tsc_known_freq pni pclmulqdq ssse3 fma cx16 pcid sse4_1 sse4_2 x2apic movbe popcnt aes xsave avx f16c rdrand hypervisor lahf_lm cmp_legacy cr8_legacy abm sse4a misalignsse 3dnowprefetch osvw topoext ssbd ibrs ibpb stibp vmmcall fsgsbase tsc_adjust bmi1 avx2 smep bmi2 erms invpcid rdseed adx smap clflushopt clwb sha_ni xsaveopt xsavec xgetbv1 clzero xsaveerptr arat umip vaes vpclmulqdq rdpid fsrm
Hypervisor vendor:                       KVM
Virtualization type:                     full
L1d cache:                               256 KiB (8 instances)
L1i cache:                               256 KiB (8 instances)
L2 cache:                                4 MiB (8 instances)
L3 cache:                                32 MiB (1 instance)
NUMA node(s):                            1
NUMA node0 CPU(s):                       0-7
Vulnerability Gather data sampling:      Not affected
Vulnerability Ghostwrite:                Not affected
Vulnerability Indirect target selection: Not affected
Vulnerability Itlb multihit:             Not affected
Vulnerability L1tf:                      Not affected
Vulnerability Mds:                       Not affected
Vulnerability Meltdown:                  Not affected
Vulnerability Mmio stale data:           Not affected
Vulnerability Old microcode:             Not affected
Vulnerability Reg file data sampling:    Not affected
Vulnerability Retbleed:                  Not affected
Vulnerability Spec rstack overflow:      Mitigation; Safe RET
Vulnerability Spec store bypass:         Mitigation; Speculative Store Bypass disabled via prctl
Vulnerability Spectre v1:                Mitigation; usercopy/swapgs barriers and __user pointer sanitization
Vulnerability Spectre v2:                Mitigation; Retpolines; IBPB conditional; IBRS_FW; STIBP disabled; RSB filling; PBRSB-eIBRS Not affected; BHI Not affected
Vulnerability Srbds:                     Not affected
Vulnerability Tsa:                       Mitigation; Clear CPU buffers
Vulnerability Tsx async abort:           Not affected
Vulnerability Vmscape:                   Not affected
$ free -b
total        used        free      shared  buff/cache   available
Mem:     33649016832  1107447808  4580438016     1073152 28446490624 32541569024
Swap:              0           0           0
$ ps -eo pid,ppid,comm,%cpu,%mem,rss --sort=-%cpu | head -25
PID    PPID COMMAND         %CPU %MEM   RSS
 763449  763448 node            40.0  0.1 48864
 763387       1 systemd         32.3  0.0 11572
      1       0 systemd          0.0  0.0 14008
 640182       2 kworker/u32:4-i  0.0  0.0     0
     15       2 rcu_sched        0.0  0.0     0
    708       1 google_osconfig  0.0  0.1 49712
    977       1 google_guest_ag  0.0  0.0 23288
    177       1 systemd-journal  0.0  0.2 76996
    241       1 multipathd       0.0  0.0 27332
     97       2 hwrng            0.0  0.0     0
 759633       2 kworker/u32:5+i  0.0  0.0     0
    693       1 dbus-daemon      0.0  0.0  5504
 638951       2 kworker/0:0-eve  0.0  0.0     0
 759630       2 kworker/u32:3-i  0.0  0.0     0
 639486       2 kworker/7:0-eve  0.0  0.0     0
    754       1 snapd            0.0  0.1 41060
   1178       1 systemd-logind   0.0  0.0  8996
    793       1 rsyslogd         0.0  0.0  6500
     73       2 kcompactd0       0.0  0.0     0
   1091       1 polkitd          0.0  0.0  8900
 757957       2 kworker/1:1-eve  0.0  0.0     0
 757241       2 kworker/2:2-eve  0.0  0.0     0
 635375       2 kworker/5:2-eve  0.0  0.0     0
 633356       2 kworker/3:2-eve  0.0  0.0     0
$ for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do test -r "$f" && printf '%s=' "$f" && cat "$f"; done

```

