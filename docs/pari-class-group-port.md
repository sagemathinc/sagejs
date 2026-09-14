# Faithful PARI class-group language experiment

## Real division for the pending enumeration-bound connection

`real_division.py` implements the real quotient value operation required by
PARI's logarithm and higher-root iterations. It preserves the separate
one-word divisor path, operand-word windows, normalization and leading-word
remainder rounding. The pinned 64-bit GMP crossover is 256 bits; below it,
the small loop retains at most one extra numerator word. Exact backend integer
division replaces the upstream quotient loop explicitly. This is an arithmetic
leaf substitution, not a claim that a different division cost is a compiler
defect. Current tests establish correspondence on these controls, not a formal
proof of all limb-boundary cases.

The 6,272 controls compare seven numerator and denominator precisions in every
pairing, signed/zero numerators, signed denominators, random mantissas and
shared-leading-word/low-tail endpoint patterns against actual PARI `divrr`.
Stored outputs match CPython, dynamic JS, GMP-native and tagged-native. The
1920-bit input ceiling keeps intermediates within existing storage limits.

The numerical dependency inspection found that `Fincke_Pohst_bound` needs
`sqrtnr`, including its `logr_abs`/exponential initialization and higher-precision
iteration. Those connections are still missing; using binary64 `pow` in their
place would not preserve the requested experiment.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_division.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Householder QR connected to reduction-matrix output

`householder.py` translates `QR_init`, `FindApplyQ`, `ApplyAllQ`/`ApplyQ`, and
`gaussred_from_QR` from PARI 2.17.4 `src/basemath/bibli1.c`. It starts from an
integer/real matrix and computes the reduction matrix in one native call,
preserving the order of scalar operations, reflector applications, sign
selection and `no_prec_pb` check. It does not accept a precomputed QR result.
Integer entries remain exact until the corresponding upstream conversion.
The `mpmul` integer-zero branch is distinct from generic `gmul`: its result
is a real zero with PARI's precision-dependent exponent.

All buffers are caller-owned and must be distinct; matrix slots are row-major
triples with precision -1 denoting an integer. Requested precision is locally
limited to 512 bits by the existing square leaf, and unsupported multiword
integer/real operations still raise explicit errors. The reciprocal and integer
square-root leaf substitutions remain declared, so this is not yet a pure
language-cost comparison. Precision failure returns 0; incomplete scratch
contents on failure are not a public result.

The oracle covers 36 actual `G * (I * ZM_lll(roundG * I))` matrices from the
four tuning fields, primes 2/3/7 and requested precisions 128/192/256. PARI
still supplies these input matrices: ideal construction, LLL and embedding
multiplication are **outside** this connected QR boundary. Another 30 controls
cover dimensions 1–5, integer/real/mixed entries, zero matrices, negative
diagonals and low-precision failure. All 57 successful output matrices and
the same nine upstream failures agree across PARI, CPython, dynamic JS,
GMP-native and tagged-native execution; input buffers remain unchanged.
Formatting, repository strict-Python and parallel checks pass. The known
optimizer manifest failure still prevents a green full architecture gate.
The full collector and class-group path
remain incomplete; no new timing claim is made.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_householder.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Real square root (preceding QR checkpoint)

`real_square_root.py` translates the two exponent-parity branches of PARI
2.17.4 `src/kernel/gmp/mp.c:sqrtr_abs`, including the extra root-word rounding
in the even-exponent branch. The representation remains a signed mantissa,
whole-word precision and exponent; this absolute-value routine requires a
nonzero input. Generic `gsqrt` dispatch and its integer/zero cases are not yet
implemented. The local precision ceiling is 1920 bits to keep intermediates
within existing 64-word storage, not an increased global limit.

The underlying `mpn_sqrtrem` is explicitly replaced by an exact integer Newton
loop in ordinary Python. This is an arithmetic-leaf substitution: measurements
must distinguish its cost from compiler overhead before interpreting any gap.
It does not establish comparable square-root or collector performance.

The focused oracle compares 1,120 results against the actual PARI GMP routine
and CPython, dynamic JavaScript, GMP-native and tagged-native execution of the
same Python source. Controls cover both exponent parities, negative exponents,
both input signs, seven precisions from 64 through 1920 bits, endpoint mantissas
and seeded random mantissas. Integer-root identity/remainder controls and
explicit unsupported-input checks supplement these comparisons. QR was still
unfinished at this checkpoint; its subsequent connection is described above.
The connected collector remains unfinished.

At this checkpoint Python formatting, repository strict-Python checks and the
parallel contract check pass. `architecture:check` still stops at the previously
recorded stale optimizer-opportunity manifest; preceding architecture audits
pass. No Windows/Wasm or timing qualification is claimed.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_square_root.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Post-factorization candidate normalization

`smooth_relation.py` connects the post-`factorgen` block of
`Fincke_Pohst_ideal`: add the search ideal and optional base-ideal powers,
assemble the relation, compute candidate content, divide coordinates by it,
and subtract ramification-weighted rational-prime valuations from the
relation. Extra subfactor ideals already present in the factor list are
skipped in the second adjustment pass. The original `nz` hint is retained.

The 96-case oracle executes this block using PARI's actual `add_to_fact`,
`set_fact`, `Z_content`, `Q_div_to_int`, and `fact_update`, comparing all
mutated factors, coordinates and relation entries with CPython/JS/GMP.
It varies the search/base ideal coincidence, content 1/2/6/30 and optional
signed subfactor powers. The prime-ideal records here are synthetic prepared
prime/ramification metadata; these are block-correspondence controls, not
claims that the supplied candidate factorizations are genuine relations.

The remaining collector boundary is substantial: preparation of each search
ideal, the LLL transform, arbitrary-precision QR/Cholesky and search-bound
selection, then connecting enumeration, actual factor admission, normalized
generator storage and cache insertion. Returning prepared candidates or
passing factorgen output across an outer boundary does not complete that path.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_smooth_relation.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Factor assembly connected to cache insertion

`pari_prepared_set_fact` preserves upstream overwrite semantics for repeated
factor entries, adds optional subfactor-base powers in order, and retains the
minimum touched index even when cancellation makes that coefficient zero.
The hint is not silently recomputed. `pari_prepared_insert_fact` connects that
construction to cache insertion in a single native call; factor entries and
optional powers are inputs, not an assembled relation vector.

The `--fact` oracle exercises 192 sequential synthetic transitions, including
repeated indices, signed powers, NULL extras and cancellation. It compares
the assembled vector and hint as well as all previously checked cache state.
There are 174 normal returns and 18 matching upstream inverse failures:
PARI's unsigned pivot conversion can violate Fl_inv's documented input range
on these synthetic vectors. Exact failure identities are asserted and the
post-failure cache state is compared. They are correspondence tests, not
successful computations or proof these inputs occur in genuine collection.
CPython, JS and GMP agree with the pinned upstream outcomes.

