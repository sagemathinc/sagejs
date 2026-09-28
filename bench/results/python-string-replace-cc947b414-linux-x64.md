# Python `str.replace`: linear unlimited replacement

Development-host observation, 2026-09-28. This is not an independently
confirmed performance-cliff closure. The input and timed work are the same
ordinary Python source under all three runtimes:
[`bench/python-string-replace.py`](../python-string-replace.py), SHA-256
`999c7244364599fc0b1b77f6c6d3d45cda4f4c042f3c601865419672f4134b4c`.

- Parent Sage.js: `3bf972967339df00ead9e85df2406e1713e97fe6` (#348).
- Candidate Sage.js: `cc947b4144fae990916a33f5ba8450f58c42aec2`
  (`agent/str-replace-linear`).
- Linux x64, AMD EPYC 7B13, Node 26.10.0, CPython 3.14.4.
- Warm-throughput only: 200 calls per batch, three batch warmups, seven
  measured batches; milliseconds below are medians. Each batch checks its
  output-length checksum. Process startup, source compilation, import, peak
  memory, and browser execution are outside this timing scope.

| Workload | Parent ms | Candidate ms | CPython ms | Parent / candidate | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| Replace all, 100 chars | 11.572 | 1.677 | 0.163 | 6.9× | 10.3× |
| Replace all, 1,000 chars | 99.884 | 2.924 | 1.545 | 34.2× | 1.9× |
| Replace all, 5,000 chars | 636.909 | 11.687 | 7.595 | 54.5× | 1.5× |
| Replace once, 5,000 chars | 0.745 | 0.852 | 0.038 | 0.87× | 22.4× |
| Replace 1,000 of 2,500 matches | 263.932 | 257.640 | 3.169 | 1.02× | 81.3× |
| Three-pass HTML escaping | 186.214 | 7.158 | 2.752 | 26.0× | 2.6× |

Selected raw measured samples (ms, before median selection):

| Workload | Parent | Candidate | CPython |
| --- | --- | --- | --- |
| All, 5,000 | 637.734, 633.212, 633.585, 655.850, 652.055, 634.933, 636.909 | 11.809, 11.741, 11.589, 11.710, 11.584, 11.684, 11.687 | 7.572, 7.601, 7.595, 7.596, 7.586, 7.578, 7.607 |
| Limited 1,000 | 257.521, 263.932, 260.931, 265.458, 259.222, 270.047, 264.137 | 266.005, 270.516, 265.122, 257.640, 242.839, 256.234, 251.219 | 3.155, 3.151, 3.190, 3.169, 3.179, 3.159, 3.172 |
| HTML escaping | 186.214, 187.078, 184.760, 183.937, 176.932, 189.152, 190.880 | 7.066, 7.363, 7.332, 7.083, 7.158, 7.278, 7.077 | 2.756, 2.750, 2.755, 2.740, 2.755, 2.752, 2.752 |

The native split/join path applies only to nonempty needles and omitted or
negative counts. It avoids the parent's repeated whole-string rebuilding and
does not interpret `$&` or other JavaScript replacement templates. The
CPython-differential test covers overlapping needles, Unicode, empty needles,
literal dollar signs, and finite counts. A finite-count list-assembly trial
improved the 1,000-match case to about 187 ms but nearly doubled common
one-replacement time; it was rejected. The finite-count critical cliff remains
open. The candidate's one-replacement batch also rose by about 0.1 ms in this
run, below the policy's absolute regression gate, and merits quiet-host review.

Source-current local build, 265 unit files, 26 active compiler fixtures,
strict Python, docs, and merge checks passed. The core-runtime source is
911,968 / 912,000 bytes; 11-sample normalized startup is 413.3 / 425 ms.
Four-platform CI, Chromium, the 424-file integration suite, peak-memory
measurement, and an independent quiet-host performance rerun are pending.
