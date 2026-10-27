"""SALMOS: complemento local de voz y conversión a MP4. No requiere cuentas."""
from __future__ import annotations
import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.parse
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import music_bridge

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / 'voces'
ALLOWED_ORIGINS = {'https://salmos.com.ar', 'https://www.salmos.com.ar', 'https://salmosstore.github.io'}
DEFAULT_VOICE = 'es_MX-ald-medium'
MAX_VIDEO_BYTES = 240 * 1024 * 1024
GENERATION_LOCK = threading.Lock()

def ffmpeg_executable():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError):
        return shutil.which('ffmpeg')

def has_piper():
    return importlib.util.find_spec('piper') is not None

def voice_files():
    voices = [{'id': p.stem, 'name': 'Español latino · Ald' if p.stem == DEFAULT_VOICE else p.stem}
              for p in MODELS.glob('*.onnx') if p.with_suffix('.onnx.json').is_file()]
    return voices or [{'id': DEFAULT_VOICE, 'name': 'Español latino · Ald (descarga inicial)'}]

def convert_video(source: Path, destination: Path):
    binary = ffmpeg_executable()
    if not binary:
        raise RuntimeError('Falta FFmpeg. Ejecutá PREPARAR_COMPLEMENTO.bat y volvé a abrir este programa.')
    result = subprocess.run([binary, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
        '-map', '0:v:0', '-map', '0:a?', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(destination)],
        capture_output=True, timeout=300, text=True, encoding='utf-8', errors='replace')
    if result.returncode or not destination.is_file():
        raise RuntimeError('No se pudo convertir ese video. Probá con una nueva exportación WebM o con calidad 720.')

def synthesize_voice(text: str, voice: str, destination: Path):
    if not has_piper():
        raise RuntimeError('Falta el relator. Ejecutá PREPARAR_COMPLEMENTO.bat y volvé a abrir el complemento.')
    available = {v['id'] for v in voice_files()}
    if voice not in available or not all(c.isalnum() or c in '_-' for c in voice):
        raise ValueError('Elegí una voz instalada.')
    MODELS.mkdir(exist_ok=True)
    model = MODELS / (voice + '.onnx')
    if not model.is_file():
        subprocess.run([sys.executable, '-m', 'piper.download_voices', voice, '--data-dir', str(MODELS)],
                       check=True, capture_output=True, timeout=240)
    text_path = destination.with_suffix('.txt')
    text_path.write_text(text, encoding='utf-8')
    result = subprocess.run([sys.executable, '-m', 'piper', '-m', str(model), '-f', str(destination),
        '--input-file', str(text_path)], capture_output=True, timeout=240,
        text=True, encoding='utf-8', errors='replace')
    if result.returncode or not destination.is_file():
        raise RuntimeError('No se pudo generar la voz. Revisá que la instalación haya terminado y probá un texto más corto.')

EDGE_VOICES = {
    'es-AR-ElenaNeural': 'Elena · Argentina', 'es-AR-TomasNeural': 'Tomás · Argentina',
    'es-MX-DaliaNeural': 'Dalia · México', 'es-MX-JorgeNeural': 'Jorge · México',
    'es-ES-ElviraNeural': 'Elvira · España', 'es-ES-AlvaroNeural': 'Álvaro · España'}

def has_edge():
    return importlib.util.find_spec('edge_tts') is not None

def powershell(script, **kwargs):
    return subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
        capture_output=True, timeout=60, text=True, encoding='utf-8', errors='replace', **kwargs)

def windows_voices():
    if sys.platform != 'win32':
        return []
    try:
        r = powershell("[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; @($s.GetInstalledVoices() | Where-Object {$_.VoiceInfo.Culture.Name -like 'es-*'} | ForEach-Object {$_.VoiceInfo.Name}) | ConvertTo-Json -Compress")
        if r.returncode:
            return []
        names = json.loads(r.stdout.strip() or '[]')
        return [names] if isinstance(names, str) else names
    except Exception:
        return []

WINDOWS_VOICES = windows_voices()

def all_voices():
    voices = [{'id': 'edge:' + v, 'name': name + ' · con internet'} for v, name in EDGE_VOICES.items()] if has_edge() else []
    voices += [{'id': 'windows:' + str(i), 'name': name + ' · Windows local'} for i, name in enumerate(WINDOWS_VOICES)]
    if has_piper():
        voices += voice_files()
    return voices

