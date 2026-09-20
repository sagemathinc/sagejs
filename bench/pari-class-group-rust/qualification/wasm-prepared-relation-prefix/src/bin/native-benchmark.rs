use sagejs_rust_wasm_prepared_relation_prefix::run_prepared_relation_prefix_json;
use serde_json::json;
use std::env;
use std::fs;
use std::time::Instant;

const SAMPLES: usize = 15;

fn main() {
    let input_path = env::args().nth(1).expect("usage: native-benchmark INPUT");
    let prepared: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&input_path).expect("read neutral input"))
            .expect("parse neutral input");
    let source = serde_json::to_string(&json!({
        "schema": "sagejs.rust-class-group/prepared-relation-prefix-request-v1",
        "maximumVisitedIdeals": 1,
        "maximumCandidates": 64,
        "preparedField": prepared,
    }))
    .expect("bounded request JSON");
    let expected = run_prepared_relation_prefix_json(&source);
    let mut samples = Vec::with_capacity(SAMPLES);
    for _ in 0..SAMPLES {
        let started = Instant::now();
        let result = run_prepared_relation_prefix_json(&source);
        samples.push(started.elapsed().as_secs_f64() * 1000.0);
        assert_eq!(result, expected, "native repeated result changed");
    }
    let mut sorted = samples.clone();
    sorted.sort_by(f64::total_cmp);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "schema": "sagejs.rust-class-group/native-prepared-relation-prefix-benchmark-v1",
            "status": "pass",
            "boundary": "prepared-cubic-relation-prefix",
            "inputPath": input_path,
            "sampleCount": SAMPLES,
            "samplesMs": samples,
            "medianMs": sorted[SAMPLES / 2],
            "result": serde_json::from_str::<serde_json::Value>(&expected)
                .expect("stage output JSON"),
        }))
        .expect("benchmark receipt JSON")
    );
}
