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
