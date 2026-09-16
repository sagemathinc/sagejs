# Requested initial factor-base descriptors

`pari_initial_kummer_catalog` connects the descriptor-request loop of PARI
2.17.4 `buch2.c:FBgen` to the translated one-prime Kummer decomposition.
Inputs are a prepared cubic/quartic nf, generated residue-degree patterns,
an increasing complete prime list, a bound C2, and an initialized RNG state.
There are no input generators, tau matrices, selected ideal HNFs or class
answers. Pattern counts count distinct ideals, not ramification exponents.

For each prime at most C2, the source skips a leading degree equal to n,
computes `int(log(C2+0.5)/log(p))`, and skips when no factor degree fits.
Otherwise this wrapper calls the degree-limited Kummer decomposition exactly
once and preserves its RNG state for the next prime. No separate factorization
is performed for skipped primes. The per-prime logarithm is recomputed here
instead of reusing `GRHprime_t.logp`; the binary64 formula is the same, but
this repeated work must be counted when comparing the composed driver.

Sorted descriptors are written at the full-catalog offset for each prime.
Only its eligible prefix is populated; skipped descriptors and buffer tails
remain untouched. Tau is transposed to row-major admission metadata. Inert
metadata convention is zero generator/tau with an explicit flag, although
FBgen's inert exclusion means this branch is not reached for valid patterns.
The wrapper does not construct C1, select the active factor-base prefix, or
compute subfactor permutations; existing initial-base and packet modules do
those jobs.

State is `[status,visitedPrimeCount,decompositionCallCount,writtenCount]`.
Catalog metadata preflight failures are mutation-free. Inherited nf/scratch
validation occurs inside the first requested decomposition; those failures
can follow state changes or earlier successful catalog publication. This is
an explicit partial-result contract, not transactionality. Owners are
disjoint and primehood/prepared-field consistency remain preconditions.

## Evidence

The checker generates patterns with the translated `pari_get_fs_small` and
compares them against PARI. These generated patterns form the wrapper input;
the current checker generates them with CPython and replays that same input
on the other backends. It does not yet combine pattern generation and catalog
construction into one native call.

Seven field-0 bounds (1,2,3,5,7,37 and the actual default C2=333) compare against
literal `FBgen`, including every populated descriptor, skipped slot, requested
count and all 66 final RNG words. The default case visits 67 rational primes,
makes 48 decomposition calls and writes 66 descriptors. Eight metadata guard
controls test atomic failure. CPython, JavaScript, GMP and tagged backends
pass under a metered 4 GiB address-space cap.

Final artifact: `/tmp/sagejs-initial-kummer-catalog-Kc48PL/fixtures.json`.
Source SHA256:
`6c2ff70132491d2890432eeb21de63026c75b360ad52c91778a32331a38e1e57`.
Core SHA256:
`287f71e0e32beecb6c0bd5a7a10c88eddfa7a0bfe3a0d6bda0304fb0143843f9`.
Native qualification used the compiler identifier-hygiene fix integrated by
the parent lane. No performance or completed class-group claim is made here.
