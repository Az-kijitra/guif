//! TDD (unit-test-writer, 2026-10-17): `external_apps/template.rs` -- the argument template (`{path}` / `{dir}` /
//! `{{` / `}}`) and its substitution.
//! Specs: SPEC-0300-0021 R-1520 (the table), R-1522 (per element, left to right, ONE pass, the substituted value is
//! never rescanned; a `{...}` outside the table, an unpaired `{` / `}` is a syntax error), R-1523 (each element stays ONE
//! argument), R-1524 (no `%` expansion in `args`), R-1503 3, AC-1511; SPEC-0200-0001 §3.16.2 (`template.rs`).
//!
//! Contract the implementer must satisfy (module `external_apps::template`, declared in `external_apps/mod.rs` as
//! `#[cfg(test)] mod template_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, PartialEq, Eq)] pub struct Template { .. }
//! #[derive(Debug, Clone, PartialEq, Eq)] pub struct TemplateError { .. }       // any payload
//! pub fn parse(arg: &str) -> Result<Template, TemplateError>;                  // syntax check (also used by registry validation)
//! impl Template { pub fn render(&self, path: &str, dir: &str) -> String; }     // infallible once parsed
//! ```

use super::template::{parse, Template};

fn render(arg: &str, path: &str, dir: &str) -> String {
    parse(arg).unwrap_or_else(|e| panic!("`{arg}` must be a valid template: {e:?}")).render(path, dir)
}

fn is_invalid(arg: &str) -> bool {
    parse(arg).is_err()
}

// ------------------------------------------------------------------ the substitutions (R-1520)

#[test]
fn path_and_dir_are_replaced_by_their_values() {
    assert_eq!(render("{path}", r"C:\t\d d\a b.txt", r"C:\t\d d"), r"C:\t\d d\a b.txt");
    assert_eq!(render("{dir}", r"C:\t\d d\a b.txt", r"C:\t\d d"), r"C:\t\d d");
}

#[test]
fn a_part_of_an_element_may_be_replaced_and_literal_text_is_kept() {
    assert_eq!(render("/select,{path}", r"C:\x\a.txt", r"C:\x"), r"/select,C:\x\a.txt");
    assert_eq!(render("a{path}b", "P", "D"), "aPb");
    assert_eq!(render("{path}{dir}", "P", "D"), "PD");
    assert_eq!(render("-d", "P", "D"), "-d");
    assert_eq!(render("", "P", "D"), "");
}

#[test]
fn doubled_braces_are_the_brace_characters() {
    assert_eq!(render("{{", "P", "D"), "{");
    assert_eq!(render("}}", "P", "D"), "}");
    assert_eq!(render("{{x}}", "P", "D"), "{x}");
}

#[test]
fn doubled_braces_are_taken_before_a_placeholder_left_to_right() {
    // `{{path}}` is the literal text `{path}`, not a substitution.
    assert_eq!(render("{{path}}", "P", "D"), "{path}");
    // `{{` then `{path}` then `}}`.
    assert_eq!(render("{{{path}}}", "P", "D"), "{P}");
    assert_eq!(render("{{{dir}", "P", "D"), "{D");
}

// ------------------------------------------------------------------ one pass, no rescanning (R-1522 / AC-1511)

#[test]
fn a_substituted_value_is_never_rescanned() {
    let path = r"C:\w\{dir}\{path}\%TEMP%;&\{{x}}";
    assert_eq!(render("{path}", path, "D"), path);
    assert_eq!(render("a{path}b", path, "D"), format!("a{path}b"));
    assert_eq!(render("{path}{dir}", path, r"C:\w\{dir}"), format!(r"{path}C:\w\{{dir}}"));
}

#[test]
fn ac1511_the_three_example_elements() {
    let path = r"C:\w\{dir}\%TEMP%;&";
    let dir = r"C:\w";
    let rendered: Vec<String> = ["{{x}}", "a{path}b", "{path}{dir}"].iter().map(|a| render(a, path, dir)).collect();
    assert_eq!(rendered, vec!["{x}".to_string(), format!("a{path}b"), format!("{path}{dir}")]);
    assert_eq!(rendered.len(), 3, "the number of elements never changes (R-1523)");
}

#[test]
fn a_value_with_spaces_and_quotes_is_inserted_as_is_without_splitting_or_escaping() {
    let path = r#"C:\a b\"q",;&%.txt"#;
    assert_eq!(render("{path}", path, "D"), path);
    assert_eq!(render("x {path} y", path, "D"), format!("x {path} y"));
}

// ------------------------------------------------------------------ `%` is not expanded in args (R-1524)

#[test]
fn percent_signs_in_an_argument_are_left_alone() {
    assert_eq!(render("%TEMP%", "P", "D"), "%TEMP%");
    assert_eq!(render("100%", "P", "D"), "100%");
    assert_eq!(render(r"%LOCALAPPDATA%\x", "P", "D"), r"%LOCALAPPDATA%\x");
}

// ------------------------------------------------------------------ syntax errors (R-1522 / R-1503 3)

#[test]
fn a_placeholder_outside_the_table_is_a_syntax_error() {
    for bad in ["{cwd}", "{file}", "{name}", "{}", "{ path }", "{path }", "{ dir}", "{1}", "{path.x}"] {
        assert!(is_invalid(bad), "`{bad}` must be rejected");
    }
}

#[test]
fn the_placeholder_names_are_case_sensitive() {
    for bad in ["{PATH}", "{Path}", "{DIR}", "{Dir}", "{pAth}"] {
        assert!(is_invalid(bad), "`{bad}` must be rejected (AC-1511)");
    }
}

#[test]
fn unpaired_braces_are_a_syntax_error() {
    // `{path}}` = `{path}` then a lone `}`; `{{{` = `{{` then a lone `{`; `}}}` = `}}` then a lone `}`.
    for bad in ["{", "}", "a{", "a}", "{path", "path}", "{{{", "}}}", "{{}", "{path}}", "x{y"] {
        assert!(is_invalid(bad), "`{bad}` must be rejected");
    }
}

#[test]
fn valid_templates_parse_to_a_template_value() {
    let t: Template = parse("-d").expect("a plain argument is valid");
    assert_eq!(t.render("P", "D"), "-d");
    for ok in ["{path}", "{dir}", "{{}}", "{{x}}", "a{path}b{dir}c", "日本語{path}", "%X%{dir}"] {
        assert!(!is_invalid(ok), "`{ok}` must be valid");
    }
}

#[test]
fn rendering_is_a_pure_function_of_the_values() {
    let t = parse(r"{dir}\{{x}}").unwrap();
    assert_eq!(t.render("P", "D1"), r"D1\{x}");
    assert_eq!(t.render("P", "D2"), r"D2\{x}");
    assert_eq!(t.render("P", "D1"), r"D1\{x}");
}
