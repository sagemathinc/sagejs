# Prepared `h=1` root boundary audit

## Result

The tree has an honest timed **candidate** root, but it does not yet have an
honest timed **final class-and-unit result** root.

The nearest executable root is
`pari_resident_generated_class_attempt` in
[`resident_generated_class_attempt.py`](resident_generated_class_attempt.py).
It is already a single source-transparent native entry. Starting from a neutral
prepared maximal-order state plus empty caller-owned storage, it derives the
prime-degree catalog, factor base, Kummer descriptors, selected prime ideals,
relations, relation HNF, analytic inverse `hR`, regulator acceptance, and the
class candidate. For `x^3-20018*x+20034` it reaches the authentic 73-relation,
class-number-one candidate.

The root itself and its entire native dependency closure perform no file I/O.
The lowered closure at integration commit `176ee7b8b` has:

- 357 source-transparent native functions;
- 711 directed call edges;
- 131 Python source modules; and
- one 351-parameter prepared/storage ABI (275 arbitrary-precision buffers, 44
  signed machine-word buffers, 23 floating buffers, and nine integer scalars).

`check_prepared_h1_root.cjs` lowers that graph, checks every count, verifies
representative paths through collection, HNF, analytic acceptance, and class
invariants, rejects file I/O anywhere in the closure, and can emit the complete
canonical graph with `--full-graph`.

## Exact connected dependency spine

The root's twelve immediate native callees are:

```text
pari_resident_generated_class_attempt
 +- pari_prime_degree_catalog
 +- pari_discriminant_log
 +- pari_prepared_initial_base
 +- pari_random_seed
 +- pari_initial_kummer_catalog
 +- pari_selected_ideal_packets
 +- pari_selected_ideal_metadata
 +- pari_bad_subfactor_flags
 +- pari_subfactor_product
 +- pari_prepared_subfactor_base
 +- pari_small_norm_scale
 `- pari_analytic_class_group_attempt
```

The last edge expands into the connected candidate spine:

```text
pari_analytic_class_group_attempt
 +- pari_analytic_inverse_hr
 `- pari_prepared_class_group_attempt
     +- relation initialization and small-norm collection
     +- pari_collect_ideal_relations
     +- pari_connected_relation_hnf
     +- pari_post_hnf_acceptance
     `- pari_class_invariant_output
```

This is the real algorithm, not a replay of relation, HNF, regulator, or class
answers. The checker records the exact shortest route to each named stage and
hashes all 357 adjacency lists; the full machine-readable graph is deliberately
generated rather than copied into this document.

## Why a new timed final root would be dishonest today

The missing edge is sharply localized:

```text
accepted h=1 candidate
  -X-> high-precision unit retry inputs and unit reconstruction
  -X-> final class-group / Buchall construction
```

Three interfaces do not currently meet:

1. `pari_resident_generated_class_attempt` publishes the class candidate and
   resident 192-bit relation/log owners. It does not generate the 2176-bit
   packed logs, 2240-bit embedding, or 2304-bit working capacity demanded by
   the authentic `getfu` retry.
2. The three native unit leaves in `unit_bridge_cubic.py` are real translated
   code, but their successful harness obtains accepted archimedean columns,
   relation-lattice data, high-precision logs, embedding data, and exact unit
   oracle material from `unit-bridge-cubic-fixtures.json` and a separate live
   PARI oracle. None of these leaves is reachable from the 357-function root
   graph.
3. `class_group_authentic_success.py` is a dynamic evidence composer, not a
   native final driver. Its checker reads a resident output JSON file and the
   unit fixture, then explicitly publishes
   `final_driver_status = "not-published"`. Joining those files after timing
   would be a replay boundary, not the requested computation.

The existing checker for the candidate also learns storage capacities and five
families of allowed neutral field/runtime values from three template artifacts.
Those values are legal *prepared-field inputs*, but that harness is not a
fixture-free producer of them. A standalone timing command must instead receive
a typed prepared-nf object (or an independently implemented `nfinit` adapter)
and a documented capacity policy. Embedding the old template files in another
format would not close this boundary.

Therefore this lane does not add a wrapper that reads the old artifacts, does
not call the unit oracle inside the timer, and does not label the candidate a
final result. The nearest honest executable timed boundary remains the existing
single native candidate entry.

## Smallest implementation that will close it

The next real root needs exactly these additions:

1. a fixture-independent prepared-nf ABI and deterministic workspace sizing
   policy for the current 351-argument owner set;
2. a native precision-restart edge that rebuilds the field embedding/log owners
   at the requested precision and passes them directly to the existing cubic
   unit leaves;
3. a native final driver which consumes the live class and unit owners and
   constructs the final transformation/Buchall state without reading serialized
   resident or unit artifacts; and
4. a timer around that one root call, with preparation, allocation, packing,
   assertions, and differential replay outside the interval.

Until (2) and (3) exist, timing the existing candidate is useful and honest,
but timing a claimed end-to-end class-and-unit computation is not possible.
