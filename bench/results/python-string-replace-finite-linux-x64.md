# Python `str.replace`: finite-count assembly

Development-host observation, 2026-09-28. These timings are provisional, not
an independently confirmed performance-cliff closure. The same ordinary Python
source ran under both Sage.js revisions and CPython:
[`bench/python-string-replace.py`](../python-string-replace.py), SHA-256
`8fb2b321506197f6c8a8312a4f77c71d337edde5dc5266f456885227958f9de0`.

- Parent: `c43f37882c8c347d97d132da7f8c2a9098755e4a` (#349).
- Candidate: `c3c7e79429d60118351510a3af9078be3e28f996`.
- Linux x64, AMD EPYC 7B13, Node 26.10.0, CPython 3.14.4.
- Warm throughput only: 200 calls per batch, three warmup batches, seven
  measured batches; milliseconds are medians. Each batch checks its output
  length. Startup, compilation, peak memory, and browser execution are not
  included. A separate numerical integration run was active on this shared
  host; a quiet independent host was unavailable.

| Workload | Parent ms | Candidate ms | CPython ms | Parent / candidate | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| Replace 2 of 2,500 matches | 1.074 | 1.110 | 0.043 | 0.97× | 25.8× |
| Replace 8 of 2,500 matches | 2.906 | 1.152 | 0.060 | 2.5× | 19.2× |
| Replace 100 of 2,500 matches | 26.482 | 1.667 | 0.345 | 15.9× | 4.8× |
| Replace 1,000 of 2,500 matches | 276.990 | 7.557 | 3.042 | 36.7× | 2.5× |
| Replace once, 5,000 chars | 0.863 | 0.698 | 0.039 | 1.24× | 17.9× |
| Replace all, 5,000 chars | 11.979 | 11.738 | 7.570 | 1.02× | 1.55× |
| Three-pass HTML escaping | 7.448 | 7.273 | 2.711 | 1.02× | 2.68× |

The 1,000-replacement batch's seven samples were 276.790, 274.759, 282.970,
277.601, 276.990, 273.990, and 277.126 ms on the parent; 7.870, 7.380,
7.581, 7.576, 7.455, 7.557, and 7.289 ms on the candidate; and 3.061,
3.049, 3.041, 3.042, 3.037, 3.068, and 3.039 ms on CPython. At count 2,
the candidate's 1.110 ms median was 0.036 ms above the parent's 1.074 ms;
the absolute difference is small, but requires quiet-host review.

For one replacement, native `String.replace` is used with dollar signs escaped
in the replacement text; this preserves literal Python replacement text even
when it contains JavaScript dollar-sign templates. For larger finite counts,
native `String.split` stops after the requested number of matches. Joining
the split pieces with the original needle recovers the UTF-16 position of the
untouched suffix, which is appended after joining the changed prefix with the
replacement. The split limit is clamped to input length, including for valid
large Python integers. The CPython-differential fixture covers overlapping
needles, Unicode, empty needles, literal dollar signs, and a count of `2**60`.

The exact source passed the full build (two current native adapters and 41
production kernel families), 265 unit files, 26 active compiler fixtures,
strict Python, docs, merge checks, and the focused differential test. The
core-runtime source is 911,989 / 912,000 bytes. Startup on this exact source
normalized to 428.2 ms (fail) against the unchanged 425.0 ms budget, with an
integration workload active; the parent measured 427.4 ms (fail) in an adjacent
run. The previous candidate revision sampled 427.7 ms (fail), then 417.1 and
416.7 ms (pass). CI, browser size, independent performance, peak memory, and
a quiet startup rerun remain pending. The finite-count case is still about
2.5× CPython at 1,000 matches, and the very fast CPython one-replacement
case remains a substantial relative gap despite its small absolute time.
