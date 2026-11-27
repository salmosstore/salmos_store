"""One ACE-Step generation per process with a low-memory model loader."""
from __future__ import annotations
from functools import wraps
from hashlib import sha256
from importlib import metadata
from math import ceil
import json
import os
import shutil
import re
import subprocess
import sys
import tempfile
import traceback
import unicodedata
from pathlib import Path


CHECKPOINT_READER_VERSION = '0.8.0'
REQUIRED_CHECKPOINTS = ('acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B')
SONG_API = 13
MODEL = 'acestep-v15-turbo'
MAX_SONG_DURATION = 600


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


LYRIC_TAG = re.compile(r'\[[^\]\n]*\]')
LYRIC_WORD = re.compile(r'[^\W_]+')
VOWEL_GROUP = re.compile(r'[aeiouáéíóúü]+', re.IGNORECASE)


def syllables_in(word):
    return max(1, len(VOWEL_GROUP.findall(word)))


def minimum_lyric_duration(lyrics, bpm):
    """Keep this estimate in sync with minimumLyricDuration in audio-studio.js."""
    plain = LYRIC_TAG.sub('', unicodedata.normalize('NFC', lyrics))
    beats = syllables = 0
    for phrase in re.split(r'[\r\n.!?;:…]+', plain):
        words = LYRIC_WORD.findall(phrase)
        count = sum(syllables_in(word) for word in words)
        syllables += count
        beats += 4 * ceil(max(count * 1.1, len(words) * 1.75) / 4)
    if not syllables:
        return 10
    beat = 60 / (bpm or 122)
    seconds = max(beats * beat, syllables * .45) + 16 * beat + 6
    return max(45, 5 * ceil(seconds / 5))


def song_lyrics(request):
    # The working original profile sent the user's text without rewriting it.
    return '[Instrumental]' if request['instrumental'] else request['lyrics']


def song_caption(request):
    caption = request['caption']
    if request['instrumental']:
        return caption + ' Instrumental only, no vocals.'
    vocal = {'male': 'Solo male lead vocal.', 'female': 'Solo female lead vocal.', 'auto': 'Solo lead vocal.'}
    return caption + ' ' + vocal[request['voice']] + ' Clear natural Spanish pronunciation. Vocals begin immediately.'


