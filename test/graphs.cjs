"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

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
            "figure = graphs.PetersenGraph().plot().plotly()",
            "[grid.order(), grid.size(), ico.order(), ico.size(),",
            " dod.order(), dod.size(), len(figure.data),",
            " figure.data[1].type]",
          ].join("\n"),
        )
      ).repr,
      "[12, 17, 12, 30, 20, 30, 2, 'scatter']",
    );
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

