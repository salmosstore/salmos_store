@echo off
chcp 65001 >nul
setlocal
title SALMOS - Conexion local
if not defined SALMOS_DATA if exist "E:\" set "SALMOS_DATA=E:\SALMOS-IA-datos"
if not defined SALMOS_DATA set "SALMOS_DATA=%LOCALAPPDATA%\SALMOS-IA-datos"
set "SALMOS_ENV=%SALMOS_DATA%\editor-entorno"
set "SALMOS_PROGRAM=%SALMOS_DATA%\editor-programa"
set "SALMOS_PY=%SALMOS_ENV%\Scripts\python.exe"
set "TEMP=%SALMOS_DATA%\temporales"
set "TMP=%TEMP%"
set "PIP_CACHE_DIR=%SALMOS_DATA%\cache-pip"
set "SALMOS_VERSION=26.8"
if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%SALMOS_PROGRAM%" mkdir "%SALMOS_PROGRAM%"
if not exist "%TEMP%\" goto error
if not exist "%SALMOS_PROGRAM%\" goto error

if exist "%SALMOS_PY%" goto check
echo Preparando el entorno de SALMOS con Python 3.11...
py -3.11 -m venv "%SALMOS_ENV%"
if not exist "%SALMOS_PY%" goto python_missing

:check
"%SALMOS_PY%" -c "import socket,sys;s=socket.socket();s.settimeout(1);sys.exit(0 if s.connect_ex(('127.0.0.1',8765))==0 else 1)"
if errorlevel 1 goto files
"%SALMOS_PY%" -c "import json,sys,urllib.request;sys.exit(0 if json.load(urllib.request.urlopen('http://127.0.0.1:8765/api/music',timeout=2)).get('audioApi')==2 else 1)" >nul 2>&1
if not errorlevel 1 goto opened
echo Cerra la ventana anterior del iniciador de SALMOS que usa el puerto 8765.
pause
goto check

:files
echo Comprobando los archivos de SALMOS...
powershell -NoProfile -Command "$ErrorActionPreference='Stop';$names=@('local_helper.py','wan_worker.py','wan-preset.json','music_bridge.py','music_worker.py','project_storage.py');$pending=Join-Path $env:TEMP ('salmos-'+[guid]::NewGuid());New-Item -ItemType Directory -Path $pending | Out-Null;try{foreach($name in $names){Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ('https://salmos.com.ar/marketing/'+$name+'?v='+$env:SALMOS_VERSION) -OutFile (Join-Path $pending $name)};& $env:SALMOS_PY -c 'import ast,json,pathlib,sys;p=pathlib.Path(sys.argv[1]);[ast.parse(f.read_bytes(),str(f)) for f in p.glob(''*.py'')];json.loads((p / ''wan-preset.json'').read_bytes())' $pending;if($LASTEXITCODE -ne 0){throw 'La descarga no contiene los archivos del iniciador.'};foreach($name in $names){Move-Item -Force -LiteralPath (Join-Path $pending $name) -Destination (Join-Path $env:SALMOS_PROGRAM $name)}}finally{Remove-Item -Recurse -Force -LiteralPath $pending}"
if not errorlevel 1 goto dependencies
if not exist "%SALMOS_PROGRAM%\local_helper.py" goto error
echo La descarga no se completo. Voy a abrir la copia instalada.

:dependencies
call :install edge_tts edge-tts==7.3.1
call :install imageio_ffmpeg imageio-ffmpeg==0.6.0
call :install faster_whisper faster-whisper==1.2.1

:start
"%SALMOS_PY%" -u "%SALMOS_PROGRAM%\local_helper.py" --no-browser
if errorlevel 1 goto error
exit /b 0

:install
"%SALMOS_PY%" -c "import %~1" >nul 2>&1
if not errorlevel 1 exit /b 0
echo Instalando %~1...
"%SALMOS_PY%" -m pip install --disable-pip-version-check --timeout 15 --retries 1 %~2
if errorlevel 1 echo No se pudo instalar %~1. SALMOS abrira con las funciones disponibles.
exit /b 0

:opened
echo SALMOS ya esta abierto. Volve al estudio de audio y toca Conectar iniciador.
pause
exit /b 0

:python_missing
echo No se encontro Python 3.11 para crear el entorno de SALMOS.
pause
exit /b 1

:error
echo No se pudo abrir la conexion local. El detalle figura arriba.
pause
exit /b 1
