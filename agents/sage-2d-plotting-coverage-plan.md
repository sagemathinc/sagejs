# Sage.js plotting: Plotly-native, multilingual, and agent-first

## Product vision

Build the plotting system that Sage.js actually needs:

> A Sage-shaped, Plotly-native, multilingual plotting platform designed for
> agents to create, understand, refine, and present beautiful mathematical
> graphics to humans.

This is more exciting and more useful than mechanically cloning Sage plotting.
Sage remains our deepest compatibility reference and provides an excellent
mathematical API, but it is one frontend rather than the definition of the
entire product. Wolfram Language and MATLAB frontends should feed the same
plotting platform. Agents should be able to inspect and modify a plot as
structured mathematical intent, not merely receive an opaque image.

Plotly is the rendering target. We should exploit its interaction, browser
portability, declarative figures, and attractive defaults instead of hiding it
behind a false Matplotlib abstraction.

The project succeeds when Sage users feel at home, Wolfram and MATLAB programs
produce natural results, agents can reason reliably about plots, and the
graphics shown to humans are clear, interactive, and good-looking.

## Guiding decisions

### 1. Sage is a frontend and compatibility authority, not the architecture

SageMath 10.9.post1 is the pinned reference for the Sage-facing API. We will
systematically inventory every documented Sage 2D and 3D plotting feature, but
we will classify each feature instead of promising literal imitation.

Every Sage ledger entry receives exactly one status:

- **faithful** — Sage.js has the same meaningful user-visible behavior;
- **translated** — Sage intent is preserved through a Plotly-native behavior;
- **unsupported** — the feature is deliberately rejected with an actionable
  explanation;
- **extension** — Sage.js provides useful behavior beyond Sage.

One hundred percent classification is a hard requirement. One hundred percent
literal compatibility is not.

There must be no vague partial category at project completion. A supported
feature is tested and documented; an unsupported feature says why and offers
the nearest useful alternative.

### 2. Plotly is the rendering target

We are not building a general multi-renderer framework. The shared semantic
model should lower cleanly and intentionally to Plotly figures.

When Sage behavior does not map directly to Plotly:

1. Look for a mathematically honest Plotly construction.
2. Prefer an attractive translated result over a visually exact but awkward
   emulation.
3. If the approximation would be misleading or ugly, reject it clearly.
4. Do not build another renderer just to reproduce an obscure
   Matplotlib-specific option.

Plotly JSON is the portable render representation, but it is not sufficient as
the sole internal model: after lowering a circle to points or a mathematical
function to samples, an agent still needs to know the original intent.

### 3. Matplotlib is not a Sage.js dependency

Matplotlib-specific behavior is an implementation boundary, analogous to Sage
objects exposing methods for GAP-backed internals.

For compatibility-sensitive entry points such as Graphics.matplotlib(), prefer
an explicit failure:

    NotImplementedError:
    Sage.js uses Plotly rather than Matplotlib.
    Use plotly(), save("figure.html"), or save("figure.png").

This is more useful than a generic missing-attribute error and does not pretend
that Sage.js can return a Matplotlib object. Such an entry is classified as
unsupported with a documented Plotly alternative.

### 4. Two-dimensional and three-dimensional plotting share one platform

Develop 2D and 3D architecture together:

- semantic plot specification;
- colors, themes, labels, legends, and annotations;
- composition and animation;
- Plotly configuration;
- display and export;
- provenance, validation, and agent inspection;
- Sage, Wolfram, and MATLAB adapters.

Maintain separate 2D and 3D compatibility ledgers and implementation queues.
Do not require completion of every 2D edge case before improving 3D, and do not
duplicate the shared foundations.

Vertical slices should deliberately cross dimensions: points and lines, then
function plots and surfaces, then fields, composition, animation, and export.

### 5. Agents are primary authors; humans are primary viewers

Agents will usually make plots in order to explain something to a human. The
API must therefore optimize both sides:

- structured and inspectable for the agent;
- attractive, responsive, and interactive for the human;
- deterministic enough to test and revise;
- explicit about provenance, sampling, approximations, and warnings;
- easy to serialize, attach, compare, and refine.

The agent should not have to infer a plot from pixels after creating it.

## Architecture

The intended flow is:

    Sage API ─────────┐
    Wolfram API ──────┼──> PlotSpec ──> Plotly figure ──> display/export
    MATLAB API ───────┘       │
                              ├──> inspect/describe/data
                              ├──> validate/diagnostics
                              └──> revise/serialize/provenance

