// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Independent replay of the exact compact-unit, regulator, and conditional
//! analytic-completeness claims in a prepared-cubic evidence artifact.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    CubicIdeal, FlintDyadicInterval, PreparedFactorBase, PreparedIdealWorkspace,
    UpstreamAssumedRow6QualificationOrder, ValidatedPreparedCubic,
    build_cubic_bdf_factor_base_plan, build_cubic_belabas_friedman_plan,
    flint_bdf_factor_base_margin, flint_bf_index_enclosure, flint_compact_cubic_regulator,
    parse_neutral_prepared_cubic_json, prepared_cubic_splitting_records,
    prepared_maximal_cubic_factor_base,
};
use sagejs_rust_class_group_compact_certificate::produce_compact_certificate;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::{env, fs};

type Result<T> = std::result::Result<T, String>;

const INDEPENDENT_SAGEJS_CERTIFICATE_SHA256: &str =
    "sha256:ce85dcbcfdae9e73f6fe789f8712c463765295c7f41749c0d6950f53127cfaf2";
const INDEPENDENT_SAGEJS_RECEIPT_SHA256: &str =
    "sha256:92a07b5503961be92c18d3ba272f9d9e6c47135961f933d5a7fe3e8c7f7fe9cd";
const INDEPENDENT_SAGEJS_VERIFIER_SHA256: &str =
    "sha256:84d50a5900f11f3a46a6d7f7c1b22d141407bf17ed6a2f4538021708f8b260cc";
const INDEPENDENT_SAGEJS_PREPARED_SHA256: &str =
    "c51c7070bbfb9470b440602f5fae7d87a1fb7bf57f60103a981ef8a1a5594c99";
const INDEPENDENT_SAGEJS_RECEIPT: &[u8] =
    include_bytes!("../../candidate/row6-sagejs-compact-replay-receipt.json");
const INDEPENDENT_SAGEJS_VERIFIER: &[u8] =
    include_bytes!("../../candidate/test_sagejs_compact_adapter.py");

fn member<'a>(value: &'a Value, name: &str) -> Result<&'a Value> {
    value.get(name).ok_or_else(|| format!("missing {name}"))
}

fn array<'a>(value: &'a Value, name: &str) -> Result<&'a [Value]> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| format!("{name} is not an array"))
}

fn usize_value(value: &Value, name: &str) -> Result<usize> {
    value
        .as_u64()
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| format!("{name} is not a nonnegative machine integer"))
}

fn u64_value(value: &Value, name: &str) -> Result<u64> {
    value
        .as_u64()
        .ok_or_else(|| format!("{name} is not a nonnegative machine integer"))
}

fn integer(value: &Value, name: &str) -> Result<Integer> {
    if let Some(text) = value.as_str() {
        let parsed = text
            .parse::<Integer>()
            .map_err(|_| format!("{name} is not a canonical integer"))?;
        if parsed.to_string() != text {
            return Err(format!("{name} is not a canonical integer"));
        }
        return Ok(parsed);
    }
    if let Some(value) = value.as_i64() {
        return Ok(Integer::from(value));
    }
    if let Some(value) = value.as_u64() {
        return Ok(Integer::from(value));
    }
    Err(format!("{name} is not an exact JSON integer"))
}

fn invariant_factors(analytic: &Value) -> Result<Vec<Integer>> {
    let values = array(
        member(analytic, "candidateInvariantFactors")?,
        "candidateInvariantFactors",
    )?;
    let mut invariants = Vec::with_capacity(values.len());
    for value in values {
        let value = integer(value, "candidate invariant factor")?;
        if value <= 1
            || invariants
                .last()
                .is_some_and(|previous: &Integer| Integer::from(&value % previous) != 0)
        {
            return Err("candidate invariant factors are not a divisibility chain".into());
        }
        invariants.push(value);
    }
    Ok(invariants)
}

fn sha256(value: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value);
    format!("sha256:{:x}", hasher.finalize())
}

fn verify_independent_sagejs_receipt(input_id: &str) -> Result<()> {
    if sha256(INDEPENDENT_SAGEJS_RECEIPT) != INDEPENDENT_SAGEJS_RECEIPT_SHA256
        || sha256(INDEPENDENT_SAGEJS_VERIFIER) != INDEPENDENT_SAGEJS_VERIFIER_SHA256
    {
        return Err("independent Sage.js replay receipt or verifier source hash differs".into());
    }
    let receipt: Value = serde_json::from_slice(INDEPENDENT_SAGEJS_RECEIPT)
        .map_err(|error| format!("invalid independent Sage.js receipt: {error}"))?;
    let certificate = INDEPENDENT_SAGEJS_CERTIFICATE_SHA256
        .strip_prefix("sha256:")
        .ok_or_else(|| "invalid certificate digest constant".to_string())?;
    let verifier = INDEPENDENT_SAGEJS_VERIFIER_SHA256
        .strip_prefix("sha256:")
        .ok_or_else(|| "invalid verifier digest constant".to_string())?;
    if member(&receipt, "schema")?.as_str()
        != Some("sagejs.rust-class-group/sagejs-compact-replay-receipt-v1")
        || member(&receipt, "status")?.as_str() != Some("independent-sagejs-replay-passed")
        || member(&receipt, "backend")?.as_str() != Some("compact-small-surplus")
        || member(&receipt, "certificateSha256")?.as_str() != Some(certificate)
        || member(&receipt, "preparedSha256")?.as_str() != Some(INDEPENDENT_SAGEJS_PREPARED_SHA256)
        || member(&receipt, "verifierSourceSha256")?.as_str() != Some(verifier)
        || member(&receipt, "preparedInputId")?.as_str() != Some(input_id)
        || usize_value(member(&receipt, "rows")?, "receipt rows")? != 1137
        || usize_value(member(&receipt, "columns")?, "receipt columns")? != 1130
        || usize_value(member(&receipt, "dependencies")?, "receipt dependencies")? != 7
        || usize_value(
            member(&receipt, "selectedDependencyMinors")?,
            "receipt selected dependency minors",
        )? != 4
        || integer(member(&receipt, "order")?, "receipt order")? != 4
        || array(member(&receipt, "invariants")?, "receipt invariants")? != [json!(2), json!(2)]
        || member(&receipt, "dependencyMinorGcd")?.as_u64() != Some(1)
    {
        return Err("independent Sage.js replay receipt has unexpected exact result".into());
    }
    let elapsed = member(&receipt, "elapsedSeconds")?
        .as_f64()
        .ok_or_else(|| "receipt elapsedSeconds is not numeric".to_string())?;
    let verification = member(&receipt, "verificationSeconds")?
        .as_f64()
        .ok_or_else(|| "receipt verificationSeconds is not numeric".to_string())?;
    let budget = member(&receipt, "verificationBudgetSeconds")?
        .as_f64()
        .ok_or_else(|| "receipt verificationBudgetSeconds is not numeric".to_string())?;
    if !elapsed.is_finite()
        || !verification.is_finite()
        || !budget.is_finite()
        || elapsed < 0.0
        || verification < 0.0
        || verification > elapsed
        || elapsed > budget
    {
        return Err("independent Sage.js replay exceeded its recorded budget".into());
    }
    Ok(())
}

