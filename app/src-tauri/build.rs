fn main() {
    // Registers every app command so that tauri-build autogenerates its
    // `allow-*` / `deny-*` ACL permissions, referenced by
    // capabilities/default.json. A command missing here (or from the
    // capability) is rejected at run time with "not allowed by ACL"
    // (SPEC-0200-0001 §16 MUST-64); `src/acl_consistency.rs` checks that
    // generate_handler! (lib.rs), this list and the capability agree.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&[
                "fs_list_dir",
                "config_load_navigation",
                "config_save_navigation",
                "fs_ops_copy",
                "fs_ops_move",
                "fs_ops_cancel",
                "fs_ops_delete_trash",
                "fs_ops_delete_permanently",
                "fs_ops_rename",
                "fs_ops_create",
                "fs_ops_detect_conflicts",
                "archive_check_create",
                "archive_create",
                "archive_detect_conflicts",
                "archive_extract",
                "archive_cancel",
                "viewer_classify_path",
                "viewer_open",
                "viewer_os_open_path",
                "viewer_take_pending",
                "viewer_read_text",
                "viewer_read_image",
                "viewer_navigate",
            ])),
    )
    .expect("failed to run tauri-build");
}
