"""Provider-free PQ trees for the consecutive-ones property.

This is an ordinary Python implementation of the Sage PQ-tree public surface.
Leaves are Python sets; the tree mutates in place as contiguity constraints are
added. PARI, Singular, Sage subprocesses, and native extensions are not used.

The reduction algorithm is derived from SageMath 10.9 source file
src/sage/graphs/pq_trees.py at commit
686dc1a8d420c2e0aabadd4f602d9a0aa4690c50 (GPL-2.0-or-later).
"""

# Original Sage implementation:
# Copyright (C) 2012 Nathann Cohen <nathann.cohen@gmail.com>
# Distributed by SageMath under GPL-2.0-or-later.

from __future__ import annotations

from itertools import permutations, product
from typing import Any, Iterator

__all__ = ["P", "PQ", "Q", "reorder_sets"]

FULL = 2
PARTIAL = 1
EMPTY = 0
ALIGNED = True
UNALIGNED = False

_IMPOSSIBLE = "Impossible"


def _factorial(value: int) -> int:
    result = 1
    for factor in range(2, value + 1):
        result *= factor
    return result


def _set_contiguous(tree: Any, value: Any) -> tuple[int, bool]:
    if isinstance(tree, PQ):
        return tree.set_contiguous(value)
    if value in tree:
        return FULL, ALIGNED
    return EMPTY, ALIGNED


def _new_p(children: list[Any]) -> Any:
    if len(children) > 1:
        return P(children)
    return children[0]


def _new_q(children: list[Any]) -> Any:
    if len(children) > 1:
        return Q(children)
    return children[0]


def _flatten(tree: Any) -> Any:
    if isinstance(tree, PQ):
        return tree.flatten()
    return tree


def reorder_sets(sets: list[Any]) -> list[Any]:
    """Return one ordering in which each element occurs contiguously."""
    if len(sets) <= 2:
        return sets
    ground_set: set[Any] = set().union(*sets)
    tree: Any = P(sets)
    for value in ground_set:
        tree.set_contiguous(value)
        tree = _flatten(tree)
    return tree.ordering()


class PQ:
    """Common mutable tree behavior for P and Q nodes."""

    def __init__(self, seq: Any) -> None:
        self._children: list[Any] = []
        for child in seq:
            if isinstance(child, list):
                child = set(child)
            if child not in self._children:
                self._children.append(child)

    def reverse(self) -> None:
        """Recursively reverse this node and all descendant nodes."""
        for child in self._children:
            if isinstance(child, PQ):
                child.reverse()
        self._children.reverse()

    def __contains__(self, value: Any) -> bool:
        return any(value in child for child in self)

    def __iter__(self) -> Iterator[Any]:
        yield from self._children

    def number_of_children(self) -> int:
        """Return the number of direct children."""
        return len(self._children)

    def ordering(self) -> list[Any]:
        """Return the current left-to-right leaf ordering."""
        value: list[Any] = []
        for child in self:
            if isinstance(child, PQ):
                value.extend(child.ordering())
            else:
                value.append(child)
        return value

    def __repr__(self) -> str:
        return str(("P" if isinstance(self, P) else "Q", self._children))

    def simplify(
        self, value: Any, left: bool = False, right: bool = False
    ) -> list[Any]:
        """Return the partial node split with the full side left or right."""
        if sum([left, right]) != 1:
            raise ValueError("Exactly one of left or right must be specified")
        if isinstance(self, Q):
            result: list[Any] = []
            for child in self._children:
                if (
                    isinstance(child, PQ)
                    and value in child
                    and any(value not in grandchild for grandchild in child)
                ):
                    result.extend(child.simplify(value, right=right, left=left))
                else:
                    result.append(child)
            return result

        empty: list[Any] = []
        full: list[Any] = []
        partial: list[Any] = []
        for child in self._children:
            if value in child:
                if isinstance(child, PQ) and any(
                    value not in grandchild for grandchild in child
                ):
                    partial = child.simplify(value, right=right, left=left)
                else:
                    full.append(child)
            else:
                empty.append(child)
        if empty:
            empty = [_new_p(empty)]
        if full:
            full = [_new_p(full)]
        if right:
            return empty + partial + full
        return full + partial + empty

    def flatten(self) -> Any:
        """Recursively eliminate nodes containing only one child."""
        if self.number_of_children() == 1:
            return _flatten(self._children[0])
        self._children = [_flatten(child) for child in self._children]
        return self

    def set_contiguous(self, value: Any) -> tuple[int, bool]:
        """Restrict leaves containing value; implemented by concrete nodes."""
        raise NotImplementedError

    def cardinality(self) -> int:
        """Return the represented ordering count for a concrete node."""
        raise NotImplementedError

    def orderings(self) -> Iterator[tuple[Any, ...]]:
        """Iterate represented orderings for a concrete node."""
        raise NotImplementedError


