"""Readable Sage-compatible graph theory foundations.

The public object model deliberately does not expose a particular native
backend.  Vertices are kept in insertion order and edges use compact integer
indices internally, which gives exact semantics for arbitrary hashable Sage
objects while leaving a clean boundary for igraph, bliss, or WASM kernels.

The initial algorithm layer emphasizes certifiable combinatorial algorithms:
traversals, connectivity, distances, coloring, cliques, spanning trees, and
individualization/refinement graph isomorphism.
"""

# Ruff's WASM build reports I001 while proposing this same import block.
# ruff: noqa: I001

from __future__ import annotations

from typing import Any, Iterator, Sequence

import sagejs.runtime as runtime
from sagejs.ffi.igraph import canonical_permutation as _canonical_permutation


_PLOTLY_MIME = "application/vnd.plotly.v1+json"
_graph_native_state = {"attempted": False, "backend": None}
# Below this many legacy edge scans, packing costs more than the work it saves.
# Above it, the old traversal's repeated full-edge scans are a measured hot
# loop and the packed O(V + E) kernel is the normal route.
_PACKED_COMPONENTS_MIN_EDGE_SCANS = 100000
_PACKED_SHORTEST_PATHS_MIN_EDGE_SCANS = 100000
_PACKED_SHORTEST_PATHS_MAX_VERTICES = 250000
_PACKED_SHORTEST_PATHS_MAX_EDGE_ENTRIES = 2000000
_PACKED_ALL_PAIRS_MAX_VERTICES = 2048
_PACKED_ALL_PAIRS_MAX_EDGE_ENTRIES = 4000000


class _GraphPositiveInfinity:
    def __repr__(self) -> str:
        return "+Infinity"

    __str__ = __repr__
    toString = __repr__

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _GraphPositiveInfinity)

    def __lt__(self, other: object) -> bool:
        del other
        return False

    def __le__(self, other: object) -> bool:
        return isinstance(other, _GraphPositiveInfinity)

    def __gt__(self, other: object) -> bool:
        return not isinstance(other, _GraphPositiveInfinity)

    def __ge__(self, other: object) -> bool:
        del other
        return True


_graph_positive_infinity = _GraphPositiveInfinity()


def _native_object() -> Any:
    return runtime.object.create(None)


def _native_record(**values: Any) -> Any:
    answer = _native_object()
    for key in runtime.object.keys(values):
        runtime.reflect.set(answer, key, runtime.reflect.get(values, key))
    return answer


def _native_graph_backend() -> Any:
    """Load the optional igraph addon once, preserving portable fallbacks."""
    if not _graph_native_state["attempted"]:
        _graph_native_state["attempted"] = True
        try:
            _graph_native_state["backend"] = runtime.require_module(
                "@sagemath/sagejs-graph"
            )
        except Exception:
            _graph_native_state["backend"] = None
    return _graph_native_state["backend"]


def _packed_components_modules() -> tuple[Any, Any]:
    """Load the native helpers and graph kernel only on a heavy traversal."""
    loader = runtime.reflect.get(runtime.global_object, "__sagejs_load_module__")
    if loader is runtime.undefined:
        raise RuntimeError("the packed graph component kernel loader is unavailable")
    return (
        runtime.reflect.apply(loader, runtime.undefined, ["sagejs.native"]),
        runtime.reflect.apply(
            loader,
            runtime.undefined,
            ["sagejs.kernels.graph.components"],
        ),
    )


def _packed_shortest_paths_modules() -> tuple[Any, Any]:
    """Load packed unweighted-distance kernels only for a heavy request."""
    loader = runtime.reflect.get(runtime.global_object, "__sagejs_load_module__")
    if loader is runtime.undefined:
        raise RuntimeError("the packed graph shortest-path loader is unavailable")
    return (
        runtime.reflect.apply(loader, runtime.undefined, ["sagejs.native"]),
        runtime.reflect.apply(
            loader,
            runtime.undefined,
            ["sagejs.kernels.graph.shortest_paths"],
        ),
    )


def _record_get(record: Any, key: str, default_value: Any = None) -> Any:
    if runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        record,
        [key],
    ):
        return runtime.reflect.get(record, key)
    return default_value


def _position_dict(entries: Any) -> dict[Any, Any]:
    positions = {}
    for entry in entries:
        positions[entry[0]] = (entry[1], entry[2])
    return positions


def _same(left: Any, right: Any) -> bool:
    try:
        return bool(left == right)
    except Exception:
        return left is right


def _index_equal(values: Sequence[Any], target: Any) -> int:
    for index in range(len(values)):
        if _same(values[index], target):
            return index
    return -1


def _safe_sorted(values: Sequence[Any]) -> list[Any]:
    answer = list(values)
    try:
        answer.sort()
    except Exception:
        answer.sort(key=lambda value: repr(value))
    return answer


def _label_code(label: Any) -> str:
    return repr(label)


def _html_escape(value: Any) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _json_text(value: Any) -> str:
    stringify = runtime.reflect.get(runtime.json, "stringify")
    text = str(runtime.reflect.apply(stringify, runtime.json, [value]))
    return text.replace("<", "\\u003c")


def _encode_order(order: int) -> str:
    if order < 0 or order >= 68719476736:
        raise ValueError("graph6 order must be between 0 and 2^36-1")
    if order <= 62:
        return chr(order + 63)
    if order <= 258047:
        return "".join(
            [
                chr(126),
                chr(((order >> 12) & 63) + 63),
                chr(((order >> 6) & 63) + 63),
                chr((order & 63) + 63),
            ]
        )
    return "".join(
        [
            chr(126),
            chr(126),
            chr(((order >> 30) & 63) + 63),
            chr(((order >> 24) & 63) + 63),
            chr(((order >> 18) & 63) + 63),
            chr(((order >> 12) & 63) + 63),
            chr(((order >> 6) & 63) + 63),
            chr((order & 63) + 63),
        ]
    )


def _decode_order(text: str) -> tuple[int, int]:
    if len(text) == 0:
        raise ValueError("empty graph6 order")
    first = ord(text[0]) - 63
    if first < 0 or first > 63:
        raise ValueError("invalid graph6 character")
    if first < 63:
        return first, 1
    if len(text) < 4:
        raise ValueError("truncated graph6 order")
    second = ord(text[1]) - 63
    if second < 63:
        order = 0
        for character in text[1:4]:
            order = (order << 6) | (ord(character) - 63)
        return order, 4
    if len(text) < 8:
        raise ValueError("truncated graph6 order")
    order = 0
    for character in text[2:8]:
        order = (order << 6) | (ord(character) - 63)
    return order, 8


def _bits_from_text(text: str) -> list[int]:
    answer = []
    for character in text:
        value = ord(character) - 63
        if value < 0 or value > 63:
            raise ValueError("invalid graph6 character")
        for shift in range(5, -1, -1):
            answer.append((value >> shift) & 1)
    return answer


def _text_from_bits(bits: list[int]) -> str:
    while len(bits) % 6:
        bits.append(0)
    answer = ""
    for offset in range(0, len(bits), 6):
        value = 0
        for bit in bits[offset : offset + 6]:
            value = (value << 1) | bit
        answer += chr(value + 63)
    return answer


class _Edge:
    def __init__(self, source: int, target: int, label: Any = None) -> None:
        self.source = source
        self.target = target
        self.label = label

    def copy(self) -> _Edge:
        return _Edge(self.source, self.target, self.label)


class GraphAutomorphism:
    """A permutation of a graph's vertex set."""

    def __init__(self, vertices: list[Any], images: list[int]) -> None:
        self._vertices = list(vertices)
        self._images = list(images)

    def __call__(self, vertex: Any) -> Any:
        index = _index_equal(self._vertices, vertex)
        if index < 0:
            raise KeyError(vertex)
        return self._vertices[self._images[index]]

    def dict(self) -> dict[Any, Any]:
        answer = dict()
        for index in range(len(self._vertices)):
            answer.__setitem__(
                self._vertices[index], self._vertices[self._images[index]]
            )
        return answer

    def __repr__(self) -> str:
        cycles = []
        seen = [False] * len(self._vertices)
        for start in range(len(self._vertices)):
            if seen[start] or self._images[start] == start:
                seen[start] = True
                continue
            cycle = []
            current = start
            while not seen[current]:
                seen[current] = True
                cycle.append(repr(self._vertices[current]))
                current = self._images[current]
            cycles.append("(" + ",".join(cycle) + ")")
        return "".join(cycles) if len(cycles) else "()"

    __str__ = __repr__
    toString = __repr__


class GraphAutomorphismGroup:
    """Finite graph automorphism group represented by compact generators."""

    def __init__(
        self,
        vertices: list[Any],
        mappings: list[list[int]],
        known_order: int | None = None,
        generators_only: bool = False,
    ) -> None:
        self._vertices = list(vertices)
        self._generators = [list(mapping) for mapping in mappings]
        self._mappings = (
            None if generators_only else [list(mapping) for mapping in mappings]
        )
        self._known_order = known_order if known_order is not None else len(mappings)

    def _enumerate_mappings(self) -> list[list[int]]:
        if self._mappings is not None:
            return self._mappings
        identity = list(range(len(self._vertices)))
        mappings = [identity]
        seen = {repr(identity): True}
        cursor = 0
        while cursor < len(mappings):
            current = mappings[cursor]
            cursor += 1
            for generator in self._generators:
                composed = [
                    current[generator[index]] for index in range(len(self._vertices))
                ]
                code = repr(composed)
                if code not in seen:
                    seen[code] = True
                    mappings.append(composed)
        self._mappings = mappings
        return mappings

    def order(self) -> int:
        return self._known_order

    cardinality = order

    def list(self) -> list[GraphAutomorphism]:
        return [
            GraphAutomorphism(self._vertices, mapping)
            for mapping in self._enumerate_mappings()
        ]

    def __iter__(self) -> Iterator[GraphAutomorphism]:
        return iter(self.list())

    def gens(self) -> "tuple[GraphAutomorphism, ...]":
        identity = list(range(len(self._vertices)))
        generators = []
        for mapping in self._generators:
            if mapping != identity:
                generators.append(GraphAutomorphism(self._vertices, mapping))
        if len(generators) == 0:
            generators.append(GraphAutomorphism(self._vertices, identity))
        return runtime.math_tuple(generators)

    def __repr__(self) -> str:
        return (
            "Automorphism group of order "
            + str(self.order())
            + " acting on "
            + str(len(self._vertices))
            + " vertices"
        )

    __str__ = __repr__
    toString = __repr__


