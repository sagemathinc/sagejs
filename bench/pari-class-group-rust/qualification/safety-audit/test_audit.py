from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("audit.py")
SPEC = importlib.util.spec_from_file_location("safety_audit", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class SafetyAuditTest(unittest.TestCase):
    def audit_fixture(self, source: str):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "src").mkdir()
            (root / "src/lib.rs").write_text(source)
            return AUDIT.build_receipt(root)

    def test_documented_boundary_passes(self):
        receipt = self.audit_fixture(
            "// Copyright (C) Sage.js contributors.\n"
            "// GPL-2.0-or-later, without warranty.\n"
            "// FFI-SAFETY: host supplies a valid initialized pointer.\n"
            'unsafe extern "C" { fn host_read(pointer: *const u8); }\n'
            "fn call(pointer: *const u8) {\n"
            "  // SAFETY: pointer satisfies the imported ABI above.\n"
            "  unsafe { host_read(pointer); }\n"
            "}\n"
        )
        self.assertEqual(receipt["summary"]["unsafeItems"], 2)
        self.assertEqual(receipt["summary"]["ffiBoundaries"], 2)
        self.assertEqual(receipt["summary"]["unclassifiedSafetyTokens"], 0)
        self.assertTrue(receipt["summary"]["documentationGatePassed"])
        self.assertFalse(receipt["summary"]["promotionGatePassed"])

    def test_missing_rationale_fails_closed(self):
        receipt = self.audit_fixture(
            "// Copyright (C) Sage.js contributors.\n"
            "// GPL-2.0-or-later, without warranty.\n"
            "fn call(pointer: *const u8) { unsafe { core::ptr::read(pointer); } }\n"
        )
        self.assertEqual(receipt["summary"]["unsafeItemsMissingRationale"], 1)
        self.assertFalse(receipt["summary"]["promotionGatePassed"])

    def test_one_rationale_does_not_bless_later_unrelated_site(self):
        receipt = self.audit_fixture(
            "// Copyright (C) Sage.js contributors.\n"
            "// GPL-2.0-or-later, without warranty.\n"
            "fn first(pointer: *const u8) {\n"
            "  // SAFETY: the caller validated this first pointer.\n"
            "  unsafe { core::ptr::read(pointer); }\n"
            "  unsafe { core::ptr::read(pointer.add(1)); }\n"
            "}\n"
        )
        self.assertEqual(receipt["summary"]["unsafeItems"], 2)
        self.assertEqual(receipt["summary"]["unsafeItemsMissingRationale"], 1)

    def test_rust_callback_and_attribute_export_are_boundaries(self):
        receipt = self.audit_fixture(
            "// Copyright (C) Sage.js contributors.\n"
            "// GPL-2.0-or-later, without warranty.\n"
            'type Callback = extern "C" fn(i32) -> i32;\n'
            '#[unsafe(export_name = "exported_name")]\n'
            "pub fn exported(value: i32) -> i32 { value }\n"
        )
        self.assertEqual(receipt["summary"]["ffiBoundaries"], 2)
        self.assertEqual(
            {item["kind"] for item in receipt["ffiBoundaries"]},
            {"rust_ffi_function_pointer_type", "rust_symbol_export_attribute"},
        )
        self.assertEqual(receipt["summary"]["unclassifiedFfiTokens"], 0)

    def test_rust_imported_static_raw_identifier_and_link_name(self):
        receipt = self.audit_fixture(
            "// Copyright (C) Sage.js contributors.\n"
            "// GPL-2.0-or-later, without warranty.\n"
            'unsafe extern "C" {\n'
            "  static COUNT: i32;\n"
            "  fn r#type();\n"
            '  #[link_name = "actual_symbol"] fn logical();\n'
            "}\n"
        )
        by_name = {item.get("name"): item for item in receipt["ffiBoundaries"]}
        self.assertIn("COUNT", by_name)
        self.assertIn("r#type", by_name)
        self.assertEqual(by_name["logical"]["linkedName"], "actual_symbol")

    def test_cpp_attribute_export_is_detected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "src").mkdir()
            (root / "src/bridge.cpp").write_text(
                "// Copyright (C) Sage.js contributors.\n"
                "// GPL-2.0-or-later, without warranty.\n"
                '__attribute__((visibility("default")))\n'
                "int arbitrary_export_name(void) { return 0; }\n"
            )
            receipt = AUDIT.build_receipt(root)
        self.assertEqual(receipt["summary"]["ffiBoundaries"], 1)
        self.assertEqual(receipt["ffiBoundaries"][0]["name"], "arbitrary_export_name")

    def test_cpp_linkage_noexcept_trailing_attribute_and_pointer_return(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "src").mkdir()
            (root / "src/bridge.cpp").write_text(
                "// Copyright (C) Sage.js contributors.\n"
                "// GPL-2.0-or-later, without warranty.\n"
                'extern "C" {\n'
                "int linked(void) noexcept { return 1; }\n"
                "}\n"
                'int attributed(void) __attribute__((visibility("default"))) { return 2; }\n'
                "void (*pointer_return(void))(void) { return 0; }\n"
            )
            receipt = AUDIT.build_receipt(root)
        self.assertEqual(receipt["summary"]["unclassifiedFfiTokens"], 0)
        self.assertEqual(
            {item["name"] for item in receipt["ffiBoundaries"]},
            {"linked", "attributed", "pointer_return"},
        )

    def test_c_boundary_macro_fails_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "src").mkdir()
            (root / "src/bridge.c").write_text(
                "// Copyright (C) Sage.js contributors.\n"
                "// GPL-2.0-or-later, without warranty.\n"
                "#define EXPORT(name) int name(void) { return 1; }\n"
                "EXPORT(generated_name)\n"
            )
            receipt = AUDIT.build_receipt(root)
        self.assertGreater(receipt["summary"]["unclassifiedFfiTokens"], 0)
        self.assertFalse(receipt["summary"]["documentationGatePassed"])

    def test_header_declaration_is_a_boundary(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "src").mkdir()
            (root / "src/bridge.h").write_text(
                "// Copyright (C) Sage.js contributors.\n"
                "// GPL-2.0-or-later, without warranty.\n"
                "int arbitrary_api(const unsigned char *input, unsigned long length);\n"
            )
            receipt = AUDIT.build_receipt(root)
        self.assertEqual(receipt["summary"]["ffiBoundaries"], 1)
        self.assertEqual(
            receipt["ffiBoundaries"][0]["kind"], "c_header_ffi_declaration"
        )

    def test_unknown_source_layout_fails_scope_classification(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "native").mkdir()
            (root / "native/core.rs").write_text(
                "// Copyright (C) Sage.js contributors.\n"
                "// GPL-2.0-or-later, without warranty.\n"
            )
            receipt = AUDIT.build_receipt(root)
        self.assertEqual(receipt["summary"]["unclassifiedSourceScopes"], 1)
        self.assertFalse(receipt["summary"]["documentationGatePassed"])

    def test_c_boundary_excludes_static_helpers_and_records_program_entry(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "src").mkdir()
            (root / "src/bridge.c").write_text(
                "// Copyright (C) Sage.js contributors.\n"
                "// GPL-2.0-or-later, without warranty.\n"
                "static int sagejs_internal(void) { return 1; }\n"
                "// FFI-SAFETY: accepts no pointers and returns a plain integer.\n"
                "int sagejs_exported(void) { return sagejs_internal(); }\n"
                "int main(void) { return 0; }\n"
            )
            receipt = AUDIT.build_receipt(root)
        self.assertEqual(receipt["summary"]["ffiBoundaries"], 2)
        by_name = {item["name"]: item for item in receipt["ffiBoundaries"]}
        self.assertEqual(set(by_name), {"sagejs_exported", "main"})
        self.assertTrue(by_name["sagejs_exported"]["safetyRationale"]["present"])
        self.assertEqual(by_name["main"]["kind"], "c_program_entry")

    def test_receipt_hash_detects_mutation(self):
        receipt = self.audit_fixture(
            "// Copyright (C) Sage.js contributors.\n"
            "// GPL-2.0-or-later, without warranty.\n"
        )
        self.assertEqual(AUDIT.validate_shape(receipt), [])
        receipt["claims"]["productionQualified"] = True
        self.assertIn(
            "inventorySha256 does not authenticate the receipt content",
            AUDIT.validate_shape(receipt),
        )

    def test_comments_strings_and_build_output_are_not_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "src").mkdir()
            (root / "target/debug").mkdir(parents=True)
            (root / "src/lib.rs").write_text(
                "// Copyright (C) Sage.js contributors.\n"
                "// GPL-2.0-or-later, without warranty.\n"
                'const WORD: &str = "unsafe { extern \\"C\\" }";\n'
                "// unsafe { ignored(); }\n"
            )
            (root / "target/debug/generated.rs").write_text("unsafe { generated(); }\n")
            receipt = AUDIT.build_receipt(root)
        self.assertEqual(receipt["summary"]["unsafeItems"], 0)
        self.assertEqual(receipt["summary"]["sourceFiles"], 1)
        self.assertNotIn("excludedGeneratedOrBuildFiles", receipt["summary"])


if __name__ == "__main__":
    unittest.main()
