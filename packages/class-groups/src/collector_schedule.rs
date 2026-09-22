// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use std::fmt;

/// Failures at the translated `small_norm` schedule and packet boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ScheduleError {
    InvalidDimensions,
    CurrentCollectorNotTerminal,
    InvalidIdealId(i64),
    InvalidRamification(i64),
    ArithmeticOverflow,
    MissingPacket(i64),
    InvalidPacketStorage,
}

impl fmt::Display for ScheduleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidDimensions => formatter.write_str("invalid prepared small-norm schedule"),
            Self::CurrentCollectorNotTerminal => {
                formatter.write_str("current ideal collector is not terminal")
            }
            Self::InvalidIdealId(ideal) => write!(formatter, "invalid scheduled ideal ID {ideal}"),
            Self::InvalidRamification(value) => {
                write!(formatter, "invalid scheduled ramification {value}")
            }
            Self::ArithmeticOverflow => {
                formatter.write_str("small-norm schedule arithmetic overflow")
            }
            Self::MissingPacket(ideal) => {
                write!(formatter, "scheduled ideal {ideal} has no original packet")
            }
            Self::InvalidPacketStorage => {
                formatter.write_str("insufficient original ideal packet data")
            }
        }
    }
}

impl std::error::Error for ScheduleError {}

/// Port `pari_next_small_norm_ideal`'s state transition literally.
///
/// The four arrays retain the translated Python/PARI layouts:
///
/// - `schedule = [remaining, started, stopped, terminal_status]`;
/// - `cursor` is the five-slot enumeration cursor;
/// - `counters = [try_factor, nsmall, factor_count, unresolved]`;
/// - `progress = [relid, nfact, stopped, terminal_status]`.
///
/// Ideal identifiers are one-based and the live `ideals[..count]` prefix is
/// consumed backwards. `Ok(None)` is the Python return value zero. A returned
/// identifier has reset only per-ideal state; aggregate `nsmall`, `nfact`, and
/// the retained factor-list length are deliberately preserved.
pub fn next_small_norm_ideal(
    ideals: &[i64],
    count: usize,
    ramification: &[i64],
    residue_degrees: &[i64],
    degree: i64,
    distinguished: i64,
    power: i64,
    schedule: &mut [i64; 4],
    cursor: &mut [i64; 5],
    counters: &mut [i64; 4],
    progress: &mut [i64; 4],
) -> Result<Option<i64>, ScheduleError> {
    if degree < 1
        || count > ideals.len()
        || count > i64::MAX as usize
        || distinguished < 0
        || power < 0
        || ramification.len() != residue_degrees.len()
    {
        return Err(ScheduleError::InvalidDimensions);
    }
    if schedule[2] != 0 {
        return Ok(None);
    }
    if schedule[1] == 0 {
        schedule[0] = count as i64;
        schedule[1] = 1;
        counters[1] = 0;
        progress[1] = 0;
    } else {
        if progress[2] == 0 {
            return Err(ScheduleError::CurrentCollectorNotTerminal);
        }
        let status = progress[3];
        if status != 0 && status != -3 {
            schedule[2] = 1;
            schedule[3] = status;
            return Ok(None);
        }
    }

    while schedule[0] > 0 {
        schedule[0] -= 1;
        let position =
            usize::try_from(schedule[0]).map_err(|_| ScheduleError::InvalidDimensions)?;
        // `schedule[0]` began at `count` and only decreases here, but retain a
        // checked access so malformed resumed state cannot become memory-unsafe.
        let ideal = *ideals
            .get(position)
            .ok_or(ScheduleError::InvalidDimensions)?;
        if ideal < 1 || usize::try_from(ideal).map_or(true, |value| value > ramification.len()) {
            return Err(ScheduleError::InvalidIdealId(ideal));
        }
        if distinguished != 0 && ideal == distinguished {
            let descriptor = usize::try_from(ideal - 1).expect("positive ideal ID");
            let e = ramification[descriptor];
            if e < 1 {
                return Err(ScheduleError::InvalidRamification(e));
            }
            let next_power = power
                .checked_add(1)
                .ok_or(ScheduleError::ArithmeticOverflow)?;
            let local_degree = e
                .checked_mul(residue_degrees[descriptor])
                .ok_or(ScheduleError::ArithmeticOverflow)?;
            if next_power % e == 0 && local_degree == degree {
                continue;
            }
        }
        cursor.fill(0);
        counters[0] = 0;
        counters[3] = 0;
        progress[0] = 0;
        progress[2] = 0;
        progress[3] = 0;
        return Ok(Some(ideal));
    }
    schedule[2] = 1;
    schedule[3] = 0;
    Ok(None)
}

/// Locate the first packet carrying a one-based scheduled ideal identifier.
///
/// This intentionally uses the linear search from `pari_collect_unreduced_ideals`.
/// Packet IDs need not be ordered or equal to their zero-based positions.
pub fn original_packet_index(packet_ids: &[i64], selected: i64) -> Result<usize, ScheduleError> {
    packet_ids
        .iter()
        .position(|&packet_id| packet_id == selected)
        .ok_or(ScheduleError::MissingPacket(selected))
}

/// Select and copy an original row-major ideal-HNF packet.
///
/// This is the `construct_primes == 0` branch used by H1. It returns the
/// packet's prepared norm after copying exactly `degree * degree` cells into
/// the caller-owned admission workspace.
pub fn copy_original_packet<T: Clone>(
    packet_ids: &[i64],
    packet_ideals: &[T],
    packet_norms: &[T],
    degree: usize,
    selected: i64,
    admission_ideal: &mut [T],
) -> Result<T, ScheduleError> {
    let square = degree
        .checked_mul(degree)
        .ok_or(ScheduleError::ArithmeticOverflow)?;
    let required = packet_ids
        .len()
        .checked_mul(square)
        .ok_or(ScheduleError::ArithmeticOverflow)?;
    if packet_norms.len() != packet_ids.len()
        || packet_ideals.len() < required
        || admission_ideal.len() < square
    {
        return Err(ScheduleError::InvalidPacketStorage);
    }
    let packet = original_packet_index(packet_ids, selected)?;
    let start = packet
        .checked_mul(square)
        .ok_or(ScheduleError::ArithmeticOverflow)?;
    admission_ideal[..square].clone_from_slice(&packet_ideals[start..start + square]);
    Ok(packet_norms[packet].clone())
}
