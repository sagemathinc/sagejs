"""Generated graph documentation data; do not edit manually.

Regenerate with scripts/import-sage-graph-reference.py.
"""

from __future__ import annotations

_GRAPH_REFERENCE_RECORDS = [
  {
    "owner": "DiGraph",
    "attribute": "is_dag",
    "name": "DiGraph.is_dag",
    "signature": "is_dag() -> bool",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `is_dag` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "DiGraph",
    "attribute": "is_directed_acyclic",
    "name": "DiGraph.is_directed_acyclic",
    "signature": "is_directed_acyclic() -> bool",
    "module": "sage.graphs.digraph",
    "doc": "Check whether the digraph is acyclic or not.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:998",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L998",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "DiGraph",
    "attribute": "reverse",
    "name": "DiGraph.reverse",
    "signature": "reverse() -> DiGraph",
    "module": "sage.graphs.digraph",
    "doc": "Return a copy of digraph with edges reversed in direction.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:1859",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1859",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "DiGraph",
    "attribute": "strongly_connected_components",
    "name": "DiGraph.strongly_connected_components",
    "signature": "strongly_connected_components() -> list[list[Any]]",
    "module": "sage.graphs",
    "doc": "Return the strongly connected components.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "DiGraph",
    "attribute": "topological_sort",
    "name": "DiGraph.topological_sort",
    "signature": "topological_sort(**_options: Any) -> list[Any]",
    "module": "sage.graphs.digraph",
    "doc": "Return a topological sort of the digraph if it is acyclic.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:2877",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2877",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "add_clique",
    "name": "Graph.add_clique",
    "signature": "add_clique(vertices: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Add a clique to the graph with the given vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:19673",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19673",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "add_cycle",
    "name": "Graph.add_cycle",
    "signature": "add_cycle(vertices: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Add a cycle to the graph with the given vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:19771",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19771",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "add_edge",
    "name": "Graph.add_edge",
    "signature": "add_edge(*edge_data: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Add an edge from `u` to `v`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:12608",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12608",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "add_edges",
    "name": "Graph.add_edges",
    "signature": "add_edges(edges: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Add edges from an iterable container.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:12671",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12671",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "add_path",
    "name": "Graph.add_path",
    "signature": "add_path(vertices: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Add a path to the graph with the given vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:19837",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19837",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "add_vertex",
    "name": "Graph.add_vertex",
    "signature": "add_vertex(vertex: Any=None) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Create an isolated vertex.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:11647",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11647",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "add_vertices",
    "name": "Graph.add_vertices",
    "signature": "add_vertices(vertices: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Add vertices to the (di)graph from an iterable container of vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:11681",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11681",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "adjacency_matrix",
    "name": "Graph.adjacency_matrix",
    "signature": "adjacency_matrix(**_options: Any) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the adjacency matrix of the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:2269",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L2269",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "allows_loops",
    "name": "Graph.allows_loops",
    "signature": "allows_loops(value: Any=None) -> bool",
    "module": "sage.graphs.generic_graph",
    "doc": "Return whether loops are permitted in the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:3541",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L3541",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "allows_multiple_edges",
    "name": "Graph.allows_multiple_edges",
    "signature": "allows_multiple_edges(value: Any=None) -> bool",
    "module": "sage.graphs.generic_graph",
    "doc": "Return whether multiple edges are permitted in the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:3852",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L3852",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "automorphism_group",
    "name": "Graph.automorphism_group",
    "signature": "automorphism_group(edge_labels: bool=False, **_options: Any) -> GraphAutomorphismGroup",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the automorphism group of the graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:24638",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L24638",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "average_degree",
    "name": "Graph.average_degree",
    "signature": "average_degree() -> float",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the average degree of the graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:14052",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L14052",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "breadth_first_search",
    "name": "Graph.breadth_first_search",
    "signature": "breadth_first_search(start: Any, distance: Any=None, **_options: Any) -> Iterator[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return an iterator over the vertices in a breadth-first ordering.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:19274",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19274",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "bridges",
    "name": "Graph.bridges",
    "signature": "bridges(labels: bool=True) -> list[Any]",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `bridges` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "canonical_label",
    "name": "Graph.canonical_label",
    "signature": "canonical_label(partition: Any=None, certificate: bool=False, edge_labels: bool=False, **_options: Any) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the canonical graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:25481",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L25481",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "cartesian_product",
    "name": "Graph.cartesian_product",
    "signature": "cartesian_product(other: GenericGraph) -> GenericGraph",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the Cartesian product of `self` and `other`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:20251",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L20251",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "center",
    "name": "Graph.center",
    "signature": "center() -> list[Any]",
    "module": "sage.graphs.digraph",
    "doc": "Return the set of vertices in the center of the DiGraph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:2710",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2710",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "chromatic_number",
    "name": "Graph.chromatic_number",
    "signature": "chromatic_number(**options: Any) -> int",
    "module": "sage.graphs.graph",
    "doc": "Return the minimal number of colors needed to color the vertices of the graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph.py`:3443",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L3443",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "clique_maximum",
    "name": "Graph.clique_maximum",
    "signature": "clique_maximum(**_options: Any) -> list[Any]",
    "module": "sage.graphs.graph",
    "doc": "Return the vertex set of a maximal order complete subgraph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph.py`:6073",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L6073",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "clique_number",
    "name": "Graph.clique_number",
    "signature": "clique_number(**_options: Any) -> int",
    "module": "sage.graphs.graph",
    "doc": "Return the order of the largest clique of the graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph.py`:6158",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L6158",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "coloring",
    "name": "Graph.coloring",
    "signature": "coloring(hex_colors: bool=False, **_options: Any) -> Any",
    "module": "sage.graphs.graph",
    "doc": "Return the first (optimal) proper vertex-coloring found.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph.py`:3588",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L3588",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "complement",
    "name": "Graph.complement",
    "signature": "complement() -> GenericGraph",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the complement of the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:19884",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19884",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "components",
    "name": "Graph.components",
    "signature": "components(sort: bool=False) -> list[list[Any]]",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `components` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "connected_component_containing_vertex",
    "name": "Graph.connected_component_containing_vertex",
    "signature": "connected_component_containing_vertex(vertex: Any) -> list[Any]",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `connected_component_containing_vertex` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "connected_components",
    "name": "Graph.connected_components",
    "signature": "connected_components(sort: bool=False) -> list[list[Any]]",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `connected_components` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "copy",
    "name": "Graph.copy",
    "signature": "copy(immutable: bool=False) -> GenericGraph",
    "module": "sage.graphs.generic_graph",
    "doc": "Change the graph implementation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:1294",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L1294",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "degree",
    "name": "Graph.degree",
    "signature": "degree(vertex: Any=None) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the degree (in + out for digraphs) of a vertex or of vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:13980",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13980",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "degree_sequence",
    "name": "Graph.degree_sequence",
    "signature": "degree_sequence() -> list[int]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the degree sequence of this (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:14200",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L14200",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "delete_edge",
    "name": "Graph.delete_edge",
    "signature": "delete_edge(*edge_data: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Delete the edge from `u` to `v`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:12910",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12910",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "delete_edges",
    "name": "Graph.delete_edges",
    "signature": "delete_edges(edges: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Delete edges from an iterable container.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:12983",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12983",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "delete_vertex",
    "name": "Graph.delete_vertex",
    "signature": "delete_vertex(vertex: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Delete vertex, removing all incident edges.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:11719",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11719",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "delete_vertices",
    "name": "Graph.delete_vertices",
    "signature": "delete_vertices(vertices: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Delete vertices from the (di)graph taken from an iterable container of vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:11796",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11796",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "density",
    "name": "Graph.density",
    "signature": "density() -> float",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the density of the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:4524",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4524",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "depth_first_search",
    "name": "Graph.depth_first_search",
    "signature": "depth_first_search(start: Any, **_options: Any) -> Iterator[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return an iterator over the vertices in a depth-first ordering.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:19499",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19499",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "diameter",
    "name": "Graph.diameter",
    "signature": "diameter() -> Any",
    "module": "sage.graphs.digraph",
    "doc": "Return the diameter of the DiGraph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:2542",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2542",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "distance",
    "name": "Graph.distance",
    "signature": "distance(source_vertex: Any, target_vertex: Any, **_options: Any) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the (directed) distance from `u` to `v` in the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:16636",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L16636",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "distances_all_pairs",
    "name": "Graph.distances_all_pairs",
    "signature": "distances_all_pairs() -> dict[Any, dict[Any, Any]]",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `distances_all_pairs` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "eccentricity",
    "name": "Graph.eccentricity",
    "signature": "eccentricity(vertex: Any=None) -> Any",
    "module": "sage.graphs.digraph",
    "doc": "Return the eccentricity of vertex (or vertices) `v`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:2257",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2257",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "edge_iterator",
    "name": "Graph.edge_iterator",
    "signature": "edge_iterator(labels: bool=True, sort: bool=False, **_options: Any) -> list[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return an iterator over edges.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:13669",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13669",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "edge_label",
    "name": "Graph.edge_label",
    "signature": "edge_label(source_vertex: Any, target_vertex: Any) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the label of an edge.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:13804",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13804",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "edges",
    "name": "Graph.edges",
    "signature": "edges(labels: bool=True, sort: bool=False, **_options: Any) -> list[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return a `~EdgesView` of edges.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:13388",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13388",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "get_pos",
    "name": "Graph.get_pos",
    "signature": "get_pos() -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the position dictionary.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:4219",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4219",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "girth",
    "name": "Graph.girth",
    "signature": "girth() -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the girth of the graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:16869",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L16869",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "graph6_string",
    "name": "Graph.graph6_string",
    "signature": "graph6_string() -> str",
    "module": "sage.graphs.graph",
    "doc": "Return the graph6 representation of the graph as an ASCII string.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph.py`:1365",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L1365",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "graph_name",
    "name": "Graph.graph_name",
    "signature": "graph_name(value: Any=None) -> str",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `graph_name` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "graphplot",
    "name": "Graph.graphplot",
    "signature": "graphplot(**options: Any) -> GraphPlot",
    "module": "sage.graphs.generic_graph",
    "doc": "Return a `~sage.graphs.graph_plot.GraphPlot` object.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:22235",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L22235",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "has_edge",
    "name": "Graph.has_edge",
    "signature": "has_edge(source_vertex: Any, target_vertex: Any, label: Any=...) -> bool",
    "module": "sage.graphs.generic_graph",
    "doc": "Check whether `(u, v)` is an edge of the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:13355",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13355",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "has_loops",
    "name": "Graph.has_loops",
    "signature": "has_loops() -> bool",
    "module": "sage.graphs.generic_graph",
    "doc": "Return whether there are loops in the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:3497",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L3497",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "has_vertex",
    "name": "Graph.has_vertex",
    "signature": "has_vertex(vertex: Any) -> bool",
    "module": "sage.graphs.generic_graph",
    "doc": "Check if `vertex` is one of the vertices of this graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:11850",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11850",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "in_degree",
    "name": "Graph.in_degree",
    "signature": "in_degree(vertex: Any=None) -> Any",
    "module": "sage.graphs.digraph",
    "doc": "Same as degree, but for in degree.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:1374",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1374",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "independent_set",
    "name": "Graph.independent_set",
    "signature": "independent_set(**_options: Any) -> list[Any]",
    "module": "sage.graphs.graph",
    "doc": "Return a maximum independent set.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph.py`:6455",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L6455",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "is_bipartite",
    "name": "Graph.is_bipartite",
    "signature": "is_bipartite(certificate: bool=False) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Check whether the graph is bipartite.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:4565",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4565",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "is_connected",
    "name": "Graph.is_connected",
    "signature": "is_connected() -> bool",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `is_connected` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "is_directed",
    "name": "Graph.is_directed",
    "signature": "is_directed() -> bool",
    "module": "sage.graphs.digraph",
    "doc": "Since digraph is directed, return `True`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:985",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L985",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "is_eulerian",
    "name": "Graph.is_eulerian",
    "signature": "is_eulerian() -> bool",
    "module": "sage.graphs.generic_graph",
    "doc": "Check whether the graph is Eulerian.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:4687",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4687",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "is_forest",
    "name": "Graph.is_forest",
    "signature": "is_forest() -> bool",
    "module": "sage.graphs.graph",
    "doc": "Test if the graph is a forest, i.e. a disjoint union of trees.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph.py`:1706",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L1706",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "is_isomorphic",
    "name": "Graph.is_isomorphic",
    "signature": "is_isomorphic(other: Any, certificate: bool=False, edge_labels: bool=False, **_options: Any) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Test for isomorphism between `self` and `other`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:25152",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L25152",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "is_regular",
    "name": "Graph.is_regular",
    "signature": "is_regular(degree: Any=None) -> bool",
    "module": "sage.graphs.generic_graph",
    "doc": "Check whether this graph is (`k`-)regular.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:14229",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L14229",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "is_tree",
    "name": "Graph.is_tree",
    "signature": "is_tree() -> bool",
    "module": "sage.graphs.graph",
    "doc": "Test if the graph is a tree.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph.py`:1546",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L1546",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "layout",
    "name": "Graph.layout",
    "signature": "layout(layout: str | None=None, save_pos: bool=False, **_options: Any) -> dict[Any, Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return a layout for the vertices of this graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:21227",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L21227",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "loop_edges",
    "name": "Graph.loop_edges",
    "signature": "loop_edges(labels: bool=True) -> list[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return a list of all loops in the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:3638",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L3638",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "max_degree",
    "name": "Graph.max_degree",
    "signature": "max_degree() -> int",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `max_degree` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "maximum_clique",
    "name": "Graph.maximum_clique",
    "signature": "maximum_clique(**_options: Any) -> list[Any]",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `maximum_clique` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "maximum_degree",
    "name": "Graph.maximum_degree",
    "signature": "maximum_degree() -> int",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `maximum_degree` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "min_degree",
    "name": "Graph.min_degree",
    "signature": "min_degree() -> int",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `min_degree` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "min_spanning_tree",
    "name": "Graph.min_spanning_tree",
    "signature": "min_spanning_tree(starting_vertex: Any=None) -> GenericGraph",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the edges of a minimum spanning tree.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:4996",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4996",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "minimum_degree",
    "name": "Graph.minimum_degree",
    "signature": "minimum_degree() -> int",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `minimum_degree` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "neighbor_iterator",
    "name": "Graph.neighbor_iterator",
    "signature": "neighbor_iterator(vertex: Any) -> Iterator[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return an iterator over neighbors of `vertex`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:12290",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12290",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "neighbors",
    "name": "Graph.neighbors",
    "signature": "neighbors(vertex: Any) -> list[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return a list of neighbors (in and out if directed) of `vertex`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:12463",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12463",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "neighbors_in",
    "name": "Graph.neighbors_in",
    "signature": "neighbors_in(vertex: Any) -> list[Any]",
    "module": "sage.graphs.digraph",
    "doc": "Return the list of the in-neighbors of a given vertex.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:1304",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1304",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "neighbors_out",
    "name": "Graph.neighbors_out",
    "signature": "neighbors_out(vertex: Any) -> list[Any]",
    "module": "sage.graphs.digraph",
    "doc": "Return the list of the out-neighbors of a given vertex.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:1358",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1358",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "num_edges",
    "name": "Graph.num_edges",
    "signature": "num_edges() -> int",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `num_edges` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "num_verts",
    "name": "Graph.num_verts",
    "signature": "num_verts() -> int",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `num_verts` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "order",
    "name": "Graph.order",
    "signature": "order() -> int",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the number of vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:4799",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4799",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "out_degree",
    "name": "Graph.out_degree",
    "signature": "out_degree(vertex: Any=None) -> Any",
    "module": "sage.graphs.digraph",
    "doc": "Same as degree, but for out degree.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:1445",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1445",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "plot",
    "name": "Graph.plot",
    "signature": "plot(**options: Any) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Return a `~sage.plot.graphics.Graphics` object representing the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:22318",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L22318",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "radius",
    "name": "Graph.radius",
    "signature": "radius() -> Any",
    "module": "sage.graphs.digraph",
    "doc": "Return the radius of the DiGraph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:2474",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2474",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "relabel",
    "name": "Graph.relabel",
    "signature": "relabel(perm: Any=None, inplace: bool=True, **_options: Any) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Relabel the vertices of `self`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:24111",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L24111",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "set_edge_label",
    "name": "Graph.set_edge_label",
    "signature": "set_edge_label(source_vertex: Any, target_vertex: Any, label: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Set the edge label of a given edge.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:13260",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13260",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "set_pos",
    "name": "Graph.set_pos",
    "signature": "set_pos(pos: Any) -> None",
    "module": "sage.graphs.generic_graph",
    "doc": "Set the position dictionary.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:4340",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4340",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "shortest_path",
    "name": "Graph.shortest_path",
    "signature": "shortest_path(u: Any, v: Any, **_options: Any) -> list[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return a list of vertices representing some shortest path from `u` to `v`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:17687",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L17687",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "show",
    "name": "Graph.show",
    "signature": "show(**options: Any) -> Any",
    "module": "sage.graphs.generic_graph",
    "doc": "Show the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:22646",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L22646",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "size",
    "name": "Graph.size",
    "signature": "size() -> int",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the number of edges.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:4827",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4827",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "spanning_tree",
    "name": "Graph.spanning_tree",
    "signature": "spanning_tree(starting_vertex: Any=None) -> GenericGraph",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `spanning_tree` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "sparse6_string",
    "name": "Graph.sparse6_string",
    "signature": "sparse6_string() -> str",
    "module": "sage.graphs.graph",
    "doc": "Return the sparse6 representation of the graph as an ASCII string.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph.py`:1403",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L1403",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "subgraph",
    "name": "Graph.subgraph",
    "signature": "subgraph(vertices: Any=None, edges: Any=None, **_options: Any) -> GenericGraph",
    "module": "sage.graphs.generic_graph",
    "doc": "Return the subgraph containing the given vertices and edges.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:14273",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L14273",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "to_directed",
    "name": "Graph.to_directed",
    "signature": "to_directed() -> DiGraph",
    "module": "sage.graphs.digraph",
    "doc": "Since the graph is already directed, simply returns a copy of itself.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph.py`:1083",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1083",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "to_undirected",
    "name": "Graph.to_undirected",
    "signature": "to_undirected() -> Graph",
    "module": "sage.graphs.bipartite_graph",
    "doc": "Return an undirected Graph (without bipartite constraint) of the given object.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/bipartite_graph.py`:1660",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/bipartite_graph.py#L1660",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "vertex_cover",
    "name": "Graph.vertex_cover",
    "signature": "vertex_cover(**_options: Any) -> list[Any]",
    "module": "sage.graphs.bipartite_graph",
    "doc": "Return a minimum vertex cover of `self` represented by a set of vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/bipartite_graph.py`:2556",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/bipartite_graph.py#L2556",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "vertex_iterator",
    "name": "Graph.vertex_iterator",
    "signature": "vertex_iterator(sort: bool=False, **_options: Any) -> list[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return an iterator over the given vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:12213",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12213",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "vertices",
    "name": "Graph.vertices",
    "signature": "vertices(sort: bool=False, **_options: Any) -> list[Any]",
    "module": "sage.graphs.generic_graph",
    "doc": "Return a list of the vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:12361",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12361",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GenericGraph",
    "attribute": "weighted",
    "name": "Graph.weighted",
    "signature": "weighted(value: Any=None) -> bool",
    "module": "sage.graphs.generic_graph",
    "doc": "Whether the (di)graph is to be considered as a weighted (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generic_graph.py`:4380",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4380",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphAutomorphism",
    "attribute": "dict",
    "name": "GraphAutomorphism.dict",
    "signature": "dict() -> dict[Any, Any]",
    "module": "sage.graphs",
    "doc": "Return the vertex-image dictionary of this automorphism.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphAutomorphismGroup",
    "attribute": "cardinality",
    "name": "GraphAutomorphismGroup.cardinality",
    "signature": "cardinality() -> int",
    "module": "sage.graphs.pq_trees",
    "doc": "Return the number of orderings allowed by the structure.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/pq_trees.py`:746",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/pq_trees.py#L746",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphAutomorphismGroup",
    "attribute": "gens",
    "name": "GraphAutomorphismGroup.gens",
    "signature": "gens() -> 'tuple[GraphAutomorphism, ...]'",
    "module": "sage.graphs",
    "doc": "Return compact generators of the graph automorphism group.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphAutomorphismGroup",
    "attribute": "list",
    "name": "GraphAutomorphismGroup.list",
    "signature": "list() -> list[GraphAutomorphism]",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `list` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphAutomorphismGroup",
    "attribute": "order",
    "name": "GraphAutomorphismGroup.order",
    "signature": "order() -> int",
    "module": "sage.graphs.generators.luw_graphs",
    "doc": "Return the number of vertices of the graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/luw_graphs.py`:218",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/luw_graphs.py#L218",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphDatabase",
    "attribute": "close",
    "name": "GraphDatabase.close",
    "signature": "close() -> None",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `close` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphDatabase",
    "attribute": "count",
    "name": "GraphDatabase.count",
    "signature": "count(**conditions: Any) -> int",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `count` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphDatabase",
    "attribute": "graphs",
    "name": "GraphDatabase.graphs",
    "signature": "graphs(**conditions: Any) -> list[Graph]",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `graphs` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphDatabase",
    "attribute": "query",
    "name": "GraphDatabase.query",
    "signature": "query(query_dict: Any=None, display_cols: Any=None, limit: int | None=None, **conditions: Any) -> GraphQuery",
    "module": "sage.graphs.graph_database",
    "doc": "Create a GraphQuery on this database.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph_database.py`:1020",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_database.py#L1020",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphPlot",
    "attribute": "plot",
    "name": "GraphPlot.plot",
    "signature": "plot() -> Any",
    "module": "sage.graphs.graph_plot",
    "doc": "Return a graphics object representing the (di)graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph_plot.py`:1147",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_plot.py#L1147",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphPlot",
    "attribute": "plotly",
    "name": "GraphPlot.plotly",
    "signature": "plotly() -> Any",
    "module": "sage.graphs",
    "doc": "Return the Plotly figure representing this graph plot.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphPlot",
    "attribute": "show",
    "name": "GraphPlot.show",
    "signature": "show(**options: Any) -> GraphPlot",
    "module": "sage.graphs.graph_plot",
    "doc": "Show the (di)graph associated with this `GraphPlot` object.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph_plot.py`:1109",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_plot.py#L1109",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphQuery",
    "attribute": "count",
    "name": "GraphQuery.count",
    "signature": "count() -> int",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `count` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphQuery",
    "attribute": "get_graphs_list",
    "name": "GraphQuery.get_graphs_list",
    "signature": "get_graphs_list() -> list[Graph]",
    "module": "sage.graphs.graph_database",
    "doc": "Return a list of Sage Graph objects that satisfy the query.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph_database.py`:727",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_database.py#L727",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphQuery",
    "attribute": "list",
    "name": "GraphQuery.list",
    "signature": "list() -> list[Graph]",
    "module": "sage.graphs",
    "doc": "Return the result of the Sage-compatible `list` graph operation.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sagejs-original",
        "source": "Sage.js graph implementation",
        "license": "GPL-3.0-only"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphQuery",
    "attribute": "query_iterator",
    "name": "GraphQuery.query_iterator",
    "signature": "query_iterator(immutable: Any=None) -> Iterator[Graph]",
    "module": "sage.graphs.graph_database",
    "doc": "Return an iterator over the results list of the `~GraphQuery`.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "graphs"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/graph_database.py`:549",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_database.py#L549",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "DigraphGenerators",
    "attribute": "Circuit",
    "name": "digraphs.Circuit",
    "signature": "Circuit(order: int) -> DiGraph",
    "module": "sage.graphs.digraph_generators",
    "doc": "Return the circuit on `n` vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph_generators.py`:913",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph_generators.py#L913",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "DigraphGenerators",
    "attribute": "Complete",
    "name": "digraphs.Complete",
    "signature": "Complete(order: int) -> DiGraph",
    "module": "sage.graphs.digraph_generators",
    "doc": "Return the complete digraph on `n` vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph_generators.py`:865",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph_generators.py#L865",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "DigraphGenerators",
    "attribute": "Path",
    "name": "digraphs.Path",
    "signature": "Path(order: int) -> DiGraph",
    "module": "sage.graphs.digraph_generators",
    "doc": "Return a directed path on `n` vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/digraph_generators.py`:347",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph_generators.py#L347",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "BullGraph",
    "name": "graphs.BullGraph",
    "signature": "BullGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return a bull graph with 5 nodes.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:23",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L23",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "CompleteBipartiteGraph",
    "name": "graphs.CompleteBipartiteGraph",
    "signature": "CompleteBipartiteGraph(left: int, right: int, set_position: bool=True, immutable: bool=False, name: str | None=None) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return a Complete Bipartite Graph on `p + q` vertices.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:555",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L555",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "CompleteGraph",
    "name": "graphs.CompleteGraph",
    "signature": "CompleteGraph(order: int, immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return a complete graph on `n` nodes.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:382",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L382",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "CycleGraph",
    "name": "graphs.CycleGraph",
    "signature": "CycleGraph(order: int, immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return a cycle graph with `n` nodes.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:282",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L282",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "DiamondGraph",
    "name": "graphs.DiamondGraph",
    "signature": "DiamondGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return a diamond graph with 4 nodes.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:794",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L794",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "DodecahedralGraph",
    "name": "graphs.DodecahedralGraph",
    "signature": "DodecahedralGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.platonic_solids",
    "doc": "Return a Dodecahedral graph (with 20 nodes).\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/platonic_solids.py`:237",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L237",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "EmptyGraph",
    "name": "graphs.EmptyGraph",
    "signature": "EmptyGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return an empty graph (0 nodes and 0 edges).\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:933",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L933",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "GeneralizedPetersenGraph",
    "name": "graphs.GeneralizedPetersenGraph",
    "signature": "GeneralizedPetersenGraph(order: int, step: int, immutable: bool=False, name: str | None=None) -> Graph",
    "module": "sage.graphs.generators.families",
    "doc": "Return a generalized Petersen graph with `2n` nodes. The variables `n`, `k` are integers such that `n>2` and `0<k\\leq\\lfloor(n-1)`/`2\\rfloor`\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/families.py`:1697",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/families.py#L1697",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "Grid2dGraph",
    "name": "graphs.Grid2dGraph",
    "signature": "Grid2dGraph(rows: int, columns: int, set_positions: bool=True, immutable: bool=False, name: str | None=None) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return a `2`-dimensional grid graph with `p \\times q` nodes (`p` rows and `q` columns).\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:1110",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L1110",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "HexahedralGraph",
    "name": "graphs.HexahedralGraph",
    "signature": "HexahedralGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.platonic_solids",
    "doc": "Return a hexahedral graph (with 8 nodes).\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/platonic_solids.py`:78",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L78",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "HouseGraph",
    "name": "graphs.HouseGraph",
    "signature": "HouseGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return a house graph with 5 nodes.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:1317",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L1317",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "IcosahedralGraph",
    "name": "graphs.IcosahedralGraph",
    "signature": "IcosahedralGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.platonic_solids",
    "doc": "Return an Icosahedral graph (with 12 nodes).\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/platonic_solids.py`:185",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L185",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "OctahedralGraph",
    "name": "graphs.OctahedralGraph",
    "signature": "OctahedralGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.platonic_solids",
    "doc": "Return an Octahedral graph (with 6 nodes).\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/platonic_solids.py`:134",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L134",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "PathGraph",
    "name": "graphs.PathGraph",
    "signature": "PathGraph(order: int, pos: Any=None, immutable: bool=False, name: str | None=None) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return a path graph with `n` nodes.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:1553",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L1553",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "PetersenGraph",
    "name": "graphs.PetersenGraph",
    "signature": "PetersenGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.smallgraphs",
    "doc": "Return the Petersen Graph.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/smallgraphs.py`:4603",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/smallgraphs.py#L4603",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "StarGraph",
    "name": "graphs.StarGraph",
    "signature": "StarGraph(leaves: int, immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.basic",
    "doc": "Return a star graph with `n + 1` nodes.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/basic.py`:1675",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L1675",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "TetrahedralGraph",
    "name": "graphs.TetrahedralGraph",
    "signature": "TetrahedralGraph(immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.platonic_solids",
    "doc": "Return a tetrahedral graph (with 4 nodes).\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/platonic_solids.py`:21",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L21",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  },
  {
    "owner": "GraphGenerators",
    "attribute": "WheelGraph",
    "name": "graphs.WheelGraph",
    "signature": "WheelGraph(order: int, immutable: bool=False) -> Graph",
    "module": "sage.graphs.generators.families",
    "doc": "Return a Wheel graph with `n` nodes.\n\n### Sage.js status\n\nThis entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.",
    "tags": [
      "graph theory",
      "generators"
    ],
    "backends": [
      "Sage.js graph algorithms"
    ],
    "sage_compatibility": {
      "status": "partial",
      "notes": "The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled."
    },
    "provenance": [
      {
        "kind": "sage-derived",
        "source": "SageMath `src/sage/graphs/generators/families.py`:3651",
        "revision": "09472ff530d280d0c9f44fdc5a9c3e856ed95b37",
        "url": "https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/families.py#L3651",
        "license": "GPL-2.0-or-later"
      }
    ],
    "limitations": [
      "Consult the verified examples for the currently tested option surface."
    ]
  }
]
