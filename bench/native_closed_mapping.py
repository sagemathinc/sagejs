"""Closed scalar mapping fixture for the source-transparent native ABI."""

from typing import TypedDict

from sagejs.native import int64, native, uint64


class ClassUnitEvidence(TypedDict):
    classNumber: uint64
    signature: int64
    complete: bool


def _closed_mapping_score(owner: ClassUnitEvidence) -> int:
    total = owner["classNumber"]
    if owner["complete"]:
        total += 11
    if owner["signature"] < 0:
        total += 17
    return total


@native
def closed_mapping_score(owner: ClassUnitEvidence) -> int:
    """Project a checked mapping through a private native helper."""
    return _closed_mapping_score(owner)
