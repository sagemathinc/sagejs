# Exact unbound list append lookup

This follow-up to PR #327 targets `list.append(values, item)`. A CPU profile of
100,000 such calls attributed about 350 of 984 samples to prepared lookup and
its generic attribute path, versus about 72 to `_list_type_append`. The shared
prepared-call helper now uses the existing compiler-visible identity of the
original `_list_type_append` function when the receiver is exactly the runtime
`list` constructor. It re-reads the live class descriptor and checks the
metaclass `__getattribute__` resolution. A replaced/deleted class method or
custom metaclass hook falls back to ordinary lookup. The call target is still
captured before argument evaluation, and the existing argument binder and
errors remain in use.

## Controlled Linux x64 comparison

Both source revisions were built independently with Node 26.10.0: exact PR
#327 commit `8defa2c25` and this candidate. For each row, six alternating
fresh-process pairs ran the same checked benchmark on one host; numbers are
medians. CPython 3.14.4 also used six fresh processes. Lower is better.

| 100,000-call case | PR #327 | Candidate | Speedup | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| Immediate `values.append` | 65.0 ms | 66.1 ms | 0.98× | 4.1 ms | 16.1× slower |
| Saved bound append | 36.7 ms | 36.4 ms | 1.01× | 2.9 ms | 12.6× slower |
| Unbound `list.append` | 569.8 ms | 191.6 ms | 2.97× | 3.1 ms | 62.1× slower |
| Bucketed aggregation | 126.9 ms | 125.1 ms | 1.01× | 5.0 ms | 24.8× slower |
| Mixed list/user-class lookup | 503.7 ms | 314.6 ms | 1.60× | 7.9 ms | 39.8× slower |
| Saved callback control | 175.7 ms | 176.7 ms | 0.99× | 8.6 ms | 20.5× slower |

`bench/python-list-append.py` checks retained values by length and sum.
`bench/python-unbound-list-append.py` alternates an exact native list class
with a Python `Collector` class, and compares immediate class lookup to saved
callback functions. This is a synthetic callback-style workload, not a real
package qualification. The unbound and mixed rows remain critical Python
performance cliffs despite the improvement.

The full build, 508-case CPython conformance check, 24 focused method/adapter
tests, and routine suite passed, including strict Python, portable tests,
startup, and unchanged package budgets. Core source is 911,909 / 912,000
bytes. One routine run missed the unchanged 425.0 ms normalized startup limit
by 0.8 ms; an immediate exact rerun passed at 419.9 ms, and the unchanged
base also produced a 425.8 ms failing run. Eleven alternating baseline/candidate
fresh-process pairs measured 416.0 / 419.6 ms. Startup therefore remains
close to the limit and must be watched in CI, not declared settled by one pass.

Direct guard tests cover method replacement/deletion and a custom metaclass
hook. Existing integration tests cover unbound calls, saved methods, subclass
overrides, and evaluation ordering. Manual base/candidate differential probes
preserved missing/extra-argument and wrong-receiver diagnostics. A pre-existing
Python mismatch remains: `list.append(values, value=1)` is accepted by both
revisions although CPython rejects keywords. Mutating the built-in class
method also triggers a pre-existing missing-argument error in both revisions.
Neither mismatch is fixed or hidden by this guarded optimization.

After the lookup shortcut, CPU profiling shifts attention to
`ρσ_invoke_prepared_method` and `_list_type_append`; improving those safely is
a separate campaign. Browser and non-Linux qualification remain for CI and
review. The optional FLINT addon is absent in these local worktrees, so the
native-dependent compiler-fixture suite is not a local qualification receipt.
