"""Local music jobs. Uses the installed ACE-Step Python; no model downloads."""
from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import threading
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('SALMOS_DATA', 'E:/SALMOS-IA-datos')) / 'musica'
LOCK = threading.RLock()
JOB = None


def ace_root():
    root = Path('E:/ACE-Step-1.5')
    return root if (root / 'python_embeded/python.exe').is_file() and (root / 'acestep/handler.py').is_file() else None


def read_status(folder):
    try:
        return json.loads((folder / 'status.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {'state': 'running', 'message': 'Preparando música…', 'progress': 0}


def write_status(folder, status):
    temp = folder / 'status.tmp'
    temp.write_text(json.dumps(status, ensure_ascii=False), encoding='utf-8')
    temp.replace(folder / 'status.json')


def busy():
    with LOCK:
        return bool(JOB and JOB['process'].poll() is None)


def state():
    with LOCK:
        status = None
        if JOB:
            status = read_status(JOB['folder'])
            if JOB['process'].poll() is not None and status.get('state') not in ('done', 'error', 'cancelled'):
                status = {'state': 'error', 'message': 'El motor se cerró. Podés intentar otra vez; el detalle quedó en motor.log.', 'progress': 0}
                write_status(JOB['folder'], status)
            status['id'] = JOB['id']
        return {'installed': bool(ace_root()), 'job': status}


def validate_request(data):
    if not isinstance(data, dict):
        raise ValueError('Pedido de música no válido.')
    caption = str(data.get('caption', '')).strip()
    lyrics = str(data.get('lyrics', '')).strip()
    duration = float(data.get('duration', 20))
    voice = str(data.get('voice', 'auto'))
    instrumental = data.get('instrumental', False)
    if not isinstance(instrumental, bool):
        raise ValueError('Elegí instrumental o con letra.')
    if not 5 <= len(caption) <= 1200 or len(lyrics) > 3000:
        raise ValueError('Revisá la descripción y la letra.')
    if not 10 <= duration <= 30:
        raise ValueError('Elegí una duración entre 10 y 30 segundos.')
    if voice not in ('auto', 'male', 'female'):
        raise ValueError('Elegí la voz.')
    if not instrumental and not lyrics:
        raise ValueError('Escribí la letra que querés cantar.')
    seed = int(data.get('seed', -1))
    if not -1 <= seed <= 2147483647:
        raise ValueError('Semilla no válida.')
    return {'caption': caption, 'lyrics': lyrics, 'duration': duration, 'voice': voice,
            'instrumental': instrumental, 'style': str(data.get('style','house'))[:30], 'details': str(data.get('details',''))[:700], 'seed': seed, 'name': str(data.get('name', 'Mi canción'))[:100]}


def start(data, wan_running=False):
    global JOB
    request = validate_request(data)
    root = ace_root()
    if not root:
        raise RuntimeError('No encuentro ACE-Step en E:/ACE-Step-1.5.')
    if wan_running:
        raise RuntimeError('Esperá a que termine el movimiento de video.')
    for port in (7860, 7861):
        with socket.socket() as sock:
            sock.settimeout(.2)
            if sock.connect_ex(('127.0.0.1', port)) == 0:
                raise RuntimeError('Cerrá el motor de ACE-Step o WanGP que abriste aparte. Dejá abierta solamente la conexión SALMOS.')
    with LOCK:
        if busy():
            raise RuntimeError('Ya se está generando una canción.')
        folder = DATA / uuid.uuid4().hex
        folder.mkdir(parents=True)
        (folder / 'request.json').write_text(json.dumps(request, ensure_ascii=False), encoding='utf-8')
        write_status(folder, {'state': 'running', 'message': 'Cargando el motor de música…', 'progress': .02})
        env = dict(os.environ)
        env['PYTHONPATH'] = str(root.resolve())
        env['PYTHONUTF8'] = '1'
        with (folder / 'motor.log').open('wb') as log:
            process = subprocess.Popen([str((root / 'python_embeded/python.exe').resolve()),
                str(ROOT / 'music_worker.py'), str(root.resolve()), str(folder.resolve())],
                cwd=str(root), env=env, stdout=log, stderr=subprocess.STDOUT)
        JOB = {'id': folder.name, 'folder': folder, 'process': process}
    return state()


def cancel():
    with LOCK:
        if JOB and JOB['process'].poll() is None:
            JOB['process'].terminate()
            try:
                JOB['process'].wait(timeout=10)
            except subprocess.TimeoutExpired:
                JOB['process'].kill()
                JOB['process'].wait(timeout=10)
            write_status(JOB['folder'], {'state': 'cancelled', 'message': 'Generación cancelada.', 'progress': 0})
    return state()


def tracks():
    rows = []
    if not DATA.is_dir():
        return rows
    for folder in DATA.iterdir():
        if not folder.is_dir() or not re.fullmatch(r'[a-f0-9]{32}', folder.name):
            continue
        status = read_status(folder)
        if status.get('state') != 'done' or not (folder / 'cancion.wav').is_file():
            continue
        try:
            request = json.loads((folder / 'request.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        rows.append({'id': folder.name, 'name': request.get('name', 'Mi canción'),
                     'duration': request.get('duration', 20), 'request': request,
                     'createdAt': (folder / 'cancion.wav').stat().st_mtime})
    return sorted(rows, key=lambda r: r['createdAt'], reverse=True)[:60]


def get(handler, path):
    if path == '/api/music':
        handler.json_response(state())
        return True
    if path == '/api/music/tracks':
        handler.json_response({'tracks': tracks()})
        return True
    if path.startswith('/api/music/audio/'):
        track_id = path.rsplit('/', 1)[-1]
        if not re.fullmatch(r'[a-f0-9]{32}', track_id):
            handler.json_response({'error': 'Canción no válida.'}, 400)
            return True
        audio = DATA / track_id / 'cancion.wav'
        if not audio.is_file():
            handler.json_response({'error': 'No encuentro esa canción.'}, 404)
            return True
        handler.send_response(200)
        handler.send_header('Content-Type', 'audio/wav')
        handler.send_header('Content-Length', str(audio.stat().st_size))
        handler.end_headers()
        with audio.open('rb') as stream:
            import shutil
            shutil.copyfileobj(stream, handler.wfile)
        return True
    return False


def post(handler, path, wan_running=False):
    if path not in ('/api/music/generate', '/api/music/cancel'):
        return False
    try:
        if not handler.headers.get('Content-Type', '').startswith('application/json'):
            raise ValueError('Formato de pedido no válido.')
        length = int(handler.headers.get('Content-Length', '0'))
        if not 0 < length <= 30000:
            raise ValueError('El pedido supera el tamaño permitido.')
        data = json.loads(handler.rfile.read(length).decode('utf-8'))
        handler.json_response(cancel() if path.endswith('/cancel') else start(data, wan_running), 202)
    except (ValueError, TypeError, OverflowError) as exc:
        handler.json_response({'error': str(exc)}, 400)
    except (OSError, RuntimeError) as exc:
        handler.json_response({'error': str(exc)}, 409)
    return True
