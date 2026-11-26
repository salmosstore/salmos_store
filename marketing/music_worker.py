"""One ACE-Step generation per process with a low-memory model loader."""
from __future__ import annotations
from functools import wraps
from hashlib import sha256
from importlib import metadata
from math import ceil
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
REQUIRED_CHECKPOINTS = ('acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B')
SONG_API = 11
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


SPANISH_SECTIONS = {'introducción': 'Intro', 'intro': 'Intro', 'verso': 'Verse',
                    'estrofa': 'Verse', 'coro': 'Chorus', 'estribillo': 'Chorus',
                    'pre-coro': 'Pre-Chorus', 'puente': 'Bridge', 'final': 'Outro',
                    'cierre': 'Outro', 'salida': 'Outro'}
SECTION_TAG = re.compile(r'^\[([^\]\n]+)\]', re.MULTILINE)
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


def breath_lines(line, max_syllables):
    for phrase in re.split(r'(?<=[,;:.!?…])\s+', line):
        phrase_words = [(word, syllables_in(word)) for word in phrase.split()]
        remaining = sum(count for _, count in phrase_words)
        words, syllables = [], 0
        for word, count in phrase_words:
            # Leave a short phrase together instead of pushing its last word onto its own line.
            short_tail = syllables + remaining > max_syllables and syllables >= max_syllables // 2 and remaining - count < 3
            if words and (syllables + count > max_syllables or short_tail):
                yield ' '.join(words)
                words, syllables = [], 0
            words.append(word)
            syllables += count
            remaining -= count
        if words:
            yield ' '.join(words)


def extended_instrumental_ending(request):
    minimum = request.get('minimumDuration', request['duration'])
    return not request.get('reference') and request['duration'] - minimum >= 5


def is_short_lyric(text):
    return len(LYRIC_WORD.findall(LYRIC_TAG.sub('', text))) <= 24


def song_lyrics(request, shorter_lines=False):
    if request['instrumental']:
        return '[Instrumental]' if request['duration'] <= 30 else '[Instrumental]\n\n[Outro]'
    text = unicodedata.normalize('NFC', request['lyrics']).replace('\r\n', '\n').replace('\r', '\n')

    def section(match):
        tag = match[1]
        name, separator, suffix = tag.partition(' ')
        return '[' + SPANISH_SECTIONS.get(name.casefold(), name) + separator + suffix + ']'

    wrap_phrases = shorter_lines or is_short_lyric(text)
    lines = []
    for line in SECTION_TAG.sub(section, text).splitlines():
        if wrap_phrases and line.strip() and not line.lstrip().startswith('['):
            # Format long phrases before the first take. Keep the words, punctuation and section order.
            lines.extend(breath_lines(line, 8 if shorter_lines else 10))
            continue
        if not line.lstrip().startswith('[') and len(line.split()) > 12:
            line = re.sub(r'([,;.!?…])\s+(?=\S)', r'\1\n', line)
        lines.append(line.rstrip())
    text = '\n'.join(lines).strip()
    if not text.startswith('['):
        text = '[Verse]\n' + text
    if not any(re.match(r'outro\b', tag, re.IGNORECASE) for tag in SECTION_TAG.findall(text)):
        if extended_instrumental_ending(request):
            text += '\n\n[Outro - instrumental]'
        elif not shorter_lines:
            text += '\n\n[Outro]'
    return text