def synthesize_any(text, voice, pitch, destination):
    if voice.startswith('edge:'):
        if not has_edge():
            raise RuntimeError('Prepará el relator con PREPARAR_COMPLEMENTO.bat de esta versión.')
        name = voice[5:]
        if name not in EDGE_VOICES:
            raise ValueError('Elegí una voz de la lista.')
        import asyncio
        import edge_tts
        output = destination.with_suffix('.mp3')
        async def speak():
            job = edge_tts.Communicate(text, name, pitch=f'{pitch:+d}Hz')
            await asyncio.wait_for(job.save(str(output)), timeout=90)
        try:
            asyncio.run(speak())
        except Exception as error:
            raise RuntimeError('El servicio de voz con internet no respondió. Revisá la conexión o elegí una voz local de Windows. Tu proyecto sigue guardado.') from error
        if not output.exists() or output.stat().st_size < 100:
            raise RuntimeError('No se recibió audio. Probá otra voz o una frase más corta.')
        return output, 'audio/mpeg'
    if voice.startswith('windows:'):
        try:
            name = WINDOWS_VOICES[int(voice.split(':', 1)[1])]
        except (ValueError, IndexError):
            raise ValueError('Elegí una voz de Windows instalada.')
        payload = destination.with_suffix('.json')
        payload.write_text(json.dumps({'text': text, 'voice': name, 'output': str(destination)}), encoding='utf-8')
        env = os.environ.copy()
        env['SALMOS_VOICE_REQUEST'] = str(payload)
        script = "Add-Type -AssemblyName System.Speech; $r=Get-Content -LiteralPath $env:SALMOS_VOICE_REQUEST -Raw -Encoding UTF8 | ConvertFrom-Json; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; try {$s.SelectVoice($r.voice); $s.SetOutputToWaveFile($r.output); $s.Speak($r.text)} finally {$s.Dispose()}"
        r = powershell(script, env=env)
        if r.returncode or not destination.is_file():
            raise RuntimeError('La voz de Windows no pudo generar el audio.')
        return destination, 'audio/wav'
    synthesize_voice(text, voice, destination)
    return destination, 'audio/wav'

WAN_LOCK=threading.Lock()
WAN_DATA=Path(os.environ.get('SALMOS_WAN_DATA','E:/SALMOS-IA-datos/editor-videos'))
WAN_JOB=None
WAN_CLIPS={}

def wan_root():
    for root in (Path('E:/WanGP-main'),Path('E:/WanGP-main/WanGP-main')):
        if (root/'env_venv/Scripts/python.exe').is_file() and (root/'wgp.py').is_file():return root
    return None

def wan_state():
    root=wan_root()
    with WAN_LOCK:
        job=WAN_JOB
        if job:
            try:status=json.loads((job['folder']/'status.json').read_text(encoding='utf-8'))
            except (OSError,ValueError):status={'state':'running','message':'Preparando el motor de IA…','progress':0}
            if job['process'].poll() is not None and status['state'] not in ('done','error','cancelled'):
                status={'state':'error','message':'El motor se cerró. Revisá la ventana del programa local.','progress':0}
            status['id']=job['id']
        else:status=None
    return {'installed':bool(root),'compatible':bool(root and (root/'shared/api.py').is_file()),'job':status}

def wan_start(data):
    if music_bridge.busy():raise RuntimeError('Esperá a que termine la canción antes de generar movimiento.')
    global WAN_JOB
    import base64,re,uuid,socket
    root=wan_root()
    if not root or not (root/'shared/api.py').is_file():raise RuntimeError('No encuentro WanGP compatible instalado en E:/WanGP-main.')
    with socket.socket() as sock:
        sock.settimeout(.2)
        if sock.connect_ex(('127.0.0.1',7860))==0:raise RuntimeError('WanGP está abierto en otra ventana. Cerrá ese motor primero para liberar la GPU; SALMOS abrirá el instalado sin descargar modelos.')
    image=str(data.get('image',''));prompt=str(data.get('prompt','')).strip()
    if not 5<=len(prompt)<=2000:raise ValueError('Escribí una indicación de entre 5 y 2000 caracteres.')
    if not re.fullmatch(r'data:image/png;base64,[A-Za-z0-9+/=]+',image):raise ValueError('La imagen del producto no tiene el formato esperado.')
    raw=base64.b64decode(image.split(',',1)[1],validate=True)
    if len(raw)>16*1024*1024 or not raw.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('La imagen PNG supera el límite o está dañada.')
    with WAN_LOCK:
        if WAN_JOB and WAN_JOB['process'].poll() is None:raise RuntimeError('Ya hay una generación en marcha.')
        folder=WAN_DATA/uuid.uuid4().hex
        folder.mkdir(parents=True);(folder/'producto.png').write_bytes(raw)
        (folder/'request.json').write_text(json.dumps({'prompt':prompt,'negative':str(data.get('negative',''))[:1500]}),encoding='utf-8')
        (folder/'status.json').write_text(json.dumps({'state':'running','message':'Iniciando WanGP instalado…','progress':0}),encoding='utf-8')
        log=(folder/'motor.log').open('wb')
        try:process=subprocess.Popen([str((root/'env_venv/Scripts/python.exe').resolve()),str(ROOT/'wan_worker.py'),str(root.resolve()),str(folder.resolve())],cwd=str(root),stdout=log,stderr=subprocess.STDOUT)
        finally:log.close()
        WAN_JOB={'id':folder.name,'folder':folder,'process':process}
    return wan_state()

