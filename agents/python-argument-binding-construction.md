# Python argument binding and construction

Base: `b12ef913bd9a5de8a47d301f41b06d04850b8473`.

## Immediate keyword calls

Python attribute lookup already produces a mutation-safe prepared call record
for immediate positional calls. Immediate keyword calls now use the same record
when they have no positional `*args`. The binder receives the selected unbound
target and its receiver after lookup but before argument evaluation, avoiding a
temporary bound-function allocation and metadata copy. Target-only contexts,
including custom attribute hooks and descriptor results, recurse through the
general callable resolver. Explicit-self functions assigned to classes prepend
the captured receiver; compiler-native methods retain a JavaScript receiver.

Signature metadata is live data rather than another Python descriptor lookup.
The binder reads `__argnames__`, `__kwonly__`, `__positional_only__`, the
interpolation marker, and `__varkw__` directly on every call. It caches no
signature and therefore preserves mutation of defaults and keyword defaults.
Positional-only, keyword-only, duplicate, unexpected-keyword, callable-instance,
saved-method, class-mutation, instance-assignment, descriptor, custom-hook, and
lookup-before-argument behavior remain on their existing authoritative paths.

The shared core is 902,307 / 903,000 bytes. The budget was not raised. Concise
nearby comments replace older repeated explanations, leaving 693 bytes of
headroom.

## Controlled measurements

The idle `bench-1` host ran Node 26.5.1 and CPython 3.12.3. Each process checked
its result, performed ten complete samples, and the first three were warmups.
Compilation and startup are outside the reported regions. Times below are warm
medians in milliseconds for 100,000 operations.

| Case | Main | Candidate | CPython | Candidate change | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 91.39 | 79.46 | 8.75 | not claimed | 9.1x |
| keyword function | 352.51 | 337.80 | 10.00 | 4.2% faster | 33.8x |
| immediate keyword method | 699.40 | 409.05 | 10.40 | 41.5% faster | 39.3x |
| positional `Point` construction and method | 901.78 | 914.52 | 22.53 | not improved | 40.6x |
| keyword `Point` construction and method | 1625.74 | 1613.04 | 37.23 | not claimed | 43.3x |

The immediate keyword-method gap falls from about 65x to about 39x CPython; it
is still an open performance cliff. The function improvement is real but small,
and neither construction row improved consistently. The expanded candidate
probe measures empty construction at 327.36 ms versus CPython's 7.54 ms
(43.4x), and an explicit no-op initializer at 279.31 ms versus 11.74 ms
(23.8x). The slower empty class points to repeated synthetic-initializer/MRO
resolution as the next construction target.

The main standalone artifact SHA-256 is
`7451636546cc013e9b488e168540c72c9c840ffa9738eb827ea1033ef8a5f213`.
The common-case candidate artifact is
`7f0e84528196cff765b4af189df8052fc3700fdb36c2e94d26b10d10d58599ce`;
the expanded candidate artifact is
`9207d413fa52505c77666dc20d248ec56777d15d0ad64f2749a4a4658220d394`.

## Construction follow-up

Explicit initializers now reject the custom-`__new__`/`object.__init__`
exception before resolving `__new__`. Generated forwarding initializers cache
their MRO result against the existing descriptor-mutation epoch, so assignment
or deletion on any class invalidates inherited results. Finally, initialization
consumes the original ephemeral keyword packet after allocation has consumed
its independent copy; this avoids a second keyword-object clone without
mutating the caller's `**kwargs` mapping.

The same idle host and sampling contract measured the source-current follow-up:

| Case | Immediate-call candidate | Construction follow-up | Change | Follow-up / CPython |
| --- | ---: | ---: | ---: | ---: |
| empty construction | 327.36 | 291.20 | 11.0% faster | 38.6x |
| explicit no-op initializer | 279.31 | 60.83 | 78.2% faster | 5.2x |
| positional `Point` construction and method | 914.52 | 674.74 | 26.2% faster | 30.0x |
| keyword `Point` construction and method | 1613.04 | 1123.25 | 30.4% faster | 30.2x |

Times are milliseconds for 100,000 operations. The follow-up artifact SHA-256
is `4d8d67a541b1d176f155d9e0a4b3ad85e8da5fbd5c521221df8ce078ad363cde`.
Empty construction and keyword construction remain performance cliffs; these
results do not label either closed.

## Qualification

- The final source-current build passed in 7m 36s.
- All 82 focused lowering and Python/Sage runtime checks pass.
- All 224 portable test files pass.
- Strict CPython syntax, Ruff 0.16.0 formatting, and Pyright pass for 404
  modules with zero errors.
- The package graph passes at the unchanged budgets.
- All six traitlets integration checks pass, including the pinned upstream
  import and notification/failure transcript.
- The pinned `decorator` 5.2.1 workflow passes its source-current package
  qualification.
- The construction follow-up passes the full 224-file portable tier, all 17
  focused dynamic-initializer/default checks, and the pinned `attrs` 25.4.0
  workflow. Its final source-current build completed in 7m 25s.
- Core runtime remains inside its unchanged budget at 902,981 / 903,000 bytes.

The checked benchmark source is `bench/python-call-construction.py`.
Browser/platform CI remains merge-owned qualification; no release is implied.