fn parse_coordinates(value: &Value) -> Result<[Integer; 3]> {
    let values = array(value, "integralBasisCoordinates")?;
    if values.len() != 3 {
        return Err("integralBasisCoordinates does not have degree three".into());
    }
    Ok([
        integer(&values[0], "coordinate")?,
        integer(&values[1], "coordinate")?,
        integer(&values[2], "coordinate")?,
    ])
}

fn sparse_relation_combination(
    factors: &[Value],
) -> Result<BTreeMap<usize, (Integer, [Integer; 3])>> {
    let mut result = BTreeMap::new();
    for factor in factors {
        let row = usize_value(member(factor, "relationIndexZeroBased")?, "relation index")?;
        let exponent = integer(member(factor, "exponent")?, "relation exponent")?;
        if exponent == 0 {
            return Err("zero coefficient in sparse relation combination".into());
        }
        let coordinates = parse_coordinates(member(factor, "integralBasisCoordinates")?)?;
        if result.insert(row, (exponent, coordinates)).is_some() {
            return Err("duplicate relation index in sparse relation combination".into());
        }
    }
    Ok(result)
}

fn relation_rows(input: &Value) -> Result<(Vec<BTreeMap<usize, Integer>>, Vec<[Integer; 3]>)> {
    let shape = member(input, "relations")?;
    let row_count = usize_value(member(shape, "rows")?, "relation row count")?;
    let column_count = usize_value(member(shape, "columns")?, "relation column count")?;
    let records = array(
        member(member(input, "relationLatticeEvidence")?, "relationRecords")?,
        "relationRecords",
    )?;
    if records.len() != row_count {
        return Err("relation record count disagrees with relation shape".into());
    }
    let mut rows = vec![BTreeMap::new(); row_count];
    let mut coordinates = vec![None; row_count];
    for record in records {
        let row = usize_value(member(record, "relationIndexZeroBased")?, "relation index")?;
        if row >= row_count || coordinates[row].is_some() {
            return Err("missing, duplicate, or out-of-range relation record".into());
        }
        coordinates[row] = Some(parse_coordinates(member(
            record,
            "integralBasisCoordinates",
        )?)?);
        for factor in array(member(record, "primeIdealFactors")?, "primeIdealFactors")? {
            let column = usize_value(
                member(factor, "factorBaseIndexZeroBased")?,
                "factor-base index",
            )?;
            if column >= column_count {
                return Err("factor-base index outside relation shape".into());
            }
            let exponent = integer(member(factor, "exponent")?, "relation exponent")?;
            if exponent == 0 || rows[row].insert(column, exponent).is_some() {
                return Err("zero or duplicate relation factor".into());
            }
        }
    }
    Ok((
        rows,
        coordinates
            .into_iter()
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| "relation catalog is incomplete".to_string())?,
    ))
}

fn compact_dependencies(
    input: &Value,
    relations: &[BTreeMap<usize, Integer>],
    catalog_coordinates: &[[Integer; 3]],
) -> Result<Vec<BTreeMap<usize, (Integer, [Integer; 3])>>> {
    let units = array(
        member(member(input, "kernel")?, "compactUnits")?,
        "kernel.compactUnits",
    )?;
    let mut answer = Vec::with_capacity(units.len());
    for (expected, unit) in units.iter().enumerate() {
        if usize_value(member(unit, "dependencyIndex")?, "dependency index")? != expected {
            return Err("compact dependency indices are not canonical".into());
        }
        let factors = sparse_relation_combination(array(member(unit, "factors")?, "factors")?)?;
        let mut valuation = BTreeMap::<usize, Integer>::new();
        for (&row, (coefficient, _)) in &factors {
            let relation = relations
                .get(row)
                .ok_or_else(|| "compact unit references an absent relation".to_string())?;
            for (&column, exponent) in relation {
                *valuation.entry(column).or_default() += coefficient * exponent;
            }
        }
        valuation.retain(|_, value| value != &0);
        if !valuation.is_empty() {
            return Err(format!(
                "compact unit {expected} is not an exact relation dependency"
            ));
        }
        if factors
            .iter()
            .any(|(&row, (_, coordinates))| catalog_coordinates.get(row) != Some(coordinates))
        {
            return Err(format!(
                "compact unit {expected} changes a relation's principal generator"
            ));
        }
        if usize_value(
            member(unit, "nonzeroCoefficientCount")?,
            "nonzeroCoefficientCount",
        )? != factors.len()
        {
            return Err("compact-unit nonzero count is counterfeit".into());
        }
        answer.push(factors);
    }
    Ok(answer)
}

