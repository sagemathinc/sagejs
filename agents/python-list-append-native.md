# Exact native list append lookup

This change targets repeated immediate `values.append(item)` calls on genuine
runtime lists. The compiler still evaluates the receiver once, resolves the
method before evaluating arguments, and uses the ordinary prepared-call
invocation. The shared lookup helper now reads the live `append` descriptor
directly only when the receiver carries the existing exact-list optimizer
brand and has no instance namespace, own override, or custom attribute hook.
Other receivers and mutations retain generic lookup.

## Qualification on Linux x64

The checked benchmark is `bench/python-list-append.py`: 100,000 retained
elements, checked by length and sum. The grouped case distributes elements
among 64 buckets and checks the aggregate. Six alternating fresh Node process
pairs compare this branch with its `agent/python-positional-default-current`
base; values are medians of the six runs. CPython 3.14.4 uses six fresh
processes on the same host. Lower is better.

| Case | Sage.js base | Candidate | Speedup | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| Immediate append | 297.0 ms | 65.3 ms | 4.55× | 4.0 ms | 16.3× slower |
| Saved bound append | 34.9 ms | 36.6 ms | 0.96× | 3.3 ms | 11.0× slower |
| Unbound `list.append` | 567.2 ms | 571.9 ms | 0.99× | 3.5 ms | 163× slower |
| Bucketed aggregation | 348.0 ms | 125.0 ms | 2.78× | 5.2 ms | 24.2× slower |

The targeted lookup is materially faster, but append remains a large Python
performance cliff. Saved-bound and unbound controls are essentially unchanged;
the saved-bound median measured about 5% worse, without a changed loop path.
The grouped case is synthetic rather than a real package workflow.

`pnpm build`, `pnpm test` (including startup, package budgets, strict Python,
portable tests, and public API smoke), the 508-case Python conformance check,
and 23 focused method/adapter tests passed. The unchanged core source limit is
912,000 bytes; this branch measures 911,719 bytes. The optional native addon
and Wasm toolchain were absent during the build, so their build stages skipped.

The direct guard tests cover instance assignment, class method replacement,
class attribute hooks, and an unbranded receiver. The Python integration test
covers ordinary, saved, unbound, and subclass-overridden append. Browser and
non-Linux CI remain to be qualified on the PR.

`pnpm test:changed` did not finish: its compiler-fixture phase requires
`packages/flint/build/Release/sagejs_flint.node`, which is absent in both this
worktree and the unchanged base worktree. The focused failure is a module-load
error before executing `compiler/algebra.py`, not an assertion about append.
