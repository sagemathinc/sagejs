# Required Python compatibility failures: diagnosis

Read-only investigation of the `method-binding-block-compat.json` evidence on
2026-09-11. This records diagnosis, not implemented fixes. Source line numbers
refer to the investigated revision and will move. No broad suites or builds
were run for this investigation.

## Confirmed: function defaults

The evidence records failures in GraalPy `function_changes_defaults`,
`function_kwdefaults_dict_is_live`, `method_kwdefaults_dict_is_live`, and
`mangled_kwonly_kwdefaults_dict_is_live`; IronPython `defaults`; and RustPython
`syntax_function_args`.

Isolated execution against the then-existing build confirmed:

```python
def foo(a): return a
getattr(foo, "__defaults__", "ABSENT")  # actual: "ABSENT"
foo.__defaults__ = (1,)
foo()  # actual: TypeError; expected: 1

def bar(*, x=1): return x
bar.__kwdefaults__["x"] = 2
bar()  # actual: 1; expected: 2
getattr(bar.__code__, "co_varnames", "ABSENT")  # actual: "ABSENT"

def va(a, b=2, *c, d, **e): pass
va.__defaults__  # actual: {"b": 2}; expected: (2,)
```

Source causes in `src/output/functions.py`:

- Around line 533, `function_annotation` emits `__defaults__` only when defaults
  exist, as a name-keyed host object including keyword-only defaults. Python
  requires a positional-default tuple or `None` on every function.
- Around lines 132, 156, 197, and 304, `function_preamble` uses definition-time
  requiredness and reads that object. Runtime reassignment/removal cannot work
  correctly, including for initially simple functions.
- Around line 566, `__kwdefaults__` is independently constructed while calls
  continue reading `__defaults__`. Consequently mutation does not affect calls.
  Source inspection additionally shows keyword default expressions are emitted
  twice; side-effectful evaluation was not independently probed.
- `_FunctionCode` in `src/baselib/builtins.py`, around line 5983, has no
  `co_varnames`. The mangled upstream case requires the mangled keyword-only
  argument name, not its original spelling.

The coherent correction is dynamic parameter binding against tuple/`None`
positional defaults and a live Python dict/`None` for keyword defaults, evaluating
each default expression once. Preserve the explicit compiler/baselib bootstrap
path. Audit old-map consumers in `src/lib/inspect.py`, the signature formatter in
`src/baselib/builtins.py`, `src/output/classes.py`, `test/annotations.py`, and
host-metadata documentation tests.

Focused regressions: assignment/removal on initially required parameters;
mutable positional defaults; live keyword dict identity, reassignment, and
non-string keys; bound-method visibility; mangled `co_varnames`; and a
side-effectful keyword default evaluated exactly once.

### Source-inferred additional argument-validation defect

`function_preamble.validate_arguments`, around lines 116–122, bypasses excess
positional validation when a marked keyword packet is last. The positional
count should exclude that packet, not bypass checking. A later assertion in
`syntax_function_args` exercises:

```python
def f(a, b, /, c, d, *, e, f): return 1
f(1, 2, 3, 4, 5, f=6)  # must raise TypeError
```

## Source-inferred: object, property, mappingproxy

No isolated execution of these three cases was performed because the main
agent was rebuilding the product. Earliest lines below are predictions from
the preserved errors and source, not verified execution locations.

| Case | Evidence error | Predicted first failing upstream line |
| --- | --- | --- |
| `builtin_property.py` | `AttributeError: The attribute x is not present` | 19: `type(Fubar.foo) is property` |
| `builtin_object.py` | `TypeError: Cannot read properties of undefined (reading 'call')` | 11: `object.__subclasshook__(1)` |
| `builtin_mappingproxy.py` | `AssertionError` | 21: `"__dict__" in A.__dict__` |

### Property

Class lookup in `src/baselib/builtins.py`, around line 5475, obtains
`class_prototype[name]` through `_builtins_get_member`. For compiler-emitted
native accessors this invokes the getter on the prototype; the upstream getter
then cannot find instance attribute `x`. Inspect the native descriptor instead
and expose a stable property object without invoking it. Preserve getter,
setter, and deleter. Namespace-snapshot code around line 3447 already wraps
accessors, but creates fresh wrappers and does not include the deleter.

Later potential blockers: `property.__new__(object)` at upstream line 60 needs
`TypeError`, but the public factory has no `__new__` registration. Lines 92–94
require rejecting five positional arguments and unknown keyword `name`; the
baselib factory around line 5185 has no explicit positional-arity check.
Existing `getter(None)`, `setter(None)`, and `deleter(None)` preservation logic
already matches this selected test.

### Object

`SageObject` around line 9368 has neither `__subclasshook__` nor explicit rich
comparison methods required by upstream lines 13–23. Supply Python semantics:
identity equality succeeds; distinct-object equality and unsupported ordering
return `NotImplemented`; `__ne__` respects overridden equality.

Upstream line 29 deletes the virtual instance `__dict__`.
`_builtins_object_delattr` around line 9462 only handles actual host attributes,
so it needs a namespace-clearing path. Assignment already has a special path.
Regressions should exercise explicit dunder calls and deletion followed by an
empty live dict and missing former attributes.

### Mappingproxy

`_builtins_callable_namespace_snapshot` around line 3425 copies actual own host
members. No synthesized instance-dictionary descriptor is present for the
selected `dict` subclass. Expose a real instance-namespace descriptor for
eligible user classes, rather than inserting a placeholder key into every
class namespace. Verify the earlier function-identity assertions before
treating upstream line 21 as the confirmed first failure.
