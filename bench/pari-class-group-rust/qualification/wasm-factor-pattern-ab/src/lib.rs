//! Isolated browser A/B for the prepared-cubic factor-pattern hot loop.
//!
//! `baseline` freezes the original i128 residue kernel locally. `bounded-i64`
//! repeats exactly the same prime scan and factor serialization with a local
//! candidate kernel whose intermediate bounds are checked before the fast path
//! is used. Neither side imports the changing production implementation.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::alloc::{Layout, alloc, dealloc};

const MAX_INPUT_BYTES: usize = 4096;
const MAX_BOUND: usize = 100_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema: String,
    mode: String,
    polynomial_ascending: [i64; 4],
    bound: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultDocument {
    schema: &'static str,
    status: &'static str,
    mode: String,
    bound: usize,
    rational_prime_count: usize,
    factor_count: usize,
    digest_sha256: String,
}

#[derive(Serialize)]
struct ErrorDocument {
    schema: &'static str,
    status: &'static str,
    error: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Factor {
    coefficients: Vec<i64>,
    exponent: usize,
}

fn rational_primes_through(limit: usize) -> Vec<i64> {
    let mut sieve = vec![true; limit + 1];
    sieve[0] = false;
    if limit >= 1 {
        sieve[1] = false;
    }
    let mut prime = 2;
    while prime * prime <= limit {
        if sieve[prime] {
            for multiple in (prime * prime..=limit).step_by(prime) {
                sieve[multiple] = false;
            }
        }
        prime += 1;
    }
    sieve
        .into_iter()
        .enumerate()
        .filter_map(|(value, is_prime)| is_prime.then_some(value as i64))
        .collect()
}

#[inline]
fn mod_i128(value: i128, prime: i64) -> i64 {
    value.rem_euclid(i128::from(prime)) as i64
}

fn evaluate_mod_i128(polynomial: &[i64], value: i64, prime: i64) -> i64 {
    polynomial.iter().rev().fold(0_i64, |answer, coefficient| {
        mod_i128(
            i128::from(answer) * i128::from(value) + i128::from(*coefficient),
            prime,
        )
    })
}

fn divide_linear_i128(polynomial: &[i64], root: i64, prime: i64) -> Vec<i64> {
    let degree = polynomial.len() - 1;
    let mut quotient = vec![0_i64; degree];
    quotient[degree - 1] = polynomial[degree];
    for index in (1..degree).rev() {
        quotient[index - 1] = mod_i128(
            i128::from(polynomial[index]) + i128::from(root) * i128::from(quotient[index]),
            prime,
        );
    }
    debug_assert_eq!(evaluate_mod_i128(polynomial, root, prime), 0);
    quotient
}

fn factor_cubic_i128(polynomial: [i64; 4], prime: i64) -> Vec<Factor> {
    let mut remaining: Vec<i64> = polynomial
        .into_iter()
        .map(|coefficient| coefficient.rem_euclid(prime))
        .collect();
    let mut factors = Vec::new();
    for root in 0..prime {
        if remaining.len() <= 1 || evaluate_mod_i128(&remaining, root, prime) != 0 {
            continue;
        }
        let mut exponent = 0;
        while remaining.len() > 1 && evaluate_mod_i128(&remaining, root, prime) == 0 {
            remaining = divide_linear_i128(&remaining, root, prime);
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

fn bounded_modulus_supported(prime: i64) -> bool {
    // Every fast-path operand is in [0,p).  The largest expression is
    // `a*b+c`, at most `(p-1)^2+(p-1)`.  This explicit division form avoids
    // overflowing the proof check itself.
    prime >= 2 && prime - 1 <= (i64::MAX - (prime - 1)) / (prime - 1)
}

#[inline]
fn mod_i64_bounded(value: i64, prime: i64) -> i64 {
    value.rem_euclid(prime)
}

fn evaluate_mod_bounded(polynomial: &[i64], value: i64, prime: i64) -> i64 {
    debug_assert!(bounded_modulus_supported(prime));
    polynomial.iter().rev().fold(0_i64, |answer, coefficient| {
        debug_assert!((0..prime).contains(&answer));
        debug_assert!((0..prime).contains(coefficient));
        mod_i64_bounded(answer * value + coefficient, prime)
    })
}

fn divide_linear_bounded(polynomial: &[i64], root: i64, prime: i64) -> Vec<i64> {
    debug_assert!(bounded_modulus_supported(prime));
    let degree = polynomial.len() - 1;
    let mut quotient = vec![0_i64; degree];
    quotient[degree - 1] = polynomial[degree];
    for index in (1..degree).rev() {
        quotient[index - 1] = mod_i64_bounded(polynomial[index] + root * quotient[index], prime);
    }
    debug_assert_eq!(evaluate_mod_bounded(polynomial, root, prime), 0);
    quotient
}

fn factor_cubic_bounded(polynomial: [i64; 4], prime: i64) -> Vec<Factor> {
    if !bounded_modulus_supported(prime) {
        return factor_cubic_i128(polynomial, prime);
    }
    let mut remaining: Vec<i64> = polynomial
        .into_iter()
        .map(|coefficient| coefficient.rem_euclid(prime))
        .collect();
    let mut factors = Vec::new();
    for root in 0..prime {
        if remaining.len() <= 1 || evaluate_mod_bounded(&remaining, root, prime) != 0 {
            continue;
        }
        let mut exponent = 0;
        while remaining.len() > 1 && evaluate_mod_bounded(&remaining, root, prime) == 0 {
            remaining = divide_linear_bounded(&remaining, root, prime);
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

fn run(source: &str) -> Result<ResultDocument, String> {
    let request: Request = serde_json::from_str(source).map_err(|error| error.to_string())?;
    if request.schema != "sagejs.rust-class-group/factor-pattern-ab-request-v1" {
        return Err("unsupported request schema".into());
    }
    if request.bound < 2 || request.bound > MAX_BOUND {
        return Err("bound outside qualification envelope".into());
    }
    if request.polynomial_ascending[3] != 1 {
        return Err("qualification polynomial must be monic cubic".into());
    }
    if request.mode != "baseline" && request.mode != "bounded-i64" {
        return Err("mode must be baseline or bounded-i64".into());
    }

    let primes = rational_primes_through(request.bound);
    let mut factor_count = 0;
    let mut hash = Sha256::new();
    hash.update(b"sagejs.factor-pattern-ab/v1\0");
    for prime in &primes {
        let factors = if request.mode == "baseline" {
            factor_cubic_i128(request.polynomial_ascending, *prime)
        } else {
            factor_cubic_bounded(request.polynomial_ascending, *prime)
        };
        hash.update(prime.to_le_bytes());
        hash.update((factors.len() as u64).to_le_bytes());
        factor_count += factors.len();
        for factor in factors {
            hash.update((factor.coefficients.len() as u64).to_le_bytes());
            for coefficient in factor.coefficients {
                hash.update(coefficient.to_le_bytes());
            }
            hash.update((factor.exponent as u64).to_le_bytes());
        }
    }
    Ok(ResultDocument {
        schema: "sagejs.rust-class-group/factor-pattern-ab-result-v1",
        status: "pass",
        mode: request.mode,
        bound: request.bound,
        rational_prime_count: primes.len(),
        factor_count,
        digest_sha256: format!("{:x}", hash.finalize()),
    })
}

fn encode(source: &str) -> Vec<u8> {
    match run(source) {
        Ok(result) => serde_json::to_vec(&result).expect("result serialization"),
        Err(error) => serde_json::to_vec(&ErrorDocument {
            schema: "sagejs.rust-class-group/factor-pattern-ab-result-v1",
            status: "error",
            error,
        })
        .expect("error serialization"),
    }
}

/// Execute one A/B request without crossing the Wasm allocation ABI.
pub fn run_factor_pattern_ab_json(source: &str) -> String {
    String::from_utf8(encode(source)).expect("JSON output is UTF-8")
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_abi_version() -> i32 {
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_alloc(length: u32) -> u32 {
    let length = length as usize;
    if length == 0 || length > MAX_INPUT_BYTES {
        return 0;
    }
    let layout = Layout::array::<u8>(length).expect("bounded layout");
    unsafe { alloc(layout) as u32 }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_dealloc(pointer: u32, length: u32) {
    if pointer == 0 || length == 0 {
        return;
    }
    if let Ok(layout) = Layout::array::<u8>(length as usize) {
        unsafe { dealloc(pointer as *mut u8, layout) }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_run_json(pointer: u32, length: u32) -> u64 {
    if pointer == 0 || length == 0 || length as usize > MAX_INPUT_BYTES {
        return 0;
    }
    let input = unsafe { std::slice::from_raw_parts(pointer as *const u8, length as usize) };
    let source = match std::str::from_utf8(input) {
        Ok(source) => source,
        Err(error) => return pack(encode(&format!("invalid UTF-8: {error}"))),
    };
    pack(encode(source))
}

fn pack(bytes: Vec<u8>) -> u64 {
    if bytes.is_empty() || bytes.len() > MAX_INPUT_BYTES {
        return 0;
    }
    let mut bytes = bytes.into_boxed_slice();
    let pointer = bytes.as_mut_ptr() as u32;
    let length = bytes.len() as u32;
    std::mem::forget(bytes);
    (u64::from(length) << 32) | u64::from(pointer)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROW6: [i64; 4] = [2_000_000_000_018, -2_000_000_000_010, 0, 1];

    #[test]
    fn proved_bound_accepts_the_qualification_envelope_and_rejects_overflow() {
        assert!(bounded_modulus_supported(MAX_BOUND as i64));
        assert!(bounded_modulus_supported(3_037_000_499));
        assert!(bounded_modulus_supported(3_037_000_500));
        assert!(!bounded_modulus_supported(3_037_000_501));
        assert!(!bounded_modulus_supported(1));
        assert!(!bounded_modulus_supported(-7));
        for (prime, supported) in [(3_037_000_500, true), (3_037_000_501, false)] {
            assert_eq!(bounded_modulus_supported(prime), supported);
            let baseline = mod_i128(
                i128::from(prime - 2) * i128::from(prime - 3) + i128::from(prime - 4),
                prime,
            );
            let candidate = if supported {
                mod_i64_bounded((prime - 2) * (prime - 3) + (prime - 4), prime)
            } else {
                baseline
            };
            assert_eq!(baseline, 2);
            assert_eq!(candidate, baseline);
        }
    }

    #[test]
    fn bounded_kernel_matches_production_for_row6_and_boundary_coefficients() {
        for polynomial in [ROW6, [i64::MIN, i64::MAX, -1, 1], [0, 0, 0, 1]] {
            for prime in rational_primes_through(9_196) {
                let baseline = factor_cubic_i128(polynomial, prime)
                    .into_iter()
                    .map(|factor| (factor.coefficients, factor.exponent))
                    .collect::<Vec<_>>();
                let candidate = factor_cubic_bounded(polynomial, prime)
                    .into_iter()
                    .map(|factor| (factor.coefficients, factor.exponent))
                    .collect::<Vec<_>>();
                assert_eq!(candidate, baseline, "p={prime}, polynomial={polynomial:?}");
            }
            for prime in [99_991, 99_989] {
                let baseline = factor_cubic_i128(polynomial, prime)
                    .into_iter()
                    .map(|factor| (factor.coefficients, factor.exponent))
                    .collect::<Vec<_>>();
                let candidate = factor_cubic_bounded(polynomial, prime)
                    .into_iter()
                    .map(|factor| (factor.coefficients, factor.exponent))
                    .collect::<Vec<_>>();
                assert_eq!(candidate, baseline, "p={prime}, polynomial={polynomial:?}");
            }
        }
    }

    #[test]
    fn request_modes_have_identical_exact_digest() {
        let request = |mode: &str| {
            format!(
                "{{\"schema\":\"sagejs.rust-class-group/factor-pattern-ab-request-v1\",\"mode\":\"{mode}\",\"polynomialAscending\":[2000000000018,-2000000000010,0,1],\"bound\":9196}}"
            )
        };
        let baseline = run(&request("baseline")).unwrap();
        let candidate = run(&request("bounded-i64")).unwrap();
        eprintln!(
            "primes={} factors={} digest={}",
            baseline.rational_prime_count, baseline.factor_count, baseline.digest_sha256
        );
        assert_eq!(baseline.digest_sha256, candidate.digest_sha256);
        assert_eq!(baseline.factor_count, candidate.factor_count);
        assert_eq!(
            baseline.rational_prime_count,
            candidate.rational_prime_count
        );
    }

    #[test]
    fn malformed_and_counterfeit_requests_fail_closed() {
        assert!(run("{}").is_err());
        let oversized = "{\"schema\":\"sagejs.rust-class-group/factor-pattern-ab-request-v1\",\"mode\":\"bounded-i64\",\"polynomialAscending\":[0,0,0,1],\"bound\":100001}";
        assert!(run(oversized).is_err());
        let nonmonic = "{\"schema\":\"sagejs.rust-class-group/factor-pattern-ab-request-v1\",\"mode\":\"bounded-i64\",\"polynomialAscending\":[0,0,0,2],\"bound\":9196}";
        assert!(run(nonmonic).is_err());
    }
}