class GraphPlot:
    """Graph-specific renderer returned by :meth:`Graph.graphplot`."""

    def __init__(self, graph: GenericGraph, **options: Any) -> None:
        self._graph = graph
        self._options = dict(options)

    def _positions(self) -> list[tuple[float, float]]:
        if "pos" in self._options:
            supplied = self._options["pos"]
        elif "layout" in self._options:
            supplied = self._graph.layout(self._options["layout"])
        else:
            supplied = self._graph.get_pos()
        if supplied is not None:
            answer = []
            for vertex in self._graph._vertices:
                value = supplied[vertex]
                answer.append((float(value[0]), float(value[1])))
            return answer
        count = self._graph.order()
        if count == 0:
            return []
        pi = 3.141592653589793
        return [
            (
                runtime.math.cos(2.0 * pi * index / count),
                runtime.math.sin(2.0 * pi * index / count),
            )
            for index in range(count)
        ]

    def plotly(self) -> Any:
        positions = self._positions()
        edge_x = []
        edge_y = []
        for edge in self._graph._edges:
            source = positions[edge.source]
            target = positions[edge.target]
            if edge.source == edge.target:
                radius = 0.12
                for step in range(13):
                    angle = 2.0 * 3.141592653589793 * step / 12.0
                    edge_x.append(source[0] + radius * runtime.math.cos(angle))
                    edge_y.append(source[1] + radius * runtime.math.sin(angle))
                edge_x.append(None)
                edge_y.append(None)
            else:
                edge_x.extend([source[0], target[0], None])
                edge_y.extend([source[1], target[1], None])
        edge_color = self._options.get("edge_color", "#777")
        edge_trace = _native_record(
            type="scatter",
            mode="lines",
            x=edge_x,
            y=edge_y,
            line=_native_record(
                color=str(edge_color),
                width=float(self._options.get("edge_thickness", 1.5)),
            ),
            hoverinfo="skip",
            showlegend=False,
        )
        labels = [str(vertex) for vertex in self._graph._vertices]
        vertex_trace = _native_record(
            type="scatter",
            mode=(
                "markers+text"
                if bool(self._options.get("vertex_labels", True))
                else "markers"
            ),
            x=[point[0] for point in positions],
            y=[point[1] for point in positions],
            text=labels,
            textposition=str(self._options.get("label_pos", "middle center")),
            hovertext=[repr(vertex) for vertex in self._graph._vertices],
            hoverinfo="text",
            marker=_native_record(
                color=self._options.get("vertex_color", "#377eb8"),
                size=float(self._options.get("vertex_size", 28)),
                line=_native_record(color="#ffffff", width=1.5),
            ),
            showlegend=False,
        )
        annotations = []
        if self._graph.is_directed():
            for edge in self._graph._edges:
                if edge.source == edge.target:
                    continue
                source = positions[edge.source]
                target = positions[edge.target]
                annotations.append(
                    _native_record(
                        x=target[0],
                        y=target[1],
                        ax=source[0],
                        ay=source[1],
                        xref="x",
                        yref="y",
                        axref="x",
                        ayref="y",
                        showarrow=True,
                        arrowhead=3,
                        arrowsize=1,
                        arrowwidth=1.2,
                        arrowcolor=str(edge_color),
                        opacity=0.8,
                    )
                )
        layout = _native_record(
            title=str(self._options.get("title", self._graph.graph_name())),
            showlegend=False,
            hovermode="closest",
            margin=_native_record(l=20, r=20, b=20, t=45),
            xaxis=_native_record(visible=False, scaleanchor="y", scaleratio=1),
            yaxis=_native_record(visible=False),
            annotations=annotations,
            plot_bgcolor="rgba(0,0,0,0)",
            paper_bgcolor="rgba(0,0,0,0)",
        )
        return _native_record(
            data=[edge_trace, vertex_trace],
            layout=layout,
            config=_native_record(displaylogo=False, responsive=True),
        )

    def plot(self) -> Any:
        """Return this renderer as an ordinary composable `Graphics`."""
        adapter = runtime.reflect.get(
            runtime.global_object, "__sagejs_graphics_from_plotly__"
        )
        if adapter is runtime.undefined:
            raise RuntimeError("the two-dimensional graphics layer is unavailable")
        return runtime.reflect.apply(adapter, runtime.undefined, [self.plotly()])

    def _interactive_html(self) -> str:
        """Return a dependency-free SVG graph whose vertices are draggable."""
        width = int(self._options.get("width", 800))
        height = int(self._options.get("height", 500))
        positions = self._positions()
        if len(positions):
            minimum_x = min([point[0] for point in positions])
            maximum_x = max([point[0] for point in positions])
            minimum_y = min([point[1] for point in positions])
            maximum_y = max([point[1] for point in positions])
            span_x = maximum_x - minimum_x
            span_y = maximum_y - minimum_y
            if span_x == 0:
                span_x = 1.0
            if span_y == 0:
                span_y = 1.0
            scale = min((width - 80) / span_x, (height - 80) / span_y)
            screen_positions = [
                (
                    40 + (point[0] - minimum_x) * scale,
                    height - 40 - (point[1] - minimum_y) * scale,
                )
                for point in positions
            ]
        else:
            screen_positions = []
        identifier = "sagejs-graph-" + str(int(runtime.math.random() * 1000000000000))
        edge_color = _html_escape(self._options.get("edge_color", "#777"))
        vertex_color = _html_escape(self._options.get("vertex_color", "#377eb8"))
        radius = float(self._options.get("vertex_size", 28)) / 2.0
        parts = [
            '<div id="' + identifier + '" class="sagejs-interactive-graph">',
            '<svg viewBox="0 0 ' + str(width) + " " + str(height) + '" ',
            'role="img" aria-label="'
            + _html_escape(self._graph.graph_name() or "Interactive graph")
            + '">',
            '<defs><marker id="' + identifier + '-arrow" markerWidth="8" ',
            'markerHeight="8" refX="7" refY="3" orient="auto" ',
            'markerUnits="strokeWidth"><path d="M0,0 L0,6 L8,3 z" ',
            'fill="' + edge_color + '"/></marker></defs>',
            '<g class="sagejs-edges" stroke="' + edge_color + '" ',
            'stroke-width="'
            + str(self._options.get("edge_thickness", 1.5))
            + '" fill="none">',
        ]
        for index in range(len(self._graph._edges)):
            edge = self._graph._edges[index]
            source = screen_positions[edge.source]
            target = screen_positions[edge.target]
            common = (
                ' data-source="'
                + str(edge.source)
                + '" data-target="'
                + str(edge.target)
                + '"'
            )
            if edge.source == edge.target:
                parts.append(
                    '<circle class="sagejs-edge sagejs-loop"'
                    + common
                    + ' cx="'
                    + str(source[0])
                    + '" cy="'
                    + str(source[1] - radius)
                    + '" r="'
                    + str(radius * 0.75)
                    + '"/>'
                )
            else:
                arrow = (
                    ' marker-end="url(#' + identifier + '-arrow)"'
                    if self._graph.is_directed()
                    else ""
                )
                parts.append(
                    '<line class="sagejs-edge"'
                    + common
                    + arrow
                    + ' x1="'
                    + str(source[0])
                    + '" y1="'
                    + str(source[1])
                    + '" x2="'
                    + str(target[0])
                    + '" y2="'
                    + str(target[1])
                    + '"/>'
                )
        parts.append('</g><g class="sagejs-vertices">')
        for index in range(len(self._graph._vertices)):
            point = screen_positions[index]
            parts.extend(
                [
                    '<g class="sagejs-vertex" data-index="'
                    + str(index)
                    + '" transform="translate('
                    + str(point[0])
                    + " "
                    + str(point[1])
                    + ')">',
                    '<circle r="'
                    + str(radius)
                    + '" fill="'
                    + vertex_color
                    + '" stroke="#fff" stroke-width="1.5"/>',
                    '<text text-anchor="middle" dominant-baseline="central">'
                    + _html_escape(self._graph._vertices[index])
                    + "</text></g>",
                ]
            )
        parts.extend(
            [
                '</g></svg><div class="sagejs-graph-hint">Drag vertices to explore ',
                "the layout.</div><style>",
                "#" + identifier + "{max-width:100%;font-family:system-ui,sans-serif}",
                "#" + identifier + " svg{width:100%;height:auto;min-height:260px;",
                "background:var(--jp-layout-color0,#fff);border:1px solid ",
                "var(--jp-border-color2,#ddd);border-radius:8px;touch-action:none}",
                "#" + identifier + " .sagejs-vertex{cursor:grab}",
                "#" + identifier + " .sagejs-vertex:active{cursor:grabbing}",
                "#" + identifier + " text{fill:#fff;font-size:12px;",
                "pointer-events:none;user-select:none}",
                "#" + identifier + " .sagejs-graph-hint{color:#666;font-size:12px;",
                "margin-top:4px}</style><script>(()=>{",
                "const root=document.getElementById(" + _json_text(identifier) + ");",
                'if(!root)return;const svg=root.querySelector("svg");',
                "const positions=" + _json_text(screen_positions) + ";",
                'const edges=[...root.querySelectorAll(".sagejs-edge")];',
                'const nodes=[...root.querySelectorAll(".sagejs-vertex")];',
                "const update=()=>{nodes.forEach((node,i)=>node.setAttribute(",
                '"transform",`translate(${positions[i][0]} ${positions[i][1]})`));',
                "edges.forEach(edge=>{const s=+edge.dataset.source,t=+edge.dataset.target;",
                'if(edge.classList.contains("sagejs-loop")){edge.setAttribute("cx",',
                'positions[s][0]);edge.setAttribute("cy",positions[s][1]-'
                + str(radius)
                + ');}else{edge.setAttribute("x1",positions[s][0]);',
                'edge.setAttribute("y1",positions[s][1]);edge.setAttribute("x2",',
                'positions[t][0]);edge.setAttribute("y2",positions[t][1]);}});};',
                "const point=e=>{const box=svg.getBoundingClientRect();return[",
                "(e.clientX-box.left)*" + str(width) + "/box.width,",
                "(e.clientY-box.top)*" + str(height) + "/box.height];};",
                'nodes.forEach((node,i)=>{node.addEventListener("pointerdown",e=>{',
                "node.setPointerCapture(e.pointerId);e.preventDefault();});",
                'node.addEventListener("pointermove",e=>{if(!node.hasPointerCapture(',
                "e.pointerId))return;positions[i]=point(e);update();});});",
                "})();</script></div>",
            ]
        )
        return "".join(parts)

    def _rich_repr_(self) -> Any:
        renderer = str(self._options.get("renderer", "")).lower()
        if self._options.get("interactive", False) or renderer in (
            "interactive",
            "svg",
        ):
            return _native_record(mime="text/html", data=self._interactive_html())
        return _native_record(mime=_PLOTLY_MIME, data=self.plotly())

    def show(self, **options: Any) -> GraphPlot:
        self._options.update(options)
        return self

    def __repr__(self) -> str:
        return "GraphPlot object for " + repr(self._graph)

    __str__ = __repr__
    toString = __repr__


