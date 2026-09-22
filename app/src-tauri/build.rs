fn main() {
    // Registers `fs_list_dir` (app/src-tauri/src/fs/commands.rs) so that
    // tauri-build autogenerates its `allow-fs-list-dir` / `deny-fs-list-dir`
    // ACL permissions, referenced by capabilities/default.json.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["fs_list_dir"])),
    )
    .expect("failed to run tauri-build");
}
