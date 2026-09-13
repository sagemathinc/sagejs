"""Retention, detachment and exact incremental byte-accounting witnesses."""

from sagejs.numerics._json import canonical_json
from sagejs.numerics.diagnostics import NumericalDiagnostic
from sagejs.numerics.ode.solvers import _OdeTrace, _append_detailed_trace
from sagejs.numerics.trace import NumericalTrace, TraceEvent, TracePolicy


class RetentionOracle:
    """Independent list-of-records model of the original retention rules."""

    def __init__(self, policy):
        self.policy = policy
        self.events = []
        self.observed = 0
        self.sequence = 0
        self.dropped = 0

    def append(self, kind, *, force=False, **fields):
        self.observed += 1
        level = self.policy.level
        wanted = level != "none"
        if level == "summary":
            wanted = kind in ("start", "finish", "failure", "phase", "validation")
        if level == "iterations":
            wanted = kind != "evaluation"
        if not force and not wanted:
            return
        self.events.append(TraceEvent(self.sequence, kind, **fields).to_dict())
        self.sequence += 1
        while len(self.events) > self.policy.max_events:
            indices = [i for i in range(1, len(self.events) - 1)]
            preferred = [i for i in indices if not self.events[i]["important"]]
            candidates = preferred or indices
            self.events.pop(candidates[len(candidates) // 2])
            self.dropped += 1
        while len(canonical_json(self.events).encode("utf-8")) > self.policy.max_bytes:
            indices = [i for i in range(len(self.events) - 1)]
            preferred = [i for i in indices if not self.events[i]["important"]]
            if not preferred:
                preferred = [
                    i
                    for i in range(len(self.events))
                    if not self.events[i]["important"]
                ]
            candidates = preferred or indices or [0]
            self.events.pop(candidates[0])
            self.dropped += 1

    def to_dict(self):
        diagnostics = []
        if self.dropped:
            diagnostics = [
                NumericalDiagnostic(
                    "trace_truncated", details={"dropped_events": self.dropped}
                ).to_dict()
            ]
        return {
            "schema_version": 1,
            "policy": self.policy.to_dict(),
            "observed_events": self.observed,
            "retained_events": len(self.events),
            "dropped_events": self.dropped,
            "truncated": bool(self.dropped),
            "events": self.events,
            "diagnostics": diagnostics,
        }


def check_accounting(trace):
    expected = len(
        canonical_json([event.to_dict() for event in trace.events]).encode("utf-8")
    )
    assert trace._event_bytes() == expected
    assert expected <= trace.policy.max_bytes
    candidate = TraceEvent(trace._next_sequence, "step", data={"x": "😀\nλ"})
    projected = trace.to_dict()
    projected["events"].append(candidate.to_dict())
    projected["observed_events"] += 1
    projected["retained_events"] += 1
    assert trace._projected_record_bytes(candidate) == len(
        canonical_json(projected).encode("utf-8")
    )


def check_retention():
    kinds = ["start", "step", "evaluation", "phase", "finish", "validation", "failure"]
    for level in ["none", "summary", "iterations", "evaluations", "debug"]:
        for cap in [2, 5, 16]:
            for byte_cap in [1024, 2048, 12000]:
                policy = TracePolicy(level, max_events=cap, max_bytes=byte_cap)
                trace = NumericalTrace(policy)
                oracle = RetentionOracle(policy)
                for i in range(35):
                    data = {
                        "values": [i, None, True, 0.0, -0.0, 1e-200, 1e100],
                        "nested": {"text": 'λ😀"\\\n' * (1 + i % 5)},
                        "large": "z" * (15000 if i % 17 == 0 else (i * 23) % 300),
                    }
                    fields = {
                        "iteration": i,
                        "evaluation": i * 2,
                        "accepted": i % 2 == 0,
                        "data": data,
                        "important": i % 3 == 0,
                        "force": i % 11 == 0,
                        "diagnostics": [
                            NumericalDiagnostic("backend_fallback", details={"v": [i]})
                        ]
                        if i % 7 == 0
                        else [],
                    }
                    trace.append(kinds[i % len(kinds)], **fields)
                    oracle.append(kinds[i % len(kinds)], **fields)
                    assert trace.to_dict() == oracle.to_dict(), (
                        level,
                        cap,
                        byte_cap,
                        i,
                    )
                    check_accounting(trace)


def check_detachment():
    policy = TracePolicy("iterations", max_bytes=8192)
    trace = NumericalTrace(policy)
    data = {"nested": [{"payload": [1, 2]}]}
    diagnostic = NumericalDiagnostic(
        "backend_fallback", details={"a": [[1, 2]]}
    ).to_dict()
    event = trace.append("step", data=data, diagnostics=[diagnostic])
    before = trace.to_json()
    encoded = trace._event_bytes()
    data["nested"][0]["payload"].append(3000)
    diagnostic["details"]["a"][0].append(3000)
    detached = event.to_dict()
    detached["data"]["nested"][0]["payload"].append(3000)
    detached["diagnostics"][0]["details"]["a"][0].append(3000)
    detached["diagnostics"][0]["suggested_actions"].append("z" * 9000)
    event.data["nested"][0]["payload"].clear()
    assert trace.to_json() == before
    assert trace._event_bytes() == encoded
    check_accounting(trace)


def check_exact_ceiling():
    event = TraceEvent(0, "finish", data={"text": "λ😀" * 200}, important=True)
    exact = 2 + len(canonical_json([event.to_dict()])[1:-1].encode("utf-8"))
    assert exact >= 1024
    for maximum in [exact - 1, exact, exact + 1]:
        trace = NumericalTrace(TracePolicy("debug", max_bytes=maximum))
        trace.append("finish", data={"text": "λ😀" * 200}, important=True)
        assert len(trace.events) == (0 if maximum < exact else 1)
        check_accounting(trace)
    # A completely evicted history must not reset sequence/observation counts.
    for i in range(110):
        trace.append("step", data={"text": "x" * 10000}, important=True)
    assert not trace.events
    check_accounting(trace)
    trace.append("step")
    assert trace.events[0].sequence == 111
    check_accounting(trace)
    for invalid in [float("inf"), float("nan"), object()]:
        before = trace._event_bytes()
        count = len(trace.events)
        try:
            trace.append("step", data={"invalid": invalid})
        except (TypeError, ValueError):
            pass
        else:
            raise AssertionError("invalid data accepted")
        assert trace._event_bytes() == before and len(trace.events) == count
        check_accounting(trace)


def old_ode_append(trace, kind, *, force=False, **fields):
    if not force and not trace.wants(kind):
        return
    if (
        trace.policy.max_bytes < 4096
        or len(trace.events) >= trace.policy.max_events - 1
    ):
        trace.omitted_details += 1
        return
    sequence = trace.events[-1].sequence + 1 if trace.events else 0
    candidate = TraceEvent(sequence, kind, **fields)
    projected = trace.to_dict()
    projected["events"].append(candidate.to_dict())
    projected["observed_events"] += 1
    projected["retained_events"] += 1
    if len(canonical_json(projected).encode("utf-8")) + 1024 > trace.policy.max_bytes:
        trace.omitted_details += 1
        return
    trace.append(kind, force=force, **fields)


def check_ode_projection():
    for level in ["none", "summary", "iterations"]:
        for count, maximum in [(2, 1024), (5, 4096), (20, 8192), (40, 12000)]:
            policy = TracePolicy(level, max_events=count, max_bytes=maximum)
            new, old = _OdeTrace(policy), _OdeTrace(policy)
            for trace in [new, old]:
                trace.append("start", data={"t": 0.0}, important=True)
            for i in range(30):
                kind = "evaluation" if i % 3 == 0 else "step"
                fields = {
                    "iteration": i,
                    "data": {"state": [0.5, float(i)], "unicode": "😀λ"},
                }
                _append_detailed_trace(new, kind, **fields)
                old_ode_append(old, kind, **fields)
                assert new.to_dict() == old.to_dict()
                assert new.omitted_details == old.omitted_details
                check_accounting(new)
            for trace in [new, old]:
                trace.append("finish", important=True)
            assert new.to_dict() == old.to_dict()


def check_no_history_serialization():
    def forbidden(*args):
        raise AssertionError("retained history was serialized during append/projection")

    for trace in [
        NumericalTrace(TracePolicy("debug", max_events=5)),
        _OdeTrace(TracePolicy("debug", max_events=5)),
    ]:
        for i in range(3):
            trace.append("step", iteration=i)
        for event in trace.events:
            event.to_dict = forbidden
        if isinstance(trace, _OdeTrace):
            _append_detailed_trace(trace, "step", data={"y": [1.0]})
        else:
            trace.append("step", data={"y": [1.0]})
            trace.append("step", data={"y": [2.0]})
            trace.append("step", data={"y": [3.0]})  # count eviction
            trace.append("finish", data={"huge": "x" * 1100000})  # byte evictions


check_retention()
check_detachment()
check_exact_ceiling()
check_ode_projection()
check_no_history_serialization()
print("trace accounting passed")
