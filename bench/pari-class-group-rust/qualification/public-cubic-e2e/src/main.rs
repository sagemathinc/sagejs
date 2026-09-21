// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_public_cubic_class_group_e2e_qualification::{
    IDEAL_QUERY_REQUEST_SCHEMA, IdealQueryRequest, Request, qualify, qualify_ideal_query,
};
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
    let value: serde_json::Value = match serde_json::from_str(&source) {
        Ok(value) => value,
        Err(error) => {
            println!(
                "{}",
                json!({"outcome":"rejected", "error": error.to_string()})
            );
            std::process::exit(64);
        }
    };
    if value.get("schema").and_then(serde_json::Value::as_str) == Some(IDEAL_QUERY_REQUEST_SCHEMA) {
        let request: IdealQueryRequest = match serde_json::from_value(value) {
            Ok(request) => request,
            Err(error) => {
                println!(
                    "{}",
                    json!({"outcome":"rejected", "error": error.to_string()})
                );
                std::process::exit(64);
            }
        };
        match qualify_ideal_query(request) {
            Ok(receipt) => {
                println!("{}", serde_json::to_string(&receipt).unwrap());
                std::process::exit(0);
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
    let request: Request = match serde_json::from_value(value) {
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
            let public_complete = receipt.public_complete;
            println!("{}", serde_json::to_string(&receipt).unwrap());
            std::process::exit(if public_complete { 0 } else { 2 });
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
