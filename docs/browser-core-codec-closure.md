# Implicit byte-codec dependencies

`str.encode('punycode')` and `bytes.decode('punycode')` invoke the existing
`sagejs._punycode` module without a user import. Include literal lazy imports
from `byte_strings.py` in both the implicit core and standalone module roots.
The ordinary resolver then adds their parent packages and static dependencies
to the cache closure. Do not add parent packages as explicit imports: doing so
can conflict with deliberate intrinsic aliases in generated task runtimes.

This changes packaging, not the codec algorithm, Python/Sage semantics, native
ABI, capability declarations, or source/asset budgets. The existing Chromium
smoke workflow checks encoding and decoding `bücher`; the standalone regression
checks core inclusion, cache inclusion, and exclusion of the parent `sagejs`
package from explicit module roots.

The production-receipt fixture also names the extension-multivariate specialist
already present in `origin/main`'s reviewed layout. Its exact-list assertion is
retained; no capability is newly classified or silently omitted.

Qualification commands and handoff results are recorded in
`.agents/tasks/browser-core-codec-closure.json`. These fixes do not depend on or
enable experimental compiler traceback capture.
