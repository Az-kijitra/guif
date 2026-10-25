// File and folder icon resolution using Nerd Fonts glyphs.

export const ICONS = {
  folder: "\ue5ff", // 
  folderOpen: "\ue5fe", // 
  file: "\uf15b", // 
  fileText: "\uf15c", // 
  fileCode: "\ue796", // 
  archive: "\uf410", // 
  image: "\uf1c5", // 
  audio: "\uf1c7", // 
  video: "\uf1c8", // 
  pdf: "\uf1c1", // 
  markdown: "\uf48a", // 
  git: "\ue702", // 
  rust: "\ue7a8", // 
  typescript: "\ue628", // 
  javascript: "\ue60c", // 
  react: "\ue7ba", // 
  svelte: "\ue697", // 
  python: "\ue73c", // 
  go: "\ue627", // 
  c: "\ue61e", // 
  cpp: "\ue61d", // 
  csharp: "\udb80\udf1b", // 󰌛
  java: "\ue738", // 
  html: "\ue736", // 
  css: "\ue749", // 
  json: "\ue60b", // 
  toml: "\ue6b2", // 
  yaml: "\ue6a8", // 
  shell: "\ue795", // 
  powershell: "\udb82\ude0a", // 󰨊
  config: "\ue615", // 
  executable: "\uf17a", // 
  database: "\uf1c0", // 
  docker: "\udb80\udf64", // 󰡨
} as const;

const EXACT_NAME_ICONS: Record<string, string> = {
  ".gitignore": ICONS.git,
  ".gitattributes": ICONS.git,
  ".gitmodules": ICONS.git,
  "dockerfile": ICONS.docker,
  "docker-compose.yml": ICONS.docker,
  "docker-compose.yaml": ICONS.docker,
  "cargo.toml": ICONS.rust,
  "cargo.lock": ICONS.rust,
  "package.json": ICONS.json,
  "tsconfig.json": ICONS.typescript,
};

const EXTENSION_ICONS: Record<string, string> = {
  // Programming languages
  rs: ICONS.rust,
  ts: ICONS.typescript,
  tsx: ICONS.react,
  js: ICONS.javascript,
  mjs: ICONS.javascript,
  cjs: ICONS.javascript,
  jsx: ICONS.react,
  svelte: ICONS.svelte,
  py: ICONS.python,
  pyw: ICONS.python,
  ipynb: ICONS.python,
  go: ICONS.go,
  c: ICONS.c,
  h: ICONS.c,
  cpp: ICONS.cpp,
  hpp: ICONS.cpp,
  cc: ICONS.cpp,
  cxx: ICONS.cpp,
  cs: ICONS.csharp,
  java: ICONS.java,
  jar: ICONS.java,
  class: ICONS.java,
  php: ICONS.fileCode,
  rb: ICONS.fileCode,
  lua: ICONS.fileCode,
  sh: ICONS.shell,
  bash: ICONS.shell,
  zsh: ICONS.shell,
  ps1: ICONS.powershell,
  psm1: ICONS.powershell,
  psd1: ICONS.powershell,
  bat: ICONS.config,
  cmd: ICONS.config,

  // Web & Data
  html: ICONS.html,
  htm: ICONS.html,
  css: ICONS.css,
  scss: ICONS.css,
  sass: ICONS.css,
  less: ICONS.css,
  json: ICONS.json,
  jsonc: ICONS.json,
  toml: ICONS.toml,
  yaml: ICONS.yaml,
  yml: ICONS.yaml,
  xml: ICONS.fileCode,
  sql: ICONS.database,
  db: ICONS.database,
  sqlite: ICONS.database,

  // Documents
  md: ICONS.markdown,
  markdown: ICONS.markdown,
  txt: ICONS.fileText,
  log: ICONS.fileText,
  pdf: ICONS.pdf,
  doc: ICONS.fileText,
  docx: ICONS.fileText,
  xls: ICONS.fileText,
  xlsx: ICONS.fileText,
  csv: ICONS.fileText,

  // Config & Env
  ini: ICONS.config,
  conf: ICONS.config,
  cfg: ICONS.config,
  env: ICONS.config,

  // Media
  png: ICONS.image,
  jpg: ICONS.image,
  jpeg: ICONS.image,
  gif: ICONS.image,
  svg: ICONS.image,
  webp: ICONS.image,
  bmp: ICONS.image,
  ico: ICONS.image,
  mp3: ICONS.audio,
  wav: ICONS.audio,
  flac: ICONS.audio,
  aac: ICONS.audio,
  ogg: ICONS.audio,
  mp4: ICONS.video,
  mkv: ICONS.video,
  avi: ICONS.video,
  mov: ICONS.video,
  webm: ICONS.video,

  // Archives
  zip: ICONS.archive,
  tar: ICONS.archive,
  gz: ICONS.archive,
  "7z": ICONS.archive,
  rar: ICONS.archive,
  bz2: ICONS.archive,
  xz: ICONS.archive,

  // Binaries
  exe: ICONS.executable,
  msi: ICONS.executable,
  dll: ICONS.executable,
};

export function getFileIcon(name: string, isDir: boolean, isExpanded = false): string {
  if (isDir) {
    return isExpanded ? ICONS.folderOpen : ICONS.folder;
  }

  const lower = name.toLowerCase();
  const exact = EXACT_NAME_ICONS[lower];
  if (exact !== undefined) {
    return exact;
  }

  const lastDot = lower.lastIndexOf(".");
  if (lastDot >= 0 && lastDot < lower.length - 1) {
    const ext = lower.slice(lastDot + 1);
    const byExt = EXTENSION_ICONS[ext];
    if (byExt !== undefined) {
      return byExt;
    }
  }

  return ICONS.file;
}
