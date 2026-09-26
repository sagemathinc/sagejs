# PARI class-group artifact closure reduction — 2026-09-19

This receipt records the first whole-prepared row-6 artifact built after making
native reachability, host visibility, and exact-integer representation choice
separate compiler decisions.

## Compiler behavior

- `functions` selects public artifact roots. Its transitive native call graph is
  retained, but imported functions and unselected same-source functions are
  private.
- Private binary64 helpers have private forward declarations and `static`
  linkage, so exact helpers can call them without creating public core symbols.
- `integerBackends: ["gmp"]` is an authenticated compile option. It emits the
  native GMP graph but does not emit tagged, speculative-word, or `fmpz`
  mathematical function graphs or their Node properties.
- JavaScript fallback remains generated. Its automatic and explicit native
  selection checks the representations actually compiled into the artifact.
- The representation set participates in resident-build identity, cache
  identity, the manifest, generated JavaScript, introspection, and the returned
  build record.

The default remains `integerBackends: ["tagged", "gmp"]`.

## Full row-6 compile receipt

Input:

- source: `bench/pari-class-group-port/row6_phase6_whole_prepared_root.generated.py`
- root: `pari_row6_phase6_whole_prepared_root`
- integer representations: GMP only
- platform: Linux x86-64

Result:

- cache key: `f51e24ef9d1924879ea6b18ceb60a61774df418d94468c29ca8077326d65f64e`
- cold lower/generate/compile/link time: 96.175 seconds
- subsequent authenticated lower/cache lookup: 46.372 seconds
- reachable mathematical functions: 422
- host-callable mathematical functions: 1
- Node properties: 1 (`pari_row6_phase6_whole_prepared_root$gmp`)
- dynamic symbols: the one namespaced mathematical root plus the two mandatory
  Node module registration symbols
- tagged mathematical function bodies: 0
- speculative-word mathematical function bodies: 0

| artifact | bytes | SHA-256 |
| --- | ---: | --- |
| core C | 27,968,341 | `f0d6388b9f383ad04c94b2b4885a928a96eb0bf226149dc4fbb502e01ab687b1` |
| core header | 21,781 | `a4d2d4560924655b8f2463e6c2670557b5690f6e2f68095c84bc89bc4912eb2a` |
| Node adapter C | 127,542 | `a95daf85b5b88ac5f36b4aa13f1e687f61ac09b2326ff8f59cf537e5c8918e53` |
| generated JavaScript | 6,001,045 | — |
| manifest | 84,131,848 | — |
| native addon | 2,906,816 | `fd801a3a2a4f429c479a75b1d9783bac6d2c16c5f9eb61c62216e14c1d147b64` |

Against the frozen earlier whole-graph compile, the core C shrank from
111,806,904 bytes (75.0% reduction), the adapter from 4,038,169 bytes (96.8%),
the header from 298,558 bytes (92.7%), the generated JavaScript from 15,159,256
bytes (60.4%), and the addon from 17,464,128 bytes (83.4%). The retained 28 MB
core is now primarily the actual 422-function exact graph, rather than three
alternative exact representations of it.

This is compile/link and focused execution evidence, not a new qualified row-6
mathematical receipt. The checked-in row-6 host intentionally refuses to create
the maximum-storage resident state while `STORAGE_PLAN_REVIEWED` is false. This
campaign did not bypass that guard or relabel the previously compile-only
whole-prepared result as an executed class-group computation.
