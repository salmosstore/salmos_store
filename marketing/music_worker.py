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
import wave
from pathlib import Path


CHECKPOINT_READER_VERSION = '0.8.0'
REQUIRED_CHECKPOINTS = ('acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B')
SONG_API = 12
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

    lines = []
    for line in SECTION_TAG.sub(section, text).splitlines():
        if not line.lstrip().startswith('['):
            if shorter_lines and line.strip():
                lines.extend(breath_lines(line, 12))
                continue
            if len(line.split()) > 12:
                line = re.sub(r'([,;.!?…])\s+(?=\S)', r'\1\n', line)
        lines.append(line.rstrip())
    text = '\n'.join(lines).strip()
    if not text.startswith('['):
        text = '[Verse]\n' + text
    if not any(re.match(r'outro\b', tag, re.IGNORECASE) for tag in SECTION_TAG.findall(text)):
        text += '\n\n[Outro - instrumental]' if extended_instrumental_ending(request) else '\n\n[Outro]'
    return text


def song_caption(request):
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


def finish_song(source, destination, fade_seconds=2.5, start=0, end=None):
    import numpy as np
    import soundfile as sf

    temporary = destination.with_suffix('.tmp')
    try:
        with sf.SoundFile(source) as original:
            first = round(start * original.samplerate)
            last = min(original.frames, round(end * original.samplerate)) if end is not None else original.frames
            duration = (last - first) / original.samplerate
            if duration <= 0:
                raise RuntimeError('El motor devolvió un audio vacío.')
            original.seek(first)
            count = max(1, min(last - first, round(original.samplerate * min(fade_seconds, duration * .1))))
            fade_start = last - count
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


