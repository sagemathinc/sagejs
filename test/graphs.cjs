"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const coveredGraphApi = new Set();

function cover(className, names) {
  for (const name of names) coveredGraphApi.add(`${className}.${name}`);
}

function implementedGraphApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "baselib", "graphs.py"),
    "utf8",
  );
  const classes = new Set([
    "GraphAutomorphism",
    "GraphAutomorphismGroup",
    "GraphPlot",
    "GenericGraph",
    "DiGraph",
    "GraphGenerators",
    "DigraphGenerators",
    "GraphQuery",
    "GraphDatabase",
  ]);
  const answer = new Set();
  let currentClass;
  for (const line of source.split("\n")) {
    const classMatch = line.match(/^class ([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (classMatch) {
      currentClass = classes.has(classMatch[1]) ? classMatch[1] : undefined;
      continue;
    }
    if (!currentClass) continue;
    if (line && !/^\s/.test(line)) {
      currentClass = undefined;
      continue;
    }
    const methodMatch = line.match(/^    def ([A-Za-z][A-Za-z0-9_]*)\s*\(/);
    if (methodMatch) {
      answer.add(`${currentClass}.${methodMatch[1]}`);
      continue;
    }
    const aliasMatch = line.match(
      /^    ([A-Za-z][A-Za-z0-9_]*)\s*=\s*[A-Za-z_][A-Za-z0-9_]*\s*$/,
    );
    if (aliasMatch && aliasMatch[1] !== "toString") {
      answer.add(`${currentClass}.${aliasMatch[1]}`);
    }
  }
  return [...answer].sort();
}

async function withSage(callback) {
  const session = await createSage();
  try {
    await callback(session);
  } finally {
    await session.close();
  }
}

test("graph constructors, mutation, traversal, and structural algorithms", async () => {
  await withSage(async (session) => {
    const result = await session.evaluate(
      [
        "G = Graph([(0,1,'a'), (1,2,'b'), (2,3,'c'), (3,0,'d')])",
        "G.add_vertex(4)",
        "G.add_edge(3,4,'tail')",
        "[G.order(), G.size(), G.degree_sequence(), G.is_connected(),",
        " G.shortest_path(0,4), list(G.breadth_first_search(0)),",
        " G.girth(), G.is_tree(), G.bridges(labels=False)]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[5, 5, [3, 2, 2, 2, 1], True, [0, 3, 4], " +
        "[0, 1, 3, 2, 4], 4, False, [(3, 4)]]",
    );

    assert.equal(
      (
        await session.evaluate(
          [
            "M = Graph(loops=True, multiedges=True)",
            "M.add_edges([(0,0,'loop'), (0,1,'x'), (0,1,'y')])",
            "[M.degree(0), M.size(), M.has_loops(), M.edge_label(0,1)]",
          ].join("\n"),
        )
      ).repr,
      "[4, 3, True, ['x', 'y']]",
    );
  });
});

test("directed graph algorithms and conversions", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await session.evaluate(
          [
            "D = DiGraph([(0,1), (1,2), (0,2)])",
            "R = D.reverse()",
            "[D.topological_sort(), D.is_directed_acyclic(),",
            " R.shortest_path(2,0), D.strongly_connected_components(),",
            " D.to_undirected().edges(labels=False, sort=True)]",
          ].join("\n"),
        )
      ).repr,
      "[[0, 1, 2], True, [2, 0], [[0], [1], [2]], " +
        "[(0, 1), (0, 2), (1, 2)]]",
    );
  });
});

