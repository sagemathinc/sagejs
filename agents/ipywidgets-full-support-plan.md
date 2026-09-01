# Full ipywidgets and Sage interact support plan

## Status and outcome

Implementation is active. As of 2026-08-31:

- P0 is complete: upstream versions, licenses, protocol fixtures, test
  inventory, and the normalized CPython corpus are pinned.
- P1–P5 are complete for the primary path: upstream traitlets, comm, and
  ipywidgets run as compiled Python; rich display and binary comm transport
  work in the evaluator and standard Jupyter kernel.
- The app portion of P6B is complete for core widgets and `Output`, including
  offline assets, bidirectional state updates, reset behavior, and browser
  acceptance coverage. A core gallery now qualifies scalar/nested controls,
  frontend-only `jslink`, rich `Output` capture/clear/error behavior, and a real
  binary `FileUpload` round trip in offline Chromium. The browser manager eagerly
  instantiates comm-opened headless models, matching Jupyter's requirement for
  link models that are not reachable from the displayed widget tree. Incoming
  typed-array buffers are normalized to Python `memoryview` objects before
  upstream ipywidgets deserialization. Live models and views have explicit
  per-session limits; retained `Output` state is capped at one MiB per control;
  clear/reset deterministically removes rendered views, and reset replaces stale
  controls with a rerun notice. Frontend events have a bounded queue and widget
  callbacks have a worker-replacing timeout; a regression deliberately runs a
  nonreturning Python callback and verifies that the clean replacement kernel
  immediately evaluates new code. P6A now has a transport-neutral controller
  used by the full app and a provisional Shadow DOM `<sagejs-cell>`/ESM
  factory. Declarative and factory-created host prototypes qualify independent
  lifecycle, Sage/Python mode construction, rich output, KaTeX, and a live Sage
  `@interact` slider in Chromium. An unrelated strict-CSP host also loads the
  public component/runtime without COOP or COEP; a local Blob module bootstrap
  explicitly handles both remote worker levels, and the edge serves only the
  required credential-free assets with CORS/CORP. A dedicated sandboxable frame
  is also qualified cross-origin with exact parent source/origin checks,
  bounded request ids/messages/results, deferred initialization, and a narrow
  lifecycle protocol; only that document relaxes the global anti-framing
  headers. Shared-session pooling, the complete capability comparison, and the
  broader browser matrix remain open before the `/embed/v1/` interfaces are
  declared stable.
- P7's kernel-side Sage compatibility layer is implemented and covered by
  executable PREP and Sage differential corpora. Sage-global `@interact`,
  `input_box`, `slider`, `range_slider`, `checkbox`, `selector`,
  `color_selector`, `input_grid`, and `text_control` use standard ipywidgets
  models. Automatic boolean/string/integer/real/list/iterator/tuple inference,
  matrix and vector grids, custom PREP layout placement, initial and manual
  updates, localized callback errors, and text-only CLI behavior are
  qualified. PREP's plotting-control and tangent-line calculus examples run
  their documented defaults, and a lazy `sage.interacts` library ships tested
  Taylor-polynomial, derivative, quadratic-equation, coin-toss, and basic demo
  applications. Text controls evaluate through the authoritative Sage parser
  in native kernels and the isolated browser compiler, while Python `eval`
  retains Python semantics. The app's interactive symbolic-plot and editable
  function-explorer presets exercise Sage `@interact` offline; browser
  acceptance changes `x^3 - 2*x` to `x^4`, verifies the plot update, and then
  verifies clean widget teardown across a kernel reset.
  Completing the remaining full browser/Jupyter PREP matrix and upstream Sage
  widget doctest inventory remains open.
- P8–P10 and the remaining lifecycle, embedding, documentation, budget, and
  four-platform gates remain open. Custom widgets remain deliberately last.

The outcome is first-class support for the standard ipywidgets protocol and
core widget API in Sage.js, followed by Sage-compatible `@interact` and the
legacy Sage interact constructors used throughout the PREP tutorials.

The same kernel-side widget objects must work in:

- the Sage.js Jupyter kernel, using an ordinary widget-aware Jupyter client;
- `app.sagejs.org`, using a browser manager embedded directly in the app;
- third-party websites, using a reusable Sage.js Cell component or sandboxed
  embed with all computation still performed locally in the visitor's browser;
- the CLI, where widget construction, callbacks, and textual representations
  remain useful even though no live controls can be displayed;
- native Node and browser WebAssembly runtimes without CPython, IPython,
  `jupyter`, `jupyter.exe`, or a Python environment.

The implementation should use the upstream ipywidgets model and protocol, not
invent `application/vnd.sagejs.interact+json` or a Sage.js-only control
protocol. This plan supersedes P2 of
`agents/undergraduate-mathematics-larger-subsystems-plan.md`.

The initial product guarantee is:

> Sage.js supports the ipywidgets 8 core widget framework, the standard core
> controls, and Sage `@interact` over the standard ipywidgets protocol.
> Third-party custom widget packages are qualified individually, while the
> generic custom-model/module transport is part of the supported framework.

“Full ipywidgets support” does not mean that every Python package which happens
to publish a custom widget automatically works. Such a package may depend on
Matplotlib, pandas, SciPy, browser assets, or unsupported Python facilities.
It does mean that Sage.js implements the upstream kernel API and wire protocol
faithfully enough that compatible custom widget packages do not need a
Sage.js-specific transport.

## Product and historical motivation

Interactive controls are table stakes for many instructors comparing a system
with Mathematica's `Manipulate`. The original Sage notebook `interact` work
predated Jupyter; Jason Grout subsequently led ipywidgets, and Jeroen Demeyer
later rebuilt Sage's interact layer on top of that standard framework. The
Sage.js implementation should complete that lineage rather than fork it again:
run upstream ipywidgets, preserve Sage's teaching-facing API, and make the same
controls available in a serverless embeddable web cell.

This is therefore both a compatibility project and a distribution advantage.
An instructor should be able to place an interactive Sage example in course
notes without provisioning a Sage server, accounts, containers, or a remote
code-execution service; student code and state stay in the student's browser.

## Why this is the right architecture

Modern Sage does not have an independent interact protocol. Its
`sage_interactive` subclasses `ipywidgets.widgets.interaction.interactive` and
adds Sage-aware conversion of expressions, colors, matrices, ranges, legacy
SageNB controls, layout, and manual-update behavior. The Sage adaptation is
about 1,323 lines across:

