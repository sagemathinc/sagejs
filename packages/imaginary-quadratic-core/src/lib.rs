// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Standalone, bounded imaginary-quadratic core. The mathematical source is
//! shared verbatim with the larger development class-group package; this
//! crate does not link its cubic algorithms or GMP/MPFR/FLINT dependencies.

#[path = "../../class-groups/src/imaginary.rs"]
pub mod imaginary;
pub mod reactor;
pub mod service;
