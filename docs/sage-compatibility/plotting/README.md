# Sage plotting compatibility evidence

This directory holds generated, reviewable authority data for the Sage.js
Plotly-native plotting project. It does not claim that Sage.js implements every
entry. Later coverage ledgers classify each entry as faithful, translated,
unsupported, or an extension.

## Pinned Sage surface

`sage-surface.json` inventories the plotting surface of **SageMath
10.9.post1**. Its scope is intentionally reproducible:

- every module in Sage's 2D plotting reference, including the documented graph
  plotting integration;
- every module in Sage's 3D plotting reference;
- public module-local functions and classes (names not beginning with `_`);
- public callable methods declared directly by each inventoried class;
- aliases as separate public bindings;
- class constructor and method signatures wherever Sage exposes them;
- SHA-256 hashes and byte sizes for every installed authority module.

Inherited methods are represented by each class's ordered direct bases and by
the declaring class's own record; they are not duplicated under every
subclass. Constants, data attributes, imported implementation helpers, private
names, and Python protocol methods beginning with `_` are outside this first
callable-surface artifact.

Python modules are hashed over their installed source bytes. The Sagelite wheel
does not ship `.pyx` sources for compiled Cython modules, so those records use
the installed extension binary and say so explicitly with
`sha256_scope: "installed-extension-binary"`. Such hashes pin this exact
Linux wheel artifact and are not expected to match another platform's build.
The logical `.pyx` path remains stable for classification.

## Regeneration

Use the project Sage authority, not a system Python:

```sh
/home/user/bin/sagelite scripts/plotting/generate-sage-surface.py
/home/user/bin/sagelite -- scripts/plotting/generate-sage-surface.py --check
```

The generator refuses any Sage version other than 10.9.post1. Output ordering,
JSON formatting, module paths, and signature text are deterministic; runtime
memory addresses in introspection output are normalized.

Run the focused structural regression independently of Sage:

```sh
node --test test/plotting-sage-surface.cjs
```

The checked-in artifact is therefore useful in ordinary Sage.js CI, while
regeneration remains an explicit oracle operation on a machine with the pinned
Sage installation.
