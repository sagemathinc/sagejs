fn main() {
    match sagejs_rust_wasm_enclosure_probe::result_json() {
        Ok(result) => println!("{result}"),
        Err(message) => {
            eprintln!("enclosure probe failed: {message}");
            std::process::exit(1);
        }
    }
}
