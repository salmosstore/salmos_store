(() => {
  'use strict';
  const newId=()=>crypto.randomUUID().replaceAll('-','');
  const offline=(channels,length,rate)=>new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(channels,Math.max(1,length),rate);
  const audioTypes={aac:'audio/aac',flac:'audio/flac',m4a:'audio/mp4',mp3:'audio/mpeg',ogg:'audio/ogg',
    opus:'audio/ogg',wav:'audio/wav',webm:'audio/webm',aif:'audio/aiff',aiff:'audio/aiff'};
  const audioName=file=>file.name.replace(/\.[^.]+$/,'').trim().slice(0,100)||'Audio subido';
  const launcherFile='INICIAR_SALMOS.bat?v=27.8';
  const maxSongDuration=600;
  const durationChoices=[10,15,20,30,45,60,90,120,150,180,240,300,360,600];
  const songApiVersion=6;
  const lyricWords=text=>(text||'').replace(/\[[^\]\n]*\]/g,'').match(/[\p{L}\p{N}]+/gu)||[];
  const trackLyrics=track=>track.request?.lyrics||track.lyrics||'';
  const lyricKey=lyrics=>lyricWords(lyrics.normalize('NFC')).join(' ').toLocaleLowerCase('es');
  const canUseBeat=track=>track.uploadKind!=='recording'&&!lyricWords(trackLyrics(track)).length;
  let recentSongId='';

  function generationState(data,{instrumental=false,lyrics='',needsLyrics=false,working=false}={}){
    if(working)return {help:'Preparando tu canción…'};
    if(!data)return {download:true,help:'Después abrilo desde Descargas y dejá su ventana abierta.'};
    if(!(data.songApi>=songApiVersion))return {download:true,help:'Hay un iniciador anterior abierto. Cerralo y abrí la versión actualizada.'};
    if(data.setup?.state!=='ready')return {help:data.setup?.message||'Esperando a que el iniciador indique SALMOS listo…'};
    if(!data.installed)return {help:'El iniciador está abierto. Falta ACE-Step para generar canciones.'};
    if(data.missingCheckpoints?.length)return {help:'Faltan modelos de ACE-Step · '+data.missingCheckpoints.join(', ')};
    if(data.externalBusy)return {help:'Cerrá la ventana aparte de ACE-Step o WanGP para generar desde SALMOS.'};
    if(data.wanBusy)return {help:'Esperando a que termine el movimiento de video…'};
    if(data.job?.state==='running')return {help:'El iniciador ya está generando una canción.'};
    if(needsLyrics&&!instrumental){
      if(!lyricWords(lyrics).length)return {help:'SALMOS listo · Escribí la letra para poder generar.'};
      if(lyrics.length>3000)return {help:'SALMOS listo · La letra puede tener hasta 3.000 caracteres.'};
    }
    const reviewPending=!instrumental&&data.setup.lyricsReady===false;
    return {ready:true,help:reviewPending?'SALMOS listo · Revisión automática de letra pendiente':'SALMOS listo'};
  }

  function monitorInitiator(helperFetch){
    const viewers=new Set(),listeners=new Set();
    let data=null,pending,timer=0,misses=0;
    function check(){
      if(pending)return pending;
      clearTimeout(timer);
      pending=(async()=>{
        try{
          const response=await helperFetch('/api/music',{cache:'no-store'},2800);
          data=await response.json();misses=0;
        }catch{data=null;misses++;}
        finally{
          pending=null;
          if(viewers.size&&!document.hidden){
            timer=setTimeout(check,misses?Math.min(7500,1800*misses):2400);
          }
          for(const listener of listeners)listener(data);
        }
        return data;
      })();
      return pending;
    }
    function watch(viewer,visible){
      if(visible&&!viewers.has(viewer)){viewers.add(viewer);void check();}
      if(!visible&&viewers.delete(viewer)&&!viewers.size){
        clearTimeout(timer);data=null;
      }
    }
    function resume(){if(viewers.size&&!document.hidden)void check();}
    window.addEventListener('focus',resume);
    document.addEventListener('visibilitychange',resume);
    return {get data(){return data;},check,watch,subscribe:listener=>listeners.add(listener)};
  }

  function generationBar(){
    const element=document.createElement('div');element.className='song-generate-bar';
    element.innerHTML=`<div class="song-generate-main">
      <a class="primary button song-main-action" href="${launcherFile}" download="INICIAR_SALMOS.bat">Descargar iniciador</a>
      <button type="button" class="primary song-main-action" hidden></button>
      <button type="button" class="song-cancel" hidden>Cancelar generación</button>
    </div><output class="song-generate-help" aria-live="polite"></output>`;
    const download=element.querySelector('a'),[generate,cancel]=element.querySelectorAll('button');
    const help=element.querySelector('output');
    let downloadedAt=0,updating=false;
    download.onclick=event=>{
      const now=Date.now();
      if(now-downloadedAt<1800){event.preventDefault();return;}
      downloadedAt=now;
      help.textContent=downloadHelp();
    };
    function downloadHelp(){
      return (updating?'Cerrá el iniciador anterior y abrí el nuevo desde Descargas. ':
        'Abrí INICIAR_SALMOS.bat desde Descargas y dejá la ventana abierta. ')+
        'La conexión se comprueba automáticamente.';
    }
    function update(state,{label='Generar canción',job=false,cancelling=false}={}){
      download.hidden=!state.download;
      generate.hidden=!!state.download;
      if(generate.textContent!==label)generate.textContent=label;
      generate.disabled=!state.ready;
      cancel.hidden=!job;cancel.disabled=cancelling;
      updating=state.download&&state.help.includes('anterior');
      const message=downloadedAt&&state.download?downloadHelp():state.help;
      if(help.textContent!==message)help.textContent=message;
      element.dataset.ready=state.ready?'true':'false';
    }
    return {element,generate,cancel,update};
  }

  function groupSongs(tracks){
    const groups=new Map();
    const timestamp=track=>{
      const at=Number(track.createdAt)||0;
      return at>1e11?at/1000:at;
    };
    for(const track of [...tracks].sort((a,b)=>timestamp(b)-timestamp(a)||
      (a.name||'').localeCompare(b.name||'','es',{numeric:true}))){
      const lyrics=trackLyrics(track);
      const key=lyricKey(lyrics);
      const id=key?'lyric:'+key:'audio:'+track.id;
      if(!groups.has(id))groups.set(id,{id,lyrics:key?lyrics:'',tracks:[]});
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
    return box;
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

  function syncSongPlayback(host,playing){
    const highlighted=playing||recentSongId;
    for(const row of host.querySelectorAll('[data-song-id]')){
      const isPlaying=!!playing&&row.dataset.songId===playing;
      const selected=row.dataset.songId===highlighted;
      const marker=row.querySelector('.song-list-state'),button=row.querySelector('[data-song-play]');
      row.dataset.songState=selected?(isPlaying?'playing':'recent'):'';
      marker.hidden=!selected;
      if(selected)marker.textContent=isPlaying?'Reproduciendo':'Recién generada';
      const label=isPlaying?'Ⅱ Pausar':'▶ Escuchar';
      if(button.textContent!==label)button.textContent=label;
    }
  }

  function revealSong(host,id){
    const row=host.querySelector('[data-song-id="'+CSS.escape(id)+'"]');
    if(row?.getClientRects().length)row.scrollIntoView({block:'nearest'});
  }

  function renderSongGallery(host,tracks,{filter,genres,listen,playing,edit,download,variant,empty,busy=false}){
    const expanded=new Set([...host.querySelectorAll('.song-group:has(details[open])')].map(group=>group.dataset.songGroup));
    const fragment=document.createDocumentFragment();
    const groups=groupSongs(tracks).filter(filter.includes);
    for(const group of groups){
      const card=document.createElement('article');
      card.className='song-group';card.dataset.songGroup=group.id;
      if(group.lyrics)appendLyrics(card,group.lyrics).open=expanded.has(group.id);
      for(const track of group.tracks){
        const row=document.createElement('div'),description=document.createElement('div');
        const title=document.createElement('strong'),meta=document.createElement('small'),actions=document.createElement('div');
        const heading=document.createElement('div'),marker=document.createElement('span');
        row.className='song-list-row';row.dataset.songId=track.id;actions.className='song-actions20';
        heading.className='song-list-title';marker.className='song-list-state';marker.hidden=true;
        title.textContent=track.name||'Mi canción';
        const request=track.request||{};
        const origin=track.uploadKind==='song'?'Canción subida':track.uploadKind==='recording'?'Grabación subida':
          request.parentId?'Versión editada':genres[request.style]?.[0]||(group.lyrics?'Canción':'Audio');
        meta.textContent=[origin,request.instrumental?'Instrumental':'',request.reference?'Sobre '+request.reference.name:'',
          track.duration>0?durationText(track.duration):''].filter(Boolean).join(' · ');
        heading.append(title,marker);description.append(heading,meta);
        if(['review','unchecked'].includes(track.lyricsCheck?.status)){
          const review=document.createElement('small');review.className='song-lyric-review';
          review.textContent='Letra por revisar';review.title=lyricsCheckText(track.lyricsCheck);description.append(review);
        }
        for(const [label,action] of [['▶ Escuchar',listen],['Editar',edit],['Descargar',download]]){
          const button=document.createElement('button');button.type='button';button.textContent=label;
          if(action===listen)button.dataset.songPlay='';
          button.onclick=async()=>{
            button.disabled=true;
            try{await action(track);}
            finally{button.disabled=false;}
          };
          actions.append(button);
        }
        songVersionButtons(actions,track,variant);
        for(const button of actions.children)button.disabled=busy;
        row.append(description,actions);card.append(row);
      }
      fragment.append(card);
    }
    host.replaceChildren(fragment);
    syncSongPlayback(host,playing);
    if(!groups.length)host.textContent=tracks.length?'No hay audios con este filtro.':empty;
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
    const buffer=await stereoAudio(blob);
    if(buffer.duration<10||buffer.duration>maxSongDuration)
      throw Error('Elegí un ritmo de entre 10 segundos y 10 minutos.');
    return {reference,wav:tools.waveBlob(buffer),duration:buffer.duration};
  }

  function lyricsCheckText(check){
    if(check?.status==='match')return 'El reconocimiento local detectó las palabras de la letra.';
    if(check?.status==='review'){
      if(check.missing?.includes('dios'))return 'Revisá la pronunciación. El reconocimiento no detectó «Dios».';
      return 'Escuchá la letra antes de usarla. El reconocimiento detectó diferencias.';
    }
    return check?.status==='unchecked'?'Revisión automática pendiente. Escuchá la toma y comparala con tu letra.':'';
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
    if(job?.errorCode==='lyrics_mismatch'){
      const heard=job.lyricsCheck?.heard?.trim();
      return message+(heard?' Se detectó «'+heard.slice(0,160)+(heard.length>160?'…':'')+'».':'');
    }
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
          recentSongId=track.id;
          await completed(track);
          const check=track.lyricsCheck,verdict=check?.status;
          if(verdict==='review'){
            const heard=check.heard?.trim();
            const quote=heard?' El reconocimiento oyó «'+heard.slice(0,160)+(heard.length>160?'…':'')+'».':'';
            finish('Guardé la toma más cercana a tu letra. Escuchala antes de usarla.'+quote,'notice',data);
          }else if(verdict==='unchecked'){
            finish('La toma está disponible. '+lyricsCheckText(check),'notice',data);
          }else{
            finish(verdict==='match'?'Canción lista. Se verificó la letra.':'Canción lista. Podés escucharla y guardarla.','success',data);
          }
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
      const state=generationState(connection,{...payload,needsLyrics:true});
      if(!state.ready)throw Error(state.help);
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
  async function stereoAudio(blob){
    const buffer=await decode(blob);
    if(buffer.numberOfChannels<=2)return buffer;
    const ctx=offline(2,buffer.length,buffer.sampleRate);
    connectSource(ctx,buffer,ctx.destination);
    return ctx.startRendering();
  }
  async function recordingForLyrics(blob,tools){
    const buffer=await decode(blob,16000),ctx=offline(1,buffer.length,16000);
    connectSource(ctx,buffer,ctx.destination);
    return tools.waveBlob(await ctx.startRendering());
  }

  async function trackBlob(track,helperFetch){
    if(track.blob?.size)return track.blob;
    const response=track.src?await fetch(track.src):await helperFetch('/api/music/audio/'+track.id);
    if(!response.ok)throw Error('No se encontró el archivo de audio.');
    const blob=await response.blob();
    if(!blob.size)throw Error('El archivo de audio está vacío.');
    return blob;
  }

  function openSongDownload(track,{helperFetch,tools}){
    const dialog=document.createElement('dialog');dialog.className='song-download';
    const heading=document.createElement('h2'),name=document.createElement('p');
    heading.textContent='Descargar canción';name.textContent=track.name||'Audio SALMOS';
    dialog.setAttribute('aria-label',heading.textContent);
    const options=document.createElement('div'),status=document.createElement('p'),close=document.createElement('button');
    options.className='song-download-options';status.setAttribute('role','status');
    close.textContent='Cancelar';close.onclick=()=>dialog.close();
    let working=false;
    for(const [label,description,mp3] of [['MP3','Archivo más liviano',true],
      ['Mejor calidad','Archivo original',false]]){
      const button=document.createElement('button'),title=document.createElement('strong'),detail=document.createElement('small');
      title.textContent=label;detail.textContent=description;button.append(title,detail);options.append(button);
      button.onclick=async()=>{
        if(working)return;
        working=true;close.disabled=true;
        for(const choice of options.children)choice.disabled=true;
        status.textContent=mp3?'Preparando el MP3…':'Buscando el archivo original…';
        try{
          let blob=await trackBlob(track,helperFetch);
          const originalExt=(track.fileName||blob.name||'').split('.').pop()?.toLowerCase();
          const mime=blob.type.split(';')[0];
          let extension=Object.hasOwn(audioTypes,originalExt)?originalExt:
            Object.keys(audioTypes).find(ext=>audioTypes[ext]===mime)||'wav';
          if(mp3&&extension!=='mp3'){
            const wav=extension==='wav'&&blob.size<=108*1024*1024?blob:
              tools.waveBlob(await stereoAudio(blob));
            const response=await helperFetch('/api/music/mp3',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wav},180000);
            blob=await response.blob();
            extension='mp3';
          }
          const url=URL.createObjectURL(blob),link=document.createElement('a');
          link.href=url;
          link.download=(name.textContent.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().replace(/[ .]+$/g,'')||'Audio SALMOS')+'.'+extension;
          document.body.append(link);link.click();link.remove();
          setTimeout(()=>URL.revokeObjectURL(url),30000);
          dialog.close();
        }catch(error){
          status.textContent=!error.status&&isConnectionError(error)?(mp3?'Abrí el iniciador para preparar el MP3.':
            'Abrí el iniciador para recuperar el archivo original de tu PC.'):error.message;
        }finally{
          working=false;close.disabled=false;
          for(const choice of options.children)choice.disabled=false;
        }
      };
    }
    dialog.oncancel=event=>{if(working)event.preventDefault();};
    dialog.onclose=()=>dialog.remove();
    dialog.append(heading,name,options,status,close);document.body.append(dialog);dialog.showModal();
  }
  function install({host,helperFetch,initiator,dbAction,tools,genres,refreshSongs,hiddenSongs,pause}){
    const dialog=document.createElement('section');dialog.id='audioOnlyStudio';
    dialog.innerHTML=`<div class="song-gallery-heading">
        <button data-upload>Subir audio</button>
        <button data-back-gallery hidden>‹ Volver a canciones</button>
      </div>
      <p data-status role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="audio-studio-body"><section class="audio-create" data-form hidden><h2 data-form-title>Crear canción</h2>
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
        <small id="songDurationHelp" data-duration-help></small></div></section>
        <section class="audio-mix" data-gallery>
        <div class="audio-layer-heading"><div data-filters></div></div>
        <div class="song-gallery-player" data-selection hidden><p data-source-name></p>
        <fieldset data-edit-controls disabled><audio data-player controls preload="metadata"></audio>
        <div class="button-row"><button data-edit-selected>Editar audio</button><button data-save-original>Guardar original</button></div></fieldset></div>
        <div class="song-library" data-library></div></section>
        <section class="audio-saved" data-saved-lyrics><div class="audio-layer-heading"><h2>Mis letras</h2><button type="button" data-new-lyrics>Nueva letra</button></div><div class="audio-lyrics-list" data-lyrics-library></div></section></div>`;
    const bar=generationBar();
    bar.generate.dataset.generate='';
    bar.element.append(dialog.querySelector('[data-status]'));
    dialog.prepend(bar.element);
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
    let visible=false,listed=false,view='gallery',variant=null;
    let libraryEntries=new Map(),savedLyrics=[],remoteTracks=[];
    const songFilter=createSongFilter(()=>renderAudioLibrary(libraryEntries));
    find('filters').append(songFilter.element);
    const song=createSongJob({helperFetch,storageKey:'salmos-active-audio-job',
      report(message,state){
        say(message,state);
        sync();
      },
      async completed(track){
        remoteTracks=[track,...remoteTracks.filter(item=>item.id!==track.id)];
        songFilter.set('all');
        showView('gallery');
        await library();
        if(visible)revealSong(find('library'),track.id);
        refreshSongs().catch(()=>{});
      }});
    async function request(path,options={},timeout){
      try{return await helperFetch('/api/music'+path,options,timeout);}
      catch(error){
        if(isConnectionError(error)){
          if(visible)void initiator.check();
          throw Error('La PC no respondió. Podés guardar y editar tus audios subidos desde el navegador.',{cause:error});
        }
        throw error;
      }
    }
    const api=async(path,options={},timeout)=>(await request(path,options,timeout)).json();
    async function connect(){
      const response=await initiator.check();
      if(response?.audioApi!==2)throw Error('Abrí el iniciador de SALMOS para continuar.');
      if(response.setup?.state!=='ready')throw Error('Esperá a que el iniciador indique SALMOS listo.');
      return response;
    }
    function monitorTranscription(){
      let stopped=false,timer;
      const check=async()=>{
        try{
          const {transcriptionStage}=await initiator.check()||{};
          if(!stopped&&transcriptionStage==='model')say('Grabación recibida. Preparando el modelo de voz en tu PC…','working');
          if(!stopped&&transcriptionStage==='reading')say('Grabación recibida. Extrayendo la letra en tu PC…','working');
        }catch{}finally{if(!stopped)timer=setTimeout(check,2200);}
      };
      if(Object.hasOwn(initiator.data||{},'transcriptionStage'))timer=setTimeout(check,800);
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
      say('');
      (sameBeat?lyricsInput:find('genre')).focus({preventScroll:true});
    }
    function sync(){
      const locked=busy||!!song.id,connection=initiator.data;
      const uploadReady=!!recording&&!recordPlayer.error&&recordPlayer.readyState>=1,uploadSaved=uploadIsSaved();
      const gallery=view==='gallery',generating=view==='generate',sameBeat=!!variant?.sameBeat;
      find('upload').hidden=find('gallery').hidden=find('saved-lyrics').hidden=!gallery;
      find('back-gallery').hidden=gallery;
      find('form').hidden=gallery;
      find('generation-form').hidden=!generating;find('upload-form').hidden=view!=='upload';
      find('form-title').textContent=view==='upload'?'Subir audio':sameBeat?'Agregar letra al ritmo':variant?'Generar con otro estilo':'Crear canción';
      find('reference').hidden=!variant;
      find('reference').textContent=variant?(sameBeat?'Ritmo de referencia · '+variant.track.name+'. La versión cantada se guarda aparte.':'Nueva versión de «'+variant.track.name+'». Cambiá el estilo y generá cuando esté listo.'):'';
      find('upload').disabled=busy;
      find('selection').hidden=!active;
      find('edit-controls').disabled=!active||locked;
      find('file').disabled=locked;find('transcribe').disabled=!uploadReady||locked||connection?.setup?.state==='preparing';
      find('use-upload').disabled=find('arrange-voice').disabled=!uploadReady||locked;
      const instrumental=modeInput.value==='instrumental';find('lyrics-field').hidden=find('voice-field').hidden=instrumental;
      if(generating){
        const after=instrumental?find('duration-help'):find('lyrics-field');
        if(bar.element.previousElementSibling!==after)after.after(bar.element);
      }else if(dialog.firstElementChild!==bar.element)dialog.prepend(bar.element);
      const readiness=generationState(connection,{instrumental:!generating||instrumental,lyrics:lyricsInput.value.trim(),
        needsLyrics:generating,working:locked});
      if(locked)readiness.help='';
      bar.update(readiness,{label:generating&&variant?'Generar versión nueva':'Generar canción',job:!!song.id,cancelling:busy});
      find('save-upload').disabled=!uploadReady||locked||uploadSaved;
      find('save-upload').textContent=uploadSaved?'✓ Guardado en Mis audios':'Guardar en Mis audios';
      for(const el of dialog.querySelectorAll('[data-library] button, .audio-create select, .audio-create textarea, .audio-create input:not([type=file])'))el.disabled=locked;
      if(sameBeat){
        modeInput.disabled=bpmInput.disabled=durationInput.disabled=true;
      }
      for(const el of dialog.querySelectorAll('[data-lyrics-library] button, [data-new-lyrics]'))el.disabled=locked;
      find('save-lyrics').disabled=find('copy-lyrics').disabled=locked||!lyricsInput.value.trim();
      const diskCopy=active?.localOnly&&!active.uploadKind;
      find('save-original').textContent=diskCopy?'Guardar copia en la PC':active?.saved?'✓ Guardado':'Guardar original';
      find('save-original').disabled=!!active?.saved&&!diskCopy;
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
      try{await fn();}catch(e){say(jobMessage(e,initiator.data?.musicReaderVersion),'error');}
      finally{busy=false;sync();}
    }
    function selectAudio(record,blob){
      player.pause();recordPlayer.pause();if(sourceURL)URL.revokeObjectURL(sourceURL);
      active={...record,blob};sourceURL=URL.createObjectURL(blob);player.src=sourceURL;
      find('source-name').textContent=record.name;sync();
    }
    async function loadTrack(t){
      const b=await trackBlob(t,helperFetch);
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
    async function refreshLibrary(){
      remoteTracks=(await api('/tracks')).tracks||[];
      await library();
    }
    function renderAudioLibrary(entries){
      const hidden=hiddenSongs();
      const tracks=[...entries.values()].filter(t=>!hidden.has(t.id));
      renderSongGallery(find('library'),tracks,{filter:songFilter,genres,playing:player.paused?null:active?.id,
        empty:initiator.data?'Todavía no hay audios guardados.':'Abrí el iniciador para ver también los audios guardados en tu PC.',
        busy:busy||!!song.id,
        listen:t=>action('Abriendo el audio…',async()=>{
            if(active?.id===t.id&&!player.paused){player.pause();say('');return;}
            if(active?.id!==t.id)await loadTrack(t);
            await player.play();say('');
        }),
        edit:t=>action('Abriendo el audio…',async()=>{await editTrack(t);say('');}),
        download:track=>openSongDownload(track,{helperFetch,tools}),
        variant:(track,sameBeat)=>action('Abriendo una nueva versión…',()=>openVariant(track,sameBeat))});
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
          if(!(status.songApi>=2))throw Error('Descargá y abrí el iniciador actualizado para exportar MP3.');
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
      if(initiator.data)try{
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
      await library();if(initiator.data)refreshSongs().catch(()=>{});return record;
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
    bar.generate.onclick=()=>{
      if(song.id||busy)return;
      if(view!=='generate'){
        variant=null;showView('generate');say('');
        nameInput.focus();
        return;
      }
      return action('Comprobando el iniciador…',async()=>{
        const status=await initiator.check();
        const style=find('genre').value,lyrics=lyricsInput.value.trim(),instrumental=modeInput.value==='instrumental';
        const readiness=generationState(status,{instrumental,lyrics,needsLyrics:true});
        if(!readiness.ready)throw Error(readiness.help);
        const source=variant?.sameBeat?await prepareReference(variant.track,tools):null;
        const duration=source?.duration||songDuration().desired;
        if(!Number.isFinite(duration)||duration<10||duration>maxSongDuration)throw Error('Elegí una duración entre 10 segundos y 10 minutos.');
        const bpm=chosenBpm(),payload={name:nameInput.value.trim()||'Mi canción',style,caption:genres[style][1],lyrics:instrumental?'':lyrics,
          bpm,rhythm:({100:'slow',122:'medium',132:'fast'})[bpm],duration,voice:find('voice').value,instrumental,versionOf:variant?.track.id};
        await song.start(payload,status,source);
      });
    };
    bar.cancel.onclick=()=>{
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
    function syncAudioPlayback(){
      syncSongPlayback(find('library'),player.paused||player.ended?null:active?.id);
    }
    player.onplaying=()=>{recordPlayer.pause();syncAudioPlayback();};
    player.onpause=player.onended=syncAudioPlayback;
    recordPlayer.onplay=()=>player.pause();
    initiator.subscribe(data=>{
      if(!visible)return;
      sync();
      const available=data?.audioApi===2&&data.setup?.state==='ready';
      if(available&&!listed){
        listed=true;
        refreshLibrary().catch(()=>{listed=false;});
      }else if(!available)listed=false;
      if(song.id&&data)song.resume();
    });
    function deactivate(){
      visible=false;listed=false;initiator.watch('audio',false);
      player.pause();recordPlayer.pause();
    }
    function activate(){
      pause();visible=true;showView('gallery');
      initiator.watch('audio',true);
      if(song.id){say('Buscando el estado de tu canción…','working');song.resume();}
      library().catch(error=>say(error.message,'error'));
      renderLyrics().catch(()=>{find('lyrics-library').textContent='No se pudieron cargar tus letras. Volvé a abrir el Estudio.';});
    }
    sync();
    return {editTrack,activate,deactivate};
  }
  window.SalmosAudioStudio={install,createSongJob,isConnectionError,estimateSongDuration,durationText,
    maxSongDuration,monitorInitiator,generationBar,generationState,createSongFilter,renderSongGallery,
    syncSongPlayback,revealSong,openSongDownload,lyricsCheckText,versionSettings,prepareReference};
})();
