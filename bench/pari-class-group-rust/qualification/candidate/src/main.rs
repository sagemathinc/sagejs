// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_rust_class_group_compact_certificate::produce_compact_certificate;
use serde_json::Value;
use std::fs;
use std::io::{self, Read};
use std::process::ExitCode;

fn main() -> ExitCode {
    let input = match std::env::args_os().nth(1) {
        Some(path) => fs::read_to_string(path),
        None => {
            let mut text = String::new();
            io::stdin().read_to_string(&mut text).map(|_| text)
        }
    };
    let input = match input {
        Ok(input) => input,
        Err(error) => {
            eprintln!("failed to read candidate evidence: {error}");
            return ExitCode::from(1);
        }
    };
    let input: Value = match serde_json::from_str(&input) {
        Ok(input) => input,
        Err(error) => {
            eprintln!("invalid candidate JSON: {error}");
            return ExitCode::from(1);
        }
    };
    match produce_compact_certificate(&input) {
        Ok(certificate) => {
            println!("{}", serde_json::to_string_pretty(&certificate).unwrap());
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("candidate evidence rejected: {error}");
            ExitCode::from(1)
        }
    }
}
