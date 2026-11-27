"""Local vocal separation, noise reduction and mixing without re-singing the source."""
from __future__ import annotations

from hashlib import sha256
import os
from pathlib import Path
import shutil
import subprocess
from urllib.request import urlopen
import wave

MODEL_NAME = 'Kim_Vocal_2.onnx'
MODEL_URL = 'https://huggingface.co/nomadkaraoke/public_uvr_models/resolve/main/' + MODEL_NAME
MODEL_SHA256 = 'ce74ef3b6a6024ce44211a07be9cf8bc6d87728cc852a68ab34eb8e58cde9c8b'
NOISE_URL = 'https://raw.githubusercontent.com/richardpl/arnndn-models/master/cb.rnnn'
NOISE_SHA256 = 'f1357c4e5be9dee8467bead486dfced2d75b640c26ad0b594fa7f102322371d9'
RATE, FFT_SIZE, HOP, BINS, FRAMES = 44100, 7680, 1024, 3072, 256
SEGMENT = (FRAMES - 1) * HOP
OVERLAP = 24 * HOP


def ffmpeg_path():
    binary = os.environ.get('SALMOS_MUSIC_FFMPEG')
    if binary:
        return binary
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError):
        return shutil.which('ffmpeg')


def ffmpeg(binary, *args, cwd=None):
    if not binary:
        raise RuntimeError('Falta FFmpeg en el iniciador. Volvé a abrirlo para terminar la instalación.')
    try:
        subprocess.run([binary, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, timeout=300, cwd=cwd)
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError('No se pudo procesar el sonido con FFmpeg.') from error


def cached_model(directory, name, url, checksum, limit, report):
    directory.mkdir(parents=True, exist_ok=True)
    model = directory / name
    if model.is_file():
        with model.open('rb') as source:
            if sha256(source.read()).hexdigest() == checksum:
                return model
    report('Descargando el modelo de limpieza por primera vez…')
    partial = model.with_suffix('.tmp')
    try:
        digest = sha256()
        size = 0
        with urlopen(url, timeout=40) as source, partial.open('wb') as output:
            while chunk := source.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise RuntimeError('La descarga del separador de voz supera el tamaño esperado.')
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != checksum:
            raise RuntimeError('La descarga del separador de voz quedó incompleta.')
        partial.replace(model)
    except OSError as error:
        raise RuntimeError('La primera separación necesita descargar el modelo en tu PC. Volvé a intentar con internet.') from error
    finally:
        partial.unlink(missing_ok=True)
    return model


def vocal_model(directory, report):
    return cached_model(directory, MODEL_NAME, MODEL_URL, MODEL_SHA256, 75_000_000, report)


def predict_segment(data, infer):
    import numpy as np
    window = np.hanning(FFT_SIZE + 1)[:-1].astype('float32')
    pad = FFT_SIZE // 2
    padded = np.pad(data, ((0, 0), (pad, pad)), mode='reflect')
    framed = np.lib.stride_tricks.sliding_window_view(padded, FFT_SIZE, axis=1)[:, ::HOP]
    spec = np.fft.rfft(framed * window, axis=-1)
    pitch_bins = spec[:, :, :BINS].transpose(0, 2, 1)
    packed = np.empty((1, 4, BINS, FRAMES), dtype='float32')
    packed[0, 0::2], packed[0, 1::2] = pitch_bins.real, pitch_bins.imag
    prediction = infer(packed)[0]
    if prediction.shape != (4, BINS, FRAMES) or not np.isfinite(prediction).all():
        raise RuntimeError('El separador devolvió datos de voz inválidos.')
    spec[:] = 0
    spec[:, :, :BINS] = (prediction[0::2] + 1j * prediction[1::2]).transpose(0, 2, 1)
    inverse = np.fft.irfft(spec, n=FFT_SIZE, axis=-1).astype('float32')
    result = np.zeros_like(padded)
    weight = np.zeros(padded.shape[-1], dtype='float32')
    for index in range(FRAMES):
        offset = index * HOP
        result[:, offset:offset + FFT_SIZE] += inverse[:, index] * window
        weight[offset:offset + FFT_SIZE] += window ** 2
    return 1.009 * result[:, pad:-pad] / np.maximum(weight[pad:-pad], 1e-7)


def separate_voice(source, output, model_dir, report):
    import numpy as np
    try:
        import onnxruntime as ort
    except ImportError as error:
        raise RuntimeError('Falta ONNX Runtime. Abrí el iniciador para completar la instalación de extracción de letra.') from error

    model = vocal_model(model_dir, report)
    options = ort.SessionOptions()
    options.intra_op_num_threads = min(4, os.cpu_count() or 1)
    session = ort.InferenceSession(str(model), sess_options=options, providers=['CPUExecutionProvider'])
    input_name = session.get_inputs()[0].name

    def infer(spec):
        return session.run(None, {input_name: spec})[0]

    with wave.open(str(source), 'rb') as audio, wave.open(str(output), 'wb') as out:
        if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) != (RATE, 2, 2):
            raise ValueError('La fuente debe estar en estéreo PCM.')
        out.setparams(audio.getparams())
        total = audio.getnframes()
        step = SEGMENT - OVERLAP
        blend = np.linspace(0, 1, OVERLAP, dtype='float32')
        tail = None
        for start in range(0, total, step):
            final = start + SEGMENT >= total
            report(f'Separando la voz en tu PC · {round(100 * start / total)}%…')
            audio.setpos(start)
            data = np.frombuffer(audio.readframes(SEGMENT), dtype='<i2').reshape(-1, 2).T / np.float32(32768)
            segment = np.zeros((2, SEGMENT), dtype='float32')
            segment[:, :data.shape[1]] = data
            vocals = predict_segment(segment, infer)
            if tail is not None:
                vocals[:, :OVERLAP] = tail * (1 - blend) + vocals[:, :OVERLAP] * blend
            length = data.shape[1] if final else step
            out.writeframes(np.rint(np.clip(vocals[:, :length].T, -.9999, .9999) * 32768).astype('<i2').tobytes())
            if final:
                break
            tail = vocals[:, step:].copy()


