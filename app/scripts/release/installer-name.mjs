// The file name Tauri gives the NSIS installer (SPEC-0600-0001 R-1401 / T-08: x64 only). Node built-ins only.

/**
 * `<productName>_<version>_x64-setup.exe`, derived from the configuration (nothing is hard-coded).
 * @param {{ productName: string, version: string }} conf
 */
export function expectedInstallerName(conf) {
  return `${conf.productName}_${conf.version}_x64-setup.exe`;
}
