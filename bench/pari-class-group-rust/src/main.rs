// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    BruteForceOptions, PreparedCubic, UpstreamAssumedH1, WordSmithWorkspace,
    collect_prepared_cubic_presentation_candidate,
    collect_upstream_assumed_h1_presentation_candidate, prepared_cubic_factor_base,
    transpose_relation_records,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::hint::black_box;
use std::time::Instant;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogicalShape {
    relation_rows: usize,
    relation_columns: usize,
    degree: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    schema: String,
    field_id: String,
    polynomial_ascending: Vec<String>,
    source_prepared_input_sha256: String,
    source_prepared_value_sha256: String,
    logical_shape: LogicalShape,
    owners: BTreeMap<String, Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CubicBruteForceInput {
    schema: String,
    field_id: String,
    polynomial_ascending: [i64; 4],
    integral_basis_row_major: [i64; 9],
    maximum_radius: i64,
    supplementary_relations: usize,
    #[serde(default = "default_brute_force_samples")]
    samples: usize,
    #[serde(default)]
    include_witnesses: bool,
}

fn default_brute_force_samples() -> usize {
    7
}

struct SmithWorkspace {
    rows: usize,
    columns: usize,
    values: Vec<Integer>,
    operations: u64,
}

impl SmithWorkspace {
    fn new(rows: usize, columns: usize) -> Self {
        Self {
            rows,
            columns,
            values: vec![Integer::new(); rows * columns],
            operations: 0,
        }
    }

    #[inline]
    fn index(&self, row: usize, column: usize) -> usize {
        row * self.columns + column
    }

    fn reset_from(&mut self, source: &[Integer]) {
        assert_eq!(self.values.len(), source.len());
        for (target, value) in self.values.iter_mut().zip(source) {
            target.clone_from(value);
        }
        self.operations = 0;
    }

    fn swap_rows(&mut self, first: usize, second: usize) {
        if first == second {
            return;
        }
        for column in 0..self.columns {
            let a = self.index(first, column);
            let b = self.index(second, column);
            self.values.swap(a, b);
        }
        self.operations += 1;
    }

    fn swap_columns(&mut self, first: usize, second: usize) {
        if first == second {
            return;
        }
        for row in 0..self.rows {
            let a = self.index(row, first);
            let b = self.index(row, second);
            self.values.swap(a, b);
        }
        self.operations += 1;
    }

    fn add_row_multiple(&mut self, target: usize, source: usize, multiple: &Integer) {
        if multiple == &0 {
            return;
        }
        for column in 0..self.columns {
            let source_value = self.values[self.index(source, column)].clone();
            let delta = Integer::from(multiple * source_value);
            let target_index = self.index(target, column);
            self.values[target_index] += delta;
        }
        self.operations += 1;
    }

    fn add_column_multiple(&mut self, target: usize, source: usize, multiple: &Integer) {
        if multiple == &0 {
            return;
        }
        for row in 0..self.rows {
            let source_value = self.values[self.index(row, source)].clone();
            let delta = Integer::from(multiple * source_value);
            let target_index = self.index(row, target);
            self.values[target_index] += delta;
        }
        self.operations += 1;
    }

    fn smallest_nonzero(&self, start: usize) -> Option<(usize, usize)> {
        let mut answer: Option<(usize, usize, Integer)> = None;
        for row in start..self.rows {
            for column in start..self.columns {
                let value = &self.values[self.index(row, column)];
                if value == &0 {
                    continue;
                }
                let absolute = value.clone().abs();
                if answer.as_ref().is_none_or(|item| absolute < item.2) {
                    answer = Some((row, column, absolute));
                }
            }
        }
        answer.map(|(row, column, _)| (row, column))
    }

    fn clear_pivot_cross(&mut self, pivot: usize) {
        loop {
            let mut changed = false;
            for row in (pivot + 1)..self.rows {
                while self.values[self.index(row, pivot)] != 0 {
                    let quotient = Integer::from(
                        &self.values[self.index(row, pivot)]
                            / &self.values[self.index(pivot, pivot)],
                    );
                    self.add_row_multiple(row, pivot, &(-quotient));
                    if self.values[self.index(row, pivot)] != 0 {
                        self.swap_rows(row, pivot);
                    }
                    changed = true;
                }
            }
            for column in (pivot + 1)..self.columns {
                while self.values[self.index(pivot, column)] != 0 {
                    let quotient = Integer::from(
                        &self.values[self.index(pivot, column)]
                            / &self.values[self.index(pivot, pivot)],
                    );
                    self.add_column_multiple(column, pivot, &(-quotient));
                    if self.values[self.index(pivot, column)] != 0 {
                        self.swap_columns(column, pivot);
                    }
                    changed = true;
                }
            }
            let column_clear =
                ((pivot + 1)..self.rows).all(|row| self.values[self.index(row, pivot)] == 0);
            let row_clear = ((pivot + 1)..self.columns)
                .all(|column| self.values[self.index(pivot, column)] == 0);
            if column_clear && row_clear {
                return;
            }
            assert!(changed, "Smith pivot reduction stalled");
        }
    }

    fn smith_diagonal(&mut self) -> Vec<Integer> {
        let limit = self.rows.min(self.columns);
        let mut pivot = 0;
        while pivot < limit {
            let Some((row, column)) = self.smallest_nonzero(pivot) else {
                break;
            };
            self.swap_rows(pivot, row);
            self.swap_columns(pivot, column);
            loop {
                self.clear_pivot_cross(pivot);
                let divisor = self.values[self.index(pivot, pivot)].clone().abs();
                let mut offending = None;
                'search: for row in (pivot + 1)..self.rows {
                    for column in (pivot + 1)..self.columns {
                        if Integer::from(&self.values[self.index(row, column)] % &divisor) != 0 {
                            offending = Some((row, column));
                            break 'search;
                        }
                    }
                }
                let Some((row, _column)) = offending else {
                    break;
                };
                self.add_row_multiple(pivot, row, &Integer::from(1));
            }
            let diagonal_index = self.index(pivot, pivot);
            if self.values[diagonal_index] < 0 {
                for column in pivot..self.columns {
                    let index = self.index(pivot, column);
                    self.values[index] *= -1;
                }
                self.operations += 1;
            }
            pivot += 1;
        }
        (0..limit)
            .map(|index| self.values[self.index(index, index)].clone())
            .collect()
    }
}

