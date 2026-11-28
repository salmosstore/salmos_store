"""Sampled drums and guitar aligned to a recording; never re-sings or filters it."""
from __future__ import annotations
import io
from pathlib import Path
import wave
import zipfile
import numpy as np
from voice_tools import ffmpeg

RATE = 44100
STYLES = {'rock', 'urban', 'ballad', 'gospel', 'worship', 'reggae'}
NOTES = ('Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si')


def read_pcm(path):
    with wave.open(str(path), 'rb') as f:
        if f.getsampwidth() != 2 or f.getframerate() != RATE or f.getnchannels() != 2:
            raise ValueError('El acompañamiento necesita audio estéreo PCM16 a 44.1 kHz.')
        return np.frombuffer(f.readframes(f.getnframes()), '<i2').reshape(-1, 2).astype('float32') / 32768


def analyse(source, mono_path, binary, bpm=None, key=None):
    ffmpeg(binary, '-i', source, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', mono_path)
    with wave.open(str(mono_path), 'rb') as f:
        data = np.frombuffer(f.readframes(f.getnframes()), '<i2').astype('float32') / 32768
    hop, n, sr = 320, 2048, 16000
    window = np.hanning(n).astype('float32')
    pitch, rms, novelty = [], [], []
    previous = np.zeros(257)
    onset_window=np.hanning(512)
    for start in range(0, max(1, len(data)-n+1), hop):
        frame = data[start:start+n]
        if len(frame) < n:
            frame = np.pad(frame, (0, n-len(frame)))
        level = float(np.sqrt(np.mean(frame**2)))
        center=frame[n//2-256:n//2+256]
        spectrum = np.abs(np.fft.rfft((center-center.mean())*onset_window))
        novelty.append(float(np.maximum(0, np.log1p(spectrum*10)-np.log1p(previous*10)).sum()))
        previous = spectrum
        rms.append(level)
        frequency = 0.
        if level > .004:
            ac = np.fft.irfft(np.abs(np.fft.rfft((frame-frame.mean())*window, n*2))**2)[:n]
            ac /= max(1e-10, ac[0])
            lo, hi = 24, 213
            peaks = np.flatnonzero((ac[lo:hi] > ac[lo-1:hi-1]) & (ac[lo:hi] >= ac[lo+1:hi+1])) + lo
            if len(peaks):
                good = peaks[ac[peaks] >= max(.55, .9*float(ac[peaks].max()))]
                if len(good):
                    lag = float(good[0]);j=int(lag)
                    divisor = ac[j-1]-2*ac[j]+ac[j+1]
                    if abs(divisor) > 1e-8:lag += .5*(ac[j-1]-ac[j+1])/divisor
                    frequency = sr/lag
        pitch.append(69+12*np.log2(frequency/440) if frequency else np.nan)
    level, pitch = np.array(rms), np.array(pitch)
    flux = np.convolve(np.array(novelty), np.ones(3)/3, 'same')
    flux = np.maximum(0, flux-np.percentile(flux, 45))
    energy = float(np.dot(flux, flux))
    if not len(level) or np.percentile(level, 90) < .001:
        raise ValueError('La grabación está vacía o es demasiado baja para acompañarla.')
    if bpm is not None and not 45 <= bpm <= 200:
        raise ValueError('Elegí un pulso entre 45 y 200 por minuto, o dejalo automático.')
    fps = sr/hop
    if bpm is None:
        lags = np.arange(round(fps*60/160), round(fps*60/72)+1)
        correlation = np.array([np.dot(flux[lag:], flux[:-lag]) for lag in lags])
        scores = correlation.copy()
        for i, lag in enumerate(lags):
            if 2*lag < len(flux):scores[i] += .35*np.dot(flux[2*lag:], flux[:-2*lag])
        selected = int(np.argmax(scores));period=float(lags[selected]);confidence=float(correlation[selected]/max(energy,1e-9));bpm=60*fps/period
    else:
        period=60*fps/bpm;lag=max(1,round(period));confidence=float(np.dot(flux[lag:],flux[:-lag])/max(energy,1e-9))
    count=max(1,round(period));phase=int(np.bincount(np.arange(len(flux))%count,weights=flux,minlength=count).argmax())
    duration=len(data)/sr
    beats=[]
    for predicted in np.arange(phase,len(flux),period):
        first=max(0,round(predicted-period*.10));last=min(len(flux),round(predicted+period*.10)+1)
        found=first+int(np.argmax(flux[first:last])) if last>first else predicted
        # Follow local attacks gently, keeping a stable meter between phrases.
        at=(predicted+.55*np.clip(found-predicted,-period*.10,period*.10))/fps+n/(2*sr)
        if at<duration:beats.append(float(at))
    if not beats:beats=[0.]
    histogram=np.zeros(12)
    valid=np.isfinite(pitch)&(level>max(.004,float(np.percentile(level,65))*.25))
    for midi,weight in zip(pitch[valid],level[valid]):histogram[round(midi)%12]+=weight
    profiles=[np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]),np.array([6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17])]
    if key is not None:
        tonic=key%12;minor=key>=12
    else:
        candidates=[(float(np.dot(histogram,np.roll(profile,tonic)))/(np.linalg.norm(profile)+1e-8),tonic,mode==1) for mode,profile in enumerate(profiles) for tonic in range(12)]
        _,tonic,minor=max(candidates)
    return {'bpm':round(float(bpm),1),'confidence':round(confidence,3),'estimated':confidence<.18,'beats':beats,'tonic':int(tonic),'minor':bool(minor),'key':NOTES[tonic]+(' menor' if minor else ' mayor'),'pitch':pitch,'rms':level,'hop':hop/sr,'frameOffset':n/(2*sr),'duration':duration}


