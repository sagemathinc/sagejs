"""Lifecycle witness for declaration-generated FLINT opaque resources."""

from typing import Tuple

from sagejs.ffi.flint import (
    dirichlet_group,
    dirichlet_group_num_primitive,
    dirichlet_group_size,
)
from sagejs.native import native


@native
def dirichlet_summary(modulus: uint64) -> Tuple[uint64, uint64]:
    group = dirichlet_group(modulus)
    size = dirichlet_group_size(group)
    primitive = dirichlet_group_num_primitive(group)
    return size, primitive
