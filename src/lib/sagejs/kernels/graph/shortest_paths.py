"""Bounded packed shortest paths for public unweighted graphs.

The ordinary Python bodies are the exact fallback and the source lowered by
`@native`.  Both kernels build an insertion-order CSR index from packed edge
endpoints and then run breadth-first search without a Python or JavaScript
callback.  The caller owns all buffers and supplies an explicit work budget.

Distances and parents use `vertex_count` as the unreachable sentinel.  The
single-source kernel accepts at most 250,000 vertices and 2,000,000 endpoint
entries.  The all-pairs kernel accepts at most 2,048 vertices and 4,000,000
endpoint entries, bounding its row-major result to 4,194,304 values (32 MiB).
Status `0` means success, `1` means malformed or out-of-bounds input, and `2`
means that the work budget was exhausted at a deterministic cancellation
point.  Invalid shapes and endpoints are rejected before output is changed.
"""

from __future__ import annotations

from sagejs.native import UInt64Buffer, native, uint64


def graph_shortest_paths_workspace_length(
    vertex_count: int,
    edge_entries: int,
) -> int:
    """Return the scratch length shared by the packed BFS kernels."""
    if vertex_count < 0:
        raise ValueError("graph vertex count must be nonnegative")
    if edge_entries < 0 or edge_entries % 2 != 0:
        raise ValueError("packed graph edges need endpoint pairs")
    return 3 * vertex_count + 1 + edge_entries


@native
def packed_graph_shortest_paths(
    distances: UInt64Buffer,
    parents: UInt64Buffer,
    edges: UInt64Buffer,
    workspace: UInt64Buffer,
    vertex_count: uint64,
    edge_entries: uint64,
    directed: uint64,
    source: uint64,
    work_limit: uint64,
) -> uint64:
    """Fill one insertion-order BFS distance and parent row.

    The workspace length is `3 * vertex_count + 1 + edge_entries`.  Work is
    charged once per dequeued vertex and once per inspected adjacency entry.
    """
    zero: uint64 = 0
    one: uint64 = 1
    two: uint64 = 2
    invalid: uint64 = 1
    exhausted: uint64 = 2
    if vertex_count > 250000 or edge_entries > 2000000:
        return invalid
    if edge_entries != len(edges) or edge_entries % 2 != 0:
        return invalid
    if source >= vertex_count or len(distances) != vertex_count:
        return invalid
    if len(parents) != vertex_count:
        return invalid
    if len(workspace) != 3 * vertex_count + one + edge_entries:
        return invalid

    edge_index: uint64 = zero
    while edge_index < edge_entries:
        if edges[edge_index] >= vertex_count or edges[edge_index + one] >= vertex_count:
            return invalid
        edge_index = edge_index + two

    offsets: uint64 = zero
    cursors: uint64 = vertex_count + one
    adjacency: uint64 = two * vertex_count + one
    queue: uint64 = adjacency + edge_entries

    vertex: uint64 = zero
    while vertex <= vertex_count:
        workspace[offsets + vertex] = zero
        vertex = vertex + one
    edge_index = zero
    while edge_index < edge_entries:
        edge_source = edges[edge_index]
        edge_target = edges[edge_index + one]
        workspace[offsets + edge_source + one] += one
        if directed == zero and edge_target != edge_source:
            workspace[offsets + edge_target + one] += one
        edge_index = edge_index + two

    vertex = zero
    while vertex < vertex_count:
        workspace[offsets + vertex + one] += workspace[offsets + vertex]
        workspace[cursors + vertex] = workspace[offsets + vertex]
        vertex = vertex + one

    edge_index = zero
    while edge_index < edge_entries:
        edge_source = edges[edge_index]
        edge_target = edges[edge_index + one]
        position = workspace[cursors + edge_source]
        workspace[adjacency + position] = edge_target
        workspace[cursors + edge_source] = position + one
        if directed == zero and edge_target != edge_source:
            position = workspace[cursors + edge_target]
            workspace[adjacency + position] = edge_source
            workspace[cursors + edge_target] = position + one
        edge_index = edge_index + two

    vertex = zero
    while vertex < vertex_count:
        distances[vertex] = vertex_count
        parents[vertex] = vertex_count
        vertex = vertex + one
    distances[source] = zero
    queue_head: uint64 = zero
    queue_tail: uint64 = one
    workspace[queue] = source
    work: uint64 = zero
    while queue_head < queue_tail:
        if work >= work_limit:
            return exhausted
        current = workspace[queue + queue_head]
        queue_head = queue_head + one
        work = work + one
        neighbor_index = workspace[offsets + current]
        neighbor_stop = workspace[offsets + current + one]
        while neighbor_index < neighbor_stop:
            if work >= work_limit:
                return exhausted
            target = workspace[adjacency + neighbor_index]
            work = work + one
            if distances[target] == vertex_count:
                distances[target] = distances[current] + one
                parents[target] = current
                workspace[queue + queue_tail] = target
                queue_tail = queue_tail + one
            neighbor_index = neighbor_index + one
    return zero


