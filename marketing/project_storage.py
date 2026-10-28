"""Explicit project drafts on the user's local drive, independent of browser storage."""
import json
import os
import re
from pathlib import Path

DATA = Path(os.environ.get('SALMOS_DATA', 'E:/SALMOS-IA-datos')) / 'borradores'


def valid_project(value):
    return isinstance(value, dict) and isinstance(value.get('scenes'), list) and 0 < len(value['scenes']) <= 36


def project_id(value):
    value = str(value)
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', value):
        raise ValueError('Identificador de proyecto no válido.')
    return value


def save(value):
    if not valid_project(value):
        raise ValueError('El borrador no tiene escenas válidas.')
    key = project_id(value.get('id', ''))
    DATA.mkdir(parents=True, exist_ok=True)
    dest = DATA / (key + '.json')
    # Preserve the previous explicit save in case the latest is unwanted.
    if dest.is_file():
        import shutil
        shutil.copyfile(dest, DATA / (key + '.anterior.json'))
    temp = DATA / (key + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    temp.replace(dest)
    return {'id': key, 'saved': True}


def list_drafts():
    result = []
    for file in DATA.glob('*.json'):
        if file.name.endswith('.anterior.json'):
            continue
        try:
            item = json.loads(file.read_text(encoding='utf-8'))
            if valid_project(item):
                result.append({'id': file.stem, 'title': item.get('title', 'Mi reel'),
                    'savedAt': item.get('savedAt', 0), 'scenes': len(item['scenes'])})
        except (OSError, ValueError):
            continue
    return sorted(result, key=lambda x: x['savedAt'], reverse=True)


def get(handler, path):
    if path == '/api/projects':
        handler.json_response({'projects': list_drafts()})
        return True
    if path.startswith('/api/projects/'):
        try:
            key = project_id(path.rsplit('/', 1)[-1])
            value = json.loads((DATA / (key + '.json')).read_text(encoding='utf-8'))
            handler.json_response(value)
        except (OSError, ValueError):
            handler.json_response({'error': 'No encuentro ese borrador.'}, 404)
        return True
    return False


def post(handler, path):
    if path != '/api/projects/save':
        return False
    try:
        length = int(handler.headers.get('Content-Length', '0'))
        if not 0 < length <= 120 * 1024 * 1024:
            raise ValueError('El borrador supera el tamaño permitido.')
        if not handler.headers.get('Content-Type', '').startswith('application/json'):
            raise ValueError('Formato de borrador no válido.')
        handler.json_response(save(json.loads(handler.rfile.read(length).decode('utf-8'))))
    except (ValueError, TypeError) as exc:
        handler.json_response({'error': str(exc)}, 400)
    except OSError:
        handler.json_response({'error': 'No se pudo guardar la copia en el disco.'}, 500)
    return True