test("named graphs, exact isomorphism, canonical labels, and serialization", async () => {
  await withSage(async (session) => {
    const result = await session.evaluate(
      [
        "G = graphs.PetersenGraph()",
        "H = G.relabel({i:(7*i)%10 for i in range(10)}, inplace=False)",
        "iso, cert = G.is_isomorphic(H, certificate=True)",
        "C1 = G.canonical_label().graph6_string()",
        "C2 = H.canonical_label().graph6_string()",
        "[G.graph6_string(), Graph(G.graph6_string()).is_isomorphic(G),",
        " Graph(G.sparse6_string()).is_isomorphic(G), iso, len(cert),",
        " C1 == C2, G.automorphism_group().order(), G.girth(),",
        " G.chromatic_number(), G.clique_number()]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "['IheA@GUAo', True, True, True, 10, True, 120, 5, 3, 2]",
    );
  });
});

test("generators and graph-specific Plotly rendering", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await session.evaluate(
          [
            "grid = graphs.Grid2dGraph(3,4)",
            "ico = graphs.IcosahedralGraph()",
            "dod = graphs.DodecahedralGraph()",
            "petersen = graphs.PetersenGraph()",
            "figure = graphs.PetersenGraph().plot().plotly()",
            "[grid.order(), grid.size(), ico.order(), ico.size(),",
            " dod.order(), dod.size(), len(figure.data),",
            " figure.data[1].type, grid.get_pos()[(2,3)],",
            " petersen.get_pos()[0], petersen.get_pos()[5],",
            " graphs.CompleteBipartiteGraph(1,3).get_pos()[0],",
            " graphs.HouseGraph().get_pos()[4]]",
          ].join("\n"),
        )
      ).repr,
      "[12, 17, 12, 30, 20, 30, 2, 'scatter', (3, -2), " +
        "[0.0, 1], [0.0, 0.5], [1.5, 1.0], [0, 2]]",
    );
  });
});

