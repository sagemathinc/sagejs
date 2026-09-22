#!/usr/bin/env python3
"""Measure the Rust class-group core's bounded Linux build and artifact costs."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import platform
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
CORE = HERE.parents[1]
REPOSITORY = CORE.parents[1]
PACKAGE = "sagejs-pari-class-group-rust-experiment"
EXECUTABLE = PACKAGE
FEATURES = ["flint-normal-form"]
JOBS = 8
NATIVE_ARCHIVES = [
    "packages/flint/.native/prefix/lib/libflint.a",
    "packages/flint/.native/prefix/lib/libopenblas.a",
    "packages/flint/.native/prefix/lib/libmpfr.a",
    "packages/flint/.native/prefix/lib/libgmp.a",
]

WASM_ARTIFACTS = [
    {
        "name": "first-class-candidate",
        "path": "bench/pari-class-group-rust/qualification/wasm-class-group-candidate/target/wasm32-wasip1/release/sagejs_rust_wasm_class_group_candidate.wasm",
        "declaredStaticArithmeticLibraries": [],
    },
    {
        "name": "prepared-factor-base",
        "path": "bench/pari-class-group-rust/qualification/wasm-prepared-factor-base/build/prepared-factor-base.wasm",
        "declaredStaticArithmeticLibraries": ["gmp"],
    },
    {
        "name": "prepared-relation-prefix",
        "path": "bench/pari-class-group-rust/qualification/wasm-prepared-relation-prefix/build/prepared-relation-prefix.wasm",
        "declaredStaticArithmeticLibraries": ["gmp", "mpfr"],
    },
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def command_text(arguments: list[str], cwd: Path = REPOSITORY) -> str:
    return subprocess.run(
        arguments,
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    ).stdout.strip()


def source_digest(root: Path) -> tuple[str, list[str]]:
    files = [root / "Cargo.toml", root / "Cargo.lock", root / "build.rs"]
    files.extend(sorted((root / "src").glob("*")))
    files = [path for path in files if path.is_file()]
    digest = hashlib.sha256()
    names: list[str] = []
    for path in files:
        relative = path.relative_to(root).as_posix()
        names.append(relative)
        digest.update(relative.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest(), names


def directory_size(path: Path) -> dict[str, int]:
    logical = 0
    allocated = 0
    files = 0
    for candidate in path.rglob("*"):
        if candidate.is_file() and not candidate.is_symlink():
            stat = candidate.stat()
            logical += stat.st_size
            allocated += stat.st_blocks * 512
            files += 1
    return {"logicalBytes": logical, "allocatedBytes": allocated, "files": files}


def process_tree_rss(root_pid: int) -> int:
    parents: dict[int, int] = {}
    rss: dict[int, int] = {}
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            status = (entry / "status").read_text()
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            continue
        pid = int(entry.name)
        parent = None
        resident = 0
        for line in status.splitlines():
            if line.startswith("PPid:"):
                parent = int(line.split()[1])
            elif line.startswith("VmRSS:"):
                resident = int(line.split()[1]) * 1024
        if parent is not None:
            parents[pid] = parent
            rss[pid] = resident
    descendants = {root_pid}
    changed = True
    while changed:
        changed = False
        for pid, parent in parents.items():
            if parent in descendants and pid not in descendants:
                descendants.add(pid)
                changed = True
    return sum(rss.get(pid, 0) for pid in descendants)


def measured_run(
    arguments: list[str], cwd: Path, environment: dict[str, str]
) -> dict[str, Any]:
    started = time.monotonic_ns()
    process = subprocess.Popen(
        arguments,
        cwd=cwd,
        env=environment,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    peak_rss = 0
    samples = 0
    stop = threading.Event()

    def monitor() -> None:
        nonlocal peak_rss, samples
        while not stop.is_set():
            peak_rss = max(peak_rss, process_tree_rss(process.pid))
            samples += 1
            stop.wait(0.02)

    thread = threading.Thread(target=monitor, daemon=True)
    thread.start()
    assert process.stdout is not None
    output = process.stdout.read()
    return_code = process.wait()
    stop.set()
    thread.join()
    peak_rss = max(peak_rss, process_tree_rss(process.pid))
    finished = time.monotonic_ns()
    result = {
        "command": " ".join(arguments),
        "wallSeconds": round((finished - started) / 1_000_000_000, 6),
        "peakProcessTreeRssBytes": peak_rss,
        "rssSampleIntervalMilliseconds": 20,
        "rssSamples": samples,
        "exitCode": return_code,
        "outputTail": output[-4000:],
    }
    if return_code != 0:
        raise RuntimeError(json.dumps(result, indent=2))
    return result


def snapshot_source(temp_root: Path) -> Path:
    snapshot = temp_root / "sagejs" / "bench" / "pari-class-group-rust"
    snapshot.mkdir(parents=True)
    for name in ["Cargo.toml", "Cargo.lock", "build.rs"]:
        shutil.copy2(CORE / name, snapshot / name)
    shutil.copytree(CORE / "src", snapshot / "src")
    # build.rs deliberately resolves the repository-owned native prefix through
    # ../../packages.  A symlink avoids copying the 100+ MiB FLINT archive.
    os.symlink(REPOSITORY / "packages", temp_root / "sagejs" / "packages")
    return snapshot


def dependency_evidence(snapshot: Path, environment: dict[str, str]) -> dict[str, Any]:
    metadata = json.loads(
        subprocess.run(
            [
                "cargo",
                "metadata",
                "--locked",
                "--format-version",
                "1",
                "--features",
                ",".join(FEATURES),
            ],
            cwd=snapshot,
            env=environment,
            check=True,
            stdout=subprocess.PIPE,
            text=True,
        ).stdout
    )
    by_id = {package["id"]: package for package in metadata["packages"]}
    packages = []
    for node in metadata["resolve"]["nodes"]:
        package = by_id[node["id"]]
        packages.append(
            {
                "name": package["name"],
                "version": package["version"],
                "source": package["source"] or "workspace",
                "enabledFeatures": sorted(node["features"]),
            }
        )
    packages.sort(key=lambda item: (item["name"], item["version"]))
    normal_tree = command_text(
        [
            "cargo",
            "tree",
            "--locked",
            "--edges",
            "normal,build",
            "--features",
            ",".join(FEATURES),
        ],
        snapshot,
    )
    feature_tree = command_text(
        [
            "cargo",
            "tree",
            "--locked",
            "--edges",
            "features",
            "--features",
            ",".join(FEATURES),
        ],
        snapshot,
    )
    return {
        "packageCount": len(packages),
        "packages": packages,
        "normalAndBuildTreeSha256": sha256_bytes(normal_tree.encode()),
        "featureTreeSha256": sha256_bytes(feature_tree.encode()),
        "normalAndBuildTree": normal_tree,
        "featureTree": feature_tree,
    }


def read_uleb(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte & 0x80 == 0:
            return value, offset
        shift += 7


def read_name(data: bytes, offset: int) -> tuple[str, int]:
    length, offset = read_uleb(data, offset)
    return data[offset : offset + length].decode("utf-8", "replace"), offset + length


def skip_limits(data: bytes, offset: int) -> int:
    flags, offset = read_uleb(data, offset)
    _, offset = read_uleb(data, offset)
    if flags & 1:
        _, offset = read_uleb(data, offset)
    return offset


def wasm_surface(data: bytes) -> dict[str, list[str]]:
    if data[:8] != b"\0asm\x01\0\0\0":
        raise ValueError("not a WebAssembly 1 module")
    offset = 8
    imports: list[str] = []
    exports: list[str] = []
    while offset < len(data):
        section_id = data[offset]
        offset += 1
        size, offset = read_uleb(data, offset)
        end = offset + size
        if section_id == 2:
            count, cursor = read_uleb(data, offset)
            for _ in range(count):
                module, cursor = read_name(data, cursor)
                name, cursor = read_name(data, cursor)
                kind = data[cursor]
                cursor += 1
                imports.append(f"{module}.{name}")
                if kind == 0:
                    _, cursor = read_uleb(data, cursor)
                elif kind == 1:
                    cursor += 1
                    cursor = skip_limits(data, cursor)
                elif kind == 2:
                    cursor = skip_limits(data, cursor)
                elif kind == 3:
                    cursor += 2
                elif kind == 4:
                    _, cursor = read_uleb(data, cursor)
                    _, cursor = read_uleb(data, cursor)
                else:
                    raise ValueError(f"unknown Wasm import kind {kind}")
        elif section_id == 7:
            count, cursor = read_uleb(data, offset)
            for _ in range(count):
                name, cursor = read_name(data, cursor)
                cursor += 1
                _, cursor = read_uleb(data, cursor)
                exports.append(name)
        offset = end
    return {"imports": sorted(imports), "exports": sorted(exports)}


def wasm_evidence() -> dict[str, Any]:
    artifacts = []
    for description in WASM_ARTIFACTS:
        path = REPOSITORY / description["path"]
        data = path.read_bytes()
        compressed = gzip.compress(data, compresslevel=9, mtime=0)
        surface = wasm_surface(data)
        artifacts.append(
            {
                **description,
                "bytes": len(data),
                "gzip9Bytes": len(compressed),
                "sha256": sha256_bytes(data),
                "gzip9Sha256": sha256_bytes(compressed),
                "imports": surface["imports"],
                "exportsMemory": "memory" in surface["exports"],
                "importsArithmeticSymbols": any(
                    token in name.lower()
                    for name in surface["imports"]
                    for token in ["gmp", "mpfr", "flint"]
                ),
            }
        )
    hashes: dict[str, list[str]] = {}
    for artifact in artifacts:
        hashes.setdefault(artifact["sha256"], []).append(artifact["name"])
    return {
        "artifacts": artifacts,
        "standaloneClosure": {
            "rawBytes": sum(item["bytes"] for item in artifacts),
            "gzip9Bytes": sum(item["gzip9Bytes"] for item in artifacts),
        },
        "duplicationIndicators": {
            "identicalArtifactGroups": [
                names for names in hashes.values() if len(names) > 1
            ],
            "modulesDeclaringStaticGmp": sum(
                "gmp" in item["declaredStaticArithmeticLibraries"] for item in artifacts
            ),
            "modulesDeclaringStaticMpfr": sum(
                "mpfr" in item["declaredStaticArithmeticLibraries"]
                for item in artifacts
            ),
            "allModulesExportPrivateMemory": all(
                item["exportsMemory"] for item in artifacts
            ),
            "dynamicArithmeticImportsObserved": any(
                item["importsArithmeticSymbols"] for item in artifacts
            ),
            "interpretation": (
                "The two prepared-stage modules each declare statically linked GMP, and the "
                "relation-prefix module also declares MPFR. Each artifact exports its own linear "
                "memory and none imports GMP/MPFR/FLINT symbols. This is strong linkage-level "
                "evidence of duplicate arithmetic runtimes across separately loaded modules, but "
                "it does not identify an exact byte overlap."
            ),
        },
    }


def host_evidence() -> dict[str, Any]:
    os_release = {}
    for line in Path("/etc/os-release").read_text().splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            os_release[key] = value.strip('"')
    return {
        "platform": platform.platform(),
        "machine": platform.machine(),
        "kernel": platform.release(),
        "osPrettyName": os_release.get("PRETTY_NAME", "unknown"),
        "logicalCpuCount": os.cpu_count(),
        "cpuModel": next(
            (
                line.split(":", 1)[1].strip()
                for line in Path("/proc/cpuinfo").read_text().splitlines()
                if line.startswith("model name")
            ),
            "unknown",
        ),
        "rustcVerbose": command_text(["rustc", "-Vv"]),
        "cargoVersion": command_text(["cargo", "-V"]),
        "activeToolchain": command_text(["rustup", "show", "active-toolchain"]),
        "stripVersion": command_text(["strip", "--version"]).splitlines()[0],
    }


def native_archive_evidence() -> list[dict[str, Any]]:
    answer = []
    for relative in NATIVE_ARCHIVES:
        path = REPOSITORY / relative
        answer.append(
            {
                "path": relative,
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "symlinkTarget": os.readlink(path) if path.is_symlink() else None,
            }
        )
    return answer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=HERE / "receipt.json")
    parser.add_argument("--keep-temporary", action="store_true")
    arguments = parser.parse_args()

    started_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    temporary = Path(tempfile.mkdtemp(prefix="sagejs-rust-build-metrics-", dir="/tmp"))
    cleaned = False
    try:
        snapshot = snapshot_source(temporary)
        source_sha, source_files = source_digest(snapshot)
        target = temporary / "target"
        environment = os.environ.copy()
        environment.update(
            {
                "CARGO_TARGET_DIR": str(target),
                "CARGO_BUILD_JOBS": str(JOBS),
                "CARGO_INCREMENTAL": "1",
            }
        )
        dependencies = dependency_evidence(snapshot, environment)
        build_command = [
            "cargo",
            "build",
            "--release",
            "--locked",
            "--features",
            ",".join(FEATURES),
        ]
        clean = measured_run(build_command, snapshot, environment)
        clean["targetDisk"] = directory_size(target)

        no_op = measured_run(build_command, snapshot, environment)
        no_op["targetDisk"] = directory_size(target)

        changed_module = snapshot / "src" / "api.rs"
        changed_module.write_text(
            changed_module.read_text() + "\n// build-metrics isolated module change\n"
        )
        module_change = measured_run(build_command, snapshot, environment)
        module_change["targetDisk"] = directory_size(target)
        module_change["changedModule"] = "src/api.rs"
        module_change["changeKind"] = (
            "isolated comment append in disposable source snapshot"
        )

        executable = target / "release" / EXECUTABLE
        stripped = temporary / f"{EXECUTABLE}.stripped"
        shutil.copy2(executable, stripped)
        subprocess.run(["strip", "--strip-unneeded", stripped], check=True)
        artifacts = {
            "unstripped": {
                "bytes": executable.stat().st_size,
                "sha256": sha256_file(executable),
            },
            "stripped": {
                "bytes": stripped.stat().st_size,
                "sha256": sha256_file(stripped),
                "command": "strip --strip-unneeded",
            },
        }

        receipt = {
            "schemaVersion": 1,
            "scope": "Linux x86_64 development-host build and existing-artifact evidence only",
            "startedUtc": started_utc,
            "finishedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "repository": {
                "gitHead": command_text(["git", "rev-parse", "HEAD"]),
                "coreSourceSha256": source_sha,
                "coreSourceFiles": source_files,
                "cargoLockSha256": sha256_file(CORE / "Cargo.lock"),
                "sourceSnapshotWasDisposable": True,
                "liveAlgorithmSourcesMutated": False,
            },
            "host": host_evidence(),
            "configuration": {
                "package": PACKAGE,
                "profile": "release",
                "features": FEATURES,
                "cargoBuildJobs": JOBS,
                "cargoIncremental": True,
                "globalCargoRegistryCacheWasWarm": True,
                "targetDirectoryWasInitiallyAbsent": True,
                "nativeLibraries": ["flint", "openblas", "mpfr", "gmp"],
                "nativeLibraryArchives": native_archive_evidence(),
            },
            "dependencies": dependencies,
            "builds": {
                "cleanTargetRelease": clean,
                "warmNoOpRelease": no_op,
                "oneModuleIncrementalRelease": module_change,
            },
            "nativeArtifacts": artifacts,
            "wasmArtifacts": wasm_evidence(),
            "limitations": [
                "This receipt qualifies only the named Linux x86_64 development host; it says nothing about Windows, macOS, Linux ARM64, or CI hosts.",
                "The clean build starts from an absent target directory but reuses the user's downloaded Cargo registry and git caches; it is not a fresh dependency download.",
                "CARGO_INCREMENTAL=1 models a developer release-build loop. The shipping release recipe may disable incremental compilation.",
                "Peak RSS is sampled every 20 ms from the Linux /proc process tree; very short peaks can be missed and shared pages are summed across processes.",
                "The single-module change recompiles at Rust crate granularity; it does not imply that rustc independently compiles one source module.",
                "Wasm gzip sizes use deterministic gzip level 9, not Brotli or the final npm/package compression pipeline.",
                "Static-library duplication is inferred from manifests/build scripts, private exported memories, and absent dynamic arithmetic imports; exact duplicate byte attribution requires linker maps or componentization experiments.",
                "Only artifacts present at the recorded paths are measured. Cleaned historical arithmetic/enclosure artifacts are excluded.",
                "Build activity from other project agents and shared-host load was not controlled, so these are reproducible diagnostics rather than quiet-host acceptance medians.",
                "Native archive identities record the repository prefix named by build.rs; without a linker map they do not prove which duplicate GMP/MPFR archive supplied every final symbol.",
            ],
        }
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(json.dumps(receipt, indent=2) + "\n")
        import jsonschema

        jsonschema.validate(
            receipt, json.loads((HERE / "receipt.schema.json").read_text())
        )
        print(
            json.dumps(
                {
                    "output": str(arguments.output),
                    "builds": receipt["builds"],
                    "nativeArtifacts": artifacts,
                },
                indent=2,
            )
        )
    finally:
        if not arguments.keep_temporary:
            shutil.rmtree(temporary)
            cleaned = not temporary.exists()
        if arguments.keep_temporary:
            print(f"kept temporary directory: {temporary}")
        elif not cleaned:
            raise RuntimeError(f"failed to clean temporary directory {temporary}")


if __name__ == "__main__":
    main()
