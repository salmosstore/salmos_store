(() => {
  'use strict';
  const newId=()=>crypto.randomUUID().replaceAll('-','');
  const offline=(channels,length,rate)=>new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(channels,Math.max(1,length),rate);
  const audioTypes={aac:'audio/aac',flac:'audio/flac',m4a:'audio/mp4',mp3:'audio/mpeg',ogg:'audio/ogg',
    opus:'audio/ogg',wav:'audio/wav',webm:'audio/webm',aif:'audio/aiff',aiff:'audio/aiff'};
  const audioName=file=>file.name.replace(/\.[^.]+$/,'').trim().slice(0,100)||'Audio subido';
  const launcherFile='INICIAR_SALMOS.bat?v=27.6';
  const maxSongDuration=600;
  const durationChoices=[10,15,20,30,45,60,90,120,150,180,240,300,360,600];
  const updateForSongs='Descargá el iniciador actualizado. Cerrá el anterior y abrí el nuevo.';
  const songApiVersion=3;
  const referenceApiVersion=4;
  const readyToGenerate=data=>!!(data?.songApi>=songApiVersion&&data.installed&&data.setup?.state==='ready');
  const lyricWords=text=>(text||'').replace(/\[[^\]\n]*\]/g,'').match(/[\p{L}\p{N}]+/gu)||[];
  const trackLyrics=track=>track.request?.lyrics||track.lyrics||'';
  const lyricKey=lyrics=>lyricWords(lyrics.normalize('NFC')).join(' ').toLocaleLowerCase('es');
  const canUseBeat=track=>track.uploadKind!=='recording'&&!lyricWords(trackLyrics(track)).length;

  function groupSongs(tracks){
    const groups=new Map();
    for(const track of tracks){
      const lyrics=trackLyrics(track);
      const key=lyricKey(lyrics);
      const id=key?'lyric:'+key:'audio:'+track.id;
      if(!groups.has(id))groups.set(id,{lyrics:key?lyrics:'',tracks:[]});
      groups.get(id).tracks.push(track);
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

  function createSongFilter(change){
    const element=document.createElement('div');
    element.className='song-filter';
    element.setAttribute('role','group');
    element.setAttribute('aria-label','Filtrar canciones por letra');
    let selected='all';
    function set(id){
      if(id===selected)return;
      selected=id;
      for(const item of element.children)item.setAttribute('aria-pressed',String(item.dataset.filter===id));
      change();
    }
    for(const [id,label] of [['all','Todas'],['vocal','Con letra'],['instrumental','Sin letra']]){
      const button=document.createElement('button');
      button.type='button';button.textContent=label;button.setAttribute('aria-pressed',String(selected===id));
      button.dataset.filter=id;button.onclick=()=>set(id);
      element.append(button);
    }
    return {element,set,includes:group=>selected==='all'||(selected==='vocal')===!!group.lyrics};
  }

  function songVersionButtons(host,track,open){
    const choices=[['Generar con otro estilo',false]];
    if(canUseBeat(track))choices.push(['Agregar letra al ritmo',true]);
    for(const [label,sameBeat] of choices){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      button.onclick=()=>open(track,sameBeat);
      host.append(button);
    }
  }

  function versionSettings(track,sameBeat){
    const request=track.request||{},lyrics=trackLyrics(track);
    const name=(track.name||'Mi canción').slice(0,79)+(sameBeat?' · con letra':' · nueva versión');
    return {name,lyrics,style:request.style,voice:request.voice||'auto',instrumental:!sameBeat&&!lyricWords(lyrics).length,
      bpm:request.bpm||null,duration:track.duration};
  }

  async function prepareReference(track,tools){
    const existing=!track.localOnly&&!track.uploadKind&&/^[a-f0-9]{32}$/.test(track.id);
    const reference={id:track.id,name:track.name||'Ritmo',uploaded:!existing};
    if(existing)return {reference,duration:track.duration};
    const blob=track.blob||(track.src&&await (await fetch(track.src)).blob());
    if(!blob)throw Error('El ritmo de referencia ya no está disponible.');
    let buffer=await decode(blob);
    if(buffer.duration<10||buffer.duration>maxSongDuration)
      throw Error('Elegí un ritmo de entre 10 segundos y 10 minutos.');
    if(buffer.numberOfChannels>2){
      const ctx=offline(2,buffer.length,buffer.sampleRate);
      connectSource(ctx,buffer,ctx.destination);
      buffer=await ctx.startRendering();
    }
    return {reference,wav:tools.waveBlob(buffer),duration:buffer.duration};
  }

  function lyricsCheckText(check){
    if(check?.status==='match')return 'El reconocimiento local detectó las palabras de la letra.';
    if(check?.status==='review'){
      if(check.missing?.includes('dios'))return 'Revisá la pronunciación. El reconocimiento no detectó «Dios».';
      return 'Escuchá la letra antes de usarla. El reconocimiento detectó diferencias.';
    }
    return check?.status==='unchecked'?'La letra se envió completa. Podés revisar lo que se cantó desde Editar canción.':'';
  }

  const jsonPost=data=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const reconnecting='Se interrumpió la consulta. La canción puede seguir generándose. Volviendo a conectar…';
  const isConnectionError=error=>error?.name==='TypeError'||error?.name==='AbortError'||
    error?.status===408||error?.status>=500||!!error?.cause&&isConnectionError(error.cause);

  function durationText(seconds){
    const total=Math.max(0,Math.round(Number(seconds)||0)),minutes=Math.floor(total/60),rest=total%60;
    return [minutes&&minutes+' min',(rest||!minutes)&&rest+' s'].filter(Boolean).join(' ');
  }

  function estimateSongDuration(lyrics,bpm,reelDuration=0){
    const words=lyricWords(lyrics).length;
    const reelSeconds=reelDuration>0?Math.min(maxSongDuration,Math.max(10,Math.ceil(reelDuration))):0;
    if(!words)return reelSeconds||60;
    const beat=60/(Number(bpm)||122);
    if(words<=32){
      const seconds=Math.max(10,Math.ceil(words*1.35*beat+3));
      return reelSeconds>=seconds?reelSeconds:seconds;
    }
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
          const review=track.lyricsCheck?.status==='review';
          finish(review?lyricsCheckText(track.lyricsCheck):'Canción lista. Podés escucharla y guardarla.',review?'notice':'success',data);
        }
        retries=0;
      }catch(error){
        if(isConnectionError(error)||error instanceof SyntaxError){
          delay=Math.min(12000,2000*2**Math.min(retries++,3));
          report(reconnecting,'working');
        }else finish(jobMessage(error)||'No se pudo abrir el resultado.','error');
      }finally{checking=false;resume(delay);}
    }
    async function start(payload,connection,source){
      if(id||posting)return;
      if(!(connection?.songApi>=songApiVersion))throw Error(updateForSongs);
      if(!readyToGenerate(connection))throw Error('Esperá a que el iniciador indique SALMOS listo.');
      if(source&&connection.songApi<referenceApiVersion)throw Error(updateForSongs);
      const requestId=newId();
      posting=true;
      try{
        if(source?.wav){
          report('Cargando el ritmo de referencia en tu PC…','working');
          await get('/reference/'+requestId,{method:'POST',headers:{'Content-Type':'audio/wav'},body:source.wav},120000);
        }
        remember(requestId);
        report('Enviando el pedido al iniciador…','working');
        const data=await get('/generate',jsonPost({...payload,reference:source?.reference,requestId}),12000);
        if(data.job?.id!==id)throw new SyntaxError('El iniciador no confirmó el pedido.');
        report('Pedido recibido. Generando tu canción…','working');
      }catch(error){
        if(!id)throw error;
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
  function install({host,helperFetch,dbAction,tools,genres,refreshSongs,hiddenSongs,pause}){
    const dialog=document.createElement('section');dialog.id='audioOnlyStudio';
    dialog.innerHTML=`<div class="song-gallery-heading">
        <div class="button-row" data-gallery-actions><button data-create class="primary">＋ Generar canción</button>
          <button data-upload>Subir audio</button><button data-refresh>Actualizar audios</button></div>
        <button data-back-gallery hidden>‹ Volver a canciones</button>
        <button data-connect-options aria-expanded="false">Conexión del iniciador</button>
        <button data-cancel-job hidden>Cancelar generación</button>
      </div>
      <p data-status role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="audio-studio-body"><div class="audio-connection" data-connection hidden>
        <div role="status"><strong data-connection-title>Iniciador sin conectar</strong><p data-connection-help></p></div>
        <a class="button" href="${launcherFile}" download="INICIAR_SALMOS.bat" data-update-launcher hidden>Descargar iniciador actualizado</a>
        <ol class="audio-launcher-steps" data-launcher-steps>
          <li><a class="button primary" href="${launcherFile}" download="INICIAR_SALMOS.bat" data-download-launcher>Descargar iniciador</a></li>
          <li>Abrí <strong>INICIAR_SALMOS.bat</strong> desde Descargas y dejá su ventana abierta.</li>
          <li><button type="button" data-connect>Ya abrí el iniciador</button></li>
        </ol>
      </div><section class="audio-create" data-form hidden><h2 data-form-title>Crear canción</h2>
        <div class="audio-source-input" data-upload-form hidden><label>Subir grabación o canción<input type="file" accept="audio/*,.ogg,.opus,.m4a,.wav,.mp3,.webm,.aac,.flac" data-file></label>
          <audio data-upload-player controls preload="metadata" hidden></audio>
          <div class="form-grid audio-upload-fields" data-upload-fields hidden>
            <label>Nombre del audio<input data-upload-name maxlength="100"></label>
            <label>Guardar como<select data-upload-kind><option value="recording">Grabación</option><option value="song">Canción</option></select></label>
          </div>
          <div class="button-row"><button type="button" data-save-upload class="primary" disabled>Guardar en Mis audios</button>
          <button type="button" data-use-upload disabled>Editar audio subido</button><button type="button" data-arrange-voice disabled>Mejorar mi voz y acompañarla</button><button type="button" data-transcribe disabled>Extraer letra</button></div></div>
        <div class="audio-generation-fields" data-generation-form>
        <p class="song-reference" data-reference hidden></p>
        <div class="form-grid"><label>Nombre<input data-name maxlength="100" placeholder="Mi canción"></label>
        <label>Tipo<select data-mode><option value="vocal">Con letra</option><option value="instrumental">Instrumental</option></select></label></div>
        <div class="audio-lyrics-editor" data-lyrics-field>
          <label>Letra para cantar<textarea data-lyrics rows="7" placeholder="Escribí la letra o extraela de tu grabación"></textarea></label>
          <div class="button-row"><button type="button" data-save-lyrics>Guardar letra</button><button type="button" data-copy-lyrics>Copiar letra</button></div>
          <label data-lyric-picker hidden>Usar una letra guardada<select data-choose-lyric></select></label>
        </div>
        <div class="form-grid"><label>Estilo<select data-genre></select></label><label>Ritmo<select data-bpm><option value="style">Según el estilo</option><option value="80">Suave · 80 BPM</option><option value="100">Medio · 100 BPM</option><option value="122">Ágil · 122 BPM</option><option value="132">Rápido · 132 BPM</option><option value="155">Muy rápido · 155 BPM</option></select></label>
        <label>Duración<select data-duration aria-describedby="songDurationHelp"><option value="auto">Automática</option>${durationChoices.map(seconds=>`<option value="${seconds}">${durationText(seconds)}</option>`).join('')}<option value="custom">Personalizada</option></select></label>
        <label data-voice-field>Voz<select data-voice><option value="auto">Automática</option><option value="female">Femenina</option><option value="male">Masculina</option></select></label>
        <label data-custom-duration-field hidden>Duración en segundos<input type="number" data-custom-duration min="10" max="${maxSongDuration}" step="1" value="120"></label></div>
        <small id="songDurationHelp" data-duration-help></small>
        <div class="button-row audio-generate-row"><button data-generate class="primary">Generar canción</button></div>
        <p data-generate-help>Conectá el iniciador para generar.</p></div></section>
        <section class="audio-mix" data-gallery>
        <div class="audio-layer-heading"><div data-filters></div></div>
        <div class="song-gallery-player" data-selection hidden><p data-source-name></p>
        <fieldset data-edit-controls disabled><audio data-player controls preload="metadata"></audio>
        <div class="button-row"><button data-edit-selected>Editar audio</button><button data-save-original>Guardar original</button></div></fieldset></div>
        <div data-library></div></section>
        <section class="audio-saved" data-saved-lyrics><div class="audio-layer-heading"><h2>Mis letras</h2><button type="button" data-new-lyrics>Nueva letra</button></div><div class="audio-lyrics-list" data-lyrics-library></div></section></div>`;
    host.append(dialog);
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
    let view='gallery',variant=null,connectionExpanded=false;
    let libraryEntries=new Map(),savedLyrics=[];
    const songFilter=createSongFilter(()=>renderAudioLibrary(libraryEntries));
    find('filters').append(songFilter.element);
    const song=createSongJob({helperFetch,storageKey:'salmos-active-audio-job',
      report(message,state,data){
        if(data?.audioApi===2)updateConnection(data);
        say(message,state);
        sync();
      },
      async completed(track){
        remoteTracks=[track,...remoteTracks.filter(item=>item.id!==track.id)];
        songFilter.set('all');
        showView('gallery');
        await library();
        refreshSongs().catch(()=>{});
      }});
    const startHelp='Si ya lo descargaste, abrilo desde Descargas. Cuando su ventana esté abierta, tocá «Ya abrí el iniciador».';
    function showConnection(title,help,mode){
      find('connection-title').textContent=title;
      find('connection-help').textContent=help;
      find('connection').dataset.state=mode;
      find('launcher-steps').hidden=mode==='online'&&connection?.transcription;
      find('update-launcher').hidden=mode!=='online'||connection?.songApi>=referenceApiVersion;
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
      else if(response.songApi<referenceApiVersion)available.push('Actualizá el iniciador para agregarle letra a un ritmo.');
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
      variant=null;
      nameInput.value=entry?.name||'';
      lyricsInput.value=entry?.text||'';
      modeInput.value='vocal';
      saveLyricsDraft();
      showView('generate');
      lyricsInput.focus({preventScroll:true});
      say(entry?'Letra cargada para editar.':'Ya podés escribir una letra nueva.','success');
      await renderLyrics();
    }
    async function renderLyrics(){
      savedLyrics=await dbAction('assets','readonly',store=>store.getAll(
        IDBKeyRange.bound(lyricsIdPrefix,lyricsIdPrefix+'\uffff')));
      savedLyrics.sort((a,b)=>b.savedAt-a.savedAt);
      const picker=find('choose-lyric');
      picker.replaceChildren(new Option('Elegí una letra…',''));
      for(const entry of savedLyrics)picker.add(new Option(entry.name,entry.id));
      find('lyric-picker').hidden=!savedLyrics.length;
      renderLyricsLibrary();
    }
    function renderLyricsLibrary(){
      const host=find('lyrics-library');
      const hidden=hiddenSongs();
      const linked=new Set([...libraryEntries.values()].filter(track=>!hidden.has(track.id)).map(track=>lyricKey(trackLyrics(track))));
      const rows=savedLyrics.filter(entry=>!linked.has(lyricKey(entry.text)));
      host.replaceChildren();
      for(const entry of rows){
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
      if(!rows.length)host.textContent='Acá aparecen las letras que todavía no tienen canción.';
    }
    const chosenBpm=()=>variant?.sameBeat?variant.track.request?.bpm||null:Number(bpmInput.value)||genres[find('genre').value]?.[2]||122;
    function songDuration(){
      const estimate=estimateSongDuration(modeInput.value==='instrumental'?'':lyricsInput.value,chosenBpm());
      if(variant?.sameBeat)return {estimate,desired:variant.track.duration||estimate};
      return {estimate,desired:durationInput.value==='auto'?estimate:
        Number(durationInput.value==='custom'?customDuration.value:durationInput.value)};
    }
    function showView(next){
      view=next;
      recordPlayer.pause();
      if(next!=='gallery')player.pause();
      if(next==='generate'&&!readyToGenerate(connection))connectionExpanded=true;
      sync();
    }
    async function openVariant(track,sameBeat){
      await storeCurrentLyrics();
      const settings=versionSettings(track,sameBeat);
      variant={track,sameBeat};
      nameInput.value=settings.name;
      lyricsInput.value=settings.lyrics;
      modeInput.value=settings.instrumental?'instrumental':'vocal';
      if(genres[settings.style])find('genre').value=settings.style;
      find('voice').value=settings.voice;
      bpmInput.value='style';durationInput.value='auto';
      showView('generate');
      if(sameBeat&&connection?.songApi<referenceApiVersion){connectionExpanded=true;sync();}
      say('');
      (sameBeat?lyricsInput:find('genre')).focus({preventScroll:true});
    }
    function sync(){
      const locked=busy||!!song.id, preparing=!!connectionDeadline||connection?.setup?.state==='preparing';
      const uploadReady=!!recording&&!recordPlayer.error&&recordPlayer.readyState>=1,uploadSaved=uploadIsSaved();
      const gallery=view==='gallery',generating=view==='generate',sameBeat=!!variant?.sameBeat;
      find('gallery-actions').hidden=find('gallery').hidden=find('saved-lyrics').hidden=!gallery;
      find('back-gallery').hidden=gallery;
      find('form').hidden=gallery;
      find('generation-form').hidden=!generating;find('upload-form').hidden=view!=='upload';
      find('form-title').textContent=view==='upload'?'Subir audio':sameBeat?'Agregar letra al ritmo':variant?'Generar con otro estilo':'Crear canción';
      find('reference').hidden=!variant;
      find('reference').textContent=variant?(sameBeat?'Ritmo de referencia · '+variant.track.name+'. La versión cantada se guarda aparte.':'Nueva versión de «'+variant.track.name+'». Cambiá el estilo y generá cuando esté listo.'):'';
      find('connection').hidden=!connectionExpanded;
      find('connect-options').setAttribute('aria-expanded',String(connectionExpanded));
      find('create').disabled=find('upload').disabled=busy;
      find('selection').hidden=!active;
      find('edit-controls').disabled=!active||locked;
      find('file').disabled=locked;find('transcribe').disabled=!uploadReady||locked||preparing;
      find('use-upload').disabled=find('arrange-voice').disabled=!uploadReady||locked;
      const referenceReady=!sameBeat||connection?.songApi>=referenceApiVersion;
      find('generate').textContent=variant?'Generar versión nueva':'Generar canción';
      find('generate').disabled=locked||preparing||!readyToGenerate(connection)||!referenceReady;
      find('generate-help').textContent=preparing?'Esperando a que el iniciador diga SALMOS listo…':
        !referenceReady&&connection?updateForSongs:readyToGenerate(connection)?'':connection?(connection.songApi>=songApiVersion?'ACE-Step debe estar disponible en tu PC.':'Abrí el iniciador actualizado.'):'Conectá el iniciador para generar.';
      find('generate-help').hidden=!find('generate-help').textContent;
      find('save-upload').disabled=!uploadReady||locked||uploadSaved;
      find('save-upload').textContent=uploadSaved?'✓ Guardado en Mis audios':'Guardar en Mis audios';
      find('cancel-job').hidden=!song.id;find('cancel-job').disabled=busy;
      find('refresh').disabled=locked;find('connect').disabled=busy||!!connectionDeadline;
      find('connect').textContent=connectionDeadline?'Esperando conexión…':find('connection').dataset.state==='offline'?'Reintentar conexión':'Ya abrí el iniciador';
      for(const el of dialog.querySelectorAll('[data-library] button, .audio-create select, .audio-create textarea, .audio-create input:not([type=file])'))el.disabled=locked;
      if(sameBeat){
        modeInput.disabled=bpmInput.disabled=durationInput.disabled=true;
      }
      for(const el of dialog.querySelectorAll('[data-lyrics-library] button, [data-new-lyrics]'))el.disabled=locked;
      find('save-lyrics').disabled=find('copy-lyrics').disabled=locked||!lyricsInput.value.trim();
      const diskCopy=active?.localOnly&&!active.uploadKind;
      find('save-original').textContent=diskCopy?'Guardar copia en la PC':active?.saved?'✓ Guardado':'Guardar original';
      find('save-original').disabled=!!active?.saved&&!diskCopy;
      const instrumental=find('mode').value==='instrumental';find('lyrics-field').hidden=find('voice-field').hidden=instrumental;
      const {estimate,desired}=songDuration(),durationHelp=find('duration-help');
      find('custom-duration-field').hidden=durationInput.value!=='custom';
      const tooShort=!instrumental&&lyricsInput.value.trim()&&desired>=10&&desired<estimate*.75;
      durationHelp.textContent=sameBeat?(variant.track.duration?'Duración del ritmo · '+durationText(variant.track.duration):'Se toma la duración del ritmo original.'):
        durationInput.value==='auto'?'Duración estimada · '+durationText(estimate):
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
      if(seq!==gallerySeq)return;
      libraryEntries=entries;
      renderAudioLibrary(entries);
      renderLyricsLibrary();
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
      for(const group of groupSongs(audios).filter(songFilter.includes)){
        const item=document.createElement('article');item.className='song-group';
        if(group.lyrics)appendLyrics(item,group.lyrics);
        else{
          const title=document.createElement('h3');title.textContent=group.tracks[0].name;item.append(title);
        }
        for(const t of group.tracks){
          const row=document.createElement('div'),text=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');
          const listen=document.createElement('button'),edit=document.createElement('button'),actions=document.createElement('div');
          row.className='song-list-row';
          actions.className='song-actions20';
          title.textContent=t.name;
          detail.textContent=[t.uploadKind==='song'?'Canción subida':t.uploadKind==='recording'?'Grabación subida':
            t.request?.parentId?'Versión editada':t.request?.audioEdit?'Audio guardado':genres[t.request?.style]?.[0]||'Canción generada',
            t.request?.reference?'Sobre '+t.request.reference.name:'',
            t.duration>0?durationText(t.duration):''].filter(Boolean).join(' · ');
          listen.textContent='▶ Escuchar';
          listen.onclick=()=>action('Abriendo el audio…',async()=>{
            if(active?.id===t.id&&!player.paused){player.pause();say('');return;}
            if(active?.id!==t.id)await loadTrack(t);
            await player.play();say('');
          });
          edit.textContent='Editar canción';edit.disabled=busy||!!song.id;
          edit.onclick=()=>action('Abriendo el audio…',async()=>{await editTrack(t);say('');});
          if(group.lyrics)text.append(title);
          text.append(detail);
          if(t.lyricsCheck?.status==='review'){
            const review=document.createElement('small');review.className='song-lyric-review';
            review.textContent=lyricsCheckText(t.lyricsCheck);text.append(review);
          }
          actions.append(listen,edit);
          songVersionButtons(actions,t,(track,sameBeat)=>action('Abriendo una nueva versión…',()=>openVariant(track,sameBeat)));
          row.append(text,actions);item.append(row);
        }
        host.append(item);
      }
      if(!host.childElementCount)host.textContent=audios.length?'No hay audios con este filtro.':connection?
        'Todavía no hay audios guardados.':'Conectá el iniciador para ver los audios guardados en tu PC.';
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
          const lyricsCheck=(source.request?.lyrics||source.lyrics)===lyrics?source.lyricsCheck:null;
          if(source.remote&&!source.localOnly){
            await connect();await api('/lyrics',jsonPost({id:source.id,lyrics}));
          }
          source.lyrics=lyrics;
          source.lyricsCheck=lyricsCheck;
          source.request={...source.request,lyrics};
          const previous=await dbAction('assets','readonly',s=>s.get(source.id));
          if(previous)await put({...previous,lyrics,lyricsCheck,request:source.request});
          else if(source.uploadKind)await saveUpload(source);
          if(active?.id===source.id)Object.assign(active,{lyrics,lyricsCheck,request:source.request});
          const remote=remoteTracks.find(track=>track.id===source.id);
          if(remote)Object.assign(remote,{lyricsCheck,request:{...remote.request,lyrics}});
          await library();await refreshSongs().catch(()=>{});
          return lyricsCheck;
        },
        onCheckLyrics:async lyrics=>{
          const status=await connect();
          if(!status.transcription)throw Error('Abrí el iniciador actualizado para revisar la letra.');
          const normalized=text=>lyricWords(text.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es'));
          const expected=normalized(lyrics);
          if(!expected.length)throw Error('Escribí la letra que querés comparar.');
          const wav=await recordingForLyrics(source.blob,tools);
          let heard='';
          try {
            const result=await api('/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wav},20*60*1000);
            heard=result.lyrics||'';
          } catch(error) {
            if(!error.message.includes('No se distinguieron palabras'))throw error;
          }
          const recognized=normalized(heard);
          return {heard,status:expected.join(' ')===recognized.join(' ')?'match':'review',
            missing:expected.filter(word=>!recognized.includes(word))};
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
      const record={kind:'ai-music19',id:t.id,name:t.name,duration:t.duration,createdAt:t.createdAt||Date.now()/1000,lyricsCheck:t.lyricsCheck,
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
      variant=null;showView('generate');
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
    find('connect-options').onclick=()=>{connectionExpanded=!connectionExpanded;sync();};
    find('create').onclick=()=>{variant=null;showView('generate');};
    find('upload').onclick=()=>showView('upload');
    find('back-gallery').onclick=()=>showView('gallery');
    find('choose-lyric').onchange=()=>action('Cargando la letra…',async()=>{
      const entry=savedLyrics.find(row=>row.id===find('choose-lyric').value);
      if(!entry)return;
      await storeCurrentLyrics();
      lyricsInput.value=entry.text;
      if(!variant)nameInput.value=entry.name;
      saveLyricsDraft();find('choose-lyric').value='';say('Letra cargada.','success');
    });
    find('generate').onclick=()=>action('Preparando el pedido de generación…',async()=>{
      if(song.id||!readyToGenerate(connection))return;
      const style=find('genre').value,lyrics=find('lyrics').value.trim(),instrumental=find('mode').value==='instrumental';
      if(!instrumental&&(!lyrics||lyrics.length>3000))throw Error('Escribí o ajustá la letra a un máximo de 3.000 caracteres para generar.');
      const status=await connect();
      if(!status.installed)throw Error('El iniciador está conectado. Para generar canciones hace falta ACE-Step en la PC.');
      const source=variant?.sameBeat?await prepareReference(variant.track,tools):null;
      const duration=source?.duration||songDuration().desired;
      if(!Number.isFinite(duration)||duration<10||duration>maxSongDuration)throw Error('Elegí una duración entre 10 segundos y 10 minutos.');
      const bpm=chosenBpm(),payload={name:nameInput.value.trim()||'Mi canción',style,caption:genres[style][1],lyrics:instrumental?'':lyrics,
        bpm,rhythm:({100:'slow',122:'medium',132:'fast'})[bpm],duration,voice:find('voice').value,instrumental,versionOf:variant?.track.id};
      await song.start(payload,status,source);
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
    function deactivate(){player.pause();recordPlayer.pause();}
    function activate(){
      pause();connectionExpanded=false;showView('gallery');
      if(song.id){say('Buscando el estado de tu canción…','working');song.resume();}
      else{
        refreshLibrary().catch(error=>say(error.message,'error'));
        readConnection().then(data=>{
          if(updateConnection(data))return refreshLibrary();
          if(!connectionDeadline)waitForInitiator();
        }).catch(()=>{}).finally(sync);
      }
      renderLyrics().catch(()=>{find('lyrics-library').textContent='No se pudieron cargar tus letras. Volvé a abrir el Estudio.';});
    }
    showConnection('Iniciador sin conectar','Conectalo para extraer letra o generar canciones. Podés guardar y editar tus audios subidos desde el navegador.','idle');
    sync();
    return {editTrack,activate,deactivate};
  }
  window.SalmosAudioStudio={install,createSongJob,isConnectionError,estimateSongDuration,durationText,
    maxSongDuration,launcherFile,updateForSongs,songApiVersion,referenceApiVersion,readyToGenerate,groupSongs,appendLyrics,
    createSongFilter,lyricsCheckText,songVersionButtons,versionSettings,prepareReference};
})();