def song_caption(request, retry=False):
    if request['instrumental']:
        style, _, details = request['caption'].partition('. ')
        ending = ('End on a resolved final chord.' if request['duration'] <= 30 else
                  'Finish with a short instrumental outro and a resolved final chord.')
        return f'{style[:194].rstrip(".")}. Instrumental only, no vocals. {ending} {details}'.strip()[:512]
    voice = {'male': 'Solo male lead vocal.', 'female': 'Solo female lead vocal.', 'auto': 'Solo lead vocal.'}
    ending = ('Continue instrumentally after the last sung line and end on a resolved chord.'
              if extended_instrumental_ending(request) else
              'Finish with a short instrumental outro and a resolved final chord that rings out.')
    directions = (voice[request['voice']] + ' Native Latin American Spanish singing, natural word stress, '
                  'clear vowels and consonants. Sing the supplied lyrics in order, with space to breathe between lines.')
    if request.get('reference'):
        directions = 'Keep the source beat and tempo. ' + directions
    if retry or is_short_lyric(request['lyrics']):
        lead = directions + ' The lead vocal enters in the opening bars. ' + ending
        return f'{lead} {request["caption"]}'[:512].rstrip()
    directions += ' ' + ending
    return f'{request["caption"][:511 - len(directions)].rstrip()} {directions}'


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