- `/home/user/sagelite/src/sage/repl/ipython_kernel/interact.py`;
- `/home/user/sagelite/src/sage/repl/ipython_kernel/widgets.py`;
- `/home/user/sagelite/src/sage/repl/ipython_kernel/widgets_sagenb.py`.

Those classes deliberately reuse standard ipywidgets model and view names.
They therefore do not need a Sage-specific JavaScript extension.

The upstream runtime is also tractable when its hidden dependencies are made
explicit:

| Component | Approximate first-party source | Role |
| --- | ---: | --- |
| ipywidgets Python runtime | 6,369 Python lines | Models, serialization, controls, interaction |
| traitlets runtime | 8,482 Python lines | Descriptors, validation, defaults, observation, linking |
| comm | 387 Python lines | Kernel-side comm abstraction |
| core browser manager and controls | 9,343 TypeScript lines | Synced models and DOM views |
| Sage interact adaptation | 1,323 Python lines | Sage-compatible control inference and conversion |

The full IPython package is not required. The inspected ipywidgets sources use
only a narrow compatibility surface: `get_ipython()`, `display()`,
`clear_output()`, shell event hooks, parent-message lookup, traceback display,
and display-object formatting.

### JupyterLite JavaScript-kernel reference

The JupyterLite JavaScript kernel is a useful independent reference
implementation. Its current BSD-3-Clause TypeScript sources implement the
standard Jupyter comm transport and a substantial ipywidgets-compatible
kernel-side model layer, including numeric, boolean, string, selection,
container, layout, style, link, output, and button classes. The project
explicitly marks some selection, output-capture, and callback behavior as
partial. By contrast, the older IJavaScript kernel provides rich
`display_data` and `update_display_data` output but no widget comm or model
framework.

This evidence confirms that a Python-free kernel can interoperate with the
standard browser widget managers, but it does not change the Sage.js
implementation choice. Sage's interact classes subclass the Python ipywidgets
API, compatible third-party Python widgets depend on traitlets semantics, and
Sage.js already compiles serious Python source to JavaScript. A nominally thin
Python facade over a second JavaScript widget object system would instead have
to proxy descriptors, validation, observation, inheritance, callbacks,
serialization, links, and binary buffers.

Use the JupyterLite implementation as:

- a second protocol and lifecycle oracle alongside CPython ipykernel;
- a reference for comm routing, model state, serialization, and browser-manager
  integration;
- a source of differential tests and, after an explicit audit, potentially
  reusable low-level BSD-licensed transport ideas.

Do not make it the semantic authority, wrap its widget classes as Sage.js's
Python API, or add it as a runtime dependency merely to obtain widgets. Freeze
an exact inspected revision in P0 before relying on any behavior or code.

CoCalc has already solved the browser-manager problem in a reusable form.
`@cocalc/widgets` is an Apache-2.0 package derived from Google Colab’s custom
widget manager. Version 1.3.0 exposes a small `WidgetEnvironment` interface:

- `getSerializedModelState(modelId)`;
- `openCommChannel(...)`;
- `renderOutput(...)`;
- `loadClass(...)`.

Its current minified manager is about 748 KiB before measuring the final
Sage.js bundle and CSS. Sage.js should reuse this manager architecture and
upstream `@jupyter-widgets` packages. It must not copy CoCalc’s collaborative
database, replay, or RTC layers into the single-user browser app.

This package was written and is maintained by the Sage.js/CoCalc project lead,
so it is a controlled architectural dependency whose integration boundary can
be improved upstream when Sage.js exposes a simpler use case. Preserve the
Google Colab and SageMath, Inc. license attribution when distributing it.

The resulting ownership graph is:

```text
traitlets ───────────────┐
                         v
comm + IPython facade -> ipywidgets Python -> Sage interact wrappers
          ^                    |
          |                    v
  transport-neutral     widget model state, views, buffers,
  Sage.js comm core      callbacks, display and output capture
          |
          +------------------------+
          |                        |
          v                        v
  Jupyter ZMQ adapter       SageSession/worker adapter
          |                        |
          v                        v
 existing client manager   @cocalc/widgets in app.sagejs.org
```

## Baseline and concrete gaps

The implementation should start from recorded facts rather than a broad
“port ipywidgets” task.

### Python runtime baseline

The audited upstream clone is `/home/user/upstream/ipywidgets`, currently
ipywidgets 8.1.9 with widget protocol 2.1.0 and control protocol 1.0.0. Its
declared Python dependencies are `comm`, IPython, `traitlets`,
`widgetsnbextension`, and `jupyterlab_widgets`.

The last two are frontend asset/install packages, not kernel-side semantic
dependencies. Sage.js should not pretend to import a Jupyter server merely to
construct a widget.

A read-only installation probe established:

- the pure-Python `comm` wheel imports in Sage.js unchanged;
- current `traitlets` first encounters missing `ast.literal_eval`;
- after bypassing that one diagnostic, current `traitlets` exposes a Sage.js
  class/typing incompatibility around parameterized generic bases;
- these are localized Python-runtime compatibility gaps, not a need for native
  code or CPython.

The implementation must replace that probe with a checked compatibility matrix
and upstream tests. It must not pin an obsolete traitlets solely to avoid
fixing correct Python semantics.

### Kernel baseline

`tools/jupyter-kernel.ts` currently:

- publishes streams and one final rich result;
- implements `comm_info_request` by returning an empty map;
- does not accept or publish `comm_open`, `comm_msg`, or `comm_close`;
- has no retained comm target/callback registry;
- has no nested output-capture stack for an `Output` widget.

The kernel and evaluator already preserve a long-lived Sage session. A comm
callback can therefore retain ordinary compiled Python closures; the missing
piece is a safe asynchronous host entry point and message queue.

### Browser-app baseline

`app.sagejs.org` evaluates through `SageSession` and a worker, not the Jupyter
wire protocol. Its client/worker channel currently carries evaluation,
stdout, interruption, errors, and one final rich result. It already has KaTeX,
Plotly, themed output, resource limits, offline caching, and session reset.

The app needs a transport adapter, not a local Jupyter server. Widget events
must be additional `SageSession` events and requests over the existing worker
boundary.

The current website is a standalone application rather than an embeddable
library. Its production headers intentionally set `frame-ancestors 'none'`,
`X-Frame-Options: DENY`, COOP/COEP/CORP isolation, and a same-origin CSP. The
standalone app should remain locked down. Embedding should be a separate,
versioned product surface with its own reviewed headers and API, not a blanket
weakening of the main application.