General generator ownership, automorphism images and actual relation search
remain incomplete; this does not establish full collector performance.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_relation_cache.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 --fact
```

## Connected fresh relation-cache initialization

`pari_prepared_initialize_relations` now connects fresh basis/cache setup to
`init_rel`'s complete-prime-group loop and the translated insertion routine.
It constructs `(p) = product(P^e)` from active prime-group offsets, counts,
completeness flags and ramification indices. Relation vectors are not inputs.
For these initial integer generators, the stored generator slot contains p
itself. General field-element ownership remains a separate boundary.

The allocation rule `10*(KC+additional)+50`, missing-rank count, dependent
allowance, checkpoint and target offsets follow PARI. Caller-owned buffers
must already have that capacity; no global resource limit is raised. The
wrapper also zeroes the fresh modular basis, corresponding to the driver
operation preceding `init_rel`, and routes each relation through `add_rel_i`.
The outer automorphism branch is inactive for these integer generators.

All 24 cases (four tuning fields, three factor-base bounds, two additional
relation allowances) match actual PARI/CPython/JS/GMP for every basis entry,
relation vector, hash, generator and state offset. Inputs are prepared active
decompositions, not a completed bnf or previously known relations. This is
still not a full relation collector or class-group timing result.

At this checkpoint goal accounting reports 23,908 root active seconds
(6.64 hours), plus the previously recorded 12 panel-agent minutes. The
16-hour aggregate experiment boundary has not been reached. The frozen panel
and reserves are unchanged; full-path dependency and performance work remain.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_relation_initialization.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Resident relation-cache insertion

`relation_cache.py` translates `already_known` and `add_rel_i` over resident
buffers: backward duplicate search, modular basis reduction/insertion/cleanup,
missing-rank count, dependent-relation allowance, zero-relation bypass, and
record append decisions. The upstream strict upper-cleanup bound excluding
the last column is preserved. Generator objects remain caller-owned IDs;
field-element cloning/evaluation and the outer automorphism expansion in
`add_rel` are not implemented by this boundary. Cache storage is preallocated;
an otherwise-overrunning zero append raises explicitly.

The signed-vector oracle exposed why generic modular inversion was not a
faithful substitute. A negative signed pivot is cast to an unsigned word and
passed to `Fl_inv`; its documented `x < p` precondition is not met by those
synthetic inputs. The port reproduces `xgcduu(f=1)`'s subtract/divide schedule,
64-bit wrapping and output selection, rather than normalizing the pivot first.
Unsigned wrap in the basis update expressions is also explicit. This records
observed routine behavior, not a claim that arbitrary synthetic relations
occur in the final production path or that the filter proves exact rank.

Across 192 sequential insertions (dimensions 2/3/5/8 and two dependent-relation
allowances), status, append occurrence, every basis entry, counts, hashes and
stored vectors match actual PARI, CPython, generated JS and GMP. Tests assert
coverage of duplicate rejection, rejection without append, zero-status append
and positive status. No full collector or performance comparison is claimed.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_relation_cache.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Subfactor-base change transition

`pari_prepared_subfactor_change` now implements `subFB_change`'s preferred
ideal pass, continuation through the existing permutation, exclusion flags,
unchanged-versus-assigned distinction and dependency limits. Importantly, the
fallback pass continues at the preferred pass's index rather than restarting
at the beginning. Failure preserves the current subfactor base and change
flag; success clears that flag. A null preferred list and a present empty
list have distinct explicit input representations.

The 48-case oracle compares status, assignment occurrence, current ideals,
change flag and both limits against actual PARI/CPython/JS/GMP. It includes
four failed increases after exhausting eligible ideals, unchanged successes,
and changed selections over four tuning fields and six preferred-list states.
Historical list allocation is not represented: callers must retain previous
snapshots if needed. This remains a prepared transition, not a completed
resident relation-collection context or a performance result.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_subfactor_change.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Subfactor-base selection toward relation collection

`subfactor_base.py` translates `subFBgen`'s norm ordering, exclusion/selection
loop, yes/no permutation assembly and 16/10 dependency-trial limits. The
index sort preserves `bibli2.c:gen_sortspec`'s recursive split tree, two/three
element comparison cases and left-first tie rule, using explicit DFS frames
and resident scratch instead of recursive GEN allocation.

This boundary takes active-ideal norms in LP order and `bad_subFB` flags as
prepared inputs. It does not yet construct automorphism permutations, retain
historical subfactor bases, or implement `subFB_change`; it is not the full
factor-base context. Norm conversion is explicitly limited to positive
integers at most 2^53, rather than silently substituting exact conversion for
PARI's rounding signed-long cast outside that range.

Across the four tuning fields, four bounds, three minimum sizes and two
product targets, 96 selections, complete permutations and trial limits match
actual PARI `subFBgen`, CPython, generated JS and native GMP. The oracle uses
empty automorphism lists for this selection-only boundary. An additional 387
reverse/tied/permuted index-sort controls exercise sizes 0 through 128 and
match stable order in JS/GMP. No performance qualification is claimed.

Two compiler representation constraints were encountered: fixed slices reject
`IntegerBuffer` (they currently require native-vector storage), and a loop
variable cannot be reused with machine and arbitrary-integer range types.
A source-level three-store helper and distinct loop locals keep the code
readable without changing those compiler interfaces in this checkpoint.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_subfactor_base.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Resolved tiny-exponential guard growth

The former precision-growth failures are now resolved by an explicit, narrow
representation accommodation. An extracted upstream `exp1r_abs` diagnostic
shows `L=64` but initial `l1=128`: `setprec(X,l1)` makes `divru` consume the
adjacent `y` object's header as another mantissa word. This is not retained
precision belonging to X. We do not reproduce adjacent-object reads.

For the admitted case (`n=2`, `m=0`, X precision 64, temporary precision 128,
X exponent at most -48), that extra word cannot affect the result:

- Division is by two, an exact exponent shift preserving the leading word.
- After the schedule clamps `l1` to 64, `addrr_sign` adds the quotient to a
  64-bit one. Their exponent gap is at least 49. If the gap is at least 64,
  the upstream `l <= 2` branch returns one; otherwise its `lx = l` branch
  retains only the quotient's first mantissa word before the shift. Neither
  branch observes the extra word.
- There is only one Horner iteration. Final multiplication restores the
  original 64-bit X, so the extra word is never used subsequently.

The port therefore supplies an allocated zero guard for precisely that case,
without changing the schedule or relaxing generic truncation checks. The
diagnostic covers 160 inputs over exponents -63 through -48 and ten mantissa
patterns: all 480 comparisons (original layout, zero guard, all-ones guard)
agree. It is diagnostic C extracted from the pinned source, not a runtime
mathematical implementation or replacement backend.

After this change all 540 `exp1r_abs` and 646 connected exponential controls
match PARI/CPython/JS/GMP, with no failures. Native GMP now matches all 52
connected inverse-residue stored results exactly. JS matches 50 and retains
the two documented logarithm-driven divergences. Earlier sections below
record the prior checkpoint failures; this section supersedes their counts.
This does not establish whole-class-group completion or performance.

```sh
node bench/pari-class-group-port/probe_exponential_precision.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Binary64 ingress and connected inverse residue

`pari_float_to_real` constructs PARI `dbltor`'s exact stored triple, including
subnormal normalization, signed-zero collapse and nonfinite rejection.
The current representation substitution finds the exponent by a bounded
binary search over exact powers of two rather than C-union bit access. It
therefore has a different conversion cost, explicitly excluded from a claim
that only the language changed. All 12,392 bit-pattern controls agree with
PARI/CPython/generated JS/GMP: every exponent encoding with zero, minimal and
maximal fraction fields, both signs, and every single-bit subnormal.

`pari_prepared_inverse_residue` now connects the accumulated logarithm,
binary64 ingress, and the real exponential in one native call. Prime
decompositions and cached logarithms remain prepared inputs. It returns the
processed count and complete stored result; hR normalization is still absent.
On the existing 52 controls, native GMP has 49 exact PARI results and three
explicit precision-growth failures (field 0/bound 5, fields 2 and 3/bound 3).
Generated JS has 49 exact results, two divergent stored results and one
failure. The two divergences are the already observed bound-3 logarithm/work
differences; separately labeled CPython logarithm replay matches the JS path.
All failures and divergence identities are asserted, so a new failure cannot
silently become a passing test. This is incomplete connected coverage, not
successful qualification of the whole residue routine or class-group engine.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_float_ingress.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_residue.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected prepared-real exponential

`exponential_entry.py` connects `modlog2` and the `mpexp` base case:
upstream binary64 quotient selection, computed cached log(2), real subtraction,
`exp1r_abs`, addition of one, reciprocal for negative remainders, exponent
shift and conditional precision reduction. Zero inputs retain `mpexp0`'s
precision convention. The input remains a prepared real triple, not yet the
binary64 ingress used by the residue computation. Caller-owned scratch stays
resident. Inputs above 1920 bits are explicitly outside this base-case port.

The checker compares 646 inputs (321 sixteenth steps from -10 to 10, 202
signed powers of two, and 123 eighth steps at 128/192/512-bit precision).
Of these, 642 produce identical stored result triples
in PARI 2.17.4, CPython, generated JavaScript and GMP native execution. Four
inputs, precision 64 and exponent -60 or -50, explicitly fail at the existing
`exp1r_abs` truncating-precision growth boundary. They are recorded failures,
not omitted cases or successful computations. No timing claim follows.
The reciprocal's previously documented integer-division substitution remains.

Compiler prerequisite `97858eab0` permits the actual diamond imports of shared
real-arithmetic helpers. The focused import regressions pass; the architecture
gate still fails at the previously recorded stale optimizer manifest.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_exponential_entry.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## PARI real-to-binary64 conversion

`float_conversion.py` preserves the 64-bit `rtodbl` path: rounding from the
leading mantissa word alone, carry into the exponent, positive-zero early
underflow, the special exponent -1023 bit construction, and overflow at
exponent 1023. It constructs the same binary64 value arithmetically rather
than aliasing a C union. This is intentionally not a generic correctly-rounded
real conversion with a full subnormal range.

The oracle compares 528 conversions bit-for-bit in PARI/CPython/JS/GMP,
covering both signs, four input precisions, guard-bit neighbors, exponent
boundaries, signed zero and overflow. Low mantissa words are deliberately
present in the multiword cases. Range reduction still needs to call this
conversion and the computed logarithm constant; the full exponential remains
unconnected.

Compiler prerequisite `f31caa9f9` supports explicit OverflowError and fixes
Float64 result publication from mixed exact kernels. Its regressions retain
the rejection of buffer-bearing Float64-returning helpers pending effect
qualification; this port uses scalar inputs only.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_float_conversion.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Computed logarithm-of-two constant and resident cache

`logarithm_constant.py` connects PARI's three `atanhuu` calls, their exact
18/-2/8 combination order, one-word guard precision, `affrr` rounding and
`mplog2` result copying. A caller-owned three-entry cache replaces PARI's
global clone; it retains higher precision across smaller requests. No table
or host logarithm substitutes for computing the constant.

Twelve increasing/decreasing precision requests through 1984 bits match
actual PARI in CPython, JS and GMP, including both result triples and full
cache state. Warm calls also succeed with no series scratch, checking cache
reuse. Caller-owned buffers use explicit limb capacity; global limits stay
unchanged. Cache/input buffers are private resident state, not external proof
objects. The final range reduction and exponential entry are still pending.

Compiler prerequisite `a01b73d63` propagates mixed Float64 requirements through
native dependencies: an integer-only wrapper now uses GMP when a callee needs
Float64, instead of attempting an unsupported tagged call. Tagged mixed
execution remains explicitly unavailable, not silently redirected.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_log2_constant.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Resident binary splitting and connected atanhuu

`binary_splitting.py` translates `abpq_sum`, including the distinct one-,
two- and three-term formulas and the original midpoint splits. An explicit
depth-first stack replaces recursive stack frames, retaining multiplication
association and the four unreduced P,Q,B,T results. Input arrays are not
mutated. Scratch must be separate from inputs; the 4096-term experimental
boundary uses a conservative 91-entry stack allocation.

The oracle compares 256 intervals against actual PARI, CPython, JS, GMP and
tagged execution, covering small cases, odd/even splits and nonzero starts.
An all-one 4096-term control and exhausted-storage checks exercise the depth
boundary. This is not a binary-splitting performance claim.

