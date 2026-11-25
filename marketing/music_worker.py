"""One ACE-Step generation per process with a low-memory model loader."""
from __future__ import annotations
from functools import wraps
from importlib import metadata
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import traceback
import unicodedata
from pathlib import Path


CHECKPOINT_READER_VERSION = '0.8.0'
REQUIRED_CHECKPOINTS = ('acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B')


def missing_checkpoints(root):
    return [name for name in REQUIRED_CHECKPOINTS if not (root / 'checkpoints' / name).is_dir()]


def memory_error_status(message, exit_code=0):
    detail = str(message).casefold()
    if not ((exit_code & 0xffffffff) == 0xc000012d or getattr(message, 'winerror', None) == 1455
            or re.search(r'\b(?:os error|winerror|error del sistema)\s*[:=]?\s*1455\b', detail)
            or 'paging file is too small' in detail or 'archivo de paginación es demasiado pequeño' in detail):
        return None
    return {'state': 'error', 'errorCode': 'windows_commit_limit', 'progress': 0,
            'message': 'Windows se quedó sin memoria virtual al cargar el motor (error 1455).'}


def install_checkpoint_reader(cache, status):
    target = cache / ('safetensors-' + CHECKPOINT_READER_VERSION)
    package = target / 'safetensors' / '__init__.py'
    if package.is_file():
        return target
    status('running', 'Preparando la lectura de modelos para Windows…', .04)
    cache.mkdir(parents=True, exist_ok=True)
    editor_python = os.environ.get('SALMOS_EDITOR_PYTHON') or sys.executable
    with tempfile.TemporaryDirectory(prefix='safetensors-', dir=cache) as temp:
        staged = Path(temp) / 'packages'
        subprocess.run([editor_python, '-m', 'pip', '--isolated', 'install',
                        '--index-url', 'https://pypi.org/simple', '--disable-pip-version-check',
                        '--only-binary=:all:', '--no-deps', '--timeout', '15', '--retries', '1',
                        '--target', str(staged), 'safetensors==' + CHECKPOINT_READER_VERSION],
                       check=True, timeout=90)
        if not (staged / 'safetensors' / '__init__.py').is_file():
            raise RuntimeError('No se encontró el lector en la descarga.')
        try:
            staged.rename(target)
        except OSError:
            if not package.is_file():
                raise
    return target


def use_windows_checkpoint_reader(cache, status):
    from packaging.version import Version

    try:
        installed = metadata.version('safetensors')
    except metadata.PackageNotFoundError:
        installed = '0'
    if Version(installed) < Version(CHECKPOINT_READER_VERSION):
        sys.path.insert(0, str(install_checkpoint_reader(cache, status)))

    import safetensors
    native_open = safetensors.safe_open

    # Apply Transformers' direct-read workaround in this process before ACE-Step imports it.
    @wraps(native_open)
    def open_checkpoint(filename, framework, device='cpu', **options):
        if framework in ('pt', 'pytorch') and str(device) == 'cpu':
            options['backend'] = 'pread'
        return native_open(filename, framework, device, **options)

    safetensors.safe_open = open_checkpoint


SPANISH_SECTIONS = {'introducción': 'Intro', 'intro': 'Intro', 'verso': 'Verse',
                    'estrofa': 'Verse', 'coro': 'Chorus', 'estribillo': 'Chorus',
                    'pre-coro': 'Pre-Chorus', 'puente': 'Bridge', 'final': 'Outro',
                    'cierre': 'Outro', 'salida': 'Outro'}
SECTION_TAG = re.compile(r'^\[([^\]\n]+)\]', re.MULTILINE)


def vocal_lines(line):
    if len(line.split()) <= 8 or line.lstrip().startswith('['):
        return [line.rstrip()]
    parts = []
    for phrase in re.split(r'(?<=[,;.!?…])\s+', line.strip()):
        words = phrase.split()
        while len(words) > 8:
            limit = min(8, len(words) - 3)
            cut = next((i for i in range(limit, 3, -1)
                        if words[i].casefold() in ('que', 'porque', 'y', 'pero', 'cuando')), limit)
            parts.append(' '.join(words[:cut]))
            words = words[cut:]
        parts.append(' '.join(words))
    return parts


def song_lyrics(request):
    brief = request['duration'] <= 30
    if request['instrumental']:
        return '[Instrumental]' if brief else '[Instrumental]\n\n[Outro]'
    text = unicodedata.normalize('NFC', request['lyrics']).replace('\r\n', '\n').replace('\r', '\n')

    def section(match):
        tag = match[1]
        name, separator, suffix = tag.partition(' ')
        return '[' + SPANISH_SECTIONS.get(name.casefold(), name) + separator + suffix + ']'

    lines = []
    for line in SECTION_TAG.sub(section, text).splitlines():
        lines.extend(vocal_lines(line))
    text = '\n'.join(lines).strip()
    if not text.startswith('['):
        text = ('[Chorus]\n' if brief else '[Verse]\n') + text
    tags = SECTION_TAG.findall(text)
    if not brief and not any(re.match(r'outro\b', tag, re.IGNORECASE) for tag in tags):
        text += '\n\n[Outro]'
    return text