### Jupyter-client boundary

A kernel cannot make a widget-blind frontend render ipywidgets. JupyterLab,
CoCalc, nteract, classic Notebook, and other clients own their browser widget
manager. The Sage.js kernel will emit the standard protocol and MIME types;
clients must provide a compatible manager just as they do for a CPython
kernel.

`sagejs --install-jupyter-kernel` remains independent of Python and Jupyter.
It should not blindly mutate a possibly remote Jupyter frontend installation.
Documentation and diagnostics should explain the frontend requirement and
name tested clients.

## Non-negotiable design decisions

1. **Use the standard protocol.** Implement `jupyter.widget` and
   `jupyter.widget.control`, widget protocol 2.x metadata, the standard model
   state schema, standard binary buffer paths, and
   `application/vnd.jupyter.widget-view+json`.
2. **Run upstream Python wherever practical.** Vendor or package audited
   upstream `traitlets`, `comm`, and ipywidgets sources. Fix Sage.js Python
   semantics before maintaining a Sage.js rewrite. Carry a small explicit
   patch ledger only when an upstream portability fix is genuinely necessary.
3. **Do not port all of IPython.** Implement an honest, tested compatibility
   facade for the APIs used by ipywidgets. Unsupported IPython APIs raise
   useful `ImportError` or `NotImplementedError` rather than silently doing
   nothing.
4. **Keep comm transport-neutral.** Widget Python code must not know whether
   its peer is Jupyter ZMQ, a browser worker, a Node embedding, or a test
   harness.
5. **Reuse the browser frontend.** Use `@cocalc/widgets` and upstream
   `@jupyter-widgets/base`, `controls`, and `output`. Do not reimplement DOM
   controls or model synchronization.
6. **Core widgets work offline.** Bundle and service-worker-cache the standard
   core manager, controls, output views, and CSS in app.sagejs.org. Unknown
   custom modules may use a separately governed online loader, but core
   functionality cannot depend on a CDN.
7. **Lazy-load the subsystem.** Public names may be discoverable at startup,
   but traitlets, ipywidgets Python, the browser manager, controls, CSS, and
   custom loaders load only when first used. Startup and executable-size
   budgets remain ratchets.
8. **Preserve exact bytes.** Binary buffers must stay binary across Python,
   worker structured cloning, ZMQ multipart frames, browser models, state
   snapshots, and file upload/media widgets. Base64 is not the internal live
   transport.
9. **Serialize user callbacks.** Comm callbacks execute on the owning session
   queue, publish busy/idle status where appropriate, and cannot reenter a
   simultaneous cell evaluation.
10. **Treat custom JavaScript as code.** Loading an arbitrary third-party
    widget module is equivalent to executing third-party JavaScript. The app
    needs trust, CSP, provenance, and offline policies rather than an
    unrestricted silent CDN fallback.
11. **Build the standalone app from an embeddable cell component.** The editor,
    execution controls, output stream, widget manager, and lifecycle must have
    instance-scoped APIs. `app.sagejs.org` becomes one full-page consumer of
    that component rather than the only place its logic can run.

## Compatibility tiers

The project should publish explicit tiers instead of one ambiguous checkbox.

### Tier A — Core kernel API

- upstream `traitlets` observation/validation/linking semantics;
- upstream `comm` API backed by Sage.js;
- ipywidgets `Widget`, `DOMWidget`, `ValueWidget`, model registry, display,
  state synchronization, custom messages, links, and binary buffers;
- widget protocol and control protocol compatibility;
- meaningful behavior without a frontend.

### Tier B — Standard ipywidgets controls

- boolean, integer, float, text, selection, container, layout, and style
  widgets;
- date, time, datetime, color, media, upload, tags, templates, controller,
  link, and output widgets where supported by the upstream core frontend;
- `interact`, `interactive`, `interactive_output`, `fixed`, `link`, `dlink`,
  `jslink`, and `jsdlink`;
- state hold/batching, echo updates, multiple views of one model, lifecycle,
  close, and control-channel state discovery.

### Tier C — Sage interact compatibility

- `interact` and `@interact` in the Sage global namespace;
- `input_box`, `slider`, `range_slider`, `checkbox`, `selector`,
  `color_selector`, `input_grid`, and `text_control`;
- Sage expression evaluation, symbolic range coercion, colors, matrices,
  transformations, labels, layouts, `auto_update`, and manual update;
- PREP tutorial and selected `sage.interacts.library` applications.

### Tier D — Custom widget framework

- arbitrary model/view module metadata is preserved;
- custom messages and binary buffers work;
- a local fixture widget proves the full extension interface;
- third-party modules can be loaded through a governed module loader;
- named packages are qualified individually with exact versions and explicit
  Python/browser dependencies.

Passing Tier D does not assert that every package on PyPI or npm is supported.

## P0 — Freeze upstream inputs and build the conformance corpus

Before changing runtime code:

1. Select exact audited versions of ipywidgets 8, traitlets 5, comm 0.2, the
   corresponding `@jupyter-widgets` packages, and `@cocalc/widgets`.
2. Record source URLs, commit hashes, package integrity hashes, licenses, and
   protocol versions in a machine-readable dependency manifest.
3. Record an exact JupyterLite JavaScript-kernel revision as a secondary
   implementation reference, classify its partial widget behaviors, and keep
   CPython ipywidgets as the semantic oracle.
4. Keep upstream source ordinary CPython-parseable Python. Do not transliterate
   it into JavaScript or inject host code into mathematical/library modules.
5. Inventory upstream tests and classify them as:
   - pure Python semantics;
   - comm/protocol behavior;
   - IPython compatibility;
   - frontend/browser behavior;
   - packaging or documentation only.
6. Capture differential wire transcripts from a CPython ipykernel for a small
   canonical corpus:
   - `IntSlider`, `FloatRangeSlider`, `Text`, and `Dropdown`;
   - nested `HBox`/`VBox`, `Layout`, and style objects;
   - `Output` with text, LaTeX, a plot, clearing, and an exception;
   - `link`, `dlink`, `jslink`, and multiple views;
   - `Image` and `FileUpload` binary buffers;
   - frontend-initiated state requests and comm closure;
   - a tiny custom widget with a custom message and a binary buffer.
7. Normalize only nondeterministic fields such as UUIDs, timestamps, and
   parent message ids. State keys, metadata, ordering requirements, buffer
   paths, message types, and values remain exact oracle data.
