# User attribute interception and default lookup

This is a required-semantics diagnosis, not an implementation or a new accepted
incompatibility. It isolates a blocker also found by the prepared-keyword and
reflected-operator oracles. Source starts at main `02a683d213`; no runtime file
is changed.

## Reproduce

```sh
SAGEJS_LOOKUP_ORACLE_ROOT=/path/to/frozen/sagejs \
  node test/python-getattribute-protocol.cjs --report
```

The runner requires CPython **3.14.4**, executes the same 14 cases in Python and
Sage sessions, and prints artifact hashes plus each exact observation. Omit
`--report` to enforce zero differences: this strict mode currently fails. Report
mode means successful evidence collection, not passing Python compatibility.
There is no timeout increase, normalization, or changed upstream disposition.

On the unchanged `419a10fb1` namespace artifact, 12 of 14 cases differ in each
mode (24 total). The two matching controls are property failure falling through
to `__getattr__`, and implicit `len` bypassing user attribute interception.
Compiler SHA-256 is
`50c9f153a9543f8ecad694ebae8c618d40c23e4e9c4b085c58a7b07a772be666`;
plain baselib SHA-256 is
`e31f9f8f8d7e2f45fa3692aaa7d27bc9f19734979b70295c11a488ecd7fd3daa`.
These identify historical diagnostic inputs, not a build receipt for this tree.

The cases cover existing and missing attributes, explicit default lookup,
delegation, hook errors, property errors, lookup-before-argument evaluation,
class mutation/deletion, ignored instance hook shadowing, special-method bypass,
and metaclass interception. Delegation records events: merely returning the
right value while never calling the hook must not produce a false pass.

## Root cause and implementation boundary

`_builtins_getattr_impl` contains the ordinary descriptor/namespace resolution
but does not invoke a user `__getattribute__`. The prepared-call branch detects
the presence of the hook only to disable its optimization. Disabling an
optimization does not implement the missing semantics. There is also no public
default `object.__getattribute__` primitive, so explicit delegation fails if
actually reached.

The default lookup and the public interception/fallback protocol need distinct
entry points:

1. Ordinary `obj.name`, `getattr`, and prepared method lookup invoke the hook
   selected from the actual type, ignoring a shadow in the instance namespace.
   For class objects this means the actual metaclass, not the class itself.
2. An `AttributeError` escaping that lookup may invoke the actual `__getattr__`;
   `getattr`'s default applies only after the missing-attribute protocol fails.
3. Explicit `object.__getattribute__` bypasses both user interception and
   `__getattr__`. It still performs normal data-descriptor, instance, and
   non-data-descriptor resolution. A failing property must propagate its
   `AttributeError` through this primitive.
4. Implicit special-method dispatch remains type-slot based and bypasses user
   `__getattribute__`. Explicit `obj.__len__()` is ordinary attribute access and
   therefore is intercepted.

Simply wrapping the current helper is insufficient: `_builtins_descriptor_read`
and the final missing-attribute branch already invoke fallback internally.
Sharing that path unchanged would make explicit default lookup call `__getattr__`
incorrectly. Conversely, globally removing fallback would regress the matching
property control. Establish a default resolver that propagates absence, then
put interception and fallback at the public boundary. Keep module PEP 562 and
host-adapter rules distinct.

Preserve the no-hook prepared-call path, canonical ownership and live mutation
invalidation. Do not bypass a present hook merely because it delegates to
`object.__getattribute__`; it may log, validate, or change the result. The
resolved callable must be captured before argument evaluation, exactly once.
Measure no-hook ordinary reads and calls as well as hook-bearing package cases;
adding a global expensive lookup to every access would create a new cliff.

No implementation, full build, performance claim, PR readiness, or M2/M3 closure
is established by this checkpoint.