class GenericGraph:
    """Common implementation for undirected and directed finite graphs."""

    _directed = False

    def __init__(
        self,
        data: Any = None,
        pos: Any = None,
        loops: bool = False,
        multiedges: bool = False,
        weighted: bool = False,
        name: str | None = None,
        **_options: Any,
    ) -> None:
        self._vertices: list[Any] = []
        self._edges: list[_Edge] = []
        self._loops = bool(loops)
        self._multiedges = bool(multiedges)
        self._weighted = bool(weighted)
        self._name = name
        self._pos = pos
        self._last_components_acceleration = _native_record(
            route="not-run",
            reason="not-run",
            boundaryCrossings=0,
            copiedValues=0,
            vertices=0,
            edges=0,
        )
        self._last_shortest_paths_acceleration = _native_record(
            operation="not-run",
            route="not-run",
            reason="not-run",
            boundaryCrossings=0,
            copiedValues=0,
            vertices=0,
            edges=0,
        )
        setattr(self, "name", self.graph_name)  # noqa: B010
        if data is not None:
            self._load_data(data)

    def _new(self, **options: Any) -> GenericGraph:
        if self._directed:
            answer = runtime.reflect.construct(DiGraph, [])
        else:
            answer = runtime.reflect.construct(Graph, [])
        answer._loops = bool(_record_get(options, "loops", False))
        answer._multiedges = bool(_record_get(options, "multiedges", False))
        answer._weighted = bool(_record_get(options, "weighted", False))
        answer._name = _record_get(options, "name")
        answer._pos = _record_get(options, "pos")
        data = _record_get(options, "data")
        if data is not None:
            answer._load_data(data)
        return answer

    def _load_data(self, data: Any) -> None:
        if isinstance(data, GenericGraph):
            self._loops = data._loops
            self._multiedges = data._multiedges
            self._weighted = data._weighted
            self._name = data._name if self._name is None else self._name
            self._pos = data._pos if self._pos is None else self._pos
            self._vertices = list(data._vertices)
            self._edges = [edge.copy() for edge in data._edges]
            return
        if isinstance(data, int):
            self.add_vertices(range(data))
            return
        if isinstance(data, str):
            if data[:10] == ">>graph6<<":
                data = data[10:]
            if data[:11] == ">>sparse6<<":
                data = data[11:]
            if data[:1] == ":":
                decoded = self._from_sparse6(data)
            else:
                decoded = self._from_graph6(data)
            self._vertices = decoded._vertices
            self._edges = decoded._edges
            self._loops = decoded._loops
            self._multiedges = decoded._multiedges
            return
        if isinstance(data, dict):
            self.add_vertices(list(data.keys()))
            for source, targets in data.items():
                if isinstance(targets, dict):
                    for target, label in targets.items():
                        self.add_edge(source, target, label)
                else:
                    for target in targets:
                        self.add_edge(source, target)
            return
        if hasattr(data, "nrows") and hasattr(data, "ncols"):
            rows = int(data.nrows())
            columns = int(data.ncols())
            if rows != columns:
                raise ValueError("an adjacency matrix must be square")
            self.add_vertices(range(rows))
            for source in range(rows):
                targets = range(columns) if self._directed else range(source, columns)
                for target in targets:
                    value = data[source, target]
                    multiplicity = int(value)
                    if multiplicity > 1:
                        self._multiedges = True
                    for _copy in range(multiplicity):
                        self.add_edge(source, target)
            return
        values = list(data)
        if len(values) == 0:
            return
        edge_like = True
        for value in values:
            if not isinstance(value, (list, tuple)) or len(value) not in (2, 3):
                edge_like = False
                break
        if edge_like:
            self.add_edges(values)
        else:
            self.add_vertices(values)

    def _from_graph6(self, text: str) -> Graph:
        text = text.strip()
        order, offset = _decode_order(text)
        bits = _bits_from_text(text[offset:])
        needed = order * (order - 1) // 2
        if len(bits) < needed:
            raise ValueError("truncated graph6 data")
        answer = Graph(order)
        cursor = 0
        for target in range(1, order):
            for source in range(target):
                if bits[cursor]:
                    answer.add_edge(source, target)
                cursor += 1
        return answer

    def _from_sparse6(self, text: str) -> Graph:
        text = text.strip()
        if text[:1] != ":":
            raise ValueError("sparse6 data must start with ':'")
        order, offset = _decode_order(text[1:])
        bits = _bits_from_text(text[1 + offset :])
        width = 1
        while (1 << width) < order:
            width += 1
        pairs = []
        cursor = 0
        while cursor + width < len(bits):
            advance = bits[cursor]
            cursor += 1
            value = 0
            for _bit in range(width):
                value = (value << 1) | bits[cursor]
                cursor += 1
            pairs.append((advance, value))
        edges = []
        vertex = 0
        multiple = False
        for advance, value in pairs:
            if advance:
                vertex += 1
            if value >= order or vertex >= order:
                break
            if value > vertex:
                vertex = value
            else:
                if (value, vertex) in edges:
                    multiple = True
                edges.append((value, vertex))
        answer = Graph(order, loops=True, multiedges=multiple)
        answer.add_edges(edges)
        return answer

    def copy(self, immutable: bool = False) -> GenericGraph:
        del immutable
        return self._new(data=self)

    def is_directed(self) -> bool:
        return self._directed

    def allows_loops(self, value: Any = None) -> bool:
        if value is not None:
            self._loops = bool(value)
        return self._loops

    def allows_multiple_edges(self, value: Any = None) -> bool:
        if value is not None:
            self._multiedges = bool(value)
        return self._multiedges

    def weighted(self, value: Any = None) -> bool:
        if value is not None:
            self._weighted = bool(value)
        return self._weighted

    def graph_name(self, value: Any = None) -> str:
        if value is not None:
            self._name = str(value)
        if self._name is not None:
            return self._name
        return ""

    def get_pos(self) -> Any:
        return self._pos

    def set_pos(self, pos: Any) -> None:
        self._pos = pos

    def _native_data(self) -> Any:
        edges = []
        for edge in self._edges:
            edges.extend([edge.source, edge.target])
        return _native_record(
            vertexCount=self.order(),
            edges=edges,
            directed=self._directed,
        )

    def _native_simple_backend(self) -> Any:
        # Bliss canonical forms intentionally target simple graphs.  In
        # particular, igraph does not encode loop and parallel-edge semantics
        # in this API, so keep those cases on the exact portable path.
        if self._multiedges or any(
            [edge.source == edge.target for edge in self._edges]
        ):
            return None
        return _native_graph_backend()

    def layout(
        self,
        layout: str | None = None,
        save_pos: bool = False,
        **_options: Any,
    ) -> dict[Any, Any]:
        """Return vertex coordinates, using igraph for force layouts.

        Authored positions on Sage's named graph families remain the default.
        Explicit `spring`/`fr` and `kamada_kawai`/`kk` requests use
        the isolated native backend when present and a deterministic circular
        layout otherwise.
        """
        if layout is None and self._pos is not None:
            return dict(self._pos)
        name = "spring" if layout is None else str(layout).lower()
        native_names = {
            "spring": "fr",
            "fr": "fr",
            "kamada_kawai": "kk",
            "kk": "kk",
            "circular": "circle",
            "circle": "circle",
            "grid": "grid",
        }
        if name not in native_names:
            raise ValueError("unknown graph layout: " + repr(layout))
        coordinates = None
        backend = self._native_simple_backend()
        if backend is not None:
            try:
                native_function = runtime.reflect.get(backend, "layout")
                coordinates = runtime.reflect.apply(
                    native_function, backend, [self._native_data(), native_names[name]]
                )
            except Exception:
                coordinates = None
        if coordinates is None:
            positions = self._circle_embedding(self._vertices, return_dict=True)
        else:
            positions = {}
            for index in range(self.order()):
                point = coordinates[index]
                positions[self._vertices[index]] = (float(point[0]), float(point[1]))
        if save_pos:
            self._pos = positions
        return positions

    def _circle_embedding(
        self,
        vertices: Any,
        center: Any = None,
        radius: Any = 1,
        shift: Any = 0,
        angle: Any = 0,
        return_dict: bool = False,
    ) -> Any:
        """Place `vertices` on a circle, matching Sage's layout helper."""
        if center is None:
            center = (0, 0)
        ordered = list(vertices)
        positions = {} if return_dict else self._pos
        if positions is None:
            positions = {}
            self._pos = positions
        count = len(ordered)
        pi = 3.141592653589793
        for index in range(count):
            theta = angle + 2.0 * (index + shift) * pi / count
            x = center[0] + radius * round(runtime.math.cos(theta), 10)
            y = center[1] + radius * round(runtime.math.sin(theta), 10)
            positions[ordered[index]] = (x, y)
        if return_dict:
            return positions
        return None

    def _line_embedding(
        self,
        vertices: Any,
        first: Any = None,
        last: Any = None,
        return_dict: bool = False,
    ) -> Any:
        """Place `vertices` evenly on a line, matching Sage's helper."""
        if first is None:
            first = (0, 0)
        if last is None:
            last = (0, 1)
        ordered = list(vertices)
        positions = {} if return_dict else self._pos
        if positions is None:
            positions = {}
            self._pos = positions
        intervals = len(ordered) - 1
        if intervals != 0:
            x = first[0]
            y = first[1]
            dx = (last[0] - first[0]) / intervals
            dy = (last[1] - first[1]) / intervals
        else:
            x = (first[0] + last[0]) / 2.0
            y = (first[1] + last[1]) / 2.0
            dx = 0
            dy = 0
        for vertex in ordered:
            positions[vertex] = (x, y)
            x += dx
            y += dy
        if return_dict:
            return positions
        return None

    def _vertex_index(self, vertex: Any) -> int:
        return _index_equal(self._vertices, vertex)

    def has_vertex(self, vertex: Any) -> bool:
        return self._vertex_index(vertex) >= 0

    def __contains__(self, vertex: object) -> bool:
        return self.has_vertex(vertex)

    def add_vertex(self, vertex: Any = None) -> Any:
        if vertex is None:
            vertex = 0
            while self.has_vertex(vertex):
                vertex += 1
        if not self.has_vertex(vertex):
            self._vertices.append(vertex)
        return vertex

    def add_vertices(self, vertices: Any) -> None:
        for vertex in vertices:
            self.add_vertex(vertex)

    def _edge_matches(self, edge: _Edge, source: int, target: int) -> bool:
        if self._directed:
            return edge.source == source and edge.target == target
        return (edge.source == source and edge.target == target) or (
            edge.source == target and edge.target == source
        )

    def add_edge(self, *edge_data: Any) -> None:
        if len(edge_data) == 1:
            values = list(edge_data[0])
        else:
            values = list(edge_data)
        if len(values) not in (2, 3):
            raise ValueError("an edge must have two endpoints and an optional label")
        source_vertex = values[0]
        target_vertex = values[1]
        label = None if len(values) == 2 else values[2]
        source = self._vertex_index(source_vertex)
        if source < 0:
            self._vertices.append(source_vertex)
            source = len(self._vertices) - 1
        target = self._vertex_index(target_vertex)
        if target < 0:
            self._vertices.append(target_vertex)
            target = len(self._vertices) - 1
        if source == target and not self._loops:
            raise ValueError(
                "cannot add edge from "
                + repr(source_vertex)
                + " to "
                + repr(target_vertex)
                + " in graph without loops"
            )
        if not self._multiedges:
            for edge in self._edges:
                if self._edge_matches(edge, source, target):
                    edge.label = label
                    return
        self._edges.append(_Edge(source, target, label))

    def add_edges(self, edges: Any) -> None:
        for edge in edges:
            self.add_edge(edge)

    def add_cycle(self, vertices: Any) -> None:
        values = list(vertices)
        self.add_vertices(values)
        if len(values) > 1:
            for index in range(len(values)):
                self.add_edge(values[index], values[(index + 1) % len(values)])

    def add_path(self, vertices: Any) -> None:
        values = list(vertices)
        self.add_vertices(values)
        for index in range(len(values) - 1):
            self.add_edge(values[index], values[index + 1])

    def add_clique(self, vertices: Any) -> None:
        values = list(vertices)
        self.add_vertices(values)
        for first in range(len(values)):
            for second in range(first + 1, len(values)):
                self.add_edge(values[first], values[second])

    def delete_edge(self, *edge_data: Any) -> None:
        values = list(edge_data[0]) if len(edge_data) == 1 else list(edge_data)
        if len(values) < 2:
            raise ValueError("an edge needs two endpoints")
        source = self._vertex_index(values[0])
        target = self._vertex_index(values[1])
        label = values[2] if len(values) > 2 else runtime.undefined
        for index in range(len(self._edges)):
            edge = self._edges[index]
            if self._edge_matches(edge, source, target) and (
                label is runtime.undefined or _same(edge.label, label)
            ):
                self._edges.pop(index)
                return
        raise ValueError("edge is not in graph")

    def delete_edges(self, edges: Any) -> None:
        for edge in edges:
            self.delete_edge(edge)

    def delete_vertex(self, vertex: Any) -> None:
        index = self._vertex_index(vertex)
        if index < 0:
            raise ValueError("vertex is not in graph")
        self._vertices.pop(index)
        kept = []
        for edge in self._edges:
            if edge.source == index or edge.target == index:
                continue
            if edge.source > index:
                edge.source -= 1
            if edge.target > index:
                edge.target -= 1
            kept.append(edge)
        self._edges = kept

    def delete_vertices(self, vertices: Any) -> None:
        for vertex in list(vertices):
            self.delete_vertex(vertex)

    def has_edge(
        self, source_vertex: Any, target_vertex: Any, label: Any = runtime.undefined
    ) -> bool:
        source = self._vertex_index(source_vertex)
        target = self._vertex_index(target_vertex)
        if source < 0 or target < 0:
            return False
        for edge in self._edges:
            if self._edge_matches(edge, source, target) and (
                label is runtime.undefined or _same(edge.label, label)
            ):
                return True
        return False

    def edge_label(self, source_vertex: Any, target_vertex: Any) -> Any:
        source = self._vertex_index(source_vertex)
        target = self._vertex_index(target_vertex)
        labels = [
            edge.label
            for edge in self._edges
            if self._edge_matches(edge, source, target)
        ]
        if len(labels) == 0:
            raise ValueError("edge is not in graph")
        return labels if self._multiedges else labels[0]

    def set_edge_label(
        self, source_vertex: Any, target_vertex: Any, label: Any
    ) -> None:
        source = self._vertex_index(source_vertex)
        target = self._vertex_index(target_vertex)
        for edge in self._edges:
            if self._edge_matches(edge, source, target):
                edge.label = label
                return
        raise ValueError("edge is not in graph")

    def vertices(self, sort: bool = False, **_options: Any) -> list[Any]:
        return _safe_sorted(self._vertices) if sort else list(self._vertices)

    vertex_iterator = vertices

    def edges(
        self, labels: bool = True, sort: bool = False, **_options: Any
    ) -> list[Any]:
        answer = []
        for edge in self._edges:
            source = self._vertices[edge.source]
            target = self._vertices[edge.target]
            if not self._directed:
                try:
                    if target < source:
                        source, target = target, source
                except Exception:
                    pass
            if labels:
                answer.append(runtime.math_tuple([source, target, edge.label]))
            else:
                answer.append(runtime.math_tuple([source, target]))
        return _safe_sorted(answer) if sort else answer

    edge_iterator = edges

    def order(self) -> int:
        return len(self._vertices)

    num_verts = order

    def size(self) -> int:
        return len(self._edges)

    num_edges = size

    def __len__(self) -> int:
        return self.order()

    def __iter__(self) -> Iterator[Any]:
        return iter(self._vertices)

    def __repr__(self) -> str:
        if self._name is not None and self._name != "":
            noun = "Digraph" if self._directed else "Graph"
            return self._name + ": " + noun + " on " + str(self.order()) + " vertices"
        noun = "Digraph" if self._directed else "Graph"
        return noun + " on " + str(self.order()) + " vertices"

    __str__ = __repr__
    toString = __repr__

    def neighbors(self, vertex: Any) -> list[Any]:
        index = self._vertex_index(vertex)
        if index < 0:
            raise LookupError("vertex is not in graph")
        answer = []
        for edge in self._edges:
            if edge.source == index:
                candidate = self._vertices[edge.target]
                if _index_equal(answer, candidate) < 0:
                    answer.append(candidate)
            if not self._directed and edge.target == index:
                candidate = self._vertices[edge.source]
                if _index_equal(answer, candidate) < 0:
                    answer.append(candidate)
        return answer

    neighbors_out = neighbors

    def neighbors_in(self, vertex: Any) -> list[Any]:
        if not self._directed:
            return self.neighbors(vertex)
        index = self._vertex_index(vertex)
        if index < 0:
            raise LookupError("vertex is not in graph")
        answer = []
        for edge in self._edges:
            if edge.target == index:
                candidate = self._vertices[edge.source]
                if _index_equal(answer, candidate) < 0:
                    answer.append(candidate)
        return answer

    def neighbor_iterator(self, vertex: Any) -> Iterator[Any]:
        return iter(self.neighbors(vertex))

    def degree(self, vertex: Any = None) -> Any:
        if vertex is None:
            return [self.degree(value) for value in self._vertices]
        index = self._vertex_index(vertex)
        if index < 0:
            raise LookupError("vertex is not in graph")
        degree = 0
        for edge in self._edges:
            if self._directed:
                if edge.source == index:
                    degree += 1
                if edge.target == index:
                    degree += 1
            elif edge.source == index and edge.target == index:
                degree += 2
            elif edge.source == index or edge.target == index:
                degree += 1
        return degree

    def out_degree(self, vertex: Any = None) -> Any:
        if not self._directed:
            return self.degree(vertex)
        if vertex is None:
            return [self.out_degree(value) for value in self._vertices]
        index = self._vertex_index(vertex)
        return len([edge for edge in self._edges if edge.source == index])

    def in_degree(self, vertex: Any = None) -> Any:
        if not self._directed:
            return self.degree(vertex)
        if vertex is None:
            return [self.in_degree(value) for value in self._vertices]
        index = self._vertex_index(vertex)
        return len([edge for edge in self._edges if edge.target == index])

    def degree_sequence(self) -> list[int]:
        return sorted(
            [int(self.degree(vertex)) for vertex in self._vertices], reverse=True
        )

    def minimum_degree(self) -> int:
        return min(self.degree_sequence()) if self.order() else 0

    def maximum_degree(self) -> int:
        return max(self.degree_sequence()) if self.order() else 0

    min_degree = minimum_degree
    max_degree = maximum_degree

    def average_degree(self) -> float:
        return 0.0 if self.order() == 0 else sum(self.degree_sequence()) / self.order()

    def density(self) -> float:
        order = self.order()
        if order < 2:
            return 0.0
        denominator = order * (order - 1)
        return (
            self.size() / denominator
            if self._directed
            else 2.0 * self.size() / denominator
        )

    def _adjacent_indices(self, index: int, reverse: bool = False) -> list[int]:
        answer = []
        for edge in self._edges:
            if self._directed:
                if not reverse and edge.source == index:
                    answer.append(edge.target)
                elif reverse and edge.target == index:
                    answer.append(edge.source)
            elif edge.source == index:
                answer.append(edge.target)
            elif edge.target == index:
                answer.append(edge.source)
        return answer

    def breadth_first_search(
        self,
        start: Any,
        distance: Any = None,
        **_options: Any,
    ) -> Iterator[Any]:
        source = self._vertex_index(start)
        if source < 0:
            raise LookupError("vertex is not in graph")
        seen = [False] * self.order()
        seen[source] = True
        queue = [(source, 0)]
        answer = []
        cursor = 0
        while cursor < len(queue):
            current, depth = queue[cursor]
            cursor += 1
            answer.append(self._vertices[current])
            if distance is not None and depth >= int(distance):
                continue
            for target in self._adjacent_indices(current):
                if not seen[target]:
                    seen[target] = True
                    queue.append((target, depth + 1))
        return iter(answer)

    def depth_first_search(self, start: Any, **_options: Any) -> Iterator[Any]:
        source = self._vertex_index(start)
        if source < 0:
            raise LookupError("vertex is not in graph")
        seen = [False] * self.order()
        stack = [source]
        answer = []
        while len(stack):
            current = stack.pop()
            if seen[current]:
                continue
            seen[current] = True
            answer.append(self._vertices[current])
            neighbors = self._adjacent_indices(current)
            for target in reversed(neighbors):
                if not seen[target]:
                    stack.append(target)
        return iter(answer)

    def _portable_connected_components(self, sort: bool) -> list[list[Any]]:
        """Exact edge-scan fallback retained as an independent oracle."""
        seen = [False] * self.order()
        answer = []
        for source in range(self.order()):
            if seen[source]:
                continue
            queue = [source]
            seen[source] = True
            component = []
            cursor = 0
            while cursor < len(queue):
                current = queue[cursor]
                cursor += 1
                component.append(self._vertices[current])
                adjacent = self._adjacent_indices(current)
                if self._directed:
                    adjacent += self._adjacent_indices(current, reverse=True)
                for target in adjacent:
                    if not seen[target]:
                        seen[target] = True
                        queue.append(target)
            answer.append(_safe_sorted(component) if sort else component)
        if sort:

            def component_key(component: list[Any]) -> tuple[int, str]:
                return -len(component), repr(component)

            answer.sort(key=component_key)
        return answer

    def _record_components_acceleration(
        self,
        route: str,
        reason: str,
        boundary_crossings: int,
        copied_values: int,
    ) -> None:
        self._last_components_acceleration = _native_record(
            route=route,
            reason=reason,
            boundaryCrossings=boundary_crossings,
            copiedValues=copied_values,
            vertices=self.order(),
            edges=len(self._edges),
        )

    def _packed_connected_components(self, sort: bool) -> list[list[Any]]:
        vertex_count = self.order()
        edge_entries = 2 * len(self._edges)
        native_module, components_module = _packed_components_modules()
        packed_kernel = runtime.reflect.get(
            components_module,
            "packed_graph_components",
        )
        kernel_uint64_zeros = runtime.reflect.get(
            native_module,
            "kernel_uint64_zeros",
        )
        kernel_uint64_buffer = runtime.reflect.get(
            native_module,
            "kernel_uint64_buffer",
        )
        native_is_compiled = runtime.reflect.get(native_module, "is_compiled")
        workspace_length = 7 * vertex_count + 2 + edge_entries
        packed_edges = []
        for edge in self._edges:
            packed_edges.extend([edge.source, edge.target])
        traversal = runtime.reflect.apply(
            kernel_uint64_zeros,
            native_module,
            [packed_kernel, vertex_count],
        )
        component_offsets = runtime.reflect.apply(
            kernel_uint64_zeros,
            native_module,
            [packed_kernel, vertex_count + 1],
        )
        workspace = runtime.reflect.apply(
            kernel_uint64_zeros,
            native_module,
            [packed_kernel, workspace_length],
        )
        edge_buffer = runtime.reflect.apply(
            kernel_uint64_buffer,
            native_module,
            [packed_kernel, packed_edges],
        )
        component_count = int(
            runtime.reflect.apply(
                packed_kernel,
                components_module,
                [
                    traversal,
                    component_offsets,
                    edge_buffer,
                    workspace,
                    vertex_count,
                    edge_entries,
                    1 if self._directed else 0,
                ],
            )
        )
        if component_count > vertex_count:
            raise ValueError("packed graph component traversal rejected its input")
        execution_target = getattr(
            packed_kernel,
            "executionTarget",
            None,
        )
        if execution_target == "wasm":
            route = "wasm-compiled-source"
            reason = "normal-heavy-case"
        elif bool(
            runtime.reflect.apply(
                native_is_compiled,
                native_module,
                [packed_kernel],
            )
        ) and bool(getattr(packed_kernel, "nativeAvailable", False)):
            route = "native-compiled-source"
            reason = "normal-heavy-case"
        else:
            route = "portable-computation"
            reason = "compiled-source-unavailable"
        self._record_components_acceleration(
            route,
            reason,
            1 if route != "portable-computation" else 0,
            (edge_entries + vertex_count + vertex_count + 1 + workspace_length),
        )

        answer = []
        for component_index in range(component_count):
            start = int(component_offsets[component_index])
            stop = int(component_offsets[component_index + 1])
            component = [
                self._vertices[int(traversal[index])] for index in range(start, stop)
            ]
            answer.append(_safe_sorted(component) if sort else component)
        if sort:

            def component_key(component: list[Any]) -> tuple[int, str]:
                return -len(component), repr(component)

            answer.sort(key=component_key)
        return answer

    def connected_components(self, sort: bool = False) -> list[list[Any]]:
        """Return weak components, accelerating large traversals in one batch.

        The normal heavy route packs insertion-order edge indices once and
        invokes the source-transparent CSR kernel. Small graphs retain the
        readable edge-scan implementation because marshalling would dominate.
        If no verified native/Wasm artifact is installed, the same packed
        Python source runs exactly and `_last_components_acceleration` reports
        `portable-computation` instead of silently claiming acceleration.
        """
        edge_scans = self.order() * len(self._edges)
        if edge_scans < _PACKED_COMPONENTS_MIN_EDGE_SCANS:
            self._record_components_acceleration(
                "portable-computation",
                "below-packed-threshold",
                0,
                0,
            )
            return self._portable_connected_components(sort)
        return self._packed_connected_components(sort)

    components = connected_components

    def connected_component_containing_vertex(self, vertex: Any) -> list[Any]:
        for component in self.connected_components():
            if _index_equal(component, vertex) >= 0:
                return component
        raise LookupError("vertex is not in graph")

    def is_connected(self) -> bool:
        return self.order() == 0 or len(self.connected_components()) == 1

    def _shortest_index_data(self, source: int) -> tuple[list[int], list[int]]:
        """Return the exact edge-scan BFS data used as the portable oracle."""
        distances = [-1] * self.order()
        parents = [-1] * self.order()
        distances[source] = 0
        queue = [source]
        cursor = 0
        while cursor < len(queue):
            current = queue[cursor]
            cursor += 1
            for target in self._adjacent_indices(current):
                if distances[target] < 0:
                    distances[target] = distances[current] + 1
                    parents[target] = current
                    queue.append(target)
        return distances, parents

    def _record_shortest_paths_acceleration(
        self,
        operation: str,
        route: str,
        reason: str,
        boundary_crossings: int,
        copied_values: int,
    ) -> None:
        self._last_shortest_paths_acceleration = _native_record(
            operation=operation,
            route=route,
            reason=reason,
            boundaryCrossings=boundary_crossings,
            copiedValues=copied_values,
            vertices=self.order(),
            edges=len(self._edges),
        )

    def _packed_shortest_edges(self) -> list[int]:
        packed_edges = []
        for edge in self._edges:
            packed_edges.extend([edge.source, edge.target])
        return packed_edges

    def _packed_shortest_route(
        self,
        packed_kernel: Any,
        native_module: Any,
    ) -> tuple[str, str]:
        execution_target = getattr(packed_kernel, "executionTarget", None)
        if execution_target == "wasm":
            return "wasm-compiled-source", "normal-heavy-case"
        native_is_compiled = runtime.reflect.get(native_module, "is_compiled")
        if bool(
            runtime.reflect.apply(
                native_is_compiled,
                native_module,
                [packed_kernel],
            )
        ) and bool(getattr(packed_kernel, "nativeAvailable", False)):
            return "native-compiled-source", "normal-heavy-case"
        return "portable-computation", "compiled-source-unavailable"

    def _packed_shortest_index_data(self, source: int) -> tuple[list[int], list[int]]:
        vertex_count = self.order()
        edge_entries = 2 * len(self._edges)
        native_module, shortest_module = _packed_shortest_paths_modules()
        packed_kernel = runtime.reflect.get(
            shortest_module,
            "packed_graph_shortest_paths",
        )
        kernel_uint64_zeros = runtime.reflect.get(
            native_module,
            "kernel_uint64_zeros",
        )
        kernel_uint64_buffer = runtime.reflect.get(
            native_module,
            "kernel_uint64_buffer",
        )
        workspace_length = 3 * vertex_count + 1 + edge_entries
        packed_edges = self._packed_shortest_edges()
        distances = runtime.reflect.apply(
            kernel_uint64_zeros,
            native_module,
            [packed_kernel, vertex_count],
        )
        parents = runtime.reflect.apply(
            kernel_uint64_zeros,
            native_module,
            [packed_kernel, vertex_count],
        )
        workspace = runtime.reflect.apply(
            kernel_uint64_zeros,
            native_module,
            [packed_kernel, workspace_length],
        )
        edge_buffer = runtime.reflect.apply(
            kernel_uint64_buffer,
            native_module,
            [packed_kernel, packed_edges],
        )
        status = int(
            runtime.reflect.apply(
                packed_kernel,
                shortest_module,
                [
                    distances,
                    parents,
                    edge_buffer,
                    workspace,
                    vertex_count,
                    edge_entries,
                    1 if self._directed else 0,
                    source,
                    vertex_count + edge_entries,
                ],
            )
        )
        if status == 1:
            raise ValueError("packed graph shortest paths rejected their input")
        if status == 2:
            raise RuntimeError(
                "packed graph shortest paths exhausted their work budget"
            )
        route, reason = self._packed_shortest_route(packed_kernel, native_module)
        self._record_shortest_paths_acceleration(
            "single-source",
            route,
            reason,
            1 if route != "portable-computation" else 0,
            edge_entries + 2 * vertex_count + workspace_length,
        )
        return (
            [
                -1 if int(distances[index]) == vertex_count else int(distances[index])
                for index in range(vertex_count)
            ],
            [
                -1 if int(parents[index]) == vertex_count else int(parents[index])
                for index in range(vertex_count)
            ],
        )

    def _shortest_index_data_for_public(
        self,
        source: int,
    ) -> tuple[list[int], list[int]]:
        vertex_count = self.order()
        edge_entries = 2 * len(self._edges)
        edge_scans = vertex_count * len(self._edges)
        if edge_scans < _PACKED_SHORTEST_PATHS_MIN_EDGE_SCANS:
            self._record_shortest_paths_acceleration(
                "single-source",
                "portable-computation",
                "below-packed-threshold",
                0,
                0,
            )
            return self._shortest_index_data(source)
        if (
            vertex_count > _PACKED_SHORTEST_PATHS_MAX_VERTICES
            or edge_entries > _PACKED_SHORTEST_PATHS_MAX_EDGE_ENTRIES
        ):
            self._record_shortest_paths_acceleration(
                "single-source",
                "portable-computation",
                "packed-bound-exceeded",
                0,
                0,
            )
            return self._shortest_index_data(source)
        return self._packed_shortest_index_data(source)

    def shortest_path(self, u: Any, v: Any, **_options: Any) -> list[Any]:
        if u is runtime.undefined:
            raise TypeError(
                "GenericGraph.shortest_path() missing 2 required positional "
                "arguments: 'u' and 'v'"
            )
        if v is runtime.undefined:
            raise TypeError(
                "GenericGraph.shortest_path() missing 1 required positional "
                "argument: 'v'"
            )
        source = self._vertex_index(u)
        target = self._vertex_index(v)
        if source < 0:
            raise ValueError("vertex '" + str(u) + "' is not in the (di)graph")
        if target < 0:
            raise ValueError("vertex '" + str(v) + "' is not in the (di)graph")
        distances, parents = self._shortest_index_data_for_public(source)
        if distances[target] < 0:
            return []
        path = []
        current = target
        while current >= 0:
            path.append(self._vertices[current])
            if current == source:
                break
            current = parents[current]
        path.reverse()
        return path

    def distance(self, source_vertex: Any, target_vertex: Any, **_options: Any) -> Any:
        path = self.shortest_path(source_vertex, target_vertex)
        return _graph_positive_infinity if len(path) == 0 else len(path) - 1

    def _portable_distances_all_pairs(self) -> dict[Any, dict[Any, Any]]:
        """Return exact all-pairs distances through the independent BFS oracle."""
        answer = dict()
        for source in range(self.order()):
            distances, _parents = self._shortest_index_data(source)
            source_distances = dict()
            for target in range(self.order()):
                source_distances.__setitem__(
                    self._vertices[target],
                    (
                        _graph_positive_infinity
                        if distances[target] < 0
                        else distances[target]
                    ),
                )
            answer.__setitem__(self._vertices[source], source_distances)
        return answer

    def _packed_distances_all_pairs(self) -> dict[Any, dict[Any, Any]]:
        vertex_count = self.order()
        edge_entries = 2 * len(self._edges)
        native_module, shortest_module = _packed_shortest_paths_modules()
        packed_kernel = runtime.reflect.get(
            shortest_module,
            "packed_graph_all_pairs_distances",
        )
        kernel_uint64_zeros = runtime.reflect.get(
            native_module,
            "kernel_uint64_zeros",
        )
        kernel_uint64_buffer = runtime.reflect.get(
            native_module,
            "kernel_uint64_buffer",
        )
        workspace_length = 3 * vertex_count + 1 + edge_entries
        distances = runtime.reflect.apply(
            kernel_uint64_zeros,
            native_module,
            [packed_kernel, vertex_count * vertex_count],
        )
        workspace = runtime.reflect.apply(
            kernel_uint64_zeros,
            native_module,
            [packed_kernel, workspace_length],
        )
        edge_buffer = runtime.reflect.apply(
            kernel_uint64_buffer,
            native_module,
            [packed_kernel, self._packed_shortest_edges()],
        )
        status = int(
            runtime.reflect.apply(
                packed_kernel,
                shortest_module,
                [
                    distances,
                    edge_buffer,
                    workspace,
                    vertex_count,
                    edge_entries,
                    1 if self._directed else 0,
                    vertex_count * (vertex_count + edge_entries),
                ],
            )
        )
        if status == 1:
            raise ValueError("packed graph all-pairs distances rejected their input")
        if status == 2:
            raise RuntimeError(
                "packed graph all-pairs distances exhausted their work budget"
            )
        route, reason = self._packed_shortest_route(packed_kernel, native_module)
        self._record_shortest_paths_acceleration(
            "all-pairs",
            route,
            reason,
            1 if route != "portable-computation" else 0,
            edge_entries + vertex_count * vertex_count + workspace_length,
        )
        answer = dict()
        for source in range(vertex_count):
            source_distances = dict()
            row = source * vertex_count
            for target in range(vertex_count):
                value = int(distances[row + target])
                source_distances.__setitem__(
                    self._vertices[target],
                    _graph_positive_infinity if value == vertex_count else value,
                )
            answer.__setitem__(self._vertices[source], source_distances)
        return answer

    def distances_all_pairs(self) -> dict[Any, dict[Any, Any]]:
        """Return all unweighted distances, batching a normal heavy request."""
        vertex_count = self.order()
        edge_entries = 2 * len(self._edges)
        edge_scans = vertex_count * vertex_count * len(self._edges)
        if edge_scans < _PACKED_SHORTEST_PATHS_MIN_EDGE_SCANS:
            self._record_shortest_paths_acceleration(
                "all-pairs",
                "portable-computation",
                "below-packed-threshold",
                0,
                0,
            )
            return self._portable_distances_all_pairs()
        if (
            vertex_count > _PACKED_ALL_PAIRS_MAX_VERTICES
            or edge_entries > _PACKED_ALL_PAIRS_MAX_EDGE_ENTRIES
        ):
            self._record_shortest_paths_acceleration(
                "all-pairs",
                "portable-computation",
                "packed-bound-exceeded",
                0,
                0,
            )
            return self._portable_distances_all_pairs()
        return self._packed_distances_all_pairs()

    def eccentricity(self, vertex: Any = None) -> Any:
        if vertex is None:
            return [self.eccentricity(value) for value in self._vertices]
        source = self._vertex_index(vertex)
        if source < 0:
            raise LookupError("vertex is not in graph")
        distances, _parents = self._shortest_index_data(source)
        if -1 in distances:
            return _graph_positive_infinity
        return max(distances) if len(distances) else 0

    def diameter(self) -> Any:
        values = self.eccentricity()
        return max(values) if len(values) else 0

    def radius(self) -> Any:
        values = self.eccentricity()
        return min(values) if len(values) else 0

    def center(self) -> list[Any]:
        radius = self.radius()
        return [
            vertex for vertex in self._vertices if self.eccentricity(vertex) == radius
        ]

    def is_tree(self) -> bool:
        return (
            not self._directed
            and self.is_connected()
            and self.size() == self.order() - 1
        )

    def is_forest(self) -> bool:
        return not self._directed and self.size() == self.order() - len(
            self.connected_components()
        )

    def girth(self) -> Any:
        if self.has_loops():
            return 1
        if self._multiedges:
            for first in range(len(self._edges)):
                for second in range(first):
                    left = self._edges[first]
                    right = self._edges[second]
                    if self._edge_matches(right, left.source, left.target):
                        return 2
        best = self.order() + 1
        for source in range(self.order()):
            distances = [-1] * self.order()
            parents = [-1] * self.order()
            distances[source] = 0
            queue = [source]
            cursor = 0
            while cursor < len(queue):
                current = queue[cursor]
                cursor += 1
                for target in self._adjacent_indices(current):
                    if distances[target] < 0:
                        distances[target] = distances[current] + 1
                        parents[target] = current
                        queue.append(target)
                    elif self._directed:
                        if target == source:
                            best = min(best, distances[current] + 1)
                    elif parents[current] != target:
                        best = min(best, distances[current] + distances[target] + 1)
        return _graph_positive_infinity if best > self.order() else best

    def is_eulerian(self) -> bool:
        if self.order() == 0:
            return True
        if self._directed:
            if any(
                self.in_degree(vertex) != self.out_degree(vertex)
                for vertex in self._vertices
            ):
                return False
            nonisolated = [
                vertex for vertex in self._vertices if self.degree(vertex) > 0
            ]
            if len(nonisolated) == 0:
                return True
            component = self.subgraph(nonisolated)
            strongly_connected = getattr(  # noqa: B009
                component, "strongly_connected_components"
            )
            return len(strongly_connected()) == 1
        nonisolated = [vertex for vertex in self._vertices if self.degree(vertex) > 0]
        if any([self.degree(vertex) % 2 for vertex in nonisolated]):
            return False
        if len(nonisolated) == 0:
            return True
        return self.subgraph(nonisolated).is_connected()

    def is_regular(self, degree: Any = None) -> bool:
        sequence = self.degree_sequence()
        if len(sequence) == 0:
            return degree is None or int(degree) == 0
        expected = sequence[0] if degree is None else int(degree)
        return all([value == expected for value in sequence])

    def is_bipartite(self, certificate: bool = False) -> Any:
        colors = [-1] * self.order()
        parents = [-1] * self.order()
        for source in range(self.order()):
            if colors[source] >= 0:
                continue
            colors[source] = 0
            queue = [source]
            cursor = 0
            while cursor < len(queue):
                current = queue[cursor]
                cursor += 1
                for target in self._adjacent_indices(current):
                    if colors[target] < 0:
                        colors[target] = 1 - colors[current]
                        parents[target] = current
                        queue.append(target)
                    elif colors[target] == colors[current]:
                        if certificate:
                            current_path = []
                            cursor = current
                            while cursor >= 0:
                                current_path.append(cursor)
                                cursor = parents[cursor]
                            target_path = []
                            cursor = target
                            while cursor >= 0:
                                target_path.append(cursor)
                                cursor = parents[cursor]
                            common = current_path[-1]
                            for candidate in current_path:
                                if candidate in target_path:
                                    common = candidate
                                    break
                            left_stop = current_path.index(common)
                            right_stop = target_path.index(common)
                            cycle_indices = current_path[: left_stop + 1] + list(
                                reversed(target_path[:right_stop])
                            )
                            cycle = [self._vertices[index] for index in cycle_indices]
                            return runtime.math_tuple([False, cycle])
                        return False
        if certificate:
            color_dict = dict()
            for index in range(self.order()):
                color_dict.__setitem__(self._vertices[index], 1 - colors[index])
            return runtime.math_tuple([True, color_dict])
        return True

    def has_loops(self) -> bool:
        return any([edge.source == edge.target for edge in self._edges])

    def loop_edges(self, labels: bool = True) -> list[Any]:
        answer = []
        for edge in self._edges:
            if edge.source == edge.target:
                vertex = self._vertices[edge.source]
                if labels:
                    answer.append(runtime.math_tuple([vertex, vertex, edge.label]))
                else:
                    answer.append(runtime.math_tuple([vertex, vertex]))
        return answer

    def complement(self) -> GenericGraph:
        answer = self._new()
        answer.add_vertices(self._vertices)
        for source in range(self.order()):
            targets = (
                range(self.order())
                if self._directed
                else range(source + 1, self.order())
            )
            for target in targets:
                if source != target and not self.has_edge(
                    self._vertices[source], self._vertices[target]
                ):
                    answer.add_edge(self._vertices[source], self._vertices[target])
        return answer

    def subgraph(
        self, vertices: Any = None, edges: Any = None, **_options: Any
    ) -> GenericGraph:
        selected = list(self._vertices) if vertices is None else list(vertices)
        answer = self._new(
            loops=self._loops, multiedges=self._multiedges, weighted=self._weighted
        )
        answer.add_vertices(selected)
        requested_edges = None if edges is None else list(edges)
        for edge in self._edges:
            source = self._vertices[edge.source]
            target = self._vertices[edge.target]
            if _index_equal(selected, source) < 0 or _index_equal(selected, target) < 0:
                continue
            if requested_edges is not None:
                present = False
                for requested in requested_edges:
                    values = list(requested)
                    if len(values) >= 2 and (
                        (_same(values[0], source) and _same(values[1], target))
                        or (
                            not self._directed
                            and _same(values[0], target)
                            and _same(values[1], source)
                        )
                    ):
                        present = True
                        break
                if not present:
                    continue
            answer.add_edge(source, target, edge.label)
        return answer

    def spanning_tree(self, starting_vertex: Any = None) -> GenericGraph:
        answer = self._new()
        answer.add_vertices(self._vertices)
        if self.order() == 0:
            return answer
        source = 0 if starting_vertex is None else self._vertex_index(starting_vertex)
        if source < 0:
            raise LookupError("vertex is not in graph")
        seen = [False] * self.order()
        seen[source] = True
        queue = [source]
        cursor = 0
        while cursor < len(queue):
            current = queue[cursor]
            cursor += 1
            for target in self._adjacent_indices(current):
                if not seen[target]:
                    seen[target] = True
                    queue.append(target)
                    answer.add_edge(self._vertices[current], self._vertices[target])
        if not all(seen):
            raise ValueError("graph is disconnected")
        return answer

    min_spanning_tree = spanning_tree

    def bridges(self, labels: bool = True) -> list[Any]:
        if self._directed:
            raise ValueError("bridges are defined here only for undirected graphs")
        answer = []
        original_components = len(self.connected_components())
        for edge_index in range(len(self._edges)):
            candidate = self.copy()
            edge = candidate._edges.pop(edge_index)
            if len(candidate.connected_components()) > original_components:
                source = self._vertices[edge.source]
                target = self._vertices[edge.target]
                if labels:
                    answer.append(runtime.math_tuple([source, target, edge.label]))
                else:
                    answer.append(runtime.math_tuple([source, target]))
        return answer

    def to_directed(self) -> DiGraph:
        answer = runtime.reflect.construct(DiGraph, [])
        answer._loops = self._loops
        answer._multiedges = self._multiedges
        answer._weighted = self._weighted
        answer.add_vertices(self._vertices)
        for edge in self._edges:
            source = self._vertices[edge.source]
            target = self._vertices[edge.target]
            answer.add_edge(source, target, edge.label)
            if edge.source != edge.target:
                answer.add_edge(target, source, edge.label)
        return answer

    def to_undirected(self) -> Graph:
        answer = runtime.reflect.construct(Graph, [])
        answer._loops = self._loops
        answer._multiedges = self._multiedges
        answer._weighted = self._weighted
        answer.add_vertices(self._vertices)
        for edge in self._edges:
            answer.add_edge(
                self._vertices[edge.source], self._vertices[edge.target], edge.label
            )
        return answer

    def cartesian_product(self, other: GenericGraph) -> GenericGraph:
        if self._directed != other._directed:
            raise TypeError("cartesian product needs graphs of the same kind")
        answer = self._new()
        for left in self._vertices:
            for right in other._vertices:
                answer.add_vertex((left, right))
        for edge in self._edges:
            for right in other._vertices:
                answer.add_edge(
                    (self._vertices[edge.source], right),
                    (self._vertices[edge.target], right),
                    edge.label,
                )
        for edge in other._edges:
            for left in self._vertices:
                answer.add_edge(
                    (left, other._vertices[edge.source]),
                    (left, other._vertices[edge.target]),
                    edge.label,
                )
        return answer

    def adjacency_matrix(self, **_options: Any) -> Any:
        rows = [
            [0 for _target in range(self.order())] for _source in range(self.order())
        ]
        for edge in self._edges:
            rows[edge.source][edge.target] += 1
            if not self._directed and edge.source != edge.target:
                rows[edge.target][edge.source] += 1
        factory = runtime.reflect.get(runtime.global_object, "matrix")
        return runtime.reflect.apply(factory, runtime.undefined, [rows])

    def _edge_signature(self, source: int, target: int, edge_labels: bool) -> str:
        labels = []
        for edge in self._edges:
            if self._edge_matches(edge, source, target):
                labels.append(_label_code(edge.label) if edge_labels else "*")
        labels.sort()
        return "|".join(labels)

    def _vertex_signature(self, index: int, edge_labels: bool) -> str:
        if self._directed:
            prefix = (
                str(self.in_degree(self._vertices[index]))
                + ":"
                + str(self.out_degree(self._vertices[index]))
            )
        else:
            prefix = str(self.degree(self._vertices[index]))
        loop = self._edge_signature(index, index, edge_labels)
        return prefix + ";" + loop

    def _all_isomorphisms(
        self,
        other: GenericGraph,
        edge_labels: bool = False,
        first_only: bool = False,
    ) -> list[list[int]]:
        if (
            self._directed != other._directed
            or self.order() != other.order()
            or self.size() != other.size()
        ):
            return []
        order = self.order()
        left_signatures = [
            self._vertex_signature(index, edge_labels) for index in range(order)
        ]
        right_signatures = [
            other._vertex_signature(index, edge_labels) for index in range(order)
        ]
        if sorted(left_signatures) != sorted(right_signatures):
            return []
        mapping = [-1] * order
        used = [False] * order
        answers = []

        def compatible(source: int, target: int) -> bool:
            if left_signatures[source] != right_signatures[target]:
                return False
            for mapped_source in range(order):
                mapped_target = mapping[mapped_source]
                if mapped_target < 0:
                    continue
                if self._edge_signature(
                    source, mapped_source, edge_labels
                ) != other._edge_signature(target, mapped_target, edge_labels):
                    return False
                if self._directed and self._edge_signature(
                    mapped_source, source, edge_labels
                ) != other._edge_signature(mapped_target, target, edge_labels):
                    return False
            return True

        def search(depth: int) -> None:
            if first_only and len(answers):
                return
            if depth == order:
                answers.append(list(mapping))
                return
            best_source = -1
            best_targets = []
            for source in range(order):
                if mapping[source] >= 0:
                    continue
                targets = [
                    target
                    for target in range(order)
                    if not used[target] and compatible(source, target)
                ]
                if len(targets) == 0:
                    return
                if best_source < 0 or len(targets) < len(best_targets):
                    best_source = source
                    best_targets = targets
            for target in best_targets:
                mapping[best_source] = target
                used[target] = True
                search(depth + 1)
                used[target] = False
                mapping[best_source] = -1

        search(0)
        return answers

    def is_isomorphic(
        self,
        other: Any,
        certificate: bool = False,
        edge_labels: bool = False,
        **_options: Any,
    ) -> Any:
        if not isinstance(other, GenericGraph):
            return runtime.math_tuple([False, None]) if certificate else False
        if not certificate and not edge_labels:
            backend = _native_graph_backend()
            if backend is not None and self._directed == other._directed:
                try:
                    native_function = runtime.reflect.get(backend, "isomorphic")
                    return bool(
                        runtime.reflect.apply(
                            native_function,
                            backend,
                            [self._native_data(), other._native_data()],
                        )
                    )
                except Exception:
                    pass
        mappings = self._all_isomorphisms(other, edge_labels, True)
        if len(mappings) == 0:
            return runtime.math_tuple([False, None]) if certificate else False
        if not certificate:
            return True
        mapping = dict()
        for index in range(self.order()):
            mapping.__setitem__(
                self._vertices[index], other._vertices[mappings[0][index]]
            )
        return runtime.math_tuple([True, mapping])

    def automorphism_group(
        self,
        edge_labels: bool = False,
        **_options: Any,
    ) -> GraphAutomorphismGroup:
        if not edge_labels:
            backend = self._native_simple_backend()
            if backend is not None:
                try:
                    native_function = runtime.reflect.get(backend, "automorphismGroup")
                    data = runtime.reflect.apply(
                        native_function, backend, [self._native_data()]
                    )
                    generators = [
                        list(mapping)
                        for mapping in runtime.reflect.get(data, "generators")
                    ]
                    order = int(str(runtime.reflect.get(data, "order")))
                    return GraphAutomorphismGroup(
                        self._vertices,
                        generators,
                        known_order=order,
                        generators_only=True,
                    )
                except Exception:
                    pass
        return GraphAutomorphismGroup(
            self._vertices,
            self._all_isomorphisms(self, edge_labels, False),
        )

    def _canonical_code(self, ordering: list[int], edge_labels: bool) -> str:
        pieces = []
        for source in ordering:
            for target in ordering:
                if not self._directed and target < source:
                    continue
                pieces.append(self._edge_signature(source, target, edge_labels))
                pieces.append(";")
        return "".join(pieces)

    def _refine_partition(
        self,
        partition: list[list[int]],
        edge_labels: bool,
    ) -> list[list[int]]:
        current = [list(cell) for cell in partition]
        changed = True
        while changed:
            changed = False
            refined = []
            for cell in current:
                buckets = {}
                for vertex in cell:
                    signature_parts = []
                    for target_cell in current:
                        outgoing = [
                            self._edge_signature(vertex, target, edge_labels)
                            for target in target_cell
                        ]
                        outgoing.sort()
                        signature_parts.append(repr(outgoing))
                        if self._directed:
                            incoming = [
                                self._edge_signature(target, vertex, edge_labels)
                                for target in target_cell
                            ]
                            incoming.sort()
                            signature_parts.append(repr(incoming))
                    signature = ":".join(signature_parts)
                    if signature not in buckets:
                        buckets[signature] = []
                    buckets[signature].append(vertex)
                keys = sorted(list(runtime.object.keys(buckets)))
                if len(keys) > 1:
                    changed = True
                for key in keys:
                    refined.append(buckets[key])
            current = refined
        return current

    def canonical_label(
        self,
        partition: Any = None,
        certificate: bool = False,
        edge_labels: bool = False,
        **_options: Any,
    ) -> Any:
        if partition is None and not edge_labels:
            backend = self._native_simple_backend()
            if backend is not None:
                try:
                    packed_edges = []
                    for edge in self._edges:
                        packed_edges.extend([edge.source, edge.target])
                    permutation = [0] * self.order()
                    _canonical_permutation(
                        permutation,
                        packed_edges,
                        self.order(),
                        len(packed_edges),
                        self._directed,
                    )
                    answer = self._new(
                        loops=self._loops,
                        multiedges=self._multiedges,
                        weighted=self._weighted,
                    )
                    answer.add_vertices(range(self.order()))
                    for edge in self._edges:
                        answer.add_edge(
                            permutation[edge.source],
                            permutation[edge.target],
                            edge.label,
                        )
                    if certificate:
                        mapping = {}
                        for index in range(self.order()):
                            mapping[self._vertices[index]] = permutation[index]
                        return runtime.math_tuple([answer, mapping])
                    return answer
                except Exception:
                    pass
        del partition
        order = self.order()
        signatures = [
            self._vertex_signature(index, edge_labels) for index in range(order)
        ]
        buckets = {}
        for index in range(order):
            signature = signatures[index]
            if signature not in buckets:
                buckets[signature] = []
            buckets[signature].append(index)
        initial_partition = [
            buckets[key] for key in sorted(list(runtime.object.keys(buckets)))
        ]
        best_order = None
        best_code = None

        def search(current_partition: list[list[int]]) -> None:
            nonlocal best_code, best_order
            refined = self._refine_partition(current_partition, edge_labels)
            if all([len(cell) == 1 for cell in refined]):
                ordering = [cell[0] for cell in refined]
                code = self._canonical_code(ordering, edge_labels)
                if best_code is None or code < best_code:
                    best_code = code
                    best_order = ordering
                return
            split_index = 0
            while len(refined[split_index]) == 1:
                split_index += 1
            split_cell = refined[split_index]
            for vertex in split_cell:
                remainder = [
                    candidate for candidate in split_cell if candidate != vertex
                ]
                branch = (
                    refined[:split_index]
                    + [[vertex], remainder]
                    + refined[split_index + 1 :]
                )
                search(branch)

        search(initial_partition)
        if best_order is None:
            best_order = []
        inverse = [-1] * order
        for new_index in range(order):
            inverse[best_order[new_index]] = new_index
        answer = self._new(
            loops=self._loops, multiedges=self._multiedges, weighted=self._weighted
        )
        answer.add_vertices(range(order))
        for edge in self._edges:
            answer.add_edge(inverse[edge.source], inverse[edge.target], edge.label)
        if certificate:
            mapping = dict()
            for index in range(order):
                mapping.__setitem__(self._vertices[index], inverse[index])
            return runtime.math_tuple([answer, mapping])
        return answer

    def graph6_string(self) -> str:
        if self._directed or self._multiedges or self.has_loops():
            raise ValueError("graph6 supports only simple undirected graphs")
        bits = []
        for target in range(1, self.order()):
            for source in range(target):
                bits.append(1 if self._edge_signature(source, target, False) else 0)
        return _encode_order(self.order()) + _text_from_bits(bits)

    def sparse6_string(self) -> str:
        if self._directed:
            raise ValueError("sparse6 supports only undirected graphs")
        order = self.order()
        width = 1
        while (1 << width) < order:
            width += 1

        def encoded(value: int) -> list[int]:
            return [
                1 if value & (1 << (width - 1 - index)) else 0 for index in range(width)
            ]

        edge_pairs = sorted(
            [
                (max(edge.source, edge.target), min(edge.source, edge.target))
                for edge in self._edges
            ]
        )
        bits = []
        current = 0
        for target, source in edge_pairs:
            if target == current:
                bits.append(0)
                bits.extend(encoded(source))
            elif target == current + 1:
                current += 1
                bits.append(1)
                bits.extend(encoded(source))
            else:
                current = target
                bits.append(1)
                bits.extend(encoded(target))
                bits.append(0)
                bits.extend(encoded(source))
        padding = (-len(bits)) % 6
        if (
            width < 6
            and order == (1 << width)
            and padding >= width
            and current < order - 1
        ):
            bits.append(0)
            bits.extend([1] * ((-len(bits)) % 6))
        else:
            bits.extend([1] * padding)
        return ":" + _encode_order(order) + _text_from_bits(bits)

    def relabel(self, perm: Any = None, inplace: bool = True, **_options: Any) -> Any:
        answer = self if inplace else self.copy()
        old_vertices = list(answer._vertices)
        if perm is None:
            new_vertices = list(range(answer.order()))
        elif callable(perm):
            new_vertices = [perm(vertex) for vertex in old_vertices]
        elif isinstance(perm, dict):
            new_vertices = [perm.get(vertex, vertex) for vertex in old_vertices]
        else:
            values = list(perm)
            if len(values) != answer.order():
                raise ValueError("relabeling has the wrong length")
            new_vertices = values
        for first in range(len(new_vertices)):
            if _index_equal(new_vertices[:first], new_vertices[first]) >= 0:
                raise ValueError("relabeling must be injective")
        answer._vertices = new_vertices
        if inplace:
            return None
        return answer

    def _maximum_clique_indices(self) -> list[int]:
        if self._directed:
            raise ValueError("cliques are defined here only for undirected graphs")
        best = []

        def expand(clique: list[int], candidates: list[int]) -> None:
            nonlocal best
            if len(clique) + len(candidates) <= len(best):
                return
            while len(candidates):
                vertex = candidates.pop()
                next_candidates = [
                    candidate
                    for candidate in candidates
                    if self._edge_signature(vertex, candidate, False)
                ]
                expand(clique + [vertex], next_candidates)
            if len(clique) > len(best):
                best = list(clique)

        expand([], list(range(self.order())))
        return best

    def clique_maximum(self, **_options: Any) -> list[Any]:
        return [self._vertices[index] for index in self._maximum_clique_indices()]

    maximum_clique = clique_maximum

    def clique_number(self, **_options: Any) -> int:
        return len(self._maximum_clique_indices())

    def independent_set(self, **_options: Any) -> list[Any]:
        return self.complement().clique_maximum()

    def vertex_cover(self, **_options: Any) -> list[Any]:
        independent = self.independent_set()
        return [
            vertex for vertex in self._vertices if _index_equal(independent, vertex) < 0
        ]

    def coloring(self, hex_colors: bool = False, **_options: Any) -> Any:
        order = self.order()
        colors = [-1] * order
        best = [index for index in range(order)]
        best_count = order

        def search(colored: int, used_count: int) -> None:
            nonlocal best, best_count
            if used_count >= best_count:
                return
            if colored == order:
                best = list(colors)
                best_count = used_count
                return
            vertex = -1
            best_saturation = -1
            best_degree = -1
            for candidate in range(order):
                if colors[candidate] >= 0:
                    continue
                adjacent_colors = []
                for neighbor in self._adjacent_indices(candidate):
                    color = colors[neighbor]
                    if color >= 0 and color not in adjacent_colors:
                        adjacent_colors.append(color)
                degree = len(self._adjacent_indices(candidate))
                if len(adjacent_colors) > best_saturation or (
                    len(adjacent_colors) == best_saturation and degree > best_degree
                ):
                    vertex = candidate
                    best_saturation = len(adjacent_colors)
                    best_degree = degree
            forbidden = [
                colors[neighbor]
                for neighbor in self._adjacent_indices(vertex)
                if colors[neighbor] >= 0
            ]
            for color in range(used_count + 1):
                if color in forbidden:
                    continue
                if color == used_count and used_count + 1 >= best_count:
                    continue
                colors[vertex] = color
                search(colored + 1, max(used_count, color + 1))
                colors[vertex] = -1

        if order == 0:
            return dict()
        search(0, 0)
        classes = dict()
        palette = ["#377eb8", "#e41a1c", "#4daf4a", "#984ea3", "#ff7f00", "#ffff33"]
        for index in range(order):
            key = palette[best[index] % len(palette)] if hex_colors else best[index]
            if key not in classes:
                classes.__setitem__(key, [])
            classes.__getitem__(key).append(self._vertices[index])
        return classes

    def chromatic_number(self, **options: Any) -> int:
        return len(self.coloring(**options))

    def graphplot(self, **options: Any) -> GraphPlot:
        """Return the graph-specific renderer used to construct a plot."""
        return GraphPlot(self, **options)

    def plot(self, **options: Any) -> Any:
        """Return a composable two-dimensional graphics object."""
        return self.graphplot(**options).plot()

    def show(self, **options: Any) -> Any:
        if bool(_record_get(options, "interactive", False)) or str(
            _record_get(options, "renderer", "")
        ).lower() in ("interactive", "svg"):
            return self.graphplot(**options).show()
        return self.plot(**options).show()


