@echo off
setlocal

REM INY local start helper: starts Flask API and opens browser.
cd /d "%~dp0"

if "%INY_ALLIANCE%"=="" set "INY_ALLIANCE=INY"
if "%INY_LOCAL_MEMBER%"=="" set "INY_LOCAL_MEMBER=Lion Tooth"

if "%MYSQL_HOST%"=="" (
  set /p MYSQL_HOST=MYSQL_HOST: 
)
if "%MYSQL_PORT%"=="" (
  set "MYSQL_PORT=4000"
)
if "%MYSQL_DATABASE%"=="" (
  set /p MYSQL_DATABASE=MYSQL_DATABASE: 
)
if "%MYSQL_USER%"=="" (
  set /p MYSQL_USER=MYSQL_USER: 
)
if "%MYSQL_PASSWORD%"=="" (
  set /p MYSQL_PASSWORD=MYSQL_PASSWORD: 
)

if "%MYSQL_HOST%"=="" goto :missing
if "%MYSQL_DATABASE%"=="" goto :missing
if "%MYSQL_USER%"=="" goto :missing
if "%MYSQL_PASSWORD%"=="" goto :missing

set "PYTHON_EXE=C:\Users\andre\AppData\Local\Programs\Python\Python312\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=py"

echo Starte Flask-Server auf http://127.0.0.1:5000 ...
start "INY Flask" cmd /k "cd /d %~dp0 && set INY_ALLIANCE=%INY_ALLIANCE% && set INY_LOCAL_MEMBER=%INY_LOCAL_MEMBER% && set MYSQL_HOST=%MYSQL_HOST% && set MYSQL_PORT=%MYSQL_PORT% && set MYSQL_DATABASE=%MYSQL_DATABASE% && set MYSQL_USER=%MYSQL_USER% && set MYSQL_PASSWORD=%MYSQL_PASSWORD% && %PYTHON_EXE% .\py\server.py"

echo Oeffne Browser ...
start "" "http://127.0.0.1:5000/index.html"
exit /b 0

:missing
echo.
echo Fehler: Es fehlen Datenbank-Variablen.
echo Bitte starte erneut und gib MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD ein.
exit /b 1
