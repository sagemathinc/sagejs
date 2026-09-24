// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Unconditional class groups of bounded imaginary quadratic fields.
//!
//! Primitive reduced positive-definite binary quadratic forms are a complete,
//! unique set of representatives for the proper ideal classes of a negative
//! fundamental discriminant. Exact Gauss composition multiplies their
//! rank-two ideal lattices and canonically reduces the result. The resulting
//! group law drives exact orders, primary decomposition, independent
//! generators, normalized invariant factors, and a coordinate map for every
//! class. The admitted v2 domain has `|D| <= 10^7` and at most 20,000 reduced
//! forms; all other inputs fail closed.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    EmbeddingPrecisionState, PreparedNumberFieldData, PreparedNumberFieldValidationError,
    ValidatedPreparedNumberField,
};
use serde::Serialize;
use std::{
    collections::{BTreeSet, VecDeque},
    fmt,
};

const MAXIMUM_ABSOLUTE_DISCRIMINANT: u64 = 10_000_000;
const MAXIMUM_REDUCED_FORMS: usize = 20_000;
const RESULT_SCHEMA: &str = "sagejs.rust-class-group/complete-imaginary-quadratic-v2";
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

pub const GENERAL_IMAGINARY_CASES: [PublicImaginaryQuadraticInput; 6] = [
    PublicImaginaryQuadraticInput {
        id: "imaginary-d47-c5",
        polynomial_ascending: [12, -1, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d87-c6",
        polynomial_ascending: [22, -1, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d231-c2xc6",
        polynomial_ascending: [58, -1, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d260-c2xc4",
        polynomial_ascending: [65, 0, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d420-c2xc2xc2",
        polynomial_ascending: [105, 0, 1],
    },
    PublicImaginaryQuadraticInput {
        id: "imaginary-d9999991-c1715",
        polynomial_ascending: [2_499_998, -1, 1],
    },
];

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize)]
pub struct BinaryQuadraticForm {
    pub a: i64,
    pub b: i64,
    pub c: i64,
}

impl BinaryQuadraticForm {
    /// Return the exact discriminant when it fits in `i128`.
    pub fn discriminant(self) -> Option<i128> {
        let a = i128::from(self.a);
        let b = i128::from(self.b);
        let c = i128::from(self.c);
        b.checked_mul(b)?
            .checked_sub(a.checked_mul(c)?.checked_mul(4)?)
    }

    pub fn is_primitive_reduced(self, discriminant: i64) -> bool {
        let a = i128::from(self.a);
        let absolute_b = i128::from(self.b).abs();
        let c = i128::from(self.c);
        let boundary_is_canonical = absolute_b != a && a != c || self.b >= 0;
        a > 0
            && absolute_b <= a
            && a <= c
            && boundary_is_canonical
            && gcd(
                gcd(self.a.unsigned_abs(), self.b.unsigned_abs()),
                self.c.unsigned_abs(),
            ) == 1
            && self.discriminant() == Some(i128::from(discriminant))
    }

    pub fn inverse_reduced(self) -> Result<Self, ImaginaryClassGroupError> {
        if self.b == 0 || i128::from(self.b).abs() == i128::from(self.a) || self.a == self.c {
            Ok(self)
        } else {
            Ok(Self {
                b: self
                    .b
                    .checked_neg()
                    .ok_or(ImaginaryClassGroupError::GroupLawFailure)?,
                ..self
            })
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
    /// Coordinates modulo the corresponding invariant factors.
    pub coordinates: Vec<u64>,
    pub representative_ideal: IdealRepresentative,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassGenerator {
    pub form: BinaryQuadraticForm,
    pub coordinates: Vec<u64>,
    pub exact_order: u64,
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
    pub invariant_factors: Vec<u64>,
    pub generators: Vec<ClassGenerator>,
    pub complete_class_map: Vec<FormClassMapEntry>,
    pub certificate: ReducedFormCompletenessCertificate,
    pub proof_status: &'static str,
    pub runtime_uses_pari_or_fixture_answers: bool,
}

/// The unconditional scalar result, computed without constructing a group law.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteImaginaryClassNumber {
    pub discriminant: i64,
    pub class_number: usize,
    pub proof_status: &'static str,
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
    ReducedFormResourceLimit { class_number: usize, maximum: usize },
    GroupLawFailure,
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

/// Count ideal classes directly from the complete reduced-form enumeration.
///
/// This deliberately does not compute invariant factors, generators, or a
/// class map. The same exact reduced-form theorem used by the full-group
/// route makes the count unconditional.
pub fn compute_imaginary_class_number_from_coefficients(
    polynomial_ascending: [i64; 3],
) -> Result<CompleteImaginaryClassNumber, ImaginaryClassGroupError> {
    let discriminant = validated_imaginary_discriminant(polynomial_ascending)?;
    let class_number = count_reduced_forms(discriminant);
    if class_number > MAXIMUM_REDUCED_FORMS {
        return Err(ImaginaryClassGroupError::ReducedFormResourceLimit {
            class_number,
            maximum: MAXIMUM_REDUCED_FORMS,
        });
    }
    Ok(CompleteImaginaryClassNumber {
        discriminant,
        class_number,
        proof_status: "unconditional-complete",
    })
}

fn validated_imaginary_discriminant(
    polynomial_ascending: [i64; 3],
) -> Result<i64, ImaginaryClassGroupError> {
    let [constant, linear, leading] = polynomial_ascending;
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
    fundamental_discriminant(discriminant)
        .ok_or(ImaginaryClassGroupError::NotFundamentalDiscriminant)?;
    Ok(discriminant)
}

pub fn compute_imaginary_class_group(
    input: PublicImaginaryQuadraticInput,
) -> Result<CompleteImaginaryClassGroup, ImaginaryClassGroupError> {
    let [constant, linear, _] = input.polynomial_ascending;
    let discriminant = validated_imaginary_discriminant(input.polynomial_ascending)?;
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
    if forms.len() > MAXIMUM_REDUCED_FORMS {
        return Err(ImaginaryClassGroupError::ReducedFormResourceLimit {
            class_number: forms.len(),
            maximum: MAXIMUM_REDUCED_FORMS,
        });
    }
    let structure = compute_group_structure(&forms, discriminant)?;
    let ideal = |form: BinaryQuadraticForm| ideal_representative(linear, form);
    let complete_class_map = forms
        .iter()
        .copied()
        .zip(structure.coordinates.iter().cloned())
        .map(|(form, class_coordinates)| {
            Ok(FormClassMapEntry {
                form,
                inverse_form: form.inverse_reduced()?,
                coordinates: class_coordinates,
                representative_ideal: ideal(form),
            })
        })
        .collect::<Result<Vec<_>, ImaginaryClassGroupError>>()?;
    let generators = structure
        .generator_indices
        .iter()
        .map(|&(index, order)| ClassGenerator {
            form: forms[index],
            coordinates: structure.coordinates[index].clone(),
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
        invariant_factors: structure.invariants.clone(),
        generators,
        complete_class_map,
        certificate: ReducedFormCompletenessCertificate {
            discriminant,
            fundamental_squarefree_core: squarefree_core,
            squarefree_core_prime_factors: prime_factors.clone(),
            reduction_bound_a,
            reduced_forms: forms,
            theorem: CERTIFICATE_THEOREM,
        },
        proof_status: "unconditional-complete",
        runtime_uses_pari_or_fixture_answers: false,
    };
    authenticate_constructed_imaginary_class_group(
        input,
        &answer,
        &structure,
        discriminant,
        squarefree_core,
        &prime_factors,
        reduction_bound_a,
    )?;
    Ok(answer)
}

/// Authenticate the freshly constructed result against its private exact
/// construction witness without replaying the group law a second time.
///
/// `compute_group_structure` has already traversed the entire group, proved
/// the generator orders, assigned every mixed-radix coordinate exactly once,
/// and returned to the principal form. This helper is deliberately private
/// and receives that private producer-owned witness directly. Serialized or
/// otherwise untrusted results must use [`verify_imaginary_class_group`],
/// which independently re-enumerates the forms and replays generator
/// translations.
fn authenticate_constructed_imaginary_class_group(
    input: PublicImaginaryQuadraticInput,
    result: &CompleteImaginaryClassGroup,
    structure: &GroupStructure,
    discriminant: i64,
    squarefree_core: i64,
    prime_factors: &[u64],
    reduction_bound_a: i64,
) -> Result<(), ImaginaryClassGroupError> {
    let forms = &result.certificate.reduced_forms;
    let invariants = &structure.invariants;
    let invariant_product = invariants
        .iter()
        .try_fold(1_u64, |product, value| product.checked_mul(*value));
    if result.schema != RESULT_SCHEMA
        || result.field_id != input.id
        || result.polynomial_ascending != input.polynomial_ascending
        || result.discriminant != discriminant
        || result.class_number != forms.len()
        || result.invariant_factors != *invariants
        || result.certificate.discriminant != discriminant
        || result.certificate.fundamental_squarefree_core != squarefree_core
        || result.certificate.squarefree_core_prime_factors != prime_factors
        || result.certificate.reduction_bound_a != reduction_bound_a
        || result.certificate.theorem != CERTIFICATE_THEOREM
        || invariant_product != Some(forms.len() as u64)
        || invariants.iter().any(|value| *value <= 1)
        || invariants.windows(2).any(|pair| pair[1] % pair[0] != 0)
        || result.complete_class_map.len() != forms.len()
        || structure.coordinates.len() != forms.len()
        || structure.generator_indices.len() != invariants.len()
        || result.generators.len() != structure.generator_indices.len()
        || result.proof_status != "unconditional-complete"
        || result.runtime_uses_pari_or_fixture_answers
    {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let linear = input.polynomial_ascending[1];
    for (index, entry) in result.complete_class_map.iter().enumerate() {
        let form = forms[index];
        if entry.form != form
            || entry.inverse_form
                != form
                    .inverse_reduced()
                    .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?
            || entry.coordinates != structure.coordinates[index]
            || entry.representative_ideal != ideal_representative(linear, form)
            || !representative_ideal_is_closed(
                input.polynomial_ascending,
                form,
                &entry.representative_ideal,
            )
        {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
    }
    for (position, (actual, &(index, order))) in result
        .generators
        .iter()
        .zip(&structure.generator_indices)
        .enumerate()
    {
        let mut unit_coordinate = vec![0_u64; invariants.len()];
        unit_coordinate[position] = 1;
        if actual.form != forms[index]
            || actual.coordinates != unit_coordinate
            || actual.coordinates != structure.coordinates[index]
            || actual.exact_order != order
            || actual.representative_ideal != ideal_representative(linear, forms[index])
        {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
    }
    Ok(())
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
    if forms.len() > MAXIMUM_REDUCED_FORMS {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let invariants = &result.invariant_factors;
    let invariant_product = invariants
        .iter()
        .try_fold(1_u64, |product, value| product.checked_mul(*value));
    let structure_shape_valid = invariant_product == Some(forms.len() as u64)
        && invariants.iter().all(|value| *value > 1)
        && invariants.windows(2).all(|pair| pair[1] % pair[0] == 0);
    if result.schema != RESULT_SCHEMA
        || result.field_id != input.id
        || result.polynomial_ascending != input.polynomial_ascending
        || result.discriminant != discriminant
        || result.class_number != forms.len()
        || result.certificate.discriminant != discriminant
        || result.certificate.fundamental_squarefree_core != core
        || result.certificate.squarefree_core_prime_factors != factors
        || result.certificate.reduction_bound_a != bound
        || result.certificate.reduced_forms != forms
        || result.certificate.theorem != CERTIFICATE_THEOREM
        || result.complete_class_map.len() != forms.len()
        || result.generators.len() != invariants.len()
        || !structure_shape_valid
        || result.proof_status != "unconditional-complete"
        || result.runtime_uses_pari_or_fixture_answers
    {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let mut seen_coordinates = vec![false; forms.len()];
    for (index, entry) in result.complete_class_map.iter().enumerate() {
        let expected_inverse = forms[index]
            .inverse_reduced()
            .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
        if entry.form != forms[index]
            || entry.inverse_form != expected_inverse
            || entry.coordinates.len() != invariants.len()
            || entry
                .coordinates
                .iter()
                .zip(invariants)
                .any(|(coordinate, modulus)| coordinate >= modulus)
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
        let mut coordinate_ordinal = 0_usize;
        let mut stride = 1_usize;
        for (coordinate, modulus) in entry.coordinates.iter().zip(invariants) {
            coordinate_ordinal = coordinate_ordinal
                .checked_add(stride * *coordinate as usize)
                .ok_or(ImaginaryClassGroupError::InvalidCertificate)?;
            stride = stride
                .checked_mul(*modulus as usize)
                .ok_or(ImaginaryClassGroupError::InvalidCertificate)?;
        }
        if seen_coordinates[coordinate_ordinal] {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
        seen_coordinates[coordinate_ordinal] = true;
        let inverse_index = forms
            .binary_search(&entry.inverse_form)
            .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
        if !coordinates_are_inverse(
            &entry.coordinates,
            &result.complete_class_map[inverse_index].coordinates,
            invariants,
        ) {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
    }
    if seen_coordinates.iter().any(|seen| !seen) {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let principal_index = forms
        .binary_search(&principal_form(discriminant))
        .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
    if result.complete_class_map[principal_index]
        .coordinates
        .iter()
        .any(|value| *value != 0)
    {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    for (generator_position, actual) in result.generators.iter().enumerate() {
        let index = forms
            .binary_search(&actual.form)
            .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
        let order = invariants[generator_position];
        let mut unit_coordinate = vec![0_u64; invariants.len()];
        unit_coordinate[generator_position] = 1;
        if actual.coordinates != unit_coordinate
            || result.complete_class_map[index].coordinates != unit_coordinate
            || actual.exact_order != order
            || actual.representative_ideal != ideal_representative(linear, forms[index])
            || form_power(actual.form, order as usize, discriminant)
                .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?
                != principal_form(discriminant)
        {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
        for (prime, _) in factor_usize(order as usize) {
            if form_power(actual.form, order as usize / prime, discriminant)
                .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?
                == principal_form(discriminant)
            {
                return Err(ImaginaryClassGroupError::InvalidCertificate);
            }
        }
        for (form_index, form) in forms.iter().copied().enumerate() {
            let product = compose_reduced_forms_unchecked(form, actual.form, discriminant)
                .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
            let product_index = forms
                .binary_search(&product)
                .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
            let mut expected = result.complete_class_map[form_index].coordinates.clone();
            expected[generator_position] =
                (expected[generator_position] + 1) % invariants[generator_position];
            if result.complete_class_map[product_index].coordinates != expected {
                return Err(ImaginaryClassGroupError::InvalidCertificate);
            }
        }
    }
    Ok(())
}

#[derive(Debug)]
struct GroupStructure {
    invariants: Vec<u64>,
    coordinates: Vec<Vec<u64>>,
    generator_indices: Vec<(usize, u64)>,
}

fn reduce_form(
    form: BinaryQuadraticForm,
    discriminant: i64,
) -> Result<BinaryQuadraticForm, ImaginaryClassGroupError> {
    let target = i128::from(discriminant);
    let (mut a, mut b) = (i128::from(form.a), i128::from(form.b));
    if a <= 0 {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    loop {
        let quotient = (b + a).div_euclid(2 * a);
        b -= 2 * quotient * a;
        let numerator = b * b - target;
        if numerator % (4 * a) != 0 {
            return Err(ImaginaryClassGroupError::GroupLawFailure);
        }
        let c = numerator / (4 * a);
        if a > c {
            a = c;
            b = -b;
            continue;
        }
        if (b.abs() == a || a == c) && b < 0 {
            b = -b;
        }
        let reduced = BinaryQuadraticForm {
            a: i64::try_from(a).map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?,
            b: i64::try_from(b).map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?,
            c: i64::try_from(c).map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?,
        };
        return reduced
            .is_primitive_reduced(discriminant)
            .then_some(reduced)
            .ok_or(ImaginaryClassGroupError::GroupLawFailure);
    }
}

/// Exact Gauss composition through multiplication of rank-two ideal lattices.
fn compose_forms(
    left: BinaryQuadraticForm,
    right: BinaryQuadraticForm,
    discriminant: i64,
) -> Result<BinaryQuadraticForm, ImaginaryClassGroupError> {
    if !left.is_primitive_reduced(discriminant) || !right.is_primitive_reduced(discriminant) {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    compose_reduced_forms_unchecked(left, right, discriminant)
}

/// Internal hot path for forms already obtained from the complete reduced-form
/// enumeration or from a successful composition. `reduce_form` still checks
/// the output exactly; only the redundant input checks are elided.
fn compose_reduced_forms_unchecked(
    left: BinaryQuadraticForm,
    right: BinaryQuadraticForm,
    discriminant: i64,
) -> Result<BinaryQuadraticForm, ImaginaryClassGroupError> {
    let target = i128::from(discriminant);
    let parity = target.rem_euclid(2);
    let theta_norm = (parity * parity - target) / 4;
    let left_t = (-i128::from(left.b) - parity) / 2;
    let right_t = (-i128::from(right.b) - parity) / 2;
    let vectors = [
        (i128::from(left.a) * i128::from(right.a), 0),
        (i128::from(left.a) * right_t, i128::from(left.a)),
        (i128::from(right.a) * left_t, i128::from(right.a)),
        (left_t * right_t - theta_norm, left_t + right_t + parity),
    ];
    let mut projection_gcd = 0_i128;
    let mut lifted_x = 0_i128;
    for (x, y) in vectors {
        let (next_gcd, old_coefficient, new_coefficient) = extended_gcd(projection_gcd, y);
        lifted_x = old_coefficient * lifted_x + new_coefficient * x;
        projection_gcd = next_gcd;
    }
    if projection_gcd == 0 {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    let mut lattice_index = 0_i128;
    for left_index in 0..vectors.len() {
        for right_index in 0..left_index {
            let minor = (vectors[left_index].0 * vectors[right_index].1
                - vectors[right_index].0 * vectors[left_index].1)
                .abs();
            lattice_index = gcd_i128(lattice_index, minor);
        }
    }
    let scale_square = projection_gcd * projection_gcd;
    if lattice_index % scale_square != 0 || lifted_x % projection_gcd != 0 {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    let a = lattice_index / scale_square;
    if a <= 0 {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    let t = (lifted_x / projection_gcd).rem_euclid(a);
    let b = -2 * t - parity;
    let numerator = b * b - target;
    if numerator % (4 * a) != 0 {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    reduce_form(
        BinaryQuadraticForm {
            a: i64::try_from(a).map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?,
            b: i64::try_from(b).map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?,
            c: i64::try_from(numerator / (4 * a))
                .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?,
        },
        discriminant,
    )
}

/// Compose two canonical reduced forms by exact ideal-lattice multiplication.
pub fn compose_reduced_forms(
    left: BinaryQuadraticForm,
    right: BinaryQuadraticForm,
    discriminant: i64,
) -> Result<BinaryQuadraticForm, ImaginaryClassGroupError> {
    if discriminant >= 0
        || discriminant.unsigned_abs() > MAXIMUM_ABSOLUTE_DISCRIMINANT
        || fundamental_discriminant(discriminant).is_none()
    {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    compose_forms(left, right, discriminant)
}

fn form_power(
    mut form: BinaryQuadraticForm,
    mut exponent: usize,
    discriminant: i64,
) -> Result<BinaryQuadraticForm, ImaginaryClassGroupError> {
    let mut answer = principal_form(discriminant);
    while exponent != 0 {
        if exponent & 1 != 0 {
            answer = compose_reduced_forms_unchecked(answer, form, discriminant)?;
        }
        exponent >>= 1;
        if exponent != 0 {
            form = compose_reduced_forms_unchecked(form, form, discriminant)?;
        }
    }
    Ok(answer)
}

fn form_order(
    form: BinaryQuadraticForm,
    group_order: usize,
    discriminant: i64,
) -> Result<usize, ImaginaryClassGroupError> {
    let principal = principal_form(discriminant);
    let mut order = group_order;
    for (prime, _) in factor_usize(group_order) {
        while order % prime == 0 && form_power(form, order / prime, discriminant)? == principal {
            order /= prime;
        }
    }
    Ok(order)
}

fn generated_subgroup(
    generators: &[BinaryQuadraticForm],
    discriminant: i64,
) -> Result<Vec<BinaryQuadraticForm>, ImaginaryClassGroupError> {
    let principal = principal_form(discriminant);
    let mut seen = BTreeSet::from([principal]);
    let mut queue = VecDeque::from([principal]);
    while let Some(current) = queue.pop_front() {
        for generator in generators {
            let candidate = compose_reduced_forms_unchecked(current, *generator, discriminant)?;
            if seen.insert(candidate) {
                queue.push_back(candidate);
            }
        }
    }
    Ok(seen.into_iter().collect())
}

fn primary_basis(
    forms: &[BinaryQuadraticForm],
    discriminant: i64,
    prime: usize,
    exponent: usize,
) -> Result<(Vec<usize>, Vec<BinaryQuadraticForm>), ImaginaryClassGroupError> {
    let primary_order = prime.pow(exponent as u32);
    let projection_power = forms.len() / primary_order;
    let mut primary_forms = BTreeSet::new();
    for form in forms {
        primary_forms.insert(form_power(*form, projection_power, discriminant)?);
    }
    if primary_forms.len() != primary_order {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    let primary_forms = primary_forms.into_iter().collect::<Vec<_>>();
    let principal = principal_form(discriminant);
    let mut ranks = vec![0_usize];
    for level in 1..=exponent {
        let bound = prime.pow(level as u32);
        let killed = primary_forms
            .iter()
            .filter(|form| form_power(**form, bound, discriminant) == Ok(principal))
            .count();
        let mut remaining = killed;
        let mut rank = 0;
        while remaining > 1 && remaining % prime == 0 {
            remaining /= prime;
            rank += 1;
        }
        if remaining != 1 {
            return Err(ImaginaryClassGroupError::GroupLawFailure);
        }
        ranks.push(rank);
    }
    let mut factors = Vec::new();
    for level in 1..=exponent {
        let at_least = ranks[level] - ranks[level - 1];
        let next_at_least = if level < exponent {
            ranks[level + 1] - ranks[level]
        } else {
            0
        };
        for _ in 0..(at_least - next_at_least) {
            factors.push(prime.pow(level as u32));
        }
    }
    let mut selected = Vec::new();
    let mut subgroup_size = 1;
    for target_order in factors.iter().rev().copied() {
        let mut chosen = None;
        for candidate in &primary_forms {
            if form_order(*candidate, forms.len(), discriminant)? != target_order {
                continue;
            }
            let mut proposed = selected.clone();
            proposed.push(*candidate);
            let next_size = generated_subgroup(&proposed, discriminant)?.len();
            if next_size == subgroup_size * target_order {
                chosen = Some(*candidate);
                subgroup_size = next_size;
                break;
            }
        }
        selected.push(chosen.ok_or(ImaginaryClassGroupError::GroupLawFailure)?);
    }
    if subgroup_size != primary_order {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    selected.reverse();
    Ok((factors, selected))
}

fn compute_group_structure(
    forms: &[BinaryQuadraticForm],
    discriminant: i64,
) -> Result<GroupStructure, ImaginaryClassGroupError> {
    if forms.is_empty() {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    let principal = principal_form(discriminant);
    // An even-order cyclic group has exactly two self-inverse elements. Form
    // inversion is just canonical coefficient negation, so this exact rank
    // test avoids attempting a full-order composition for every form in the
    // common noncyclic (positive 2-rank) case.
    let cyclic_possible = forms.len() % 2 != 0
        || forms
            .iter()
            .filter(|form| form.inverse_reduced() == Ok(**form))
            .take(3)
            .count()
            == 2;
    let (invariants, generators) = if forms.len() == 1 {
        (Vec::new(), Vec::new())
    } else if let Some(generator) = cyclic_possible
        .then(|| {
            forms
                .iter()
                .copied()
                .find(|form| form_order(*form, forms.len(), discriminant) == Ok(forms.len()))
        })
        .flatten()
    {
        (vec![forms.len()], vec![generator])
    } else {
        let mut component_factors = Vec::new();
        let mut component_generators = Vec::new();
        let mut maximum_rank = 0;
        for (prime, exponent) in factor_usize(forms.len()) {
            let (factors, generators) = primary_basis(forms, discriminant, prime, exponent)?;
            maximum_rank = maximum_rank.max(factors.len());
            component_factors.push(factors);
            component_generators.push(generators);
        }
        let mut invariants = Vec::new();
        let mut generators = Vec::new();
        for position in 0..maximum_rank {
            let mut invariant = 1_usize;
            let mut generator = principal;
            for component in 0..component_factors.len() {
                let offset = maximum_rank - component_factors[component].len();
                if position >= offset {
                    let local = position - offset;
                    invariant *= component_factors[component][local];
                    generator = compose_reduced_forms_unchecked(
                        generator,
                        component_generators[component][local],
                        discriminant,
                    )?;
                }
            }
            invariants.push(invariant);
            generators.push(generator);
        }
        (invariants, generators)
    };
    if invariants.iter().product::<usize>() != forms.len()
        || invariants.windows(2).any(|pair| pair[1] % pair[0] != 0)
    {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }

    let mut coordinates = vec![Vec::new(); forms.len()];
    let mut assigned = vec![false; forms.len()];
    if invariants.len() == 1 {
        let generator = generators[0];
        let mut form = principal;
        for ordinal in 0..forms.len() {
            let index = forms
                .binary_search(&form)
                .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
            if assigned[index] {
                return Err(ImaginaryClassGroupError::GroupLawFailure);
            }
            assigned[index] = true;
            coordinates[index] = vec![ordinal as u64];
            form = compose_reduced_forms_unchecked(form, generator, discriminant)?;
        }
        if form != principal {
            return Err(ImaginaryClassGroupError::GroupLawFailure);
        }
    } else {
        let mut generator_powers = Vec::with_capacity(generators.len());
        for (invariant, generator) in invariants.iter().copied().zip(&generators) {
            let mut powers = Vec::with_capacity(invariant);
            let mut form = principal;
            for _ in 0..invariant {
                powers.push(form);
                form = compose_reduced_forms_unchecked(form, *generator, discriminant)?;
            }
            if form != principal {
                return Err(ImaginaryClassGroupError::GroupLawFailure);
            }
            generator_powers.push(powers);
        }
        for ordinal in 0..forms.len() {
            let mut remaining = ordinal;
            let mut coordinate = Vec::with_capacity(invariants.len());
            let mut form = principal;
            for (position, invariant) in invariants.iter().copied().enumerate() {
                let value = remaining % invariant;
                remaining /= invariant;
                coordinate.push(value as u64);
                if value != 0 {
                    form = compose_reduced_forms_unchecked(
                        form,
                        generator_powers[position][value],
                        discriminant,
                    )?;
                }
            }
            let index = forms
                .binary_search(&form)
                .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
            if assigned[index] {
                return Err(ImaginaryClassGroupError::GroupLawFailure);
            }
            assigned[index] = true;
            coordinates[index] = coordinate;
        }
    }
    if assigned.iter().any(|value| !value) {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    let generator_indices = generators
        .iter()
        .zip(&invariants)
        .map(|(generator, order)| {
            Ok((
                forms
                    .binary_search(generator)
                    .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?,
                *order as u64,
            ))
        })
        .collect::<Result<Vec<_>, ImaginaryClassGroupError>>()?;
    Ok(GroupStructure {
        invariants: invariants.into_iter().map(|value| value as u64).collect(),
        coordinates,
        generator_indices,
    })
}

fn factor_usize(mut value: usize) -> Vec<(usize, usize)> {
    let mut answer = Vec::new();
    let mut prime = 2;
    while prime <= value / prime {
        if value % prime == 0 {
            let mut exponent = 0;
            while value % prime == 0 {
                value /= prime;
                exponent += 1;
            }
            answer.push((prime, exponent));
        }
        prime += if prime == 2 { 1 } else { 2 };
    }
    if value > 1 {
        answer.push((value, 1));
    }
    answer
}

fn extended_gcd(left: i128, right: i128) -> (i128, i128, i128) {
    let (mut old_r, mut r) = (left, right);
    let (mut old_s, mut s) = (1_i128, 0_i128);
    let (mut old_t, mut t) = (0_i128, 1_i128);
    while r != 0 {
        let quotient = old_r.div_euclid(r);
        (old_r, r) = (r, old_r - quotient * r);
        (old_s, s) = (s, old_s - quotient * s);
        (old_t, t) = (t, old_t - quotient * t);
    }
    if old_r < 0 {
        (-old_r, -old_s, -old_t)
    } else {
        (old_r, old_s, old_t)
    }
}

fn gcd_i128(mut left: i128, mut right: i128) -> i128 {
    while right != 0 {
        (left, right) = (right, left.rem_euclid(right));
    }
    left.abs()
}

fn enumerate_reduced_forms(discriminant: i64) -> (i64, Vec<BinaryQuadraticForm>) {
    let mut forms = Vec::new();
    let bound = visit_reduced_forms(discriminant, |form| forms.push(form));
    forms.sort_unstable();
    (bound, forms)
}

fn count_reduced_forms(discriminant: i64) -> usize {
    let mut count = 0;
    visit_reduced_forms(discriminant, |_| count += 1);
    count
}

fn visit_reduced_forms(discriminant: i64, mut visit: impl FnMut(BinaryQuadraticForm)) -> i64 {
    let absolute = discriminant.unsigned_abs();
    let mut bound = 0_u64;
    while (bound + 1) * (bound + 1) * 3 <= absolute {
        bound += 1;
    }
    let maximum_n = (bound * bound + absolute) / 4 + 1;
    let mut primes = Vec::new();
    for candidate in 2..=integer_square_root(maximum_n) {
        if primes.iter().all(|prime| candidate % prime != 0) {
            primes.push(candidate);
        }
    }
    let signed_bound = i64::try_from(bound).unwrap();
    for b in -signed_bound..=signed_bound {
        let numerator = i128::from(b) * i128::from(b) - i128::from(discriminant);
        if numerator % 4 != 0 {
            continue;
        }
        let n = u64::try_from(numerator / 4).unwrap();
        for a in positive_divisors(n, &primes) {
            if a > bound || a < b.unsigned_abs() || a > n / a {
                continue;
            }
            let form = BinaryQuadraticForm {
                a: i64::try_from(a).unwrap(),
                b,
                c: i64::try_from(n / a).unwrap(),
            };
            if form.is_primitive_reduced(discriminant) {
                visit(form);
            }
        }
    }
    i64::try_from(bound).unwrap()
}

fn integer_square_root(value: u64) -> u64 {
    let mut root = 0;
    while (root + 1) <= value / (root + 1) {
        root += 1;
    }
    root
}

fn positive_divisors(mut value: u64, primes: &[u64]) -> Vec<u64> {
    let mut divisors = vec![1];
    for prime in primes {
        if *prime > value / *prime {
            break;
        }
        if value % prime != 0 {
            continue;
        }
        let existing = divisors.len();
        let mut power = 1;
        while value % prime == 0 {
            value /= prime;
            power *= prime;
            for index in 0..existing {
                divisors.push(divisors[index] * power);
            }
        }
    }
    if value > 1 {
        let existing = divisors.len();
        for index in 0..existing {
            divisors.push(divisors[index] * value);
        }
    }
    divisors
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

fn coordinates_are_inverse(left: &[u64], right: &[u64], invariants: &[u64]) -> bool {
    left.len() == invariants.len()
        && right.len() == invariants.len()
        && left
            .iter()
            .zip(right)
            .zip(invariants)
            .all(|((left, right), modulus)| (left + right).is_multiple_of(*modulus))
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
    fn scalar_class_number_agrees_with_authenticated_group() {
        for input in SMALL_IMAGINARY_CASES
            .into_iter()
            .chain(GENERAL_IMAGINARY_CASES)
        {
            let scalar =
                compute_imaginary_class_number_from_coefficients(input.polynomial_ascending)
                    .unwrap();
            let group = compute_imaginary_class_group(input).unwrap();
            assert_eq!(scalar.discriminant, group.discriminant);
            assert_eq!(scalar.class_number, group.class_number);
            assert_eq!(scalar.proof_status, "unconditional-complete");
        }
        assert_eq!(
            compute_imaginary_class_number_from_coefficients([9, 0, 1]),
            Err(ImaginaryClassGroupError::NotFundamentalDiscriminant)
        );
    }

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
    fn rejects_nonfundamental_but_computes_class_number_five() {
        assert_eq!(
            compute_imaginary_class_group(PublicImaginaryQuadraticInput {
                id: "nonfundamental",
                polynomial_ascending: [9, 0, 1],
            }),
            Err(ImaginaryClassGroupError::NotFundamentalDiscriminant)
        );
        let result = compute_imaginary_class_group(PublicImaginaryQuadraticInput {
            id: "class-number-five",
            polynomial_ascending: [12, -1, 1],
        })
        .unwrap();
        assert_eq!(result.class_number, 5);
        assert_eq!(result.invariant_factors, vec![5]);
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
                result.complete_class_map[1].coordinates = vec![0]
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
                result.generators[0].coordinates = vec![0]
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
    fn producer_authentication_rejects_counterfeit_metadata() {
        type Counterfeit = fn(&mut CompleteImaginaryClassGroup);
        let input = SMALL_IMAGINARY_CASES[4];
        let pristine = compute_imaginary_class_group(input).unwrap();
        let structure =
            compute_group_structure(&pristine.certificate.reduced_forms, pristine.discriminant)
                .unwrap();
        let discriminant = pristine.discriminant;
        let squarefree_core = pristine.certificate.fundamental_squarefree_core;
        let prime_factors = pristine.certificate.squarefree_core_prime_factors.clone();
        let reduction_bound_a = pristine.certificate.reduction_bound_a;
        let counterfeits: Vec<(&str, Counterfeit)> = vec![
            ("result discriminant", |result| result.discriminant -= 4),
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
            ("theorem", |result| {
                result.certificate.theorem = "counterfeit theorem"
            }),
        ];
        for (label, counterfeit) in counterfeits {
            let mut result = pristine.clone();
            counterfeit(&mut result);
            assert_eq!(
                authenticate_constructed_imaginary_class_group(
                    input,
                    &result,
                    &structure,
                    discriminant,
                    squarefree_core,
                    &prime_factors,
                    reduction_bound_a,
                ),
                Err(ImaginaryClassGroupError::InvalidCertificate),
                "counterfeit producer metadata was accepted: {label}"
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
    fn deterministic_fundamental_discriminant_sweep_replays_general_group_law() {
        let mut admitted = 0;
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
            let result = compute_imaginary_class_group(input).unwrap_or_else(|error| {
                panic!("unexpected sweep result for D={discriminant}: {error:?}")
            });
            assert_eq!(result.class_number, expected_class_number);
            assert_eq!(
                result.invariant_factors.iter().product::<u64>() as usize,
                expected_class_number
            );
            verify_imaginary_class_group(input, &result).unwrap();
            admitted += 1;
        }
        assert!(admitted >= 100);
    }

    #[test]
    fn exact_composition_is_associative_on_a_class_number_five_group() {
        let discriminant = -47;
        let forms = enumerate_reduced_forms(discriminant).1;
        assert_eq!(forms.len(), 5);
        for left in &forms {
            for middle in &forms {
                for right in &forms {
                    assert_eq!(
                        compose_forms(
                            compose_forms(*left, *middle, discriminant).unwrap(),
                            *right,
                            discriminant,
                        )
                        .unwrap(),
                        compose_forms(
                            *left,
                            compose_forms(*middle, *right, discriminant).unwrap(),
                            discriminant,
                        )
                        .unwrap()
                    );
                }
            }
        }
    }

    #[test]
    fn verifier_rejects_counterfeit_general_composition_maps_and_generators() {
        let input = GENERAL_IMAGINARY_CASES[2];
        let pristine = compute_imaginary_class_group(input).unwrap();
        assert_eq!(pristine.invariant_factors, vec![2, 6]);

        let mut swapped_map = pristine.clone();
        let left = swapped_map.complete_class_map[1].coordinates.clone();
        swapped_map.complete_class_map[1].coordinates =
            swapped_map.complete_class_map[2].coordinates.clone();
        swapped_map.complete_class_map[2].coordinates = left;
        assert_eq!(
            verify_imaginary_class_group(input, &swapped_map),
            Err(ImaginaryClassGroupError::InvalidCertificate)
        );

        let mut affine_counterfeit = pristine.clone();
        for entry in &mut affine_counterfeit.complete_class_map {
            entry.coordinates[1] = (entry.coordinates[1] + 1) % 6;
        }
        assert_eq!(
            verify_imaginary_class_group(input, &affine_counterfeit),
            Err(ImaginaryClassGroupError::InvalidCertificate)
        );

        let mut inverse_generator = pristine.clone();
        let inverse = inverse_generator.generators[1]
            .form
            .inverse_reduced()
            .unwrap();
        let inverse_entry = inverse_generator
            .complete_class_map
            .iter()
            .find(|entry| entry.form == inverse)
            .cloned()
            .unwrap();
        inverse_generator.generators[1].form = inverse;
        inverse_generator.generators[1].coordinates = inverse_entry.coordinates.clone();
        inverse_generator.generators[1].representative_ideal =
            inverse_entry.representative_ideal.clone();
        assert_eq!(
            verify_imaginary_class_group(input, &inverse_generator),
            Err(ImaginaryClassGroupError::InvalidCertificate)
        );
    }

    #[test]
    fn hostile_extreme_form_coefficients_fail_without_overflow() {
        let hostile = [
            BinaryQuadraticForm {
                a: i64::MAX,
                b: i64::MAX,
                c: i64::MAX,
            },
            BinaryQuadraticForm {
                a: i64::MIN,
                b: i64::MIN,
                c: i64::MIN,
            },
            BinaryQuadraticForm {
                a: 1,
                b: i64::MIN,
                c: 2,
            },
            BinaryQuadraticForm {
                a: i64::MAX,
                b: i64::MIN,
                c: i64::MIN,
            },
        ];
        for form in hostile {
            assert!(!form.is_primitive_reduced(-23));
            assert_eq!(
                compose_reduced_forms(form, principal_form(-23), -23),
                Err(ImaginaryClassGroupError::GroupLawFailure)
            );
        }
        assert_eq!(hostile[0].discriminant(), None);
        assert_eq!(hostile[1].discriminant(), None);
        assert_eq!(
            hostile[2].inverse_reduced(),
            Err(ImaginaryClassGroupError::GroupLawFailure)
        );

        let principal = principal_form(-23);
        for invalid_discriminant in [i64::MIN, i64::MAX] {
            assert_eq!(
                compose_reduced_forms(principal, principal, invalid_discriminant),
                Err(ImaginaryClassGroupError::GroupLawFailure)
            );
        }
    }
}