`pari_atanhuu` connects PARI's binary64 term selection, coefficient setup,
splitting and rational-to-real conversion. Twenty outputs match actual PARI,
CPython, JS and GMP: five precisions through 512 bits and arguments 1/26,
1/4801, 1/8749 and 2/3. The first three are the actual log(2) construction
arguments. Its input integers are explicitly restricted to exact binary64
conversion and it rejects more than 4096 terms. Tests supply 64-word entries
for large intermediate scratch values; the default per-entry capacity and
global safety limits are unchanged. Mixed Float64 tagged execution remains
unavailable. The log(2) combination/cache is connected in the checkpoint
above; range reduction remains pending.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_binary_splitting.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Rational conversion for logarithm-of-two construction

`real_conversion.py` follows `affir` and `rdiviiz`'s branch selection: a
single-word denominator uses `divru`, oversized integers use `divri`, and
the remaining case uses a scaled exact quotient before real conversion.
Signs and guard-bit rounding are retained. The direct word-division helper
now accepts the full unsigned 64-bit range; `divri` still routes its high-bit
integer operands to its existing big-integer branch, as upstream does.

The test compares 1,248 rational conversions against actual PARI and
CPython/JS/GMP/tagged execution, spanning zero, signs, 63/64/65-bit boundaries,
and numerator/denominator sizes on both sides of the branch thresholds.
Integer arithmetic uses the existing backend; no new language-only timing
claim follows. PARI's binary-split `atanhuu` sums are connected in the
checkpoint above, along with cached `constlog2` construction. No
constant table substitutes for their computation.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_conversion.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Reciprocal dependency

`pari_real_reciprocal` represents `invr_basecase`'s result, retaining the
separate one-word case, leading-remainder-word rounding and exponent/sign
normalization. **Exact integer division substitutes for PARI's quotient-word
loop.** This is a disclosed arithmetic leaf substitution, not evidence of
language-only performance equivalence or a line-for-line division port.

The oracle invokes actual `invr` on 560 controls: precisions 64, 128, 192,
256, 512, 1024 and 2048; both signs; leading-one, adjacent and all-one
mantissas plus deterministic random mantissas. CPython/JS/GMP/tagged outputs
agree exactly with PARI, including stored precision and exponent. This spans
the pinned 256-bit GMP division crossover but does not prove equivalence on
every possible quotient/remainder. Zero is explicitly rejected. The chosen
precision ceiling remains below the upstream inverse-Newton path.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_reciprocal.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected exponential series (not yet the exponential entry)

`pari_exp1r_abs` translates `trans1.c:exp1r_abs`: binary64 term/scale selection,
precision-changing Horner evaluation, repeated doubling, and final `affrr`.
It retains the original full X mantissa while temporarily reducing precision.
It uses the translated real arithmetic, not MPFR exp or a replacement series.
The compiler prerequisites include direct imported `math.log2` and sharing
identical helper definitions reached through multiple entries of one module.

Across 540 predeclared synthetic controls (five precisions, 18 exponents,
three mantissas, both signs), 534 outputs match actual PARI 2.17.4 exactly in
CPython, JS and GMP, including stored precision and exponent. Six controls
at 64-bit precision and exponent -63 fail explicitly in every port path:
upstream selects initial `l1=128` with `L=64` and changes X's header beyond
the retained value precision. The current representation cannot reproduce
that operation; it does not silently pad or claim equivalence. The test
freezes these six failures and rejects new failures or output disagreements.
This observation is not yet an upstream memory-safety diagnosis.

`modlog2` and the full `mpexp` entry remain dependencies; the constant is now
connected above. These series checks are not a complete residue
calculation, class-group computation, or performance qualification.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_expm1.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Exponential precision primitives

`exponential.py` begins the direct base-case port with `rtor`/`affrr` and
shrinking `setprec` value operations. The former pads on growth and rounds
away from zero on a set leading guard bit when shortening, including carry
renormalization. The latter truncates without rounding. A zero passed through
`affrr` retains the smaller of its previous exponent and minus target precision.

The test compares 460 controls against actual PARI, CPython, JS, GMP and tagged
execution, including signs, halfway mantissas, all-one carries, precision growth
and zero-exponent changes. Growing `setprec` is not modeled as a value operation:
upstream restores still-retained allocation words, so the future series port
must retain its complete X separately. Zero value triples do not represent
allocation length. These are explicit representation boundaries, not permission
to discard precision restoration in the exponential.

Eight invalid precision/mantissa requests are also rejected by CPython and
all three execution backends. Strict Python validation passes (403 modules).
The architecture check passes its native/FFI/Wasm audits but still fails the
existing stale optimizer-opportunity manifest; that unrelated manifest has
not been regenerated to hide the failure.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_resize.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Final exponential dependency: MPFR is not bit-identical

`check_residue_exponential.py` observes the actual `mpexp` input/output from
52 existing residue controls and 523 synthetic binary64 inputs. It compares
against MPFR 4.2.2 via gmpy2 2.3.1 at the PARI output's stored precision.
This is an arithmetic interchangeability diagnostic, not a port, benchmark,
or proof that a discrepancy changes a class-group stopping decision.

On this run, 29/52 residue outputs differ in exact stored value; seven still
differ after rounding PARI's output to 64 bits and comparing with a 64-bit
MPFR exponential. Overall 49/575 differ at stored precision and 11/575 after
64-bit rounding. PARI sometimes returns increased storage precision (128 bits
for several residue cases, higher for tiny synthetic inputs); this must not
be confused with a guarantee of correctly rounded accuracy at that precision.
Representative residue relative differences are around 1e-22 to 1e-21.

Consequently, silently replacing this leaf by MPFR exp would not preserve the
current exact-representation contract. The direct path to investigate is
`mpexp_basecase` → `modlog2` and `exp1r_abs`, reusing translated real arithmetic
and preserving precision changes. A later explicit primitive substitution
would need its own divergence account; this diagnostic does not authorize one.
The full class-group path remains incomplete.

```sh
python3 bench/pari-class-group-port/check_residue_exponential.py \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected residue-bound selection

`residue_bound.py` translates `tailresback`, `tailres` and `primeneeded`.
The pinned source passes several analytic coefficients into integer-typed
parameters of `tailresback` in a surprising order. This port deliberately
retains that order and truncation; it does not repair upstream mathematics
while claiming work equivalence. The 31 constants are copied from the pinned
table and loaded into caller-owned scratch once per search. That initialization
differs from C static storage and is not hidden in a language-only speed claim.

The standalone oracle calls actual upstream routines on 238 degree/signature/
log-discriminant parameter controls (degrees 2–10), checking 7,616 tail values,
including the table-to-zero transition at index 31. CPython, JavaScript and
GMP agree on selected bounds and threshold decisions; these synthetic parameter
controls are not new number-field corpus entries or general performance data.

`pari_prepared_residue_front` now selects the bound and runs the accumulation
in one native call. Four existing tuning fields match PARI/CPython/JS/GMP on
the selected bounds, processed-prime counts and logarithmic results. Only
decompositions and LOGD remain prepared inputs; cached logarithms and tail
coefficients are computed inside this connected front. The prior bound-3
mixed-library replay divergence remains reported in the separate controls.
The final PARI-real exponential and hR normalization are still unported.

Compiler prerequisite `58bafbf92` permits ignored scalar results of known
source-native calls, supporting ordinary scratch-initialization statements
without fake assignments. Unknown callbacks and tuple/resource-result disposal
remain rejected; mutation and error propagation are checked against CPython.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_residue_bound.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Inverse-residue accumulation and a numerical work divergence

`residue.py` translates the binary64 accumulation in `compute_invres`, up to
but not including `mpexp(dbltor(loginvres))`. The final exponential must retain
PARI-real precision semantics; binary64 `exp` is not a substitute. The residue
bound and cached decompositions/logarithms remain prepared inputs in this
standalone test. The bound selector is now connected above; the final
exponential remains a dependency, not omitted work in a claimed
whole-engine timing. The explicit experimental bound range keeps integer p*p
exactly convertible to binary64; unsupported ranges fail rather than clamp.

The oracle includes the actual pinned `buch2.c` and observes the input to
`mpexp` with a wrapper that still calls the original exponential. On four
existing tuning fields and 13 bounds (2 through 10,000), all 52 native GMP
accumulations match PARI and CPython within the documented numeric tolerance,
with exact agreement on the number of processed rational primes.

**JavaScript does not perform identical work on four of these controls.** At
bound 3, `Math.log(3)` rounds below the cached PARI `log(3)`. Truncating their
ratio gives zero instead of one, so the fallback visits one rather than two
primes. The test reports these divergences and compares fallback arithmetic
against a separately labeled CPython replay using the JavaScript bound-log
value. This replay is a diagnostic, not work-matched performance evidence.
The mathematical source is unchanged and no comparison threshold is adjusted
to hide the branch difference. It illustrates why matching final values alone
does not establish matching upstream work.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_residue.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected initial factor-base selection

`initial_base.py` connects initialization constants and logarithms, GRH bound
search, the `nthideal` lower limit, the initial relation/checking-bound
adjustment and `FBgen` selection in one isolated Python-source computation.
The prepared boundary supplies LOGD and cached decompositions, not selected
bounds or factor-base answers. The output includes both bounds, all selection
counts, the active prime product and indices of the selected prepared ideals.

`nthideal` retains upstream reverse residue-degree traversal and forward
in-place norm insertion, including the unusual prefix writes. Its scratch
array uses upstream one-based entries; index zero is scratch, not a GEN header.
The `upowuu` leaf uses exact multiplication with the upstream unsigned-64-bit
overflow-to-zero convention; this is a disclosed leaf substitution, not a
language-only cost comparison. Missing prime coverage fails explicitly.

The expanded GRH driver checks 32 `nthideal` controls against actual PARI,
CPython, JS, GMP and tagged execution. The factor-base driver's `--initial`
mode checks the combined path on four existing fields with cbach 0, 0.3 and
13 (including upstream clamping to 12 and raising cbach2). The full prime
selection metadata is compared, not just the class-number-independent counts.
Large oracle prime products use a bounded 20,000-digit CPython serialization
allowance; no native memory or arithmetic limit is raised.

This is still **partial initialization**: prime decomposition/cache growth,
inverse-residue computation, ball volume, sub-factor-base preparation,
automorphism state and retries remain outside this connected segment. In
particular, skipping the intervening inverse-residue work is explicit
scaffolding, not equivalent whole-initialization timing. Mixed tagged execution
is still unavailable and no whole-field speed conclusion follows.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_factor_base.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 --initial
```

