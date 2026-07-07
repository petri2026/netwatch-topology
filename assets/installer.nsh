; installer.nsh — Custom NSIS pages for Netwatch installer

!macro customInstall
  ; Check if Python is installed
  ReadRegStr $0 HKCU "Software\Python\PythonCore" ""
  StrCmp $0 "" 0 python_found
    ; Try HKLM
    ReadRegStr $0 HKLM "Software\Python\PythonCore" ""
  python_found:
  
  StrCmp $0 "" 0 skip_warning
    MessageBox MB_YESNO|MB_ICONINFORMATION \
      "Netwatch necessita do Python 3.11+ para funcionar.$\n$\nO Python nao foi detectado neste computador.$\n$\nDeseja abrir o site de download do Python agora?" \
      IDYES open_python_site IDNO skip_warning
    open_python_site:
      ExecShell "open" "https://www.python.org/downloads/"
  skip_warning:
!macroend

!macro customUnInstall
  ; Nothing special on uninstall
!macroend
