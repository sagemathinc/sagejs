// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_public_cubic_class_group_e2e_qualification::{Request, qualify};
use serde_json::json;
use std::io::{self, Read};

fn main() {
    let mut source = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut source) {
        println!(
            "{}",
            json!({"outcome":"rejected", "error": error.to_string()})
        );
        std::process::exit(64);
    }
    let request: Request = match serde_json::from_str(&source) {
        Ok(request) => request,
        Err(error) => {
            println!(
                "{}",
                json!({"outcome":"rejected", "error": error.to_string()})
            );
            std::process::exit(64);
        }
    };
    match qualify(request) {
        Ok(receipt) => {
            println!("{}", serde_json::to_string(&receipt).unwrap());
            // A candidate is useful evidence, but this executable must never
            // make it indistinguishable from a completed public result.
            std::process::exit(2);
        }
        Err(error) => {
            println!(
                "{}",
                json!({"outcome":"rejected", "error": format!("{error:?}")})
            );
            std::process::exit(1);
        }
    }
}
