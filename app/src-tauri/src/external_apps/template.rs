//! The argument template (SPEC-0300-0021 R-1520 / R-1522 / R-1523 / R-1524; SPEC-0200-0001 §3.16.2).
//!
//! `{path}` and `{dir}` are replaced; `{{` and `}}` are the brace characters. Anything else with a brace (`{cwd}`, `{}`,
//! `{PATH}`, a lone `{` or `}`) is a syntax error. Parsing is left to right in one pass, and a substituted value is never
//! scanned again. `%` is not special here (R-1524). One element always stays ONE argument (the caller never splits).

#[derive(Debug, Clone, PartialEq, Eq)]
enum Piece {
    Literal(String),
    Path,
    Dir,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Template {
    pieces: Vec<Piece>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TemplateError {
    pub reason: String,
}

fn error(reason: &str) -> TemplateError {
    TemplateError { reason: reason.to_string() }
}

/// Syntax check and parse of one argument element.
pub fn parse(arg: &str) -> Result<Template, TemplateError> {
    let mut pieces = Vec::new();
    let mut literal = String::new();
    let mut chars = arg.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '{' if chars.peek() == Some(&'{') => {
                chars.next();
                literal.push('{');
            }
            '}' if chars.peek() == Some(&'}') => {
                chars.next();
                literal.push('}');
            }
            '}' => return Err(error("an unpaired closing brace")),
            '{' => {
                let mut name = String::new();
                loop {
                    match chars.next() {
                        Some('}') => break,
                        Some(c) => name.push(c),
                        None => return Err(error("an unpaired opening brace")),
                    }
                }
                let piece = match name.as_str() {
                    "path" => Piece::Path,
                    "dir" => Piece::Dir,
                    _ => return Err(error("a placeholder that is not in the table")),
                };
                if !literal.is_empty() {
                    pieces.push(Piece::Literal(std::mem::take(&mut literal)));
                }
                pieces.push(piece);
            }
            other => literal.push(other),
        }
    }
    if !literal.is_empty() {
        pieces.push(Piece::Literal(literal));
    }
    Ok(Template { pieces })
}

impl Template {
    /// Infallible once parsed. The values are inserted as they are.
    pub fn render(&self, path: &str, dir: &str) -> String {
        let mut out = String::new();
        for piece in &self.pieces {
            match piece {
                Piece::Literal(text) => out.push_str(text),
                Piece::Path => out.push_str(path),
                Piece::Dir => out.push_str(dir),
            }
        }
        out
    }
}