fn parse_presentation(checkpoint: &Checkpoint) -> Vec<Integer> {
    let rows = checkpoint.logical_shape.relation_rows;
    let columns = checkpoint.logical_shape.relation_columns;
    let records = checkpoint
        .owners
        .get("relation_records")
        .expect("checkpoint has no relation_records owner");
    assert!(records.len() >= rows * columns);
    let mut row_major = vec![Integer::new(); rows * columns];
    for column in 0..columns {
        for row in 0..rows {
            row_major[row * columns + column] = records[column * rows + row]
                .parse::<Integer>()
                .expect("invalid exact relation entry");
        }
    }
    row_major
}

fn percentile_samples(mut samples: Vec<u128>) -> (Vec<u128>, u128) {
    samples.sort_unstable();
    let median = samples[samples.len() / 2];
    (samples, median)
}

fn json_i64_values(value: &serde_json::Value) -> Vec<i64> {
    value["values"]
        .as_array()
        .unwrap()
        .iter()
        .map(|value| value.as_str().unwrap().parse().unwrap())
        .collect()
}

fn run_factor_base_experiment(checkpoint_path: &str) {
    let checkpoint: serde_json::Value =
        serde_json::from_slice(&fs::read(checkpoint_path).expect("cannot read phase checkpoint"))
            .expect("invalid phase checkpoint JSON");
    assert_eq!(
        checkpoint["schema"].as_str().unwrap(),
        "sagejs.pari-class-group/h1-rust-phase-checkpoints-v1"
    );
    let owners = &checkpoint["rustTimedInput"]["owners"];
    let polynomial_values = owners["prep_polynomial"]["value"].as_array().unwrap();
    let basis_values = owners["prep_zk"]["value"].as_array().unwrap();
    let mut polynomial = [0_i64; 4];
    let mut basis = [0_i64; 9];
    for (target, value) in polynomial.iter_mut().zip(polynomial_values) {
        *target = value.as_str().unwrap().parse().unwrap();
    }
    for (target, value) in basis.iter_mut().zip(basis_values) {
        *target = value.as_str().unwrap().parse().unwrap();
    }

    let warm = prepared_cubic_factor_base(polynomial, basis);
    let oracle = &checkpoint["oracleOnly"]["factorBase"];
    assert_eq!(warm.relation_bound, 333);
    assert_eq!(warm.checking_bound, 333);
    assert_eq!(warm.ideals.len(), 66);
    assert_eq!(warm.rational_primes.len(), 48);
    assert_eq!(
        warm.rational_primes,
        json_i64_values(&oracle["activePrimeGroups"]["primes"])
    );
    assert_eq!(
        warm.ideals
            .iter()
            .map(|ideal| ideal.prime)
            .collect::<Vec<_>>(),
        json_i64_values(&oracle["activeIdeals"]["primes"])
    );
    assert_eq!(
        warm.ideals
            .iter()
            .flat_map(|ideal| ideal.tau)
            .collect::<Vec<_>>(),
        json_i64_values(&oracle["activeIdeals"]["tau"])
    );
    assert_eq!(
        warm.ideals
            .iter()
            .flat_map(|ideal| ideal.hnf)
            .collect::<Vec<_>>(),
        json_i64_values(&oracle["activeIdeals"]["packetIdeals"])
    );
    let (subfactor_count, permutation) = warm.subfactor_permutation(3);
    assert_eq!(subfactor_count, 4);
    assert_eq!(
        permutation,
        json_i64_values(&oracle["activeIdeals"]["searchPermutation"])
            .into_iter()
            .map(|value| value as usize)
            .collect::<Vec<_>>()
    );

    let mut samples = Vec::with_capacity(15);
    for _ in 0..15 {
        let started = Instant::now();
        let result = black_box(prepared_cubic_factor_base(polynomial, basis));
        samples.push(started.elapsed().as_nanos());
        assert_eq!(result.ideals.len(), warm.ideals.len());
    }
    let (samples, median) = percentile_samples(samples);
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.pari-class-group/h1-rust-factor-base-result-v1",
            "boundary": "prepared polynomial and integral basis to exact factor base and packets",
            "fullPreparedPrefix": false,
            "linksPari": false,
            "verifiedAgainstOracle": true,
            "relationBound": warm.relation_bound,
            "checkingBound": warm.checking_bound,
            "primeGroups": warm.rational_primes.len(),
            "primeIdeals": warm.ideals.len(),
            "subfactorCount": subfactor_count,
            "samplesNanoseconds": samples,
            "medianNanoseconds": median,
            "timingIncludes": ["prime generation", "cubic factorization", "GRH bound", "descriptor construction", "tau construction", "ideal HNF construction"],
            "timingExcludes": ["JSON parsing", "oracle verification", "subfactor ordering", "initial relation cache", "small-norm relation collection"],
        })
    );
}

