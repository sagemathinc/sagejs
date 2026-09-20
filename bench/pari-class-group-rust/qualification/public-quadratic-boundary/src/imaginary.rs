// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Unconditional class groups of small imaginary quadratic fields.
//!
//! Primitive reduced positive-definite binary quadratic forms are a complete,
//! unique set of representatives for the proper ideal classes of a negative
//! fundamental discriminant. For class number at most four, cardinality and
//! the exact inversion map determine the group structure and a complete
//! coordinate map; no partially implemented composition algorithm is needed.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    EmbeddingPrecisionState, PreparedNumberFieldData, PreparedNumberFieldValidationError,
    ValidatedPreparedNumberField,
};
use serde::Serialize;
use std::fmt;

const MAXIMUM_ABSOLUTE_DISCRIMINANT: u64 = 10_000_000;
const MAXIMUM_PROVED_CLASS_NUMBER: usize = 4;
const RESULT_SCHEMA: &str = "sagejs.rust-class-group/complete-small-imaginary-quadratic-v1";
const CERTIFICATE_THEOREM: &str = "primitive reduced positive-definite forms uniquely enumerate proper ideal classes of a negative fundamental discriminant";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PublicImaginaryQuadraticInput {
    pub id: &'static str,
    pub polynomial_ascending: [i64; 3],
}

