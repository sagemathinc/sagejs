#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
radius=${1:?usage: run.sh RADIUS [TIMEOUT_SECONDS]}
timeout_seconds=${2:-120}
mkdir -p "$here/results"
cargo build --quiet --release --manifest-path "$here/Cargo.toml"
python3 "$here/run.py" "$radius" "$timeout_seconds"