fn fundamental_units(
    input: &Value,
    dependencies: &[BTreeMap<usize, (Integer, [Integer; 3])>],
    catalog_coordinates: &[[Integer; 3]],
) -> Result<(Vec<Integer>, Vec<Integer>, usize)> {
    let reconstructed = member(input, "reconstructedUnitLattice")?;
    let units = array(
        member(reconstructed, "fundamentalCompactUnits")?,
        "fundamentalCompactUnits",
    )?;
    if units.len() != 2 {
        return Err("row-6 replay requires exactly two fundamental units".into());
    }
    let mut selected_coordinates = BTreeMap::<usize, [Integer; 3]>::new();
    let mut exponent_rows = Vec::<BTreeMap<usize, Integer>>::new();
    for (basis, unit) in units.iter().enumerate() {
        if usize_value(member(unit, "basisIndex")?, "basisIndex")? != basis
            || member(unit, "allRelationCoordinatesReplayExactly")?.as_bool() != Some(true)
        {
            return Err("fundamental-unit replay assertion is malformed".into());
        }
        let combination = array(
            member(unit, "dependencyCombination")?,
            "dependencyCombination",
        )?;
        if combination.len() != dependencies.len() {
            return Err("fundamental-unit dependency combination has wrong width".into());
        }
        let mut expected = BTreeMap::<usize, Integer>::new();
        for (dependency, coefficient) in dependencies.iter().zip(combination) {
            let coefficient = integer(coefficient, "dependency coefficient")?;
            for (&row, (value, _)) in dependency {
                *expected.entry(row).or_default() += &coefficient * value;
            }
        }
        expected.retain(|_, value| value != &0);
        let factors = sparse_relation_combination(array(member(unit, "factors")?, "factors")?)?;
        if usize_value(
            member(unit, "nonzeroCoefficientCount")?,
            "fundamental nonzeroCoefficientCount",
        )? != factors.len()
        {
            return Err("fundamental-unit nonzero count is counterfeit".into());
        }
        if factors
            .iter()
            .any(|(&row, (_, coordinates))| catalog_coordinates.get(row) != Some(coordinates))
        {
            return Err(format!(
                "fundamental unit {basis} changes a relation's principal generator"
            ));
        }
        let actual = factors
            .iter()
            .map(|(&row, (coefficient, _))| (row, coefficient.clone()))
            .collect::<BTreeMap<_, _>>();
        if actual != expected {
            return Err(format!(
                "fundamental unit {basis} does not equal its exact dependency combination"
            ));
        }
        for (&row, (_, coordinates)) in &factors {
            if let Some(previous) = selected_coordinates.insert(row, coordinates.clone())
                && previous != *coordinates
            {
                return Err(
                    "same relation has inconsistent principal generator coordinates".into(),
                );
            }
        }
        exponent_rows.push(actual);
    }
    let relation_indices = selected_coordinates.keys().copied().collect::<Vec<_>>();
    let mut coordinates = Vec::with_capacity(3 * relation_indices.len());
    for row in &relation_indices {
        coordinates.extend(selected_coordinates[row].iter().cloned());
    }
    let mut exponents = Vec::with_capacity(2 * relation_indices.len());
    for unit in &exponent_rows {
        for row in &relation_indices {
            exponents.push(unit.get(row).cloned().unwrap_or_default());
        }
    }
    Ok((coordinates, exponents, relation_indices.len()))
}

fn dyadic(value: &Value) -> Result<FlintDyadicInterval> {
    Ok(FlintDyadicInterval {
        lower: integer(member(value, "lowerMantissa")?, "lowerMantissa")?,
        upper: integer(member(value, "upperMantissa")?, "upperMantissa")?,
        binary_exponent: member(value, "binaryExponent")?
            .as_i64()
            .ok_or_else(|| "binaryExponent is not an i64".to_string())?,
    })
}

fn same_interval(left: &FlintDyadicInterval, right: &FlintDyadicInterval) -> bool {
    left.lower == right.lower
        && left.upper == right.upper
        && left.binary_exponent == right.binary_exponent
}

fn interval_strictly_positive(value: &FlintDyadicInterval) -> bool {
    value.lower > 0
}

fn interval_strictly_below_fraction(value: &FlintDyadicInterval, denominator: u32) -> bool {
    if value.upper < 0 {
        return true;
    }
    if value.binary_exponent >= 0 {
        return false;
    }
    let Some(shift) = value
        .binary_exponent
        .checked_neg()
        .and_then(|shift| u32::try_from(shift).ok())
    else {
        return false;
    };
    Integer::from(&value.upper * denominator) < (Integer::from(1) << shift)
}

fn interval_has_unique_positive_integer_one(value: &FlintDyadicInterval) -> bool {
    // A closed interval contains 1 and contains neither 0 nor 2.
    if value.binary_exponent >= 0 {
        let Some(shift) = u32::try_from(value.binary_exponent).ok() else {
            return false;
        };
        let scale = Integer::from(1) << shift;
        let lower = Integer::from(&value.lower * &scale);
        let upper = Integer::from(&value.upper * &scale);
        return lower <= 1 && upper >= 1 && lower > 0 && upper < 2;
    }
    let Some(shift) = value
        .binary_exponent
        .checked_neg()
        .and_then(|shift| u32::try_from(shift).ok())
    else {
        return false;
    };
    let denominator = Integer::from(1) << shift;
    value.lower <= denominator
        && value.upper >= denominator
        && value.lower > 0
        && value.upper < 2 * denominator
}

fn exact_interval_json(value: &FlintDyadicInterval) -> Value {
    json!({
        "lowerMantissa": value.lower.to_string(),
        "upperMantissa": value.upper.to_string(),
        "binaryExponent": value.binary_exponent,
    })
}

