# Property mutation follow-up

Date: 2026-09-11. Base: `origin/main` at `5b307b65f`, which contains PR #216.
Implementation: `9d420bc87`, `5a42b4924`, and `ac46d8245`.

This is a correctness follow-up to the Python compiler/runtime value plan,
not a declaration that the broader compatibility or performance work is done.

## Delivered

- Move `copy` and `flatten` implementations into the lazy, strict-Python
  `sagejs._collection_helpers` module. Keep their existing public behavior;
  the cold implementation no longer occupies the eager runtime.
- Make compiler-emitted native property slots configurable so Python class
  attribute deletion and replacement work.
- Replace class prototype slots with an own data property instead of invoking
  an existing or inherited setter. Remove obsolete deleter side slots.
- Resolve property deletion and Python descriptor materialization against the
  defining prototype. A getter-only override must not inherit a base deleter.
- Reject deletion of a property without a deleter even when an instance
  dictionary contains a same-named entry. Saving and reinstalling that property
  must preserve the same behavior.

## Evidence and limits

The expanded `test/fixtures/property-protocol.py` agrees with CPython 3.14.4.
The final implementation passed 29 focused Node tests on Linux x64, Node 26.8.1:

```sh
node bin/sagejs self --complete
node scripts/build-runtime-cache.cjs
node --test test/property-protocol.cjs test/lazy-collection-helpers.cjs \
  test/method-binding-mutations.cjs test/python-object-namespaces.cjs \
  test/python-property-clone.cjs test/python-prepared-method-call.cjs \
  test/python-public-super.cjs
```

`pnpm test:baselib:strict` passed all 387 modules. The package graph passed at
902,982 / 903,000 eager core source bytes; no budget was increased.

A full build passed before the final deleter refinements. After those changes,
the compiler was rebuilt to convergence and the Node runtime caches rebuilt;
the focused results above describe that final implementation. They are not a
fresh full-routine or four-platform qualification receipt.

`pnpm architecture:check` failed at the existing forbidden-dependency text
check: `docs/general-class-unit-frontier.md:280` contained a historical
dependency-name reference. The same text was present on the base revision.
That other lane's document was left untouched in that pass; do not report its
whole architecture gate green.

Independent source review caught the inherited-descriptor materialization
caller invariant. Both direct deletion and saved property objects must use the
same defining prototype; fixing only one leaves a route to the stale deleter.

No new performance ratio is claimed. The previously documented common-call,
construction, and package-workflow cliffs remain separate work.
