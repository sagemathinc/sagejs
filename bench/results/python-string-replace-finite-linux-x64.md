# Python `str.replace`: finite-count assembly

Development-host observation, 2026-09-28. These timings are provisional, not
an independently confirmed performance-cliff closure. The same ordinary Python
source ran under both Sage.js revisions and CPython:
[`bench/python-string-replace.py`](../python-string-replace.py), SHA-256
`999c7244364599fc0b1b77f6c6d3d45cda4f4c042f3c601865419672f4134b4c`.

- Parent: `c43f37882c8c347d97d132da7f8c2a9098755e4a` (#349).
- Candidate: `399476ca32a42fd5790591060a3b529cf7afb3c4`.
- Linux x64, AMD EPYC 7B13, Node 26.10.0, CPython 3.14.4.
- Warm throughput only: 200 calls per batch, three warmup batches, seven
  measured batches; milliseconds are medians. Each batch checks its output
  length. Startup, compilation, peak memory, and browser execution are not
  included. A separate numerical integration run was active on this shared
  host; a quiet independent host was unavailable.

| Workload | Parent ms | Candidate ms | CPython ms | Parent / candidate | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| Replace 1,000 of 2,500 matches | 256.024 | 12.323 | 3.097 | 20.8× | 4.0× |
| Replace once, 5,000 chars | 0.838 | 0.693 | 0.039 | 1.21× | 17.8× |
| Replace all, 5,000 chars | 11.663 | 11.632 | 7.122 | 1.00× | 1.63× |
| Three-pass HTML escaping | 7.195 | 7.472 | 2.758 | 0.96× | 2.71× |

The finite-count batch's seven measured samples were 256.024, 259.436,
256.662, 259.389, 251.548, 249.732, and 254.491 ms on the parent;
12.386, 12.294, 12.204, 12.372, 12.323, 12.142, and 12.328 ms on the
candidate; and 3.088, 3.097, 3.082, 3.099, 3.098, 3.088, and 3.101 ms on
CPython. The HTML batch varied from 7.246 to 7.890 ms on the candidate, so
its apparent 0.277 ms increase needs a quiet-host check.

For one replacement, native `String.replace` is used with dollar signs escaped
in the replacement text; this preserves literal Python replacement text even
when it contains JavaScript dollar-sign templates. For larger finite counts,
native split/splice/join assembles
the changed prefix once and retains the untouched separator and suffix. Counts
at or above the match total use the replace-all join path, including valid
large Python integers. The CPython-differential fixture covers overlapping
needles, Unicode, empty needles, literal dollar signs, and a count of `2**60`.

The exact source passed the full build (two current native adapters and 41
production kernel families), 265 unit files, 26 active compiler fixtures,
strict Python, docs, merge checks, and the focused differential test. The
core-runtime source is 911,992 / 912,000 bytes. Startup normalized to
427.7 ms (fail), then 417.1 and 416.7 ms (pass) against the unchanged
425.0 ms budget, with an integration workload active; the parent measured
414.3 ms between candidate runs. CI, browser size, independent performance,
peak memory, and a quiet startup rerun remain pending. The finite-count
case is still about 4× CPython, and the very fast CPython one-replacement
case remains a substantial relative gap despite its small absolute time.