def load_samples(archive):
    bank={}
    if not Path(archive).is_file():
        raise RuntimeError('Faltan los instrumentos. Descargá y abrí el iniciador actualizado.')
    with zipfile.ZipFile(archive) as z:
        for name in ['kick','snare','hat','acoustic-C3','acoustic-C4','electric-A2','electric-A3']:
            with wave.open(io.BytesIO(z.read(name+'.wav')), 'rb') as f:
                if f.getnchannels()!=1 or f.getsampwidth()!=2 or f.getframerate()!=RATE:
                    raise RuntimeError('La biblioteca de instrumentos no es válida.')
                bank[name]=np.frombuffer(f.readframes(f.getnframes()),'<i2').astype('float32')/32768
    return bank


def arrangement_chords(analysis):
    tonic,minor=analysis['tonic'],analysis['minor']
    scale=[0,2,3,5,7,8,10] if minor else [0,2,4,5,7,9,11]
    qualities=[3,3,4,3,3,4,4] if minor else [4,3,3,4,4,3,3]
    candidates=[((tonic+root)%12,qualities[i]) for i,root in enumerate(scale) if i!=6]
    beats=analysis['beats'];chords=[];previous=(tonic,3 if minor else 4)
    for i in range(0,len(beats),4):
        start=beats[i];end=beats[i+4] if i+4<len(beats) else analysis['duration']
        a,b=max(0,round((start-analysis['frameOffset'])/analysis['hop'])),round((end-analysis['frameOffset'])/analysis['hop']);hist=np.zeros(12)
        for note,weight in zip(analysis['pitch'][a:b],analysis['rms'][a:b]):
            if np.isfinite(note):hist[round(note)%12]+=weight
        if hist.sum()>.02:
            scores=[]
            for root,third in candidates:
                score=hist[root]*1.2+hist[(root+third)%12]+hist[(root+7)%12]
                if (root,third)==previous:score+=hist.sum()*.08
                scores.append((score,root,third))
            _,root,third=max(scores);previous=(root,third)
        chords.append(previous)
    return chords


