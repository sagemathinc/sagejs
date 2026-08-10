"""Packed canonical-labeling witness for the declarative igraph FFI."""

from sagejs.ffi.igraph import canonical_permutation, first_edge_endpoint
from sagejs.native import UInt64Buffer, native, uint64


@native
def igraph_canonical_labels(
    output: UInt64Buffer,
    edges: UInt64Buffer,
    vertex_count: uint64,
    edge_entries: uint64,
    directed: bool,
) -> bool:
    return canonical_permutation(output, edges, vertex_count, edge_entries, directed)


@native
def igraph_first_endpoint(
    edges: UInt64Buffer,
    edge_entries: uint64,
) -> uint64:
    return first_edge_endpoint(edges, edge_entries)
