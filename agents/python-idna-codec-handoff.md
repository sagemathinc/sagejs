# Portable Punycode and the IDNA workflow

This M3 change replaces both Node `punycode` codec calls with one lazy,
ordinary-Python implementation adapted from the pinned CPython source recorded
in `licenses/CPYTHON-PUNYCODE-NOTICE.md`. It implements raw Punycode, not domain
normalization or URL parsing. The upstream `idna` package remains responsible
for IDNA policy. No deprecation-warning filter or workflow assertion changed.

The codec uses explicit code-point sequences for ordering and insertion. Node
and browser execution therefore use the same source without a Node builtin.
The browser smoke probe exercises encoding and decoding through a Python-mode
session; its presence is not itself a browser qualification receipt.

Two shared runtime repairs were necessary: `ord()` now accepts lone surrogate
characters, and Unicode encode/decode exceptions expose their encoding,
object, start, end, and reason fields. Their original `args` remain independent
of later field assignment. This is not a claim of complete exception-constructor
argument validation or CPython error-message formatting.

## Validation scope

On Linux x64 with Node 26.8.1 and the pinned CPython 3.14.4 oracle, a fresh
`pnpm build` passed. Strict Python checks passed for 387 modules. Focused codec,
exception-initializer, and source-freeze tests passed. The unchanged pinned
`idna 3.11` package workflow passed with an unchanged-source, non-artifact-only
qualification receipt for that selected workflow. This is neither a full
11-package matrix result nor a four-platform or performance qualification.

The differential codec test covers malformed and truncated encodings, error
handlers, ASCII case, combining characters, supplementary characters, lone
surrogates, bytes/bytearray decoding, and exact exception arguments. It executes
a Python file rather than the CLI's interactive display hook and requires
empty stderr without normalizing away warnings.

The integration follow-up retains both this codec and main's lazy collection
helpers. Deduplicating the terminal error path in `ord` brings their combined
core source size to 902,920 / 903,000 bytes without increasing the budget.
Additional oracle cases cover byte/bytearray ordinals and invalid Unicode
exception argument counts. The latter require an explicit count check: legacy
bootstrap helper signatures do not themselves enforce Python call arity.
After integrating main `c4c126d09`, a fresh build passed in 10m 49s, strict
Python checks passed for 388 modules, and all 19 focused codec, initializer,
source-freeze, lazy-collection and public-builtin tests passed. The unchanged
pinned `attrs 25.4.0`, `idna 3.11` and `tomli 2.3.0` workflows all passed with
a non-artifact-only, unchanged-source qualification receipt for that selected
scope. Generated documentation checks passed, and `build:check` confirmed
receipt reuse after documentation regeneration. No timing campaign was run.

## Remaining work

- General string indexing and length still expose UTF-16 units: for example,
  `len(chr(0x1f600))` is currently 2, and indexing selects a surrogate, while
  iteration yields the full character. The codec's explicit code-point
  representation avoids that defect; it does not repair or close it globally.
- `pyparsing` requires real original-source traceback coordinates, not the
  existing guessed generated-line adjustment. Its callback arity detection
  must distinguish binder failures from `TypeError` inside callback bodies.
- The recorded mpmath cold-workflow timeout and performance campaign remain
  open. This codec change makes no speedup or performance-cliff closure claim.
- A constructor-sharing experiment exposed a separate class-emission defect:
  an early `__init__ = existing_function` assignment can be overwritten by a
  synthetic initializer. The experiment was rejected; codec errors retain
  explicit initializer methods. A minimal ordinary-Python probe is a function
  that prints its arguments, assigned to `C.__init__` inside the class body,
  followed by `C(3)`; the assigned function should run, but currently does not.
- Cross-platform and real-browser qualification must use their own exact
  candidate results. No release is prepared or published by this change.
