"""Compare a short generated clip with its lyrics using the local voice model."""
from difflib import SequenceMatcher
import json
from pathlib import Path
import re
import sys
import unicodedata


def words(text):
    text = re.sub(r'\[[^\]\n]*\]', '', text)
    normalized = unicodedata.normalize('NFKD', text.casefold())
    return re.findall(r'[^\W_]+', ''.join(c for c in normalized if not unicodedata.combining(c)))


def compare(lyrics, heard):
    expected, recognized = words(lyrics), words(heard)
    alignment = SequenceMatcher(None, expected, recognized, autojunk=False)
    missing = []
    for operation, start, end, _, _ in alignment.get_opcodes():
        if operation in ('delete', 'replace'):
            missing.extend(expected[start:end])
    return {
        'status': 'match' if expected and expected == recognized else 'review',
        'coverage': round((len(expected) - len(missing)) / max(1, len(expected)), 3),
        'missing': list(dict.fromkeys(missing))[:20],
        'heard': heard[:3000],
    }


def check_audio(source, lyrics, cache):
    try:
        from faster_whisper import WhisperModel

        model = WhisperModel('base', device='cpu', compute_type='int8',
                             download_root=str(cache), local_files_only=True)
        segments, _ = model.transcribe(str(source), language='es', beam_size=5,
                                       condition_on_previous_text=False)
        heard = ' '.join(s.text.strip() for s in segments if s.text.strip() and s.no_speech_prob < .85)
    except Exception as exc:
        print(f'Revisión local de letra no disponible: {type(exc).__name__}', file=sys.stderr)
        return {'status': 'unchecked'}
    return compare(lyrics, heard)


if __name__ == '__main__':
    source, request, cache = map(Path, sys.argv[1:])
    lyrics = json.loads(request.read_text(encoding='utf-8'))['lyrics']
    print(json.dumps(check_audio(source, lyrics, cache)))
