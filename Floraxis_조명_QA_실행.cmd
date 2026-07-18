@echo off
chcp 65001 >nul
title Floraxis Lighting QA Server
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch-floraxis-lighting-qa.ps1" %*

if errorlevel 1 (
  echo.
  echo [ERROR] Floraxis Lighting QA could not start.
  echo Review the message above, then try again.
  pause
)
