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
use std::cell::RefCell;

const MAXIMUM_RADIUS: i64 = 32;
const SUPPLEMENTARY_RELATIONS: usize = 20;
const MAX_INPUT_BYTES: usize = 1 << 20;
const MAX_STEP_POINTS: u32 = 4_096;
const MAX_CONTEXTS: usize = 64;

#[derive(Clone, Copy, Debug)]
enum Error {
    Input,
    UnsupportedOrder,
    Arithmetic,
    Collection,
    Smith,
    State,
}

#[derive(Clone, Default)]
struct Statistics {
    visited: u64,
    primitive_nonscalar: u64,
    smooth_norms: u64,
    accepted: u64,
    radius: i64,
}

type CandidateResult = (Vec<i128>, i128, usize, usize, Statistics);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ComputationStatus {
    Running,
    Complete,
    Cancelled,
    Failed,
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

struct CandidateContext {
    polynomial: [i64; 4],
    base: FactorBase,
    cache: RelationCache,
    relation: Vec<i64>,
    target: usize,
    statistics: Statistics,
    radius: i64,
    x: i64,
    y: i64,
    z: i64,
    status: ComputationStatus,
    result: Option<CandidateResult>,
    failure: Option<Error>,
}

impl CandidateContext {
    fn new(polynomial: [i64; 4]) -> Result<Self, Error> {
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
        let cache = initialize_cache(&base)?;
        let target = base.ideals.len() + SUPPLEMENTARY_RELATIONS;
        Ok(Self {
            polynomial,
            relation: vec![0_i64; base.ideals.len()],
            target,
            base,
            cache,
            statistics: Statistics::default(),
            radius: 1,
            x: -1,
            y: -1,
            z: -1,
            status: ComputationStatus::Running,
            result: None,
            failure: None,
        })
    }

    fn advance(&mut self) {
        self.x += 1;
        if self.x <= self.radius {
            return;
        }
        self.x = -self.radius;
        self.y += 1;
        if self.y <= self.radius {
            return;
        }
        self.y = -self.radius;
        self.z += 1;
        if self.z <= self.radius {
            return;
        }
        self.radius += 1;
        self.x = -self.radius;
        self.y = -self.radius;
        self.z = -self.radius;
    }

    fn fail(&mut self, error: Error) -> ComputationStatus {
        self.failure = Some(error);
        self.status = ComputationStatus::Failed;
        self.status
    }

    fn finish(&mut self) -> Result<(), Error> {
        if self.cache.missing() != 0 || self.cache.len() < self.target {
            return Err(Error::Collection);
        }
        let columns = self.cache.len();
        let matrix =
            transpose_relation_records(self.cache.records(), self.base.ideals.len(), columns);
        let mut workspace = WordSmithWorkspace::new(self.base.ideals.len(), columns);
        workspace.reset_from(&matrix).map_err(|_| Error::Smith)?;
        let diagonal = workspace.smith_diagonal().map_err(|_| Error::Smith)?;
        if diagonal.iter().filter(|value| **value != 0).count() != self.base.ideals.len() {
            return Err(Error::Smith);
        }
        let invariants = diagonal
            .into_iter()
            .filter(|value| *value > 1)
            .collect::<Vec<_>>();
        let class_number = invariants.iter().try_fold(1_i128, |product, value| {
            product.checked_mul(*value).ok_or(Error::Arithmetic)
        })?;
        self.result = Some((
            invariants,
            class_number,
            self.base.ideals.len(),
            columns,
            self.statistics.clone(),
        ));
        self.status = ComputationStatus::Complete;
        Ok(())
    }

    fn step(&mut self, point_budget: u32) -> ComputationStatus {
        if self.status != ComputationStatus::Running {
            return self.status;
        }
        for _ in 0..point_budget {
            if self.radius > MAXIMUM_RADIUS {
                return self.fail(Error::Collection);
            }
            self.statistics.radius = self.radius;
            let element = [self.x, self.y, self.z];
            let radius = self.radius;
            self.advance();
            if !on_shell(element, radius) || (element[1] == 0 && element[2] == 0) {
                continue;
            }
            self.statistics.visited += 1;
            if !primitive(element) || !canonical_up_to_sign(element) {
                continue;
            }
            self.statistics.primitive_nonscalar += 1;
            let factors = match norm(self.polynomial, element) {
                Ok(value) => rational_factorization(value, &self.base),
                Err(error) => return self.fail(error),
            };
            let Some(factors) = factors else {
                continue;
            };
            self.statistics.smooth_norms += 1;
            match refine(&self.base, element, &factors, &mut self.relation) {
                Ok(true) => {}
                Ok(false) => continue,
                Err(error) => return self.fail(error),
            }
            let outcome = match self.cache.add_relation(
                &self.relation,
                first_nonzero(&self.relation),
                self.statistics.primitive_nonscalar as i64,
                0,
                0,
                false,
            ) {
                Ok(outcome) => outcome,
                Err(_) => return self.fail(Error::Collection),
            };
            if outcome.appended {
                self.statistics.accepted += 1;
            }
            if self.cache.missing() == 0 && self.cache.len() >= self.target {
                if let Err(error) = self.finish() {
                    return self.fail(error);
                }
                return self.status;
            }
        }
        self.status
    }

    fn cancel(&mut self) -> ComputationStatus {
        if self.status == ComputationStatus::Running {
            self.status = ComputationStatus::Cancelled;
        }
        self.status
    }
}

fn candidate(polynomial: [i64; 4]) -> Result<CandidateResult, Error> {
    let mut context = CandidateContext::new(polynomial)?;
    while context.status == ComputationStatus::Running {
        context.step(MAX_STEP_POINTS);
    }
    match context.status {
        ComputationStatus::Complete => context.result.take().ok_or(Error::State),
        ComputationStatus::Failed => Err(context.failure.unwrap_or(Error::State)),
        ComputationStatus::Running | ComputationStatus::Cancelled => Err(Error::State),
    }
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

fn format_result(result: &CandidateResult) -> String {
    let (invariants, class_number, _, _, _) = result;
    let factors = invariants
        .iter()
        .map(|value| format!("\"{value}\""))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"schema\":\"sagejs.class-group-result/v1\",\"classNumber\":\"{class_number}\",\"invariantFactors\":[{factors}],\"status\":\"candidate\"}}"
    )
}

fn json_result(input: &str) -> Result<String, Error> {
    let polynomial = parse_polynomial(input)?;
    candidate(polynomial).map(|result| format_result(&result))
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

struct ContextSlot {
    generation: u32,
    context: Option<CandidateContext>,
}

#[derive(Default)]
struct ContextRegistry {
    slots: Vec<ContextSlot>,
}

impl ContextRegistry {
    fn handle(index: usize, generation: u32) -> u64 {
        (u64::from(generation) << 32) | u64::try_from(index + 1).unwrap_or(0)
    }

    fn decode(handle: u64) -> Option<(usize, u32)> {
        let low = u32::try_from(handle & 0xffff_ffff).ok()?;
        let generation = u32::try_from(handle >> 32).ok()?;
        if low == 0 || generation == 0 {
            return None;
        }
        Some((usize::try_from(low - 1).ok()?, generation))
    }

    fn insert(&mut self, context: CandidateContext) -> u64 {
        if let Some((index, slot)) = self
            .slots
            .iter_mut()
            .enumerate()
            .find(|(_, slot)| slot.context.is_none() && slot.generation < u32::MAX)
        {
            slot.generation += 1;
            slot.context = Some(context);
            return Self::handle(index, slot.generation);
        }
        if self.slots.len() >= MAX_CONTEXTS {
            return 0;
        }
        let index = self.slots.len();
        self.slots.push(ContextSlot {
            generation: 1,
            context: Some(context),
        });
        Self::handle(index, 1)
    }

    fn get_mut(&mut self, handle: u64) -> Option<&mut CandidateContext> {
        let (index, generation) = Self::decode(handle)?;
        let slot = self.slots.get_mut(index)?;
        (slot.generation == generation)
            .then_some(())
            .and_then(|()| slot.context.as_mut())
    }

    fn close(&mut self, handle: u64) -> bool {
        let Some((index, generation)) = Self::decode(handle) else {
            return false;
        };
        let Some(slot) = self.slots.get_mut(index) else {
            return false;
        };
        if slot.generation != generation || slot.context.is_none() {
            return false;
        }
        slot.context = None;
        true
    }

    fn reset(&mut self, handle: u64, context: CandidateContext) -> Option<u64> {
        let (index, generation) = Self::decode(handle)?;
        let slot = self.slots.get_mut(index)?;
        if slot.generation != generation || slot.context.is_none() {
            return None;
        }
        slot.generation = slot.generation.checked_add(1)?;
        slot.context = Some(context);
        Some(Self::handle(index, slot.generation))
    }
}

thread_local! {
    static CONTEXTS: RefCell<ContextRegistry> = RefCell::new(ContextRegistry::default());
}

fn context_from_json(pointer: *const u8, length: usize) -> Result<CandidateContext, Error> {
    if pointer.is_null() || length == 0 || length > MAX_INPUT_BYTES {
        return Err(Error::Input);
    }
    // SAFETY: the host must validate and initialize this guest-memory range.
    let bytes = unsafe { std::slice::from_raw_parts(pointer, length) };
    let input = std::str::from_utf8(bytes).map_err(|_| Error::Input)?;
    CandidateContext::new(parse_polynomial(input)?)
}

fn status_code(status: ComputationStatus) -> i32 {
    match status {
        ComputationStatus::Running => 1,
        ComputationStatus::Complete => 2,
        ComputationStatus::Cancelled => 3,
        ComputationStatus::Failed => 4,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_abi_version() -> i32 {
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_context_abi_version() -> i32 {
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

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_context_create_json(pointer: *const u8, length: usize) -> u64 {
    let Ok(context) = context_from_json(pointer, length) else {
        return 0;
    };
    CONTEXTS.with(|registry| registry.borrow_mut().insert(context))
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_context_step(handle: u64, point_budget: u32) -> i32 {
    if point_budget == 0 || point_budget > MAX_STEP_POINTS {
        return 5;
    }
    CONTEXTS.with(|registry| {
        registry
            .borrow_mut()
            .get_mut(handle)
            .map_or(0, |context| status_code(context.step(point_budget)))
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_context_cancel(handle: u64) -> i32 {
    CONTEXTS.with(|registry| {
        let mut registry = registry.borrow_mut();
        let Some(context) = registry.get_mut(handle) else {
            return 0;
        };
        match context.status {
            ComputationStatus::Running => {
                context.cancel();
                1
            }
            ComputationStatus::Cancelled => 2,
            ComputationStatus::Complete | ComputationStatus::Failed => 3,
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_context_result_json(handle: u64) -> u64 {
    let output = CONTEXTS.with(|registry| {
        let mut registry = registry.borrow_mut();
        let Some(context) = registry.get_mut(handle) else {
            return error_json(Error::State);
        };
        if context.status != ComputationStatus::Complete {
            return error_json(Error::State);
        }
        context
            .result
            .as_ref()
            .map_or_else(|| error_json(Error::State), format_result)
    });
    into_output(output)
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_context_reset_json(
    handle: u64,
    pointer: *const u8,
    length: usize,
) -> u64 {
    let Ok(context) = context_from_json(pointer, length) else {
        return 0;
    };
    CONTEXTS.with(|registry| registry.borrow_mut().reset(handle, context).unwrap_or(0))
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_context_close(handle: u64) -> i32 {
    CONTEXTS.with(|registry| i32::from(registry.borrow_mut().close(handle)))
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

    #[test]
    fn bounded_steps_reproduce_the_synchronous_result() {
        let expected = candidate([-34, -30, -8, 1]).unwrap();
        let mut context = CandidateContext::new([-34, -30, -8, 1]).unwrap();
        let mut steps = 0;
        while context.status == ComputationStatus::Running {
            assert_eq!(context.step(1), context.status);
            steps += 1;
            assert!(steps < 10_000);
        }
        assert!(
            steps > 100,
            "test must exercise genuinely resumable collection"
        );
        let actual = context.result.take().unwrap();
        assert_eq!(actual.0, expected.0);
        assert_eq!(actual.1, expected.1);
        assert_eq!(actual.2, expected.2);
        assert_eq!(actual.3, expected.3);
        assert_eq!(actual.4.visited, expected.4.visited);
        assert_eq!(actual.4.accepted, expected.4.accepted);
    }

    #[test]
    fn registry_rejects_stale_and_double_close_handles() {
        let mut registry = ContextRegistry::default();
        let first = registry.insert(CandidateContext::new([-34, -30, -8, 1]).unwrap());
        assert_ne!(first, 0);
        assert!(registry.get_mut(first).is_some());
        assert!(registry.close(first));
        assert!(!registry.close(first));
        assert!(registry.get_mut(first).is_none());

        let second = registry.insert(CandidateContext::new([-34, -30, -8, 1]).unwrap());
        assert_ne!(second, first);
        assert!(registry.get_mut(first).is_none());
        assert!(registry.get_mut(second).is_some());

        let reset = registry
            .reset(second, CandidateContext::new([-34, -30, -8, 1]).unwrap())
            .unwrap();
        assert_ne!(reset, second);
        assert!(registry.get_mut(second).is_none());
        assert!(registry.get_mut(reset).is_some());
    }

    #[test]
    fn cancellation_is_terminal_and_never_publishes_a_result() {
        let mut context = CandidateContext::new([-34, -30, -8, 1]).unwrap();
        assert_eq!(context.step(8), ComputationStatus::Running);
        assert_eq!(context.cancel(), ComputationStatus::Cancelled);
        assert_eq!(context.step(8), ComputationStatus::Cancelled);
        assert_eq!(context.cancel(), ComputationStatus::Cancelled);
        assert!(context.result.is_none());
    }

    #[test]
    fn registry_has_a_hard_live_context_capacity() {
        let mut registry = ContextRegistry::default();
        let mut handles = Vec::new();
        for _ in 0..MAX_CONTEXTS {
            let handle = registry.insert(CandidateContext::new([-34, -30, -8, 1]).unwrap());
            assert_ne!(handle, 0);
            handles.push(handle);
        }
        assert_eq!(
            registry.insert(CandidateContext::new([-34, -30, -8, 1]).unwrap()),
            0,
        );
        assert!(registry.close(handles[0]));
        let replacement = registry.insert(CandidateContext::new([-34, -30, -8, 1]).unwrap());
        assert_ne!(replacement, 0);
        assert_ne!(replacement, handles[0]);
    }
}
