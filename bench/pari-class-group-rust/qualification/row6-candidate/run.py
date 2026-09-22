#!/usr/bin/env python3
"""Run one bounded diagnostic and preserve timing/memory evidence."""

from __future__ import annotations

import json
import resource
import subprocess
import sys
import time
from pathlib import Path


def process_memory(pid: int) -> dict[str, int]:
    answer: dict[str, int] = {}
    try:
        status = Path(f"/proc/{pid}/status").read_text()
    except FileNotFoundError:
        return answer
    for line in status.splitlines():
        name, _, rest = line.partition(":")
        if name in {"VmRSS", "VmHWM", "VmPeak", "VmSize"}:
            answer[name] = int(rest.strip().split()[0])
    return answer


def main() -> int:
    here = Path(__file__).resolve().parent
    radius = int(sys.argv[1])
    timeout_seconds = float(sys.argv[2])
    results = here / "results"
    results.mkdir(exist_ok=True)
    executable = here / "target/release/sagejs-row6-rust-candidate-diagnostic"
    output_path = results / f"radius-{radius}.json"
    resource_path = results / f"radius-{radius}.resource.json"
    status_path = results / f"radius-{radius}.status"

    started_ns = time.monotonic_ns()
    with output_path.open("wb") as output:
        process = subprocess.Popen(
            [str(executable), str(radius)], stdout=output, stderr=subprocess.PIPE
        )
        observations: list[dict[str, int]] = []
        timed_out = False
        while process.poll() is None:
            elapsed_ns = time.monotonic_ns() - started_ns
            memory = process_memory(process.pid)
            if memory:
                observations.append({"elapsedNanoseconds": elapsed_ns, **memory})
            if elapsed_ns >= timeout_seconds * 1_000_000_000:
                timed_out = True
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
            time.sleep(0.01)
        stderr = (
            process.stderr.read().decode(errors="replace") if process.stderr else ""
        )
    elapsed_ns = time.monotonic_ns() - started_ns
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    receipt = {
        "schema": "sagejs.rust-class-group/row6-resource-observation-v1",
        "radius": radius,
        "timeoutSeconds": timeout_seconds,
        "timedOut": timed_out,
        "returnCode": process.returncode,
        "elapsedNanoseconds": elapsed_ns,
        "kernelMaximumResidentSetKiB": usage.ru_maxrss,
        "sampledMaximumResidentSetKiB": max(
            (item.get("VmHWM", item.get("VmRSS", 0)) for item in observations),
            default=0,
        ),
        "sampledMaximumVirtualSizeKiB": max(
            (item.get("VmPeak", item.get("VmSize", 0)) for item in observations),
            default=0,
        ),
        "memorySampleCount": len(observations),
        "stderr": stderr,
    }
    resource_path.write_text(json.dumps(receipt, indent=2) + "\n")
    status_path.write_text(f"{process.returncode}\n")
    if timed_out:
        print(
            f"radius {radius} reached the {timeout_seconds:g}s checkpoint",
            file=sys.stderr,
        )
        return 0
    if process.returncode:
        print(stderr, file=sys.stderr)
        return process.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
