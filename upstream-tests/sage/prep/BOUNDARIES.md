# PREP corpus boundaries

The corpus distinguishes executable mathematical compatibility from its host
environment. Jupyter user-interface instructions, tab-completion placeholders,
help-source inspection, and optional R/rpy2 examples are presentation or
external-system examples rather than missing mathematical algorithms.

All remaining examples default to supported. A failure therefore needs either
a Sage.js implementation or an exact, reviewed classification in
`expectations.json`. Broad file-level exclusions are prohibited: classifications
use stable source locations so newly added upstream material cannot disappear
behind an old waiver.

The primary target is ordinary undergraduate use in the Sage.js CLI, Jupyter,
and `app.sagejs.org`. Heavy implementations remain lazy and native numeric
features must retain matching WebAssembly behavior.