8. Add a protocol-version policy: support the selected ipywidgets 8 protocol,
   reject incompatible major versions clearly, and test allowed minor-version
   variation.

Acceptance gate:

- every runtime dependency and test has a recorded disposition;
- the CPython transcript corpus can be regenerated independently;
- licensing is compatible with Sage.js GPL-3 distribution and notices are
  included in release assets;
- no implementation is permitted to “make the demo work” by deviating from an
  unclassified upstream behavior.

## P1 — Make current traitlets run correctly

Treat traitlets as a Python-runtime conformance project, not as widget-specific
special cases.

### Required Python facilities

Audit and fix at least:

- `ast.literal_eval` with CPython-compatible accepted and rejected syntax;
- parameterized `typing.Generic` bases and generic aliases in class
  definitions;
- descriptors, `__set_name__`, metaclasses, MRO, `super()`, and dynamically
  generated classes;
- function and class signatures, annotations, bound methods, and decorators;
- weak references and callback cleanup;
- context managers and exception propagation;
- logging, warnings, `copy`, enum, pathlib, and import helpers used by
  traitlets;
- identity/equality behavior for sentinel and undefined values;
- ordered notification delivery and exception behavior.

Avoid a special “traitlets class” path in the compiler. Each correction must
have a small general Python regression test plus the upstream traitlets test
that motivated it.

### Traitlets semantic gates

- class trait collection and inherited metadata;
- default factories and dynamic defaults;
- validation and cross-validation;
- `observe`, `unobserve`, notification filtering, and callback ordering;
- `hold_trait_notifications` batching and rollback after validation failure;
- container traits and mutation/equality behavior;
- `Instance`, `Type`, forward declarations, unions, enums, tuples, lists,
  sets, dictionaries, bytes, and callable traits used by ipywidgets;
- `link` and `dlink`, transformation functions, and unlinking;
- trait metadata including `sync=True`, serializers, and help text.

Acceptance gate:

- the selected upstream traitlets runtime imports without source rewriting;
- its applicable upstream suite passes in Sage.js Python mode;
- a CPython/Sage.js differential corpus covers notification order and failure
  modes, not only final values;
- import is lazy and does not measurably regress normal Sage.js startup.

## P2 — Add the narrow IPython display facade

Create a compatibility package sufficient for upstream ipywidgets while
keeping the boundary honest.

### Required public behavior

- `IPython.get_ipython()` returns a session-local shell facade when running in
  a Sage.js interactive/evaluation session and `None` in an isolated context;
- `IPython.display.display(*objects, display_id=..., update=...)` publishes
  zero or more rich display events immediately;
- `clear_output(wait=False)` publishes the standard clear event;
- display handles can update an existing display id;
- `InteractiveShell.instance().display_formatter.format(obj)` returns a
  standard MIME bundle and metadata for the object;
- shell event hooks used around comm callbacks are present;
- parent-message lookup/set behavior is sufficient for `Output` capture;
- traceback display uses Sage.js error normalization without swallowing an
  exception accidentally.

Refactor the evaluator’s current “stdout plus one final display” contract into
an ordered stream of display events followed by an optional final result. Keep
the existing simple API compatible for callers which do not subscribe to the
event stream.

An output event should distinguish:

- stream;
- `display_data`;
- `update_display_data`;
- `clear_output`;
- error;
- final `execute_result`.

Each event carries its parent execution/comm context and optional display id.
The transport adapters decide how to encode it.

Acceptance gate:

- upstream ipywidgets imports do not require the full IPython distribution;
- nested `Output` contexts capture only their intended events;
- ordinary cell output remains byte-for-byte or MIME-for-MIME compatible with
  the pre-widget behavior;
- unsupported IPython imports fail with a message that identifies the missing
  compatibility surface.

## P3 — Implement a transport-neutral comm core

Use upstream `comm` interfaces with a Sage.js-specific backend.

### Kernel-side objects

Implement:

- `BaseComm` publication for open, message, and close;
- a session-local `CommManager` with target and live-comm registries;
- target registration/unregistration;
- kernel-initiated and frontend-initiated comms;
- message and close callbacks;
- `comm_info` with optional target filtering;
- metadata and multipart binary buffers;
- deterministic closure of all live comms on session reset or shutdown.

Expose the minimum host operations through `sagejs.runtime`; do not place raw
JavaScript in `comm` or ipywidgets Python sources.

### Internal event schema

Define one versioned internal schema for:

```text
open(comm_id, target_name, data, metadata, buffers)
message(comm_id, data, metadata, buffers)
close(comm_id, data, metadata, buffers)
```

Buffers are ordered byte arrays and never embedded in JSON. Validate ids,
target names, JSON depth, buffer counts, buffer sizes, and total message size
at the host boundary.

### Execution scheduling

- Incoming comm handlers join the same serial session queue as cell
  evaluation.
- Jupyter handlers publish busy before invoking arbitrary Python and idle
  afterward, as required by the message specification.
- High-frequency slider messages retain ordering while bounded coalescing is
  permitted only where the widget protocol declares it safe.
- Reset/interruption invalidates pending callbacks and closes the associated
  browser models.
- One failing callback reports an error in its parent context without
  corrupting the comm registry.

Acceptance gate:

- a frontend-neutral test harness can open, exchange JSON and binary data, and
  close comms in both directions;
- live comm information is exact;
- callback ordering and busy/idle transitions match the Jupyter oracle;
- leaks and stale callbacks are absent after repeated create/close/reset
  cycles.

## P4 — Run upstream ipywidgets Python

Integrate the selected upstream Python sources with minimal, audited patches.

### Core model behavior

Qualify:

- widget registration and lookup by module/name/version;
- comm open metadata and initial state;
- synchronized trait discovery through `sync=True` metadata;
- custom serializers and nested `IPY_MODEL_<id>` references;
- binary extraction/reinsertion and exact buffer paths;
- state diffing, echo updates, property locks, `hold_sync`, and
  `hold_trait_notifications`;
- frontend state updates with validation and notification;
- custom messages and callback dispatch;
- display MIME bundles, repeated views, close, and garbage/lifecycle rules;
- control comm state requests and model reconstruction.

### Core widget classes

Do not stop after the controls needed by one PREP example. Run the upstream
core suite for:

- booleans, buttons, integer and float controls;
- text, password, textarea, combobox, and labels/HTML/HTMLMath;
- dropdown, radio, select, toggle, slider, and multiple-selection controls;
- boxes, accordion, tab, stack, gridbox, layout, and style;
- date, time, datetime, color, tags, media, image, audio, video, file upload,
  play, progress, controller, templates, and links;
