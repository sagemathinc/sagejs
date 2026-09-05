# N1 browser payload investigation

Development checkpoint, 2026-09-05. **The existing browser payload gate is
still open; no limit has been raised.** This is not browser qualification.

The trace candidate's CI report measured 17,528,500 gzip bytes and 9,615,417
Brotli bytes in its eager core, above the 17,400,000 / 9,600,000 ceilings.
The earlier green release report at `c9b69001c` measured 17,337,075 /
9,565,754 bytes. These are different complete build inputs, not a paired
attribution of the entire increase to tracing. Baselib, compiler, lazy-module
and standard-library caches all contribute to the difference.

One hypothesis was lossless transport sharing of the standard-library cache's
four compiled variants (beautification on/off and docstrings on/off). Removing
a variant or a Python module is not an acceptable size fix. Three temporary
encoders reconstructed every current module and variant exactly; the compiler
frontend also accepted reconstructed caches. However, their storage results
do not justify adoption:

- A semicolon/newline chunk dictionary reduced gzip substantially, but the
  tested cache aggregate grew from about 1.494 MB to 1.636 MB with Brotli Q11.
- Consecutive chunk-reference runs improved that to 1.605 MB: still a loss.
- Keeping each no-docstring variant as a plain base and describing its
  docstring counterpart using exact copy ranges/literals gave 3,612,657 gzip
  bytes (versus 5,177,923 for that plain aggregate), but 1,963,975 Brotli bytes.

These are local exploratory cache aggregates, not production manifest sizes,
cross-host compression receipts, or startup/memory measurements. They show
why raw JSON size or gzip alone is an inadequate acceptance criterion. Brotli
already exploits much of the repeated source; extra reference metadata can
make it worse. The encoders and transport changes were removed before commit.
The production format, frontend and all four variants remain unchanged.

Next qualification must use the real, source-current production bundle,
retain all semantic variants, pass both compression ceilings and measure
worker first-use/steady memory. Coordinate with the integration lane's
independent payload work instead of introducing an unqualified transport
format into the numerical trace PR. The numerical A/B/B/A receipts remain
valid for their explicitly frozen sources, not for a future browser build.
