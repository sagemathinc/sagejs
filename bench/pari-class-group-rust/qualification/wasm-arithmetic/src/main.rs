fn main() {
    match sagejs_rust_wasm_arithmetic_probe::result_json() {
        Ok(result) => println!("{result}"),
        Err(message) => {
            eprintln!("probe failed: {message}");
            std::process::exit(1);
        }
    }
}
