(() => {
  'use strict';
  const newId=()=>crypto.randomUUID().replaceAll('-','');
  const offline=(channels,length,rate)=>new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(channels,Math.max(1,length),rate);
  async function decode(blob,rate=44100){
    const buffer=await offline(2,1,rate).decodeAudioData(await blob.arrayBuffer());
    if(!buffer.length||buffer.duration>600)throw Error('Elegí una grabación de hasta diez minutos.');
    return buffer;
  }
  function connectSource(ctx,buffer,to,volume=1,loop=false){
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=buffer;source.loop=loop;gain.gain.value=volume;
    source.connect(gain);gain.connect(to);source.start(0);
    return source;
  }
  async function recordingForLyrics(blob,tools){
    const buffer=await decode(blob,16000),ctx=offline(1,buffer.length,16000);
    connectSource(ctx,buffer,ctx.destination);
    return tools.waveBlob(await ctx.startRendering());
  }
  async function renderMix(blob,layers,effect,tools){
    const buffer=await decode(blob),rate=buffer.sampleRate;
    const tail=effect==='echo'?.72:0,ctx=offline(2,buffer.length+Math.ceil(tail*rate),rate);
    const master=ctx.createGain(),sum=ctx.createGain();sum.connect(master);master.connect(ctx.destination);
    let sourceBus=sum;
    if(effect==='bass'){
      sourceBus=ctx.createBiquadFilter();sourceBus.type='lowshelf';sourceBus.frequency.value=170;
      sourceBus.gain.value=5;sourceBus.connect(sum);
    }
    const source=connectSource(ctx,buffer,sourceBus);
    if(effect==='echo'){
      for(const [time,level] of [[.24,.24],[.48,.12],[.72,.06]]){
        const delay=ctx.createDelay(1),wet=ctx.createGain();delay.delayTime.value=time;wet.gain.value=level;
        source.connect(delay);delay.connect(wet);wet.connect(sum);
      }
    }
    for(const {track,volume} of layers){
      const beat=await ctx.decodeAudioData(await (await track.get()).arrayBuffer());
      const layer=connectSource(ctx,beat,sum,volume,true);layer.stop(buffer.duration);
    }
    if(effect==='fade'){
      const length=Math.min(1.5,buffer.duration/3);
      master.gain.setValueAtTime(0,0);master.gain.linearRampToValueAtTime(1,length);
      master.gain.setValueAtTime(1,buffer.duration-length);master.gain.linearRampToValueAtTime(0,buffer.duration);
    }
    const result=await ctx.startRendering();
    let peak=0;
    for(let c=0;c<result.numberOfChannels;c++)for(const value of result.getChannelData(c))peak=Math.max(peak,Math.abs(value));
    if(peak>1)for(let c=0;c<result.numberOfChannels;c++){
      const data=result.getChannelData(c);
      for(let i=0;i<data.length;i++)data[i]*=.98/peak;
    }
    return {blob:tools.waveBlob(result),duration:result.duration};
  }

  function install({helperFetch,dbAction,blobData,tools,genres,tracks,refreshSongs,hiddenSongs,pause}){
    const launcher=document.createElement('button');launcher.textContent='Crear solo audio';launcher.className='primary';
    document.querySelector('#createReel').after(launcher);
    const dialog=document.createElement('dialog');dialog.id='audioOnlyStudio';dialog.setAttribute('aria-labelledby','audioStudioTitle');
    dialog.innerHTML=`<header><div class="audio-studio-title"><h1 id="audioStudioTitle">Estudio de audio</h1><button type="button" data-close aria-label="Cerrar estudio de audio">×</button></div>
      <p data-status role="status" aria-live="polite" aria-atomic="true"></p></header>
      <div class="audio-studio-body"><div class="audio-connection" data-connection>
        <div role="status"><strong data-connection-title>Iniciador sin conectar</strong><p data-connection-help></p></div>
        <ol class="audio-launcher-steps" data-launcher-steps>
          <li><a class="button primary" href="INICIAR_SALMOS.bat?v=26.9" download="INICIAR_SALMOS.bat" data-download-launcher>Descargar iniciador</a></li>
          <li>Abrí <strong>INICIAR_SALMOS.bat</strong> desde Descargas y dejá su ventana abierta.</li>
          <li><button type="button" data-connect>Ya abrí el iniciador</button></li>
        </ol>
      </div><section class="audio-create"><h2>Crear canción</h2>
        <div class="audio-source-input"><label>Tu grabación<input type="file" accept="audio/*,.ogg,.opus,.m4a,.wav,.mp3,.webm,.aac,.flac" data-file></label>
          <audio data-upload-player controls hidden></audio><div class="button-row"><button data-transcribe disabled>Extraer letra</button>
          <button data-use-upload disabled>Editar mi grabación</button></div></div>
        <div class="form-grid"><label>Nombre<input data-name maxlength="100" placeholder="Mi canción"></label>
        <label>Tipo<select data-mode><option value="vocal">Con letra</option><option value="instrumental">Instrumental</option></select></label></div>
        <div class="audio-lyrics-editor" data-lyrics-field>
          <label>Letra para cantar<textarea data-lyrics rows="7" placeholder="Escribí la letra o extraela de tu grabación"></textarea></label>
          <div class="button-row"><button type="button" data-save-lyrics>Guardar letra</button><button type="button" data-copy-lyrics>Copiar letra</button><button type="button" data-show-lyrics>Mis letras</button></div>
        </div>
        <div class="form-grid"><label>Estilo<select data-genre></select></label><label>Ritmo<select data-bpm><option value="100">Suave · 100 BPM</option><option value="122" selected>Medio · 122 BPM</option><option value="132">Rápido · 132 BPM</option></select></label>
        <label>Duración<select data-duration><option value="10">10 segundos</option><option value="20" selected>20 segundos</option><option value="30">30 segundos</option></select></label>
        <label data-voice-field>Voz<select data-voice><option value="auto">Automática</option><option value="female">Femenina</option><option value="male">Masculina</option></select></label></div>
        <div class="button-row"><button data-generate class="primary">Generar audio</button><button data-cancel-job hidden>Cancelar generación</button></div></section>
        <section class="audio-mix"><h2>Editar audio</h2><p data-source-name>Elegí una grabación o una canción de tu galería.</p>
        <fieldset data-edit-controls disabled><audio data-player controls></audio>
        <div class="button-row"><button data-save-original>Guardar original</button><button data-download>Descargar WAV</button></div>
        <div class="audio-layer-heading"><h3>Bases SALMOS</h3><button data-add-beat>+ Agregar base</button></div><div data-layers></div>
        <label>Efecto<select data-effect><option value="">Sin efecto</option><option value="echo">Eco suave</option><option value="bass">Realzar graves</option><option value="fade">Entrada y salida suaves</option></select></label>
        <label>Nombre de la versión<input data-version-name maxlength="100"></label>
        <div class="button-row"><button data-preview>Escuchar mezcla</button><button data-save-new class="primary">Guardar como nuevo</button></div></fieldset></section>
        <section class="audio-saved"><div class="audio-layer-heading"><h2>Mis letras</h2><button type="button" data-new-lyrics>Nueva letra</button></div><div class="audio-lyrics-list" data-lyrics-library></div></section>
        <section class="audio-saved"><div class="audio-layer-heading"><h2>Mis audios</h2><button data-refresh>Actualizar</button></div><div data-library></div></section></div>`;
    document.body.append(dialog);
    const find=key=>dialog.querySelector('[data-'+key+']');
    function say(message,state='notice'){
      const status=find('status');
      if(status.textContent!==message)status.textContent=message;
      status.dataset.state=state;
    }
    for(const [id,[name]] of Object.entries(genres))find('genre').add(new Option(name,id));
    const player=find('player'),recordPlayer=find('upload-player');
    let recording=null,recordingURL='',active=null,sourceURL='',mixURL='',mix=null,busy=false,job='',timer=0,polling=false,gallerySeq=0;
    let connection=null, connectionDeadline=0, retries=0, downloadPending=false;
    try{job=localStorage.getItem('salmos-active-audio-job')||'';}catch{}
    const keyJob=value=>{job=value;try{if(value)localStorage.setItem('salmos-active-audio-job',value);else localStorage.removeItem('salmos-active-audio-job');}catch{}};
    const startHelp='Si ya lo descargaste, abrilo desde Descargas. Cuando su ventana esté abierta, tocá «Ya abrí el iniciador».';
    const isUnavailable=error=>error instanceof TypeError||error.name==='AbortError';
    function showConnection(title,help,mode){
      find('connection-title').textContent=title;
      find('connection-help').textContent=help;
      find('connection').dataset.state=mode;
      find('launcher-steps').hidden=mode==='online'&&connection?.transcription;
    }
    async function request(path,options={},timeout){
      try{return await helperFetch('/api/music'+path,options,timeout);}
      catch(error){
        if(isUnavailable(error)){
          connection=null;
          showConnection('Iniciador sin conexión',startHelp+' Si Chrome pide permiso para acceder a la red local, permitilo.','offline');
          throw Error('La PC no respondió. Podés editar tu grabación y descargar el WAV mientras conectás el iniciador.');
        }
        throw error;
      }
    }
    const api=async(path,options={},timeout)=>(await request(path,options,timeout)).json();
    const readConnection=async()=>(await helperFetch('/api/music',{cache:'no-store'},4000)).json();
    function updateConnection(response){
      if(response.audioApi!==2){
        connection=null;
        const update='Cerrá la ventana anterior de SALMOS, descargá el iniciador actualizado y abrilo.';
        showConnection('Iniciador anterior conectado',update,'offline');
        throw Error(update);
      }
      connection=response;
      if(response.setup?.state==='preparing'){
        showConnection('Iniciador preparando SALMOS',response.setup.message||'Dejá la ventana del iniciador abierta.','checking');
        return false;
      }
      const available=[];
      if(!response.transcription)available.push('Cerrá y volvé a abrir el iniciador para instalar la extracción de letra.');
      if(!response.installed)available.push('Para generar canciones hace falta ACE-Step en la PC.');
      showConnection('Iniciador conectado',available.join(' ')||'Extracción de letra y motor de canciones disponibles.','online');
      return true;
    }
    async function checkOpeningInitiator(){
      let delay=2400;
      try{
        if(updateConnection(await readConnection())){
          connectionDeadline=0;
          if(!busy)say(job?'Iniciador conectado. Consultando la generación…':'Iniciador conectado.',job?'working':'success');
          sync();
          if(job)poll();
          library().catch(error=>{if(!busy&&!job)say(error.message,'error');});
          return;
        }
        retries=0;
        connectionDeadline=Date.now()+5*60*1000;
        if(!busy)say('El iniciador ya respondió y está preparando SALMOS. Te aviso cuando esté listo.','working');
      }catch(error){
        if(!isUnavailable(error)||Date.now()>=connectionDeadline){
          connectionDeadline=0;connection=null;
          if(isUnavailable(error))showConnection('El iniciador aún no respondió','Revisá su ventana. Si está instalando, dejala abierta y tocá «Reintentar conexión».','offline');
          if(!busy)say(isUnavailable(error)?'Se cumplió el tiempo de espera. Podés reintentar la conexión.':error.message,'error');
          sync();
          return;
        }
        connection=null;
        showConnection('Esperando al iniciador…','Dejá su ventana abierta. El Estudio comprueba la conexión automáticamente.','checking');
        delay=Math.min(12000,2400*2**retries++);
      }
      sync();
      setTimeout(checkOpeningInitiator,delay);
    }
    function waitForInitiator(){
      if(connectionDeadline)return;
      retries=0;connectionDeadline=Date.now()+5*60*1000;
      showConnection('Buscando el iniciador…','La conexión se comprueba automáticamente.','checking');
      say('Comprobación iniciada. Dejá abierta la ventana del iniciador.','working');
      sync();
      void checkOpeningInitiator();
    }
    async function connect(){
      const response=connection||await api('',{cache:'no-store'},4000);
      if(!updateConnection(response)){
        waitForInitiator();
        throw Error('El iniciador sigue preparando SALMOS. Esta acción estará disponible cuando termine.');
      }
      return response;
    }
    function monitorTranscription(){
      let stopped=false,timer;
      const check=async()=>{
        try{
          const {transcriptionStage}=await readConnection();
          if(!stopped&&transcriptionStage==='model')say('Grabación recibida. Preparando el modelo de voz en tu PC…','working');
          if(!stopped&&transcriptionStage==='reading')say('Grabación recibida. Extrayendo la letra en tu PC…','working');
        }catch{}finally{if(!stopped)timer=setTimeout(check,2200);}
      };
      if(Object.hasOwn(connection||{},'transcriptionStage'))timer=setTimeout(check,800);
      return()=>{stopped=true;clearTimeout(timer);};
    }
    const jsonPost=data=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const localTracks=async()=>(await dbAction('assets','readonly',store=>store.getAll())).filter(a=>a.kind==='ai-music19');
    const put=record=>dbAction('assets','readwrite',store=>store.put(record));
    const lyricsDraftKey='salmos-audio-lyrics-draft';
    const lyricsIdPrefix='audio-lyrics:';
    const lyricsInput=find('lyrics'),nameInput=find('name'),modeInput=find('mode');
    try{
      const draft=JSON.parse(localStorage.getItem(lyricsDraftKey)||'null');
      if(typeof draft?.text==='string'){
        lyricsInput.value=draft.text;
        nameInput.value=typeof draft.name==='string'?draft.name:'';
        modeInput.value=draft.mode==='instrumental'?'instrumental':'vocal';
      }
    }catch{}
    function saveLyricsDraft(){
      try{
        localStorage.setItem(lyricsDraftKey,JSON.stringify({name:nameInput.value,text:lyricsInput.value,mode:modeInput.value}));
        return true;
      }catch{return false;}
    }
    async function storeCurrentLyrics(){
      const text=lyricsInput.value;
      if(!text.trim())return;
      const name=nameInput.value.trim()||'Letra sin título';
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([name,text])));
      const id=lyricsIdPrefix+Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
      await put({id,kind:'audio-lyrics',name,text,savedAt:Date.now()});
    }
    async function copyLyrics(text){
      try{await navigator.clipboard.writeText(text);}
      catch{
        const previous=document.activeElement,selection=document.createElement('textarea');
        selection.value=text;
        selection.readOnly=true;
        selection.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
        dialog.append(selection);
        try{
          selection.select();
          if(!document.execCommand('copy'))throw Error('No se pudo copiar la letra. Seleccionala en el editor y usá Ctrl+C.');
        }finally{selection.remove();previous?.focus();}
      }
      say('Letra copiada.','success');
    }
    async function openLyrics(entry){
      await storeCurrentLyrics();
      nameInput.value=entry?.name||'';
      lyricsInput.value=entry?.text||'';
      modeInput.value='vocal';
      saveLyricsDraft();
      sync();
      lyricsInput.scrollIntoView({block:'nearest'});
      say(entry?'Letra cargada para editar.':'Ya podés escribir una letra nueva.','success');
      await renderLyrics();
    }
    async function renderLyrics(){
      const rows=await dbAction('assets','readonly',store=>store.getAll(
        IDBKeyRange.bound(lyricsIdPrefix,lyricsIdPrefix+'\uffff')));
      const host=find('lyrics-library');
      host.replaceChildren();
      for(const entry of rows.sort((a,b)=>b.savedAt-a.savedAt)){
        const card=document.createElement('article'),title=document.createElement('strong'),preview=document.createElement('p');
        const actions=document.createElement('div'),use=document.createElement('button'),copy=document.createElement('button');
        title.textContent=entry.name;
        preview.textContent=entry.text;
        actions.className='button-row';
        use.textContent='Usar letra';use.setAttribute('aria-label','Usar letra '+entry.name);
        use.onclick=()=>action('Abriendo la letra…',()=>openLyrics(entry));
        copy.textContent='Copiar';copy.setAttribute('aria-label','Copiar letra '+entry.name);
        copy.onclick=()=>copyLyrics(entry.text).catch(error=>say(error.message,'error'));
        use.disabled=copy.disabled=busy||!!job;
        actions.append(use,copy);card.append(title,preview,actions);host.append(card);
      }
      if(!rows.length)host.textContent='Tus letras guardadas van a aparecer acá.';
    }
    function sync(){
      const locked=busy||!!job, preparing=!!connectionDeadline||connection?.setup?.state==='preparing';
      find('edit-controls').disabled=!active||locked;
      find('file').disabled=locked;find('transcribe').disabled=!recording||locked||preparing;
      find('use-upload').disabled=!recording||locked;find('generate').disabled=locked||preparing;
      find('cancel-job').hidden=!job;find('cancel-job').disabled=busy;
      find('refresh').disabled=locked;find('connect').disabled=busy||!!connectionDeadline;
      find('connect').textContent=connectionDeadline?'Esperando conexión…':find('connection').dataset.state==='offline'?'Reintentar conexión':'Ya abrí el iniciador';
      for(const el of dialog.querySelectorAll('[data-library] button, .audio-create select, .audio-create textarea, .audio-create input:not([type=file])'))el.disabled=locked;
      for(const el of dialog.querySelectorAll('[data-lyrics-library] button, [data-new-lyrics]'))el.disabled=locked;
      find('save-lyrics').disabled=find('copy-lyrics').disabled=locked||!lyricsInput.value.trim();
      const hasEdits=!!find('layers').children.length||!!find('effect').value;
      find('preview').disabled=find('save-new').disabled=!hasEdits;
      find('save-original').textContent=active?.localOnly?'Guardar copia en la PC':active?.saved?'✓ Guardado':'Guardar original';find('save-original').disabled=!!active?.saved&&!active.localOnly;
      const instrumental=find('mode').value==='instrumental';find('lyrics-field').hidden=find('voice-field').hidden=instrumental;
    }
    async function action(message,fn){
      if(busy)return;busy=true;say(message,'working');sync();
      try{await fn();}catch(e){say(e.message,'error');}
      finally{busy=false;sync();}
    }
    function resetMix(){
      if(mixURL)URL.revokeObjectURL(mixURL);mixURL='';mix=null;
      if(active&&player.getAttribute('src')!==sourceURL)player.src=sourceURL;
      sync();
    }
    function selectAudio(record,blob){
      player.pause();recordPlayer.pause();if(sourceURL)URL.revokeObjectURL(sourceURL);
      active={...record,blob};sourceURL=URL.createObjectURL(blob);
      find('layers').replaceChildren();find('effect').value='';resetMix();player.src=sourceURL;
      find('source-name').textContent=record.name;find('version-name').value=(record.name.slice(0,87)+' · mezcla').slice(0,100);sync();
    }
    async function loadTrack(t){
      const b=t.src?await (await fetch(t.src)).blob():await (await request('/audio/'+t.id)).blob();
      selectAudio({...t,saved:!!(t.saved20||t.request?.saved),remote:!t.src||t.remote||!!t.request&&!t.localOnly},b);
    }
    async function library(){
      const seq=++gallerySeq;
      const local=await localTracks().catch(()=>[]), entries=new Map(local.map(t=>[t.id,t]));
      if(connection)try{const data=await api('/tracks');for(const t of data.tracks||[]){
        const previous=entries.get(t.id);entries.set(t.id,{...previous,...t,remote:true,localOnly:false,saved20:t.request?.saved||previous?.saved20});
      }}catch{}
      if(seq!==gallerySeq)return;
      const host=find('library');host.replaceChildren();
      for(const t of [...entries.values()].filter(t=>!hiddenSongs().has(t.id)).sort((a,b)=>b.createdAt-a.createdAt)){
        const button=document.createElement('button'),title=document.createElement('strong'),detail=document.createElement('small');
        title.textContent=t.name;detail.textContent=[t.request?.parentId?'Mezcla':'Audio',Math.round(t.duration||0)+' s',(t.saved20||t.request?.saved)?'Guardado':'Generado'].join(' · ');
        button.append(title,detail);button.onclick=()=>action('Abriendo el audio…',async()=>{await loadTrack(t);say(t.name,'success');});
        button.disabled=busy||!!job;host.append(button);
      }
      if(!host.childElementCount)host.textContent='Todavía no hay audios guardados.';
    }
    function addLayer(){
      const row=document.createElement('div');row.className='audio-beat-row';
      row.innerHTML='<label>Base<select></select></label><label>Volumen<input type="range" min="0" max="100" value="25"><output>25%</output></label><button aria-label="Quitar base">×</button>';
      const select=row.querySelector('select'),range=row.querySelector('input');
      for(const track of tracks)select.add(new Option(track.name,track.id));
      select.value='urban';select.onchange=resetMix;range.oninput=()=>{row.querySelector('output').value=range.value+'%';resetMix();};
      row.querySelector('button').onclick=()=>{row.remove();resetMix();};find('layers').append(row);resetMix();
    }
    async function preview(){
      if(!mix){say('Mezclando el audio…');
        const layers=[...find('layers').children].map(row=>({track:tracks.find(t=>t.id===row.querySelector('select').value),volume:Number(row.querySelector('input').value)/100}));
        mix=await renderMix(active.blob,layers,find('effect').value,tools);mix.id=newId();mixURL=URL.createObjectURL(mix.blob);
      }
      player.src=mixURL;
    }
    async function saveBlob(t,blob,parentId='',generated=false){
      let remote=false,reason='';
      if(connection)try{
        if(generated)await api('/save',jsonPost({id:t.id}));
        else await api('/versions/'+t.id+'?'+new URLSearchParams({name:t.name,parent:parentId}),{method:'POST',headers:{'Content-Type':'audio/wav'},body:blob});
        remote=true;
      }catch(e){reason=e.message;}
      const record={kind:'ai-music19',id:t.id,name:t.name,duration:t.duration,createdAt:t.createdAt||Date.now()/1000,
        request:{...t.request,name:t.name,duration:t.duration,saved:true,parentId},saved20:true,remote,localOnly:!remote,generated,src:''};
      try{record.src=await blobData(blob);await put(record);}catch(e){if(!remote)throw Error('No se pudo guardar el audio en la PC ni en este navegador. Podés descargar el WAV.');}
      say(remote?'Audio guardado en tu PC.':['Audio guardado en este navegador.',reason].filter(Boolean).join(' '),'success');
      await library();if(connection)refreshSongs().catch(()=>{});return record;
    }
    async function poll(){
      clearTimeout(timer);if(!job||polling||!connection)return;polling=true;
      const id=job;
      try{
        const data=await api(''),current=data.job;
        if(job!==id)return;
        if(current?.id===id&&current.state==='running'){
          say(current.message||'Generando canción…','working');
          return;
        }
        if(current?.id===id&&['error','cancelled'].includes(current.state)){
          keyJob('');say(current.message||'La generación se interrumpió.','error');
          return;
        }
        const track=(await api('/tracks')).tracks?.find(t=>t.id===id);
        if(!track){keyJob('');say('El iniciador ya no tiene esa generación activa. Podés volver a generar.');return;}
        if(job!==id)return;
        if(busy)return;
        busy=true;sync();
        try{await loadTrack({...track,remote:true});keyJob('');say('Canción lista. Podés guardar el original o escuchar una mezcla.','success');await library();}
        finally{busy=false;}
      }catch(e){
        if(!connection)waitForInitiator();
        else say(e.message,'error');
      }
      finally{polling=false;sync();if(job&&dialog.open&&connection)timer=setTimeout(poll,1800);}
    }
    find('file').onchange=()=>{
      recording=find('file').files[0]||null;if(recordingURL)URL.revokeObjectURL(recordingURL);
      recordingURL=recording?URL.createObjectURL(recording):'';recordPlayer.hidden=!recording;
      if(recording){recordPlayer.src=recordingURL;if(!find('name').value)find('name').value=recording.name.replace(/\.[^.]+$/,'').slice(0,100);}
      else{recordPlayer.removeAttribute('src');recordPlayer.load();}
      saveLyricsDraft();sync();
    };
    find('transcribe').onclick=()=>action('Preparando la grabación para extraer la letra…',async()=>{
      const status=await connect();
      if(!status.transcription)throw Error('Cerrá y volvé a abrir el iniciador para instalar la extracción de letra.');
      recordPlayer.pause();
      const wav=await recordingForLyrics(recording,tools);
      say('Enviando la grabación a tu iniciador…','working');
      const stop=monitorTranscription();
      let data;
      try{data=await api('/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wav},20*60*1000);}
      finally{stop();}
      if(!data.lyrics?.trim())throw Error('No se distinguió una letra.');
      if(lyricsInput.value.trim()&&lyricsInput.value!==data.lyrics){
        await storeCurrentLyrics();
        await renderLyrics();
      }
      modeInput.value='vocal';lyricsInput.value=data.lyrics;
      const draftSaved=saveLyricsDraft();
      sync();
      say(draftSaved?'Letra extraída y conservada como borrador. Podés guardarla en Mis letras.':'Letra extraída. Tocá Guardar letra para conservarla.','success');
    });
    find('use-upload').onclick=()=>action('Abriendo tu grabación…',async()=>{
      const b=await decode(recording);selectAudio({id:newId(),name:recording.name.replace(/\.[^.]+$/,'').slice(0,100),duration:b.duration,saved:false,remote:false},tools.waveBlob(b));
      say('Grabación lista para editar.','success');
    });
    find('generate').onclick=()=>action('Preparando el pedido de generación…',async()=>{
      if(job)return;
      const style=find('genre').value,lyrics=find('lyrics').value.trim(),instrumental=find('mode').value==='instrumental';
      if(!instrumental&&(!lyrics||lyrics.length>3000))throw Error('Escribí o ajustá la letra a un máximo de 3.000 caracteres para generar.');
      const status=await connect();
      if(!status.installed)throw Error('El iniciador está conectado. Para generar canciones hace falta ACE-Step en la PC.');
      const bpm=find('bpm').value,payload={name:find('name').value.trim()||'Mi canción',style,caption:genres[style][1]+', '+bpm+' BPM.',lyrics:instrumental?'':lyrics,
        rhythm:({'100':'slow','122':'medium','132':'fast'})[bpm],duration:Number(find('duration').value),voice:find('voice').value,instrumental};
      say('Enviando la canción al motor de música…','working');
      const data=await api('/generate',jsonPost(payload));if(!data.job?.id)throw Error('El motor no devolvió la generación.');
      keyJob(data.job.id);say('El iniciador recibió el pedido. Generando audio…','working');timer=setTimeout(poll,250);
    });
    find('cancel-job').onclick=()=>{
      if(!job||busy||!window.confirm('¿Querés cancelar la generación de esta canción?'))return;
      void action('Cancelando la generación…',async()=>{
      const data=connection?await api(''):await connect();
      if(data.job?.id===job&&data.job.state==='running')await api('/cancel',jsonPost({id:job}));
      keyJob('');clearTimeout(timer);say('Generación finalizada o cancelada.');
      });
    };
    find('save-original').onclick=()=>action('Guardando el audio…',async()=>{
      if(active.localOnly&&!connection)await connect();
      const record=await saveBlob(active,active.blob,active.request?.parentId||'',!!(active.generated||active.remote&&!active.request?.audioEdit));
      active={...active,...record,saved:true};
    });
    find('save-new').onclick=()=>action('Preparando la nueva versión…',async()=>{
      const name=find('version-name').value.trim();if(!name)throw Error('Escribí un nombre para la nueva versión.');
      await preview();
      const record=await saveBlob({id:mix.id,name,duration:mix.duration,request:active.request},mix.blob,active.id);
      selectAudio({...record,saved:true},mix.blob);
    });
    find('preview').onclick=()=>action('Preparando la mezcla…',async()=>{await preview();await player.play();say('Escuchando la mezcla.');});
    find('download').onclick=()=>{const link=document.createElement('a');link.href=mixURL||sourceURL;
      link.download=(mixURL?find('version-name').value:active.name)+'.wav';link.click();};
    find('add-beat').onclick=addLayer;find('effect').onchange=resetMix;
    modeInput.onchange=()=>{saveLyricsDraft();sync();};
    nameInput.oninput=saveLyricsDraft;
    lyricsInput.oninput=()=>{saveLyricsDraft();sync();};
    find('save-lyrics').onclick=()=>action('Guardando la letra…',async()=>{
      await storeCurrentLyrics();
      await renderLyrics();
      say('Letra guardada en Mis letras.','success');
    });
    find('copy-lyrics').onclick=()=>copyLyrics(lyricsInput.value).catch(error=>say(error.message,'error'));
    find('new-lyrics').onclick=()=>action('Abriendo una letra nueva…',()=>openLyrics());
    find('show-lyrics').onclick=()=>find('lyrics-library').closest('section').scrollIntoView({block:'nearest'});
    player.onplay=()=>recordPlayer.pause();recordPlayer.onplay=()=>player.pause();
    find('download-launcher').onclick=event=>{
      if(downloadPending||connectionDeadline||busy||job){event.preventDefault();return;}
      downloadPending=true;
      const button=find('download-launcher');
      button.setAttribute('aria-disabled','true');
      say('Descarga solicitada. Cuando termine, abrí INICIAR_SALMOS.bat desde Descargas.','success');
      setTimeout(()=>{downloadPending=false;button.removeAttribute('aria-disabled');},1600);
    };
    find('connect').onclick=waitForInitiator;
    find('refresh').onclick=()=>action('Actualizando tus audios…',async()=>{await library();say('Audios actualizados.','success');});
    find('close').onclick=()=>dialog.close();
    dialog.onclose=()=>{clearTimeout(timer);player.pause();recordPlayer.pause();};
    launcher.onclick=()=>{
      pause();dialog.showModal();sync();
      library().catch(error=>say(error.message,'error'));
      renderLyrics().catch(()=>{find('lyrics-library').textContent='No se pudieron cargar tus letras. Volvé a abrir el Estudio.';});
      if(job){if(connection)poll();else waitForInitiator();}
    };
    showConnection('Iniciador sin conectar','Conectalo para extraer letra o generar canciones. Podés editar grabaciones directamente en el navegador.','idle');
    sync();
  }
  window.SalmosAudioStudio={install};
})();
