@echo off
chcp 65001 >nul
title rvn Secure Tunnel
if exist "%~dp0start-rvn-tunnel.ps1" (
  powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0start-rvn-tunnel.ps1" -OpenDashboard
) else (
  powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%USERPROFILE%\Downloads\tunnel\start-rvn-tunnel.ps1" -OpenDashboard
)
if errorlevel 1 pause
