# Unbound list append descriptor

This follow-up to PR #328 moves the exact `list.append(receiver, value)`
descriptor out of the general Python argument binder. The implementation is a
host adapter in `bootstrap_shared.py`; strict `containers.py` calls that adapter
and retains the original instance append implementation. The descriptor checks
the receiver before arity, calls `Array.prototype.push` rather than a mutable
instance property, and copies the existing Python-visible function metadata.
The prepared-call identity guard from #328 continues to fall back after class
mutation or a custom metaclass attribute hook.

## Controlled Linux x64 comparison

Exact PR #328 commit `9319a264e` and this candidate were built independently
with Node 26.10.0. Eight alternating fresh-process pairs ran each checked
100,000-call benchmark on one host; values below are medians. CPython 3.14.4
used eight fresh processes. Lower is better.

| Case | #328 | Candidate | Speedup | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| Immediate `values.append` | 65.3 ms | 65.0 ms | 1.00× | 4.1 ms | 15.8× slower |
| Saved bound append | 36.4 ms | 36.5 ms | 1.00× | 3.3 ms | 11.1× slower |
| Unbound `list.append` | 193.2 ms | 122.6 ms | 1.58× | 3.2 ms | 38.2× slower |
| Bucketed aggregation | 126.5 ms | 127.4 ms | 0.99× | 5.0 ms | 25.4× slower |
| Mixed native/user-class lookup | 314.2 ms | 282.5 ms | 1.11× | 7.8 ms | 36.4× slower |
| Saved callbacks | 175.8 ms | 143.7 ms | 1.22× | 8.6 ms | 16.8× slower |

The mixed and saved-callback cases are callback-shaped microbenchmarks, not a
real package qualification. This change reduces the unbound-call cliff but does
not close it; the grouped aggregation workload has no practical gain. No
success-path regression was detected in these samples. Separate 11-process
startup medians were 414.1 ms for #328 and 412.5 ms for the candidate under
the unchanged 425.0 ms budget; they do not establish a startup improvement.

The full build, 508-case CPython conformance check, strict Python checks,
architecture checks, focused adapter/integration tests, and routine suite
passed. Core source is 911,979 / 912,000 bytes, leaving little room for further
bootstrap growth. Browser and non-Linux qualification remain CI review items.
The pre-existing mismatch accepting `list.append(values, value=1)` remains;
this optimization neither fixes nor relies on it. Optional FLINT and numerical
reactors are absent from this local build, so no native-dependent qualification
is claimed.
