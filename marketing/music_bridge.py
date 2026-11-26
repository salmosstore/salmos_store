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
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

try:
    from music_worker import memory_error_status, missing_checkpoints
except ImportError:
    memory_error_status = None  # Older worker during an initiator update.
    missing_checkpoints = None
try:
    from music_worker import MAX_SONG_DURATION, SONG_API, minimum_lyric_duration
except ImportError:
    SONG_API = 5 if missing_checkpoints else 4
    MAX_SONG_DURATION = 600

    def minimum_lyric_duration(lyrics, bpm):
        return 10

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('SALMOS_DATA', 'E:/SALMOS-IA-datos')) / 'musica'
MAX_REFERENCE_BYTES = MAX_SONG_DURATION * 48000 * 2 * 2 + 65536
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


def stopped_status(folder, exit_code):
    try:
        with (folder / 'motor.log').open('rb') as log:
            end = log.seek(0, os.SEEK_END)
            log.seek(max(0, end - 16_384))
            last_lines = log.read().decode('utf-8', errors='replace')
    except OSError:
        last_lines = ''
    memory = memory_error_status(last_lines, exit_code) if memory_error_status else None
    return memory or {'state': 'error', 'message': 'El motor se cerró. El detalle quedó en motor.log.', 'progress': 0}


def state(job_id=None):
    with LOCK:
        status = None
        if JOB and (job_id is None or job_id == JOB['id']):
            folder = JOB['folder']
            status = read_status(folder)
            exit_code = JOB['process'].poll()
            if exit_code is None and status.get('state') in ('done', 'error'):
                status = {'state': 'running', 'message': 'Terminando el pedido de audio…', 'progress': .99}
            elif exit_code is not None and status.get('state') not in ('done', 'error', 'cancelled'):
                (folder / 'referencia.wav').unlink(missing_ok=True)
                (folder / 'ritmo-ampliado.wav').unlink(missing_ok=True)
                status = stopped_status(folder, exit_code)
                write_status(folder, status)
        elif job_id and (DATA / job_id / 'status.json').is_file():
            folder = DATA / job_id
            status = read_status(folder)
            if status.get('state') == 'running':
                status = {'state': 'error', 'message': 'El iniciador se cerró antes de terminar la canción.', 'progress': 0}
        if status is not None:
            status['id'] = folder.name
            if job_id and status.get('state') == 'done':
                status['track'] = track_info(folder, status)
        root = ace_root()
        missing = missing_checkpoints(root) if root and missing_checkpoints else []
        return {'audioApi': 2, 'songApi': SONG_API,
                'musicReaderVersion': 1 if memory_error_status else 0, 'installed': bool(root), 'missingCheckpoints': missing,
                'transcription': importlib.util.find_spec('faster_whisper') is not None,
                'transcriptionStage': TRANSCRIPTION_STAGE, 'job': status}


def validate_request(data):
    if not isinstance(data, dict):
        raise ValueError('Pedido de música no válido.')
    caption = str(data.get('caption', '')).strip()
    lyrics = str(data.get('lyrics', '')).strip()
    duration = None if data.get('duration') is None else float(data['duration'])
    voice = str(data.get('voice', 'auto'))
    instrumental = data.get('instrumental', False)
    if not isinstance(instrumental, bool):
        raise ValueError('Elegí instrumental o con letra.')
    if not 5 <= len(caption) <= 1200 or len(lyrics) > 3000:
        raise ValueError('Revisá la descripción y la letra.')
    if duration is not None and not 10 <= duration <= MAX_SONG_DURATION:
        raise ValueError('Elegí una duración entre 10 segundos y 10 minutos.')
    bpm = data.get('bpm')
    if bpm is not None and (type(bpm) is not int or not 30 <= bpm <= 300):
        raise ValueError('Elegí un ritmo válido.')
    if voice not in ('auto', 'male', 'female'):
        raise ValueError('Elegí la voz.')
    if not instrumental and not re.search(r'[^\W_]', re.sub(r'\[[^\]\n]*\]', '', lyrics)):
        raise ValueError('Escribí la letra que querés cantar.')
    minimum_duration = 10 if instrumental else minimum_lyric_duration(lyrics, bpm)
    if minimum_duration > MAX_SONG_DURATION:
        raise ValueError('A este tempo, la letra necesita más de 10 minutos. Subí el tempo o dividila en partes.')
    if duration is None:
        duration = 20 if instrumental else minimum_duration
    duration = max(minimum_duration, duration)
    seed = int(data.get('seed', -1))
    if not -1 <= seed <= 2147483647:
        raise ValueError('Semilla no válida.')
    instruments = data.get('instruments', [])
    if not isinstance(instruments, list) or len(instruments) > 16:
        raise ValueError('Revisá los instrumentos elegidos.')
    reference = data.get('reference')
    if reference is not None:
        if (instrumental or not isinstance(reference, dict)
                or not isinstance(reference.get('id'), str) or not 1 <= len(reference['id']) <= 128
                or type(reference.get('uploaded')) is not bool
                or (not reference['uploaded'] and not re.fullmatch(r'[a-f0-9]{32}', reference['id']))):
            raise ValueError('Elegí un ritmo válido y escribí la letra para cantar.')
        reference = {'id': reference['id'], 'name': str(reference.get('name', 'Ritmo'))[:100],
                     'uploaded': reference['uploaded']}
    return {'caption': caption, 'lyrics': lyrics, 'duration': duration, 'minimumDuration': minimum_duration, 'voice': voice, 'bpm': bpm,
            'reference': reference, 'versionOf': str(data.get('versionOf') or '')[:128],
            'mood': str(data.get('mood', 'joyful'))[:30], 'rhythm': str(data.get('rhythm', 'medium'))[:30],
            'instruments': [str(value)[:40] for value in instruments], 'saved': False,
            'instrumental': instrumental, 'style': str(data.get('style','house'))[:30], 'details': str(data.get('details',''))[:700], 'seed': seed, 'name': str(data.get('name', 'Mi canción'))[:100]}


