//! The four default registrations as DATA (SPEC-0300-0021 R-1510 / R-1510-1; SPEC-0200-0001 §3.16.2).
//!
//! No wording lives here (the display names are the screen's W-90..W-93), and nothing else in `external_apps/` looks at
//! which default a registration is (AC-1534): a default is an ordinary registration that came from this table.
//! `program` is stored UNEXPANDED (`%NAME%` is expanded once at start-up by `registry.rs`).

/// One default registration. The order of `DEFAULT_APPS` is the number 1..=4 of R-1510.
pub struct DefaultApp {
    pub program: &'static str,
    pub args: &'static [&'static str],
    pub args_for_file: Option<&'static [&'static str]>,
    pub key: &'static str,
}

pub const DEFAULT_APPS: [DefaultApp; 4] = [
    DefaultApp { program: "wt.exe", args: &["-d", "{dir}"], args_for_file: None, key: "Ctrl+Alt+C" },
    DefaultApp {
        program: r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe",
        args: &["{path}"],
        args_for_file: None,
        key: "Ctrl+Alt+V",
    },
    // The file form is TWO elements (spike S-2): the one-element form does not reach the program through the standard quoting.
    DefaultApp {
        program: r"%SystemRoot%\explorer.exe",
        args: &["{dir}"],
        args_for_file: Some(&["/select,", "{path}"]),
        key: "Ctrl+Alt+E",
    },
    DefaultApp {
        program: r"%LOCALAPPDATA%\GitHubDesktop\GitHubDesktop.exe",
        args: &["{dir}"],
        args_for_file: None,
        key: "Ctrl+Alt+Shift+G",
    },
];
