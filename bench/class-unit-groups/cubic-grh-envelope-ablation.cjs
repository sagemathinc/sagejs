"use strict";
// Research source-copy ablation: retain all actual workspace/search limits.
const fs=require("node:fs");
const {sha256}=require("./cubic-broad-corpus.cjs");
const BEFORE=`        if (
            minkowski_generator_bound < 2
            or minkowski_generator_bound > _CUBIC_MAX_GRH_BOUND_SEARCH
        ):
            return False
`;
const AFTER=`        # A large unconditional bound is not itself a resource failure.
        # The GRH search and all allocated endpoint tables are capped below.
        # If no smaller bound is proved, the unchanged final guard declines.
        if minkowski_generator_bound < 2:
            return False
`;
function ablate(source) {
  if(source.split(BEFORE).length!==2) throw Error("expected exactly one early Minkowski guard");
  for(const guard of ["if bdf_value_limit > _CUBIC_MAX_FACTOR_SEARCH_BOUND:",
    "if grh_search_bound > _CUBIC_MAX_FACTOR_SEARCH_BOUND:",
    "or generator_bound > _CUBIC_MAX_FACTOR_SEARCH_BOUND"])
    if(!source.includes(guard)) throw Error("missing retained resource guard");
  return source.replace(BEFORE,AFTER);
}
// Keep small primes on the batched machine-word path. Only the discriminant
// can exceed it; use existing exact-source operations rather than widen an FFI.
const WIDE_INPUT=`        bdf_values[0, 0] = absolute_discriminant
`;
const WIDE_INPUT_AFTER=`        bdf_values[0, 0] = absolute_discriminant
        # FLINT's batched log/sqrt primitive takes unsigned machine words.
        # Use a portable 32-bit threshold, including for native Wasm.
        wide_discriminant = absolute_discriminant.bit_length() > 32
        if wide_discriminant:
            bdf_values[0, 0] = 1
`;
const WIDE_ANCHOR=`        # Reuse the consumed value column as a lazy compact splitting plan.
`;
const WIDE_ENDPOINTS=`        if wide_discriminant:
            discriminant_log_lower, discriminant_log_upper = (
                _cubic_arb_log_positive_rational_bounds(
                    log_numerators,
                    log_denominators,
                    log_endpoints,
                    absolute_discriminant,
                    1,
                    _CUBIC_ANALYTIC_PRECISION,
                )
            )
            if discriminant_log_upper < discriminant_log_lower:
                return False
            scaled_discriminant = absolute_discriminant * analytic_scale * analytic_scale
            discriminant_sqrt_lower = _cubic_floor_sqrt(scaled_discriminant)
            discriminant_sqrt_upper = discriminant_sqrt_lower
            if discriminant_sqrt_lower * discriminant_sqrt_lower < scaled_discriminant:
                discriminant_sqrt_upper += 1
            bdf_endpoints[0, 0] = discriminant_log_lower
            bdf_endpoints[1, 0] = discriminant_log_upper
            bdf_endpoints[2, 0] = discriminant_sqrt_lower
            bdf_endpoints[3, 0] = discriminant_sqrt_upper
`;
function wideDiscriminant(source) {
  for (const marker of [WIDE_INPUT,WIDE_ANCHOR])
    if (source.split(marker).length!==2) throw Error("expected unique wide-discriminant anchor");
  return source.replace(WIDE_INPUT,WIDE_INPUT_AFTER).replace(WIDE_ANCHOR,WIDE_ENDPOINTS+WIDE_ANCHOR);
}
if(require.main===module) {
  const [input,output,mode="guard"]=process.argv.slice(2);
  if(!output) throw Error("usage: cubic-grh-envelope-ablation.cjs PARENT OUTPUT [guard|wide]");
  if(!["guard","wide"].includes(mode)) throw Error("mode must be guard or wide");
  const source=fs.readFileSync(input,"utf8");
  const candidate=mode==="wide"?wideDiscriminant(ablate(source)):ablate(source);
  fs.writeFileSync(output,candidate,{flag:"wx"});
  fs.writeFileSync(output+".json",JSON.stringify({research_only:true,parent_sha256:sha256(source),
    candidate_sha256:sha256(candidate),source_bytes:Buffer.byteLength(candidate),mode,
    change:"Remove pre-search rejection solely for M>4096; retain capped GRH search, endpoint dimensions, factor capacity, exact certification and arena limits.",
    wide_discriminant:mode==="wide"?"Replace the discriminant's machine-word batch entry with arbitrary-precision rational log and exact scaled integer square root; no FFI changes.":null,
    public_qualification:false},null,2)+"\n",{flag:"wx"});
  console.log(sha256(candidate));
}
module.exports={BEFORE,AFTER,ablate,wideDiscriminant,WIDE_INPUT,WIDE_INPUT_AFTER,WIDE_ANCHOR,WIDE_ENDPOINTS};
