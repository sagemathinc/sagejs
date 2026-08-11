# `@sagemath/sagejs-fflas`

This optional package provides generated, host-isolated FFLAS/FFPACK
accelerators for packed dense matrix multiplication, rank, and canonical RREF
over small prime fields.

The public matrix representation remains Sage.js-owned row-major `uint64`
storage. The generated boundary converts one complete operation to
`Givaro::Modular<float>` storage, invokes the mature FFLAS/FFPACK algorithm,
and transactionally converts the result back. No FFLAS pointer escapes the
adapter.

The first capability covers prime moduli below 256 on supported Unix hosts.
Windows and portable builds retain the declared FLINT implementation as their
tested fallback.

## Native dependencies

`pnpm --dir packages/fflas build` obtains the pinned GMP, Givaro,
FFLAS-FFPACK, and OpenBLAS prefix through Sage.js's content-addressed native
artifact cache. On supported Unix hosts the cache publishes that prefix once,
makes it read-only, and links every Git worktree to the same immutable payload.
Concurrent cold builds serialize on the artifact key, so only one worktree
performs the dependency build. Generated Node adapters remain separate cached
artifacts because they also depend on the Node ABI and current declarations.
Downloaded archives and extracted build trees are discarded after successful
publication; they are never replicated across warm worktrees.

Installed configuration scripts and `pkg-config` metadata derive their prefix
from their own location, and unnecessary path-bearing libtool archives are
removed before publication. The shared prefix therefore remains usable after
the worktree that built it is deleted; it does not retain a hidden dependency
on that builder path.

Set `SAGEJS_PARALLEL_NATIVE_CACHE` to move the shared artifact store. Setting
`SAGEJS_FFLAS_PREFIX` or `SAGEJS_FLINT_PREFIX` opts out because an externally
managed prefix has no cache content identity.
