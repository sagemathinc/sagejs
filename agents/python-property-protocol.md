# Property and descriptor handoff

This narrow slice fixes two unchanged adopted cases:
`rustpython/selected/builtin_property.py` and
`ironpython/selected/test_descriptors_custom_attrs.py`.

Class lookup previously invoked a compiler-emitted native getter against the
prototype, while class dictionary snapshots reconstructed fresh properties.
Both now use the same cached Python property, keyed by its native accessor.
Instances retain the native accessor path. The emitter supplies accessor
function metadata, including documentation, and registers whether a setter
actually exists instead of exposing its synthetic rejecting setter.
Getter default slots are real live function slots too; positional and
keyword-only accessor-default mutations have focused coverage.

Property documentation follows getter-derived versus explicit documentation
when cloning getter/setter/deleter variants. The public factory rejects more
than four positional arguments. Descriptor `AttributeError`s now reach the
existing `__getattr__`/default fallback; other exception types propagate.
No broader class-namespace rewrite or arity-heuristic change is included.

## Observed validation

- Full build passes on Node 26.8.1, Linux x64, with optional native addons absent.
- Both adopted files pass when directly invoked; upstream fixtures are unchanged.
- Eleven focused defaults/property/method tests pass, including both modes.
- Nine class metadata/annotation/reserved-name tests pass.
- The package-facing introspection test passes.
- Strict Python checks pass with zero errors across 382 modules.
- The minimized ordinary-Python fixture passes CPython.
- Generated source-record and reference checks pass.

Direct-file passes are not a full compatibility-manifest or cross-platform
qualification. Generated optimizer source records and reference locations are
refreshed using existing scripts, not published compiler artifacts.

## Integration gate: not ready independently

This branch is based on defaults follow-up `03ce3792a`, before the integration
lane's shared lazy-introspection savings. It adds 3592 core-source bytes:
905696 total against the unchanged 903000-byte limit, a 2696-byte deficit.
Package-graph and merge checks therefore fail on this isolated base; no
architecture pass is claimed and no budget has been widened. The integration
lane explicitly accepts this narrow validated commit for combination with its
already-reviewed source savings, followed by combined checks and qualification.
Parallel checking also reports the expected absence of a contract on this
explicitly assigned direct worktree branch.
