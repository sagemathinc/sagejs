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
//! class. The admitted v2 domain has `|D| <= 2*10^11` and at most 50,000 reduced
//! forms; all other inputs fail closed.

use crate::{
    EmbeddingPrecisionState, PreparedNumberFieldData, PreparedNumberFieldValidationError,
    ValidatedPreparedNumberField,
};
use rug::Integer;
use serde::Serialize;
use std::{
    collections::{BTreeSet, VecDeque},
    fmt,
};

const MAXIMUM_ABSOLUTE_DISCRIMINANT: u64 = 200_000_000_000;
const MAXIMUM_REDUCED_FORMS: usize = 50_000;
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

    let proved_orbit = if discriminant.unsigned_abs() >= 1_000_000_000 {
        match prime_factors.len() {
            1 | 2 => cyclic_orbit_from_class_number(discriminant)?,
            3 if discriminant.rem_euclid(4) == 1 => {
                rank_two_orbit_from_class_number(discriminant, &prime_factors)?
            }
            _ => None,
        }
    } else {
        None
    };
    let (reduction_bound_a, forms, structure) = if let Some(result) = proved_orbit {
        result
    } else {
        let (bound, forms) = enumerate_reduced_forms(discriminant);
        if forms.len() > MAXIMUM_REDUCED_FORMS {
            return Err(ImaginaryClassGroupError::ReducedFormResourceLimit {
                class_number: forms.len(),
                maximum: MAXIMUM_REDUCED_FORMS,
            });
        }
        let structure = compute_group_structure(&forms, discriminant)?;
        (bound, forms, structure)
    };
    if forms.len() > MAXIMUM_REDUCED_FORMS {
        return Err(ImaginaryClassGroupError::ReducedFormResourceLimit {
            class_number: forms.len(),
            maximum: MAXIMUM_REDUCED_FORMS,
        });
    }
    let ideal = |form: BinaryQuadraticForm| ideal_representative(linear, form);
    let GroupStructure {
        invariants,
        coordinates,
        generator_indices,
    } = structure;
    let generators = generator_indices
        .iter()
        .map(|&(index, order)| ClassGenerator {
            form: forms[index],
            coordinates: coordinates[index].clone(),
            exact_order: order,
            representative_ideal: ideal(forms[index]),
        })
        .collect();
    let (complete_class_map, coordinate_ordinals) =
        materialize_class_map(&forms, coordinates, &invariants, linear)?;
    let answer = CompleteImaginaryClassGroup {
        schema: RESULT_SCHEMA,
        field_id: input.id,
        polynomial_ascending: input.polynomial_ascending,
        discriminant,
        class_number: forms.len(),
        invariant_factors: invariants.clone(),
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
        &invariants,
        &generator_indices,
        &coordinate_ordinals,
        discriminant,
        squarefree_core,
        &prime_factors,
        reduction_bound_a,
    )?;
    Ok(answer)
}

