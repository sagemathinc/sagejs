// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#[path = "../src/collector_schedule.rs"]
mod collector_schedule;

use collector_schedule::{
    copy_original_packet, next_small_norm_ideal, original_packet_index, ScheduleError,
};

fn h1_search_order() -> Vec<i64> {
    vec![
        2, 4, 6, 8, 1, 3, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 5, 19, 20, 21, 22, 23, 24, 25, 26,
        27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 9, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
        49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66,
    ]
}

#[test]
fn h1_visits_the_reverse_tail_until_the_cache_target_status() {
    let ideals = h1_search_order();
    let ramification = vec![1; 66];
    let residue_degrees = vec![1; 66];
    let packet_ids: Vec<i64> = (1..=66).collect();
    let mut schedule = [0; 4];
    let mut cursor = [7; 5];
    let mut counters = [23, 99, 6, 1];
    let mut progress = [4, 88, 1, -3];

    let mut visited = Vec::new();
    for visit in 0..16 {
        let ideal = next_small_norm_ideal(
            &ideals,
            ideals.len(),
            &ramification,
            &residue_degrees,
            3,
            0,
            0,
            &mut schedule,
            &mut cursor,
            &mut counters,
            &mut progress,
        )
        .unwrap()
        .unwrap();
        visited.push(ideal);
        assert_eq!(
            original_packet_index(&packet_ids, ideal).unwrap(),
            (ideal - 1) as usize
        );
        assert_eq!(cursor, [0; 5]);
        assert_eq!(counters[0], 0);
        assert_eq!(counters[3], 0);
        assert_eq!(progress[0], 0);
        assert_eq!(progress[2], 0);
        assert_eq!(progress[3], 0);

        // Exercise the ordinary -3 continuation for the first fifteen ideals,
        // then the H1 relation-cache-target stop (1). Both transitions are
        // scheduler inputs, not embedded relation data.
        progress[2] = 1;
        progress[3] = if visit == 15 { 1 } else { -3 };
        counters[1] += 1;
        progress[1] += 1;
    }

    assert_eq!(visited, (51..=66).rev().collect::<Vec<_>>());
    assert_eq!(schedule, [50, 1, 0, 0]);
    assert_eq!(counters[1], 16);
    assert_eq!(progress[1], 16);
    assert_eq!(
        next_small_norm_ideal(
            &ideals,
            ideals.len(),
            &ramification,
            &residue_degrees,
            3,
            0,
            0,
            &mut schedule,
            &mut cursor,
            &mut counters,
            &mut progress,
        )
        .unwrap(),
        None
    );
    assert_eq!(schedule, [50, 1, 1, 1]);
}

#[test]
fn distinguished_full_degree_packet_is_skipped_at_the_matching_power() {
    let ideals = [1, 2, 3];
    let ramification = [1, 3, 1];
    let residue_degrees = [1, 1, 1];
    let mut schedule = [0; 4];
    let mut cursor = [0; 5];
    let mut counters = [0; 4];
    let mut progress = [0; 4];

    // Reverse order yields 3 first. After its ordinary completion, ideal 2
    // is skipped because (power + 1) is divisible by e=3 and e*f=degree.
    assert_eq!(
        next_small_norm_ideal(
            &ideals,
            3,
            &ramification,
            &residue_degrees,
            3,
            2,
            2,
            &mut schedule,
            &mut cursor,
            &mut counters,
            &mut progress,
        )
        .unwrap(),
        Some(3)
    );
    progress[2] = 1;
    progress[3] = 0;
    assert_eq!(
        next_small_norm_ideal(
            &ideals,
            3,
            &ramification,
            &residue_degrees,
            3,
            2,
            2,
            &mut schedule,
            &mut cursor,
            &mut counters,
            &mut progress,
        )
        .unwrap(),
        Some(1)
    );
}

#[test]
fn nonordinary_collector_status_is_sticky() {
    let ideals = [1];
    let descriptors = [1];
    let mut schedule = [0; 4];
    let mut cursor = [0; 5];
    let mut counters = [0; 4];
    let mut progress = [0; 4];
    assert_eq!(
        next_small_norm_ideal(
            &ideals,
            1,
            &descriptors,
            &descriptors,
            1,
            0,
            0,
            &mut schedule,
            &mut cursor,
            &mut counters,
            &mut progress,
        )
        .unwrap(),
        Some(1)
    );
    progress[2] = 1;
    progress[3] = 2;
    assert_eq!(
        next_small_norm_ideal(
            &ideals,
            1,
            &descriptors,
            &descriptors,
            1,
            0,
            0,
            &mut schedule,
            &mut cursor,
            &mut counters,
            &mut progress,
        )
        .unwrap(),
        None
    );
    assert_eq!(schedule, [0, 1, 1, 2]);
    assert_eq!(
        next_small_norm_ideal(
            &ideals,
            1,
            &descriptors,
            &descriptors,
            1,
            0,
            0,
            &mut schedule,
            &mut cursor,
            &mut counters,
            &mut progress,
        )
        .unwrap(),
        None
    );
}

#[test]
fn packet_selection_is_one_based_and_copies_the_matching_row_major_hnf() {
    let packet_ids = [4, 1, 7];
    let packet_ideals: Vec<i128> = (0..27).map(i128::from).collect();
    let packet_norms = [11, 13, 17];
    let mut admission = [-1; 9];
    assert_eq!(
        copy_original_packet(
            &packet_ids,
            &packet_ideals,
            &packet_norms,
            3,
            1,
            &mut admission,
        )
        .unwrap(),
        13
    );
    assert_eq!(admission, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
    assert_eq!(
        original_packet_index(&packet_ids, 2),
        Err(ScheduleError::MissingPacket(2))
    );
}

#[test]
fn resumed_schedule_rejects_a_live_collector() {
    let ideals = [1];
    let descriptors = [1];
    let mut schedule = [1, 1, 0, 0];
    let mut cursor = [0; 5];
    let mut counters = [0; 4];
    let mut progress = [0; 4];
    assert_eq!(
        next_small_norm_ideal(
            &ideals,
            1,
            &descriptors,
            &descriptors,
            1,
            0,
            0,
            &mut schedule,
            &mut cursor,
            &mut counters,
            &mut progress,
        ),
        Err(ScheduleError::CurrentCollectorNotTerminal)
    );
}
