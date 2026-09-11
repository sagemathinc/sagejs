"""Apply the predeclared conservative M0 acquisition allowance exactly once."""

import argparse
import fcntl
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "screen", Path(__file__).with_name("screen-batch.py")
)
screen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screen)


def charge(state, allowance="initial"):
    if allowance == "initial":
        seconds = 6000
        identity = "bounded-candidate-acquisition-v1-v2-and-metadata-v1"
        reason = "180 retained acquisition windows at 30 seconds (68 v1, 112 v2), plus 600 seconds conservative metadata-probe allowance; no runtime optimization measurements."
    elif allowance == "hard-windows-v1":
        seconds = 300
        identity = "bounded-hard-window-acquisition-v1"
        reason = "Eight immutable hard-window-v1 query dispatches at 30-second ceilings plus 60 seconds conservative local bookkeeping allowance."
    else:
        raise ValueError("unknown predeclared acquisition allowance")
    screen.validate_state(state, seconds)
    if any(item.get("id") == identity for item in state.get("adjustments", [])):
        raise ValueError("acquisition allowance already applied")
    state.setdefault("adjustments", []).append(
        {
            "id": identity,
            "seconds": seconds,
            "reason": reason,
        }
    )
    state["charged_seconds"] += seconds
    return state


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger", type=Path)
    parser.add_argument(
        "--allowance", choices=("initial", "hard-windows-v1"), default="initial"
    )
    args = parser.parse_args()
    with open("/tmp/sagejs-opt-timing.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state = charge(json.loads(args.ledger.read_text()), args.allowance)
        screen.save(args.ledger, state)
        print(json.dumps(state))
