//! The embedded original and how the scaffold / the sample are made of it (SPEC-0300-0022 R-1611 / R-1620 / R-1635 / R-1637;
//! SPEC-0200-0001 §3.17.3 / §3.17.7).
//!
//! `templates/config.sample.toml` is the ONE source of both texts (R-1637); nothing is composed from defaults at run time
//! (AC-1635). It differs between the two only in the lines that start with `#@template ` / `#@sample `, and it carries
//! `@VERSION@` where the app version goes. `render` is pure: the same original and version always give the same bytes.

/// R-1620: the user's settings file. Only the scaffold ever creates it, and only when nothing is there (`scaffold.rs`).
pub const CONFIG_FILE: &str = "config.toml";
/// R-1620: the up-to-date sample the app writes next to `config.toml` (its temporary name `config.sample.toml.tmp` does not start
/// with `config.toml`, R-1614).
pub const SAMPLE_FILE: &str = "config.sample.toml";

const ORIGINAL: &str = include_str!("../../templates/config.sample.toml");
const TEMPLATE_MARKER: &str = "#@template ";
const SAMPLE_MARKER: &str = "#@sample ";
const VERSION_PLACEHOLDER: &str = "@VERSION@";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// The first `config.toml` ("このファイルは自由に編集できます。…").
    Template,
    /// `config.sample.toml` ("このファイルは見本です。…").
    Sample,
}

/// The scaffold or the sample made of the embedded original (UTF-8, CRLF, no BOM; R-1611).
pub fn render(kind: Kind, version: &str) -> String {
    render_from(ORIGINAL, kind, version)
}

/// `render` on an explicit original. (1) A line of the OTHER kind's marker is dropped and the own marker becomes `## `; (2)
/// `@VERSION@` -> `version`; (3) every line break is `\r\n` whatever the original has (git's `autocrlf`), the text ends with
/// exactly one; (4) a BOM of the original is not carried over.
pub fn render_from(original: &str, kind: Kind, version: &str) -> String {
    let (own, other) = match kind {
        Kind::Template => (TEMPLATE_MARKER, SAMPLE_MARKER),
        Kind::Sample => (SAMPLE_MARKER, TEMPLATE_MARKER),
    };
    let original = original.strip_prefix('\u{feff}').unwrap_or(original);
    let mut out = String::with_capacity(original.len() + 256);
    for line in original.lines().filter(|line| !line.starts_with(other)) {
        match line.strip_prefix(own) {
            Some(rest) => {
                out.push_str("## ");
                out.push_str(rest);
            }
            None => out.push_str(line),
        }
        out.push_str("\r\n");
    }
    out.replace(VERSION_PLACEHOLDER, version)
}