class Graph(GenericGraph):
    """Finite undirected graph with Sage-compatible construction."""

    _directed = False


class DiGraph(GenericGraph):
    """Finite directed graph with Sage-compatible construction."""

    _directed = True

    def reverse(self) -> DiGraph:
        answer = runtime.reflect.construct(DiGraph, [])
        answer._loops = self._loops
        answer._multiedges = self._multiedges
        answer._weighted = self._weighted
        answer.add_vertices(self._vertices)
        for edge in self._edges:
            answer.add_edge(
                self._vertices[edge.target], self._vertices[edge.source], edge.label
            )
        return answer

    def topological_sort(self, **_options: Any) -> list[Any]:
        indegrees = [int(self.in_degree(vertex)) for vertex in self._vertices]
        queue = [index for index in range(self.order()) if indegrees[index] == 0]
        answer = []
        cursor = 0
        while cursor < len(queue):
            source = queue[cursor]
            cursor += 1
            answer.append(self._vertices[source])
            for target in self._adjacent_indices(source):
                indegrees[target] -= 1
                if indegrees[target] == 0:
                    queue.append(target)
        if len(answer) != self.order():
            raise TypeError("digraph is not acyclic")
        return answer

    def is_directed_acyclic(self) -> bool:
        try:
            self.topological_sort()
            return True
        except TypeError:
            return False

    is_dag = is_directed_acyclic

    def strongly_connected_components(self) -> list[list[Any]]:
        order = self.order()
        visited = [False] * order
        finishing = []

        def visit(source: int) -> None:
            visited[source] = True
            for target in self._adjacent_indices(source):
                if not visited[target]:
                    visit(target)
            finishing.append(source)

        for source in range(order):
            if not visited[source]:
                visit(source)
        visited = [False] * order
        answer = []

        def reverse_visit(source: int, component: list[Any]) -> None:
            visited[source] = True
            component.append(self._vertices[source])
            for target in self._adjacent_indices(source, reverse=True):
                if not visited[target]:
                    reverse_visit(target, component)

        for source in reversed(finishing):
            if not visited[source]:
                component = []
                reverse_visit(source, component)
                answer.append(component)
        return answer