fn materialize_class_map(
    forms: &[BinaryQuadraticForm],
    coordinates: Vec<Vec<u64>>,
    invariants: &[u64],
    linear: i64,
) -> Result<(Vec<FormClassMapEntry>, Vec<usize>), ImaginaryClassGroupError> {
    if forms.len() != coordinates.len() {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let mut entries = Vec::with_capacity(forms.len());
    let mut ordinals = Vec::with_capacity(forms.len());
    for (&form, coordinate) in forms.iter().zip(coordinates) {
        ordinals.push(coordinate_ordinal(&coordinate, invariants, forms.len())?);
        entries.push(FormClassMapEntry {
            form,
            inverse_form: form.inverse_reduced()?,
            coordinates: coordinate,
            representative_ideal: ideal_representative(linear, form),
        });
    }
    Ok((entries, ordinals))
}

/// For a provably cyclic group, its complete reduced-form orbit can serve as
/// the completeness certificate. The exact reduced-form count gives `h`;
/// the order test proves a candidate generates `h` distinct classes, hence
/// every reduced form. The general enumerator remains the fallback.
fn cyclic_orbit_from_class_number(
    discriminant: i64,
) -> Result<Option<(i64, Vec<BinaryQuadraticForm>, GroupStructure)>, ImaginaryClassGroupError> {
    let class_number = count_reduced_forms(discriminant);
    if class_number > MAXIMUM_REDUCED_FORMS {
        return Err(ImaginaryClassGroupError::ReducedFormResourceLimit {
            class_number,
            maximum: MAXIMUM_REDUCED_FORMS,
        });
    }
    if class_number < 10_000 {
        return Ok(None);
    }
    let principal = principal_form(discriminant);
    let factors = factor_usize(class_number);
    let bound = integer_square_root(discriminant.unsigned_abs() / 3) as i64;
    let mut generator = None;
    // Prefer larger split-prime norms for the long orbit: multiplying by a
    // norm-2, -3, or -5 form repeatedly hits the general lattice product
    // more often. Keep those three primes as a complete-search fallback.
    for norm in (7_i64..=257).chain(2..=5) {
        if !is_prime(norm as u64) {
            continue;
        }
        for middle in -norm..=norm {
            let numerator = i128::from(middle) * i128::from(middle) - i128::from(discriminant);
            let denominator = 4 * i128::from(norm);
            if numerator % denominator != 0 {
                continue;
            }
            let last = numerator / denominator;
            let Ok(last) = i64::try_from(last) else {
                continue;
            };
            let candidate = BinaryQuadraticForm {
                a: norm,
                b: middle,
                c: last,
            };
            if !candidate.is_primitive_reduced(discriminant)
                || form_power(candidate, class_number, discriminant)? != principal
            {
                continue;
            }
            let mut full_order = true;
            for &(prime, _) in &factors {
                if form_power(candidate, class_number / prime, discriminant)? == principal {
                    full_order = false;
                    break;
                }
            }
            if full_order {
                generator = Some(candidate);
                break;
            }
        }
        if generator.is_some() {
            break;
        }
    }
    let Some(generator) = generator else {
        return Ok(None);
    };
    let mut tagged = collect_cyclic_orbit(generator, class_number, discriminant)?;
    if tagged.len() != class_number
        || tagged
            .iter()
            .any(|(form, _)| form.a > bound || !form.is_primitive_reduced(discriminant))
    {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    tagged.sort_unstable_by_key(|&(form, _)| form);
    if tagged.windows(2).any(|pair| pair[0].0 == pair[1].0) {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    let forms = tagged.iter().map(|&(form, _)| form).collect::<Vec<_>>();
    let coordinates = tagged
        .into_iter()
        .map(|(_, ordinal)| vec![ordinal])
        .collect();
    let generator_index = forms
        .binary_search(&generator)
        .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
    Ok(Some((
        bound,
        forms,
        GroupStructure {
            invariants: vec![class_number as u64],
            coordinates,
            generator_indices: vec![(generator_index, class_number as u64)],
        },
    )))
}

/// A proved index-two cyclic subgroup plus an involution outside it gives a
/// complete `C2 x C(h/2)` map. For odd squarefree `D`, forms with `b=a` are
/// inexpensive exact involution candidates derived from divisors of `|D|`.
fn rank_two_orbit_from_class_number(
    discriminant: i64,
    prime_factors: &[u64],
) -> Result<Option<(i64, Vec<BinaryQuadraticForm>, GroupStructure)>, ImaginaryClassGroupError> {
    let class_number = count_reduced_forms(discriminant);
    if class_number > MAXIMUM_REDUCED_FORMS {
        return Err(ImaginaryClassGroupError::ReducedFormResourceLimit {
            class_number,
            maximum: MAXIMUM_REDUCED_FORMS,
        });
    }
    if class_number < 10_000 || class_number % 4 != 0 {
        return Ok(None);
    }
    let order = class_number / 2;
    let principal = principal_form(discriminant);
    let bound = integer_square_root(discriminant.unsigned_abs() / 3) as i64;
    let involutions = divisor_boundary_involutions(discriminant, prime_factors, bound);
    if involutions.len() < 3 {
        return Ok(None);
    }
    let factors = factor_usize(order);
    let mut generators = None;
    for norm in (7_i64..=257).chain(2..=5) {
        if !is_prime(norm as u64) {
            continue;
        }
        for middle in -norm..=norm {
            let numerator = i128::from(middle) * i128::from(middle) - i128::from(discriminant);
            let denominator = 4 * i128::from(norm);
            if numerator % denominator != 0 {
                continue;
            }
            let Ok(last) = i64::try_from(numerator / denominator) else {
                continue;
            };
            let candidate = BinaryQuadraticForm {
                a: norm,
                b: middle,
                c: last,
            };
            if !candidate.is_primitive_reduced(discriminant)
                || form_power(candidate, order, discriminant)? != principal
            {
                continue;
            }
            let mut full_order = true;
            for &(prime, _) in &factors {
                if form_power(candidate, order / prime, discriminant)? == principal {
                    full_order = false;
                    break;
                }
            }
            if !full_order {
                continue;
            }
            let subgroup_involution = form_power(candidate, order / 2, discriminant)?;
            if let Some(involution) = involutions
                .iter()
                .copied()
                .find(|form| *form != principal && *form != subgroup_involution)
            {
                generators = Some((involution, candidate));
                break;
            }
        }
        if generators.is_some() {
            break;
        }
    }
    let Some((involution, generator)) = generators else {
        return Ok(None);
    };
    let mut tagged = collect_rank_two_orbit(involution, generator, order, discriminant)?;
    if tagged.len() != class_number
        || tagged
            .iter()
            .any(|(form, _)| form.a > bound || !form.is_primitive_reduced(discriminant))
    {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    tagged.sort_unstable_by_key(|&(form, _)| form);
    if tagged.windows(2).any(|pair| pair[0].0 == pair[1].0) {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    let forms = tagged.iter().map(|&(form, _)| form).collect::<Vec<_>>();
    let coordinates = tagged
        .into_iter()
        .map(|(_, coordinate)| coordinate.to_vec())
        .collect();
    let involution_index = forms
        .binary_search(&involution)
        .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
    let generator_index = forms
        .binary_search(&generator)
        .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
    Ok(Some((
        bound,
        forms,
        GroupStructure {
            invariants: vec![2, order as u64],
            coordinates,
            generator_indices: vec![(involution_index, 2), (generator_index, order as u64)],
        },
    )))
}

fn divisor_boundary_involutions(
    discriminant: i64,
    prime_factors: &[u64],
    bound: i64,
) -> Vec<BinaryQuadraticForm> {
    let mut divisors = vec![1_u64];
    for &prime in prime_factors {
        let existing = divisors.len();
        for index in 0..existing {
            divisors.push(divisors[index] * prime);
        }
    }
    let mut involutions = Vec::new();
    for divisor in divisors {
        if divisor > bound as u64 {
            continue;
        }
        let norm = divisor as i64;
        let numerator = i128::from(norm) * i128::from(norm) - i128::from(discriminant);
        let denominator = 4 * i128::from(norm);
        if numerator % denominator != 0 {
            continue;
        }
        let Ok(last) = i64::try_from(numerator / denominator) else {
            continue;
        };
        let form = BinaryQuadraticForm {
            a: norm,
            b: norm,
            c: last,
        };
        if form.is_primitive_reduced(discriminant) {
            involutions.push(form);
        }
    }
    involutions
}

fn collect_cyclic_orbit(
    generator: BinaryQuadraticForm,
    order: usize,
    discriminant: i64,
) -> Result<Vec<(BinaryQuadraticForm, u64)>, ImaginaryClassGroupError> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let workers = std::thread::available_parallelism()
            .map(|count| count.get().min(8))
            .unwrap_or(1);
        if order >= 10_000 && workers >= 2 {
            return collect_cyclic_orbit_with_workers(generator, order, discriminant, workers);
        }
    }
    collect_cyclic_orbit_sequential(generator, order, discriminant)
}

fn collect_cyclic_orbit_sequential(
    generator: BinaryQuadraticForm,
    order: usize,
    discriminant: i64,
) -> Result<Vec<(BinaryQuadraticForm, u64)>, ImaginaryClassGroupError> {
    let mut tagged = Vec::with_capacity(order);
    let mut power = principal_form(discriminant);
    let multiplier = FixedFormMultiplier::new(generator, discriminant);
    for ordinal in 0..=order / 2 {
        push_cyclic_orbit_inverse_pair(&mut tagged, power, ordinal, order)?;
        if ordinal < order / 2 {
            power = multiplier.apply(power)?;
        }
    }
    Ok(tagged)
}

fn push_cyclic_orbit_inverse_pair(
    tagged: &mut Vec<(BinaryQuadraticForm, u64)>,
    form: BinaryQuadraticForm,
    ordinal: usize,
    order: usize,
) -> Result<(), ImaginaryClassGroupError> {
    tagged.push((form, ordinal as u64));
    let inverse = form.inverse_reduced()?;
    let inverse_ordinal = ((order - ordinal) % order) as u64;
    if inverse != form {
        tagged.push((inverse, inverse_ordinal));
    } else if inverse_ordinal != ordinal as u64 {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    Ok(())
}

#[cfg(not(target_arch = "wasm32"))]
fn collect_cyclic_orbit_with_workers(
    generator: BinaryQuadraticForm,
    order: usize,
    discriminant: i64,
    workers: usize,
) -> Result<Vec<(BinaryQuadraticForm, u64)>, ImaginaryClassGroupError> {
    let half_span = order / 2 + 1;
    let chunk_size = half_span.div_ceil(workers.max(1));
    let multiplier = FixedFormMultiplier::new(generator, discriminant);
    let fragments = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for start in (0..half_span).step_by(chunk_size) {
            let end = (start + chunk_size).min(half_span);
            let multiplier = &multiplier;
            handles.push(scope.spawn(move || {
                let mut power = form_power(generator, start, discriminant)?;
                let mut tagged = Vec::with_capacity(2 * (end - start));
                for ordinal in start..end {
                    push_cyclic_orbit_inverse_pair(&mut tagged, power, ordinal, order)?;
                    if ordinal + 1 < end {
                        power = multiplier.apply(power)?;
                    }
                }
                Ok(tagged)
            }));
        }
        let mut fragments = Vec::with_capacity(handles.len());
        for handle in handles {
            fragments.push(
                handle
                    .join()
                    .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)??,
            );
        }
        Ok::<_, ImaginaryClassGroupError>(fragments)
    })?;
    Ok(fragments.into_iter().flatten().collect())
}

fn push_rank_two_orbit_inverse_pair(
    tagged: &mut Vec<(BinaryQuadraticForm, [u64; 2])>,
    form: BinaryQuadraticForm,
    first: u64,
    exponent: usize,
    order: usize,
) -> Result<(), ImaginaryClassGroupError> {
    tagged.push((form, [first, exponent as u64]));
    let inverse = form.inverse_reduced()?;
    let inverse_exponent = ((order - exponent) % order) as u64;
    if inverse != form {
        tagged.push((inverse, [first, inverse_exponent]));
    } else if inverse_exponent != exponent as u64 {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    Ok(())
}

fn collect_rank_two_orbit(
    involution: BinaryQuadraticForm,
    generator: BinaryQuadraticForm,
    order: usize,
    discriminant: i64,
) -> Result<Vec<(BinaryQuadraticForm, [u64; 2])>, ImaginaryClassGroupError> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let workers = std::thread::available_parallelism()
            .map(|count| count.get().min(8))
            .unwrap_or(1);
        if order >= 5_000 && workers >= 2 {
            return collect_rank_two_orbit_with_workers(
                involution,
                generator,
                order,
                discriminant,
                workers,
            );
        }
    }
    collect_rank_two_orbit_sequential(involution, generator, order, discriminant)
}

fn collect_rank_two_orbit_sequential(
    involution: BinaryQuadraticForm,
    generator: BinaryQuadraticForm,
    order: usize,
    discriminant: i64,
) -> Result<Vec<(BinaryQuadraticForm, [u64; 2])>, ImaginaryClassGroupError> {
    let mut tagged = Vec::with_capacity(2 * order);
    let mut power = principal_form(discriminant);
    let multiplier = FixedFormMultiplier::new(generator, discriminant);
    for exponent in 0..=order / 2 {
        push_rank_two_orbit_inverse_pair(&mut tagged, power, 0, exponent, order)?;
        let twisted = compose_reduced_forms_unchecked(power, involution, discriminant)?;
        push_rank_two_orbit_inverse_pair(&mut tagged, twisted, 1, exponent, order)?;
        if exponent < order / 2 {
            power = multiplier.apply(power)?;
        }
    }
    Ok(tagged)
}

