"""Render SALMOS movement with the installed WanGP or FFmpeg."""
import json
import math
import os
import shutil
import subprocess
import sys
import traceback
from pathlib import Path


def resolution(request, fast=False):
    width,height = request.get('width',480),request.get('height',832)
    pixels = 352*608 if fast else 480*832
    scale = math.sqrt(pixels/(width*height))
    return max(32,int(width*scale)//16*16), max(32,int(height*scale)//16*16)


def camera_video(source, destination, request):
    fps, frames = 24, 72
    width,height = resolution(request)
    progress = '(0.5-0.5*cos(PI*on/71))'
    center_x,center_y = '(iw-iw/zoom)/2','(ih-ih/zoom)/2'
    crop_x,crop_y = '(iw-iw/zoom)','(ih-ih/zoom)'
    moves = {
        'push':('1+0.16*'+progress,center_x,center_y),
        'pull':('1.16-0.16*'+progress,center_x,center_y),
        'left':('1.14',crop_x+'*(1-'+progress+')',center_y),
        'right':('1.14',crop_x+'*'+progress,center_y),
        'rise':('1.14',center_x,crop_y+'*(1-'+progress+')'),
        'lower':('1.14',center_x,crop_y+'*'+progress),
        'detail':('1+0.23*'+progress,center_x,crop_y+'*0.58'),
    }
    zoom,x,y = moves[request['camera']]
    graph = (f"scale={2*width}:{2*height}:flags=lanczos,"
             f"zoompan=z='{zoom}':x='{x}':y='{y}':d={frames}:s={width}x{height}:fps={fps}")
    subprocess.run([request['ffmpeg'],'-nostdin','-hide_banner','-loglevel','error','-i',str(source),
        '-vf',graph,'-frames:v',str(frames),'-c:v','libx264','-preset','veryfast',
        '-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(destination)],check=True,timeout=120)


def eye_pairs(cv, cascade, grey, face):
    x,y,w,h = face
    eyes = list(cascade.detectMultiScale(grey[y:y+int(.58*h),x:x+w],1.12,5,
                                       minSize=(max(8,w//9),max(7,h//10))))
    eyes.sort(key=lambda box:box[2]*box[3],reverse=True)
    if len(eyes)<2:
        return []
    eyes = sorted(eyes[:2],key=lambda box:box[0])
    a,b = eyes
    distance = (b[0]+b[2]/2)-(a[0]+a[2]/2)
    if not .23*w<distance<.7*w or abs(a[1]-b[1])>.19*h:
        return []
    return [(x+ex,y+ey,ew,eh) for ex,ey,ew,eh in eyes]


def preserve_eyes(reference, video, destination, ffmpeg):
    """Blend a pair of detected eyes on stable, near-frontal shots."""
    if not ffmpeg:
        return False
    import cv2 as cv
    import numpy as np

    origin = cv.imread(str(reference))
    if origin is None:
        return False
    face_scan = cv.CascadeClassifier(cv.data.haarcascades+'haarcascade_frontalface_default.xml')
    eye_scan = cv.CascadeClassifier(cv.data.haarcascades+'haarcascade_eye.xml')
    if face_scan.empty() or eye_scan.empty():
        return False
    capture = cv.VideoCapture(str(video))
    try:
        ok,frame = capture.read()
        if not ok:
            return False
        height,width = frame.shape[:2]
        origin = cv.resize(origin,(width,height),interpolation=cv.INTER_AREA)
        grey = cv.cvtColor(origin,cv.COLOR_BGR2GRAY)
        faces = list(face_scan.detectMultiScale(grey[:int(height*.62)],1.12,5,minSize=(32,32)))
        if len(faces)!=1:
            return False
        face=faces[0]
        fx,fy,fw,fh=face
        left,top=max(0,int(fx-fw*.3)),max(0,int(fy-fh*.3))
        right,bottom=min(width,int(fx+fw*1.3)),min(height,int(fy+fh*1.3))
        eyes = eye_pairs(cv,eye_scan,grey,face)
        if not eyes:
            return False
        fps=capture.get(cv.CAP_PROP_FPS) or 16
        temp=destination.with_name('mirada.mp4')
        command=[ffmpeg,'-nostdin','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','bgr24',
            '-s',f'{width}x{height}','-r',str(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast',
            '-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(temp)]
        frames,protected=0,0
        with subprocess.Popen(command,stdin=subprocess.PIPE) as encoder:
            try:
                while ok:
                    gray_frame=cv.cvtColor(frame,cv.COLOR_BGR2GRAY)
                    region=gray_frame[top:bottom,left:right]
                    matches=face_scan.detectMultiScale(region,1.13,4,minSize=(max(30,int(fw*.7)),max(30,int(fh*.7))))
                    nearest=min(matches,key=lambda box:abs(box[0]+left-fx)+abs(box[1]+top-fy),default=None)
                    if nearest is not None:
                        x,y,w,h=nearest
                        dx,dy=int(x+left-fx),int(y+top-fy)
                        if abs(dx)<fw*.14 and abs(dy)<fh*.14 and abs(w-fw)<fw*.13 and abs(h-fh)<fh*.13:
                            for ex,ey,ew,eh in eyes:
                                # Limit blending to a feathered oval within the eye socket.
                                if ex+dx<0 or ey+dy<0 or ex+dx+ew>width or ey+dy+eh>height:
                                    continue
                                patch=origin[ey:ey+eh,ex:ex+ew]
                                view=frame[ey+dy:ey+dy+eh,ex+dx:ex+dx+ew]
                                mask=np.zeros((eh,ew),dtype=np.float32)
                                cv.ellipse(mask,(ew//2,eh//2),(max(1,ew*4//9),max(1,eh*3//10)),0,0,360,1,-1)
                                mask=cv.GaussianBlur(mask,(0,0),max(1,ew*.07))[...,None]*.96
                                view[:]=np.clip(view*(1-mask)+patch*mask,0,255).astype(np.uint8)
                            protected+=1
                    frames+=1
                    encoder.stdin.write(frame.tobytes())
                    ok,frame=capture.read()
            finally:
                encoder.stdin.close()
            if encoder.wait(timeout=45) or not frames or protected/frames<.6:
                temp.unlink(missing_ok=True)
                return False
        temp.replace(destination)
        return True
    finally:
        capture.release()


def make_poster(ffmpeg,video,destination):
    if ffmpeg:
        subprocess.run([ffmpeg,'-nostdin','-hide_banner','-loglevel','error','-ss','0.45','-i',str(video),
            '-frames:v','1','-vf','scale=320:320:force_original_aspect_ratio=decrease','-q:v','3',str(destination)],
            stdout=subprocess.DEVNULL,check=False,timeout=30)


def wan_video(root,folder,request,status):
    os.chdir(root)
    sys.path.insert(0,str(root))
    os.environ['HF_HUB_OFFLINE']='1'
    os.environ['TRANSFORMERS_OFFLINE']='1'
    git=shutil.which('git')
    if not git:
        for candidate in [Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Git/cmd/git.exe',
                          Path(os.environ.get('ProgramFiles(x86)','C:/Program Files (x86)'))/'Git/cmd/git.exe',
                          Path(os.environ.get('LOCALAPPDATA','C:/'))/'Programs/Git/cmd/git.exe',
                          root/'git/cmd/git.exe',Path('E:/Git/cmd/git.exe')]:
            if candidate.is_file():
                git=str(candidate)
                break
    if not git:
        raise RuntimeError('No se encontró Git instalado.')
    os.environ['GIT_PYTHON_GIT_EXECUTABLE']=git
    os.environ['PATH']=str(Path(git).parent)+os.pathsep+os.environ.get('PATH','')
    from shared.api import init
    status('running','Cargando WanGP instalado…',.04)
    session=init(root=root,output_dir=folder/'salidas',cli_args=['--attention','sdpa','--profile','4'])
    availability=session.get_model_availability('vace_1.3B')
    if not (availability.get('available') is True or availability.get('downloaded') is True or
            availability.get('status') in ('available','downloaded','ready','green')):
        raise RuntimeError('WanGP no encontró el modelo Vace 1.3B instalado.')
    settings=json.loads((Path(__file__).resolve().parent/'wan-preset.json').read_text(encoding='utf-8'))
    fast=request.get('fast',False)
    width,height=resolution(request,fast)
    settings.update(prompt=request['prompt'],negative_prompt=request.get('negative',''),
        image_refs=[str(folder/'producto.png')],frames_positions='1',video_prompt_type='FI',
        video_length=17 if fast else 33,num_inference_steps=20 if fast else 30,resolution=f'{width}x{height}',
        remove_background_images_ref=0,repeat_generation=1,output_filename='SALMOS-movimiento',
        overrides="attention_mode='sdpa', memory_profile=4")
    class Callbacks:
        def on_status(self,text):
            status('running',str(text)[:250])
        def on_progress(self,update):
            status('running',str(getattr(update,'status','Generando…'))[:250],
                   max(0,min(100,float(getattr(update,'progress',0))))*.0088)
    status('running','Generando movimiento con Vace 1.3B…',.08)
    result=session.submit_task(settings,callbacks=Callbacks()).result()
    videos=[Path(p) for p in result.generated_files if Path(p).suffix.lower()=='.mp4' and Path(p).is_file()]
    if not result.success or not videos:
        raise RuntimeError('; '.join(str(getattr(e,'message',e)) for e in result.errors) or 'WanGP no devolvió un video.')
    return videos[0]


def run(root,folder):
    root,folder=Path(root).resolve(),Path(folder).resolve()
    def status(state,message,progress=0,**extra):
        temp=folder/'status.tmp'
        temp.write_text(json.dumps(dict(state=state,message=message,progress=progress,**extra),ensure_ascii=False),encoding='utf-8')
        temp.replace(folder/'status.json')
    try:
        request=json.loads((folder/'request.json').read_text(encoding='utf-8'))
        reference=folder/'producto.png'
        destination=folder/'resultado.mp4'
        protected=False
        if request.get('camera'):
            status('running','Renderizando el movimiento de cámara…',.15)
            camera_video(reference,destination,request)
        else:
            result=wan_video(root,folder,request,status)
            if request.get('preserveEyes'):
                status('running','Revisando la estabilidad de la mirada…',.93)
                try:
                    protected=preserve_eyes(reference,result,destination,request.get('ffmpeg'))
                except Exception:
                    traceback.print_exc()
            if not protected:
                shutil.copyfile(result,destination)
        try:
            make_poster(request.get('ffmpeg'),destination,folder/'poster.jpg')
        except (OSError,subprocess.SubprocessError):
            traceback.print_exc()
        message=('Video listo. Se estabilizó la mirada.' if protected else
                 'Video listo. Revisá la vista previa.')
        status('done',message,1,eyesProtected=protected)
    except Exception as error:
        status('error',str(error)[:450])
        traceback.print_exc()


if __name__=='__main__':
    run(sys.argv[1],sys.argv[2])
