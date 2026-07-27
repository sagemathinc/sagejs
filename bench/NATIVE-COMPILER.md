# Native compiler proof of concept

This experiment asks whether Sage.js can compile selected library functions as
whole native algorithms instead of crossing Node-API for every scalar
operation.

Run it with:

```sh
pnpm run bench:native
```

The input is ordinary Sage.js source:

```python
def multiply_loop(field, iterations):
    value = field("1.25", "-0.75")
    step = field("1.0000000000000002", "0.0000000000000001")
    for _ in range(iterations):
        value = value * step
    return value
```

`tools/native-compiler-poc.cjs` parses this through the existing Sage.js
parser. It does not use textual substitution. It validates a deliberately
small statically typed subset of the AST:

- one function whose arguments are externally typed as `ComplexField` and a
  nonnegative machine iteration count;
- local complex values constructed from two decimal string literals;
- `for ... in range(iterations)`;
- local complex multiplication;
- return of the local complex result.

The backend emits C using MPC, invokes `node-gyp`, and loads the resulting
Node addon. The JavaScript/native boundary is crossed once for the complete
loop. Because the local value cannot escape during the loop, the generated C
updates its MPC storage in place without creating an immutable JavaScript
wrapper on every iteration. The final proof-of-concept addon returns decimal
components; a production backend would return the standard Sage.js native
element representation through a shared native ABI.

## Representative result

Measured on 2026-07-27 using an AMD EPYC 7B13, Node.js 26.5.0, and SageMath
10.9.post1:

| Precision | Generated C/MPC | Sage.js loop | Speedup | SageMath/Cython |
|---:|---:|---:|---:|---:|
| 53 bits | 172 ns/iteration | 1514 ns | 8.8x | 207 ns |
| 1000 bits | 1033 ns/iteration | 2560 ns | 2.5x | 789 ns |
| 10000 bits | 26254 ns/iteration | 29100 ns | 1.1x | 20531 ns |

The generated 53-bit loop is comparable to, and in this run slightly faster
than, Sage's Cython loop. This demonstrates that the earlier small-operation
gap is not a fundamental limitation of Node or JavaScript as the calling
environment. It comes from placing immutable native-object creation and a
Node-API crossing inside the hot scalar loop.

Sage's complex field implements multiplication directly using four MPFR
multiplications, while the generated prototype calls MPC. The remaining
large-precision difference therefore includes a native-kernel implementation
difference, not merely compiler or language overhead.

## What a real backend would need

The next design layer is a typed intermediate representation rather than more
special cases in this proof:

- explicit argument, local, parent, and element types;
- ownership and escape analysis so safe local mutation is automatic;
- lowering of arithmetic and coercion plans to backend operations;
- error and cleanup paths with Sage-compatible exceptions;
- a shared native element ABI for zero-copy arguments and results;
- caching keyed by source, types, compiler flags, library ABI, and platform;
- C, C++, or Rust backends selected independently of the Sage.js frontend;
- tests which run the same source through JavaScript and native targets.

This is analogous to the role Cython plays for Sage: ordinary interactive code
continues to compile quickly to JavaScript, while stable, frequently executed
library kernels opt into typed ahead-of-time native compilation.