fn run_class_group_experiment(checkpoint_path: &str) {
    let checkpoint: serde_json::Value =
        serde_json::from_slice(&fs::read(checkpoint_path).expect("cannot read phase checkpoint"))
            .expect("invalid phase checkpoint JSON");
    assert_eq!(
        checkpoint["schema"].as_str().unwrap(),
        "sagejs.pari-class-group/h1-rust-phase-checkpoints-v1"
    );
    let owners = &checkpoint["rustTimedInput"]["owners"];
    let mut polynomial = [0_i64; 4];
    let mut basis = [0_i64; 9];
    for (target, value) in polynomial
        .iter_mut()
        .zip(owners["prep_polynomial"]["value"].as_array().unwrap())
    {
        *target = value.as_str().unwrap().parse().unwrap();
    }
    for (target, value) in basis
        .iter_mut()
        .zip(owners["prep_zk"]["value"].as_array().unwrap())
    {
        *target = value.as_str().unwrap().parse().unwrap();
    }

    assert_eq!(polynomial, UpstreamAssumedH1::POLYNOMIAL_ASCENDING);
    assert_eq!(basis, UpstreamAssumedH1::INTEGRAL_BASIS_ROW_MAJOR);
    let warm = collect_upstream_assumed_h1_presentation_candidate(UpstreamAssumedH1::new())
        .expect("Rust H1 relation collector failed");
    let rows = warm.factor_base.ideals.len();
    let columns = warm.presentation.relation_count();
    assert_eq!((rows, columns), (66, 73));
    let presentation =
        transpose_relation_records(&warm.presentation.relation_vectors, rows, columns);
    let mut smith = WordSmithWorkspace::new(rows, columns);
    smith
        .reset_from(&presentation)
        .expect("bounded Smith reset failed");
    let diagonal = smith
        .smith_diagonal()
        .expect("bounded Smith reduction failed");
    assert_eq!(diagonal.len(), rows);
    assert!(diagonal.iter().all(|value| *value == 1));

    let relation_text = warm
        .presentation
        .relation_vectors
        .iter()
        .map(i64::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let relation_sha256 = format!("{:x}", Sha256::digest(relation_text.as_bytes()));
    let oracle_relations =
        json_i64_values(&checkpoint["oracleOnly"]["collectedRelations"]["records"]);
    let presentation_matches_pari = warm.presentation.relation_vectors == oracle_relations;

    let mut total_samples = Vec::with_capacity(15);
    let mut collector_samples = Vec::with_capacity(15);
    let mut smith_samples = Vec::with_capacity(15);
    let mut factor_base_samples = Vec::with_capacity(15);
    let mut initial_cache_samples = Vec::with_capacity(15);
    let mut catalog_setup_samples = Vec::with_capacity(15);
    let mut numerical_samples = Vec::with_capacity(15);
    let mut enumeration_samples = Vec::with_capacity(15);
    let mut factorization_samples = Vec::with_capacity(15);
    let mut valuation_cache_samples = Vec::with_capacity(15);
    for _ in 0..15 {
        let total_started = Instant::now();
        let answer = black_box(
            collect_upstream_assumed_h1_presentation_candidate(UpstreamAssumedH1::new())
                .expect("repeated Rust H1 relation collector failed"),
        );
        let collector_elapsed = total_started.elapsed().as_nanos();
        let presentation =
            transpose_relation_records(&answer.presentation.relation_vectors, rows, columns);
        let smith_started = Instant::now();
        smith
            .reset_from(&presentation)
            .expect("bounded Smith reset failed");
        let repeated_diagonal = black_box(
            smith
                .smith_diagonal()
                .expect("bounded Smith reduction failed"),
        );
        let smith_elapsed = smith_started.elapsed().as_nanos();
        assert!(repeated_diagonal.iter().all(|value| *value == 1));
        assert_eq!(
            answer.presentation.relation_vectors,
            warm.presentation.relation_vectors
        );
        collector_samples.push(collector_elapsed);
        smith_samples.push(smith_elapsed);
        total_samples.push(total_started.elapsed().as_nanos());
        factor_base_samples.push(answer.timings.factor_base_ns);
        initial_cache_samples.push(answer.timings.initial_cache_ns);
        catalog_setup_samples.push(answer.timings.catalog_setup_ns);
        numerical_samples.push(answer.timings.numerical_preparation_ns);
        enumeration_samples.push(answer.timings.enumeration_and_norm_ns);
        factorization_samples.push(answer.timings.rational_factorization_ns);
        valuation_cache_samples.push(answer.timings.prime_valuation_and_cache_ns);
    }
    let (total_samples, total_median) = percentile_samples(total_samples);
    let (collector_samples, collector_median) = percentile_samples(collector_samples);
    let (smith_samples, smith_median) = percentile_samples(smith_samples);
    let (_, factor_base_median) = percentile_samples(factor_base_samples);
    let (_, initial_cache_median) = percentile_samples(initial_cache_samples);
    let (_, catalog_setup_median) = percentile_samples(catalog_setup_samples);
    let (_, numerical_median) = percentile_samples(numerical_samples);
    let (_, enumeration_median) = percentile_samples(enumeration_samples);
    let (_, factorization_median) = percentile_samples(factorization_samples);
    let (_, valuation_cache_median) = percentile_samples(valuation_cache_samples);

    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.pari-class-group/h1-rust-end-to-end-result-v1",
            "boundary": "prepared polynomial, integral basis, and authenticated H1 embedding through factor base, relation collection, and Smith class group",
            "linksPari": false,
            "usesOracleAsInput": false,
            "fieldId": checkpoint["fieldId"],
            "relationRows": rows,
            "relationColumns": columns,
            "classNumber": "1",
            "invariantFactors": [],
            "presentationMatchesPariExactly": presentation_matches_pari,
            "presentationSha256": relation_sha256,
            "subfactorCount": warm.subfactor_count,
            "counters": {
                "visitedIdeals": warm.counters.visited_ideals,
                "cursorTrials": warm.counters.cursor_trials,
                "primitiveNonscalarCandidates": warm.counters.primitive_nonscalar_candidates,
                "smoothCandidates": warm.counters.smooth_candidates,
                "appendedRelations": warm.counters.appended_relations,
                "positiveCacheStatuses": warm.counters.positive_cache_statuses,
            },
            "samplesNanoseconds": {
                "total": total_samples,
                "collector": collector_samples,
                "smith": smith_samples,
            },
            "medianNanoseconds": {
                "total": total_median,
                "collector": collector_median,
                "smith": smith_median,
                "factorBase": factor_base_median,
                "initialCache": initial_cache_median,
                "catalogSetup": catalog_setup_median,
                "numericalPreparation": numerical_median,
                "enumerationAndNorm": enumeration_median,
                "rationalFactorization": factorization_median,
                "primeValuationAndCache": valuation_cache_median,
            },
            "timingExcludes": ["JSON parsing", "oracle comparison", "result serialization"],
        })
    );
}

