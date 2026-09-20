// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use rug::Integer;
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

struct SmithWorkspace {
    rows: usize,
    columns: usize,
    values: Vec<Integer>,
    operations: u64,
}

struct WordSmithWorkspace {
    rows: usize,
    columns: usize,
    values: Vec<i128>,
    operations: u64,
    maximum_absolute_value: i128,
}

impl WordSmithWorkspace {
    fn new(rows: usize, columns: usize) -> Self {
        Self {
            rows,
            columns,
            values: vec![0; rows * columns],
            operations: 0,
            maximum_absolute_value: 0,
        }
    }

    #[inline]
    fn index(&self, row: usize, column: usize) -> usize {
        row * self.columns + column
    }

    fn reset_from(&mut self, source: &[i128]) {
        self.values.copy_from_slice(source);
        self.operations = 0;
        self.maximum_absolute_value = source.iter().map(|value| value.abs()).max().unwrap_or(0);
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

    fn checked_add_multiple(value: i128, source: i128, multiple: i128) -> i128 {
        value
            .checked_add(
                source
                    .checked_mul(multiple)
                    .expect("bounded Smith multiplication overflowed i128"),
            )
            .expect("bounded Smith addition overflowed i128")
    }

    fn add_row_multiple(&mut self, target: usize, source: usize, multiple: i128) {
        if multiple == 0 {
            return;
        }
        for column in 0..self.columns {
            let source_value = self.values[self.index(source, column)];
            let target_index = self.index(target, column);
            let answer =
                Self::checked_add_multiple(self.values[target_index], source_value, multiple);
            self.values[target_index] = answer;
            self.maximum_absolute_value = self.maximum_absolute_value.max(answer.abs());
        }
        self.operations += 1;
    }

    fn add_column_multiple(&mut self, target: usize, source: usize, multiple: i128) {
        if multiple == 0 {
            return;
        }
        for row in 0..self.rows {
            let source_value = self.values[self.index(row, source)];
            let target_index = self.index(row, target);
            let answer =
                Self::checked_add_multiple(self.values[target_index], source_value, multiple);
            self.values[target_index] = answer;
            self.maximum_absolute_value = self.maximum_absolute_value.max(answer.abs());
        }
        self.operations += 1;
    }

    fn smallest_nonzero(&self, start: usize) -> Option<(usize, usize)> {
        let mut answer: Option<(usize, usize, i128)> = None;
        for row in start..self.rows {
            for column in start..self.columns {
                let value = self.values[self.index(row, column)];
                if value == 0 {
                    continue;
                }
                let absolute = value.abs();
                if answer.is_none_or(|item| absolute < item.2) {
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
                    let quotient =
                        self.values[self.index(row, pivot)] / self.values[self.index(pivot, pivot)];
                    self.add_row_multiple(row, pivot, -quotient);
                    if self.values[self.index(row, pivot)] != 0 {
                        self.swap_rows(row, pivot);
                    }
                    changed = true;
                }
            }
            for column in (pivot + 1)..self.columns {
                while self.values[self.index(pivot, column)] != 0 {
                    let quotient = self.values[self.index(pivot, column)]
                        / self.values[self.index(pivot, pivot)];
                    self.add_column_multiple(column, pivot, -quotient);
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
            assert!(changed, "bounded Smith pivot reduction stalled");
        }
    }

    fn smith_diagonal(&mut self) -> Vec<i128> {
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
                let divisor = self.values[self.index(pivot, pivot)].abs();
                let mut offending = None;
                'search: for row in (pivot + 1)..self.rows {
                    for column in (pivot + 1)..self.columns {
                        if self.values[self.index(row, column)] % divisor != 0 {
                            offending = Some(row);
                            break 'search;
                        }
                    }
                }
                let Some(row) = offending else {
                    break;
                };
                self.add_row_multiple(pivot, row, 1);
            }
            let diagonal_index = self.index(pivot, pivot);
            if self.values[diagonal_index] < 0 {
                for column in pivot..self.columns {
                    let index = self.index(pivot, column);
                    self.values[index] = -self.values[index];
                }
                self.operations += 1;
            }
            pivot += 1;
        }
        (0..limit)
            .map(|index| self.values[self.index(index, index)])
            .collect()
    }
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

fn main() {
    let checkpoint_path = env::args().nth(1).expect("usage: h1-rust CHECKPOINT.json");
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
    word_workspace.reset_from(&word_input);
    let warm_word_diagonal = word_workspace.smith_diagonal();
    assert_eq!(warm_word_diagonal, vec![1_i128; 66]);
    assert_eq!(word_workspace.operations, expected_operations);
    let maximum_absolute_value = word_workspace.maximum_absolute_value;
    let mut word_samples = Vec::with_capacity(31);
    for _ in 0..31 {
        word_workspace.reset_from(&word_input);
        let started = Instant::now();
        let diagonal = black_box(word_workspace.smith_diagonal());
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
    use super::{SmithWorkspace, WordSmithWorkspace};
    use rug::Integer;

    fn smith_word(rows: usize, columns: usize, values: &[i128]) -> Vec<i128> {
        let mut workspace = WordSmithWorkspace::new(rows, columns);
        workspace.reset_from(values);
        workspace.smith_diagonal()
    }

    #[test]
    fn word_smith_handles_rectangular_and_nontorsion_cases() {
        assert_eq!(smith_word(2, 3, &[2, 4, 4, 6, 6, 12]), vec![2, 6]);
        assert_eq!(smith_word(2, 2, &[2, 0, 0, 3]), vec![1, 6]);
        assert_eq!(smith_word(3, 2, &[1, 2, 3, 4, 5, 6]), vec![1, 2]);
        assert_eq!(smith_word(2, 2, &[0, 0, 0, 0]), vec![0, 0]);
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
