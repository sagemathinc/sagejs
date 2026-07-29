# Sage.js Jupyter kernel

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
JupyterLab or Notebook normally and select **Sage.js**:

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

Interrupting arbitrary synchronous JavaScript or native mathematics is made
reliable by terminating and replacing the evaluator worker. Consequently, an
interrupt stops the computation without killing the Jupyter kernel process,
but definitions from the interrupted session are reset. This is the same
explicit isolation contract documented in [`EMBEDDING.md`](EMBEDDING.md).

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
