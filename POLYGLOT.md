# Sage.js polyglot interoperability

Sage.js language frontends are views of one live mathematical workspace. They
do not launch six interpreters or serialize values through an interchange
format. Sage, Python, Magma, MATLAB, Maple, and Wolfram source are each parsed
and lowered into code for the same JavaScript evaluator, so compatible names
refer to the same object.

This makes workflows such as this possible in one Jupyter notebook:

```matlab
%%matlab
A = [1 2; 3 4];
```

```python
%%sage
A[0, 0] = 9
R = QQ['t']
t = R.gen()
f = t^2 + 1
```

```magma
%%magma
Type(A);
Type(f);
Factorization(2026);
```

The MATLAB matrix is not copied when the Sage cell mutates it. The Magma cell
observes the same array and polynomial, using Magma-style global
introspection and intrinsic calls.

## Contract

The initial interoperability contract is deliberately precise:

- One kernel or embedding session owns one ordered evaluator namespace.
- A name assigned by one frontend is immediately visible to every other
  frontend.
- Mutable supported objects retain identity. A mutation made through one
  frontend is visible through the others.
- Immutable values are reused directly; they are not converted through text.
- A frontend may provide a language-appropriate *view* of an object, such as
  MATLAB's one-based indexing of the shared zero-based ndarray.
- An unsupported operation fails explicitly. Sage.js does not silently copy
  or approximate a value to make an expression appear to work.
- Language switching changes parsing and surface semantics, not the stored
  workspace.

The executable specification is [`test/polyglot.cjs`](test/polyglot.cjs).
It creates one representative workspace, observes it through every frontend,
mutates an ndarray from both MATLAB and Python syntax, and verifies a
documented unsupported indexing case.

## Compatibility matrix

The terms used below are:

- **direct** — the shared object supports useful native operations in that
  frontend;
- **view** — the same object is exposed with frontend-specific conventions;
- **inspect** — it can be named, displayed, and classified, but that frontend
  does not yet implement its important operations;
- **limited** — only a small explicit subset is supported.

| Shared value | Sage / Python | Magma | MATLAB | Maple | Wolfram |
|---|---|---|---|---|---|
| Boolean | direct | direct, `Type` | `class` view | `whattype` | `Head` |
| Exact integer | direct | direct intrinsics | inspect | direct arithmetic | direct number theory |
| Exact rational | direct | direct | inspect | inspect | inspect |
| Real / complex | direct | inspect | numeric view | inspect | inspect |
| String | direct | inspect | `char` view | inspect | inspect |
| List / tuple | direct | one-based view | one-based scalar view | inspect | `List` inspect |
| Set / dictionary | direct | inspect | inspect | inspect | inspect |
| NumPy ndarray | direct | inspect | direct, one-based/column-major view | inspect | dimensions/inspect |
| Polynomial ring / element | direct | inspect and Sage operations | inspect | inspect | inspect |
| Symbolic expression | direct | inspect | inspect | inspect | inspect |
| 2D / 3D graphics | direct and rich display | inspect | inspect | inspect | inspect |

Frontend-native inspection currently includes:

| Frontend | Operations |
|---|---|
| Magma | `Type`, `Parent` |
| MATLAB | `size`, `numel`, `class` |
| Maple | `whattype`, `nops` |
| Wolfram | `Head`, `Dimensions`, `Length` |

These names describe the object honestly. For example, MATLAB `class` reports
`sage.Integer` for an arbitrary-precision Sage integer rather than claiming
it is a MATLAB `double`, while a NumPy-backed matrix reports its actual dtype.

## Known boundaries

The foreign frontends are compatibility slices, not replacements for the
commercial systems. In particular:

- no vendor runtime, package, ABI, or proprietary object is embedded;
- a Sage polynomial or symbolic expression is currently inspectable but does
  not acquire the full native syntax and function library of every frontend;
- MATLAB ndarray indexing is substantially richer than indexing an ordinary
  shared list; the latter currently accepts one scalar index;
- sets and dictionaries have no invented automatic mapping to MATLAB arrays;
- graphics share a rich Plotly display payload, but foreign-language graphics
  constructors remain small proof-of-concept subsets.

These boundaries keep future extensions honest: each new operation can be
added to the executable corpus and promoted from **inspect** to **view** or
**direct**.

## Example notebook

[`examples/sagejs-polyglot.ipynb`](examples/sagejs-polyglot.ipynb) is a
short, output-free notebook intended for JupyterLab, Notebook, or CoCalc.
Install the kernel with:

```sh
pnpm jupyter:install
```

Then choose **Sage.js Polyglot** and run the cells in order.

## Frontend overhead benchmark

Run:

```sh
pnpm bench:polyglot
```

The benchmark creates one shared session and reports the first evaluation and
median of nine subsequent evaluations for each parser. It measures frontend
and kernel round-trip overhead, not mathematical throughput.

An illustrative measurement on the development host (Linux x86-64,
Node 26.5.1, with other work on the machine) was:

| Frontend | First evaluation | Warm median |
|---|---:|---:|
| Sage | 10.34 ms | 2.63 ms |
| Python | 2.04 ms | 1.92 ms |
| Magma | 30.87 ms | 5.90 ms |
| MATLAB | 62.40 ms | 12.46 ms |
| Maple | 5.66 ms | 3.79 ms |
| Wolfram | 8.75 ms | 4.50 ms |

The first MATLAB evaluation includes lazy initialization of its larger
tree-sitter grammar and NumPy-backed runtime. These values are not release
thresholds; the command exists so changes and target computers can be
measured under identical semantics.
