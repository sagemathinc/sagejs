"""Launch the certified Sage.js maximal-order benchmark.

The Node driver is authoritative: it reads the shared certified corpus,
keeps the Sage.js worker persistent, verifies every returned lattice exactly,
and retains raw timing/RSS evidence.  Keeping this file as a thin launcher
avoids loading the large cross-system corpus through Sage.js's Python-object
compatibility layer before measurement.

Set `SAGEJS_NFMO_PROFILE`, `SAGEJS_NFMO_SYSTEMS`, or
`SAGEJS_NFMO_OUTPUT` to override the quick defaults.
"""

import os
import subprocess
from pathlib import Path


repository = Path(__file__).parent.parent
driver = repository / "tools" / "number-field-maximal-order" / "cli.cjs"
profile = os.getenv("SAGEJS_NFMO_PROFILE", "quick")
systems = os.getenv("SAGEJS_NFMO_SYSTEMS", "sagejs")
output = os.getenv("SAGEJS_NFMO_OUTPUT", "/tmp/sagejs-maximal-order-report.json")

completed = subprocess.run(
    [
        "node",
        str(driver),
        "run",
        "--profile",
        profile,
        "--systems",
        systems,
        "--output",
        output,
    ],
    cwd=str(repository),
    check=False,
)
if completed.returncode != 0:
    raise RuntimeError(
        "maximal-order profiler failed with exit code " + str(completed.returncode)
    )
