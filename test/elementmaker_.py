# vim:fileencoding=utf-8
# License: BSD Copyright: 2015, Kovid Goyal <kovid at kovidgoyal.net>
# globals: assrt

from elementmaker import E

eq = assrt.equal


def dummy_elem_eq(a, b):
    if isinstance(a, str):
        eq(a, b)
        return
    eq(len(a.attributes), len(b["attributes"]))
    eq(len(a.children), len(b["children"]))
    eq(a.name, b["name"])
    for attr in a.attributes:
        eq(a.attributes[attr], b["attributes"][attr])
    for i, child in enumerate(a.children):
        dummy_elem_eq(child, b["children"][i])


q = E.div("text", id="1", class_="c", data_x="x")
dummy_elem_eq(
    q,
    {
        "name": "div",
        "children": ["text"],
        "attributes": {"id": "1", "class": "c", "data-x": "x"},
    },
)

q = E.div(
    E.span("a"),
    E.span("b"),
    E.a(),
    id="1",
    boolean_attr=True,
)
dummy_elem_eq(
    q,
    {
        "name": "div",
        "children": [
            {"name": "span", "children": ["a"], "attributes": {}},
            {"name": "span", "children": ["b"], "attributes": {}},
            {"name": "a", "children": [], "attributes": {}},
        ],
        "attributes": {"id": "1", "boolean-attr": "boolean-attr"},
    },
)
