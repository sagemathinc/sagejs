# Guarded dictionary domains

This storage candidate uses an internal first-party contract, not a public hash
protocol. `_register_dict_canonical_provider(probe, valid)` registers two native
callable identities. `probe(key)` returns a native `{domain, token, guard}` record,
`None` for an unrecognized key, or `False` for a recognized invalid family.
`valid(guard)` must return exactly `True` while the original contract holds.

The provider owns the proof that immutable admitted keys in one domain compare
equal exactly when their tokens have the same stable native identity or value.
An opaque object or exact native BigInt can be a token; tokens need not be
disjoint across domains or from native primitive keys. Domain, guard and provider
records are compared by identity, so a foreign token collision must still compare
retained original keys. A token cache reachable through a public parent attribute
cannot supply that authority. A provider must guard the actual
equality/normalization/representation paths; an
inherited user hook alone does not establish admission. Residue-provider admission
and its mutation guards are tested separately.

Each dictionary has private WeakMap metadata with one of four states:

- EMPTY: no retained keys.
- PRIMITIVE: every retained original key is a native primitive.
- CANONICAL: all retained originals belong to one live provider/domain/guard.
- GENERAL: heterogeneous, uncertified, invalidated, or unindexed storage.

Only primitive-only primitive misses and live same-domain canonical misses can
skip scanning. Different domains never prove inequality. Equal replacement keeps
the original key and insertion position, so a foreign equal query does not itself
degrade the retained domain. GENERAL stays general until empty or cleared.
Invalidation suppresses normalized-token hits as well as misses, including hits
in mixed tables. Untrusted token collisions compare original keys and receive a
separate storage identity when unequal; they cannot overwrite a different key.

Shared insertion serves constructors, literals, comprehensions, direct exact-dict
assignment, updates and explicit dict methods. Setdefault uses the same resolved
insertion. Clear/deletion/pop/popitem and copy maintain metadata; reinitialization
preserves both existing maps. Private mutable metadata permits read-time guard
invalidation on an otherwise frozen dictionary object. Known scope construction
publishes primitive metadata. Size changes from existing native namespace writes
conservatively invalidate metadata; arbitrary private-map corruption is not a
supported API. Existing popitem ordering is unchanged.

`test/dict-canonical-domain.cjs` has a source-only guard and runtime protocol tests.
The controlled test provider is not a proof of production residue admission.
Per-map iterator counts test zero retained-key scans at sizes 32, 128 and 512
without replacing the guarded `containers.equals` function. Mixed primitive/object
equality is covered in both insertion orders, along with invalid hits/misses,
foreign domains, retained identities, freezing and shared mutation paths.
The native-token regression covers the same BigInt value in two domains and as
a primitive key: unequal originals coexist, while equal replacements preserve
the first original, including primitive-first and either-domain-first orders.

Candidate validation commands:

```sh
node --test --test-name-pattern='^source:' test/dict-canonical-domain.cjs
pnpm test:baselib:strict
pnpm architecture:packages
node --test test/dict-canonical-domain.cjs test/finite-field-canonical-domain.cjs test/dict-reinitialization-storage.cjs
```

The final command requires a freshly built combined containers/provider source;
an unrelated generated runtime is not qualification. The unchanged algebra test
with its 60-second gate, compiler/integration regressions, and generated-code and
resource review remain required before any speed or merge-readiness claim. The
initial storage candidate's formatted source check failed at 907726 bytes against
the unchanged 903000 core-runtime allowance (base 900094, growth 7632). `pnpm test:changed`
stops at the same merge/package gate, before any build. This lane does not raise
the allowance or relax mathematical, execution-memory or timeout limits. This is an unqualified
source candidate until the coordinator resolves that explicit resource gate and
performs exact-source combined validation.