def song_caption(request, simpler_vocals=False):
    style, _, other_details = request['caption'].partition('. ')
    if request['instrumental']:
        directions = 'Instrumental only, no vocals.'
    else:
        voice = {'male': 'Male', 'female': 'Female', 'auto': 'Solo'}[request['voice']]
        directions = (f'{voice} lead in native Latin American Spanish. Sing the written lyrics exactly. '
                      'Clear consonants, one note per syllable, dry foreground vocals. No wordless sounds or ad libs.')
        if simpler_vocals:
            directions += ' Keep the melody in a narrow range, with pauses at line breaks and a soft backing mix.'
        if request['duration'] <= 30:
            directions += ' Start singing on the first beat. Finish the entire lyric within the clip.'
        if request.get('reference'):
            directions = 'Keep the source beat and tempo. ' + directions
    ending = (' End on a resolved final chord.' if request['duration'] <= 30 else
              ' Finish with a short instrumental outro and a resolved final chord.')
    style_budget = min(194, 510 - len(directions) - len(ending))
    description = f'{style[:style_budget].rstrip(".")}. {directions}{ending}'
    return (description + ' ' + other_details).strip()[:512]


def finish_song(source, destination, fade_seconds=2.5):
    import numpy as np
    import soundfile as sf

    temporary = destination.with_suffix('.tmp')
    try:
        with sf.SoundFile(source) as original:
            duration = original.frames / original.samplerate
            if duration <= 0:
                raise RuntimeError('El motor devolvió un audio vacío.')
            count = max(1, min(original.frames, round(original.samplerate * min(fade_seconds, duration * .1))))
            fade_start = original.frames - count
            with sf.SoundFile(temporary, 'w', samplerate=original.samplerate, channels=original.channels,
                              format='WAV', subtype=original.subtype) as output:
                while original.tell() < fade_start:
                    output.write(original.read(min(65536, fade_start - original.tell()), dtype='float32', always_2d=True))
                tail = original.read(count, dtype='float32', always_2d=True)
                gain = .5 + .5 * np.cos(np.linspace(0, np.pi, count, dtype=np.float32))
                tail *= gain[:, None]
                tail[-1] = 0
                output.write(tail)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return duration


def verify_lyrics(source, folder, duration):
    editor_python = os.environ.get('SALMOS_EDITOR_PYTHON')
    if not editor_python:
        return {'status': 'unchecked'}
    command = [editor_python, '-I', str(Path(__file__).resolve().with_name('lyrics_check.py')),
               str(source), str(folder / 'request.json'), str(folder.parent.parent / 'modelos-transcripcion')]
    try:
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, text=True,
                                encoding='utf-8', timeout=max(90, min(360, duration * 1.5)))
        return json.loads(result.stdout)
    except (OSError, ValueError, subprocess.SubprocessError):
        traceback.print_exc()
        return {'status': 'unchecked'}


