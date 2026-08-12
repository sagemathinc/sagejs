# `@sagemath/sagejs-m4ri`

This optional package provides generated owned resources for dense matrices
over `GF(2)` backed by M4RI. Matrix-to-matrix operations remain entirely
inside M4RI; no raw pointer crosses into Python or JavaScript.

The stable bulk boundary is independent of M4RI's physical padding. Logical
words are row-major little-endian 64-bit values, with column zero in the low
bit and unused tail bits required to be zero. A separate one-byte-per-entry
transfer matches SagePack's current compact prime-field matrix payload.

Native Windows currently reports the capability as unavailable. Its generated
adapter remains buildable and callers must use the tested packed `GF(2)`
fallback. Linux and macOS build the pinned thread-safe M4RI 20260122 release.

M4RI is licensed under GPL-2.0-or-later. The pinned pristine source is
available from its [upstream release](https://github.com/malb/m4ri/releases/tag/20260122).