def extend_reference(path, duration):
    import soundfile as sf

    temporary = path.with_name('ritmo-ampliado.wav')
    try:
        with sf.SoundFile(path) as source:
            total = round(duration * source.samplerate)
            if source.frames >= total:
                return
            if not source.frames:
                raise RuntimeError('El ritmo de referencia está vacío.')
            with sf.SoundFile(temporary, 'w', samplerate=source.samplerate, channels=source.channels,
                              format='WAV', subtype=source.subtype) as output:
                while output.tell() < total:
                    if source.tell() == source.frames:
                        source.seek(0)
                    output.write(source.read(min(65536, total - output.tell()), dtype='float32', always_2d=True))
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def measure_audio(source):
    import numpy as np
    import soundfile as sf

    with sf.SoundFile(source) as audio:
        rate = audio.samplerate
        block_size = max(1, rate // 4)
        interval = block_size / rate
        duration = audio.frames / rate
        levels = []
        for block in audio.blocks(blocksize=block_size, dtype='float32', always_2d=True):
            if not np.isfinite(block).all():
                raise ValueError('El motor devolvió muestras de audio inválidas.')
            levels.append(float(np.mean(np.square(block), dtype=np.float64)))
    # Compare against the typical upper portion of the take, not one loud transient.
    nominal = float(np.percentile(levels, 80)) if levels else 0.0
    threshold = max(2.5e-7, nominal * 1e-5)
    audible = [index for index, level in enumerate(levels) if level >= threshold]
    leading = audible[0] * interval if audible else duration
    trailing = max(0, duration - (audible[-1] + 1) * interval) if audible else duration
    gap = max(((right - left - 1) * interval for left, right in zip(audible, audible[1:])), default=0)
    return {'duration': duration, 'sampleRate': rate, 'audibleSeconds': min(duration, len(audible) * interval),
            'leadingSilence': leading, 'trailingSilence': trailing, 'longestGap': gap}


TAKE_ERRORS = {
    'short_audio': 'El motor devolvió menos audio que la duración pedida. La toma quedó descartada.',
    'silent_audio': 'El motor devolvió tramos largos de silencio. La toma quedó descartada.',
    'no_lyrics_heard': 'La toma quedó sin palabras cantadas reconocibles y se descartó.',
    'lyrics_mismatch': 'El motor cantó muy poco de la letra pedida. La toma quedó descartada.',
}


def audio_problem(quality, requested):
    duration = quality['duration']
    if duration + min(2, max(.5, requested * .03)) < requested:
        return 'short_audio'
    gap_limit = min(16, max(7, duration * .25))
    if quality['audibleSeconds'] < max(2.5, duration * .52) or quality['longestGap'] > gap_limit:
        return 'silent_audio'
    return None


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


def engine_fingerprint(root):
    try:
        return sha256((root / 'acestep' / 'inference.py').read_bytes()).hexdigest()
    except OSError:
        return None


def run(root, folder):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from voice_tools import ffmpeg_path, mix_voice

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
        message, ok = handler.initialize_service(project_root=str(root), config_path=MODEL,
            device='cuda', use_flash_attention=False, compile_model=True, offload_to_cpu=True,
            offload_dit_to_cpu=True, quantization='int8_weight_only', use_mlx_dit=False)
        if not ok:
            raise RuntimeError(str(message))
        reference = folder / 'referencia.wav'
        recorded_voice = request.get('recordedVoice', False)
        instrumental = request['instrumental'] or recorded_voice
        task = {}
        if request.get('reference'):
            if not reference.is_file():
                raise RuntimeError('Falta el audio de referencia.')
            if not recorded_voice and request['duration'] > request.get('referenceDuration', request['duration']):
                status('running', 'Ampliando el ritmo para que entre toda la letra…', .12)
                extend_reference(reference, request['duration'])
            task = {'task_type': 'cover', 'src_audio': str(reference), 'audio_cover_strength': .72}
        prompt = {**request, 'instrumental': instrumental}
        seed = request['seed']
        inputs = {'caption': song_caption(prompt), 'lyrics': song_lyrics(prompt),
                  'instrumental': instrumental, 'vocal_language': 'es', 'duration': request['duration'],
                  'inference_steps': 8, 'guidance_scale': 1.0, 'shift': 3.0, 'infer_method': 'ode',
                  'thinking': False, 'use_cot_metas': False, 'use_cot_caption': False,
                  'use_cot_lyrics': False, 'use_cot_language': False, 'seed': seed}
        # Preserve the original text-to-song defaults. Tempo is explicit for a backing
        # or a source-conditioned cover, where it belongs to an existing performance.
        if instrumental or task:
            inputs['bpm'] = request.get('bpm')
        params = GenerationParams(**inputs, **task)
        config = GenerationConfig(batch_size=1, allow_lm_batch=False, audio_format='wav',
            use_random_seed=seed < 0, seeds=None if seed < 0 else [seed])
        message = 'Generando instrumentos sobre el ritmo de tu voz…' if recorded_voice else 'Generando tu canción…'

        def progress(value, desc=None, **kwargs):
            status('running', message, min(.94, .15 + .78 * float(value)))

        status('running', message, .15)
        result = generate_music(handler, LLMHandler(), params, config,
                                save_dir=str(folder / 'resultado'), progress=progress)
        if not result.success or not result.audios:
            raise RuntimeError(result.error or result.status_message or 'No se generó audio.')
        candidate = result.audios[0]
        source = Path(candidate['path'])
        quality = measure_audio(source)
        duration = quality['duration']
        problem = audio_problem(quality, request['duration'])
        diagnostic = {**(candidate.get('params') or {}), 'salmos': {
            'songApi': SONG_API, 'model': MODEL, 'inferenceSha256': engine_fingerprint(root),
            'input': {**inputs, **task}, 'audio': quality}}
        (folder / 'resultado.json').write_text(json.dumps(diagnostic, ensure_ascii=False, default=str), encoding='utf-8')
        if problem:
            status('error', TAKE_ERRORS[problem], errorCode=problem)
            return 1
        check = None
        if recorded_voice:
            status('running', 'Sincronizando los instrumentos y conservando tu voz…', .96)
            duration = request['referenceDuration']
            mix_voice(reference, source, folder / 'cancion.wav', ffmpeg_path(), request.get('bpm') or 120, duration)
        else:
            # Keep the model output as it was generated. No automatic denoising,
            # added fade, edge trimming, discarded lyric takes or hidden retries.
            shutil.copyfile(source, folder / 'cancion.wav')
            if not instrumental:
                status('running', 'Revisando la letra de la toma generada…', .97)
                check = verify_lyrics(source, folder, duration)
        status('done', 'Versión con tu voz lista.' if recorded_voice else 'Canción lista.',
               1, duration=duration, lyricsCheck=check)
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