class GraphGenerators:
    """Sage's `graphs` namespace of named and parametric graphs."""

    def EmptyGraph(self, immutable: bool = False) -> Graph:
        del immutable
        return Graph(name="Empty graph")

    def CompleteGraph(self, order: int, immutable: bool = False) -> Graph:
        del immutable
        graph = Graph(order, name="Complete graph")
        graph.add_clique(range(order))
        if order == 1:
            graph.set_pos(_position_dict([[0, 0, 0]]))
        else:
            graph._circle_embedding(range(order), angle=3.141592653589793 / 2)
        return graph

    def CompleteBipartiteGraph(
        self,
        left: int,
        right: int,
        set_position: bool = True,
        immutable: bool = False,
        name: str | None = None,
    ) -> Graph:
        del immutable
        if left < 0 or right < 0:
            raise ValueError("the part sizes must be nonnegative")
        if name is None:
            name = "Complete bipartite graph of order " + str(left) + "+" + str(right)
        graph = Graph(left + right, name=name)
        for source in range(left):
            for target in range(left, left + right):
                graph.add_edge(source, target)
        if set_position:
            width = max(left, right)
            graph._line_embedding(range(left), first=(0, 1), last=(width, 1))
            graph._line_embedding(
                range(left, left + right), first=(0, 0), last=(width, 0)
            )
        return graph

    def PathGraph(
        self,
        order: int,
        pos: Any = None,
        immutable: bool = False,
        name: str | None = None,
    ) -> Graph:
        del immutable
        graph = Graph(order, name="Path graph" if name is None else name)
        graph.add_path(range(order))
        circle = pos == "circle" or (pos != "line" and 10 < order < 41)
        if circle:
            if order == 1:
                graph.set_pos(_position_dict([[0, 0, 0]]))
            else:
                graph._circle_embedding(range(order), angle=3.141592653589793 / 2)
        else:
            positions = {}
            for index in range(order):
                row = index // 10
                offset = index % 10
                x = offset if row % 2 == 0 else 9 - offset
                positions[index] = (x, -row)
            graph.set_pos(positions)
        return graph

    def CycleGraph(self, order: int, immutable: bool = False) -> Graph:
        del immutable
        if order < 0:
            raise ValueError("parameter n must be a positive integer")
        graph = Graph(order, name="Cycle graph")
        if order > 1:
            graph.add_cycle(range(order))
        if order == 1:
            graph.set_pos(_position_dict([[0, 0, 0]]))
        else:
            graph._circle_embedding(range(order), angle=3.141592653589793 / 2)
        return graph

    def StarGraph(self, leaves: int, immutable: bool = False) -> Graph:
        del immutable
        graph = Graph(leaves + 1, name="Star graph")
        for vertex in range(1, leaves + 1):
            graph.add_edge(0, vertex)
        graph.set_pos(_position_dict([[0, 0, 0]]))
        graph._circle_embedding(range(1, leaves + 1), angle=3.141592653589793 / 2)
        return graph

    def WheelGraph(self, order: int, immutable: bool = False) -> Graph:
        del immutable
        if order < 0:
            raise ValueError("parameter n must be a positive integer")
        if order < 4:
            graph = self.CycleGraph(order)
            graph.graph_name("Wheel graph")
            return graph
        graph = Graph(order, name="Wheel graph")
        graph.add_cycle(range(1, order))
        for vertex in range(1, order):
            graph.add_edge(0, vertex)
        graph._circle_embedding(range(1, order), angle=3.141592653589793 / 2)
        graph._pos[0] = (0, 0)
        return graph

    def Grid2dGraph(
        self,
        rows: int,
        columns: int,
        set_positions: bool = True,
        immutable: bool = False,
        name: str | None = None,
    ) -> Graph:
        del immutable
        if rows <= 0 or columns <= 0:
            raise ValueError("parameters p and q must be positive integers")
        vertices = []
        for row in range(rows):
            for column in range(columns):
                vertices.append(runtime.math_tuple([row, column]))
        if name is None:
            name = "2D Grid Graph for [" + str(rows) + ", " + str(columns) + "]"
        graph = Graph(name=name)
        graph.add_vertices(vertices)
        for row in range(rows):
            for column in range(columns):
                if row + 1 < rows:
                    graph.add_edge(
                        runtime.math_tuple([row, column]),
                        runtime.math_tuple([row + 1, column]),
                    )
                if column + 1 < columns:
                    graph.add_edge(
                        runtime.math_tuple([row, column]),
                        runtime.math_tuple([row, column + 1]),
                    )
        if set_positions:
            positions = {}
            for row in range(rows):
                for column in range(columns):
                    vertex = runtime.math_tuple([row, column])
                    positions[vertex] = runtime.math_tuple([column, -row])
            graph.set_pos(positions)
        return graph

    def GeneralizedPetersenGraph(
        self,
        order: int,
        step: int,
        immutable: bool = False,
        name: str | None = None,
    ) -> Graph:
        del immutable
        if order < 3:
            raise ValueError("n must be larger than 2")
        if step < 1 or step > (order - 1) // 2:
            raise ValueError("k must be in 1<= k <=floor((n-1)/2)")
        if name is None:
            name = (
                "Generalized Petersen graph (n=" + str(order) + ",k=" + str(step) + ")"
            )
        graph = Graph(2 * order, name=name)
        for index in range(order):
            graph.add_edge(index, (index + 1) % order)
            graph.add_edge(index, index + order)
            graph.add_edge(index + order, order + (index + step) % order)
        graph._circle_embedding(range(order), radius=1, angle=3.141592653589793 / 2)
        graph._circle_embedding(
            range(order, 2 * order), radius=0.5, angle=3.141592653589793 / 2
        )
        return graph

    def PetersenGraph(self, immutable: bool = False) -> Graph:
        # Keep this internal call positional.  Besides avoiding unnecessary
        # keyword machinery in a hot constructor, it remains safe when a live
        # Jupyter worker straddles a compiler/bootstrap rebuild.
        return self.GeneralizedPetersenGraph(5, 2, immutable, "Petersen graph")

    def HouseGraph(self, immutable: bool = False) -> Graph:
        del immutable
        return Graph(
            [(0, 1), (0, 2), (1, 3), (2, 3), (2, 4), (3, 4)],
            pos=_position_dict(
                [
                    [0, -1, 0],
                    [1, 1, 0],
                    [2, -1, 1],
                    [3, 1, 1],
                    [4, 0, 2],
                ]
            ),
            name="House Graph",
        )

    def BullGraph(self, immutable: bool = False) -> Graph:
        del immutable
        return Graph(
            [(0, 1), (0, 2), (1, 2), (1, 3), (2, 4)],
            pos=_position_dict(
                [
                    [0, 0, 0],
                    [1, -1, 1],
                    [2, 1, 1],
                    [3, -2, 2],
                    [4, 2, 2],
                ]
            ),
            name="Bull graph",
        )

    def DiamondGraph(self, immutable: bool = False) -> Graph:
        del immutable
        return Graph(
            [(0, 1), (0, 2), (1, 2), (1, 3), (2, 3)],
            pos=_position_dict(
                [
                    [0, 0, 1],
                    [1, -1, 0],
                    [2, 1, 0],
                    [3, 0, -1],
                ]
            ),
            name="Diamond Graph",
        )

    def TetrahedralGraph(self, immutable: bool = False) -> Graph:
        del immutable
        pi = 3.141592653589793
        return Graph(
            [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)],
            pos=_position_dict(
                [
                    [0, 0, 0],
                    [1, 0, 1],
                    [2, runtime.math.cos(3.5 * pi / 3), runtime.math.sin(3.5 * pi / 3)],
                    [3, runtime.math.cos(5.5 * pi / 3), runtime.math.sin(5.5 * pi / 3)],
                ]
            ),
            name="Tetrahedron",
        )

    def HexahedralGraph(self, immutable: bool = False) -> Graph:
        del immutable
        return Graph(
            [
                (0, 1),
                (0, 3),
                (0, 4),
                (1, 2),
                (1, 5),
                (2, 3),
                (2, 6),
                (3, 7),
                (4, 5),
                (4, 7),
                (5, 6),
                (6, 7),
            ],
            pos=_position_dict(
                [
                    [0, 0, 0],
                    [1, 1, 0],
                    [3, 0, 1],
                    [2, 1, 1],
                    [4, 0.5, 0.5],
                    [5, 1.5, 0.5],
                    [7, 0.5, 1.5],
                    [6, 1.5, 1.5],
                ]
            ),
            name="Hexahedron",
        )

    def OctahedralGraph(self, immutable: bool = False) -> Graph:
        del immutable
        graph = Graph(
            [
                (0, 1),
                (0, 2),
                (0, 3),
                (0, 4),
                (1, 2),
                (1, 3),
                (1, 5),
                (2, 4),
                (2, 5),
                (3, 4),
                (3, 5),
                (4, 5),
            ],
            name="Octahedron",
        )
        graph._circle_embedding([0, 1, 2], radius=5, angle=3.141592653589793 / 2)
        graph._circle_embedding([4, 3, 5], radius=1, angle=3.141592653589793 / 6)
        return graph

    def IcosahedralGraph(self, immutable: bool = False) -> Graph:
        del immutable
        graph = Graph(
            [
                (0, 1),
                (0, 5),
                (0, 7),
                (0, 8),
                (0, 11),
                (1, 2),
                (1, 5),
                (1, 6),
                (1, 8),
                (2, 3),
                (2, 6),
                (2, 8),
                (2, 9),
                (3, 4),
                (3, 6),
                (3, 9),
                (3, 10),
                (4, 5),
                (4, 6),
                (4, 10),
                (4, 11),
                (5, 6),
                (5, 11),
                (7, 8),
                (7, 9),
                (7, 10),
                (7, 11),
                (8, 9),
                (9, 10),
                (10, 11),
            ],
            name="Icosahedron",
        )
        graph._circle_embedding(
            [2, 8, 7, 11, 4, 6], radius=5, angle=3.141592653589793 / 6
        )
        graph._circle_embedding(
            [1, 9, 0, 10, 5, 3], radius=2, angle=3.141592653589793 / 6
        )
        return graph

    def DodecahedralGraph(self, immutable: bool = False) -> Graph:
        del immutable
        graph = Graph(
            [
                (0, 1),
                (0, 10),
                (0, 19),
                (1, 2),
                (1, 8),
                (2, 3),
                (2, 6),
                (3, 4),
                (3, 19),
                (4, 5),
                (4, 17),
                (5, 6),
                (5, 15),
                (6, 7),
                (7, 8),
                (7, 14),
                (8, 9),
                (9, 10),
                (9, 13),
                (10, 11),
                (11, 12),
                (11, 18),
                (12, 13),
                (12, 16),
                (13, 14),
                (14, 15),
                (15, 16),
                (16, 17),
                (17, 18),
                (18, 19),
            ],
            name="Dodecahedron",
        )
        pi = 3.141592653589793
        graph._circle_embedding([19, 0, 1, 2, 3], radius=7, angle=pi / 10)
        graph._circle_embedding([18, 10, 8, 6, 4], radius=4.7, angle=pi / 10)
        graph._circle_embedding([11, 9, 7, 5, 17], radius=3.8, angle=3 * pi / 10)
        graph._circle_embedding([12, 13, 14, 15, 16], radius=1.5, angle=3 * pi / 10)
        return graph

    def RandomGNP(
        self,
        n: int,
        p: float,
        seed: Any = None,
        fast: bool = True,
        algorithm: str = "Sage",
        immutable: bool = False,
    ) -> Graph:
        r"""
        Return a random graph on `n` vertices.

        Every possible edge is inserted independently with probability `p`.

        ### Input

        - `n` -- nonnegative number of vertices
        - `p` -- edge probability in the interval `[0, 1]`
        - `seed` -- optional local random seed
        - `fast` -- use the sparse `O(n+m)` Batagelj--Brandes algorithm
        - `algorithm` -- `'Sage'` (or `'sage'`); `'networkx'` is
          accepted only when that optional Python package is available
        - `immutable` -- request an immutable graph (currently accepted for
          Sage call compatibility; immutable graphs are not yet implemented)

        ### Examples

        The endpoints `p=0` and `p=1` are deterministic:

        ```sage
            sage: graphs.RandomGNP(5, 0).size()
            0
            sage: graphs.RandomGNP(4, 1)
            Complete graph: Graph on 4 vertices
        ```

        A seed makes a generated graph reproducible without changing the
        process-wide Sage random state:

        ```sage
            sage: a = graphs.RandomGNP(12, .3, seed=7)
            sage: b = graphs.RandomGNP(12, .3, seed=7)
            sage: a.edges(sort=True, labels=False) == b.edges(sort=True, labels=False)
            True
        ```

        Graph plots are ordinary composable graphics, as in Sage:

        ```sage
            sage: rows = [[graphs.RandomGNP(3+i+3*j, .43, seed=i+3*j).plot(
            ....:          vertex_size=10, vertex_labels=False) for i in range(3)]
            ....:         for j in range(3)]
            sage: graphics_array(rows)
            Graphics Array of size 3 x 3
        ```

        This API and documentation are adapted from
        `sage.graphs.generators.random.RandomGNP` (GPL-2.0-or-later).
        """
        del immutable
        order = int(n)
        probability = float(p)
        if order < 0:
            raise ValueError("The number of nodes must be positive or null.")
        if probability < 0 or probability > 1:
            raise ValueError("The probability p must be in [0..1].")
        if algorithm == "networkx":
            raise ImportError(
                "algorithm='networkx' requires the optional networkx package"
            )
        if algorithm not in ("Sage", "sage"):
            raise ValueError("'algorithm' must be equal to 'networkx' or to 'Sage'")
        if probability == 1:
            return self.CompleteGraph(order)
        graph = Graph(order, name="Random G(n,p) graph")
        if probability == 0 or order < 2:
            return graph

        local_state = None
        if seed is not None:
            local_state = 5381
            for character in str(seed):
                local_state = (local_state * 33 + ord(character)) % 4294967296
            if local_state == 0:
                local_state = 1

        def random_float() -> float:
            nonlocal local_state
            if local_state is None:
                random_function = runtime.reflect.get(runtime.global_object, "random")
                return float(
                    runtime.reflect.apply(random_function, runtime.undefined, [])
                )
            local_state = (1664525 * local_state + 1013904223) % 4294967296
            return local_state / 4294967296

        if fast:
            # Batagelj--Brandes skip sampling: expected O(n+m) work for
            # sparse graphs, while retaining independent Bernoulli edges.
            log_not_p = runtime.math.log(1.0 - probability)
            source = 1
            target = -1
            while source < order:
                draw = random_float()
                if draw == 0:
                    draw = 1.0 / 4294967296
                target += 1 + int(
                    runtime.math.floor(runtime.math.log(1.0 - draw) / log_not_p)
                )
                while target >= source and source < order:
                    target -= source
                    source += 1
                if source < order:
                    graph.add_edge(source, target)
            return graph

        for source in range(order):
            for target in range(source + 1, order):
                if random_float() < probability:
                    graph.add_edge(source, target)
        return graph


