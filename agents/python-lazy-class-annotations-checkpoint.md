# Lazy class annotation slots: local qualification

This follows the live constructor milestone in PR #183. The pinned pyparsing
workflow currently fails when it reads `__annotations__` on a class without
declared annotations. Supply Python 3.14's default own-class annotation slot,
not a fabricated inherited dictionary or constructor-function annotations.

New heap classes are branded privately. A dictionary is allocated only when
the default slot is read; assignment, deletion/recreation and descriptor values
use that same private slot without entering the class namespace or instances.
Explicit namespace entries keep the existing descriptor and namespace-cache
path. Known callable/sequence wrappers share the original class's slot identity.
Registration precedes callbacks and decorators; the independent constructor
keyword registry remains after prototype inheritance.

The shared fixture passes the explicitly selected CPython 3.14.4 oracle. It is
not installed as an ordinary unit test against arbitrary `python3`: current
build CI uses Python 3.13, whose class annotation storage differs. Required
Sage.js fixture tests run in both Python and Sage modes, including dynamic-type
callbacks, proxy identity, deletion, descriptors and builtin exclusions.

Source cost after correcting the host WeakMap deletion boundary: core grows
from 894470 to 900551 bytes (+6081), with an explicit 901000-byte ceiling
(449 bytes of room).
Compiler, startup and payload limits are not relaxed. Refresh the modular
source freeze because it also binds the package-budget file; no mathematical
source or required platform check changes.

The first build and strict checks passed. Existing focused tests passed 24/24;
new annotation tests caught a mangled host WeakMap deletion call and a fixture
using the unsupported from-import form for compiler intrinsics. Both are
corrected for the next build. The fixture now explicitly assigns function
annotations: default function annotation evaluation is a separate compiler
policy, not part of this class-slot change.

The second build passed. Its fixture progressed through every heap-class and
proxy assertion, exposing a final preexisting leak of factory-function
annotations on builtin types. Each exact factory now drops that metadata at
its existing type-normalization point in builtins, containers or str; do not
perform this globally before those modules have initialized. The fixture also
covers frozenset, range and property. The final fresh build and runtime tests
pass with this correction.

The pinned pyparsing workflow gets beyond its original annotation import
failure but fails during parsing with an argument-count error. It is NOT
qualified. No browser or platform qualification is claimed yet.
Dynamic-type callback identity is an important actual-runtime gate because
the final metaclass marker is assigned late in that existing path. This is not
full PEP 649 evaluation or a metaclass/descriptor protocol rewrite.

## Final local results

- Full build: pass, 10m 18s; strict CPython syntax/Ruff/Pyright: pass, 381 modules.
- Focused runtime/package/boundary selection: 81/81 pass, including the shared
  annotation fixture and sequence-wrapper identity in Python and Sage modes.
- Architecture checks and the post-generation routine validation: pass;
  routine took 1m 47s, including its startup budget (7s).
- Pinned CPython 3.14.4 fixture: pass.
- All 28 adopted upstream assertion-program statuses are unchanged: 13 pass,
  15 required failures. This is not broad compatibility qualification.
- Pinned package workflows: 8/11 pass; attrs remains passing, as do the seven
  selected upstream Tomli tests. Pyparsing now passes its annotation-dependent
  import but fails its parsing workflow; idna reports unexpected host warning
  stderr and mpmath reaches the existing 30-second timeout. No failures waived.

The pyparsing follow-up is general traceback provenance. Its pristine pinned
3.3.2 source compares the Python call-site line against `extract_stack`, while
our traceback implementation exposes generated JavaScript lines and subtracts
a fixed offset for argument failures. Do not alter that offset or retry all
TypeErrors: errors inside the user's callback must escape. Exact source mapping
and argument-guard versus body ownership need independent implementation and
qualification. The annotation change does not claim to fix that problem.

Generated optimizer evidence and documentation source references are refreshed.
The initial broad validation overlapped generation; only the clean subsequent
architecture/routine run is the final receipt. No four-platform, browser, SEA,
or performance-cliff closure is claimed by this local milestone.
