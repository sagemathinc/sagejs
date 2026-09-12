# Dictionary reinitialization keeps storage

CPython treats explicit `dict.__init__(existing, ...)` as an update: empty
initialization does nothing; existing keys retain their insertion positions;
the positional input is consumed before keyword overrides; invalid iterables
can leave their successfully consumed prefix applied. It bypasses a dictionary
subclass's overridden `update` and `__setitem__` methods.

Sage.js previously replaced both internal Maps before consuming inputs. This
discarded existing entries, made self-initialization lose data, and replaced
storage retained by internal instance-namespace guards. Allocate the pair only
when the instance does not already own dictionary storage, then retain the
existing base update path. Fresh construction and native dict-subclass
allocation still initialize storage once.

The ordinary fixture is CPython-parseable and executable. The two-mode Node
test additionally checks native Map identities, an internal representation
invariant rather than a CPython API. This is a prerequisite for storage-aware
freezing, not a complete frozen-instance repair or a new security boundary.

The pre-build diagnostic used a private copy of frozen PR #242 artifacts.
Baseline initialization fails the fixture in both Python and Sage modes;
injecting the candidate initializer passes both modes and retains backing Map
identities. These observations are diagnostic, not qualification of this
branch. CPython executes the ordinary fixture successfully.

The requested `dict.__new__(dict)` allocation probe exposed a separate existing
gap: the runtime resolves `type.__new__` and raises `TypeError: type() argument 1
must be str`. The required follow-up oracle is retained in
`test/fixtures/dict-explicit-new-gap.py`, not silently rewritten as a passing
allocation test. This initializer-only slice does not claim that entrypoint is
fixed. Its native test constructs an uninitialized dict-prototype receiver to
verify the actual first-initialization path, alongside ordinary construction.

Task metadata remains active and frozen during final direct-build/read-only
qualification. Final source-bound results are recorded on the PR instead of
rewriting the contract and invalidating the build receipt afterward.
