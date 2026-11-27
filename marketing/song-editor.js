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
  const effects={'':'Sin efecto',echo:'Eco',room:'Reverberación',bass:'Más graves',bright:'Más brillo',fade:'Fundido'};
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
  const instrumentPatterns={
    kick:[0,2],snare:[1,2],clap:[1,2],hat:[.5,1],openHat:[.5,2],
    tom:[3,4],shaker:[.5,.5],cymbal:[0,4],bass:[0,2,36],
    keys:[1,2,60],pluck:[.5,1,60],bell:[2,4,72],pad:[0,4,60]
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
    const disconnect=()=>gain.disconnect();
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
      source.connect(filter);filter.connect(gain);source.start(start);source.stop(end);source.onended=disconnect;
      return disconnect;
    }
    const osc=ctx.createOscillator(),filter=ctx.createBiquadFilter();
    osc.type={bass:'triangle',keys:'triangle',pluck:'sawtooth',bell:'sine',pad:'triangle'}[instrument]||'sine';
    const drum=instrument==='kick'||instrument==='tom';
    osc.frequency.setValueAtTime(drum?(instrument==='kick'?138:250):hz,start);
    if(drum)osc.frequency.exponentialRampToValueAtTime(instrument==='kick'?47:97,start+Math.min(.16,length*.6));
    filter.type='lowpass';filter.frequency.value=instrument==='pluck'?1700:instrument==='bass'?920:7000;
    osc.connect(filter);filter.connect(gain);osc.start(start);osc.stop(end);osc.onended=disconnect;
    if(instrument==='bell'||instrument==='keys'){
      const overtone=ctx.createOscillator(),quiet=ctx.createGain();
      overtone.frequency.value=hz*(instrument==='bell'?2.76:2);
      quiet.gain.value=.18;overtone.connect(quiet);quiet.connect(gain);overtone.start(start);overtone.stop(end);
    }
    return disconnect;
  }

  function initialSettings(duration,stored,trim,voice,style,bpm){
    const start=clamp(Number(stored?.start??trim?.start)||0,0,Math.max(0,duration-.02));
    const end=clamp(Number(stored?.end??trim?.end)||duration,Math.min(duration,start+.02),duration);
    const value={start,end,bpm:clamp(Number(stored?.bpm??bpm)||120,40,240),snap:String(stored?.snap??0),
      clean:stored?.clean??0,volume:stored?.volume??100,effect:stored?.effect||'',
      effectAmount:stored?.effectAmount??70,
      lanes:Array.isArray(stored?.lanes)?structuredClone(stored.lanes):[]};
    return value;
  }

  function seedRhythm(settings,style,from,to,chosen){
    const groove=voicePresets[style]||voicePresets[voiceRhythms[style]]||voicePresets.acoustic;
    const part=chosen?groove.filter(([name])=>name===chosen):groove;
    const pattern=part.length?part:[[chosen,...instrumentPatterns[chosen]]];
    const beat=60/settings.bpm;
    const added=[];
    for(const lane of settings.lanes)if(pattern.some(([name])=>name===lane.instrument)){
      lane.notes=lane.notes.flatMap(note=>{
        if(!note.autoPattern)return [note];
        const spacing=note.each*beat;
        const before=clamp(Math.ceil((from-note.at)/spacing-1e-8),0,note.count);
        const after=clamp(Math.ceil((to-note.at)/spacing-1e-8),0,note.count);
        if(before===after)return [note];
        const kept=[];
        if(before)kept.push({...note,count:before});
        if(after<note.count)kept.push({...note,id:id(),at:note.at+after*spacing,count:note.count-after});
        return kept;
      });
    }
    for(const [instrument,offset,each,pitch=48] of pattern){
      const at=from+offset*beat<to?from+offset*beat:from;
      let lane=settings.lanes.find(row=>row.instrument===instrument);
      if(!lane){
        if(settings.lanes.length>=20)continue;
        lane={id:id(),instrument,volume:instrument==='shaker'||instrument==='hat'?18:27,notes:[]};
        settings.lanes.push(lane);
      }
      const note={id:id(),at,length:drums.has(instrument)?.16:.36,pitch,velocity:73,each,autoPattern:true,
        count:Math.min(5000,Math.max(1,Math.ceil((to-at)/(each*beat))))};
      lane.notes.push(note);added.push({lane,note});
    }
    return added;
  }

  function mixGraph(ctx,input){
    const dry=ctx.createGain(),clean=ctx.createGain(),level=ctx.createGain(),bus=ctx.createGain();
    const highpass=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter(),compress=ctx.createDynamicsCompressor();
    const low=ctx.createBiquadFilter(),high=ctx.createBiquadFilter(),master=ctx.createGain(),limiter=ctx.createDynamicsCompressor();
    const echo=ctx.createDelay(.7),echoLevel=ctx.createGain(),room=ctx.createConvolver(),roomLevel=ctx.createGain();
    highpass.type='highpass';presence.type='peaking';presence.frequency.value=2900;presence.Q.value=.8;
    low.type='lowshelf';low.frequency.value=160;
    high.type='highshelf';high.frequency.value=3100;
    echo.delayTime.value=.24;
    const reflection=ctx.createBuffer(2,Math.round(ctx.sampleRate*.48),ctx.sampleRate);
    const noise=bufferNoise(ctx).getChannelData(0);
    for(let channel=0;channel<2;channel++){
      const samples=reflection.getChannelData(channel);
      for(let i=0;i<samples.length;i++)samples[i]=noise[i+Math.floor(channel*ctx.sampleRate/2)]*(1-i/samples.length)**3;
    }
    room.buffer=reflection;
    limiter.threshold.value=-2;limiter.knee.value=2;limiter.ratio.value=16;
    input.connect(dry).connect(level);
    input.connect(highpass).connect(presence).connect(compress).connect(clean).connect(level);
    level.connect(bus);bus.connect(low).connect(high).connect(master);
    high.connect(echo).connect(echoLevel).connect(master);
    high.connect(room).connect(roomLevel).connect(master);
    master.connect(limiter).connect(ctx.destination);
    function configure(settings){
      const voice=settings.clean||0,amount=clamp((settings.effectAmount??70)/100,0,1);
      level.gain.value=settings.volume/100;
      clean.gain.value=voice>0?1:0;dry.gain.value=1-clean.gain.value;
      highpass.frequency.value=55+voice*.6;presence.gain.value=voice*.045;
      compress.threshold.value=-18-voice*.08;compress.ratio.value=1.6+voice*.035;
      low.gain.value=settings.effect==='bass'?6*amount:0;
      high.gain.value=settings.effect==='bright'?6*amount:0;
      echoLevel.gain.value=settings.effect==='echo'?.34*amount:0;
      roomLevel.gain.value=settings.effect==='room'?.38*amount:0;
    }
    return {bus,master:master.gain,configure};
  }
  function fadeTime(settings,length){
    return Math.min(settings.effect==='fade'?.018+1.75*clamp((settings.effectAmount??70)/100,0,1):.018,length/3);
  }
  function eachSound(settings,from,to,fn){
    const beat=60/settings.bpm;
    for(const lane of settings.lanes)for(const note of lane.notes){
      const interval=Math.max(.125,note.each)*beat;
      const first=Math.max(0,Math.ceil((from-note.at)/interval-1e-7));
      const last=Math.min(note.count,Math.ceil((to-note.at)/interval-1e-7));
      for(let i=first;i<last;i++){
        fn(lane,note,note.at+i*interval);
      }
    }
  }
  const noteLevel=(lane,note)=>lane.volume/100*note.velocity/100*.7;
  async function render(buffer,settings,{start=settings.start,end=settings.end}={}){
    const from=clamp(start,0,buffer.duration),length=clamp(end-from,.001,buffer.duration-from);
    const ctx=offline(Math.round(length*rate),settings.effect==='room'||settings.lanes.length?2:Math.min(2,buffer.numberOfChannels));
    const input=ctx.createBufferSource(),mix=mixGraph(ctx,input);
    input.buffer=buffer;mix.configure(settings);
    const fade=fadeTime(settings,length);
    mix.master.setValueAtTime(0,0);mix.master.linearRampToValueAtTime(1,fade);
    mix.master.setValueAtTime(1,length-fade);mix.master.linearRampToValueAtTime(0,length);
    input.start(0,from,length);
    const noise=bufferNoise(ctx);
    eachSound(settings,from,from+length,(lane,note,at)=>{
      const when=Math.max(0,at-from);
      strike(ctx,mix.bus,lane.instrument,when,Math.min(note.length,length-when),note.pitch,noteLevel(lane,note),noise);
    });
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
    const {track,tools,reel}=options;
    const originalBlob=options.blob;
    let blob=options.working?.blob||originalBlob;
    let buffer=await offline(1).decodeAudioData(await blob.arrayBuffer()).catch(()=>{throw Error('No se pudo abrir el audio.');});
    let duration=buffer.duration;
    if(!duration||duration>601)throw Error('Elegí un audio de hasta diez minutos.');
    const settings=initialSettings(duration,options.settings,options.trim,options.voice,options.style,options.bpm);
    const dialog=document.createElement('dialog');
    dialog.className='song-editor';dialog.setAttribute('aria-labelledby','songEditTitle');
    dialog.innerHTML=`<header><div><h2 id="songEditTitle">Editar canción</h2><p data-song-status role="status"></p></div>
      <label class="song-title-field"><span>Nombre</span><input data-name maxlength="100"></label>
      <button data-close aria-label="Cerrar edición">×</button></header>
      <div class="song-editor-layout"><div class="song-main">
        <section class="song-arrange" aria-labelledby="songInstrumentsTitle">
          <div class="song-source-title"><h3 id="songInstrumentsTitle" data-source-label>Audio original</h3><label>Escuchar<select data-source-version><option value="original">Original subido</option></select></label></div>
          <div class="song-transport-row">
          <div class="song-toolbar song-transport"><button class="primary" data-play>▶ Escuchar fragmento</button><output data-clock aria-live="off"></output>
            <label class="song-repeat"><input data-loop type="checkbox"> Repetir fragmento</label>
            <label>Zoom<select data-zoom><option value="1">Completo</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option><option value="32">32×</option></select></label>
            <label data-pan-label hidden>Desplazar<input data-pan type="range" min="0" step=".01" value="0"></label></div>
          <div class="song-cut-controls">
            <div><label>Desde (segundos)<input data-start type="number" min="0" step=".01"></label><button data-set-start>Inicio aquí</button></div>
            <div><label>Hasta (segundos)<input data-end type="number" min="0" step=".01"></label><button data-set-end>Final aquí</button></div>
            <button data-full>Restablecer recorte</button></div></div>
          <div class="song-toolbar" aria-label="Agregar instrumentos">
            <label>Instrumento<select data-instruments></select></label><button data-add>＋ Agregar</button>
            <button data-rhythm>＋ Acompañamiento</button>
            <label>Pulsos por minuto (BPM)<input type="number" data-bpm min="40" max="240" step="1" aria-describedby="songBeatHelp"></label>
            <label>Colocar sonidos<select data-snap aria-describedby="songBeatHelp"><option value="0">Libre</option><option value="1">Cada pulso</option>
              <option value="0.5">Cada medio pulso</option><option value=".25">Cada cuarto de pulso</option></select></label>
          </div>
          <details class="song-instructions">
            <summary>Cómo colocar sonidos y cortar el audio</summary>
            <ul>
              <li>Arrastrá <strong>I</strong> y <strong>F</strong> para elegir el fragmento. Hacé clic en la onda para ubicar la línea amarilla.</li>
              <li><strong>＋ Agregar</strong> deja una pista con un ritmo inicial debajo de la onda. Hacé clic en la fila o en <strong>Tocar ahora</strong> para sumar golpes. Arrastrá un golpe o ajustá sus repeticiones.</li>
              <li><strong>＋ Acompañamiento</strong> coloca varias pistas del estilo. Si el cursor está al final, arranca al inicio del recorte.</li>
              <li id="songBeatHelp"><strong>120 pulsos por minuto</strong> son dos por segundo. Los pulsos guían la cuadrícula y las repeticiones. Con <strong>Libre</strong>, el sonido queda donde hacés clic.</li>
            </ul>
          </details>
          <div class="song-timeline">
            <div class="song-timeline-row song-original-row">
              <strong class="song-track-name" data-wave-label>Audio original</strong>
              <div class="song-timeline-visual">
                <div class="song-ruler" data-ruler></div>
                <div class="song-wave" data-wave><canvas aria-hidden="true"></canvas><div class="song-region" data-region></div>
                  <div class="song-playhead" data-head></div><button data-marker="start" aria-label="Mover inicio">I</button><button data-marker="end" aria-label="Mover final">F</button></div>
              </div>
            </div>
            <div data-lanes class="song-lanes" aria-label="Pistas de instrumentos"></div>
          </div>
          <nav class="song-lane-pages" data-lane-pages hidden aria-label="Ver otras pistas"><button data-lanes-back>← Anteriores</button><output data-lanes-position></output><button data-lanes-next>Siguientes →</button></nav>
          <fieldset data-note hidden><legend>Nota seleccionada</legend><div class="song-note-fields">
            <label>En (s)<input data-at type="number" min="0" step=".01"></label><label>Duración (s)<input data-length type="number" min=".03" max="10" step=".01"></label>
            <label data-pitch-label>Nota<select data-pitch></select></label><label>Intensidad <input data-velocity type="range" min="1" max="100"></label>
            <label>Repeticiones<input data-count type="number" min="1" max="5000" step="1"></label><label>Cada cuántos pulsos<input data-each type="number" min=".125" max="32" step=".125"></label>
            <button data-note-delete>Quitar nota</button></div></fieldset>
        </section>
        <section class="song-effects" aria-labelledby="songEffectsTitle">
          <h3 id="songEffectsTitle">Efectos de la mezcla</h3>
          <div class="song-effect-choices" data-effects role="group" aria-label="Efectos">${Object.entries(effects).map(([value,label])=>
            `<button type="button" data-effect="${value}" aria-pressed="false">${label}</button>`).join('')}</div>
          <div class="song-controls"><label>Intensidad del efecto<input data-effect-amount type="range" min="0" max="100"></label>
            <label>Volumen original<input data-volume type="range" min="0" max="150"></label>
            <label>Realce vocal<input data-clean type="range" min="0" max="100"></label></div>
        </section>
        <section class="song-voice-tools" data-voice-box hidden>
          <h3>Limpiar y acompañar tu voz</h3>
          <p>Aplicá la limpieza y escuchala en la onda de la izquierda. Después elegí cómo acompañar tu grabación.</p>
          <div class="song-toolbar"><label>Audio subido<select data-voice-source>
            <option value="mix">Voz con música o ruidos de fondo</option><option value="voice">Grabación de voz sola</option>
          </select></label><label>Limpieza<select data-noise-strength><option value=".95">Fuerte</option><option value=".7">Moderada</option></select></label>
          <button data-prepare-voice class="primary">Aplicar limpieza a la pista</button>
          <a data-voice-launcher class="button" hidden download="INICIAR_SALMOS.bat">Descargar iniciador</a></div>
          <p data-voice-status role="status"></p>
          <progress data-voice-progress hidden aria-label="Procesando el audio"></progress>
          <div data-voice-result hidden>
            <div class="song-toolbar"><button data-save-voice>Guardar voz sola</button>
            <label>Estilo del acompañamiento<select data-arrange-style></select></label>
            <button class="primary" data-generate-voice disabled>Generar acompañamiento</button></div>
            <p>La voz conserva su tiempo y sus palabras. La grabación guía el ritmo de los instrumentos.</p>
            <button data-load-result hidden>Cargar el resultado en esta pista</button>
          </div>
        </section>
      </div>
      <div class="song-sidebar">
        <aside class="song-reel" data-reel hidden><h3>Vista previa del reel</h3><canvas data-frame aria-label="Vista previa del reel"></canvas>
          <p data-frame-time></p><p data-reel-ended role="status" hidden>Fin del reel · El audio sigue.</p></aside>
        <div class="song-side-tabs" role="tablist" aria-label="Opciones de edición"><button role="tab" data-editor-tab="voice" aria-selected="true">Voz y estilo</button><button role="tab" data-editor-tab="lyrics" aria-selected="false">Letra</button><button role="tab" data-editor-tab="notes" aria-selected="false" hidden>Nota</button><button role="tab" data-editor-tab="help" aria-selected="false">Cómo usarlo</button></div>
        <div data-editor-panel="voice"></div><div data-editor-panel="lyrics" hidden></div><div data-editor-panel="help" hidden></div><div data-editor-panel="notes" hidden></div>
        <details data-lyric-box><summary>Letra y estilo <small data-review-label hidden>Revisar</small></summary>
          <label>Letra adjunta<textarea data-lyric rows="3" maxlength="3000" placeholder="Pegá la letra que querés guardar con este audio"></textarea></label>
          <div class="song-toolbar"><button data-save-lyric>Guardar letra adjunta</button><button data-check-lyric hidden>Revisar lo cantado</button>
            <button data-unlink-lyric hidden>Pasar a Instrumental</button></div>
          <div class="song-toolbar" data-style-controls hidden><label>Género en la galería<select data-gallery-style></select></label>
            <button data-save-style>Guardar género</button></div>
          <p data-lyric-check role="status" hidden></p></details>
      </div></div>
      <footer><button data-delete class="song-delete">Descartar canción</button><div class="song-toolbar">
        <button data-original>Guardar original</button><button data-wav>Descargar WAV</button><button data-mp3>Descargar MP3</button>
        <button data-save>Guardar como nueva versión</button><button data-apply class="primary" hidden>✓ Usar en el reel</button></div></footer>`;
    const $=selector=>dialog.querySelector(selector),find=key=>$('[data-'+key+']');
    let peaks=waveform(buffer);
    const wave=find('wave'),surface=wave.querySelector('canvas'),player=new Audio();
    const fields={start:find('start'),end:find('end')};
    let url=URL.createObjectURL(blob);
    player.src=url;player.preload='auto';player.playbackRate=reel?.rate||1;player.preservesPitch=true;
    let reelElapsed=0,reelFrameTime,head=settings.start,left=0,zoom=1,activeNote=null,tick=0,playing=false;
    let locked=false,mixSerial=0,rendered=null,dirty=!!options.working,lanePage=0;
    const sources=new Map([['original',{blob:originalBlob,label:'Audio original'}]]);
    let selectedSource=options.working?'working':'original';
    if(options.working)sources.set('working',options.working);
    let previewContext,playbackMix,previewNoise,scheduledThrough=0,scheduled=[];
    const playedLive=new Map();
    const edited=()=>settings.lanes.some(lane=>lane.notes.length)||settings.clean!==0||settings.volume!==100||!!settings.effect;
    let lyrics=track.request?.lyrics??track.lyrics??'';
    const originalName=track.name||'Mi canción';
    const originalSaved=!!(track.saved||track.saved20||track.request?.saved);
    find('name').value=originalName;
    find('lyric').value=lyrics;
    find('lyric-box').hidden=!options.onLyrics&&!lyrics;
    find('save-lyric').hidden=!options.onLyrics;
    find('unlink-lyric').hidden=!options.onLyrics||!!track.request?.instrumental&&!lyrics;
    find('check-lyric').hidden=!options.onCheckLyrics||!lyrics;
    find('style-controls').hidden=!options.onStyle;
    find('voice-box').hidden=!options.onPrepareVoice;
    find('voice-source').value=track.request?.voiceOnly?'voice':'mix';
    dialog.querySelector('[data-editor-panel=voice]').append(find('voice-box'));
    dialog.querySelector('[data-editor-panel=lyrics]').append(find('lyric-box'));
    dialog.querySelector('[data-editor-panel=notes]').append(find('note'));
    const instructions=dialog.querySelector('.song-instructions');
    instructions.open=true;find('lyric-box').open=true;
    dialog.querySelector('[data-editor-panel=help]').append(instructions);
    function chooseEditorPanel(id){
      const button=dialog.querySelector('[data-editor-tab='+id+']');
      for(const tab of dialog.querySelectorAll('[data-editor-tab]'))tab.setAttribute('aria-selected',String(tab===button));
      for(const panel of dialog.querySelectorAll('[data-editor-panel]'))panel.hidden=panel.dataset.editorPanel!==id;
    }
    for(const button of dialog.querySelectorAll('[data-editor-tab]'))button.onclick=()=>chooseEditorPanel(button.dataset.editorTab);
    find('voice-launcher').href=options.launcher||'';
    for(const key of ['gallery-style','arrange-style']){
      const select=find(key);
      select.add(new Option('Sin género elegido',''));
      for(const [id,[label]] of Object.entries(options.genres||{}))select.add(new Option(label,id));
      select.value=key==='arrange-style'?options.style||'house':track.request?.galleryStyle??track.request?.style??'';
    }
    function showLyricCheck(check){
      const label=find('lyric-check');
      const detail=window.SalmosAudioStudio.lyricsCheckText(check);
      label.hidden=!detail;
      label.textContent=detail+(check?.heard?'\nSe detectó: '+check.heard:'');
      find('review-label').hidden=check?.status!=='review';
    }
    showLyricCheck(track.lyricsCheck);
    syncSaveButtons();
    find('name').oninput=find('lyric').oninput=syncSaveButtons;
    find('delete').hidden=!options.onDelete;
    find('apply').hidden=!options.onApply;
    find('reel').hidden=!reel;
    find('mp3').hidden=!options.onMP3;
    find('bpm').value=settings.bpm;find('snap').value=settings.snap;
    find('loop').checked=!!reel?.loop;
    for(const key of ['volume','clean'])find(key).value=settings[key];
    find('effect-amount').value=settings.effectAmount;
    refreshEffectButtons();
    for(const [key,name] of Object.entries(instruments))find('instruments').add(new Option(name,key));
    for(let n=24;n<=84;n++)find('pitch').add(new Option(noteNames[n%12]+(Math.floor(n/12)-1),n));

    function show(message){find('song-status').textContent=message;}
    function name(){return find('name').value.trim()||originalName;}
    function syncSaveButtons(){
      const renamed=name()!==originalName;
      const original=find('original');
      original.disabled=originalSaved&&!renamed;
      original.textContent=renamed?'Guardar nombre':originalSaved?'✓ Original guardado':'Guardar original';
      find('save').hidden=renamed&&!dirty&&find('lyric').value===lyrics;
    }
    function showReel(){
      if(!reel)return;
      const relative=(Math.max(0,head-settings.start)+reelElapsed)/player.playbackRate;
      const at=reel.position(relative);
      if(at!==reelFrameTime){
        reel.draw(find('frame'),at);
        find('frame-time').textContent=timeText(at)+' / '+timeText(reel.duration)+' · '+reel.caption(at);
        reelFrameTime=at;
      }
      find('reel-ended').hidden=!playing||at<reel.duration;
    }
    function stop(){
      playing=false;player.pause();cancelAnimationFrame(tick);clearSchedule(true);
      if(playbackMix)playbackMix.master.value=0;
      find('play').textContent='▶ Escuchar fragmento';
      find('reel-ended').hidden=true;
    }
    function change(){
      dirty=true;mixSerial++;rendered=null;
      syncSaveButtons();
      if(playing)clearSchedule();
      playbackMix?.configure(settings);
      refresh();
    }
    function refreshEffectButtons(){
      for(const button of find('effects').children)button.setAttribute('aria-pressed',String(button.dataset.effect===settings.effect));
      find('effect-amount').disabled=!settings.effect;
    }
    const span=()=>duration/zoom;
    const percent=seconds=>(seconds-left)/span()*100;
    function setHead(value){
      head=playing?clamp(value,settings.start,Math.max(settings.start,settings.end-.02)):clamp(value,0,duration);
      reelElapsed=0;
      if(playing){
        player.currentTime=head;
        clearSchedule(true);
      }
      drawHead();showReel();
    }
    function drawHead(){
      const pos=percent(head);
      find('head').hidden=pos<0||pos>100;find('head').style.left=pos+'%';
      for(const mark of dialog.querySelectorAll('.song-lane-head')){
        mark.hidden=pos<0||pos>100;
        mark.style.left=clamp(pos,0,100)+'%';
      }
      find('clock').value='Audio '+timeText(head)+' · '+timeText(settings.end-settings.start)+' seleccionados';
    }
    function paint(){
      const width=Math.max(1,Math.round(wave.clientWidth*devicePixelRatio)),height=Math.max(1,Math.round(wave.clientHeight*devicePixelRatio));
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
      if(playing)stop();
      settings[key]=key==='start'?clamp(value,0,Math.max(0,settings.end-.02)):clamp(value,Math.min(duration,settings.start+.02),duration);
      reelElapsed=0;head=settings[key];change();showReel();
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
      dialog.querySelector('[data-editor-tab=notes]').hidden=!activeNote;
      if(!activeNote){
        if(!dialog.querySelector('[data-editor-panel=notes]').hidden)chooseEditorPanel('voice');
        return;
      }
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
    function point(event,area){
      const box=area.getBoundingClientRect();
      return clamp(left+(event.clientX-box.left)/box.width*span(),0,duration);
    }
    function liveContext(){
      if(!previewContext){
        previewContext=new AudioContext();
        previewNoise=bufferNoise(previewContext);
      }
      return previewContext;
    }
    function audition(lane,note){
      const context=liveContext();
      context.resume().catch(()=>{});
      strike(context,playing?playbackMix.bus:context.destination,lane.instrument,context.currentTime+.012,
        Math.min(.7,note.length),note.pitch,noteLevel(lane,note),previewNoise);
    }
    function addNote(lane,seconds,live=false){
      const note={id:id(),at:quantize(seconds),length:drums.has(lane.instrument)?.16:.38,pitch:lane.instrument==='bass'?36:60,velocity:80,each:1,count:1};
      lane.notes.push(note);activeNote={lane,note};
      if(live||playing&&Math.abs(note.at-player.currentTime)<.10)playedLive.set(note.id,note.at);
      change();chooseEditorPanel('notes');audition(lane,note);
    }
    function renderLanes(){
      const host=find('lanes');host.replaceChildren();
      const timeline=find('lanes').parentElement;
      const pageSize=Math.max(1,Math.min(12,Math.floor((timeline.clientHeight-dialog.querySelector('.song-original-row').offsetHeight-42)/54)));
      const pages=Math.max(1,Math.ceil(settings.lanes.length/pageSize));
      lanePage=clamp(lanePage,0,pages-1);
      find('lane-pages').hidden=pages<2;
      find('lanes-position').textContent=(lanePage*pageSize+1)+'–'+Math.min(settings.lanes.length,(lanePage+1)*pageSize)+' de '+settings.lanes.length;
      find('lanes-back').disabled=lanePage===0;find('lanes-next').disabled=lanePage===pages-1;
      for(const lane of settings.lanes.slice(lanePage*pageSize,(lanePage+1)*pageSize)){
        const row=document.createElement('div');row.className='song-lane song-timeline-row';row.dataset.laneId=lane.id;
        const title=document.createElement('div');title.className='song-lane-title';
        const label=document.createElement('strong');label.textContent=instruments[lane.instrument];
        const volume=document.createElement('input');volume.type='range';volume.max=100;volume.value=lane.volume;
        volume.setAttribute('aria-label','Volumen de '+label.textContent);
        volume.oninput=()=>{
          lane.volume=Number(volume.value);mixSerial++;rendered=null;dirty=true;
          if(playing)clearSchedule();
        };
        const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Quitar pista de '+label.textContent);
        remove.onclick=()=>{settings.lanes=settings.lanes.filter(row=>row!==lane);if(activeNote?.lane===lane)activeNote=null;change();};
        const insert=document.createElement('button');
        insert.textContent='Tocar ahora';insert.setAttribute('aria-label','Tocar '+label.textContent+' ahora');
        insert.onclick=()=>addNote(lane,playing?player.currentTime:head,playing);
        title.append(label,volume,insert,remove);
        const visual=document.createElement('div');visual.className='song-timeline-visual';
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
            marker.onclick=event=>{event.stopPropagation();activeNote={lane,note};refresh();chooseEditorPanel('notes');audition(lane,note);};
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
                if(moved){marker.onclick=null;note.autoPattern=false;activeNote={lane,note};change();}
              };
            };
            line.append(marker);
          }
        }
        visual.append(line);row.append(title,visual);host.append(row);
      }
      if(!settings.lanes.length){
        const tip=document.createElement('p');tip.textContent='Agregá un instrumento para colocar sonidos debajo de la onda.';host.append(tip);
      }
      drawHead();
    }
    function refresh(){timeline();noteEditor();renderLanes();}
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
    function clearSchedule(all=false){
      const now=previewContext?.currentTime||0;
      scheduled=scheduled.filter(item=>{
        if(all||item.start>now){item.disconnect();return false;}
        return item.end>now;
      });
      scheduledThrough=0;
      if(all)playedLive.clear();
    }
    function scheduleSounds(position){
      const speed=player.playbackRate,now=previewContext.currentTime;
      const from=Math.max(settings.start,scheduledThrough,position-.020);
      const until=Math.min(settings.end,position+.12*speed);
      scheduled=scheduled.filter(item=>item.end>now);
      if(until<=from)return;
      eachSound(settings,from,until,(lane,note,at)=>{
        if(Math.abs(at-playedLive.get(note.id))<.001)return;
        const start=now+Math.max(.005,(at-position)/speed);
        const length=Math.min(note.length,settings.end-at)/speed;
        const disconnect=strike(previewContext,playbackMix.bus,lane.instrument,start,length,note.pitch,noteLevel(lane,note),previewNoise);
        if(disconnect)scheduled.push({start,end:start+length,disconnect});
      });
      scheduledThrough=until;
    }
    function finishFragment(){
      if(!playing)return;
      if(!find('loop').checked){
        head=settings.end;stop();drawHead();showReel();return;
      }
      reelElapsed+=settings.end-settings.start;
      clearSchedule(true);
      player.currentTime=head=settings.start;
      if(player.paused)player.play().catch(error=>{stop();show(error.message);});
      drawHead();showReel();
    }
    function updatePlayback(){
      if(!playing)return;
      const pos=player.currentTime;
      if(pos>=settings.end){
        finishFragment();
      }else if(!player.seeking&&!player.paused){
        const fade=fadeTime(settings,settings.end-settings.start);
        playbackMix.master.value=clamp(Math.min(pos-settings.start,settings.end-pos)/fade,0,1);
        scheduleSounds(pos);
        head=pos;drawHead();showReel();
      }
      if(playing)tick=requestAnimationFrame(updatePlayback);
    }
    async function play(){
      if(playing){head=player.currentTime;stop();drawHead();showReel();return;}
      const resume=head>=settings.start&&head<settings.end-.025;
      await doAction('Preparando la escucha…',async()=>{
        const context=liveContext();
        playbackMix||=mixGraph(context,context.createMediaElementSource(player));
        playbackMix.configure(settings);
        playbackMix.master.value=0;
        if(!resume){head=settings.start;reelElapsed=0;}
        player.currentTime=head;clearSchedule(true);
        try{await Promise.all([context.resume(),player.play()]);}
        catch(error){stop();throw error;}
        playing=true;show('');find('play').textContent='Ⅱ Pausar';
        updatePlayback();
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
    find('full').onclick=()=>{stop();settings.start=0;settings.end=duration;reelElapsed=0;head=0;change();showReel();};
    find('zoom').onchange=()=>{
      zoom=Number(find('zoom').value);left=clamp(head-span()/2,0,duration-span());
      find('pan-label').hidden=zoom===1;find('pan').max=duration-span();find('pan').value=left;refresh();
    };
    find('pan').oninput=()=>{left=Number(find('pan').value);refresh();};
    find('play').onclick=play;player.onended=()=>{if(player.ended)finishFragment();};
    find('bpm').onchange=()=>{
      settings.bpm=clamp(Number(find('bpm').value)||settings.bpm,40,240);find('bpm').value=settings.bpm;change();
    };
    find('snap').onchange=()=>{settings.snap=find('snap').value;dirty=true;};
    for(const [field,key] of [['volume','volume'],['clean','clean'],['effect-amount','effectAmount']]){
      find(field).oninput=()=>{
        settings[key]=Number(find(field).value);dirty=true;mixSerial++;rendered=null;
        playbackMix?.configure(settings);
      };
    }
    for(const button of find('effects').children)button.onclick=()=>{
      settings.effect=button.dataset.effect;refreshEffectButtons();change();
    };
    function addPattern(instrument){
      const cursor=clamp(playing?player.currentTime:head,settings.start,settings.end);
      const from=cursor>=settings.end-Math.min(.25,(settings.end-settings.start)/2)?settings.start:cursor;
      const added=seedRhythm(settings,find('arrange-style').value||options.style,from,settings.end,instrument);
      if(!added.length){show('Ya hay 20 pistas.');return;}
      activeNote=added[0];
      if(instrument)settings.lanes=[activeNote.lane,...settings.lanes.filter(lane=>lane!==activeNote.lane)];
      lanePage=0;
      dialog.querySelector('[data-editor-tab=notes]').hidden=false;
      chooseEditorPanel('notes');
      if(!playing)setHead(from);
      change();
      const timeline=find('lanes').parentElement;
      if(instrument)timeline.scrollTop=0;
      else dialog.querySelector('[data-lane-id="'+activeNote.lane.id+'"]')?.scrollIntoView({block:'nearest'});
      show(instrument?instruments[instrument]+' · Ritmo colocado desde '+timeText(from)+'.':
        'Acompañamiento colocado desde '+timeText(from)+'. Tocá Escuchar para probarlo.');
    }
    find('add').onclick=()=>addPattern(find('instruments').value);
    find('rhythm').onclick=()=>addPattern();
    find('lanes-back').onclick=()=>{lanePage--;renderLanes();};
    find('lanes-next').onclick=()=>{lanePage++;renderLanes();};
    for(const [key,min,max] of [['at',0,duration],['length',.03,10],['pitch',24,84],['velocity',1,100],['count',1,5000],['each',.125,32]]){
      const input=find(key);
      input.onchange=()=>{
        if(!activeNote)return;
        const note=activeNote.note;
        note.autoPattern=false;
        note[key]=clamp(input.value===''?note[key]:Number(input.value),min,max);
        if(key==='count')note[key]=Math.round(note[key]);
        input.value=note[key];change();
      };
    }
    find('note-delete').onclick=()=>{
      const {lane,note}=activeNote;
      lane.notes=lane.notes.filter(entry=>entry!==note);activeNote=null;change();
    };
    find('original').onclick=()=>{
      const title=name();
      return doAction(title===originalName?'Guardando el original…':'Guardando el nombre…',async()=>{
        await options.onSaveOriginal(title);
        dialog.close();
      });
    };
    find('save').onclick=()=>doAction('Preparando la versión…',async()=>{
      const version=name()===track.name?name().slice(0,90)+' · versión':name();
      await options.onSaveVersion({name:version,blob:await result(),duration:settings.end-settings.start,lyrics:find('lyric').value,request:sources.get(selectedSource).request});
      show('Versión guardada. El original sigue disponible.');
    });
    find('save-lyric').onclick=()=>doAction('Guardando la letra…',async()=>{
      const value=find('lyric').value;
      showLyricCheck(await options.onLyrics(value));
      lyrics=value;
      find('unlink-lyric').hidden=false;
      find('check-lyric').hidden=!options.onCheckLyrics||!find('lyric').value.trim();
      show('Letra guardada con el audio.');
    });
    find('unlink-lyric').onclick=()=>doAction('Pasando a Instrumental…',async()=>{
      await options.onLyrics('',{instrumental:true});
      lyrics=find('lyric').value='';
      find('check-lyric').hidden=find('unlink-lyric').hidden=true;
      showLyricCheck(null);
      show('Audio movido a Sin letra. Se conservó el mismo archivo.');
      syncSaveButtons();
    });
    find('save-style').onclick=()=>doAction('Guardando el género…',async()=>{
      await options.onStyle(find('gallery-style').value);
      show('Género de la ficha guardado.');
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
    let preparedVoice=null,voiceBusy=false,voiceGenerating=false,voiceMessage='',latestResult=null;
    function updateSourceChoices(){
      const select=find('source-version');select.replaceChildren();
      for(const [id,entry] of sources)select.add(new Option(entry.label,id));
      select.value=selectedSource;
      find('source-label').textContent=find('wave-label').textContent=sources.get(selectedSource).label;
    }
    async function useSource(entry,id){
      const decoded=await offline(1).decodeAudioData(await entry.blob.arrayBuffer());
      if(!decoded.length||decoded.duration>601)throw Error('No se recibió un audio válido para esta pista.');
      stop();
      const full=settings.start===0&&Math.abs(settings.end-duration)<.1;
      blob=entry.blob;buffer=decoded;duration=decoded.duration;peaks=waveform(buffer);
      sources.set(id,entry);selectedSource=id;
      URL.revokeObjectURL(url);url=URL.createObjectURL(blob);player.src=url;player.load();
      settings.start=clamp(settings.start,0,Math.max(0,duration-.02));
      settings.end=full?duration:clamp(settings.end,settings.start+.02,duration);
      head=clamp(head,settings.start,settings.end);left=0;settings.clean=0;find('clean').value=0;
      fields.start.max=fields.end.max=duration;
      updateSourceChoices();change();
    }
    find('source-version').onchange=()=>doAction('Cambiando la pista…',async()=>{
      const id=find('source-version').value;
      await useSource(sources.get(id),id);
    });
    function syncVoice(){
      const ready=options.voiceReadiness?.()||{};
      find('prepare-voice').disabled=voiceBusy||voiceGenerating||!ready.canClean;
      find('voice-source').disabled=find('noise-strength').disabled=voiceBusy||voiceGenerating;
      find('save-voice').disabled=!preparedVoice||voiceBusy||voiceGenerating;
      find('generate-voice').disabled=!preparedVoice||voiceBusy||voiceGenerating||!ready.ready||!find('arrange-style').value;
      find('voice-progress').hidden=!voiceBusy&&!voiceGenerating;
      find('voice-launcher').hidden=!ready.download;
      find('voice-status').textContent=voiceMessage||ready.help||'';
    }
    const stopWatchingVoice=options.watchVoice?.(syncVoice);
    find('arrange-style').onchange=syncVoice;
    find('voice-source').onchange=find('noise-strength').onchange=()=>{
      preparedVoice=null;voiceMessage='';
      find('voice-result').hidden=true;syncVoice();
    };
    find('prepare-voice').onclick=async()=>{
      if(voiceBusy||voiceGenerating)return;
      stop();voiceBusy=true;voiceMessage='Limpiando la grabación…';syncVoice();
      try{
        preparedVoice=await options.onPrepareVoice(find('voice-source').value,
          message=>{voiceMessage=message;syncVoice();},
          {blob:originalBlob,strength:Number(find('noise-strength').value)});
        await useSource({...preparedVoice,label:'Voz limpia',request:{...track.request,voiceOnly:true}},'clean');
        find('voice-result').hidden=false;
        if(preparedVoice.bpm){settings.bpm=clamp(preparedVoice.bpm,40,240);find('bpm').value=settings.bpm;refresh();}
        voiceMessage='Limpieza aplicada a la pista. Tocá Escuchar fragmento para oírla y compararla con Original subido.';
      }catch(error){preparedVoice=null;voiceMessage=error.message;}
      finally{voiceBusy=false;syncVoice();}
    };
    find('save-voice').onclick=()=>doAction('Guardando la voz sola…',async()=>{
      await options.onSaveVoice({...preparedVoice,lyrics:find('lyric').value,name:name().slice(0,86)+' · voz limpia'});
      show('Voz guardada en Mis audios.');
    });
    async function receiveArrangement(track){
      latestResult=track;
      if(!dialog.open)return;
      voiceGenerating=true;voiceMessage='Recibiendo el resultado en esta pista…';syncVoice();
      try{
        const output=await options.readTrack(track);
        if(!dialog.open)return;
        const style=options.genres?.[track.request?.style]?.[0]||'acompañamiento';
        await useSource({blob:output,label:'Resultado · '+style,request:track.request},'result');
        find('load-result').hidden=true;
        voiceMessage='Resultado listo en la onda. Tocá Escuchar fragmento. Podés comparar Original, Voz limpia y Resultado.';
        show('Resultado aplicado a la pista.');
      }catch(error){
        find('load-result').hidden=false;
        voiceMessage='El resultado se guardó, pero falta cargarlo aquí. '+error.message;
      }finally{voiceGenerating=false;syncVoice();}
    }
    find('load-result').onclick=()=>receiveArrangement(latestResult);
    find('generate-voice').onclick=async()=>{
      if(voiceGenerating||!preparedVoice)return;
      stop();voiceGenerating=true;voiceMessage='Enviando tu voz limpia al iniciador…';syncVoice();
      try{
        await options.onArrangeVoice({...preparedVoice,lyrics:find('lyric').value,style:find('arrange-style').value,
          bpm:settings.bpm,name:name().slice(0,78)+' · con acompañamiento',
          report(message,state){
            voiceMessage=message;voiceGenerating=state==='working';syncVoice();
          },
          complete:receiveArrangement});
      }catch(error){voiceGenerating=false;voiceMessage=error.message;syncVoice();}
    };
    updateSourceChoices();syncVoice();
    find('close').onclick=()=>{if(!locked&&!voiceBusy)dialog.close();};
    dialog.oncancel=event=>{if(locked||voiceBusy)event.preventDefault();};
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    const resize=new ResizeObserver(paint);
    dialog.onclose=()=>{
      stop();resize.disconnect();player.removeAttribute('src');player.load();URL.revokeObjectURL(url);
      stopWatchingVoice?.();
      previewContext?.close().catch(()=>{});
      if(dirty)Promise.resolve(options.onDraft?.(settings,selectedSource==='original'?null:{blob,label:sources.get(selectedSource).label,request:sources.get(selectedSource).request})).catch(error=>options.notify?.(error.message,'error'));
      dialog.remove();
    };
    document.body.append(dialog);dialog.showModal();resize.observe(wave);refresh();showReel();
  }

  window.SalmosSongEditor={open,render,initialSettings};
})();
