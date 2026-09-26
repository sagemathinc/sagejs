# Eager degree-pattern catalog

`pari_prime_degree_catalog` calls the existing source-transparent
`pari_get_fs_small` sequentially from exact defining-polynomial coefficients,
equation index, and rational prime inputs. It never receives factors or
precomputed splitting patterns. The underlying degree-only dispatcher stays
distinct from the newly implemented full polynomial factorization path.

The wrapper publishes compact grouped degrees/multiplicities and a full
sorted degree vector with per-prime offsets/counts. Both representations
count distinct factors, ignoring factor exponents exactly as source
`get_fs`. These arrays serve analytic preparation and factor-base selection;
they do not contain prime generators, tau matrices, or class-group answers.

All input, output, temporary and state owners are disjoint caller-owned
buffers. Capacity is bounded by number of primes times polynomial degree.
Preflight scans every prime before filling any output. Index divisors return
status -3, unsupported degrees -4, large primes -5, and short storage -6;
only the four status entries change. Invalid scalar/monicity inputs raise
before writes. Success state is `[0,primeCount,groupCount,factorCount]`.
An unexpected arithmetic exception leaves status -1 and zero publication
counts; scratch and partial output data must not be consumed as a catalog.

This is deliberately **eager diagnostic setup**, not a translation of PARI's
demand-driven cache access order. In particular the field-0 test fills all
1,230 prepared analytic primes through 10,007, even though a particular
analytic-bound computation consumes fewer. No performance-parity claim is
made for that setup schedule, and caller-supplied primality is a precondition.

The checker uses the already frozen analytic fixture as an assertion-only
reference: its grouping arrays never enter the candidate. Field 0 exercises
all 1,230 primes; the other three fields exercise the first 64 prime positions
with equation-index divisors explicitly excluded. Every same-source scratch
entry is compared across CPython, JavaScript, GMP and tagged backends.
Late index divisors, oversized primes and short output capacity verify that
an otherwise valid preceding prefix is not published on preflight failure.

Qualification passed all four backends, prime counts `[1230,63,64,63]`:
`/tmp/sagejs-prime-degree-catalog-GCc2ra/fixtures.json` contains actual
native-produced catalogs, input packets, and reference hashes. Source SHA256
`80246196f0e463fb38ac675dca7059e5898bc0378ad53cef0d0300b04365c267`;
core SHA256 `1ef3d4a01a1f61076eac7bd5685d31269f504c03d363db6a8c25b4f18c61893b`.
The metered run used 30.364188 CPU seconds and peak RSS 382,732 KiB under
the unchanged 4 GiB limit.
