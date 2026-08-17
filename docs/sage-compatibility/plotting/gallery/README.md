# Sage.js plotting gallery evidence

This directory is the compact, generated visual-quality witness for the
Plotly-native plotting platform. It currently covers the semantic Sage 2D and
3D slices across all five first-party themes. Wolfram and MATLAB are explicit
`pending-integration` records until their independent frontend branches land;
there are no invented compatibility claims.

The gallery intentionally checks meaning and rendering structure instead of
committing screenshots or pixel hashes:

- `fixtures.json` contains deterministic PlotSpec and lowered Plotly figures;
- `visual-expectations.json` pins layer geometry, trace types, contrast,
  semantic alt text, responsive viewports, and structural SVG/PNG rules;
- `render-evidence.json` records one real local Chromium observation using
  dimensions, element counts, PNG headers, and overflow measurements;
- `performance.json` defines broad cross-platform ceilings and records the
  compact checked-fixture size.

No raster or SVG blob is checked in. In particular, 3D Plotly SVG export is
honestly identified by its embedded raster `<image>` rather than described as
fully vector output.

## Generate and check

Generate all deterministic documents and refresh the representative Chromium
observation:

```sh
node scripts/plotting/generate-gallery.cjs --write --render
```

Check deterministic semantic evidence without requiring a browser:

```sh
node scripts/plotting/generate-gallery.cjs --skip-render
```

Check the live local browser against the structural and responsive budgets:

```sh
node scripts/plotting/generate-gallery.cjs --render
```

Run the focused regression suite:

```sh
node --test test/plot-gallery-quality.cjs
```

Set `SAGEJS_CHROMIUM_PATH` when Chrome, Chromium, or Edge is installed outside
the normal platform locations. Browser absence is a tested capability fallback:
the semantic, geometry, contrast, alt-text, and checked-evidence tests still
run, while the live rendering test reports a skip.

## What automation proves—and what it does not

Automation proves that the current PlotSpec layer IDs/kinds/data bounds lower
to the expected Plotly trace families; all canonical themes meet their checked
contrast policy; explicit alt text exists and validation accepts it; ten plots
fit mobile, notebook, and presentation viewports without page overflow; 2D SVG
contains vector paths; 3D SVG discloses an embedded raster; and PNG output has
the requested dimensions and a valid header.

The browser observation currently also proves an accessibility gap: the
semantic alt text is not attached to the Plotly DOM as an accessible name.
That is recorded as product debt, not treated as a pass. The display integration
lane should set a stable `role="img"`/accessible-name contract without relying
on Plotly's private DOM. Plotly modebar presence alone does not prove useful
keyboard or screen-reader interaction.

## Human visual-review protocol

Run this review for a plotting release, a Plotly upgrade, a theme/default
change, or a substantive lowering change. Review the ten canonical fixtures at
360×480, 800×600, and 1280×720. Temporary PNG/SVG exports may be generated in
a throwaway directory, but must not be committed here.

For each fixture and viewport, record `pass`, `needs-change`, or `not-applicable`
with a short reason for:

1. mathematical honesty: data, discontinuities, geometry, and 3D occlusion do
   not suggest a false result;
2. hierarchy: titles, axes, annotations, and legend are immediately legible;
3. visual craft: color, whitespace, line weight, markers, camera, and lighting
   look deliberate rather than merely valid;
4. responsiveness: labels and modebar do not collide or leave unusable plot
   area on mobile;
5. interaction: hover text is useful, legend toggles work, and 3D reset/orbit
   behavior is predictable;
6. accessibility: color is not the only carrier of meaning, focus is visible,
   meaningful controls can be reached and operated by keyboard, and the host
   exposes the semantic alt text to a screen reader;
7. export: 2D SVG remains crisp at high zoom, PNG has no clipped content, and
   3D SVG rasterization is communicated where users choose a format.

Use at least one keyboard-only pass, one screen-reader accessibility-tree
inspection, and—when available—one touch-device or mobile-emulation pass. A
human review is complete only when each `needs-change` result links to an issue
or follow-up task. The checked evidence must never be edited to turn a known
gap into an apparent pass.