fn verify_class_lattice(
    input: &Value,
    rows: usize,
    columns: usize,
) -> Result<(String, Vec<Integer>, Integer)> {
    let expected_dependency_rank = rows
        .checked_sub(columns)
        .ok_or_else(|| "relation presentation has fewer rows than columns".to_string())?;
    let kernel = member(input, "kernel")?;
    if usize_value(member(kernel, "rank")?, "kernel rank")? != expected_dependency_rank
        || member(kernel, "isSaturated")?.as_bool() != Some(true)
        || member(kernel, "allReplayExactly")?.as_bool() != Some(true)
        || member(kernel, "construction")?.as_str()
            != Some("reused-small-surplus-saturated-congruence-kernel")
        || member(kernel, "unitEncoding")?.as_str()
            != Some("product-of-collected-integral-basis-elements-to-signed-powers-v1")
        || array(member(kernel, "compactUnits")?, "compactUnits")?.len() != expected_dependency_rank
    {
        return Err("kernel rank, saturation, replay, or encoding metadata is invalid".into());
    }
    let class_map = member(input, "classMap")?;
    if member(class_map, "allRelationsMapToZero")?.as_bool() != Some(true)
        || member(
            class_map,
            "isExactBecauseMapOrderMatchesCertifiedClassOrder",
        )?
        .as_bool()
            != Some(true)
    {
        return Err("class-map exactness metadata is invalid".into());
    }

    // Reproduce the compact certificate consumed by the independent Sage.js
    // replay.  The Rust producer checks all compact-presentation identities,
    // while the hash-bound Sage.js prerequisite additionally recomputes the
    // full 1,130 by 1,130 square relation determinant rather than trusting the
    // prepared square-determinant field.
    let certificate = produce_compact_certificate(input)
        .map_err(|error| format!("compact lattice certificate replay failed: {error}"))?;
    if member(&certificate, "schema")?.as_str()
        != Some("sagejs.rust-class-group/compact-presentation-certificate-v1")
        || member(&certificate, "qualificationStatus")?.as_str()
            != Some("closed-exact-lattice-index-certificate")
        || member(&certificate, "sourceInputId")? != member(input, "inputId")?
        || usize_value(
            member(member(&certificate, "relationShape")?, "rows")?,
            "certificate rows",
        )? != rows
        || usize_value(
            member(member(&certificate, "relationShape")?, "columns")?,
            "certificate columns",
        )? != columns
    {
        return Err("compact lattice certificate is not bound to this presentation".into());
    }
    let verified = member(&certificate, "verified")?
        .as_object()
        .ok_or_else(|| "certificate verified field is not an object".to_string())?;
    if verified.len() != 11 || verified.values().any(|value| value.as_bool() != Some(true)) {
        return Err("compact lattice certificate did not prove every required invariant".into());
    }

    let analytic = member(input, "analyticCompletion")?;
    let invariants = invariant_factors(analytic)?;
    let certificate_invariants = array(
        member(&certificate, "invariantFactors")?,
        "certificate invariantFactors",
    )?
    .iter()
    .map(|value| integer(value, "certificate invariant factor"))
    .collect::<Result<Vec<_>>>()?;
    if certificate_invariants != invariants {
        return Err("candidate invariant factors differ from the exact lattice certificate".into());
    }
    let group_order = integer(
        member(&certificate, "groupOrder")?,
        "certificate group order",
    )?;
    let claimed_order = integer(member(analytic, "candidateClassNumber")?, "class number")?;
    let invariant_product = invariants
        .iter()
        .fold(Integer::from(1), |product, value| product * value);
    let full_index = integer(
        member(
            member(&certificate, "latticeIndexEvidence")?,
            "fullRelationLatticeIndex",
        )?,
        "full relation lattice index",
    )?;
    if group_order != claimed_order || group_order != invariant_product || group_order != full_index
    {
        return Err("class number, invariant factors, and exact lattice index disagree".into());
    }
    // Match the certificate CLI's canonical retained artifact: pretty JSON
    // followed by the newline written by `println!`.
    let mut serialized =
        serde_json::to_string_pretty(&certificate).map_err(|error| error.to_string())?;
    serialized.push('\n');
    let mut hasher = Sha256::new();
    hasher.update(serialized.as_bytes());
    Ok((
        format!("sha256:{:x}", hasher.finalize()),
        invariants,
        group_order,
    ))
}

fn verify_factor_base_catalog(
    input: &Value,
    field: &ValidatedPreparedCubic,
    columns: usize,
) -> Result<PreparedFactorBase> {
    let factor_base = prepared_maximal_cubic_factor_base(field)
        .map_err(|error| format!("factor-base replay failed: {error:?}"))?;
    if factor_base.catalog.ideals.len() != columns {
        return Err("recomputed factor-base size differs from relation columns".into());
    }
    let expected = factor_base
        .catalog
        .ideals
        .iter()
        .enumerate()
        .map(|(index, ideal)| {
            json!({
                "factorBaseIndexZeroBased": index,
                "prime": ideal.prime,
                "ramification": ideal.ramification,
                "residueDegree": ideal.residue_degree,
                "norm": ideal.norm,
                "generator": ideal.generator,
                "hnf": ideal.hnf,
            })
        })
        .collect::<Vec<_>>();
    let relation_lattice = member(input, "relationLatticeEvidence")?;
    if member(relation_lattice, "schema")?.as_str()
        != Some("sagejs.rust-class-group/prepared-cubic-relation-lattice-v1")
    {
        return Err("relation-lattice evidence has the wrong schema".into());
    }
    let relation_catalog = array(
        member(relation_lattice, "factorBaseCatalog")?,
        "relation factor-base catalog",
    )?;
    let class_catalog = array(
        member(
            member(input, "classMap")?,
            "generatorOrderFactorBaseCatalog",
        )?,
        "class-map factor-base catalog",
    )?;
    if relation_catalog != expected.as_slice() || class_catalog != expected.as_slice() {
        return Err("ordered factor-base catalog differs from exact maximal-order replay".into());
    }
    Ok(factor_base)
}

