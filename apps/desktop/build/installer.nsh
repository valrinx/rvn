!macro customInstall
  ; Resolve the shortcut from the actual end-user install directory at install time.
  SetOutPath "$INSTDIR"
  CreateDirectory "$SMPROGRAMS"
  CreateShortCut "$SMPROGRAMS\rvn.lnk" "$INSTDIR\rvn.exe" "" "$INSTDIR\rvn.exe" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\rvn.lnk"
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to keep your user settings and workspaces data?$\n$\n(กด 'Yes' เพื่อเก็บข้อมูลการตั้งค่าและ Workspace ไว้$\nกด 'No' เพื่อลบข้อมูลผู้ใช้ทั้งหมดออกจากเครื่อง)" IDYES keepData
    RMDir /r "$APPDATA\rvn"
    RMDir /r "$LOCALAPPDATA\rvn"
    RMDir /r "$LOCALAPPDATA\rvn-updater"
  keepData:
!macroend
