// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Exact H1 cubic norms and PARI 2.17.4 rational smoothness admission.
//!
//! This module stops at rational-prime factorization.  Prime-ideal valuations
//! and relation-cache insertion are separate stages.  The cubic norm path is
//! checked `i128`; the only arbitrary-precision values are PARI's prepared
//! prime products and the smoothness GCD loop.

use rug::Integer;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AdmissionError {
    InvalidPreparedCubic,
    ArithmeticOverflow,
    NonintegralNormQuotient,
    InvalidPrimeCatalog,
    FactorOrder,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RationalFactor {
    pub prime: u64,
    pub exponent: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FactorOutcome {
    Nonsmooth,
    Unresolved(Integer),
    Factored(Vec<RationalFactor>),
}

/// Coefficients of the exact homogeneous cubic norm polynomial
///
/// ```text
/// x^3 + a*y^3 + b*z^3 + c*x^2*y + d*x^2*z
///     + e*x*y^2 + f*x*z^2 + g*y^2*z + h*y*z^2 + i*x*y*z.
/// ```
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CubicNormForm {
    coefficients: [i128; 9],
}

fn checked_add(left: i128, right: i128) -> Result<i128, AdmissionError> {
    left.checked_add(right)
        .ok_or(AdmissionError::ArithmeticOverflow)
}

fn checked_sub(left: i128, right: i128) -> Result<i128, AdmissionError> {
    left.checked_sub(right)
        .ok_or(AdmissionError::ArithmeticOverflow)
}

fn checked_mul(left: i128, right: i128) -> Result<i128, AdmissionError> {
    left.checked_mul(right)
        .ok_or(AdmissionError::ArithmeticOverflow)
}

fn checked_sum(terms: impl IntoIterator<Item = i128>) -> Result<i128, AdmissionError> {
    terms.into_iter().try_fold(0_i128, checked_add)
}

fn determinant3(matrix: &[i128; 9]) -> Result<i128, AdmissionError> {
    let positive = checked_sum([
        checked_mul(matrix[0], checked_mul(matrix[4], matrix[8])?)?,
        checked_mul(matrix[3], checked_mul(matrix[7], matrix[2])?)?,
        checked_mul(matrix[6], checked_mul(matrix[1], matrix[5])?)?,
    ])?;
    let negative = checked_sum([
        checked_mul(matrix[6], checked_mul(matrix[4], matrix[2])?)?,
        checked_mul(matrix[3], checked_mul(matrix[1], matrix[8])?)?,
        checked_mul(matrix[0], checked_mul(matrix[7], matrix[5])?)?,
    ])?;
    checked_sub(positive, negative)
}

fn direct_cubic_norm(
    polynomial: [i64; 4],
    basis: [i64; 9],
    coordinates: [i64; 3],
) -> Result<i128, AdmissionError> {
    if polynomial[3] != 1 || basis[..3] != [1, 0, 0] {
        return Err(AdmissionError::InvalidPreparedCubic);
    }
    let mut element = [0_i128; 3];
    for basis_column in 0..3 {
        for degree in 0..3 {
            let term = checked_mul(
                i128::from(coordinates[basis_column]),
                i128::from(basis[basis_column * 3 + degree]),
            )?;
            element[degree] = checked_add(element[degree], term)?;
        }
    }
    // Multiplication by the element, with columns expressed in the power
    // basis.  Its determinant is basis-independent and equals the field norm.
    let mut multiplication = [0_i128; 9];
    for column in 0..3 {
        let mut product = [0_i128; 5];
        product[column..column + 3].copy_from_slice(&element);
        for degree in (3..=4).rev() {
            let leading = product[degree];
            if leading == 0 {
                continue;
            }
            for lower in 0..3 {
                let correction = checked_mul(leading, i128::from(polynomial[lower]))?;
                product[degree - 3 + lower] = checked_sub(product[degree - 3 + lower], correction)?;
            }
        }
        for row in 0..3 {
            multiplication[column * 3 + row] = product[row];
        }
    }
    determinant3(&multiplication)
}

impl CubicNormForm {
    /// Recover the exact norm form from a monic cubic and a prepared integral
    /// basis.  This follows the translated nine-sample polarization, but the
    /// samples themselves are exact multiplication determinants rather than
    /// rounded embeddings.
    pub fn from_prepared_basis(
        polynomial: [i64; 4],
        basis: [i64; 9],
    ) -> Result<Self, AdmissionError> {
        let norm = |coordinates| direct_cubic_norm(polynomial, basis, coordinates);
        let n100 = norm([1, 0, 0])?;
        if n100 != 1 {
            return Err(AdmissionError::InvalidPreparedCubic);
        }
        let n010 = norm([0, 1, 0])?;
        let n001 = norm([0, 0, 1])?;
        let n110 = norm([1, 1, 0])?;
        let n1n10 = norm([1, -1, 0])?;
        let n101 = norm([1, 0, 1])?;
        let n10n1 = norm([1, 0, -1])?;
        let n011 = norm([0, 1, 1])?;
        let n01n1 = norm([0, 1, -1])?;
        let n111 = norm([1, 1, 1])?;

        let c_plus_e = checked_sub(checked_sub(n110, n100)?, n010)?;
        let minus_c_plus_e = checked_add(checked_sub(n1n10, n100)?, n010)?;
        let c_numerator = checked_sub(c_plus_e, minus_c_plus_e)?;
        let e_numerator = checked_add(c_plus_e, minus_c_plus_e)?;
        let d_plus_f = checked_sub(checked_sub(n101, n100)?, n001)?;
        let minus_d_plus_f = checked_add(checked_sub(n10n1, n100)?, n001)?;
        let d_numerator = checked_sub(d_plus_f, minus_d_plus_f)?;
        let f_numerator = checked_add(d_plus_f, minus_d_plus_f)?;
        let g_plus_h = checked_sub(checked_sub(n011, n010)?, n001)?;
        // N(0, 1, -1) = N(e2) - N(e3) - g + h.
        let minus_g_plus_h = checked_add(checked_sub(n01n1, n010)?, n001)?;
        let g_numerator = checked_sub(g_plus_h, minus_g_plus_h)?;
        let h_numerator = checked_add(g_plus_h, minus_g_plus_h)?;
        if [
            c_numerator,
            e_numerator,
            d_numerator,
            f_numerator,
            g_numerator,
            h_numerator,
        ]
        .iter()
        .any(|value| value % 2 != 0)
        {
            return Err(AdmissionError::InvalidPreparedCubic);
        }
        let c = c_numerator / 2;
        let e = e_numerator / 2;
        let d = d_numerator / 2;
        let f = f_numerator / 2;
        let g = g_numerator / 2;
        let h = h_numerator / 2;
        let mixed = checked_sub(
            checked_sub(checked_sub(checked_sub(n111, n100)?, n010)?, n001)?,
            checked_sum([c, d, e, f, g, h])?,
        )?;
        Ok(Self {
            coefficients: [n010, n001, c, d, e, f, g, h, mixed],
        })
    }

    pub fn coefficients(&self) -> &[i128; 9] {
        &self.coefficients
    }

    pub fn norm(&self, coordinates: [i64; 3]) -> Result<i128, AdmissionError> {
        let [x, y, z] = coordinates.map(i128::from);
        let [a, b, c, d, e, f, g, h, i] = self.coefficients;
        checked_sum([
            checked_mul(checked_mul(x, x)?, x)?,
            checked_mul(a, checked_mul(checked_mul(y, y)?, y)?)?,
            checked_mul(b, checked_mul(checked_mul(z, z)?, z)?)?,
            checked_mul(c, checked_mul(checked_mul(x, x)?, y)?)?,
            checked_mul(d, checked_mul(checked_mul(x, x)?, z)?)?,
            checked_mul(e, checked_mul(x, checked_mul(y, y)?)?)?,
            checked_mul(f, checked_mul(x, checked_mul(z, z)?)?)?,
            checked_mul(g, checked_mul(checked_mul(y, y)?, z)?)?,
            checked_mul(h, checked_mul(y, checked_mul(z, z)?)?)?,
            checked_mul(i, checked_mul(checked_mul(x, y)?, z)?)?,
        ])
    }

    pub fn quotient_norm(
        &self,
        coordinates: [i64; 3],
        ideal_norm: i128,
    ) -> Result<i128, AdmissionError> {
        if ideal_norm <= 0 {
            return Err(AdmissionError::NonintegralNormQuotient);
        }
        let norm = self.norm(coordinates)?;
        if norm % ideal_norm != 0 {
            return Err(AdmissionError::NonintegralNormQuotient);
        }
        Ok(norm / ideal_norm)
    }
}

#[cfg(test)]
mod generic_cubic_tests {
    use super::*;

    #[test]
    fn mixed_yz_polarization_matches_a_nontrivial_class_number_two_field() {
        let form =
            CubicNormForm::from_prepared_basis([-29, -30, -8, 1], [1, 0, 0, -3, 1, 0, -17, -9, 1])
                .unwrap();
        assert_eq!(
            form.coefficients(),
            &[164, 304, -1, 1, -51, 48, 145, 548, -65]
        );
        assert_eq!(form.norm([-11, -7, 9]).unwrap(), -141_126);
    }
}

pub fn primes_through(limit: usize) -> Vec<u64> {
    if limit < 2 {
        return Vec::new();
    }
    let mut composite = vec![false; limit + 1];
    let mut primes = Vec::new();
    for value in 2..=limit {
        if composite[value] {
            continue;
        }
        primes.push(value as u64);
        if value <= limit / value {
            for multiple in (value * value..=limit).step_by(value) {
                composite[multiple] = true;
            }
        }
    }
    primes
}

/// Construct PARI's cumulative `prodprimes()` blocks at 256, 512, ..., M.
pub fn cumulative_prime_products(
    primes: &[u64],
    factor_limit: u64,
) -> Result<Vec<Integer>, AdmissionError> {
    if primes.first() != Some(&2) || primes.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err(AdmissionError::InvalidPrimeCatalog);
    }
    let maximum = primes.last().copied().unwrap_or(0).min(factor_limit);
    let odd_primes = &primes[1..primes.partition_point(|prime| *prime <= maximum)];
    if odd_primes.is_empty() {
        return Ok(Vec::new());
    }
    // This is a literal indexing translation of `set_prodprimes`: when a
    // prime reaches the next power-of-two boundary, close the preceding run;
    // on the last prime, close a final run which includes that prime.  The
    // latter distinction matters at the default maximum 65537: there is one
    // final [32771, 65537] run, not separate 65536 and 65537 runs.
    let mut products = Vec::new();
    let mut product = Integer::from(1);
    let mut run_start = 0_usize;
    let mut boundary = 256_u64;
    for (index, &prime) in odd_primes.iter().enumerate() {
        let last = index + 1 == odd_primes.len();
        if last || prime >= boundary {
            let run_end = if last { index + 1 } else { index };
            for &run_prime in &odd_primes[run_start..run_end] {
                product *= run_prime;
            }
            products.push(product.clone());
            run_start = index;
            boundary = boundary.saturating_mul(2).min(maximum);
        }
    }
    Ok(products)
}

fn prime_to_part(value: &Integer, factor_product: &Integer) -> Result<Integer, AdmissionError> {
    if value == &0 || factor_product <= &0 {
        return Err(AdmissionError::InvalidPrimeCatalog);
    }
    let mut remainder = value.clone().abs();
    let mut divisor = factor_product.clone();
    loop {
        divisor.gcd_mut(&remainder);
        if divisor == 1 {
            return Ok(remainder);
        }
        remainder /= &divisor;
    }
}

fn append_factor(
    factors: &mut Vec<RationalFactor>,
    prime: u64,
    exponent: u32,
) -> Result<(), AdmissionError> {
    if exponent == 0 || factors.last().is_some_and(|factor| factor.prime >= prime) {
        return Err(AdmissionError::FactorOrder);
    }
    factors.push(RationalFactor { prime, exponent });
    Ok(())
}

fn catalog_contains(primes: &[u64], value: u64) -> bool {
    primes.binary_search(&value).is_ok()
}

fn integer_sqrt(value: u64) -> u64 {
    if value < 2 {
        return value;
    }
    let mut answer = 1_u64 << ((64 - value.leading_zeros() as u64 + 1) / 2);
    loop {
        let next = (answer + value / answer) / 2;
        if next >= answer {
            return answer;
        }
        answer = next;
    }
}

fn trial_bound_word(value: u64) -> u64 {
    let exponent = 63 - value.leading_zeros();
    match exponent {
        0..=29 => 1 << 12,
        30..=33 => 1 << 13,
        34..=36 => 1 << 14,
        37..=41 => 1 << 15,
        42..=46 => 1 << 16,
        47..=55 => 1 << 17,
        56..=61 => 1 << 19,
        _ => 1 << 18,
    }
}

fn mod_pow(mut base: u64, mut exponent: u64, modulus: u64) -> u64 {
    let mut answer = 1_u64;
    base %= modulus;
    while exponent != 0 {
        if exponent & 1 != 0 {
            answer = (u128::from(answer) * u128::from(base) % u128::from(modulus)) as u64;
        }
        exponent >>= 1;
        if exponent != 0 {
            base = (u128::from(base) * u128::from(base) % u128::from(modulus)) as u64;
        }
    }
    answer
}

fn strong_pseudoprime(base: u64, value: u64) -> bool {
    let base = base % value;
    if base == 0 {
        return true;
    }
    let exponent = (value - 1).trailing_zeros();
    let odd_part = (value - 1) >> exponent;
    let mut witness = mod_pow(base, odd_part, value);
    if witness == 1 || witness == value - 1 {
        return true;
    }
    for _ in 1..exponent {
        witness = (u128::from(witness) * u128::from(witness) % u128::from(value)) as u64;
        if witness == value - 1 {
            return true;
        }
    }
    false
}

fn kronecker_odd(mut x: u64, mut y: u64) -> i8 {
    let mut sign = 1_i8;
    while x != 0 {
        let exponent = x.trailing_zeros();
        x >>= exponent;
        if exponent & 1 != 0 && (y % 8 == 3 || y % 8 == 5) {
            sign = -sign;
        }
        if x % 4 == 3 && y % 4 == 3 {
            sign = -sign;
        }
        (x, y) = (y % x, x);
    }
    if y == 1 { sign } else { 0 }
}

fn lucas_pseudoprime(value: u64) -> bool {
    if value == u64::MAX {
        return false;
    }
    let mut b = 3_u64;
    let mut attempts = 0_u32;
    loop {
        let discriminant = b * b - 4;
        if kronecker_odd(value % discriminant, discriminant) < 0 {
            break;
        }
        if attempts == 64 {
            let root = integer_sqrt(value);
            if root * root == value {
                return false;
            }
        }
        b += 2;
        attempts += 1;
    }
    let exponent = (value + 1).trailing_zeros();
    let odd_part = (value + 1) >> exponent;
    let mut current = b;
    let mut next = (u128::from(b) * u128::from(b) - 2) as u64 % value;
    for bit in (0..63 - odd_part.leading_zeros()).rev() {
        if odd_part >> bit & 1 != 0 {
            current = ((u128::from(current) * u128::from(next) + u128::from(value) - u128::from(b))
                % u128::from(value)) as u64;
            next = ((u128::from(next) * u128::from(next) + u128::from(value) - 2)
                % u128::from(value)) as u64;
        } else {
            next = ((u128::from(current) * u128::from(next) + u128::from(value) - u128::from(b))
                % u128::from(value)) as u64;
            current = ((u128::from(current) * u128::from(current) + u128::from(value) - 2)
                % u128::from(value)) as u64;
        }
    }
    if current == 2 || current == value - 2 {
        return true;
    }
    for _ in 1..exponent {
        if current == 0 {
            return true;
        }
        current = ((u128::from(current) * u128::from(current) + u128::from(value) - 2)
            % u128::from(value)) as u64;
        if current == 2 {
            return false;
        }
    }
    false
}

fn word_prime_core(value: u64) -> bool {
    if value < 341_531 {
        return strong_pseudoprime(9_345_883_071_009_581_737, value);
    }
    if value < 1_050_535_501 {
        return strong_pseudoprime(336_781_006_125, value)
            && strong_pseudoprime(9_639_812_373_923_915, value);
    }
    if value < 350_269_456_337 {
        return strong_pseudoprime(4_230_279_247_111_683_200, value)
            && strong_pseudoprime(14_694_767_155_120_705_706, value)
            && strong_pseudoprime(16_641_139_526_367_750_375, value);
    }
    strong_pseudoprime(2, value) && lucas_pseudoprime(value)
}

fn word_prime(value: u64, primes: &[u64], prime_limit: u64, no_small: bool) -> bool {
    if value % 2 == 0 {
        return value == 2;
    }
    if value <= prime_limit {
        return catalog_contains(primes, value);
    }
    if no_small {
        if value < 1_016_801 {
            return value < 452_929 || strong_pseudoprime(2, value);
        }
    } else if [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41]
        .iter()
        .any(|prime| value % prime == 0)
    {
        return false;
    }
    word_prime_core(value)
}

fn factor_from_catalog(
    mut value: Integer,
    primes: &[u64],
) -> Result<(Vec<RationalFactor>, Integer), AdmissionError> {
    let mut factors = Vec::new();
    for &prime in primes {
        if prime < 2 {
            return Err(AdmissionError::InvalidPrimeCatalog);
        }
        let mut exponent = 0_u32;
        while value.is_divisible_u(prime as u32) {
            value /= prime;
            exponent += 1;
        }
        if exponent != 0 {
            append_factor(&mut factors, prime, exponent)?;
        }
        if value == 1 {
            break;
        }
    }
    Ok((factors, value))
}

fn complete_word_from_catalog(
    mut value: u64,
    primes: &[u64],
    prime_limit: u64,
    factors: &mut Vec<RationalFactor>,
) -> Result<u64, AdmissionError> {
    let mut limit = integer_sqrt(value);
    if limit > prime_limit || primes.last().copied().unwrap_or(0) < limit {
        return Ok(value);
    }
    for &prime in primes.iter().skip(1) {
        if prime > limit {
            break;
        }
        let mut exponent = 0_u32;
        while value % prime == 0 {
            value /= prime;
            exponent += 1;
        }
        if exponent != 0 {
            append_factor(factors, prime, exponent)?;
            if value == 1 {
                return Ok(1);
            }
            limit = integer_sqrt(value);
        }
    }
    if value != 1 {
        append_factor(factors, value, 1)?;
    }
    Ok(1)
}

fn word_factor_front_inner(
    mut value: u64,
    primes: &[u64],
    products: &[Integer],
    factor_limit: u64,
    prime_limit: u64,
    factors: &mut Vec<RationalFactor>,
    fast: bool,
) -> Result<u64, AdmissionError> {
    if value == 1 {
        return Ok(1);
    }
    let exponent = value.trailing_zeros();
    if exponent != 0 {
        value >>= exponent;
        append_factor(factors, 2, exponent)?;
        if value == 1 {
            return Ok(1);
        }
    }
    let maximum_prime = primes
        .last()
        .copied()
        .ok_or(AdmissionError::InvalidPrimeCatalog)?;
    if value <= maximum_prime && catalog_contains(primes, value) {
        append_factor(factors, value, 1)?;
        return Ok(1);
    }
    let limit = integer_sqrt(value).min(trial_bound_word(value));
    if fast && limit >= 128 {
        let block = ((63 - limit.leading_zeros()) as usize).saturating_sub(6);
        let block = block.min(products.len());
        if block == 0 {
            return Err(AdmissionError::InvalidPrimeCatalog);
        }
        let residue = Integer::from(&products[block - 1] % value)
            .to_u64()
            .ok_or(AdmissionError::ArithmeticOverflow)?;
        let common = gcd_u64(value, residue);
        if common != 1 {
            let start = factors.len();
            let unresolved = word_factor_front_inner(
                common,
                primes,
                products,
                factor_limit,
                prime_limit,
                factors,
                false,
            )?;
            for factor in &mut factors[start..] {
                let mut full_exponent = 0_u32;
                while value % factor.prime == 0 {
                    value /= factor.prime;
                    full_exponent += 1;
                }
                factor.exponent = full_exponent;
            }
            if unresolved != 1 {
                return complete_word_from_catalog(value, primes, prime_limit, factors);
            }
            if value == 1 {
                return Ok(1);
            }
            if value <= maximum_prime && catalog_contains(primes, value) {
                append_factor(factors, value, 1)?;
                return Ok(1);
            }
        }
        if limit > factor_limit {
            return complete_word_from_catalog(value, primes, prime_limit, factors);
        }
        if word_prime(value, primes, prime_limit, limit >= 661) {
            append_factor(factors, value, 1)?;
            return Ok(1);
        }
        return complete_word_from_catalog(value, primes, prime_limit, factors);
    }

    let mut old_count = None;
    for &prime in primes.iter().skip(1) {
        if prime > limit {
            break;
        }
        if prime == 673 {
            if word_prime(value, primes, prime_limit, true) {
                append_factor(factors, value, 1)?;
                return Ok(1);
            }
            old_count = Some(factors.len());
        }
        let mut exponent = 0_u32;
        while value % prime == 0 {
            value /= prime;
            exponent += 1;
        }
        if exponent != 0 {
            append_factor(factors, prime, exponent)?;
        }
        if value / prime <= prime {
            if value != 1 {
                append_factor(factors, value, 1)?;
            }
            return Ok(1);
        }
    }
    if limit > prime_limit {
        return Ok(value);
    }
    if old_count != Some(factors.len()) && word_prime(value, primes, prime_limit, limit >= 661) {
        append_factor(factors, value, 1)?;
        return Ok(1);
    }
    Ok(value)
}

fn gcd_u64(mut left: u64, mut right: u64) -> u64 {
    while right != 0 {
        (left, right) = (right, left % right);
    }
    left
}

pub fn word_factor_front(
    value: u64,
    primes: &[u64],
    products: &[Integer],
    factor_limit: u64,
    prime_limit: u64,
    fast: bool,
) -> Result<(Vec<RationalFactor>, u64), AdmissionError> {
    if value == 0 || primes.first() != Some(&2) {
        return Err(AdmissionError::InvalidPrimeCatalog);
    }
    let mut factors = Vec::new();
    let residual = word_factor_front_inner(
        value,
        primes,
        products,
        factor_limit,
        prime_limit,
        &mut factors,
        fast,
    )?;
    Ok((factors, residual))
}

pub fn factor_norm(
    norm: i128,
    factor_product: &Integer,
    primes: &[u64],
    products: &[Integer],
    factor_limit: u64,
    prime_limit: u64,
) -> Result<FactorOutcome, AdmissionError> {
    let absolute = Integer::from(norm).abs();
    if absolute == 1 {
        return Ok(FactorOutcome::Factored(Vec::new()));
    }
    if absolute == 0 || prime_to_part(&absolute, factor_product)? != 1 {
        return Ok(FactorOutcome::Nonsmooth);
    }
    if absolute.significant_bits() > 64 {
        let (factors, residual) = factor_from_catalog(absolute, primes)?;
        return if residual == 1 {
            Ok(FactorOutcome::Factored(factors))
        } else {
            Ok(FactorOutcome::Unresolved(residual))
        };
    }
    let word = absolute
        .to_u64()
        .ok_or(AdmissionError::ArithmeticOverflow)?;
    let (factors, residual) =
        word_factor_front(word, primes, products, factor_limit, prime_limit, true)?;
    if residual == 1 {
        Ok(FactorOutcome::Factored(factors))
    } else {
        Ok(FactorOutcome::Unresolved(Integer::from(residual)))
    }
}