fn run_brute_force_experiment(input_path: &str) {
    let input: CubicBruteForceInput =
        serde_json::from_slice(&fs::read(input_path).expect("cannot read cubic input"))
            .expect("invalid cubic input JSON");
    assert_eq!(
        input.schema, "sagejs.pari-class-group/rust-cubic-brute-force-input-v1",
        "unsupported cubic input schema"
    );
    assert!(input.maximum_radius > 0);
    assert!(input.samples > 0);

    let solve = || {
        let started = Instant::now();
        let answer = collect_prepared_cubic_presentation_candidate(
            PreparedCubic {
                polynomial_ascending: input.polynomial_ascending,
                integral_basis_row_major: input.integral_basis_row_major,
            },
            BruteForceOptions {
                maximum_radius: input.maximum_radius,
                supplementary_relations: input.supplementary_relations,
            },
        )
        .expect("Rust cubic coefficient-box collector failed");
        let collection_ns = started.elapsed().as_nanos();
        let relation_rows = answer.presentation.relation_count();
        let factor_base_size = answer.factor_base.ideals.len();
        let presentation = transpose_relation_records(
            &answer.presentation.relation_vectors,
            factor_base_size,
            relation_rows,
        );
        let smith_started = Instant::now();
        let mut smith = WordSmithWorkspace::new(factor_base_size, relation_rows);
        smith
            .reset_from(&presentation)
            .expect("bounded Smith reset failed");
        let diagonal = smith
            .smith_diagonal()
            .expect("bounded Smith reduction failed");
        let smith_ns = smith_started.elapsed().as_nanos();
        assert!(diagonal.iter().all(|value| *value != 0));
        let invariant_factors = diagonal
            .iter()
            .copied()
            .filter(|value| *value > 1)
            .collect::<Vec<_>>();
        let class_number = invariant_factors
            .iter()
            .try_fold(1_i128, |product, value| product.checked_mul(*value))
            .expect("class number overflowed i128");
        (
            answer,
            invariant_factors,
            class_number,
            collection_ns,
            smith_ns,
            started.elapsed().as_nanos(),
        )
    };

    let (warm, warm_invariants, warm_class_number, _, _, _) = solve();
    let warm_records = warm.presentation.relation_vectors.clone();
    let mut collection_samples = Vec::with_capacity(input.samples);
    let mut smith_samples = Vec::with_capacity(input.samples);
    let mut total_samples = Vec::with_capacity(input.samples);
    for _ in 0..input.samples {
        let (answer, invariants, class_number, collection_ns, smith_ns, total_ns) =
            black_box(solve());
        assert_eq!(answer.presentation.relation_vectors, warm_records);
        assert_eq!(invariants, warm_invariants);
        assert_eq!(class_number, warm_class_number);
        collection_samples.push(collection_ns);
        smith_samples.push(smith_ns);
        total_samples.push(total_ns);
    }
    let (collection_samples, collection_median) = percentile_samples(collection_samples);
    let (smith_samples, smith_median) = percentile_samples(smith_samples);
    let (total_samples, total_median) = percentile_samples(total_samples);

    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.pari-class-group/rust-cubic-brute-force-result-v1",
            "fieldId": input.field_id,
            "boundary": "prepared monic cubic polynomial and integral basis through factor base, coefficient-box relation collection, and Smith class-group invariants",
            "linksPari": false,
            "usesOracleAsInput": false,
            "polynomialAscending": input.polynomial_ascending,
            "integralBasisRowMajor": input.integral_basis_row_major,
            "factorBaseSize": warm.factor_base.ideals.len(),
            "relationRows": warm.presentation.relation_count(),
            "maximumRadiusRequested": input.maximum_radius,
            "maximumRadiusUsed": warm.statistics.maximum_radius,
            "supplementaryRelations": input.supplementary_relations,
            "classNumber": warm_class_number.to_string(),
            "invariantFactors": warm_invariants.iter().map(i128::to_string).collect::<Vec<_>>(),
            "statistics": {
                "visited": warm.statistics.visited,
                "primitiveNonscalar": warm.statistics.primitive_nonscalar,
                "smoothNorms": warm.statistics.smooth_norms,
                "factorBaseSmooth": warm.statistics.factor_base_smooth,
                "appended": warm.statistics.appended,
                "duplicate": warm.statistics.duplicate,
            },
            "witnesses": input.include_witnesses.then(|| serde_json::json!({
                "elements": warm.relation_elements,
                "relations": warm.presentation.relation_vectors,
                "primeIdeals": warm.factor_base.ideals.iter().map(|ideal| serde_json::json!({
                    "prime": ideal.prime,
                    "ramification": ideal.ramification,
                    "residueDegree": ideal.residue_degree,
                    "generator": ideal.generator,
                    "tau": ideal.tau,
                    "hnf": ideal.hnf,
                    "norm": ideal.norm,
                })).collect::<Vec<_>>(),
            })),
            "samplesNanoseconds": {
                "total": total_samples,
                "collection": collection_samples,
                "smith": smith_samples,
            },
            "medianNanoseconds": {
                "total": total_median,
                "collection": collection_median,
                "smith": smith_median,
            },
            "timingExcludes": ["JSON parsing", "result serialization", "external PARI validation"],
        })
    );
}