- `Output` and interaction helpers.

For browser-dependent controls such as game controllers, separate correct
model/protocol support from browser hardware availability.

### CLI/no-frontend behavior

- construction does not crash when no comm transport is installed;
- reprs and trait access remain useful;
- `interactive` evaluates documented initial defaults where upstream does;
- display explains that live controls require a compatible frontend without
  printing a warning for every child model;
- programmatic observation and links work entirely in the kernel.

Acceptance gate:

- applicable upstream ipywidgets Python tests pass;
- golden CPython/Sage.js comm transcripts agree after normalization;
- all core widgets can construct, serialize, restore, and close;
- binary upload/media paths have exact hash-based tests;
- the package remains pure Python and common behavior works on both native and
  Wasm runtimes.

## P5 — Connect the Sage.js Jupyter kernel

Implement the standard Jupyter adapter in `tools/jupyter-kernel.ts` and the
session/evaluator layers beneath it.

### Shell and IOPub behavior

- accept frontend `comm_open`, `comm_msg`, and `comm_close` on the shell
  channel;
- publish kernel-originated comm messages on IOPub with exact parent headers,
  metadata, and multipart buffers;
- implement filtered `comm_info_request` from the live registry;
- publish widget view MIME bundles as display data/results;
- publish nested stream, display, update, clear, and error events from
  `Output` widgets;
- retain execution count semantics for ordinary cell results;
- close comms and views on kernel shutdown and session replacement.

### Client matrix

Qualify exact versions of:

- JupyterLab with the standard JupyterLab widget manager;
- CoCalc’s current widget manager;
- classic Notebook or nbclassic;
- nteract or another independent client where practical.

Tests must distinguish kernel correctness from a missing frontend extension.
If a client returns only the fallback MIME, documentation should tell the user
how that client enables widgets; the Sage.js kernel should not report a Python
dependency.

### Jupyter acceptance examples

- official ipywidgets widget-list core controls;
- two synchronized sliders and kernel `link`;
- `jslink` operating without a kernel round trip;
- `Output` containing stdout, LaTeX, a 2D plot, and a 3D Plotly plot;
- rapid slider updates while another cell is queued;
- file upload and image bytes;
- kernel restart while widgets are visible;
- save, close, reopen, and rerun behavior with notebook widget state.

Acceptance gate:

- the wire transcript agrees with CPython ipykernel;
- Jupyter installation and execution do not invoke Python or the `jupyter`
  executable;
- no existing execute, completion, inspection, interrupt, or rich-display test
  regresses;
- Linux x86-64/arm64, macOS arm64, and Windows x64 kernels pass the focused
  protocol suite.

## P6A — Extract an embeddable Sage.js Cell

The historical Sage Cell Server established a useful embedding contract:
load one script, turn one or more selected elements into executable Sage
cells, configure the editor and button, and optionally share a session. Sage.js
should provide the same low-friction outcome without a computation server,
SockJS, a remote kernel, or server-side user-code execution.

### Public embedding surfaces

Offer two supported surfaces over one underlying cell controller.

#### Inline component/API

Provide a standards-based custom element and an equivalent ESM factory. The
exact spelling is finalized during implementation, but the intended usage is
as small as:

```html
<script type="module" src="https://sagejs.org/embed/v1/sagejs-cell.mjs"></script>
<sagejs-cell>
  <script type="text/x-sage">plot(sin(x), (x, 0, 2*pi))</script>
</sagejs-cell>
```

or:

```js
import { createSageCell } from "https://sagejs.org/embed/v1/sagejs-cell.mjs";
const cell = await createSageCell(document.querySelector("#calculus"), {
  source: "@interact\ndef f(a=(0, 10)): show(plot(sin(a*x), (x, 0, 2*pi)))",
});
```

The module URL is a small stable loader. It resolves a pinned,
content-addressed compatible implementation rather than making the mutable
loader itself a large release artifact. A version-pinned URL and a
self-hostable package must also be documented for reproducible course notes.

#### Sandboxed iframe

Provide a dedicated embed document for sites that prefer CSS, dependency, and
JavaScript isolation. It communicates through a narrow `postMessage` API with
strict source/origin checks. The embed endpoint has explicit frame policy and
must not reuse the standalone app's `DENY` headers blindly.

The iframe is useful for CMSs, LMSs, blogs, and sites with incompatible CSS or
dependency policies. The inline component is preferable when the host wants
DOM integration, responsive layout, or direct lifecycle control.

### Cell controller contract

The controller should provide instance-scoped operations equivalent to:

- set/get source;
- run and receive ordered output events;
- interrupt, reset, and dispose;
- configure language, editor visibility, run-button text, auto-evaluation,
  timeout, theme, typesetting, and allowed output features;
- subscribe to ready, busy, idle, output, result, error, reset, and capability
  events;
- obtain a serializable source/configuration snapshot without exposing live
  interpreter objects.

Do not freeze exact public method names before a small TypeScript contract and
two independent host-page prototypes exist. Once published at `/embed/v1/`,
the interface is an external compatibility contract even though the rest of
Sage.js is greenfield.

### Multiple cells and sessions

- Multiple components on one page share immutable downloads and module
  initialization promises.
- Each cell gets an independent kernel session by default, limiting accidental
  state and failure coupling.
- An explicit named/session option may let a sequence of textbook cells share
  one kernel. Execution is serialized and reset/ownership semantics are
  visible to the host.
- A host can dispose offscreen cells and recreate them without leaking workers,
  comms, widget views, object URLs, or event handlers.
- Resource policy limits concurrent sessions and gives the host an explicit
  pooling strategy rather than silently spawning dozens of full Wasm kernels.

### CSS, DOM, and accessibility isolation

- Prefer Shadow DOM or an equally explicit style boundary for the inline
  component; expose a small documented set of CSS custom properties rather
  than inheriting arbitrary page CSS.
- Make CodeMirror, KaTeX, Plotly, ipywidgets, dialogs, tooltips, and focus
  handling work inside the chosen boundary before committing to it.
- Respect the host/system color scheme and allow an explicit System/Light/Dark
  option.
- Preserve keyboard navigation, labels, focus visibility, reduced motion, and
  screen-reader output status.
- Avoid globals such as `$`, `MathJax`, `Plotly`, or a singleton widget manager
  on the embedding page.

