# Finite-residue canonical dictionary provider: safety review

2026-09-12. Bounded independent read-only review against base
`0c2945e1de400b0ee66150ae523491f7c712ce0a`, plus the root owner's in-progress
provider in `class-unit-rank-two-frontier-worktrees/finite-field-canonical-domain`.
No source edits, build, SSH or timing-host work. One expressly authorized focused
existing-runtime diagnostic was executed, not a new-provider qualification.

## Decision

**Do not admit the existing residue objects as physically immutable merely
because their Python `__setattr__` rejects ordinary assignments. That premise in
the earlier design was too strong.** There are actual, demonstrated bypasses.

The smallest defensible repair is the proposed **admission-only `Object.freeze`**
after exact-family/raw-representation validation, before any canonical token or
homogeneous-dictionary metadata is published. This retains the existing
representation and does not freeze all arithmetic temporaries. The provider
still needs its live dispatch guards and conservative fallback; freezing an
instance does not freeze prototype methods or the coercion model.

No epoch export is needed. Check the small fixed descriptor paths directly,
permanently disable the provider once a relevant dispatch change is observed,
and have the container owner bypass both canonical hits and misses when it is
invalid. Different parent domains never prove inequality.

## What source and generated runtime establish

- `src/baselib/finite_fields.py:254–267` stores `_parent` and `_value` directly;
  ordinary Python assignment reaches the rejecting `__setattr__`.
- `src/baselib/builtins.py` `_builtins_object_setattr` bypasses that override.
  It first considers descriptors, then directly stores an instance field or
  calls `Reflect.set`. For these lightweight elements there is no readonly
  physical barrier before the proposed admission freeze.
- Generated `dist/compiler/baselib-plain-pretty.js:63563` contains direct
  `self._parent = parent; self._value = ...` in the original initializer. An
  explicit call to `element.__init__(...)` is therefore another mutation path.
- `_new_reduced`, `_new_reduced_prime_field_element` and the IntegerModElement
  counterpart allocate a fresh object and write its two fields. Source review
  found no lazily mutated per-element cache in either exact scalar class.
  `__sagejs_dict_key__` mutates the parent's cache, not the element.
- `brand_machine_field_element` adds the object to private WeakSet state; it
  does not need a writable property on the element. Frozen scalar arithmetic
  can still allocate and brand new results.
- `CoercionModel.equals` uses `_parent` identity and then the left element's
  `_eq_`; original `_eq_` compares primitive `_value` values. This is why a
  stable same-parent value token can be canonical, whereas cross-parent or
  mixed-type keys must retain ordinary equality.

This review concerns exact prime-field/modular-ring scalar prototypes only.
Extension-field resource elements and arbitrary subclasses are not admitted.

## One executed diagnostic, with exact provenance

Receipt: `finite-residue-key-immutability-probe-v1.json` beside this note,
SHA256 `186eb3ecbaf8479e21b716fd38f8a3fec7cd2d01cd6d92da8f3a49f464a225e3`.
It retains the complete program and outputs, runtime path, before/after file
hashes and `source_unchanged=true`. Total developer diagnostic elapsed time was
726 ms; this is not a speedup or performance qualification measurement.

Runtime used exactly the allowed existing
`class-unit-rank-two-frontier-worktrees/general-class-unit-corpus-independent/dist`.
The finite-fields source hash matches the review base:
`e5735f6c1c043bc1c3ef53eb4bdb72283cb9a5b822096b1ad7ebcdf894a316aa`.
Other inspected runtime hashes:

- builtins source:
  `24f7c7b5b0a9f73d4944f01d485f2b16405772d1c749bf25def71b12a24fd9d5`;
- algebra source:
  `fef416bde8363faa83b1010b7e8a547c154744c99b9b2e0afa2b1fe1f3a42db3`;
- generated baselib:
  `9a2b96b55ef3da91d7701bde8454da38266cb48f6f6365f05f23e5a61593ff70`;
- retained build receipt:
  `561c4107a38d31dc056a8e71c8ef579408cc439b8feb289561a6efe609406846`.

The same results occurred for GF(7), Zmod(8) and BigInt-backed Zmod(94906267):

| Operation | Observed result |
| --- | --- |
| Ordinary `setattr(a, '_value', ...)` | `AttributeError` |
| `object.__setattr__(a, '_value', ...)` | Value changed from 2 to 3 |
| Old dictionary after that mutation | Both fresh 2 and fresh 3 found |
| Explicit `a.__init__(ring, ring(4))` | Value changed to 4 |
| Freeze a separate value 4; call `object.__setattr__` | Returned silently; value stayed 4 |
| `Reflect.set` on frozen `_value` | Returned false; no mutation |
| Explicit initializer on frozen value | `TypeError`; value stayed 4 |
| `object.__delattr__` on frozen `_value` | `AttributeError`; value stayed 4 |
| Frozen element plus ring(1) | Correct value 5 |

The two-found-keys observation is an existing stale-token bug, not a newly
introduced provider failure. The freeze simulation is not an execution of the
new provider. In tests, assert unchanged values/parents as well as lookup
semantics: `object.__setattr__` need not raise when `Reflect.set` merely returns
false. Do not change builtins or namespace owners simply to make it raise.

## Minimum admission and invalidation obligations

1. Accept only the exact two scalar prototypes. Reject subclasses, instance
   method shadows, accessors, unsupported scalar values and unexpected dispatch
   paths without executing user getters. Require own data descriptors for
   `_parent` and `_value`, with a non-null object/function parent and primitive
   BigInt or safe-integer Number value. Setter-only descriptors must not become
   an accepted data slot; checking a valid primitive descriptor `value` also
   excludes these. Do not invoke an arbitrary conversion hook to canonicalize.
