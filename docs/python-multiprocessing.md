# Parallel Python with `multiprocessing`

Sage.js provides a Python-compatible starting point for CPU-bound parallel
work through `multiprocessing.Pool`. The implementation uses persistent Node
worker threads internally, but Python and Sage programs do not use or depend
on Node's worker API.

```python
from multiprocessing import Pool

def affine(x):
    return 3*x + 7

with Pool(4) as workers:
    values = workers.map(affine, range(1000))
```

For a Sage computation, the same interface can distribute independent exact
arithmetic tasks:

```sage
from multiprocessing import Pool

def phi(n):
    return euler_phi(n)

with Pool(4) as workers:
    print(workers.map(phi, [1009, 1013, 1019, 1021]))
```

`Pool.map` and `Pool.starmap` are synchronous, preserve input order, propagate
worker exceptions, and reuse isolated Sage.js evaluators for repeated maps.
`close`, `terminate`, `join`, and the context-manager protocol are available.
`cpu_count()` reports the host's available parallelism.
Creating a worker initializes an isolated Sage.js evaluator, so reuse one pool
across many maps instead of constructing a pool for every small operation.

## Execution model

Each worker is a separate V8 isolate in the same operating-system process.
Workers have independent Python/Sage globals and module state. This provides
real parallel execution without launching a separate operating-system process
for every Python worker. It also means that `os.getpid()` is the same in every
worker and a crash in unsafe native code can terminate the whole process.

Sage.js reports this model as:

```python
>>> import multiprocessing
>>> multiprocessing.get_start_method()
'sagejs-worker'
```

## Current serialization boundary

Functions and arguments cross an isolation boundary, much like Python's
`spawn` start method. Module functions and self-contained top-level functions
are supported. Closures and functions depending on mutable interactive globals
are not yet portable.

The initial deterministic serializer supports:

- `None`, booleans, strings, floating-point numbers, and exact integers;
- nested lists and tuples.

Support for dictionaries, Sage mathematical parents/elements, user-defined
classes, shared memory, queues, asynchronous results, and individual
`Process` objects will be added through an explicit reduce/reconstruct
registry. Unsupported values fail clearly instead of silently losing their
mathematical type.

In browser or WASM embeddings without a worker host capability, importing
`multiprocessing` remains safe and constructing a pool raises
`NotImplementedError` at runtime.
