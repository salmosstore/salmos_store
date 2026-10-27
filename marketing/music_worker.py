"""One ACE-Step generation per process, using the user's working low-memory profile."""
from __future__ import annotations
import json
import os
import shutil
import sys
import traceback
from pathlib import Path


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

    def status(state, message, progress=0):
        temp = folder / 'status.tmp'
        temp.write_text(json.dumps({'state': state, 'message': message, 'progress': progress}, ensure_ascii=False), encoding='utf-8')
        temp.replace(folder / 'status.json')

    try:
        request = json.loads((folder / 'request.json').read_text(encoding='utf-8'))
        # Require existing checkpoints. The bridge never requests model installation.
        for name in ('acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B'):
            if not (root / 'checkpoints' / name).is_dir():
                raise RuntimeError('Falta el modelo instalado: ' + name)
        from acestep.handler import AceStepHandler
        from acestep.llm_inference import LLMHandler
        from acestep.inference import GenerationParams, GenerationConfig, generate_music
        status('running', 'Cargando el modelo instalado…', .08)
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
            caption += ' ' + vocal[request['voice']] + ' Clear natural Spanish pronunciation. Vocals begin immediately.'
        params = GenerationParams(caption=caption, lyrics='[Instrumental]' if request['instrumental'] else request['lyrics'],
            instrumental=request['instrumental'], vocal_language='es', duration=request['duration'],
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
        shutil.copyfile(source, folder / 'cancion.wav')
        (folder / 'resultado.json').write_text(json.dumps(result.audios[0].get('params', {}), ensure_ascii=False, default=str), encoding='utf-8')
        status('done', 'Canción lista.', 1)
    except Exception as exc:
        traceback.print_exc()
        status('error', 'No se pudo generar: ' + str(exc)[:800])
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(run(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()))
