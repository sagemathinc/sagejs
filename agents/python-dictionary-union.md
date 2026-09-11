# Dictionary union and mapping updates

Implementation slice based on `7d68b6aca` (PR #211, itself based on #209).
Those prerequisites were still open at the last fetch; this is not a claim of
main integration.

## Failure and invariant

The adopted `rustpython/builtin_dict_union` case fails because dictionaries lack
union operators. The connected update implementation also accepts arbitrary
host object properties instead of rejecting non-iterables, and recognizes
`items()` rather than the Python `keys()`/`__getitem__` mapping protocol.

Non-mutating union accepts dictionaries, preserves insertion order with the
right operand's values winning, and returns a base dictionary. Unsupported
operands return `NotImplemented`. In-place union preserves receiver identity
and accepts mappings or iterables of pairs. Invalid input raises without
rolling back earlier successful pairs. An overridden subclass `update` method
must not intercept the built-in in-place union operation.

## Mechanism

Implement the three dictionary union slots using the shared update/storage
path. Retain the explicit native-object path for internal compiler metadata;
generic Python mappings use their key and item protocols, and other inputs go
through iteration and pair validation. No package-name specialization or new
dependency is involved.

The focused regression caught two low-level calling-convention hazards during
iteration: directly calling a same-class method as an unbound function lost its
receiver, and raw indexing of a custom mapping bypassed `__getitem__`. Explicit
runtime invocation is required at these baselib boundaries.

## Checks and scope

`test/dict-union-protocol.cjs` runs the ordinary-Python fixture in Python and
Sage modes. The fixture also runs under the pinned CPython oracle. It covers
ordering, identity, unsupported operands, custom mappings, iterator pairs,
subclass update overrides, and partial mutation before an invalid pair.

The combined source-current build passed. Five focused protocol/search tests,
sixteen connected defaults/method/container tests, and strict Python checks
(383 modules) passed. The selected pinned packaging 26.2, attrs 25.4.0,
Tomli 2.3.0, and decorator 5.2.1 workflows passed with checked outputs, not
merely imports. Package architecture remains within the unchanged core budget
(902436 / 903000 source bytes).

The full 536-case corpus is **not qualified**: it records 515 passes, three
reviewed differences, and eighteen required failures. Ten of the original
fifteen required failures now pass, including dictionary union, class-check
hooks, formatting, and live defaults. Thirteen newly failing array/bytearray/
OrderedDict cases expose a prerequisite live-defaults bug: a present default
whose value is the explicit host `runtime.undefined` sentinel is mistaken for
a missing default. Repair that prerequisite before advancing this stack.
No assertions or required dispositions were changed.

This slice does not claim complete dictionary-subclass semantics or a
performance-cliff fix. Its source-current corpus and selected package reports
are retained in the local `python-output-integration-evidence.X9vc1T` directory.

## Connected shared protocols and footprint

Type-level special-method lookup is shared by mapping item access, class-check
hooks, and formatting; instance shadows cannot replace these implicit slots.
The old eager-bound-method cache marker is no longer emitted and no longer
hides user namespace values. Documentation search moved into a lazy ordinary
Python module to accommodate the protocol fixes without widening core budgets.
Search normalization uses an explicit native string boundary because ordinary
Python `str.replace` does not accept a JavaScript regular expression.
