# Guarded canonical dictionary keys for exact residues

This is a representation improvement motivated by the general class/unit
campaign's unchanged algebra regression. It does not select a mathematical
implementation by caller name or change class-group bounds.

## Mathematical contract

For exact prime-field and residue-ring elements with the same parent, the
original equality dispatch compares their exact integer residues. Therefore,
within one admitted parent domain,

$$
\operatorname{token}(a)=\operatorname{token}(b)
\quad\Longleftrightarrow\quad a=b.
$$

Safe machine integers are converted to exact `BigInt` before admission, so
equal machine and arbitrary-precision representations have the same token.
Different parent identities do **not** establish inequality: those lookups
retain the dictionary's generic equality scan. Extension-field elements and
subclasses are not admitted by this provider.

The private provider is registered with
`sagejs._baselib.containers._register_dict_canonical_provider(probe, valid)`.
A successful probe returns a native descriptor with `domain`, `token`, and
`guard`; `None` means unrecognized, while `False` means recognized but unsafe.
Tokens are exact native BigInt values, with no per-value interning table.
Private parent domains are reached through a weak parent index. The public
`_dict_keys` cache is not proof authority; clearing or replacing it cannot
invalidate these value tokens. Equal tokens across different domains, or
between a domain and an ordinary integer key, do not establish equality.
Those collisions still compare the original keys. Distinct lookup misses do
not accumulate token objects or residue entries in a parent-local cache.

## Immutability and mutation guards

Public residue elements already reject ordinary assignment and deletion.
Inspection and a focused pre-change diagnostic nevertheless found that explicit
`object.__setattr__` and explicit reinitialization could mutate their native
slots. The old dictionary could then find both the old and new residue.

The provider freezes validated exact key objects before publishing tokens.
Arithmetic temporaries retain their existing inexpensive allocation path;
only values presented as canonical dictionary keys receive this barrier.
There is no per-element lazy state to update after admission. New arithmetic
results remain fresh objects. Explicit mutation bypasses cannot alter an
admitted key's representation. The pre-existing object-setattr path may silently
ignore a failed host write on older runtimes; fixing its exception behavior is
a separate runtime change, not an excuse to permit a changed key.

Admission checks exact prototypes, plain `_parent`/`_value` data slots, safe
integer representation, and absence of all other own properties, including
symbols and dispatch markers. Every fast-path use validates the original
equality/token descriptors, inheritance chain, numeric-dispatch markers,
coercion-model identity and equality descriptors, and equality-function
dispatch metadata. Raw descriptors are inspected without executing newly
installed accessors. Observed invalidation is sticky for this provider; it
does not capture a monkeypatched implementation as new authority.

The dictionary must reject both canonical hits and canonical misses when this
authority is invalid. A token collision is not permission to overwrite an
unequal original key. Equal-key replacement preserves the original stored key
and its insertion position.

These guarantees cover supported Python method replacement and explicit
representation bypasses. Corrupting private provider state or replacing host
intrinsics such as `Reflect`, `Object.freeze`, or `Function.prototype.call` is
not a supported Python dictionary API. No general hash framework or universal
user-supplied canonicality assertion is introduced.

## Verification scope

`test/finite-field-canonical-domain.cjs` exercises machine and arbitrary-precision
prime/composite parents, retained original keys, map operations, immutability,
public token-cache reset, changed equality/token/coercion dispatch, subclasses,
instance overrides, method metadata, numeric representation mixing, and
numeric/symbol dispatch markers. The companion dictionary suite owns generic
collision/mixed-key semantics and bounded operation-count checks.

The unchanged algebra discrete-log fixture and its existing 60-second limit
remain the integration performance gate. Source checks or operation counts
alone do not establish a class/unit speedup, full platform qualification, or
completion of the wider campaign.

At initial review, the provider fit the existing arithmetic source allowance
(813,069 / 820,000 bytes), while the companion storage implementation exceeded
the existing core-runtime allowance. This is an explicit qualification failure,
not permission to increase a limit. The adopted campaign requires separate
generated-code/resource evidence and review before any allowance change. All
execution-memory, proof-verifier and timeout limits remain unchanged.

### First executed candidate (not final qualification)

The positional-import candidate built its own runtime in 643.88 developer
seconds, with maximum child RSS 1,992,081,408 bytes (not simultaneous process-tree
peak memory). The first keyword-import build failure is preserved: immutable
stage zero emitted an older keyword-call convention during module declaration.
The equivalent positional `__import__` avoids that bootstrap incompatibility.

The first focused run lacked the optional FLINT addon. After ordinary native
cache preparation, 21 of 22 tests passed; the remaining test's expression
`type(key).__sagejs_float__ = True` was misparsed as a type-alias statement.
Using a named class variable exercises the same mutation without that parser
ambiguity. All 22 focused tests then passed, and the unchanged 60-second
`compiler/algebra.py` gate passed in 3,787 ms. No failing receipt was discarded.

These are local candidate observations, not four-platform qualification or a
paired class/unit result. The independent resource review identified removable
per-value token retention. A direct exact-value token revision and a fresh
common-base resource control are the next bounded checks. The core source
allowance still fails and has not been raised.

### Direct-value revision: executed, not merge-ready

The revision whose finite-field source SHA-256 is
`4674b2d15ebb7e857c1f8f702cc6a1334270086883143578c532ec4eb8693dd1`
passed its own prepared build, all 25 focused checks, the unchanged algebra
gate in 3,632 ms, and strict Python checks. The storage source is exactly
`9db4572a9bec6ff6ba5cc49b9c68290ee7e6cbb6`. This closes the earlier pending
value-token execution check; it does not transfer the earlier opaque-token
results to a new source without execution.

The [paired developer resource record](../bench/dict-canonical-domain/evidence/README.md)
retains the costs as well as the gains. The unchanged common-base algebra
control times out. Residue dictionary work scales much better, and distinct
misses no longer build the new parent-local token table. However, small
primitive workloads are slower in these observations, private dictionary
metadata increases retained managed heap, and build maximum-child RSS rises.
Both source snapshots fail the 400 ms startup gate; the candidate also fails
the unchanged 903,000-byte core source allowance at 907,863 bytes.

Disposition: keep this source as a draft experiment. Do not raise the source
allowance, claim no speed regression, or promote the general class/unit PR
using this evidence. Reconcile ordinary dictionary allocation and the failed
startup gate with the shared-runtime owners before exact-source integration
and all-platform qualification. No numerical bound, timeout, memory cap, proof
policy, or corpus membership changed.
