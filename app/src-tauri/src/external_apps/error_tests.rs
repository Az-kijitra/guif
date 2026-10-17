//! TDD (unit-test-writer, 2026-10-17): `external_apps/error.rs` -- `LaunchError` -> the wire DTO the front end gets.
//! Specs: SPEC-0300-0021 §9 (the screen builds the wording from a machine-readable code; the backend never composes Japanese:
//! SPEC-0300-0019 R-1201 2), R-1571 (`program_not_found` carries the EXPANDED program), R-1573 (`os_error` carries the OS text
//! untouched: not translated, not trimmed, `(os error N)` kept), R-1576 (`invalid_path`), R-1577 (`e2e_scope_violation`),
//! SPEC-0200-0001 §3.16.3 (`ExternalAppErrorDto { code, program?, message? }`, camelCase) and §3.16.9.
//!
//! Contract the implementer must satisfy (module `external_apps::error`, declared in `external_apps/mod.rs` as
//! `#[cfg(test)] mod error_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, Serialize)] #[serde(rename_all = "camelCase")]
//! pub struct ExternalAppErrorDto { pub code: String, pub program: Option<String>, pub message: Option<String> }
//! impl From<LaunchError> for ExternalAppErrorDto { .. }
//! // codes: InvalidPath -> "invalid_path", UnknownApp -> "unknown_app", ProgramNotFound -> "program_not_found" (+ program),
//! //        TargetMissing -> "target_missing", ScopeViolation -> "e2e_scope_violation", Os -> "os_error" (+ message)
//! ```

use super::error::{ExternalAppErrorDto, LaunchError};

fn dto(e: LaunchError) -> ExternalAppErrorDto {
    ExternalAppErrorDto::from(e)
}

#[test]
fn every_error_has_its_wire_code() {
    assert_eq!(dto(LaunchError::InvalidPath).code, "invalid_path");
    assert_eq!(dto(LaunchError::UnknownApp).code, "unknown_app");
    assert_eq!(dto(LaunchError::ProgramNotFound { program: "x".into() }).code, "program_not_found");
    assert_eq!(dto(LaunchError::TargetMissing).code, "target_missing");
    assert_eq!(dto(LaunchError::ScopeViolation("outside".into())).code, "e2e_scope_violation");
    assert_eq!(dto(LaunchError::Os { message: "m".into() }).code, "os_error");
}

#[test]
fn the_codes_that_need_no_detail_carry_none() {
    for e in [LaunchError::InvalidPath, LaunchError::UnknownApp, LaunchError::TargetMissing] {
        let d = dto(e.clone());
        assert_eq!((d.program, d.message), (None, None), "{e:?}");
    }
}

#[test]
fn program_not_found_carries_the_expanded_program_exactly() {
    let d = dto(LaunchError::ProgramNotFound { program: r"C:\Users\u\AppData\Local\GitHubDesktop\GitHubDesktop.exe".into() });
    assert_eq!(d.program.as_deref(), Some(r"C:\Users\u\AppData\Local\GitHubDesktop\GitHubDesktop.exe"));
}

#[test]
fn os_error_carries_the_os_text_untouched() {
    for message in ["アクセスが拒否されました。 (os error 5)", " leading and trailing  ", "The requested operation requires elevation. (os error 740)", ""] {
        let d = dto(LaunchError::Os { message: message.to_string() });
        assert_eq!(d.message.as_deref(), Some(message), "R-1573: neither translated nor trimmed");
    }
}

#[test]
fn the_dto_serializes_in_camel_case_with_the_code_as_a_string() {
    // serde_json is not a dependency: checked through the `toml` serializer like the other DTO tests; None fields are skipped.
    let s = toml::to_string(&dto(LaunchError::ProgramNotFound { program: r"C:\x\y.exe".into() })).expect("serialize");
    assert!(s.contains("code = \"program_not_found\""), "{s}");
    assert!(s.contains("program = "), "{s}");
    let s = toml::to_string(&dto(LaunchError::Os { message: "boom (os error 5)".into() })).expect("serialize");
    assert!(s.contains("code = \"os_error\""), "{s}");
    assert!(s.contains("message = \"boom (os error 5)\""), "{s}");
}

#[test]
fn no_japanese_wording_is_built_in_the_backend() {
    // SPEC-0300-0019 R-1201 2: the wording lives on the screen. A DTO built from any error contains only codes and raw values.
    for e in [
        LaunchError::InvalidPath,
        LaunchError::UnknownApp,
        LaunchError::TargetMissing,
        LaunchError::ScopeViolation("e2e scope".into()),
        LaunchError::ProgramNotFound { program: "p.exe".into() },
        LaunchError::Os { message: "os text".into() },
    ] {
        let d = dto(e);
        let all = format!("{}{}{}", d.code, d.program.unwrap_or_default(), d.message.unwrap_or_default());
        assert!(all.chars().all(|c| !('\u{3000}'..='\u{9FFF}').contains(&c)), "{all}");
    }
}
