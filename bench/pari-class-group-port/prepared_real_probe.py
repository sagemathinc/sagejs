"""Capability probe for consuming prepared PARI embedding entries.

This is not a norm implementation. A faithful `factorgen` translation needs
resident arbitrary-precision real/complex inputs, not only fields that construct
constants inside the kernel. Keep this probe separate from executable kernels.
"""

from __future__ import annotations

from sagejs.native import native


@native
def prepared_real_product(field: RealField, a: RealNumber, b: RealNumber) -> RealNumber:
    """Multiply two supplied entries without changing their precision."""
    return a * b