def measure_audio(source):
    import numpy as np
    import soundfile as sf

    with sf.SoundFile(source) as audio:
        block_size = max(1, audio.samplerate // 4)
        interval = block_size / audio.samplerate
        duration = audio.frames / audio.samplerate
        levels = []
        for block in audio.blocks(blocksize=block_size, dtype='float32', always_2d=True):
            if not np.isfinite(block).all():
                raise ValueError('El motor devolvió muestras de audio inválidas.')
            levels.append(float(np.mean(np.square(block), dtype=np.float64)))
    # Ignore near-silent padding, allowing for quiet intros and natural fades.
    threshold = max(1e-6, max(levels, default=0) * 1e-4)
    audible = [index for index, level in enumerate(levels) if level >= threshold]
    leading = audible[0] * interval if audible else duration
    trailing = max(0, duration - (audible[-1] + 1) * interval) if audible else duration
    gap = max(((right - left - 1) * interval for left, right in zip(audible, audible[1:])), default=0)
    return {'duration': duration, 'audibleSeconds': min(duration, len(audible) * interval),
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
    edge_limit = min(6, max(3, duration * .12))
    gap_limit = min(8, max(4, duration * .15))
    if (quality['audibleSeconds'] < duration * .65 or
            max(quality['leadingSilence'], quality['trailingSilence']) > edge_limit or quality['longestGap'] > gap_limit):
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
        brief = request['duration'] <= 30
        reference = folder / 'referencia.wav'
        task = {}
        if request.get('reference'):
            if not reference.is_file():
                raise RuntimeError('Falta el audio de referencia del ritmo.')
            if request['duration'] > request.get('referenceDuration', request['duration']):
                status('running', 'Ampliando el ritmo para que entre toda la letra…', .12)
                extend_reference(reference, request['duration'])
            task = {'task_type': 'cover', 'src_audio': str(reference), 'audio_cover_strength': .72}
        instrumental = request['instrumental']
        seed = request['seed']
        random_seed = seed < 0
        attempts = 2 if random_seed else 1
        inputs = {'bpm': request.get('bpm'), 'instrumental': instrumental,
                  'vocal_language': 'unknown' if instrumental else 'es', 'duration': request['duration'],
                  'inference_steps': 8, 'guidance_scale': 1.0, 'shift': 3.0, 'infer_method': 'ode',
                  'thinking': False, 'use_cot_metas': False, 'use_cot_caption': False,
                  'use_cot_lyrics': False, 'use_cot_language': False, 'seed': seed}
        llm = LLMHandler()

        def generate(directory, attempt):
            retry = attempt > 1
            if not retry:
                message = 'Generando tu canción…'
            elif instrumental:
                message = 'Probando una última toma instrumental…'
            else:
                message = 'Probando una última toma para mejorar la letra…'

            def report_progress(value, desc=None, **kwargs):
                status('running', message, min(.95, .15 + .8 * float(value)))

            take_inputs = {**inputs, 'caption': song_caption(request, retry=retry),
                           'lyrics': song_lyrics(request, shorter_lines=retry)}
            params = GenerationParams(**take_inputs, **task)
            config = GenerationConfig(batch_size=1, allow_lm_batch=False, audio_format='wav',
                use_random_seed=random_seed, seeds=None if random_seed else [seed])
            status('running', message, .15)
            result = generate_music(handler, llm, params, config, save_dir=str(directory), progress=report_progress)
            if not result.success or not result.audios:
                raise RuntimeError(result.error or result.status_message or 'No se generó audio.')
            return result.audios[0], take_inputs

        best = None
        rejected = []
        with tempfile.TemporaryDirectory(prefix='tomas-', dir=folder) as scratch:
            best_audio = Path(scratch) / 'mejor.wav'
            for attempt in range(1, attempts + 1):
                with tempfile.TemporaryDirectory(prefix='toma-', dir=scratch) as take:
                    finished = Path(take) / 'cancion.wav'
                    try:
                        candidate, take_inputs = generate(Path(take) / 'resultado', attempt)
                        source = Path(candidate['path'])
                        quality = measure_audio(source)
                        duration = quality['duration']
                        problem = audio_problem(quality, request['duration'])
                        check = None
                        fade = .35 if brief else 2.5
                        if not instrumental and not problem:
                            status('running', f'Comprobando las palabras cantadas · intento {attempt} de {attempts}', .96)
                            check = verify_lyrics(source, folder, duration)
                            voice_end = check.get('lastVoiceEnd')
                            fade = min(fade, max(.08, duration - voice_end)) if voice_end else .35
                            if check['status'] == 'review':
                                recognized = check.get('recognizedWords')
                                if recognized is None:
                                    recognized = len(LYRIC_WORD.findall(check.get('heard', '')))
                                if not recognized:
                                    problem = 'no_lyrics_heard'
                                elif check['coverage'] < .6:
                                    problem = 'lyrics_mismatch'
                        if problem:
                            rejected.append({'errorCode': problem, 'audio': quality, 'lyricsCheck': check,
                                             'input': take_inputs, 'seed': (candidate.get('params') or {}).get('seed')})
                            continue
                        finish_song(source, finished, fade_seconds=fade)
                    except Exception:
                        if best is None and not rejected:
                            raise
                        traceback.print_exc()
                        break
                    verdict = check.get('status') if check else None
                    exact = instrumental or verdict == 'match'
                    score = -1
                    if exact:
                        score = 2
                    elif verdict == 'review':
                        score = check.get('similarity', check.get('coverage', 0))
                        if check.get('missingEnding'):
                            score -= .1
                    if best is None or score > best['score']:
                        finished.replace(best_audio)
                        best = {'score': score, 'duration': duration, 'check': check, 'audio': quality,
                                'params': candidate.get('params', {}), 'input': take_inputs}
                    if exact or verdict == 'unchecked' or (check['coverage'] >= .8 and not check['missingEnding']):
                        break
            if not best:
                failure = rejected[-1]
                (folder / 'resultado.json').write_text(json.dumps({'tomasDescartadas': rejected}, ensure_ascii=False, default=str), encoding='utf-8')
                code = failure['errorCode']
                message = TAKE_ERRORS[code]
                if code == 'silent_audio':
                    audio = failure['audio']
                    message += f" Se midieron {audio['audibleSeconds']:.1f} s audibles de {audio['duration']:.1f} s."
                status('error', message, errorCode=code, lyricsCheck=failure['lyricsCheck'])
                return 1
            status('running', 'Guardando el audio…', .98)
            result = {**(best['params'] or {}), 'salmos': {'songApi': SONG_API, 'model': MODEL,
                'inferenceSha256': engine_fingerprint(root), 'input': best['input'], 'randomSeed': random_seed,
                'audio': best['audio'], 'rejectedAttempts': rejected}}
            (folder / 'resultado.json').write_text(json.dumps(result, ensure_ascii=False, default=str), encoding='utf-8')
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
