// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Thin native qualification bridge to the repository's pinned FLINT build.
//!
//! This computes candidate Smith invariants only. It deliberately does not
//! manufacture transformation evidence that the current FLINT call does not
//! return.

use crate::ideal_arithmetic::Matrix3;
use rug::Integer;
use std::array::from_fn;
use std::ffi::{c_int, c_long, c_longlong, c_void};
use std::ptr;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FlintNormalFormError {
    InvalidDimensions,
    DimensionMismatch,
    DiagonalOutsideI64,
    RankDeficient,
    ForeignFailure(i32),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintSmithCandidate {
    pub diagonal: Vec<i64>,
    pub invariant_factors: Vec<i64>,
    pub class_number: i64,
    pub rank: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintSmithClassMap {
    pub invariant_factors: Vec<i64>,
    /// Generator-major coordinates, reduced to `[0, invariant_factor)`.
    pub generator_coordinates: Vec<i64>,
    pub generator_count: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FlintHnfProfile {
    pub maximum_entry_bits: usize,
    pub determinant_bits: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintIncrementalHnf {
    pub basis: Vec<i64>,
    pub initial_profile: FlintHnfProfile,
    pub final_profile: FlintHnfProfile,
    pub determinant_ns: u64,
    pub initial_hnf_ns: u64,
    pub saturation_ns: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintSmallSurplusClassOrder {
    pub class_order: Integer,
    /// Exact absolute determinant of the selected square relation block.
    pub square_determinant: Integer,
    pub two_rank: usize,
    pub generator_count: usize,
    /// Generator-major coordinates in the dual mod-2 character basis.
    /// When the class order is `2^two_rank`, this is an exact class map.
    pub generator_coordinates: Vec<u8>,
    /// Dependency-row-major coefficients on the square rows followed by the
    /// surplus rows.  These are the exact saturated dependencies already
    /// constructed while computing the small-surplus quotient.
    pub dependency_coefficients: Vec<Integer>,
    pub dependency_rank: usize,
    pub ordering: FlintSmallSurplusOrdering,
    pub ordering_ns: u64,
    pub ordering_initial_nonzeros: usize,
    pub ordering_symbolic_fill: usize,
    pub determinant_bits: usize,
    pub determinant_ns: u64,
    pub solve_ns: u64,
    pub kernel_ns: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FlintSmallSurplusOrdering {
    Natural,
    StaticMinimumDegree,
}

#[derive(Debug)]
pub struct FlintSmallSurplusWorkspace {
    pointer: *mut c_void,
    size: usize,
    square_relations: Vec<i64>,
    surplus_relations: Vec<i64>,
}

impl Drop for FlintSmallSurplusWorkspace {
    fn drop(&mut self) {
        if !self.pointer.is_null() {
            unsafe { sagejs_rust_flint_small_surplus_workspace_free(self.pointer) };
            self.pointer = ptr::null_mut();
        }
    }
}

impl FlintSmallSurplusWorkspace {
    /// Express targets using the exact fraction-free factorization retained
    /// from the matching class-order phase.
    pub fn relation_witnesses(
        &self,
        targets: &[i64],
    ) -> Result<FlintRelationWitnesses, FlintNormalFormError> {
        flint_small_surplus_relation_witnesses_impl(
            &self.square_relations,
            &self.surplus_relations,
            self.size,
            targets,
            self.pointer,
        )
    }
}

impl FlintSmallSurplusClassOrder {
    pub fn coordinates(&self, generator: usize) -> Option<&[u8]> {
        if generator >= self.generator_count() {
            return None;
        }
        Some(
            &self.generator_coordinates[generator * self.two_rank..(generator + 1) * self.two_rank],
        )
    }

    pub fn generator_count(&self) -> usize {
        self.generator_count
    }

    pub fn dependency(&self, index: usize) -> Option<&[Integer]> {
        if index >= self.dependency_rank {
            return None;
        }
        let relation_count = self.generator_count + self.dependency_rank;
        Some(&self.dependency_coefficients[index * relation_count..(index + 1) * relation_count])
    }

    pub fn dependencies_annihilate(&self, relations: &[i64]) -> bool {
        let relation_count = self.generator_count + self.dependency_rank;
        if relations.len() != relation_count * self.generator_count {
            return false;
        }
        (0..self.dependency_rank).all(|dependency| {
            (0..self.generator_count).all(|column| {
                let mut sum = Integer::from(0);
                for row in 0..relation_count {
                    sum += &self.dependency_coefficients[dependency * relation_count + row]
                        * relations[row * self.generator_count + column];
                }
                sum == 0
            })
        })
    }

    pub fn annihilates(&self, relations: &[i64], rows: usize) -> bool {
        let generators = self.generator_count();
        if rows.checked_mul(generators) != Some(relations.len()) {
            return false;
        }
        relations.chunks_exact(generators).all(|relation| {
            (0..self.two_rank).all(|coordinate| {
                relation
                    .iter()
                    .enumerate()
                    .fold(0_u8, |parity, (generator, value)| {
                        parity
                            ^ (value.rem_euclid(2) as u8
                                & self.generator_coordinates
                                    [generator * self.two_rank + coordinate])
                    })
                    == 0
            })
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintRelationWitnesses {
    /// Target-major coefficients expressing each target as a combination of
    /// the original relation rows.
    pub coefficients: Vec<Integer>,
    pub relation_count: usize,
    pub target_count: usize,
    pub maximum_coefficient_bits: usize,
    pub nonzero_counts: Vec<usize>,
    pub initial_hnf_ns: u64,
    pub hnf_ns: u64,
    pub solve_ns: u64,
    pub square_solve_ns: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintLeftKernel {
    /// Kernel-row-major coefficients on the original relation rows.
    pub coefficients: Vec<Integer>,
    pub relation_count: usize,
    pub rank: usize,
    pub maximum_coefficient_bits: usize,
    pub nonzero_counts: Vec<usize>,
    pub kernel_ns: u64,
}

/// Rigorous dyadic enclosure `[lower, upper] * 2^binary_exponent`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintDyadicInterval {
    pub lower: Integer,
    pub upper: Integer,
    pub binary_exponent: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintBfIndexEnclosure {
    pub zeta_log_residue: FlintDyadicInterval,
    pub tail_bound: FlintDyadicInterval,
    pub index: FlintDyadicInterval,
}

impl FlintSmithClassMap {
    pub fn coordinates(&self, generator: usize) -> Option<&[i64]> {
        let width = self.invariant_factors.len();
        if generator >= self.generator_count {
            return None;
        }
        Some(&self.generator_coordinates[generator * width..(generator + 1) * width])
    }

    pub fn annihilates(&self, relations: &[i64], rows: usize) -> bool {
        if rows.checked_mul(self.generator_count) != Some(relations.len()) {
            return false;
        }
        for relation in relations.chunks_exact(self.generator_count) {
            for (coordinate, modulus) in self.invariant_factors.iter().copied().enumerate() {
                let residue = relation
                    .iter()
                    .enumerate()
                    .fold(0_i128, |sum, (generator, coefficient)| {
                        sum + i128::from(*coefficient)
                            * i128::from(self.coordinates(generator).unwrap()[coordinate])
                    })
                    .rem_euclid(i128::from(modulus));
                if residue != 0 {
                    return false;
                }
            }
        }
        true
    }
}

unsafe extern "C" {
    fn sagejs_rust_flint_snf_i64(
        rows: usize,
        columns: usize,
        entries: *const c_longlong,
        diagonal: *mut c_longlong,
    ) -> c_int;
    fn sagejs_rust_flint_hnf_basis_i64(
        rows: usize,
        columns: usize,
        entries: *const c_longlong,
        basis: *mut c_longlong,
    ) -> c_int;
    fn sagejs_rust_flint_hnf_profile_i64(
        size: usize,
        entries: *const c_longlong,
        maximum_entry_bits: *mut usize,
        determinant_bits: *mut usize,
    ) -> c_int;
    fn sagejs_rust_flint_incremental_hnf_i64(
        size: usize,
        remaining_rows: usize,
        square_entries: *const c_longlong,
        remaining_entries: *const c_longlong,
        basis: *mut c_longlong,
        initial_maximum_entry_bits: *mut usize,
        initial_determinant_bits: *mut usize,
        final_maximum_entry_bits: *mut usize,
        final_determinant_bits: *mut usize,
        determinant_ns: *mut u64,
        initial_hnf_ns: *mut u64,
        saturation_ns: *mut u64,
    ) -> c_int;
    fn sagejs_rust_flint_small_surplus_class_order_i64(
        size: usize,
        surplus_rows: usize,
        square_entries: *const c_longlong,
        surplus_entries: *const c_longlong,
        class_order: *mut c_void,
        square_determinant: *mut c_void,
        static_ordering: c_int,
        two_rank: *mut usize,
        class_coordinates: *mut u8,
        class_coordinate_capacity: usize,
        dependency_entries: *const *mut c_void,
        dependency_capacity: usize,
        determinant_bits: *mut usize,
        ordering_ns: *mut u64,
        ordering_initial_nonzeros: *mut usize,
        ordering_symbolic_fill: *mut usize,
        determinant_ns: *mut u64,
        solve_ns: *mut u64,
        kernel_ns: *mut u64,
        workspace_output: *mut *mut c_void,
    ) -> c_int;
    fn sagejs_rust_flint_small_surplus_workspace_free(workspace: *mut c_void);
    fn sagejs_rust_flint_small_surplus_relation_witnesses_i64(
        size: usize,
        surplus_rows: usize,
        square_entries: *const c_longlong,
        surplus_entries: *const c_longlong,
        target_count: usize,
        targets: *const c_longlong,
        witnesses: *const *mut c_void,
        maximum_coefficient_bits: *mut usize,
        nonzero_counts: *mut usize,
        solve_ns: *mut u64,
        affine_kernel_ns: *mut u64,
        workspace: *mut c_void,
    ) -> c_int;
    fn sagejs_rust_flint_lll_columns_mpz(
        entries: *const *const c_void,
        transform: *mut c_longlong,
    ) -> c_int;
    fn sagejs_rust_flint_snf_class_map_i64(
        size: usize,
        entries: *const c_longlong,
        invariant_factors: *mut c_longlong,
        generator_coordinates: *mut c_longlong,
        invariant_count: *mut usize,
    ) -> c_int;
    fn sagejs_rust_flint_relation_witnesses_i64(
        rows: usize,
        columns: usize,
        entries: *const c_longlong,
        target_count: usize,
        targets: *const c_longlong,
        witnesses: *const *mut c_void,
        maximum_coefficient_bits: *mut usize,
        nonzero_counts: *mut usize,
        hnf_ns: *mut u64,
        solve_ns: *mut u64,
    ) -> c_int;
    fn sagejs_rust_flint_staged_relation_witnesses_i64(
        size: usize,
        remaining_rows: usize,
        square_entries: *const c_longlong,
        remaining_entries: *const c_longlong,
        target_count: usize,
        targets: *const c_longlong,
        witnesses: *const *mut c_void,
        maximum_coefficient_bits: *mut usize,
        nonzero_counts: *mut usize,
        initial_hnf_ns: *mut u64,
        saturation_transform_ns: *mut u64,
        target_solve_ns: *mut u64,
        square_solve_ns: *mut u64,
    ) -> c_int;
    fn sagejs_rust_flint_left_kernel_i64(
        rows: usize,
        columns: usize,
        entries: *const c_longlong,
        kernel_capacity: usize,
        kernel_entries: *const *mut c_void,
        kernel_rank: *mut usize,
        maximum_coefficient_bits: *mut usize,
        nonzero_counts: *mut usize,
        kernel_ns: *mut u64,
    ) -> c_int;
    fn sagejs_rust_flint_compact_cubic_regulator(
        polynomial: *const c_longlong,
        basis_numerators: *const c_longlong,
        basis_denominator: u64,
        real_places: u64,
        unit_rank: u64,
        relations: usize,
        generator_coordinates: *const *const c_void,
        unit_exponents: *const *const c_void,
        precision: c_long,
        lower: *mut c_void,
        upper: *mut c_void,
        binary_exponent: *mut c_longlong,
    ) -> c_int;
    fn sagejs_rust_flint_bf_index_enclosure(
        term_count: usize,
        terms: *const c_longlong,
        threshold: u64,
        discriminant: *const c_void,
        class_number: u64,
        roots_of_unity: u64,
        real_places: u64,
        complex_places: u64,
        regulator_lower: *const c_void,
        regulator_upper: *const c_void,
        regulator_exponent: c_longlong,
        precision: c_long,
        zeta_lower: *mut c_void,
        zeta_upper: *mut c_void,
        zeta_exponent: *mut c_longlong,
        tail_lower: *mut c_void,
        tail_upper: *mut c_void,
        tail_exponent: *mut c_longlong,
        index_lower: *mut c_void,
        index_upper: *mut c_void,
        index_exponent: *mut c_longlong,
    ) -> c_int;
    fn sagejs_rust_flint_bdf_factor_base_margin(
        term_count: usize,
        terms: *const c_longlong,
        bound: u64,
        discriminant: *const c_void,
        degree: u64,
        real_places: u64,
        precision: c_long,
        lower: *mut c_void,
        upper: *mut c_void,
        exponent: *mut c_longlong,
    ) -> c_int;
}

pub fn flint_small_surplus_class_order(
    square_entries: &[i64],
    surplus_entries: &[i64],
    size: usize,
) -> Result<FlintSmallSurplusClassOrder, FlintNormalFormError> {
    flint_small_surplus_class_order_impl(
        square_entries,
        surplus_entries,
        size,
        false,
        FlintSmallSurplusOrdering::Natural,
    )
    .map(|(answer, _workspace)| answer)
}

/// Compute the exact class order and retain its fraction-free square
/// factorization for immediate target-witness construction.
pub fn flint_small_surplus_class_order_with_workspace(
    square_entries: &[i64],
    surplus_entries: &[i64],
    size: usize,
) -> Result<(FlintSmallSurplusClassOrder, FlintSmallSurplusWorkspace), FlintNormalFormError> {
    match flint_small_surplus_class_order_impl(
        square_entries,
        surplus_entries,
        size,
        true,
        FlintSmallSurplusOrdering::StaticMinimumDegree,
    ) {
        Ok((answer, workspace)) => Ok((
            answer,
            workspace.expect("the retained ordered workspace was not returned"),
        )),
        Err(FlintNormalFormError::ForeignFailure(-10)) => {
            flint_small_surplus_class_order_with_workspace_natural_order(
                square_entries,
                surplus_entries,
                size,
            )
        }
        Err(error) => Err(error),
    }
}

/// Qualification-only natural-order control for differential replay.  The
/// ordinary retained-workspace API first attempts the deterministic static
/// ordering and falls back here atomically if its structural planner cannot
/// produce a complete order.
pub fn flint_small_surplus_class_order_with_workspace_natural_order(
    square_entries: &[i64],
    surplus_entries: &[i64],
    size: usize,
) -> Result<(FlintSmallSurplusClassOrder, FlintSmallSurplusWorkspace), FlintNormalFormError> {
    let (answer, workspace) = flint_small_surplus_class_order_impl(
        square_entries,
        surplus_entries,
        size,
        true,
        FlintSmallSurplusOrdering::Natural,
    )?;
    Ok((
        answer,
        workspace.expect("the retained workspace was not returned"),
    ))
}

/// Force static minimum-degree/Markowitz ordering for qualification and
/// differential replay.  Unlike the ordinary retained-workspace entrypoint,
/// this reports a structural-planning failure instead of falling back.
pub fn flint_small_surplus_class_order_with_workspace_static_minimum_degree(
    square_entries: &[i64],
    surplus_entries: &[i64],
    size: usize,
) -> Result<(FlintSmallSurplusClassOrder, FlintSmallSurplusWorkspace), FlintNormalFormError> {
    let (answer, workspace) = flint_small_surplus_class_order_impl(
        square_entries,
        surplus_entries,
        size,
        true,
        FlintSmallSurplusOrdering::StaticMinimumDegree,
    )?;
    Ok((
        answer,
        workspace.expect("the retained ordered workspace was not returned"),
    ))
}

fn flint_small_surplus_class_order_impl(
    square_entries: &[i64],
    surplus_entries: &[i64],
    size: usize,
    retain_workspace: bool,
    ordering: FlintSmallSurplusOrdering,
) -> Result<
    (
        FlintSmallSurplusClassOrder,
        Option<FlintSmallSurplusWorkspace>,
    ),
    FlintNormalFormError,
> {
    if size == 0
        || size.checked_mul(size) != Some(square_entries.len())
        || surplus_entries.is_empty()
        || !surplus_entries.len().is_multiple_of(size)
    {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let surplus_rows = surplus_entries.len() / size;
    let mut class_order = Integer::new();
    let mut square_determinant = Integer::new();
    let mut two_rank = 0_usize;
    let mut generator_coordinates = vec![0_u8; square_entries.len()];
    let dependency_capacity = surplus_rows
        .checked_mul(size + surplus_rows)
        .ok_or(FlintNormalFormError::InvalidDimensions)?;
    let mut dependency_coefficients = vec![Integer::from(0); dependency_capacity];
    let dependency_pointers = dependency_coefficients
        .iter_mut()
        .map(|value| value.as_raw_mut().cast::<c_void>())
        .collect::<Vec<_>>();
    let mut determinant_bits = 0_usize;
    let mut ordering_ns = 0_u64;
    let mut ordering_initial_nonzeros = 0_usize;
    let mut ordering_symbolic_fill = 0_usize;
    let mut determinant_ns = 0_u64;
    let mut solve_ns = 0_u64;
    let mut kernel_ns = 0_u64;
    let mut workspace_pointer = ptr::null_mut();
    let status = unsafe {
        sagejs_rust_flint_small_surplus_class_order_i64(
            size,
            surplus_rows,
            square_entries.as_ptr().cast(),
            surplus_entries.as_ptr().cast(),
            class_order.as_raw_mut().cast(),
            square_determinant.as_raw_mut().cast(),
            i32::from(ordering == FlintSmallSurplusOrdering::StaticMinimumDegree),
            &mut two_rank,
            generator_coordinates.as_mut_ptr(),
            generator_coordinates.len(),
            dependency_pointers.as_ptr(),
            dependency_pointers.len(),
            &mut determinant_bits,
            &mut ordering_ns,
            &mut ordering_initial_nonzeros,
            &mut ordering_symbolic_fill,
            &mut determinant_ns,
            &mut solve_ns,
            &mut kernel_ns,
            if retain_workspace {
                &mut workspace_pointer
            } else {
                ptr::null_mut()
            },
        )
    };
    match status {
        0 => {
            generator_coordinates.truncate(size * two_rank);
            let workspace = retain_workspace.then(|| FlintSmallSurplusWorkspace {
                pointer: workspace_pointer,
                size,
                square_relations: square_entries.to_vec(),
                surplus_relations: surplus_entries.to_vec(),
            });
            Ok((
                FlintSmallSurplusClassOrder {
                    class_order,
                    square_determinant,
                    two_rank,
                    generator_count: size,
                    generator_coordinates,
                    dependency_coefficients,
                    dependency_rank: surplus_rows,
                    ordering,
                    ordering_ns,
                    ordering_initial_nonzeros,
                    ordering_symbolic_fill,
                    determinant_bits,
                    determinant_ns,
                    solve_ns,
                    kernel_ns,
                },
                workspace,
            ))
        }
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -3 => Err(FlintNormalFormError::RankDeficient),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

/// Express targets in a full-rank relation lattice with only a few surplus
/// rows, without constructing a square transform of all relation rows.
///
/// If `A` is the selected square relation matrix and `B` contains the
/// surplus rows, this solves `x A + y B = target`.  The expensive linear
/// algebra stays `size` square, while integrality of `(x, y)` is reduced to
/// affine congruences in `surplus_rows + 1` dimensions.  For row 6 this is an
/// eight-dimensional problem instead of a 1,137-dimensional HNF transform.
pub fn flint_small_surplus_relation_witnesses(
    square_relations: &[i64],
    surplus_relations: &[i64],
    size: usize,
    targets: &[i64],
) -> Result<FlintRelationWitnesses, FlintNormalFormError> {
    flint_small_surplus_relation_witnesses_impl(
        square_relations,
        surplus_relations,
        size,
        targets,
        ptr::null_mut(),
    )
}

fn flint_small_surplus_relation_witnesses_impl(
    square_relations: &[i64],
    surplus_relations: &[i64],
    size: usize,
    targets: &[i64],
    workspace: *mut c_void,
) -> Result<FlintRelationWitnesses, FlintNormalFormError> {
    if size == 0
        || square_relations.len() != size.checked_mul(size).unwrap_or(0)
        || surplus_relations.is_empty()
        || !surplus_relations.len().is_multiple_of(size)
        || targets.is_empty()
        || !targets.len().is_multiple_of(size)
    {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let surplus_rows = surplus_relations.len() / size;
    let relation_count = size
        .checked_add(surplus_rows)
        .ok_or(FlintNormalFormError::InvalidDimensions)?;
    let target_count = targets.len() / size;
    let coefficient_count = target_count
        .checked_mul(relation_count)
        .ok_or(FlintNormalFormError::InvalidDimensions)?;
    let mut coefficients = vec![Integer::from(0); coefficient_count];
    let pointers = coefficients
        .iter_mut()
        .map(|value| value.as_raw_mut().cast::<c_void>())
        .collect::<Vec<_>>();
    let mut maximum_coefficient_bits = 0_usize;
    let mut nonzero_counts = vec![0_usize; target_count];
    let mut solve_ns = 0_u64;
    let mut affine_kernel_ns = 0_u64;
    let status = unsafe {
        sagejs_rust_flint_small_surplus_relation_witnesses_i64(
            size,
            surplus_rows,
            square_relations.as_ptr().cast(),
            surplus_relations.as_ptr().cast(),
            target_count,
            targets.as_ptr().cast(),
            pointers.as_ptr(),
            &mut maximum_coefficient_bits,
            nonzero_counts.as_mut_ptr(),
            &mut solve_ns,
            &mut affine_kernel_ns,
            workspace,
        )
    };
    match status {
        0 => Ok(FlintRelationWitnesses {
            coefficients,
            relation_count,
            target_count,
            maximum_coefficient_bits,
            nonzero_counts,
            initial_hnf_ns: 0,
            hnf_ns: affine_kernel_ns,
            solve_ns,
            square_solve_ns: 0,
        }),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -3 => Err(FlintNormalFormError::RankDeficient),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_bdf_factor_base_margin(
    terms: &[[i64; 3]],
    bound: u64,
    discriminant: &Integer,
    degree: u64,
    real_places: u64,
    precision: u32,
) -> Result<FlintDyadicInterval, FlintNormalFormError> {
    if bound < 2 || discriminant == &0 || degree < 2 || real_places > degree || precision < 64 {
        return Err(FlintNormalFormError::InvalidDimensions);
    }
    let flattened = terms.iter().flatten().copied().collect::<Vec<_>>();
    let mut lower = Integer::new();
    let mut upper = Integer::new();
    let mut binary_exponent = 0_i64;
    let status = unsafe {
        sagejs_rust_flint_bdf_factor_base_margin(
            terms.len(),
            flattened.as_ptr().cast(),
            bound,
            discriminant.as_raw().cast(),
            degree,
            real_places,
            precision.into(),
            lower.as_raw_mut().cast(),
            upper.as_raw_mut().cast(),
            &mut binary_exponent,
        )
    };
    match status {
        0 => Ok(FlintDyadicInterval {
            lower,
            upper,
            binary_exponent,
        }),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_bf_index_enclosure(
    terms: &[[i64; 4]],
    threshold: u64,
    discriminant: &Integer,
    class_number: u64,
    roots_of_unity: u64,
    signature: (u64, u64),
    regulator: &FlintDyadicInterval,
    precision: u32,
) -> Result<FlintBfIndexEnclosure, FlintNormalFormError> {
    if threshold < 72
        || !threshold.is_multiple_of(9)
        || discriminant == &0
        || class_number == 0
        || roots_of_unity == 0
        || signature
            .1
            .checked_mul(2)
            .and_then(|twice_complex| signature.0.checked_add(twice_complex))
            .is_none_or(|degree| degree <= 1)
        || regulator.lower > regulator.upper
        || precision < 64
    {
        return Err(FlintNormalFormError::InvalidDimensions);
    }
    let flattened = terms.iter().flatten().copied().collect::<Vec<_>>();
    let mut zeta_lower = Integer::new();
    let mut zeta_upper = Integer::new();
    let mut zeta_exponent = 0_i64;
    let mut tail_lower = Integer::new();
    let mut tail_upper = Integer::new();
    let mut tail_exponent = 0_i64;
    let mut index_lower = Integer::new();
    let mut index_upper = Integer::new();
    let mut index_exponent = 0_i64;
    let status = unsafe {
        sagejs_rust_flint_bf_index_enclosure(
            terms.len(),
            flattened.as_ptr().cast(),
            threshold,
            discriminant.as_raw().cast(),
            class_number,
            roots_of_unity,
            signature.0,
            signature.1,
            regulator.lower.as_raw().cast(),
            regulator.upper.as_raw().cast(),
            regulator.binary_exponent,
            precision.into(),
            zeta_lower.as_raw_mut().cast(),
            zeta_upper.as_raw_mut().cast(),
            &mut zeta_exponent,
            tail_lower.as_raw_mut().cast(),
            tail_upper.as_raw_mut().cast(),
            &mut tail_exponent,
            index_lower.as_raw_mut().cast(),
            index_upper.as_raw_mut().cast(),
            &mut index_exponent,
        )
    };
    match status {
        0 => Ok(FlintBfIndexEnclosure {
            zeta_log_residue: FlintDyadicInterval {
                lower: zeta_lower,
                upper: zeta_upper,
                binary_exponent: zeta_exponent,
            },
            tail_bound: FlintDyadicInterval {
                lower: tail_lower,
                upper: tail_upper,
                binary_exponent: tail_exponent,
            },
            index: FlintDyadicInterval {
                lower: index_lower,
                upper: index_upper,
                binary_exponent: index_exponent,
            },
        }),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_compact_cubic_regulator(
    polynomial: [i64; 4],
    basis_numerators: [i64; 9],
    basis_denominator: u64,
    signature: (u8, u8),
    generator_coordinates: &[Integer],
    unit_exponents: &[Integer],
    precision: u32,
) -> Result<FlintDyadicInterval, FlintNormalFormError> {
    let unit_rank = u64::from(signature.0) + u64::from(signature.1) - 1;
    if basis_denominator == 0
        || polynomial[3] != 1
        || generator_coordinates.is_empty()
        || !generator_coordinates.len().is_multiple_of(3)
        || precision < 64
        || !matches!((signature, unit_rank), ((3, 0), 2) | ((1, 1), 1))
    {
        return Err(FlintNormalFormError::InvalidDimensions);
    }
    let precision =
        c_long::try_from(precision).map_err(|_| FlintNormalFormError::InvalidDimensions)?;
    let relations = generator_coordinates.len() / 3;
    if unit_exponents.len() != unit_rank as usize * relations {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let coordinate_pointers = generator_coordinates
        .iter()
        .map(|value| value.as_raw().cast::<c_void>())
        .collect::<Vec<_>>();
    let exponent_pointers = unit_exponents
        .iter()
        .map(|value| value.as_raw().cast::<c_void>())
        .collect::<Vec<_>>();
    let mut lower = Integer::new();
    let mut upper = Integer::new();
    let mut binary_exponent = 0_i64;
    // Every GMP pointer is borrowed for this call only. The bridge copies
    // exact inputs into FLINT-owned temporaries and writes the two output GMP
    // integers without retaining any Rust allocation.
    let status = unsafe {
        sagejs_rust_flint_compact_cubic_regulator(
            polynomial.as_ptr().cast(),
            basis_numerators.as_ptr().cast(),
            basis_denominator,
            u64::from(signature.0),
            unit_rank,
            relations,
            coordinate_pointers.as_ptr(),
            exponent_pointers.as_ptr(),
            precision,
            lower.as_raw_mut().cast(),
            upper.as_raw_mut().cast(),
            &mut binary_exponent,
        )
    };
    match status {
        0 => Ok(FlintDyadicInterval {
            lower,
            upper,
            binary_exponent,
        }),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_left_kernel(
    relations: &[i64],
    rows: usize,
    columns: usize,
) -> Result<FlintLeftKernel, FlintNormalFormError> {
    if rows <= columns || columns == 0 || rows.checked_mul(columns) != Some(relations.len()) {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let capacity = rows - columns;
    let coefficient_count = capacity
        .checked_mul(rows)
        .ok_or(FlintNormalFormError::InvalidDimensions)?;
    let mut coefficients = vec![Integer::from(0); coefficient_count];
    let pointers = coefficients
        .iter_mut()
        .map(|value| value.as_raw_mut().cast::<c_void>())
        .collect::<Vec<_>>();
    let mut rank = 0_usize;
    let mut maximum_coefficient_bits = 0_usize;
    let mut nonzero_counts = vec![0_usize; capacity];
    let mut kernel_ns = 0_u64;
    let status = unsafe {
        sagejs_rust_flint_left_kernel_i64(
            rows,
            columns,
            relations.as_ptr().cast(),
            capacity,
            pointers.as_ptr(),
            &mut rank,
            &mut maximum_coefficient_bits,
            nonzero_counts.as_mut_ptr(),
            &mut kernel_ns,
        )
    };
    match status {
        0 => {
            if rank > capacity {
                return Err(FlintNormalFormError::ForeignFailure(-8));
            }
            coefficients.truncate(rank * rows);
            nonzero_counts.truncate(rank);
            Ok(FlintLeftKernel {
                coefficients,
                relation_count: rows,
                rank,
                maximum_coefficient_bits,
                nonzero_counts,
                kernel_ns,
            })
        }
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_relation_witnesses(
    relations: &[i64],
    rows: usize,
    columns: usize,
    targets: &[i64],
) -> Result<FlintRelationWitnesses, FlintNormalFormError> {
    if rows < columns
        || columns == 0
        || rows.checked_mul(columns) != Some(relations.len())
        || targets.is_empty()
        || targets.len() % columns != 0
    {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let target_count = targets.len() / columns;
    let coefficient_count = target_count
        .checked_mul(rows)
        .ok_or(FlintNormalFormError::InvalidDimensions)?;
    let mut coefficients = vec![Integer::from(0); coefficient_count];
    let pointers = coefficients
        .iter_mut()
        .map(|value| value.as_raw_mut().cast::<c_void>())
        .collect::<Vec<_>>();
    let mut maximum_coefficient_bits = 0_usize;
    let mut nonzero_counts = vec![0_usize; target_count];
    let mut hnf_ns = 0_u64;
    let mut solve_ns = 0_u64;
    let status = unsafe {
        sagejs_rust_flint_relation_witnesses_i64(
            rows,
            columns,
            relations.as_ptr().cast(),
            target_count,
            targets.as_ptr().cast(),
            pointers.as_ptr(),
            &mut maximum_coefficient_bits,
            nonzero_counts.as_mut_ptr(),
            &mut hnf_ns,
            &mut solve_ns,
        )
    };
    match status {
        0 => Ok(FlintRelationWitnesses {
            coefficients,
            relation_count: rows,
            target_count,
            maximum_coefficient_bits,
            nonzero_counts,
            initial_hnf_ns: 0,
            hnf_ns,
            solve_ns,
            square_solve_ns: 0,
        }),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -3 => Err(FlintNormalFormError::RankDeficient),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_staged_relation_witnesses(
    square_relations: &[i64],
    remaining_relations: &[i64],
    size: usize,
    targets: &[i64],
) -> Result<FlintRelationWitnesses, FlintNormalFormError> {
    if size == 0
        || size.checked_mul(size) != Some(square_relations.len())
        || remaining_relations.len() % size != 0
        || targets.is_empty()
        || targets.len() % size != 0
    {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let remaining_rows = remaining_relations.len() / size;
    let relation_count = size
        .checked_add(remaining_rows)
        .ok_or(FlintNormalFormError::InvalidDimensions)?;
    let target_count = targets.len() / size;
    let coefficient_count = target_count
        .checked_mul(relation_count)
        .ok_or(FlintNormalFormError::InvalidDimensions)?;
    let mut coefficients = vec![Integer::from(0); coefficient_count];
    let pointers = coefficients
        .iter_mut()
        .map(|value| value.as_raw_mut().cast::<c_void>())
        .collect::<Vec<_>>();
    let mut maximum_coefficient_bits = 0_usize;
    let mut nonzero_counts = vec![0_usize; target_count];
    let mut initial_hnf_ns = 0_u64;
    let mut hnf_ns = 0_u64;
    let mut solve_ns = 0_u64;
    let mut square_solve_ns = 0_u64;
    let status = unsafe {
        sagejs_rust_flint_staged_relation_witnesses_i64(
            size,
            remaining_rows,
            square_relations.as_ptr().cast(),
            remaining_relations.as_ptr().cast(),
            target_count,
            targets.as_ptr().cast(),
            pointers.as_ptr(),
            &mut maximum_coefficient_bits,
            nonzero_counts.as_mut_ptr(),
            &mut initial_hnf_ns,
            &mut hnf_ns,
            &mut solve_ns,
            &mut square_solve_ns,
        )
    };
    match status {
        0 => Ok(FlintRelationWitnesses {
            coefficients,
            relation_count,
            target_count,
            maximum_coefficient_bits,
            nonzero_counts,
            initial_hnf_ns,
            hnf_ns,
            solve_ns,
            square_solve_ns,
        }),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -3 => Err(FlintNormalFormError::RankDeficient),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_incremental_hnf(
    square_entries: &[i64],
    remaining_entries: &[i64],
    size: usize,
) -> Result<FlintIncrementalHnf, FlintNormalFormError> {
    if size == 0
        || size.checked_mul(size) != Some(square_entries.len())
        || remaining_entries.len() % size != 0
    {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let remaining_rows = remaining_entries.len() / size;
    let mut basis = vec![0_i64; square_entries.len()];
    let mut initial_maximum_entry_bits = 0_usize;
    let mut initial_determinant_bits = 0_usize;
    let mut final_maximum_entry_bits = 0_usize;
    let mut final_determinant_bits = 0_usize;
    let mut determinant_ns = 0_u64;
    let mut initial_hnf_ns = 0_u64;
    let mut saturation_ns = 0_u64;
    let status = unsafe {
        sagejs_rust_flint_incremental_hnf_i64(
            size,
            remaining_rows,
            square_entries.as_ptr().cast(),
            remaining_entries.as_ptr().cast(),
            basis.as_mut_ptr().cast(),
            &mut initial_maximum_entry_bits,
            &mut initial_determinant_bits,
            &mut final_maximum_entry_bits,
            &mut final_determinant_bits,
            &mut determinant_ns,
            &mut initial_hnf_ns,
            &mut saturation_ns,
        )
    };
    match status {
        0 => Ok(FlintIncrementalHnf {
            basis,
            initial_profile: FlintHnfProfile {
                maximum_entry_bits: initial_maximum_entry_bits,
                determinant_bits: initial_determinant_bits,
            },
            final_profile: FlintHnfProfile {
                maximum_entry_bits: final_maximum_entry_bits,
                determinant_bits: final_determinant_bits,
            },
            determinant_ns,
            initial_hnf_ns,
            saturation_ns,
        }),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -2 => Err(FlintNormalFormError::DiagonalOutsideI64),
        -3 => Err(FlintNormalFormError::RankDeficient),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_hnf_profile(
    entries: &[i64],
    size: usize,
) -> Result<FlintHnfProfile, FlintNormalFormError> {
    if size == 0 || size.checked_mul(size) != Some(entries.len()) {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let mut maximum_entry_bits = 0_usize;
    let mut determinant_bits = 0_usize;
    // The input is a complete square i64 matrix. The adapter retains no
    // pointer and returns only bounded metadata about its arbitrary-precision
    // HNF, avoiding a lossy conversion of the intermediate basis.
    let status = unsafe {
        sagejs_rust_flint_hnf_profile_i64(
            size,
            entries.as_ptr().cast(),
            &mut maximum_entry_bits,
            &mut determinant_bits,
        )
    };
    match status {
        0 => Ok(FlintHnfProfile {
            maximum_entry_bits,
            determinant_bits,
        }),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -3 => Err(FlintNormalFormError::RankDeficient),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_smith_class_map(
    basis: &[i64],
    size: usize,
) -> Result<FlintSmithClassMap, FlintNormalFormError> {
    if size == 0 || size.checked_mul(size) != Some(basis.len()) {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let mut factors = vec![0_i64; size];
    let mut unpacked_coordinates = vec![0_i64; basis.len()];
    let mut invariant_count = 0_usize;
    // Buffers are disjoint and fully sized for the maximum possible number of
    // invariant factors. The bridge writes the actual count before returning.
    let status = unsafe {
        sagejs_rust_flint_snf_class_map_i64(
            size,
            basis.as_ptr().cast(),
            factors.as_mut_ptr().cast(),
            unpacked_coordinates.as_mut_ptr().cast(),
            &mut invariant_count,
        )
    };
    match status {
        0 => {}
        -1 => return Err(FlintNormalFormError::InvalidDimensions),
        -2 => return Err(FlintNormalFormError::DiagonalOutsideI64),
        code => return Err(FlintNormalFormError::ForeignFailure(code)),
    }
    if invariant_count > size {
        return Err(FlintNormalFormError::ForeignFailure(-4));
    }
    factors.truncate(invariant_count);
    let mut generator_coordinates = Vec::with_capacity(size * invariant_count);
    for generator in 0..size {
        generator_coordinates.extend_from_slice(
            &unpacked_coordinates[generator * size..generator * size + invariant_count],
        );
    }
    Ok(FlintSmithClassMap {
        invariant_factors: factors,
        generator_coordinates,
        generator_count: size,
    })
}

pub fn flint_lll_column_transform(input: &Matrix3) -> Result<Matrix3, FlintNormalFormError> {
    let pointers: [*const c_void; 9] = from_fn(|index| {
        let row = index / 3;
        let column = index % 3;
        input[(row, column)].as_raw().cast()
    });
    let mut transform = [0_i64; 9];
    // Every borrowed GMP integer and the pointer array remain alive across the
    // call. The adapter copies each value immediately into FLINT-owned storage
    // and retains no Rust-owned pointer.
    let status = unsafe {
        sagejs_rust_flint_lll_columns_mpz(pointers.as_ptr(), transform.as_mut_ptr().cast())
    };
    match status {
        0 => Ok(Matrix3::from_i64_rows(from_fn(|row| {
            from_fn(|column| transform[row * 3 + column])
        }))),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -2 => Err(FlintNormalFormError::DiagonalOutsideI64),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_hnf_basis(
    entries: &[i64],
    rows: usize,
    columns: usize,
) -> Result<Vec<i64>, FlintNormalFormError> {
    if rows < columns || columns == 0 {
        return Err(FlintNormalFormError::InvalidDimensions);
    }
    if rows.checked_mul(columns) != Some(entries.len()) {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let basis_length = columns
        .checked_mul(columns)
        .ok_or(FlintNormalFormError::InvalidDimensions)?;
    let mut basis = vec![0_i64; basis_length];
    // The bridge receives disjoint, correctly sized buffers and retains no
    // pointer. FLINT owns and clears all arbitrary-precision temporaries.
    let status = unsafe {
        sagejs_rust_flint_hnf_basis_i64(
            rows,
            columns,
            entries.as_ptr().cast(),
            basis.as_mut_ptr().cast(),
        )
    };
    match status {
        0 => Ok(basis),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -2 => Err(FlintNormalFormError::DiagonalOutsideI64),
        -3 => Err(FlintNormalFormError::RankDeficient),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_smith_candidate(
    entries: &[i64],
    rows: usize,
    columns: usize,
) -> Result<FlintSmithCandidate, FlintNormalFormError> {
    if rows == 0 || columns == 0 {
        return Err(FlintNormalFormError::InvalidDimensions);
    }
    if rows.checked_mul(columns) != Some(entries.len()) {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let mut diagonal = vec![0_i64; rows.min(columns)];
    // The bridge validates dimensions before indexing, receives disjoint
    // buffers, and does not retain either pointer.
    let status = unsafe {
        sagejs_rust_flint_snf_i64(
            rows,
            columns,
            entries.as_ptr().cast(),
            diagonal.as_mut_ptr().cast(),
        )
    };
    match status {
        0 => {}
        -1 => return Err(FlintNormalFormError::InvalidDimensions),
        -2 => return Err(FlintNormalFormError::DiagonalOutsideI64),
        code => return Err(FlintNormalFormError::ForeignFailure(code)),
    }
    let rank = diagonal.iter().filter(|value| **value != 0).count();
    let invariant_factors = diagonal
        .iter()
        .copied()
        .filter(|value| value.abs() > 1)
        .collect::<Vec<_>>();
    let class_number = invariant_factors
        .iter()
        .try_fold(1_i64, |product, value| product.checked_mul(value.abs()))
        .ok_or(FlintNormalFormError::DiagonalOutsideI64)?;
    Ok(FlintSmithCandidate {
        diagonal,
        invariant_factors,
        class_number,
        rank,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ideal_arithmetic::{LllReduction, verify_lll_reduction};
    use rug::Complete;

    #[test]
    fn rectangular_candidate_matches_known_smith_factors() {
        let answer = flint_smith_candidate(&[2, 4, 4, 6, 6, 12], 2, 3).unwrap();
        assert_eq!(answer.diagonal, [2, 6]);
        assert_eq!(answer.invariant_factors, [2, 6]);
        assert_eq!(answer.class_number, 12);
        assert_eq!(answer.rank, 2);
    }

    #[test]
    fn hnf_reduces_a_full_rank_rectangular_presentation_to_a_square_basis() {
        let source = [2, 4, 4, 6, 6, 12];
        let basis = flint_hnf_basis(&source, 3, 2).unwrap();
        let direct = flint_smith_candidate(&source, 3, 2).unwrap();
        let reduced = flint_smith_candidate(&basis, 2, 2).unwrap();
        assert_eq!(reduced, direct);
    }

    #[test]
    fn hnf_profile_reports_exact_size_without_exporting_the_basis() {
        let profile = flint_hnf_profile(&[2, 4, 1, 3], 2).unwrap();
        assert_eq!(profile.maximum_entry_bits, 2);
        assert_eq!(profile.determinant_bits, 2);
        assert_eq!(
            flint_hnf_profile(&[1, 2, 2, 4], 2),
            Err(FlintNormalFormError::RankDeficient)
        );
    }

    #[test]
    fn incremental_hnf_saturates_a_square_starting_basis() {
        let answer = flint_incremental_hnf(&[2, 0, 0, 6], &[0, 4], 2).unwrap();
        let smith = flint_smith_candidate(&answer.basis, 2, 2).unwrap();
        assert_eq!(smith.invariant_factors, [2, 2]);
        assert_eq!(answer.initial_profile.determinant_bits, 4);
        assert_eq!(answer.final_profile.determinant_bits, 3);
    }

    #[test]
    fn small_surplus_order_avoids_a_large_hnf() {
        let answer = flint_small_surplus_class_order(&[2, 0, 0, 6], &[0, 4], 2).unwrap();
        assert_eq!(answer.class_order, 4);
        assert_eq!(answer.two_rank, 2);
        assert_eq!(answer.generator_coordinates, [1, 0, 0, 1]);
        assert!(answer.annihilates(&[2, 0, 0, 6, 0, 4], 3));
        assert!(answer.dependencies_annihilate(&[2, 0, 0, 6, 0, 4]));
        assert_eq!(answer.dependency_rank, 1);
        assert_eq!(answer.square_determinant, 12);
        assert_eq!(answer.determinant_bits, 4);
    }

    #[test]
    fn small_surplus_map_retains_the_trivial_group_generator_count() {
        let answer = flint_small_surplus_class_order(&[1, 0, 0, 1], &[1, 1], 2).unwrap();
        assert_eq!(answer.class_order, 1);
        assert_eq!(answer.two_rank, 0);
        assert_eq!(answer.generator_count(), 2);
        assert_eq!(answer.coordinates(0), Some([].as_slice()));
        assert!(answer.annihilates(&[1, 0, 0, 1, 1, 1], 3));
    }

    #[test]
    fn small_surplus_order_matches_direct_smith_examples() {
        let examples: &[(&[i64], &[i64], usize)] = &[
            (&[6, 0, 0, 10], &[2, 2, 3, 5], 2),
            (&[4, 1, 0, 0, 9, 1, 0, 0, 15], &[2, 1, 3, 1, 4, 2], 3),
            (&[2, 1, 0, 6], &[1, 3], 2),
            (&[0, 1, 1, 0], &[1, 0], 2),
        ];
        for &(square, surplus, size) in examples {
            let answer = flint_small_surplus_class_order(square, surplus, size).unwrap();
            let mut complete = square.to_vec();
            complete.extend_from_slice(surplus);
            let smith = flint_smith_candidate(&complete, complete.len() / size, size).unwrap();
            assert_eq!(answer.class_order, smith.class_number);
            assert_eq!(
                answer.two_rank,
                smith
                    .diagonal
                    .iter()
                    .filter(|entry| **entry != 0 && entry.rem_euclid(2) == 0)
                    .count()
            );
            assert!(answer.annihilates(&complete, complete.len() / size));
            assert!(
                answer.dependencies_annihilate(&complete),
                "dependency failure for size={size}, square={square:?}, surplus={surplus:?}, dependencies={:?}",
                answer.dependency_coefficients
            );
        }
    }

    #[test]
    fn successive_congruence_intersections_match_a_deterministic_smith_sweep() {
        let mut state = 0x6a09_e667_f3bc_c909_u64;
        let mut accepted = 0;
        while accepted < 128 {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let size = 2 + (state as usize % 3);
            let surplus_rows = 1 + ((state >> 8) as usize % 3);
            let mut next_entry = || {
                state = state
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                ((state >> 32) % 9) as i64 - 4
            };
            let square = (0..size * size).map(|_| next_entry()).collect::<Vec<_>>();
            let surplus = (0..surplus_rows * size)
                .map(|_| next_entry())
                .collect::<Vec<_>>();
            let Ok(answer) = flint_small_surplus_class_order(&square, &surplus, size) else {
                continue;
            };
            let mut complete = square.clone();
            complete.extend_from_slice(&surplus);
            let smith = flint_smith_candidate(&complete, size + surplus_rows, size).unwrap();
            assert_eq!(answer.class_order, smith.class_number);
            assert_eq!(answer.dependency_rank, surplus_rows);
            assert!(
                answer.dependencies_annihilate(&complete),
                "dependency failure for size={size}, square={square:?}, surplus={surplus:?}, dependencies={:?}",
                answer.dependency_coefficients
            );
            accepted += 1;
        }
    }

    #[test]
    fn flint_lll_transform_obeys_the_column_basis_contract() {
        let source = Matrix3::from_i64_rows([[105, 821, 404], [37, 11, 91], [8, 23, 2]]);
        let transform = flint_lll_column_transform(&source).unwrap();
        let reduction = LllReduction {
            basis: source.change_basis(&transform),
            transform,
            swaps: 0,
            size_reductions: 0,
        };
        assert!(verify_lll_reduction(&source, &reduction, 99, 100));
    }

    #[test]
    fn compact_smith_map_annihilates_the_source_relations() {
        let source = [2, 0, 1, 2];
        let map = flint_smith_class_map(&source, 2).unwrap();
        assert_eq!(map.invariant_factors, [4]);
        assert!(map.annihilates(&source, 2));
        assert!(map.coordinates(0).unwrap()[0] != 0 || map.coordinates(1).unwrap()[0] != 0);
        assert!(map.coordinates(2).is_none());
    }

    #[test]
    fn relation_witnesses_replay_against_original_rows() {
        let relations = [2, 0, 0, 3, 2, 3];
        let targets = [2, 0, 0, 3];
        let answer = flint_relation_witnesses(&relations, 3, 2, &targets).unwrap();
        assert_eq!(answer.target_count, 2);
        assert_eq!(answer.relation_count, 3);
        for target in 0..answer.target_count {
            for column in 0..2 {
                let mut actual = Integer::from(0);
                for relation in 0..3 {
                    actual += &answer.coefficients[target * 3 + relation]
                        * relations[relation * 2 + column];
                }
                assert_eq!(actual, targets[target * 2 + column]);
            }
        }
    }

    #[test]
    fn staged_relation_witnesses_replay_square_and_surplus_rows() {
        let square = [2, 0, 0, 6];
        let remaining = [0, 3];
        let targets = [2, 0, 0, 3];
        let answer = flint_staged_relation_witnesses(&square, &remaining, 2, &targets).unwrap();
        let relations = [2, 0, 0, 6, 0, 3];
        for target in 0..2 {
            for column in 0..2 {
                let mut actual = Integer::from(0);
                for relation in 0..3 {
                    actual += &answer.coefficients[target * 3 + relation]
                        * relations[relation * 2 + column];
                }
                assert_eq!(actual, targets[target * 2 + column]);
            }
        }
    }

    #[test]
    fn small_surplus_affine_witnesses_replay_without_a_full_transform() {
        let square = [2, 0, 0, 6];
        let surplus = [0, 3];
        let targets = [2, 0, 0, 3];
        let answer =
            flint_small_surplus_relation_witnesses(&square, &surplus, 2, &targets).unwrap();
        let relations = [2, 0, 0, 6, 0, 3];
        assert_eq!(answer.relation_count, 3);
        assert_eq!(answer.target_count, 2);
        for target in 0..2 {
            for column in 0..2 {
                let actual = (0..3).fold(Integer::from(0), |sum, relation| {
                    sum + &answer.coefficients[target * 3 + relation]
                        * relations[relation * 2 + column]
                });
                assert_eq!(actual, targets[target * 2 + column]);
            }
        }
    }

    #[test]
    fn small_surplus_workspace_reuses_the_exact_square_factorization() {
        let square = [2, 0, 0, 6];
        let surplus = [0, 3];
        let targets = [2, 0, 0, 3];
        let (class_order, workspace) =
            flint_small_surplus_class_order_with_workspace(&square, &surplus, 2).unwrap();
        let reused = workspace.relation_witnesses(&targets).unwrap();
        let standalone =
            flint_small_surplus_relation_witnesses(&square, &surplus, 2, &targets).unwrap();
        assert_eq!(class_order.class_order, 6);
        assert_eq!(reused.coefficients, standalone.coefficients);
        assert_eq!(reused.nonzero_counts, standalone.nonzero_counts);
    }

    #[test]
    fn static_minimum_degree_workspace_preserves_exact_witnesses() {
        let square = [2, 0, 0, 6];
        let surplus = [0, 4];
        let targets = [2, 6];
        let (ordered, workspace) =
            flint_small_surplus_class_order_with_workspace_static_minimum_degree(
                &square, &surplus, 2,
            )
            .unwrap();
        let natural = flint_small_surplus_class_order(&square, &surplus, 2).unwrap();
        let witnesses = workspace.relation_witnesses(&targets).unwrap();
        assert_eq!(ordered.class_order, natural.class_order);
        assert_eq!(ordered.square_determinant, natural.square_determinant);
        assert_eq!(
            ordered.dependency_coefficients,
            natural.dependency_coefficients
        );
        assert_eq!(
            ordered.ordering,
            FlintSmallSurplusOrdering::StaticMinimumDegree
        );
        assert_eq!(ordered.ordering_initial_nonzeros, 2);
        let relations = [2, 0, 0, 6, 0, 4];
        for column in 0..2 {
            let mut replay = Integer::from(0);
            for row in 0..3 {
                replay += &witnesses.coefficients[row] * relations[row * 2 + column];
            }
            assert_eq!(replay, targets[column]);
        }
    }

    #[test]
    fn nonidentity_ordering_preserves_negative_determinant_and_witnesses() {
        // The transpose is the same permutation matrix.  Its static planner
        // chooses columns [1, 0, 2], while det(A) = -1 before normalization.
        let square = [0, 1, 0, 1, 0, 0, 0, 0, 1];
        let surplus = [1, 1, 1];
        let targets = [3, -2, 5, -7, 11, 13];
        let (ordered, ordered_workspace) =
            flint_small_surplus_class_order_with_workspace_static_minimum_degree(
                &square, &surplus, 3,
            )
            .unwrap();
        let (natural, natural_workspace) =
            flint_small_surplus_class_order_with_workspace_natural_order(&square, &surplus, 3)
                .unwrap();
        assert_eq!(
            ordered.ordering,
            FlintSmallSurplusOrdering::StaticMinimumDegree
        );
        assert_eq!(ordered.square_determinant, 1);
        assert_eq!(ordered.class_order, natural.class_order);
        assert_eq!(ordered.square_determinant, natural.square_determinant);
        assert_eq!(ordered.two_rank, natural.two_rank);
        assert_eq!(ordered.generator_coordinates, natural.generator_coordinates);
        assert_eq!(
            ordered.dependency_coefficients,
            natural.dependency_coefficients
        );
        let ordered_witnesses = ordered_workspace.relation_witnesses(&targets).unwrap();
        let natural_witnesses = natural_workspace.relation_witnesses(&targets).unwrap();
        assert_eq!(
            ordered_witnesses.coefficients,
            natural_witnesses.coefficients
        );
        assert_eq!(
            ordered_witnesses.nonzero_counts,
            natural_witnesses.nonzero_counts
        );
    }

    #[test]
    fn retained_workspace_falls_back_atomically_when_static_planning_fails() {
        // Its transpose has a perfect matching, but the deterministic greedy
        // planner selects an edge that leaves no complete structural order.
        let square = [
            0, 1, 0, 0, 1, 0, //
            0, 1, 1, 1, 0, 0, //
            0, 1, 1, 0, 1, 1, //
            1, 0, 0, 1, 0, 0, //
            1, 0, 0, 0, 0, 1, //
            0, 0, 0, 0, 0, 1,
        ];
        let surplus = [0; 6];
        assert_eq!(
            flint_small_surplus_class_order_with_workspace_static_minimum_degree(
                &square, &surplus, 6,
            )
            .unwrap_err(),
            FlintNormalFormError::ForeignFailure(-10),
        );
        let (automatic, automatic_workspace) =
            flint_small_surplus_class_order_with_workspace(&square, &surplus, 6).unwrap();
        let (natural, natural_workspace) =
            flint_small_surplus_class_order_with_workspace_natural_order(&square, &surplus, 6)
                .unwrap();
        assert_eq!(automatic.ordering, FlintSmallSurplusOrdering::Natural);
        assert_eq!(automatic.class_order, natural.class_order);
        assert_eq!(automatic.square_determinant, natural.square_determinant);
        assert_eq!(automatic.two_rank, natural.two_rank);
        assert_eq!(
            automatic.generator_coordinates,
            natural.generator_coordinates
        );
        assert_eq!(
            automatic.dependency_coefficients,
            natural.dependency_coefficients
        );
        let automatic_witnesses = automatic_workspace
            .relation_witnesses(&square[..6])
            .unwrap();
        let natural_witnesses = natural_workspace.relation_witnesses(&square[..6]).unwrap();
        assert_eq!(
            automatic_witnesses.coefficients,
            natural_witnesses.coefficients
        );
        assert_eq!(
            automatic_witnesses.relation_count,
            natural_witnesses.relation_count
        );
        assert_eq!(
            automatic_witnesses.target_count,
            natural_witnesses.target_count
        );
        assert_eq!(
            automatic_witnesses.nonzero_counts,
            natural_witnesses.nonzero_counts
        );
    }

    #[test]
    fn small_surplus_affine_witnesses_replay_constructed_random_targets() {
        let mut state = 0x5a17_3c9d_8e20_41b7_u64;
        let mut accepted = 0_usize;
        while accepted < 100 {
            let size = 2 + (state as usize % 3);
            let surplus_rows = 1 + ((state >> 7) as usize % 3);
            let mut next = || {
                state = state
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                ((state >> 32) % 11) as i64 - 5
            };
            let square = (0..size * size).map(|_| next()).collect::<Vec<_>>();
            let surplus = (0..surplus_rows * size).map(|_| next()).collect::<Vec<_>>();
            if flint_small_surplus_class_order(&square, &surplus, size).is_err() {
                continue;
            }
            let source_coefficients = (0..size + surplus_rows).map(|_| next()).collect::<Vec<_>>();
            let mut relations = square.clone();
            relations.extend_from_slice(&surplus);
            let target = (0..size)
                .map(|column| {
                    (0..size + surplus_rows).fold(0_i64, |sum, relation| {
                        sum + source_coefficients[relation] * relations[relation * size + column]
                    })
                })
                .collect::<Vec<_>>();
            let answer =
                flint_small_surplus_relation_witnesses(&square, &surplus, size, &target).unwrap();
            for column in 0..size {
                let actual = (0..size + surplus_rows).fold(Integer::from(0), |sum, relation| {
                    sum + &answer.coefficients[relation] * relations[relation * size + column]
                });
                assert_eq!(actual, target[column]);
            }
            accepted += 1;
        }
    }

    #[test]
    fn left_kernel_is_saturated_and_replays() {
        let relations = [2, 0, 0, 3, 2, 3];
        let kernel = flint_left_kernel(&relations, 3, 2).unwrap();
        assert_eq!(kernel.rank, 1);
        for column in 0..2 {
            let mut actual = Integer::from(0);
            for relation in 0..3 {
                actual += &kernel.coefficients[relation] * relations[relation * 2 + column];
            }
            assert_eq!(actual, 0);
        }
        let gcd = kernel
            .coefficients
            .iter()
            .fold(Integer::from(0), |gcd, value| gcd.gcd_ref(value).complete());
        assert_eq!(gcd, 1);
    }

    #[test]
    fn arb_regulator_encloses_two_exact_cubic_units() {
        // x and x-1 are independent units in x^3-3*x+1.
        let generators = [
            0.into(),
            1.into(),
            0.into(),
            (-1).into(),
            1.into(),
            0.into(),
        ];
        let exponents = [1.into(), 0.into(), 0.into(), 1.into()];
        for precision in [256, 4_096] {
            let interval = flint_compact_cubic_regulator(
                [1, -3, 0, 1],
                [1, 0, 0, 0, 1, 0, 0, 0, 1],
                1,
                (3, 0),
                &generators,
                &exponents,
                precision,
            )
            .unwrap();
            assert!(interval.lower > 0);
            assert!(interval.upper >= interval.lower);
            assert!(interval.binary_exponent < 0);
        }
    }

    #[test]
    fn arb_regulator_encloses_one_exact_complex_cubic_unit() {
        // x is a unit of norm -1 in x^3-x+1.  Its unique real embedding
        // supplies the rank-one regulator.
        let generators = [0.into(), 1.into(), 0.into()];
        let exponents = [1.into()];
        for precision in [256, 4_096] {
            let interval = flint_compact_cubic_regulator(
                [1, -1, 0, 1],
                [1, 0, 0, 0, 1, 0, 0, 0, 1],
                1,
                (1, 1),
                &generators,
                &exponents,
                precision,
            )
            .unwrap();
            assert!(interval.lower > 0);
            assert!(interval.upper >= interval.lower);
        }
    }

    #[test]
    fn arb_regulator_accepts_full_width_polynomial_coefficients() {
        let generators = [0.into(), 1.into(), 0.into()];
        let exponents = [1.into()];
        for polynomial in [[i64::MIN, 0, 0, 1], [1, 0, i64::MAX, 1]] {
            let interval = flint_compact_cubic_regulator(
                polynomial,
                [1, 0, 0, 0, 1, 0, 0, 0, 1],
                1,
                (1, 1),
                &generators,
                &exponents,
                256,
            )
            .unwrap();
            assert!(interval.lower > 0);
            assert!(interval.upper >= interval.lower);
        }
    }

    #[test]
    fn arb_regulator_full_width_basis_matches_the_identity_basis() {
        let polynomial = [1, -3, 0, 1];
        let exponents = [1.into(), 0.into(), 0.into(), 1.into()];
        let ordinary = flint_compact_cubic_regulator(
            polynomial,
            [1, 0, 0, 0, 1, 0, 0, 0, 1],
            1,
            (3, 0),
            &[
                0.into(),
                1.into(),
                0.into(),
                (-1).into(),
                1.into(),
                0.into(),
            ],
            &exponents,
            256,
        )
        .unwrap();
        for (basis, denominator, generators) in [
            (
                [i64::MAX, 0, 0, 0, i64::MAX, 0, 0, 0, i64::MAX],
                i64::MAX as u64,
                [0, 1, 0, -1, 1, 0],
            ),
            (
                [i64::MIN, 0, 0, 0, i64::MIN, 0, 0, 0, i64::MIN],
                1_u64 << 63,
                [0, -1, 0, 1, -1, 0],
            ),
        ] {
            let generators = generators.map(Integer::from);
            let scaled = flint_compact_cubic_regulator(
                polynomial,
                basis,
                denominator,
                (3, 0),
                &generators,
                &exponents,
                256,
            )
            .unwrap();
            let common_exponent = scaled.binary_exponent.min(ordinary.binary_exponent);
            let endpoint = |value: &Integer, exponent: i64| {
                Integer::from(value << usize::try_from(exponent - common_exponent).unwrap())
            };
            assert!(
                endpoint(&scaled.lower, scaled.binary_exponent)
                    <= endpoint(&ordinary.upper, ordinary.binary_exponent)
            );
            assert!(
                endpoint(&ordinary.lower, ordinary.binary_exponent)
                    <= endpoint(&scaled.upper, scaled.binary_exponent)
            );
        }
    }

    #[test]
    fn arb_regulator_preserves_arbitrary_signed_gmp_exponents() {
        let ordinary = flint_compact_cubic_regulator(
            [1, -1, 0, 1],
            [1, 0, 0, 0, 1, 0, 0, 0, 1],
            1,
            (1, 1),
            &[0.into(), 1.into(), 0.into()],
            &[1.into()],
            256,
        )
        .unwrap();
        let large: Integer = Integer::from(1) << 130_u32;
        let split = flint_compact_cubic_regulator(
            [1, -1, 0, 1],
            [1, 0, 0, 0, 1, 0, 0, 0, 1],
            1,
            (1, 1),
            &[0.into(), 1.into(), 0.into(), 0.into(), 1.into(), 0.into()],
            &[large.clone(), Integer::from(1) - large.clone()],
            256,
        )
        .unwrap();
        let common_exponent = split.binary_exponent.min(ordinary.binary_exponent);
        let scaled = |value: &Integer, exponent: i64| {
            Integer::from(value << usize::try_from(exponent - common_exponent).unwrap())
        };
        assert!(
            scaled(&split.lower, split.binary_exponent)
                <= scaled(&ordinary.upper, ordinary.binary_exponent)
        );
        assert!(
            scaled(&ordinary.lower, ordinary.binary_exponent)
                <= scaled(&split.upper, split.binary_exponent)
        );
        let wide_coordinate = flint_compact_cubic_regulator(
            [1, -1, 0, 1],
            [1, 0, 0, 0, 1, 0, 0, 0, 1],
            u64::MAX,
            (1, 1),
            &[large, 1.into(), 0.into()],
            &[1.into()],
            256,
        )
        .unwrap();
        assert!(wide_coordinate.lower > 0);
        assert!(wide_coordinate.upper >= wide_coordinate.lower);
    }

    #[test]
    fn arb_regulator_rejects_nonmonic_polynomials() {
        assert_eq!(
            flint_compact_cubic_regulator(
                [1, -1, 0, 2],
                [1, 0, 0, 0, 1, 0, 0, 0, 1],
                1,
                (1, 1),
                &[0.into(), 1.into(), 0.into()],
                &[1.into()],
                256,
            ),
            Err(FlintNormalFormError::InvalidDimensions)
        );
    }

    #[cfg(target_pointer_width = "32")]
    #[test]
    fn arb_regulator_rejects_precision_outside_c_long_without_panicking() {
        assert_eq!(
            flint_compact_cubic_regulator(
                [1, -1, 0, 1],
                [1, 0, 0, 0, 1, 0, 0, 0, 1],
                1,
                (1, 1),
                &[0.into(), 1.into(), 0.into()],
                &[1.into()],
                u32::MAX,
            ),
            Err(FlintNormalFormError::InvalidDimensions)
        );
    }

    #[test]
    fn arb_belabas_friedman_bridge_returns_outward_intervals() {
        let regulator = FlintDyadicInterval {
            lower: 1.into(),
            upper: 1.into(),
            binary_exponent: 0,
        };
        let answer =
            flint_bf_index_enclosure(&[], 72, &Integer::from(49), 1, 2, (3, 0), &regulator, 256)
                .unwrap();
        assert!(answer.zeta_log_residue.lower <= answer.zeta_log_residue.upper);
        assert!(answer.tail_bound.lower > 0);
        assert!(answer.tail_bound.lower <= answer.tail_bound.upper);
        assert!(answer.index.lower > 0);
        assert!(answer.index.lower <= answer.index.upper);
    }

    #[test]
    fn arb_bdf_bridge_returns_an_outward_margin() {
        let margin =
            flint_bdf_factor_base_margin(&[[1, 2, 1], [1, 3, 1]], 5, &Integer::from(49), 3, 3, 256)
                .unwrap();
        assert!(margin.lower <= margin.upper);
        assert!(margin.binary_exponent < 0);
    }
}
