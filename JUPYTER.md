# Sage.js Polyglot Jupyter kernel

Sage.js includes a real Jupyter wire-protocol kernel. It uses the same
persistent, interruptible `SageSession` as other embeddings, so the terminal,
notebook, and application APIs share one execution model.

## Install the kernelspec

From a source checkout:

```sh
pnpm install
pnpm jupyter:install
```

This builds Sage.js and installs a user kernelspec named `sagejs`. Start
JupyterLab or Notebook normally and select **Sage.js Polyglot**:

```sh
jupyter lab
```

The installer also accepts the standard placement choices:

```sh
node bin/sagejs-jupyter --install --user
node bin/sagejs-jupyter --install --sys-prefix
node bin/sagejs-jupyter --install --prefix /some/prefix
```

To install a separate kernel which disables Sage syntax and uses Python
operator semantics:

```sh
pnpm jupyter:install:python
```

That kernelspec appears as **Sage.js (Python mode)**.

The generated kernelspec records absolute paths to the current Node executable
and Sage.js checkout. Re-run the installer after moving the checkout or
changing Node installations. Remove it with:

```sh
jupyter kernelspec uninstall sagejs
jupyter kernelspec uninstall sagejs-python
```

## Notebook behavior

The kernel currently supports:

- persistent definitions and Sage syntax;
- per-cell Sage, Python, Magma, MATLAB, Maple, and Wolfram syntax;
- incrementally streamed `print()` output;
- plain-text expression results and errors;
- Plotly-backed 2D and 3D rich displays;
- global and attribute completion;
- concise object inspection;
- multiline completeness checks;
- interrupt and shutdown requests.

For example:

```py
R.<x> = QQ[]
factor(x^12 - 1)
```

```py
plot(sin(x^2), (x, 0, 2*pi), color='navy')
```

```py
plot3d(sin(x*y), (x, -pi, pi), (y, -pi, pi))
```

## Polyglot cells

Put a language magic on the first line to select a parser for one cell:

```matlab
%%matlab
A = [1 2; 3 4];
```

```py
%%sage
A[0, 0] = 9
A.tolist()
```

```magma
%%magma
A;
```

The available magics are `%%sage`, `%%python`, `%%magma`, `%%matlab`,
`%%maple`, and `%%wolfram`; `%%mathematica` is an alias for `%%wolfram`.
Without a magic, the kernelspec's default language is used.

Submitting a Magma or Maple cell also terminates its final statement, so the
last semicolon may be omitted in a notebook. Explicit Magma semicolons and
Maple `;` or `:` terminators retain their normal behavior; in particular, a
Maple colon still suppresses output.

These are not separate subprocesses or Jupyter subkernels. Each frontend
lowers its source into the same persistent Sage.js evaluator, so `A` above is
one NumPy-backed object throughout the notebook. Switching languages neither
serializes values nor copies the namespace. Mutating a compatible object in
one language makes the mutation immediately visible in every other frontend.

The foreign-language frontends intentionally implement useful initial subsets
of their source languages; they do not invoke or claim full compatibility with
the proprietary Magma, MATLAB, Maple, or Wolfram engines.

Plot results include both Plotly's structured
`application/vnd.plotly.v1+json` MIME type and a `text/html` fallback. A
frontend with a Plotly MIME extension uses the structured payload directly.
Other trusted notebook frontends load the pinned Plotly.js renderer from its
CDN and render the HTML fallback, so a separate JupyterLab extension is not
required. The browser must be online the first time it fetches that renderer;
normal browser caching applies afterward.

On Node, evaluations run in an interruptible VM context. Tight generated loops
and `time.sleep()` therefore respond by raising `KeyboardInterrupt`, ordinary
notebook definitions survive, and user code can catch the exception. An
uncooperative native call which does not return to the VM within the short
grace period is stopped by replacing the evaluator worker; only that fallback
loses the session namespace. This is the same explicit isolation contract
documented in
[`EMBEDDING.md`](EMBEDDING.md).

The first kernel version deliberately does not implement stdin prompts, widget
comms, debugger messages, or persistent history. Unsupported shell and control
request families receive explicit protocol errors; they do not silently affect
evaluation.

## Validation

The end-to-end test starts the Node kernel, connects with `jupyter_client`,
checks signed messaging, state, output, Plotly display, completion, inspection,
syntax completeness, errors, interruption recovery, and shutdown:

```sh
pnpm test:jupyter
```

The test requires the Python `jupyter_client` package. It is separate from the
default JavaScript test suite so developing Sage.js itself does not require a
Python/Jupyter installation.
