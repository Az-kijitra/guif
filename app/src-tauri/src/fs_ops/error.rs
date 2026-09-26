//! SPEC-0300-0011 §10 (R-84~R-88): error-code/message translation fallback
//! and the Undo/Redo scope-exclusion guard. Planned API (not yet
//! implemented — see `super::mod` doc comment):
//!
//! ```ignore
//! // Returns a human-readable translation for a known error code, or
//! // `None` when the code is unrecognized (the caller then falls back to
//! // displaying the original raw message untranslated, R-84).
//! pub fn translate_error_code(code: &str) -> Option<&'static str>;
//! ```

/// R-84/R-85/R-86: translate a documented error code into a human-readable
/// message. Returns `None` for an unrecognized code so the caller falls
/// back to displaying the original raw message (never nothing).
/// `permission_denied` has its own dedicated message, distinct from the
/// generic `io_error` fallback (R-86).
pub fn translate_error_code(code: &str) -> Option<&'static str> {
    Some(match code {
        // preflight (R-24, R-36, R-62, R-73~R-75)
        "invalid_name" => "名前に使用できない文字が含まれています。",
        "invalid_kind" => "種別が不正です。",
        "parent_not_found" => "作成先のフォルダが見つかりません。",
        "already_exists" => "同じ名前の項目がすでに存在します。",
        "same_path" => "コピー元と貼り付け先が同じです。",
        "not_found" => "対象が見つかりません。",
        "invalid_path" => "パスが正しくありません。",
        "no_items" => "対象が選択されていません。",
        "destination_not_found" => "宛先フォルダが見つかりません。",
        "destination_not_dir" => "宛先がフォルダではありません。",
        "destination_inside_source" => "宛先がコピー元の内部にあります。",
        // runtime (R-80, R-85, R-86)
        "permission_denied" => "権限がないため操作を実行できませんでした。",
        // R-85-1 (MUST-59): the copy/move source lies beneath the existing
        // destination item, so overwriting it would destroy the source.
        "overwrite_ancestor" => "コピー元が上書き対象の内部にあるため、上書きできません。",
        "conflict" => "同名の項目がすでに存在するため処理を中止しました。",
        "io_error" => "入出力エラーが発生しました。",
        "unknown" => "不明なエラーが発生しました。",
        "canceled" => "操作はキャンセルされました。",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // SPEC-0300-0011 AC-73 (R-84): an unrecognized error code has no
    // translation, so the caller must fall back to the original message
    // (never an empty display).
    #[test]
    fn ac73_unknown_error_code_has_no_translation() {
        assert_eq!(translate_error_code("totally_unknown_code_xyz"), None);
    }

    // SPEC-0300-0011 AC-71 (R-86): `permission_denied` is a recognized,
    // dedicated code with its own translated message — distinct from the
    // generic `io_error` fallback message.
    #[test]
    fn ac71_permission_denied_has_a_dedicated_translation_distinct_from_io_error() {
        let permission_denied_message = translate_error_code("permission_denied");
        let io_error_message = translate_error_code("io_error");

        assert!(permission_denied_message.is_some());
        assert!(io_error_message.is_some());
        assert_ne!(
            permission_denied_message, io_error_message,
            "R-86: permission_denied must not share the generic io_error message"
        );
    }

    // SPEC-0300-0011 R-85: every code in the documented preflight/runtime
    // error-code table has a translation (so none of them silently falls
    // back to a raw, untranslated message).
    #[test]
    fn r85_all_documented_error_codes_have_a_translation() {
        let documented_codes = [
            // preflight
            "invalid_name",
            "invalid_kind",
            "parent_not_found",
            "already_exists",
            "same_path",
            "not_found",
            "invalid_path",
            "no_items",
            "destination_not_found",
            "destination_not_dir",
            "destination_inside_source",
            // runtime
            "permission_denied",
            "conflict",
            "io_error",
            "unknown",
            "canceled",
            // 4th edition (R-85-1, MUST-59)
            "overwrite_ancestor",
        ];
        for code in documented_codes {
            assert!(
                translate_error_code(code).is_some(),
                "expected a translation for documented error code '{code}'"
            );
        }
    }

    // SPEC-0300-0011 R-85-1 / R-84 / AC-81 (4th ed.): `overwrite_ancestor` is a
    // documented code with its OWN message (not the generic conflict/io_error
    // ones), so the UI can explain why overwrite was refused.
    #[test]
    fn r85_1_overwrite_ancestor_has_a_dedicated_translation() {
        let message = translate_error_code("overwrite_ancestor");

        assert!(message.is_some(), "R-85-1: overwrite_ancestor must be translatable");
        assert_ne!(message, translate_error_code("conflict"));
        assert_ne!(message, translate_error_code("io_error"));
    }

    // SPEC-0300-0011 AC-74 (R-88): the source tree must contain no
    // Undo/Redo-scoped error code or translation strings (`undo_unavailable`
    // / `redo_unavailable`). Unlike the tests above, this one does not
    // depend on the not-yet-implemented `translate_error_code` and is
    // expected to already pass today — it is a standing regression guard,
    // not a red/TDD test (SPEC-0100-0005 R-08: no trace of scope-excluded
    // features).
    #[test]
    fn ac74_source_tree_has_no_undo_redo_error_strings() {
        // 自己言及回避: この検査自身のファイル(禁止文字列リテラルを保持する
        // ソースファイル)はスキャン対象から除外する。除外しない場合、この
        // テストは実装の正誤に関わらず常に自分自身を検出して失敗する
        // (自己言及的なテスト設計上のバグ。code-generatorが2026-09-23に検出)。
        let src_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let self_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(file!());
        let forbidden = ["undo_unavailable", "redo_unavailable"];
        let mut offending_files = Vec::new();

        fn walk(
            dir: &std::path::Path,
            forbidden: &[&str],
            self_path: &std::path::Path,
            offending: &mut Vec<std::path::PathBuf>,
        ) {
            let Ok(entries) = std::fs::read_dir(dir) else { return };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, forbidden, self_path, offending);
                } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
                    if path
                        .canonicalize()
                        .ok()
                        .zip(self_path.canonicalize().ok())
                        .is_some_and(|(a, b)| a == b)
                    {
                        continue;
                    }
                    if let Ok(contents) = std::fs::read_to_string(&path) {
                        if forbidden.iter().any(|needle| contents.contains(needle)) {
                            offending.push(path);
                        }
                    }
                }
            }
        }

        walk(&src_root, &forbidden, &self_path, &mut offending_files);
        assert!(
            offending_files.is_empty(),
            "found forbidden undo/redo error strings in: {offending_files:?}"
        );
    }
}