fn main() {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments
        .first()
        .is_some_and(|argument| argument == "factor-base")
    {
        let checkpoint_path = arguments
            .get(1)
            .expect("usage: h1-rust factor-base PHASE-CHECKPOINT.json");
        run_factor_base_experiment(checkpoint_path);
        return;
    }
    if arguments
        .first()
        .is_some_and(|argument| argument == "class-group")
    {
        let checkpoint_path = arguments
            .get(1)
            .expect("usage: h1-rust class-group PHASE-CHECKPOINT.json");
        run_class_group_experiment(checkpoint_path);
        return;
    }
    if arguments
        .first()
        .is_some_and(|argument| argument == "brute-force-cubic")
    {
        let input_path = arguments
            .get(1)
            .expect("usage: h1-rust brute-force-cubic INPUT.json");
        run_brute_force_experiment(input_path);
        return;
    }
    let checkpoint_path = arguments.first().expect("usage: h1-rust CHECKPOINT.json");
    let checkpoint_bytes = fs::read(&checkpoint_path).expect("cannot read checkpoint");
    let checkpoint: Checkpoint =
        serde_json::from_slice(&checkpoint_bytes).expect("invalid checkpoint JSON");
    assert_eq!(checkpoint.schema, "sagejs.pari-class-group/h1-rust-seam-v1");
    assert_eq!(checkpoint.field_id, "pari-2.17.4:x^3-20018*x+20034");
    assert_eq!(
        checkpoint.polynomial_ascending,
        ["20034", "-20018", "0", "1"]
    );
    assert_eq!(checkpoint.logical_shape.degree, 3);
    let input = parse_presentation(&checkpoint);
    let word_input = input
        .iter()
        .map(|value| i128::from(value.to_i64().expect("relation entry does not fit i64")))
        .collect::<Vec<_>>();
    let mut workspace = SmithWorkspace::new(
        checkpoint.logical_shape.relation_rows,
        checkpoint.logical_shape.relation_columns,
    );

    workspace.reset_from(&input);
    let warm_diagonal = workspace.smith_diagonal();
    assert_eq!(warm_diagonal.len(), 66);
    assert!(warm_diagonal.iter().all(|value| value == &1));
    let expected_operations = workspace.operations;

    let mut samples = Vec::with_capacity(15);
    for _ in 0..15 {
        workspace.reset_from(&input);
        let started = Instant::now();
        let diagonal = black_box(workspace.smith_diagonal());
        let elapsed = started.elapsed().as_nanos();
        assert!(diagonal.iter().all(|value| value == &1));
        assert_eq!(workspace.operations, expected_operations);
        samples.push(elapsed);
    }
    let (samples, median) = percentile_samples(samples);
    let mut word_workspace = WordSmithWorkspace::new(
        checkpoint.logical_shape.relation_rows,
        checkpoint.logical_shape.relation_columns,
    );
    word_workspace
        .reset_from(&word_input)
        .expect("bounded Smith reset failed");
    let warm_word_diagonal = word_workspace
        .smith_diagonal()
        .expect("bounded Smith reduction failed");
    assert_eq!(warm_word_diagonal, vec![1_i128; 66]);
    assert_eq!(word_workspace.operations, expected_operations);
    let maximum_absolute_value = word_workspace.maximum_absolute_value;
    let mut word_samples = Vec::with_capacity(31);
    for _ in 0..31 {
        word_workspace
            .reset_from(&word_input)
            .expect("bounded Smith reset failed");
        let started = Instant::now();
        let diagonal = black_box(
            word_workspace
                .smith_diagonal()
                .expect("bounded Smith reduction failed"),
        );
        let elapsed = started.elapsed().as_nanos();
        assert_eq!(diagonal, warm_word_diagonal);
        assert_eq!(word_workspace.operations, expected_operations);
        assert_eq!(
            word_workspace.maximum_absolute_value,
            maximum_absolute_value
        );
        word_samples.push(elapsed);
    }
    let (word_samples, word_median) = percentile_samples(word_samples);
    let diagonal_text = warm_diagonal
        .iter()
        .map(Integer::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let diagonal_sha256 = format!("{:x}", Sha256::digest(diagonal_text.as_bytes()));
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.pari-class-group/h1-rust-smith-result-v1",
            "boundary": "authenticated post-collection 66x73 presentation to Smith invariants",
            "fullPreparedPrefix": false,
            "linksPari": false,
            "arithmetic": "rug::Integer backed by GMP",
            "fieldId": checkpoint.field_id,
            "sourcePreparedInputSha256": checkpoint.source_prepared_input_sha256,
            "sourcePreparedValueSha256": checkpoint.source_prepared_value_sha256,
            "relationRows": checkpoint.logical_shape.relation_rows,
            "relationColumns": checkpoint.logical_shape.relation_columns,
            "smithRank": warm_diagonal.len(),
            "classNumber": "1",
            "invariantFactors": [],
            "diagonalSha256": diagonal_sha256,
            "unimodularOperations": expected_operations,
            "gmp": {
                "samplesNanoseconds": samples,
                "medianNanoseconds": median,
            },
            "checkedInt128": {
                "samplesNanoseconds": word_samples,
                "medianNanoseconds": word_median,
                "maximumAbsoluteIntermediate": maximum_absolute_value.to_string(),
            },
            "timingExcludes": ["JSON parsing", "column-major conversion", "workspace reset", "verification"],
        })
    );
}