### PlotSpec

Introduce a versioned semantic PlotSpec that records enough intent for agents,
frontends, testing, and rendering without aspiring to be renderer-neutral.

An initial schema should include:

    schema_version
    dimension
    layers
      id
      kind
      source_intent
      data_or_sampler
      style
      visibility
      legend
      metadata
    axes_or_scene
    viewport
    theme
    annotations
    interactions
    animation
    provenance
    diagnostics
    plotly_overrides

Important properties:

- stable layer IDs;
- deterministic serialization;
- explicit 2D or 3D dimension;
- preservation of mathematical source intent and sampled data;
- JSON-safe materialized form for storage and transport;
- lazy or callable state confined to a pre-serialization construction phase;
- validated Plotly escape hatches;
- schema evolution rules from the beginning.

PlotSpec should be modest. It is not a replacement for Plotly's complete
schema. It preserves high-level intent, organizes layers, and provides one
controlled lowering boundary to Plotly.

### Incremental migration

The existing Graphics, Graphics3d, primitive classes, Wolfram mappings, and
Plotly generation are valuable production code. Do not rewrite them wholesale.

Migrate through vertical slices:

1. Teach an existing primitive to describe itself as a PlotSpec layer.
2. Lower that layer to the same Plotly output produced today.
3. Add inspection and validation.
4. Move composition through PlotSpec.
5. Retire duplicated direct-Plotly paths only after differential tests pass.

The first slice should include 2D line/point/text and 3D line/point/text. It
will reveal whether the schema is appropriately small before harder plots are
committed to it.

## The agent-facing API

Preserve familiar Sage constructors such as plot(), line(), point(), plot3d(),
and parametric_plot3d(). Add a small, coherent agent-facing interface to the
resulting graphics objects.

### Inspection

- spec() — return the semantic PlotSpec;
- plotly() — return the lowered Plotly figure;
- describe() — concise natural-language and structured summary;
- data() — expose sampled or supplied data by stable layer ID;
- bounds() — report computed domain and range bounds;
- diagnostics() — return machine-readable warnings and quality observations;
- provenance() — report expressions, source language, ranges, sampling
  settings, transforms, and approximations.

### Validation

validate() should detect conditions useful to both agents and humans:

- empty or entirely non-finite data;
- clipped or invisible layers;
- logarithmic scales with invalid values;
- unreadable foreground/background contrast;
- duplicated or ambiguous legends;
- labels that are likely to overlap;
- extreme sample counts or output sizes;
- a 3D camera or aspect ratio that hides meaningful structure;
- unsupported options that were ignored or translated;
- rasterization in an otherwise vector export.

Diagnostics must have stable codes, severity, affected layer IDs, explanatory
text, and suggested repairs.

### Revision

Agents should be able to revise a plot without reconstructing it from scratch:

- select a layer by stable ID;
- change style, label, visibility, sampling, or range;
- add or remove annotations;
- choose a theme;
- request a lower-cost preview or higher-quality final render;
- clone a plot while retaining provenance;
- apply a validated Plotly override when the high-level API is insufficient.

The functional composition style should remain natural. Mutating helpers may
exist when their state behavior is explicit and serializable.

### Communication

Support automatically generated alt text and a structured summary suitable for
an agent response. A useful description should identify:

- plot type and dimensionality;
- expressions or data sources;
- domains and ranges;
- significant extrema, discontinuities, or non-finite regions when known;
- layer colors and legend labels;
- interactive affordances;
- any approximation or warning.

## Frontend strategy

### Sage

Use Sage's public plotting API as the most complete mathematical frontend.
Preserve familiar constructors, composition, options, numerical semantics, and
object plotting protocols where they are meaningful outside Matplotlib.

The Sage ledger remains exhaustive across:

- documented modules and imports;
- functions, classes, aliases, methods, signatures, and defaults;
- accepted inputs, coercions, outputs, warnings, and errors;
- numerical sampling and generated geometry;
- composition, animation, display, and export;
- 2D-to-3D conversion;
- graph, matrix, symbolic, and other object integrations.

Renderer-specific entries may be translated or unsupported, but never omitted
from the ledger.

### Wolfram Language / Mathematica

Wolfram plotting is expression-oriented. Preserve the structure of Graphics
and Graphics3D, primitive lists, nested style directives, option scoping, and
symbolic plotting intent in PlotSpec.

Grow coverage around:

