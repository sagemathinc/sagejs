// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use rug::{Complete, Integer};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateError(String);

impl CertificateError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl Display for CertificateError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for CertificateError {}

type SparseRow = BTreeMap<usize, i64>;

fn determinant_bareiss(entries: &[Integer], size: usize) -> Result<Integer, CertificateError> {
    if entries.len() != size.saturating_mul(size) {
        return Err(CertificateError::new(
            "determinant matrix has the wrong shape",
        ));
    }
    if size == 0 {
        return Ok(Integer::from(1));
    }
    let mut matrix = entries.to_vec();
    let mut previous = Integer::from(1);
    let mut sign = 1_i32;
    for pivot_column in 0..size.saturating_sub(1) {
        let Some(pivot_row) =
            (pivot_column..size).find(|&row| matrix[row * size + pivot_column] != 0)
        else {
            return Ok(Integer::from(0));
        };
        if pivot_row != pivot_column {
            for column in 0..size {
                matrix.swap(pivot_row * size + column, pivot_column * size + column);
            }
            sign = -sign;
        }
        let pivot = matrix[pivot_column * size + pivot_column].clone();
        for row in pivot_column + 1..size {
            for column in pivot_column + 1..size {
                let mut numerator = Integer::from(&matrix[row * size + column] * &pivot);
                numerator -= Integer::from(
                    &matrix[row * size + pivot_column] * &matrix[pivot_column * size + column],
                );
                let remainder = Integer::from(&numerator % &previous);
                if remainder != 0 {
                    return Err(CertificateError::new(
                        "Bareiss determinant division was not exact",
                    ));
                }
                matrix[row * size + column] = numerator / &previous;
            }
            matrix[row * size + pivot_column] = Integer::from(0);
        }
        previous = pivot;
    }
    let mut result = matrix[(size - 1) * size + size - 1].clone();
    if sign < 0 {
        result = -result;
    }
    Ok(result)
}

fn dependency_minor(
    dependencies: &[Vec<Integer>],
    columns: &[usize],
) -> Result<Integer, CertificateError> {
    let size = dependencies.len();
    if columns.len() != size
        || dependencies
            .iter()
            .any(|dependency| columns.iter().any(|&column| column >= dependency.len()))
    {
        return Err(CertificateError::new("invalid dependency-minor columns"));
    }
    let entries = dependencies
        .iter()
        .flat_map(|dependency| columns.iter().map(|&column| dependency[column].clone()))
        .collect::<Vec<_>>();
    determinant_bareiss(&entries, size)
}

fn modular_basis_columns(dependencies: &[Vec<Integer>], prime: u32) -> Option<Vec<usize>> {
    let rank = dependencies.len();
    let columns = dependencies.first()?.len();
    let mut basis = Vec::<(usize, Vec<u32>, usize)>::with_capacity(rank);
    for column in 0..columns {
        let mut vector = dependencies
            .iter()
            .map(|dependency| {
                let mut residue = Integer::from(&dependency[column] % prime);
                if residue < 0 {
                    residue += prime;
                }
                residue.to_u32_wrapping()
            })
            .collect::<Vec<_>>();
        for (pivot, row, _) in &basis {
            let multiplier = vector[*pivot];
            if multiplier != 0 {
                for index in 0..rank {
                    vector[index] = (vector[index] + prime
                        - ((u64::from(multiplier) * u64::from(row[index])) % u64::from(prime))
                            as u32)
                        % prime;
                }
            }
        }
        let Some(pivot) = vector.iter().position(|&entry| entry != 0) else {
            continue;
        };
        let inverse = (1..prime).find(|candidate| {
            (u64::from(*candidate) * u64::from(vector[pivot])) % u64::from(prime) == 1
        })?;
        for entry in &mut vector {
            *entry = ((u64::from(*entry) * u64::from(inverse)) % u64::from(prime)) as u32;
        }
        basis.push((pivot, vector, column));
        if basis.len() == rank {
            return Some(basis.into_iter().map(|(_, _, column)| column).collect());
        }
    }
    None
}

