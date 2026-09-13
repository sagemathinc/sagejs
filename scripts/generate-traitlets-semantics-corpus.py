#!/usr/bin/env python3
"""Emit the pinned CPython traitlets semantic transcript used by Sage.js."""

from __future__ import annotations

import json

from traitlets import HasTraits, Int, TraitError, dlink, link, observe, validate


def normalized_change(change):
    """Return the stable, externally meaningful part of a trait change."""
    return [change["name"], change["old"], change["new"], change["type"]]


class OrderedPair(HasTraits):
    left = Int(1)
    right = Int(2)

    def __init__(self, **kwargs):
        self.events = []
        super().__init__(**kwargs)

    @observe("left", "right")
    def _record(self, change):
        self.events.append(normalized_change(change))

    @validate("right")
    def _right_must_exceed_left(self, proposal):
        if proposal["value"] <= self.left:
            raise TraitError("right must exceed left")
        return proposal["value"]


def build_corpus():
    """Exercise ordering, rollback, linking, transformation, and cleanup."""
    pair = OrderedPair()
    pair.left = 3
    pair.right = 5
    ordered_events = list(pair.events)

    pair.events = []
    rollback_error = None
    try:
        with pair.hold_trait_notifications():
            pair.left = 8
            pair.right = 7
    except TraitError as error:
        rollback_error = str(error)
    rollback = {
        "error": rollback_error,
        "events": list(pair.events),
        "state": [pair.left, pair.right],
    }

    source = OrderedPair(left=2, right=4)
    target = OrderedPair(left=10, right=20)
    bidirectional = link((source, "left"), (target, "left"))
    source.left = 6
    linked_forward = target.left
    target.left = 9
    linked_backward = source.left
    bidirectional.unlink()
    source.left = 11
    unlinked = target.left

    target.left = 0
    one_way = dlink((source, "right"), (target, "right"), transform=lambda n: n + 3)
    source.right = 15
    transformed = target.right
    one_way.unlink()

    return {
        "schema": "sagejs.traitlets-semantics/v1",
        "traitlets": __import__("traitlets").__version__,
        "notification_order": ordered_events,
        "rollback": rollback,
        "link": {
            "forward": linked_forward,
            "backward": linked_backward,
            "after_unlink": unlinked,
            "transformed": transformed,
        },
    }


print(json.dumps(build_corpus(), sort_keys=True, separators=(",", ":")))
