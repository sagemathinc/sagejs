#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "$(uname -s)" != "Linux" ]] || ! command -v taskset >/dev/null; then
  echo "This evidence runner requires Linux taskset." >&2
  exit 2
fi
allowed="$(awk '/^Cpus_allowed_list:/ { print $2 }' /proc/self/status)"
cpu="${allowed%%,*}"
cpu="${cpu%%-*}"
exec taskset -c "$cpu" node \
  "$repo_root/bench/pari-class-group-port/hnf_fused_reuse_benchmark.cjs" "$@"
