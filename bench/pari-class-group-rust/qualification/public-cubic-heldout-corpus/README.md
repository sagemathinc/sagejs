# Restricted held-out cubic execution

This lane executes exactly the twelve frozen held-out degree-three inputs. It
is deliberately unable to perform oracle comparison: `run.py` reads only the
committed answer-free panel and selection receipt, and it has no private
evidence argument.

The complete Rust stdout is answer-bearing. The runner therefore requires an
explicit `--private-results` path outside the repository and writes it with
mode `0600`. Its ordinary receipt contains only case IDs, timings, request
hashes, process classifications, and redacted failure stages. A disclosure
scanner validates the receipt before it is written.

Historical qualification note: `config.json` existed only as an uncommitted
worktree file when this first blind campaign ran. It therefore did **not**
preregister its confirmation seed or policy. The generated `receipt.json`
remains immutable historical 3/12 evidence. The separately materialized
`public-cubic-heldout-confirmation/` v2 policy and inputs are the post-fix
confirmation gate. No failed case may be removed or replaced.

Run from the repository root with a private directory:

```bash
umask 077
private_dir=$(mktemp -d /tmp/sagejs-heldout-cubic.XXXXXX)
python3 bench/pari-class-group-rust/qualification/public-cubic-heldout-corpus/run.py \
  --private-results "$private_dir/rust-results.json"
```

Do not publish the private bundle. Oracle comparison is a later, separate
process in `public-cubic-heldout-oracle/`.