- Plot, ParametricPlot, PolarPlot, ListPlot, and their 3D counterparts;
- ContourPlot, DensityPlot, RegionPlot, VectorPlot, StreamPlot, and surfaces;
- Graphics and Graphics3D primitives;
- Show, styling directives, legends, axes, plot ranges, and themes;
- Wolfram option precedence and symbolic evaluation semantics.

Do not force every Wolfram construct through a fictional Sage call. Both
frontends should share lower-level samplers and PlotSpec layers while retaining
their own option and evaluation rules.

Official Wolfram behavior can be captured as compact offline fixtures where a
licensed oracle is available. It must not become a Sage.js runtime dependency.

### MATLAB

MATLAB plotting is more stateful: figures, axes, current objects, hold state,
plot handles, and command sequences matter.

Build a MATLAB adapter above PlotSpec that models:

- figure and axes state;
- plot, scatter, bar, histogram, contour, imagesc, surf, mesh, and related
  commands;
- hold on/off and replacement versus addition;
- labels, titles, legends, limits, grids, views, and colormaps;
- handle-based property updates;
- subplot/tiled layout;
- 2D and 3D data orientation conventions.

The shared mathematical samplers and Plotly lowerer should remain stateless.
MATLAB session state belongs in the frontend adapter and produces updated
PlotSpecs.

MATLAB itself must not be a runtime dependency. Reference fixtures may come
from documented behavior or offline oracle runs.

## Visual quality

Sage compatibility does not excuse unattractive output. Sage.js should often
look better by default.

Create first-party themes:

- notebook;
- presentation;
- publication;
- dark;
- high-contrast/accessibility.

Quality rules should cover:

- sensible responsive dimensions;
- colorblind-conscious palettes;
- readable typography and mathematical labels;
- restrained grids and backgrounds;
- uncluttered legends;
- good hover templates;
- suitable line widths and marker sizes;
- stable camera defaults for 3D;
- graceful behavior for dense data;
- touch and keyboard accessibility where Plotly supports it.

Maintain a curated visual gallery across 2D, 3D, Sage, Wolfram, and MATLAB.
Automated geometry and image checks protect regressions; periodic human review
judges whether the defaults actually look good.

## Export strategy

Plotly renders in a browser, so static export should reflect that reality
instead of disguising it.

### Always available

- Plotly JSON;
- standalone or embeddable interactive HTML;
- notebook rich display;
- semantic PlotSpec JSON;
- data and provenance export.

These paths must not require Chromium.

### In an existing browser

Use Plotly.toImage and the Plotly modebar for PNG, JPEG, WebP, and SVG. The
browser is already the rendering engine, so no additional headless process is
needed.

Add a frontend bridge that can return rendered bytes to the kernel or agent
when the surrounding notebook/browser environment supports it. This is the
preferred static-export path in CoCalc and other interactive environments.

### In headless Node

Static image export is an optional capability backed by Chromium:

- discover an installed compatible browser;
- use a persistent worker rather than starting Chromium per image;
- batch multiple export jobs;
- cache the local Plotly and MathJax assets;
- operate fully offline;
- enforce time, memory, page, and output-size limits;
- shut down and recover cleanly after renderer failure;
- support Windows x64 as a first-class target.

PNG, JPEG, WebP, and SVG are initial formats. PDF should be added only after a
tested browser-print or conversion path meets quality expectations. WebGL
content in vector output must be identified as rasterized.

Static export must not make Chromium a dependency of core mathematics or
interactive plotting.

### Capability discovery

Provide a machine-readable export_capabilities() result. When save() cannot
satisfy a requested format, return an actionable error describing:

- why the capability is unavailable;
- which formats work without a browser;
- whether an existing interactive browser can perform the export;
- how to configure a local Chromium executable;
- how an agent can fall back to HTML or Plotly JSON.

## Coverage and evidence

Replace a binary compatibility percentage with a generated product matrix.

Create a checked-in docs/sage-compatibility/plotting/ area containing:

- sage-surface.json — pinned Sage 2D and 3D public inventory;
- frontend-surface.json — supported Wolfram and MATLAB constructs;
- coverage.json — faithful/translated/unsupported/extension classification;
- plotspec.schema.json — semantic model schema;
- diagnostics.json — stable validation codes;
- oracle/ — compact semantic reference fixtures;
- gallery/ — canonical plots and visual expectations;
- performance.json — comparable workloads and budgets;
- README.md — regeneration and validation commands.