/// Exhibit a finite subset of maximal dependency minors with gcd one.
///
/// Gcd one for any subset implies gcd one for the set of all maximal minors,
/// which is precisely the saturation index.  The bounded deterministic search
/// may reject a valid primitive lattice, but can never accept a nonprimitive
/// one.
fn saturation_minor_certificate(
    dependencies: &[Vec<Integer>],
    preferred_columns: &[usize],
) -> Result<Vec<(Vec<usize>, Integer)>, CertificateError> {
    let rank = dependencies.len();
    let columns = dependencies.first().map_or(0, Vec::len);
    if rank == 0 || preferred_columns.len() != rank || columns < rank {
        return Err(CertificateError::new("invalid dependency lattice shape"));
    }
    let mut selected = Vec::<(Vec<usize>, Integer)>::new();
    let mut gcd = Integer::from(0);
    let mut consider = |candidate: Vec<usize>| -> Result<bool, CertificateError> {
        let mut canonical = candidate;
        canonical.sort_unstable();
        canonical.dedup();
        if canonical.len() != rank {
            return Ok(false);
        }
        let mut determinant = dependency_minor(dependencies, &canonical)?;
        determinant.abs_mut();
        if determinant == 0 {
            return Ok(false);
        }
        let next_gcd = gcd.gcd_ref(&determinant).complete();
        if next_gcd != gcd {
            gcd = next_gcd;
            selected.push((canonical, determinant));
        }
        Ok(gcd == 1)
    };

    if consider(preferred_columns.to_vec())? {
        return Ok(selected);
    }
    for replacement in 0..columns {
        for position in 0..rank {
            let mut candidate = preferred_columns.to_vec();
            candidate[position] = replacement;
            if consider(candidate)? {
                return Ok(selected);
            }
        }
    }

    // Sparse dependency matrices can make uniformly sampled minors singular
    // with overwhelming probability.  Bases selected by elimination modulo
    // small primes target the residual small factors directly; their exact
    // determinants are still recomputed before they enter the certificate.
    for prime in [2_u32, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31] {
        if let Some(candidate) = modular_basis_columns(dependencies, prime)
            && consider(candidate)?
        {
            return Ok(selected);
        }
    }

    // Fixed generator and bound make this evidence reproducible.  Randomness
    // is only a search strategy: acceptance rests solely on recomputed exact
    // determinants and their gcd.
    let mut state = 0x9e37_79b9_7f4a_7c15_u64
        ^ (columns as u64).rotate_left(17)
        ^ (rank as u64).rotate_left(41);
    for _ in 0..32_768 {
        let mut candidate = Vec::with_capacity(rank);
        while candidate.len() < rank {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let column = (state % columns as u64) as usize;
            if !candidate.contains(&column) {
                candidate.push(column);
            }
        }
        if consider(candidate)? {
            return Ok(selected);
        }
    }
    Err(CertificateError::new(format!(
        "bounded exact minor search did not prove dependency saturation: final gcd {gcd} from {} reducing minors",
        selected.len()
    )))
}

fn member<'a>(value: &'a Value, key: &str) -> Result<&'a Value, CertificateError> {
    value
        .get(key)
        .ok_or_else(|| CertificateError::new(format!("missing `{key}`")))
}

fn array<'a>(value: &'a Value, label: &str) -> Result<&'a [Value], CertificateError> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| CertificateError::new(format!("`{label}` is not an array")))
}

fn usize_value(value: &Value, label: &str) -> Result<usize, CertificateError> {
    value
        .as_u64()
        .and_then(|number| usize::try_from(number).ok())
        .ok_or_else(|| CertificateError::new(format!("`{label}` is not a usize")))
}

fn i64_value(value: &Value, label: &str) -> Result<i64, CertificateError> {
    value
        .as_i64()
        .ok_or_else(|| CertificateError::new(format!("`{label}` is not an i64")))
}