## GRH checking and initial bound-search checkpoint

`grh_bound.py` translates `buch2.c:GRHchk`, `GRHok`, and the initial
`Buchall` doubling/bisection/final-clamp loop. Upstream mathematical assumptions
remain provisional. Prepared inputs include the distinct residue degrees and
multiplicities, cached prime logarithms, `init_GRHcheck`'s cD/cN, and the initial
and maximum limits; they are not completed bounds or class-group answers.
Prime-decomposition cache construction is still external scaffolding.

The bound-one case preserves C's positive-infinity comparison without causing
a Python zero-division exception. Catalog exhaustion and unsupported bounds
raise explicit errors, not mathematical rejection. Exact norm multiplication
replaces the small `upowuu` leaf, with admitted bounds limited to the exact
binary64 integer range; no timing equivalence is asserted for that leaf.
The two upstream `pow` expressions retain their order and are not replaced by
an exponentiation recurrence. Compiler prerequisite `6ae5b81fe` adds imported
binary64 `log`/`pow`; the existing source-transparent sqrt helper is called
inside the isolated computation.

Four existing tuning fields give 1,200 checks (bounds 1 through 300) and 24
searches (six initial limits), matching actual PARI 2.17.4 `GRHchk`, CPython,
JS and GMP. The C search oracle reproduces the short upstream control loop
around the actual checker. These controls establish decision agreement on
those inputs, not bitwise logarithm/power equality across platforms. The full
initialization and discovery engine remain incomplete; this does not qualify
whole-field performance or open the reserved fields.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_grh.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Factor-base selection loop

`factor_base.py` translates the selection loop of `buch2.c:FBgen`, retaining
the distinction between relation bound C1 and checking bound C2, inert-prime
exclusion, residue-degree truncation, the complete-prime-group flag, zero-based
offsets for one-based factor indices, KC/KCZ/KCZ2/KC2, and the active
rational-prime product.
It returns indices into prepared prime decompositions rather than constructing
new ideals. The source preserves the upstream `KC == 0` sentinel behavior
instead of replacing it with a generic crossed-bound flag.

The actual `FBgen` oracle checks 64 combinations of the four existing fields,
eight bounds and equal/split relation bounds. Selected prime-ideal identities
are compared against the full prepared decompositions, not just their degrees.
CPython, generated JS and GMP agree on all selection metadata, including
partially included prime groups and different active/checking sizes.

This declared-bound selection-loop test is **not complete factor-base setup**;
the new connected initial-selection driver is described above.
The decomposition cache, `log(C2+0.5)` and cached prime logarithms are explicit
PARI-prepared inputs; the division and integer conversion of that logarithmic
ratio run in the port. Auxiliary setup such as the ball-volume scalar and
sub-factor-base preparation is still outside this loop. These controls use
declared bounds, not a claim to have reproduced `Buchall`'s chosen bounds.

This reveals a compiler capability gap relevant to connecting the engine:
mixed exact/Float64 functions currently have JS and GMP execution but no tagged
native backend. The test explicitly asserts the capability rejection on valid
inputs; it does not count tagged execution as passing or silently substitute
another target. No timing conclusion is inferred from that missing capability.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_factor_base.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Prepared factorgen through prime-ideal admission

`ideal_admission.py` connects the numerical front through rational norm
factorization and the `divide_p_elt/id/quo` valuation logic. Supported prepared
`factorgen` calls now run from embedding matrix and element coordinates to
prime-ideal factor-base indices/exponents in one isolated native call. The
caller still prepares the field and factor base. There is no relation search,
relation-lattice update, unit recovery or class-group termination loop yet.

Status zero is upstream rejection, one upstream admission success, and two
an explicitly unported factorization path. **Status two is not rejection** and
must not let a future collector skip a candidate as though PARI rejected it.
Smooth multiword norms remain unfinished. The flat prime-group offset added to
the valuation helper permits borrowing the complete prepared table without
copying a separate group before every rational-prime dispatch.

`check_compiled_can_factor.cjs` includes the pinned `buch2.c` in its test
oracle and calls the actual static upstream functions, not a recreated control
loop. Four existing fields, all rational primes through 101, three truncation
patterns, three element/ideal/quotient modes, and six scaling exponents give:

- 216 `can_factor` controls: 78 successes, 117 rejections, 21 explicit
  unresolved factorizations;
- 144 `factorgen` controls (element and quotient modes): 26 successes,
  100 rejections, 18 explicit unresolved factorizations;
- eight rejection controls in each set preserve nonempty partial factor lists.

Six `factorgen` rejections occur at the numerical gate on valid large-coordinate
inputs and retain the incoming factor count/list. These are distinguished from
the eight partial-write rejections after entering `can_factor`. Scaling exponents
are 0, 1, 2, 3, 20 and 60; the original one-prime and numerical-front tests
remain unchanged and pass after this connection.