@native
def packed_graph_all_pairs_distances(
    distances: UInt64Buffer,
    edges: UInt64Buffer,
    workspace: UInt64Buffer,
    vertex_count: uint64,
    edge_entries: uint64,
    directed: uint64,
    work_limit: uint64,
) -> uint64:
    """Fill the complete row-major unweighted distance matrix in one call.

    Each row uses `vertex_count` for unreachable vertices.  Work is charged at
    the same deterministic BFS cancellation points as the single-source call.
    """
    zero: uint64 = 0
    one: uint64 = 1
    two: uint64 = 2
    invalid: uint64 = 1
    exhausted: uint64 = 2
    if vertex_count > 2048 or edge_entries > 4000000:
        return invalid
    if edge_entries != len(edges) or edge_entries % 2 != 0:
        return invalid
    if len(distances) != vertex_count * vertex_count:
        return invalid
    if len(workspace) != 3 * vertex_count + one + edge_entries:
        return invalid

    edge_index: uint64 = zero
    while edge_index < edge_entries:
        if edges[edge_index] >= vertex_count or edges[edge_index + one] >= vertex_count:
            return invalid
        edge_index = edge_index + two

    offsets: uint64 = zero
    cursors: uint64 = vertex_count + one
    adjacency: uint64 = two * vertex_count + one
    queue: uint64 = adjacency + edge_entries
    vertex: uint64 = zero
    while vertex <= vertex_count:
        workspace[offsets + vertex] = zero
        vertex = vertex + one
    edge_index = zero
    while edge_index < edge_entries:
        edge_source = edges[edge_index]
        edge_target = edges[edge_index + one]
        workspace[offsets + edge_source + one] += one
        if directed == zero and edge_target != edge_source:
            workspace[offsets + edge_target + one] += one
        edge_index = edge_index + two
    vertex = zero
    while vertex < vertex_count:
        workspace[offsets + vertex + one] += workspace[offsets + vertex]
        workspace[cursors + vertex] = workspace[offsets + vertex]
        vertex = vertex + one
    edge_index = zero
    while edge_index < edge_entries:
        edge_source = edges[edge_index]
        edge_target = edges[edge_index + one]
        position = workspace[cursors + edge_source]
        workspace[adjacency + position] = edge_target
        workspace[cursors + edge_source] = position + one
        if directed == zero and edge_target != edge_source:
            position = workspace[cursors + edge_target]
            workspace[adjacency + position] = edge_source
            workspace[cursors + edge_target] = position + one
        edge_index = edge_index + two

    work: uint64 = zero
    source: uint64 = zero
    while source < vertex_count:
        row = source * vertex_count
        vertex = zero
        while vertex < vertex_count:
            distances[row + vertex] = vertex_count
            vertex = vertex + one
        distances[row + source] = zero
        queue_head: uint64 = zero
        queue_tail: uint64 = one
        workspace[queue] = source
        while queue_head < queue_tail:
            if work >= work_limit:
                return exhausted
            current = workspace[queue + queue_head]
            queue_head = queue_head + one
            work = work + one
            neighbor_index = workspace[offsets + current]
            neighbor_stop = workspace[offsets + current + one]
            while neighbor_index < neighbor_stop:
                if work >= work_limit:
                    return exhausted
                target = workspace[adjacency + neighbor_index]
                work = work + one
                if distances[row + target] == vertex_count:
                    distances[row + target] = distances[row + current] + one
                    workspace[queue + queue_tail] = target
                    queue_tail = queue_tail + one
                neighbor_index = neighbor_index + one
        source = source + one
    return zero


__all__ = [
    "graph_shortest_paths_workspace_length",
    "packed_graph_all_pairs_distances",
    "packed_graph_shortest_paths",
]
