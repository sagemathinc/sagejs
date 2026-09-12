# Public length protocol and private host lengths

This is a diagnosis, not a runtime fix or a performance claim. The fixtures use
CPython 3.14.4 and the already-qualified Python-mode compiler/baselib artifacts
at commit `419a10fb1f34c6ade3fa41061fd6143bfe51f875`. No core source or artifacts
were changed and no build was run. Source inspection in this lane is based on
`02a683d213072c3129da1f71e2aa47de447cfc4a`.

Run the reporting diagnostic with an explicit read-only artifact root:

```sh
SAGEJS_LEN_DIAGNOSIS_ROOT=/path/to/qualified/worktree node test/python-len-protocol-diagnosis.cjs
```

The selected reference Python must be 3.14 (the repository's
`SAGEJS_REFERENCE_PYTHON` override is supported). Successful execution means the
observations were collected, **not** that the Python incompatibilities passed.
The specialized driver compares a portable ordinary-Python fixture and reports
host-only probes separately. It does not canonize the current defects as passing
runtime assertions.

## Public observations

| Case | CPython 3.14 | Qualified Sage.js |
| --- | --- | --- |
| `list` subclass overriding `__len__` | 7 | 2 (native array length) |
| `str` subclass overriding `__len__` | 7 | 7 |
| Custom type slot | 7 | 7 |
| Instance shadows type's `__len__` | 7 | 19 |
| Instance-only `__len__` | TypeError | 19 |
| Ordinary object with no slot | TypeError | 0 |
| Negative result | ValueError | -1 |
| Float/string result | TypeError | unchanged float/string |
| Boolean result | integer 1 | boolean True |
| Indexable result | integer 3 | unchanged Index object |
| Integer `2**100` returned (constructed exactly from decimal) | OverflowError | unchanged integer |
| Astral character / two astral characters | 1 / 2 | 2 / 4 |

Normal lists, custom `__getattribute__` bypass, thrown exception identity,
combining characters, and individual lone surrogates agree. An explicitly
escaped high/low surrogate pair has length 2 in both implementations, but is
unequal to the corresponding astral character in CPython and equal in Sage.js.
Thus JavaScript code-point iteration alone cannot make both cases correct: the
current string representation has already lost a distinction. This diagnosis
does not propose a representation change.

## Shared helper boundary

`src/baselib/builtins.py` exports `len = ρσ_len`. Its ordering is arraylike
`.length`, direct member `__len__` invocation, exact-constructor native Set/Map
`.size`, then enumerable own-string-key count for any object or function.
The return value from `__len__` is not validated or normalized.
`_builtins_member_is_function` uses `runtime.native_get`; the call then performs
another member lookup through `_builtins_call_member`. This is not Python's
type-slot lookup and explains instance shadowing without invoking custom
`__getattribute__`.

There are private consumers of the same alias. Most decisively,
`src/baselib/containers.py`'s `SageDict.__init__` and `ρσ_dict` test
`len(keywords)`. In the qualified emitted `ρσ_dict`, `keywords` is a raw
JavaScript keyword packet, defaulting to `{}`; these calls depend on own-key
counting, not a Python length slot. (`_DictView.__len__` instead calls len on a
SageDict, not its raw backing map.) Compiler `src/utils.py` also uses `len(s)`
alongside string indexing, while `src/baselib/str.py` uses lengths with positional
string scans. Changing UTF-16 lengths independently of their indexing requires
a caller audit. Unpacking and pattern helpers in `internal.py` share this alias
as well; their operands must be classified rather than globally rewritten.

The host probes demonstrate plain/null-prototype object key counts, a function
counting its one enumerable key rather than its two formal parameters, native
typed-array length, and unchecked negative raw-method return. Same-realm Map/Set
use size; foreign-realm Map/Set fall through to key counting (zero in these
probes). Null reaches host Object.keys and raises a host TypeError. These host
observations are not CPython compatibility requirements.

A follow-up public correction should explicitly separate Python slot semantics
from private host-length needs or migrate the concrete private consumers first.
Preserve method exception identity, ignore instance shadowing, honor subclass
slots before array fast paths, normalize indexable returns, and enforce negative
and target index-size limits. Unicode requires a separately scoped decision.
No cache, optimization, source-size increase, or performance improvement is
claimed here; overlapping profile samples for len and arraylike are not additive.