fn verify_principal_relation_elements(
    field: &ValidatedPreparedCubic,
    factor_base: &PreparedFactorBase,
    relations: &[BTreeMap<usize, Integer>],
    relation_coordinates: &[[Integer; 3]],
) -> Result<usize> {
    if relations.len() != relation_coordinates.len() {
        return Err("principal relation element count differs from relation rows".into());
    }
    let mut workspace = PreparedIdealWorkspace::new();
    let mut factor_terms = 0_usize;
    for (row, (relation, element)) in relations.iter().zip(relation_coordinates).enumerate() {
        if element.iter().all(|coordinate| coordinate == &0) {
            return Err(format!("principal relation {row} has the zero element"));
        }

        // Construct `(element)` independently as the row lattice generated by
        // element times each integral-basis vector.  This uses the validated
        // maximal-order multiplication table rather than any relation-record
        // assertion.
        let generators: [[Integer; 3]; 3] = std::array::from_fn(|basis_index| {
            let basis: [Integer; 3] =
                std::array::from_fn(|index| Integer::from(u8::from(index == basis_index)));
            field.multiply_coordinates(element, &basis)
        });
        let principal = workspace
            .from_generators(&generators)
            .map_err(|error| format!("principal relation {row} is singular: {error:?}"))?;

        let mut factored = CubicIdeal::unit();
        for (column, exponent) in relation {
            let exponent = exponent.to_u8().ok_or_else(|| {
                format!("principal relation {row} has a negative or oversized integral exponent")
            })?;
            if exponent == 0 {
                return Err(format!("principal relation {row} contains a zero exponent"));
            }
            let prime = factor_base.exact_ideals.get(*column).ok_or_else(|| {
                format!("principal relation {row} references factor-base column {column}")
            })?;
            let power = workspace
                .pow(field, prime, exponent)
                .map_err(|error| format!("principal relation {row} power failed: {error:?}"))?;
            factored = workspace
                .multiply(field, &factored, &power)
                .map_err(|error| format!("principal relation {row} product failed: {error:?}"))?;
            factor_terms += 1;
        }
        if factored != principal {
            return Err(format!(
                "principal relation {row} does not replay in exact maximal-order ideal arithmetic"
            ));
        }
    }
    Ok(factor_terms)
}

fn strip_timings(value: &mut Value) {
    match value {
        Value::Object(object) => {
            object.remove("timingsNanoseconds");
            for value in object.values_mut() {
                strip_timings(value);
            }
        }
        Value::Array(values) => values.iter_mut().for_each(strip_timings),
        _ => {}
    }
}

