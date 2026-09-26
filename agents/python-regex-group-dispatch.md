# Fast regex capture group dispatch

`Match.group`, `start`, `end`, and `span` called dynamic Python `isinstance`
for every group selector, including the overwhelmingly common primitive string
and integer selectors. The regex adapter now dispatches primitive strings and
non-object selectors by JavaScript representation, retaining `isinstance` for
boxed Python `str` subclasses. Those subclasses use the underlying
`String.prototype.valueOf` contents as the named-group key; calling an
overridden `__str__` or passing the wrapper itself gives the wrong Python
answer. The CPython differential covers single, multiple, and span lookups
with a subclass whose `__str__` deliberately returns a different group name.

The change is stacked on PR #343 and independent of PR #341's map-iterator
optimization. The local full build, routine test plan, focused regex
regressions, formatting/typing, and package graph pass. Core-runtime source
remains 911,997 / 912,000 bytes; python-stdlib is 722,874 / 1,050,000 bytes.

Same-host warm medians with retained checksums, 20,000 calls per sample:

| Operation | PR #343 parent | This change | CPython 3.14.4 |
| --- | ---: | ---: | ---: |
| `match.group(1)` | 176.0 ms | 86.9 ms | 1.71 ms |
| `match.group("word")` | 83.4 ms | 38.8 ms | 1.89 ms |
| `match.end(1) - match.start(1)` | 380.3 ms | 205.6 ms | 1.42 ms |
| `match.span(1)` | 224.0 ms | 143.1 ms | 1.52 ms |
| `match.groups()[0]` | 184.0 ms | 189.7 ms | 2.33 ms |
| `pattern.fullmatch(...)` | 489.0 ms | 492.5 ms | 5.14 ms |

The repository's pinned `packaging==26.2` package-phase runner passed the
exact wheel, behavior, and source-current checks on both revisions. Seven
fresh-process samples with three warmups and 1,000 workflow iterations per
warm batch give median Sage.js warm batches of 1,121.45 ms on the parent and
1,009.99 ms here (9.9% faster). CPython medians were 11.93 and 11.91 ms.
This remains a critical ~84.8× CPython warm-throughput cliff. Cold import is
essentially unchanged at ~3.64 seconds versus CPython's ~24.6 ms (~148×).
The runner classifies these as `provisional-single-run`, not cross-host
performance confirmation. Startup and size budgets were not relaxed.