2. Freeze the validated key before publishing its token. This seals both fields,
   prohibits new own shadows and prevents prototype replacement. No whole-parent
   freeze is required for the same-parent dictionary equality claim; parent
   mathematical mutation is a different issue. Do not freeze unrelated/custom
   keys merely to recover this fast path.
3. Canonicalize a safe-integer Number to BigInt before indexing the private
   parent-local token map, or otherwise bind representation mode. Numbers 2 and
   2n are distinct Map keys but equal under existing primitive equality. The
   root's in-progress BigInt normalization addresses this directly, including
   pre-admission raw-slot changes. NaN, infinities and unsafe Numbers must decline.
4. Keep parent-to-domain state and token interning independent of exposed
   `parent._dict_keys`. A fixed domain object/append-only map cannot reset tokens
   while a dictionary relies on them. Internal provider state is not a public
   mutation interface or a security boundary against arbitrary runtime sabotage.
5. Check the raw `__eq__`, `_eq_`, old token-hook and coercion `equals` descriptor
   paths and original containers equality identity. Include intermediate
   prototype identities. Equality replacement/deletion must disable canonical
   *hits* too; otherwise a token stored before mutation can still return stale
   equality results. Sticky invalidation needs no shared descriptor epoch.

Two additional small boundaries were sent to the owner while source was being
written; they should be resolved in the focused provider tests, not glossed over:

- `containers.equals` and old normalization consult `__sagejs_float__` before
  `__eq__`. A pre-admission own marker or prototype marker can redirect the
  equality path without changing the three inspected method descriptors.
  Rejecting own keys other than `_parent`/`_value` on these plain exact instances,
  plus checking relevant prototype-marker absence, is a simple narrow guard.
- `_call_member` consults `__staticmethod__`/`__python_descriptor__` on the method
  object. Changing these flags need not change the descriptor's function
  identity. If supported function-attribute mutation is in scope, bind the
  relevant original function metadata as well; consider the `.call` method used
  by `CoercionModel.equals` when specifying the low-level mutation boundary.
  This is not a recommendation to guard every host intrinsic against arbitrary
  JavaScript replacement. State the private-runtime boundary honestly.

## Focused acceptance evidence still required

- Genuine same-parent hits, distinct misses, equal-key replacement and retained
  original-key/insertion order for both scalar families and both storage modes.
- Mutation after insertion through ordinary/object setters, explicit initializer,
  deletion and raw descriptor/prototype writes: values and lookups cannot change.
  Freeze only dictionary-admitted elements; unrelated arithmetic results retain
  the prior allocation behavior. Test both queried and retained key objects.
- Pre-admission own method/float-marker/accessor/nonprimitive payload mutations
  decline; number/BigInt equal values cannot receive unequal canonical tokens.
- Prototype equality/token deletion/replacement, coercion equality replacement
  and relevant dispatch metadata changes invalidate existing canonical hits and
  misses and conservatively affect newly created dictionaries.
- Same residue across different parents, mixed numeric keys and tuple/custom
  objects use fallback. Mutating/resetting the old exposed token cache cannot
  invalidate private canonical tokens.
- Count equality/provider calls as table size grows, then use the existing
  algebra fixture under its unchanged bound. No speedup has been established by
  this review or the tiny immutability diagnostic.

If the owner cannot make the representation/dispatch guard hold without per-key
rescans, stop the narrow fast path rather than admitting mutable keys. With
admission-only freezing and the stated fixed guard boundary, no broad hash
framework or namespace/epoch changes are justified by this specific obstacle.

## Final in-progress-source pass

The owner incorporated admission freezing, BigInt token normalization, rejection
of non-representation own string names, descriptor witnesses for
`__sagejs_float__` along the entire fixed prototype chain, and original `__eq__`
function dispatch flags. I read that source at SHA256
`70ec323b2c3df796dd21af37bbf3b3c428dca4b45641aa20f0488c15e183c993`.
These changes address the central demonstrated mutation blocker and the two
earlier guard findings. No current-provider execution was performed by me.

Two final small observations were sent without broadening the review:

- Bind the original `_eq_` function's **own** `call` descriptor. The original
  coercion code invokes `method.call`; an own function attribute change can alter
  that dispatch without replacing `_eq_`. This is distinct from arbitrary
  corruption of host `Function.prototype.call`, which can remain unsupported.
- `getOwnPropertyNames` excludes symbols. `Reflect.ownKeys` makes the intended
  two-slot shape test literal, also excluding an own `Symbol.toStringTag` that
  could redirect the containers' earlier object-tag check. Arbitrary host
  prototype/symbol/intrinsic replacement and forged JavaScript proxies are not
  a claimed security boundary of this narrow first-party provider.

Final owner source SHA256
`11c36bf1ab5abd44fcfe04b833d8c49ba7298d42865e821f75c5e4cf78ad3e98`
implements both final details: captured `Reflect.ownKeys` is called through the
existing reflection boundary, and the original `_eq_` function's own `call`
descriptor is now a validity witness. I read these exact changes. No remaining
blocking flaw was identified within the stated first-party/private-runtime
contract, and I see no reason to stop the representation-preserving approach.
Focused current-source
provider/container tests, generated-code/resource review and the original
unchanged-budget algebra fixture remain the owners' qualification work. This
source reasoning and one old-runtime diagnostic are not a formal proof or a
claim that those gates passed.