graphs = GraphGenerators()


class DigraphGenerators:
    """Sage's `digraphs` namespace."""

    def Path(self, order: int) -> DiGraph:
        graph = DiGraph(order, name="Path digraph")
        graph.add_path(range(order))
        return graph

    def Circuit(self, order: int) -> DiGraph:
        graph = DiGraph(order, name="Circuit")
        graph.add_cycle(range(order))
        return graph

    def Complete(self, order: int) -> DiGraph:
        graph = DiGraph(order, name="Complete digraph")
        for source in range(order):
            for target in range(order):
                if source != target:
                    graph.add_edge(source, target)
        return graph


digraphs = DigraphGenerators()


_GRAPH_DATABASE_TABLES = {
    "graph_id": "graph_data",
    "graph6": "graph_data",
    "num_vertices": "graph_data",
    "num_edges": "graph_data",
    "num_cycles": "graph_data",
    "num_hamiltonian_cycles": "graph_data",
    "eulerian": "graph_data",
    "planar": "graph_data",
    "perfect": "graph_data",
    "lovasz_number": "graph_data",
    "complement_graph6": "graph_data",
    "degree_sequence": "degrees",
    "min_degree": "degrees",
    "max_degree": "degrees",
    "average_degree": "degrees",
    "degrees_sd": "degrees",
    "regular": "degrees",
    "aut_grp_size": "aut_grp",
    "num_orbits": "aut_grp",
    "num_fixed_points": "aut_grp",
    "vertex_transitive": "aut_grp",
    "edge_transitive": "aut_grp",
    "diameter": "misc",
    "radius": "misc",
    "girth": "misc",
    "num_components": "misc",
    "num_spanning_trees": "misc",
    "independence_number": "misc",
    "clique_number": "misc",
    "min_vertex_cover_size": "misc",
    "num_cut_vertices": "misc",
    "vertex_connectivity": "misc",
    "edge_connectivity": "misc",
    "energy": "spectrum",
    "max_eigenvalue": "spectrum",
    "min_eigenvalue": "spectrum",
    "eigenvalues_sd": "spectrum",
}


