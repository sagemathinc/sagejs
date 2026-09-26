#!/usr/bin/env python3
"""Run 15 fresh native processes and retain raw one-shot observations."""

import hashlib
import json
import pathlib
import resource
import subprocess
import time


ROOT = pathlib.Path(__file__).resolve().parent
BINARY = ROOT / "target/release/sagejs-rust-wasm-enclosure-probe"
SAMPLES = 15


def main() -> None:
    observations = []
    payload = None
    for _ in range(SAMPLES):
        started = time.perf_counter_ns()
        completed = subprocess.run(
            [BINARY], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        elapsed_ns = time.perf_counter_ns() - started
        current = completed.stdout.rstrip(b"\n")
        json.loads(current)
        if payload is None:
            payload = current
        assert current == payload
        observations.append(
            {
                "elapsedNs": elapsed_ns,
                "cumulativeChildrenMaxRssKiB": resource.getrusage(
                    resource.RUSAGE_CHILDREN
                ).ru_maxrss,
            }
        )
    assert payload is not None
    print(
        json.dumps(
            {
                "schema": "sagejs.rust-native-enclosure-receipt/v1",
                "boundary": "fresh-process-including-startup",
                "sampleCount": SAMPLES,
                "observations": observations,
                "resultBytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