def render_accompaniment(source, output, archive, binary, style='rock', bpm=None, key=None, drum_level=.35, guitar_level=.30, report=lambda message:None):
    if style not in STYLES:raise ValueError('Elegí uno de los estilos de acompañamiento disponibles.')
    if not all(0<=value<=1 for value in (drum_level,guitar_level)):raise ValueError('Revisá el volumen de los instrumentos.')
    report('Leyendo el pulso y las notas de tu voz…')
    analysis=analyse(source,output.with_name('analisis-voz.wav'),binary,bpm,key)
    voice=read_pcm(source);length=len(voice);drums=np.zeros(length,dtype='float32');guitar=np.zeros(length,dtype='float32')
    bank=load_samples(archive);chords=arrangement_chords(analysis);notes=[];events=[]
    def place(target,sample,at,gain):
        first=max(0,round(at*RATE));end=min(length,first+len(sample))
        if end>first:target[first:end]+=sample[:end-first]*gain
    report('Colocando batería y guitarra sobre el pulso de la grabación…')
    beat_length=60/analysis['bpm'];electric=style in ('rock','gospel');cache={}
    def guitar_note(midi,hold):
        samples=[('electric-A2',45),('electric-A3',57)] if electric else [('acoustic-C3',48),('acoustic-C4',60)]
        sample,root=min(samples,key=lambda item:abs(item[1]-midi));cache_key=(sample,midi,round(hold,2))
        if cache_key not in cache:
            raw=bank[sample];speed=2**((midi-root)/12);size=min(round(hold*RATE),int(len(raw)/speed));positions=np.arange(size)*speed
            result=np.interp(positions,np.arange(len(raw)),raw).astype('float32');fade=min(len(result),round(.03*RATE))
            if fade:result[-fade:]*=np.linspace(1,0,fade)
            cache[cache_key]=result
        return cache[cache_key]
    for i,at in enumerate(analysis['beats']):
        phase=i%4;beat=(analysis['beats'][i+1]-at) if i+1<len(analysis['beats']) else beat_length
        # The hats define eighths; kick and snare leave room for the singer.
        kick=phase in (0,2);snare=phase in (1,3)
        if style=='urban':kick=phase==0 or phase==2;snare=phase in (1,3)
        if style=='reggae':kick=snare=phase==2
        if style in ('ballad','worship'):kick=phase==0;snare=phase==2
        if kick:place(drums,bank['kick'],at,.95);events.append(('kick',round(at,3)))
        if snare:place(drums,bank['snare'],at,.65);events.append(('snare',round(at,3)))
        for half in [0,.5]:place(drums,bank['hat'],at+half*beat,.16 if half else .22)
        if style=='rock' and phase==2:place(drums,bank['kick'],at+beat*.5,.45)
        root,third=chords[min(len(chords)-1,i//4)];base=48+root
        chord=[base,base+7,base+12] if style=='rock' else [base,base+third,base+7]
        times=[(at, .72), (at+beat*.5,.35)] if style in ('rock','urban','gospel') else [(at, .60)]
        if style=='reggae':times=[(at+beat*.5,.70)]
        if style in ('ballad','worship') and phase%2:times=[]
        for when,gain in times:
            hold=beat*(.65 if style in ('rock','reggae','urban') else 1.6)
            for j,midi in enumerate(chord):place(guitar,guitar_note(midi,hold),when+j*.012,gain/3)
            notes.append({'time':round(when,3),'root':int(root),'minor':third==3})
    # Backing fades in extended pauses; the vocal array is never processed.
    gate=np.zeros(length,dtype='float32');block=round(.1*RATE)
    levels=np.array([np.sqrt(np.mean(voice[j:j+block]**2)) for j in range(0,length,block)])
    threshold=max(.001,float(np.percentile(levels,85))*.025)
    active=levels>threshold
    hold=max(1,round(1.2/.1));activity=np.convolve(active.astype(float),np.ones(hold),mode='full')[:len(active)]>0
    gains=np.where(activity,1.,.12)
    gate=np.interp(np.arange(length),np.arange(len(gains))*block,gains).astype('float32')
    fade=min(round(RATE*.8),length)
    if fade:gate[-fade:]*=np.linspace(1,0,fade)
    def level_track(data,amount):
        rms=np.array([np.sqrt(np.mean(data[j:j+block]**2)) for j in range(0,length,block)])
        typical=float(np.percentile(rms[rms>1e-5],70)) if np.any(rms>1e-5) else 1.
        target=float(np.percentile(levels[active],70)) if active.any() else .03
        return data*(target/max(typical,1e-5))*amount*gate
    drums=level_track(drums,drum_level);guitar=level_track(guitar,guitar_level)
    backing=np.column_stack((drums+guitar*.92,drums+guitar))
    # Reduce only the backing at peaks. A loud syllable must not mute the
    # instruments for the whole recording or change the vocal gain.
    safe=np.ones_like(backing)
    positive=backing>1e-8;negative=backing<-1e-8
    safe[positive]=np.minimum(1,np.maximum(0,(32767/32768-voice[positive])/backing[positive]))
    safe[negative]=np.minimum(1,np.maximum(0,(-1-voice[negative])/backing[negative]))
    mixed=voice+backing*safe
    with wave.open(str(output),'wb') as f:
        f.setparams((2,2,RATE,0,'NONE','not compressed'));f.writeframes(np.rint(np.clip(mixed,-1,32767/32768)*32768).astype('<i2').tobytes())
    report('Acompañamiento listo. Tu voz conserva sus tiempos y su afinación.')
    return {k:analysis[k] for k in ('bpm','confidence','estimated','key')}|{'method':'sampled-instruments-v1','voiceUnchanged':True,'instruments':['Batería','Guitarra eléctrica' if electric else 'Guitarra acústica'],'drumLevel':drum_level,'guitarLevel':guitar_level,'beats':len(analysis['beats']),'guitarEvents':len(notes),'duration':length/RATE,'firstBeat':analysis['beats'][0]}
