// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_public_quadratic_boundary_qualification::{REAL_QUADRATIC_CASES, qualify_case};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let reports = REAL_QUADRATIC_CASES
        .into_iter()
        .map(qualify_case)
        .collect::<Result<Vec<_>, _>>()?;
    println!("{}", serde_json::to_string_pretty(&reports)?);
    Ok(())
}
