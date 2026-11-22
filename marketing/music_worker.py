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
import unicodedata
from pathlib import Path


CHECKPOINT_READER_VERSION = '0.8.0'


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


def song_lyrics(request):
    if request['instrumental']:
        return '[Instrumental]\n\n[Outro]'
    text = unicodedata.normalize('NFC', request['lyrics']).replace('\r\n', '\n').replace('\r', '\n')

    def section(match):
        tag = match[1]
        name, separator, suffix = tag.partition(' ')
        return '[' + SPANISH_SECTIONS.get(name.casefold(), name) + separator + suffix + ']'

    lines = []
    for line in SECTION_TAG.sub(section, text).splitlines():
        if not line.lstrip().startswith('[') and len(line.split()) > 12:
            # Use punctuation as a breath cue in long transcribed phrases.
            line = re.sub(r'([,;.!?…])\s+(?=\S)', r'\1\n', line)
        lines.append(line.rstrip())
    text = '\n'.join(lines).strip()
    if not text.startswith('['):
        text = '[Verse]\n' + text
    tags = SECTION_TAG.findall(text)
    if not any(re.match(r'outro\b', tag, re.IGNORECASE) for tag in tags):
        text += '\n\n[Outro]'
    return text


def finish_song(source, destination):
    import numpy as np
    import soundfile as sf

    temporary = destination.with_suffix('.tmp')
    try:
        with sf.SoundFile(source) as original:
            duration = original.frames / original.samplerate
            if duration <= 0:
                raise RuntimeError('El motor devolvió un audio vacío.')
            count = max(1, min(original.frames, round(original.samplerate * min(2.5, duration * .1))))
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
        for name in ('acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B'):
            if not (root / 'checkpoints' / name).is_dir():
                raise RuntimeError('Falta el modelo instalado: ' + name)
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
        vocal = {'male': 'Solo male lead vocal.', 'female': 'Solo female lead vocal.', 'auto': 'Solo lead vocal.'}
        caption = request['caption']
        if request['instrumental']:
            caption += ' Instrumental only, no vocals.'
        else:
            caption += (' ' + vocal[request['voice']] + ' Native Latin American Spanish singing, natural word stress, '
                        'clear vowels and consonants. Sing the supplied lyrics in order, with space to breathe between lines.')
        caption += ' Finish with a short instrumental outro and a resolved final chord that rings out.'
        params = GenerationParams(caption=caption, lyrics=song_lyrics(request), bpm=request.get('bpm'),
            instrumental=request['instrumental'], vocal_language='unknown' if request['instrumental'] else 'es', duration=request['duration'],
            inference_steps=8, guidance_scale=1.0, shift=3.0, infer_method='ode', thinking=False,
            use_cot_metas=False, use_cot_caption=False, use_cot_lyrics=False, use_cot_language=False,
            seed=request['seed'])
        config = GenerationConfig(batch_size=1, allow_lm_batch=False, audio_format='wav',
            use_random_seed=request['seed'] < 0, seeds=None if request['seed'] < 0 else [request['seed']])

        def progress(value, desc=None, **kwargs):
            status('running', 'Generando tu canción…', min(.95, .15 + .8 * float(value)))

        status('running', 'Generando tu canción…', .15)
        result = generate_music(handler, LLMHandler(), params, config, save_dir=str(folder / 'resultado'), progress=progress)
        if not result.success or not result.audios:
            raise RuntimeError(result.error or result.status_message or 'No se generó audio.')
        source = Path(result.audios[0]['path'])
        status('running', 'Preparando el cierre y guardando el audio…', .97)
        duration = finish_song(source, folder / 'cancion.wav')
        (folder / 'resultado.json').write_text(json.dumps(result.audios[0].get('params', {}), ensure_ascii=False, default=str), encoding='utf-8')
        status('done', 'Canción lista.', 1, duration=duration)
    except Exception as exc:
        traceback.print_exc()
        memory = memory_error_status(exc)
        if memory:
            status(**memory)
        else:
            message = next(iter(str(exc).splitlines()), 'El motor no devolvió un detalle.')
            status('error', 'No se pudo generar. ' + message[:360])
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(run(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()))
