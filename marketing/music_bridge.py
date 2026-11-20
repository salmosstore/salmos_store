"""Local ACE-Step jobs, Spanish transcription and saved WAV mixes for SALMOS."""
from __future__ import annotations

import filecmp
import importlib.util
import json
import io
import tempfile
import urllib.parse
import wave
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
    locations = [os.environ.get('SALMOS_ACE_STEP'), 'E:/ACE-Step-1.5', 'C:/ACE-Step-1.5']
    for location in filter(None, locations):
        root = Path(location)
        if (root / 'python_embeded/python.exe').is_file() and (root / 'acestep/handler.py').is_file():
            return root
    return None


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
        return {'audioApi': 2, 'installed': bool(ace_root()),
                'transcription': importlib.util.find_spec('faster_whisper') is not None,
                'transcriptionStage': TRANSCRIPTION_STAGE, 'job': status}


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
    instruments = data.get('instruments', [])
    if not isinstance(instruments, list) or len(instruments) > 16:
        raise ValueError('Revisá los instrumentos elegidos.')
    return {'caption': caption, 'lyrics': lyrics, 'duration': duration, 'voice': voice,
            'mood': str(data.get('mood', 'joyful'))[:30], 'rhythm': str(data.get('rhythm', 'medium'))[:30],
            'instruments': [str(value)[:40] for value in instruments], 'saved': False,
            'instrumental': instrumental, 'style': str(data.get('style','house'))[:30], 'details': str(data.get('details',''))[:700], 'seed': seed, 'name': str(data.get('name', 'Mi canción'))[:100]}


def start(data, wan_running=False):
    global JOB
    request = validate_request(data)
    root = ace_root()
    if not root:
        raise RuntimeError('No encuentro ACE-Step 1.5 en esta PC.')
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


def cancel(expected_id=None):
    with LOCK:
        if expected_id and (not JOB or JOB['id'] != expected_id):
            raise ValueError('Cambió la canción que está en curso.')
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
    return sorted(rows, key=lambda r: r['createdAt'], reverse=True)


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


def manage(data, action):
    global JOB
    track_id = str(data.get('id', ''))
    if not re.fullmatch(r'[a-f0-9]{32}', track_id):
        raise ValueError('Canción no válida.')
    folder = DATA / track_id
    if not (folder / 'request.json').is_file():
        raise ValueError('No encuentro esa canción.')
    with LOCK:
        if JOB and JOB['id'] == track_id and JOB['process'].poll() is None:
            raise RuntimeError('Esperá a que termine la generación.')
        if action == 'delete':
            import shutil
            shutil.rmtree(folder)
            if JOB and JOB['id'] == track_id:
                JOB = None
            return {'deleted': track_id}
        request = json.loads((folder / 'request.json').read_text(encoding='utf-8'))
        if action == 'rename':
            name = str(data.get('name', '')).strip()
            if not name or len(name) > 100:
                raise ValueError('Escribí un nombre de hasta 100 caracteres.')
            request['name'] = name
        elif action == 'save':
            request['saved'] = True
        temp = folder / 'request.tmp'
        temp.write_text(json.dumps(request, ensure_ascii=False), encoding='utf-8')
        temp.replace(folder / 'request.json')
        return {'id': track_id, 'name': request.get('name'), 'saved': request.get('saved', False)}


TRANSCRIPTION_LOCK = threading.Lock()
TRANSCRIPTION_MODEL = None
TRANSCRIPTION_STAGE = None


def transcribe_recording(handler):
    """Receive normalized mono PCM. The user's recording stays on their PC."""
    global TRANSCRIPTION_MODEL, TRANSCRIPTION_STAGE
    size = int(handler.headers.get('Content-Length', '0'))
    if handler.headers.get('Content-Type', '').split(';')[0] != 'audio/wav' or not 44 < size <= 16000 * 2 * 600 + 44:
        raise ValueError('Elegí un audio de hasta diez minutos.')
    if not TRANSCRIPTION_LOCK.acquire(blocking=False):
        raise ValueError('Ya se está transcribiendo otra grabación.')
    try:
        data = handler.rfile.read(size)
        if len(data) != size:
            raise ValueError('La carga de la grabación se interrumpió.')
        with wave.open(io.BytesIO(data)) as source:
            if (source.getframerate(), source.getnchannels(), source.getsampwidth()) != (16000, 1, 2) or not 0 < source.getnframes() <= 16000 * 600:
                raise ValueError('No se recibió una grabación válida.')
            source.setpos(source.getnframes() - 1)
            if len(source.readframes(1)) != 2:
                raise ValueError('La grabación está incompleta.')
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError('Descargá el iniciador actualizado y abrilo para habilitar la transcripción.') from exc
        if TRANSCRIPTION_MODEL is None:
            TRANSCRIPTION_STAGE = 'model'
            TRANSCRIPTION_MODEL = WhisperModel('base', device='cpu', compute_type='int8',
                                               download_root=str(DATA.parent / 'modelos-transcripcion'))
        TRANSCRIPTION_STAGE = 'reading'
        segments, _ = TRANSCRIPTION_MODEL.transcribe(io.BytesIO(data), language='es', beam_size=5,
                                                     condition_on_previous_text=False)
        lyrics = '\n'.join(s.text.strip() for s in segments if s.text.strip() and s.no_speech_prob < .85)
        if not lyrics:
            raise ValueError('No se distinguieron palabras. Podés escribir la letra o elegir otra grabación.')
        return {'lyrics': lyrics}
    finally:
        TRANSCRIPTION_STAGE = None
        TRANSCRIPTION_LOCK.release()