#[cfg(test)]
mod tests {
    use super::{
        BruteForceOptions, PreparedCubic, SmithWorkspace, WordSmithWorkspace,
        collect_prepared_cubic_presentation_candidate, transpose_relation_records,
    };
    use rug::Integer;

    fn smith_word(rows: usize, columns: usize, values: &[i128]) -> Vec<i128> {
        let mut workspace = WordSmithWorkspace::new(rows, columns);
        workspace.reset_from(values).unwrap();
        workspace.smith_diagonal().unwrap()
    }

    #[test]
    fn word_smith_handles_rectangular_and_nontorsion_cases() {
        assert_eq!(smith_word(2, 3, &[2, 4, 4, 6, 6, 12]), vec![2, 6]);
        assert_eq!(smith_word(2, 2, &[2, 0, 0, 3]), vec![1, 6]);
        assert_eq!(smith_word(3, 2, &[1, 2, 3, 4, 5, 6]), vec![1, 2]);
        assert_eq!(smith_word(2, 2, &[0, 0, 0, 0]), vec![0, 0]);
    }

    #[test]
    fn coefficient_box_corpus_recovers_nontrivial_cubic_class_groups() {
        let cases = [
            (
                [-1, -1, 0, 1],
                [1, 0, 0, -1, 0, 1, 0, 1, 0],
                9,
                Vec::<i128>::new(),
            ),
            ([1, -2, -1, 1], [1, 0, 0, 0, 1, 0, -1, -1, 1], 7, vec![]),
            (
                [-29, -30, -8, 1],
                [1, 0, 0, -3, 1, 0, -17, -9, 1],
                5,
                vec![2],
            ),
            (
                [-26, -30, -8, 1],
                [1, 0, 0, -17, -9, 1, 15, 10, -1],
                3,
                vec![3],
            ),
            (
                [-37, -30, -8, 1],
                [1, 0, 0, -3, 1, 0, -17, -9, 1],
                5,
                vec![2, 2],
            ),
            (
                [-34, -30, -8, 1],
                [1, 0, 0, -3, 1, 0, -17, -9, 1],
                6,
                vec![6],
            ),
            (
                [20_034, -20_018, 0, 1],
                [1, 0, 0, 0, 1, 0, -13_345, 2, 1],
                47,
                vec![],
            ),
        ];
        for (polynomial, basis, radius, expected) in cases {
            let answer = collect_prepared_cubic_presentation_candidate(
                PreparedCubic {
                    polynomial_ascending: polynomial,
                    integral_basis_row_major: basis,
                },
                BruteForceOptions {
                    maximum_radius: radius,
                    supplementary_relations: 20,
                },
            )
            .unwrap();
            let size = answer.factor_base.ideals.len();
            let relation_rows = answer.presentation.relation_count();
            let presentation = transpose_relation_records(
                &answer.presentation.relation_vectors,
                size,
                relation_rows,
            );
            let diagonal = smith_word(size, relation_rows, &presentation);
            let invariants = diagonal
                .into_iter()
                .filter(|value| *value > 1)
                .collect::<Vec<_>>();
            assert_eq!(invariants, expected);
        }
    }

    #[test]
    fn gmp_and_bounded_paths_agree() {
        let source = [2_i128, 4, 4, 6, 6, 12];
        let mut gmp = SmithWorkspace::new(2, 3);
        gmp.reset_from(&source.map(Integer::from));
        let gmp_diagonal = gmp.smith_diagonal();
        let bounded = smith_word(2, 3, &source);
        assert_eq!(
            gmp_diagonal,
            bounded.into_iter().map(Integer::from).collect::<Vec<_>>()
        );
    }
}
