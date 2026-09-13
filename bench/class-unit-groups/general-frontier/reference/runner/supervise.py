"""POSIX local diagnostic timeout with process-group cleanup and rusage.

This wrapper does not enforce a memory cap and is not the controlled timing
supervisor. Rusage covers reaped children and their propagated child usage,
not necessarily every descendant or simultaneous aggregate peak RSS.
"""

import os
import resource
import signal
import subprocess
import sys
import time


def main():
    seconds = int(sys.argv[1])
    if not 1 <= seconds <= 600 or len(sys.argv) < 3:
        raise ValueError("expected 1..600 seconds and a command")
    started = time.monotonic()
    child = subprocess.Popen(sys.argv[2:], start_new_session=True)

    def kill_group(sig):
        try:
            os.killpg(child.pid, sig)
        except ProcessLookupError:
            pass

    def interrupted(signum, frame):
        raise InterruptedError(signum)

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    reason = "exited"
    try:
        status = child.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        reason = "timeout"
        kill_group(signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        status = 124
    except InterruptedError as error:
        reason = "interrupted"
        status = 128 + int(error.args[0])
    finally:
        # Clean descendants on success, failure and interruption, too.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        kill_group(signal.SIGKILL)
        child.wait()
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    print(
        f"FRONTIER_USAGE|{usage.ru_utime}|{usage.ru_stime}|{usage.ru_maxrss}|"
        f"{time.monotonic() - started}",
        file=sys.stderr,
    )
    print(f"FRONTIER_SUPERVISOR|{reason}", file=sys.stderr)
    return status if status >= 0 else 128 - status


if __name__ == "__main__":
    sys.exit(main())
