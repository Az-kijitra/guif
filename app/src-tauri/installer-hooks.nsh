; installer-hooks.nsh -- Tauri NSIS installerHooks for ReflexFiles (SPEC-0600-0001 R-1441..R-1446,
; design SPEC-0200-0001 3.15.2 as overridden by 3.15.13 1).
;
; This file is read at the top level of the generated installer.nsi, before the first Section and before
; the pages. It does three things:
;   1. ReflexDetectOldProduct : read-only detection of the OLD product (ReflexFIles) in the three uninstall views.
;   2. Page custom ReflexOldProductPage : first page (interactive, /P, /UPDATE): show the guidance and quit.
;   3. Section "-ReflexOldProductCheck" : first (hidden) section, the only path that runs with /S: quit silently.
; The file is saved as UTF-8 with BOM because the generated installer is "Unicode true".

!define REFLEX_OLD_PRODUCT_NAME "ReflexFIles"
!define REFLEX_BUNDLE_ID        "dev.reflexfiles.successor"
!define REFLEX_MARK_VALUE       "BundleIdentifier"

Var ReflexOldFound

; Result: $ReflexOldFound = 1 when an uninstall entry named (key name or DisplayName) ReflexFIles exists whose
; BundleIdentifier mark is not this product's identifier (a missing mark counts as "old"); otherwise 0.
; StrCmp is case-insensitive on purpose (the old name differs from ours by case only); StrCmpS is used for the mark.
; Reads only. Registers $R0-$R4 are saved and restored. The registry view is returned to 64 at the exit.
Function ReflexDetectOldProduct
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  StrCpy $ReflexOldFound 0
  StrCpy $R4 0

  reflex_view:
  ; $R4: 0 = HKCU, 1 = HKLM (SetRegView 64), 2 = HKLM (SetRegView 32)
  StrCmp $R4 1 reflex_view64 0
  StrCmp $R4 2 reflex_view32 reflex_viewset
  reflex_view64:
  SetRegView 64
  Goto reflex_viewset
  reflex_view32:
  SetRegView 32
  reflex_viewset:
  StrCpy $R0 0

  reflex_enum:
  StrCmp $R4 0 0 reflex_enum_hklm
  EnumRegKey $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
  Goto reflex_enum_done
  reflex_enum_hklm:
  EnumRegKey $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
  reflex_enum_done:
  StrCmp $R1 "" reflex_view_end
  IntOp $R0 $R0 + 1
  StrCmp $R1 "${REFLEX_OLD_PRODUCT_NAME}" reflex_candidate 0
  StrCmp $R4 0 0 reflex_name_hklm
  ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
  Goto reflex_name_done
  reflex_name_hklm:
  ReadRegStr $R2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
  reflex_name_done:
  StrCmp $R2 "${REFLEX_OLD_PRODUCT_NAME}" reflex_candidate reflex_enum

  reflex_candidate:
  StrCmp $R4 0 0 reflex_mark_hklm
  ReadRegStr $R3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "${REFLEX_MARK_VALUE}"
  Goto reflex_mark_done
  reflex_mark_hklm:
  ReadRegStr $R3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "${REFLEX_MARK_VALUE}"
  reflex_mark_done:
  StrCmpS $R3 "${REFLEX_BUNDLE_ID}" reflex_enum 0
  StrCpy $ReflexOldFound 1
  Goto reflex_exit

  reflex_view_end:
  IntOp $R4 $R4 + 1
  StrCmp $R4 3 reflex_exit reflex_view

  reflex_exit:
  SetRegView 64
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd

; First page. Not shown when nothing old is found. With /S the page functions are not called (see the section below).
Function ReflexOldProductPage
  Call ReflexDetectOldProduct
  StrCmp $ReflexOldFound 1 reflex_page_found 0
  Abort

  reflex_page_found:
  IfSilent reflex_page_quit 0
  Push $R0
  ClearErrors
  ${GetOptions} $CMDLINE "/P" $R0
  IfErrors 0 reflex_page_quiet
  ClearErrors
  ${GetOptions} $CMDLINE "/UPDATE" $R0
  IfErrors 0 reflex_page_quiet
  Pop $R0
  MessageBox MB_OK|MB_ICONSTOP "旧製品の ${REFLEX_OLD_PRODUCT_NAME} がインストールされています。この ReflexFiles は ${REFLEX_OLD_PRODUCT_NAME} を置き換えるものです。先に、Windows の「設定」の「アプリ」(Windows 11 では「インストールされているアプリ」、Windows 10 では「アプリと機能」)から ${REFLEX_OLD_PRODUCT_NAME} をアンインストールしてから、もう一度このインストーラーを実行してください。${REFLEX_OLD_PRODUCT_NAME} の設定は引き継がれません。インストールを中止します。" /SD IDOK
  Goto reflex_page_quit

  reflex_page_quiet:
  Pop $R0

  reflex_page_quit:
  SetErrorLevel 2
  Quit
FunctionEnd

Page custom ReflexOldProductPage

; First (hidden) section: the only check that runs with /S. It also runs in the other modes as a second line of defence.
Section "-ReflexOldProductCheck"
  Call ReflexDetectOldProduct
  StrCmp $ReflexOldFound 1 0 reflex_section_ok
  SetErrorLevel 2
  Quit
  reflex_section_ok:
SectionEnd

; The mark that tells the next run that this uninstall entry belongs to this product (R-1444-3).
!macro NSIS_HOOK_PREINSTALL
  WriteRegStr SHCTX "${UNINSTKEY}" "${REFLEX_MARK_VALUE}" "${BUNDLEID}"
!macroend