class P(PQ):
    """A node whose children may be permuted arbitrarily."""

    def set_contiguous(self, value: Any) -> tuple[int, bool]:
        """Restrict this node so leaves containing value are contiguous."""
        for child in self:
            _set_contiguous(child, value)
        self.flatten()
        classifications = [_set_contiguous(child, value) for child in self]

        full: list[Any] = []
        empty: list[Any] = []
        partial_aligned: list[Any] = []
        partial_unaligned: list[Any] = []
        buckets = {
            (FULL, ALIGNED): full,
            (EMPTY, ALIGNED): empty,
            (PARTIAL, ALIGNED): partial_aligned,
            (PARTIAL, UNALIGNED): partial_unaligned,
        }
        for child, classification in zip(self, classifications, strict=True):
            buckets[classification].append(child)

        n_full = len(full)
        n_empty = len(empty)
        n_partial_aligned = len(partial_aligned)
        n_partial_unaligned = len(partial_unaligned)
        if n_partial_aligned > 2 or (
            n_partial_unaligned >= 1 and n_empty != self.number_of_children() - 1
        ):
            raise ValueError(_IMPOSSIBLE)
        if n_full == self.number_of_children():
            return FULL, ALIGNED
        if n_empty == self.number_of_children():
            return EMPTY, ALIGNED
        if n_partial_unaligned == 1:
            return PARTIAL, UNALIGNED
        if n_partial_aligned == 1 and n_empty == self.number_of_children() - 1:
            self._children = empty + partial_aligned
            return PARTIAL, ALIGNED

        self._children = []
        if n_empty > 0:
            self._children.extend(empty)
        if n_partial_aligned < 2:
            new: list[Any] = []
            if n_partial_aligned == 1:
                subtree = partial_aligned[0]
                new.extend(subtree.simplify(value, right=ALIGNED))
            if n_full > 0:
                new.append(_new_p(full))
            self._children.append(_new_q(new))
            return PARTIAL, ALIGNED

        new = []
        partial_aligned[1].reverse()
        subtree = partial_aligned[0]
        new.extend(subtree.simplify(value, right=ALIGNED))
        if n_full > 0:
            new.append(_new_p(full))
        subtree = partial_aligned[1]
        new.extend(subtree.simplify(value, left=ALIGNED))
        self._children.append(_new_q(new))
        return PARTIAL, UNALIGNED

    def cardinality(self) -> int:
        """Return the number of leaf orderings represented by this node."""
        result = _factorial(self.number_of_children())
        for child in self._children:
            if isinstance(child, PQ):
                result *= child.cardinality()
        return result

    def orderings(self) -> Iterator[tuple[Any, ...]]:
        """Iterate over every leaf ordering represented by this node."""
        for child_permutation in permutations(self._children):
            yield from product(
                *[
                    child.orderings() if isinstance(child, PQ) else [child]
                    for child in child_permutation
                ]
            )


class Q(PQ):
    """A node whose child order is fixed up to reversal."""

    def set_contiguous(self, value: Any) -> tuple[int, bool]:
        """Restrict this node so leaves containing value are contiguous."""
        for child in self:
            _set_contiguous(child, value)
        self.flatten()
        classifications = [_set_contiguous(child, value) for child in self]

        full: list[Any] = []
        empty: list[Any] = []
        partial_aligned: list[Any] = []
        partial_unaligned: list[Any] = []
        buckets = {
            (FULL, ALIGNED): full,
            (EMPTY, ALIGNED): empty,
            (PARTIAL, ALIGNED): partial_aligned,
            (PARTIAL, UNALIGNED): partial_unaligned,
        }
        for child, classification in zip(self, classifications, strict=True):
            buckets[classification].append(child)

        n_full = len(full)
        n_empty = len(empty)
        n_partial_aligned = len(partial_aligned)
        n_partial_unaligned = len(partial_unaligned)
        if classifications[-1] == (EMPTY, ALIGNED) or (
            classifications[-1] == (PARTIAL, ALIGNED)
            and n_full == self.number_of_children() - 1
        ):
            self._children.reverse()
            classifications.reverse()

        if n_partial_aligned > 2 or (
            n_partial_unaligned >= 1 and n_empty != self.number_of_children() - 1
        ):
            raise ValueError(_IMPOSSIBLE)
        if n_full == self.number_of_children():
            return FULL, ALIGNED
        if n_empty == self.number_of_children():
            return EMPTY, ALIGNED
        if n_partial_unaligned == 1:
            return PARTIAL, UNALIGNED
        if n_partial_aligned == 1 and n_empty == self.number_of_children() - 1:
            if partial_aligned[0] == self._children[-1]:
                return PARTIAL, ALIGNED
            return PARTIAL, UNALIGNED

        new_children: list[Any] = []
        seen_nonempty = False
        seen_right_end = False
        for child, classification in zip(self, classifications, strict=True):
            child_type, aligned = classification
            if child_type == EMPTY:
                new_children.append(child)
                if seen_nonempty:
                    seen_right_end = True
                continue
            if seen_right_end:
                raise ValueError(_IMPOSSIBLE)
            if child_type == PARTIAL:
                if seen_nonempty and aligned:
                    child.reverse()
                    seen_right_end = True
                    new_children.extend(child.simplify(value, left=True))
                elif seen_nonempty and not aligned:
                    raise ValueError(_IMPOSSIBLE)
                elif not seen_nonempty and not aligned:
                    raise ValueError("Bon, ben ca arrive O_o")
                else:
                    new_children.extend(child.simplify(value, right=True))
            else:
                new_children.append(child)
            seen_nonempty = True
        self._children = new_children
        return PARTIAL, not seen_right_end

    def cardinality(self) -> int:
        """Return the number of leaf orderings represented by this node."""
        result = 1
        for child in self._children:
            if isinstance(child, PQ):
                result *= child.cardinality()
        return result if self.number_of_children() == 1 else 2 * result

    def orderings(self) -> Iterator[tuple[Any, ...]]:
        """Iterate over every leaf ordering represented by this node."""
        if len(self._children) == 1:
            child = self._children[0]
            yield from child.orderings() if isinstance(child, PQ) else [child]
            return
        for ordering in product(
            *[
                child.orderings() if isinstance(child, PQ) else [child]
                for child in self._children
            ]
        ):
            yield ordering
            yield ordering[::-1]
