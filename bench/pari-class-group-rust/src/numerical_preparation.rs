// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Numerical preparation for the H1 Fincke--Pohst collector.
//!
//! The important representation boundary is deliberately visible here.  The
//! rounded embedding `G0` is integral and is used only to choose an exact LLL
//! basis change.  The authenticated embedding `G` remains a dyadic matrix and
//! is evaluated with `rug::Float` before the final coefficients are rounded to
//! binary64 for the enumeration cursor.
//!
//! This first Rust experiment aims at the same lattice and a mathematically
//! valid Fincke--Pohst search.  It does not yet claim bit-for-bit reproduction
//! of PARI's packed-real Householder operations or `rtodbl`: `rug::Float` uses
//! a conventional high-precision Gram--Schmidt calculation and correctly
//! rounded conversion to `f64`.  Candidate/relation differential testing must
//! therefore precede any claim of an identical PARI cursor trace.

use crate::ideal_arithmetic::{LllError, Matrix3, lll_reduce_columns};
use crate::prepared::ValidatedPreparedCubic;
use crate::prepared_ideal::CubicIdeal;
use rug::{Assign, Float, Integer, float::Round};
use std::array::from_fn;

const DEGREE: usize = 3;
const CELLS: usize = DEGREE * DEGREE;
const STRIDE: usize = DEGREE + 1;

/// More than the 256-bit floor authenticated for H1's embedding matrix, and
/// enough to ingest its one 320-bit component without an initial precision
/// loss.  PARI's actual QR is requested at 192 bits; this deliberately uses a
/// little more precision while the Rust/packed-real differential is pending.
pub const H1_WORKING_PRECISION: u32 = 320;

/// `nf_get_roundG` for H1, in row-major order.
pub const H1_ROUNDED_EMBEDDING: [i64; CELLS] =
    [16, -2_272, 104_482, 16, 16, -213_472, 16, 2_256, 109_006];

/// `4 * maxtry_FACT / ballvol(3)`, preserving the source's binary64 order.
pub fn h1_small_norm_scale() -> f64 {
    let ball_volume = 2.0 * ((2.0 * std::f64::consts::PI) / 3.0);
    2_000.0 / ball_volume
}

#[derive(Clone, Copy)]
struct Dyadic {
    mantissa: &'static str,
    stored_precision: i32,
    exponent: i32,
}

impl Dyadic {
    const fn integer(value: &'static str) -> Self {
        Self {
            mantissa: value,
            stored_precision: -1,
            exponent: 0,
        }
    }

    const fn real(mantissa: &'static str, stored_precision: i32, exponent: i32) -> Self {
        Self {
            mantissa,
            stored_precision,
            exponent,
        }
    }

    fn to_float(self, precision: u32) -> Float {
        let integer = self
            .mantissa
            .parse::<Integer>()
            .expect("authenticated H1 dyadic mantissa");
        let mut value = Float::with_val(precision, integer);
        if self.stored_precision != -1 {
            let shift = self.exponent + 1 - self.stored_precision;
            if shift >= 0 {
                value <<= shift;
            } else {
                value >>= -shift;
            }
        }
        value
    }
}

