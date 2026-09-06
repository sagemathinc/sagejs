# Live receiver adapters and keyword signature data

Follow-up to canonical defaults at `a4a8d207a`; local qualification completed.

Receiver-style method adapters already have a binding rule that passes the
instance as the host receiver, not an extra Python argument. Class attribute
resolution must recognize their existing marker as a non-data descriptor too;
otherwise it can skip an old eager cache only to retrieve it again in fallback
lookup. Direct, saved, bound/unbound, class/static replacement and inherited
deletion cases exercise the general rule, not a callable-specific shortcut.

Keyword signature fields are data, not method descriptors. Read them afresh
per invocation without an additional eager-bound-cache lookup on the returned
array or boolean. Preserve actual method lookup and all argument validation.
Per-invocation argument counts replace a generic `max` call; no mutable
signature cache is introduced.

Core-owned source grows from 907,160 to 907,535 bytes (+375). Its explicit
ceiling rises from 907,500 to 907,750, retaining 215 bytes headroom. This pays
for both the general descriptor classification correction and documented
signature-data path. No startup/performance ceiling or dependency is changed.

The behavior-gated `python-defaults-diagnostic-v1` supplied keyword-only case
(100,000 calls, three warmups, seven samples) improved from 477.452 ms to
313.527 ms, or 34.3% less time. The corresponding CPython medians were 6.784 ms
and 6.618 ms: the ratio fell from 70.38x to 47.37x. This remains a default
performance cliff, with 306.909 ms additional time; it is not resolved.

Raw local before/after receipts are retained in
`agents/evidence/python-call-binding-local-{before,after}.json`. The before
receipt identifies the clean parent; the after receipt truthfully identifies
that parent plus a dirty candidate workspace. These are provisional local
experiments, not independent-host confirmation or an exact committed-binary
qualification receipt. The omitted-keyword and positional cases remained on
the watch list (roughly 8–9x); no performance threshold was relaxed.

Local validation: full build passed in 9m23s; 111 focused tests passed across
Python and Sage modes; architecture, generated optimizer documentation, routine
validation (including startup and strict Python checks), and all 21 enabled
compiler checks passed. The required upstream selection remains 17/28 and
the pinned package workflows remain 8/11, with all seven selected Tomli
upstream tests passing. The existing pyparsing execution failure, IDNA stderr,
mpmath cold-import timeout, and eleven upstream failures remain visible.

Deletion with no inherited descriptor and the separate Counter/dict wrapper
equality mismatch remain outside this slice. Required upstream/package failures
are not waived by this work.
