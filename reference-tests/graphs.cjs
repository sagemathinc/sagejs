"use strict";

// These are user-facing workflows, not private unit-test mocks.  Every source
// block runs unchanged in the Sage.js polyglot kernel, and each `covers` name
// receives the complete relevant workflow in the searchable reference manual.

function group(id, covers, source, want = "True", options = {}) {
  return {
    id: `sagejs-graph-reference:${id}`,
    owner: id,
    covers,
    line: 1,
    examples: [{
      id: `reference-tests/graphs.cjs:${id}`,
      line: 1,
      source: source.trim(),
      want,
      tags: [],
      ...options,
    }],
  };
}

module.exports = {
  schema: "sagejs.sage-doctests/v1",
  generatedBy: "reference-tests/graphs.cjs",
  source: {
    repository: "https://github.com/sagemathinc/sagejs",
    revision: "working-tree",
    path: "reference-tests/graphs.cjs",
    license: "GPL-3.0-only",
  },
  groups: [
    group(
      "mutable-graph-workflow",
      [
        "Graph.copy", "Graph.is_directed", "Graph.allows_loops",
        "Graph.allows_multiple_edges", "Graph.weighted", "Graph.graph_name",
        "Graph.get_pos", "Graph.set_pos", "Graph.has_vertex",
        "Graph.add_vertex", "Graph.add_vertices", "Graph.add_edge",
        "Graph.add_edges", "Graph.add_cycle", "Graph.add_path",
        "Graph.add_clique", "Graph.delete_edge", "Graph.delete_edges",
        "Graph.delete_vertex", "Graph.delete_vertices", "Graph.has_edge",
        "Graph.edge_label", "Graph.set_edge_label", "Graph.vertices",
        "Graph.vertex_iterator", "Graph.edges", "Graph.edge_iterator",
        "Graph.order", "Graph.num_verts", "Graph.size", "Graph.num_edges",
        "Graph.neighbors", "Graph.neighbors_in", "Graph.neighbors_out",
        "Graph.neighbor_iterator", "Graph.degree", "Graph.out_degree",
        "Graph.in_degree", "Graph.degree_sequence", "Graph.minimum_degree",
        "Graph.min_degree", "Graph.maximum_degree", "Graph.max_degree",
        "Graph.average_degree", "Graph.density", "Graph.breadth_first_search",
        "Graph.depth_first_search", "Graph.connected_components",
        "Graph.components", "Graph.connected_component_containing_vertex",
        "Graph.is_connected",
      ],
      `
G = Graph(loops=True, multiedges=True, weighted=True, name='mutable')
G.add_vertices(range(5))
G.add_path([0,1,2])
G.add_cycle([2,3,4])
G.add_clique([0,3,4])
G.add_edge(1,3,'old')
G.add_edges([])
G.set_edge_label(1,3,'new')
G.set_pos({0:[1,2]})
C = G.copy()
before = [C.order(), C.size(), C.degree_sequence(), C.graph_name(), C.get_pos()[0]]
walks = [list(C.breadth_first_search(0)), list(C.depth_first_search(0))]
inspection = [C.vertices(sort=True), list(C.vertex_iterator()), len(C.edges()), len(list(C.edge_iterator())), C.neighbors(1), list(C.neighbor_iterator(1))]
degrees = [C.degree(1), C.out_degree(1), C.in_degree(1), C.minimum_degree(), C.min_degree(), C.maximum_degree(), C.max_degree(), C.average_degree(), C.density()]
C.delete_edge(1,3,'new')
C.delete_edges([(0,1),(1,2)])
C.add_vertices([5,6])
C.delete_vertex(5)
C.delete_vertices([6])
all([not C.is_directed(), C.allows_loops(), C.allows_multiple_edges(), C.weighted(), C.has_vertex(4), not C.has_edge(1,3), G.has_edge(1,3,'new'), G.edge_label(1,3)==['new'], G.neighbors_in(1)==[0,2,3], G.neighbors_out(1)==[0,2,3], before==[5,9,[5,4,3,3,3],'mutable',[1,2]], walks==[[0,1,3,4,2],[0,1,2,3,4]], inspection==[[0,1,2,3,4],[0,1,2,3,4],9,9,[0,2,3],[0,2,3]], degrees==[3,3,3,3,3,5,5,3.6,0.9], C.order()==5, C.size()==6, G.size()==9, G.connected_components()==[[0,1,3,4,2]], G.components()==[[0,1,3,4,2]], G.connected_component_containing_vertex(4)==[0,1,3,4,2], G.is_connected()])
      `,
    ),
    group(
      "structural-algorithms-workflow",
      [
        "Graph.shortest_path", "Graph.distance", "Graph.distances_all_pairs",
        "Graph.eccentricity", "Graph.diameter", "Graph.radius", "Graph.center",
        "Graph.is_tree", "Graph.is_forest", "Graph.girth",
        "Graph.is_eulerian", "Graph.is_regular", "Graph.is_bipartite",
        "Graph.has_loops", "Graph.loop_edges", "Graph.complement",
        "Graph.subgraph", "Graph.spanning_tree", "Graph.min_spanning_tree",
        "Graph.bridges", "Graph.to_directed", "Graph.to_undirected",
        "Graph.cartesian_product", "Graph.adjacency_matrix",
      ],
      `
P = graphs.PathGraph(4)
C = graphs.CycleGraph(4)
L = Graph(loops=True); L.add_edge(0,0,'loop')
D = P.to_directed(); U = D.to_undirected()
A = P.adjacency_matrix()
bipartite, colors = C.is_bipartite(certificate=True)
all([P.shortest_path(0,3)==[0,1,2,3], P.distance(0,3)==3, P.distances_all_pairs()[0][3]==3, P.eccentricity(0)==3, P.eccentricity()==[3,2,2,3], P.diameter()==3, P.radius()==2, P.center()==[1,2], P.is_tree(), P.is_forest(), C.girth()==4, C.is_eulerian(), C.is_regular(2), bipartite, colors[0]!=colors[1], L.has_loops(), L.loop_edges()==[(0,0,'loop')], P.complement().size()==3, P.subgraph([0,1,2]).size()==2, C.spanning_tree().is_tree(), C.min_spanning_tree().size()==3, len(P.bridges(labels=False))==3, D.is_directed(), U.is_isomorphic(P), graphs.PathGraph(2).cartesian_product(graphs.PathGraph(3)).size()==7, A.nrows()==4])
      `,
    ),
    group(
      "isomorphism-and-optimization-workflow",
      [
        "Graph.is_isomorphic", "Graph.automorphism_group",
        "Graph.canonical_label", "Graph.graph6_string", "Graph.sparse6_string",
        "Graph.relabel", "Graph.clique_maximum", "Graph.maximum_clique",
        "Graph.clique_number", "Graph.independent_set", "Graph.vertex_cover",
        "Graph.coloring", "Graph.chromatic_number", "GraphAutomorphism.dict",
        "GraphAutomorphismGroup.order", "GraphAutomorphismGroup.cardinality",
        "GraphAutomorphismGroup.list", "GraphAutomorphismGroup.gens",
      ],
      `
G = graphs.PetersenGraph()
H = G.relabel({i:(7*i)%10 for i in range(10)}, inplace=False)
isomorphic, certificate = G.is_isomorphic(H, certificate=True)
canonical, relabeling = G.canonical_label(certificate=True)
group = G.automorphism_group()
generator = group.gens()[0]
K = graphs.CompleteGraph(4); C = graphs.CycleGraph(4)
all([isomorphic, len(certificate)==10, canonical.is_isomorphic(G), len(relabeling)==10, Graph(G.graph6_string()).is_isomorphic(G), Graph(G.sparse6_string()).is_isomorphic(G), group.order()==120, group.cardinality()==120, len(group.list())==120, len(group.gens())>=1, len(generator.dict())==10, sorted(K.clique_maximum())==[0,1,2,3], sorted(K.maximum_clique())==[0,1,2,3], K.clique_number()==4, len(C.independent_set())==2, len(C.vertex_cover())==2, len(C.coloring())==2, C.chromatic_number()==2])
      `,
    ),
    group(
      "graph-layout-and-plotting-workflow",
      [
        "Graph.layout", "Graph.graphplot", "Graph.plot", "Graph.show",
        "GraphPlot.plotly", "GraphPlot.plot", "GraphPlot.show",
      ],
      `
G = graphs.PetersenGraph()
positions = G.layout('spring')
graph_plot = G.graphplot(vertex_size=30)
graphics = graph_plot.plot()
changed = graph_plot.show(title='Petersen')
all([len(positions)==10, len(graph_plot.plotly().data)==2, len(graphics.plotly().data)==2, changed.plotly().layout.title=='Petersen', len(G.plot().plotly().data)==2, len(G.show().plotly().data)==2])
      `,
    ),
    group(
      "petersen-plot-preview",
      ["Graph.plot", "Graph.show", "GraphPlot.plot", "GraphPlot.plotly"],
      "graphs.PetersenGraph().plot()",
      "Graphics object consisting of 2 graphics primitives",
      { captureDisplay: true },
    ),
    group(
      "directed-graph-workflow",
      [
        "DiGraph.reverse", "DiGraph.topological_sort",
        "DiGraph.is_directed_acyclic", "DiGraph.is_dag",
        "DiGraph.strongly_connected_components",
      ],
      `
D = DiGraph([(0,1),(1,2),(0,2)])
R = D.reverse()
S = digraphs.Circuit(4)
all([D.topological_sort()==[0,1,2], D.is_directed_acyclic(), D.is_dag(), R.shortest_path(2,0)==[2,0], len(S.strongly_connected_components())==1, sorted(S.strongly_connected_components()[0])==[0,1,2,3]])
      `,
    ),
    group(
      "named-graph-generators-workflow",
      [
        "graphs.EmptyGraph", "graphs.CompleteGraph",
        "graphs.CompleteBipartiteGraph", "graphs.PathGraph",
        "graphs.CycleGraph", "graphs.StarGraph", "graphs.WheelGraph",
        "graphs.Grid2dGraph", "graphs.GeneralizedPetersenGraph",
        "graphs.PetersenGraph", "graphs.HouseGraph", "graphs.BullGraph",
        "graphs.DiamondGraph", "graphs.TetrahedralGraph",
        "graphs.HexahedralGraph", "graphs.OctahedralGraph",
        "graphs.IcosahedralGraph", "graphs.DodecahedralGraph",
        "graphs.RandomGNP", "digraphs.Path", "digraphs.Circuit",
        "digraphs.Complete",
      ],
      `
values = [graphs.EmptyGraph().order(), graphs.CompleteGraph(4).size(), graphs.CompleteBipartiteGraph(2,3).size(), graphs.PathGraph(4).size(), graphs.CycleGraph(4).size(), graphs.StarGraph(4).size(), graphs.WheelGraph(5).size(), graphs.Grid2dGraph(2,3).size(), graphs.GeneralizedPetersenGraph(5,2).size(), graphs.PetersenGraph().size(), graphs.HouseGraph().size(), graphs.BullGraph().size(), graphs.DiamondGraph().size(), graphs.TetrahedralGraph().size(), graphs.HexahedralGraph().size(), graphs.OctahedralGraph().size(), graphs.IcosahedralGraph().size(), graphs.DodecahedralGraph().size(), graphs.RandomGNP(5,0).size(), digraphs.Path(4).size(), digraphs.Circuit(4).size(), digraphs.Complete(4).size()]
values == [0,6,6,3,4,4,8,7,15,15,6,5,5,6,12,12,30,30,0,3,4,12]
      `,
    ),
    group(
      "graph-database-workflow",
      [
        "GraphQuery.query_iterator", "GraphQuery.list",
        "GraphQuery.get_graphs_list", "GraphQuery.count",
        "GraphDatabase.query", "GraphDatabase.graphs",
        "GraphDatabase.count", "GraphDatabase.close",
      ],
      `
database = GraphDatabase()
query = database.query(num_vertices=3, limit=2)
result = all([len(list(query.query_iterator()))==2, len(query.list())==2, len(query.get_graphs_list())==2, query.count()==2, database.count(num_vertices=3)==4, len(database.graphs(num_vertices=2))==2])
database.close()
result
      `,
    ),
  ],
};

module.exports.summary = {
  groups: module.exports.groups.length,
  examples: module.exports.groups.reduce(
    (total, item) => total + item.examples.length, 0,
  ),
};