def denoise_filter(rate, reduction, floor, track_noise=False):
    # afftdn delays its output by two analysis hops. Flush the last samples and
    # remove that exact delay so cleaning preserves both endpoints and the beat.
    delay = 2 * (rate // 80)
    noise = f'afftdn=nr={reduction}:nf={floor}' + (':tn=1' if track_noise else '')
    return f'apad=pad_len={delay},{noise},atrim=start_sample={delay},asetpts=PTS-STARTPTS'


def cleanup_voice(source, destination, binary, model_dir=None, strength=.95, report=lambda message: None):
    source, destination = source.resolve(), destination.resolve()
    directory = (model_dir or destination.parent / 'modelos-voz').resolve()
    model = cached_model(directory, 'cb.rnnn', NOISE_URL, NOISE_SHA256, 500_000, report)
    report('Quitando ruido de fondo con el modelo de voz…')
    # RNNoise has one 10 ms analysis frame of latency. Flush it before removing it.
    effect = (f'aresample=48000,highpass=f=65,apad=pad_len=480,arnndn=m={model.name}:mix={strength:.3f},'
              'atrim=start_sample=480,asetpts=PTS-STARTPTS')
    ffmpeg(binary, '-i', source, '-af',
           effect, '-ac', '2', '-ar', str(RATE), '-c:a', 'pcm_s16le', destination, cwd=directory)


def rhythm_analysis(path, expected=None):
    """Track regular attacks over the full performance in small PCM blocks."""
    import numpy as np
    with wave.open(str(path), 'rb') as source:
        if source.getsampwidth() != 2:
            return None
        sample_rate = source.getframerate()
        hop = sample_rate // 100
        levels = []
        while raw := source.readframes(hop * 2000):
            pcm = np.frombuffer(raw, dtype='<i2').reshape(-1, source.getnchannels()).mean(axis=1)
            block = pcm[:len(pcm) // hop * hop].reshape(-1, hop)
            levels.append(np.log1p(np.sqrt(np.mean(block ** 2, axis=1))))
    level = np.concatenate(levels) if levels else np.array([])
    if len(level) < 450:
        return None
    flux = np.maximum(0, np.diff(level, prepend=level[0]))
    power = (flux ** 2).sum()
    if power < 1e-8:
        return None
    low, high = (max(30, expected * .80), min(300, expected * 1.20)) if expected else (68, 174)
    candidates = range(round(6000 / high), round(6000 / low) + 1)
    period = max(candidates, key=lambda lag: np.dot(flux[lag:], flux[:-lag]))
    confidence = float(np.dot(flux[period:], flux[:-period]) / power)
    if confidence < .22:
        return None
    phase = int(np.bincount(np.arange(len(flux)) % period, weights=flux, minlength=period).argmax())
    beats = []
    radius = max(2, round(period * .18))
    local_level = float(np.percentile(flux[flux > 0], 40))
    for predicted in range(phase, len(flux), period):
        first, last = max(0, predicted-radius), min(len(flux), predicted+radius+1)
        at = first + int(np.argmax(flux[first:last]))
        if flux[at] < local_level:
            at = predicted
        beats.append(at * hop / sample_rate)
    return {'bpm': round(6000 / period), 'beats': beats, 'confidence': confidence}


def tempo_grid(path, expected=None):
    analysis = rhythm_analysis(path, expected)
    return (analysis['bpm'], analysis['beats'][0]) if analysis else None


def align_backing(voice, backing, output, binary, bpm, length):
    """Map phrases of the instrumental to the recording. Voice samples are untouched."""
    source, base = rhythm_analysis(voice, bpm), rhythm_analysis(backing, bpm)
    points = [(0., 0.)]
    if source and base:
        for index in range(4, min(len(source['beats']), len(base['beats'])), 4):
            target, origin = source['beats'][index], base['beats'][index]
            if min(target, origin) < .5 or max(target, origin) >= length-.5:
                continue
            # Reject uncertain octave matches or discontinuities instead of warping
            # the music to an implausible beat map.
            previous_origin, previous_target = points[-1]
            ratio = (origin-previous_origin)/(target-previous_target)
            if .85 <= ratio <= 1.18 and abs(target-origin) < 1:
                points.append((origin, target))
    points.append((length, length))
    if len(points) == 2:
        ffmpeg(binary, '-i', backing, '-af', f'apad=whole_dur={length},atrim=duration={length}',
               '-ar', str(RATE), '-c:a', 'pcm_s16le', output)
        return
    segments = len(points)-1
    graph = ['[0:a]asplit=' + str(segments) + ''.join(f'[part{i}]' for i in range(segments))]
    for index, ((start, target_start), (end, target_end)) in enumerate(zip(points, points[1:])):
        duration = target_end-target_start
        speed = (end-start)/duration
        graph.append(f'[part{index}]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS,'
                     f'atempo={speed:.6f},apad=whole_dur={duration:.6f},atrim=duration={duration:.6f},'
                     f'afade=t=in:d=0.003,afade=t=out:st={max(0,duration-.003):.6f}:d=0.003[clip{index}]')
    graph.append(''.join(f'[clip{i}]' for i in range(segments))+f'concat=n={segments}:v=0:a=1[out]')
    ffmpeg(binary, '-i', backing, '-filter_complex', ';'.join(graph), '-map', '[out]',
           '-ar', str(RATE), '-c:a', 'pcm_s16le', output)


def mix_voice(voice, accompaniment, output, binary, bpm, length):
    backing_pcm = output.with_name('base-pcm.wav')
    aligned = output.with_name('base-sincronizada.wav')
    ffmpeg(binary, '-i', accompaniment, '-ac', '2', '-ar', str(RATE), '-c:a', 'pcm_s16le', backing_pcm)
    align_backing(voice, backing_pcm, aligned, binary, bpm, length)
    fade = min(1.8, length / 8)
    graph = (f'[0:a]aresample={RATE},apad=whole_dur={length:.6f},asplit[voice][guide];'
             f'[1:a]volume=0.46,afade=t=out:st={length-fade:.6f}:d={fade:.6f}[base];'
             '[base][guide]sidechaincompress=threshold=0.08:ratio=2.5:attack=15:release=170[duck];'
             '[voice][duck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.92:level=0:latency=1[mix]')
    ffmpeg(binary, '-i', voice, '-i', aligned, '-filter_complex', graph, '-map', '[mix]',
           '-t', f'{length:.6f}', '-c:a', 'pcm_s16le', output)
