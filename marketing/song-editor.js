/* Edición local de audio, recorte y notas para SALMOS. */
(() => {
  'use strict';
  const rate=44100, clamp=(n,low,high)=>Math.min(high,Math.max(low,n));
  const id=()=>crypto.randomUUID(), timeText=n=>Math.floor(n/60)+':'+(n%60).toFixed(2).padStart(5,'0');
  const offline=(size,channels=2)=>new OfflineAudioContext(channels,Math.max(1,size),rate);
  const instruments={
    kick:'Bombo',snare:'Redoblante',clap:'Palmas',hat:'Hi-hat cerrado',openHat:'Hi-hat abierto',
    tom:'Tom',shaker:'Shaker',cymbal:'Platillo',bass:'Bajo',keys:'Teclas',pluck:'Cuerda pulsada',bell:'Campana',pad:'Sintetizador'
  };
  const drums=new Set(['kick','snare','clap','hat','openHat','tom','shaker','cymbal']);
  const noteNames=['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
  const voicePresets={
    house:[['kick',0,1],['clap',1,2],['hat',.5,1]],
    urban:[['kick',0,4],['kick',1.5,4],['clap',1,2],['hat',.5,1]],
    reggae:[['kick',2,4],['snare',2,4],['keys',.5,1,60]],
    rock:[['kick',0,2],['snare',1,2],['hat',0,.5]],
    cumbia:[['kick',0,2],['shaker',.5,1],['bass',1,2,36]],
    bachata:[['kick',0,4],['shaker',.5,.5],['tom',2.5,4]],
    salsa:[['clap',0,4],['clap',1.5,4],['clap',2.5,4],['tom',1,2]],
    acoustic:[['kick',0,4],['shaker',1,2],['bass',0,4,36]]
  };
  const voiceRhythms={
    deep:'house',organic:'house',dance:'house',funk:'urban',hiphop:'urban',trap:'urban',reggaeton:'urban',
    rnb:'urban',worship:'acoustic',gospel:'rock',ballad:'acoustic',bossa:'acoustic',lofi:'acoustic',merengue:'salsa'
  };

  function bufferNoise(ctx){
    const noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=noise.getChannelData(0);
    let seed=217;
    for(let i=0;i<data.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      data[i]=seed/2147483648-1;
    }
    return noise;
  }

  function strike(ctx,dest,instrument,start,length,pitch,level,noise){
    if(!level||length<=0)return;
    const gain=ctx.createGain(),end=start+length;
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.linearRampToValueAtTime(level,start+Math.min(.014,length/4));
    gain.gain.exponentialRampToValueAtTime(.0001,end);
    gain.connect(dest);
    const hz=440*2**((pitch-69)/12);
    if(['snare','clap','hat','openHat','shaker','cymbal'].includes(instrument)){
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter();
      source.buffer=noise;
      filter.type=instrument==='snare'||instrument==='clap'?'bandpass':'highpass';
      filter.frequency.value={snare:1800,clap:1300,hat:7600,openHat:5800,shaker:4300,cymbal:3700}[instrument];
      source.connect(filter);filter.connect(gain);source.start(start);source.stop(end);
      return;
    }
    const osc=ctx.createOscillator(),filter=ctx.createBiquadFilter();
    osc.type={bass:'triangle',keys:'triangle',pluck:'sawtooth',bell:'sine',pad:'triangle'}[instrument]||'sine';
    const drum=instrument==='kick'||instrument==='tom';
    osc.frequency.setValueAtTime(drum?(instrument==='kick'?138:250):hz,start);
    if(drum)osc.frequency.exponentialRampToValueAtTime(instrument==='kick'?47:97,start+Math.min(.16,length*.6));
    filter.type='lowpass';filter.frequency.value=instrument==='pluck'?1700:instrument==='bass'?920:7000;
    osc.connect(filter);filter.connect(gain);osc.start(start);osc.stop(end);
    if(instrument==='bell'||instrument==='keys'){
      const overtone=ctx.createOscillator(),quiet=ctx.createGain();
      overtone.frequency.value=hz*(instrument==='bell'?2.76:2);
      quiet.gain.value=.18;overtone.connect(quiet);quiet.connect(gain);overtone.start(start);overtone.stop(end);
    }
  }

  function initialSettings(duration,stored,trim,voice,style,bpm){
    const start=clamp(Number(stored?.start??trim?.start)||0,0,Math.max(0,duration-.02));
    const end=clamp(Number(stored?.end??trim?.end)||duration,Math.min(duration,start+.02),duration);
    const value={start,end,bpm:clamp(Number(stored?.bpm??bpm)||120,40,240),snap:stored?.snap||'0.5',
      clean:stored?.clean??(voice?60:0),volume:stored?.volume??100,effect:stored?.effect||'',
      lanes:Array.isArray(stored?.lanes)?structuredClone(stored.lanes):[]};
    if(voice&&!value.lanes.length)seedRhythm(value,style,start,end);
    return value;
  }

  function seedRhythm(settings,style,from,to){
    const pattern=voicePresets[style]||voicePresets[voiceRhythms[style]]||voicePresets.acoustic;
    const beat=60/settings.bpm;
    for(const [instrument,offset,each,pitch=48] of pattern){
      const at=from+offset*beat;
      if(at>=to)continue;
      let lane=settings.lanes.find(row=>row.instrument===instrument);
      if(!lane){
        lane={id:id(),instrument,volume:instrument==='shaker'||instrument==='hat'?18:27,notes:[]};
        settings.lanes.push(lane);
      }
      lane.notes.push({id:id(),at,length:drums.has(instrument)?.16:.36,pitch,velocity:73,each,
        count:Math.min(5000,Math.ceil((to-at)/(each*beat)))});
    }
  }

  async function render(buffer,settings,{start=settings.start,end=settings.end}={}){
    const from=clamp(start,0,buffer.duration),length=clamp(end-from,.001,buffer.duration-from);
    const ctx=offline(Math.round(length*rate),Math.min(2,buffer.numberOfChannels===1&&!settings.lanes.length?1:2));
    const limiter=ctx.createDynamicsCompressor(),input=ctx.createBufferSource(),level=ctx.createGain();
    limiter.threshold.value=-2;limiter.knee.value=2;limiter.ratio.value=16;
    limiter.connect(ctx.destination);
    input.buffer=buffer;
    level.gain.value=settings.volume/100;
    let chain=input;
    if(settings.clean){
      const highpass=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter(),compress=ctx.createDynamicsCompressor();
      highpass.type='highpass';highpass.frequency.value=55+settings.clean*.6;
      presence.type='peaking';presence.frequency.value=2900;presence.Q.value=.8;presence.gain.value=settings.clean*.045;
      compress.threshold.value=-18-settings.clean*.08;compress.ratio.value=1.6+settings.clean*.035;
      chain.connect(highpass);highpass.connect(presence);presence.connect(compress);chain=compress;
    }
    chain.connect(level);level.connect(limiter);
    if(settings.effect==='bass'){
      const low=ctx.createBiquadFilter();low.type='lowshelf';low.frequency.value=160;low.gain.value=4;
      level.disconnect();level.connect(low);low.connect(limiter);
    }
    if(settings.effect==='echo'){
      const echo=ctx.createDelay(.5),wet=ctx.createGain();
      echo.delayTime.value=.25;wet.gain.value=.19;level.connect(echo);echo.connect(wet);wet.connect(limiter);
    }
    const fade=settings.effect==='fade'?Math.min(1.25,length/3):Math.min(.018,length/3);
    level.gain.setValueAtTime(0,0);level.gain.linearRampToValueAtTime(settings.volume/100,fade);
    level.gain.setValueAtTime(settings.volume/100,length-fade);level.gain.linearRampToValueAtTime(0,length);
    input.start(0,from,length);
    if(settings.lanes.length){
      const noise=bufferNoise(ctx),beat=60/settings.bpm;
      for(const lane of settings.lanes)for(const note of lane.notes){
        const interval=Math.max(.125,note.each)*beat;
        const first=Math.max(0,Math.ceil((from-note.at)/interval-1e-6));
        const last=Math.min(note.count,Math.ceil((from+length-note.at)/interval));
        for(let i=first;i<last;i++){
          const when=Math.max(0,note.at+i*interval-from);
          strike(ctx,limiter,lane.instrument,when,Math.min(note.length,length-when),note.pitch,
            lane.volume/100*note.velocity/100*.7,noise);
        }
      }
    }
    return ctx.startRendering();
  }

  function waveform(buffer){
    const data=buffer.getChannelData(0),size=Math.min(16000,data.length),peaks=new Float32Array(size);
    for(let i=0;i<size;i++){
      const a=Math.floor(i*data.length/size),b=Math.floor((i+1)*data.length/size);
      const step=Math.max(1,Math.floor((b-a)/24));
      for(let x=a;x<b;x+=step)peaks[i]=Math.max(peaks[i],Math.abs(data[x]));
    }
    return peaks;
  }

  function floatWav(buffer){
    const stride=buffer.numberOfChannels*4,byteLength=buffer.length*stride;
    const bytes=new ArrayBuffer(44+byteLength),view=new DataView(bytes);
    const ascii=(at,text)=>[...text].forEach((char,i)=>view.setUint8(at+i,char.charCodeAt(0)));
    ascii(0,'RIFF');view.setUint32(4,byteLength+36,true);ascii(8,'WAVE');ascii(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,3,true);view.setUint16(22,buffer.numberOfChannels,true);
    view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*stride,true);
    view.setUint16(32,stride,true);view.setUint16(34,32,true);ascii(36,'data');view.setUint32(40,byteLength,true);
    for(let channel=0;channel<buffer.numberOfChannels;channel++){
      const samples=buffer.getChannelData(channel);
      for(let i=0;i<buffer.length;i++)view.setFloat32(44+i*stride+channel*4,samples[i],true);
    }
    return new Blob([bytes],{type:'audio/wav'});
  }

  function download(blob,name){
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }

  async function open(options){
    const {track,blob,tools,reel}=options;
    const buffer=await offline(1).decodeAudioData(await blob.arrayBuffer()).catch(()=>{throw Error('No se pudo abrir el audio.');});
    const duration=buffer.duration;
    if(!duration||duration>601)throw Error('Elegí un audio de hasta diez minutos.');
    const settings=initialSettings(duration,options.settings,options.trim,options.voice,options.style,options.bpm);
    const dialog=document.createElement('dialog');
    dialog.className='song-editor';dialog.setAttribute('aria-labelledby','songEditTitle');
    dialog.innerHTML=`<header><div><h2 id="songEditTitle">Editar canción</h2><p data-song-status role="status"></p></div>
      <button data-close aria-label="Cerrar edición">×</button></header>
      <div class="song-editor-layout"><div class="song-cut-panel">
        <label>Nombre<input data-name maxlength="100"></label>
        <section aria-label="Recorte de audio">
          <div class="song-toolbar"><h3>Recorte</h3><label>Zoom<select data-zoom><option value="1">Completo</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option><option value="32">32×</option></select></label>
            <label data-pan-label hidden>Desplazar<input data-pan type="range" min="0" step=".01" value="0"></label>
            <button data-full>Restablecer recorte</button></div>
          <div class="song-ruler" data-ruler></div>
          <div class="song-wave" data-wave><canvas aria-hidden="true"></canvas><div class="song-region" data-region></div>
            <div class="song-playhead" data-head></div><button data-marker="start" aria-label="Mover inicio">I</button><button data-marker="end" aria-label="Mover final">F</button></div>
          <div class="song-cut-controls">
            <div><label>Desde (segundos)<input data-start type="number" min="0" step=".01"></label><button data-set-start>Inicio aquí</button></div>
            <div><label>Hasta (segundos)<input data-end type="number" min="0" step=".01"></label><button data-set-end>Final aquí</button></div></div>
          <div class="song-toolbar"><button class="primary" data-play>▶ Escuchar fragmento</button><output data-clock></output><label class="song-repeat"><input data-loop type="checkbox"> Repetir fragmento</label></div>
          <p class="song-cut-hint">Arrastrá <strong>I</strong> y <strong>F</strong> sobre la onda, o escribí los segundos.</p>
        </section>
      </div>
      <div class="song-tools-panel">
        <section class="song-arrange" aria-labelledby="songInstrumentsTitle">
          <h3 id="songInstrumentsTitle">Instrumentos</h3>
          <ol class="song-instructions">
            <li>Elegí un instrumento y tocá <strong>＋ Pista</strong>.</li>
            <li>Hacé clic en la pista para colocar un golpe o una nota. Arrastralo para moverlo.</li>
            <li>Tocá una nota para ajustar su duración, intensidad y repeticiones. Usá <strong>Escuchar fragmento</strong> para probar la mezcla.</li>
          </ol>
          <div class="song-toolbar"><label>Tempo (BPM)<input type="number" data-bpm min="40" max="240" step="1"></label>
          <label>Ajuste al pulso<select data-snap><option value=".25">1/16</option><option value="0.5">1/8</option><option value="1">1/4</option><option value="0">Libre</option></select></label></div>
          <div class="song-toolbar"><select data-instruments aria-label="Instrumento"></select><button data-add>＋ Pista</button>
            <button data-rhythm title="Agrega un patrón desde la posición actual de la línea de tiempo">Ritmo desde el cursor</button></div>
          <div data-lanes class="song-lanes" aria-label="Pistas de instrumentos"></div>
          <fieldset data-note hidden><legend>Nota seleccionada</legend><div class="song-note-fields">
            <label>En (s)<input data-at type="number" min="0" step=".01"></label><label>Duración (s)<input data-length type="number" min=".03" max="10" step=".01"></label>
            <label data-pitch-label>Nota<select data-pitch></select></label><label>Intensidad <input data-velocity type="range" min="1" max="100"></label>
            <label>Repeticiones<input data-count type="number" min="1" max="5000" step="1"></label><label>Intervalo (pulsos)<input data-each type="number" min=".125" max="32" step=".125"></label>
            <button data-note-delete>Quitar nota</button></div></fieldset>
          <div class="song-controls"><label>Volumen original<input data-volume type="range" min="0" max="150"></label>
            <label>Mejorar voz<input data-clean type="range" min="0" max="100"></label>
            <label>Efecto<select data-effect><option value="">Sin efecto</option><option value="echo">Eco suave</option><option value="bass">Realzar graves</option><option value="fade">Entrada y salida suaves</option></select></label></div>
        </section>
        <details data-lyric-box><summary>Letra de la canción</summary>
          <label>Letra adjunta<textarea data-lyric rows="3" maxlength="3000" placeholder="Pegá la letra que querés guardar con este audio"></textarea></label>
          <div class="song-toolbar"><button data-save-lyric>Guardar letra adjunta</button><button data-check-lyric hidden>Revisar lo cantado</button></div>
          <p data-lyric-check role="status" hidden></p></details>
      </div>
      <aside class="song-reel" data-reel hidden><h3>Vista previa del reel</h3><canvas data-frame aria-label="Vista previa del reel"></canvas>
        <p data-frame-time></p></aside></div>
      <footer><button data-delete class="song-delete">Descartar canción</button><div class="song-toolbar">
        <button data-original>Guardar original</button><button data-wav>Descargar WAV</button><button data-mp3>Descargar MP3</button>
        <button data-save>Guardar como nueva versión</button><button data-apply class="primary" hidden>✓ Usar en el reel</button></div></footer>`;
    const $=selector=>dialog.querySelector(selector),find=key=>$('[data-'+key+']');
    const peaks=waveform(buffer),wave=find('wave'),surface=wave.querySelector('canvas'),player=new Audio();
    const fields={start:find('start'),end:find('end')};
    let playingFrom=0,reelElapsed=0,lastPosition=0,head=settings.start,left=0,zoom=1,activeNote=null,tick=0,url='',locked=false,mixSerial=0,rendered=null,dirty=!!options.voice,previewContext=null;
    const edited=()=>settings.lanes.some(lane=>lane.notes.length)||settings.clean!==0||settings.volume!==100||!!settings.effect;
    const lyrics=track.request?.lyrics||track.lyrics;
    find('name').value=track.name||'Mi canción';
    find('lyric').value=lyrics||'';
    find('lyric-box').hidden=!options.onLyrics&&!lyrics;
    find('save-lyric').hidden=!options.onLyrics;
    find('check-lyric').hidden=!options.onCheckLyrics||!lyrics;
    function showLyricCheck(check){
      const label=find('lyric-check');
      const detail=window.SalmosAudioStudio.lyricsCheckText(check);
      label.hidden=!detail;
      label.textContent=detail+(check?.heard?'\nSe detectó: '+check.heard:'');
      if(detail&&check.status==='review')find('lyric-box').open=true;
    }
    showLyricCheck(track.lyricsCheck);
    find('original').disabled=!!track.saved&&!track.localOnly;
    if(find('original').disabled)find('original').textContent='✓ Original guardado';
    find('delete').hidden=!options.onDelete;
    find('apply').hidden=!options.onApply;
    find('reel').hidden=!reel;
    find('mp3').hidden=!options.onMP3;
    find('bpm').value=settings.bpm;find('snap').value=settings.snap;
    find('loop').checked=!!reel?.loop;
    for(const key of ['volume','clean','effect'])find(key).value=settings[key];
    for(const [key,name] of Object.entries(instruments))find('instruments').add(new Option(name,key));
    for(let n=24;n<=84;n++)find('pitch').add(new Option(noteNames[n%12]+(Math.floor(n/12)-1),n));

    function show(message){find('song-status').textContent=message;}
    function name(){return find('name').value.trim()||track.name||'Mi canción';}
    function showReel(value=head,playback=false){
      if(!reel)return;
      const relative=(Math.max(0,value-settings.start)+(playback?reelElapsed:0))/(reel.rate||1);
      const at=reel.position(relative);
      reel.draw(find('frame'),at);
      find('frame-time').textContent=timeText(at)+' / '+timeText(reel.duration)+' · '+reel.caption(at);
    }
    function stop(){
      player.pause();cancelAnimationFrame(tick);find('play').textContent='▶ Escuchar fragmento';
    }
    function change(){
      stop();dirty=true;mixSerial++;rendered=null;refresh();
    }
    const span=()=>duration/zoom;
    const percent=seconds=>(seconds-left)/span()*100;
    const setHead=value=>{stop();head=clamp(value,0,duration);drawHead();showReel();};
    function drawHead(){
      const pos=percent(head);
      find('head').hidden=pos<0||pos>100;find('head').style.left=pos+'%';
      for(const mark of dialog.querySelectorAll('.song-lane-head'))mark.style.left=clamp(pos,0,100)+'%';
      find('clock').value=timeText(head)+' · '+timeText(settings.end-settings.start)+' seleccionados';
    }
    function paint(){
      const width=Math.max(1,Math.round(wave.clientWidth*devicePixelRatio)),height=Math.round(112*devicePixelRatio);
      surface.width=width;surface.height=height;
      const ctx=surface.getContext('2d');ctx.fillStyle='#e88db6';
      for(let x=0;x<width;x++){
        const p=(left+span()*x/width)*peaks.length/duration;
        const q=(left+span()*(x+1)/width)*peaks.length/duration;
        let peak=0;
        for(let i=Math.floor(p);i<Math.min(peaks.length,Math.max(Math.ceil(q),Math.floor(p)+1));i++)peak=Math.max(peak,peaks[i]||0);
        const amp=Math.max(1,Math.sqrt(peak)*height*.47);
        ctx.fillRect(x,height/2-amp,1,amp*2);
      }
    }
    function bound(key,value){
      if(!Number.isFinite(value))return;
      settings[key]=key==='start'?clamp(value,0,Math.max(0,settings.end-.02)):clamp(value,Math.min(duration,settings.start+.02),duration);
      head=settings[key];change();showReel();
    }
    function timeline(){
      for(const key of ['start','end']){
        fields[key].max=duration.toFixed(3);
        if(document.activeElement!==fields[key])fields[key].value=settings[key].toFixed(2);
        const marker=$('[data-marker="'+key+'"]'),pos=percent(settings[key]);
        marker.hidden=pos<-.01||pos>100.01;marker.style.left=clamp(pos,0,100)+'%';
      }
      const region=find('region'),a=clamp(percent(settings.start),0,100),b=clamp(percent(settings.end),0,100);
      region.style.left=a+'%';region.style.width=(b-a)+'%';
      const ruler=find('ruler');ruler.replaceChildren();
      for(let i=0;i<=4;i++){
        const label=document.createElement('span');label.textContent=timeText(left+i*span()/4);ruler.append(label);
      }
      drawHead();paint();
    }
    function noteEditor(){
      const selection=find('note');
      selection.hidden=!activeNote;
      if(!activeNote)return;
      const {lane,note}=activeNote;
      find('pitch-label').hidden=drums.has(lane.instrument);
      for(const key of ['at','length','pitch','velocity','count','each']){
        const input=find(key);
        if(document.activeElement!==input)input.value=key==='at'?note.at.toFixed(2):note[key];
      }
      find('at').max=duration;
    }
    function quantize(value){
      const tick=Number(settings.snap)*60/settings.bpm;
      return clamp(tick?Math.round(value/tick)*tick:value,0,Math.max(0,duration-.03));
    }
    const point=(event,area)=>clamp(left+(event.clientX-area.getBoundingClientRect().left)/area.clientWidth*span(),0,duration);
    function audition(lane,note){
      previewContext||=new AudioContext();
      previewContext.resume().catch(()=>{});
      strike(previewContext,previewContext.destination,lane.instrument,previewContext.currentTime+.02,
        Math.min(.7,note.length),note.pitch,lane.volume*note.velocity/20000,bufferNoise(previewContext));
    }
    function addNote(lane,seconds){
      const note={id:id(),at:quantize(seconds),length:drums.has(lane.instrument)?.16:.38,pitch:lane.instrument==='bass'?36:60,velocity:80,each:1,count:1};
      lane.notes.push(note);activeNote={lane,note};change();audition(lane,note);
    }
    function renderLanes(){
      const host=find('lanes');host.replaceChildren();
      for(const lane of settings.lanes){
        const row=document.createElement('div');row.className='song-lane';
        const title=document.createElement('div');title.className='song-lane-title';
        const label=document.createElement('strong');label.textContent=instruments[lane.instrument];
        const volume=document.createElement('input');volume.type='range';volume.max=100;volume.value=lane.volume;
        volume.setAttribute('aria-label','Volumen de '+label.textContent);
        volume.oninput=()=>{lane.volume=Number(volume.value);stop();mixSerial++;rendered=null;dirty=true;};
        const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Quitar pista de '+label.textContent);
        remove.onclick=()=>{settings.lanes=settings.lanes.filter(row=>row!==lane);if(activeNote?.lane===lane)activeNote=null;change();};
        const insert=document.createElement('button');insert.textContent='＋';insert.setAttribute('aria-label','Agregar nota al cursor');
        insert.onclick=()=>addNote(lane,head);
        title.append(label,volume,insert,remove);
        const line=document.createElement('div');line.className='song-lane-grid';line.title='Tocá para colocar una nota. Arrastrá una nota para moverla.';
        const beat=60/settings.bpm,step=beat*(span()/beat>64?4:1);
        line.style.backgroundSize=(step/span()*100)+'% 100%';line.style.backgroundPosition=(-left/step*(step/span())*100)+'% 0';
        line.onclick=event=>{if(event.target===line)addNote(lane,point(event,line));};
        const headLine=document.createElement('span');headLine.className='song-lane-head';line.append(headLine);
        for(const note of lane.notes){
          const repeat=beat*note.each,first=Math.max(0,Math.floor((left-note.at)/repeat));
          const stride=Math.max(1,Math.ceil(span()/repeat/220));
          for(let i=first;i<note.count;i+=stride){
            const at=note.at+i*repeat;
            if(at>=left+span()||at>=duration)break;
            if(at+note.length<left)continue;
            const marker=document.createElement('button'),barStart=clamp(percent(at),0,100);
            marker.className='song-note'+(activeNote?.note===note?' active':'');
            marker.style.left=barStart+'%';marker.style.width=Math.max(0,clamp(percent(at+note.length),0,100)-barStart)+'%';
            marker.setAttribute('aria-label',instruments[lane.instrument]+' en '+timeText(at));
            marker.title=marker.getAttribute('aria-label')+(note.count>1?' · patrón repetido':'');
            marker.onclick=event=>{event.stopPropagation();activeNote={lane,note};refresh();audition(lane,note);};
            marker.onpointerdown=event=>{
              if(event.button!==0)return;
              marker.setPointerCapture(event.pointerId);
              const origin=note.at,start=event.clientX;
              let moved=false;
              marker.onpointermove=event=>{
                const delta=event.clientX-start;
                if(Math.abs(delta)<3&&!moved)return;
                moved=true;note.at=quantize(origin+delta/line.clientWidth*span());
                marker.style.left=clamp(percent(note.at+i*repeat),0,100)+'%';
              };
              marker.onpointerup=marker.onpointercancel=()=>{
                marker.onpointermove=null;
                if(moved){marker.onclick=null;activeNote={lane,note};change();}
              };
            };
            line.append(marker);
          }
        }
        row.append(title,line);host.append(row);
      }
      if(!settings.lanes.length)host.textContent='Agregá un instrumento para colocar notas.';
      drawHead();
    }
    function refresh(){timeline();renderLanes();noteEditor();}
    async function result(){
      if(rendered)return rendered;
      const revision=mixSerial,data=await render(buffer,settings);
      const value=tools.waveBlob(data);
      if(revision===mixSerial)rendered=value;
      return value;
    }
    async function doAction(message,action){
      if(locked)return;
      locked=true;dialog.dataset.busy='true';show(message);
      try{await action();}catch(error){show(error.message||'La operación se interrumpió.');}
      finally{locked=false;delete dialog.dataset.busy;}
    }
    async function play(){
      if(!player.paused){head=playingFrom+player.currentTime;stop();return;}
      const start=head>=settings.start&&head<settings.end-.025?head:settings.start;
      await doAction('Preparando la escucha…',async()=>{
        if(url)URL.revokeObjectURL(url);
        // Listen from the chosen point using the same trimmed render as the final mix.
        url=URL.createObjectURL(await result());
        player.src=url;playingFrom=settings.start;
        player.playbackRate=reel?.rate||1;player.preservesPitch=true;
        player.currentTime=start-playingFrom;lastPosition=player.currentTime;reelElapsed=0;
        player.loop=find('loop').checked;
        await player.play();show('');find('play').textContent='Ⅱ Pausar';
        const next=()=>{
          const position=player.currentTime;
          if(position+.05<lastPosition)reelElapsed+=settings.end-settings.start;
          lastPosition=position;head=playingFrom+position;drawHead();showReel(head,true);
          if(reel&&(position+reelElapsed)/(reel.rate||1)>=reel.duration){stop();return;}
          if(!player.paused)tick=requestAnimationFrame(next);
        };
        next();
      });
    }
    for(const key of ['start','end']){
      const input=fields[key],marker=$('[data-marker="'+key+'"]');
      input.onchange=()=>{if(input.value!=='')bound(key,Number(input.value));input.value=settings[key].toFixed(2);};
      input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}};
      marker.onpointerdown=event=>{
        event.stopPropagation();marker.setPointerCapture(event.pointerId);
        marker.onpointermove=e=>bound(key,point(e,wave));
        marker.onpointerup=marker.onpointercancel=()=>{marker.onpointermove=null;};
      };
      marker.onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();bound(key,settings[key]+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?.1:.01));
      };
      find('set-'+key).onclick=()=>bound(key,head);
    }
    wave.onpointerdown=event=>{if(!event.target.closest('button'))setHead(point(event,wave));};
    find('full').onclick=()=>{settings.start=0;settings.end=duration;head=0;change();showReel();};
    find('zoom').onchange=()=>{
      zoom=Number(find('zoom').value);left=clamp(head-span()/2,0,duration-span());
      find('pan-label').hidden=zoom===1;find('pan').max=duration-span();find('pan').value=left;refresh();
    };
    find('pan').oninput=()=>{left=Number(find('pan').value);refresh();};
    find('play').onclick=play;player.onended=()=>{stop();head=settings.end;drawHead();};
    find('loop').onchange=()=>{player.loop=find('loop').checked;};
    find('bpm').onchange=()=>{
      settings.bpm=clamp(Number(find('bpm').value)||settings.bpm,40,240);find('bpm').value=settings.bpm;change();
    };
    find('snap').onchange=()=>{settings.snap=find('snap').value;dirty=true;};
    for(const key of ['volume','clean','effect'])find(key).onchange=()=>{
      settings[key]=key==='effect'?find(key).value:Number(find(key).value);change();
    };
    find('add').onclick=()=>{
      if(settings.lanes.length>=20){show('Ya hay 20 pistas.');return;}
      settings.lanes.push({id:id(),instrument:find('instruments').value,volume:45,notes:[]});change();
    };
    find('rhythm').onclick=()=>{
      seedRhythm(settings,options.style,clamp(head,settings.start,settings.end),settings.end);change();
    };
    for(const [key,min,max] of [['at',0,duration],['length',.03,10],['pitch',24,84],['velocity',1,100],['count',1,5000],['each',.125,32]]){
      const input=find(key);
      input.onchange=()=>{
        if(!activeNote)return;
        const note=activeNote.note;
        note[key]=clamp(input.value===''?note[key]:Number(input.value),min,max);
        if(key==='count')note[key]=Math.round(note[key]);
        input.value=note[key];change();
      };
    }
    find('note-delete').onclick=()=>{
      const {lane,note}=activeNote;
      lane.notes=lane.notes.filter(entry=>entry!==note);activeNote=null;change();
    };
    find('original').onclick=()=>doAction('Guardando original…',async()=>{
      await options.onSaveOriginal(name());find('original').disabled=true;find('original').textContent='✓ Original guardado';show('Original guardado.');
    });
    find('save').onclick=()=>doAction('Preparando la versión…',async()=>{
      const version=name()===track.name?name().slice(0,90)+' · versión':name();
      await options.onSaveVersion({name:version,blob:await result(),duration:settings.end-settings.start,lyrics:find('lyric').value});
      show('Versión guardada. El original sigue disponible.');
    });
    find('save-lyric').onclick=()=>doAction('Guardando la letra…',async()=>{
      showLyricCheck(await options.onLyrics(find('lyric').value));
      find('check-lyric').hidden=!options.onCheckLyrics||!find('lyric').value.trim();
      show('Letra guardada con el audio.');
    });
    find('check-lyric').onclick=()=>doAction('Revisando las palabras de la canción…',async()=>{
      const check=await options.onCheckLyrics(find('lyric').value);
      showLyricCheck(check);show('');
    });
    find('wav').onclick=()=>doAction('Preparando el WAV…',async()=>{
      const originalWav=/^audio\/(x-)?wav/i.test(blob.type)&&!edited()&&settings.start===0&&settings.end===duration;
      download(originalWav?blob:floatWav(await render(buffer,settings)),name()+'.wav');show('WAV listo.');
    });
    find('mp3').onclick=()=>doAction('Convirtiendo a MP3…',async()=>{
      download(await options.onMP3(await result()),name()+'.mp3');show('MP3 listo.');
    });
    find('apply').onclick=()=>doAction('Aplicando al reel…',async()=>{
      stop();
      const mixed=edited();
      await options.onApply({blob:mixed?await result():blob,trim:{start:mixed?0:settings.start,end:mixed?settings.end-settings.start:settings.end},
        sourceTrim:{start:settings.start,end:settings.end},name:name()});
      dialog.close();
    });
    find('delete').onclick=()=>{
      if(!window.confirm('¿Seguro que querés borrar «'+name()+'» de tus audios?'))return;
      void doAction('Borrando canción…',async()=>{await options.onDelete();dirty=false;dialog.close();});
    };
    find('close').onclick=()=>{if(!locked)dialog.close();};
    dialog.oncancel=event=>{if(locked)event.preventDefault();};
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    const resize=new ResizeObserver(paint);
    dialog.onclose=()=>{
      stop();resize.disconnect();player.src='';if(url)URL.revokeObjectURL(url);
      previewContext?.close().catch(()=>{});
      if(dirty)Promise.resolve(options.onDraft?.(settings)).catch(error=>options.notify?.(error.message,'error'));
      dialog.remove();
    };
    document.body.append(dialog);dialog.showModal();resize.observe(wave);refresh();showReel();
  }

  window.SalmosSongEditor={open,render,initialSettings};
})();
