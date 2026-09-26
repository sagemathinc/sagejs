// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Qualification-only right inverses for authenticated compact relation data.

use rug::{Complete, Integer};
use sagejs_class_group::{
    FlintSmallSurplusWorkspace, flint_small_surplus_class_order_with_workspace,
};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};

const PREPARED_SCHEMA: &str = "sagejs.rust-class-group/prepared-cubic-class-unit-v2";
const CERTIFICATE_SCHEMA: &str = "sagejs.rust-class-group/compact-presentation-certificate-v1";

type SparseRow = BTreeMap<usize, i64>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LiftError {
    Malformed(String),
    Counterfeit(String),
    NonPrincipal {
        factor_base_index: usize,
        residues: Vec<i64>,
    },
    Solver(String),
}

impl Display for LiftError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Malformed(message) => write!(formatter, "malformed evidence: {message}"),
            Self::Counterfeit(message) => write!(formatter, "counterfeit evidence: {message}"),
            Self::NonPrincipal {
                factor_base_index,
                residues,
            } => write!(
                formatter,
                "factor-base row {factor_base_index} is nonprincipal (class residues {residues:?})"
            ),
            Self::Solver(message) => write!(formatter, "exact lift solver failed: {message}"),
        }
    }
}

impl std::error::Error for LiftError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SparseCoefficient {
    pub relation_index: usize,
    pub coefficient: Integer,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrincipalLift {
    pub factor_base_index: usize,
    pub coefficients: Vec<SparseCoefficient>,
}

pub struct QualifiedPresentation {
    columns: usize,
    rows: Vec<SparseRow>,
    class_map: Vec<Vec<i64>>,
    solver_to_source_rows: Vec<usize>,
    workspace: FlintSmallSurplusWorkspace,
}

fn member<'a>(value: &'a Value, key: &str) -> Result<&'a Value, LiftError> {
    value
        .get(key)
        .ok_or_else(|| LiftError::Malformed(format!("missing `{key}`")))
}

fn array<'a>(value: &'a Value, label: &str) -> Result<&'a [Value], LiftError> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| LiftError::Malformed(format!("`{label}` is not an array")))
}

fn usize_value(value: &Value, label: &str) -> Result<usize, LiftError> {
    value
        .as_u64()
        .and_then(|entry| usize::try_from(entry).ok())
        .ok_or_else(|| LiftError::Malformed(format!("`{label}` is not a usize")))
}

fn i64_value(value: &Value, label: &str) -> Result<i64, LiftError> {
    value
        .as_i64()
        .ok_or_else(|| LiftError::Malformed(format!("`{label}` is not an i64")))
}

fn integer_string(value: &Value, label: &str) -> Result<Integer, LiftError> {
    let text = value
        .as_str()
        .ok_or_else(|| LiftError::Malformed(format!("`{label}` is not an integer string")))?;
    if text == "0"
        || text.starts_with("-0")
        || text.starts_with('+')
        || text.is_empty()
        || text
            .strip_prefix('-')
            .unwrap_or(text)
            .chars()
            .any(|character| !character.is_ascii_digit())
    {
        return Err(LiftError::Malformed(format!(
            "`{label}` is not a canonical nonzero integer string"
        )));
    }
    Integer::from_str_radix(text, 10)
        .map_err(|_| LiftError::Malformed(format!("`{label}` is not an integer string")))
}

fn positive_integer_string(value: &Value, label: &str) -> Result<Integer, LiftError> {
    let answer = integer_string(value, label)?;
    if answer <= 0 {
        return Err(LiftError::Malformed(format!("`{label}` is not positive")));
    }
    Ok(answer)
}

fn parse_relations(
    input: &Value,
    rows: usize,
    columns: usize,
) -> Result<Vec<SparseRow>, LiftError> {
    let records = array(
        member(member(input, "relationLatticeEvidence")?, "relationRecords")?,
        "relation records",
    )?;
    if records.len() != rows {
        return Err(LiftError::Malformed(
            "relation record count mismatch".into(),
        ));
    }
    records
        .iter()
        .enumerate()
        .map(|(expected, record)| {
            if usize_value(member(record, "relationIndexZeroBased")?, "relation index")? != expected
            {
                return Err(LiftError::Malformed(
                    "relation indices are not contiguous".into(),
                ));
            }
            let mut row = SparseRow::new();
            for term in array(member(record, "primeIdealFactors")?, "relation factors")? {
                let column = usize_value(
                    member(term, "factorBaseIndexZeroBased")?,
                    "factor-base index",
                )?;
                let exponent = i64_value(member(term, "exponent")?, "relation exponent")?;
                if column >= columns || exponent == 0 || row.insert(column, exponent).is_some() {
                    return Err(LiftError::Malformed(
                        "invalid sparse relation factor".into(),
                    ));
                }
            }
            Ok(row)
        })
        .collect()
}

