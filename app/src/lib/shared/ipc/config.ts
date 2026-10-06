// SPEC-0200-0001 §3.2.5 / §4.5: thin invoke() wrappers around the
// `config_load_navigation` / `config_save_navigation` commands registered in
// app/src-tauri/src/config/commands.rs (camelCase DTOs on the wire).

import { invoke } from "@tauri-apps/api/core";

export interface NavigationData {
  visitHistory: string[];
  jumpList: string[];
  searchHistory: string[];
}

export interface LoadNavigationResult {
  data: NavigationData;
  recoveredFromCorruption: boolean; // R-242 item 3
}

export function configLoadNavigation(): Promise<LoadNavigationResult> {
  return invoke<LoadNavigationResult>("config_load_navigation");
}

export function configSaveNavigation(data: NavigationData): Promise<void> {
  return invoke("config_save_navigation", { data });
}

// SPEC-0300-0010 R-45; SPEC-0200-0001 §3.6.2/§3.6.11.3: `config.toml`'s
// `input_keymap_custom` table and `ui_theme`, read-only, a snapshot taken once at startup. Raw entries only
// (no per-element validation, MUST-86 recommendation A) --
// `features/keyboard/keymap-validate.ts::validateKeymapEntries` does that.
export interface RawKeymapEntryDto {
  actionId: string;
  value: string | null;
}

export interface KeymapParseErrorDto {
  message: string;
  line: number | null;
  // R-917-5: true when the WHOLE file could not be read (the theme fell back too); false when only
  // `input_keymap_custom` had the wrong type.
  wholeFile: boolean;
}

export interface KeymapRawLoadResultDto {
  entries: RawKeymapEntryDto[];
  parseError: KeymapParseErrorDto | null;
  // SPEC-0300-0017 R-917-4; SPEC-0200-0001 §3.11.4: the interpreted `ui_theme`. A public value for
  // verification only (the screen's brightness is decided by CSS), and whether to report it.
  uiTheme: "system" | "light" | "dark";
  uiThemeInvalid: boolean;
}

export function configLoadKeymap(): Promise<KeymapRawLoadResultDto> {
  return invoke<KeymapRawLoadResultDto>("config_load_keymap");
}

// SPEC-0300-0009 R-77; SPEC-0200-0001 §3.6.1: `ui-state.toml` load/save
// (same shape as configLoadNavigation/configSaveNavigation).
export interface UiStateData {
  uiShowHidden: boolean;
  uiShowSize: boolean;
  uiShowTime: boolean;
  uiShowTree: boolean;
  sortKey: string;
  sortOrder: string;
}

export interface UiStateLoadResult {
  data: UiStateData;
  recoveredFromCorruption: boolean;
}

export function uiStateLoad(): Promise<UiStateLoadResult> {
  return invoke<UiStateLoadResult>("ui_state_load");
}

export function uiStateSave(data: UiStateData): Promise<void> {
  return invoke("ui_state_save", { data });
}
