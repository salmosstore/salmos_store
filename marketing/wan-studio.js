/* Generación y revisión de clips desde la escena activa. */
(() => {
  'use strict';
  const cameraMoves={
    push:'Acercamiento suave',pull:'Alejamiento suave',left:'Desplazar a la izquierda',
    right:'Desplazar a la derecha',rise:'Subir encuadre',lower:'Bajar encuadre',detail:'Acercar a la prenda'
  };
  const modelMoves={
    still:['Respiración','La persona conserva su pose y solo respira suavemente.',
      'Extremely subtle natural breathing. Head, hands, mouth and gaze stay steady.',true],
    smile:['Sonrisa leve','Sonrisa chica con la boca cerrada. La mirada queda fija.',
      'Slow, slight closed-mouth smile. Keep the eyes fixed and naturally lit. No head turn or speaking.',true],
    blink:['Parpadeo leve','Un parpadeo natural y breve, con la cabeza quieta.',
      'One brief, soft natural blink. Immediately return to the original gaze. Head and mouth stay still.',false],
    nod:['Asentir suave','Un asentimiento corto y natural.',
      'One small natural nod and return to the original head position. Keep the same gaze and mouth.',false],
    glance:['Mirada breve','Mira un instante a un costado y vuelve.',
      'Very small shift of gaze to one side and back. Keep the original irises, reflections and eyelids.',false],
    sway:['Balanceo mínimo','Un cambio leve de peso sobre los pies.',
      'A tiny relaxed shift of body weight without stepping. Hold the original expression and gaze.',true],
    breeze:['Brisa suave','Un movimiento muy sutil del pelo o del borde de la ropa.',
      'A faint breeze gently stirs the tips of the hair or garment hem. Face and printed design stay steady.',true],
    cloth:['Movimiento de tela','Un pequeño movimiento de la tela, con el producto en su lugar.',
      'Slight natural fabric movement at the hems. Keep the product shape, color and print readable.',false],
    turn:['Giro leve','Gira unos grados los hombros y vuelve a la pose.',
      'A subtle shoulder turn a few degrees and back. Preserve the face, gaze, product and lighting.',true]
  };
  const keyedBackdrops={'#234cff':'electric blue','#ff18d4':'bright magenta','#11d9fa':'bright cyan'};
  const negative='black eyes, black sclera, glossy black irises, glowing pupils, extra catchlights, face distortion, '
    +'misaligned eyes, uncanny stare, mouth deformity, talking, added teeth, extra fingers, unreadable print, '
    +'changing artwork, flickering, background texture, artifacts, camera shake';
  const json=data=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});

  function install({host,helperFetch,notify,capture,preview,use,trim,paintKeyed,sceneNumber,closePreview,purge}){
    host.classList.add('wan-studio');
    host.innerHTML=`<div class="wan-connection">
        <a class="button" data-launcher download="INICIAR_SALMOS.bat">Descargar iniciador</a>
        <button data-connect>Ya abrí el iniciador</button><button data-clips>Mis videos</button>
      </div>
      <div class="wan-choice-row"><h3>Movimiento</h3><div class="wan-types" role="group" aria-label="Tipo de movimiento">
        <button data-type="model" aria-pressed="true">Personas y tela · WanGP</button><button data-type="camera" aria-pressed="false">Cámara · rápido</button>
      </div></div>
      <div class="wan-move-presets" data-presets></div>
      <div class="wan-config"><label data-prompt-box>Qué querés que pase<textarea id="wanPrompt" rows="2" maxlength="1400"></textarea></label>
        <label data-quality-box>Tiempo y detalle<select data-quality><option value="fast">Rápido</option><option value="detail">Más detalle</option></select></label>
        <label class="wan-eye-option" data-eyes-box><input type="checkbox" data-eyes> Estabilizar la mirada</label>
      </div>
      <div class="wan-generate-row">
        <button id="wanGenerate" class="primary" disabled>Generar con WanGP</button><button id="wanCancel" hidden>Cancelar generación</button>
        <span data-origin></span>
      </div>
      <p id="wanState" role="status">Abrí el iniciador para generar.</p><progress id="wanProgress" max="1" hidden></progress>
      <div id="wanClips" class="wan-results"></div>`;
    const find=selector=>host.querySelector(selector),status=find('#wanState'),progress=find('#wanProgress');
    const generate=find('#wanGenerate'),cancel=find('#wanCancel'),context=find('[data-origin]');
    const prompt=find('#wanPrompt'),keepEyes=find('[data-eyes]');
    find('[data-launcher]').href=window.SalmosAudioStudio.launcherFile;
    let mode='model',picked='still',data=null,latestId='',checking=false,busy=false,poll=0,connectingUntil=0,librarySeq=0;
    const asJSON=async(path,options,timeout)=>(await helperFetch('/api/wan'+path,options,timeout)).json();
    const ready=()=>data?.wanApi>=2&&data.setup?.state==='ready'&&(mode==='camera'?data.camera:data.compatible);
    function controls(){
      generate.disabled=busy||!ready()||data?.job?.state==='running';
      generate.textContent=mode==='camera'?'Generar movimiento':'Generar con WanGP';
      cancel.hidden=data?.job?.state!=='running';cancel.disabled=busy;
      progress.hidden=data?.job?.state!=='running';
      find('[data-connect]').disabled=checking||busy;
      for(const input of host.querySelectorAll('[data-type],[data-wan-preset],textarea,[data-quality],[data-eyes]')){
        input.disabled=busy||data?.job?.state==='running';
      }
    }
    function choose(value){
      picked=value;
      for(const button of host.querySelectorAll('[data-wan-preset]')){
        const selected=button.dataset.wanPreset===picked;
        button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
      }
      if(mode==='model'){
        const [,description,,eyes]=modelMoves[value];
        prompt.value=description;keepEyes.checked=eyes;
      }
    }
    function showPresets(){
      const presets=find('[data-presets]');presets.replaceChildren();
      const moves=mode==='camera'?cameraMoves:modelMoves;
      for(const [key,value] of Object.entries(moves)){
        const button=document.createElement('button');button.dataset.wanPreset=key;
        button.textContent=mode==='camera'?value:value[0];button.onclick=()=>choose(key);presets.append(button);
      }
      for(const key of ['prompt','quality','eyes'])find('[data-'+key+'-box]').hidden=mode==='camera';
      choose(mode==='camera'?'push':'still');controls();
    }
    for(const button of host.querySelectorAll('[data-type]'))button.onclick=()=>{
      mode=button.dataset.type;
      for(const choice of host.querySelectorAll('[data-type]'))choice.setAttribute('aria-pressed',String(choice===button));
      showPresets();displayState();
    };
    function displayState(){
      if(!data){
        status.textContent='Abrí el iniciador para generar.';
      }else if(data.wanApi<2||!data.wanApi){
        status.textContent='Descargá el iniciador actualizado y abrilo.';
      }else if(data.setup?.state!=='ready'){
        status.textContent='Esperando a que el iniciador diga SALMOS listo…';
      }else if(data.job){
        status.textContent=data.job.message||'Preparando movimiento…';
        progress.value=data.job.progress||0;
      }else if(!ready()){
        status.textContent=mode==='model'?'WanGP todavía no está disponible en el iniciador.':'FFmpeg todavía no está disponible.';
      }else{
        status.textContent='SALMOS listo.';
      }
      controls();
    }
    function schedule(){
      clearTimeout(poll);
      if(data?.job?.state==='running'||data?.setup?.state==='preparing'||connectingUntil>Date.now()){
        poll=setTimeout(connect,2200);
      }
    }
    async function connect(){
      if(busy||checking)return;
      checking=true;controls();
      try{
        const response=await asJSON('',{},4000),job=response.job;
        data=response;if(data.setup?.state==='ready')connectingUntil=0;
        displayState();
        if(job?.state==='done'&&job.clipId&&latestId!==job.clipId){latestId=job.clipId;void loadClips(true);}
      }catch(error){
        const running=data?.job?.state==='running';
        if(!running)data=null;
        status.textContent=running?'Se interrumpió la consulta. Buscando el video…':
          connectingUntil>Date.now()?'Buscando el iniciador. Dejá su ventana abierta…':'El iniciador no respondió. Abrilo para generar.';
      }finally{checking=false;controls();schedule();}
    }
    find('[data-connect]').onclick=()=>{
      connectingUntil=Date.now()+5*60*1000;
      status.textContent='Buscando el iniciador…';void connect();
    };
    async function poster(clip,holder){
      if(!clip.hasPoster)return;
      try{
        const blob=await (await helperFetch('/api/wan/poster/'+clip.id)).blob();
        const image=await createImageBitmap(blob);
        try{
          if(!holder.isConnected)return;
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          const context=canvas.getContext('2d');
          if(clip.foreground24)paintKeyed(context,image,{x:0,y:0,w:image.width,h:image.height},clip.keyColor||true);
          else context.drawImage(image,0,0);
          holder.replaceChildren(canvas);
        }finally{image.close();}
      }catch{}
    }
    const thumbnails=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){thumbnails.unobserve(entry.target);void poster(entry.target.clip,entry.target);}
    });
    async function loadClips(selectLatest=false){
      const list=find('#wanClips'),seq=++librarySeq;
      try{
        const {clips=[]}=await asJSON('/clips');
        if(seq!==librarySeq)return;
        thumbnails.disconnect();list.replaceChildren();
        let latestCard=null;
        for(const clip of clips){
          const card=document.createElement('article');card.className='wan-result';
          card.dataset.clipId=clip.id;
          const recent=clip.id===latestId;
          if(recent){card.dataset.latest='true';latestCard=card;}
          const photo=document.createElement('button');photo.className='wan-result-poster';
          photo.textContent='▶ Ver video';photo.clip=clip;photo.setAttribute('aria-label','Ver '+clip.name);
          photo.onclick=()=>preview(clip).catch(error=>notify(error.message,'error'));
          const title=document.createElement('input');title.value=clip.name;title.maxLength=100;
          title.setAttribute('aria-label','Nombre del video');
          title.onchange=async()=>{
            try{const edited=await asJSON('/rename',json({id:clip.id,name:title.value}));clip.name=title.value=edited.name;}
            catch(error){title.value=clip.name;notify(error.message,'error');}
          };
          const meta=document.createElement('small');
          meta.textContent=(recent?'Recién generado · ':'')+(clip.sceneTitle||new Date(clip.createdAt*1000).toLocaleString('es-AR'));
          const buttons=document.createElement('div'),apply=document.createElement('button'),cut=document.createElement('button');
          const remove=document.createElement('button');
          buttons.className='wan-result-actions';
          apply.textContent='Usar en escena '+sceneNumber(clip);apply.onclick=()=>use(clip).catch(error=>notify(error.message,'error'));
          cut.textContent='Recortar';cut.onclick=()=>trim(clip).catch(error=>notify(error.message,'error'));
          remove.textContent='×';remove.setAttribute('aria-label','Borrar '+clip.name);
          remove.onclick=async()=>{
            if(!confirm('¿Seguro que querés borrar «'+clip.name+'» de Mis videos?'))return;
            try{await asJSON('/delete',json({id:clip.id}));purge(clip);closePreview();void loadClips();}
            catch(error){notify(error.message,'error');}
          };
          buttons.append(apply,cut,remove);card.append(photo,title,meta,buttons);list.append(card);
          if(clip.hasPoster)thumbnails.observe(photo);
        }
        if(!clips.length)list.textContent='Todavía no hay videos generados.';
        if(selectLatest&&!host.hidden)latestCard?.scrollIntoView({block:'nearest'});
      }catch(error){
        if(seq===librarySeq)list.textContent='No se pudo abrir Mis videos. Comprobá el iniciador.';
      }
    }
    find('[data-clips]').onclick=()=>loadClips();
    generate.onclick=async()=>{
      if(!ready()||busy||data?.job?.state==='running')return;
      busy=true;controls();status.textContent='Preparando la foto de la escena…';
      try{
        const ref=await capture();
        context.textContent=ref.sceneTitle;
        const movement=mode==='camera'?cameraMoves[picked]:modelMoves[picked][0];
        const base=mode==='camera'?'':prompt.value.trim()===modelMoves[picked][1]?modelMoves[picked][2]:prompt.value.trim();
        if(mode==='model'&&base.length<5)throw Error('Describí el movimiento que querés generar.');
        const backdrop=ref.keyColor?' Keep the perfectly uniform '+keyedBackdrops[ref.keyColor]+' background.':' Preserve the original background.';
        const positive=base+' Same identity and eye color, natural pupils and subtle catchlights. Preserve the exact garment and artwork. Fixed framing.'+backdrop;
        data=await asJSON('/generate',json({...ref,name:movement+' · '+ref.sceneTitle,preset:picked,camera:mode==='camera'?picked:'',
          prompt:positive,negative,preserveEyes:mode==='model'&&keepEyes.checked,quality:find('[data-quality]').value}),16000);
        displayState();
        if(data.job?.state==='done'&&data.job.clipId){latestId=data.job.clipId;void loadClips(true);}
      }catch(error){
        if(window.SalmosAudioStudio.isConnectionError(error)){
          data=null;status.textContent='Se interrumpió la conexión. Comprobando el iniciador…';connectingUntil=Date.now()+60000;
        }else status.textContent=error.message;
      }finally{busy=false;controls();schedule();}
    };
    cancel.onclick=async()=>{
      if(!confirm('¿Seguro que querés cancelar la generación del video?'))return;
      busy=true;controls();
      try{data=await asJSON('/cancel',json({id:data.job?.id}));displayState();}
      catch(error){status.textContent=error.message;}
      finally{busy=false;controls();schedule();}
    };
    showPresets();
    return {connect};
  }

  window.SalmosWanStudio={install};
})();
