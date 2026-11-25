"""One ACE-Step generation per process with a low-memory model loader."""
from __future__ import annotations
from functools import wraps
from importlib import metadata
import json
import os
import re
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path


CHECKPOINT_READER_VERSION = '0.8.0'
REQUIRED_CHECKPOINTS = ('acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B')
SONG_API = 7


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


def song_lyrics(request):
    if not request['instrumental']:
        return request['lyrics']
    return '[Instrumental]' if request['duration'] <= 30 else '[Instrumental]\n\n[Outro]'


def song_caption(request):
    if request['instrumental']:
        style, _, details = request['caption'].partition('. ')
        ending = ('End on a resolved final chord.' if request['duration'] <= 30 else
                  'Finish with a short instrumental outro and a resolved final chord.')
        return f'{style[:194].rstrip(".")}. Instrumental only, no vocals. {ending} {details}'.strip()[:512]
    voice = {'male': 'Solo male lead vocal.', 'female': 'Solo female lead vocal.', 'auto': 'Solo lead vocal.'}
    directions = (voice[request['voice']] + ' Native Latin American Spanish singing, natural word stress, '
                  'clear vowels and consonants. Sing the supplied lyrics in order, with space to breathe between lines. '
                  'Finish with a short instrumental outro and a resolved final chord that rings out.')
    if request.get('reference'):
        directions = 'Keep the source beat and tempo. ' + directions
    caption = request['caption'][:511 - len(directions)].rstrip()
    return f'{caption} {directions}'


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
        seed = request['seed']
        random_seed = seed < 0
        attempts = 3 if not instrumental and random_seed else 1
        caption = song_caption(request)
        llm = LLMHandler()

        def generate(directory, attempt):
            message = 'Generando tu canción…' if attempt == 1 else f'Volviendo a cantar la letra · intento {attempt} de {attempts}'

            def report_progress(value, desc=None, **kwargs):
                status('running', message, min(.95, .15 + .8 * float(value)))

            params = GenerationParams(caption=caption, lyrics=lyrics, bpm=request.get('bpm'),
                instrumental=instrumental, vocal_language='unknown' if instrumental else 'es', duration=request['duration'],
                inference_steps=8,
                guidance_scale=1.0, shift=3.0, infer_method='ode', thinking=False,
                use_cot_metas=False, use_cot_caption=False, use_cot_lyrics=False, use_cot_language=False,
                seed=seed, **task)
            config = GenerationConfig(batch_size=1, allow_lm_batch=False, audio_format='wav',
                use_random_seed=random_seed, seeds=None if random_seed else [seed])
            status('running', message, .15)
            result = generate_music(handler, llm, params, config, save_dir=str(directory), progress=report_progress)
            if not result.success or not result.audios:
                raise RuntimeError(result.error or result.status_message or 'No se generó audio.')
            return result.audios[0]

        best = None
        with tempfile.TemporaryDirectory(prefix='tomas-', dir=folder) as scratch:
            best_audio = Path(scratch) / 'mejor.wav'
            for attempt in range(1, attempts + 1):
                with tempfile.TemporaryDirectory(prefix='toma-', dir=scratch) as take:
                    finished = Path(take) / 'cancion.wav'
                    try:
                        candidate = generate(Path(take) / 'resultado', attempt)
                        duration = finish_song(Path(candidate['path']), finished, fade_seconds=.35 if brief else 2.5)
                    except Exception:
                        if best is None:
                            raise
                        traceback.print_exc()
                        break
                    check = None
                    if not instrumental:
                        status('running', f'Comprobando las palabras cantadas · intento {attempt} de {attempts}', .96)
                        check = verify_lyrics(finished, folder, duration)
                    verdict = check.get('status') if check else None
                    exact = instrumental or verdict == 'match'
                    score = -1
                    if exact:
                        score = 2
                    elif verdict == 'review':
                        score = check.get('similarity', check.get('coverage', 0))
                    if best is None or score > best['score']:
                        finished.replace(best_audio)
                        best = {'score': score, 'duration': duration, 'check': check, 'params': candidate.get('params', {})}
                    if exact or verdict == 'unchecked':
                        break
            status('running', 'Guardando el audio…', .98)
            (folder / 'resultado.json').write_text(json.dumps(best['params'], ensure_ascii=False, default=str), encoding='utf-8')
            best_audio.replace(folder / 'cancion.wav')
            verdict = (best['check'] or {}).get('status')
            message = 'Canción lista.' if instrumental else 'Toma lista para revisar.'
            if verdict == 'match':
                message = 'Canción lista. Se verificó la letra.'
            status('done', message, 1, duration=best['duration'], lyricsCheck=best['check'])
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
