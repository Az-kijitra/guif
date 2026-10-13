import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0020 R-1330-1 (確定 T-10: the binding string is shown as is, but `Escape` -> `Esc`; a comma list shows the FIRST
//   one only; an empty string shows nothing), 【レビュー m-3】 (`Comma` etc. internal spellings are shown as the symbol; `exit` always shows
//   `Ctrl+Q` when it is empty), R-1331, AC-1322 [単体].
// Architecture: SPEC-0200-0001 §3.14.1-1 (`features/menu-bar/shortcut-format.ts`: from the NORMAL FORM string -- which `routes/` builds with the
//   keyboard feature's normalisation, because a feature may not import another feature -- to the display string). The lower-case /
//   re-ordering normalisation ("ctrl+shift+n" -> "Ctrl+Shift+N") is therefore tested in routes/menu-bar-shortcuts.test.ts, not here.
//
// Contract assumed (reported to the implementer):
//   formatShortcut(binding: string | undefined): string          // "" = show nothing
//   formatExitShortcut(binding: string | undefined): string      // formatShortcut(binding) || "Ctrl+Q"   (only for the 終了 item)
//
// Module under test (not yet implemented): ./shortcut-format.ts

import { formatExitShortcut, formatShortcut } from "./shortcut-format";

describe("formatShortcut (AC-1322)", () => {
  it.each([
    ["Enter", "Enter"],
    ["Shift+Enter", "Shift+Enter"],
    ["Ctrl+Shift+N", "Ctrl+Shift+N"],
    ["Ctrl+Alt+Z", "Ctrl+Alt+Z"],
    ["Delete", "Delete"],
    ["Backspace", "Backspace"],
    ["F2", "F2"],
    ["/", "/"],
    ["S", "S"],
    ["Ctrl+Y", "Ctrl+Y"],
  ] as const)("%s is shown as is: %s", (binding, shown) => {
    expect(formatShortcut(binding)).toBe(shown);
  });

  it("Escape -> Esc (also after modifiers)", () => {
    expect(formatShortcut("Escape")).toBe("Esc");
    expect(formatShortcut("Shift+Escape")).toBe("Shift+Esc");
  });

  it("【m-3】Comma (the internal spelling of the key ,) is shown as the symbol", () => {
    expect(formatShortcut("Ctrl+Comma")).toBe("Ctrl+,");
  });

  it("a comma-separated list shows the first binding only (R-32)", () => {
    expect(formatShortcut("Ctrl+Insert,Ctrl+C")).toBe("Ctrl+Insert");
    expect(formatShortcut("Delete,Ctrl+D,F8")).toBe("Delete");
  });

  it("spaces around the separator are ignored; Escape is converted in the FIRST binding only", () => {
    expect(formatShortcut("Escape, Ctrl+G")).toBe("Esc");
    expect(formatShortcut(" Ctrl+Insert , Ctrl+C")).toBe("Ctrl+Insert");
    expect(formatShortcut("Ctrl+K,Escape")).toBe("Ctrl+K");
  });

  it("an empty string (the action is disabled, R-31) and undefined show nothing", () => {
    expect(formatShortcut("")).toBe("");
    expect(formatShortcut(undefined)).toBe("");
    expect(formatShortcut("   ")).toBe("");
  });

  it("a list whose first element is empty shows nothing rather than skipping to the second", () => {
    expect(formatShortcut(",Ctrl+C")).toBe("");
  });
});

describe("formatExitShortcut (【m-3】 the 終了 item)", () => {
  it("an empty binding still shows Ctrl+Q (priority 1 always exits)", () => {
    expect(formatExitShortcut("")).toBe("Ctrl+Q");
    expect(formatExitShortcut(undefined)).toBe("Ctrl+Q");
  });

  it("the default and a different key", () => {
    expect(formatExitShortcut("Ctrl+Q")).toBe("Ctrl+Q");
    expect(formatExitShortcut("Q")).toBe("Q");
  });

  it("several bindings show the first one only (Ctrl+Q works anyway but the text is one key)", () => {
    expect(formatExitShortcut("Alt+F4,Ctrl+Q")).toBe("Alt+F4");
  });

  it("the Esc / comma conversions apply here too", () => {
    expect(formatExitShortcut("Escape")).toBe("Esc");
  });
});