All supported outcomes agree with PARI, CPython, JS, GMP and tagged execution,
including counts, one-based indices, exponents and the numerical norm/error
pair. The unresolved cases are reported separately rather than compared as
successful completed outputs. Full and truncated prime-ideal tables exercise
the same admission routine; these **control factor bases are not PARI's
selected production factor bases**. This is correctness coverage across the
two rank-two degrees, not a whole-field or expensive-workload timing result.
The earlier 574 one-prime controls remain passing after the offset refactor.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_can_factor.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_can_factor.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 --factorgen
```

## Connected admission-front checkpoint

Compiler prerequisite `039a18502` supports explicit relative imports in regular
Python packages. `bench/pari-class-group-port/admission.py` now connects the
prepared matrix/embedding norm, ideal-norm division, rounding gate, `Z_ppo`
smoothness check and word-factorization stages inside **one native call**.
Numerical and factorization source remains in separate ordinary Python files,
with imported source provenance and hashes retained by the compiler. No helper
calls back through Python or JavaScript inside that native invocation.

The return includes an explicit stage, not a class-group or relation-success
flag: numerical rejection, nonsmooth rejection, unresolved factorization, or
completed *rational norm* factorization. Prime-ideal division and relation
storage remain to connect. Multiword norms stop explicitly after smoothness;
they do not enter a substituted trial-factor algorithm. Numerical rejection
retains the incoming count, matching the fact that `factorgen` has not reached
`can_factor`'s reset yet. Factor outputs here are rational primes, not indices
of prime ideals in the factor base.

The 344 connected controls use the original four prepared fields and two fixed
support products: one, and twice the largest prepared odd-prime trial product.
These supports test the stage boundary; they are **not** claimed to be PARI's
selected field factor bases. An initial all-rejection test exposed the missing
factor two in the fixture support, which was corrected before counting this as
factorization coverage. Twelve additional controls use the second integral
basis vector scaled by 1, 2 and `2^20`, with ideal norm one. The existing 160
rounding controls are retained unchanged.

Results against direct PARI numerical/smoothness/factorization stage oracles,
CPython, generated JS, GMP and tagged execution:

- 118 numerical rejections;
- 151 nonsmooth rejections;
- eight complete rational norm factorizations, spanning degrees three and four;
- three explicitly unresolved smooth multiword norms;
- 64 expected input errors: the old deliberately oversized ideal-norm controls
  round to zero and are outside `can_factor`'s nonzero-norm precondition.

The test asserts that every category occurs. It does not call a completed PARI
class-group engine, claim matching candidate discovery or qualify performance.
This is a connected dependency checkpoint, not completion of `factorgen`.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_admission.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Boundary diagnostic (not qualified performance evidence)

Follow-up compiler `1c97354a8` removes unconditional promotion at small GCDs.
With the same diagnostic inputs, tagged batched samples are now 0.05626,
0.05666, 0.05576s (previously about 0.101s); GMP stays 0.20486, 0.20339,
0.20385s. Direct PARI samples were 0.01843, 0.01831, 0.01829s. All 574 cases
and partial writes still agree. The compiler's focused GCD/shift/bit-length/
exception tests pass, including Linux ASan/UBSan signed-boundary and aliasing
checks. These remain short diagnostic samples, not a qualified slowdown ratio.

`check_compiled_divide_prime.cjs --diagnostic` compares the same 574 checked
cases, 20 fresh logical calls each, with prepared read-only inputs and reset
factor counts. Packed scratch is reused; the batch helper performs those 20
calls inside one native invocation. Three short samples on local CPU 0 gave:

| Execution | Seconds for 11,480 logical calls |
| --- | --- |
| Direct PARI C helpers | 0.01873, 0.01857, 0.01829 |
| JS, public call each | 0.7481, 0.6382, 0.6259 |
| JS, batch of 20 | 0.5348, 0.5334, 0.5396 |
| GMP, public call each | 0.4344, 0.4383, 0.4266 |
| GMP, batch of 20 | 0.2040, 0.2045, 0.2044 |
| Tagged, public call each | 0.3066, 0.3137, 0.3049 |
| Tagged, batch of 20 | 0.1009, 0.1009, 0.1004 |

These are diagnostic observations: short/nonalternating samples, diagnostic
PARI build, no matched plain-C GMP control, and no expensive full-field path.
They **do not** qualify the plan's performance threshold. They do demonstrate
that removing most host crossings does not remove the entire observed gap.
Generated core size for the batch version was 1,578,760 bytes. A temporary
machine-sized-degree annotation control gave approximately 0.185s GMP/0.096s
tagged batched and a larger core (1,630,782 bytes); it was not retained on this
limited evidence.

The small-GCD promotion issue identified by this diagnostic is fixed above.
Packed large-value reads/writes still import/export GMP limbs. Tagged storage
already has a direct small-integer path, so conversion
cannot be assumed to explain the entire small-case gap. Profile or isolate
these costs before attributing them to the language or changing mathematics.

## Word-factorization front checkpoint

`bench/pari-class-group-port/factorization.py` translates the initial
`ifactor1.c:factoru_sign` stages: stripping powers of two, prepared prime-table
membership, the exact `tridiv_boundu` cutoffs, product-GCD extraction with a
recursive fast-disabled call, and ordinary `u_lvalrem_stop` trial steps.
The prepared prime catalog and cumulative products are input-independent
arithmetic constants obtained from the pinned PARI build, not supplied input
factorizations. Binary search, scalar power-of-two stripping, and the corrected
rounded square-root leaf are explicitly substituted arithmetic implementations;
this is not evidence of matching arithmetic-leaf performance.

The checkpoint returns `(count, unresolved_cofactor)`. A residual other than
one means **incomplete**, not a prime or an accepted relation. It stops before
the second prime-iterator pass, generation beyond the prepared catalog,
and later factor-search paths. Multiword factorization also remains
unported. It is not yet connected to `can_factor`.

`check_compiled_factor_front.cjs` checks 138 inputs with both fast settings,
including prime powers around trial boundaries and an existing output prefix.
All 276 cases agree across CPython, generated JS, GMP and tagged execution:
274 complete factorizations agree with PARI `factoru`; two retain explicitly
unresolved cofactors. Every extracted prime/exponent is checked against PARI,
and extracted powers times residual reconstruct the original input. The test
does not claim upstream intermediate-trace equality or performance qualification.
The CPython oracle preloads the standard `decimal` module before adding the
Sage.js source path (which contains its own `decimal` module); a bounded 100,000
decimal-digit conversion allowance applies only to this test's prepared prime
products. No native arithmetic safety limit is raised.

The connected word primality decisions retain `prime.c:_uisprime`'s three
Miller–Rabin threshold/base sets and its larger-word base-two/Lucas branch.
The port follows `get_disc`, `u_LucasMod_pre`, `uislucaspsp_pre`, and
`arith1.c:krouu_s`, including the 65th discriminant attempt's square check,
the `2^64-1` rejection, and the Lucas sequence's ordered updates. The caller
passes actual `maxprimelim`, preserving its distinction from the final stored
prime. The prime-673 shortcut and terminal `oldi != i` check are now connected
to factorization. A complete factor result still does not mean the remaining
factor-search algorithms are implemented.

`check_compiled_word_prime.cjs` checks 616 ordinary/no-small-prime decisions
against actual PARI `uisprime`/`uisprime_661`, CPython, JS, GMP and tagged
execution. Inputs cover all threshold neighborhoods, strong pseudoprimes,
large squares, unsigned-word boundaries and 128 deterministic extra odd words.
Another 259 direct Lucas controls exercise this branch even when the preceding
Miller–Rabin test would reject, including the discriminant square escape.
The no-small-prime entry is tested only with its upstream precondition.
The modular-power leaf currently uses exact binary powering, and modular
products use exact multiply/remainder rather than PARI's precomputed word
reduction. These declared leaf substitutions prevent a language-only timing
claim; no such performance claim is made here.

Two additional compiler restrictions were encountered without requiring a
compiler change in this checkpoint: exact-integer bitwise AND is unsupported
(the same bit predicates are expressed using small remainders), and `break`
inside a range loop is unsupported (the prime iterator uses a while loop).

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_factor_front.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_word_prime.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Prime-group admission loop checkpoint

`pari_prepared_divide_prime` connects the element and HNF valuations through
`buch2.c:divide_p_elt`, `divide_p_id` and `divide_p_quo`. It retains prime order,
one-based factor indices, early success when the remaining norm valuation is
zero, and partially appended factor entries on failure. The quotient branch
retains the upstream zero-element-valuation skip before calling idealval.

574 controls match the **actual static upstream helpers**, compiled into an
untimed driver by including the pinned local `buch2.c`; the oracle does not
reimplement their admission loops. It exercises complete and truncated prime
groups, three modes, and an existing factor entry before appending. CPython,
generated JS, GMP and tagged outputs agree, including failure-side writes.
The prepared group and norm's rational-prime valuation remain supplied inputs.

Integer factorization is still a dependency: `absZ_factor` enters PARI's
word/multiword factoring systems, including fast product-GCD trial division,
primality tests and subsequent factor algorithms. Sage.js's existing FLINT
integer-factorization entry is a host callback, not a declared isolated-core
call. Neither opaque host factorization nor trial division is silently inserted
into this path. This checkpoint does not complete `can_factor` or `factorgen`.

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_divide_prime.cjs <pari-2.17.4-source>
```

## Integral-HNF ideal valuation checkpoint

`pari_prepared_hnf_valuation` now follows `idealval`'s integral matrix branch:
remove content, handle inert primes, compute Zval/Nval bounds, and execute
`idealHNF_val` with per-column primitive parts and shrinking prime-power
moduli. Signed remainders follow PARI's truncation convention rather than
Python's nonnegative remainder. The caller supplies disjoint packed scratch.
Scalar p-valuations currently use repeated division and initial prime powers
use repeated multiplication; these are explicit arithmetic-cost differences,
not evidence of language-only overhead.

406 HNF controls agree with PARI in CPython, JS, GMP and tagged execution. They
include powers through exponent 257, multiplication by another prime above the
same rational prime, and scalar content. The 406 element-valuation controls
remain green. Nonintegral ideal conversion and the other `idealtyp` dispatch
branches remain outside this entry, and prime decomposition is still supplied
by PARI preparation. No full relation or class-group computation is claimed.

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_valuation.cjs <pari-2.17.4-source> --hnf
```

## Prepared prime-ideal valuation checkpoint

`valuation.py` translates `base3.c:ZC_nfval`'s no-remainder path from prepared
`pr_get_tau` multiplication matrices, including inert primes, ordered exact
row products, periodic rational-prime stripping and ramification weighting.
`gen_pvalrem_DC` uses an explicit caller-owned stack with the same descending
division/squaring and unwinding order, rather than recursive allocations.
This does not compute prime decompositions or ideal valuations of general
nonprincipal ideals; those remain preparation/dependency boundaries.

406 controls use prime ideals over 2,3,5,7,11,13,17,19 in the same four tuning
fields and candidate scales through `p**257`. They include inert and ramified
primes, signed and zero coordinates, and high-valuation stripping. Results
match direct PARI `ZC_nfval` in CPython, generated JS, GMP and tagged execution.
Scratch is explicit disjoint packed storage (64 words per slot, 32 stack slots
in this control); the default 8-word scratch capacity correctly rejected the
larger cases. No internal limit was relaxed.

The `p=2` scalar valuation leaf currently uses exact repeated halving instead
of PARI's trailing-zero primitive. This is a declared representation/cost gap,
not equivalent instruction counts or a compiler-only slowdown claim. None of
these controls is a timed full relation-collection or class-group computation.

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_valuation.cjs <pari-2.17.4-source>
```

## Smoothness precheck checkpoint

Compiler prerequisite `62cdc3d74` adds explicitly imported two-argument
`math.gcd` lowering to the isolated GMP core, with exact JS fallback and guarded
tagged resumption. This enables direct translation of `base4.c:Z_ppo` and
`can_factor`'s initial smoothness gate. The port preserves the progressively
shrinking GCD operand and exact-division sequence. GMP GCD is an arithmetic
backend substitution; its cost must be separated from compiler overhead.

168 signed inputs, including prime powers above 1000 bits and nonsmooth
cofactors, agree with direct PARI `Z_ppo` in CPython, JS, GMP and tagged
execution. Zero norm and nonpositive factor products are explicitly outside
the prime-to-part entry's contract; upstream can_factor assumes nonzero norm.
This smoothness precheck remains separate from the connected numerical entry
at this checkpoint. Integer factorization and prime-ideal valuations are next;
passing the precheck alone is not relation admission.

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_smoothness.cjs <pari-2.17.4-source>
```

## Connected numerical gate checkpoint

`pari_prepared_factorgen_numerical` now connects the prepared embedding matrix,
integer coordinates, embedding norm, optional ideal-norm division and `grndtoi`
through `factorgen`'s `e > -32` rejection in one source-transparent native call.
The rounding function moved into the same compilation unit rather than keeping
duplicate bodies. Both small and large `divri` routes are translated; the large
route preserves divisor truncation and PARI's leading-word remainder comparison,
not a substitute correctly-rounded quotient.

The 32 existing matrix/vector controls are each exercised with absent NI, NI=1,
3, `2**63`, and `2**160+7`: 160 cases agree in CPython, generated JS, forced GMP
and tagged execution, including intermediate embedding rows. There are 101
numerical passes and 59 rejections. These NI values are synthetic arithmetic
controls, not a claim that each is the norm of an ideal containing its candidate.
A pass means proceed to `can_factor`, **not** accepted relation or certification.
The arithmetic control additionally checks 3,496 operations, including 1,824
divisions with seeded multiword divisors longer than the real mantissa.

Reproduce the connected check:

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_gate.cjs <pari-2.17.4-source>
```