#[cfg(not(target_arch = "wasm32"))]
fn collect_rank_two_orbit_with_workers(
    involution: BinaryQuadraticForm,
    generator: BinaryQuadraticForm,
    order: usize,
    discriminant: i64,
    workers: usize,
) -> Result<Vec<(BinaryQuadraticForm, [u64; 2])>, ImaginaryClassGroupError> {
    let half_span = order / 2 + 1;
    let chunk_size = half_span.div_ceil(workers.max(1));
    let multiplier = FixedFormMultiplier::new(generator, discriminant);
    let fragments = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for start in (0..half_span).step_by(chunk_size) {
            let end = (start + chunk_size).min(half_span);
            let multiplier = &multiplier;
            handles.push(scope.spawn(move || {
                let mut power = form_power(generator, start, discriminant)?;
                let mut tagged = Vec::with_capacity(4 * (end - start));
                for exponent in start..end {
                    push_rank_two_orbit_inverse_pair(&mut tagged, power, 0, exponent, order)?;
                    let twisted = compose_reduced_forms_unchecked(power, involution, discriminant)?;
                    push_rank_two_orbit_inverse_pair(&mut tagged, twisted, 1, exponent, order)?;
                    if exponent + 1 < end {
                        power = multiplier.apply(power)?;
                    }
                }
                Ok(tagged)
            }));
        }
        let mut fragments = Vec::with_capacity(handles.len());
        for handle in handles {
            fragments.push(
                handle
                    .join()
                    .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)??,
            );
        }
        Ok::<_, ImaginaryClassGroupError>(fragments)
    })?;
    Ok(fragments.into_iter().flatten().collect())
}