fn parse_indices(value: &Value, label: &str) -> Result<Vec<usize>, LiftError> {
    array(value, label)?
        .iter()
        .map(|entry| usize_value(entry, label))
        .collect()
}

fn dense_rows(
    rows: &[SparseRow],
    indices: &[usize],
    columns: usize,
) -> Result<Vec<i64>, LiftError> {
    let cells = indices
        .len()
        .checked_mul(columns)
        .ok_or_else(|| LiftError::Malformed("dense relation shape overflows usize".into()))?;
    let mut dense = vec![0_i64; cells];
    for (target_row, &source_row) in indices.iter().enumerate() {
        let row = rows
            .get(source_row)
            .ok_or_else(|| LiftError::Malformed("presentation row index is out of range".into()))?;
        for (&column, &entry) in row {
            dense[target_row * columns + column] = entry;
        }
    }
    Ok(dense)
}

fn sparse_combination(
    terms: &Value,
    rows: &[SparseRow],
    columns: usize,
) -> Result<(Vec<Integer>, BTreeMap<usize, Integer>), LiftError> {
    let mut coefficients = vec![Integer::from(0); rows.len()];
    let mut replay = BTreeMap::<usize, Integer>::new();
    for term in array(terms, "combination terms")? {
        let row = usize_value(member(term, "relationIndexZeroBased")?, "relation index")?;
        let coefficient = integer_string(member(term, "coefficient")?, "coefficient")?;
        if row >= rows.len() || coefficients[row] != 0 {
            return Err(LiftError::Malformed(
                "duplicate or out-of-range combination term".into(),
            ));
        }
        coefficients[row] = coefficient.clone();
        for (&column, &entry) in &rows[row] {
            *replay.entry(column).or_default() += &coefficient * entry;
        }
    }
    replay.retain(|column, value| *column < columns && value != &0);
    Ok((coefficients, replay))
}

fn determinant_bareiss(entries: &[Integer], size: usize) -> Result<Integer, LiftError> {
    if entries.len()
        != size
            .checked_mul(size)
            .ok_or_else(|| LiftError::Malformed("determinant shape overflows usize".into()))?
    {
        return Err(LiftError::Malformed("determinant shape mismatch".into()));
    }
    if size == 0 {
        return Ok(Integer::from(1));
    }
    let mut matrix = entries.to_vec();
    let mut previous = Integer::from(1);
    let mut sign = 1;
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
                let numerator = Integer::from(&matrix[row * size + column] * &pivot)
                    - Integer::from(
                        &matrix[row * size + pivot_column] * &matrix[pivot_column * size + column],
                    );
                if Integer::from(&numerator % &previous) != 0 {
                    return Err(LiftError::Counterfeit("nonexact Bareiss division".into()));
                }
                matrix[row * size + column] = numerator / &previous;
            }
            matrix[row * size + pivot_column] = Integer::from(0);
        }
        previous = pivot;
    }
    let mut answer = matrix[(size - 1) * size + size - 1].clone();
    if sign < 0 {
        answer = -answer;
    }
    Ok(answer)
}