def take_plan(request):
    duration = request['duration']
    yield duration, 8, False
    if request['seed'] >= 0:
        return
    if not request['instrumental'] and not request.get('reference'):
        duration = min(MAX_SONG_DURATION, max(90, duration))
    yield duration, 8, False
    yield duration, 12, not request['instrumental'] and is_short_lyric(request['lyrics'])


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
    from voice_tools import denoise_filter, ffmpeg, ffmpeg_path, mix_voice

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
        task = {}
        if request.get('reference'):
            if not reference.is_file():
                raise RuntimeError('Falta el audio de referencia.')
            if not recorded_voice:
                if request['duration'] > request.get('referenceDuration', request['duration']):
                    status('running', 'Ampliando el ritmo para que entre toda la letra…', .12)
                    extend_reference(reference, request['duration'])
                task = {'task_type': 'cover', 'src_audio': str(reference), 'audio_cover_strength': .72}
        instrumental = request['instrumental'] or recorded_voice
        seed = request['seed']
        random_seed = seed < 0
        plan = list(take_plan({**request, 'instrumental': instrumental}))
        inputs = {'bpm': request.get('bpm'), 'instrumental': instrumental,
                  'vocal_language': 'unknown' if instrumental else 'es',
                  'guidance_scale': 1.0, 'shift': 3.0, 'infer_method': 'ode',
                  'thinking': False, 'use_cot_metas': False, 'use_cot_caption': False,
                  'use_cot_lyrics': False, 'use_cot_language': False, 'seed': seed}
        llm = LLMHandler()
        binary = ffmpeg_path()

        def generate(directory, attempt, duration, steps, shorter_lines):
            mode = 'acompañamiento para tu voz' if recorded_voice else 'canción'
            message = f'Generando {mode} · toma {attempt} de {len(plan)} · {duration:g} s…'

            def report_progress(value, desc=None, **kwargs):
                status('running', message, min(.95, .15 + .8 * float(value)))

            prompt = {**request, 'duration': duration, 'instrumental': instrumental}
            if duration > request['duration']:
                prompt['minimumDuration'] = duration
            take_inputs = {**inputs, 'duration': duration, 'inference_steps': steps,
                           'caption': song_caption(prompt), 'lyrics': song_lyrics(prompt, shorter_lines)}
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
            for attempt, (target, steps, shorter_lines) in enumerate(plan, 1):
                with tempfile.TemporaryDirectory(prefix='toma-', dir=scratch) as take:
                    working = Path(take)
                    finished = working / 'cancion.wav'
                    try:
                        candidate, take_inputs = generate(working / 'resultado', attempt, target, steps, shorter_lines)
                        source = Path(candidate['path'])
                        quality = measure_audio(source)
                        duration = quality['duration']
                        problem = audio_problem(quality, target)
                        check = None
                        if not instrumental and not problem:
                            status('running', f'Comprobando lo cantado · toma {attempt} de {len(plan)}…', .96)
                            check = verify_lyrics(source, folder, duration)
                            if check['status'] == 'review':
                                recognized = check.get('recognizedWords', len(LYRIC_WORD.findall(check.get('heard', ''))))
                                if not recognized:
                                    problem = 'no_lyrics_heard'
                                elif check['coverage'] < .45:
                                    problem = 'lyrics_mismatch'
                        if problem:
                            rejected.append({'errorCode': problem, 'audio': quality, 'lyricsCheck': check,
                                             'input': take_inputs, 'seed': (candidate.get('params') or {}).get('seed')})
                            continue
                        if recorded_voice:
                            status('running', 'Ajustando la base y mezclando tu voz limpia…', .975)
                            mix_voice(reference, source, finished, binary, request.get('bpm') or 120,
                                      max(duration, request['referenceDuration']))
                            with wave.open(str(finished), 'rb') as mixed:
                                duration = mixed.getnframes() / mixed.getframerate()
                        else:
                            clean = working / 'audio-limpio.wav'
                            ffmpeg(binary, '-i', source, '-af', denoise_filter(quality['sampleRate'], 5, -60),
                                   '-c:a', 'pcm_s24le', clean)
                            voice_end = (check or {}).get('lastVoiceEnd')
                            fade = .35 if voice_end is None else min(1.6, max(.08, duration - voice_end))
                            # Remove surplus near-silence at the borders after evaluating the whole performance.
                            start = max(0, quality['leadingSilence'] - .45) if not request.get('reference') and quality['leadingSilence'] >= 3 else 0
                            end = max(voice_end or 0, duration - quality['trailingSilence'] + .6) if quality['trailingSilence'] >= 3 else None
                            duration = finish_song(clean, finished, fade_seconds=fade, start=start, end=end)
                    except Exception as error:
                        if memory_error_status(error):
                            raise
                        traceback.print_exc()
                        rejected.append({'errorCode': 'engine_error',
                                         'message': next(iter(str(error).splitlines()), '')[:200]})
                        continue
                    verdict = check.get('status') if check else None
                    exact = instrumental or verdict == 'match'
                    score = 2 if exact else -1
                    if verdict == 'review':
                        score = check.get('similarity', check.get('coverage', 0))
                        if check.get('missingEnding'):
                            score -= .2
                    if best is None or score > best['score']:
                        finished.replace(best_audio)
                        best = {'score': score, 'duration': duration, 'check': check, 'audio': quality,
                                'params': candidate.get('params', {}), 'input': take_inputs}
                    if exact or verdict == 'unchecked':
                        break
            if not best:
                failure = next((row for row in reversed(rejected) if row['errorCode'] != 'engine_error'), rejected[-1])
                (folder / 'resultado.json').write_text(json.dumps({'tomasDescartadas': rejected}, ensure_ascii=False, default=str), encoding='utf-8')
                code = failure['errorCode']
                message = TAKE_ERRORS.get(code, 'El motor no pudo completar el audio. ' + failure.get('message', ''))
                if code == 'silent_audio':
                    audio = failure['audio']
                    message += f" Se midieron {audio['audibleSeconds']:.1f} s audibles de {audio['duration']:.1f} s."
                if len(rejected) > 1:
                    message += f' Se probaron {len(rejected)} tomas.'
                status('error', message, errorCode=code, lyricsCheck=failure.get('lyricsCheck'))
                return 1
            status('running', 'Guardando el audio…', .98)
            result = {**(best['params'] or {}), 'salmos': {'songApi': SONG_API, 'model': MODEL,
                'inferenceSha256': engine_fingerprint(root), 'input': best['input'], 'randomSeed': random_seed,
                'audio': best['audio'], 'rejectedAttempts': rejected}}
            (folder / 'resultado.json').write_text(json.dumps(result, ensure_ascii=False, default=str), encoding='utf-8')
            best_audio.replace(folder / 'cancion.wav')
            verdict = (best['check'] or {}).get('status')
            message = 'Versión con tu voz lista.' if recorded_voice else 'Canción lista.' if instrumental else 'Toma lista para revisar.'
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