### Cross-origin runtime and isolation

Embedding on an arbitrary origin cannot assume the host sends Sage.js's
current COOP/COEP headers. Fortunately the browser evaluator already has a
non-`SharedArrayBuffer` path using precompiled dynamic programs. Make that a
qualified product mode rather than an accidental fallback.

There is additional existing groundwork: the authenticated Conway-data loader
falls back from its nested shared-memory worker to an asynchronous authenticated
fetch when shared memory is unavailable. These fallbacks substantially reduce
implementation risk, but they are not evidence that every Sage.js capability
already works without isolation. The qualification matrix below determines
and documents the exact boundary.

The embed project must:

1. Test inline and iframe use on an unrelated origin with no cross-origin
   isolation.
2. Publish an exact capability comparison between isolated and non-isolated
   modes, including interruption, multiprocessing, dynamic compilation,
   performance, and unavailable algorithms.
3. Never tell a course-site operator to weaken global security headers merely
   to run a basic cell.
4. Serve dedicated immutable embed assets with the required CORS and CORP
   headers and no credentials. The current same-origin assets and CSP can
   remain strict for the standalone app.
5. Solve module-worker loading explicitly; do not assume a cross-origin worker
   URL is accepted under every browser/CSP combination.
6. Offer a documented self-hosted asset base for sites requiring strict CSP,
   offline course materials, or release pinning.
7. Detect capabilities before downloading the largest assets and report a
   useful fallback/error instead of hanging during evaluation.

The remote embed cannot register the `sagejs.org` service worker under a host
website's origin. It may use immutable HTTP caching. Fully offline embedded
course material requires self-hosted assets or a host-provided service worker;
the standalone app retains its own offline guarantee.

### Security boundary

- Evaluated Sage/Python remains in a worker, not the host page's main realm.
- Rich HTML is sanitized according to a documented trust policy.
- Standard widgets are pinned local code. Custom widget modules are governed
  by P8 and never silently fetched for an untrusted cell.
- The iframe API validates message origin, source window, schema, size, and
  request id; it exposes no general evaluation primitive beyond the configured
  cell contract unless the host explicitly enables editing.
- The inline API documents that trusted custom widgets necessarily execute
  browser JavaScript in the page context; worker isolation of mathematical
  evaluation does not sandbox those views.
- Downloads, clipboard, network access, file uploads, and links have explicit
  host-configurable policies.

### Sage Cell compatibility and migration

Do not duplicate Sage Cell's jQuery API mechanically, but cover its valuable
use cases:

- convert many selected elements into cells;
- source embedded as `text/x-sage`;
- minimal and full templates;
- hide editor/output/control elements;
- custom evaluate-button text and optional auto-evaluation;
- multiple cells with independent or shared sessions;
- programmatic deletion/disposal;
- safe use inside forms and responsive teaching pages.

Publish a short migration page translating common
`sagecell.makeSagecell({...})` options to the Sage.js custom element/factory.
The headline difference should be explicit: computation happens locally and
the embedding site does not send student code to a Sage Cell backend.

### Embedding acceptance matrix

Test at least:

- inline component on a plain unrelated HTTP origin;
- inline component under a strict realistic CSP;
- sandboxed cross-origin iframe;
- self-hosted/pinned assets;
- one page with many independent cells;
- several cells sharing one session;
- editor-hidden auto-evaluated textbook output;
- 2D/3D plots, KaTeX, syntax highlighting, errors, and downloads;
- standard ipywidgets and a Sage `@interact`;
- hard refresh, offline self-hosted reload, mobile/narrow layout, light/dark
  mode, reset, interruption, and disposal;
- Chromium, Firefox, and WebKit, including non-isolated mode;
- a representative static-site generator, LMS/CMS page, and presentation page
  to catch style/form/focus conflicts.

Acceptance gate:

- the full standalone app is constructed from the same cell controller;
- two independent external host pages embed functional cells without a
  backend server or Python installation;
- basic non-isolated embedding works, with capability differences reported
  honestly;
- instance, worker, view, and asset cleanup pass repeated create/dispose tests;
- public API, asset versioning, security headers, and self-host instructions
  are documented before `/embed/v1/` is declared stable.

## P6B — Embed the widget manager in app.sagejs.org and Sage.js Cell

Use `@cocalc/widgets` as the browser-manager foundation for both the full-page
app and embedded cells. Prefer contributing generally useful fixes back to
`sagemathinc/cocalc-widgets` over maintaining a private copy in Sage.js.

### Sage.js `WidgetEnvironment`

Implement the four environment operations as follows:

1. `getSerializedModelState(modelId)` asks the owning `SageSession` for the
   current serialized state and resolves nested model dependencies.
2. `openCommChannel(...)` creates a browser-side comm object backed by the
   session worker’s bidirectional comm messages.
3. `renderOutput(...)` dispatches through the existing Sage.js rich-output
   renderer so KaTeX, Plotly, errors, text, and future MIME renderers remain
   consistent with normal cells.
4. `loadClass(...)` resolves core ipywidgets modules from locally bundled
   packages; custom modules go through the governed loader described in P8.

Do not use CoCalc’s `IpywidgetsState`, sync tables, NATS transport, replay
database, or multi-client conflict resolution. The app has one live local
kernel and one browser state owner. Every embedded component receives an
instance-scoped environment and must not accidentally attach views to another
cell's manager or session.

### App lifecycle

- Lazy-load manager JavaScript and widget CSS on the first widget MIME/event.
- Create one manager per live Sage session, not one manager per output cell.
- Render multiple views of one model correctly.
- Destroy views and close channels when output is cleared, a worksheet is
  reset, the worker crashes, or the session is interrupted.
- After an app reload there is no live kernel state; show a clear “Run this
  input to restore the widget” action rather than a dead stale control.
- Theme standard controls consistently with System/Light/Dark while retaining
  upstream accessibility and focus behavior.
- Keep core assets in the immutable asset manifest and offline service-worker
  cache.
- Render within both the standalone app DOM and the embedding component's
  style boundary without relying on application-global selectors.

### Resource and security policy

Add explicit limits for:

- live models and views per session;
- JSON message bytes and nesting depth;
- individual and aggregate binary buffers;
- queued events and callback duration;
- output bytes produced by one interaction;
- module loads and module bundle size.

Widget code runs in the existing application origin, so custom module loading
is a trust decision. Never relax CSP globally merely to make one custom widget
load. Core packages are pinned and self-hosted.

### Browser acceptance examples

