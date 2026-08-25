"""Measure conditional C4 public projection, replay, and repeat views."""

import json
import time

import sagejs.runtime as runtime

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4 * x + 1, "a")
K.maximal_order()

started = time.monotonic()
result = K.class_unit_group(proof=False, max_relation_attempts=64)
engine_seconds = time.monotonic() - started

started = time.monotonic()
first = K.class_group(proof=False, max_relation_attempts=64)
first_adapter_seconds = time.monotonic() - started

process = runtime.reflect.get(runtime.global_object, "process")


def rss() -> int:
    memory = runtime.reflect.apply(
        runtime.reflect.get(process, "memoryUsage"), process, []
    )
    return int(runtime.number(runtime.reflect.get(memory, "rss")))


rss_before_views = rss()
repeat_seconds = []
views = []
for _index in range(1_000):
    started = time.monotonic()
    views.append(K.class_group(proof=False, max_relation_attempts=64))
    repeat_seconds.append(time.monotonic() - started)
rss_retained_views = rss()
retained_fresh = all(view is not first for view in views)
views = []
collector = runtime.reflect.get(runtime.global_object, "gc")
if collector is not None:
    runtime.reflect.apply(collector, runtime.global_object, [])
rss_after_release = rss()

previous = first
discarded_fresh = True
for index in range(1_000):
    current = K.class_group(proof=False, max_relation_attempts=64)
    discarded_fresh = discarded_fresh and current is not previous
    previous = current
    if collector is not None and index % 100 == 99:
        runtime.reflect.apply(collector, runtime.global_object, [])
rss_after_discarded = rss()

started = time.monotonic()
verified = previous.verify()
verify_seconds = time.monotonic() - started

print(
    json.dumps(
        {
            "benchmark": "public-class-group-projection-c4",
            "engine_seconds": engine_seconds,
            "first_adapter_seconds": first_adapter_seconds,
            "repeat_min_seconds": min(repeat_seconds),
            "repeat_median_seconds": sorted(repeat_seconds)[len(repeat_seconds) // 2],
            "repeat_max_seconds": max(repeat_seconds),
            "rss_before_views": rss_before_views,
            "rss_retained_views": rss_retained_views,
            "rss_retained_delta": rss_retained_views - rss_before_views,
            "rss_after_release": rss_after_release,
            "rss_after_discarded": rss_after_discarded,
            "rss_discarded_delta": rss_after_discarded - rss_after_release,
            "discarded_fresh": discarded_fresh,
            "fresh_views": retained_fresh and discarded_fresh,
            "proof_payload_equal": previous.proof_payload() == first.proof_payload(),
            "full_verify": verified,
            "full_verify_seconds": verify_seconds,
        },
        sort_keys=True,
    )
)