fn verify(input_bytes: &[u8], neutral_bytes: &[u8]) -> Result<Value> {
    let input: Value = serde_json::from_slice(input_bytes).map_err(|error| error.to_string())?;
    if member(&input, "schema")?.as_str()
        != Some("sagejs.rust-class-group/prepared-cubic-class-unit-v2")
    {
        return Err("expected prepared-cubic class/unit v2 evidence".into());
    }
    if member(&input, "usesOracleAsInput")?.as_bool() != Some(false)
        || member(&input, "usesClassGroupAnswersAsInput")?.as_bool() != Some(false)
    {
        return Err("artifact admits oracle/class-group answers as runtime input".into());
    }
    let neutral_text = std::str::from_utf8(neutral_bytes).map_err(|error| error.to_string())?;
    let neutral =
        parse_neutral_prepared_cubic_json(neutral_text).map_err(|error| format!("{error:?}"))?;
    let row6_order = UpstreamAssumedRow6QualificationOrder::from_allowlisted_neutral(&neutral)
        .map_err(|error| format!("row-6 maximal-order authority failed: {error:?}"))?;
    let field: &ValidatedPreparedCubic = row6_order.field();
    if member(&input, "inputId")?.as_str() != Some(neutral.input_id.as_str()) {
        return Err("evidence is not bound to the supplied neutral input".into());
    }
    verify_independent_sagejs_receipt(&neutral.input_id)?;
    let polynomial = array(
        member(&input, "polynomialAscending")?,
        "polynomialAscending",
    )?
    .iter()
    .map(|value| integer(value, "polynomial coefficient"))
    .collect::<Result<Vec<_>>>()?;
    if polynomial != field.data().polynomial_ascending {
        return Err("evidence polynomial disagrees with neutral field".into());
    }
    let (relations, relation_coordinates) = relation_rows(&input)?;
    let rows = relations.len();
    let columns = usize_value(
        member(member(&input, "relations")?, "columns")?,
        "relation columns",
    )?;
    let (compact_certificate_sha, invariants, certified_class_order) =
        verify_class_lattice(&input, rows, columns)?;
    if compact_certificate_sha != INDEPENDENT_SAGEJS_CERTIFICATE_SHA256 {
        return Err(
            "current compact certificate differs from the independently replayed Sage.js certificate"
                .into(),
        );
    }
    let factor_base = verify_factor_base_catalog(&input, field, columns)?;
    let principal_relation_factor_terms =
        verify_principal_relation_elements(field, &factor_base, &relations, &relation_coordinates)?;
    let dependencies = compact_dependencies(&input, &relations, &relation_coordinates)?;
    let (coordinates, exponents, relation_count) =
        fundamental_units(&input, &dependencies, &relation_coordinates)?;

    let polynomial: [i64; 4] = field
        .data()
        .polynomial_ascending
        .iter()
        .map(Integer::to_i64)
        .collect::<Option<Vec<_>>>()
        .and_then(|values| values.try_into().ok())
        .ok_or_else(|| "polynomial does not fit the regulator bridge".to_string())?;
    let basis: [i64; 9] = field
        .data()
        .integral_basis_numerators
        .iter()
        .map(Integer::to_i64)
        .collect::<Option<Vec<_>>>()
        .and_then(|values| values.try_into().ok())
        .ok_or_else(|| "integral basis does not fit the regulator bridge".to_string())?;
    let denominator = field
        .data()
        .basis_denominator
        .to_u64()
        .ok_or_else(|| "basis denominator does not fit the regulator bridge".to_string())?;
    let signature = field.data().signature;
    let regulator = flint_compact_cubic_regulator(
        polynomial,
        basis,
        denominator,
        signature,
        &coordinates,
        &exponents,
        4096,
    )
    .map_err(|error| format!("regulator replay failed: {error:?}"))?;
    let reconstructed = member(&input, "reconstructedUnitLattice")?;
    if member(reconstructed, "certificationStatus")?.as_str()
        != Some("exact-compact-units-and-grh-conditional-analytic-index-one")
    {
        return Err("unit-lattice certification status is invalid".into());
    }
    let regulator_evidence = member(reconstructed, "rigorousArbRegulatorEnclosure")?;
    if member(regulator_evidence, "authority")?.as_str()
        != Some("directed-arb-evaluation-from-exact-compact-units")
        || member(regulator_evidence, "encoding")?.as_str() != Some("closed-dyadic-interval-v1")
        || u64_value(
            member(regulator_evidence, "precisionBits")?,
            "regulator precision",
        )? != 4096
    {
        return Err("rigorous regulator metadata is invalid".into());
    }
    let auxiliary_mpfr_contained = member(regulator_evidence, "containsIndependentMpfrReplay")?
        .as_bool()
        .ok_or_else(|| "containsIndependentMpfrReplay is not boolean".to_string())?;
    let claimed_regulator = dyadic(regulator_evidence)?;
    if !same_interval(&regulator, &claimed_regulator) || !interval_strictly_positive(&regulator) {
        return Err("recomputed rigorous regulator enclosure differs or is not positive".into());
    }

    let analytic = member(&input, "analyticCompletion")?;
    let threshold = u64_value(member(analytic, "threshold")?, "threshold")?;
    let splitting = prepared_cubic_splitting_records(
        field,
        usize::try_from(threshold).map_err(|_| "threshold does not fit usize")?,
    )
    .map_err(|error| format!("splitting replay failed: {error:?}"))?;
    let plan = build_cubic_belabas_friedman_plan(threshold, &splitting)
        .map_err(|error| format!("analytic plan replay failed: {error:?}"))?;
    if plan.raw_terms != usize_value(member(analytic, "rawPrimePowerTerms")?, "raw terms")?
        || plan.terms.len()
            != usize_value(
                member(analytic, "aggregatedPrimePowerTerms")?,
                "aggregated terms",
            )?
    {
        return Err("analytic prime-power schedule counters differ".into());
    }
    let discriminant = field.data().discriminant.clone();
    let class_number = certified_class_order
        .to_u64()
        .ok_or_else(|| "class number does not fit u64".to_string())?;
    let precision = u32::try_from(u64_value(
        member(analytic, "precisionBits")?,
        "precisionBits",
    )?)
    .map_err(|_| "precision does not fit u32".to_string())?;
    let completion = flint_bf_index_enclosure(
        &plan.terms,
        threshold,
        &discriminant,
        class_number,
        2,
        (u64::from(signature.0), u64::from(signature.1)),
        &regulator,
        precision,
    )
    .map_err(|error| format!("analytic enclosure replay failed: {error:?}"))?;
    let claimed_zeta = dyadic(member(analytic, "zetaLogResidueEnclosure")?)?;
    let claimed_tail = dyadic(member(analytic, "tailBoundEnclosure")?)?;
    let claimed_index = dyadic(member(analytic, "classUnitIndexEnclosure")?)?;
    if !same_interval(&completion.zeta_log_residue, &claimed_zeta)
        || !same_interval(&completion.tail_bound, &claimed_tail)
        || !same_interval(&completion.index, &claimed_index)
    {
        return Err("recomputed analytic completion enclosure differs".into());
    }
    if !interval_strictly_below_fraction(&completion.tail_bound, 4)
        || !interval_has_unique_positive_integer_one(&completion.index)
    {
        return Err("analytic enclosure does not prove class/unit index one".into());
    }

    let generation = member(analytic, "factorBaseGeneration")?;
    let bound = u64_value(member(generation, "boundExclusive")?, "factor-base bound")?;
    if usize::try_from(bound).ok() != factor_base.catalog.relation_bound.checked_add(1) {
        return Err(
            "BDF theorem bound is not the exact retained factor-base bound plus one".into(),
        );
    }
    let factor_plan = build_cubic_bdf_factor_base_plan(bound, &splitting)
        .map_err(|error| format!("factor-base plan replay failed: {error:?}"))?;
    if factor_plan.raw_terms
        != usize_value(
            member(generation, "rawPrimeIdealPowerTerms")?,
            "raw factor terms",
        )?
        || factor_plan.terms.len()
            != usize_value(
                member(generation, "aggregatedPrimeIdealPowerTerms")?,
                "aggregated factor terms",
            )?
    {
        return Err("factor-base generation schedule counters differ".into());
    }
    let margin = flint_bdf_factor_base_margin(
        &factor_plan.terms,
        bound,
        &discriminant,
        polynomial.len() as u64 - 1,
        u64::from(signature.0),
        256,
    )
    .map_err(|error| format!("factor-base margin replay failed: {error:?}"))?;
    let claimed_margin = dyadic(member(generation, "strictMarginEnclosure")?)?;
    if !same_interval(&margin, &claimed_margin) || !interval_strictly_positive(&margin) {
        return Err("factor-base generation margin differs or is not strictly positive".into());
    }

    let mut hasher = Sha256::new();
    hasher.update(input_bytes);
    let input_sha = format!("sha256:{:x}", hasher.finalize());
    let mut mathematical_evidence = input.clone();
    strip_timings(&mut mathematical_evidence);
    let mut hasher = Sha256::new();
    hasher.update(serde_json::to_vec(&mathematical_evidence).unwrap());
    let mathematical_sha = format!("sha256:{:x}", hasher.finalize());
    let mut hasher = Sha256::new();
    hasher.update(neutral_bytes);
    let neutral_sha = format!("sha256:{:x}", hasher.finalize());
    Ok(json!({
        "schema": "sagejs.rust-class-group/unit-completeness-replay-v1",
        "qualificationStatus": "independently-replayed-grh-conditional-class-unit-index-one",
        "sourceEvidenceSha256": input_sha,
        "mathematicalEvidenceWithoutTimingsSha256": mathematical_sha,
        "neutralInputSha256": neutral_sha,
        "inputId": neutral.input_id,
        "polynomialAscending": polynomial.map(|value| value.to_string()),
        "proofMode": "conditional-grh",
        "exactClassLatticeEvidence": {
            "currentCompactCertificateSha256": compact_certificate_sha,
            "independentlySagejsReplayedCertificateSha256": INDEPENDENT_SAGEJS_CERTIFICATE_SHA256,
            "independentSagejsReplayReceiptSha256": INDEPENDENT_SAGEJS_RECEIPT_SHA256,
            "independentSagejsVerifierSourceSha256": INDEPENDENT_SAGEJS_VERIFIER_SHA256,
            "independentSagejsReplayStatus": "independent-sagejs-replay-passed",
            "invariantFactors": invariants.iter().map(Integer::to_string).collect::<Vec<_>>(),
            "classNumber": certified_class_order.to_string(),
            "relationRows": rows,
            "relationColumns": columns,
            "dependencyRank": rows - columns,
            "prerequisite": "The exact compact certificate with this digest was independently replayed by Sage.js, including direct recomputation of the 1130-by-1130 square determinant. This binary embeds and validates both the durable replay receipt and its exact verifier source.",
        },
        "exactUnitEvidence": {
            "relationRows": relations.len(),
            "compactDependencies": dependencies.len(),
            "fundamentalUnits": 2,
            "fundamentalUnitRelationTerms": relation_count,
            "everyCompactUnitAnnihilatesTheExactRelationPresentation": true,
            "everyFundamentalUnitEqualsItsExactDependencyCombination": true,
        },
        "regulatorEvidence": {
            "precisionBits": 4096,
            "directedArbEnclosure": exact_interval_json(&regulator),
            "recomputedFromExactCompactUnits": true,
            "auxiliaryMpfrReplayContained": auxiliary_mpfr_contained,
            "auxiliaryMpfrReplayInterpretation": if auxiliary_mpfr_contained {
                "The auxiliary lower-precision MPFR diagnostic is contained, but it remains diagnostic rather than proof evidence."
            } else {
                "The producer's lower-precision MPFR cancellation diagnostic lies outside the much tighter 4096-bit directed Arb interval. It is retained and reported but is not proof evidence; this verifier recomputes the authoritative directed Arb enclosure from exact compact units."
            },
        },
        "factorBaseGenerationEvidence": {
            "boundExclusive": bound,
            "orderedCatalogColumns": factor_base.catalog.ideals.len(),
            "everyCatalogDescriptorMatchesExactMaximalOrderReplay": true,
            "rawPrimeIdealPowerTerms": factor_plan.raw_terms,
            "aggregatedPrimeIdealPowerTerms": factor_plan.terms.len(),
            "strictMarginEnclosure": exact_interval_json(&margin),
            "strictlyPositive": true,
            "hypothesis": "GRH-for-all-unramified-Hecke-L-functions-of-class-group-characters",
        },
        "analyticCompletionEvidence": {
            "threshold": threshold,
            "rawPrimePowerTerms": plan.raw_terms,
            "aggregatedPrimePowerTerms": plan.terms.len(),
            "tailBoundEnclosure": exact_interval_json(&completion.tail_bound),
            "classUnitIndexEnclosure": exact_interval_json(&completion.index),
            "uniquePositiveInteger": 1,
            "hypothesis": "GRH-for-the-Dedekind-zeta-functions-of-K-and-Q-in-the-Belabas-Friedman-residue-bound",
        },
        "principalRelationAlgebraEvidence": {
            "maximalOrderEvidence": "upstream-assumed-allowlisted-row6",
            "relationRows": relations.len(),
            "factorTerms": principal_relation_factor_terms,
            "everyPrincipalElementReconstructedFromExactIntegralBasisMultiplication": true,
            "everyFactorBaseProductRecomputedInCanonicalExactIdealArithmetic": true,
            "everyPrincipalIdealEqualsItsCompleteRetainedNonnegativeFactorBaseProduct": true,
        },
        "usesPariAtRuntime": false,
        "remainingGap": "This closes prepared row-6 exact relation-element algebra plus unit/regulator/conditional-completeness replay. Maximality for this nonsquarefree-discriminant fixture remains the explicit authenticated upstream row-6 assumption; this does not construct the public Sage.js result, support unconditional proof, or qualify other fields/signatures/degrees.",
    }))
}

