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


def ffmpeg(binary, *args):
    if not binary:
        raise RuntimeError('Falta FFmpeg en el iniciador. Volvé a abrirlo para terminar la instalación.')
    try:
        subprocess.run([binary, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, timeout=300)
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError('No se pudo procesar el sonido con FFmpeg.') from error


def vocal_model(directory, report):
    directory.mkdir(parents=True, exist_ok=True)
    model = directory / MODEL_NAME
    if model.is_file():
        with model.open('rb') as source:
            if sha256(source.read()).hexdigest() == MODEL_SHA256:
                return model
    report('Descargando el modelo de separación vocal por primera vez…')
    partial = model.with_suffix('.tmp')
    try:
        digest = sha256()
        size = 0
        with urlopen(MODEL_URL, timeout=40) as source, partial.open('wb') as output:
            while chunk := source.read(1024 * 1024):
                size += len(chunk)
                if size > 75_000_000:
                    raise RuntimeError('La descarga del separador de voz supera el tamaño esperado.')
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != MODEL_SHA256:
            raise RuntimeError('La descarga del separador de voz quedó incompleta.')
        partial.replace(model)
    except OSError as error:
        raise RuntimeError('La primera separación necesita descargar el modelo en tu PC. Volvé a intentar con internet.') from error
    finally:
        partial.unlink(missing_ok=True)
    return model


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


def cleanup_voice(source, destination, binary):
    ffmpeg(binary, '-i', source, '-af',
           f'aresample={RATE},highpass=f=62,{denoise_filter(RATE, 14, -49, True)},'
           'acompressor=threshold=0.125:ratio=2:attack=12:release=110:makeup=1.35',
           '-ac', '2', '-ar', str(RATE), '-c:a', 'pcm_s16le', destination)


def tempo_grid(path, expected=None):
    """Estimate a regular pulse from transients. An unmetered voice can return None."""
    import numpy as np
    with wave.open(str(path), 'rb') as source:
        if source.getsampwidth() != 2:
            return None
        sample_rate = source.getframerate()
        hop = sample_rate // 100
        data = np.frombuffer(source.readframes(sample_rate * 45), dtype='<i2')
        data = data.reshape(-1, source.getnchannels()).mean(axis=1)
    if len(data) < hop * 450:
        return None
    block = data[:len(data) // hop * hop].reshape(-1, hop)
    level = np.log1p(np.sqrt(np.mean(block ** 2, axis=1)))
    flux = np.maximum(0, np.diff(level, prepend=level[0]))
    power = (flux ** 2).sum()
    if power < 1e-8:
        return None
    low, high = (max(30, expected * .78), min(300, expected * 1.24)) if expected else (68, 174)
    candidates = range(round(6000 / high), round(6000 / low) + 1)
    period = max(candidates, key=lambda lag: np.dot(flux[lag:], flux[:-lag]))
    correlation = np.dot(flux[period:], flux[:-period]) / power
    if correlation < .20:
        return None
    phase = np.bincount(np.arange(len(flux)) % period, weights=flux, minlength=period).argmax()
    return round(6000 / period), float(phase) * hop / sample_rate


def mix_voice(voice, accompaniment, output, binary, bpm, length):
    """Stretch and align only the backing. The recorded voice remains on its timeline."""
    backing_pcm = output.with_name('base-pcm.wav')
    ffmpeg(binary, '-i', accompaniment, '-ac', '2', '-ar', str(RATE), '-c:a', 'pcm_s16le', backing_pcm)
    source_grid, base_grid = tempo_grid(voice, bpm), tempo_grid(backing_pcm, bpm)
    speed = bpm / base_grid[0] if base_grid else 1
    shift = (source_grid[1] if source_grid else 0) - (base_grid[1] / speed if base_grid else 0)
    sync = f',adelay={round(shift * 1000)}:all=1' if shift >= 0 else f',atrim=start={-shift:.4f},asetpts=PTS-STARTPTS'
    fade = min(1.8, length / 8)
    graph = (f'[0:a]aresample={RATE},apad=whole_dur={length:.3f},asplit[voice][guide];'
             f'[1:a]{denoise_filter(RATE, 6, -56)},atempo={speed:.6f}{sync},volume=0.46,apad=whole_dur={length:.3f},'
             f'afade=t=out:st={length - fade:.3f}:d={fade:.3f}[base];'
             '[base][guide]sidechaincompress=threshold=0.08:ratio=2.5:attack=15:release=170[duck];'
             '[voice][duck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.92:level=0:latency=1[mix]')
    ffmpeg(binary, '-i', voice, '-i', backing_pcm, '-filter_complex', graph, '-map', '[mix]',
           '-t', f'{length:.3f}', '-c:a', 'pcm_s16le', output)