Each coverage record should identify:

    id
    frontend
    qualified_name
    dimension
    kind
    signature_or_syntax
    source_authority
    dependencies
    classification
    translation_or_reason
    semantic_tests
    plotly_tests
    visual_tests
    platform_status
    performance_status

The generated report should answer both:

- How much of Sage is faithful, translated, or unsupported?
- How capable is the Sage.js plotting product independent of Sage?

## Test strategy

### Layer 1 — frontend and semantics

Test imports, syntax lowering, signatures, option precedence, coercions,
warnings, errors, composition, and state transitions.

Use differential Sage 10.9 oracles for Sage-facing behavior. Use offline
Wolfram/MATLAB reference fixtures where available, but do not require
proprietary systems at test or runtime.

### Layer 2 — PlotSpec

Compare stable semantic intent before rendering:

- layer kinds and IDs;
- source expressions or data;
- ranges and sample settings;
- normalized styles;
- axes/scenes;
- annotations and legends;
- provenance and diagnostics.

This is the most valuable layer for agent correctness.

### Layer 3 — Plotly lowering

Validate generated figures against the supported Plotly schema and test:

- trace types and values;
- layout and configuration;
- finite masks and geometry;
- subplots and scenes;
- animation frames;
- hover and selection metadata;
- valid JSON serialization.

### Layer 4 — rendering

Compare in this order:

1. semantic PlotSpec;
2. Plotly trace/layout data;
3. geometry and layout measurements;
4. SVG structure where stable;
5. perceptual raster output.

Screenshots are the last oracle, not the first.

### Layer 5 — environments

Test:

- Node without a browser;
- Node with Chromium;
- notebook/browser rendering;
- native-disabled mathematical fallbacks;
- Linux, macOS, and Windows x64;
- representative mobile/responsive viewports.

## Performance and safety

Benchmark boundaries separately:

- symbolic compilation and setup;
- numerical sampling;
- adaptive refinement;
- grid and field computation;
- PlotSpec construction;
- Plotly lowering and JSON size;
- browser render;
- warm and cold static export;
- peak memory and transfer size.

Representative workloads must cover large lines/scatters, discontinuous
functions, dense grids, complex plots, vector/stream fields, meshes, surfaces,
graph plots, animation, and multi-panel layouts.

Agent-generated plots need explicit resource budgets. Validation should warn or
refuse before an accidental million-point SVG, enormous symbolic grid, or
unbounded animation consumes the session.

Every mathematical optimization must retain a correct dynamic fallback.

## Work packages

### P0 — Product contract and exhaustive inventories

1. Pin and hash Sage 10.9.post1 plotting sources.
2. Generate separate Sage 2D and 3D public-surface ledgers.
3. Inventory current Sage.js graphics, Graphics3d, exports, tests, Wolfram
   mappings, and MATLAB plotting support.
4. Classify Matplotlib/backend-specific APIs explicitly.
5. Produce the first faithful/translated/unsupported gap report.

Acceptance: every target entry is reproducible and classified; CI fails on
untracked surface changes.

### P1 — PlotSpec vertical slice

1. Define the minimal versioned schema.
2. Implement 2D and 3D point, line, and text layers.
3. Preserve current Plotly output through the new lowering boundary.
4. Add stable IDs, provenance, serialization, and schema validation.
5. Verify Sage and Wolfram construction paths.

Acceptance: the slice round-trips through PlotSpec with no visual or semantic
regression and proves that the schema is not over-designed.

### P2 — Agent inspection, validation, and revision

Implement spec(), describe(), data(), bounds(), diagnostics(), provenance(),
validate(), layer selection, themes, and controlled Plotly overrides.

Acceptance: an agent can create, inspect, diagnose, modify, serialize, and
render the P1 plots without analyzing pixels.

### P3 — Shared style, axes, composition, and interaction

Unify colors, colormaps, opacity, line/marker/fill styles, text, axes, scenes,
scales, ticks, grids, legends, annotations, subplots, responsive behavior,
hover, selection, and camera settings.

Acceptance: the shared behavior works across 2D/3D and all active frontends.

### P4 — Sage 2D mathematical coverage

Audit and classify:

- core Graphics and GraphicPrimitive behavior;
- shapes and data primitives;
- plot, parametric, polar, list, and log plots;
- adaptive sampling, exclusions, poles, fill, and imaginary tolerance;
- contour, density, implicit, region, matrix, complex, vector, slope, and
  streamline plots;
- hyperbolic plots;
- graph and mathematical-object integration.

