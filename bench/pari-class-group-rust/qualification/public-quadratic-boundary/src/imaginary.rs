// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

// Qualification compiles the product's exact Rust algorithm source. This
// adapter provides only the prepared-field types at the parent crate root.
#[path = "../../../../../packages/class-groups/src/imaginary.rs"]
mod implementation;

pub use implementation::*;
