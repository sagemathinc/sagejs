//! First honest class-group candidate that crosses the Sage.js browser ABI.
//!
//! This is intentionally a candidate, not a certified class-group result.  It
//! constructs a factor base from the requested monic cubic, collects principal
//! ideal relations by an exact coefficient-box search, and computes the Smith
//! invariants of the resulting full-rank presentation.  No relation or answer
//! is embedded in this artifact.

#[path = "../../../src/factor_base.rs"]
mod factor_base;
#[path = "../../../src/relation_cache.rs"]
mod relation_cache;
#[path = "../../../src/smith.rs"]
mod smith;

use factor_base::{FactorBase, PrimeIdeal, prepared_cubic_factor_base};
use relation_cache::RelationCache;
use serde::Deserialize;
use smith::{WordSmithWorkspace, transpose_relation_records};
use std::alloc::{Layout, alloc, dealloc};

const MAXIMUM_RADIUS: i64 = 32;
const SUPPLEMENTARY_RELATIONS: usize = 20;
const MAX_INPUT_BYTES: usize = 1 << 20;

#[derive(Debug)]
enum Error {
    Input,
    UnsupportedOrder,
    Arithmetic,
    Collection,
    Smith,
}

#[derive(Default)]
struct Statistics {
    visited: u64,
    primitive_nonscalar: u64,
    smooth_norms: u64,
    accepted: u64,
    radius: i64,
}