- all standard scalar controls and nested layouts offline;
- live calculus plot with a continuous slider;
- an interact returning LaTeX and one returning a 3D Plotly object;
- manual-update interact and text-enter behavior;
- two views of one linked model;
- output clearing and exceptions;
- file upload round trip entirely inside the local browser session;
- reset, interrupt, hard refresh, light/dark mode, keyboard operation, and
  narrow/mobile layout;
- no widget code or CSS in the initial app route before first use.

Acceptance gate:

- the focused browser suite passes both online and offline;
- the core controls require no CDN and no Jupyter server;
- app startup, initial JS transfer, Wasm startup, and memory budgets remain
  within explicit ratchets;
- manager/view cleanup passes a repeated-interaction leak test.

## P7 — Port Sage `@interact`

Port the Sage wrappers only after core ipywidgets behavior is stable. Keep the
sources ordinary CPython-parseable Python and adapt imports to Sage.js module
layout rather than copying unrelated Sage infrastructure.

### Sage behavior to preserve

- decorator and functional forms of `interact`;
- automatic widget inference from booleans, strings, numbers, tuples, ranges,
  lists, iterators, annotations, and explicit widget objects;
- symbolic endpoints and numerical approximation for sliders;
- expression input evaluated in the current Sage user globals;
- transformations and requested result types;
- matrix input grids and color conversion;
- labels, display widths, selectors as dropdowns or buttons, and range
  sliders;
- `auto_update=False`, explicit manual controls, and initial evaluation;
- custom `layout` placement used in the PREP interact quickstart;
- useful reprs that name each inferred control.

Expose `interact`, `input_box`, `slider`, `range_slider`, `checkbox`,
`selector`, `color_selector`, `input_grid`, and `text_control` through lazy
global discovery so completion works before first access.

### Acceptance corpus

Promote every interact example from these sources into executable fixtures:

- PREP `quickstarts/interact`;
- PREP calculus and plotting chapters;
- Sage’s `sage/repl/ipython_kernel` widget doctests;
- a representative, bounded subset of `sage.interacts.library` applications.

Classify failures caused by missing mathematics separately from widget-system
failures. An interact whose body calls an unsupported mathematical operation
must still construct correctly and then report the body’s honest capability
error in its output widget.

Current corpus disposition (2026-08-31):

- the PREP quickstart, general plotting-control example, and calculus
  tangent-line example execute successfully in the native kernel;
- `sage.interacts.library` is intentionally a bounded teaching subset with
  `demo`, `taylor_polynomial`, `function_derivative`, `quadratic_equation`, and
  `coin`, loaded lazily through the Sage-global `interacts` namespace;
- the advanced-2D PREP spelling `slider([0..360], step_size=5)` is stale even
  against current Sage, whose selection slider rejects `step_size`; preserve
  that honest error rather than inventing a divergent widget contract;
- missing operations inside an otherwise valid interact, such as presently
  unsupported vector norms in broader examples, are tracked as mathematics
  capability gaps rather than widget failures.

Acceptance gate:

- PREP’s input boxes, sliders, range sliders, selectors, checkboxes, colors,
  grids, manual updates, and layouts work in Jupyter and the browser app;
- the CLI constructs the same models and executes documented defaults;
- callback exceptions remain localized to the interact output;
- Sage and Sage.js widget inference agree on a differential fixture corpus.

## P8 — Support the custom-widget framework safely

After the core product guarantee is stable, qualify the extension mechanism.

### Module loading

- Resolve `@jupyter-widgets/base`, `controls`, and `output` locally by exact
  compatible version.
- Add a local custom fixture module to prove arbitrary model/view names,
  serializers, custom messages, child models, and binary buffers.
- Reuse the `@cocalc/widgets` AMD/module loader where appropriate.
- In Jupyter, defer module loading to the client’s installed widget manager.
- In app.sagejs.org, default to pinned self-hosted/allowlisted modules. An
  optional CDN loader requires a trusted worksheet, visible user consent,
  HTTPS, version resolution, a size ceiling, CSP compatibility, and useful
  offline failure behavior.
- Cache approved immutable custom modules by content identity, not by a mutable
  “latest” URL.

### Initial qualification candidates

Choose packages for distinct protocol coverage rather than popularity alone:

- a tiny project-owned fixture: baseline custom model and message;
- ipycanvas: custom messages and binary buffers;
- bqplot: nested models and rich interaction;
- pythreejs or k3d: larger model graphs and binary geometry;
- ipyleaflet: asynchronous browser behavior and external resources;
- ipympl only after the relevant Matplotlib Python surface exists.

For each candidate, record separately:

- kernel Python compatibility;
- standard Jupyter rendering;
- app module loading/rendering;
- offline behavior;
- package-specific limitations.

Do not let one third-party package block shipping core ipywidgets or Sage
interacts.

Acceptance gate:

- the custom fixture passes in Jupyter and the app;
- unknown/incompatible modules fail with module name, requested version, and a
  remediation path;
- untrusted app content cannot silently load arbitrary remote JavaScript;
- qualified package/version pairs are listed in generated documentation.

## P9 — State persistence, embedding, and collaboration boundaries

These are related features but not prerequisites for live interacts.

### Notebook state

Support the standard widget control channel and widget-state MIME well enough
for ordinary Jupyter save/restore workflows. Test model state loaded before or
after a view and missing live kernel state.

### Static HTML embedding

After live app support, evaluate upstream `ipywidgets.embed` and
`@jupyter-widgets/html-manager` for exporting a self-contained or
content-addressed static HTML view. Static embedding is read-only unless the
embedded page also has a live Sage.js Wasm kernel.

### Collaboration

Do not copy CoCalc’s collaborative widget state into Sage.js core. CoCalc
already owns this problem and should continue to adapt the standard comm/model
stream to its RTC representation. Keep Sage.js protocol output standard so
CoCalc’s existing machinery can consume it.

If a future multi-user Sage.js app needs collaboration, design it as a
separate state-replication layer around standard ipywidgets, not a change to
widget Python objects or the wire protocol.

## P10 — Documentation, packaging, and release qualification

### User documentation

Document:

- a five-line Sage `@interact` calculus example;
- direct `ipywidgets` construction and observation;
- behavior in CLI, Jupyter, CoCalc, and app.sagejs.org;
- the distinction between kernel support and a client widget manager;
- offline core widgets versus trusted custom module loading;
- supported protocol and package versions;
- qualified third-party widgets and honest limitations;
- the fact that Sage.js uses neither CPython nor a Python Jupyter stack.