def reference_inbox():
    return DATA / 'referencias-pendientes'


def pcm_duration(path):
    with wave.open(str(path), 'rb') as audio:
        if audio.getnchannels() not in (1, 2) or audio.getsampwidth() != 2 or not 8000 <= audio.getframerate() <= 48000:
            raise ValueError('El ritmo de referencia debe ser un WAV mono o estéreo de 16 bits.')
        frames = audio.getnframes()
        duration = frames / audio.getframerate()
        if not 10 <= duration <= MAX_SONG_DURATION:
            raise ValueError('Elegí un ritmo de entre 10 segundos y 10 minutos.')
        audio.setpos(frames - 1)
        if len(audio.readframes(1)) != audio.getnchannels() * audio.getsampwidth():
            raise ValueError('El audio de referencia está incompleto.')
        return duration


def upload_reference(handler, job_id):
    if not re.fullmatch(r'[a-f0-9]{32}', job_id):
        raise ValueError('El pedido de referencia no es válido.')
    size = int(handler.headers.get('Content-Length', '0'))
    if handler.headers.get('Content-Type', '').split(';')[0] != 'audio/wav' or not 44 < size <= MAX_REFERENCE_BYTES:
        raise ValueError('Usá un WAV de hasta 10 minutos.')
    inbox = reference_inbox()
    inbox.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix='ritmo-', suffix='.tmp', dir=inbox, delete=False) as output:
            temporary = Path(output.name)
            while size:
                chunk = handler.rfile.read(min(size, 65536))
                if not chunk:
                    raise ValueError('Se interrumpió la carga del ritmo.')
                output.write(chunk)
                size -= len(chunk)
        duration = pcm_duration(temporary)
        with LOCK:
            if not (DATA / job_id).exists():
                temporary.replace(inbox / (job_id + '.wav'))
            cutoff = time.time() - 86400
            for pending in inbox.glob('*.wav'):
                if pending.stat().st_mtime < cutoff:
                    pending.unlink(missing_ok=True)
        return {'duration': duration}
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def find_reference(reference, job_id):
    if reference['uploaded']:
        path = reference_inbox() / (job_id + '.wav')
        if not path.is_file():
            raise ValueError('Todavía falta cargar el ritmo de referencia.')
        duration = pcm_duration(path)
    else:
        folder = DATA / reference['id']
        track = track_info(folder, read_status(folder))
        if not track:
            raise ValueError('Ya no encuentro el ritmo original en la PC.')
        path = folder / 'cancion.wav'
        duration = track['duration']
        if not 10 <= duration <= MAX_SONG_DURATION:
            raise ValueError('Elegí un ritmo de entre 10 segundos y 10 minutos.')
    return path, duration


def external_engine_busy():
    for port in (7860, 7861):
        with socket.socket() as sock:
            sock.settimeout(.10)
            if sock.connect_ex(('127.0.0.1', port)) == 0:
                return True
    return False