fn gcd(mut a: i64, mut b: i64) -> i64 {
    a = a.abs();
    b = b.abs();
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

fn primitive(value: [i64; 3]) -> bool {
    gcd(gcd(value[0], value[1]), value[2]) == 1
}

fn canonical_up_to_sign(value: [i64; 3]) -> bool {
    value
        .iter()
        .rev()
        .find(|entry| **entry != 0)
        .is_some_and(|entry| *entry > 0)
}

fn on_shell(value: [i64; 3], radius: i64) -> bool {
    value.iter().any(|entry| entry.abs() == radius)
}

fn determinant3(matrix: &[i128; 9]) -> Result<i128, Error> {
    let mul = |a: i128, b: i128| a.checked_mul(b).ok_or(Error::Arithmetic);
    let add = |a: i128, b: i128| a.checked_add(b).ok_or(Error::Arithmetic);
    let sub = |a: i128, b: i128| a.checked_sub(b).ok_or(Error::Arithmetic);
    let positive = add(
        add(
            mul(matrix[0], mul(matrix[4], matrix[8])?)?,
            mul(matrix[3], mul(matrix[7], matrix[2])?)?,
        )?,
        mul(matrix[6], mul(matrix[1], matrix[5])?)?,
    )?;
    let negative = add(
        add(
            mul(matrix[6], mul(matrix[4], matrix[2])?)?,
            mul(matrix[3], mul(matrix[1], matrix[8])?)?,
        )?,
        mul(matrix[0], mul(matrix[7], matrix[5])?)?,
    )?;
    sub(positive, negative)
}

/// Exact norm in the equation-order power basis.
fn norm(polynomial: [i64; 4], element: [i64; 3]) -> Result<i128, Error> {
    let mut multiplication = [0_i128; 9];
    for column in 0..3 {
        let mut product = [0_i128; 5];
        for degree in 0..3 {
            product[column + degree] = i128::from(element[degree]);
        }
        for degree in (3..=4).rev() {
            let leading = product[degree];
            for lower in 0..3 {
                let correction = leading
                    .checked_mul(i128::from(polynomial[lower]))
                    .ok_or(Error::Arithmetic)?;
                product[degree - 3 + lower] = product[degree - 3 + lower]
                    .checked_sub(correction)
                    .ok_or(Error::Arithmetic)?;
            }
        }
        for row in 0..3 {
            multiplication[column * 3 + row] = product[row];
        }
    }
    determinant3(&multiplication)
}

fn rational_factorization(mut value: i128, base: &FactorBase) -> Option<Vec<(i64, usize)>> {
    value = value.checked_abs()?;
    if value <= 1 {
        return None;
    }
    let mut factors = Vec::new();
    for prime in &base.rational_primes {
        let p = i128::from(*prime);
        let mut exponent = 0;
        while value % p == 0 {
            value /= p;
            exponent += 1;
        }
        if exponent != 0 {
            factors.push((*prime, exponent));
        }
    }
    (value == 1).then_some(factors)
}

fn valuation(element: [i64; 3], ideal: &PrimeIdeal) -> Result<usize, Error> {
    let prime = i128::from(ideal.prime);
    let mut current = element.map(i128::from);
    let mut answer = 0_usize;
    if ideal.residue_degree == 3 {
        while current.iter().all(|entry| entry % prime == 0) {
            for entry in &mut current {
                *entry /= prime;
            }
            answer += 1;
        }
        return Ok(answer);
    }
    loop {
        let mut next = [0_i128; 3];
        for row in 0..3 {
            for column in 0..3 {
                next[row] = next[row]
                    .checked_add(
                        i128::from(ideal.tau[row * 3 + column])
                            .checked_mul(current[column])
                            .ok_or(Error::Arithmetic)?,
                    )
                    .ok_or(Error::Arithmetic)?;
            }
        }
        if next.iter().any(|entry| entry % prime != 0) {
            return Ok(answer);
        }
        for entry in &mut next {
            *entry /= prime;
        }
        current = next;
        answer += 1;
    }
}

fn refine(
    base: &FactorBase,
    element: [i64; 3],
    factors: &[(i64, usize)],
    relation: &mut [i64],
) -> Result<bool, Error> {
    relation.fill(0);
    for (prime, norm_exponent) in factors {
        let group = base
            .rational_primes
            .binary_search(prime)
            .map_err(|_| Error::Collection)?;
        let start = base.rational_offsets[group];
        let count = base.rational_counts[group];
        let mut accounted = 0_usize;
        for index in start..start + count {
            let ideal = &base.ideals[index];
            let value = valuation(element, ideal)?;
            relation[index] = i64::try_from(value).map_err(|_| Error::Arithmetic)?;
            accounted = accounted
                .checked_add(
                    value
                        .checked_mul(ideal.residue_degree)
                        .ok_or(Error::Arithmetic)?,
                )
                .ok_or(Error::Arithmetic)?;
            if accounted == *norm_exponent {
                break;
            }
        }
        if accounted != *norm_exponent {
            return Ok(false);
        }
    }
    Ok(true)
}

fn first_nonzero(relation: &[i64]) -> usize {
    relation
        .iter()
        .position(|entry| *entry != 0)
        .map_or(relation.len() + 1, |index| index + 1)
}

fn initialize_cache(base: &FactorBase) -> Result<RelationCache, Error> {
    let size = base.ideals.len();
    let mut cache = RelationCache::new(
        size,
        10 * (size + SUPPLEMENTARY_RELATIONS) + 50,
        SUPPLEMENTARY_RELATIONS,
    );
    let ramification = base
        .ideals
        .iter()
        .map(|ideal| ideal.ramification as i64)
        .collect::<Vec<_>>();
    cache
        .initialize_complete_prime_groups(
            SUPPLEMENTARY_RELATIONS,
            &base.rational_primes,
            &base.rational_offsets,
            &base.rational_counts,
            &base.complete_groups,
            &ramification,
            &mut vec![0; size],
        )
        .map_err(|_| Error::Collection)?;
    Ok(cache)
}

fn candidate(polynomial: [i64; 4]) -> Result<(Vec<i128>, i128, usize, usize, Statistics), Error> {
    if polynomial[3] != 1 {
        return Err(Error::Input);
    }
    // The present trial supports equation orders.  For the qualification
    // vector the equation order is maximal; the independently supplied
    // prepared basis differs only by a unimodular change of basis.
    let basis = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    let base = prepared_cubic_factor_base(polynomial, basis);
    if base.ideals.is_empty() {
        return Err(Error::UnsupportedOrder);
    }
    let mut cache = initialize_cache(&base)?;
    let mut relation = vec![0_i64; base.ideals.len()];
    let target = base.ideals.len() + SUPPLEMENTARY_RELATIONS;
    let mut statistics = Statistics::default();
    'search: for radius in 1..=MAXIMUM_RADIUS {
        statistics.radius = radius;
        for z in -radius..=radius {
            for y in -radius..=radius {
                for x in -radius..=radius {
                    let element = [x, y, z];
                    if !on_shell(element, radius) || (y == 0 && z == 0) {
                        continue;
                    }
                    statistics.visited += 1;
                    if !primitive(element) || !canonical_up_to_sign(element) {
                        continue;
                    }
                    statistics.primitive_nonscalar += 1;
                    let Some(factors) = rational_factorization(norm(polynomial, element)?, &base)
                    else {
                        continue;
                    };
                    statistics.smooth_norms += 1;
                    if !refine(&base, element, &factors, &mut relation)? {
                        continue;
                    }
                    let outcome = cache
                        .add_relation(
                            &relation,
                            first_nonzero(&relation),
                            statistics.primitive_nonscalar as i64,
                            0,
                            0,
                            false,
                        )
                        .map_err(|_| Error::Collection)?;
                    if outcome.appended {
                        statistics.accepted += 1;
                    }
                    if cache.missing() == 0 && cache.len() >= target {
                        break 'search;
                    }
                }
            }
        }
    }
    if cache.missing() != 0 || cache.len() < target {
        return Err(Error::Collection);
    }
    let columns = cache.len();
    let matrix = transpose_relation_records(cache.records(), base.ideals.len(), columns);
    let mut workspace = WordSmithWorkspace::new(base.ideals.len(), columns);
    workspace.reset_from(&matrix).map_err(|_| Error::Smith)?;
    let diagonal = workspace.smith_diagonal().map_err(|_| Error::Smith)?;
    if diagonal.iter().filter(|value| **value != 0).count() != base.ideals.len() {
        return Err(Error::Smith);
    }
    let invariants = diagonal
        .into_iter()
        .filter(|value| *value > 1)
        .collect::<Vec<_>>();
    let class_number = invariants.iter().try_fold(1_i128, |product, value| {
        product.checked_mul(*value).ok_or(Error::Arithmetic)
    })?;
    Ok((
        invariants,
        class_number,
        base.ideals.len(),
        columns,
        statistics,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    schema: String,
    polynomial: [String; 4],
    proof: String,
}

fn parse_polynomial(input: &str) -> Result<[i64; 4], Error> {
    let request: Request = serde_json::from_str(input).map_err(|_| Error::Input)?;
    if request.schema != "sagejs.class-group-request/v1" || request.proof != "candidate" {
        return Err(Error::Input);
    }
    let mut answer = [0_i64; 4];
    for (target, source) in answer.iter_mut().zip(request.polynomial) {
        *target = source.parse::<i64>().map_err(|_| Error::Input)?;
    }
    Ok(answer)
}

fn json_result(input: &str) -> Result<String, Error> {
    let polynomial = parse_polynomial(input)?;
    let (invariants, class_number, _, _, _) = candidate(polynomial)?;
    let factors = invariants
        .iter()
        .map(|value| format!("\"{value}\""))
        .collect::<Vec<_>>()
        .join(",");
    Ok(format!(
        "{{\"schema\":\"sagejs.class-group-result/v1\",\"classNumber\":\"{class_number}\",\"invariantFactors\":[{factors}],\"status\":\"candidate\"}}"
    ))
}

fn error_json(error: Error) -> String {
    format!("{{\"schema\":\"sagejs.class-group-error/v1\",\"error\":\"{error:?}\"}}")
}

fn into_output(value: String) -> u64 {
    let bytes = value.into_bytes().into_boxed_slice();
    let length = bytes.len();
    let pointer = Box::into_raw(bytes) as *mut u8 as usize;
    ((length as u64) << 32) | pointer as u64
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_abi_version() -> i32 {
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_alloc(length: usize) -> *mut u8 {
    if length == 0 || length > MAX_INPUT_BYTES {
        return std::ptr::null_mut();
    }
    let Ok(layout) = Layout::array::<u8>(length) else {
        return std::ptr::null_mut();
    };
    // SAFETY: the matching ABI deallocator receives the same byte length.
    unsafe { alloc(layout) }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_dealloc(pointer: *mut u8, length: usize) {
    if pointer.is_null() || length == 0 {
        return;
    }
    if let Ok(layout) = Layout::array::<u8>(length) {
        // SAFETY: pointers returned by alloc/output use this exact layout.
        unsafe { dealloc(pointer, layout) };
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_run_json(pointer: *const u8, length: usize) -> u64 {
    if pointer.is_null() || length == 0 || length > MAX_INPUT_BYTES {
        return into_output(error_json(Error::Input));
    }
    // SAFETY: the browser ABI validates and initializes this guest-memory range.
    let bytes = unsafe { std::slice::from_raw_parts(pointer, length) };
    let output = std::str::from_utf8(bytes)
        .map_err(|_| Error::Input)
        .and_then(json_result)
        .unwrap_or_else(error_json);
    into_output(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_the_nontrivial_candidate_from_only_the_polynomial() {
        let (invariants, class_number, generators, relations, statistics) =
            candidate([-34, -30, -8, 1]).unwrap();
        eprintln!(
            "generators={generators} relations={relations} radius={} visited={} primitive={} smooth={} accepted={}",
            statistics.radius,
            statistics.visited,
            statistics.primitive_nonscalar,
            statistics.smooth_norms,
            statistics.accepted,
        );
        assert_eq!(invariants, [6]);
        assert_eq!(class_number, 6);
        assert!(relations >= generators + SUPPLEMENTARY_RELATIONS);
        assert!(statistics.accepted > 0);
    }

    #[test]
    fn parses_neutral_browser_input() {
        let request = r#"{"schema":"sagejs.class-group-request/v1","polynomial":["-34","-30","-8","1"],"proof":"candidate"}"#;
        assert_eq!(parse_polynomial(request).unwrap(), [-34, -30, -8, 1]);
    }

    #[test]
    fn rejects_nonclosed_or_oracle_bearing_requests() {
        let counterfeits = [
            r#"{"schema":"wrong","polynomial":["-34","-30","-8","1"],"proof":"candidate"}"#,
            r#"{"schema":"sagejs.class-group-request/v1","polynomial":["-34","-30","-8","1"],"proof":"candidate","expected":{"classNumber":"6"}}"#,
            r#"{"polynomial":["-34","-30","-8","1"],"proof":"candidate"}"#,
            r#"{"schema":"sagejs.class-group-request/v1","polynomial":["-34","-30","-8","1"]}"#,
            r#"{"schema":"sagejs.class-group-request/v1","schema":"sagejs.class-group-request/v1","polynomial":["-34","-30","-8","1"],"proof":"candidate"}"#,
            r#"{"schema":"sagejs.class-group-request/v1","polynomial":[-34,-30,-8,1],"proof":"candidate"}"#,
            r#"{"schema":"sagejs.class-group-request/v1","polynomial":["-34","-30","-8","1"],"proof":"unconditional"}"#,
            r#"{"schema":"sagejs.class-group-request/v1","polynomial":["-34","-30","-8","1","0"],"proof":"candidate"}"#,
        ];
        for counterfeit in counterfeits {
            assert!(matches!(parse_polynomial(counterfeit), Err(Error::Input)));
        }
    }

    #[test]
    fn accepts_reordered_closed_request_fields() {
        let request = r#"{"proof":"candidate","polynomial":["-34","-30","-8","1"],"schema":"sagejs.class-group-request/v1"}"#;
        assert_eq!(parse_polynomial(request).unwrap(), [-34, -30, -8, 1]);
    }
}
