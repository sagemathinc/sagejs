"""Count live same-source operand shapes; never use profiling as a timing."""

from collections import Counter
import contextlib
import io
import json
from pathlib import Path
import runpy
import sys

manifest = sys.argv[1]
output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
assert output_path is None or not output_path.exists()
counts = Counter()
names = {
    "pari_short_product",
    "pari_short_square",
    "pari_positive_real_sum",
    "pari_signed_real_sum",
}


def profile(frame, event, arg):
    if event != "call" or frame.f_code.co_name not in names:
        return
    if not frame.f_code.co_filename.endswith("/short_product.py"):
        return
    values = frame.f_locals
    name = frame.f_code.co_name
    if name == "pari_short_square":
        key = (name, str(values.get("px")), "square", values.get("mx") == 0)
    else:
        key = (
            name,
            str(values.get("px")),
            str(values.get("py")),
            values.get("mx") == 0 or values.get("my") == 0,
        )
    counts[key] += 1


driver = Path(__file__).with_name("run_small_norm_cpython.py")
sys.argv = [str(driver), manifest, "1"]
captured = io.StringIO()
try:
    sys.setprofile(profile)
    with contextlib.redirect_stdout(captured):
        runpy.run_path(str(driver), run_name="__main__")
finally:
    sys.setprofile(None)
rows = [json.loads(line) for line in captured.getvalue().splitlines()]
assert len(rows) == 16
report = json.dumps(
    {
        "qualifiedTiming": False,
        "collectorCalls": 64,
        "explanation": "16 scenarios, three warmups plus one call each; outputs checked by the driver",
        "counts": [
            dict(function=k[0], px=k[1], py=k[2], zero=k[3], calls=v)
            for k, v in sorted(counts.items())
        ],
    },
    indent=2,
)
if output_path is not None:
    output_path.write_text(report + "\n")
    totals = {name: sum(v for k, v in counts.items() if k[0] == name) for name in names}
    assert all(totals.values())
    print(json.dumps(dict(output=str(output_path), totals=totals)))
else:
    print(report)