def run(root, folder):
    os.chdir(root)
    sys.path.insert(0, str(root))
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    os.environ['ACESTEP_INIT_LLM'] = 'false'
    # Keep compilation and module caches on the same spacious drive as SALMOS.
    cache = folder.parent / 'cache'
    os.environ['TORCHINDUCTOR_CACHE_DIR'] = str(cache / 'torch')
    os.environ['TRITON_CACHE_DIR'] = str(cache / 'triton')
    os.environ['HF_MODULES_CACHE'] = str(cache / 'huggingface-modules')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'

    def status(state, message, progress=0, **detail):
        temp = folder / 'status.tmp'
        temp.write_text(json.dumps({'state': state, 'message': message, 'progress': progress, **detail},
                                   ensure_ascii=False), encoding='utf-8')
        temp.replace(folder / 'status.json')

    try:
        request = json.loads((folder / 'request.json').read_text(encoding='utf-8'))
        # Require existing checkpoints. The bridge never requests model installation.
        missing = missing_checkpoints(root)
        if missing:
            raise RuntimeError('Falta instalar el modelo: ' + ', '.join(missing))
        loading_message = 'Cargando el modelo instalado…'
        if sys.platform == 'win32':
            os.environ['HF_ENABLE_PARALLEL_LOADING'] = 'false'
            os.environ['HF_DEACTIVATE_ASYNC_LOAD'] = '1'
            try:
                use_windows_checkpoint_reader(cache, status)
            except (ImportError, OSError, RuntimeError, ValueError, subprocess.SubprocessError):
                traceback.print_exc()
                status('running', 'No se pudo preparar el lector de Windows. Probando con el motor instalado…', .06)
            else:
                loading_message = 'Cargando ACE-Step con menor consumo de memoria…'
        status('running', loading_message, .08)
        from acestep.handler import AceStepHandler
        from acestep.llm_inference import LLMHandler
        from acestep.inference import GenerationParams, GenerationConfig, generate_music
        handler = AceStepHandler()
        message, ok = handler.initialize_service(project_root=str(root), config_path='acestep-v15-turbo',
            device='cuda', use_flash_attention=False, compile_model=True, offload_to_cpu=True,
            offload_dit_to_cpu=True, quantization='int8_weight_only', use_mlx_dit=False)
        if not ok:
            raise RuntimeError(str(message))
        brief = request['duration'] <= 30
        reference = folder / 'referencia.wav'
        task = {}
        if request.get('reference'):
            if not reference.is_file():
                raise RuntimeError('Falta el audio de referencia del ritmo.')
            task = {'task_type': 'cover', 'src_audio': str(reference), 'audio_cover_strength': .72}
        lyrics = song_lyrics(request)
        instrumental = request['instrumental']
        attempts = 1 if instrumental or request['seed'] >= 0 else 3
        llm = LLMHandler()

        def generate(directory, attempt):
            message = 'Generando tu canción…' if attempt == 1 else f'Volviendo a cantar la letra · intento {attempt} de {attempts}'

            def report_progress(value, desc=None, **kwargs):
                status('running', message, min(.95, .15 + .8 * float(value)))

            seed = request['seed'] if request['seed'] >= 0 else secrets.randbelow(2147483647)
            params = GenerationParams(caption=song_caption(request, simpler_vocals=attempt > 1), lyrics=lyrics, bpm=request.get('bpm'),
                instrumental=instrumental, vocal_language='unknown' if instrumental else 'es', duration=request['duration'],
                inference_steps=8 if instrumental else (16 if attempt == 1 else 20),
                guidance_scale=1.0, shift=3.0, infer_method='ode', thinking=False,
                use_cot_metas=False, use_cot_caption=False, use_cot_lyrics=False, use_cot_language=False,
                seed=seed, **task)
            config = GenerationConfig(batch_size=1, allow_lm_batch=False, audio_format='wav',
                use_random_seed=False, seeds=[seed])
            status('running', message, .15)
            result = generate_music(handler, llm, params, config, save_dir=str(directory), progress=report_progress)
            if not result.success or not result.audios:
                raise RuntimeError(result.error or result.status_message or 'No se generó audio.')
            return result.audios[0]

        best_check = {}
        for attempt in range(1, attempts + 1):
            with tempfile.TemporaryDirectory(prefix='toma-', dir=folder) as scratch:
                candidate = generate(Path(scratch) / 'resultado', attempt)
                finished = Path(scratch) / 'cancion.wav'
                duration = finish_song(Path(candidate['path']), finished, fade_seconds=.35 if brief else 2.5)
                check = None
                if not instrumental:
                    status('running', f'Comprobando las palabras cantadas · intento {attempt} de {attempts}', .96)
                    check = verify_lyrics(finished, folder, duration)
                    if check.get('status') == 'unchecked':
                        status('error', 'El iniciador no pudo revisar la letra. Cerralo y volvé a abrirlo.', errorCode='lyrics_unverified')
                        return 1
                    if check.get('status') != 'match':
                        if check.get('coverage', 0) >= best_check.get('coverage', -1):
                            best_check = check
                        continue
                status('running', 'Guardando el audio…', .98)
                (folder / 'resultado.json').write_text(json.dumps(candidate.get('params', {}), ensure_ascii=False, default=str), encoding='utf-8')
                finished.replace(folder / 'cancion.wav')
                status('done', 'Canción lista.' if instrumental else 'Canción lista. Se verificó la letra.', 1,
                       duration=duration, lyricsCheck=check)
                break
        else:
            status('error', 'La letra cantada no coincidió en la revisión. Podés volver a generar con la misma letra.',
                   errorCode='lyrics_mismatch', lyricsCheck=best_check)
            return 1
    except Exception as exc:
        traceback.print_exc()
        memory = memory_error_status(exc)
        if memory:
            status(**memory)
        else:
            message = next(iter(str(exc).splitlines()), 'El motor no devolvió un detalle.')
            status('error', 'No se pudo generar. ' + message[:360])
        return 1
    finally:
        (folder / 'referencia.wav').unlink(missing_ok=True)
    return 0


if __name__ == '__main__':
    sys.exit(run(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()))
