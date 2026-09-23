// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Honest prepared-cubic factor-base construction for the Rust experiment.
//!
//! This is deliberately driven by the defining polynomial and integral basis.
//! The observed H1 bound, ideal count, and prime descriptors are outputs, not
//! capacities or inputs.

use std::f64::consts::PI;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrimeIdeal {
    pub prime: i64,
    pub ramification: usize,
    pub residue_degree: usize,
    pub generator: [i64; 3],
    pub tau: [i64; 9],
    pub hnf: [i64; 9],
    pub norm: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactorBase {
    pub relation_bound: usize,
    pub checking_bound: usize,
    pub ideals: Vec<PrimeIdeal>,
    pub rational_primes: Vec<i64>,
    pub rational_offsets: Vec<usize>,
    pub rational_counts: Vec<usize>,
    pub complete_groups: Vec<bool>,
}

impl FactorBase {
    /// PARI's stable `subFBgen` ordering for the initial prepared attempt.
    pub fn subfactor_permutation(&self, minimum: usize) -> (usize, Vec<usize>) {
        let mut bad = vec![false; self.ideals.len()];
        for group in 0..self.rational_primes.len() {
            if self.complete_groups[group] {
                bad[self.rational_offsets[group] + self.rational_counts[group] - 1] = true;
            }
        }
        let mut order: Vec<_> = (0..self.ideals.len()).collect();
        order.sort_by_key(|index| self.ideals[*index].norm); // stable
        let mut chosen = Vec::new();
        let mut rejected = Vec::new();
        let mut product = 1.0_f64;
        let mut stopped = 0_usize;
        for (position, index) in order.iter().copied().enumerate() {
            stopped = position + 1;
            if bad[index] {
                rejected.push(index + 1);
            } else {
                chosen.push(index + 1);
                product *= self.ideals[index].norm as f64;
                if chosen.len() + 1 > minimum && product > self.checking_bound as f64 {
                    break;
                }
            }
        }
        let count = chosen.len();
        let mut permutation = chosen;
        permutation.extend(rejected);
        for index in order.into_iter().skip(stopped) {
            permutation.push(index + 1);
        }
        assert_eq!(permutation.len(), self.ideals.len());
        (count, permutation)
    }
}

#[derive(Clone, Debug)]
struct Factor {
    coefficients: Vec<i64>,
    exponent: usize,
}

#[derive(Clone, Debug)]
struct PrimePattern {
    prime: i64,
    factors: Vec<Factor>,
}

fn primes_through(limit: usize) -> Vec<i64> {
    let mut sieve = vec![true; limit + 1];
    if !sieve.is_empty() {
        sieve[0] = false;
    }
    if limit >= 1 {
        sieve[1] = false;
    }
    let mut p = 2;
    while p * p <= limit {
        if sieve[p] {
            let mut multiple = p * p;
            while multiple <= limit {
                sieve[multiple] = false;
                multiple += p;
            }
        }
        p += 1;
    }
    sieve
        .into_iter()
        .enumerate()
        .filter_map(|(value, prime)| prime.then_some(value as i64))
        .collect()
}

#[inline]
fn mod_i64(value: i128, prime: i64) -> i64 {
    value.rem_euclid(i128::from(prime)) as i64
}

/// Reduce `left * right + addend` when all three operands are residues.
///
/// Wasm engines differ dramatically in their lowering of i128 remainder.  A
/// cubic root scan performs this operation millions of times even though its
/// inputs are already in `[0, prime)`.  The fast branch is valid precisely
/// when `(prime - 1)^2 + (prime - 1)` fits in i64; the division-form guard
/// proves that fact without overflowing.  Larger moduli retain the original
/// i128 implementation.
#[inline]
fn residue_mul_add(left: i64, right: i64, addend: i64, prime: i64) -> i64 {
    debug_assert!(prime >= 2);
    debug_assert!((0..prime).contains(&left));
    debug_assert!((0..prime).contains(&right));
    debug_assert!((0..prime).contains(&addend));
    let maximum = prime - 1;
    if maximum <= (i64::MAX - maximum) / maximum {
        (left * right + addend).rem_euclid(prime)
    } else {
        mod_i64(
            i128::from(left) * i128::from(right) + i128::from(addend),
            prime,
        )
    }
}

fn evaluate_mod(polynomial: &[i64], value: i64, prime: i64) -> i64 {
    polynomial.iter().rev().fold(0_i64, |answer, coefficient| {
        residue_mul_add(answer, value, *coefficient, prime)
    })
}

/// Divide a monic polynomial by `x-root` over `F_p`.
fn divide_linear(polynomial: &[i64], root: i64, prime: i64) -> Vec<i64> {
    let degree = polynomial.len() - 1;
    let mut quotient = vec![0_i64; degree];
    quotient[degree - 1] = polynomial[degree];
    for index in (1..degree).rev() {
        quotient[index - 1] = residue_mul_add(root, quotient[index], polynomial[index], prime);
    }
    debug_assert_eq!(evaluate_mod(polynomial, root, prime), 0);
    quotient
}

fn factor_cubic(polynomial: [i64; 4], prime: i64) -> Vec<Factor> {
    let mut remaining: Vec<i64> = polynomial
        .into_iter()
        .map(|coefficient| coefficient.rem_euclid(prime))
        .collect();
    let mut factors = Vec::new();
    for root in 0..prime {
        if remaining.len() <= 1 || evaluate_mod(&remaining, root, prime) != 0 {
            continue;
        }
        let mut exponent = 0;
        while remaining.len() > 1 && evaluate_mod(&remaining, root, prime) == 0 {
            remaining = divide_linear(&remaining, root, prime);
            exponent += 1;
        }
        factors.push(Factor {
            coefficients: vec![(-root).rem_euclid(prime), 1],
            exponent,
        });
    }
    if remaining.len() > 1 {
        factors.push(Factor {
            coefficients: remaining,
            exponent: 1,
        });
    }
    factors
}

pub(crate) fn prepared_cubic_factor_pattern(
    polynomial: [i64; 4],
    prime: i64,
) -> Vec<(Vec<i64>, usize)> {
    factor_cubic(polynomial, prime)
        .into_iter()
        .map(|factor| (factor.coefficients, factor.exponent))
        .collect()
}

/// Return the exact cubic factor degrees and ramification pattern when the
/// caller has already proved whether the reduction is ramified. For a
/// squarefree cubic the coefficient vectors are degree-only placeholders, not
/// irreducible factors suitable for constructing prime ideals. This uses
/// Frobenius and a constant-size polynomial gcd instead of scanning every
/// residue for roots.
pub(crate) fn prepared_cubic_factor_pattern_with_ramification(
    polynomial: [i64; 4],
    prime: i64,
    ramified: bool,
) -> Vec<(Vec<i64>, usize)> {
    factor_pattern_cubic_with_ramification(polynomial, prime, ramified)
        .into_iter()
        .map(|factor| (factor.coefficients, factor.exponent))
        .collect()
}

pub(crate) fn rational_primes_through(limit: usize) -> Vec<i64> {
    primes_through(limit)
}

fn trim_polynomial(polynomial: &mut Vec<i64>) {
    while polynomial.len() > 1 && polynomial.last() == Some(&0) {
        polynomial.pop();
    }
}

fn multiply_mod_cubic(first: &[i64], second: &[i64], defining: [i64; 4], prime: i64) -> Vec<i64> {
    let mut product = vec![0_i64; first.len() + second.len() - 1];
    for (i, left) in first.iter().enumerate() {
        for (j, right) in second.iter().enumerate() {
            product[i + j] = mod_i64(
                i128::from(product[i + j]) + i128::from(*left) * i128::from(*right),
                prime,
            );
        }
    }
    if product.len() < 4 {
        return product;
    }
    for degree in (3..product.len()).rev() {
        let leading = product[degree];
        if leading != 0 {
            for lower in 0..3 {
                product[degree - 3 + lower] = mod_i64(
                    i128::from(product[degree - 3 + lower])
                        - i128::from(leading) * i128::from(defining[lower]),
                    prime,
                );
            }
        }
    }
    product.truncate(3);
    trim_polynomial(&mut product);
    product
}

fn x_power_mod_cubic(exponent: i64, defining: [i64; 4], prime: i64) -> Vec<i64> {
    let mut answer = vec![1_i64];
    let mut power = vec![0_i64, 1];
    let mut exponent = exponent;
    while exponent != 0 {
        if exponent & 1 != 0 {
            answer = multiply_mod_cubic(&answer, &power, defining, prime);
        }
        exponent >>= 1;
        if exponent != 0 {
            power = multiply_mod_cubic(&power, &power, defining, prime);
        }
    }
    answer
}

fn polynomial_remainder(mut dividend: Vec<i64>, divisor: &[i64], prime: i64) -> Vec<i64> {
    trim_polynomial(&mut dividend);
    let divisor_degree = divisor.len() - 1;
    let inverse = mod_inverse(divisor[divisor_degree], prime);
    while dividend.len() >= divisor.len() && !(dividend.len() == 1 && dividend[0] == 0) {
        let shift = dividend.len() - divisor.len();
        let multiplier = mod_i64(
            i128::from(*dividend.last().unwrap()) * i128::from(inverse),
            prime,
        );
        for (index, coefficient) in divisor.iter().enumerate() {
            dividend[shift + index] = mod_i64(
                i128::from(dividend[shift + index])
                    - i128::from(multiplier) * i128::from(*coefficient),
                prime,
            );
        }
        trim_polynomial(&mut dividend);
    }
    dividend
}

fn polynomial_gcd_degree(mut first: Vec<i64>, mut second: Vec<i64>, prime: i64) -> usize {
    trim_polynomial(&mut first);
    trim_polynomial(&mut second);
    while !(second.len() == 1 && second[0] == 0) {
        let remainder = polynomial_remainder(first, &second, prime);
        first = second;
        second = remainder;
    }
    first.len() - 1
}

fn factor_pattern_cubic(polynomial: [i64; 4], prime: i64, discriminant: i128) -> Vec<Factor> {
    factor_pattern_cubic_with_ramification(
        polynomial,
        prime,
        discriminant.rem_euclid(i128::from(prime)) == 0,
    )
}

fn factor_pattern_cubic_with_ramification(
    polynomial: [i64; 4],
    prime: i64,
    ramified: bool,
) -> Vec<Factor> {
    if ramified {
        return factor_cubic(polynomial, prime);
    }
    let mut frobenius = x_power_mod_cubic(prime, polynomial, prime);
    if frobenius.len() < 2 {
        frobenius.resize(2, 0);
    }
    frobenius[1] = (frobenius[1] - 1).rem_euclid(prime);
    trim_polynomial(&mut frobenius);
    let defining = polynomial
        .into_iter()
        .map(|value| value.rem_euclid(prime))
        .collect::<Vec<_>>();
    match polynomial_gcd_degree(defining, frobenius, prime) {
        0 => vec![Factor {
            coefficients: vec![0, 0, 0, 1],
            exponent: 1,
        }],
        1 => vec![
            Factor {
                coefficients: vec![0, 1],
                exponent: 1,
            },
            Factor {
                coefficients: vec![0, 0, 1],
                exponent: 1,
            },
        ],
        3 => (0..3)
            .map(|_| Factor {
                coefficients: vec![0, 1],
                exponent: 1,
            })
            .collect(),
        // A squarefree cubic can only have gcd degree 0, 1, or 3 here. Keep
        // the public boundary total if an arithmetic implementation defect
        // ever violates that invariant: exhaustive factorization is slower,
        // but still exact and cannot turn the defect into a false certificate.
        _ => factor_cubic(polynomial, prime),
    }
}

fn centered(value: i64, prime: i64) -> i64 {
    let mut answer = value.rem_euclid(prime);
    if answer > prime / 2 {
        answer -= prime;
    }
    answer
}

fn determinant3(matrix: &[i64; 9]) -> i128 {
    // Column-major input.
    let at = |row: usize, column: usize| i128::from(matrix[column * 3 + row]);
    at(0, 0) * (at(1, 1) * at(2, 2) - at(1, 2) * at(2, 1))
        - at(0, 1) * (at(1, 0) * at(2, 2) - at(1, 2) * at(2, 0))
        + at(0, 2) * (at(1, 0) * at(2, 1) - at(1, 1) * at(2, 0))
}

fn inverse_unimodular3(matrix: &[i64; 9]) -> [i64; 9] {
    let determinant = determinant3(matrix);
    assert!(
        determinant == 1 || determinant == -1,
        "prepared basis is not unimodular"
    );
    let at = |row: usize, column: usize| i128::from(matrix[column * 3 + row]);
    let mut inverse = [0_i64; 9];
    for row in 0..3 {
        for column in 0..3 {
            let rows: Vec<_> = (0..3).filter(|index| *index != column).collect();
            let columns: Vec<_> = (0..3).filter(|index| *index != row).collect();
            let minor = at(rows[0], columns[0]) * at(rows[1], columns[1])
                - at(rows[0], columns[1]) * at(rows[1], columns[0]);
            let cofactor = if (row + column) % 2 == 0 {
                minor
            } else {
                -minor
            };
            inverse[column * 3 + row] = (cofactor / determinant) as i64;
        }
    }
    inverse
}

fn polynomial_to_basis(polynomial: &[i64], inverse: &[i64; 9], prime: i64) -> [i64; 3] {
    let mut answer = [0_i64; 3];
    for basis_coordinate in 0..3 {
        let mut value = 0_i128;
        for (degree, coefficient) in polynomial.iter().enumerate() {
            value += i128::from(inverse[degree * 3 + basis_coordinate]) * i128::from(*coefficient);
        }
        answer[basis_coordinate] = centered(mod_i64(value, prime), prime);
    }
    answer
}

fn basis_to_polynomial(element: &[i64; 3], basis: &[i64; 9]) -> [i64; 3] {
    let mut answer = [0_i64; 3];
    for degree in 0..3 {
        let mut value = 0_i128;
        for coordinate in 0..3 {
            value += i128::from(basis[coordinate * 3 + degree]) * i128::from(element[coordinate]);
        }
        answer[degree] = i64::try_from(value).unwrap();
    }
    answer
}

fn gcd(mut first: i64, mut second: i64) -> i64 {
    first = first.abs();
    second = second.abs();
    while second != 0 {
        (first, second) = (second, first % second);
    }
    first
}

fn determinant_bareiss(mut matrix: Vec<Vec<i128>>) -> i128 {
    let n = matrix.len();
    if n == 0 {
        return 1;
    }
    let mut sign = 1_i128;
    let mut denominator = 1_i128;
    for pivot in 0..n - 1 {
        let Some(row) = (pivot..n).find(|row| matrix[*row][pivot] != 0) else {
            return 0;
        };
        if row != pivot {
            matrix.swap(row, pivot);
            sign = -sign;
        }
        let pivot_value = matrix[pivot][pivot];
        for row in pivot + 1..n {
            for column in pivot + 1..n {
                let numerator =
                    matrix[row][column] * pivot_value - matrix[row][pivot] * matrix[pivot][column];
                debug_assert_eq!(numerator % denominator, 0);
                matrix[row][column] = numerator / denominator;
            }
        }
        denominator = pivot_value;
    }
    sign * matrix[n - 1][n - 1]
}

fn resultant(first: &[i64], second: &[i64]) -> i128 {
    let m = first.len() - 1;
    let n = second.len() - 1;
    let size = m + n;
    let mut sylvester = vec![vec![0_i128; size]; size];
    let first_descending: Vec<_> = first.iter().rev().copied().collect();
    let second_descending: Vec<_> = second.iter().rev().copied().collect();
    for row in 0..n {
        for (column, coefficient) in first_descending.iter().enumerate() {
            sylvester[row][row + column] = i128::from(*coefficient);
        }
    }
    for shift in 0..m {
        for (column, coefficient) in second_descending.iter().enumerate() {
            sylvester[n + shift][shift + column] = i128::from(*coefficient);
        }
    }
    determinant_bareiss(sylvester)
}

fn corrected_generator(
    mut generator: [i64; 3],
    defining: [i64; 4],
    basis: &[i64; 9],
    prime: i64,
    residue_degree: usize,
    ramification: usize,
) -> [i64; 3] {
    if ramification != 1 {
        return generator;
    }
    let polynomial = basis_to_polynomial(&generator, basis);
    let degree = polynomial.iter().rposition(|value| *value != 0).unwrap();
    let content = polynomial[..=degree]
        .iter()
        .fold(0_i64, |answer, value| gcd(answer, *value));
    let primitive: Vec<i64> = polynomial[..=degree]
        .iter()
        .map(|value| *value / content.max(1))
        .collect();
    let mut result = resultant(&defining, &primitive).unsigned_abs();
    let mut valuation = 0_usize;
    while result != 0 && result % prime as u128 == 0 {
        result /= prime as u128;
        valuation += 1;
    }
    if valuation > residue_degree {
        if generator[0] > 0 {
            generator[0] -= prime;
        } else {
            generator[0] += prime;
        }
    }
    generator
}

fn polynomial_quotient_mod(dividend: [i64; 4], divisor: &[i64], prime: i64) -> Vec<i64> {
    let mut remainder: Vec<i64> = dividend
        .into_iter()
        .map(|value| value.rem_euclid(prime))
        .collect();
    let quotient_degree = 3 - (divisor.len() - 1);
    let mut quotient = vec![0_i64; quotient_degree + 1];
    for shift in (0..=quotient_degree).rev() {
        let coefficient = remainder[shift + divisor.len() - 1];
        quotient[shift] = coefficient;
        for (index, divisor_coefficient) in divisor.iter().enumerate() {
            remainder[shift + index] = mod_i64(
                i128::from(remainder[shift + index])
                    - i128::from(coefficient) * i128::from(*divisor_coefficient),
                prime,
            );
        }
    }
    debug_assert!(
        remainder[..divisor.len() - 1]
            .iter()
            .all(|value| *value == 0)
    );
    quotient
}

fn multiply_polynomials_mod_defining(
    first: &[i64; 3],
    second: &[i64; 3],
    defining: [i64; 4],
) -> [i128; 3] {
    let mut product = [0_i128; 5];
    for i in 0..3 {
        for j in 0..3 {
            product[i + j] += i128::from(first[i]) * i128::from(second[j]);
        }
    }
    for degree in (3..=4).rev() {
        let leading = product[degree];
        if leading != 0 {
            for lower in 0..3 {
                product[degree - 3 + lower] -= leading * i128::from(defining[lower]);
            }
        }
    }
    [product[0], product[1], product[2]]
}

fn multiplication_table(defining: [i64; 4], basis: &[i64; 9], inverse: &[i64; 9]) -> [i64; 27] {
    let mut table = [0_i64; 27];
    for i in 0..3 {
        let first = [basis[i * 3], basis[i * 3 + 1], basis[i * 3 + 2]];
        for j in 0..3 {
            let second = [basis[j * 3], basis[j * 3 + 1], basis[j * 3 + 2]];
            let polynomial = multiply_polynomials_mod_defining(&first, &second, defining);
            for coordinate in 0..3 {
                let mut value = 0_i128;
                for degree in 0..3 {
                    value += i128::from(inverse[degree * 3 + coordinate]) * polynomial[degree];
                }
                table[(i * 3 + j) * 3 + coordinate] = i64::try_from(value).unwrap();
            }
        }
    }
    table
}

fn multiplication_matrix(table: &[i64; 27], element: &[i64; 3]) -> [i64; 9] {
    let mut output = [0_i64; 9];
    for k in 0..3 {
        output[k * 3] = element[k];
    }
    for i in 1..3 {
        for k in 0..3 {
            let mut value = 0_i128;
            for j in 0..3 {
                value += i128::from(table[(i * 3 + j) * 3 + k]) * i128::from(element[j]);
            }
            output[k * 3 + i] = i64::try_from(value).unwrap();
        }
    }
    output
}

fn mod_inverse(value: i64, prime: i64) -> i64 {
    let (mut old_r, mut r) = (i128::from(value.rem_euclid(prime)), i128::from(prime));
    let (mut old_s, mut s) = (1_i128, 0_i128);
    while r != 0 {
        let quotient = old_r / r;
        (old_r, r) = (r, old_r - quotient * r);
        (old_s, s) = (s, old_s - quotient * s);
    }
    assert_eq!(old_r, 1);
    old_s.rem_euclid(i128::from(prime)) as i64
}

fn prime_modulus_hnf(original: &[i64; 9], prime: i64) -> [i64; 9] {
    let mut work = original.map(|value| value.rem_euclid(prime));
    let mut output = [0_i64; 9];
    let mut pivots = [-1_i64; 3];
    for i in 0..3 {
        output[i * 3 + i] = prime;
    }
    let mut remaining = 3_usize;
    for row in (0..3).rev() {
        let mut column = remaining as isize - 1;
        while column >= 0 && work[row * 3 + column as usize] == 0 {
            column -= 1;
        }
        if column < 0 {
            continue;
        }
        let column = column as usize;
        let destination = remaining - 1;
        let pivot = work[row * 3 + column];
        if column != destination {
            for i in 0..3 {
                work.swap(i * 3 + destination, i * 3 + column);
            }
        }
        if pivot != 1 {
            let inverse = mod_inverse(pivot, prime);
            for i in 0..row {
                work[i * 3 + destination] = mod_i64(
                    i128::from(work[i * 3 + destination]) * i128::from(inverse),
                    prime,
                );
            }
        }
        work[row * 3 + destination] = 1;
        for j in (0..destination).rev() {
            let multiplier = work[row * 3 + j];
            if multiplier != 0 {
                for i in 0..3 {
                    work[i * 3 + j] -= multiplier * work[i * 3 + destination];
                }
                for i in 0..row {
                    work[i * 3 + j] = work[i * 3 + j].rem_euclid(prime);
                }
            }
        }
        pivots[destination] = row as i64;
        remaining -= 1;
    }
    let rank = 3 - remaining;
    if rank == 3 {
        return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    for j in remaining..3 {
        for i in 0..3 {
            output[i * 3 + pivots[j] as usize] = work[i * 3 + j];
        }
    }
    for i in (0..3).rev() {
        if output[i * 3 + i] == 1 {
            for j in i + 1..3 {
                let multiplier = output[i * 3 + j];
                if multiplier != 0 {
                    for k in 0..3 {
                        output[k * 3 + j] -= multiplier * output[k * 3 + i];
                    }
                }
            }
        } else {
            for j in i + 1..3 {
                output[i * 3 + j] %= prime;
            }
        }
    }
    // Published packet owners use canonical nonnegative residues.  PARI's
    // generic integer remainder path reaches this normalization through its
    // column representation; make it explicit in the row-major Rust value.
    for row in 0..3 {
        for column in row + 1..3 {
            output[row * 3 + column] = output[row * 3 + column].rem_euclid(prime);
        }
    }
    output
}

fn discriminant_cubic(polynomial: [i64; 4]) -> i128 {
    let [d, c, b, a] = polynomial.map(i128::from);
    b * b * c * c - 4 * a * c * c * c - 4 * b * b * b * d - 27 * a * a * d * d + 18 * a * b * c * d
}

fn grh_check(
    bound: usize,
    catalog: &[PrimePattern],
    degree: usize,
    real_places: usize,
    log_d: f64,
) -> bool {
    if bound == 1 {
        return false;
    }
    let log_c = (bound as f64).ln();
    let mut sa = 0.0;
    let mut sb = 0.0;
    for pattern in catalog {
        let p = pattern.prime as usize;
        if p > bound {
            break;
        }
        let log_p = (p as f64).ln();
        let ratio = log_c / log_p;
        let mut grouped: Vec<(usize, usize)> = Vec::new();
        for factor in &pattern.factors {
            let f = factor.coefficients.len() - 1;
            if let Some(last) = grouped.last_mut().filter(|last| last.0 == f) {
                // `get_fs` groups distinct irreducible factors.  The Kummer
                // exponent is ramification metadata, not the number of prime
                // ideals contributing to the explicit-formula sum.
                last.1 += 1;
            } else {
                grouped.push((f, 1));
            }
        }
        grouped.sort_unstable_by_key(|item| item.0);
        for (f, multiplicity) in grouped {
            if f as f64 > ratio {
                break;
            }
            let log_np = f as f64 * log_p;
            let norm = (p as u64).pow(f as u32) as f64;
            let q = 1.0 / norm.sqrt();
            let mut term_a = log_np * q;
            let mut term_b = log_np * term_a;
            let m = (ratio / f as f64) as usize;
            if m > 1 {
                let inverse = 1.0 / (1.0 - q);
                term_a *= (1.0 - q.powi(m as i32)) * inverse;
                term_b *=
                    (1.0 - q.powi(m as i32) * ((m + 1) as f64 - m as f64 * q)) * inverse * inverse;
            }
            sa += multiplicity as f64 * term_a;
            sb += multiplicity as f64 * term_b;
        }
    }
    let c_d = log_d - degree as f64 * 3.801_387_092_431 - real_places as f64 * PI / 2.0;
    let c_n = real_places as f64 * 3.663_862_376_709 + degree as f64 * (PI * PI / 2.0);
    c_d + (c_n + 2.0 * sb) / log_c - 2.0 * sa < -1e-8
}

fn grh_bound(catalog: &[PrimePattern], log_d: f64, real_places: usize) -> usize {
    let initial = 1_usize;
    let maximum = (4.0 * log_d * log_d) as usize;
    let mut high = initial;
    let mut low = initial;
    while !grh_check(high, catalog, 3, real_places, log_d) {
        low = high;
        high *= 2;
    }
    while high - low > 1 {
        let test = (low + high) / 2;
        if grh_check(test, catalog, 3, real_places, log_d) {
            high = test;
        } else {
            low = test;
        }
    }
    if high == initial + 1 && grh_check(initial, catalog, 3, real_places, log_d) {
        high = initial;
    }
    high.min(maximum)
}

fn nth_ideal_bound(catalog: &[PrimePattern], count: usize) -> Option<usize> {
    let mut norms = vec![i64::MAX; count + 1];
    for pattern in catalog {
        let p = pattern.prime;
        let mut factors: Vec<_> = pattern.factors.iter().collect();
        factors.sort_unstable_by_key(|factor| factor.coefficients.len());
        if factors[0].coefficients.len() - 1 != 3 {
            for factor in factors.into_iter().rev() {
                let degree = factor.coefficients.len() - 1;
                let norm = p.pow(degree as u32);
                let mut k = 1;
                while k <= count && norms[k] <= norm {
                    k += 1;
                }
                if k <= count {
                    let number = 1;
                    for l in k + number..=count {
                        norms[l] = norms[l - number];
                    }
                    let mut l = 0;
                    while l < number && k + l <= count {
                        norms[k + l] = norm;
                        l += 1;
                    }
                    while l <= k {
                        norms[l] = norm;
                        l += 1;
                    }
                }
            }
        }
        if p > norms[count] {
            return Some(norms[count] as usize);
        }
    }
    None
}

/// Construct the exact PARI-policy factor base from a prepared monogenic cubic.
fn prepared_cubic_bounds(
    polynomial: [i64; 4],
    signed_discriminant: i128,
    index_prime_patterns: &[(i64, Vec<(usize, usize)>)],
) -> (usize, usize, Vec<PrimePattern>) {
    let discriminant = signed_discriminant.unsigned_abs();
    // The analytic size bound belongs to the maximal-order discriminant, but
    // this catalog still factors the supplied equation polynomial. At an
    // equation-order index prime those discriminants differ by a square, so
    // squarefreeness must be decided from the equation discriminant. Callers
    // constructing a maximal-order base supply authenticated patterns for
    // every such index prime; monogenic callers need no overrides.
    let equation_discriminant = discriminant_cubic(polynomial);
    let log_d = (discriminant as f64).ln();
    let maximum_grh_bound = (4.0 * log_d * log_d) as usize;
    // `grh_bound` doubles its trial bound, so cover the first power of two
    // above the analytic maximum.  Extend only if the same catalog has not yet
    // exhibited three non-inert prime ideals.  This avoids constructing
    // thousands of irrelevant prime patterns for millisecond-scale fields.
    let mut catalog_limit = 64_usize.max(maximum_grh_bound.saturating_mul(2));
    let (catalog, nth_bound) = loop {
        let primes = primes_through(catalog_limit);
        let mut catalog = Vec::with_capacity(primes.len());
        for prime in primes {
            let mut factors = match index_prime_patterns
                .binary_search_by_key(&prime, |(index_prime, _)| *index_prime)
            {
                Ok(index) => index_prime_patterns[index]
                    .1
                    .iter()
                    .map(|&(ramification, residue_degree)| Factor {
                        // Only the degree is consumed by the analytic bound.
                        coefficients: vec![0; residue_degree + 1],
                        exponent: ramification,
                    })
                    .collect(),
                Err(_) => factor_pattern_cubic(polynomial, prime, equation_discriminant),
            };
            factors.sort_by_key(|factor| factor.coefficients.len());
            catalog.push(PrimePattern { prime, factors });
        }
        if let Some(bound) = nth_ideal_bound(&catalog, 3) {
            break (catalog, bound);
        }
        catalog_limit = catalog_limit
            .checked_mul(2)
            .expect("prime catalog limit overflowed");
    };
    let real_places = if signed_discriminant > 0 { 3 } else { 1 };
    let grh_bound = grh_bound(&catalog, log_d, real_places);
    let relation_bound = grh_bound.max(nth_bound);
    // PARI's default cbach=0 path promotes LIMC2 to LIMC when the nth-ideal
    // floor raises the relation bound, so the construction and checking
    // catalogs have the same final limit.
    let checking_bound = relation_bound;
    (relation_bound, checking_bound, catalog)
}

/// Compute PARI-policy bounds without maximal-order index-prime overrides.
/// This is valid for the monogenic constructor and retained as a focused
/// regression boundary for equation-discriminant ramification.
pub(crate) fn prepared_cubic_bounds_for_discriminant(
    polynomial: [i64; 4],
    signed_discriminant: i128,
) -> (usize, usize) {
    prepared_cubic_bounds_for_discriminant_and_index_patterns(polynomial, signed_discriminant, &[])
}

/// Compute PARI-policy bounds with authenticated maximal-order splitting at
/// equation-order index primes. Each pattern entry is `(ramification,
/// residue_degree)` and the prime keys must be strictly increasing.
pub(crate) fn prepared_cubic_bounds_for_discriminant_and_index_patterns(
    polynomial: [i64; 4],
    signed_discriminant: i128,
    index_prime_patterns: &[(i64, Vec<(usize, usize)>)],
) -> (usize, usize) {
    debug_assert!(
        index_prime_patterns
            .windows(2)
            .all(|pair| pair[0].0 < pair[1].0)
    );
    let (relation, checking, _) =
        prepared_cubic_bounds(polynomial, signed_discriminant, index_prime_patterns);
    (relation, checking)
}

/// Construct the exact PARI-policy factor base from a prepared monogenic cubic.
pub fn prepared_cubic_factor_base(polynomial: [i64; 4], basis: [i64; 9]) -> FactorBase {
    assert_eq!(polynomial[3], 1);
    let signed_discriminant = discriminant_cubic(polynomial);
    let (relation_bound, checking_bound, catalog) =
        prepared_cubic_bounds(polynomial, signed_discriminant, &[]);
    let inverse = inverse_unimodular3(&basis);
    let table = multiplication_table(polynomial, &basis, &inverse);
    let logarithm = (relation_bound as f64 + 0.5).ln();
    let mut ideals = Vec::new();
    let mut rational_primes = Vec::new();
    let mut rational_offsets = Vec::new();
    let mut rational_counts = Vec::new();
    let mut complete_groups = Vec::new();
    for pattern in &catalog {
        if pattern.prime as usize > relation_bound {
            break;
        }
        let limit = (logarithm / (pattern.prime as f64).ln()) as usize;
        let mut descriptors = Vec::new();
        let actual_factors = factor_cubic(polynomial, pattern.prime);
        for factor in &actual_factors {
            let degree = factor.coefficients.len() - 1;
            if degree > limit || degree == 3 {
                continue;
            }
            let generator = corrected_generator(
                polynomial_to_basis(&factor.coefficients, &inverse, pattern.prime),
                polynomial,
                &basis,
                pattern.prime,
                degree,
                factor.exponent,
            );
            let quotient = polynomial_quotient_mod(polynomial, &factor.coefficients, pattern.prime);
            let t = polynomial_to_basis(&quotient, &inverse, pattern.prime);
            // `multiplication_matrix` is row-major.  The translated catalog
            // transposes the descriptor's raw column-major `tau` during
            // publication, so this is already the selected-owner layout.
            let tau = multiplication_matrix(&table, &t);
            let hnf = prime_modulus_hnf(&multiplication_matrix(&table, &generator), pattern.prime);
            descriptors.push(PrimeIdeal {
                prime: pattern.prime,
                ramification: factor.exponent,
                residue_degree: degree,
                generator,
                tau,
                hnf,
                norm: pattern.prime.pow(degree as u32),
            });
        }
        descriptors.sort_by(|first, second| {
            first
                .residue_degree
                .cmp(&second.residue_degree)
                .then_with(|| first.generator.cmp(&second.generator))
        });
        if !descriptors.is_empty() {
            rational_primes.push(pattern.prime);
            rational_offsets.push(ideals.len());
            rational_counts.push(descriptors.len());
            complete_groups.push(descriptors.len() == actual_factors.len());
            ideals.extend(descriptors);
        }
    }
    FactorBase {
        relation_bound,
        checking_bound,
        ideals,
        rational_primes,
        rational_offsets,
        rational_counts,
        complete_groups,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::relation_cache::RelationCache;

    fn h1_factor_base() -> FactorBase {
        prepared_cubic_factor_base([20_034, -20_018, 0, 1], [1, 0, 0, 0, 1, 0, -13_345, 2, 1])
    }

    fn h1_initial_cache(factor_base: &FactorBase) -> (RelationCache, Vec<i64>) {
        let additional = 5 + (3 + 3) / 2 - 1;
        let capacity = 10 * (factor_base.ideals.len() + additional) + 50;
        let mut cache = RelationCache::new(factor_base.ideals.len(), capacity, additional);
        let mut relation = vec![0_i64; factor_base.ideals.len()];
        let ramification: Vec<_> = factor_base
            .ideals
            .iter()
            .map(|ideal| ideal.ramification as i64)
            .collect();
        assert_eq!(
            cache
                .initialize_complete_prime_groups(
                    additional,
                    &factor_base.rational_primes,
                    &factor_base.rational_offsets,
                    &factor_base.rational_counts,
                    &factor_base.complete_groups,
                    &ramification,
                    &mut relation,
                )
                .unwrap(),
            12
        );
        let mut generators = vec![0_i64; cache.len() * 3];
        cache
            .publish_initial_generators(3, &mut generators)
            .unwrap();
        (cache, generators)
    }

    #[test]
    fn frobenius_splitting_patterns_match_exhaustive_cubic_factorization() {
        for polynomial in [
            [-1, -1, 0, 1],
            [-29, -30, -8, 1],
            [1, -2, -1, 1],
            [20_018, -20_010, 0, 1],
        ] {
            let discriminant = discriminant_cubic(polynomial);
            for prime in primes_through(4_607) {
                let ramified = discriminant.rem_euclid(i128::from(prime)) == 0;
                let summarize = |factors: Vec<(Vec<i64>, usize)>| {
                    let mut summary = factors
                        .into_iter()
                        .map(|(factor, exponent)| (factor.len() - 1, exponent))
                        .collect::<Vec<_>>();
                    summary.sort_unstable();
                    summary
                };
                assert_eq!(
                    summarize(prepared_cubic_factor_pattern_with_ramification(
                        polynomial, prime, ramified,
                    )),
                    summarize(prepared_cubic_factor_pattern(polynomial, prime)),
                    "polynomial {polynomial:?}, prime {prime}",
                );
            }
        }
    }

    #[test]
    fn bound_catalog_uses_equation_discriminant_for_index_prime_ramification() {
        for (polynomial, index_squared) in [
            ([224, -205, -4, 1], 4_i128),
            ([-162_320, 162_564, -251, 1], 16_i128),
        ] {
            let equation_discriminant = discriminant_cubic(polynomial);
            assert_eq!(equation_discriminant % index_squared, 0);
            let maximal_order_discriminant = equation_discriminant / index_squared;
            let (relation_bound, checking_bound) =
                prepared_cubic_bounds_for_discriminant(polynomial, maximal_order_discriminant);
            assert!(relation_bound >= 2);
            assert_eq!(checking_bound, relation_bound);
        }
    }

    #[test]
    fn h1_factor_base_is_derived_from_the_prepared_field() {
        let factor_base = h1_factor_base();
        assert_eq!(factor_base.relation_bound, 333);
        assert_eq!(factor_base.checking_bound, 333);
        assert_eq!(factor_base.ideals.len(), 66);
        assert_eq!(factor_base.rational_primes.len(), 48);
        assert_eq!(factor_base.ideals[0].prime, 2);
        assert_eq!(factor_base.ideals[0].ramification, 3);
        assert_eq!(factor_base.ideals[0].residue_degree, 1);
        assert_eq!(factor_base.ideals[0].hnf, [2, 0, 1, 0, 1, 0, 0, 0, 1]);
        assert_eq!(factor_base.ideals.last().unwrap().prime, 331);
        let (subcount, permutation) = factor_base.subfactor_permutation(3);
        assert_eq!(subcount, 4);
        assert_eq!(&permutation[..8], &[2, 4, 6, 8, 1, 3, 7, 10]);
        let (cache, generators) = h1_initial_cache(&factor_base);
        assert_eq!(cache.len(), 12);
        assert_eq!(cache.missing(), 54);
        assert_eq!(cache.remaining_supplementary(), 7);
        assert_eq!(generators.len(), 36);
    }

    #[test]
    fn h1_factor_base_matches_phase_checkpoint_when_requested() {
        let Some(path) = std::env::var_os("SAGEJS_H1_PHASE_CHECKPOINT") else {
            return;
        };
        let checkpoint: serde_json::Value =
            serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let oracle = &checkpoint["oracleOnly"]["factorBase"];
        let values = |owner: &serde_json::Value| -> Vec<i64> {
            owner["values"]
                .as_array()
                .unwrap()
                .iter()
                .map(|value| value.as_str().unwrap().parse().unwrap())
                .collect()
        };
        let factor_base = h1_factor_base();
        assert_eq!(
            factor_base.rational_primes,
            values(&oracle["activePrimeGroups"]["primes"])
        );
        assert_eq!(
            factor_base.rational_offsets,
            values(&oracle["activePrimeGroups"]["offsets"])
                .into_iter()
                .map(|value| value as usize)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            factor_base.rational_counts,
            values(&oracle["activePrimeGroups"]["counts"])
                .into_iter()
                .map(|value| value as usize)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            factor_base.complete_groups,
            values(&oracle["activePrimeGroups"]["complete"])
                .into_iter()
                .map(|value| value != 0)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            factor_base
                .ideals
                .iter()
                .map(|ideal| ideal.prime)
                .collect::<Vec<_>>(),
            values(&oracle["activeIdeals"]["primes"])
        );
        assert_eq!(
            factor_base
                .ideals
                .iter()
                .map(|ideal| ideal.ramification as i64)
                .collect::<Vec<_>>(),
            values(&oracle["activeIdeals"]["ramification"])
        );
        assert_eq!(
            factor_base
                .ideals
                .iter()
                .map(|ideal| ideal.residue_degree as i64)
                .collect::<Vec<_>>(),
            values(&oracle["activeIdeals"]["residueDegrees"])
        );
        assert_eq!(
            factor_base
                .ideals
                .iter()
                .flat_map(|ideal| ideal.tau)
                .collect::<Vec<_>>(),
            values(&oracle["activeIdeals"]["tau"])
        );
        assert_eq!(
            factor_base
                .ideals
                .iter()
                .flat_map(|ideal| ideal.hnf)
                .collect::<Vec<_>>(),
            values(&oracle["activeIdeals"]["packetIdeals"])
        );
        assert_eq!(
            factor_base
                .ideals
                .iter()
                .map(|ideal| ideal.norm)
                .collect::<Vec<_>>(),
            values(&oracle["activeIdeals"]["packetNorms"])
        );
        let (subcount, permutation) = factor_base.subfactor_permutation(3);
        assert_eq!(subcount, 4);
        assert_eq!(
            permutation,
            values(&oracle["activeIdeals"]["searchPermutation"])
                .into_iter()
                .map(|value| value as usize)
                .collect::<Vec<_>>()
        );
        let (cache, generators) = h1_initial_cache(&factor_base);
        assert_eq!(
            cache.basis(),
            values(&checkpoint["oracleOnly"]["initialRelationCache"]["basis"])
        );
        assert_eq!(
            cache.records(),
            values(&checkpoint["oracleOnly"]["initialRelationCache"]["records"])
        );
        assert_eq!(
            cache
                .first_nonzero_hints()
                .iter()
                .map(|value| *value as i64)
                .collect::<Vec<_>>(),
            values(&checkpoint["oracleOnly"]["initialRelationCache"]["hashes"])
        );
        assert_eq!(
            cache.metadata(),
            values(&checkpoint["oracleOnly"]["initialRelationCache"]["metadata"])
        );
        assert_eq!(
            generators,
            values(&checkpoint["oracleOnly"]["initialRelationCache"]["generators"])
        );
    }

    #[test]
    fn bounded_residue_multiply_add_matches_i128_and_falls_back_at_boundary() {
        for prime in [2, 3, 9_196, 3_037_000_499, 3_037_000_500] {
            let maximum = prime - 1;
            assert_eq!(
                residue_mul_add(maximum, maximum, maximum, prime),
                mod_i64(
                    i128::from(maximum) * i128::from(maximum) + i128::from(maximum),
                    prime,
                )
            );
        }
        for (prime, uses_fast_path) in [(3_037_000_500, true), (3_037_000_501, false)] {
            let maximum = prime - 1;
            assert_eq!(maximum <= (i64::MAX - maximum) / maximum, uses_fast_path);
            // Modulo p this is (-2)*(-3)+(-4) = 2.  Unlike the maximum-only
            // boundary check above, it detects a wrong arithmetic result.
            assert_eq!(residue_mul_add(prime - 2, prime - 3, prime - 4, prime), 2);
            assert_eq!(
                residue_mul_add(prime - 2, prime - 3, prime - 4, prime),
                mod_i64(
                    i128::from(prime - 2) * i128::from(prime - 3) + i128::from(prime - 4),
                    prime,
                )
            );
        }
    }

    #[test]
    fn nth_ideal_floor_promotes_both_default_bounds() {
        let complex = prepared_cubic_factor_base([-1, -1, 0, 1], [1, 0, 0, -1, 0, 1, 0, 1, 0]);
        assert_eq!((complex.relation_bound, complex.checking_bound), (11, 11));

        let totally_real =
            prepared_cubic_factor_base([1, -2, -1, 1], [1, 0, 0, 0, 1, 0, -1, -1, 1]);
        assert_eq!(
            (totally_real.relation_bound, totally_real.checking_bound),
            (13, 13)
        );
    }
}
