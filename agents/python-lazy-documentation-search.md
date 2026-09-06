# Lazy documentation search

Move the documentation-scanning implementation out of the eager builtins
bootstrap into ordinary strict Python in `sagejs._documentation_search`.
Keep the public `search_doc` signature, docstring and alias; its literal import
is discoverable by the standalone dependency collector. No source ceiling is
raised. Core source decreases from 910170 to 906543 bytes.

This extraction must preserve host boundaries explicitly. Legacy bootstrap
`str.replace(RegExp, ...)` is a JavaScript operation, whereas the same spelling
in ordinary Python calls Python string replacement and rejects the regexp.
Use explicit runtime boundaries for regexp replacement and native sorting.
Normalize the query and construct regexps once per search, while retaining the
raw normalized substring check before punctuation/whitespace collapse. Read
builtins helpers live rather than caching them across mutations.

Pre-integration local body probes in both modes preserved tested output. The
original search median was approximately 3.2ms; the extracted implementation
was approximately 11.7ms (three warmups, seven samples). This is a startup-space
tradeoff, not a search speedup or independently qualified performance result.
Actual lazy import cost and generated bootstrap savings require integration
measurement. The parent bootstrap was 13233170 bytes in each mode, with SHA256
`d182c17eace528fc1a58f0c56407b0904fbbf6399d47cfe1fe5a9366a4e39cf9`.

Regression coverage checks lazy module ownership/discovery, normalization
equivalence, module absence before use (including help), cached import identity,
live helper mutation, empty-query errors and standalone descriptor safety.
Existing missing user-defined-function/method search results are not repaired
or reclassified by this extraction. Standalone embedding may still include the
lazy dependency; do not infer whole-binary savings from bootstrap reduction.

Actual compiled-module integration passes in Python and Sage sessions and in
standalone execution. Module presence, live helper mutation and repeated output
checks pass. The descriptor fixture retains its parent output, including the
existing misses. Generated bootstraps are each 13225323 bytes, 7847 bytes smaller,
with SHA256 `19132c4a3e7a640b8efe68789ec5e2b3be4b114e8b51a70d9c15c0330c7f9391`;
the removed eager helper is absent.

A local actual-import probe (fresh session, `time.perf_counter`, query
`natural logarithm`, three warmups and seven timed repetitions) measured about
20ms for the first search and warm medians 2.92ms in Python / 2.97ms in Sage.
These differ substantially from evaluating the candidate body as session code:
the earlier body-only slowdown does not describe the real lazy-module path.
Neither probe independently establishes a speedup or a performance-cliff result.

Architecture, strict Python and routine validation pass, including startup
budgets. All 536 corpus statuses and dispositions match the parent: 522 passes,
three reviewed differences and eleven existing required failures. Package
outcomes remain eight of eleven workflows plus seven passing Tomli upstream
tests. Both current-source report guards pass; neither broader gate is qualified.
No four-platform or browser qualification is claimed by this Linux slice.

The modular q-expansion source inventory also changes because it hashes the
whole package graph. Only that input digest and its aggregate bundle digest
change; this refresh records current source, not a new cross-platform receipt.
