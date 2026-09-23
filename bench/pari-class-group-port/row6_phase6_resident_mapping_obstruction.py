"""Minimal row-6 fixture for a closed mapping-valued native boundary.

`TypedDict` keeps the dynamic fallback an ordinary Python dictionary while
giving native compilation a finite, source-visible schema.  Native entry
copies and validates these scalar fields once; no dictionary, string, hash
table, or host callback enters the isolated call graph.
"""

from typing import TypedDict

from sagejs.native import native, uint64


class Row6ClassOwner(TypedDict):
    classNumber: uint64


@native
def row6_mapping_owner_projection(owner: Row6ClassOwner) -> int:
    """The smallest form of the current class/unit composer boundary."""
    return owner["classNumber"]