Acceptance: every Sage 2D entry is classified and every faithful or translated
entry has semantic, PlotSpec, and rendering evidence.

### P5 — Sage 3D mathematical coverage

Audit and classify:

- Graphics3d and transformations;
- points, lines, polygons, text, arrows, and curves;
- surfaces, parametric plots, implicit plots, revolution, and list plots;
- meshes, textures, colors, opacity, aspect ratios, frames, and cameras;
- vector fields and supported mathematical-object conversions;
- composition, animation, and WebGL limitations.

Acceptance mirrors P4 with a separate 3D report.

### P6 — Wolfram plotting frontend

Expand expression-oriented 2D and 3D plotting, primitives, directives, Show,
options, ranges, themes, and symbolic evaluation. Route through PlotSpec
without erasing Wolfram intent.

Acceptance: the documented supported Wolfram subset is exhaustive, classified,
and tested end-to-end.

### P7 — MATLAB plotting frontend

Add the stateful figure/axes/handle layer and a useful first plotting surface
across 2D, 3D, layout, styling, and updates.

Acceptance: representative MATLAB plotting sessions behave naturally and
produce the same PlotSpec/Plotly platform results as equivalent Sage/Wolfram
plots.

### P8 — Display, export, and animation

Implement browser-assisted export, persistent headless export, capability
discovery, offline assets, format validation, animation, arrays, insets, and
multi-panel output.

Acceptance: JSON/HTML always work; supported static formats work in interactive
and configured headless environments; failures are explicit and actionable.

### P9 — Visual excellence and accessibility

Ship first-party themes, the curated gallery, responsive defaults, contrast
validation, alt text, good hover behavior, camera defaults, and human review.

Acceptance: canonical output is not merely correct—it is presentation-ready.

### P10 — Closure, optimization, and documentation

1. Resolve every unclassified or ambiguous entry.
2. Run all supported examples and randomized differential cases.
3. Fix measured performance and resource cliffs.
4. Publish frontend coverage and capability reports.
5. Document migrations, translations, unsupported backend details, and agent
   workflows.

Acceptance: no ledger ambiguity, all product gates green, and claims are
generated from evidence.

## Execution order

Start with the shared architecture, then grow in vertical slices:

1. P0 inventory and classification;
2. P1 PlotSpec proof across 2D and 3D;
3. P2 agent API;
4. P3 shared presentation and composition;
5. P4/P5 Sage mathematical coverage;
6. P6/P7 Wolfram and MATLAB frontends;
7. P8 export and animation closure;
8. P9/P10 visual quality and final closure.

P8 receives an early prototype during P1 because export constraints can affect
the schema and display boundary. Its exhaustive hardening remains later.

An initial envelope is 45–90 engineering days. The scope is broader than the
original Sage-only plan, but the existing 2D, 3D, Plotly, export, and Wolfram
implementations provide substantial leverage. P0 should replace this estimate
with dependency-based ranges.

Parallel implementation becomes safe only after P0–P3 stabilize the ledger,
PlotSpec, and shared contracts.

## Immediate next actions

1. Generate the Sage 2D and 3D surface inventories.
2. Inventory current Wolfram plotting and explicitly record MATLAB as an
   emerging frontend.
3. Write the first coverage classifier with the four product statuses.
4. Design the smallest PlotSpec capable of representing current 2D/3D
   line/point/text output without loss.
5. Add stable layer IDs and provenance to that vertical slice.
6. Implement spec(), describe(), and validate() for the slice.
7. Prototype browser-returned PNG/SVG bytes and a warm Chromium export worker.
8. Build a small cross-language gallery showing equivalent Sage, Wolfram, and
   eventually MATLAB plots.
9. Review the schema and API after real agent use before migrating complex
   plots.

## Completion gate

The first complete Sage.js plotting platform release requires:

- every pinned Sage 2D and 3D entry classified;
- every advertised Sage, Wolfram, and MATLAB feature tested;
- no silent ignored options or ambiguous partial support;
- a stable, serializable PlotSpec;
- agent inspection, diagnostics, provenance, revision, and alt text;
- attractive responsive 2D and 3D Plotly output;
- dependency-free JSON/HTML export;
- reliable browser and optional headless static export;
- native-disabled and supported-platform correctness;
- bounded performance and resource use;
- generated coverage and capability documentation.

The success metric is not that Sage.js secretly became Matplotlib. It is that
Sage.js became the best environment for an agent to create mathematical plots
that humans genuinely want to look at.