test("interactive graphs are self-contained draggable SVG", async () => {
  await withSage(async (session) => {
    const result = await session.evaluate(
      "graphs.PetersenGraph().show(interactive=True)",
    );
    assert.equal(result.display?.mime, "text/html");
    assert.match(result.display?.data, /<svg/);
    assert.match(result.display?.data, /pointermove/);
    assert.match(result.display?.data, /data-source=/);
    assert.doesNotMatch(result.display?.data, /https?:\/\//);
  });
});

test("bundled Sage graph database and historical import paths", async () => {
  await withSage(async (session) => {
    const result = await session.evaluate(
      [
        "from sage.graphs.graph import Graph as ImportedGraph",
        "from sage.graphs.graph_database import GraphDatabase as ImportedDB",
        "D = ImportedDB()",
        "regular = D.graphs(num_vertices=4, regular=True)",
        "[D.count(), D.count(num_vertices=7), len(regular),",
        " [G.degree_sequence() for G in regular],",
        " ImportedGraph([(0,1)]).size()]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[1252, 1044, 4, [[0, 0, 0, 0], [1, 1, 1, 1], " +
        "[2, 2, 2, 2], [3, 3, 3, 3]], 1]",
    );
  });
});

test("every mutable graph operation has a semantic smoke test", async () => {
  cover("GenericGraph", [
    "copy", "is_directed", "allows_loops", "allows_multiple_edges",
    "weighted", "graph_name", "get_pos", "set_pos", "has_vertex",
    "add_vertex", "add_vertices", "add_edge", "add_edges", "add_cycle",
    "add_path", "add_clique", "delete_edge", "delete_edges",
    "delete_vertex", "delete_vertices", "has_edge", "edge_label",
    "set_edge_label", "vertices", "vertex_iterator", "edges",
    "edge_iterator", "order", "num_verts", "size", "num_edges",
    "neighbors", "neighbors_in", "neighbors_out", "neighbor_iterator",
    "degree", "out_degree", "in_degree", "degree_sequence",
    "minimum_degree", "min_degree", "maximum_degree", "max_degree",
    "average_degree", "density", "breadth_first_search",
    "depth_first_search", "connected_components", "components",
    "connected_component_containing_vertex", "is_connected",
  ]);
  await withSage(async (session) => {
    const result = await session.evaluate(
      [
        "G = Graph(loops=True, multiedges=True, weighted=True, name='mutable')",
        "G.add_vertex(0)",
        "G.add_vertices([1,2,3,4])",
        "G.add_path([0,1,2])",
        "G.add_cycle([2,3,4])",
        "G.add_clique([0,3,4])",
        "G.add_edge(1,3,'old')",
        "G.add_edges([])",
        "G.set_edge_label(1,3,'new')",
        "G.set_pos({0:[1,2]})",
        "C = G.copy()",
        "checks = [",
        " not C.is_directed(), C.allows_loops(), C.allows_multiple_edges(),",
        " C.weighted(), C.graph_name() == 'mutable',",
        " C.get_pos()[0] == [1,2], C.has_vertex(4),",
        " C.has_edge(1,3,'new'), C.edge_label(1,3) == ['new'],",
        " C.vertices(sort=True) == [0,1,2,3,4],",
        " list(C.vertex_iterator()) == [0,1,2,3,4],",
        " len(C.edges()) == 9, len(list(C.edge_iterator())) == 9,",
        " C.order() == 5, C.num_verts() == 5,",
        " C.size() == 9, C.num_edges() == 9,",
        " C.neighbors(1) == [0,2,3], C.neighbors_in(1) == [0,2,3],",
        " C.neighbors_out(1) == [0,2,3],",
        " list(C.neighbor_iterator(1)) == [0,2,3],",
        " C.degree(1) == 3, C.out_degree(1) == 3, C.in_degree(1) == 3,",
        " C.degree_sequence() == [5,4,3,3,3],",
        " C.minimum_degree() == 3, C.min_degree() == 3,",
        " C.maximum_degree() == 5, C.max_degree() == 5,",
        " C.average_degree() == 3.6, abs(C.density() - 0.9) < 1e-12,",
        " list(C.breadth_first_search(0)) == [0,1,3,4,2],",
        " list(C.depth_first_search(0)) == [0,1,2,3,4],",
        " C.connected_components() == [[0,1,3,4,2]],",
        " C.components() == [[0,1,3,4,2]],",
        " C.connected_component_containing_vertex(4) == [0,1,3,4,2],",
        " C.is_connected()]",
        "C.delete_edge(1,3,'new')",
        "C.delete_edges([(0,1),(1,2)])",
        "C.add_vertices([5,6])",
        "C.delete_vertex(5)",
        "C.delete_vertices([6])",
        "checks += [C.order() == 5, C.size() == 6,",
        " not C.has_edge(1,3), G.has_edge(1,3,'new'), G.size() == 9]",
        "all(checks)",
      ].join("\n"),
    );
    assert.equal(result.repr, "True");
  });
});

test("every structural and optimization graph operation has a semantic smoke test", async () => {
  cover("GenericGraph", [
    "shortest_path", "distance", "distances_all_pairs", "eccentricity",
    "diameter", "radius", "center", "is_tree", "is_forest", "girth",
    "is_eulerian", "is_regular", "is_bipartite", "has_loops",
    "loop_edges", "complement", "subgraph", "spanning_tree",
    "min_spanning_tree", "bridges", "to_directed", "to_undirected",
    "cartesian_product", "adjacency_matrix", "is_isomorphic",
    "automorphism_group", "canonical_label", "graph6_string",
    "sparse6_string", "relabel", "clique_maximum", "maximum_clique",
    "clique_number", "independent_set", "vertex_cover", "coloring",
    "chromatic_number", "layout", "graphplot", "plot", "show",
  ]);
  cover("GraphPlot", ["plotly", "plot", "show"]);
  await withSage(async (session) => {
    const result = await session.evaluate(
      [
        "P = graphs.PathGraph(4)",
        "C = graphs.CycleGraph(4)",
        "K = graphs.CompleteGraph(4)",
        "L = Graph(loops=True)",
        "L.add_edge(0,0,'loop')",
        "bipartite_data = C.is_bipartite(certificate=True)",
        "bipartite = bipartite_data[0]",
        "bipartite_colors = bipartite_data[1]",
        "D = P.to_directed()",
        "U = D.to_undirected()",
        "product = graphs.PathGraph(2).cartesian_product(graphs.PathGraph(3))",
        "A = P.adjacency_matrix()",
        "R = P.relabel({0:'a',1:'b',2:'c',3:'d'}, inplace=False)",
        "canonical = P.canonical_label()",
        "group = P.automorphism_group()",
        "coloring = C.coloring()",
        "graph_plot = P.plot(title='path')",
        "shown_plot = P.show(vertex_size=20)",
        "spring_layout = P.layout('spring')",
        "left_vertex = ('left',1)",
        "right_vertex = ('right',2)",
        "T = Graph([(left_vertex,right_vertex)])",
        "tuple_iso = T.is_isomorphic(T, certificate=True)",
        "tuple_canonical = T.canonical_label(certificate=True)",
        "tuple_bipartite = T.is_bipartite(certificate=True)",
        "odd_bipartite = graphs.CycleGraph(3).is_bipartite(certificate=True)",
        "checks = [",
        " P.shortest_path(0,3) == [0,1,2,3], P.distance(0,3) == 3,",
        " P.distances_all_pairs()[0][3] == 3, P.eccentricity(0) == 3,",
        " P.eccentricity() == [3,2,2,3], P.diameter() == 3,",
        " P.radius() == 2, P.center() == [1,2], P.is_tree(), P.is_forest(),",
        " C.girth() == 4, C.is_eulerian(), C.is_regular(2), bipartite,",
        " len(bipartite_colors) == 4,",
        " bipartite_colors[0] != bipartite_colors[1],",
        " L.has_loops(), L.loop_edges() == [(0,0,'loop')],",
        " P.complement().size() == 3, P.subgraph([0,1,2]).size() == 2,",
        " C.spanning_tree().is_tree(), C.min_spanning_tree().size() == 3,",
        " len(P.bridges(labels=False)) == 3, D.is_directed(), D.size() == 6,",
        " U.is_isomorphic(P), product.order() == 6, product.size() == 7,",
        " A.nrows() == 4, A.ncols() == 4, P.is_isomorphic(R),",
        " group.order() == 2, canonical.is_isomorphic(P),",
        " len(spring_layout) == 4, all([v in spring_layout for v in P]),",
        " Graph(P.graph6_string()).is_isomorphic(P),",
        " Graph(P.sparse6_string()).is_isomorphic(P),",
        " R.vertices() == ['a','b','c','d'],",
        " sorted(K.clique_maximum()) == [0,1,2,3],",
        " sorted(K.maximum_clique()) == [0,1,2,3], K.clique_number() == 4,",
        " len(C.independent_set()) == 2, len(C.vertex_cover()) == 2,",
        " len(coloring) == 2, C.chromatic_number() == 2,",
        " len(graph_plot.plotly().data) == 2,",
        " graph_plot.show(title='changed').plotly().layout.title.text == 'changed',",
        " len(shown_plot.plotly().data) == 2,",
        " len(plot(P).plotly().data) == 2,",
        " tuple_iso[1][left_vertex] == left_vertex,",
        " tuple_canonical[1][left_vertex] in [0,1],",
        " tuple_bipartite[1][left_vertex] != tuple_bipartite[1][right_vertex],",
        " not odd_bipartite[0], len(odd_bipartite[1]) == 3]",
        "all(checks)",
      ].join("\n"),
    );
    assert.equal(result.repr, "True");
  });
});

test("every named graph and digraph generator has a semantic smoke test", async () => {
  cover("GraphGenerators", [
    "EmptyGraph", "CompleteGraph", "CompleteBipartiteGraph", "PathGraph",
    "CycleGraph", "StarGraph", "WheelGraph", "Grid2dGraph",
    "GeneralizedPetersenGraph", "PetersenGraph", "HouseGraph", "BullGraph",
    "DiamondGraph", "TetrahedralGraph", "HexahedralGraph",
    "OctahedralGraph", "IcosahedralGraph", "DodecahedralGraph", "RandomGNP",
  ]);
  cover("DigraphGenerators", ["Path", "Circuit", "Complete"]);
  await withSage(async (session) => {
    const result = await session.evaluate(
      [
        "values = [",
        " graphs.EmptyGraph().order(), graphs.CompleteGraph(4).size(),",
        " graphs.CompleteBipartiteGraph(2,3).size(), graphs.PathGraph(4).size(),",
        " graphs.CycleGraph(4).size(), graphs.StarGraph(4).size(),",
        " graphs.WheelGraph(5).size(), graphs.Grid2dGraph(2,3).size(),",
        " graphs.GeneralizedPetersenGraph(5,2).size(),",
        " graphs.PetersenGraph().size(), graphs.HouseGraph().size(),",
        " graphs.BullGraph().size(), graphs.DiamondGraph().size(),",
        " graphs.TetrahedralGraph().size(), graphs.HexahedralGraph().size(),",
        " graphs.OctahedralGraph().size(),",
        " graphs.IcosahedralGraph().size(), graphs.DodecahedralGraph().size(),",
        " graphs.RandomGNP(5,0.0).size(), digraphs.Path(4).size(),",
        " digraphs.Circuit(4).size(), digraphs.Complete(4).size()]",
        "values",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[0, 6, 6, 3, 4, 4, 8, 7, 15, 15, 6, 5, 5, 6, 12, 12, " +
        "30, 30, 0, 3, 4, 12]",
    );
  });
});

test("directed, automorphism, plotting, and database helper APIs are covered", async () => {
  cover("DiGraph", [
    "reverse", "topological_sort", "is_directed_acyclic", "is_dag",
    "strongly_connected_components",
  ]);
  cover("GraphAutomorphism", ["dict"]);
  cover("GraphAutomorphismGroup", ["order", "cardinality", "list", "gens"]);
  cover("GraphDatabase", ["query", "graphs", "count", "close"]);
  cover("GraphQuery", ["query_iterator", "list", "get_graphs_list", "count"]);
  await withSage(async (session) => {
    const result = await session.evaluate(
      [
        "D = digraphs.Path(4)",
        "R = D.reverse()",
        "S = digraphs.Circuit(4)",
        "A = graphs.PathGraph(3).automorphism_group()",
        "permutation = A.gens()[0]",
        "database = GraphDatabase()",
        "query = database.query(num_vertices=3, limit=2)",
        "via_iterator = list(query.query_iterator())",
        "via_list = query.list()",
        "via_alias = query.get_graphs_list()",
        "checks = [",
        " D.topological_sort() == [0,1,2,3], D.is_directed_acyclic(), D.is_dag(),",
        " R.shortest_path(3,0) == [3,2,1,0],",
        " len(S.strongly_connected_components()) == 1,",
        " A.order() == 2, A.cardinality() == 2, len(A.list()) == 2,",
        " len(A.gens()) >= 1, len(permutation.dict()) == 3,",
        " permutation(permutation(0)) == 0,",
        " len(via_iterator) == 2, len(via_list) == 2, len(via_alias) == 2,",
        " query.count() == 2, database.count(num_vertices=3) == 4,",
        " len(database.graphs(num_vertices=2)) == 2]",
        "database.close()",
        "all(checks)",
      ].join("\n"),
    );
    assert.equal(result.repr, "True");
  });
});

test("generic plot dispatch and shortest-path call errors match Sage", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await session.evaluate(
          "g=graphs.CompleteBipartiteGraph(5,7); " +
            "[repr(plot(g)), len(plot(g).plotly().data), " +
            "repr(plot(graphs.PetersenGraph()))]",
        )
      ).repr,
      "['Graphics object consisting of 2 graphics primitives', 2, " +
        "'Graphics object consisting of 2 graphics primitives']",
    );
    assert.equal(
      (
        await session.evaluate(
          "g=graphs.PetersenGraph(); [repr(g.graphplot()), " +
            "repr(graphics_array([[g.plot(), g.plot()]]))]",
        )
      ).repr,
      "['GraphPlot object for Petersen graph: Graph on 10 vertices', " +
        "'Graphics Array of size 1 x 2']",
    );
    await assert.rejects(
      session.evaluate("graphs.PetersenGraph().shortest_path()"),
      /missing 2 required positional arguments: 'u' and 'v'/,
    );
    await assert.rejects(
      session.evaluate("graphs.PetersenGraph().shortest_path(0)"),
      /missing 1 required positional argument: 'v'/,
    );
    await assert.rejects(
      session.evaluate("graphs.PetersenGraph().shortest_path(0,99)"),
      /vertex '99' is not in the \(di\)graph/,
    );
  });
});

test.after(() => {
  assert.deepEqual(
    [...coveredGraphApi].sort(),
    implementedGraphApi(),
    "every public function defined by the graph module must be assigned to an executable semantic test",
  );
});