def save_audio_version(handler, track_id):
    if not re.fullmatch(r'[a-f0-9]{32}', track_id):
        raise ValueError('La versión no es válida.')
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(handler.path).query)
    name = query.get('name', [''])[0].strip()
    parent_id = query.get('parent', [''])[0]
    if not name or len(name) > 100 or (parent_id and not re.fullmatch(r'[a-f0-9]{32}', parent_id)) or track_id == parent_id:
        raise ValueError('Revisá el nombre de la versión.')
    size = int(handler.headers.get('Content-Length', '0'))
    if handler.headers.get('Content-Type', '').split(';')[0] != 'audio/wav' or not 44 < size <= 108 * 1024 * 1024:
        raise ValueError('La versión debe ser un archivo WAV de hasta diez minutos.')
    DATA.mkdir(parents=True, exist_ok=True)
    destination = DATA / track_id
    with tempfile.TemporaryDirectory(dir=DATA, prefix='.audio-') as temp:
        folder = Path(temp) / 'version'
        folder.mkdir()
        audio = folder / 'cancion.wav'
        with audio.open('wb') as output:
            remaining = size
            while remaining:
                chunk = handler.rfile.read(min(remaining, 1024 * 1024))
                if not chunk:
                    raise ValueError('La carga del audio se interrumpió.')
                output.write(chunk)
                remaining -= len(chunk)
        with wave.open(str(audio)) as audio_file:
            duration = audio_file.getnframes() / audio_file.getframerate()
            if not 0 < duration <= 601 or audio_file.getnchannels() not in (1, 2) or audio_file.getsampwidth() != 2:
                raise ValueError('El audio de esta versión no es válido.')
            audio_file.setpos(audio_file.getnframes()-1)
            if len(audio_file.readframes(1)) != audio_file.getnchannels()*2:
                raise ValueError('El audio de esta versión está incompleto.')
        request = {}
        if parent_id:
            try:
                request = json.loads((DATA / parent_id / 'request.json').read_text(encoding='utf-8'))
            except FileNotFoundError:
                pass  # The original can also be a recording saved only in the browser.
        request.update(name=name, duration=duration, saved=True, parentId=parent_id, audioEdit=True)
        (folder / 'request.json').write_text(json.dumps(request, ensure_ascii=False), encoding='utf-8')
        write_status(folder, {'state':'done','message':'Versión guardada','progress':1})
        with LOCK:
            if destination.exists():
                previous = json.loads((destination / 'request.json').read_text(encoding='utf-8'))
                if (not previous.get('audioEdit') or previous.get('parentId') != parent_id or
                        previous.get('name') != name or not filecmp.cmp(audio, destination / 'cancion.wav', shallow=False)):
                    raise ValueError('Ya existe otro audio con este identificador.')
            else:
                folder.rename(destination)
    return {'id': track_id, 'saved': True}


def post(handler, path, wan_running=False):
    if path == '/api/music/transcribe' or path.startswith('/api/music/versions/'):
        try:
            result = transcribe_recording(handler) if path.endswith('/transcribe') else save_audio_version(handler, path.rsplit('/', 1)[-1])
        except (ValueError, wave.Error, EOFError) as exc:
            handler.json_response({'error': str(exc) or 'No se pudo leer el audio.'}, 422)
        except Exception as exc:
            handler.json_response({'error': 'No se pudo completar el audio. ' + str(exc)}, 503)
        else:
            handler.json_response(result)
        return True
    if path not in ('/api/music/generate', '/api/music/cancel', '/api/music/rename', '/api/music/save', '/api/music/delete'):
        return False
    try:
        if not handler.headers.get('Content-Type', '').startswith('application/json'):
            raise ValueError('Formato de pedido no válido.')
        length = int(handler.headers.get('Content-Length', '0'))
        if not 0 < length <= 30000:
            raise ValueError('El pedido supera el tamaño permitido.')
        data = json.loads(handler.rfile.read(length).decode('utf-8'))
        action = path.rsplit('/', 1)[-1]
        if action in ('rename', 'save', 'delete'):
            handler.json_response(manage(data, action))
        else:
            handler.json_response(cancel(data.get('id')) if action == 'cancel' else start(data, wan_running), 202)
    except (ValueError, TypeError, OverflowError) as exc:
        handler.json_response({'error': str(exc)}, 400)
    except (OSError, RuntimeError) as exc:
        handler.json_response({'error': str(exc)}, 409)
    return True