def _graph_database_default_path() -> str:
    process = runtime.reflect.get(runtime.global_object, "process")
    env = runtime.reflect.get(process, "env")
    configured = runtime.reflect.get(env, "SAGEJS_GRAPH_DATABASE")
    if configured is not runtime.undefined and configured:
        return str(configured)
    path_module = runtime.require_module("node:path")
    fs_module = runtime.require_module("node:fs")
    join_path = runtime.reflect.get(path_module, "join")
    dirname = runtime.reflect.get(path_module, "dirname")
    exists = runtime.reflect.get(fs_module, "existsSync")
    cwd = runtime.reflect.apply(runtime.reflect.get(process, "cwd"), process, [])
    argv = runtime.reflect.get(process, "argv")
    candidates = [
        runtime.reflect.apply(
            join_path,
            path_module,
            [cwd, "src", "lib", "sage", "graphs", "data", "graphs.db"],
        ),
    ]
    if len(argv) > 1:
        executable_dir = runtime.reflect.apply(dirname, path_module, [argv[1]])
        candidates.append(
            runtime.reflect.apply(
                join_path,
                path_module,
                [
                    executable_dir,
                    "..",
                    "src",
                    "lib",
                    "sage",
                    "graphs",
                    "data",
                    "graphs.db",
                ],
            )
        )
    for candidate in candidates:
        if runtime.reflect.apply(exists, fs_module, [candidate]):
            return str(candidate)
    return str(candidates[0])


