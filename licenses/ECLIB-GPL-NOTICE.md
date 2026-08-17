# eclib notice

The Sage.js native mathematics addon contains modified source from John
Cremona's [eclib](https://github.com/JohnCremona/eclib), copyright 1990–2026
John Cremona and other eclib contributors.

The build pins upstream commit
`8dca7f18acedf7c2283a5d0e689c269f8258c981`. Its archive URL and SHA-256
digest are recorded in `packages/flint/scripts/build-deps.cjs`; the complete
Sage.js modifications are recorded in
`packages/flint/patches/eclib-flint-rank.patch`. Together those files provide
the corresponding source for the eclib portion of the addon.

eclib is free software: you may redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 2 of the License, or (at your option) any later
version. It is distributed without any warranty. The full GPL version 3 terms
under which the combined Sage.js distribution is conveyed are in the root
`LICENSE` file.