def wan_clips():
    import hashlib
    root=wan_root();paths=[]
    if root:
        folders={root/'outputs',root/'outputs_video',root/'videos'}
        try:
            config=json.loads((root/'wgp_config.json').read_text(encoding='utf-8'))
            for key,value in config.items():
                if isinstance(value,str) and any(s in key.lower() for s in ('output_dir','save_path','output_path')):
                    p=Path(value);p=p if p.is_absolute() else root/p
                    if p.is_dir():folders.add(p)
        except (OSError,ValueError):pass
        for folder in folders:
            if folder.is_dir():
                for i,p in enumerate(folder.rglob('*.mp4')):
                    if i>1000:break
                    paths.append(p)
    state=wan_state()
    if WAN_JOB and state['job']['state']=='done':paths.append(WAN_JOB['folder']/'resultado.mp4')
    result=[]
    for path in sorted(set(paths),key=lambda p:p.stat().st_mtime if p.exists() else 0,reverse=True)[:24]:
        if not path.is_file() or path.stat().st_size>MAX_VIDEO_BYTES:continue
        key=hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:24];WAN_CLIPS[key]=path.resolve();result.append({'id':key,'name':path.name,'size':path.stat().st_size})
    return result

def wan_get(handler,path):
    if path=='/api/wan':handler.json_response(wan_state());return True
    if path=='/api/wan/clips':handler.json_response({'clips':wan_clips()});return True
    if path.startswith('/api/wan/video/'):
        key=path.rsplit('/',1)[1];file=WAN_CLIPS.get(key)
        if not file or not file.is_file():handler.json_response({'error':'El video ya no está disponible.'},404);return True
        handler.send_response(200);handler.send_header('Content-Type','video/mp4');handler.send_header('Content-Length',str(file.stat().st_size));handler.end_headers()
        with file.open('rb') as stream:
            while chunk:=stream.read(1024*1024):handler.wfile.write(chunk)
        return True
    return False

