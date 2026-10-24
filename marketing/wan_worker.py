"""Run the installed WanGP API in its own Python environment; no package installs."""
import json,os,sys,traceback,shutil
from pathlib import Path

def run(root,folder):
    root=Path(root).resolve();folder=Path(folder).resolve()
    def status(state,message,progress=0,**extra):
        target=folder/'status.json';temp=folder/'status.tmp'
        temp.write_text(json.dumps(dict(state=state,message=message,progress=progress,**extra),ensure_ascii=False),encoding='utf-8');temp.replace(target)
    try:
        os.chdir(root);sys.path.insert(0,str(root))
        os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
        git=shutil.which('git')
        if not git:
            for candidate in [Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Git/cmd/git.exe',Path(os.environ.get('ProgramFiles(x86)','C:/Program Files (x86)'))/'Git/cmd/git.exe',Path(os.environ.get('LOCALAPPDATA','C:/'))/'Programs/Git/cmd/git.exe',root/'git/cmd/git.exe',Path('E:/Git/cmd/git.exe')]:
                if candidate.is_file():git=str(candidate);break
        if not git:raise RuntimeError('No se encontró Git instalado. Cerrá la conexión local y volvé a abrirla después de terminar su instalación.')
        os.environ['GIT_PYTHON_GIT_EXECUTABLE']=git
        os.environ['PATH']=str(Path(git).parent)+os.pathsep+os.environ.get('PATH','')
        from shared.api import init
        status('running','Preparando WanGP instalado. Puede tardar al cargar el motor.')
        session=init(root=root,output_dir=folder/'salidas',cli_args=['--attention','sdpa','--profile','4'])
        available=session.get_model_availability('vace_1.3B')
        # Refuse a missing model rather than trigger another large download.
        if not (available.get('available') is True or available.get('downloaded') is True or available.get('status') in ('available','downloaded','ready','green')):
            raise RuntimeError('WanGP no confirmó que Vace 1.3B esté descargado. No se iniciaron descargas. Abrilo una vez en WanGP y volvé a comprobar.')
        request=json.loads((folder/'request.json').read_text(encoding='utf-8'))
        settings=json.loads((Path(__file__).parent/'wan-preset.json').read_text(encoding='utf-8'))
        settings.update(prompt=request['prompt'],negative_prompt=request.get('negative',''),image_refs=[str(folder/'producto.png')],frames_positions='1',video_prompt_type='FI',video_length=33,num_inference_steps=30,repeat_generation=1,output_filename='SALMOS-movimiento',overrides="attention_mode='sdpa', memory_profile=4")
        class Callbacks:
            def on_status(self,text):status('running',str(text)[:250])
            def on_progress(self,update):status('running',str(getattr(update,'status','Generando…'))[:250],max(0,min(100,float(getattr(update,'progress',0))))/100)
        status('running','Generando movimiento con Vace 1.3B…')
        job=session.submit_task(settings,callbacks=Callbacks());result=job.result()
        videos=[Path(p) for p in result.generated_files if Path(p).suffix.lower()=='.mp4' and Path(p).is_file()]
        if not result.success or not videos:raise RuntimeError('; '.join(str(getattr(e,'message',e)) for e in result.errors) or 'WanGP no devolvió un video.')
        shutil.copyfile(videos[0],folder/'resultado.mp4')
        status('done','Video listo. Revisá ojos, boca y estampa antes de usarlo.',1)
    except Exception as error:
        status('error',str(error)[:450]);traceback.print_exc()

if __name__=='__main__':run(sys.argv[1],sys.argv[2])
