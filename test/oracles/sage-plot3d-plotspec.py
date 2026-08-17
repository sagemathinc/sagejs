"""Emit the Sage 10.9 geometry invariants used by the 3D PlotSpec bridge."""

import json

from sage.all import plot3d, polygon3d, var
from sage.plot.plot3d.index_face_set import IndexFaceSet


x, y = var("x y")
surface = plot3d(x + y, (x, 0, 1), (y, 0, 1), plot_points=(2, 3))
polygon = polygon3d([(0, 0, 0), (2, 0, 0), (2, 1, 0), (0, 1, 0)])
triangles = IndexFaceSet(
    [
        [(0, 0, 0), (1, 0, 0), (0, 1, 0)],
        [(0, 0, 0), (0, 1, 0), (0, 0, 1)],
    ]
)

document = {
    "sage_version": "10.9",
    "surface": {
        "class": type(surface).__module__ + "." + type(surface).__name__,
        "bounds": [list(point) for point in surface.bounding_box()],
    },
    "polygon": {
        "class": type(polygon).__module__ + "." + type(polygon).__name__,
        "bounds": [list(point) for point in polygon.bounding_box()],
        "faces": polygon.index_faces(),
    },
    "triangular_mesh": {
        "bounds": [list(point) for point in triangles.bounding_box()],
        "faces": triangles.index_faces(),
        "vertices": [list(point) for point in triangles.vertex_list()],
    },
}

assert document["surface"]["bounds"] == [[0.0, 0.0, 0.0], [1.0, 1.0, 2.0]]
assert document["polygon"]["faces"] == [[0, 1, 2, 3]]
assert document["triangular_mesh"]["faces"] == [[0, 1, 2], [0, 2, 3]]
print(json.dumps(document, sort_keys=True, separators=(",", ":")))
