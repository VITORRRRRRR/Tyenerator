@echo off
setlocal
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=4173"

where python >nul 2>nul
if not errorlevel 1 (
  set "PYTHON=python"
  goto :run
)

where py >nul 2>nul
if not errorlevel 1 (
  set "PYTHON=py -3"
  goto :run
)

echo.
echo   Python 3 was not found on PATH.
echo   Install Python 3, or run a static server manually:
echo.
echo     cd /d "%~dp0"
echo     python -m http.server %PORT% --bind 127.0.0.1
echo.
pause
exit /b 1

:run
echo.
echo   HORNTYPE / local server
echo   http://127.0.0.1:%PORT%/
echo   Press Ctrl+C to stop.
echo.
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:%PORT%/"
%PYTHON% -m http.server %PORT% --bind 127.0.0.1
endlocal
