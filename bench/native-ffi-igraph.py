"""Borrowed-view witness for the declaration-generated igraph FFI."""

from typing import Tuple

from sagejs.ffi.igraph import (
    complete_graph,
    edge_checksum,
    edge_count,
    edges,
    vertex_count,
)
from sagejs.native import native


@native
def complete_graph_summary(size: uint64) -> Tuple[uint64, uint64, uint64]:
    graph = complete_graph(size, False, False)
    edge_view = edges(graph)
    return vertex_count(graph), edge_count(edge_view), edge_checksum(edge_view)