Remaining boundaries: smoothness/factorization, prime-ideal valuations, relation
state and collection, unit/regulator work, linear algebra, and stopping. This
is still an untimed prototype, not an expensive connected-segment qualification
or an independent class-group implementation. The earlier small-divisor-only
restriction below is superseded at the general entry; the private word helper
still rejects that separate route. No production behavior changes.

Validation after this connection: 75 original rounding controls, 3,496 arithmetic
controls and 160 connected gates pass after formatting. The full build completed
in 7m23s, explicitly skipping unavailable optional FLINT production kernels and
Wasm numerical reactors. `test:changed` did not finish its later suites: its
audit saw a concurrently removed tracked rounding file. Rerunning architecture
checks after the deletion was committed passes native/FFI/Wasm ownership checks
and stops at the same pre-existing stale optimizer manifest. This is not an
all-suite green receipt or Windows/Wasm execution qualification.

## Ideal-norm division checkpoint

The prepared-real prototype now translates `divri`'s small-integer route
through `src/kernel/none/mp_indep.c:divru`. It preserves stored zero exponents,
power-of-two shifts, guard-bit rounding, and divisor sign. The entry explicitly
rejects zero and divisors with magnitude at least `2**63`: GMP PARI's
`is_bigint` includes a one-limb integer with its high bit set, not just
multiword integers. A seeded differential case caught this dispatch distinction
(a one-bit quotient discrepancy) before restricting the entry accordingly.
The `divri_with_gmp` route is still missing, not silently approximated.

The integer/real control now checks 2,328 operations, including 656 divisions,
against PARI 2.17.4 in CPython, generated JS, forced GMP and tagged execution.
The additional deterministic cases cover 64–512-bit mantissas and signed
divisors. Explicit unsupported-divisor errors are checked separately.
Full-integer division replaces PARI's word loop in this prototype; no
language-only performance inference follows from these untimed checks.
Division still needs joining to the matrix/norm and rounding entry, followed
by smoothness and ideal valuation work. No class-group completion is claimed.

Checkpoint validation: arithmetic controls and the 32 connected matrix/norm
controls pass after compiler convergence; strict Python passes all 403 modules,
formatting is current, and parallel ownership checks pass. Architecture checks
stop at the already-recorded stale optimizer opportunity manifest, not a new
native-boundary violation. A test launched during compiler regeneration failed
on an incomplete generated AST interface; rerunning after convergence passes.

## Current connected boundary: prepared matrix to norm

The prototype now computes `RgM_RgC_mul` real/imaginary component rows and
`embed_norm` inside one source-transparent native call. PARI supplies only the
prepared `nf_M` matrix and the oracle outputs for these tests, not intermediate
matrix products at execution time. The 32 previously used candidate vectors
across two real cubics and two mixed quartics agree in CPython, generated JS,
forced GMP and tagged execution, including every intermediate embedding's
mantissa, precision/type and exponent as well as the final norm.

This removes one scaffolding boundary, not the class-group engine dependency.
The next missing `factorgen` stages are ideal-norm division, connecting the
existing rounding block, smoothness testing/factorization, and ideal valuations.
No timing or expensive-segment qualification is claimed for these small norm
checks. Final-reserve fields remain unused.

Additional differential checks cover 1,344 signed-addition/cancellation pairs,
648 integer/real operations (including zero and unsigned-word boundary values),
and 162 component rows including coordinate unit vectors. Exact integer entries
use precision tag -1 in this narrow prepared interchange. Generic multiplication
by exact zero returns integer zero, unlike direct `mulir(0, real)`; preserving
that distinction is necessary to reproduce precision decisions. The row loop
retains the upstream exact-integer-zero matrix-entry guard and operation order.

Remaining prototype restrictions are explicit failures: multiword coordinate
integers, larger arithmetic branches, and integer-only components at the norm
entry. Unit-vector rows are tested, but the 32 matrix-to-norm controls retain
the original eight nonscalar vectors per field. This is not a claim of complete
coverage for arbitrary prepared matrices or all candidates.

Reproduce with the existing diagnostic prefix in `SAGEJS_FLINT_PREFIX`:

```text
node bench/pari-class-group-port/check_compiled_matrix.cjs <pari-source>
node bench/pari-class-group-port/check_compiled_matrix.cjs <pari-source> --matrix-norm
node bench/pari-class-group-port/check_compiled_integer_real.cjs <pari-source>
node bench/pari-class-group-port/check_short_product.cjs <pari-source> <prefix> --signed-addition
```

Earlier checkpoints below are historical where their scaffolding frontier differs.

Status: ownership approved; mixed-buffer prerequisite integrated experimentally.
The user subsequently approved additional reasonably justified compiler changes
on this experimental branch. The original one-correction count is superseded;
the experiment's time/compute budgets and faithful-work criteria are unchanged.
Prepared scalar/array ingress and independent loop counts are integrated at
`a306e2974`; later historical
references to awaiting permission or rejecting scalar inputs are resolved.
The uniform MPFR ingress remains insufficient; a separate prepared-mantissa
prototype now preserves heterogeneous precision for the all-real norm loop.

### Short-product and real-norm checkpoint

The extended multiplication control has 228 operand pairs. Two constructed
64-by-192-bit near-midpoint products disagree with both MPFR nearest-even and
nearest-away: PARI's shortened product omits low-word carries. Rounded integers
agree, but `grndtoi` reports error exponent **-32 in PARI and -31 in MPFR**.
Thus substituting correctly rounded MPFR arithmetic can change the `factorgen`
error gate, not just insignificant printed digits. These are synthetic boundary
cases, not observed failures in the frozen fields. They are not claims that
PARI's documented arithmetic accuracy or class-group results are incorrect.

`short_product.py` translates the short-product word sum and final rounding
into ordinary Python integers, deliberately discarding each omitted low half
before summation. It matches all 228 cases in CPython, generated JS and forced
native execution, including full result mantissa, precision and exponent.
The supported prototype has 64-bit words and at most 2,048 input bits. A
separate square wrapper uses the common short word sum only through 512 bits,
below the pinned square crossover; larger squares and the upstream
large-product crossover remain unsupported.

The same file's all-real `embed_norm` product loop now runs with resident
integer buffers and source-transparent helper calls. Sixteen prepared vectors
from the two already-used tuning real cubics match PARI in CPython, generated
JS, forced GMP and tagged execution. PARI still supplies the embedding
matrix-vector product. Sixteen mixed-quartic prepared vectors also match,
using the translated positive-addition precision policy and bounded square
wrapper. No matrix multiplication, factorization, ideal valuation, or
class-group stopping path is claimed here.

This is a representation prototype: Python/GMP integers express PARI's word
products and carries. Their cost is not PARI's machine-word cost. Before a
language-performance conclusion it needs a same-representation control and
measurement; no speedup or parity is claimed. It is not a generic GEN runtime,
a replacement arithmetic library, or a production default.

The separate positive-addition MPFR control compares 16 squared-embedding pairs
and 1,197 exponent/precision boundary pairs. With PARI supplying the output
precision as scaffolding, MPFR truncation matches all; nearest-even matches
only 9/16 and 475/1,197. The Python prototype now implements the nonnegative
precision decision itself and matches all 1,213 pairs plus 16 stored-zero
precision cases in CPython, generated JS and native execution. Signed
subtraction/cancellation is not implemented.

Reproduce with `SAGEJS_FLINT_PREFIX` set to the existing diagnostic prefix:
`node bench/pari-class-group-port/check_short_product.cjs <pari-source> <prefix>`
and `node bench/pari-class-group-port/check_short_norm.cjs <pari-source> <prefix>`.
Both accept an optional compiler-worktree argument for prerequisite testing.
Add `--addition` to the first command for positive sums and `--mixed` to the
second for mixed norms. These remain untimed component checks.

### Compiled rounding checkpoint

The prerequisite through `84218a22d` adds exact `int.bit_length()` and checked
integer shifts. The attributed `rounding.py` block is now `@native` compiled;
75 prepared PARI real values agree in CPython, generated JS, public dispatch,
and forced native execution, including the integer result and error exponent.
Run `check_compiled_rounding.cjs <pari-2.17.4-source>` in this directory's
benchmark folder (or supply its full relative path from the worktree root).
The checker obtains oracle values by calling PARI `grndtoi`; it does not use
the translated formula as its expected result. All runs are untimed.

Left-shift allocation is explicitly limited to 1,048,576 result bits by the
experimental native backend. Exceeding the cap fails, never truncates. These
inputs fit comfortably. An expression-level conditional was written as an
ordinary `if/else` because that exact-integer lowering does not support the
conditional expression; the rounding branches and operations are unchanged.
This is only a rounding block, not the norm computation or a class-group result.

### First actual embedding-norm ingress finding

The uniform-precision borrowed-array API is implemented and tested, but it is
not sufficient for PARI's actual prepared embeddings. `embedding_norm.py`
expresses the real-only and mixed nonempty product blocks, with separate loop
counts and no inserted multiply-by-one. The untimed `check_embedding_norm.cjs`
uses PARI's prepared matrix-vector product as input scaffolding and compares
against `embed_norm`. It currently **fails before norm arithmetic**, intentionally
refusing precision coercion:

```text
field=0 candidate=1 first_bits=256
nonuniform prepared precision: input=320 target=256
```

