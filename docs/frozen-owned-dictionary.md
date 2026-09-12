# Shallow frozen instance dictionaries

This extends the atomic namespace transition in PR255 and the stable dictionary
reinitialization storage in PR256. It is an internal Sage.js heap-instance
contract, not CPython's behavior: CPython has no `Object.freeze` equivalent.

The native host `Object` constructor and its own-property freeze behavior are
unchanged. For ordinary registered Python instances, freezing also prevents
Python writes through an owned `__dict__`, including retained aliases, saved
bound dictionary methods, explicit base dictionary methods, attribute writes,
and dictionary reinitialization. Repeated failed writes preserve values and
namespace identity. No-op operations that perform no storage write remain legal.
Nested referenced values are not frozen; independent dictionary copies remain
mutable and retain the same nested references.

Only exposed instance namespaces receive backing-Map mutation guards. Their
owners are held through native weak references. Detached or collected owners
are pruned when a later mutation checks the guard. A dictionary shared by several
instances rejects mutation whenever any still-attached owner is frozen; an
unfrozen owner can replace its namespace with another dictionary. Previously
detached aliases remain independent and mutable. This does not add a guard to
every ordinary dictionary mutation.

Freezing before first dictionary exposure permanently fixes registered own data
fields. Their shallow dictionary snapshot is cached and guarded without deleting
fields, changing the prototype, or publishing a fictitious bridge. Explicit own
host accessors can return changing values even when frozen, so their exposure
fails closed before calling a getter rather than returning a stale snapshot.
Python properties remain class descriptors, not snapshot fields. A property
setter can legitimately mutate a nested referent under this shallow contract.

This is not a sandbox boundary. Explicit host operations that bypass a Map's own
methods, replacement of implementation-private backing Maps, hostile proxies,
and unregistered native receivers are outside this ordinary-instance contract.
The native fallback `object.__setattr__` path's ignored `Reflect.set(false)` is a
separately coordinated repair, not claimed fixed here.
An additional diagnostic found the existing `__slots__` plus `__dict__` layout
stores nominal slot values in the dictionary, unlike CPython. This guard does
not repair or claim CPython slot-layout compatibility.
The minimized ordinary-Python fixture `test/fixtures/instance-slots-dict-gap.py`
is retained outside the passing guard harness. CPython prints `{'extra': 2}`
and `instance-slots-dict-ok`; Sage.js currently prints
`{'slot': 1, 'extra': 2}` then raises `AssertionError` in both modes. This is an
open Python compatibility defect, not an approved semantic difference. The
initial property test exposed it; the property-only regression remains in
the guard matrix while this independent failing oracle is preserved here.

The ordinary bridge constructor only reads the registered prototype/owner,
allocates its target, closures, and Proxy, then sets the instance prototype.
It invokes no Python callback between preflight and commit. A hostile Proxy
can still reject that final operation. Its proposed dictionary may have guard
methods installed, but no active ownership is published: retained aliases
remain mutable and can be attached to another ordinary instance. This is not
a general rollback transaction for arbitrary host traps. Both backing Maps
are preflighted before installing any immutable guard method.

`test/fixtures/frozen-owned-dictionary.py` exercises both freeze timings, mutation
methods, alias detach/reattach, shared owners, dictionary subclasses, shallow
copies, host accessor rejection, and failure-atomic Map guard preflight. The
Node harness checks collection of weak owners across separate host jobs with
explicit GC, then verifies that their retained aliases become mutable. The
predecessor atomic fixture now expects stable read-only data-field exposure for
frozen instances while retaining all its rejected-transition checks.

Validation is pending. Copied predecessor artifacts may be used for explicitly
labelled source-injected diagnostics; they do not qualify this candidate. A
complete build from frozen candidate sources is required before handoff.

## Retained performance diagnostics

The first source proposal passed the mutation matrix but was rejected for its
exposed-write overhead. The local cost fixture uses the same Python assignment
function for ordinary dictionaries, explicitly unguarded exposed dictionaries
(a diagnostic-only private bridge-publication bypass), and guarded dictionaries.
Each sample performs 10,000 existing-string-key writes, with three warmups and
seven retained samples. It is a sanity diagnostic on the local development
host with Node 26.8.1 and privately copied PR256 artifacts loading candidate
namespace source, not a benchmark qualification or public performance claim.

With the first scanner source SHA256
`a6333a264159f0516bd6d8037879b7ecf03970052082daa3a477caa79e733b7a`,
the samples in milliseconds were:

| Sample | Plain | Unguarded exposed | Guarded |
| --- | ---: | ---: | ---: |
| 1 | 1.5082 | 1.4212 | 90.4791 |
| 2 | 1.4451 | 1.4462 | 90.0106 |
| 3 | 1.4806 | 1.4524 | 89.5600 |
| 4 | 1.4541 | 1.4098 | 89.1595 |
| 5 | 1.4226 | 1.4253 | 87.7051 |
| 6 | 1.4536 | 1.4093 | 89.2844 |
| 7 | 1.4379 | 1.4167 | 88.8476 |

Compiled-source inspection identified generic Python prepared-method lookup for
private WeakMap/WeakRef operations and Python iteration adaptation for a known
native Set. Capturing these native methods and applying them through existing
`runtime.reflect` primitives reduced the guarded range to 17.23–20.55 ms.
Using the native Set iterator's captured `next` operation then produced
5.74–6.10 ms, against 1.45–1.48 ms for unguarded exposed dictionaries.
The initial cost is retained rather than omitted; candidate build and final
performance checks are still pending. Neither refinement changes native code,
freezing semantics, or unexposed dictionary storage paths.

The final source proposal replaces the private Set with a native WeakRef array,
using explicit native index/length access and lazy splice removal. Cold owner
registration deduplicates references; adjacent inactive-owner regressions cover
the removal loop. Seven local 10,000-write samples were:

| Sample | Plain | Unguarded exposed | Guarded array |
| --- | ---: | ---: | ---: |
| 1 | 1.4827 | 1.4582 | 4.9286 |
| 2 | 1.4737 | 1.4687 | 5.0354 |
| 3 | 1.5008 | 1.4536 | 5.2841 |
| 4 | 1.4815 | 1.4839 | 4.9429 |
| 5 | 1.4813 | 1.4725 | 5.2338 |
| 6 | 1.5244 | 1.4603 | 4.9407 |
| 7 | 1.4951 | 1.4734 | 4.9787 |

This still adds roughly 0.35 microseconds per protected write locally. A V8
worker CPU profile of the preceding native-Set version at 100,000 writes
identified the owner scanner, wrapper, and existing receiver adapter as the
remaining guard costs. No adapter ABI or generic dictionary fast path changed.

The semantic and explicit-GC diagnostics pass in both modes, including adjacent
dead/detached owner removal and reattachment deduplication. The task metadata
will remain active and frozen through the final direct build and read-only
qualification. Final build, broader suite results, exact receipt identity, and
built-artifact performance evidence belong in the PR handoff without rewriting
the metadata after the build. This preserves receipt currency; pre-build
diagnostics and the separately retained compatibility failures do not become
candidate qualification merely because they are documented here.
