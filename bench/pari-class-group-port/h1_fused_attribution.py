"""Diagnostic stage vocabulary for the fused H1 attribution experiment.

The mathematical implementation remains the authenticated
`pari_fused_h1_matched_flag_zero_root`.  These names describe diagnostic-only
compiler/runtime cuts and are not an alternative implementation.
"""

FUSED_H1_ATTRIBUTION_STAGES = (
    "addon-ingress",
    "preparation",
    "relation-collection",
    "log-hnf",
    "post-hnf-smith",
    "owner-bridge",
    "compact-getfu",
    "addon-egress",
)


def fused_h1_attribution_stages() -> tuple[str, ...]:
    """Return the ordered mutually exclusive diagnostic stage names."""

    return FUSED_H1_ATTRIBUTION_STAGES


__all__ = ["FUSED_H1_ATTRIBUTION_STAGES", "fused_h1_attribution_stages"]