def start(data, wan_running=False, lyrics_ready=None):
    global JOB
    request = validate_request(data)
    job_id = data.get('requestId')
    if job_id is not None and (not isinstance(job_id, str) or not re.fullmatch(r'[a-f0-9]{32}', job_id)):
        raise ValueError('El identificador del pedido de música no es válido.')
    job_id = job_id or uuid.uuid4().hex
    root = ace_root()
    if not root:
        raise RuntimeError('No encuentro ACE-Step 1.5 en esta PC.')
    missing = missing_checkpoints(root) if missing_checkpoints else []
    if missing:
        raise RuntimeError('Faltan archivos de ACE-Step: ' + ', '.join(missing))
    if wan_running:
        raise RuntimeError('Esperá a que termine el movimiento de video.')
    if external_engine_busy():
        raise RuntimeError('Cerrá el motor de ACE-Step o WanGP que abriste aparte. Dejá abierta la conexión SALMOS.')
    with LOCK:
        folder = DATA / job_id
        if folder.is_dir():
            return state(folder.name)
        if busy():
            raise RuntimeError('Ya se está generando una canción.')
        if not request['instrumental'] and lyrics_ready is False and SONG_API < 6:
            raise RuntimeError('La revisión de letras no está lista. Volvé a abrir el iniciador con conexión a internet.')
        reference = request['reference']
        if reference:
            source, reference_duration = find_reference(reference, job_id)
            request['referenceDuration'] = reference_duration
            request['duration'] = max(request['duration'], reference_duration)
        folder.mkdir(parents=True)
        try:
            if reference:
                if reference['uploaded']:
                    source.replace(folder / 'referencia.wav')
                else:
                    shutil.copyfile(source, folder / 'referencia.wav')
            (folder / 'request.json').write_text(json.dumps(request, ensure_ascii=False), encoding='utf-8')
            write_status(folder, {'state': 'running', 'message': 'Cargando el motor de música…', 'progress': .02})
        except OSError:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        env = dict(os.environ)
        env['PYTHONPATH'] = str(root.resolve())
        env['PYTHONUTF8'] = '1'
        env['SALMOS_EDITOR_PYTHON'] = sys.executable
        try:
            with (folder / 'motor.log').open('wb') as log:
                process = subprocess.Popen([str((root / 'python_embeded/python.exe').resolve()),
                    str(ROOT / 'music_worker.py'), str(root.resolve()), str(folder.resolve())],
                    cwd=str(root), env=env, stdout=log, stderr=subprocess.STDOUT)
        except OSError as exc:
            (folder / 'referencia.wav').unlink(missing_ok=True)
            write_status(folder, {'state': 'error', 'message': 'No se pudo abrir ACE-Step. ' + str(exc), 'progress': 0})
            return state(folder.name)
        JOB = {'id': folder.name, 'folder': folder, 'process': process}
        return state(folder.name)


def cancel(expected_id=None):
    with LOCK:
        if expected_id and (not JOB or JOB['id'] != expected_id):
            raise ValueError('Cambió la canción que está en curso.')
        if JOB and JOB['process'].poll() is None and read_status(JOB['folder']).get('state') == 'running':
            JOB['process'].terminate()
            try:
                JOB['process'].wait(timeout=10)
            except subprocess.TimeoutExpired:
                JOB['process'].kill()
                JOB['process'].wait(timeout=10)
            write_status(JOB['folder'], {'state': 'cancelled', 'message': 'Generación cancelada.', 'progress': 0})
            (JOB['folder'] / 'referencia.wav').unlink(missing_ok=True)
            (JOB['folder'] / 'ritmo-ampliado.wav').unlink(missing_ok=True)
    return state()


def track_info(folder, status):
    if status.get('state') != 'done':
        return None
    try:
        request = json.loads((folder / 'request.json').read_text(encoding='utf-8'))
        modified = (folder / 'cancion.wav').stat().st_mtime
    except (OSError, ValueError):
        return None
    return {'id': folder.name, 'name': request.get('name', 'Mi canción'),
            'duration': status.get('duration', request.get('duration', 20)), 'request': request,
            'createdAt': modified, 'lyricsCheck': status.get('lyricsCheck')}


def tracks():
    rows = []
    if not DATA.is_dir():
        return rows
    for folder in DATA.iterdir():
        if not folder.is_dir() or not re.fullmatch(r'[a-f0-9]{32}', folder.name):
            continue
        track = track_info(folder, read_status(folder))
        if track:
            rows.append(track)
    return sorted(rows, key=lambda r: r['createdAt'], reverse=True)