Field zero is the frozen tuning polynomial `x^3-20018*x+20034`; candidate one
has integral-basis coordinates `[1,-3,3]`. `nfinit` was requested at 192 bits.
The first attempted fixed-192-bit ingress had already rejected a 256-bit entry.
The follow-up preserved the first entry's precision and exposed the 320-bit
entry. No input was rounded to make the comparison pass. The fourth field was
changed from an initially drafted synthetic control to the second frozen
quartic; execution never reached that field in either attempt.

Reproduce with the integrated compiler:

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_embedding_norm.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

This is a failing capability diagnostic, not a norm or performance result.
Per-entry precision and arithmetic result-precision rules are the next required
representation/lowering work. Uniformizing all entries to the requested field
precision or the maximum observed precision is not assumed equivalent to PARI.

### Per-operation arithmetic control

`check_multiply_precision.py` exports operands without rounding and compares
PARI `mulrr` with direct MPFR multiplication at the shorter operand precision.
For the first two real embeddings of eight candidates on each of the four
declared tuning fields, all **32 products** match exactly, including their
subsequent rounded integer and error exponent. Input precision patterns are
`(256,320)` and `(320,256)`, both producing 256-bit PARI results.

Two constructed signed halfway products at 64 bits disagree with MPFR's default
nearest-even mode. MPFR's `mpfr_round_nearest_away` control matches both, as well
as all 32 prepared pairs. This supports a concrete arithmetic mapping, not a
claim that every PARI real operation is now covered. Pinned `mulrr` chooses the
shorter precision; its guard-bit rounding increments magnitude at a tie.
`addrr_sign` additionally has exponent-alignment, word-extension, cancellation
and zero-exponent branches. A generic minimum-precision policy for all operators
is therefore not justified by the multiplication result.

Run the untimed control with:

```sh
python3 bench/pari-class-group-port/check_multiply_precision.py \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /home/user/sagejs/packages/flint/.native/prefix
```

The initial diagnostic incorrectly used PARI's unsigned decimal `strtoi` on
negative strings exported by GMP. Explicit sign handling fixed the bridge;
the same bridge fix was applied to the norm diagnostic. Those initial mismatches
were not arithmetic evidence. The control now includes both signed tie cases.
No class-group result, norm-chain equivalence or performance follows from these
34 primitive comparisons alone.

### Rounding contract identified before implementation

Pinned `gen3.c:round_i` (line 2429) computes `floor(x + 1/2)`, not
ties-to-even or ties-away-from-zero. Given the full signed mantissa `m` and
its denominator exponent `e` (`x = m / 2^e`), an integral value with `e <= 0`
returns error exponent `-e`. For `e > 0`, an exact represented integer returns
`-e`, while a half-integer returns `-1`. Nonzero residuals use their binary
exponent minus `e`. Thus simply measuring an MPFR subtraction from the rounded
integer loses a precision-dependent case, and normalizing away trailing zero
mantissa bits is not interchangeable with PARI's stored precision.

`grndtoi` (line 2544) additionally handles zero and values of exponent below
`-1` directly using the stored real exponent. `factorgen` rejects an error
exponent greater than `-32`. The planned interchange must therefore preserve
precision and the zero exponent as well as numerical value. These source
observations define tests to implement, not a completed rounding primitive.

`bench/pari-class-group-port/rounding.py` now directly translates this prepared
real rounding branch in ordinary Python. `check_rounding.py` compares its
integer and error exponent to the pinned library's `grndtoi`, exporting actual
mantissas with `mantissa_real`. All 75 cases agree (25 values at three requested
decimal precisions): signed ties, exact integers, small exponents, and values
around the `-32` rejection boundary. Run:

```sh
python3 bench/pari-class-group-port/check_rounding.py \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

This is an untimed Python differential, not native rounding qualification or
an embedding-norm implementation. The driver uses the existing instrumented
library only as an oracle, never as a timed comparator. Its initial setup
failed because `setrealprecision` requires a non-null output pointer; the
driver was corrected without changing the translated rounding algorithm.
No class-group or performance result is claimed. Earlier obstruction evidence
below is retained as history, not the current ownership state.

## Ownership takeover checkpoint

The user approved takeover of `mixed-exact-float-sidecar`. Its original changes
were preserved, integrated with this experiment's base, and reviewed for index
conversion, float operators, and Python assignment evaluation order. Prerequisite
draft PR #283 is integrated here at `7fac97ebf`; this experiment remains draft.

The actual enumeration scaffold now runs in CPython, generated JS and native
code with matching candidate order on 24 synthetic cases (184 vectors). Run
`SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix node test/pari-class-group-port.cjs`.
This uses an explicitly identified existing diagnostic prefix, not a new
matched performance baseline. The prototype admits exact-double integer
coordinates only through ±2^53 and declines larger ones; this narrower
representation envelope is not PARI's full machine-integer range.

Compiler qualification still has visible gaps: standalone Wasm SDK absent,
full build blocked by optional FFLAS installation, and generated optimizer
manifest awaiting integration review. Strict Python and focused compiler tests
pass. None of these checks establishes a complete class-group port.

Next: extend the upstream small-relation trace through candidate/admission
state, and extend the connected segment through norm/factorization and relation
admission. Prepared-field and full-path timings remain unmeasured. The original
scope and acceptance criteria are unchanged.

This executes `agents/pari-class-group-language-experiment.md` with the user's
explicit override to **PARI 2.17.4**. The old release identifiers in that plan
are historical and do not govern this experiment. Mathematical choices remain
**upstream-assumed**; this work changes no production default or proof state.

## Reproducible source identity

- Sage.js base: `938ccd425f0a322bafb1375968d5e24b38d5cde5`.
- Official archive: <https://pari.math.u-bordeaux.fr/pub/pari/unix/pari-2.17.4.tar.gz>.
- Archive SHA-256: `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
- `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
- Source archive downloaded and both hashes checked on 2026-09-13.
- Upstream attribution: PARI group, `buch2.c` copyright 2000, GPL version 2
  or later. Translated files must retain that attribution and license notice.

## Resource ledger

At the QR checkpoint, goal accounting reported 25,247 root active seconds
(7.01 hours), plus the previously recorded 12 panel-agent minutes. The
post-division combined square-root/QR/division validation used 6.515 wall
seconds, 7.371 user plus 0.789 system child CPU seconds and peak child RSS
361,116 KiB, recorded through `resource.getrusage(RUSAGE_CHILDREN)`. Charge
all 8.160 CPU seconds, including the oracle builds. This is not a reconstructed
cumulative CPU ledger: earlier unmetered diagnostic attempts remain explicitly
unaccounted. No near-budget execution may assume those costs were zero.

Execution began at approximately 2026-09-13 21:32 UTC. Limits remain 16 aggregate
active-agent hours, six aggregate execution CPU-hours, 256 MiB archived evidence,
600 seconds and 4 GiB per field. At most two agents run concurrently. The panel
agent performs selection only. Builds are local, not on the M0 timing host;
no reservation or action on `opt` is authorized by this experiment.

This initial checkpoint used approximately 11 root active minutes plus 12 panel
agent minutes, well below either audit/selection timebox. No benchmark CPU
budget was spent; checks and the single PARI smoke were small diagnostic runs.
Compilation is excluded from the execution CPU budget, not from active time.

At the matrix-to-norm checkpoint, active goal accounting reports 8,598 root
seconds (2.39 hours), in addition to the initially recorded 12 panel-agent
minutes. This phase used no subagents and no timing VM. The two-hour coverage
checkpoint is therefore: enumeration prefixes, bounded real arithmetic, and
prepared-matrix-to-norm controls execute; the class-group path and performance
comparison remain incomplete. Earlier diagnostic CPU usage was not collected
as a precise cumulative receipt; subsequent validation records process CPU and
peak RSS explicitly. No near-budget execution is authorized based on an
unmeasured remainder.

The post-format matrix checkpoint validation (rows, matrix-to-norm, integer/real
arithmetic, signed addition, rounding, and enumeration checks) passed in 13.569
wall seconds, using 13.351 user plus 1.872 system CPU seconds and peak child RSS
217,664 KiB. Python `resource.getrusage(RUSAGE_CHILDREN)` recorded these totals;
`/usr/bin/time` is absent on this host. Charge all 15.223 CPU seconds
conservatively, including any compilation in the run. These are validation
resource figures, not arithmetic or class-group performance measurements.

## Initial full-path dependency frontier

All source locations below refer to the pinned `src/basemath/buch2.c`.
These are audit findings, not claims of translated coverage.

| Entry / stage | Source | State and dependencies to preserve |
| --- | --- | --- |
| Public dispatch | `bnfinit0`, 3468; `Buchall_param`, 3729 | Prepared `nf`, requested flag/precision; flag zero still requires unit work. |
| Bounds and analytic estimate | `Buchall_param`, 3772–3841 | Roots of unity, automorphisms, cached prime decomposition, `GRHchk`, inverse residue and precision. |
| Factor base / retries | `FBgen`, `subFBgen`, driver `START` | Ordered prime ideals, permutations, subfactor bases, saved relations, changing bounds. |
| Small relations | `small_norm`, 2574; `Fincke_Pohst_ideal`, 2448 | Ideal products; rounded-embedding integer LLL; arbitrary-precision QR; binary64 enumeration; norm rounding; prime-ideal valuations; relation admission. |
| Random relations | `get_random_ideal`, 2631; `rnd_rel` | PARI RNG draw schedule, subfactor-base products and reductions; same relation cache. |
| Coupled linear algebra | driver, 3994 onward | `hnfspec_i` / `hnfadd_i`, exact relation matrices, floating embeddings and transformation history. |
| Regulator / stopping | driver, 4090 onward | `compute_multiple_of_R`, `compute_R`, precision restart and new relations, optional `be_honest`. |
| Final output | driver, 4140 onward | Unit lattice reduction, `getfu`, archimedean cleanup, `class_group_gen`, complete `buchall_end` state. |

The existing exact cubic certification program is not a faithful replacement
for this path: it uses different norm, analytic, and termination policies.
Likewise, replacing PARI's rounded embedding norm in `factorgen` by an exact
determinant would change the work and possibly relation acceptance. Such a
replacement cannot silently be called language-only overhead.

The candidate first connected segment is small-ideal relation discovery,
including enumeration and admission, with any unavailable preparation or
valuation dependencies explicitly separated. Its exact entry/exit boundary
and measured cost still need to be established; an enumeration helper alone
does not fulfill the substantial-segment checkpoint.

## Concrete compiler obstruction and ownership boundary

`bench/pari-class-group-port/mixed_buffer_probe.py` reduces the failure to a
single floating-buffer comparison followed by a signed-buffer read. Calling
`lowerSource` on current base produces:

```text
native indexing currently requires a local constant sequence
```

`tools/native-kernel/float64-ir.cjs:isFloat64Signature` admits only a Float64
return and Float64/uint64/Float64Buffer parameters. A signature containing
Int64Buffer is routed to `lowerIntegerFunction`, which does not lower this
Float64Buffer indexing. The same error occurs on the actual enumeration
prototype. This is a demonstrated language capability gap, not a speed result.

The existing worktree `/home/user/sagejs-worktrees/mixed-exact-float-sidecar`
has an **active native-compiler contract and uncommitted edits** to exactly
these lowering/backends/runtime files. Its recorded architecture/native gates
fail. We inspected that state read-only; none of its edits were copied, changed,
committed or assumed correct. Taking over that prerequisite requires an explicit
ownership decision. Creating another overlapping compiler implementation would
violate the parallel-development contract.

A read-only follow-up ran the new probe through that unfinished worktree's
existing `lowerSource`: the minimal mixed-buffer probe lowers successfully,
but the enumeration prototype stops at its `ValueError` guard (`native raise
currently supports ZeroDivisionError`). This confirms that the proposed work
addresses the first obstruction, but its older compiler is not a drop-in
replacement for the current base. No code was copied or guards removed, and
successful IR lowering alone does not validate generated native execution.

Encoding integer state as doubles is not adopted as a workaround: it changes
the admitted integer range and still leaves conversion/helper-call dependencies.
Calling the interpreter inside the native search is prohibited. Replacing the
search by the existing certified cubic algorithm changes the experiment.

## Initial executable evidence (before prerequisite integration)

- Unmodified official PARI source builds locally with GCC 15.2.0, GMP 6.3.0,
  single-thread engine, `-O3 -Wall -fno-strict-aliasing`, no readline or graphics.
- `gp -fq` reports `[2,17,4]`; `bnfinit(nfinit(x^3-3*x+1),0)` returns class
  number 1 and empty invariant factors. This is a smoke test, not timing evidence.
- Local comparator `gp-dyn` SHA-256:
  `5ccd82c860757ecdfaa26c3bd75fbba1a5d17d580388e2ed9a993c67a1b1891e`;
  linked `libpari-gmp.so.2.17.4` SHA-256:
  `e0c227a09f01827f58917f2c8f48947792876ef5234e48920a558b17110e4ab6`.
- `bench/pari-class-group-port/enumeration.py` is an attributed ordinary-Python
  translation of `step` and the inner enumeration block only. It retains the
  one-million trial limit and upstream ordering; an explicit resumable boundary
  replaces the outer candidate processing. This is scaffolding, **not** a
  completed expensive connected segment.
- `node test/pari-class-group-port.cjs` checks 24 CPython lattice enumerations
  against exhaustive finite sets (184 vectors) and reproduces both compiler
  failures. These tests do not establish agreement with a PARI execution trace,
  JS/native correctness, class invariants or regulator correctness.
- The frozen 24-field development panel meets all requested historical strata;
  see `bench/pari-class-group-port/panel-notes.md`. It is not a new baseline.
- Root build passes in 7m21s, with absent optional native adapters/production
  pack and unprepared numerical Wasm reactors explicitly skipped. Formatting,
  parallel scope and architecture gates pass; strict Python passes 403 existing
  modules. The new bench prototype is not a migrated production module.
- `pnpm test:changed -- --base 938ccd425` passes merge invariants, then stops
  in `test/algebraic-geometry.cjs` because the optional generated
  `sagejs_flint.node` addon is absent. Remaining selected docs/CLI tests were
  not reached. Full native qualification has not run; the lowering failure
  itself must be resolved first. These limitations keep the PR draft.

At that initial checkpoint there were no paired measurements or generated core for this prototype,
and no experiment claim against the 2x target. Dependencies such as rounded
archimedean norm, prime-ideal valuations, rank admission and unit recovery remain
untranslated. The next investment is to finish/integrate the mixed-buffer
compiler prerequisite, then resume the connected small-relation path; this
checkpoint is explicitly inconclusive about whole-engine parity.

## Upstream enumeration trace checkpoint

The translated enumeration now matches native PARI 2.17.4 candidate prefixes
and trial counters on four predeclared tuning fields, in both generated JS and
compiled native execution. This does **not** test primitive/scalar rejection,
relation admission, stopping equivalence, or class-group output from Sage.js.

| Tuning field ID prefix | Enumeration calls | Comparisons, both backends | PARI output |
| --- | ---: | ---: | --- |
| `0e970fdb` | 16 | 2,558 | `1 []` |
| `dec56e7e` | 12 | 1,766 | `3 [3]` |
| `0857fab7` | 44 | 11,920 | `1 []` |
| `98479377` | 301 | 112,738 | `4 [2, 2]` |

There are 64,491 recorded vectors checked against each backend, not 128,982
independent vectors. Records are limited to the first 200 trial counts per
enumeration call. No final-reserve field was opened. Each GP invocation has a
30-second timeout and 4 MiB output cap. These diagnostic runs are not timings.

Apply `bench/pari-class-group-port/pari-trace.patch` to the pinned pristine
archive, rebuild GP, then run:

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_pari_trace.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4/gp
```

