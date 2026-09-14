"""Run one diagnostic and print conservative aggregate child resource usage.

Includes compiler children, failed commands and their descendants. This is an
accounting wrapper, not a timing qualification or a machine-wide resource cap.
The caller retains the emitted record in the experiment ledger.
"""

import json
import resource
import subprocess
import sys
import time


def main():
    start = time.monotonic()
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    result = subprocess.run(sys.argv[1:], check=False)
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    print(
        json.dumps(
            {
                "command": sys.argv[1:],
                "exit_code": result.returncode,
                "wall_seconds": time.monotonic() - start,
                "child_user_seconds": after.ru_utime - before.ru_utime,
                "child_system_seconds": after.ru_stime - before.ru_stime,
                "peak_child_rss_platform_units": after.ru_maxrss,
                "includes_compilation": True,
            }
        ),
        flush=True,
    )
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