def wan_post(handler,path):
    if path not in ('/api/wan/generate','/api/wan/cancel'):return False
    try:
        if path.endswith('/cancel'):
            with WAN_LOCK:
                if WAN_JOB and WAN_JOB['process'].poll() is None:
                    WAN_JOB['process'].terminate()
                    (WAN_JOB['folder']/'status.json').write_text(json.dumps({'state':'cancelled','message':'Generación cancelada.','progress':0}),encoding='utf-8')
            handler.json_response(wan_state());return True
        length=int(handler.headers.get('Content-Length','0'))
        if not 0<length<23*1024*1024:raise ValueError('La imagen es demasiado grande.')
        if not handler.headers.get('Content-Type','').startswith('application/json'):raise ValueError('Formato no admitido.')
        result=wan_start(json.loads(handler.rfile.read(length).decode('utf-8')));handler.json_response(result,202)
    except (ValueError,RuntimeError) as error:handler.json_response({'error':str(error)},400)
    except Exception:handler.json_response({'error':'No se pudo iniciar WanGP. Revisá la ventana del programa.'},500)
    return True

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed_origin(self):
        origin = self.headers.get('Origin')
        if not origin:
            return True
        if origin in ALLOWED_ORIGINS:
            return True
        try:
            parsed = urllib.parse.urlparse(origin)
            return parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1') and parsed.port == self.server.server_port
        except (ValueError, TypeError):
            return False

    def end_headers(self):
        origin = self.headers.get('Origin')
        if origin and self.allowed_origin():
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self.allowed_origin():
            return self.json_response({'error': 'Origen no autorizado.'}, 403)
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if not self.allowed_origin():
            return self.json_response({'error': 'Origen no autorizado.'}, 403)
        path = urllib.parse.urlparse(self.path).path
        if path == '/api/health':
            return self.json_response({'name': 'SALMOS complemento local', 'version': 7, 'wan': wan_state(), 'music': music_bridge.state(),
                'tts': bool(all_voices()), 'ffmpeg': ffmpeg_executable() is not None, 'voices': all_voices(), 'onlineVoice': has_edge()})
        if music_bridge.get(self,path):return
        if wan_get(self,path):return
        if path.startswith('/api/'):
            return self.json_response({'error': 'Acción no disponible.'}, 404)
        decoded = urllib.parse.unquote(path)
        candidate = (ROOT / decoded.lstrip('/')).resolve()
        if ROOT not in candidate.parents and candidate != ROOT:
            return self.json_response({'error': 'Archivo no permitido.'}, 403)
        if candidate.suffix in ('.py', '.bat', '.ps1', '.onnx', '.json') or '/.' in decoded or decoded.startswith('/voces'):
            return self.json_response({'error': 'Archivo no disponible por web.'}, 403)
        return super().do_GET()

    def do_POST(self):
        if not self.allowed_origin():
            return self.json_response({'error': 'Origen no autorizado.'}, 403)
        path = urllib.parse.urlparse(self.path).path
        if path.startswith('/api/music/'):
            wan_job=wan_state().get('job') or {}
            if music_bridge.post(self,path,wan_job.get('state')=='running'):return
        if wan_post(self,path):return
        if path not in ('/api/tts', '/api/convert'):
            return self.json_response({'error': 'Acción no disponible.'}, 404)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            limit = 20000 if path == '/api/tts' else MAX_VIDEO_BYTES
            if length <= 0 or length > limit:
                return self.json_response({'error': 'El archivo o texto supera el tamaño permitido.'}, 413)
            content_type = self.headers.get('Content-Type', '')
            if path == '/api/tts' and not content_type.startswith('application/json'):
                return self.json_response({'error': 'Formato no admitido.'}, 415)
            if path == '/api/convert' and not content_type.startswith(('video/webm', 'video/mp4')):
                return self.json_response({'error': 'Usá un video WebM o MP4.'}, 415)
            if not GENERATION_LOCK.acquire(blocking=False):
                return self.json_response({'error': 'El complemento está trabajando. Esperá que termine la tarea anterior.'}, 409)
            try:
                with tempfile.TemporaryDirectory(prefix='salmos-') as temporary:
                    directory = Path(temporary)
                    if path == '/api/tts':
                        data = json.loads(self.rfile.read(length).decode('utf-8'))
                        text = str(data.get('text', '')).strip()
                        if not text or len(text) > 3000:
                            raise ValueError('Escribí una narración de hasta 3000 caracteres.')
                        output = directory / 'narracion.wav'
                        pitch = max(-30, min(30, int(data.get('pitch', 0))))
                        output, mime = synthesize_any(text, str(data.get('voice', DEFAULT_VOICE)), pitch, output)
                    else:
                        source = directory / 'entrada.webm'
                        with source.open('wb') as handle:
                            remaining = length
                            while remaining:
                                chunk = self.rfile.read(min(1024 * 1024, remaining))
                                if not chunk:
                                    raise ValueError('La transferencia del video se interrumpió.')
                                handle.write(chunk)
                                remaining -= len(chunk)
                        output = directory / 'reel.mp4'
                        convert_video(source, output)
                        mime = 'video/mp4'
                    self.send_response(200)
                    self.send_header('Content-Type', mime)
                    self.send_header('Content-Length', str(output.stat().st_size))
                    self.end_headers()
                    with output.open('rb') as handle:
                        while chunk := handle.read(1024 * 1024):
                            self.wfile.write(chunk)
            finally:
                GENERATION_LOCK.release()
        except (ValueError, json.JSONDecodeError) as error:
            self.json_response({'error': str(error)}, 400)
        except subprocess.TimeoutExpired:
            self.json_response({'error': 'La operación tardó demasiado. Probá un texto o video más corto.'}, 504)
        except Exception as error:
            self.json_response({'error': str(error) if isinstance(error, RuntimeError) else 'No se pudo completar la tarea local. Revisá la ventana del complemento.'}, 500)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--prepare', action='store_true')
    args = parser.parse_args()
    if args.prepare:
        MODELS.mkdir(exist_ok=True)
        subprocess.run([sys.executable, '-m', 'piper.download_voices', DEFAULT_VOICE, '--data-dir', str(MODELS)], check=True)
        print('Voz preparada. FFmpeg:', bool(ffmpeg_executable()))
        return
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    url = f'http://127.0.0.1:{args.port}/'
    print('\nSALMOS: complemento abierto en', url)
    print('Dejá esta ventana abierta mientras generás música, usás el relator o convertís a MP4.')
    print('Para cerrar: Ctrl+C. La voz con internet envia el texto a Microsoft; la conversion de video es local.\n')
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        music_bridge.cancel()
        server.server_close()

if __name__ == '__main__':
    main()