fn integer_string(value: &Value, label: &str) -> Result<Integer, CertificateError> {
    let text = value
        .as_str()
        .ok_or_else(|| CertificateError::new(format!("`{label}` is not an integer string")))?;
    Integer::from_str_radix(text, 10)
        .map_err(|_| CertificateError::new(format!("`{label}` is not an integer string")))
}

fn modular_inverse(value: i64, modulus: i64) -> Option<i64> {
    let (mut old_r, mut r) = (value.rem_euclid(modulus), modulus);
    let (mut old_s, mut s) = (1_i64, 0_i64);
    while r != 0 {
        let quotient = old_r / r;
        (old_r, r) = (r, old_r - quotient * r);
        (old_s, s) = (s, old_s - quotient * s);
    }
    (old_r == 1).then(|| old_s.rem_euclid(modulus))
}

fn parse_relations(
    input: &Value,
    rows: usize,
    columns: usize,
) -> Result<Vec<SparseRow>, CertificateError> {
    let records = array(
        member(member(input, "relationLatticeEvidence")?, "relationRecords")?,
        "relationRecords",
    )?;
    if records.len() != rows {
        return Err(CertificateError::new(
            "relation record count does not match `relations.rows`",
        ));
    }
    let mut result = vec![SparseRow::new(); rows];
    for record in records {
        let row = usize_value(member(record, "relationIndexZeroBased")?, "relation index")?;
        if row >= rows || !result[row].is_empty() {
            return Err(CertificateError::new(
                "relation indices are duplicated or outside the matrix",
            ));
        }
        for factor in array(member(record, "primeIdealFactors")?, "primeIdealFactors")? {
            let column = usize_value(
                member(factor, "factorBaseIndexZeroBased")?,
                "factor-base index",
            )?;
            let exponent = i64_value(member(factor, "exponent")?, "relation exponent")?;
            if column >= columns || exponent == 0 || result[row].insert(column, exponent).is_some()
            {
                return Err(CertificateError::new(
                    "invalid or duplicate sparse relation entry",
                ));
            }
        }
        if result[row].is_empty() {
            return Err(CertificateError::new("empty relation row"));
        }
    }
    Ok(result)
}

fn sparse_combination(
    factors: &[Value],
    relations: &[SparseRow],
) -> Result<(Vec<Value>, BTreeMap<usize, Integer>), CertificateError> {
    let mut terms = Vec::with_capacity(factors.len());
    let mut result = BTreeMap::<usize, Integer>::new();
    let mut seen = BTreeMap::<usize, ()>::new();
    for factor in factors {
        let row = usize_value(member(factor, "relationIndexZeroBased")?, "relation index")?;
        if row >= relations.len() || seen.insert(row, ()).is_some() {
            return Err(CertificateError::new(
                "invalid or duplicate relation-combination term",
            ));
        }
        let coefficient = integer_string(member(factor, "exponent")?, "combination exponent")?;
        if coefficient == 0 {
            return Err(CertificateError::new("zero sparse combination coefficient"));
        }
        for (&column, &entry) in &relations[row] {
            *result.entry(column).or_default() += &coefficient * entry;
        }
        terms.push(json!({
            "relationIndexZeroBased": row,
            "coefficient": coefficient.to_string(),
        }));
    }
    result.retain(|_, value| value != &0);
    Ok((terms, result))
}