The patch activates only under `SAGEJS_TRACE_FP`; the runner sets it. The
instrumented binary must not serve as an unmodified timing comparator, even
with the environment flag unset. The source/build directory used for the
initial smoke has now been instrumented: its current `buch2.c` SHA-256 is
`d8b09a54e51399c83f2faa92ccc3f1f70f41d660b1cb279738bc207ff553f87a`,
and its `libpari-gmp.so.2.17.4` SHA-256 is
`c1a41ed3a65f65762bd9ee718397b439592185c3f1d3f52fb9d19f8bb980064a`.
The earlier binary hashes above describe the earlier unmodified build only.

Parsed-trace SHA-256 values, in table order:

```text
3bbddcb2fc4241c8066b319fee7c006258a5f96a487f14ef1644f06affde40a1
8dcf442b9a4f0895e67843e86f24f092625e4926736b76c30e055ee5b299da96
24eb70f035e1eb439356a5b3e55db1baba24c6cfc01af25d3e952e07f79f372f
c9bf7233c137a9275dcf2951a86a7017efa823124adea937fe79084a12ef1fde
```

Diagnostic failures retained: initial parsing lost records when other PARI
diagnostics lacked a terminating newline; parsing now locates the explicit
marker. Enabling all BNF debug output exceeded the unchanged 4 MiB cap on the
first quartic, so the patch uses a dedicated flag instead. PARI's real-number
formatter can separate an exponent with whitespace (`2.04 e-38`); the parser
now consumes the complete real value, with a focused regression assertion.
Neither apparent ordering mismatch required changing the translated algorithm.

## Next boundary: prepared arbitrary-precision embeddings

`prepared_real_probe.py` demonstrates a second capability gap, distinct from
mixed binary64/integer workspaces. Lowering a function that multiplies two
supplied `RealNumber` arguments fails with:

```text
native kernel: unsupported native argument type RealNumber
```

The legacy field lowering in `tools/native-kernel/ir.cjs` accepts parent fields,
integers and unsigned iteration counts, but not prepared real/complex values
as arguments. It has scalar MPFR/MPC arithmetic for values constructed inside
the kernel; that is not resident access to a prepared embedding matrix.
The four current FFI declarations (FLINT, M4RI, igraph, FFLAS) provide no
MPFR/MPC owned resource alternative. This is evidence about current interfaces,
not a claim that implementing the capability is impossible or slow.

The next upstream operation needing it is `factorgen` (`buch2.c`): multiply
the prepared embedding matrix by the exact candidate coordinates, compute
`embed_norm` (`base1.c`), divide by the ideal norm when supplied, and apply
`grndtoi` with its `e > -32` rejection. `embed_norm` multiplies real embeddings
in order and multiplies squared complex absolute values separately before
combining them. PARI's precision and rounding behavior must be investigated
and preserved at the relevant acceptance branches; merely choosing MPFR's
default rounding is not an equivalence argument.

Potential exits have different meanings:

- Add resident arbitrary-precision scalar/container ingress and the required
  rounding operations: a second compiler/runtime or representation capability,
  needing explicit reassessment of the one-correction budget and ownership.
- Let PARI supply norm/factorization/admission outputs at an outer boundary:
  permitted diagnostic scaffolding, but not a translated connected discovery
  segment or evidence for whole-engine speed.
- Replace the norm by binary64 or exact determinants: different arithmetic and
  potentially different accepted relations; excluded from a language-only claim.

The existing one general correction is the mixed integer/binary64 workspace
support. No second correction has been started. The experiment remains
incomplete and inconclusive about whole-engine parity. The minimal probe and
its rejection are now regression-tested; no production API or proof state is
changed.