fn counterfeit_suite(input_bytes: &[u8], neutral_bytes: &[u8]) -> Result<Value> {
    verify(input_bytes, neutral_bytes)?;
    let original: Value = serde_json::from_slice(input_bytes).map_err(|error| error.to_string())?;
    let mut outcomes = BTreeMap::new();

    // Exercise the new algebra boundary directly so these counterfeits cannot
    // be credited merely to an earlier certificate/hash check.
    let neutral_text = std::str::from_utf8(neutral_bytes).map_err(|error| error.to_string())?;
    let neutral =
        parse_neutral_prepared_cubic_json(neutral_text).map_err(|error| format!("{error:?}"))?;
    let row6_order = UpstreamAssumedRow6QualificationOrder::from_allowlisted_neutral(&neutral)
        .map_err(|error| format!("row-6 maximal-order authority failed: {error:?}"))?;
    let field = row6_order.field();
    let factor_base = prepared_maximal_cubic_factor_base(field)
        .map_err(|error| format!("factor-base replay failed: {error:?}"))?;
    let (relations, relation_coordinates) = relation_rows(&original)?;

    let mut changed_coordinates = relation_coordinates.clone();
    changed_coordinates[0][0] += 1;
    outcomes.insert(
        "principalRelationElementAlgebra",
        verify_principal_relation_elements(field, &factor_base, &relations, &changed_coordinates)
            .is_err(),
    );

    let mut changed_relations = relations.clone();
    *changed_relations[0]
        .values_mut()
        .next()
        .ok_or_else(|| "first relation is unexpectedly empty".to_string())? += 1;
    outcomes.insert(
        "principalRelationFactorExponentAlgebra",
        verify_principal_relation_elements(
            field,
            &factor_base,
            &changed_relations,
            &relation_coordinates,
        )
        .is_err(),
    );

    let mut changed_factor_base = factor_base.clone();
    changed_factor_base.exact_ideals.swap(0, 1);
    outcomes.insert(
        "principalRelationFactorOrderingAlgebra",
        verify_principal_relation_elements(
            field,
            &changed_factor_base,
            &relations,
            &relation_coordinates,
        )
        .is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["analyticCompletion"]["candidateInvariantFactors"] = json!([4]);
    outcomes.insert(
        "invariantFactorDecomposition",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["kernel"]["isSaturated"] = json!(false);
    outcomes.insert(
        "kernelSaturation",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["classMap"]["generatorMajorCoordinates"][0][0] = json!(1);
    outcomes.insert(
        "classMap",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["presentationIndexEvidence"]["squareDeterminant"] = json!("4");
    outcomes.insert(
        "squarePresentationDeterminant",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["relationLatticeEvidence"]["factorBaseCatalog"][0]["prime"] = json!(3);
    counterfeit["classMap"]["generatorOrderFactorBaseCatalog"][0]["prime"] = json!(3);
    outcomes.insert(
        "factorBaseCatalog",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["kernel"]["compactUnits"][0]["factors"][0]["exponent"] = json!("1");
    outcomes.insert(
        "unitDependency",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["reconstructedUnitLattice"]["fundamentalCompactUnits"][0]["factors"][0]["integralBasisCoordinates"]
        [0] = json!("3");
    outcomes.insert(
        "principalGenerator",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["reconstructedUnitLattice"]["fundamentalCompactUnits"][0]["nonzeroCoefficientCount"] =
        json!(878);
    outcomes.insert(
        "fundamentalNonzeroCount",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    let lower: Integer = integer(
        &counterfeit["reconstructedUnitLattice"]["rigorousArbRegulatorEnclosure"]["lowerMantissa"],
        "lowerMantissa",
    )? + 1;
    counterfeit["reconstructedUnitLattice"]["rigorousArbRegulatorEnclosure"]["lowerMantissa"] =
        json!(lower.to_string());
    outcomes.insert(
        "regulatorInterval",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["analyticCompletion"]["threshold"] = json!(23985);
    outcomes.insert(
        "analyticSchedule",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original.clone();
    counterfeit["analyticCompletion"]["candidateClassNumber"] = json!("5");
    outcomes.insert(
        "classNumber",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );

    let mut counterfeit = original;
    counterfeit["analyticCompletion"]["factorBaseGeneration"]["strictMarginEnclosure"]["lowerMantissa"] =
        json!("0");
    outcomes.insert(
        "factorBaseMargin",
        verify(&serde_json::to_vec(&counterfeit).unwrap(), neutral_bytes).is_err(),
    );
    if outcomes.values().any(|accepted| !accepted) {
        return Err("counterfeit suite accepted a mutation".into());
    }
    Ok(json!({
        "schema": "sagejs.rust-class-group/unit-completeness-counterfeit-suite-v1",
        "allRejected": true,
        "mutations": outcomes,
    }))
}

fn main() {
    let arguments = env::args().collect::<Vec<_>>();
    if arguments.len() != 4 || !matches!(arguments[1].as_str(), "verify" | "counterfeit-suite") {
        eprintln!(
            "usage: unit-completeness-replay (verify|counterfeit-suite) EVIDENCE NEUTRAL_INPUT"
        );
        std::process::exit(2);
    }
    let input = fs::read(&arguments[2]).unwrap_or_else(|error| {
        eprintln!("failed to read evidence: {error}");
        std::process::exit(2);
    });
    let neutral = fs::read(&arguments[3]).unwrap_or_else(|error| {
        eprintln!("failed to read neutral input: {error}");
        std::process::exit(2);
    });
    let answer = if arguments[1] == "verify" {
        verify(&input, &neutral)
    } else {
        counterfeit_suite(&input, &neutral)
    };
    match answer {
        Ok(answer) => println!("{}", serde_json::to_string(&answer).unwrap()),
        Err(error) => {
            eprintln!("unit/completeness replay failed: {error}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unique_integer_test_is_closed_and_exact() {
        assert!(interval_has_unique_positive_integer_one(
            &FlintDyadicInterval {
                lower: 3.into(),
                upper: 5.into(),
                binary_exponent: -2,
            }
        ));
        assert!(!interval_has_unique_positive_integer_one(
            &FlintDyadicInterval {
                lower: 0.into(),
                upper: 5.into(),
                binary_exponent: -2,
            }
        ));
        assert!(!interval_has_unique_positive_integer_one(
            &FlintDyadicInterval {
                lower: 3.into(),
                upper: 8.into(),
                binary_exponent: -2,
            }
        ));
    }

    #[test]
    fn strict_fraction_test_is_exact() {
        assert!(interval_strictly_below_fraction(
            &FlintDyadicInterval {
                lower: 1.into(),
                upper: 3.into(),
                binary_exponent: -4,
            },
            4
        ));
        assert!(!interval_strictly_below_fraction(
            &FlintDyadicInterval {
                lower: 1.into(),
                upper: 4.into(),
                binary_exponent: -4,
            },
            4
        ));
    }
}