pub fn produce_compact_certificate(input: &Value) -> Result<Value, CertificateError> {
    if member(input, "schema")?.as_str()
        != Some("sagejs.rust-class-group/prepared-cubic-class-unit-v2")
    {
        return Err(CertificateError::new(
            "input is not prepared-cubic class/unit v2 evidence",
        ));
    }
    let shape = member(input, "relations")?;
    let rows = usize_value(member(shape, "rows")?, "relations.rows")?;
    let columns = usize_value(member(shape, "columns")?, "relations.columns")?;
    if rows < columns {
        return Err(CertificateError::new(
            "relation matrix has fewer rows than columns",
        ));
    }
    let relations = parse_relations(input, rows, columns)?;

    let analytic = member(input, "analyticCompletion")?;
    let invariant_values = array(
        member(analytic, "candidateInvariantFactors")?,
        "candidateInvariantFactors",
    )?;
    let mut invariants = Vec::with_capacity(invariant_values.len());
    let mut group_order = Integer::from(1);
    for value in invariant_values {
        let modulus = i64_value(value, "invariant factor")?;
        if modulus <= 1 {
            return Err(CertificateError::new("invariant factors must exceed one"));
        }
        if invariants
            .last()
            .is_some_and(|previous: &i64| modulus % *previous != 0)
        {
            return Err(CertificateError::new(
                "invariant factors are not a divisibility chain",
            ));
        }
        invariants.push(modulus);
        group_order *= modulus;
    }
    let claimed_order = integer_string(
        member(analytic, "candidateClassNumber")?,
        "candidateClassNumber",
    )?;
    if claimed_order != group_order {
        return Err(CertificateError::new(
            "invariant-factor product does not equal class number",
        ));
    }

    let class_map = member(input, "classMap")?;
    let map_values = array(
        member(class_map, "generatorMajorCoordinates")?,
        "class-map rows",
    )?;
    if map_values.len() != columns {
        return Err(CertificateError::new(
            "class-map row count does not match relation columns",
        ));
    }
    let mut map = Vec::<Vec<i64>>::with_capacity(columns);
    let mut emitted_map = Vec::with_capacity(columns);
    for (generator, values) in map_values.iter().enumerate() {
        let values = array(values, "class-map row")?;
        if values.len() != invariants.len() {
            return Err(CertificateError::new(
                "class-map width does not match invariant count",
            ));
        }
        let mut row = Vec::with_capacity(values.len());
        for (coordinate, value) in values.iter().enumerate() {
            row.push(i64_value(value, "class-map residue")?.rem_euclid(invariants[coordinate]));
        }
        emitted_map.push(json!({
            "factorBaseIndexZeroBased": generator,
            "residues": row,
        }));
        map.push(row);
    }
    for relation in &relations {
        for (coordinate, &modulus) in invariants.iter().enumerate() {
            let residue = relation
                .iter()
                .fold(0_i128, |sum, (&generator, &exponent)| {
                    sum + i128::from(exponent) * i128::from(map[generator][coordinate])
                });
            if residue.rem_euclid(i128::from(modulus)) != 0 {
                return Err(CertificateError::new(
                    "class map does not annihilate every relation",
                ));
            }
        }
    }

    let selected = array(
        member(class_map, "selectedGeneratorIndicesZeroBased")?,
        "selectedGeneratorIndicesZeroBased",
    )?;
    let order_witnesses = array(
        member(class_map, "generatorOrderRelations")?,
        "generatorOrderRelations",
    )?;
    if selected.len() != invariants.len() || order_witnesses.len() != invariants.len() {
        return Err(CertificateError::new(
            "standard lifts or order witnesses have the wrong count",
        ));
    }
    let mut lifts = Vec::with_capacity(invariants.len());
    for coordinate in 0..invariants.len() {
        let generator = usize_value(&selected[coordinate], "selected generator index")?;
        if generator >= columns {
            return Err(CertificateError::new(
                "selected generator is outside the factor base",
            ));
        }
        let residue = map[generator][coordinate];
        if map[generator]
            .iter()
            .enumerate()
            .any(|(index, &value)| index != coordinate && value != 0)
        {
            return Err(CertificateError::new(
                "selected lift has a nonzero off-coordinate image",
            ));
        }
        let inverse = modular_inverse(residue, invariants[coordinate])
            .ok_or_else(|| CertificateError::new("selected lift is not primitive"))?;
        let witness = &order_witnesses[coordinate];
        if usize_value(
            member(witness, "generatorCoordinateZeroBased")?,
            "witness coordinate",
        )? != coordinate
            || usize_value(
                member(witness, "factorBaseIndexZeroBased")?,
                "witness generator",
            )? != generator
            || i64_value(member(witness, "order")?, "witness order")? != invariants[coordinate]
        {
            return Err(CertificateError::new(
                "order witness metadata disagrees with the lift",
            ));
        }
        let (terms, replay) = sparse_combination(
            array(member(witness, "factors")?, "order witness factors")?,
            &relations,
        )?;
        if replay.len() != 1
            || replay.get(&generator) != Some(&Integer::from(invariants[coordinate]))
        {
            return Err(CertificateError::new(
                "order witness does not replay to order times its ideal",
            ));
        }
        lifts.push(json!({
            "coordinateZeroBased": coordinate,
            "modulus": invariants[coordinate].to_string(),
            "factorBaseLift": [{
                "factorBaseIndexZeroBased": generator,
                "coefficient": inverse.to_string(),
            }],
            "orderRelationCombination": terms,
        }));
    }

    let compact_units = array(
        member(member(input, "kernel")?, "compactUnits")?,
        "kernel.compactUnits",
    )?;
    let dependency_rank = rows - columns;
    if compact_units.len() != dependency_rank {
        return Err(CertificateError::new("dependency count is not m-n"));
    }
    let mut dependencies = Vec::with_capacity(dependency_rank);
    let mut dependency_vectors = Vec::with_capacity(dependency_rank);
    for (expected, dependency) in compact_units.iter().enumerate() {
        if usize_value(member(dependency, "dependencyIndex")?, "dependency index")? != expected {
            return Err(CertificateError::new(
                "dependency indices are not canonical",
            ));
        }
        let factors = array(member(dependency, "factors")?, "dependency factors")?;
        let (terms, replay) = sparse_combination(factors, &relations)?;
        if !replay.is_empty() {
            return Err(CertificateError::new("dependency does not replay to zero"));
        }
        let mut vector = vec![Integer::from(0); rows];
        for factor in factors {
            let row = usize_value(member(factor, "relationIndexZeroBased")?, "relation index")?;
            if vector[row] != 0 {
                return Err(CertificateError::new("duplicate dependency relation index"));
            }
            vector[row] = integer_string(member(factor, "exponent")?, "dependency exponent")?;
        }
        dependency_vectors.push(vector);
        dependencies.push(json!({
            "dependencyIndexZeroBased": expected,
            "terms": terms,
        }));
    }

    let presentation = member(input, "presentationIndexEvidence")?;
    let square_rows = array(
        member(presentation, "squareRowIndicesZeroBased")?,
        "squareRowIndicesZeroBased",
    )?
    .iter()
    .map(|value| usize_value(value, "square row index"))
    .collect::<Result<Vec<_>, _>>()?;
    let surplus_rows = array(
        member(presentation, "surplusRowIndicesZeroBased")?,
        "surplusRowIndicesZeroBased",
    )?
    .iter()
    .map(|value| usize_value(value, "surplus row index"))
    .collect::<Result<Vec<_>, _>>()?;
    if square_rows.len() != columns || surplus_rows.len() != dependency_rank {
        return Err(CertificateError::new(
            "presentation row partition has the wrong shape",
        ));
    }
    let mut row_partition = square_rows
        .iter()
        .chain(&surplus_rows)
        .copied()
        .collect::<Vec<_>>();
    row_partition.sort_unstable();
    if row_partition != (0..rows).collect::<Vec<_>>() {
        return Err(CertificateError::new(
            "presentation rows do not partition the relation matrix",
        ));
    }
    let square_determinant = integer_string(
        member(presentation, "squareDeterminant")?,
        "squareDeterminant",
    )?;
    if square_determinant <= 0 {
        return Err(CertificateError::new("square determinant must be positive"));
    }
    let projected = dependency_vectors
        .iter()
        .flat_map(|dependency| surplus_rows.iter().map(|&row| dependency[row].clone()))
        .collect::<Vec<_>>();
    let mut kernel_index = determinant_bareiss(&projected, dependency_rank)?;
    kernel_index.abs_mut();
    if kernel_index == 0 {
        return Err(CertificateError::new(
            "projected dependency matrix is singular",
        ));
    }
    let saturation_minors = saturation_minor_certificate(&dependency_vectors, &surplus_rows)?;
    let remainder = Integer::from(&square_determinant % &kernel_index);
    if remainder != 0 {
        return Err(CertificateError::new(
            "dependency projection index does not divide the square determinant",
        ));
    }
    let full_index = Integer::from(&square_determinant / &kernel_index);
    if full_index != group_order {
        return Err(CertificateError::new(
            "certified relation-lattice index does not equal the group order",
        ));
    }
    let emitted_minors = saturation_minors
        .iter()
        .map(|(minor_columns, determinant)| {
            json!({
                "relationRowIndicesZeroBased": minor_columns,
                "determinant": determinant.to_string(),
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "schema": "sagejs.rust-class-group/compact-presentation-certificate-v1",
        "qualificationStatus": "closed-exact-lattice-index-certificate",
        "sourceInputId": member(input, "inputId")?,
        "relationShape": { "rows": rows, "columns": columns },
        "invariantFactors": invariants.iter().map(ToString::to_string).collect::<Vec<_>>(),
        "groupOrder": group_order.to_string(),
        "modularClassMap": {
            "moduli": invariants.iter().map(ToString::to_string).collect::<Vec<_>>(),
            "rows": emitted_map,
        },
        "standardGeneratorLifts": lifts,
        "relationDependencies": dependencies,
        "latticeIndexEvidence": {
            "squareRowIndicesZeroBased": square_rows,
            "surplusRowIndicesZeroBased": surplus_rows,
            "squareDeterminant": square_determinant.to_string(),
            "projectedDependencyDeterminant": kernel_index.to_string(),
            "dependencySaturation": {
                "criterion": "gcd-of-exhibited-maximal-dependency-minors-is-one",
                "selectedMinors": emitted_minors,
                "gcd": "1",
            },
            "fullRelationLatticeIndex": full_index.to_string(),
        },
        "verified": {
            "invariantProductEqualsClaimedClassNumber": true,
            "classMapAnnihilatesEveryRelation": true,
            "standardGeneratorLiftsMapToCoordinateBasis": true,
            "generatorOrderWitnessesReplayExactly": true,
            "dependencyCountEqualsRowsMinusColumns": true,
            "everyDependencyReplaysToZero": true,
            "dependencyRankEqualsRowsMinusColumns": true,
            "dependencyLatticeIsPrimitive": true,
            "dependencyLatticeEqualsIntegralLeftKernel": true,
            "projectedDependencyIndexDividesSquareDeterminant": true,
            "fullRelationLatticeIndexEqualsGroupOrder": true,
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Value {
        json!({
            "schema": "sagejs.rust-class-group/prepared-cubic-class-unit-v2",
            "inputId": "sha256:test",
            "relations": { "rows": 3, "columns": 2 },
            "presentationIndexEvidence": {
                "squareRowIndicesZeroBased": [0, 1],
                "surplusRowIndicesZeroBased": [2],
                "squareDeterminant": "2"
            },
            "relationLatticeEvidence": {
                "relationRecords": [
                    {"relationIndexZeroBased": 0, "primeIdealFactors": [{"factorBaseIndexZeroBased": 0, "exponent": 2}]},
                    {"relationIndexZeroBased": 1, "primeIdealFactors": [{"factorBaseIndexZeroBased": 1, "exponent": 1}]},
                    {"relationIndexZeroBased": 2, "primeIdealFactors": [{"factorBaseIndexZeroBased": 1, "exponent": 1}]}
                ]
            },
            "analyticCompletion": {
                "candidateClassNumber": "2",
                "candidateInvariantFactors": [2]
            },
            "classMap": {
                "generatorMajorCoordinates": [[1], [0]],
                "selectedGeneratorIndicesZeroBased": [0],
                "generatorOrderRelations": [{
                    "generatorCoordinateZeroBased": 0,
                    "factorBaseIndexZeroBased": 0,
                    "order": 2,
                    "factors": [{"relationIndexZeroBased": 0, "exponent": "1"}]
                }]
            },
            "kernel": {
                "compactUnits": [{
                    "dependencyIndex": 0,
                    "factors": [
                        {"relationIndexZeroBased": 1, "exponent": "1"},
                        {"relationIndexZeroBased": 2, "exponent": "-1"}
                    ]
                }]
            }
        })
    }

    #[test]
    fn closes_the_exact_lattice_index_certificate() {
        let certificate = produce_compact_certificate(&fixture()).unwrap();
        assert_eq!(certificate["groupOrder"], "2");
        assert_eq!(
            certificate["relationDependencies"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            certificate["latticeIndexEvidence"]["fullRelationLatticeIndex"],
            "2"
        );
        assert_eq!(
            certificate["verified"]["dependencyLatticeIsPrimitive"],
            true
        );
    }

    #[test]
    fn rejects_a_counterfeit_class_map() {
        let mut input = fixture();
        input["classMap"]["generatorMajorCoordinates"][1][0] = json!(1);
        assert!(
            produce_compact_certificate(&input)
                .unwrap_err()
                .to_string()
                .contains("annihilate")
        );
    }

    #[test]
    fn rejects_a_counterfeit_dependency() {
        let mut input = fixture();
        input["kernel"]["compactUnits"][0]["factors"][1]["exponent"] = json!("1");
        assert!(
            produce_compact_certificate(&input)
                .unwrap_err()
                .to_string()
                .contains("dependency")
        );
    }

    #[test]
    fn rejects_a_nonsaturated_dependency_even_when_it_replays() {
        let mut input = fixture();
        input["kernel"]["compactUnits"][0]["factors"][0]["exponent"] = json!("2");
        input["kernel"]["compactUnits"][0]["factors"][1]["exponent"] = json!("-2");
        assert!(
            produce_compact_certificate(&input)
                .unwrap_err()
                .to_string()
                .contains("saturation")
        );
    }

    #[test]
    fn saturation_certificate_need_not_contain_a_unit_minor() {
        let input = json!({
            "schema": "sagejs.rust-class-group/prepared-cubic-class-unit-v2",
            "inputId": "sha256:primitive-without-unit-minor",
            "relations": { "rows": 2, "columns": 1 },
            "presentationIndexEvidence": {
                "squareRowIndicesZeroBased": [0],
                "surplusRowIndicesZeroBased": [1],
                "squareDeterminant": "3"
            },
            "relationLatticeEvidence": {
                "relationRecords": [
                    {"relationIndexZeroBased": 0, "primeIdealFactors": [{"factorBaseIndexZeroBased": 0, "exponent": 3}]},
                    {"relationIndexZeroBased": 1, "primeIdealFactors": [{"factorBaseIndexZeroBased": 0, "exponent": -2}]}
                ]
            },
            "analyticCompletion": {
                "candidateClassNumber": "1",
                "candidateInvariantFactors": []
            },
            "classMap": {
                "generatorMajorCoordinates": [[]],
                "selectedGeneratorIndicesZeroBased": [],
                "generatorOrderRelations": []
            },
            "kernel": {
                "compactUnits": [{
                    "dependencyIndex": 0,
                    "factors": [
                        {"relationIndexZeroBased": 0, "exponent": "2"},
                        {"relationIndexZeroBased": 1, "exponent": "3"}
                    ]
                }]
            }
        });
        let certificate = produce_compact_certificate(&input).unwrap();
        let minors = certificate["latticeIndexEvidence"]["dependencySaturation"]["selectedMinors"]
            .as_array()
            .unwrap();
        assert_eq!(minors.len(), 2);
        assert!(minors.iter().all(|minor| minor["determinant"] != "1"));
    }

    #[test]
    fn bareiss_determinant_retains_forced_large_intermediates() {
        let large: Integer = Integer::from(1) << 400;
        let entries = vec![
            large.clone(),
            Integer::from(&large - 1),
            Integer::from(&large + 1),
            large,
        ];
        assert_eq!(determinant_bareiss(&entries, 2).unwrap(), 1);
    }
}
