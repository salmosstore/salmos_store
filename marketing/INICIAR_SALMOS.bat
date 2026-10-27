@echo off
chcp 65001 >nul
setlocal
set "SALMOS_DATA=E:\SALMOS-IA-datos"
set "SALMOS_ENV=E:\SALMOS-IA-datos\editor-entorno"
set "SALMOS_PROGRAM=E:\SALMOS-IA-datos\editor-programa"
set "TEMP=E:\SALMOS-IA-datos\temporales"
set "TMP=E:\SALMOS-IA-datos\temporales"
set "PIP_CACHE_DIR=E:\SALMOS-IA-datos\cache-pip"
if not exist "E:\" goto error
if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%SALMOS_PROGRAM%" mkdir "%SALMOS_PROGRAM%"
if not exist "%SALMOS_ENV%\Scripts\python.exe" py -3.11 -m venv "%SALMOS_ENV%"
if errorlevel 1 goto error
"%SALMOS_ENV%\Scripts\python.exe" -c "import edge_tts,imageio_ffmpeg" >nul 2>&1
if not errorlevel 1 goto files
"%SALMOS_ENV%\Scripts\python.exe" -m pip install edge-tts==7.3.1 imageio-ffmpeg==0.6.0
if errorlevel 1 goto error
:files
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; foreach($name in @('local_helper.py','wan_worker.py','wan-preset.json','music_bridge.py','music_worker.py')){Invoke-WebRequest -UseBasicParsing -Uri ('https://salmos.com.ar/marketing/'+$name+'?v=19.0') -OutFile (Join-Path $env:SALMOS_PROGRAM $name)}"
if errorlevel 1 goto error
"%SALMOS_ENV%\Scripts\python.exe" -c "import socket,sys;s=socket.socket();s.settimeout(1);sys.exit(0 if s.connect_ex(('127.0.0.1',8765))==0 else 1)"
if errorlevel 1 goto start
 echo Cerra la ventana anterior de SALMOS Voz y MP4 antes de continuar.
pause
exit /b 0
:start
"%SALMOS_ENV%\Scripts\python.exe" "%SALMOS_PROGRAM%\local_helper.py" --no-browser
if errorlevel 1 goto error
exit /b 0
:error
 echo No se pudo abrir la conexion. Copia el mensaje de esta ventana.
pause