def lyric_diagnostic(folder):
    track = track_info(folder, read_status(folder))
    if track is None or track['request'].get('audioEdit'):
        return None
    try:
        result = json.loads((folder / 'resultado.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        result = {}
    if not isinstance(result, dict):
        result = {}
    request_keys = ('lyrics', 'caption', 'style', 'mood', 'rhythm', 'bpm', 'duration', 'minimumDuration',
                    'referenceDuration', 'instrumental', 'voice', 'seed')
    engine_keys = ('lyrics', 'caption', 'vocal_language', 'bpm', 'duration', 'seed', 'inference_steps',
                   'guidance_scale', 'shift', 'infer_method', 'thinking', 'task_type', 'audio_cover_strength')
    saved = result.get('salmos')
    if not isinstance(saved, dict):
        saved = {}
    engine = {key: result[key] for key in engine_keys if key in result and isinstance(result[key], (str, int, float, bool))}
    return {
        'nombre': track['name'], 'duracionAudio': track['duration'], 'creada': track['createdAt'],
        'pedido': {key: track['request'][key] for key in request_keys if key in track['request']},
        'entradaAlMotor': saved.get('input'), 'datosDevueltosPorMotor': engine,
        'motor': {key: saved[key] for key in ('songApi', 'model', 'inferenceSha256', 'randomSeed') if key in saved},
        'revisionLetra': track['lyricsCheck'],
    }


def get(handler, path, setup=None):
    if path == '/api/music':
        handler.json_response(state())
        return True
    if path == '/api/music/tracks':
        handler.json_response({'tracks': tracks()})
        return True
    if path.startswith('/api/music/jobs/'):
        job_id = path.rsplit('/', 1)[-1]
        if not re.fullmatch(r'[a-f0-9]{32}', job_id):
            handler.json_response({'error': 'Pedido de música no válido.'}, 400)
        else:
            handler.json_response({**state(job_id), 'setup': setup})
        return True
    if path.startswith('/api/music/diagnostic/'):
        track_id = path.rsplit('/', 1)[-1]
        if not re.fullmatch(r'[a-f0-9]{32}', track_id):
            handler.json_response({'error': 'Canción no válida.'}, 400)
            return True
        diagnostic = lyric_diagnostic(DATA / track_id)
        if diagnostic is None:
            handler.json_response({'error': 'No se encontraron los datos de esta canción.'}, 404)
        else:
            handler.json_response(diagnostic)
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
    with LOCK:
        if not (folder / 'request.json').is_file():
            raise ValueError('No encuentro esa canción.')
        if JOB and JOB['id'] == track_id and JOB['process'].poll() is None:
            raise RuntimeError('Esperá a que termine la generación.')
        if action == 'delete':
            import shutil
            shutil.rmtree(folder)
            if JOB and JOB['id'] == track_id:
                JOB = None
            return {'deleted': track_id}
        request = json.loads((folder / 'request.json').read_text(encoding='utf-8'))
        if action == 'rename' or (action == 'save' and 'name' in data):
            name = data.get('name')
            name = name.strip() if isinstance(name, str) else ''
            if not name or len(name) > 100:
                raise ValueError('Escribí un nombre de hasta 100 caracteres.')
            request['name'] = name
        if action == 'lyrics':
            lyrics = data.get('lyrics')
            if not isinstance(lyrics, str) or len(lyrics) > 3000:
                raise ValueError('La letra puede tener hasta 3.000 caracteres.')
            if lyrics != request.get('lyrics'):
                status = read_status(folder)
                if status.pop('lyricsCheck', None):
                    write_status(folder, status)
            request['lyrics'] = lyrics
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


def post(handler, path, wan_running=False, lyrics_ready=None):
    if path == '/api/music/transcribe' or path.startswith(('/api/music/versions/', '/api/music/reference/')):
        try:
            identifier = path.rsplit('/', 1)[-1]
            if path.startswith('/api/music/reference/'):
                result = upload_reference(handler, identifier)
            elif path.startswith('/api/music/versions/'):
                result = save_audio_version(handler, identifier)
            else:
                result = transcribe_recording(handler)
        except (ValueError, wave.Error, EOFError) as exc:
            handler.json_response({'error': str(exc) or 'No se pudo leer el audio.'}, 422)
        except Exception as exc:
            handler.json_response({'error': 'No se pudo completar el audio. ' + str(exc)}, 503)
        else:
            handler.json_response(result)
        return True
    if path not in ('/api/music/generate', '/api/music/cancel', '/api/music/rename', '/api/music/save', '/api/music/delete', '/api/music/lyrics'):
        return False
    try:
        if not handler.headers.get('Content-Type', '').startswith('application/json'):
            raise ValueError('Formato de pedido no válido.')
        length = int(handler.headers.get('Content-Length', '0'))
        if not 0 < length <= 30000:
            raise ValueError('El pedido supera el tamaño permitido.')
        data = json.loads(handler.rfile.read(length).decode('utf-8'))
        action = path.rsplit('/', 1)[-1]
        if action in ('rename', 'save', 'delete', 'lyrics'):
            handler.json_response(manage(data, action))
        else:
            handler.json_response(cancel(data.get('id')) if action == 'cancel' else start(data, wan_running, lyrics_ready), 202)
    except (ValueError, TypeError, OverflowError, wave.Error, EOFError) as exc:
        handler.json_response({'error': str(exc)}, 400)
    except (OSError, RuntimeError) as exc:
        handler.json_response({'error': str(exc)}, 409)
    return True
