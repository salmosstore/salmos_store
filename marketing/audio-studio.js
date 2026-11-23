(() => {
  'use strict';
  const newId=()=>crypto.randomUUID().replaceAll('-','');
  const offline=(channels,length,rate)=>new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(channels,Math.max(1,length),rate);
  const audioTypes={aac:'audio/aac',flac:'audio/flac',m4a:'audio/mp4',mp3:'audio/mpeg',ogg:'audio/ogg',
    opus:'audio/ogg',wav:'audio/wav',webm:'audio/webm',aif:'audio/aiff',aiff:'audio/aiff'};
  const audioName=file=>file.name.replace(/\.[^.]+$/,'').trim().slice(0,100)||'Audio subido';
  const launcherFile='INICIAR_SALMOS.bat?v=27.4';
  const maxSongDuration=600;
  const durationChoices=[10,20,30,60,90,120,150,180,240,300,360,600];
  const updateForSongs='Descargá el iniciador actualizado. Cerrá el anterior y abrí el nuevo.';
  const readyToGenerate=data=>!!(data?.songApi>=2&&data.installed&&data.setup?.state==='ready');

  function groupSongs(tracks){
    const groups=new Map();
    for(const track of tracks){
      const lyrics=track.request?.lyrics||track.lyrics||'';
      const key=lyrics.trim().normalize('NFC').replace(/\s+/g,' ').toLocaleLowerCase('es')||'audio:'+track.id;
      if(!groups.has(key))groups.set(key,{lyrics,tracks:[]});
      groups.get(key).tracks.push(track);
    }
    return [...groups.values()];
  }
  function appendLyrics(host,lyrics){
    if(!lyrics)return;
    const box=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');
    const first=lyrics.split(/\r?\n/).find(line=>line.trim()&&!/^\s*\[/.test(line))||'Letra';
    summary.textContent='Letra · '+first.trim().slice(0,74);
    text.textContent=lyrics;box.append(summary,text);host.append(box);
  }

  const jsonPost=data=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const reconnecting='Se interrumpió la consulta. La canción puede seguir generándose. Volviendo a conectar…';
  const isConnectionError=error=>error?.name==='TypeError'||error?.name==='AbortError'||
    error?.status===408||error?.status>=500||!!error?.cause&&isConnectionError(error.cause);

  function durationText(seconds){
    const total=Math.max(0,Math.round(Number(seconds)||0)),minutes=Math.floor(total/60),rest=total%60;
    return [minutes&&minutes+' min',(rest||!minutes)&&rest+' s'].filter(Boolean).join(' ');
  }

  function estimateSongDuration(lyrics,bpm){
    const words=lyrics.replace(/\[[^\]\n]*\]/g,'').match(/[\p{L}\p{N}]+/gu)?.length||0;
    if(!words)return 60;
    const beat=60/(Number(bpm)||122);
    const seconds=words*1.6*beat+16*beat+5;
    return Math.min(maxSongDuration,Math.max(45,Math.ceil(seconds/15)*15));
  }

  function jobMessage(job,readerVersion){
    const message=job?.message||'';
    const memoryError=job?.errorCode==='windows_commit_limit'||
      /(?:os error|winerror)\s*[:=]?\s*1455\b|paging file is too small|archivo de paginación es demasiado pequeño/i.test(message);
    if(!memoryError)return message;
    const reason='Windows se quedó sin memoria virtual al cargar ACE-Step (error 1455). ';
    return reason+(readerVersion?
      'Cerrá otros programas pesados y revisá la memoria virtual de Windows antes de reintentar.':
      'Descargá el iniciador actualizado, cerrá el anterior y abrí el nuevo.');
  }

  function createSongJob({helperFetch,storageKey,report,completed}){
    const get=async(path,options={},timeout=6000)=>
      (await helperFetch('/api/music'+path,{cache:'no-store',...options},timeout)).json();
    let id='',timer=0,checking=false,posting=false,misses=0,retries=0;
    try{id=localStorage.getItem(storageKey)||'';}catch{}
    if(!/^[a-f0-9]{32}$/.test(id))id='';
    function remember(value){
      id=value;
      misses=retries=0;
      try{if(id)localStorage.setItem(storageKey,id);else localStorage.removeItem(storageKey);}catch{}
    }
    function resume(delay=0){
      if(!id||checking||posting||timer)return;
      timer=setTimeout(()=>{timer=0;void poll();},delay);
    }
    function finish(message,state,data){
      remember('');
      report(message,state,data);
    }
    async function poll(){
      if(!id||checking)return;
      const expected=id;
      let delay=1800;
      checking=true;
      try{
        let data;
        try{data=await get('/jobs/'+expected);}
        catch(error){
          if(error.status!==404)throw error;
          data=await get('');
        }
        if(id!==expected)return;
        let job=data.job?.id===expected?data.job:null;
        if(!job&&!data.songApi){
          const track=(await get('/tracks')).tracks?.find(item=>item.id===expected);
          if(track)job={state:'done',track};
        }
        if(!job){
          if(++misses>=3)finish('El iniciador no registró el pedido. Podés volver a generar.', 'notice',data);
          return;
        }
        misses=0;
        if(job.state==='running')report(job.message||'Generando tu canción…','working',data);
        else if(job.state==='error'||job.state==='cancelled'){
          finish(jobMessage(job,data.musicReaderVersion)||'La generación terminó sin audio.',
            job.state==='error'?'error':'notice',data);
        }else if(job.state==='done'){
          const track=job.track||(await get('/tracks')).tracks?.find(item=>item.id===expected);
          if(!track){finish('La generación terminó. Actualizá Mis audios para buscar el resultado.','notice',data);return;}
          report('La canción se generó. Abriendo el audio…','working',data);
          await completed(track);
          finish('Canción lista. Podés escucharla y guardarla.','success',data);
        }
        retries=0;
      }catch(error){
        if(isConnectionError(error)||error instanceof SyntaxError){
          delay=Math.min(12000,2000*2**Math.min(retries++,3));
          report(reconnecting,'working');
        }else finish(jobMessage(error)||'No se pudo abrir el resultado.','error');
      }finally{checking=false;resume(delay);}
    }
    async function start(payload,connection){
      if(id)return;
      if(connection.songApi<2||!connection.songApi)throw Error(updateForSongs);
      if(!readyToGenerate(connection))throw Error('Esperá a que el iniciador indique SALMOS listo.');
      remember(newId());
      posting=true;
      report('Enviando el pedido al iniciador…','working');
      try{
        const data=await get('/generate',jsonPost({...payload,requestId:id}),12000);
        if(data.job?.id!==id)throw new SyntaxError('El iniciador no confirmó el pedido.');
        report('Pedido recibido. Generando tu canción…','working');
      }catch(error){
        if(!isConnectionError(error)&&!(error instanceof SyntaxError)){remember('');throw error;}
        report('Todavía no pude confirmar el pedido. Estoy comprobando si el iniciador lo recibió…','working');
      }finally{posting=false;resume(300);}
    }
    async function cancel(){
      if(!id)return;
      try{await get('/cancel',jsonPost({id}),24000);}
      catch(error){if(!isConnectionError(error))throw error;report(reconnecting,'working');}
      resume();
    }
    return {get id(){return id;},start,resume,cancel};
  }
  async function decode(blob,rate=44100){
    const buffer=await offline(2,1,rate).decodeAudioData(await blob.arrayBuffer());
    if(!buffer.length||buffer.duration>600)throw Error('Elegí un audio de hasta diez minutos para esta edición.');
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
  function install({helperFetch,dbAction,tools,genres,refreshSongs,hiddenSongs,pause}){
    const launcher=document.createElement('button');launcher.textContent='Crear solo audio';launcher.className='primary';
    document.querySelector('#createReel').after(launcher);
    const dialog=document.createElement('dialog');dialog.id='audioOnlyStudio';dialog.setAttribute('aria-labelledby','audioStudioTitle');
    dialog.innerHTML=`<header><div class="audio-studio-title"><h1 id="audioStudioTitle">Estudio de audio</h1><button type="button" data-close aria-label="Cerrar estudio de audio">×</button></div>
      <p data-status role="status" aria-live="polite" aria-atomic="true"></p></header>
      <div class="audio-studio-body"><div class="audio-connection" data-connection>
        <div role="status"><strong data-connection-title>Iniciador sin conectar</strong><p data-connection-help></p></div>
        <a class="button" href="${launcherFile}" download="INICIAR_SALMOS.bat" data-update-launcher hidden>Descargar iniciador actualizado</a>
        <ol class="audio-launcher-steps" data-launcher-steps>
          <li><a class="button primary" href="${launcherFile}" download="INICIAR_SALMOS.bat" data-download-launcher>Descargar iniciador</a></li>
          <li>Abrí <strong>INICIAR_SALMOS.bat</strong> desde Descargas y dejá su ventana abierta.</li>
          <li><button type="button" data-connect>Ya abrí el iniciador</button></li>
        </ol>
      </div><section class="audio-create"><h2>Crear canción</h2>
        <div class="audio-source-input"><label>Subir grabación o canción<input type="file" accept="audio/*,.ogg,.opus,.m4a,.wav,.mp3,.webm,.aac,.flac" data-file></label>
          <audio data-upload-player controls preload="metadata" hidden></audio>
          <div class="form-grid audio-upload-fields" data-upload-fields hidden>
            <label>Nombre del audio<input data-upload-name maxlength="100"></label>
            <label>Guardar como<select data-upload-kind><option value="recording">Grabación</option><option value="song">Canción</option></select></label>
          </div>
          <div class="button-row"><button type="button" data-save-upload class="primary" disabled>Guardar en Mis audios</button>
          <button type="button" data-use-upload disabled>Editar audio subido</button><button type="button" data-arrange-voice disabled>Mejorar mi voz y acompañarla</button><button type="button" data-transcribe disabled>Extraer letra</button></div></div>
        <div class="form-grid"><label>Nombre<input data-name maxlength="100" placeholder="Mi canción"></label>
        <label>Tipo<select data-mode><option value="vocal">Con letra</option><option value="instrumental">Instrumental</option></select></label></div>
        <div class="audio-lyrics-editor" data-lyrics-field>
          <label>Letra para cantar<textarea data-lyrics rows="7" placeholder="Escribí la letra o extraela de tu grabación"></textarea></label>
          <div class="button-row"><button type="button" data-save-lyrics>Guardar letra</button><button type="button" data-copy-lyrics>Copiar letra</button><button type="button" data-show-lyrics>Mis letras</button></div>
        </div>
        <div class="form-grid"><label>Estilo<select data-genre></select></label><label>Ritmo<select data-bpm><option value="style">Según el estilo</option><option value="80">Suave · 80 BPM</option><option value="100">Medio · 100 BPM</option><option value="122">Ágil · 122 BPM</option><option value="132">Rápido · 132 BPM</option><option value="155">Muy rápido · 155 BPM</option></select></label>
        <label>Duración<select data-duration aria-describedby="songDurationHelp"><option value="auto">Automática</option>${durationChoices.map(seconds=>`<option value="${seconds}">${durationText(seconds)}</option>`).join('')}<option value="custom">Personalizada</option></select></label>
        <label data-voice-field>Voz<select data-voice><option value="auto">Automática</option><option value="female">Femenina</option><option value="male">Masculina</option></select></label>
        <label data-custom-duration-field hidden>Duración en segundos<input type="number" data-custom-duration min="10" max="${maxSongDuration}" step="1" value="120"></label></div>
        <small id="songDurationHelp" data-duration-help></small>
        <div class="button-row audio-generate-row"><button data-generate class="primary">Generar canción</button><button data-cancel-job hidden>Cancelar generación</button></div>
        <p data-generate-help>Conectá el iniciador para generar.</p></section>
        <section class="audio-mix"><h2>Mis audios</h2><p data-source-name>Elegí o subí un audio para escucharlo y editarlo.</p>
        <fieldset data-edit-controls disabled><audio data-player controls preload="metadata"></audio>
        <div class="button-row"><button data-edit-selected class="primary">Editar audio</button><button data-save-original>Guardar original</button></div></fieldset>
        <button data-refresh>Actualizar audios</button><div data-library></div></section>
        <section class="audio-saved"><div class="audio-layer-heading"><h2>Mis letras</h2><button type="button" data-new-lyrics>Nueva letra</button></div><div class="audio-lyrics-list" data-lyrics-library></div></section></div>`;
    document.body.append(dialog);
    const find=key=>dialog.querySelector('[data-'+key+']');
    function say(message,state='notice'){
      const status=find('status');
      if(status.textContent!==message)status.textContent=message;
      status.dataset.state=state;
    }
    for(const [id,[name]] of Object.entries(genres))find('genre').add(new Option(name,id));
    const player=find('player'),recordPlayer=find('upload-player');
    let recording=null,recordingURL='',savedUpload=null,active=null,sourceURL='',busy=false,gallerySeq=0;
    let connection=null, connectionDeadline=0, retries=0, downloadPending=false;
    const song=createSongJob({helperFetch,storageKey:'salmos-active-audio-job',
      report(message,state,data){
        if(data?.audioApi===2)updateConnection(data);
        say(message,state);
        sync();
      },
      async completed(track){
        await loadTrack({...track,remote:true});
        remoteTracks=[track,...remoteTracks.filter(item=>item.id!==track.id)];
        await library();
      }});
    const startHelp='Si ya lo descargaste, abrilo desde Descargas. Cuando su ventana esté abierta, tocá «Ya abrí el iniciador».';
    function showConnection(title,help,mode){
      find('connection-title').textContent=title;
      find('connection-help').textContent=help;
      find('connection').dataset.state=mode;
      find('launcher-steps').hidden=mode==='online'&&connection?.transcription;
      find('update-launcher').hidden=mode!=='online'||connection?.songApi>=2;
    }
    async function request(path,options={},timeout){
      try{return await helperFetch('/api/music'+path,options,timeout);}
      catch(error){
        if(isConnectionError(error)){
          connection=null;
          showConnection('Iniciador sin conexión',startHelp+' Si Chrome pide permiso para acceder a la red local, permitilo.','offline');
          throw Error('La PC no respondió. Podés guardar y editar tus audios subidos desde el navegador.',{cause:error});
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
      if(response.installed&&!response.musicReaderVersion)available.push('Hay una actualización para cargar el motor de música con menos memoria.');
      else if(!(response.songApi>=2))available.push('Descargá el iniciador actualizado para entrar a la generación.');
      showConnection('Iniciador conectado',available.join(' ')||'Extracción de letra y motor de canciones disponibles.','online');
      return true;
    }
    async function checkOpeningInitiator(){
      let delay=2400;
      try{
        if(updateConnection(await readConnection())){
          connectionDeadline=0;
          if(!busy)say(song.id?'Iniciador conectado. Consultando la generación…':'Iniciador conectado.',song.id?'working':'success');
          sync();
          if(song.id)song.resume();
          else refreshLibrary().catch(error=>{if(!busy&&!song.id)say(error.message,'error');});
          return;
        }
        retries=0;
        connectionDeadline=Date.now()+5*60*1000;
        if(!busy)say('El iniciador ya respondió y está preparando SALMOS. Te aviso cuando esté listo.','working');
      }catch(error){
        if(!isConnectionError(error)||Date.now()>=connectionDeadline){
          connectionDeadline=0;connection=null;
          if(isConnectionError(error))showConnection('El iniciador aún no respondió','Revisá su ventana. Si está instalando, dejala abierta y tocá «Reintentar conexión».','offline');
          if(!busy&&!song.id)say(isConnectionError(error)?'Se cumplió el tiempo de espera. Podés reintentar la conexión.':error.message,'error');
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
      const response=await api('',{cache:'no-store'},4000);
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
    const localTracks=async()=>(await dbAction('assets','readonly',store=>store.getAll())).filter(a=>a.kind==='ai-music19');
    const put=record=>dbAction('assets','readwrite',store=>store.put(record));
    const uploadName=find('upload-name'),uploadKind=find('upload-kind');
    function uploadRecord(){
      return {...recording,name:uploadName.value.trim()||audioName(recording.blob),uploadKind:uploadKind.value,
        duration:Number.isFinite(recordPlayer.duration)?recordPlayer.duration:0};
    }
    function uploadIsSaved(){
      return !!recording&&savedUpload?.id===recording.id&&
        savedUpload.name===(uploadName.value.trim()||audioName(recording.blob))&&savedUpload.uploadKind===uploadKind.value;
    }
    async function saveUpload(entry){
      const {id,name,blob,fileName,uploadKind,duration,createdAt,lyrics}=entry;
      const record={id,name,blob,fileName,uploadKind,duration,createdAt,lyrics,kind:'ai-music19',saved20:true,localOnly:true};
      try{await put(record);}
      catch{throw Error('El navegador no pudo guardar ese archivo. El original sigue disponible para descargar.');}
      if(recording?.id===id)savedUpload=record;
      if(active?.id===id){active={...record,saved:true};find('source-name').textContent=record.name;}
      say('Audio guardado en Mis audios.','success');
      await library();
    }
    const lyricsDraftKey='salmos-audio-lyrics-draft';
    const lyricsIdPrefix='audio-lyrics:';
    const lyricsInput=find('lyrics'),nameInput=find('name'),modeInput=find('mode');
    const durationInput=find('duration'),customDuration=find('custom-duration'),bpmInput=find('bpm');
    try{
      const draft=JSON.parse(localStorage.getItem(lyricsDraftKey)||'null');
      if(typeof draft?.text==='string'){
        lyricsInput.value=draft.text;
        nameInput.value=typeof draft.name==='string'?draft.name:'';
        modeInput.value=draft.mode==='instrumental'?'instrumental':'vocal';
        if([...durationInput.options].some(option=>option.value===draft.durationMode))durationInput.value=draft.durationMode;
        if(Number.isInteger(draft.customDuration)&&draft.customDuration>=10&&draft.customDuration<=maxSongDuration)customDuration.value=draft.customDuration;
      }
    }catch{}
    function saveLyricsDraft(){
      try{
        localStorage.setItem(lyricsDraftKey,JSON.stringify({name:nameInput.value,text:lyricsInput.value,mode:modeInput.value,
          durationMode:durationInput.value,customDuration:Number(customDuration.value)}));
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
        use.disabled=copy.disabled=busy||!!song.id;
        actions.append(use,copy);card.append(title,preview,actions);host.append(card);
      }
      if(!rows.length)host.textContent='Tus letras guardadas van a aparecer acá.';
    }
    const chosenBpm=()=>Number(bpmInput.value)||genres[find('genre').value]?.[2]||122;
    function songDuration(){
      const estimate=estimateSongDuration(modeInput.value==='instrumental'?'':lyricsInput.value,chosenBpm());
      return {estimate,desired:durationInput.value==='auto'?estimate:
        Number(durationInput.value==='custom'?customDuration.value:durationInput.value)};
    }
    function sync(){
      const locked=busy||!!song.id, preparing=!!connectionDeadline||connection?.setup?.state==='preparing';
      const uploadReady=!!recording&&!recordPlayer.error&&recordPlayer.readyState>=1,uploadSaved=uploadIsSaved();
      find('edit-controls').disabled=!active||locked;
      find('file').disabled=locked;find('transcribe').disabled=!uploadReady||locked||preparing;
      find('use-upload').disabled=find('arrange-voice').disabled=!uploadReady||locked;
      find('generate').disabled=locked||preparing||!readyToGenerate(connection);
      find('generate-help').textContent=preparing?'Esperando a que el iniciador diga SALMOS listo…':
        readyToGenerate(connection)?'':connection?(connection.songApi>=2?'ACE-Step debe estar disponible en tu PC.':'Abrí el iniciador actualizado.'):'Conectá el iniciador para generar.';
      find('generate-help').hidden=!find('generate-help').textContent;
      find('save-upload').disabled=!uploadReady||locked||uploadSaved;
      find('save-upload').textContent=uploadSaved?'✓ Guardado en Mis audios':'Guardar en Mis audios';
      find('cancel-job').hidden=!song.id;find('cancel-job').disabled=busy;
      find('refresh').disabled=locked;find('connect').disabled=busy||!!connectionDeadline;
      find('connect').textContent=connectionDeadline?'Esperando conexión…':find('connection').dataset.state==='offline'?'Reintentar conexión':'Ya abrí el iniciador';
      for(const el of dialog.querySelectorAll('[data-library] button, .audio-create select, .audio-create textarea, .audio-create input:not([type=file])'))el.disabled=locked;
      for(const el of dialog.querySelectorAll('[data-lyrics-library] button, [data-new-lyrics]'))el.disabled=locked;
      find('save-lyrics').disabled=find('copy-lyrics').disabled=locked||!lyricsInput.value.trim();
      const diskCopy=active?.localOnly&&!active.uploadKind;
      find('save-original').textContent=diskCopy?'Guardar copia en la PC':active?.saved?'✓ Guardado':'Guardar original';
      find('save-original').disabled=!!active?.saved&&!diskCopy;
      const instrumental=find('mode').value==='instrumental';find('lyrics-field').hidden=find('voice-field').hidden=instrumental;
      const {estimate,desired}=songDuration(),durationHelp=find('duration-help');
      find('custom-duration-field').hidden=durationInput.value!=='custom';
      const tooShort=!instrumental&&lyricsInput.value.trim()&&desired>=10&&desired<estimate*.75;
      durationHelp.textContent=durationInput.value==='auto'?'Duración estimada · '+durationText(estimate):
        tooShort?'Sugerida para esta letra · '+durationText(estimate)+'. Este tiempo podría cortar versos.':'';
      durationHelp.hidden=!durationHelp.textContent;
    }
    async function action(message,fn){
      if(busy)return;busy=true;say(message,'working');sync();
      try{await fn();}catch(e){say(jobMessage(e,connection?.musicReaderVersion),'error');}
      finally{busy=false;sync();}
    }
    function selectAudio(record,blob){
      player.pause();recordPlayer.pause();if(sourceURL)URL.revokeObjectURL(sourceURL);
      active={...record,blob};sourceURL=URL.createObjectURL(blob);player.src=sourceURL;
      find('source-name').textContent=record.name;sync();
    }
    async function loadTrack(t){
      const b=t.blob||(t.src?await (await fetch(t.src)).blob():await (await request('/audio/'+t.id)).blob());
      const remote=!t.uploadKind&&(t.remote||(!t.src&&!t.blob)||!!t.request&&!t.localOnly);
      selectAudio({...t,saved:!!(t.saved20||t.request?.saved),remote},b);
    }
    async function library(){
      const seq=++gallerySeq;
      const local=await localTracks().catch(()=>[]),entries=new Map(local.map(t=>[t.id,t]));
      for(const t of remoteTracks){
        const previous=entries.get(t.id);
        entries.set(t.id,{...previous,...t,request:{...t.request,...previous?.request,saved:t.request?.saved||previous?.request?.saved},
          remote:true,localOnly:false,saved20:t.request?.saved||previous?.saved20});
      }
      if(seq===gallerySeq)renderAudioLibrary(entries);
    }
    let remoteTracks=[];
    async function refreshLibrary(){
      await library();
      if(connection){
        try{remoteTracks=(await api('/tracks')).tracks||[];}catch{return;}
        await library();
      }
    }
    function renderAudioLibrary(entries){
      const host=find('library');host.replaceChildren();
      const hidden=hiddenSongs();
      const audios=[...entries.values()].filter(t=>!hidden.has(t.id)).sort((a,b)=>b.createdAt-a.createdAt);
      for(const group of groupSongs(audios)){
        const item=document.createElement('article');item.className='song-group';
        appendLyrics(item,group.lyrics);
        for(const t of group.tracks){
          const row=document.createElement('div'),text=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');
          const edit=document.createElement('button');
          row.className='song-list-row';
          title.textContent=t.name;
          detail.textContent=[t.uploadKind==='song'?'Canción subida':t.uploadKind==='recording'?'Grabación subida':
            t.request?.parentId?'Versión editada':t.request?.audioEdit?'Audio guardado':genres[t.request?.style]?.[0]||'Canción generada',
            t.duration>0?durationText(t.duration):''].filter(Boolean).join(' · ');
          edit.textContent='Escuchar y editar';edit.disabled=busy||!!song.id;
          edit.onclick=()=>action('Abriendo el audio…',()=>editTrack(t));
          text.append(title,detail);row.append(text,edit);item.append(row);
        }
        host.append(item);
      }
      if(!host.childElementCount)host.textContent='Todavía no hay audios guardados.';
    }
    async function saveOriginal(t,name){
      if(t.uploadKind){await saveUpload({...t,name});return;}
      if(t.remote||t.localOnly)await connect().catch(()=>{});
      const generated=!!(t.generated||t.remote&&!t.request?.audioEdit);
      if(generated&&t.remote&&name!==t.name)await api('/rename',jsonPost({id:t.id,name}));
      const record=await saveBlob({...t,name},t.blob,t.request?.parentId||'',generated);
      if(active?.id===t.id){active={...active,...record,saved:true};find('source-name').textContent=record.name;}
    }
    async function editTrack(track,{reel,onApply,trim,voice=false}={}){
      pause();
      if(active?.id!==track.id||!active.blob)await loadTrack(track);
      const source={...active,...track,blob:active.blob};
      const draftKey='song-edit:'+source.id;
      const draft=await dbAction('assets','readonly',s=>s.get(draftKey));
      await window.SalmosSongEditor.open({track:source,blob:source.blob,tools,reel,trim,
        settings:draft?.settings,voice,style:source.request?.style||find('genre').value,bpm:source.request?.bpm||chosenBpm(),notify:say,
        onDraft:settings=>put({id:draftKey,kind:'song-edit',settings}),
        onSaveOriginal:name=>saveOriginal(source,name),
        onSaveVersion:version=>saveBlob({...version,id:newId(),request:{...source.request,lyrics:version.lyrics}},version.blob,source.id),
        onLyrics:async lyrics=>{
          if(source.remote&&!source.localOnly){
            await connect();await api('/lyrics',jsonPost({id:source.id,lyrics}));
          }
          source.lyrics=lyrics;
          source.request={...source.request,lyrics};
          const previous=await dbAction('assets','readonly',s=>s.get(source.id));
          if(previous)await put({...previous,lyrics,request:source.request});
          else if(source.uploadKind)await saveUpload(source);
          if(active?.id===source.id)Object.assign(active,{lyrics,request:source.request});
          const remote=remoteTracks.find(track=>track.id===source.id);
          if(remote)remote.request={...remote.request,lyrics};
          await library();await refreshSongs().catch(()=>{});
        },
        onMP3:async wav=>{
          const status=await connect();
          if(!(status.songApi>=2))throw Error(updateForSongs);
          return (await request('/mp3',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wav},180000)).blob();
        },
        onDelete:async()=>{
          if(source.remote&&!source.localOnly){
            await connect();
            await api('/delete',jsonPost({id:source.id}));
          }
          await dbAction('assets','readwrite',s=>{s.delete(draftKey);return s.delete(source.id);});
          remoteTracks=remoteTracks.filter(track=>track.id!==source.id);
          if(savedUpload?.id===source.id)savedUpload=null;
          if(active?.id===source.id){
            player.pause();player.removeAttribute('src');player.load();
            if(sourceURL)URL.revokeObjectURL(sourceURL);
            sourceURL='';active=null;find('source-name').textContent='Elegí o subí un audio para escucharlo y editarlo.';
          }
          await library();await refreshSongs().catch(()=>{});sync();say('Audio borrado.','success');
        },
        onApply});
    }
    async function saveBlob(t,blob,parentId='',generated=false){
      let remote=false,reason='';
      if(connection)try{
        if(generated)await api('/save',jsonPost({id:t.id}));
        else{
          await api('/versions/'+t.id+'?'+new URLSearchParams({name:t.name,parent:parentId}),{method:'POST',headers:{'Content-Type':'audio/wav'},body:blob});
          if(typeof t.request?.lyrics==='string'&&t.request.lyrics)
            await api('/lyrics',jsonPost({id:t.id,lyrics:t.request.lyrics})).catch(()=>{});
        }
        remote=true;
      }catch(e){reason=e.message;}
      const record={kind:'ai-music19',id:t.id,name:t.name,duration:t.duration,createdAt:t.createdAt||Date.now()/1000,
        request:{...t.request,name:t.name,duration:t.duration,saved:true,parentId,audioEdit:!generated},saved20:true,remote,localOnly:!remote,generated,blob};
      try{await put(record);}catch(e){if(!remote)throw Error('No se pudo guardar el audio en la PC ni en este navegador. Podés descargar el WAV.');}
      say(remote?'Audio guardado en tu PC.':['Audio guardado en este navegador.',reason].filter(Boolean).join(' '),'success');
      await library();if(connection)refreshSongs().catch(()=>{});return record;
    }
    find('file').onchange=()=>{
      const file=find('file').files[0];
      if(!file)return;
      const format=file.type.split(';')[0].trim(),extension=file.name.split('.').pop().toLowerCase();
      const mime=/^audio\//i.test(format)?format:Object.hasOwn(audioTypes,extension)?audioTypes[extension]:'';
      if(!mime||!file.size){
        find('file').value='';
        say('Elegí un archivo de audio, como MP3, WAV, M4A u OGG.','error');
        return;
      }
      recordPlayer.pause();
      if(recordingURL)URL.revokeObjectURL(recordingURL);
      const blob=mime===file.type?file:new File([file],file.name,{type:mime});
      recording={id:newId(),blob,fileName:file.name,createdAt:Date.now()/1000};
      savedUpload=null;uploadName.value=audioName(blob);
      find('upload-fields').hidden=recordPlayer.hidden=false;
      recordingURL=URL.createObjectURL(blob);recordPlayer.src=recordingURL;
      if(!nameInput.value){nameInput.value=uploadName.value;saveLyricsDraft();}
      say('Abriendo el archivo de audio…','working');
      sync();
    };
    recordPlayer.onloadedmetadata=()=>{
      if(!busy&&!song.id)say('Archivo listo. Podés guardarlo en Mis audios.','success');
      sync();
    };
    recordPlayer.onerror=()=>{
      if(recording&&!busy&&!song.id)say('No se pudo reproducir el archivo. Probá con MP3, WAV, M4A u OGG.','error');
      sync();
    };
    uploadName.oninput=uploadKind.onchange=sync;
    find('save-upload').onclick=()=>action('Guardando el audio subido…',()=>saveUpload(uploadRecord()));
    find('transcribe').onclick=()=>action('Preparando la grabación para extraer la letra…',async()=>{
      const status=await connect();
      if(!status.transcription)throw Error('Cerrá y volvé a abrir el iniciador para instalar la extracción de letra.');
      recordPlayer.pause();
      const wav=await recordingForLyrics(recording.blob,tools);
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
      modeInput.value='vocal';lyricsInput.value=data.lyrics;recording.lyrics=data.lyrics;
      const draftSaved=saveLyricsDraft();
      sync();
      say(draftSaved?'Letra extraída y conservada como borrador. Podés guardarla en Mis letras.':'Letra extraída. Tocá Guardar letra para conservarla.','success');
    });
    function editUpload(voice){
      return action('Abriendo el audio subido…',async()=>{
        const entry={...uploadRecord(),saved:uploadIsSaved(),localOnly:true};
        selectAudio(entry,recording.blob);
        await editTrack(entry,{voice});
      });
    }
    find('use-upload').onclick=()=>editUpload(false);
    find('arrange-voice').onclick=()=>editUpload(true);
    find('edit-selected').onclick=()=>action('Abriendo la edición…',()=>editTrack(active));
    find('generate').onclick=()=>action('Preparando el pedido de generación…',async()=>{
      if(song.id||!readyToGenerate(connection))return;
      const style=find('genre').value,lyrics=find('lyrics').value.trim(),instrumental=find('mode').value==='instrumental';
      if(!instrumental&&(!lyrics||lyrics.length>3000))throw Error('Escribí o ajustá la letra a un máximo de 3.000 caracteres para generar.');
      const {desired:duration}=songDuration();
      if(!Number.isInteger(duration)||duration<10||duration>maxSongDuration)throw Error('Elegí una duración entre 10 segundos y 10 minutos.');
      const status=await connect();
      if(!status.installed)throw Error('El iniciador está conectado. Para generar canciones hace falta ACE-Step en la PC.');
      const bpm=chosenBpm(),payload={name:nameInput.value.trim()||'Mi canción',style,caption:genres[style][1],lyrics:instrumental?'':lyrics,
        bpm,rhythm:({100:'slow',122:'medium',132:'fast'})[bpm],duration,voice:find('voice').value,instrumental};
      await song.start(payload,status);
    });
    find('cancel-job').onclick=()=>{
      if(!song.id||busy||!window.confirm('¿Querés cancelar la generación de esta canción?'))return;
      void action('Cancelando la generación…',()=>song.cancel());
    };
    find('save-original').onclick=()=>action('Guardando el audio…',()=>saveOriginal(active,active.name));
    durationInput.onchange=customDuration.oninput=modeInput.onchange=()=>{saveLyricsDraft();sync();};
    bpmInput.onchange=find('genre').onchange=sync;
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
    find('download-launcher').onclick=find('update-launcher').onclick=event=>{
      if(downloadPending||connectionDeadline||busy||song.id){event.preventDefault();return;}
      downloadPending=true;
      const button=event.currentTarget;
      button.setAttribute('aria-disabled','true');
      say(connection?
        'Descarga solicitada. Cerrá el iniciador anterior y abrí el que acabás de descargar.':
        'Descarga solicitada. Cuando termine, abrí INICIAR_SALMOS.bat desde Descargas.','success');
      setTimeout(()=>{downloadPending=false;button.removeAttribute('aria-disabled');},1600);
    };
    find('connect').onclick=waitForInitiator;
    find('refresh').onclick=()=>action('Actualizando tus audios…',async()=>{await refreshLibrary();say('Audios actualizados.','success');});
    find('close').onclick=()=>dialog.close();
    dialog.onclose=()=>{player.pause();recordPlayer.pause();};
    launcher.onclick=()=>{
      pause();dialog.showModal();sync();
      if(song.id){say('Buscando el estado de tu canción…','working');song.resume();}
      else{
        refreshLibrary().catch(error=>say(error.message,'error'));
        readConnection().then(data=>{
          if(updateConnection(data))return refreshLibrary();
          if(!connectionDeadline)waitForInitiator();
        }).catch(()=>{}).finally(sync);
      }
      renderLyrics().catch(()=>{find('lyrics-library').textContent='No se pudieron cargar tus letras. Volvé a abrir el Estudio.';});
    };
    showConnection('Iniciador sin conectar','Conectalo para extraer letra o generar canciones. Podés guardar y editar tus audios subidos desde el navegador.','idle');
    sync();
    return {editTrack};
  }
  window.SalmosAudioStudio={install,createSongJob,isConnectionError,estimateSongDuration,durationText,maxSongDuration,launcherFile,updateForSongs,readyToGenerate,groupSongs,appendLyrics};
})();
