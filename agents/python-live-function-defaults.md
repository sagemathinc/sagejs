# Live Python function defaults

This slice replaces emitted Python function default metadata with a positional
tuple (or `None`) and a live keyword-default dictionary (or `None`). Calls read
the current slots only for omitted arguments. Default expressions run once;
bound methods forward reads to their underlying function, while slot writes on
bound methods remain invalid. Bootstrap compiler functions retain their explicit
host-record ABI. Inspect, help, documentation, constructors, and worker metadata
consume the corresponding representation.

Focused coverage includes tuple replacement/removal, live dictionary mutation,
dict subclasses and live scope views, annotations, mangled keyword names,
`co_varnames`, and private metadata exclusion from function `__dict__`.
Excess positional arguments are checked even when a keyword packet is present.
A separately exposed syntax failure now rejects repeated explicit keywords at
CST lowering (including `exec`), while overlapping `**` mappings remain runtime
`TypeError`s.

## Local validation

Two full builds passed. Final baselib follow-ups were self-hosted with
`self --complete` and followed by a runtime-cache refresh. On that artifact:

- Seven defaults/method runtime tests pass in Python and Sage modes.
- 76 focused frontend/compiler/documentation tests pass.
- Package-facing introspection and the worker Pool defaults regression pass.
- Strict Python checking passes with zero errors across 382 modules; the
  regression fixture also passes CPython.
- Architecture, merge-invariant, generated-reference, and diff-whitespace
  checks pass. Parallel checking reports the expected absence of a contract on
  this explicitly assigned direct worktree branch.
- Six unchanged adopted files pass when directly invoked: GraalPy
  `test_function_changes_defaults`, `test_function_kwdefaults_dict_is_live`,
  `test_method_kwdefaults_dict_is_live`,
  `test_mangled_kwonly_kwdefaults_dict_is_live`; IronPython `test_defaults`;
  RustPython `syntax_function_args`.

These direct-file results are not full compatibility-manifest qualification.
The complete compiler suite was launched, but its final process output was not
retained, so no full-suite result is claimed. Integrated routine/corpus and
cross-platform qualification remain the integration lane's responsibility.
Optional native addons were absent in this independent worktree.

The duplicated help signature formatter was replaced with lazy inspect reuse;
supported help output has focused coverage. Core source size is 902091 bytes
against the unchanged 903000-byte budget. Generated optimizer source records and
reference locations are refreshed through their existing scripts, without
publishing compiler artifacts or changing bootstrap snapshots.

## Host sentinel follow-up

The integrated corpus exposed thirteen regressions after the initial focused
checks: `array` initializer and byte-view length defaults, and `OrderedDict`
iterable defaults. These are explicitly `runtime.undefined` in ordinary library
source. The first implementation loaded the correct tuple slot but then treated
its value as evidence that no default existed. This was not an inherited
initializer-metadata defect; even `array('i')` reproduced it directly.

The follow-up separates absent defaults from present host-undefined values with
a dedicated internal sentinel. Positional presence follows tuple length;
keyword presence follows dictionary storage membership. Supplied arguments still
avoid reading defaults. Focused coverage includes explicit host undefined,
`None`, slot replacement/removal, and affected library/subclass constructions.

After self-hosting both compiler passes and refreshing the runtime cache, all
thirteen affected unchanged MicroPython files match CPython 3.14.4 stdout and
stderr exactly in direct executions. The six original adopted files still pass,
as do nine focused runtime tests and 76 frontend/compiler/documentation tests.
Strict Python remains at zero errors across 382 modules. Core source size is
902104 bytes against the unchanged 903000-byte budget. These checks repair the
observed regression but do not replace the integrated full-corpus rerun.
The separate lightweight worker runtime must also be regenerated when adding a
compiler-runtime symbol; `self --complete` plus the evaluator cache alone does
not refresh that bundle.

## Browser payload follow-up

PR #213's Chromium job failed at the release-artifact budget gate, before
Chromium installation or parity execution. Run `34569074429`, job
`103167110922`, measured eager-core Brotli size 9861547 against the unchanged
9700000-byte limit. The exact pre-defaults base measured 9253797; almost all of
the increase came from repeated emitted binding code inside `lazy-modules.json`
and `stdlib.json`, not a browser-specific semantic failure.

Omitted positional arguments now call one shared presence-based resolver. The
supplied-argument guard remains in emitted code, so supplied arguments do not
read or normalize defaults. The helper preserves live tuple replacement,
explicit host-undefined defaults, and call-site-attributed argument errors.
A compiler-output regression checks the guard and absence of repeated inline
tuple-length resolution. Keyword-default binding is unchanged.

The compact emitter passes a full build, 19 runtime/error-diagnostic tests,
76 frontend/compiler/documentation tests, eight package-facing tests, and the
worker Pool regression. All thirteen previously affected unchanged MicroPython
files still match CPython 3.14.4 exactly, and the six original adopted files
pass direct execution. Strict checking remains zero errors across 382 modules;
architecture and merge checks pass. Core source is 902768/903000 bytes.
The full pinned-toolchain browser build and unchanged artifact budget gate pass:
eager-core Brotli is 9598889/9700000 bytes (262658 bytes smaller than the failed
CI artifact, with 101111 bytes of headroom); gzip is 16518187/17600000 bytes.
The production receipt and deployment security checks pass. Actual pinned
Chromium 151 routine parity passes all twelve cases with no page errors, and
the live-defaults fixture also passes directly in Chromium. These local Linux
checks used Node 26.8.1 and do not establish full compatibility-manifest or
cross-platform qualification; CI must qualify the pushed follow-up revision.
