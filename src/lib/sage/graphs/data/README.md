# Sage graph database

`graphs.db` is SageMath's immutable SQLite database of all unlabeled graphs
with at most seven vertices. It was originally developed by Emily A. Kirkman,
with graph data provided by Jason Grout and other SageMath contributors.

The data is distributed under GPL-2.0-or-later as part of Sage's
`database_graphs` package. Sage.js itself is GPL-3.0-only, so redistribution is
license-compatible. The database is consumed read-only by
`sage.graphs.graph_database`.