Add interact examples to app.sagejs.org presets only after browser conformance
is stable. Include at least a function plot, Riemann/tangent visualization,
linked controls, and a manual-update example.

### Packaging

- Include Python source and license notices once in the shared Sage/Python
  runtime payload.
- Lazy browser chunks must be content-addressed and included in app asset
  integrity manifests.
- Measure the complete transitive frontend bundle; do not quote the 748 KiB
  manager alone as total cost.
- Keep manager/control code out of the native SEA startup path until imported.
- Record dependency and protocol versions in runtime diagnostics.

### Required test layers

1. General Python regressions for every runtime fix.
2. Upstream traitlets tests.
3. Upstream ipywidgets Python tests.
4. CPython/Sage.js differential model and wire transcripts.
5. Transport-neutral comm unit tests.
6. Jupyter ZMQ integration tests with multipart buffers.
7. Browser online/offline tests for app.sagejs.org.
8. Sage PREP interact corpus.
9. Lifecycle, event-flood, resource-limit, and memory-leak tests.
10. Four native release platforms plus browser Wasm.

### Release gates

- no startup-budget regression when widgets are unused;
- explicit lazy-chunk size and loaded-memory budgets;
- no new native dependency;
- `pnpm test:baselib:strict`, relevant portable/unit/browser/Jupyter suites,
  and `pnpm architecture:check` pass;
- exact candidate qualified on Linux x86-64, Linux arm64, macOS arm64, Windows
  x64, and the production Wasm app;
- a clean client without CPython can install the Sage.js kernelspec and use
  widgets in a compatible frontend.

## Sequencing and independently shippable milestones

| Milestone | User-visible result | Must not wait for |
| --- | --- | --- |
| M1: traitlets | Pure-Python packages using traitlets can run | Jupyter/browser UI |
| M2: widget models | `import ipywidgets`; core models serialize and observe | Browser manager |
| M3: Jupyter core | Standard controls work in JupyterLab and CoCalc | app integration |
| M4: browser cell | Standalone app and external embeds run from one cell controller | widgets/Sage wrappers |
| M5: browser widgets | Standard controls work offline in the app and in embedded cells | Sage wrappers |
| M6: Sage interact | PREP `@interact` examples work across frontends and embeds | third-party widgets |
| M7: custom framework | Project fixture and selected packages work | universal PyPI support |
| M8: state embedding | Standard saved/static state workflows | collaboration layer |

The critical path is P1 → P2/P3 → P4. After P4, Jupyter and the reusable
browser cell can proceed independently, followed by its widget manager and
Sage wrappers. P8 and P9 must not delay shipping a strong Tier A–C
implementation.

## Principal risks and mitigations

### Traitlets exposes deep Python semantic gaps

Mitigation: treat every failure as general Python conformance, retain upstream
tests, and avoid widget-specific compiler hacks. Land fixes in small slices so
the project gains useful pure-Python compatibility even before widgets ship.

### Output capture becomes coupled to Jupyter internals

Mitigation: define a transport-neutral ordered display-event stream first.
The narrow IPython facade and both transports consume that stream; neither
ipywidgets nor app code calls ZMQ directly.

### Slider floods or callbacks reenter the evaluator

Mitigation: one serialized session queue, bounded message resources, explicit
busy/idle contexts, cancellation on reset, and stress tests with continuous
updates.

### Browser bundle and startup grow unexpectedly

Mitigation: dynamic import, core-only local modules, build reports for
transitive bytes, offline cache receipts, and startup/loaded-memory ratchets.

### Custom modules create a supply-chain/CSP hole

Mitigation: self-host core; require trust and consent for remote code; pin
versions and content; enforce size/CSP policy; make unknown widgets fail
clearly without weakening the whole app.

### Jupyter clients differ

Mitigation: validate protocol transcripts independently of rendering, maintain
a named client/version matrix, and keep client-manager installation distinct
from Sage.js kernel installation.

### “Full support” expands without bound

Mitigation: publish Tiers A–D and a generated third-party qualification table.
Core protocol correctness is a finite acceptance target; arbitrary packages
remain evidence-based additions.

## Definition of done for the primary project

The primary ipywidgets/interact project is complete when:

1. selected upstream traitlets and ipywidgets core test suites pass in Sage.js;
2. Sage.js implements standard comm, widget, control, display, and binary
   buffer protocols without Python or Jupyter executables;
3. the standard ipywidgets core controls work in qualified Jupyter clients;
4. the same controls work offline in app.sagejs.org through
   `@cocalc/widgets`;
5. external websites can embed the same cell and widget UI with no computation
   backend, including a qualified non-cross-origin-isolated mode;
6. `Output` correctly captures text, LaTeX, plots, clears, updates, and errors;
7. Sage `@interact` and the PREP control constructors work in Jupyter, the app,
   embedded cells, and meaningfully in the CLI;
8. one custom fixture proves the extension protocol in all live frontends;
9. reset, interruption, rapid events, binary data, cleanup, and resource limits
   have focused regression tests;
10. widgets are lazy and unused startup/size budgets do not regress;
11. documentation states exact compatibility tiers and frontend requirements.

## Primary references inspected

- ipywidgets source: `/home/user/upstream/ipywidgets`
- Sage interact source: `/home/user/sagelite/src/sage/repl/ipython_kernel`
- Sage interact documentation:
  <https://doc.sagemath.org/html/en/reference/repl/sage/repl/ipython_kernel/interact.html>
- Jupyter comm protocol:
  <https://jupyter-client.readthedocs.io/en/latest/messaging.html#custom-messages>
- ipywidgets low-level model/comm overview:
  <https://ipywidgets.readthedocs.io/en/7.x/examples/Widget%20Low%20Level.html>
- ipywidgets embedding architecture:
  <https://github.com/jupyter-widgets/ipywidgets/blob/main/docs/source/embedding.md>
- reusable CoCalc/Colab-derived manager:
  <https://github.com/sagemathinc/cocalc-widgets>
- JupyterLite JavaScript kernel and its kernel-side ipywidgets-compatible
  reference implementation:
  <https://github.com/jupyterlite/javascript-kernel>
- CoCalc integration:
  `/home/user/cocalc-ai/src/packages/frontend/jupyter/widgets/manager.ts`
- Sage Cell embedding API and use cases:
  <https://github.com/sagemath/sagecell/blob/master/doc/embedding.rst>