/// Authenticate the freshly constructed result against its private exact
/// construction witness without replaying the group law a second time.
///
/// `compute_group_structure` has already traversed the entire group, proved
/// the generator orders, assigned every mixed-radix coordinate exactly once,
/// and returned to the principal form. This helper is deliberately private
/// and receives the remaining producer-owned witness after the coordinate
/// vectors have moved into the public map. It checks the map is a coordinate
/// bijection without replaying every translation. Serialized or otherwise
/// untrusted results must use [`verify_imaginary_class_group`], which
/// independently re-enumerates the forms and replays generator translations.
fn authenticate_constructed_imaginary_class_group(
    input: PublicImaginaryQuadraticInput,
    result: &CompleteImaginaryClassGroup,
    invariants: &[u64],
    generator_indices: &[(usize, u64)],
    coordinate_ordinals: &[usize],
    discriminant: i64,
    squarefree_core: i64,
    prime_factors: &[u64],
    reduction_bound_a: i64,
) -> Result<(), ImaginaryClassGroupError> {
    let forms = &result.certificate.reduced_forms;
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
        || coordinate_ordinals.len() != forms.len()
        || generator_indices.len() != invariants.len()
        || result.generators.len() != generator_indices.len()
        || result.proof_status != "unconditional-complete"
        || result.runtime_uses_pari_or_fixture_answers
    {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let linear = input.polynomial_ascending[1];
    let mut seen_coordinates = vec![false; forms.len()];
    for (index, entry) in result.complete_class_map.iter().enumerate() {
        let form = forms[index];
        if entry.form != form
            || entry.inverse_form
                != form
                    .inverse_reduced()
                    .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?
            || entry.coordinates.len() != invariants.len()
            || entry.representative_ideal != ideal_representative(linear, form)
            || !representative_ideal_is_closed(
                input.polynomial_ascending,
                form,
                &entry.representative_ideal,
            )
        {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
        let coordinate_index = coordinate_ordinal(&entry.coordinates, invariants, forms.len())?;
        if coordinate_index != coordinate_ordinals[index] {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
        let seen = &mut seen_coordinates[coordinate_index];
        if std::mem::replace(seen, true) {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
    }
    for (position, (actual, &(index, order))) in
        result.generators.iter().zip(generator_indices).enumerate()
    {
        let mut unit_coordinate = vec![0_u64; invariants.len()];
        unit_coordinate[position] = 1;
        if index >= forms.len()
            || actual.form != forms[index]
            || actual.coordinates != unit_coordinate
            || actual.coordinates != result.complete_class_map[index].coordinates
            || actual.exact_order != order
            || actual.representative_ideal != ideal_representative(linear, forms[index])
        {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
    }
    Ok(())
}

fn coordinate_ordinal(
    coordinates: &[u64],
    invariants: &[u64],
    group_order: usize,
) -> Result<usize, ImaginaryClassGroupError> {
    if coordinates.len() != invariants.len() {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    let mut ordinal = 0_usize;
    let mut place = 1_usize;
    for (&coordinate, &order) in coordinates.iter().zip(invariants) {
        if coordinate >= order {
            return Err(ImaginaryClassGroupError::InvalidCertificate);
        }
        let digit = usize::try_from(coordinate)
            .map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
        let radix =
            usize::try_from(order).map_err(|_| ImaginaryClassGroupError::InvalidCertificate)?;
        ordinal = ordinal
            .checked_add(
                digit
                    .checked_mul(place)
                    .ok_or(ImaginaryClassGroupError::InvalidCertificate)?,
            )
            .ok_or(ImaginaryClassGroupError::InvalidCertificate)?;
        place = place
            .checked_mul(radix)
            .ok_or(ImaginaryClassGroupError::InvalidCertificate)?;
    }
    if ordinal >= group_order {
        return Err(ImaginaryClassGroupError::InvalidCertificate);
    }
    Ok(ordinal)
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
        // All callers enter with integral forms at a validated fundamental
        // discriminant. The exact numerator division above preserves that
        // discriminant; a fundamental discriminant admits no imprimitive
        // integral form. The reduction loop has established the canonical
        // inequalities, so repeating the gcd and discriminant checks for
        // every orbit multiplication is unnecessary.
        debug_assert!(reduced.is_primitive_reduced(discriminant));
        return Ok(reduced);
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
    let parity = discriminant.rem_euclid(2);
    let left_t = (-left.b - parity) / 2;
    let right_t = (-right.b - parity) / 2;
    let (common_divisor, inverse) = extended_gcd_i64(left.a, right.a);
    if common_divisor == 1 {
        // Coprime norm ideals multiply as their intersection. In the
        // theta-basis, the product's theta root solves the two exact
        // congruences t' = left_t (mod left_a) and t' = right_t (mod right_a).
        // For an admitted reduced form, a <= sqrt(|D|/3) < 258,200.
        // Hence these products fit i64 even at the 2*10^11 domain ceiling.
        let a = left.a * right.a;
        let shift = ((right_t - left_t) * inverse).rem_euclid(right.a);
        let t = (left_t + left.a * shift).rem_euclid(a);
        return reduce_lattice_form(
            i128::from(a),
            i128::from(t),
            i128::from(parity),
            target,
            discriminant,
        );
    }
    compose_reduced_forms_lattice_unchecked(left, right, discriminant)
}

/// Reuse the CRT inverse when one operand is a fixed, small prime-norm form.
/// The non-coprime products still take the general exact lattice path.
struct FixedFormMultiplier {
    form: BinaryQuadraticForm,
    discriminant: i64,
    parity: i64,
    right_t: i64,
    prime_inverses: Option<Vec<i64>>,
}

impl FixedFormMultiplier {
    fn new(form: BinaryQuadraticForm, discriminant: i64) -> Self {
        let parity = discriminant.rem_euclid(2);
        let prime_inverses = if (2..=257).contains(&form.a) && is_prime(form.a as u64) {
            let mut inverses = vec![0_i64; form.a as usize];
            for residue in 1..form.a {
                let (gcd, inverse) = extended_gcd_i64(residue, form.a);
                debug_assert_eq!(gcd, 1);
                inverses[residue as usize] = inverse.rem_euclid(form.a);
            }
            Some(inverses)
        } else {
            None
        };
        Self {
            form,
            discriminant,
            parity,
            right_t: (-form.b - parity) / 2,
            prime_inverses,
        }
    }

    fn apply(
        &self,
        left: BinaryQuadraticForm,
    ) -> Result<BinaryQuadraticForm, ImaginaryClassGroupError> {
        let Some(inverses) = &self.prime_inverses else {
            return compose_reduced_forms_unchecked(left, self.form, self.discriminant);
        };
        let inverse = inverses[left.a.rem_euclid(self.form.a) as usize];
        if inverse == 0 {
            return compose_reduced_forms_lattice_unchecked(left, self.form, self.discriminant);
        }
        let left_t = (-left.b - self.parity) / 2;
        let a = left.a * self.form.a;
        let shift = ((self.right_t - left_t) * inverse).rem_euclid(self.form.a);
        let t = (left_t + left.a * shift).rem_euclid(a);
        reduce_lattice_form(
            i128::from(a),
            i128::from(t),
            i128::from(self.parity),
            i128::from(self.discriminant),
            self.discriminant,
        )
    }
}

/// General rank-two ideal-lattice product, retained as the independent exact
/// oracle for the coprime-norm shortcut.
fn compose_reduced_forms_lattice_unchecked(
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
    reduce_lattice_form(a, t, parity, target, discriminant)
}

fn reduce_lattice_form(
    a: i128,
    t: i128,
    parity: i128,
    target: i128,
    discriminant: i64,
) -> Result<BinaryQuadraticForm, ImaginaryClassGroupError> {
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

/// Recognize `C2 x C(h/2)` without constructing every primary projection.
///
/// Four self-inverse forms prove 2-rank two. If an element has order `h/2`,
/// its cyclic subgroup has index two. An involution outside that subgroup
/// intersects it trivially and therefore gives the claimed direct product.
/// A cyclic subgroup has only one nonidentity involution, so no subgroup
/// enumeration is needed to identify an independent one. The subsequent
/// complete coordinate traversal independently checks that these generators
/// reach every enumerated class. This is only a bounded opportunistic path;
/// the general primary decomposition remains available.
fn almost_cyclic_generators(
    forms: &[BinaryQuadraticForm],
    discriminant: i64,
    involutions: &[BinaryQuadraticForm],
) -> Result<Option<Vec<BinaryQuadraticForm>>, ImaginaryClassGroupError> {
    if forms.len() % 4 != 0 || involutions.len() != 4 {
        return Ok(None);
    }
    let principal = principal_form(discriminant);
    let target_order = forms.len() / 2;
    for candidate in forms.iter().copied().take(128) {
        if form_order(candidate, forms.len(), discriminant)? != target_order {
            continue;
        }
        if form_power(candidate, target_order, discriminant)? != principal {
            return Err(ImaginaryClassGroupError::GroupLawFailure);
        }
        let subgroup_involution = form_power(candidate, target_order / 2, discriminant)?;
        if subgroup_involution == principal {
            return Err(ImaginaryClassGroupError::GroupLawFailure);
        }
        if let Some(involution) = involutions
            .iter()
            .copied()
            .find(|form| *form != principal && *form != subgroup_involution)
        {
            return Ok(Some(vec![involution, candidate]));
        }
    }
    Ok(None)
}

fn assign_form_inverse_pair(
    forms: &[BinaryQuadraticForm],
    assigned: &mut [bool],
    coordinates: &mut [Vec<u64>],
    form: BinaryQuadraticForm,
    coordinate: &[u64],
    invariants: &[usize],
) -> Result<(), ImaginaryClassGroupError> {
    if coordinate.len() != invariants.len()
        || coordinate
            .iter()
            .zip(invariants)
            .any(|(&value, &order)| value >= order as u64)
    {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    let index = forms
        .binary_search(&form)
        .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
    if assigned[index] {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    assigned[index] = true;
    coordinates[index] = coordinate.to_vec();
    let inverse_index = forms
        .binary_search(&form.inverse_reduced()?)
        .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
    let inverse_coordinate = coordinate
        .iter()
        .zip(invariants)
        .map(|(&value, &order)| if value == 0 { 0 } else { order as u64 - value })
        .collect::<Vec<_>>();
    if inverse_index != index {
        if assigned[inverse_index] {
            return Err(ImaginaryClassGroupError::GroupLawFailure);
        }
        assigned[inverse_index] = true;
        coordinates[inverse_index] = inverse_coordinate;
    } else if inverse_coordinate != coordinate {
        return Err(ImaginaryClassGroupError::GroupLawFailure);
    }
    Ok(())
}

#[cfg(not(target_arch = "wasm32"))]
fn collect_cyclic_map_parallel(
    forms: &[BinaryQuadraticForm],
    generator: BinaryQuadraticForm,
    discriminant: i64,
) -> Result<Option<Vec<(usize, u64)>>, ImaginaryClassGroupError> {
    if forms.len() < 10_000 {
        return Ok(None);
    }
    let workers = std::thread::available_parallelism()
        .map(|count| count.get().min(8))
        .unwrap_or(1);
    if workers < 2 {
        return Ok(None);
    }
    Ok(Some(collect_cyclic_map_with_workers(
        forms,
        generator,
        discriminant,
        workers,
    )?))
}

#[cfg(not(target_arch = "wasm32"))]
fn collect_cyclic_map_with_workers(
    forms: &[BinaryQuadraticForm],
    generator: BinaryQuadraticForm,
    discriminant: i64,
    workers: usize,
) -> Result<Vec<(usize, u64)>, ImaginaryClassGroupError> {
    let order = forms.len();
    let half_span = order / 2 + 1;
    let chunk_size = half_span.div_ceil(workers);
    let fragments = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for start in (0..half_span).step_by(chunk_size) {
            let end = (start + chunk_size).min(half_span);
            handles.push(scope.spawn(move || {
                let mut form = form_power(generator, start, discriminant)?;
                let mut entries = Vec::with_capacity(2 * (end - start));
                for ordinal in start..end {
                    let index = forms
                        .binary_search(&form)
                        .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
                    entries.push((index, ordinal as u64));
                    let inverse_index = forms
                        .binary_search(&form.inverse_reduced()?)
                        .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
                    let inverse_ordinal = (order - ordinal) % order;
                    if inverse_index != index {
                        entries.push((inverse_index, inverse_ordinal as u64));
                    } else if inverse_ordinal != ordinal {
                        return Err(ImaginaryClassGroupError::GroupLawFailure);
                    }
                    if ordinal + 1 < end {
                        form = compose_reduced_forms_unchecked(form, generator, discriminant)?;
                    }
                }
                Ok(entries)
            }));
        }
        let mut fragments = Vec::with_capacity(handles.len());
        for handle in handles {
            fragments.push(
                handle
                    .join()
                    .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)??,
            );
        }
        Ok::<_, ImaginaryClassGroupError>(fragments)
    })?;
    Ok(fragments.into_iter().flatten().collect())
}

#[cfg(target_arch = "wasm32")]
fn collect_cyclic_map_parallel(
    _forms: &[BinaryQuadraticForm],
    _generator: BinaryQuadraticForm,
    _discriminant: i64,
) -> Result<Option<Vec<(usize, u64)>>, ImaginaryClassGroupError> {
    Ok(None)
}

#[cfg(not(target_arch = "wasm32"))]
fn collect_rank_two_map_parallel(
    forms: &[BinaryQuadraticForm],
    involution: BinaryQuadraticForm,
    generator: BinaryQuadraticForm,
    discriminant: i64,
) -> Result<Option<Vec<(usize, [u64; 2])>>, ImaginaryClassGroupError> {
    if forms.len() < 10_000 {
        return Ok(None);
    }
    let workers = std::thread::available_parallelism()
        .map(|count| count.get().min(8))
        .unwrap_or(1);
    if workers < 2 {
        return Ok(None);
    }
    Ok(Some(collect_rank_two_map_with_workers(
        forms,
        involution,
        generator,
        discriminant,
        workers,
    )?))
}

#[cfg(not(target_arch = "wasm32"))]
fn collect_rank_two_map_with_workers(
    forms: &[BinaryQuadraticForm],
    involution: BinaryQuadraticForm,
    generator: BinaryQuadraticForm,
    discriminant: i64,
    workers: usize,
) -> Result<Vec<(usize, [u64; 2])>, ImaginaryClassGroupError> {
    let order = forms.len() / 2;
    let half_span = order / 2 + 1;
    let chunk_size = half_span.div_ceil(workers.max(1));
    let fragments = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for start in (0..half_span).step_by(chunk_size) {
            let end = (start + chunk_size).min(half_span);
            handles.push(scope.spawn(move || {
                let mut power = form_power(generator, start, discriminant)?;
                let mut entries = Vec::with_capacity(4 * (end - start));
                for exponent in start..end {
                    for (first, form) in [
                        (0_u64, power),
                        (
                            1_u64,
                            compose_reduced_forms_unchecked(power, involution, discriminant)?,
                        ),
                    ] {
                        let index = forms
                            .binary_search(&form)
                            .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
                        entries.push((index, [first, exponent as u64]));
                        let inverse_index = forms
                            .binary_search(&form.inverse_reduced()?)
                            .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)?;
                        let inverse_exponent = (order - exponent) % order;
                        if inverse_index != index {
                            entries.push((inverse_index, [first, inverse_exponent as u64]));
                        } else if inverse_exponent != exponent {
                            return Err(ImaginaryClassGroupError::GroupLawFailure);
                        }
                    }
                    if exponent + 1 < end {
                        power = compose_reduced_forms_unchecked(power, generator, discriminant)?;
                    }
                }
                Ok(entries)
            }));
        }
        let mut fragments = Vec::with_capacity(handles.len());
        for handle in handles {
            fragments.push(
                handle
                    .join()
                    .map_err(|_| ImaginaryClassGroupError::GroupLawFailure)??,
            );
        }
        Ok::<_, ImaginaryClassGroupError>(fragments)
    })?;
    Ok(fragments.into_iter().flatten().collect())
}

#[cfg(target_arch = "wasm32")]
fn collect_rank_two_map_parallel(
    _forms: &[BinaryQuadraticForm],
    _involution: BinaryQuadraticForm,
    _generator: BinaryQuadraticForm,
    _discriminant: i64,
) -> Result<Option<Vec<(usize, [u64; 2])>>, ImaginaryClassGroupError> {
    Ok(None)
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
    let involutions = if forms.len() % 2 == 0 {
        forms
            .iter()
            .filter(|form| form.inverse_reduced() == Ok(**form))
            .copied()
            .take(5)
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    let cyclic_possible = forms.len() % 2 != 0 || involutions.len() == 2;
    let almost_cyclic = if !cyclic_possible && involutions.len() == 4 {
        almost_cyclic_generators(forms, discriminant, &involutions)?
    } else {
        None
    };
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
    } else if let Some(generators) = almost_cyclic {
        (vec![2, forms.len() / 2], generators)
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
        if let Some(entries) = collect_cyclic_map_parallel(forms, generator, discriminant)? {
            for (index, ordinal) in entries {
                if assigned[index] {
                    return Err(ImaginaryClassGroupError::GroupLawFailure);
                }
                assigned[index] = true;
                coordinates[index] = vec![ordinal];
            }
        } else {
            let mut form = principal;
            for ordinal in 0..=forms.len() / 2 {
                assign_form_inverse_pair(
                    forms,
                    &mut assigned,
                    &mut coordinates,
                    form,
                    &[ordinal as u64],
                    &invariants,
                )?;
                if ordinal < forms.len() / 2 {
                    form = compose_reduced_forms_unchecked(form, generator, discriminant)?;
                }
            }
        }
        if form_power(generator, forms.len(), discriminant)? != principal {
            return Err(ImaginaryClassGroupError::GroupLawFailure);
        }
    } else if invariants.len() == 2 && invariants[0] == 2 {
        // Each power of the large generator and its inverse give two classes;
        // multiplying each by the independent involution gives the other two.
        // Uniqueness of all assignments proves the claimed direct product.
        let involution = generators[0];
        let generator = generators[1];
        let order = invariants[1];
        if form_power(involution, 2, discriminant)? != principal
            || form_power(generator, order, discriminant)? != principal
        {
            return Err(ImaginaryClassGroupError::GroupLawFailure);
        }
        if let Some(entries) =
            collect_rank_two_map_parallel(forms, involution, generator, discriminant)?
        {
            for (index, coordinate) in entries {
                if assigned[index] {
                    return Err(ImaginaryClassGroupError::GroupLawFailure);
                }
                assigned[index] = true;
                coordinates[index] = coordinate.to_vec();
            }
        } else {
            let mut power = principal;
            for exponent in 0..=order / 2 {
                assign_form_inverse_pair(
                    forms,
                    &mut assigned,
                    &mut coordinates,
                    power,
                    &[0, exponent as u64],
                    &invariants,
                )?;
                let twisted = compose_reduced_forms_unchecked(power, involution, discriminant)?;
                assign_form_inverse_pair(
                    forms,
                    &mut assigned,
                    &mut coordinates,
                    twisted,
                    &[1, exponent as u64],
                    &invariants,
                )?;
                if exponent < order / 2 {
                    power = compose_reduced_forms_unchecked(power, generator, discriminant)?;
                }
            }
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

fn extended_gcd_i64(left: i64, right: i64) -> (i64, i64) {
    let (mut old_r, mut r) = (left, right);
    let (mut old_s, mut s) = (1_i64, 0_i64);
    while r != 0 {
        let quotient = old_r / r;
        (old_r, r) = (r, old_r - quotient * r);
        (old_s, s) = (s, old_s - quotient * s);
    }
    (old_r, old_s)
}

fn gcd_i128(mut left: i128, mut right: i128) -> i128 {
    while right != 0 {
        (left, right) = (right, left.rem_euclid(right));
    }
    left.abs()
}

fn enumerate_reduced_forms(discriminant: i64) -> (i64, Vec<BinaryQuadraticForm>) {
    #[cfg(not(target_arch = "wasm32"))]
    if let Some(result) = enumerate_reduced_forms_parallel(discriminant) {
        return result;
    }
    enumerate_reduced_forms_sequential(discriminant)
}

fn enumerate_reduced_forms_sequential(discriminant: i64) -> (i64, Vec<BinaryQuadraticForm>) {
    let mut forms = Vec::new();
    let bound = visit_sieved_reduced_form_families(discriminant, |a, b, c, both_orientations| {
        let form = BinaryQuadraticForm {
            a: a as i64,
            b: b as i64,
            c: c as i64,
        };
        forms.push(form);
        if both_orientations {
            forms.push(BinaryQuadraticForm { b: -form.b, ..form });
        }
    });
    sort_reduced_forms(&mut forms, bound as usize);
    (bound, forms)
}

fn sort_reduced_forms(forms: &mut Vec<BinaryQuadraticForm>, bound: usize) {
    if forms.len() < 1_000 {
        forms.sort_unstable();
        return;
    }
    // Reduced forms have 1 <= a <= floor(sqrt(|D|/3)). Counting the first
    // lexicographic key makes the final per-norm sorts tiny on typical fields.
    let mut offsets = vec![0_usize; bound + 2];
    for form in forms.iter() {
        offsets[form.a as usize + 1] += 1;
    }
    for index in 1..offsets.len() {
        offsets[index] += offsets[index - 1];
    }
    let mut cursors = offsets.clone();
    let mut ordered = vec![BinaryQuadraticForm { a: 0, b: 0, c: 0 }; forms.len()];
    for form in forms.iter().copied() {
        let cursor = &mut cursors[form.a as usize];
        ordered[*cursor] = form;
        *cursor += 1;
    }
    for norm in 1..=bound {
        ordered[offsets[norm]..offsets[norm + 1]].sort_unstable();
    }
    *forms = ordered;
}

#[derive(Clone, Copy)]
struct SieveFactor {
    prime: u64,
    next: u32,
    exponent: u8,
}

#[derive(Clone, Copy)]
struct SieveRootPattern {
    prime: u64,
    first_index: u64,
    second_index: Option<u64>,
}

fn record_sieve_factor(
    heads: &mut [u32],
    factors: &mut Vec<SieveFactor>,
    norm_index: usize,
    prime: u64,
    exponent: u32,
) {
    // At the admitted discriminant bound, there are fewer than 130,000
    // candidate norms and fewer than eleven distinct factors per norm.
    let next_index = u32::try_from(factors.len()).expect("bounded sieve factor count");
    factors.push(SieveFactor {
        prime,
        next: heads[norm_index],
        exponent: u8::try_from(exponent).expect("bounded norm exponent"),
    });
    heads[norm_index] = next_index;
}

fn count_reduced_forms(discriminant: i64) -> usize {
    #[cfg(not(target_arch = "wasm32"))]
    if let Some(count) = count_reduced_forms_parallel(discriminant) {
        return count;
    }
    let mut count = 0;
    visit_sieved_reduced_form_families(discriminant, |_, _, _, both_orientations| {
        count += if both_orientations { 2 } else { 1 };
    });
    count
}

#[cfg(not(target_arch = "wasm32"))]
fn count_reduced_forms_parallel(discriminant: i64) -> Option<usize> {
    let absolute = discriminant.unsigned_abs();
    let bound = integer_square_root(absolute / 3);
    let parity = if discriminant.rem_euclid(4) == 1 {
        1
    } else {
        0
    };
    let candidates = ((bound - parity) / 2 + 1) as usize;
    if candidates < 20_000 {
        return None;
    }
    let workers = std::thread::available_parallelism()
        .map(|count| count.get().min(8))
        .unwrap_or(1);
    (workers >= 2).then(|| count_reduced_forms_with_workers(discriminant, workers))
}

#[cfg(not(target_arch = "wasm32"))]
fn count_reduced_forms_with_workers(discriminant: i64, workers: usize) -> usize {
    let absolute = discriminant.unsigned_abs();
    let bound = integer_square_root(absolute / 3);
    let parity = if discriminant.rem_euclid(4) == 1 {
        1
    } else {
        0
    };
    let candidates = ((bound - parity) / 2 + 1) as usize;
    let patterns = sieve_root_patterns_with_workers(discriminant, bound, parity, workers);
    let chunk_size = candidates.div_ceil(workers.max(1));
    std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for start in (0..candidates).step_by(chunk_size) {
            let end = (start + chunk_size).min(candidates);
            let patterns = &patterns;
            handles.push(scope.spawn(move || {
                let mut count = 0;
                visit_sieved_reduced_form_families_range(
                    discriminant,
                    bound,
                    parity,
                    patterns,
                    start,
                    end,
                    |_, _, _, both_orientations| {
                        count += if both_orientations { 2 } else { 1 };
                    },
                );
                count
            }));
        }
        handles
            .into_iter()
            .map(|handle| handle.join().expect("quadratic form-count worker panicked"))
            .sum()
    })
}

/// Visit canonical reduced-form families using a sieve of their candidate norms.
///
/// For a fundamental discriminant every integral form at that discriminant is
/// primitive: a common coefficient divisor would square-divide the field
/// discriminant. The callback receives the positive orientation and whether
/// its negative orientation is distinct; the scalar count does not need to
/// allocate forms, while the full group materializes the exact same families.
fn visit_sieved_reduced_form_families(
    discriminant: i64,
    mut visit: impl FnMut(u64, u64, u64, bool),
) -> i64 {
    let absolute = discriminant.unsigned_abs();
    let bound = integer_square_root(absolute / 3);
    let parity = if discriminant.rem_euclid(4) == 1 {
        1
    } else {
        0
    };
    let count = ((bound - parity) / 2 + 1) as usize;
    let patterns = sieve_root_patterns(discriminant, bound, parity);
    visit_sieved_reduced_form_families_range(
        discriminant,
        bound,
        parity,
        &patterns,
        0,
        count,
        &mut visit,
    );
    bound as i64
}

fn sieve_root_patterns(discriminant: i64, bound: u64, parity: u64) -> Vec<SieveRootPattern> {
    let primes = sieve_candidate_primes(discriminant, bound);
    root_patterns_for_primes(discriminant, parity, &primes)
}

fn sieve_candidate_primes(discriminant: i64, bound: u64) -> Vec<u64> {
    let absolute = discriminant.unsigned_abs();
    let maximum_n = (bound * bound + absolute) / 4 + 1;
    let prime_bound = integer_square_root(maximum_n) as usize;
    let mut prime_sieve = vec![true; prime_bound + 1];
    let mut primes = Vec::new();
    for prime in 2..=prime_bound {
        if !prime_sieve[prime] {
            continue;
        }
        if prime <= prime_bound / prime {
            for multiple in (prime * prime..=prime_bound).step_by(prime) {
                prime_sieve[multiple] = false;
            }
        }
        if prime == 2 {
            continue;
        }
        primes.push(prime as u64);
    }
    primes
}

fn root_patterns_for_primes(
    discriminant: i64,
    parity: u64,
    primes: &[u64],
) -> Vec<SieveRootPattern> {
    let mut patterns = Vec::new();
    for &prime in primes {
        let residue = discriminant.rem_euclid(prime as i64) as u64;
        let Some(first_root) = square_root_mod_prime(residue, prime) else {
            continue;
        };
        let other_root = (prime - first_root) % prime;
        let index_for_root =
            |root: u64| ((root + prime - parity) % prime) * ((prime + 1) / 2) % prime;
        patterns.push(SieveRootPattern {
            prime,
            first_index: index_for_root(first_root),
            second_index: (first_root != other_root).then(|| index_for_root(other_root)),
        });
    }
    patterns
}

#[cfg(not(target_arch = "wasm32"))]
fn sieve_root_patterns_with_workers(
    discriminant: i64,
    bound: u64,
    parity: u64,
    workers: usize,
) -> Vec<SieveRootPattern> {
    let primes = sieve_candidate_primes(discriminant, bound);
    let chunk_size = primes.len().div_ceil(workers.max(1));
    std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for chunk in primes.chunks(chunk_size) {
            handles
                .push(scope.spawn(move || root_patterns_for_primes(discriminant, parity, chunk)));
        }
        handles
            .into_iter()
            .flat_map(|handle| handle.join().expect("sieve root worker panicked"))
            .collect()
    })
}

fn visit_sieved_reduced_form_families_range(
    discriminant: i64,
    bound: u64,
    parity: u64,
    patterns: &[SieveRootPattern],
    start: usize,
    end: usize,
    mut visit: impl FnMut(u64, u64, u64, bool),
) {
    let absolute = discriminant.unsigned_abs();
    let mut norms = Vec::with_capacity(end - start);
    for index in start..end {
        let b = parity + 2 * index as u64;
        norms.push((b * b + absolute) / 4);
    }
    let mut residuals = norms.clone();
    let mut factor_heads = vec![u32::MAX; norms.len()];
    let mut factors = Vec::with_capacity(norms.len() * 3);
    for (index, residual) in residuals.iter_mut().enumerate() {
        if *residual % 2 == 0 {
            let mut exponent = 0;
            while *residual % 2 == 0 {
                *residual /= 2;
                exponent += 1;
            }
            record_sieve_factor(&mut factor_heads, &mut factors, index, 2, exponent);
        }
    }
    for pattern in patterns {
        for first_index in [Some(pattern.first_index), pattern.second_index]
            .into_iter()
            .flatten()
        {
            let prime = pattern.prime;
            let mut global_index = first_index;
            if global_index < start as u64 {
                global_index += (start as u64 - global_index).div_ceil(prime) * prime;
            }
            while global_index < end as u64 {
                let index = (global_index - start as u64) as usize;
                let residual = &mut residuals[index];
                if *residual % prime == 0 {
                    let mut exponent = 0;
                    while *residual % prime == 0 {
                        *residual /= prime;
                        exponent += 1;
                    }
                    record_sieve_factor(&mut factor_heads, &mut factors, index, prime, exponent);
                }
                global_index += prime;
            }
        }
    }

    let mut divisors = Vec::new();
    for (index, &n) in norms.iter().enumerate() {
        let b = parity + 2 * (start + index) as u64;
        if residuals[index] > 1 {
            record_sieve_factor(&mut factor_heads, &mut factors, index, residuals[index], 1);
        }
        divisors.clear();
        divisors.push(1_u64);
        let mut factor_index = factor_heads[index];
        while factor_index != u32::MAX {
            let factor = factors[factor_index as usize];
            let existing = divisors.len();
            let mut power = 1;
            for _ in 0..factor.exponent {
                power *= factor.prime;
                for divisor_index in 0..existing {
                    divisors.push(divisors[divisor_index] * power);
                }
            }
            factor_index = factor.next;
        }
        for &a in &divisors {
            if a > bound || a < b || a * a > n {
                continue;
            }
            visit(a, b, n / a, b != 0 && b != a && a * a != n);
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn enumerate_reduced_forms_parallel(discriminant: i64) -> Option<(i64, Vec<BinaryQuadraticForm>)> {
    let absolute = discriminant.unsigned_abs();
    let bound = integer_square_root(absolute / 3);
    let parity = if discriminant.rem_euclid(4) == 1 {
        1
    } else {
        0
    };
    let count = ((bound - parity) / 2 + 1) as usize;
    if count < 20_000 {
        return None;
    }
    let workers = std::thread::available_parallelism()
        .map(|count| count.get().min(8))
        .unwrap_or(1);
    if workers < 2 {
        return None;
    }
    Some(enumerate_reduced_forms_with_workers(discriminant, workers))
}

#[cfg(not(target_arch = "wasm32"))]
fn enumerate_reduced_forms_with_workers(
    discriminant: i64,
    workers: usize,
) -> (i64, Vec<BinaryQuadraticForm>) {
    let absolute = discriminant.unsigned_abs();
    let bound = integer_square_root(absolute / 3);
    let parity = if discriminant.rem_euclid(4) == 1 {
        1
    } else {
        0
    };
    let count = ((bound - parity) / 2 + 1) as usize;
    let patterns = sieve_root_patterns_with_workers(discriminant, bound, parity, workers);
    let chunk_size = count.div_ceil(workers);
    let fragments = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for start in (0..count).step_by(chunk_size) {
            let end = (start + chunk_size).min(count);
            let patterns = &patterns;
            handles.push(scope.spawn(move || {
                let mut forms = Vec::new();
                visit_sieved_reduced_form_families_range(
                    discriminant,
                    bound,
                    parity,
                    patterns,
                    start,
                    end,
                    |a, b, c, both_orientations| {
                        let form = BinaryQuadraticForm {
                            a: a as i64,
                            b: b as i64,
                            c: c as i64,
                        };
                        forms.push(form);
                        if both_orientations {
                            forms.push(BinaryQuadraticForm { b: -form.b, ..form });
                        }
                    },
                );
                forms
            }));
        }
        handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect::<Vec<_>>()
    });
    let mut forms = fragments.into_iter().flatten().collect::<Vec<_>>();
    sort_reduced_forms(&mut forms, bound as usize);
    (bound as i64, forms)
}

fn power_mod(mut base: u64, mut exponent: u64, modulus: u64) -> u64 {
    let mut result = 1;
    while exponent != 0 {
        if exponent & 1 != 0 {
            result = result * base % modulus;
        }
        base = base * base % modulus;
        exponent >>= 1;
    }
    result
}

fn square_root_mod_prime(value: u64, prime: u64) -> Option<u64> {
    if value == 0 {
        return Some(0);
    }
    if power_mod(value, (prime - 1) / 2, prime) != 1 {
        return None;
    }
    if prime % 4 == 3 {
        return Some(power_mod(value, (prime + 1) / 4, prime));
    }
    let mut odd_part = prime - 1;
    let mut exponent_of_two = 0;
    while odd_part % 2 == 0 {
        odd_part /= 2;
        exponent_of_two += 1;
    }
    let mut nonsquare = 2;
    while power_mod(nonsquare, (prime - 1) / 2, prime) != prime - 1 {
        nonsquare += 1;
    }
    let mut coefficient = power_mod(nonsquare, odd_part, prime);
    let mut root = power_mod(value, (odd_part + 1) / 2, prime);
    let mut remainder = power_mod(value, odd_part, prime);
    while remainder != 1 {
        let mut step = 1;
        let mut squared = remainder * remainder % prime;
        while squared != 1 {
            squared = squared * squared % prime;
            step += 1;
        }
        let correction = power_mod(coefficient, 1 << (exponent_of_two - step - 1), prime);
        root = root * correction % prime;
        coefficient = correction * correction % prime;
        remainder = remainder * coefficient % prime;
        exponent_of_two = step;
    }
    Some(root)
}

#[cfg(test)]
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
    // The candidate norm (b²-D)/4 is identical for b and -b. Factor it once,
    // then visit both reduced orientations when they are distinct. Boundary
    // forms have only one canonical sign.
    for b in 0..=signed_bound {
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
            if b != 0 {
                let inverse_orientation = BinaryQuadraticForm {
                    a: form.a,
                    b: -form.b,
                    c: form.c,
                };
                if inverse_orientation.is_primitive_reduced(discriminant) {
                    visit(inverse_orientation);
                }
            }
        }
    }
    i64::try_from(bound).unwrap()
}

fn integer_square_root(value: u64) -> u64 {
    value.isqrt()
}

#[cfg(test)]
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
            assert_eq!(scalar.class_number, group.class_number, "{}", input.id);
            assert_eq!(scalar.proof_status, "unconditional-complete");
        }
        assert_eq!(
            compute_imaginary_class_number_from_coefficients([9, 0, 1]),
            Err(ImaginaryClassGroupError::NotFundamentalDiscriminant)
        );
    }

    #[test]
    fn computes_a_medium_band_field_with_a_complete_map() {
        let input = PublicImaginaryQuadraticInput {
            id: "imaginary-d100000000003-c31057",
            polynomial_ascending: [25_000_000_001, -1, 1],
        };
        let scalar =
            compute_imaginary_class_number_from_coefficients(input.polynomial_ascending).unwrap();
        assert_eq!(scalar.discriminant, -100_000_000_003);
        assert_eq!(scalar.class_number, 31_057);
        let group = compute_imaginary_class_group(input).unwrap();
        assert_eq!(group.class_number, scalar.class_number);
        assert_eq!(group.invariant_factors, vec![31_057]);
        assert_eq!(group.complete_class_map.len(), scalar.class_number);
        verify_imaginary_class_group(input, &group).unwrap();
    }

    #[test]
    fn proven_cyclic_orbits_match_complete_reduced_form_enumeration() {
        for discriminant in [
            -20_000_000_179,
            -40_000_000_003,
            -60_000_000_091,
            -20_000_001_124,
        ] {
            let (bound, forms, orbit_structure) = cyclic_orbit_from_class_number(discriminant)
                .unwrap()
                .expect("frozen cyclic field has a small prime-form generator");
            let (reference_bound, reference_forms) = enumerate_reduced_forms(discriminant);
            assert_eq!(bound, reference_bound);
            assert_eq!(forms, reference_forms);
            let reference_structure = compute_group_structure(&forms, discriminant).unwrap();
            assert_eq!(orbit_structure.invariants, reference_structure.invariants);
            let generator = forms[orbit_structure.generator_indices[0].0];
            #[cfg(not(target_arch = "wasm32"))]
            {
                let mut sequential =
                    collect_cyclic_orbit_sequential(generator, forms.len(), discriminant).unwrap();
                sequential.sort_unstable();
                for workers in [2, 4, 8] {
                    let mut parallel = collect_cyclic_orbit_with_workers(
                        generator,
                        forms.len(),
                        discriminant,
                        workers,
                    )
                    .unwrap();
                    parallel.sort_unstable();
                    assert_eq!(parallel, sequential);
                }
            }
            for (form, coordinate) in forms
                .iter()
                .zip(&orbit_structure.coordinates)
                .step_by((forms.len() / 64).max(1))
            {
                assert_eq!(
                    form_power(generator, coordinate[0] as usize, discriminant).unwrap(),
                    *form
                );
            }
            let linear = if discriminant.rem_euclid(4) == 1 {
                -1
            } else {
                0
            };
            let input = PublicImaginaryQuadraticInput {
                id: "cyclic-orbit-differential",
                polynomial_ascending: [(linear * linear - discriminant) / 4, linear, 1],
            };
            let public = compute_imaginary_class_group(input).unwrap();
            verify_imaginary_class_group(input, &public).unwrap();
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn parallel_cyclic_map_matches_the_exact_sequential_map() {
        let discriminant = -9_999_991;
        let forms = enumerate_reduced_forms(discriminant).1;
        let sequential = compute_group_structure(&forms, discriminant).unwrap();
        assert_eq!(sequential.invariants, vec![1_715]);
        let generator = forms[sequential.generator_indices[0].0];
        let entries = collect_cyclic_map_with_workers(&forms, generator, discriminant, 4).unwrap();
        let mut parallel = vec![None; forms.len()];
        for (index, coordinate) in entries {
            assert!(parallel[index].replace(coordinate).is_none());
        }
        assert_eq!(
            parallel,
            sequential
                .coordinates
                .iter()
                .map(|coordinate| Some(coordinate[0]))
                .collect::<Vec<_>>()
        );
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn parallel_rank_two_map_matches_the_exact_sequential_map() {
        let discriminant = -15_000_000_315;
        let forms = enumerate_reduced_forms(discriminant).1;
        let structure = compute_group_structure(&forms, discriminant).unwrap();
        assert_eq!(structure.invariants, vec![2, 16_884]);
        let involution = forms[structure.generator_indices[0].0];
        let generator = forms[structure.generator_indices[1].0];
        for workers in [2, 4, 8] {
            let entries = collect_rank_two_map_with_workers(
                &forms,
                involution,
                generator,
                discriminant,
                workers,
            )
            .unwrap();
            let mut parallel = vec![None; forms.len()];
            for (index, coordinate) in entries {
                assert!(parallel[index].replace(coordinate.to_vec()).is_none());
            }
            assert_eq!(
                parallel,
                structure
                    .coordinates
                    .iter()
                    .map(|coordinate| Some(coordinate.clone()))
                    .collect::<Vec<_>>()
            );
        }
    }

    #[test]
    fn bounded_norm_sort_matches_lexicographic_sort() {
        let discriminant = -15_000_000_315;
        let (bound, mut forms) = enumerate_reduced_forms_sequential(discriminant);
        forms.reverse();
        let mut reference = forms.clone();
        reference.sort_unstable();
        sort_reduced_forms(&mut forms, bound as usize);
        assert_eq!(forms, reference);
    }

    #[test]
    fn computes_a_large_noncyclic_group_with_a_complete_map() {
        let input = PublicImaginaryQuadraticInput {
            id: "imaginary-d15000000315-c2xc16884",
            polynomial_ascending: [3_750_000_079, -1, 1],
        };
        let group = compute_imaginary_class_group(input).unwrap();
        assert_eq!(group.discriminant, -15_000_000_315);
        assert_eq!(group.class_number, 33_768);
        assert_eq!(group.invariant_factors, vec![2, 16_884]);
        assert_eq!(group.complete_class_map.len(), group.class_number);
        verify_imaginary_class_group(input, &group).unwrap();
    }

    #[test]
    fn proved_rank_two_orbit_matches_complete_reduced_form_enumeration() {
        let discriminant = -15_000_000_315;
        let factors = [3, 5, 1_000_000_021];
        let (bound, forms, structure) = rank_two_orbit_from_class_number(discriminant, &factors)
            .unwrap()
            .expect("frozen rank-two field has an exact index-two orbit");
        let (reference_bound, reference_forms) = enumerate_reduced_forms(discriminant);
        assert_eq!(bound, reference_bound);
        assert_eq!(forms, reference_forms);
        assert_eq!(structure.invariants, vec![2, 16_884]);
        let involution = forms[structure.generator_indices[0].0];
        let generator = forms[structure.generator_indices[1].0];
        #[cfg(not(target_arch = "wasm32"))]
        {
            let mut sequential =
                collect_rank_two_orbit_sequential(involution, generator, 16_884, discriminant)
                    .unwrap();
            sequential.sort_unstable();
            for workers in [2, 4, 8] {
                let mut parallel = collect_rank_two_orbit_with_workers(
                    involution,
                    generator,
                    16_884,
                    discriminant,
                    workers,
                )
                .unwrap();
                parallel.sort_unstable();
                assert_eq!(parallel, sequential);
            }
        }
        for (form, coordinate) in forms
            .iter()
            .zip(&structure.coordinates)
            .step_by((forms.len() / 64).max(1))
        {
            let power = form_power(generator, coordinate[1] as usize, discriminant).unwrap();
            let expected = if coordinate[0] == 0 {
                power
            } else {
                compose_reduced_forms_unchecked(power, involution, discriminant).unwrap()
            };
            assert_eq!(*form, expected);
        }
    }

    #[test]
    fn almost_cyclic_involution_is_outside_the_large_cyclic_subgroup() {
        for discriminant in [-231, -15_000_000_315] {
            let forms = enumerate_reduced_forms(discriminant).1;
            let involutions = forms
                .iter()
                .filter(|form| form.inverse_reduced() == Ok(**form))
                .copied()
                .collect::<Vec<_>>();
            assert_eq!(involutions.len(), 4);
            let generators = almost_cyclic_generators(&forms, discriminant, &involutions)
                .unwrap()
                .unwrap();
            assert_eq!(
                form_order(generators[1], forms.len(), discriminant),
                Ok(forms.len() / 2)
            );
            assert_eq!(
                form_power(generators[0], 2, discriminant),
                Ok(principal_form(discriminant))
            );
            assert_ne!(
                generators[0],
                form_power(generators[1], forms.len() / 4, discriminant).unwrap()
            );
        }
    }

    #[test]
    fn coprime_ideal_composition_matches_general_lattice_product() {
        let mut checked = 0;
        for discriminant in [
            -23,
            -231,
            -15_015,
            -8_173_415,
            -100_000_000_003,
            -200_000_000_179,
            -200_000_011_124,
        ] {
            let forms = enumerate_reduced_forms(discriminant).1;
            let stride = (forms.len() / 64).max(1);
            for &left in forms.iter().step_by(stride).take(64) {
                for &right in forms.iter().step_by(stride).take(64) {
                    if gcd(left.a as u64, right.a as u64) != 1 {
                        continue;
                    }
                    assert_eq!(
                        compose_reduced_forms_unchecked(left, right, discriminant),
                        compose_reduced_forms_lattice_unchecked(left, right, discriminant),
                        "D={discriminant}, left={left:?}, right={right:?}"
                    );
                    checked += 1;
                }
            }
        }
        assert!(checked > 1_000);
    }

    #[test]
    fn fixed_prime_form_multiplier_matches_exact_composition() {
        let mut coprime = 0;
        let mut noncoprime = 0;
        for discriminant in [
            -23,
            -231,
            -15_015,
            -8_173_415,
            -20_000_000_179,
            -20_000_011_124,
            -60_000_000_091,
        ] {
            let forms = enumerate_reduced_forms(discriminant).1;
            let stride = (forms.len() / 256).max(1);
            for &right in forms
                .iter()
                .filter(|form| form.a <= 101 && is_prime(form.a as u64))
                .take(16)
            {
                let multiplier = FixedFormMultiplier::new(right, discriminant);
                for &left in forms.iter().step_by(stride) {
                    assert_eq!(
                        multiplier.apply(left),
                        compose_reduced_forms_unchecked(left, right, discriminant),
                        "D={discriminant}, left={left:?}, right={right:?}"
                    );
                    if left.a % right.a == 0 {
                        noncoprime += 1;
                    } else {
                        coprime += 1;
                    }
                }
            }
        }
        assert!(coprime > 1_000);
        assert!(noncoprime > 100);
    }

    #[test]
    fn sieved_scalar_count_matches_exact_form_enumeration() {
        for absolute in 3..=10_000_i64 {
            let discriminant = -absolute;
            if fundamental_discriminant(discriminant).is_none() {
                continue;
            }
            let mut reference_forms = Vec::new();
            let reference_bound =
                visit_reduced_forms(discriminant, |form| reference_forms.push(form));
            reference_forms.sort_unstable();
            let (sieved_bound, sieved_forms) = enumerate_reduced_forms(discriminant);
            assert_eq!(sieved_bound, reference_bound, "D={discriminant}");
            assert_eq!(sieved_forms, reference_forms, "D={discriminant}");
            assert_eq!(
                count_reduced_forms(discriminant),
                reference_forms.len(),
                "D={discriminant}"
            );
        }
        for absolute in (1_000_003..=10_000_000_i64).step_by(37_111) {
            let discriminant = -absolute;
            if fundamental_discriminant(discriminant).is_none() {
                continue;
            }
            let mut reference_forms = Vec::new();
            let reference_bound =
                visit_reduced_forms(discriminant, |form| reference_forms.push(form));
            reference_forms.sort_unstable();
            let (sieved_bound, sieved_forms) = enumerate_reduced_forms(discriminant);
            assert_eq!(sieved_bound, reference_bound, "D={discriminant}");
            assert_eq!(sieved_forms, reference_forms, "D={discriminant}");
            assert_eq!(
                count_reduced_forms(discriminant),
                reference_forms.len(),
                "D={discriminant}"
            );
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn parallel_sieve_matches_sequential_large_fields() {
        for discriminant in [
            -8_173_415,
            -15_000_000_315,
            -20_000_000_179,
            -40_000_000_003,
            -60_000_000_091,
            -20_000_001_124,
            -100_000_000_003,
            -150_000_000_315,
        ] {
            let reference = enumerate_reduced_forms_sequential(discriminant);
            for workers in [2, 4, 8] {
                assert_eq!(
                    enumerate_reduced_forms_with_workers(discriminant, workers),
                    reference,
                    "D={discriminant}, workers={workers}"
                );
                assert_eq!(
                    count_reduced_forms_with_workers(discriminant, workers),
                    reference.1.len(),
                    "count D={discriminant}, workers={workers}"
                );
            }
        }
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
        let coordinate_ordinals = structure
            .coordinates
            .iter()
            .map(|coordinates| {
                coordinate_ordinal(coordinates, &structure.invariants, pristine.class_number)
                    .unwrap()
            })
            .collect::<Vec<_>>();
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
            ("coordinate collision", |result| {
                result.complete_class_map[1].coordinates =
                    result.complete_class_map[0].coordinates.clone();
            }),
            ("coordinate permutation", |result| {
                let (first, rest) = result.complete_class_map.split_at_mut(1);
                std::mem::swap(&mut first[0].coordinates, &mut rest[0].coordinates);
            }),
        ];
        for (label, counterfeit) in counterfeits {
            let mut result = pristine.clone();
            counterfeit(&mut result);
            assert_eq!(
                authenticate_constructed_imaginary_class_group(
                    input,
                    &result,
                    &structure.invariants,
                    &structure.generator_indices,
                    &coordinate_ordinals,
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