fn verify_certificate(
    input: &Value,
    certificate: &Value,
    rows: &[SparseRow],
    row_count: usize,
    columns: usize,
) -> Result<(Vec<Vec<i64>>, Vec<usize>, Vec<usize>, Integer), LiftError> {
    if member(certificate, "schema")?.as_str() != Some(CERTIFICATE_SCHEMA)
        || member(certificate, "qualificationStatus")?.as_str()
            != Some("closed-exact-lattice-index-certificate")
    {
        return Err(LiftError::Malformed(
            "unsupported compact certificate".into(),
        ));
    }
    if member(certificate, "sourceInputId")? != member(input, "inputId")? {
        return Err(LiftError::Counterfeit("input identity mismatch".into()));
    }
    let shape = member(certificate, "relationShape")?;
    if usize_value(member(shape, "rows")?, "certificate rows")? != row_count
        || usize_value(member(shape, "columns")?, "certificate columns")? != columns
    {
        return Err(LiftError::Counterfeit("relation shape mismatch".into()));
    }

    let invariant_values = array(member(certificate, "invariantFactors")?, "invariants")?;
    let invariants = invariant_values
        .iter()
        .map(|entry| positive_integer_string(entry, "invariant"))
        .collect::<Result<Vec<_>, _>>()?;
    let invariant_i64 = invariants
        .iter()
        .map(|entry| {
            entry
                .to_i64()
                .ok_or_else(|| LiftError::Malformed("invariant exceeds i64".into()))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let product = invariants
        .iter()
        .fold(Integer::from(1), |answer, value| answer * value);
    let group_order = positive_integer_string(member(certificate, "groupOrder")?, "group order")?;
    if product != group_order {
        return Err(LiftError::Counterfeit("invariant product mismatch".into()));
    }

    let modular_map = member(certificate, "modularClassMap")?;
    if member(modular_map, "moduli")? != member(certificate, "invariantFactors")? {
        return Err(LiftError::Counterfeit("class-map moduli mismatch".into()));
    }
    let map_rows = array(member(modular_map, "rows")?, "class-map rows")?;
    if map_rows.len() != columns {
        return Err(LiftError::Counterfeit(
            "class-map row count mismatch".into(),
        ));
    }
    let mut class_map = Vec::with_capacity(columns);
    for (expected, map_row) in map_rows.iter().enumerate() {
        if usize_value(
            member(map_row, "factorBaseIndexZeroBased")?,
            "map row index",
        )? != expected
        {
            return Err(LiftError::Malformed(
                "class-map rows are not contiguous".into(),
            ));
        }
        let residues = array(member(map_row, "residues")?, "class residues")?
            .iter()
            .enumerate()
            .map(|(coordinate, entry)| {
                let value = i64_value(entry, "class residue")?;
                if coordinate >= invariant_i64.len()
                    || value < 0
                    || value >= invariant_i64[coordinate]
                {
                    return Err(LiftError::Malformed("noncanonical class residue".into()));
                }
                Ok(value)
            })
            .collect::<Result<Vec<_>, _>>()?;
        if residues.len() != invariants.len() {
            return Err(LiftError::Malformed("class-map width mismatch".into()));
        }
        class_map.push(residues);
    }
    for row in rows {
        for (coordinate, modulus) in invariant_i64.iter().enumerate() {
            let image = row.iter().fold(0_i128, |sum, (&column, &entry)| {
                sum + i128::from(entry) * i128::from(class_map[column][coordinate])
            });
            if image.rem_euclid(i128::from(*modulus)) != 0 {
                return Err(LiftError::Counterfeit(
                    "class map does not annihilate every relation".into(),
                ));
            }
        }
    }

    let lifts = array(
        member(certificate, "standardGeneratorLifts")?,
        "standard generator lifts",
    )?;
    if lifts.len() != invariants.len() {
        return Err(LiftError::Counterfeit(
            "standard-generator lift count mismatch".into(),
        ));
    }
    for (coordinate, lift) in lifts.iter().enumerate() {
        if usize_value(member(lift, "coordinateZeroBased")?, "lift coordinate")? != coordinate
            || positive_integer_string(member(lift, "modulus")?, "lift modulus")?
                != invariants[coordinate]
        {
            return Err(LiftError::Counterfeit(
                "standard-generator lift metadata mismatch".into(),
            ));
        }
        let ambient_terms = array(member(lift, "factorBaseLift")?, "factor-base lift")?;
        if ambient_terms.len() != 1 {
            return Err(LiftError::Malformed(
                "a standard-generator lift must contain one term".into(),
            ));
        }
        let generator = usize_value(
            member(&ambient_terms[0], "factorBaseIndexZeroBased")?,
            "lift factor-base index",
        )?;
        let coefficient = integer_string(
            member(&ambient_terms[0], "coefficient")?,
            "lift coefficient",
        )?;
        if generator >= columns {
            return Err(LiftError::Malformed(
                "lift factor-base index is out of range".into(),
            ));
        }
        for (image_coordinate, modulus) in invariants.iter().enumerate() {
            let mut image = Integer::from(&coefficient * class_map[generator][image_coordinate]);
            image %= modulus;
            if image < 0 {
                image += modulus;
            }
            let expected = usize::from(image_coordinate == coordinate);
            if image != expected {
                return Err(LiftError::Counterfeit(
                    "standard-generator lift does not map to a coordinate basis vector".into(),
                ));
            }
        }
        let (_, replay) =
            sparse_combination(member(lift, "orderRelationCombination")?, rows, columns)?;
        let expected = Integer::from(&coefficient * &invariants[coordinate]);
        if replay.len() != 1 || replay.get(&generator) != Some(&expected) {
            return Err(LiftError::Counterfeit(
                "standard-generator order witness does not replay".into(),
            ));
        }
    }

    let dependencies = array(member(certificate, "relationDependencies")?, "dependencies")?;
    let surplus = row_count - columns;
    if dependencies.len() != surplus {
        return Err(LiftError::Counterfeit("dependency count mismatch".into()));
    }
    let mut dependency_vectors = Vec::with_capacity(surplus);
    for (expected, dependency) in dependencies.iter().enumerate() {
        if usize_value(
            member(dependency, "dependencyIndexZeroBased")?,
            "dependency index",
        )? != expected
        {
            return Err(LiftError::Malformed(
                "dependency indices are not contiguous".into(),
            ));
        }
        let (coefficients, replay) =
            sparse_combination(member(dependency, "terms")?, rows, columns)?;
        if !replay.is_empty() {
            return Err(LiftError::Counterfeit(
                "dependency does not replay to zero".into(),
            ));
        }
        dependency_vectors.push(coefficients);
    }

    let evidence = member(certificate, "latticeIndexEvidence")?;
    let square_rows = parse_indices(
        member(evidence, "squareRowIndicesZeroBased")?,
        "square rows",
    )?;
    let surplus_rows = parse_indices(
        member(evidence, "surplusRowIndicesZeroBased")?,
        "surplus rows",
    )?;
    if square_rows.len() != columns || surplus_rows.len() != surplus {
        return Err(LiftError::Counterfeit(
            "row partition shape mismatch".into(),
        ));
    }
    let mut partition = square_rows
        .iter()
        .chain(&surplus_rows)
        .copied()
        .collect::<Vec<_>>();
    partition.sort_unstable();
    if partition != (0..row_count).collect::<Vec<_>>() {
        return Err(LiftError::Counterfeit(
            "rows do not form a partition".into(),
        ));
    }
    let projected = dependency_vectors
        .iter()
        .flat_map(|dependency| surplus_rows.iter().map(|&row| dependency[row].clone()))
        .collect::<Vec<_>>();
    let mut projected_determinant = determinant_bareiss(&projected, surplus)?;
    projected_determinant.abs_mut();
    if projected_determinant
        != positive_integer_string(
            member(evidence, "projectedDependencyDeterminant")?,
            "projected dependency determinant",
        )?
    {
        return Err(LiftError::Counterfeit(
            "projected dependency determinant mismatch".into(),
        ));
    }
    let saturation = member(evidence, "dependencySaturation")?;
    if member(saturation, "criterion")?.as_str()
        != Some("gcd-of-exhibited-maximal-dependency-minors-is-one")
        || member(saturation, "gcd")?.as_str() != Some("1")
    {
        return Err(LiftError::Malformed("unsupported saturation proof".into()));
    }
    let mut minor_gcd = Integer::from(0);
    for minor in array(member(saturation, "selectedMinors")?, "selected minors")? {
        let indices = parse_indices(
            member(minor, "relationRowIndicesZeroBased")?,
            "minor columns",
        )?;
        if indices.len() != surplus || indices.windows(2).any(|pair| pair[0] >= pair[1]) {
            return Err(LiftError::Malformed(
                "invalid dependency minor columns".into(),
            ));
        }
        let entries = dependency_vectors
            .iter()
            .flat_map(|dependency| indices.iter().map(|&index| dependency[index].clone()))
            .collect::<Vec<_>>();
        let mut determinant = determinant_bareiss(&entries, surplus)?;
        determinant.abs_mut();
        if determinant
            != positive_integer_string(member(minor, "determinant")?, "minor determinant")?
        {
            return Err(LiftError::Counterfeit("dependency minor mismatch".into()));
        }
        minor_gcd = minor_gcd.gcd_ref(&determinant).complete();
    }
    if minor_gcd != 1 {
        return Err(LiftError::Counterfeit(
            "dependency lattice is not proven primitive".into(),
        ));
    }
    Ok((class_map, square_rows, surplus_rows, group_order))
}

impl QualifiedPresentation {
    pub fn from_documents(input: &Value, certificate: &Value) -> Result<Self, LiftError> {
        if member(input, "schema")?.as_str() != Some(PREPARED_SCHEMA) {
            return Err(LiftError::Malformed("unsupported prepared evidence".into()));
        }
        let shape = member(input, "relations")?;
        let row_count = usize_value(member(shape, "rows")?, "relation rows")?;
        let columns = usize_value(member(shape, "columns")?, "relation columns")?;
        if row_count <= columns || columns == 0 {
            return Err(LiftError::Malformed("invalid small-surplus shape".into()));
        }
        let rows = parse_relations(input, row_count, columns)?;
        let (class_map, square_rows, surplus_rows, group_order) =
            verify_certificate(input, certificate, &rows, row_count, columns)?;
        let square = dense_rows(&rows, &square_rows, columns)?;
        let surplus = dense_rows(&rows, &surplus_rows, columns)?;
        let (recomputed, workspace) =
            flint_small_surplus_class_order_with_workspace(&square, &surplus, columns)
                .map_err(|error| LiftError::Solver(format!("{error:?}")))?;
        let evidence = member(certificate, "latticeIndexEvidence")?;
        let square_determinant =
            positive_integer_string(member(evidence, "squareDeterminant")?, "square determinant")?;
        let full_index = positive_integer_string(
            member(evidence, "fullRelationLatticeIndex")?,
            "full relation index",
        )?;
        if recomputed.square_determinant != square_determinant
            || recomputed.class_order != group_order
            || full_index != group_order
        {
            return Err(LiftError::Counterfeit(
                "recomputed exact lattice index disagrees with certificate".into(),
            ));
        }
        let solver_to_source_rows = square_rows.into_iter().chain(surplus_rows).collect();
        Ok(Self {
            columns,
            rows,
            class_map,
            solver_to_source_rows,
            workspace,
        })
    }

    pub fn factor_base_size(&self) -> usize {
        self.columns
    }

    pub fn class_residues(&self, factor_base_index: usize) -> Option<&[i64]> {
        self.class_map.get(factor_base_index).map(Vec::as_slice)
    }

    pub fn lift_factor_base_row(
        &self,
        factor_base_index: usize,
    ) -> Result<PrincipalLift, LiftError> {
        let residues = self
            .class_map
            .get(factor_base_index)
            .ok_or_else(|| LiftError::Malformed("factor-base index is out of range".into()))?;
        if residues.iter().any(|&entry| entry != 0) {
            return Err(LiftError::NonPrincipal {
                factor_base_index,
                residues: residues.clone(),
            });
        }
        let mut target = vec![0_i64; self.columns];
        target[factor_base_index] = 1;
        let answer = self
            .workspace
            .relation_witnesses(&target)
            .map_err(|error| LiftError::Solver(format!("{error:?}")))?;
        let mut coefficients = answer
            .coefficients
            .into_iter()
            .enumerate()
            .filter(|(_, coefficient)| coefficient != &0)
            .map(|(solver_row, coefficient)| SparseCoefficient {
                relation_index: self.solver_to_source_rows[solver_row],
                coefficient,
            })
            .collect::<Vec<_>>();
        coefficients.sort_by_key(|term| term.relation_index);
        let lift = PrincipalLift {
            factor_base_index,
            coefficients,
        };
        if !self.verify_lift(&lift) {
            return Err(LiftError::Counterfeit(
                "computed lift failed independent sparse replay".into(),
            ));
        }
        Ok(lift)
    }

    pub fn verify_lift(&self, lift: &PrincipalLift) -> bool {
        if lift.factor_base_index >= self.columns {
            return false;
        }
        let mut replay = BTreeMap::<usize, Integer>::new();
        let mut previous = None;
        for term in &lift.coefficients {
            if term.coefficient == 0
                || term.relation_index >= self.rows.len()
                || previous.is_some_and(|index| index >= term.relation_index)
            {
                return false;
            }
            previous = Some(term.relation_index);
            for (&column, &entry) in &self.rows[term.relation_index] {
                *replay.entry(column).or_default() += &term.coefficient * entry;
            }
        }
        replay.retain(|_, value| value != &0);
        replay.len() == 1
            && replay
                .get(&lift.factor_base_index)
                .is_some_and(|value| value == &1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> (Value, Value) {
        let input = json!({
            "schema": PREPARED_SCHEMA,
            "inputId": "sha256:test",
            "relations": {"rows": 3, "columns": 2},
            "relationLatticeEvidence": {"relationRecords": [
                {"relationIndexZeroBased": 0, "primeIdealFactors": [{"factorBaseIndexZeroBased": 0, "exponent": 2}]},
                {"relationIndexZeroBased": 1, "primeIdealFactors": [{"factorBaseIndexZeroBased": 1, "exponent": 1}]},
                {"relationIndexZeroBased": 2, "primeIdealFactors": [{"factorBaseIndexZeroBased": 1, "exponent": 1}]}
            ]}
        });
        let certificate = json!({
            "schema": CERTIFICATE_SCHEMA,
            "qualificationStatus": "closed-exact-lattice-index-certificate",
            "sourceInputId": "sha256:test",
            "relationShape": {"rows": 3, "columns": 2},
            "invariantFactors": ["2"], "groupOrder": "2",
            "modularClassMap": {"moduli": ["2"], "rows": [
                {"factorBaseIndexZeroBased": 0, "residues": [1]},
                {"factorBaseIndexZeroBased": 1, "residues": [0]}
            ]},
            "standardGeneratorLifts": [{
                "coordinateZeroBased": 0, "modulus": "2",
                "factorBaseLift": [{"factorBaseIndexZeroBased": 0, "coefficient": "1"}],
                "orderRelationCombination": [{"relationIndexZeroBased": 0, "coefficient": "1"}]
            }],
            "relationDependencies": [{"dependencyIndexZeroBased": 0, "terms": [
                {"relationIndexZeroBased": 1, "coefficient": "1"},
                {"relationIndexZeroBased": 2, "coefficient": "-1"}
            ]}],
            "latticeIndexEvidence": {
                "squareRowIndicesZeroBased": [0, 1], "surplusRowIndicesZeroBased": [2],
                "squareDeterminant": "2", "projectedDependencyDeterminant": "1",
                "dependencySaturation": {"criterion": "gcd-of-exhibited-maximal-dependency-minors-is-one", "selectedMinors": [
                    {"relationRowIndicesZeroBased": [1], "determinant": "1"}
                ], "gcd": "1"},
                "fullRelationLatticeIndex": "2"
            }
        });
        (input, certificate)
    }

    #[test]
    fn principal_rows_lift_and_nonprincipal_rows_fail_closed() {
        let (input, certificate) = fixture();
        let presentation = QualifiedPresentation::from_documents(&input, &certificate).unwrap();
        assert!(matches!(
            presentation.lift_factor_base_row(0),
            Err(LiftError::NonPrincipal { .. })
        ));
        let lift = presentation.lift_factor_base_row(1).unwrap();
        assert!(presentation.verify_lift(&lift));
    }

    #[test]
    fn counterfeit_relation_and_dependency_are_rejected() {
        let (mut input, certificate) = fixture();
        input["relationLatticeEvidence"]["relationRecords"][1]["primeIdealFactors"][0]["exponent"] =
            json!(2);
        assert!(matches!(
            QualifiedPresentation::from_documents(&input, &certificate),
            Err(LiftError::Counterfeit(_))
        ));

        let (input, mut certificate) = fixture();
        certificate["relationDependencies"][0]["terms"][1]["coefficient"] = json!("-2");
        assert!(matches!(
            QualifiedPresentation::from_documents(&input, &certificate),
            Err(LiftError::Counterfeit(_))
        ));
    }
}
