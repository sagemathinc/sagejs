# License and source-obligation review bundle

This directory is a navigational and review bundle for the Rust class-group
package. It does not replace the complete license files carried by upstream
source archives, and its presence is not release approval.

- `SOURCE-AND-RELINK.md` records the exact source and relink materials a
  release workflow must assemble and test.
- `PARI-2.17.4.md` identifies the pinned translated/adapted source and its
  notices.
- `RUST-REGISTRY.md` records how locked registry notices are selected.
- `NATIVE-ARITHMETIC.md` records the GMP, MPFR, FLINT/integrated-Arb, and
  OpenBLAS routes.

Complete license texts currently available elsewhere in this repository
include:

- Sage.js GPL-3.0-only: `LICENSE`;
- OpenBLAS BSD-3-Clause: `licenses/OPENBLAS-BSD-3-CLAUSE.txt`.

The release source bundle must also include the exact license and notice files
from PARI 2.17.4, each resolved crate archive, `gmp-mpfr-sys`'s bundled GMP and
MPFR trees, and every pinned native source archive actually linked. References
in this directory are not substitutes for copying those upstream files into
the reviewed release bundle.
