@echo off
chcp 65001 >nul
setlocal
title SALMOS - Conexion local
if /i "%~1"=="--sesion" goto setup
set "SALMOS_LAUNCHER=%~f0"
powershell -NoProfile -Command "$mutex=[System.Threading.Mutex]::new($false,'Local\SALMOS-Iniciador');$owned=$false;try{try{$owned=$mutex.WaitOne(0)}catch [System.Threading.AbandonedMutexException]{$owned=$true};if(-not $owned){Write-Host 'SALMOS ya se esta preparando o esta abierto. Deja abierta la primera ventana.';[void](Read-Host 'Presiona Enter para cerrar esta copia');exit 0};& $env:SALMOS_LAUNCHER --sesion;exit $LASTEXITCODE}finally{if($owned){$mutex.ReleaseMutex()};$mutex.Dispose()}"
exit /b %ERRORLEVEL%

:setup
echo Iniciador abierto. Preparando SALMOS; deja esta ventana abierta.
if not defined SALMOS_DATA if exist "E:\" set "SALMOS_DATA=E:\SALMOS-IA-datos"
if not defined SALMOS_DATA set "SALMOS_DATA=%LOCALAPPDATA%\SALMOS-IA-datos"
set "SALMOS_ENV=%SALMOS_DATA%\editor-entorno"
set "SALMOS_PROGRAM=%SALMOS_DATA%\editor-programa"
set "SALMOS_PY=%SALMOS_ENV%\Scripts\python.exe"
set "TEMP=%SALMOS_DATA%\temporales"
set "TMP=%TEMP%"
set "PIP_CACHE_DIR=%SALMOS_DATA%\cache-pip"
set "SALMOS_VERSION=26.9"
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
if not errorlevel 1 goto start
if not exist "%SALMOS_PROGRAM%\local_helper.py" goto error
echo La descarga no se completo. Voy a abrir la copia instalada.
"%SALMOS_PY%" "%SALMOS_PROGRAM%\local_helper.py" --help | findstr /C:"--prepare-editor" >nul
if not errorlevel 1 goto start
"%SALMOS_PY%" -u "%SALMOS_PROGRAM%\local_helper.py" --no-browser
if errorlevel 1 goto error
exit /b 0

:start
"%SALMOS_PY%" -u "%SALMOS_PROGRAM%\local_helper.py" --no-browser --prepare-editor
if errorlevel 1 goto error
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
