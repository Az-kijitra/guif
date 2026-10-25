// shared/ipc/fuzzy.ts: thin Tauri invoke wrapper for in-app recursive fuzzy search.

import { invoke } from "@tauri-apps/api/core";

export interface FuzzyMatchItem {
  path: string;
  relativePath: string;
  name: string;
  isDir: boolean;
  matchIndices: number[];
  score: number;
}

export interface FsFuzzySearchParams {
  path: string;
  query: string;
  maxResults?: number;
}

export async function fsFuzzySearch(params: FsFuzzySearchParams): Promise<FuzzyMatchItem[]> {
  return invoke<FuzzyMatchItem[]>("fs_fuzzy_search", {
    path: params.path,
    query: params.query,
    maxResults: params.maxResults ?? 100,
  });
}
