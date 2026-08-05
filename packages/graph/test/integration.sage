P = graphs.PetersenGraph()
H = P.relabel({i: (7*i) % 10 for i in range(10)}, inplace=False)

# These bounds distinguish compact Bliss generators from the exact portable
# fallback, which deliberately enumerates every automorphism.
A = P.automorphism_group()
assert A.order() == 120
assert len(A.gens()) <= 4
assert len(A.list()) == 120
assert len(list(A)) == 120
assert P.is_isomorphic(H)
assert P.canonical_label().graph6_string() == H.canonical_label().graph6_string()

for graph, order in [(graphs.CycleGraph(10), 20),
                     (graphs.CompleteGraph(6), 720)]:
    group = graph.automorphism_group()
    assert group.order() == order
    assert len(group.list()) == order

# The igraph dispatcher preserves loops and multiplicity for boolean
# isomorphism, while canonical forms stay on the readable simple-graph guard.
loop = Graph(loops=True)
loop.add_vertices([0, 1])
loop.add_edge(0, 0)
plain = Graph(2)
assert not loop.is_isomorphic(plain)

for algorithm in ['spring', 'kamada_kawai', 'circle', 'grid']:
    positions = P.layout(algorithm)
    assert len(positions) == 10
    assert all([len(positions[v]) == 2 for v in P])

print('igraph integration passed')
