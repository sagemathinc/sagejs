"""Record developer command cost; this is not a controlled timing harness."""

import json
import platform
import subprocess
import sys
import time
from pathlib import Path

try:
    import resource
except ImportError:
    resource = None


def main():
    output = Path(sys.argv[1])
    command = sys.argv[2:]
    if output.exists() or not command:
        raise ValueError("require a new receipt path and a command")
    started = time.monotonic()
    result = subprocess.run(command, check=False)
    usage = resource.getrusage(resource.RUSAGE_CHILDREN) if resource else None
    receipt = {
        "schema": "sagejs.developer-command-resource.v1",
        "command": command,
        "platform": platform.system(),
        "returncode": result.returncode,
        "elapsed_seconds": time.monotonic() - started,
        "user_seconds": usage.ru_utime if usage else None,
        "system_seconds": usage.ru_stime if usage else None,
        "max_child_rss_bytes": (
            usage.ru_maxrss * (1 if platform.system() == "Darwin" else 1024)
            if usage
            else None
        ),
        "memory_scope": "maximum child RSS, not concurrent process-tree memory",
        "allocation_count": None,
        "controlled_timing": False,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x") as stream:
        json.dump(receipt, stream, indent=2)
        stream.write("\n")
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
