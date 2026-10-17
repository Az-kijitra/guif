//! `LaunchError` and its wire form (SPEC-0300-0021 R-1571 .. R-1577; SPEC-0200-0001 §3.16.3, §3.16.9).
//!
//! The backend composes no wording (SPEC-0300-0019 R-1201 2): the DTO carries a machine-readable code plus raw values, and the
//! screen builds the sentence (W-95 .. W-99). An OS error text travels untouched (R-1573).

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchError {
    UnknownApp,
    InvalidPath,
    /// `program` is the EXPANDED value (R-1571).
    ProgramNotFound { program: String },
    TargetMissing,
    ScopeViolation(String),
    /// `message` is `io::Error::to_string()`, not translated, not trimmed.
    Os { message: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppErrorDto {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub program: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

fn dto(code: &str, program: Option<String>, message: Option<String>) -> ExternalAppErrorDto {
    ExternalAppErrorDto { code: code.to_string(), program, message }
}

impl From<LaunchError> for ExternalAppErrorDto {
    fn from(error: LaunchError) -> Self {
        match error {
            LaunchError::InvalidPath => dto("invalid_path", None, None),
            LaunchError::UnknownApp => dto("unknown_app", None, None),
            LaunchError::ProgramNotFound { program } => dto("program_not_found", Some(program), None),
            LaunchError::TargetMissing => dto("target_missing", None, None),
            // The scope text is a diagnostic for the E2E run only; the screen shows W-99 from the code.
            LaunchError::ScopeViolation(_) => dto("e2e_scope_violation", None, None),
            LaunchError::Os { message } => dto("os_error", None, Some(message)),
        }
    }
}
