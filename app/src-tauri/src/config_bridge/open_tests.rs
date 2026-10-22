//! TDD (unit-test-writer, 2026-10-20): `config_bridge/open.rs` -- the wire form of the result of "設定ファイルを開く"
//! (SPEC-0300-0022 R-1605 / R-1665, SPEC-0300-0019 R-1201 (2) "the backend builds no Japanese sentence"; SPEC-0200-0001 §3.17.6).
//! The command itself (`settings_file_open(window, app)`: no path / program / argument parameter, `locate` for the path, the real
//! `OpenIo`) is covered by the static tests; the order of the steps by `settings_file/open_tests.rs`.
//!
//! ```ignore
//! #[derive(Debug, Clone, PartialEq, Eq, Serialize)] #[serde(rename_all = "camelCase")]
//! pub struct SettingsFileOpenDto { pub template_created: bool, pub sample_error: Option<String>, pub result: OpenResultDto }
//! #[derive(Debug, Clone, PartialEq, Eq, Serialize)]
//! pub struct OpenResultDto { pub kind: &'static str, #[serde(skip_serializing_if = "Option::is_none")] pub message: Option<String> }
//! impl From<settings_file::open::OpenOutcome> for SettingsFileOpenDto { ... }
//! // kind: "vscode" | "association" | "not_a_file" | "out_of_scope" | "open_failed" | "template_failed"
//! // message: the OS wording, verbatim, ONLY for "open_failed" / "template_failed" (and `sample_error` carries the same kind of text)
//! ```

use super::open::{OpenResultDto, SettingsFileOpenDto};
use crate::settings_file::open::{OpenOutcome, OpenResult};

fn dto(template_created: bool, sample_error: Option<&str>, result: OpenResult) -> SettingsFileOpenDto {
    SettingsFileOpenDto::from(OpenOutcome { template_created, sample_error: sample_error.map(str::to_string), result })
}

#[test]
fn every_result_maps_to_its_code_and_only_failures_carry_a_message() {
    let cases: [(OpenResult, &str, Option<&str>); 6] = [
        (OpenResult::VsCode, "vscode", None),
        (OpenResult::Association, "association", None),
        (OpenResult::NotAFile, "not_a_file", None),
        (OpenResult::OutOfScope, "out_of_scope", None),
        (OpenResult::OpenFailed("アクセスが拒否されました。 (os error 5)".into()), "open_failed", Some("アクセスが拒否されました。 (os error 5)")),
        (OpenResult::TemplateFailed("ディスクがいっぱいです".into()), "template_failed", Some("ディスクがいっぱいです")),
    ];
    for (result, kind, message) in cases {
        let d = dto(false, None, result);
        assert_eq!(d.result, OpenResultDto { kind, message: message.map(str::to_string) }, "{kind}");
    }
}

// R-1665: W-A4 needs `templateCreated`, W-A8 needs `sampleError` (verbatim OS text; the sentence is built on the screen).
#[test]
fn the_flags_for_w_a4_and_w_a8_pass_through() {
    let d = dto(true, Some("同じ名前のフォルダーがあります"), OpenResult::VsCode);
    assert!(d.template_created);
    assert_eq!(d.sample_error.as_deref(), Some("同じ名前のフォルダーがあります"));
    let d = dto(false, None, OpenResult::Association);
    assert!(!d.template_created && d.sample_error.is_none());
}

#[test]
fn the_dto_serializes_in_camel_case_and_omits_an_absent_message() {
    let s = toml::to_string(&dto(true, Some("x"), OpenResult::OpenFailed("m".into()))).unwrap();
    assert!(s.contains("templateCreated = true") && s.contains("sampleError = \"x\""), "{s}");
    assert!(s.contains("kind = \"open_failed\"") && s.contains("message = \"m\""), "{s}");
    let s = toml::to_string(&dto(false, None, OpenResult::VsCode)).unwrap();
    assert!(s.contains("kind = \"vscode\"") && !s.contains("message") && !s.contains("sampleError"), "{s}");
    assert!(!s.contains("template_created"), "{s}");
}
