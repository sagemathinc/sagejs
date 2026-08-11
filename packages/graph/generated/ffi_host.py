"""Generated checked host adapters for igraph.

This file is derived from the CPython-parseable declaration source.  Do not
edit it directly; run `sagejs ffi generate igraph`.
The native compiler lowers these actual typed bodies into one host adapter
whose core calls the declared foreign symbols without a host callback.
"""

from __future__ import annotations

from sagejs.ffi.igraph import (
    canonical_permutation as _ffi_canonical_permutation,
    first_edge_endpoint as _ffi_first_edge_endpoint,
)
from sagejs.native import UInt64Buffer, native, uint64


@native
def ffiCanonicalPermutationPacked(
    output: UInt64Buffer,
    edges: UInt64Buffer,
    vertex_count: uint64,
    edge_entries: uint64,
    directed: bool,
) -> bool:
    return _ffi_canonical_permutation(
        output,
        edges,
        vertex_count,
        edge_entries,
        directed,
    )


@native
def ffiFirstEdgeEndpointPacked(
    edges: UInt64Buffer,
    edge_entries: uint64,
) -> uint64:
    return _ffi_first_edge_endpoint(
        edges,
        edge_entries,
    )
