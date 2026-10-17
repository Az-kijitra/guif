//! E2E test executable for the external-app launch (SPEC-0300-0021 R-1585 4; SPEC-0200-0001 §3.16.10, §3.16.15 SHOULD-217 (b), MINOR-32).
//!
//! It starts nothing. It appends ONE JSON line `{"exe":..,"args":[..],"cwd":..}` (its arguments one element at a time, without the program
//! name, and its working folder) to `<own file name>.record.jsonl` next to itself, and ends. With the argument `--rf-sleep=<ms>` it waits that
//! long first (AC-1527; the argument is recorded like the others) and then appends the end mark line `{"done":true}`.
//! Not a `[[bin]]`: it must not change `default-run` or the shipped files. std only.
#![forbid(unsafe_code)]

use std::env;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::Duration;

fn json_string(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn append(record: &Path, line: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(record) {
        let _ = file.write_all(format!("{line}\n").as_bytes());
    }
}

fn main() {
    let mut argv = env::args_os();
    let exe = argv.next().map(|a| a.to_string_lossy().into_owned()).unwrap_or_default();
    let args: Vec<String> = argv.map(|a| a.to_string_lossy().into_owned()).collect();
    let cwd = env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();

    let own = env::current_exe().unwrap_or_else(|_| PathBuf::from(&exe));
    let mut record = own.into_os_string();
    record.push(".record.jsonl");
    let record = PathBuf::from(record);

    let list = args.iter().map(|a| json_string(a)).collect::<Vec<_>>().join(",");
    append(&record, &format!("{{\"exe\":{},\"args\":[{}],\"cwd\":{}}}", json_string(&exe), list, json_string(&cwd)));

    let wait = args.iter().find_map(|a| a.strip_prefix("--rf-sleep=").and_then(|v| v.parse::<u64>().ok()));
    if let Some(ms) = wait {
        sleep(Duration::from_millis(ms));
        append(&record, "{\"done\":true}");
    }
}
