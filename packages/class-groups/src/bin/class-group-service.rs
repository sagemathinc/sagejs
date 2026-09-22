// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_class_groups::service::{MAXIMUM_REQUEST_BYTES, ProductService};
use std::io::{self, BufRead, Read, Write};

fn discard_through_newline(input: &mut impl BufRead) -> io::Result<()> {
    loop {
        let available = input.fill_buf()?;
        if available.is_empty() {
            return Ok(());
        }
        let consumed = available
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(available.len(), |index| index + 1);
        let found_newline = consumed <= available.len() && available[consumed - 1] == b'\n';
        input.consume(consumed);
        if found_newline {
            return Ok(());
        }
    }
}

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    let mut service = ProductService::new();
    let mut buffer = Vec::new();
    let mut input = stdin.lock();
    loop {
        buffer.clear();
        let count = input
            .by_ref()
            .take((MAXIMUM_REQUEST_BYTES as u64) + 2)
            .read_until(b'\n', &mut buffer)?;
        if count == 0 {
            return Ok(());
        }
        if buffer.last() != Some(&b'\n') && buffer.len() > MAXIMUM_REQUEST_BYTES {
            discard_through_newline(&mut input)?;
        }
        if buffer.last() == Some(&b'\n') {
            buffer.pop();
            if buffer.last() == Some(&b'\r') {
                buffer.pop();
            }
        }
        let response = if buffer.len() > MAXIMUM_REQUEST_BYTES {
            service.execute_json(&[])
        } else {
            service.execute_json(&buffer)
        };
        stdout.write_all(&response)?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
    }
}
