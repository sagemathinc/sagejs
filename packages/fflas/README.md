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