def _graph_database_parameter(value: Any) -> Any:
    if value is True:
        return 1
    if value is False:
        return 0
    return value


class GraphQuery:
    """Lazy query against Sage's database of small unlabeled graphs."""

    def __init__(
        self,
        database: Any,
        conditions: dict[str, Any],
        limit: int | None = None,
    ) -> None:
        self._database = database
        joins = []
        clauses = []
        parameters = []
        for column in runtime.object.keys(conditions):
            value = runtime.reflect.get(conditions, column)
            table = _record_get(_GRAPH_DATABASE_TABLES, column)
            if table is None:
                raise ValueError("unknown graph database field: " + column)
            if table != "graph_data" and table not in joins:
                joins.append(table)
            operator = "="
            operand = value
            if isinstance(value, (list, tuple)) and len(value) == 2:
                operator = str(value[0]).upper()
                operand = value[1]
                if operator not in ("=", "!=", "<", "<=", ">", ">=", "LIKE"):
                    raise ValueError("unsupported graph query operator: " + operator)
            clauses.append(table + "." + column + " " + operator + " ?")
            parameters.append(_graph_database_parameter(operand))
        sql = "SELECT graph_data.graph6 FROM graph_data "
        for table in joins:
            sql += (
                "INNER JOIN "
                + table
                + " ON graph_data.graph_id = "
                + table
                + ".graph_id "
            )
        if len(clauses):
            sql += "WHERE " + " AND ".join(clauses) + " "
        sql += "ORDER BY graph_data.graph6"
        if limit is not None:
            if int(limit) < 0:
                raise ValueError("query limit must be nonnegative")
            sql += " LIMIT ?"
            parameters.append(int(limit))
        self._sql = sql
        self._parameters = parameters

    def query_iterator(self, immutable: Any = None) -> Iterator[Graph]:
        del immutable
        # Node 22 ignores prepare's newer options argument.  Configure the
        # statement explicitly so rows have the same shape on every supported
        # runtime.
        statement = runtime.reflect.apply(
            runtime.reflect.get(self._database, "prepare"),
            self._database,
            [self._sql],
        )
        runtime.reflect.apply(
            runtime.reflect.get(statement, "setReturnArrays"),
            statement,
            [True],
        )
        rows = runtime.reflect.apply(
            runtime.reflect.get(statement, "all"),
            statement,
            self._parameters,
        )
        return iter([Graph(row[0]) for row in rows])

    def __iter__(self) -> Iterator[Graph]:
        return self.query_iterator()

    def list(self) -> list[Graph]:
        return list(self.query_iterator())

    get_graphs_list = list

    def count(self) -> int:
        return len(self.list())

    def __repr__(self) -> str:
        return "Graph database query: " + self._sql

    __str__ = __repr__
    toString = __repr__


class GraphDatabase:
    """Immutable SQLite database of all unlabeled graphs through order 7."""

    def __init__(self, filename: Any = None) -> None:
        if filename is None:
            self.filename = _graph_database_default_path()
        else:
            self.filename = str(filename)
        fs_module = runtime.require_module("node:fs")
        exists = runtime.reflect.get(fs_module, "existsSync")
        sqlite_module = runtime.require_module("node:sqlite")
        constructor = runtime.reflect.get(sqlite_module, "DatabaseSync")
        if runtime.reflect.apply(exists, fs_module, [self.filename]):
            self._database = runtime.reflect.construct(
                constructor, [self.filename, _native_record(readOnly=True)]
            )
        else:
            resource_hook = runtime.reflect.get(
                runtime.global_object, "__sagejs_graph_database_bytes__"
            )
            if resource_hook is runtime.undefined:
                raise FileNotFoundError(
                    "Sage graph database not found at "
                    + self.filename
                    + "; set SAGEJS_GRAPH_DATABASE to an installed graphs.db"
                )
            database_bytes = runtime.reflect.apply(resource_hook, runtime.undefined, [])
            self._database = runtime.reflect.construct(constructor, [":memory:"])
            runtime.reflect.apply(
                runtime.reflect.get(self._database, "deserialize"),
                self._database,
                [database_bytes],
            )

    def query(
        self,
        query_dict: Any = None,
        display_cols: Any = None,
        limit: int | None = None,
        **conditions: Any,
    ) -> GraphQuery:
        del display_cols
        merged = _native_object()
        if query_dict is not None:
            for key in runtime.object.keys(query_dict):
                runtime.reflect.set(merged, key, runtime.reflect.get(query_dict, key))
        for key in runtime.object.keys(conditions):
            runtime.reflect.set(merged, key, runtime.reflect.get(conditions, key))
        return GraphQuery(self._database, merged, limit)

    def graphs(self, **conditions: Any) -> list[Graph]:
        return self.query(**conditions).list()

    def count(self, **conditions: Any) -> int:
        return self.query(**conditions).count()

    def close(self) -> None:
        runtime.reflect.apply(
            runtime.reflect.get(self._database, "close"), self._database, []
        )

    def __enter__(self) -> GraphDatabase:
        return self

    def __exit__(self, *_arguments: Any) -> None:
        self.close()

    def __repr__(self) -> str:
        return "Sage graph database at " + self.filename

    __str__ = __repr__
    toString = __repr__


runtime.register_doc(
    "graphs.RandomGNP",
    graphs.RandomGNP,
    {
        "kind": "method",
        "module": "sage.graphs.generators.random",
        "tags": [
            "graph theory",
            "random graphs",
            "Erdos-Renyi",
            "generators",
        ],
        "backends": ["Sage.js graph algorithms"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "The Sage algorithm is implemented, including sparse and "
                "quadratic paths. The optional networkx algorithm and "
                "immutable graph representation are not bundled."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath RandomGNP API and documentation",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/graphs/"
                    "sage/graphs/generators/random.html"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "literature-implemented",
                "source": "Batagelj--Brandes sparse random graph algorithm",
            },
        ],
        "references": [
            {
                "id": "batagelj-brandes-2005",
                "type": "paper",
                "title": "Efficient generation of large random networks",
                "authors": ["Vladimir Batagelj", "Ulrik Brandes"],
                "year": 2005,
                "url": "https://doi.org/10.1103/PhysRevE.71.036113",
            },
        ],
        "implementation": {
            "algorithm": "Batagelj--Brandes skip sampling or Bernoulli scan",
        },
        "limitations": [
            "algorithm='networkx' requires an external backend.",
            "immutable=True is accepted but does not yet freeze the graph.",
        ],
    },
)


# Generated reference data is a real sibling module, not a name inherited
# from baselib concatenation.  Sage.js registers it under its canonical
# internal name; the second spelling keeps this source executable when the
# baselib directory itself is placed on CPython's import path.
try:
    _graph_reference_module = __import__(
        "sagejs._baselib.graph_reference_data",
        None,
        None,
        ["_GRAPH_REFERENCE_RECORDS"],
    )
except ImportError:
    _graph_reference_module = __import__(
        "graph_reference_data",
        None,
        None,
        ["_GRAPH_REFERENCE_RECORDS"],
    )
_GRAPH_REFERENCE_RECORDS = _graph_reference_module._GRAPH_REFERENCE_RECORDS


def _register_graph_reference(record: dict[str, Any]) -> None:
    owners = {
        "GraphAutomorphism": GraphAutomorphism,
        "GraphAutomorphismGroup": GraphAutomorphismGroup,
        "GraphPlot": GraphPlot,
        "GenericGraph": Graph,
        "DiGraph": DiGraph,
        "GraphGenerators": graphs,
        "DigraphGenerators": digraphs,
        "GraphQuery": GraphQuery,
        "GraphDatabase": GraphDatabase,
    }
    owner = owners[record["owner"]]
    value = runtime.reflect.get(owner, record["attribute"])
    runtime.register_doc(
        record["name"],
        value,
        {
            "kind": "method",
            "module": record["module"],
            "signature": record["signature"],
            "doc": record["doc"],
            "tags": record["tags"],
            "backends": record["backends"],
            "sage_compatibility": record["sage_compatibility"],
            "provenance": record["provenance"],
            "limitations": record["limitations"],
        },
    )


for _graph_reference_record in _GRAPH_REFERENCE_RECORDS:
    _register_graph_reference(_graph_reference_record)