// H1 is totally real, so nf_get_M and nf_get_G are the same numerical matrix.
// Keeping a single copy prevents an unnecessary prepared representation.
const H1_EMBEDDING: [Dyadic; CELLS] = [
    Dyadic::integer("1"),
    Dyadic::real(
        "-64220622658290921474614259608772358154490258151036621226745219643078923784188",
        256,
        7,
    ),
    Dyadic::real(
        "92302015032297609695055164358819071366354768453111042135463374329450518436604",
        256,
        12,
    ),
    Dyadic::integer("1"),
    Dyadic::real(
        "57945219381778474872138477550907651803358380939644151129898804145490596828229",
        256,
        0,
    ),
    Dyadic::real(
        "-1739400132739360487830145484889220728662458499115252291979575924919276490247086424478317711196160",
        320,
        13,
    ),
    Dyadic::integer("1"),
    Dyadic::real(
        "63767925631870777139675677752905892124776520799945651296042885235692278496468",
        256,
        7,
    ),
    Dyadic::real(
        "96298260017979560155034980799315031917298618721805538957464847651221402344269",
        256,
        12,
    ),
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NumericalPreparationError {
    Lll(LllError),
    SingularEmbedding,
    NonFiniteOutput,
    UnsupportedSignature,
    InvalidRealRootIsolation,
}

/// Reusable archimedean data for a validated totally real cubic.
#[derive(Clone, Debug)]
pub struct PreparedRealCubicEmbedding {
    matrix: [[Float; DEGREE]; DEGREE],
    rounded: Matrix3,
    precision: u32,
}

impl PreparedRealCubicEmbedding {
    pub fn from_validated(
        field: &ValidatedPreparedCubic,
        precision: u32,
    ) -> Result<Self, NumericalPreparationError> {
        if field.data().signature != (3, 0) {
            return Err(NumericalPreparationError::UnsupportedSignature);
        }
        let polynomial = &field.data().polynomial_ascending;
        let coefficients = from_fn(|index| polynomial[index].to_f64());
        let starts = isolate_three_real_roots(coefficients)?;
        let roots: [Float; DEGREE] =
            std::array::from_fn(|index| refine_real_root(polynomial, starts[index], precision));
        let denominator = Float::with_val(precision, &field.data().basis_denominator);
        let matrix: [[Float; DEGREE]; DEGREE] = from_fn(|embedding_index| {
            from_fn(|basis_index| {
                let offset = DEGREE * basis_index;
                let mut value = Float::with_val(
                    precision,
                    &field.data().integral_basis_numerators[offset + 2],
                );
                value *= &roots[embedding_index];
                value += &field.data().integral_basis_numerators[offset + 1];
                value *= &roots[embedding_index];
                value += &field.data().integral_basis_numerators[offset];
                value /= &denominator;
                value
            })
        });
        let rounded = Matrix3::from_rows(from_fn(|row| {
            from_fn(|column| {
                let mut value = matrix[row][column].clone();
                value *= 16;
                value
                    .to_integer_round(Round::Nearest)
                    .expect("finite validated embedding")
                    .0
            })
        }));
        Ok(Self {
            matrix,
            rounded,
            precision,
        })
    }
}

fn isolate_three_real_roots(
    coefficients: [f64; 4],
) -> Result<[f64; DEGREE], NumericalPreparationError> {
    let [constant, linear, quadratic, leading] = coefficients;
    if leading != 1.0 || coefficients.iter().any(|value| !value.is_finite()) {
        return Err(NumericalPreparationError::InvalidRealRootIsolation);
    }
    let derivative_discriminant = 4.0 * quadratic * quadratic - 12.0 * linear;
    if derivative_discriminant <= 0.0 {
        return Err(NumericalPreparationError::InvalidRealRootIsolation);
    }
    let root = derivative_discriminant.sqrt();
    let critical = [
        (-2.0 * quadratic - root) / 6.0,
        (-2.0 * quadratic + root) / 6.0,
    ];
    let bound = 2.0 + constant.abs().max(linear.abs()).max(quadratic.abs());
    let evaluate = |x: f64| ((x + quadratic) * x + linear) * x + constant;
    let intervals = [
        (-bound, critical[0]),
        (critical[0], critical[1]),
        (critical[1], bound),
    ];
    let mut roots = [0.0; DEGREE];
    for (index, (mut left, mut right)) in intervals.into_iter().enumerate() {
        let mut left_value = evaluate(left);
        let right_value = evaluate(right);
        if left_value == 0.0 {
            roots[index] = left;
            continue;
        }
        if right_value == 0.0 {
            roots[index] = right;
            continue;
        }
        if left_value.is_sign_positive() == right_value.is_sign_positive() {
            return Err(NumericalPreparationError::InvalidRealRootIsolation);
        }
        for _ in 0..100 {
            let middle = (left + right) * 0.5;
            let value = evaluate(middle);
            if value.is_sign_positive() == left_value.is_sign_positive() {
                left = middle;
                left_value = value;
            } else {
                right = middle;
            }
        }
        roots[index] = (left + right) * 0.5;
    }
    Ok(roots)
}

fn refine_real_root(polynomial: &[Integer; 4], start: f64, precision: u32) -> Float {
    let mut root = Float::with_val(precision, start);
    for _ in 0..24 {
        let mut value = Float::with_val(precision, &polynomial[3]);
        value *= &root;
        value += &polynomial[2];
        value *= &root;
        value += &polynomial[1];
        value *= &root;
        value += &polynomial[0];

        let mut derivative = Float::with_val(precision, 3);
        derivative *= &root;
        derivative += Float::with_val(precision, &polynomial[2]) * 2;
        derivative *= &root;
        derivative += &polynomial[1];
        value /= derivative;
        root -= value;
    }
    root
}

impl From<LllError> for NumericalPreparationError {
    fn from(error: LllError) -> Self {
        Self::Lll(error)
    }
}

/// Exact lattice owners and the one-based binary64 cursor input.
#[derive(Clone, Debug)]
pub struct H1NumericalPreparation {
    /// Exact unimodular basis change selected from `G0 * original_ideal`.
    pub transform: Matrix3,
    /// Exact `original_ideal * transform` sent to the embedding calculation.
    pub ideal: Matrix3,
    /// One-based `(degree + 1)^2` Fincke--Pohst coefficients.
    pub q: [f64; STRIDE * STRIDE],
    /// One-based squared Gram--Schmidt lengths.
    pub v: [f64; STRIDE],
    pub bound: f64,
    pub bound_root_degree: usize,
    pub skip_first: bool,
    pub lll_swaps: usize,
    pub lll_size_reductions: usize,
}

fn matrix3_from_row_major(values: [i64; CELLS]) -> Matrix3 {
    Matrix3::from_i64_rows(from_fn(|row| {
        from_fn(|column| values[row * DEGREE + column])
    }))
}

fn embedding_matrix(precision: u32) -> [[Float; DEGREE]; DEGREE] {
    from_fn(|row| from_fn(|column| H1_EMBEDDING[row * DEGREE + column].to_float(precision)))
}

fn embedded_ideal(
    embedding: &[[Float; DEGREE]; DEGREE],
    ideal: &Matrix3,
    precision: u32,
) -> [[Float; DEGREE]; DEGREE] {
    from_fn(|row| {
        from_fn(|column| {
            let mut sum = Float::with_val(precision, 0);
            for inner in 0..DEGREE {
                let mut term = embedding[row][inner].clone();
                term *= &ideal[(inner, column)];
                sum += term;
            }
            sum
        })
    })
}

/// Classical high-precision Gram--Schmidt on matrix columns.
///
/// The output `mu[earlier][later]` has exactly the orientation consumed by
/// the one-based Fincke--Pohst cursor: `q[earlier, later]`.
fn gram_schmidt(
    matrix: &[[Float; DEGREE]; DEGREE],
    precision: u32,
) -> Result<([[Float; DEGREE]; DEGREE], [Float; DEGREE]), NumericalPreparationError> {
    let mut orthogonal: [[Float; DEGREE]; DEGREE] =
        from_fn(|_| from_fn(|_| Float::with_val(precision, 0)));
    let mut mu: [[Float; DEGREE]; DEGREE] = from_fn(|_| from_fn(|_| Float::with_val(precision, 0)));
    let mut squared_norms: [Float; DEGREE] = from_fn(|_| Float::with_val(precision, 0));

    for column in 0..DEGREE {
        for row in 0..DEGREE {
            orthogonal[column][row].assign(&matrix[row][column]);
        }
        for previous in 0..column {
            let mut dot = Float::with_val(precision, 0);
            for row in 0..DEGREE {
                let mut product = matrix[row][column].clone();
                product *= &orthogonal[previous][row];
                dot += product;
            }
            if squared_norms[previous] == 0 {
                return Err(NumericalPreparationError::SingularEmbedding);
            }
            dot /= &squared_norms[previous];
            mu[previous][column].assign(&dot);
            for row in 0..DEGREE {
                let mut projection = orthogonal[previous][row].clone();
                projection *= &dot;
                orthogonal[column][row] -= projection;
            }
        }
        let mut norm = Float::with_val(precision, 0);
        for coordinate in &orthogonal[column] {
            let mut square = coordinate.clone();
            square *= coordinate;
            norm += square;
        }
        if norm <= 0 {
            return Err(NumericalPreparationError::SingularEmbedding);
        }
        squared_norms[column].assign(norm);
    }
    Ok((mu, squared_norms))
}

fn fincke_pohst_bound(
    squared_norms: &[Float; DEGREE],
    q01: &Float,
    scale: f64,
    precision: u32,
) -> (Float, usize) {
    let mut product = squared_norms[0].clone();
    let mut root_degree = 1;
    let mut bound = Float::with_val(precision, 0);
    let mut scale_squared = Float::with_val(precision, scale);
    scale_squared.square_mut();

    for index in 1..DEGREE {
        product *= &squared_norms[index];
        bound.assign(&scale_squared);
        bound *= &product;
        bound.root_mut((index + 1) as u32);
        root_degree = index + 1;
        if index + 1 < DEGREE && bound < squared_norms[index + 1] {
            break;
        }
    }

    // PARI protects the first two-dimensional section of the search even if
    // the volume-derived root stopped early.
    let mut first_section = q01.clone();
    first_section.square_mut();
    first_section *= &squared_norms[0];
    first_section += &squared_norms[1];
    first_section *= 2;
    if first_section > bound {
        bound = first_section;
    }
    (bound, root_degree)
}

/// Prepare one H1 packet ideal for the Rust Fincke--Pohst cursor.
///
/// `original_ideal` is the row-major HNF published by the exact factor-base
/// constructor.  Every integer matrix product and the LLL basis transform are
/// exact; only the archimedean calculation is approximate.
pub fn prepare_h1_ideal(
    original_ideal: [i64; CELLS],
) -> Result<H1NumericalPreparation, NumericalPreparationError> {
    let original_ideal = matrix3_from_row_major(original_ideal);
    let rounded_embedding = matrix3_from_row_major(H1_ROUNDED_EMBEDDING);
    let embedding = embedding_matrix(H1_WORKING_PRECISION);
    prepare_with_embedding(
        original_ideal,
        &rounded_embedding,
        &embedding,
        H1_WORKING_PRECISION,
    )
}

/// Prepare an exact maximal-order ideal for the cubic Fincke--Pohst cursor.
pub fn prepare_cubic_ideal(
    embedding: &PreparedRealCubicEmbedding,
    original_ideal: &CubicIdeal,
) -> Result<H1NumericalPreparation, NumericalPreparationError> {
    // CubicIdeal stores lattice generators as rows; the numerical lattice
    // convention stores those generators as columns.
    let rows = original_ideal.basis_rows();
    let original = Matrix3::from_rows(from_fn(|row| from_fn(|column| rows[column][row].clone())));
    prepare_with_embedding(
        original,
        &embedding.rounded,
        &embedding.matrix,
        embedding.precision,
    )
}

fn prepare_with_embedding(
    original_ideal: Matrix3,
    rounded_embedding: &Matrix3,
    embedding: &[[Float; DEGREE]; DEGREE],
    precision: u32,
) -> Result<H1NumericalPreparation, NumericalPreparationError> {
    let lll_input = rounded_embedding.multiply(&original_ideal);
    let reduction = lll_reduce_columns(&lll_input, 99, 100)?;
    let ideal = original_ideal.change_basis(&reduction.transform);

    let matrix = embedded_ideal(embedding, &ideal, precision);
    let (mu, squared_norms) = gram_schmidt(&matrix, precision)?;
    let (bound, bound_root_degree) =
        fincke_pohst_bound(&squared_norms, &mu[0][1], h1_small_norm_scale(), precision);

    let mut q = [0.0; STRIDE * STRIDE];
    let mut v = [0.0; STRIDE];
    for column in 0..DEGREE {
        v[column + 1] = squared_norms[column].to_f64();
        for previous in 0..column {
            q[(previous + 1) * STRIDE + column + 1] = mu[previous][column].to_f64();
        }
    }
    let bound = bound.to_f64();
    if !q.iter().all(|value| value.is_finite())
        || !v.iter().all(|value| value.is_finite())
        || v[1..].iter().any(|value| *value <= 0.0)
        || !bound.is_finite()
        || bound <= 0.0
    {
        return Err(NumericalPreparationError::NonFiniteOutput);
    }
    let skip_first = ideal[(1, 0)] == 0 && ideal[(2, 0)] == 0;
    Ok(H1NumericalPreparation {
        transform: reduction.transform,
        ideal,
        q,
        v,
        bound,
        bound_root_degree,
        skip_first,
        lll_swaps: reduction.swaps,
        lll_size_reductions: reduction.size_reductions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enumeration::EnumerationWorkspace;
    use crate::factor_base::prepared_cubic_factor_base;
    use crate::ideal_arithmetic::{Matrix3, verify_lll_reduction};

    fn h1_factor_base() -> crate::factor_base::FactorBase {
        prepared_cubic_factor_base([20_034, -20_018, 0, 1], [1, 0, 0, 0, 1, 0, -13_345, 2, 1])
    }

    #[test]
    fn all_sixteen_visited_h1_packets_have_valid_numerical_preparation() {
        let factor_base = h1_factor_base();
        for identifier in (51_usize..=66).rev() {
            let packet = &factor_base.ideals[identifier - 1];
            let prepared = prepare_h1_ideal(packet.hnf).unwrap();

            let original = matrix3_from_row_major(packet.hnf);
            assert_eq!(original.change_basis(&prepared.transform), prepared.ideal);
            assert!(
                prepared.transform.determinant() == 1 || prepared.transform.determinant() == -1
            );
            assert!((2..=3).contains(&prepared.bound_root_degree));
            assert!(prepared.bound > 0.0 && prepared.bound.is_finite());
            assert!(
                prepared.v[1..]
                    .iter()
                    .all(|value| *value > 0.0 && value.is_finite())
            );
            assert!(prepared.q.iter().all(|value| value.is_finite()));

            let rounded = matrix3_from_row_major(H1_ROUNDED_EMBEDDING);
            let lll_input = rounded.multiply(&original);
            let reduction = crate::ideal_arithmetic::LllReduction {
                basis: lll_input.multiply(&prepared.transform),
                transform: prepared.transform.clone(),
                swaps: prepared.lll_swaps,
                size_reductions: prepared.lll_size_reductions,
            };
            assert!(verify_lll_reduction(&lll_input, &reduction, 99, 100));

            // The prepared arrays are accepted by the actual cursor and yield
            // at least one vector under the computed bound.
            let mut enumeration = EnumerationWorkspace::new(DEGREE);
            enumeration.reset(&prepared.q, &prepared.v).unwrap();
            assert!(
                enumeration
                    .next(prepared.bound, prepared.skip_first)
                    .unwrap()
            );
        }
    }

    #[test]
    fn dyadic_embedding_rounds_back_to_the_authenticated_g0() {
        let embedding = embedding_matrix(H1_WORKING_PRECISION);
        for row in 0..DEGREE {
            for column in 0..DEGREE {
                let mut scaled = embedding[row][column].clone();
                scaled *= 16;
                let rounded = scaled
                    .to_integer_round(rug::float::Round::Nearest)
                    .unwrap()
                    .0;
                assert_eq!(rounded, H1_ROUNDED_EMBEDDING[row * DEGREE + column]);
            }
        }
    }

    #[test]
    fn identity_packet_keeps_exact_and_numerical_owners_separate() {
        let prepared = prepare_h1_ideal([1, 0, 0, 0, 1, 0, 0, 0, 1]).unwrap();
        assert!(prepared.transform.determinant() == 1 || prepared.transform.determinant() == -1);
        assert_eq!(
            prepared.ideal,
            Matrix3::identity().change_basis(&prepared.transform)
        );
        assert_eq!(prepared.q[0], 0.0);
        assert_eq!(prepared.v[0], 0.0);

        // Independent PARI 2.17.4 oracle: nf_get_G, ZM_lll(.99, LLL_IM),
        // gaussred_from_QR and Fincke_Pohst_bound on the identity H1 ideal.
        // The nonzero coefficients and bound agree to binary64 accuracy.
        assert_eq!(&prepared.v[1..], &[3.0, 40_036.0, 267_056_657.609_118_46]);
        assert!((prepared.q[6]).abs() < 1.0e-50);
        assert_eq!(prepared.q[7], 1.0 / 3.0);
        assert_eq!(prepared.q[11], 0.498_801_079_028_874);
        let pari_bound = 165_473.081_288_336_11_f64;
        assert!((prepared.bound - pari_bound).abs() <= f64::EPSILON * pari_bound);
    }
}
