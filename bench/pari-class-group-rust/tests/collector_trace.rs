// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Test-only reader for the authenticated H1 collector trace.
//!
//! This module is deliberately under `tests/`: the trace contains outcomes of
//! the reference computation and must never become an input to the production
//! or timed Rust collector.  Other integration tests may reuse it with
//! `#[path = "collector_trace.rs"] mod collector_trace;`.

#![allow(dead_code)]

use serde::Deserialize;
use std::path::Path;

pub const SCHEMA: &str = "sagejs.pari-class-group/h1-rust-collector-trace-v1";
pub const FIELD_ID: &str = "pari-2.17.4:x^3-20018*x+20034";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollectorTrace {
    pub schema: String,
    pub field_id: String,
    pub polynomial_ascending: Vec<String>,
    pub authority_sha256: String,
    pub source_prepared_envelope_sha256: String,
    pub source_prepared_value_sha256: String,
    pub oracle_only: OracleOnly,
    pub summary: Summary,
    pub terminal: Terminal,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OracleOnly {
    pub excluded_from_timed_input: bool,
    pub warning: String,
    pub accepted_smooth_candidates: Vec<Admission>,
    pub per_ideal_collector_deltas: Vec<IdealDelta>,
    pub terminal_relation_records: Vec<i64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Admission {
    pub sequence: usize,
    pub candidate_generator_coordinates: Vec<i64>,
    pub candidate_content: i64,
    pub factorgen_indices: Vec<usize>,
    pub factorgen_exponents: Vec<i64>,
    pub factorgen_count: usize,
    pub admission_diagnostic: Vec<i64>,
    pub factor_attempts: usize,
    pub small_candidate_count: usize,
    pub raw_relation: Vec<i64>,
    pub raw_first_nonzero: usize,
    pub packet_id: usize,
    pub distinguished_packet_id: usize,
    pub distinguished_exponent: i64,
    pub normalized_generator_coordinates: Vec<i64>,
    pub normalized_factor_count: usize,
    pub normalized_factor_indices: Vec<usize>,
    pub normalized_factor_exponents: Vec<i64>,
    pub final_relation: Vec<i64>,
    pub first_nonzero: usize,
    pub cache_status: i64,
    pub appended: usize,
    pub relation_count_before: usize,
    pub relation_count_after: usize,
    pub progress_before: Vec<i64>,
    pub progress_after: Vec<i64>,
    pub appended_record: Option<Vec<i64>>,
    pub appended_metadata: Option<Vec<i64>>,
    pub appended_generator: Option<Vec<i64>>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IdealDelta {
    pub sequence: usize,
    pub packet_id: usize,
    pub ideal_norm: i64,
    pub admission_start: usize,
    pub admission_end: usize,
    pub accepted_smooth_candidates: usize,
    pub appended_relations: usize,
    pub positive_cache_statuses: usize,
    pub relation_count_before: usize,
    pub relation_count_after: usize,
    pub relation_state_before: Vec<i64>,
    pub relation_state_after: Vec<i64>,
    pub relation_basis_delta: Vec<BasisDelta>,
    pub counters_before: Vec<i64>,
    pub counters_after: Vec<i64>,
    pub progress_before: Vec<i64>,
    pub progress_after: Vec<i64>,
    pub collector_status: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct BasisDelta {
    pub index: usize,
    pub before: i64,
    pub after: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub accepted_smooth_candidates: usize,
    pub appended_relations: usize,
    pub per_ideal_invocations: usize,
    pub initial_relations: usize,
    pub terminal_relations: usize,
    pub admissions_sha256: String,
    pub per_ideal_deltas_sha256: String,
    pub terminal_presentation_sha256: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Terminal {
    pub status: i64,
    pub attempt_state: Vec<i64>,
    pub class_number: String,
}

impl CollectorTrace {
    pub fn load(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        let bytes = std::fs::read(path)
            .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
        let trace: Self = serde_json::from_slice(&bytes)
            .map_err(|error| format!("failed to parse {}: {error}", path.display()))?;
        trace.validate()?;
        Ok(trace)
    }

    /// Return admissions in the exact order observed during one ideal visit.
    pub fn admissions_for_ideal(&self, ideal: &IdealDelta) -> &[Admission] {
        &self.oracle_only.accepted_smooth_candidates[ideal.admission_start..ideal.admission_end]
    }

    pub fn ideal_by_packet(&self, packet_id: usize) -> Option<&IdealDelta> {
        self.oracle_only
            .per_ideal_collector_deltas
            .iter()
            .find(|ideal| ideal.packet_id == packet_id)
    }

    /// Check that this oracle was exported from the prepared state in a phase
    /// checkpoint.  This compares provenance, never mathematical output.
    pub fn validate_phase_checkpoint(&self, checkpoint: &serde_json::Value) -> Result<(), String> {
        check_json_string(
            checkpoint,
            "/schema",
            "sagejs.pari-class-group/h1-rust-phase-checkpoints-v1",
        )?;
        check_json_string(checkpoint, "/fieldId", &self.field_id)?;
        check_json_string(
            checkpoint,
            "/provenance/sourcePreparedEnvelopeSha256",
            &self.source_prepared_envelope_sha256,
        )?;
        check_json_string(
            checkpoint,
            "/provenance/sourcePreparedValueSha256",
            &self.source_prepared_value_sha256,
        )?;
        let polynomial: Vec<&str> = checkpoint
            .pointer("/polynomialAscending")
            .and_then(serde_json::Value::as_array)
            .ok_or("phase checkpoint has no polynomialAscending array")?
            .iter()
            .map(|value| value.as_str().ok_or("non-string polynomial coefficient"))
            .collect::<Result<_, _>>()?;
        if polynomial
            != self
                .polynomial_ascending
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
        {
            return Err("phase checkpoint polynomial does not match collector trace".into());
        }
        Ok(())
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.schema != SCHEMA {
            return Err(format!(
                "unexpected collector trace schema: {}",
                self.schema
            ));
        }
        if self.field_id != FIELD_ID {
            return Err(format!(
                "unexpected collector trace field: {}",
                self.field_id
            ));
        }
        if !self.oracle_only.excluded_from_timed_input {
            return Err("collector trace is not marked excluded from timed input".into());
        }
        if self.polynomial_ascending != ["20034", "-20018", "0", "1"] {
            return Err("collector trace polynomial is not the authenticated H1 polynomial".into());
        }
        let admissions = &self.oracle_only.accepted_smooth_candidates;
        let ideals = &self.oracle_only.per_ideal_collector_deltas;
        if admissions.len() != self.summary.accepted_smooth_candidates {
            return Err("admission count disagrees with summary".into());
        }
        if ideals.len() != self.summary.per_ideal_invocations {
            return Err("ideal count disagrees with summary".into());
        }
        if self.oracle_only.terminal_relation_records.len() != 66 * self.summary.terminal_relations
        {
            return Err("terminal presentation does not have 66 rows per relation".into());
        }

        let mut next_admission = 0;
        let mut next_relation = self.summary.initial_relations;
        let mut appended_total = 0;
        for (sequence, ideal) in ideals.iter().enumerate() {
            if ideal.sequence != sequence {
                return Err(format!("ideal delta {sequence} has wrong sequence"));
            }
            if ideal.admission_start != next_admission
                || ideal.admission_end < ideal.admission_start
                || ideal.admission_end > admissions.len()
            {
                return Err(format!(
                    "ideal delta {sequence} has a noncontiguous admission range"
                ));
            }
            let events = self.admissions_for_ideal(ideal);
            if events.len() != ideal.accepted_smooth_candidates {
                return Err(format!("ideal delta {sequence} has wrong admission count"));
            }
            if events
                .iter()
                .any(|event| event.packet_id != ideal.packet_id)
            {
                return Err(format!("ideal delta {sequence} contains another packet"));
            }
            let appended = events.iter().map(|event| event.appended).sum::<usize>();
            if appended != ideal.appended_relations {
                return Err(format!("ideal delta {sequence} has wrong appended count"));
            }
            if ideal.relation_count_before != next_relation
                || ideal.relation_count_after != next_relation + appended
            {
                return Err(format!(
                    "ideal delta {sequence} breaks relation-count continuity"
                ));
            }
            next_admission = ideal.admission_end;
            next_relation = ideal.relation_count_after;
            appended_total += appended;
        }
        if next_admission != admissions.len()
            || next_relation != self.summary.terminal_relations
            || appended_total != self.summary.appended_relations
        {
            return Err("collector totals disagree with summary".into());
        }

        for (sequence, event) in admissions.iter().enumerate() {
            if event.sequence != sequence {
                return Err(format!("admission {sequence} has wrong sequence"));
            }
            if event.candidate_generator_coordinates != event.normalized_generator_coordinates {
                return Err(format!(
                    "admission {sequence} unexpectedly changed its generator"
                ));
            }
            if event.factorgen_indices.len() != event.factorgen_count
                || event.factorgen_exponents.len() != event.factorgen_count
                || event.normalized_factor_indices.len() != event.normalized_factor_count
                || event.normalized_factor_exponents.len() != event.normalized_factor_count
            {
                return Err(format!(
                    "admission {sequence} has inconsistent factor lengths"
                ));
            }
            if event.raw_relation.len() != 66 || event.final_relation.len() != 66 {
                return Err(format!("admission {sequence} has a non-66-entry relation"));
            }
            match event.appended {
                0 => {
                    if event.appended_record.is_some()
                        || event.appended_metadata.is_some()
                        || event.appended_generator.is_some()
                    {
                        return Err(format!(
                            "non-appended admission {sequence} has appended data"
                        ));
                    }
                }
                1 => {
                    if event.appended_record.as_deref() != Some(event.final_relation.as_slice())
                        || event.appended_generator.as_deref()
                            != Some(event.normalized_generator_coordinates.as_slice())
                    {
                        return Err(format!(
                            "appended admission {sequence} has inconsistent data"
                        ));
                    }
                }
                value => return Err(format!("admission {sequence} has appended={value}")),
            }
        }
        Ok(())
    }
}

fn check_json_string(
    document: &serde_json::Value,
    pointer: &str,
    expected: &str,
) -> Result<(), String> {
    let actual = document
        .pointer(pointer)
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| format!("phase checkpoint has no string at {pointer}"))?;
    if actual != expected {
        return Err(format!("phase checkpoint mismatch at {pointer}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn oracle_path() -> String {
        std::env::var("SAGEJS_H1_COLLECTOR_TRACE")
            .expect("set SAGEJS_H1_COLLECTOR_TRACE to the oracle-only trace")
    }

    #[test]
    #[ignore = "requires export_h1_rust_collector_trace.cjs output"]
    fn authenticated_h1_trace_exposes_exact_ideal_and_candidate_order() {
        let trace = CollectorTrace::load(oracle_path()).unwrap();
        assert_eq!(trace.summary.per_ideal_invocations, 16);
        assert_eq!(trace.summary.accepted_smooth_candidates, 96);
        assert_eq!(trace.summary.appended_relations, 61);
        assert_eq!(trace.summary.initial_relations, 12);
        assert_eq!(trace.summary.terminal_relations, 73);
        assert_eq!(
            trace
                .oracle_only
                .per_ideal_collector_deltas
                .iter()
                .map(|ideal| ideal.packet_id)
                .collect::<Vec<_>>(),
            (51..=66).rev().collect::<Vec<_>>()
        );

        let packet_66 = trace.ideal_by_packet(66).unwrap();
        assert_eq!(packet_66.ideal_norm, 331);
        assert_eq!(packet_66.counters_after, [56, 56, 6, 0]);
        assert_eq!(
            trace
                .admissions_for_ideal(packet_66)
                .iter()
                .map(|event| event.candidate_generator_coordinates.as_slice())
                .collect::<Vec<_>>(),
            vec![&[1, 1, 0][..], &[-329, 2, 0], &[-328, 3, 0], &[-303, 28, 0]]
        );
        assert_eq!(
            trace.summary.terminal_presentation_sha256,
            "861b98fac666e49af511a6c08cca2591d2d37bdb99d76904168b84bb72b9da52"
        );
    }

    #[test]
    #[ignore = "requires both authenticated H1 checkpoint exports"]
    fn collector_trace_and_phase_checkpoint_have_identical_prepared_provenance() {
        let trace = CollectorTrace::load(oracle_path()).unwrap();
        let path = std::env::var("SAGEJS_H1_PHASE_CHECKPOINT")
            .expect("set SAGEJS_H1_PHASE_CHECKPOINT to the phase checkpoint");
        let checkpoint: serde_json::Value =
            serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        trace.validate_phase_checkpoint(&checkpoint).unwrap();
    }
}
