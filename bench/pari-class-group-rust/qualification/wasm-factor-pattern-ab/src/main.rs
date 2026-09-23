use sagejs_rust_wasm_factor_pattern_ab::run_factor_pattern_ab_json;
use serde::Serialize;
use std::hint::black_box;
use std::time::Instant;

const SAMPLES: usize = 15;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModeReceipt {
    mode: &'static str,
    median_ms: f64,
    samples_ms: Vec<f64>,
    result: serde_json::Value,
}

fn request(mode: &str) -> String {
    format!(
        "{{\"schema\":\"sagejs.rust-class-group/factor-pattern-ab-request-v1\",\"mode\":\"{mode}\",\"polynomialAscending\":[2000000000018,-2000000000010,0,1],\"bound\":9196}}"
    )
}

fn benchmark(mode: &'static str) -> ModeReceipt {
    let request = request(mode);
    let mut samples_ms = Vec::with_capacity(SAMPLES);
    let mut result = String::new();
    for _ in 0..SAMPLES {
        let started = Instant::now();
        result = black_box(run_factor_pattern_ab_json(black_box(&request)));
        samples_ms.push(started.elapsed().as_secs_f64() * 1_000.0);
    }
    let mut sorted = samples_ms.clone();
    sorted.sort_by(f64::total_cmp);
    ModeReceipt {
        mode,
        median_ms: sorted[sorted.len() / 2],
        samples_ms,
        result: serde_json::from_str(&result).expect("result JSON"),
    }
}

fn main() {
    let receipt = serde_json::json!({
        "schema": "sagejs.rust-class-group/factor-pattern-ab-native-v1",
        "status": "pass",
        "modes": [benchmark("baseline"), benchmark("bounded-i64")],
    });
    println!("{}", serde_json::to_string_pretty(&receipt).unwrap());
}
