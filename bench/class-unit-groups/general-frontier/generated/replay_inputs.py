"""Offline reuse of the existing generator and raw-reference validators only."""

import hashlib
import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
LIMIT = 64 * 1024 * 1024
WORKER_SOURCES = {
    "pari": ("reference/pari-screen.gp",),
    "hecke": (
        "reference/hecke/screen.jl",
        "reference/hecke/transport.jl",
        "reference/persistent/hecke-bootstrap.jl",
    ),
}


def module(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def pinned(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > LIMIT:
        raise ValueError("input must be a bounded regular file")
    raw = path.read_bytes()
    return {"path": str(path.resolve()), "sha256": hashlib.sha256(raw).hexdigest()}


def load(descriptor):
    if pinned(descriptor["path"]) != descriptor:
        raise ValueError("raw input hash changed")
    return json.loads(Path(descriptor["path"]).read_bytes())


def rebuild(request):
    generator = module("generated_policy", "corpus/rank_two_supplement.py")
    preparation = module(
        "generated_preparation", "reference/runner/prepare-supplement-screen.py"
    )
    pairer = module("generated_pairer", "reference/runner/pair-persistent.py")
    source = load(request["generator"])
    generator.validate(source)
    pilot, selection = preparation.prepare()
    if load(request["pilot"]) != pilot or load(request["pilot_selection"]) != selection:
        raise ValueError(
            "pilot differs from predeclared initial family/index selection"
        )
    paired = load(request["paired"])
    reports = []
    pins = []
    for engine in ("pari", "hecke"):
        directory = Path(request["reference_directories"][engine])
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError(
                "reference directory must be an explicit regular directory"
            )
        files = sorted(directory.glob("*.json"))
        if not files or len(files) > 1024:
            raise ValueError("raw reference file count outside bounded policy")
        if sum(path.stat().st_size for path in files) > 128 * 1024 * 1024:
            raise ValueError("raw reference directory exceeds total byte cap")
        before = [pinned(path) for path in files]
        run = json.loads((directory / "run.json").read_bytes())
        if (
            run["records"] != pilot
            or run["provenance"]["input_sha256"] != request["pilot"]["sha256"]
        ):
            raise ValueError("raw run input identity differs from pinned pilot")
        report = pairer.review.summarize(directory)
        if report != paired.get(engine + "_review"):
            raise ValueError("paired engine review differs from rebuilt raw receipts")
        for relative in WORKER_SOURCES[engine]:
            expected = pinned(ROOT / relative)
            asserted = [
                value
                for name, value in report["provenance"]["sha256"].items()
                if name.endswith("/" + relative)
            ]
            if asserted != [expected["sha256"]]:
                raise ValueError(
                    "worker source identity does not match reviewed metadata semantics"
                )
        if before != [pinned(path) for path in files]:
            raise ValueError("raw reference inputs changed during replay")
        reports.append(report)
        pins.extend(before)
    if pairer.pair(*reports) != paired:
        raise ValueError("paired report differs from independent raw reconstruction")
    producer_paths = [
        Path(__file__),
        ROOT / "corpus/rank_two_supplement.py",
        ROOT / "reference/runner/prepare-supplement-screen.py",
        ROOT / "reference/runner/pair-persistent.py",
        ROOT / "reference/runner/summarize-persistent.py",
        ROOT / "reference/persistent/supervisor.py",
        ROOT / "reference/runner/screen-batch.py",
        *(
            ROOT / relative
            for sources in WORKER_SOURCES.values()
            for relative in sources
        ),
    ]
    return {
        "generator": source,
        "paired": paired,
        "raw_reference_files": pins,
        "replay_producers": [pinned(path) for path in producer_paths],
        "scope": "Offline syntax, identity and summary validation; no mathematical certificate replay or CAS execution",
    }


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        print(json.dumps(rebuild(request), sort_keys=True, separators=(",", ":")))
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