pub const SMALL_IMAGINARY_CASES: [PublicImaginaryQuadraticInput; 6] = [
    PublicImaginaryQuadraticInput {
        id: "imaginary-d3-trivial",
        polynomial_ascending: [1, 1, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d20-c2",
        polynomial_ascending: [5, 0, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d23-c3",
        polynomial_ascending: [6, -1, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d31-c3",
        polynomial_ascending: [8, -1, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d39-c4",
        polynomial_ascending: [10, -1, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d84-c2xc2",
        polynomial_ascending: [21, 0, 1],
    },
];

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize)]
pub struct BinaryQuadraticForm {
    pub a: i64,
    pub b: i64,
    pub c: i64,
}

impl BinaryQuadraticForm {
    pub fn discriminant(self) -> i64 {
        self.b * self.b - 4 * self.a * self.c
    }

    pub fn is_primitive_reduced(self, discriminant: i64) -> bool {
        let boundary_is_canonical = self.b.abs() != self.a && self.a != self.c || self.b >= 0;
        self.a > 0
            && self.b.abs() <= self.a
            && self.a <= self.c
            && boundary_is_canonical
            && gcd(
                gcd(self.a.unsigned_abs(), self.b.unsigned_abs()),
                self.c.unsigned_abs(),
            ) == 1
            && self.discriminant() == discriminant
    }

    pub fn inverse_reduced(self) -> Self {
        if self.b == 0 || self.b.abs() == self.a || self.a == self.c {
            self
        } else {
            Self { b: -self.b, ..self }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdealRepresentative {
    /// Column generators in the public power basis `(1, alpha)`.
    pub basis_columns: [[i64; 2]; 2],
    pub norm: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormClassMapEntry {
    pub form: BinaryQuadraticForm,
    pub inverse_form: BinaryQuadraticForm,
    /// Coordinates modulo the corresponding invariant factors. The second
    /// coordinate is zero for cyclic groups.
    pub coordinates: [u8; 2],
    pub representative_ideal: IdealRepresentative,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassGenerator {
    pub form: BinaryQuadraticForm,
    pub coordinates: [u8; 2],
    pub exact_order: u8,
    pub representative_ideal: IdealRepresentative,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReducedFormCompletenessCertificate {
    pub discriminant: i64,
    pub fundamental_squarefree_core: i64,
    pub squarefree_core_prime_factors: Vec<u64>,
    pub reduction_bound_a: i64,
    pub reduced_forms: Vec<BinaryQuadraticForm>,
    pub theorem: &'static str,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteImaginaryClassGroup {
    pub schema: &'static str,
    pub field_id: &'static str,
    pub polynomial_ascending: [i64; 3],
    pub discriminant: i64,
    pub class_number: usize,
    pub invariant_factors: Vec<u8>,
    pub generators: Vec<ClassGenerator>,
    pub complete_class_map: Vec<FormClassMapEntry>,
    pub certificate: ReducedFormCompletenessCertificate,
    pub proof_status: &'static str,
    pub runtime_uses_pari_or_fixture_answers: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ImaginaryClassGroupError {
    NonMonic,
    DiscriminantOutsideI64,
    NotImaginary,
    DiscriminantResourceLimit { absolute_discriminant: u64 },
    NotFundamentalDiscriminant,
    NoIrreducibilityWitness,
    PreparedFieldValidation(PreparedNumberFieldValidationError),
    UnsupportedClassNumber { class_number: usize, maximum: usize },
    InvalidCertificate,
}

impl fmt::Display for ImaginaryClassGroupError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{self:?}")
    }
}

impl std::error::Error for ImaginaryClassGroupError {}

/// Public coefficient-only entry point. Coefficients are in ascending order.
pub fn compute_imaginary_class_group_from_coefficients(
    polynomial_ascending: [i64; 3],
) -> Result<CompleteImaginaryClassGroup, ImaginaryClassGroupError> {
    compute_imaginary_class_group(PublicImaginaryQuadraticInput {
        id: "public-coefficient-input",
        polynomial_ascending,
    })
}

pub fn compute_imaginary_class_group(
    input: PublicImaginaryQuadraticInput,
) -> Result<CompleteImaginaryClassGroup, ImaginaryClassGroupError> {
    let [constant, linear, leading] = input.polynomial_ascending;
    if leading != 1 {
        return Err(ImaginaryClassGroupError::NonMonic);
    }
    let wide_discriminant = i128::from(linear) * i128::from(linear) - 4 * i128::from(constant);
    let discriminant = i64::try_from(wide_discriminant)
        .map_err(|_| ImaginaryClassGroupError::DiscriminantOutsideI64)?;
    if discriminant >= 0 {
        return Err(ImaginaryClassGroupError::NotImaginary);
    }
    let absolute_discriminant = discriminant.unsigned_abs();
    if absolute_discriminant > MAXIMUM_ABSOLUTE_DISCRIMINANT {
        return Err(ImaginaryClassGroupError::DiscriminantResourceLimit {
            absolute_discriminant,
        });
    }
    let (squarefree_core, prime_factors) = fundamental_discriminant(discriminant)
        .ok_or(ImaginaryClassGroupError::NotFundamentalDiscriminant)?;
    let irreducibility_prime = (2_u32..=257)
        .filter(|value| is_prime(u64::from(*value)))
        .find(|prime| !has_root_mod_prime(input.polynomial_ascending, *prime))
        .ok_or(ImaginaryClassGroupError::NoIrreducibilityWitness)?;

    let multiplication_table = vec![
        Integer::from(1),
        Integer::from(0),
        Integer::from(0),
        Integer::from(1),
        Integer::from(0),
        Integer::from(1),
        Integer::from(-constant),
        Integer::from(-linear),
    ];
    let prepared = ValidatedPreparedNumberField::validate(PreparedNumberFieldData {
        polynomial_ascending: input.polynomial_ascending.map(Integer::from).to_vec(),
        irreducibility_prime,
        integral_basis_numerators: vec![1.into(), 0.into(), 0.into(), 1.into()],
        basis_denominator: Integer::from(1),
        multiplication_table,
        discriminant: Integer::from(discriminant),
        signature: (0, 1),
        embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 192 },
        index_primes: vec![],
    })
    .map_err(ImaginaryClassGroupError::PreparedFieldValidation)?;
    debug_assert_eq!(prepared.equation_order_index(), &Integer::from(1));

    let (reduction_bound_a, forms) = enumerate_reduced_forms(discriminant);
    if forms.len() > MAXIMUM_PROVED_CLASS_NUMBER {
        return Err(ImaginaryClassGroupError::UnsupportedClassNumber {
            class_number: forms.len(),
            maximum: MAXIMUM_PROVED_CLASS_NUMBER,
        });
    }
    let principal = principal_form(discriminant);
    let (invariant_factors, coordinates, generator_indices) =
        classify_small_group(&forms, principal)?;
    let ideal = |form: BinaryQuadraticForm| ideal_representative(linear, form);
    let complete_class_map = forms
        .iter()
        .copied()
        .zip(coordinates.iter().copied())
        .map(|(form, class_coordinates)| FormClassMapEntry {
            form,
            inverse_form: form.inverse_reduced(),
            coordinates: class_coordinates,
            representative_ideal: ideal(form),
        })
        .collect::<Vec<_>>();
    let generators = generator_indices
        .into_iter()
        .map(|(index, order)| ClassGenerator {
            form: forms[index],
            coordinates: coordinates[index],
            exact_order: order,
            representative_ideal: ideal(forms[index]),
        })
        .collect();
    let answer = CompleteImaginaryClassGroup {
        schema: RESULT_SCHEMA,
        field_id: input.id,
        polynomial_ascending: input.polynomial_ascending,
        discriminant,
        class_number: forms.len(),
        invariant_factors,
        generators,
        complete_class_map,
        certificate: ReducedFormCompletenessCertificate {
            discriminant,
            fundamental_squarefree_core: squarefree_core,
            squarefree_core_prime_factors: prime_factors,
            reduction_bound_a,
            reduced_forms: forms,
            theorem: CERTIFICATE_THEOREM,
        },
        proof_status: "unconditional-complete",
        runtime_uses_pari_or_fixture_answers: false,
    };
    verify_imaginary_class_group(input, &answer)?;
    Ok(answer)
}

/// Replay every exact claim using only the public coefficients and certificate.
pub fn verify_imaginary_class_group(
    input: PublicImaginaryQuadraticInput,
    result: &CompleteImaginaryClassGroup,
) -> Result<(), ImaginaryClassGroupError> {
    let [constant, linear, leading] = input.polynomial_ascending;
    if leading != 1 {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let discriminant =
        i64::try_from(i128::from(linear) * i128::from(linear) - 4 * i128::from(constant))
            .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
    if discriminant >= 0 || discriminant.unsigned_abs() > MAXIMUM_ABSOLUTE_DISCRIMINANT {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let Some((core, factors)) = fundamental_discriminant(discriminant) else {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    };
    let (bound, forms) = enumerate_reduced_forms(discriminant);
    if forms.len() > MAXIMUM_PROVED_CLASS_NUMBER {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let principal = principal_form(discriminant);
    let (invariants, coordinates, generators) = classify_small_group(&forms, principal)
        .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
    if result.schema != RESULT_SCHEMA
        || result.field_id != input.id
        || result.polynomial_ascending != input.polynomial_ascending
        || result.discriminant != discriminant
        || result.class_number != forms.len()
        || result.invariant_factors != invariants
        || result.certificate.discriminant != discriminant
        || result.certificate.fundamental_squarefree_core != core
        || result.certificate.squarefree_core_prime_factors != factors
        || result.certificate.reduction_bound_a != bound
        || result.certificate.reduced_forms != forms
        || result.certificate.theorem != CERTIFICATE_THEOREM
        || result.complete_class_map.len() != forms.len()
        || result.generators.len() != generators.len()
        || result.proof_status != "unconditional-complete"
        || result.runtime_uses_pari_or_fixture_answers
    {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    for (index, entry) in result.complete_class_map.iter().enumerate() {
        if entry.form != forms[index]
            || entry.inverse_form != forms[index].inverse_reduced()
            || entry.coordinates != coordinates[index]
            || entry.representative_ideal != ideal_representative(linear, forms[index])
            || !entry.form.is_primitive_reduced(discriminant)
            || !representative_ideal_is_closed(
                input.polynomial_ascending,
                entry.form,
                &entry.representative_ideal,
            )
        {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
        let inverse_index = forms
            .binary_search(&entry.inverse_form)
            .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
        if !coordinates_are_inverse(entry.coordinates, coordinates[inverse_index], &invariants) {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
    }
    for (actual, (index, order)) in result.generators.iter().zip(generators) {
        if actual.form != forms[index]
            || actual.coordinates != coordinates[index]
            || actual.exact_order != order
            || actual.representative_ideal != ideal_representative(linear, forms[index])
        {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
    }
    Ok(())
}

fn classify_small_group(
    forms: &[BinaryQuadraticForm],
    principal: BinaryQuadraticForm,
) -> Result<(Vec<u8>, Vec<[u8; 2]>, Vec<(usize, u8)>), ImaginaryClassGroupError> {
    let principal_index = forms
        .binary_search(&principal)
        .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
    let mut coordinates = vec![[0, 0]; forms.len()];
    let mut generators = Vec::new();
    match forms.len() {
        1 => Ok((vec![], coordinates, generators)),
        2 => {
            let index = 1 - principal_index;
            coordinates[index] = [1, 0];
            generators.push((index, 2));
            Ok((vec![2], coordinates, generators))
        }
        3 => {
            let generator = (0..3).find(|index| *index != principal_index).unwrap();
            let inverse = forms
                .binary_search(&forms[generator].inverse_reduced())
                .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
            if inverse == generator || inverse == principal_index {
                return Err(ImaginaryClassGroupError::InvalidCertificate);
            }
            coordinates[generator] = [1, 0];
            coordinates[inverse] = [2, 0];
            generators.push((generator, 3));
            Ok((vec![3], coordinates, generators))
        }
        4 => {
            let nonprincipal = (0..4)
                .filter(|index| *index != principal_index)
                .collect::<Vec<_>>();
            if let Some(generator) = nonprincipal
                .iter()
                .copied()
                .find(|index| forms[*index].inverse_reduced() != forms[*index])
            {
                let inverse = forms
                    .binary_search(&forms[generator].inverse_reduced())
                    .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
                let order_two = nonprincipal
                    .iter()
                    .copied()
                    .find(|index| *index != generator && *index != inverse)
                    .ok_or(ImaginaryClassGroupError::InvalidCertificate)?;
                coordinates[generator] = [1, 0];
                coordinates[order_two] = [2, 0];
                coordinates[inverse] = [3, 0];
                generators.push((generator, 4));
                Ok((vec![4], coordinates, generators))
            } else {
                coordinates[nonprincipal[0]] = [1, 0];
                coordinates[nonprincipal[1]] = [0, 1];
                coordinates[nonprincipal[2]] = [1, 1];
                generators.push((nonprincipal[0], 2));
                generators.push((nonprincipal[1], 2));
                Ok((vec![2, 2], coordinates, generators))
            }
        }
        class_number => Err(ImaginaryClassGroupError::UnsupportedClassNumber {
            class_number,
            maximum: MAXIMUM_PROVED_CLASS_NUMBER,
        }),
    }
}

fn enumerate_reduced_forms(discriminant: i64) -> (i64, Vec<BinaryQuadraticForm>) {
    let absolute = discriminant.unsigned_abs();
    let mut bound = 0_u64;
    while (bound + 1) * (bound + 1) * 3 <= absolute {
        bound += 1;
    }
    let mut forms = Vec::new();
    for a in 1..=i64::try_from(bound).unwrap() {
        for b in -a..=a {
            let numerator = i128::from(b) * i128::from(b) - i128::from(discriminant);
            let denominator = 4 * i128::from(a);
            if numerator % denominator != 0 {
                continue;
            }
            let c = i64::try_from(numerator / denominator).unwrap();
            let form = BinaryQuadraticForm { a, b, c };
            if form.is_primitive_reduced(discriminant) {
                forms.push(form);
            }
        }
    }
    forms.sort_unstable();
    (i64::try_from(bound).unwrap(), forms)
}

fn principal_form(discriminant: i64) -> BinaryQuadraticForm {
    if discriminant.rem_euclid(4) == 1 {
        BinaryQuadraticForm {
            a: 1,
            b: 1,
            c: (1 - discriminant) / 4,
        }
    } else {
        BinaryQuadraticForm {
            a: 1,
            b: 0,
            c: -discriminant / 4,
        }
    }
}

fn ideal_representative(
    polynomial_linear_coefficient: i64,
    form: BinaryQuadraticForm,
) -> IdealRepresentative {
    IdealRepresentative {
        basis_columns: [
            [form.a, 0],
            [(polynomial_linear_coefficient - form.b) / 2, 1],
        ],
        norm: form.a,
    }
}

fn representative_ideal_is_closed(
    polynomial: [i64; 3],
    form: BinaryQuadraticForm,
    ideal: &IdealRepresentative,
) -> bool {
    let [constant, linear, leading] = polynomial;
    if leading != 1 || ideal.norm != form.a || ideal.basis_columns[0] != [form.a, 0] {
        return false;
    }
    let shift = (linear - form.b) / 2;
    if ideal.basis_columns[1] != [shift, 1] {
        return false;
    }
    // Multiplication by alpha sends `a` to `a*alpha`, which has coordinates
    // `-shift * a + a * (shift + alpha)`. For the second generator, require
    // the remaining constant coefficient to be exactly divisible by `a`.
    let second_multiplier = shift - linear;
    (-i128::from(constant) - i128::from(second_multiplier) * i128::from(shift))
        .rem_euclid(i128::from(form.a))
        == 0
}

fn coordinates_are_inverse(left: [u8; 2], right: [u8; 2], invariants: &[u8]) -> bool {
    match invariants {
        [] => left == [0, 0] && right == [0, 0],
        [modulus] => (left[0] + right[0]).is_multiple_of(*modulus),
        [left_modulus, right_modulus] => {
            (left[0] + right[0]).is_multiple_of(*left_modulus)
                && (left[1] + right[1]).is_multiple_of(*right_modulus)
        }
        _ => false,
    }
}

fn fundamental_discriminant(discriminant: i64) -> Option<(i64, Vec<u64>)> {
    let core = if discriminant.rem_euclid(4) == 1 {
        discriminant
    } else if discriminant.rem_euclid(4) == 0 {
        let core = discriminant / 4;
        if !matches!(core.rem_euclid(4), 2 | 3) {
            return None;
        }
        core
    } else {
        return None;
    };
    let factors = squarefree_prime_factors(core.unsigned_abs())?;
    Some((core, factors))
}

fn squarefree_prime_factors(mut value: u64) -> Option<Vec<u64>> {
    if value == 0 {
        return None;
    }
    let mut answer = Vec::new();
    let mut divisor = 2_u64;
    while divisor <= value / divisor {
        if value.is_multiple_of(divisor) {
            value /= divisor;
            if value.is_multiple_of(divisor) {
                return None;
            }
            answer.push(divisor);
        }
        divisor += if divisor == 2 { 1 } else { 2 };
    }
    if value > 1 {
        answer.push(value);
    }
    Some(answer)
}

fn has_root_mod_prime(polynomial: [i64; 3], prime: u32) -> bool {
    (0..prime).any(|root| {
        let modulus = i128::from(prime);
        polynomial.iter().rev().fold(0_i128, |value, coefficient| {
            (value * i128::from(root) + i128::from(*coefficient)).rem_euclid(modulus)
        }) == 0
    })
}

fn is_prime(value: u64) -> bool {
    if value < 2 {
        return false;
    }
    if value.is_multiple_of(2) {
        return value == 2;
    }
    let mut divisor = 3_u64;
    while divisor <= value / divisor {
        if value.is_multiple_of(divisor) {
            return false;
        }
        divisor += 2;
    }
    true
}

fn gcd(mut left: u64, mut right: u64) -> u64 {
    while right != 0 {
        (left, right) = (right, left % right);
    }
    left
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_trivial_cyclic_and_noncyclic_groups_with_complete_maps() {
        let expected = [
            (1, vec![]),
            (2, vec![2]),
            (3, vec![3]),
            (3, vec![3]),
            (4, vec![4]),
            (4, vec![2, 2]),
        ];
        for (input, (class_number, invariants)) in SMALL_IMAGINARY_CASES.into_iter().zip(expected) {
            let result = compute_imaginary_class_group(input).unwrap();
            assert_eq!(result.class_number, class_number);
            assert_eq!(result.invariant_factors, invariants);
            assert_eq!(result.complete_class_map.len(), class_number);
            assert_eq!(result.proof_status, "unconditional-complete");
            verify_imaginary_class_group(input, &result).unwrap();
        }
    }

    #[test]
    fn fails_closed_for_nonfundamental_and_larger_class_groups() {
        assert_eq!(
            compute_imaginary_class_group(PublicImaginaryQuadraticInput {
                id: "nonfundamental",
                polynomial_ascending: [9, 0, 1],
            }),
            Err(ImaginaryClassGroupError::NotFundamentalDiscriminant)
        );
        assert_eq!(
            compute_imaginary_class_group(PublicImaginaryQuadraticInput {
                id: "class-number-five",
                polynomial_ascending: [12, -1, 1],
            }),
            Err(ImaginaryClassGroupError::UnsupportedClassNumber {
                class_number: 5,
                maximum: 4,
            })
        );
    }

    #[test]
    fn verifier_rejects_each_counterfeit_proof_field() {
        type Counterfeit = fn(&mut CompleteImaginaryClassGroup);
        let input = SMALL_IMAGINARY_CASES[4];
        let pristine = compute_imaginary_class_group(input).unwrap();
        let counterfeits: Vec<(&str, Counterfeit)> = vec![
            ("schema", |result| result.schema = "counterfeit-schema"),
            ("polynomial", |result| result.polynomial_ascending[0] += 1),
            ("discriminant", |result| result.discriminant -= 4),
            ("class number", |result| result.class_number += 1),
            ("invariants", |result| result.invariant_factors = vec![2, 2]),
            ("certificate discriminant", |result| {
                result.certificate.discriminant -= 4
            }),
            ("fundamental core", |result| {
                result.certificate.fundamental_squarefree_core += 1
            }),
            ("fundamental factors", |result| {
                result.certificate.squarefree_core_prime_factors.pop();
            }),
            ("reduction bound", |result| {
                result.certificate.reduction_bound_a += 1
            }),
            ("reduced forms", |result| {
                result.certificate.reduced_forms[0].c += 1
            }),
            ("theorem", |result| {
                result.certificate.theorem = "counterfeit theorem"
            }),
            ("mapped form", |result| {
                result.complete_class_map[1].form.c += 1
            }),
            ("inverse", |result| {
                result.complete_class_map[1].inverse_form.c += 1
            }),
            ("coordinates", |result| {
                result.complete_class_map[1].coordinates = [0, 0]
            }),
            ("ideal basis", |result| {
                result.complete_class_map[1]
                    .representative_ideal
                    .basis_columns[0][0] += 1
            }),
            ("ideal norm", |result| {
                result.complete_class_map[1].representative_ideal.norm += 1
            }),
            ("generator form", |result| result.generators[0].form.c += 1),
            ("generator coordinates", |result| {
                result.generators[0].coordinates = [0, 0]
            }),
            ("generator ideal", |result| {
                result.generators[0].representative_ideal.norm += 1
            }),
            ("generator order", |result| {
                result.generators[0].exact_order -= 1
            }),
            ("proof status", |result| result.proof_status = "heuristic"),
            ("oracle flag", |result| {
                result.runtime_uses_pari_or_fixture_answers = true
            }),
        ];
        for (label, counterfeit) in counterfeits {
            let mut result = pristine.clone();
            counterfeit(&mut result);
            assert_eq!(
                verify_imaginary_class_group(input, &result),
                Err(ImaginaryClassGroupError::InvalidCertificate),
                "counterfeit field was accepted: {label}"
            );
        }
    }

    #[test]
    fn verifier_enforces_resource_bound_before_enumeration() {
        let result = compute_imaginary_class_group(SMALL_IMAGINARY_CASES[0]).unwrap();
        for polynomial_ascending in [[2_500_001, 0, 1], [i64::MAX, i64::MAX, 1]] {
            assert_eq!(
                verify_imaginary_class_group(
                    PublicImaginaryQuadraticInput {
                        id: result.field_id,
                        polynomial_ascending,
                    },
                    &result,
                ),
                Err(ImaginaryClassGroupError::InvalidCertificate)
            );
        }
    }

    #[test]
    fn deterministic_fundamental_discriminant_sweep_replays_or_fails_closed() {
        let mut admitted = 0;
        let mut rejected_for_class_number = 0;
        for absolute_discriminant in 3_i64..=500 {
            let discriminant = -absolute_discriminant;
            if fundamental_discriminant(discriminant).is_none() {
                continue;
            }
            let polynomial_ascending = if discriminant.rem_euclid(4) == 1 {
                [(1 - discriminant) / 4, -1, 1]
            } else {
                [-discriminant / 4, 0, 1]
            };
            let input = PublicImaginaryQuadraticInput {
                id: "fundamental-discriminant-sweep",
                polynomial_ascending,
            };
            let expected_class_number = enumerate_reduced_forms(discriminant).1.len();
            match compute_imaginary_class_group(input) {
                Ok(result) => {
                    assert!(expected_class_number <= MAXIMUM_PROVED_CLASS_NUMBER);
                    assert_eq!(result.class_number, expected_class_number);
                    verify_imaginary_class_group(input, &result).unwrap();
                    admitted += 1;
                }
                Err(ImaginaryClassGroupError::UnsupportedClassNumber {
                    class_number,
                    maximum,
                }) => {
                    assert_eq!(class_number, expected_class_number);
                    assert_eq!(maximum, MAXIMUM_PROVED_CLASS_NUMBER);
                    assert!(class_number > maximum);
                    rejected_for_class_number += 1;
                }
                other => panic!("unexpected sweep result for D={discriminant}: {other:?}"),
            }
        }
        assert!(admitted >= 20);
        assert!(rejected_for_class_number >= 20);
    }
}
