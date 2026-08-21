"""Packed connected-components traversal for public Sage.js graphs.

The ordinary Python body is the exact fallback and the source lowered by
`@native`.  It builds a compact adjacency index once, then performs one BFS per
component.  The caller owns every buffer; the isolated kernel neither allocates
host objects nor calls Python or JavaScript after marshalling.

For undirected graphs, neighbors retain edge-insertion order.  For directed
graphs, weak components retain the public fallback's ordering of outgoing
neighbors followed by incoming neighbors.  The traversal and component-offset
buffers therefore reproduce `GenericGraph.connected_components(sort=False)`,
not merely its component sets.
"""

from __future__ import annotations

from sagejs.native import UInt64Buffer, native, uint64


def graph_components_workspace_length(
    vertex_count: int,
    edge_entries: int,
) -> int:
    """Return the exact scratch length for `packed_graph_components`.

    `edge_entries` counts endpoints, so it must be even.  The workspace holds
    two count/offset/cursor spans, both directed adjacency spans, one BFS queue,
    and reuses the first count span as visited flags after indexing.
    """
    if vertex_count < 0:
        raise ValueError("graph vertex count must be nonnegative")
    if edge_entries < 0 or edge_entries % 2 != 0:
        raise ValueError("packed graph edges need endpoint pairs")
    return 7 * vertex_count + 2 + edge_entries


@native
def packed_graph_components(
    traversal: UInt64Buffer,
    component_offsets: UInt64Buffer,
    edges: UInt64Buffer,
    workspace: UInt64Buffer,
    vertex_count: uint64,
    edge_entries: uint64,
    directed: uint64,
) -> uint64:
    """Write exact BFS component order and return the component count.

    `edges` contains `(source, target)` pairs using insertion-order vertex
    indices. `traversal` has `vertex_count` entries and
    `component_offsets` has `vertex_count + 1` entries.  For a returned count
    `c`, component `i` occupies
    `traversal[component_offsets[i]:component_offsets[i + 1]]`.

    The required workspace length is
    `7 * vertex_count + 2 + edge_entries`.  Invalid shapes or endpoints return
    the impossible sentinel `vertex_count + 1` before any public output buffer
    is changed.  The host adapter translates that private status into its
    public error contract.
    """
    one: uint64 = 1
    if edge_entries != len(edges) or edge_entries % 2 != 0:
        return vertex_count + one
    if len(traversal) != vertex_count:
        return vertex_count + one
    if len(component_offsets) != vertex_count + 1:
        return vertex_count + one
    if len(workspace) != 7 * vertex_count + 2 + edge_entries:
        return vertex_count + one

    edge_index = 0
    while edge_index < edge_entries:
        if edges[edge_index] >= vertex_count or edges[edge_index + 1] >= vertex_count:
            return vertex_count + one
        edge_index += 2

    first_counts = 0
    second_counts = vertex_count
    first_offsets = 2 * vertex_count
    second_offsets = 3 * vertex_count + 1
    first_cursors = 4 * vertex_count + 2
    second_cursors = 5 * vertex_count + 2
    adjacency = 6 * vertex_count + 2
    queue = adjacency + edge_entries

    vertex = 0
    while vertex < vertex_count:
        workspace[first_counts + vertex] = 0
        workspace[second_counts + vertex] = 0
        vertex += 1

    edge_index = 0
    while edge_index < edge_entries:
        source = edges[edge_index]
        target = edges[edge_index + 1]
        workspace[first_counts + source] += 1
        if directed != 0:
            workspace[second_counts + target] += 1
        elif target != source:
            workspace[first_counts + target] += 1
        edge_index += 2

    workspace[first_offsets] = 0
    workspace[second_offsets] = 0
    vertex = 0
    while vertex < vertex_count:
        workspace[first_offsets + vertex + 1] = (
            workspace[first_offsets + vertex] + workspace[first_counts + vertex]
        )
        workspace[second_offsets + vertex + 1] = (
            workspace[second_offsets + vertex] + workspace[second_counts + vertex]
        )
        workspace[first_cursors + vertex] = workspace[first_offsets + vertex]
        workspace[second_cursors + vertex] = workspace[second_offsets + vertex]
        vertex += 1

    edge_index = 0
    while edge_index < edge_entries:
        source = edges[edge_index]
        target = edges[edge_index + 1]
        position = workspace[first_cursors + source]
        workspace[adjacency + position] = target
        workspace[first_cursors + source] = position + one
        if directed != 0:
            position = workspace[second_cursors + target]
            workspace[adjacency + edge_entries // 2 + position] = source
            workspace[second_cursors + target] = position + one
        elif target != source:
            position = workspace[first_cursors + target]
            workspace[adjacency + position] = source
            workspace[first_cursors + target] = position + one
        edge_index += 2

    # Counts are dead after the CSR index is built; reuse the first span as
    # visited flags so the host does not copy another vertex-sized buffer.
    vertex = 0
    while vertex < vertex_count:
        workspace[first_counts + vertex] = 0
        vertex += 1

    component_count: uint64 = 0
    traversal_count: uint64 = 0
    component_offsets[0] = 0
    source_vertex: uint64 = 0
    while source_vertex < vertex_count:
        if workspace[first_counts + source_vertex] == 0:
            workspace[first_counts + source_vertex] = one
            queue_head: uint64 = 0
            queue_tail: uint64 = 1
            workspace[queue] = source_vertex
            while queue_head < queue_tail:
                current = workspace[queue + queue_head]
                queue_head = queue_head + one
                traversal[traversal_count] = current
                traversal_count = traversal_count + one

                neighbor_index = workspace[first_offsets + current]
                neighbor_stop = workspace[first_offsets + current + 1]
                while neighbor_index < neighbor_stop:
                    neighbor = workspace[adjacency + neighbor_index]
                    if workspace[first_counts + neighbor] == 0:
                        workspace[first_counts + neighbor] = one
                        workspace[queue + queue_tail] = neighbor
                        queue_tail = queue_tail + one
                    neighbor_index = neighbor_index + one

                if directed != 0:
                    neighbor_index = workspace[second_offsets + current]
                    neighbor_stop = workspace[second_offsets + current + 1]
                    while neighbor_index < neighbor_stop:
                        neighbor = workspace[
                            adjacency + edge_entries // 2 + neighbor_index
                        ]
                        if workspace[first_counts + neighbor] == 0:
                            workspace[first_counts + neighbor] = one
                            workspace[queue + queue_tail] = neighbor
                            queue_tail = queue_tail + one
                        neighbor_index = neighbor_index + one

            component_count = component_count + one
            component_offsets[component_count] = traversal_count
        source_vertex = source_vertex + one
    return component_count


__all__ = ["graph_components_workspace_length", "packed_graph_components"]
