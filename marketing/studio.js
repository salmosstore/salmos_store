/* SALMOS Estudio de contenido 7.0. Procesamiento local y fondos opcionales de GIPHY. */
(() => {
  'use strict';
  const C=window.SalmosReelsCore,T=window.SalmosEditorTools,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const canvas=$('#preview'),ctx=canvas.getContext('2d'),media=new Map(),history=[],future=[];
  let project,active=0,time=0,playing=false,startClock=0,frameId=0,recording=null,recordStream=null,exporting=false,cancelled=false,toastTimer,autosaveTimer,localReady=false,localHealth=null,drawSequence=0,drag=null;
  let audioCtx,audioDestination,master,musicAudio,voiceAudio,musicNode,voiceNode,videoNodes=new Map();
  const defaultScene=()=>({id:C.uid(),template:'pencil',duration:5,headline:'Tu idea empieza acá.',detail:'creer amar crear',cta:'Descubrí SALMOS',base:null,stamp:null,final:null,video:null,background:null,baseName:'',stampName:'',placement:{x:.31,y:.27,w:.38,rotation:0},bounds:null,rows:18,zoom:1.15,demo:true});
  const newProject=()=>({format:'SALMOS_REELS',version:1,id:C.uid(),title:'Mi primer reel',palette:'pink',ratio:'9:16',font:'Arial',textColor:'#34242f',textSize:48,textPosition:'top',bold:true,italic:false,outline:false,showBrand:false,pencilText:'SALMOS',transition:'fade',logo:null,narration:'En SALMOS, tus ideas toman forma. Conocé nuestros productos y consultanos por las opciones de personalización.',audio:{voiceRate:1,voiceBass:0,voiceTreble:0,music:null,musicName:'',musicVolume:.8,musicStart:0,musicEnd:0,musicLoop:true,voice:null,voiceName:'',voiceVolume:1,voiceOffset:0,duck:true,clipAudio:false},scenes:[{...defaultScene(),...demoAssets()}]});
  function notify(message,kind='info'){clearTimeout(toastTimer);const node=$('#toast');node.textContent=message;node.dataset.kind=kind;node.hidden=false;toastTimer=setTimeout(()=>node.hidden=true,kind==='error'?10000:5000);}
  function current(){return project.scenes[active];}
  function checkpoint(snapshot=project){const copy=structuredClone(snapshot);if(musicTrial)Object.assign(copy.audio,musicTrial);history.push(copy);if(history.length>12)history.shift();future.length=0;syncUndo();}
  function syncUndo(){$('#undo').disabled=!history.length||exporting;$('#redo').disabled=!future.length||exporting;}
  let reelSaveDirty=false;
  const reelLocalWrites=new Map();
  function flushReelAutosave(){
    clearTimeout(autosaveTimer);
    autosaveTimer=null;
    return reelSaveDirty?saveRecord():reelLocalWrites.get(String(project?.id))||Promise.resolve();
  }
  function backgroundReelSave(){
    flushReelAutosave().catch(error=>notify(error.message,'error'));
  }
  function changed(reload=false){
    project.updatedAt=Math.max(Date.now(),Number(project.updatedAt||0)+1);
    reelSaveDirty=true;
    syncReelSaveState();
    clearTimeout(autosaveTimer);
    autosaveTimer=setTimeout(backgroundReelSave,250);
    renderUsedItems();syncSceneScope();
    if(reload)prepareMedia().then(()=>draw()).catch(error=>notify(error.message,'error'));else draw();
    syncTimeline();
  }
  function checkedValue(input){return input.type==='checkbox'?input.checked:['number','range'].includes(input.type)?Number(input.value):input.value;}
  function valueTo(input,value){if(input.type==='checkbox')input.checked=!!value;else input.value=value??'';}
  function syncForm(){const s=current();for(const el of $$('[data-scene]'))if(el.id!=='duration')valueTo(el,s[el.dataset.scene]);syncSceneDuration();for(const el of $$('[data-project]'))valueTo(el,project[el.dataset.project]);for(const el of $$('[data-placement]')){valueTo(el,s.placement?.[el.dataset.placement]);el.disabled=!!s.final;}for(const el of $$('[data-audio]'))valueTo(el,project.audio[el.dataset.audio]);$('#baseName').textContent=s.baseName||(s.base?'Imagen cargada':'Subir imagen');$('#stampName').textContent=s.stampName||(s.stamp?'Estampa cargada':'Subir PNG o WebP');$('#projectName').textContent=project.title;$('#sourceBadge').textContent=s.components?.some(l=>l.production)?'Capas de Producción':s.demo?'Demostración':s.final?'Composición terminada':s.video?'Clip de video':'Tus imágenes';$('#placementHelp').textContent=s.final?'Se conserva la posición de la composición terminada. Para cambiarla, ajustala en Producción o cargá la estampa por separado.':'Podés arrastrar la estampa en la vista previa. Pausá el video y elegí un momento del final.';$('#previewHint').textContent=s.demo?'Ejemplo ilustrado. Cargá tu producto o usá «Crear reel» desde Producción.':s.final&&!s.base?'Producto terminado. Para dibujar la estampa, agregá también su base lisa con el mismo encuadre.':'La vista previa usa tus archivos. Revisá encuadre, texto y estampa antes de exportar.';for(const b of $$('[data-template]'))b.classList.toggle('active',b.dataset.template===s.template);$('#musicName').textContent=project.audio.musicName||'Sin música.';$('#voiceName').textContent=project.audio.voiceName||'Sin narración.';for(const [kind,id] of [['music','musicListen'],['voice','voiceListen']]){const audio=$('#'+id),src=project.audio[kind];audio.hidden=!src;if(src&&audio.getAttribute('src')!==src)audio.src=src;if(!src)audio.removeAttribute('src');}syncTimeline();syncUndo();syncExtraForm();}
  function syncTimeline(){const total=C.totalDuration(project.scenes);time=Math.min(time,total);$('#seek').max=total;$('#seek').value=Math.min(time,total);$('#time').textContent=`${C.formatTime(time)} / ${C.formatTime(total)}`;const list=$('#scenes');list.replaceChildren();project.scenes.forEach((s,i)=>{const b=document.createElement('button');b.className='scene'+(i===active?' active':'');const target=sceneScope==='all'||sceneScope==='selected'&&selectedSceneIds.has(s.id);b.classList.toggle('scope-target',target);if(target)b.title='Incluida en Aplicar en';b.type='button';const name=document.createElement('strong');name.textContent=`${i+1} · ${s.shotTitle||C.templates.find(t=>t.id===s.template)?.name||'Escena'}`;const small=document.createElement('small');small.textContent=`${s.duration} s · ${s.baseName||s.headline||'Producto'}`;b.append(name,small);b.onclick=()=>{pause();cancelEffectTrial();if(i!==active)pendingVisual=null;selectedComponent=null;active=i;time=project.scenes.slice(0,i).reduce((v,s)=>v+s.duration,0)+.8*s.duration;syncForm();draw();};list.append(b);});$('#deleteScene').disabled=project.scenes.length<=1;$('#addScene').disabled=project.scenes.length>=36;}
  function selectSceneAtPreview(){
    const at=C.sceneAt(project.scenes,time);
    if(!at||at.index===active)return;
    cancelEffectTrial();pendingVisual=null;selectedComponent=null;
    active=at.index;syncForm();
  }
  function asset(src,isVideo=false,cache=media){if(!src)return null;if(cache.has(src))return cache.get(src);if(/^data:image\/gif/i.test(src)){const item={complete:false};item._ready=T.gifAsset(src).then(value=>Object.assign(item,value));cache.set(src,item);return item;}let item;if(isVideo){item=document.createElement('video');item.src=src;item.preload='auto';item.playsInline=true;item.muted=true;item.loop=true;item.load();item._ready=new Promise((resolve,reject)=>{if(item.readyState>=2)resolve(item);else{item.addEventListener('loadeddata',()=>resolve(item),{once:true});item.addEventListener('error',()=>reject(new Error('No se pudo abrir un clip de video. Probá con MP4 H.264 o WebM.')),{once:true});}});}else{item=new Image();item.src=src;item._ready=item.decode().then(()=>item).catch(()=>{throw new Error('No se pudo abrir una imagen. Usá PNG, JPG o WebP.');});}cache.set(src,item);return item;}
  async function prepareMedia(){await prepareGiphyBackgrounds();const jobs=[];for(const s of project.scenes)for(const key of ['base','stamp','final','background','video','back'])if(s[key])jobs.push(asset(s[key],key==='video'||key==='background'&&isVideoSource(s[key]))._ready);if(project.logo)jobs.push(asset(project.logo)._ready);await Promise.all(jobs);await prepareComponents();await setupAudioElements();}
  function fitRect(img,x,y,w,h){const iw=img.videoWidth||img.naturalWidth||img.width,ih=img.videoHeight||img.naturalHeight||img.height;const scale=Math.min(w/iw,h/ih);return{x:x+(w-iw*scale)/2,y:y+(h-ih*scale)/2,w:iw*scale,h:ih*scale};}
  function drawFit(c,img,r){c.drawImage(img,r.x,r.y,r.w,r.h);}
  function roundRect(c,x,y,w,h,r=12){c.beginPath();c.roundRect(x,y,w,h,r);}
  function demoProduct(c,r){c.save();const x=r.x+r.w*.12,y=r.y+r.h*.09,w=r.w*.76,h=r.h*.82;c.shadowColor='#0005';c.shadowBlur=24;c.fillStyle='#efeae0';c.beginPath();c.moveTo(x+w*.28,y);c.lineTo(x+w*.08,y+h*.08);c.lineTo(x-w*.13,y+h*.27);c.lineTo(x+w*.02,y+h*.39);c.lineTo(x+w*.13,y+h*.29);c.lineTo(x+w*.13,y+h);c.quadraticCurveTo(x+w*.5,y+h*1.02,x+w*.87,y+h);c.lineTo(x+w*.87,y+h*.29);c.lineTo(x+w*.98,y+h*.39);c.lineTo(x+w*1.13,y+h*.27);c.lineTo(x+w*.92,y+h*.08);c.lineTo(x+w*.72,y);c.quadraticCurveTo(x+w*.5,y+h*.16,x+w*.28,y);c.closePath();c.fill();c.shadowBlur=0;c.strokeStyle='#d4cdbf';c.lineWidth=2;c.stroke();c.beginPath();c.moveTo(x+w*.28,y);c.quadraticCurveTo(x+w*.5,y+h*.19,x+w*.72,y);c.stroke();c.restore();return{x,y,w,h};}
  function demoStamp(c,b){c.save();c.textAlign='center';c.fillStyle='#b58c38';c.font='bold 45px Georgia';c.fillText('CREER',b.x+b.w/2,b.y+b.h*.35);c.font='26px Georgia';c.fillText('AMAR · CREAR',b.x+b.w/2,b.y+b.h*.48);c.strokeStyle='#b58c38';c.lineWidth=2;c.beginPath();c.moveTo(b.x+b.w*.2,b.y+b.h*.6);c.lineTo(b.x+b.w*.8,b.y+b.h*.6);c.stroke();c.restore();}
  let lastGeometry=null;
  function revealPath(c,b,p,rows){if(p>=1){c.rect(b.x-4,b.y-4,b.w+8,b.h+8);return;}const pos=C.pencilPoint(p,b,rows),rh=b.h/rows;if(pos.row>0)c.rect(b.x-2,b.y-2,b.w+4,rh*pos.row+3);const width=b.w*pos.fraction,x=pos.row%2?b.x+b.w-width:b.x;c.rect(x-2,b.y+pos.row*rh-2,width+4,rh+4);}
  function drawPencil(c,x,y,label,brush=false){c.save();c.translate(x,y);c.rotate(-.55);c.shadowColor='#0003';c.shadowBlur=8;c.fillStyle=brush?'#8f416b':'#e2b44e';roundRect(c,-193,-15,165,30,7);c.fill();c.shadowBlur=0;c.fillStyle=brush?'#b7adb2':'#d5b998';c.beginPath();c.moveTo(-28,-15);c.lineTo(0,0);c.lineTo(-28,15);c.closePath();c.fill();c.fillStyle=brush?'#5b303d':'#232126';c.beginPath();c.moveTo(-10,-5);c.lineTo(0,0);c.lineTo(-10,5);c.closePath();c.fill();c.fillStyle='#fff4fb';roundRect(c,-205,-15,15,30,5);c.fill();c.fillStyle=brush?'#fff0f7':'#382617';c.font='bold 18px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText('SALMOS',-110,1,130);c.restore();}
  function wrapText(c,text,width){const words=String(text||'').split(/\s+/),lines=[];let line='';for(const word of words){const t=line?line+' '+word:word;if(line&&c.measureText(t).width>width){lines.push(line);line=word;}else line=t;}if(line)lines.push(line);return lines;}
  function paintText(c,text,x,y,width,size,color,maxLines=3){if(!text)return 0;let lines;for(let n=size;n>=12;n--){c.font=`${project.italic?'italic ':''}${project.bold?'bold ':''}${n}px "${project.font}", Arial`;lines=wrapText(c,text,width);if(lines.length<=maxLines&&lines.every(l=>c.measureText(l).width<=width)){size=n;break;}}c.fillStyle=color;c.textAlign='center';c.textBaseline='top';for(let i=0;i<lines.length;i++){if(project.outline){c.strokeStyle='#151515';c.lineWidth=4;c.lineJoin='round';c.strokeText(lines[i],x,y+i*size*1.15);}c.fillText(lines[i],x,y+i*size*1.15);}return lines.length*size*1.15;}
  function sceneImage(s){return s.video?asset(s.video,true):s.base?asset(s.base):s.final?asset(s.final):null;}
  function dimensions(width=720,ratio=project.ratio){const [rw,rh]=ratio.split(':').map(Number);return{w:width,h:Math.round(width*rh/rw/2)*2};}
  function draw(){if(!project)return;const d=dimensions(exporting?canvas.width:720);if(canvas.width!==d.w||canvas.height!==d.h){canvas.width=d.w;canvas.height=d.h;}const at=C.sceneAt(project.scenes,time);if(!at)return;ctx.clearRect(0,0,d.w,d.h);paintScene(ctx,exporting?at.scene:previewScene(at.scene),at.progress,d.w,d.h,!exporting&&$('#guides').checked);if(at.index>0&&at.local<(project.transitionDuration||1.1)&&project.transition!=='cut'){const alpha=1-C.ease(at.local/(project.transitionDuration||1.1));if(project.transition==='white'){ctx.fillStyle=`rgba(255,255,255,${alpha})`;ctx.fillRect(0,0,d.w,d.h);}else{ctx.save();ctx.globalAlpha=alpha;paintScene(ctx,project.scenes[at.index-1],1,d.w,d.h,false);ctx.restore();}}$('#seek').value=time;$('#time').textContent=`${C.formatTime(time)} / ${C.formatTime(C.totalDuration(project.scenes))}`;}
  async function setupAudioElements(){for(const kind of ['music','voice']){const src=project.audio[kind],previous=kind==='music'?musicAudio:voiceAudio;if(previous?.getAttribute('src')===src)continue;if(previous){previous.pause();const old=kind==='music'?musicNode:voiceNode;old?.source.disconnect();old?.gain.disconnect();old?.bass?.disconnect();old?.treble?.disconnect();}if(!src){if(kind==='music')musicAudio=null;else voiceAudio=null;continue;}const a=new Audio(src);a.preload='auto';if(kind==='music'){
          musicAudio=a;musicNode=null;
          for(const event of ['playing','pause','ended'])a.addEventListener(event,refreshMusicPlayback15);
        }else{voiceAudio=a;voiceNode=null;}await new Promise((resolve,reject)=>{a.onended=()=>{a._knownDuration=a.currentTime;};if(a.readyState>=1)resolve();else{a.addEventListener('loadedmetadata',resolve,{once:true});a.addEventListener('error',()=>reject(new Error('Ese audio no pudo abrirse. Probá con MP3 o WAV.')),{once:true});}});}}
  function connectAudio(){if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();audioDestination=audioCtx.createMediaStreamDestination();master=audioCtx.createDynamicsCompressor();master.threshold.value=-8;master.knee.value=8;master.ratio.value=4;master.connect(audioDestination);master.connect(audioCtx.destination);}if(musicAudio&&!musicNode){const source=audioCtx.createMediaElementSource(musicAudio),gain=audioCtx.createGain();source.connect(gain);gain.connect(master);musicNode={source,gain};}if(voiceAudio&&!voiceNode){const source=audioCtx.createMediaElementSource(voiceAudio),gain=audioCtx.createGain(),bass=audioCtx.createBiquadFilter(),treble=audioCtx.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=180;treble.type='highshelf';treble.frequency.value=2800;source.connect(bass);bass.connect(treble);treble.connect(gain);gain.connect(master);voiceNode={source,gain,bass,treble};}for(const s of project.scenes)if(s.video){const video=asset(s.video,true);if(!videoNodes.has(video)){const source=audioCtx.createMediaElementSource(video),gain=audioCtx.createGain();source.connect(gain);gain.connect(master);videoNodes.set(video,{source,gain});}}return audioCtx.resume();}
  function commitVoiceSettings18(){const input=$('#voiceOffset');if(!input||input.value==='')return;const value=Number(input.value);if(Number.isFinite(value))project.audio.voiceOffset=C.clamp(value,0,360);}
  function syncOneAudio(audio,position,enabled){if(!audio)return;if(!enabled){audio.pause();return;}if(Number.isFinite(audio.duration)&&audio.duration>0){position=C.clamp(position,0,Math.max(0,audio.duration-.03));}if(Math.abs(audio.currentTime-position)>.25)audio.currentTime=position;if(audio.paused)audio.play().catch(()=>{});}
  function syncSound(){const a=project.audio,total=C.totalDuration(project.scenes),voicePosition=(time-C.clamp(a.voiceOffset??0,0,360))*C.clamp(a.voiceRate??1,.6,1.6),voiceActive=!!voiceAudio&&voicePosition>=0&&(voicePosition<(Number.isFinite(voiceAudio.duration)?voiceAudio.duration:(voiceAudio._knownDuration||Infinity))),fade=Math.min(1,time/.3,(total-time)/.5);if(musicAudio){const musicPosition=time*C.clamp(a.musicRate??1,.5,1.75);musicAudio.playbackRate=C.clamp(a.musicRate??1,.5,1.75);musicAudio.preservesPitch=true;const duration=Number.isFinite(musicAudio.duration)?musicAudio.duration:0,start=C.clamp(a.musicStart,0,Math.max(0,duration-.05)),end=a.musicEnd>start?Math.min(a.musicEnd,duration):duration,length=Math.max(.05,end-start),enabled=a.musicLoop||musicPosition<length;syncOneAudio(musicAudio,start+(a.musicLoop?musicPosition%length:musicPosition),enabled);if(musicNode)musicNode.gain.gain.setTargetAtTime(a.musicVolume*(a.duck&&voiceActive?.6:1)*Math.max(0,fade)*musicSceneEnvelope12(time),audioCtx.currentTime,.03);}if(voiceAudio){voiceAudio.playbackRate=C.clamp(a.voiceRate??1,.6,1.6);voiceAudio.preservesPitch=true;}if(voiceNode){voiceNode.bass.gain.value=C.clamp(a.voiceBass??0,-12,12);voiceNode.treble.gain.value=C.clamp(a.voiceTreble??0,-12,12);}syncOneAudio(voiceAudio,Math.max(0,voicePosition),voiceActive);if(voiceNode)voiceNode.gain.gain.setTargetAtTime((voiceActive?a.voiceVolume:0)*Math.max(0,fade),audioCtx.currentTime,.03);const at=C.sceneAt(project.scenes,time);for(const s of project.scenes)if(s.video){const v=asset(s.video,true),isActive=s===at?.scene;if(isActive){v.muted=!a.clipAudio;const trimStart=s.videoTrimStart||0,trimEnd=s.videoTrimEnd||v.duration,pos=s.videoTrimEnd?trimStart+Math.min(at.local,Math.max(0,trimEnd-trimStart-.03)):at.local%v.duration;if(Number.isFinite(v.duration)&&v.duration>0&&Math.abs(v.currentTime-pos)>.08)v.currentTime=pos;if(s.videoTrimEnd&&at.local>=Math.max(0,(s.videoTrimEnd-(s.videoTrimStart||0))))v.pause();else if(v.paused)v.play().catch(()=>{});}else v.pause();const node=videoNodes.get(v);if(node)node.gain.gain.value=isActive&&a.clipAudio?1:0;}for(const s of project.scenes)if(isVideoSource(s.background)){const v=asset(s.background,true),isActive=s===at?.scene;v.muted=true;if(isActive){if(Number.isFinite(v.duration)&&v.duration>0&&Math.abs(v.currentTime-at.local%v.duration)>.25)v.currentTime=at.local%v.duration;if(v.paused)v.play().catch(()=>{});}else v.pause();}}
  function stopSound(){$$('audio').forEach(a=>a.pause());musicAudio?.pause();voiceAudio?.pause();for(const value of media.values())if(value instanceof HTMLVideoElement)value.pause();}
  function refreshMusicPlayback15(){
    for(const button of $$('[data-music-track]')){
      const active=playing&&button.dataset.musicTrack===selectedMusic10?.id;
      button.textContent=(active?'Ⅱ ':'▶ ')+button.dataset.musicTrackName;
      button.setAttribute('aria-label',(active?'Pausar ':'Reproducir ')+button.dataset.musicTrackName);
    }
    const gallery=$('#aiMusicTracks19');
    if(gallery)window.SalmosAudioStudio.syncSongPlayback(gallery,playingReelSong());
  }
  async function play(){if(playing||exporting)return;commitVoiceSettings18();try{$$('audio').forEach(a=>a.pause());await prepareMedia();await connectAudio();if(time>=C.totalDuration(project.scenes)-.03)time=0;playing=true;refreshMusicPlayback15();startClock=performance.now()-time*1000;$('#play').textContent='❚❚ Pausar';tick();}catch(e){notify(e.message,'error');}}
  function pause(){for(const b of $$('[data-listen]'))b.textContent='▶';playing=false;refreshMusicPlayback15();cancelAnimationFrame(frameId);$('#play').textContent='▶ Ver reel';stopSound();}
  function tick(){if(!playing)return;time=(performance.now()-startClock)/1000;const total=C.totalDuration(project.scenes);
    if(effectTrial){
      const end=project.scenes.slice(0,active+1).reduce((n,scene)=>n+scene.duration,0);
      if(time>=end){time=Math.max(0,end-.001);pause();draw();return;}
    }
    if(time>=total){time=total;pause();selectSceneAtPreview();draw();return;}syncSound();draw();frameId=requestAnimationFrame(tick);}
  async function fileData(file,kind='image'){if(!file)throw new Error('Elegí un archivo.');const max=kind==='video'?80:kind==='audio'?40:24;if(file.size>max*1024*1024)throw new Error(`El archivo supera ${max} MB. Usá uno más liviano para este editor.`);if(kind==='image'&&!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('Usá PNG, JPG, WebP o GIF; para un fondo animado también podés cargar MP4.');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('No se pudo leer el archivo.'));reader.readAsDataURL(file);});}
  async function setFile(file,kind){pause();const video=kind==='video'||kind==='background'&&file?.type.startsWith('video/');const data=await fileData(file,video?'video':'image');await asset(data,video)._ready;checkpoint();const s=current();s[kind]=data;if(kind!=='background')s.demo=false;if(kind==='background'){s.bgMotion='';delete s.giphy;}if(kind==='stamp'){await addPrint(data,file.name);s.stamp=null;syncForm();return;}if(['base','stamp','final'].includes(kind))s.video=null;if(kind==='base'){s.components=[];s.baseName=file.name;s.final=null;s.bounds=null;}if(kind==='stamp'){s.stampName=file.name;s.final=null;s.bounds=null;}if(kind==='final'){s.components=[];s.stamp=null;s.base=null;s.bounds=null;s.baseName=file.name;s.template='clean';editingStamp=false;}if(kind==='video'){s.components=[];editingStamp=false;s.template='clean';s.base=null;s.stamp=null;s.final=null;s.bounds=null;s.baseName=file.name;}syncForm();changed();}
  async function setAudio(file,kind){await cancelMusicTrial();pause();const src=await fileData(file,'audio');checkpoint();project.audio[kind]=src;project.audio[kind+'Name']=file.name;if(kind==='music'){delete project.audio.musicCredit;delete project.audio.musicAssetId;}await setupAudioElements();syncForm();changed();}
  function blobData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}
  let lastExportURL=null;
  async function showExportDownload(blob,name){if(lastExportURL)URL.revokeObjectURL(lastExportURL);lastExportURL=URL.createObjectURL(blob);let link=$('#lastExport');if(!link){link=document.createElement('a');link.id='lastExport';link.className='button primary';link.style.margin='6px 0';$('#previewHint').before(link);}link.href=lastExportURL;link.download=name;link.textContent='↓ Descargar último video';try{await dbAction('exports','readwrite',s=>s.put({id:project.id,blob,name,updatedAt:Date.now()}));await saveRecord();}catch(e){notify('El video está listo para descargar; no se pudo conservar una copia local.','error');}if(shareAfterExport){shareAfterExport=false;shareVideoDialog(blob,name);}else link.click(); }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  const filename=()=>String(project.title||'SALMOS-reel').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,70);
  async function poster(final=false){if(final)return productFrame();pause();await prepareMedia();const previous=time,oldEdit=editingStamp;editingStamp=false;if(final){const at=C.sceneAt(project.scenes,time);time=at.start+at.scene.duration*.95;}draw();await new Promise(resolve=>canvas.toBlob(blob=>{if(blob)download(blob,filename()+(final?'-para-IA':'-imagen')+'.png');resolve();},'image/png'));time=previous;editingStamp=oldEdit;draw();}
  const REEL_DATABASE='salmos-reels-v1';
  const REEL_STORES=['projects','posts','exports','assets'];
  let checkedBrowserDrafts=false;
  function openReelDatabase(version){return new Promise((resolve,reject)=>{
    const request=version?indexedDB.open(REEL_DATABASE,version):indexedDB.open(REEL_DATABASE);
    let blocked=false;
    request.onupgradeneeded=()=>{
      for(const name of REEL_STORES){
        if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});
      }
    };
    request.onblocked=()=>{
      blocked=true;
      reject(new Error('Cerrá otras pestañas de Marketing y reels y volvé a buscar los borradores.'));
    };
    request.onsuccess=()=>{
      const database=request.result;
      if(blocked){database.close();return;}
      database.onversionchange=()=>database.close();
      resolve(database);
    };
    request.onerror=()=>reject(request.error);
  });}
  async function db(){
    const database=await openReelDatabase();
    if(REEL_STORES.every(name=>database.objectStoreNames.contains(name)))return database;
    const next=Math.max(3,database.version+1);
    database.close();
    return openReelDatabase(next);
  }
  async function dbAction(store,mode,action){
    const database=await db();
    return new Promise((resolve,reject)=>{
      try{
        const tx=database.transaction(store,mode),request=action(tx.objectStore(store));
        tx.oncomplete=()=>{database.close();resolve(request?.result);};
        tx.onabort=()=>{database.close();reject(tx.error||new Error('No se pudo completar el acceso a los reels guardados.'));};
      }catch(error){database.close();reject(error);}
    });
  }
  async function saveRecord(id=project.id){
    const source=project,key=String(id);
    const copy=structuredClone(source),updatedAt=source.updatedAt;
    restoreEffectFields(copy);
    if(musicTrial)Object.assign(copy.audio,musicTrial);
    try{copy.cover=projectCover(copy);}catch{delete copy.cover;}
    source._reelWriter??=C.uid();
    const snapshot={...copy,id:key,originalId:key,savedAt:Math.max(Date.now(),Number(source.savedAt||0)+1),
      _reelRevision:C.uid(),_reelWriter:source._reelWriter,_reelBackupBase:reelBaseRevision(source)};
    if(project===source)reelSaveDirty=false;
    const earlier=reelLocalWrites.get(key);
    const write=(async()=>{
      if(earlier)await earlier.catch(()=>{});
      await dbAction('projects','readwrite',store=>store.put(snapshot));
      if(project===source){
        source.savedAt=snapshot.savedAt;
        source._reelRevision=snapshot._reelRevision;
      }
      queueReelBackup(snapshot);
      return snapshot;
    })();
    reelLocalWrites.set(key,write);
    syncReelSaveState();
    try{return await write;}
    catch{
      if(project===source&&source.updatedAt===updatedAt)reelSaveDirty=true;
      throw new Error('El navegador no pudo guardar el reel. Dejalo abierto y volvé a guardar.');
    }finally{
      if(reelLocalWrites.get(key)===write)reelLocalWrites.delete(key);
      syncReelSaveState();
    }
  }
  const reelCloudEnabled=parent!==window;
  const reelBackupQueue=new Map(),reelBackupErrors=new Map(),reelCloudRows=new Map();
  let reelBackupTimer,reelBackupWork=null,reelCloudError=null;
  const reelID=record=>String(record.originalId??record.id);
  const reelDraftPath=(id='',suffix='')=>'/api/admin/reel-drafts'+(id?'/'+encodeURIComponent(id):'')+suffix;
  function reelBackupReceipt(id){
    try{return JSON.parse(localStorage.getItem('salmos_reel_receipt_'+id)||'null');}catch{return null;}
  }
  function reelBaseRevision(record,receipt=reelBackupReceipt(reelID(record))){
    const current=reelCloudRows.get(reelID(record));
    if(current?.revision&&current.revision===record._reelRevision)return current.revision;
    if(receipt&&(receipt.revision===record._reelRevision||
      !record._reelRevision&&receipt.savedAt===record.savedAt||
      receipt.writer&&receipt.writer===record._reelWriter))return receipt.revision;
    return record._reelBackupBase||'';
  }
  function setReelBackupReceipt(item,writer){
    const previous=reelBackupReceipt(String(item.id));
    reelCloudRows.set(String(item.id),item);
    const snapshot={revision:item.revision,savedAt:item.savedAt,writer:writer||(previous?.revision===item.revision?previous.writer:'')};
    try{localStorage.setItem('salmos_reel_receipt_'+item.id,JSON.stringify(snapshot));}catch{}
  }
  function syncReelSaveState(){
    const status=$('#reelSaveState'),retry=$('#reelRetryBackup');if(!status||!project)return;
    const id=String(project.id),error=reelBackupErrors.get(id),queued=reelBackupQueue.has(id),working=reelBackupWork?.id===id,m= reelCloudRows.get(id)||reelBackupReceipt(id);
    status.textContent=reelSaveDirty?'Cambios por guardar':reelLocalWrites.has(id)?'Guardando reel…':
      error?.status===409?'Hay dos versiones de este reel':error||queued&&!navigator.onLine?'Guardado acá · copia pendiente':
      working||queued?'Guardado acá · respaldando…':m?.revision===project._reelRevision&&m?.revision?'Respaldo en SALMOS al día':
      project.savedAt?'Guardado en este navegador':'';
    if(retry)retry.hidden=!reelCloudEnabled||!error||error.status===409;
  }
  async function reelCloudRequest(path,{method='GET',body,timeout=35000,raw=false}={}){
    const target=new URL(path,parent.SALMOS_CONFIG?.API_BASE_URL||location.origin);
    const headers=body instanceof Blob?{'Content-Type':'application/octet-stream'}:body?{'Content-Type':'application/json'}:{};
    const response=await fetch(target,{method,headers,body:body instanceof Blob?body:body?JSON.stringify(body):undefined,
      credentials:'include',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(timeout)});
    if(response.type==='opaqueredirect'||response.status===401||response.status===403)throw new Error('Volvé a iniciar sesión en SALMOS para respaldar el reel.');
    if(!response.ok){
      const data=await response.json().catch(()=>null),error=new Error(data?.error||'No se pudo acceder al respaldo del reel.');
      error.status=response.status;throw error;
    }
    return raw?response:response.status===204?null:await response.json();
  }
  function queueReelBackup(record){
    const id=reelID(record);
    if(!reelCloudEnabled||!/^[A-Za-z0-9_-]{1,128}$/.test(id))return;
    const receipt=reelBackupReceipt(id);
    if(record._reelRevision&&(reelCloudRows.get(id)?.revision===record._reelRevision||receipt?.revision===record._reelRevision))return;
    const pending=reelBackupQueue.get(id);
    if(pending&&pending.savedAt>=record.savedAt)return;
    const next={...record,id,originalId:id,_reelRevision:record._reelRevision||C.uid()};
    reelBackupQueue.set(id,next);
    if(reelBackupErrors.get(id)?.status!==409)reelBackupErrors.delete(id);
    clearTimeout(reelBackupTimer);reelBackupTimer=setTimeout(flushReelBackups,1500);
    syncReelSaveState();
  }
  async function uploadReelBackup(record){
    const id=reelID(record),current=reelCloudRows.get(id);
    const revision=record._reelRevision,baseRevision=reelBaseRevision(record);
    if(current?.revision===revision)return current;
    if(current&&current.revision!==baseRevision){
      const error=new Error('Hay dos versiones de este reel. Podés abrir ambas desde Proyectos.');
      error.status=409;throw error;
    }
    const json=new Blob([JSON.stringify(record)],{type:'application/json'});
    const gz=typeof CompressionStream==='function';
    const file=gz?await new Response(json.stream().pipeThrough(new CompressionStream('gzip'))).blob():json;
    const path=reelDraftPath(id,'/backup');
    const start=await reelCloudRequest(path,{method:'POST',body:{revision,baseRevision,encoding:gz?'gzip':'json',size:file.size,
      title:record.title,sceneCount:record.scenes.length,duration:C.totalDuration(record.scenes),savedAt:record.savedAt}});
    if(start.item)return start.item;
    const parts=[];
    if(!start.readyToComplete){
      if(!(start.partSize>0))throw new Error('El servidor todavía no confirmó el respaldo.');
      for(let offset=0;offset<file.size;offset+=start.partSize){
        const part=await reelCloudRequest(path+'/'+revision+'/'+(parts.length+1),{method:'PUT',body:file.slice(offset,offset+start.partSize),timeout:120000});
        parts.push(part);
      }
    }
    const result=await reelCloudRequest(path+'/'+revision,{method:'POST',body:{parts},timeout:120000});
    if(result.item?.revision!==revision)throw new Error('El servidor todavía no confirmó el respaldo.');
    return result.item;
  }
  function flushReelBackups(){
    if(!reelCloudEnabled||!navigator.onLine||reelBackupWork)return;
    const next=[...reelBackupQueue].find(([id])=>!reelBackupErrors.has(id));
    if(!next)return;
    const [id,snapshot]=next;
    const promise=uploadReelBackup(snapshot).then(item=>{
      setReelBackupReceipt(item,snapshot._reelWriter);
      if(project?.id===id&&project._reelWriter===snapshot._reelWriter){
        project._reelBackupBase=item.revision;
        if(project.savedAt===snapshot.savedAt)project._reelRevision=item.revision;
      }
      const pending=reelBackupQueue.get(id);
      if(pending!==snapshot&&pending?._reelWriter&&pending._reelWriter===snapshot._reelWriter)pending._reelBackupBase=item.revision;
      if(reelBackupQueue.get(id)===snapshot)reelBackupQueue.delete(id);
      for(const status of $$('#savedProjects [data-reel-saved-at]')){
        if(status.dataset.reelId===id&&Number(status.dataset.reelSavedAt)===snapshot.savedAt)status.textContent='En SALMOS';
      }
    }).catch(error=>reelBackupErrors.set(id,error)).finally(()=>{
      reelBackupWork=null;
      syncReelSaveState();
      flushReelBackups();
    });
    reelBackupWork={id,promise};
    syncReelSaveState();
  }
  function retryReelBackups(){
    for(const [id,error] of reelBackupErrors)if(error.status!==409)reelBackupErrors.delete(id);
    flushReelBackups();
  }
  async function loadReelCloudEntries(){
    if(!reelCloudEnabled)return null;
    try{
      const data=await reelCloudRequest(reelDraftPath(),{timeout:6500});
      const entries=Array.isArray(data.items)?data.items:[];
      reelCloudRows.clear();
      for(const item of entries)reelCloudRows.set(String(item.id),item);
      reelCloudError=null;
      return entries;
    }catch(error){reelCloudError=error;return null;}
  }
  async function downloadReelSnapshot(item,revision=item.revision){
    const path=reelDraftPath(item.id,'/backup/'+revision),response=await reelCloudRequest(path,{raw:true,timeout:120000});
    const raw=response.headers.get('Content-Type')==='application/gzip'?await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json():await response.json();
    const record=reelRecord(raw);
    if(!record||reelID(record)!==String(item.id))throw new Error('Este respaldo no tiene las escenas del reel.');
    return {...record,id:String(item.id),originalId:String(item.id),_reelRevision:revision,_reelBackupBase:revision};
  }
  async function copyReelSnapshot(source,suffix){
    const id=C.uid(),copy={...structuredClone(source),id,originalId:id,title:(source.title||'Reel')+suffix,savedAt:Date.now(),
      _reelRevision:C.uid(),_reelBackupBase:'',_reelWriter:C.uid()};
    await dbAction('projects','readwrite',store=>store.put(copy));
    queueReelBackup(copy);
    return copy;
  }
  async function restoreCloudReel(item){
    let record;
    try{record=await downloadReelSnapshot(item);}
    catch(error){
      if(!item.previousRevision||error.status&&error.status!==404)throw error;
      const previous=await downloadReelSnapshot(item,item.previousRevision);
      const recovered=await copyReelSnapshot(previous,' · recuperado');
      notify('Se abrió la versión anterior como una copia.');
      return recovered;
    }
    const local=await dbAction('projects','readonly',store=>store.get(item.id)).catch(()=>null),receipt=reelBackupReceipt(item.id);
    if(local&&local._reelRevision!==item.revision&&local.savedAt>(receipt?.savedAt||0)){
      await copyReelSnapshot(local,' · copia de este navegador');
    }
    reelBackupQueue.delete(item.id);reelBackupErrors.delete(item.id);
    setReelBackupReceipt(item);
    await dbAction('projects','readwrite',store=>store.put(record)).catch(()=>{});
    return record;
  }
  window.addEventListener('online',retryReelBackups);
  function reelRecord(raw,fallbackId){
    const data=raw?.project||raw?.draft||raw;
    if(!Array.isArray(data?.scenes))return null;
    const scenes=data.scenes.filter(scene=>scene&&typeof scene==='object'&&!Array.isArray(scene));
    if(!scenes.length)return null;
    const updated=raw.savedAt||data.savedAt||data.updatedAt||raw.updatedAt;
    return {...data,scenes,id:raw.id??data.id??fallbackId,
      originalId:data.originalId??raw.originalId??data.id??raw.id??fallbackId,
      savedAt:Number(updated)||Date.parse(updated)||0,
      title:data.title||raw.title||'Reel sin título',cover:data.cover||raw.cover,
      status:data.status||raw.status};
  }
  function latestReelRecords(rows){
    const latest=new Map();
    for(const raw of rows){
      const record=reelRecord(raw);
      if(!record||record.originalId==null)continue;
      const previous=latest.get(record.originalId);
      if(!previous||record.savedAt>previous.savedAt||
        record.savedAt===previous.savedAt&&record.id===record.originalId)latest.set(record.originalId,record);
    }
    return [...latest.values()].sort((a,b)=>b.savedAt-a.savedAt);
  }
  async function loadSaved(){
    const host=$('#savedProjects'),cloudPromise=loadReelCloudEntries();
    let all=[],localError=null;
    try{all=await dbAction('projects','readonly',store=>store.getAll());}catch(error){localError=error;}
    let local=latestReelRecords(all);
    if(!local.length&&!localError&&!checkedBrowserDrafts){
      checkedBrowserDrafts=true;
      try{
        const count=await restoreMissingReels(await readBrowserReelDrafts());
        if(count)local=latestReelRecords(await dbAction('projects','readonly',store=>store.getAll()));
      }catch(error){setReelRecoveryStatus(error.message);}
    }
    const remote=await cloudPromise,entries=[],cloudById=new Map((remote||[]).map(item=>[String(item.id),item]));
    for(const record of local){
      const id=reelID(record),cloud=cloudById.get(id),receipt=reelBackupReceipt(id);
      const synced=cloud&&(record._reelRevision===cloud.revision||!record._reelRevision&&cloud.savedAt===record.savedAt);
      const conflict=cloud&&!synced&&cloud.revision!==reelBaseRevision(record,receipt);
      if(synced){
        setReelBackupReceipt(cloud,record._reelWriter);cloudById.delete(id);
      }else if(conflict&&receipt?.savedAt===record.savedAt)continue;
      else if(!conflict&&remote){
        cloudById.delete(id);
        queueReelBackup(record);
      }
      entries.push({...record,inCloud:Boolean(synced),localConflict:Boolean(conflict)});
    }
    for(const item of cloudById.values())entries.push({...item,originalId:item.id,cloudOnly:true,inCloud:true});
    entries.sort((a,b)=>b.savedAt-a.savedAt);
    const cards=document.createDocumentFragment();
    const previews=new Map();
    for(const p of entries){
      const row=document.createElement('article');row.className='saved-card';
      const title=document.createElement('strong');
      const projectTitle=String(p.title||'Reel sin título');
      title.textContent=projectTitle.length>58&&projectTitle.includes(' · ')?
        'Reel'+(p.savedAt?' · '+new Date(p.savedAt).toLocaleDateString('es-AR'):''):projectTitle;
      title.title=title.textContent;
      const small=document.createElement('small'),count=p.scenes?.length||Number(p.sceneCount)||1;
      const duration=p.cloudOnly?p.duration:C.totalDuration(p.scenes);
      small.textContent=(p.status==='draft'?'Borrador · ':'')+count+(count===1?' escena · ':' escenas · ')+C.formatTime(duration)+' · ';
      const location=document.createElement('span');
      location.dataset.reelId=reelID(p);
      location.dataset.reelSavedAt=String(p.savedAt);
      location.textContent=p.inCloud?'En SALMOS':p.localConflict?'Edición de este navegador':'En este navegador';
      small.append(location);
      const actions=document.createElement('div');actions.className='project-actions';
      const open=document.createElement('button');open.textContent='Editar';
      open.onclick=()=>openSavedProject(p).catch(error=>notify(error.message,'error'));
      const preview=createReelPreview(p,title.textContent,count);
      previews.set(preview.element,preview.load);
      const down=document.createElement('button');down.textContent='↓ Video';down.title='Descargar video';down.onclick=()=>projectVideoAction(p,false);
      const share=document.createElement('button');share.textContent='Compartir';share.onclick=()=>projectVideoAction(p,true);
      const backup=document.createElement('button');backup.textContent='Respaldo';
      backup.onclick=async()=>{
        try{
          const record=p.cloudOnly?await downloadReelSnapshot(p):p;
          const name=String(p.title).replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,75)||'SALMOS-reel';
          download(new Blob([JSON.stringify(record)],{type:'application/json'}),name+'.json');
        }catch(error){notify(error.message,'error');}
      };
      const copy=document.createElement('button');copy.textContent='Duplicar';copy.onclick=()=>duplicateProject13(p);
      const del=document.createElement('button');del.textContent='×';del.title='Eliminar proyecto';
      del.onclick=async()=>{
        if(!confirm('¿Eliminar este proyecto guardado?'))return;
        del.disabled=true;
        try{
          const id=reelID(p);
          reelBackupQueue.delete(id);
          if(reelBackupWork?.id===id)await reelBackupWork.promise;
          if(reelCloudEnabled&&!p.localConflict){
            const remote=reelCloudRows.get(id);
            const revision=p.cloudOnly?p.revision:remote?.revision||reelBackupReceipt(id)?.revision||'';
            await reelCloudRequest(reelDraftPath(id)+'?revision='+encodeURIComponent(revision),{method:'DELETE'});
            reelCloudRows.delete(id);
          }
          reelBackupErrors.delete(id);
          await dbAction('projects','readwrite',store=>{
            const get=store.getAll();
            get.onsuccess=()=>{for(const item of get.result)if(String(reelRecord(item)?.originalId)===id&&
              (!p.cloudOnly||item.savedAt<=p.savedAt||item._reelRevision===p.revision))store.delete(item.id);};
          });
          await dbAction('exports','readwrite',store=>store.delete(id));
          await loadSaved();
          await dbAction('assets','readwrite',store=>store.delete(reelCoverCacheId(p))).catch(()=>{});
        }catch(error){notify(error.message,'error');}
        finally{del.disabled=false;}
      };
      actions.append(open,down,share,backup,copy,del);row.append(preview.element,title,small,actions);cards.append(row);
    }
    host.replaceChildren(cards);
    showReelPreviews(previews);
    if(!entries.length)host.textContent=localError||reelCloudError?
      'No se pudieron leer todas las copias. Volvé a abrir Proyectos cuando tengas conexión.' : 'Todavía no hay reels guardados. Podés buscar borradores o abrir un respaldo.';
    if(reelCloudEnabled&&reelCloudError)setReelRecoveryStatus('Los respaldos de SALMOS están pendientes de cargar.');
    return entries.length;
  }

  function csvCell(x){let v=String(x??'');if(/^[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
  function csv(rows,name){download(new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),name);}
  async function loadLog(){const all=await dbAction('posts','readonly',s=>s.getAll()),host=$('#postLog');host.replaceChildren();all.sort((a,b)=>b.date.localeCompare(a.date)).forEach(p=>{const row=document.createElement('div');row.className='post-entry';const strong=document.createElement('strong');strong.textContent=`${p.date} · ${p.channel} · ${p.inquiries} consultas`;const text=document.createElement('p');text.className='hint';text.textContent=p.title+' · '+p.notes;row.append(strong,text);if(p.url&&/^https?:\/\//i.test(p.url)){const a=document.createElement('a');a.href=p.url;a.target='_blank';a.rel='noopener';a.textContent='Ver publicación';row.append(a);}const del=document.createElement('button');del.textContent='Quitar registro';del.onclick=async()=>{await dbAction('posts','readwrite',s=>s.delete(p.id));loadLog();};row.append(del);host.append(row);});return all;}
  function setTab(tab){if(tab!=='audio'){cancelMusicTrial();$('#musicResults')?.querySelectorAll('iframe').forEach(f=>f.remove());}for(const b of $$('[data-tab]'))b.classList.toggle('active',b.dataset.tab===tab);for(const p of $$('[data-panel]'))p.hidden=p.dataset.panel!==tab;if(tab==='projects'){loadSaved().catch(e=>notify(e.message,'error'));loadLog().catch(()=>{});}}
  let ideaOffset=0;
  function generateIdeas(){const host=$('#ideaCards');host.replaceChildren();const selected=$('#ideaFormat').value,formats=selected==='all'?Array.from({length:4},(_,i)=>C.formats[(ideaOffset+i)%C.formats.length]):[C.formats.find(f=>f.id===selected)];for(const format of formats){const idea=C.idea($('#niche').value,format.id,$('#ideaProduct').value,$('#customNiche').value),card=document.createElement('article');card.className='idea-card';const tag=document.createElement('span');tag.className='tag';tag.textContent=idea.niche+' · '+idea.format;const title=document.createElement('h2');title.textContent=idea.headline;const story=document.createElement('p');story.textContent=idea.story;const copy=document.createElement('pre');copy.textContent=idea.caption;const buttons=document.createElement('div');buttons.className='button-row';const use=document.createElement('button');use.className='primary';use.textContent='Usar en mi reel';use.onclick=async()=>{checkpoint();current().components=current().components.filter(x=>x.kind!=='text');for(const[text,y,w]of[[idea.headline,.07,.84],[idea.detail,.83,.76],[idea.cta,.91,.76]]){const l=textComponent(text,{x:(1-w)/2,y,w});current().components.push(l);await renderTextLayer(l);}current().template=idea.template;project.narration=idea.narration;project.ideaCaption=idea.caption;syncForm();changed();setTab('editor');notify('Idea aplicada. Podés editar todos los textos.');};const cp=document.createElement('button');cp.textContent='Copiar texto';cp.onclick=()=>copyText(idea.caption);const voice=document.createElement('button');voice.textContent='Usar guion de voz';voice.onclick=()=>{checkpoint();project.narration=idea.narration;syncForm();changed();setTab('audio');};buttons.append(use,cp,voice);card.append(tag,title,story,copy,buttons);host.append(card);}}
  async function copyText(text){try{await navigator.clipboard.writeText(text);notify('Texto copiado.');}catch{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove();notify('Texto seleccionado y copiado.');}}
  function helperBase(){const url=new URL($('#helperUrl').value);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:')throw new Error('Usá la dirección local del complemento: http://127.0.0.1:8765');return url.origin;}
  async function helperFetch(path,options={},timeout=options.method==='POST'?300000:7000){const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);try{const response=await fetch(helperBase()+path,{...options,signal:abort.signal});if(!response.ok){let message='No se pudo completar la operación local.';try{const data=await response.json();message=data.error||message;}catch{}throw Object.assign(new Error(message),{status:response.status});}return response;}finally{clearTimeout(timer);}}
  async function connectLocal(){try{$('#localStatus').textContent='Conectando…';const data=await(await helperFetch('/api/health')).json();if(data.version<3)throw Error('Programa anterior: usá Actualizar conexión local y abrí el archivo descargado.');
      if(data.music?.setup?.state!=='ready')throw Error('Esperá a que el iniciador diga SALMOS listo.');
      localHealth=data;localReady=true;syncNarrationGate();const voices=$('#ttsVoice'),previous=voices.value;voices.replaceChildren();for(const v of data.voices||[])voices.add(new Option(v.name,v.id));if([...voices.options].some(o=>o.value===previous))voices.value=previous;$('#localStatus').textContent='Conectado · '+(data.ffmpeg?'MP4 disponible':'MP4 sin instalar');$('#ttsStatus').textContent=data.tts?'Conectado. Elegí una voz, escuchá una muestra y generá el relato.':'No hay voces disponibles. Usá Actualizar conexión local para prepararlas.';notify('Programa local conectado.');return !!data.tts;}catch(e){localReady=false;$('#localStatus').textContent=e.message.includes('anterior')?e.message:'Abrí tu conexión local de SALMOS o usá Actualizar conexión local. Si Chrome pide acceso a tu red local, ese permiso conecta el editor con el programa de tu PC.';$('#ttsStatus').textContent=$('#localStatus').textContent;notify($('#localStatus').textContent,'error');return false;}}
  function syncNarrationGate(){
    for(const key of ['tts','ttsSample'])$('#'+key).disabled=!localReady;
  }
  async function generateTts(sample=false){commitVoiceSettings18();if(!project.narration.trim())return notify('Escribí primero el texto de la narración.','error');if(!await connectLocal())return;const buttons=[$('#tts'),$('#ttsSample')];buttons.forEach(b=>b.disabled=true);$('#ttsStatus').textContent=sample?'Preparando muestra…':'Generando narración…';pause();try{const text=sample?project.narration.slice(0,180):project.narration;const cacheKey=JSON.stringify({text,voice:$('#ttsVoice').value,pitch:Number($('#ttsPitch').value)});let blob=ttsCache11.get(cacheKey);if(!blob){blob=await(await helperFetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice:$('#ttsVoice').value,pitch:Number($('#ttsPitch').value)})})).blob();ttsCache11.set(cacheKey,blob);if(ttsCache11.size>6)ttsCache11.delete(ttsCache11.keys().next().value);}const audition=$('#ttsAudition');if(audition.src.startsWith('blob:'))URL.revokeObjectURL(audition.src);audition.src=URL.createObjectURL(blob);audition.hidden=false;if(sample){await audition.play();$('#ttsStatus').textContent='Esta es una muestra de hasta 180 caracteres. No reemplazó tu narración.';}else{checkpoint();project.audio.voice=await blobData(blob);project.audio.voiceName='Relator · '+$('#ttsVoice').selectedOptions[0].textContent;await setupAudioElements();syncForm();changed();$('#ttsStatus').textContent='Narración agregada. Tocá Ver reel para escucharla con la escena y la música. Se incluye al exportar.';notify('Narración lista dentro del reel.');return true;}}catch(e){$('#ttsStatus').textContent=e.message;notify(e.message,'error');}finally{syncNarrationGate();}}
  async function toggleRecord(){if(recording){recording.stop();return;}if(exporting)return;pause();try{recordStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));recording=new MediaRecorder(recordStream,type?{mimeType:type}:{});const chunks=[];recording.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recording.onstop=async()=>{const mime=recording.mimeType;recordStream.getTracks().forEach(t=>t.stop());recording=null;recordStream=null;$('#record').textContent='● Grabar mi voz';$('#recordState').textContent='Grabación terminada.';try{checkpoint();project.audio.voice=await blobData(new Blob(chunks,{type:mime}));project.audio.voiceName='Mi voz · '+new Date().toLocaleTimeString('es-AR');await setupAudioElements();syncForm();changed();}catch(e){notify(e.message,'error');}};recording.onerror=()=>{recordStream?.getTracks().forEach(t=>t.stop());recording=null;$('#record').textContent='● Grabar mi voz';notify('La grabación se interrumpió. Revisá el permiso del micrófono.','error');};recording.start(250);$('#record').textContent='■ Terminar grabación';$('#recordState').textContent='Grabando… hablá cerca del micrófono.';}catch(e){notify('No se pudo abrir el micrófono. Permití su uso en el navegador o subí una grabación.','error');}}
  async function doExport(){commitVoiceSettings18();if(musicTrial)return notify('Terminá la prueba musical y elegí una pista antes de exportar.');if(exporting||recording)return notify('Terminá la grabación antes de exportar.','error');const desired=$('#exportFormat').value,width=Number($('#quality').value),mp4='video/mp4;codecs=avc1.42E01E,mp4a.40.2',mp4Only='video/mp4;codecs=avc1.42001E,mp4a.40.2',webm='video/webm;codecs=vp9,opus',fallback='video/webm;codecs=vp8,opus';if(!window.MediaRecorder||!canvas.captureStream)return notify('Este navegador no permite exportar video. Usá una versión actual de Chrome o Edge.','error');const hasAudio=!!(project.audio.music||project.audio.voice||project.audio.clipAudio||(project.audio.sfx||[]).length);const mp4Type=[mp4,mp4Only,...(hasAudio?[]:['video/mp4;codecs=avc1.42E01E'])].find(t=>MediaRecorder.isTypeSupported(t));if(desired==='mp4'&&!mp4Type&&(!localReady||!localHealth?.ffmpeg)){setTab('audio');$('#exportDialog').close();return notify('Para MP4 en este navegador, abrí el programa local y tocá «Conectar programa local». También podés exportar WebM.','error');}const mime=desired!=='webm'&&mp4Type?mp4Type:[webm,fallback,'video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)return notify('No hay un formato de grabación disponible en este navegador.','error');pause();$('#exportDialog').close();const oldTime=time;let stream,recorder;try{await prepareMedia();if(project.scenes.some(s=>s.giphy&&!giphyRuntime.has(s.id)))throw Error('Conectá GIPHY para cargar el fondo de este proyecto.');await connectAudio();exporting=true;cancelled=false;document.body.classList.add('exporting');$('#busyOverlay').hidden=false;$('#busyText').textContent='Creando tu video…';$('#exportProgress').value=0;const d=dimensions(width);canvas.width=d.w;canvas.height=d.h;time=0;draw();stream=canvas.captureStream(30);if(project.audio.music||project.audio.voice||project.audio.clipAudio||(project.audio.sfx||[]).length)for(const track of audioDestination.stream.getAudioTracks())stream.addTrack(track.clone());const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:width>=1080?12000000:width>=720?6500000:3500000,audioBitsPerSecond:192000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(new Error(e.error?.message||'Falló la grabación.'));});recorder.start(500);const start=performance.now()+500,duration=C.totalDuration(project.scenes);await new Promise(resolve=>{function frame(){if(cancelled){resolve();return;}time=Math.max(0,Math.min(duration,(performance.now()-start)/1000));if(performance.now()>=start)syncSound();draw();$('#exportProgress').value=time/duration;if(performance.now()-start>=(duration*1000+250)){resolve();return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);});stopSound();if(recorder.state!=='inactive')recorder.stop();await stopped;if(cancelled)return;let blob=new Blob(chunks,{type:recorder.mimeType}),extension=recorder.mimeType.startsWith('video/mp4')?'mp4':'webm';if(desired==='mp4'&&extension!=='mp4'){$('#busyText').textContent='Convirtiendo a MP4 en tu computadora…';blob=await(await helperFetch('/api/convert',{method:'POST',headers:{'Content-Type':blob.type},body:blob})).blob();extension='mp4';}project.status='exported';await showExportDownload(blob,filename()+'.'+extension);notify(`Video ${extension.toUpperCase()} descargado con ${project.scenes.length} escena(s).`);}catch(e){notify(e.message||'No se pudo exportar. Probá con calidad 540 o 720.','error');}finally{stopSound();if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());exporting=false;$('#busyOverlay').hidden=true;document.body.classList.remove('exporting');time=oldTime;draw();syncUndo();}}
  function updatePrompt(){const phrases={subtle:'The model makes a very subtle natural posture adjustment, with gentle breathing. Keep the camera almost still.',camera:'Very slow smooth camera push-in toward the garment print. The model remains still.',fabric:'A very gentle breeze moves the fabric slightly. The model stays in the same pose.',product:'A subtle elegant camera movement presents the product. Keep its shape, proportions and surface unchanged.'};$('#aiPrompt').value=`${phrases[$('#aiMotion').value]} Preserve the exact garment color, printed artwork, lettering, face, body and background. No new objects, no added text, no redesign, no camera cuts. Short 2-second product advertisement.`;}
  let requestCounter=0;const requests=new Map();
  function requestParent(action,data={}){if(parent===window)return Promise.reject(new Error('Abrí este estudio desde el panel SALMOS para traer el producto. También podés cargar los archivos manualmente.'));return new Promise((resolve,reject)=>{const id='marketing-'+(++requestCounter);requests.set(id,{resolve,reject});parent.postMessage({type:'salmos-marketing-request',id,action,...data},location.origin);setTimeout(()=>{if(requests.has(id)){requests.delete(id);reject(new Error('No llegó la composición. Volvé a Producción, elegí la vista y tocá «Crear reel».'));}},60000);});}
  window.addEventListener('message',async event=>{if(event.source!==parent||event.origin!==location.origin)return;const data=event.data;if(data?.type==='salmos-marketing-pause'){pause();if(recording)recording.stop();if(exporting)cancelled=true;return;}if(data?.type==='salmos-marketing-response'){const item=requests.get(data.id);if(!item)return;requests.delete(data.id);if(data.error)item.reject(new Error(data.error));else item.resolve(data.payload);}if(data?.type==='salmos-marketing-composition')try{await importPayload(data.payload);}catch(e){notify(e.message,'error');}});
  let editingStamp=false,focusPicking=false,textPicking=false,demoCache;
  const isVideoSource=src=>/^data:video\//i.test(src||'');
  async function productFrame(){pause();await prepareMedia();const s=current(),im=s.final?asset(s.final):sceneImage(s);if(!im)throw new Error('Cargá una foto del producto antes de prepararla para IA.');const source=im.frame?im.frame(time):im,iw=im.videoWidth||im.naturalWidth||im.width,ih=im.videoHeight||im.naturalHeight||im.height,k=Math.min(1,2048/Math.max(iw,ih)),out=document.createElement('canvas');out.width=Math.round(iw*k);out.height=Math.round(ih*k);const c=out.getContext('2d');c.drawImage(source,0,0,out.width,out.height);if(s.stamp&&!s.final){const stamp=asset(s.stamp),p=s.placement,w=p.w*out.width,h=w*stamp.height/stamp.width;c.save();c.translate(p.x*out.width+w/2,p.y*out.height+h/2);c.rotate(p.rotation*Math.PI/180);c.drawImage(stamp,-w/2,-h/2,w,h);c.restore();}await new Promise(resolve=>out.toBlob(blob=>{if(blob)download(blob,filename()+'-producto-para-IA.png');resolve();},'image/png'));}
  function demoAssets(){if(demoCache)return demoCache;const base=document.createElement('canvas');base.width=720;base.height=1000;demoProduct(base.getContext('2d'),{x:0,y:0,w:720,h:1000});const stamp=document.createElement('canvas');stamp.width=300;stamp.height=210;demoStamp(stamp.getContext('2d'),{x:0,y:0,w:300,h:210});return demoCache={base:base.toDataURL(),stamp:stamp.toDataURL(),baseName:'Prenda de demostración',stampName:'Estampa de demostración'};}
  function normalizeProject(){project.showBrand=false;project.audio={musicRate:1,voiceRate:1,voiceBass:0,voiceTreble:0,...project.audio};for(const s of project.scenes){if(s.demo&&!s.base&&!s.final&&!s.video)Object.assign(s,demoAssets());s.duration=C.clamp(s.duration,s.video ? .1 : 2,30);s.placement||={x:.31,y:.27,w:.38,rotation:0};migrateScene(s);}return project;}
  function drawStampBox(c,b,rotation){const pts=T.points(b,rotation),cssWidth=canvas.getBoundingClientRect().width||300,k=720/cssWidth;c.save();c.strokeStyle='#b8387c';c.lineWidth=1.4*k;c.beginPath();pts.slice(0,4).forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.stroke();const mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};c.beginPath();c.moveTo(mid.x,mid.y);c.lineTo(pts[4].x,pts[4].y);c.stroke();pts.forEach((p,i)=>{c.fillStyle=i===4?'#ad3973':'#fff4fa';c.beginPath();c.arc(p.x,p.y,(i===4?8:6)*k,0,Math.PI*2);c.fill();c.stroke();if(i===4){c.fillStyle='white';c.font=`${13*k}px Arial`;c.textAlign='center';c.textBaseline='middle';c.fillText('↻',p.x,p.y);}});c.restore();}
  function paintBackdrop(c,s,seconds,W,H){if(!s.bgMotion)return;if(['bokeh','waves','confetti'].includes(s.bgMotion)){c.save();for(let i=0;i<22;i++){const x=(i*163+Math.sin(seconds*.35+i)*55)%W,y=((i*127-seconds*(48+i%6*9))%H+H)%H;c.fillStyle=['#e994bb55','#e8c66e55','#91cbd955','#ab96dc55'][i%4];if(s.bgMotion==='bokeh'){const r=18+i%5*12,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c.fillStyle);g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}else if(s.bgMotion==='confetti'){c.save();c.translate(x,y);c.rotate(seconds*.5+i);c.fillRect(-4,-10,8,20);c.restore();}else{c.strokeStyle=c.fillStyle;c.lineWidth=4;c.beginPath();for(let q=0;q<=W;q+=12){const yy=y+Math.sin(q/130+seconds+i)*30;q?c.lineTo(q,yy):c.moveTo(q,yy);}c.stroke();}}c.restore();return;}c.save();c.fillStyle=s.bgMotion==='stars'?'#e2ba72bb':'#c95b93bb';for(let i=0;i<32;i++){const x=((i*173+Math.sin(seconds*.4+i)*20)%W+W)%W,y=((i*241-seconds*(65+i%4*18))%H+H)%H,r=12+i%4*5;c.save();c.translate(x,y);c.rotate(Math.sin(i+seconds*.3)*.3);c.beginPath();if(s.bgMotion==='hearts'){c.moveTo(0,r*.8);c.bezierCurveTo(-r*1.6,-r*.1,-r,-r*1.3,0,-r*.45);c.bezierCurveTo(r,-r*1.3,r*1.6,-r*.1,0,r*.8);}else if(s.bgMotion==='petals'){for(let j=0;j<5;j++){c.save();c.rotate(j*Math.PI*2/5);c.ellipse(0,-r*.55,r*.28,r*.65,0,0,Math.PI*2);c.restore();}}else{for(let j=0;j<8;j++){const angle=j*Math.PI/4,rad=j%2?r*.23:r;j?c.lineTo(Math.cos(angle)*rad,Math.sin(angle)*rad):c.moveTo(Math.cos(angle)*rad,Math.sin(angle)*rad);}c.closePath();}c.fill();c.restore();}c.restore();}
  function syncExtraForm(){syncComponents();const s=current();$('#backgroundInfo').textContent=s.background?(s.backgroundName?'Fondo de Producción · '+s.backgroundName:'Fondo cargado.'):s.bgMotion?'Fondo animado · '+s.bgMotion:'Se usa el color elegido.';$('#placementHelp').textContent='';if(voiceAudio){voiceAudio.playbackRate=C.clamp(project.audio.voiceRate,.6,1.6);voiceAudio.preservesPitch=true;}$('#voiceListen').playbackRate=C.clamp(project.audio.voiceRate,.6,1.6);}
  function localPointer(event,geometry=lastGeometry){const rect=canvas.getBoundingClientRect(),pixel={x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};return{pixel,point:geometry.matrix.inverse().transformPoint(pixel),rect};}
  function handleHit(event){if(!lastGeometry||!current().stamp||current().final)return -1;const {pixel,rect}=localPointer(event);return T.points(lastGeometry.b,current().placement.rotation).findIndex(p=>{const screen=lastGeometry.matrix.transformPoint(p);return Math.hypot((screen.x-pixel.x)*rect.width/canvas.width,(screen.y-pixel.y)*rect.height/canvas.height)<=13;});}
  function backgroundShelf(){const host=$('#backgroundShelf');host.replaceChildren();for(const [name,motion,palette] of [['♡ Rosa con corazones','hearts','pink'],['❀ Pétalos','petals','pink'],['✦ Brillos','stars','pink'],['◌ Luces suaves','bokeh','blue'],['〰 Ondas','waves','lilac'],['▧ Confeti','confetti','cream'],['Crema suave','','cream'],['Rosa liso','','pink'],['Bordó','','red']]){const b=document.createElement('button'),swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=`linear-gradient(135deg,${C.palettes[palette][0]},${C.palettes[palette][1]})`;swatch.textContent=name.split(' ')[0];b.append(swatch,document.createTextNode(name));b.onclick=()=>{applyScopedBackground({motion,palette,name});};host.append(b);}}
  async function salmosBackgrounds(){let dialog;try{const entries=await requestParent('backgrounds');dialog=document.createElement('dialog');const heading=document.createElement('h2');heading.textContent='❀ Tus fondos de SALMOS';const search=document.createElement('input');search.type='search';search.placeholder='Buscar un fondo…';const grid=document.createElement('div');grid.className='background-shelf';grid.style.cssText='max-height:60vh;overflow:auto;margin:12px 0';const render=()=>{grid.replaceChildren();for(const item of entries.filter(v=>v.name.toLowerCase().includes(search.value.toLowerCase())).slice(0,90)){const b=document.createElement('button'),im=document.createElement('img');im.crossOrigin='use-credentials';im.src=item.url;im.loading='lazy';im.alt=item.name;b.append(im,document.createTextNode(item.name));b.onclick=async()=>{b.disabled=true;try{const payload=await requestParent('background',{assetId:item.id}),data=await blobData(payload.blob);await asset(data)._ready;checkpoint();current().background=data;migrateMotion19(current());syncForm();changed();dialog.close();}catch(e){notify(e.message,'error');b.disabled=false;}};grid.append(b);}if(!grid.childElementCount)grid.textContent='No encontré fondos con ese nombre.';};search.oninput=render;const close=document.createElement('button');close.textContent='Volver';close.onclick=()=>dialog.close();dialog.append(heading,search,grid,close);dialog.onclose=()=>dialog.remove();document.body.append(dialog);render();dialog.showModal();}catch(e){dialog?.remove();notify(parent===window?'Los fondos guardados se ven al abrir Marketing dentro de SALMOS. Como todavía estás probando el ZIP, usá los fondos incluidos o subí uno propio.':e.message,'error');}}
  function storyPreview(story){
    const preview=document.createElement('div'),frames=document.createElement('div'),nav=document.createElement('div');
    const previous=document.createElement('button'),next=document.createElement('button'),position=document.createElement('span');
    preview.className='story-preview';frames.className='story-frames';nav.className='story-navigation';
    frames.setAttribute('role','group');frames.setAttribute('aria-label','Tomas de '+story.title);
    for(const shot of story.shots){
      const item=document.createElement('div'),title=document.createElement('strong');
      const method=document.createElement('small'),direction=document.createElement('p');
      item.className='story-shot';title.textContent=shot.title;method.textContent=shot.method;direction.textContent=shot.direction;
      item.append(title,method,direction);
      if(shot.prompt){
        const details=document.createElement('details'),summary=document.createElement('summary'),prompt=document.createElement('textarea');
        summary.textContent='Indicación de IA';prompt.readOnly=true;prompt.value=shot.prompt;
        prompt.setAttribute('aria-label','Indicación de IA para '+shot.title);
        details.append(summary,prompt);item.append(details);
      }
      frames.append(item);
    }
    let index=0;
    function update(selected){
      index=selected;
      position.textContent='Toma '+(index+1)+' de '+story.shots.length;
      previous.disabled=index===0;next.disabled=index===story.shots.length-1;
      for(const [i,item] of [...frames.children].entries())item.inert=i!==index;
    }
    function move(to){
      if(to<0||to>=story.shots.length)return;
      update(to);frames.scrollTo({left:frames.clientWidth*index,behavior:'instant'});
    }
    previous.type=next.type='button';
    previous.textContent='‹';next.textContent='›';
    previous.setAttribute('aria-label','Toma anterior');next.setAttribute('aria-label','Toma siguiente');
    position.setAttribute('aria-live','polite');
    previous.onclick=()=>move(index-1);next.onclick=()=>move(index+1);
    frames.onscroll=()=>{
      if(frames.clientWidth)update(C.clamp(Math.round(frames.scrollLeft/frames.clientWidth),0,story.shots.length-1));
    };
    nav.append(previous,position,next);preview.append(frames,nav);update(0);
    return preview;
  }
  function buildStories(){
    const host=$('#storyCards'),filter=$('#storyFilter').value;
    const query=$('#storySearch').value.trim().toLocaleLowerCase('es');
    host.replaceChildren();
    for(const story of window.SalmosStories){
      const usesAi=story.kind.includes('IA +');
      if((filter==='ai'&&!usesAi)||(filter==='noai'&&usesAi)||
        ![story.title,story.need,...story.shots.map(shot=>shot.direction)].join(' ').toLocaleLowerCase('es').includes(query))continue;
      const card=document.createElement('article'),title=document.createElement('h2');
      const tag=document.createElement('span'),need=document.createElement('p'),use=document.createElement('button');
      card.className='story-card';tag.className='tag';tag.textContent=story.kind;
      title.textContent=story.icon+' '+story.title;need.textContent=story.need;
      use.className='primary';use.textContent='Cargar guion';
      use.onclick=async()=>{
        use.disabled=true;
        try{await loadStory(story);}
        catch(error){notify(error.message,'error');}
        finally{use.disabled=false;}
      };
      card.append(tag,title,need,storyPreview(story),use);host.append(card);
    }
    if(!host.childElementCount)host.textContent='No encontré ideas con esa búsqueda.';
  }
  async function loadStory(story){
    pause();checkpoint();await saveRecord().catch(()=>{});
    const source=structuredClone(current());
    project.id=C.uid();project.title=story.title;
    project.scenes=story.shots.map((shot,i)=>({...structuredClone(source),id:C.uid(),shotTitle:shot.title,
      template:shot.template,duration:4,headline:'',detail:'',cta:i===story.shots.length-1?'Consultanos por tu diseño':'',
      video:null,direction:shot.direction,method:shot.method,aiPrompt:shot.prompt,
      effect:{start:.1,length:1.5,soft:.6,zoom:shot.template==='zoom'?3:1.15,count:.6},focus:null,textAnchor:null}));
    for(const scene of project.scenes){
      scene.components=scene.components.filter(layer=>layer.kind!=='text');
      if(scene.cta){
        const layer=textComponent(scene.cta,{y:.9});scene.components.push(layer);await renderTextLayer(layer);scene.cta='';
      }
    }
    if(story.id==='cabina'&&project.scenes[0].base){
      Object.assign(project.scenes[0],{stamp:null,final:null,components:[],demoBlank:true});
      project.scenes[1].headline='SALMOS';
    }
    active=0;time=0;editingStamp=false;await prepareMedia();syncForm();changed();setTab('editor');
    notify('Guion de '+story.shots.length+' escenas creado. Podés cargar tus clips en las tomas que los necesitan.');
  }
  const musicCache=new Map();
  let musicTrial=null,libraryTracks=[];
  function readTracks(){try{return JSON.parse(localStorage.getItem('salmos-music-library')||'[]');}catch{return [];}}
  function writeTracks(){localStorage.setItem('salmos-music-library',JSON.stringify(libraryTracks));}
  let auditionTrack=null;
  function salmosMusicTracks(){
    const oldTracks=[{id:'piano',name:'Calma · piano suave',genre:'piano'},{id:'ambient',name:'Luz · ambiental',genre:'ambient'},{id:'bright',name:'Encuentro · pop alegre',genre:'pop'},{id:'acoustic',name:'Cercanía · arpegio acústico',genre:'acoustic'},{id:'hope',name:'Esperanza · piano luminoso',genre:'piano'},{id:'pulse',name:'Avanzar · pop con pulso',genre:'pop'},{id:'dance',name:'Celebrar · dance con batería',genre:'dance'},{id:'latin',name:'Alegría · ritmo latino',genre:'latin'},{id:'funk',name:'Identidad · funk',genre:'funk'},{id:'urban',name:'Paso firme · beat urbano',genre:'urban'},{id:'rock',name:'Impulso · rock',genre:'rock'},{id:'disco',name:'Brillar · disco pop',genre:'disco'}].map(x=>({...x,id:'legacy-'+x.id,get:()=>{if(!musicCache.has('legacy-'+x.id))musicCache.set('legacy-'+x.id,T.makeLegacyMusic(x.id));return musicCache.get('legacy-'+x.id);}}));
    const newer=[['piano','Brisa · piano íntimo'],['ambient','Luz · atmósfera y campanas'],['acoustic','Gratitud · cuerdas acústicas'],['dance','Celebrar · dance electrónico'],['latin','Raíces · percusión latina'],['funk','Brillar · bajo y guitarra funk'],['urban','Camino · beat urbano'],['rock','Salto · rock con batería']].map(([id,name])=>({id,name,get:()=>{if(!musicCache.has(id))musicCache.set(id,T.makeMusic(id));return musicCache.get(id);}}));
    const extra=[['streetjoy','Buen día · pop urbano alegre'],['bossa','Domingo · bossa suave'],['reggae','Aire libre · reggae'],['cinematic','Horizonte · cine y cuerdas'],['musicbox','Pequeñas alegrías · cajita musical'],['drumrock','Batería · rock enérgico'],['drumfunk','Batería · funk con groove'],['drumpop','Batería · pop potente'],['gospel','Júbilo · piano gospel y palmas'],['lofi','Pausa · lo-fi relajado'],['samba','Fiesta · samba y percusión']].map(([id,name])=>({id,name,get:()=>{if(!musicCache.has(id))musicCache.set(id,T.makeMusic(id));return musicCache.get(id);}}));
    return {all:[...oldTracks,...newer,...extra],extra};
  }
  function musicCatalog(){$('#musicCredit13')?.replaceChildren();const host=$('#musicResults');host.replaceChildren();const own=$('#musicCatalog').value==='library';$('#ownMusicTools')?.toggleAttribute('hidden',!own);$('#musicResults').hidden=own;if($('#musicSelectionControls'))$('#musicSelectionControls').hidden=own;if(own)return;
    const {all,extra}=salmosMusicTracks();
    const favorites=musicFavorites();if(musicList==='extra')musicList='all';
    const bar=document.createElement('div');bar.className='subtabs music-lists';for(const[id,name]of[['all','Todas'],['favorites','♥ Favoritas']]){const b=document.createElement('button');b.textContent=name;b.classList.toggle('active',musicList===id);b.onclick=()=>{musicList=id;musicCatalog();};bar.append(b);}host.append(bar);
    const grid=document.createElement('div');grid.className='audio-choice-grid';host.append(grid);
    for(const track of all.filter(t=>musicList==='favorites'?favorites.includes(t.id):musicList==='extra'?extra.includes(t):true)){
      const card=document.createElement('div');card.className='audio-choice-card';const listen=document.createElement('button');listen.className='audio-tile';listen.dataset.musicTrack=track.id;listen.dataset.musicTrackName=track.name;listen.textContent=(selectedMusic10?.id===track.id&&auditionTrack===track.id&&playing?'Ⅱ ':'▶ ')+track.name;listen.classList.toggle('active',selectedMusic10?.id===track.id);listen.setAttribute('aria-label',(selectedMusic10?.id===track.id&&playing?'Pausar ':'Reproducir ')+track.name);
      listen.onclick=async()=>{if(selectedMusic10?.id===track.id&&auditionTrack===track.id&&playing){pause();musicCatalog();return;}listen.disabled=true;try{const wasSame=selectedMusic10?.id===track.id&&auditionTrack===track.id;pause();const same=selectedMusic10?.id===track.id&&auditionTrack===track.id;if(!same){if(!musicTrial)musicTrial=musicFields11(project.audio);selectedMusic10=track;project.audio.music=await blobData(await track.get());project.audio.musicName=track.name;delete project.audio.musicCredit;project.audio.musicStart=0;project.audio.musicEnd=0;project.audio.musicLoop=true;auditionTrack=track.id;}await setupAudioElements();if(!wasSame)time=0;await play();musicCatalog();}catch(e){notify(e.message,'error');}finally{listen.disabled=false;}};

      const heart=document.createElement('button');heart.className='music-favorite';heart.textContent=favorites.includes(track.id)?'♥':'♡';heart.title='Favorita: '+track.name;heart.setAttribute('aria-label',heart.title);heart.setAttribute('aria-pressed',String(favorites.includes(track.id)));heart.onclick=()=>{const f=musicFavorites(),i=f.indexOf(track.id);if(i<0)f.push(track.id);else f.splice(i,1);localStorage.setItem('salmos-music-favorites',JSON.stringify(f));musicCatalog();};card.append(listen,heart);grid.append(card);
    }
    if(!grid.childElementCount){const empty=document.createElement('p');empty.textContent='Marcá con un corazón las bases que te gusten.';grid.append(empty);}
    const controls=$('#musicSelectionControls');if(controls){controls.hidden=!selectedMusic10&&!project.audio.music;$('#confirmMusic10').hidden=!selectedMusic10;$('#musicSelectionName').textContent=selectedMusic10?.name||project.audio.musicName||'Música';if(selectedMusic10){$('#confirmMusic10').onclick=async()=>{const b=$('#confirmMusic10');b.disabled=true;try{pause();checkpoint();musicTrial=null;auditionTrack=selectedMusic10.id;await setupAudioElements();syncForm();changed();notify('Música agregada.');musicCatalog();}catch(e){notify(e.message,'error');}finally{b.disabled=false;}};}}
  }
  let musicList='all',selectedMusic10=null;
  function musicFavorites(){try{return JSON.parse(localStorage.getItem('salmos-music-favorites')||'[]');}catch{return [];}}
  async function cancelMusicTrial(){if(!musicTrial)return;pause();Object.assign(project.audio,musicTrial);musicTrial=null;$('#musicTrialBar').hidden=true;await setupAudioElements();syncForm();}
  let selectedComponent=null,componentGeometry=[],componentDrag=null,fontGalleryOpen=false;
  const componentEffects=[['orbit','Movimiento suave'],['spotlight','Luz y detalle'],['polaroid','Foto de colección'],['countdown','Cuenta regresiva'],['mirror','Espejo doble'],['clean','Catálogo'],['before','Antes y después'],['none','Sin efecto'],['pencil','Lápiz'],['brush','Pincel'],['wipe','Revelación'],['fade','Suave'],['slide','Deslizar'],['zoom','Acercar'],['pulse','Aparecer']];
  function selectedLayer(){return current()?.components?.find(x=>x.id===selectedComponent)||null;}
  function effectTarget(){return selectedLayer()||current();}
  function targetTemplate(){const t=selectedLayer();return t?t.fx||'none':current().template;}
  function setSelection(id){cancelEffectTrial();selectedComponent=id;editingStamp=false;focusPicking=false;syncForm();draw();}
  function textComponent(text='Tu texto',extra={},style=project){return{id:C.uid(),kind:'text',name:'Texto',text,fontId:'gf-poppins',color:style.textColor||'#34242f',bold:false,italic:false,x:.12,y:.09,w:.76,rotation:0,fx:'none',effect:{start:0,length:1,soft:.5},...extra};}
  function migrateScene(s,style=project){
    if(Array.isArray(s.components))return;
    s.components=[];
    if(s.stamp&&!s.final)s.components.push({id:C.uid(),kind:'print',name:s.stampName||'Estampa',src:s.stamp,baked:false,placement:{...s.placement},fx:['pencil','brush','wipe','before'].includes(s.template)?s.template:'none',effect:{...T.effects(s)},rows:s.rows||18});
    if(s.base&&s.final)s.components.push({id:C.uid(),kind:'print',name:'Estampas integradas en una imagen',src:s.final,baked:true,bounds:s.bounds||{x:0,y:0,w:1,h:1},merged:true,fx:['pencil','brush','wipe','before'].includes(s.template)?s.template:'none',effect:{...T.effects(s)}});
    if(s.headline)s.components.push(textComponent(s.headline,{x:.08,y:style.textPosition==='bottom'?.72:s.textAnchor?.y||.065,w:.84,fontId:style.fontId||'gf-poppins',bold:style.bold},style));
    if(s.detail)s.components.push(textComponent(s.detail,{x:.12,y:.84,w:.76,fontId:'gf-poppins'},style));
    if(s.cta)s.components.push(textComponent(s.cta,{x:.12,y:.92,w:.76,fx:'fade',effect:{start:s.duration*.65,length:.7,soft:.5}},style));
    if(['pencil','brush','wipe','before'].includes(s.template)&&s.components.some(x=>x.kind==='print'))s.template='clean';
    s.headline='';s.detail='';s.cta='';s.stamp=null;s.bounds=null;
  }
  function componentImage(layer,read=asset){return read(layer.kind==='text'?layer.render:layer.src);}
  async function renderTextLayer(layer,read=asset){const seq=(layer.renderSequence||0)+1;layer.renderSequence=seq;const image=await window.SalmosText.image(layer,1500);if(seq!==layer.renderSequence)return;layer.render=image.toDataURL('image/png');layer.aspect=image.width/image.height;await read(layer.render)._ready;}
  async function prepareComponents(){for(const s of project.scenes){migrateScene(s);for(const l of s.components){if(l.kind==='text'){await renderTextLayer(l);}else if(l.src)await asset(l.src)._ready;}}}
  function layerRect(layer,r,W=720,H=1280,read=asset){if(layer.kind==='text'){const w=layer.w*W;return{x:layer.x*W,y:layer.y*H,w,h:w/(layer.aspect||3),rotation:layer.rotation||0};}if(layer.baked){const b=layer.bounds||{x:0,y:0,w:1,h:1};return{x:r.x+b.x*r.w,y:r.y+b.y*r.h,w:b.w*r.w,h:b.h*r.h,rotation:0};}const p=layer.placement,im=componentImage(layer,read),w=p.w*r.w;return{x:r.x+p.x*r.w,y:r.y+p.y*r.h,w,h:w*(im?.height||1)/(im?.width||1),rotation:p.rotation||0};}
  function layerAppearance(c,l,seconds,box,draw,scene=current(),rows=18,still=false){
    const isPlaying=!still&&(playing||exporting);if(l.overlay){const start=C.clamp(l.appearAt||0,0,scene.duration),end=Math.min(scene.duration,start+C.clamp(l.visibleFor??scene.duration,.1,30));if((still||isPlaying||selectedComponent!==l.id)&&(seconds<start||seconds>=end))return;seconds=Math.max(0,seconds-start);}
    const layerDuration=l.overlay?Math.max(.1,Math.min(l.visibleFor??scene.duration,scene.duration-(l.appearAt||0))):scene.duration;
    const fx=T.effects({...l,effect:l.inheritSceneEffect?scene.effect:l.effect,template:l.fx}),id=l.fx||'none',animated=isPlaying,p=animated?T.progress(seconds,fx.start,fx.length):1;
    c.save();
    if(['pencil','brush','wipe','before'].includes(id)&&p<1){c.beginPath();if(['wipe','before'].includes(id))c.rect(box.x-2,box.y-2,(box.w+4)*p,box.h+4);else revealPath(c,box,p,l.rows||rows);c.clip();}
    if(animated&&id==='orbit')c.translate(Math.sin(seconds*1.2)*12,Math.cos(seconds)*8);if(animated&&id==='polaroid'){c.translate(box.x+box.w/2,box.y+box.h/2);c.rotate(Math.sin(seconds)*.035);c.translate(-box.x-box.w/2,-box.y-box.h/2);}if(animated&&id==='countdown')c.globalAlpha*=T.progress(seconds,fx.count||3,fx.soft);if(['fade','pulse'].includes(id))c.globalAlpha*=p;if(animated&&l.entryFx&&l.entryFx!=='none'){const e=T.progress(seconds,fx.start,fx.soft);if(l.entryFx==='fade')c.globalAlpha*=e;if(l.entryFx==='slide')c.translate((1-e)*150,0);if(l.entryFx==='zoom'){c.translate(box.x+box.w/2,box.y+box.h/2);c.scale(.7+.3*e,.7+.3*e);c.translate(-box.x-box.w/2,-box.y-box.h/2);}}if(animated&&l.exitFx&&l.exitFx!=='none'){const e=T.progress(seconds,layerDuration-fx.soft,fx.soft);if(l.exitFx==='fade')c.globalAlpha*=1-e;if(l.exitFx==='slide')c.translate(e*150,0);if(l.exitFx==='zoom'){c.globalAlpha*=1-e;c.translate(box.x+box.w/2,box.y+box.h/2);c.scale(1+.3*e,1+.3*e);c.translate(-box.x-box.w/2,-box.y-box.h/2);}}
    if(id==='slide')c.translate((1-p)*120,0);
    if(id==='zoom'||id==='pulse'){const z=id==='zoom'?1+(fx.zoom-1)*p:.8+.2*p;c.translate(box.x+box.w/2,box.y+box.h/2);c.scale(z,z);c.translate(-box.x-box.w/2,-box.y-box.h/2);}
    if(fx.exit&&animated)c.globalAlpha*=1-T.progress(seconds,layerDuration-fx.soft,fx.soft);
    draw();if(id==='mirror'){c.save();c.translate(box.x*2+box.w,0);c.scale(-1,1);c.globalAlpha*=.45;draw();c.restore();}if(id==='spotlight'&&animated){c.globalCompositeOperation='source-atop';const g=c.createRadialGradient(box.x+box.w*p,box.y+box.h/2,0,box.x+box.w*p,box.y+box.h/2,box.w*.4);g.addColorStop(0,'#fff6c344');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(box.x,box.y,box.w,box.h);}c.restore();
    if(animated&&['pencil','brush'].includes(id)&&p>0&&p<1){const pt=C.pencilPoint(p,box,l.rows||rows);drawPencil(c,pt.x,pt.y,'SALMOS',id==='brush');}
  }
  function paintScene(c,s,progress,W,H,showGuides=false,{style=project,read=asset,still=false,previewMotion=false}={}){
    migrateScene(s,style);const h=H/W*720,seconds=progress*s.duration,colors=C.palettes[s.backgroundPalette||style.palette]||C.palettes.pink,animated=previewMotion||!still&&(playing||exporting),fx=T.effects(s);c.save();c.scale(W/720,W/720);
    const bg=c.createLinearGradient(0,0,720,h);bg.addColorStop(0,colors[0]);bg.addColorStop(1,colors[1]);c.fillStyle=bg;c.fillRect(0,0,720,h);
    const backdrop=s.background||(s.giphy?giphyRuntime.get(s.id)?.src:null);if(backdrop){const im=read(backdrop,isVideoSource(backdrop)),frame=im?.frame?im.frame(seconds):im;if(frame&&(im.complete||im.readyState>=2)){const iw=im.videoWidth||im.width,ih=im.videoHeight||im.height;if(iw&&ih){const k=Math.max(720/iw,h/ih);c.drawImage(frame,(720-iw*k)/2,(h-ih*k)/2,iw*k,ih*k);}}}
    paintBackdrop(c,{...s,bgMotion:s.motionOverlay19??s.bgMotion},animated||still?seconds:performance.now()/1000,720,h);const area={x:25,y:65,w:670,h:h-130},im=s.video?read(s.video,true):s.base?read(s.base):s.final?read(s.final):null,r=im?((s.video&&s.videoFullFrame21)||s.fullFrameImage21?fitRect(im,0,0,720,h):fitRect(im,area.x,area.y,area.w,area.h)):area;
    if(s.framing>1){const k=s.framing;r.x-=r.w*(k-1)/2;r.y-=r.h*(k-1)/2;r.w*=k;r.h*=k;}const target=s.components.find(x=>x.id===s.focusComponent),b=target?layerRect(target,r,720,h,read):{x:r.x+r.w*.25,y:r.y+r.h*.2,w:r.w*.5,h:r.h*.5};
    const focus=s.focus?{x:r.x+s.focus.x*r.w,y:r.y+s.focus.y*r.h}:{x:b.x+b.w/2,y:b.y+b.h/2};
    c.save();if(animated){const p=T.progress(seconds,fx.start,fx.length);if(s.entryFx==='fade')c.globalAlpha*=T.progress(seconds,0,fx.soft);if(s.entryFx==='slide')c.translate((1-T.progress(seconds,0,fx.soft))*740,0);if(s.exitFx==='fade')c.globalAlpha*=1-T.progress(seconds,s.duration-fx.soft,fx.soft);if(s.exitFx==='slide')c.translate(T.progress(seconds,s.duration-fx.soft,fx.soft)*740,0);if(s.entryFx==='zoom'||s.exitFx==='zoom'){const z=s.entryFx==='zoom'?.75+.25*T.progress(seconds,0,fx.soft):1;const out=s.exitFx==='zoom'?T.progress(seconds,s.duration-fx.soft,fx.soft):0;c.translate(360,h/2);c.scale(z*(1+.25*out),z*(1+.25*out));c.translate(-360,-h/2);if(out)c.globalAlpha*=1-out;}if(s.template==='zoom'){c.translate(area.x+area.w/2,area.y+area.h/2);c.scale(1+(fx.zoom-1)*p,1+(fx.zoom-1)*p);c.translate(-focus.x,-focus.y);}if(s.template==='slide')c.translate((1-p)*740,0);if(['pulse','fade'].includes(s.template)||fx.enter)c.globalAlpha*=T.progress(seconds,fx.start,fx.soft);if(fx.exit)c.globalAlpha*=1-T.progress(seconds,s.duration-fx.soft,fx.soft);if(s.template==='orbit')c.translate(Math.sin(progress*Math.PI*2)*13,Math.sin(progress*Math.PI)*-10);if(s.template==='polaroid'){c.translate(360,h/2);c.rotate(-.025+.05*C.ease(progress));c.translate(-360,-h/2);}}
    if(s.groundSupport&&im&&(!s.video||s.wanKey24)){const support=s.wanKey24?(s.beforeWan21?.scene?.base||s.beforeWan21?.scene?.final):null;paintGround10(c,s,(support&&read(support))||im,r,720,h);}const matrix=c.getTransform();componentGeometry=[];
    const back=s.template==='mirror'&&s.back?read(s.back):null;
    if(im&&back?.complete&&back.width){const left=fitRect(im,area.x,area.y,area.w/2-10,area.h),right=fitRect(back,area.x+area.w/2+10,area.y,area.w/2-10,area.h);const front=(s.final&&read(s.final))||im;drawFit(c,front,left);drawFit(c,back,right);}
    else{
      if(im&&(!s.video||im.readyState>=2)){if(s.video&&s.wanKey24)drawKeyed24(c,im,r,s.wanKey24);else drawFit(c,im.frame?im.frame(seconds):im,r);}else{c.fillStyle=colors[3];c.font='22px Arial';c.textAlign='center';c.fillText('Elegí tu producto de SALMOS',360,h/2);}
      for(const l of s.components.filter(x=>x.kind!=='text'&&!x.hidden&&!(blankPreview&&!animated&&!still))){const image=componentImage(l,read);if(!image?.complete||!(image.naturalWidth||image.width))continue;const box=layerRect(l,r,720,h,read);layerAppearance(c,l,seconds,box,()=>{if(l.baked)drawFit(c,image,r);else{c.save();c.translate(box.x+box.w/2,box.y+box.h/2);c.rotate(box.rotation*Math.PI/180);c.drawImage(image,-box.w/2,-box.h/2,box.w,box.h);c.restore();}},s,18,still);componentGeometry.push({id:l.id,box,matrix});}
    }
    if(animated&&s.template==='spotlight'){const gx=r.x+r.w*progress,g=c.createRadialGradient(gx,r.y+r.h*.4,0,gx,r.y+r.h*.4,r.w*.65);g.addColorStop(0,'#ffffff55');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(r.x,r.y,r.w,r.h);}
    if(animated&&s.template==='countdown'){const end=fx.start+fx.count*3,p=T.progress(seconds,end,fx.soft);if(p<1){c.fillStyle=`rgba(60,20,45,${.9*(1-p)})`;c.fillRect(area.x,area.y,area.w,area.h);c.fillStyle='#fff0f7';c.font='bold 130px Arial';c.textAlign='center';c.fillText(String(Math.max(1,3-Math.floor(Math.max(0,seconds-fx.start)/fx.count))),360,h/2);}}
    if(!animated&&showGuides){c.save();c.strokeStyle='#c9689b80';c.setLineDash([7,7]);c.lineWidth=1;c.beginPath();c.moveTo(r.x+r.w/2,r.y);c.lineTo(r.x+r.w/2,r.y+r.h);c.moveTo(r.x,r.y+r.h/2);c.lineTo(r.x+r.w,r.y+r.h/2);c.stroke();c.restore();}
    c.restore();lastGeometry={r,b,matrix,scale:W/720};
    const stageMatrix=c.getTransform();for(const l of s.components.filter(x=>x.kind==='text'&&!x.hidden)){const image=componentImage(l,read);if(!image?.complete||!(image.naturalWidth||image.width))continue;const box=layerRect(l,r,720,h,read);layerAppearance(c,l,seconds,box,()=>{c.save();c.translate(box.x+box.w/2,box.y+box.h/2);c.rotate(box.rotation*Math.PI/180);c.drawImage(image,-box.w/2,-box.h/2,box.w,box.h);c.restore();},s,18,still);componentGeometry.push({id:l.id,box,matrix:stageMatrix});}
    if(!animated&&!still){const selected=componentGeometry.find(x=>x.id===selectedComponent);if(selected){c.save();const m=selected.matrix,scale=W/720;c.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);if(selectedLayer()?.production){c.strokeStyle='#b8387c';c.lineWidth=2;c.strokeRect(selected.box.x,selected.box.y,selected.box.w,selected.box.h);}else drawStampBox(c,selected.box,selected.box.rotation);c.restore();}}
    c.restore();
  }
  function componentPointer(event){if(playing||exporting||event.button!==0)return;const rect=canvas.getBoundingClientRect(),pixel={x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};if(focusPicking&&lastGeometry){const p=lastGeometry.matrix.inverse().transformPoint(pixel);checkpoint();const focus={x:C.clamp((p.x-lastGeometry.r.x)/lastGeometry.r.w),y:C.clamp((p.y-lastGeometry.r.y)/lastGeometry.r.h)};for(const scene of scopeScenes())scene.focus={...focus};focusPicking=false;changed();return;}
    let hit=null,handle=-1;
    const selected=componentGeometry.find(x=>x.id===selectedComponent);if(selected&&!selectedLayer()?.production){const p=selected.matrix.inverse().transformPoint(pixel),pts=T.points(selected.box,selected.box.rotation);handle=pts.findIndex(q=>{const screen=selected.matrix.transformPoint(q);return Math.hypot((screen.x-pixel.x)*rect.width/canvas.width,(screen.y-pixel.y)*rect.height/canvas.height)<14;});if(handle>=0)hit=selected;}
    if(!hit)for(const g of [...componentGeometry].reverse()){const p=g.matrix.inverse().transformPoint(pixel),b=g.box,a=-(b.rotation||0)*Math.PI/180,dx=p.x-b.x-b.w/2,dy=p.y-b.y-b.h/2;if(Math.abs(dx*Math.cos(a)-dy*Math.sin(a))<=b.w/2&&Math.abs(dx*Math.sin(a)+dy*Math.cos(a))<=b.h/2){hit=g;break;}}
    if(!hit){setSelection(null);return;}if(hit.id!==selectedComponent)setSelection(hit.id);const layer=selectedLayer();if(layer.production)return;checkpoint();const p=hit.matrix.inverse().transformPoint(pixel);componentDrag={id:layer.id,mode:handle===4?'rotate':handle>=0?'resize':'move',corner:handle,g:hit,start:p,original:structuredClone(layer)};canvas.setPointerCapture(event.pointerId);canvas.focus();event.preventDefault();
  }
  function componentMove(event){canvas.style.cursor=componentDrag?'grabbing':'pointer';if(!componentDrag)return;const d=componentDrag,l=selectedLayer();if(!l||l.id!==d.id)return;const rect=canvas.getBoundingClientRect(),p=d.g.matrix.inverse().transformPoint({x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}),b=d.g.box,base=lastGeometry.r,h=dimensions().h,o=d.original;
    if(d.mode==='rotate'){const cx=b.x+b.w/2,cy=b.y+b.h/2,a=(Math.atan2(p.y-cy,p.x-cx)-Math.atan2(d.start.y-cy,d.start.x-cx))*180/Math.PI+(b.rotation||0),rotation=event.shiftKey?Math.round(a/15)*15:a;if(l.kind==='text')l.rotation=rotation;else l.placement.rotation=rotation;}
    else if(d.mode==='resize'){const frame=l.kind==='text'?{x:0,y:0,w:720,h}:base,placement=l.kind==='text'?{x:o.x,y:o.y,w:o.w,rotation:o.rotation||0}:o.placement,next=T.resize(placement,frame,b.w/b.h,d.corner,p);if(l.kind==='text')Object.assign(l,{x:next.x,y:next.y,w:next.w});else l.placement=next;}
    else if(l.kind==='text'){l.x=C.clamp(o.x+(p.x-d.start.x)/720,-.5,1);l.y=C.clamp(o.y+(p.y-d.start.y)/h,-.5,1);}else l.placement={...o.placement,x:o.placement.x+(p.x-d.start.x)/base.w,y:o.placement.y+(p.y-d.start.y)/base.h};draw();
  }
  function componentUp(event){
    if(!componentDrag)return;
    const source=selectedLayer(),original=componentDrag.original;
    componentDrag=null;
    if(source?.id===original.id){
      const targets=event.type==='pointercancel'?[]:scopedLayers(source);
      const keys=source.kind==='text'?['x','y','w','rotation']:['placement'];
      for(const {layer} of targets)for(const key of keys)layer[key]=structuredClone(source[key]);
      if(!targets.some(row=>row.layer===source))for(const key of keys)source[key]=original[key];
    }
    syncForm();changed();
  }
  async function addTextLayer(text='Tu texto'){
    try{await addLayerInScope(textComponent(text));$('#layerText').focus();$('#layerText').select();}
    catch(error){notify(error.message,'error');}
  }
  async function addPrint(src,name,overlay=false){
    await asset(src)._ready;
    await addLayerInScope({kind:'print',src,name,overlay,appearAt:0,placement:{x:.3,y:.25,w:.4,rotation:0},fx:'none',effect:{start:0,length:1.5,soft:.5}});
  }
  function syncComponents(){
    if(!$('#componentList'))return;migrateScene(current());if(selectedComponent&&!selectedLayer())selectedComponent=null;
    const host=$('#componentList');host.replaceChildren();const whole=document.createElement('button');whole.textContent='◉ Toda la escena';whole.classList.toggle('active',!selectedLayer());whole.onclick=()=>setSelection(null);host.append(whole);
    for(const l of current().components){const b=document.createElement('button');b.textContent=(l.kind==='text'?'T · ':'✥ · ')+(l.text||l.name||'Estampa').slice(0,38);b.classList.toggle('active',l.id===selectedComponent);b.onclick=()=>setSelection(l.id);host.append(b);}
    const l=selectedLayer();$('#layerTextTools').hidden=l?.kind!=='text';$('#componentActions').hidden=!l;$('#centerComponent').disabled=!!l?.production;$('#duplicateComponent').disabled=!!l?.production;$('#zoomToComponent').hidden=l?.kind!=='print';$('#componentInfo').textContent=l?.production?'Conserva tamaño, posición, giro y superficie de Producción'+(l.widthCm?' · '+l.widthCm+' × '+l.heightCm+' cm':'')+'. Elegí su efecto.':l?.merged?'Esta imagen agrupa las estampas. Para elegirlas por separado, traé las capas de Producción.':l?'Mové el recuadro, sus esquinas o el punto de giro.':'Elegí una estampa o texto en la imagen o acá arriba para darle su efecto.';
    if(l?.kind==='text'){if(document.activeElement!==$('#layerText'))$('#layerText').value=l.text;$('#layerColor').value=l.color;$('#layerBold').classList.toggle('active',l.bold);$('#layerItalic').classList.toggle('active',l.italic);$('#fontGallery').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.fontId===l.fontId));}
    $('#effectTargetName').textContent=l?'Efecto de '+(l.text||l.name||'este componente').slice(0,45):'Efecto de toda la escena';
    for(const b of $$('[data-template]')){const id=b.dataset.template;b.hidden=l?!componentEffects.some(x=>x[0]===id):!C.templates.some(t=>t.id===id);b.classList.toggle('active',id===targetTemplate());}
    const fx=T.effects({...effectTarget(),template:targetTemplate()});for(const el of $$('[data-effect]'))valueTo(el,fx[el.dataset.effect]);
    for(const [id,visible]of [['effectStart',['pencil','brush','wipe','before','fade','zoom','slide','pulse','spotlight','countdown'].includes(targetTemplate())],['effectLength',['pencil','brush','wipe','before','fade','zoom','slide','pulse'].includes(targetTemplate())],['effectZoom',targetTemplate()==='zoom'],['effectCount',!l&&targetTemplate()==='countdown'],['rows',['pencil','brush'].includes(targetTemplate())]])$('#'+id).closest('label').hidden=!visible;
    $('#rows').value=effectTarget().rows||18;$('#pencilText').closest('label').hidden=true;$('#placementHelp').textContent='';$('#effectSettingsBody').hidden=targetTemplate()==='none';$('#effectSoft').closest('label').hidden=!['fade','pulse','countdown'].includes(targetTemplate());
    for(const b of $$('[data-select-value]')){const select=$('#'+b.dataset.selectId);b.classList.toggle('active',select?.value===b.dataset.selectValue);b.disabled=select?.disabled;}
    $$('[data-number-for]').forEach(out=>{const input=$('#'+out.dataset.numberFor);out.textContent=Number(input.value).toFixed(input.step.includes('.')?Math.min(2,input.step.split('.')[1].length):0);});
  }

  function pillSelect(id){const select=$('#'+id);if(!select||select.dataset.pills)return;select.dataset.pills='1';select.hidden=true;const host=document.createElement('div');host.className='choice-buttons';host.setAttribute('role','group');host.setAttribute('aria-label',select.closest('label')?.childNodes[0]?.textContent||id);select.after(host);function rebuild(){host.replaceChildren();for(const option of select.options){const b=document.createElement('button');b.type='button';b.dataset.selectId=id;b.dataset.selectValue=option.value;b.textContent=option.textContent;b.onclick=async()=>{if(id==='transition')beginEffectTrial11();select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));host.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));syncComponents();if(id==='ttsVoice'){b.disabled=true;try{const ready=await generateTts(false);if(ready){pause();time=0;await play();}}finally{b.disabled=false;}}if(id==='transition')replayScene11();};b.classList.toggle('active',option.value===select.value);b.disabled=select.disabled;host.append(b);}}rebuild();new MutationObserver(rebuild).observe(select,{childList:true});}
  function compactNumbers(){for(const input of $$('input[type="number"],#musicVolume')){if(input.closest('.number-stepper'))continue;const range=input.type==='range';if(range){input.type='number';input.max='2';input.step='.05';}const wrapper=document.createElement('span');wrapper.className='number-stepper';input.before(wrapper);const minus=document.createElement('button'),plus=document.createElement('button');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';minus.setAttribute('aria-label','Disminuir '+input.closest('label').childNodes[0].textContent);plus.setAttribute('aria-label','Aumentar '+input.closest('label').childNodes[0].textContent);for(const[b,delta]of[[minus,-1],[plus,1]])b.onclick=()=>{input.focus();const step=Number(input.step)||1,next=Math.min(input.max===''?Infinity:Number(input.max),Math.max(input.min===''?-Infinity:Number(input.min),Number(input.value)+step*delta));input.value=String(Math.round(next*1000)/1000);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};wrapper.append(minus,input,plus);}}
  function tidyEditor(){
    const editor=$('[data-panel="editor"]'),createFold=(title,open=false)=>{const d=document.createElement('details');d.className='editor-fold';d.open=open;const summary=document.createElement('summary');summary.textContent=title;const body=document.createElement('div');body.className='details-body';d.append(summary,body);return[d,body];};
    const archive=document.createElement('div');archive.hidden=true;archive.id='legacyControls';document.body.append(archive);
    const intro=editor.querySelector('.intro');intro.textContent='Elegí el producto que ya armaste en Producción. Sus estampas conservan medidas, posiciones y superficie. Después tocá cada componente para animarlo.';
    const [product,pb]=createFold('1 · Producto y vistas',true),source=document.createElement('div');source.className='button-row';source.innerHTML='<button id="chooseSavedProduct" class="primary">♡ Elegir producto de SALMOS</button><button id="chooseBaseAsset">Fotos lisas de SALMOS</button>';pb.append(source);pb.append($('#importProduction'));const [files,fb]=createFold('O subir archivos de mi PC');fb.append(editor.querySelector('.upload-grid'));const more=[...editor.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Más imágenes y clips');fb.append(more);pb.append(files);editor.querySelector('button[style]')?.remove();
    const [layers,lb]=createFold('2 · Componentes y textos',true);lb.innerHTML='<div class="button-row"><button id="addTextLayer">T + Agregar texto</button><button id="choosePrintAsset">✥ + Estampa de SALMOS</button><label class="file-button">✥ + Subir estampa<input id="componentFile" type="file" accept="image/png,image/webp"></label></div><div id="componentList" class="component-list"></div><p id="componentInfo" class="hint"></p><div id="layerTextTools" hidden><textarea id="layerText" rows="2" maxlength="1000" aria-label="Texto seleccionado"></textarea><div class="button-row"><button id="showFonts">F · Fuentes</button><button id="layerBold"><b>B</b></button><button id="layerItalic"><i>I</i></button><label class="color-button">Color <input id="layerColor" type="color" value="#34242f"></label></div><div id="fontGallery" class="font-gallery" hidden></div></div><div id="componentActions" class="button-row" hidden><button id="duplicateComponent">Duplicar</button><button id="centerComponent">Centrar ↔</button><button id="zoomToComponent">Zoom de cámara a esta estampa</button><button id="componentBefore">Bajar capa</button><button id="componentAfter">Subir capa</button><button id="hideComponent">Mostrar / ocultar</button><button id="deleteComponent" class="danger">Eliminar componente</button></div>';
    const [look,eb]=createFold('3 · Efectos',true);eb.innerHTML='<strong id="effectTargetName">Efecto de toda la escena</strong>';editor.append(look);eb.append($('#templates'));for(const[id,name]of componentEffects.filter(([id])=>!C.templates.some(t=>t.id===id))){const b=document.createElement('button');b.dataset.template=id;b.textContent=name;$('#templates').append(b);}
    const effects=editor.querySelector('.effect-settings'),effectBody=effects.querySelector('.details-body');effectBody.id='effectSettingsBody';eb.append(effectBody);effects.remove();eb.append($('#duration').closest('label'));
    const oldText=[...editor.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Texto, marca y cierre');archive.append(oldText);const [brand,bb]=createFold('Marca del video');bb.append($('#showBrand').closest('label'));if($('#logoFile'))bb.append($('#logoFile').closest('label'),$('#removeLogo'));layers.append(brand);
    const bg=[...editor.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='❀ Fondo de la escena');bg.classList.add('editor-fold');bg.querySelector('summary').textContent='4 · Fondo y vistas';bg.querySelector('.details-body').prepend($('#palette').closest('label'));const backLabel=$('#backFile').closest('label');backLabel.prepend(Object.assign(document.createElement('small'),{textContent:'Si Producción tiene la espalda del mismo modelo y variante, se trae automáticamente. También podés elegirla como otra escena desde el producto.'}));
    const [format,formatBody]=createFold('Formato y transición');formatBody.append($('#ratio').closest('label'),$('#transition').closest('label'));editor.querySelector(':scope > .form-grid')?.remove();editor.querySelector('.section-label')?.remove();editor.append(product,layers,look,bg,format);$('#shotHelp').hidden=true;
    $('.stage-tools').hidden=true;
    $('#chooseSavedProduct').onclick=chooseProduct;$('#chooseBaseAsset').onclick=()=>chooseAsset('base');$('#choosePrintAsset').onclick=()=>chooseAsset('design');$('#componentFile').onchange=async e=>{try{const f=e.target.files[0];if(f)await addPrint(await fileData(f),f.name);}catch(err){notify(err.message,'error');}e.target.value='';};
    $('#addTextLayer').onclick=()=>addTextLayer();const textInput=$('#layerText');textInput.onfocus=()=>textInput._before=structuredClone(project);textInput.oninput=async()=>{const l=selectedLayer();if(l?.kind!=='text')return;await Promise.all(scopedLayers(l).map(async ({layer})=>{layer.text=textInput.value;layer.name=layer.text;await renderTextLayer(layer);}));changed();};textInput.onchange=()=>{checkpoint(textInput._before||project);textInput._before=null;syncForm();};
    const gallery=$('#fontGallery');for(const f of window.SalmosText.fonts){const b=document.createElement('button');b.type='button';b.textContent=f.name;b.style.fontFamily='"'+f.family+'"';b.dataset.fontId=f.id;b.onclick=async()=>{const l=selectedLayer();if(l?.kind!=='text')return;checkpoint();await Promise.all(scopedLayers(l).map(async ({layer})=>{layer.fontId=f.id;await renderTextLayer(layer);}));syncForm();changed();};gallery.append(b);}$('#showFonts').onclick=()=>gallery.hidden=!gallery.hidden;
    for(const[id,key]of[['layerBold','bold'],['layerItalic','italic']])$('#'+id).onclick=async()=>{const l=selectedLayer();if(!l)return;checkpoint();const value=!l[key];await Promise.all(scopedLayers(l).map(async ({layer})=>{layer[key]=value;await renderTextLayer(layer);}));syncForm();changed();};$('#layerColor').oninput=async e=>{const l=selectedLayer();if(!l)return;if(!e.target._before)e.target._before=structuredClone(project);await Promise.all(scopedLayers(l).map(async ({layer})=>{layer.color=e.target.value;await renderTextLayer(layer);}));changed();};$('#layerColor').onchange=e=>{checkpoint(e.target._before||project);e.target._before=null;syncForm();};
    $('#zoomToComponent').onclick=()=>{if(!selectedLayer())return;checkpoint();current().focusComponent=selectedComponent;current().focus=null;current().template='zoom';current().effect={...T.effects(current()),zoom:3};selectedComponent=null;syncForm();changed();};$('#deleteComponent').onclick=()=>{if(!selectedLayer())return;checkpoint();current().components=current().components.filter(x=>x.id!==selectedComponent);selectedComponent=null;syncForm();changed();};$('#duplicateComponent').onclick=()=>{const l=selectedLayer();if(!l||current().components.length>=30)return;checkpoint();const copy=structuredClone(l);copy.id=C.uid();if(copy.kind==='text'){copy.x+=.03;copy.y+=.03;}current().components.push(copy);selectedComponent=copy.id;syncForm();changed();};$('#hideComponent').onclick=()=>{const l=selectedLayer();if(!l)return;checkpoint();const hidden=!l.hidden;for(const {layer} of scopedLayers(l))layer.hidden=hidden;syncForm();changed();};$('#centerComponent').onclick=()=>{const l=selectedLayer();if(!l||l.production)return notify('La ubicación de esta estampa se conserva de Producción.');checkpoint();if(l.kind==='text')l.x=(1-l.w)/2;else l.placement.x=(1-l.placement.w)/2;syncForm();changed();};for(const[id,delta]of[['componentBefore',-1],['componentAfter',1]])$('#'+id).onclick=()=>{const a=current().components,i=a.findIndex(x=>x.id===selectedComponent),j=i+delta;if(i<0||j<0||j>=a.length)return;checkpoint();[a[i],a[j]]=[a[j],a[i]];syncForm();changed();};
    for(const b of $$('[data-template]'))b.onclick=()=>{pause();checkpoint();const l=selectedLayer(),id=b.dataset.template;if(l){l.inheritSceneEffect=false;l.fx=id;l.effect={...T.effects({...l,template:id})};}else{current().template=id;if(['pencil','brush','wipe','before'].includes(id))for(const print of current().components.filter(x=>x.kind==='print')){print.fx=id;print.inheritSceneEffect=true;}current().effect={...T.effects({...current(),template:id})};}syncForm();changed();time=project.scenes.slice(0,active).reduce((n,s)=>n+s.duration,0);play();};
    for(const input of $$('[data-effect]')){input.onfocus=()=>input._before=structuredClone(project);input.oninput=()=>{pause();beginEffectTrial11();const target=effectTarget();effectTrial.touched.add(target.id+':'+input.dataset.effect);target.effect={...T.effects(target),[input.dataset.effect]:checkedValue(input)};changed();};input.onchange=()=>{input._before=null;syncForm();changed();};}$('#rows').removeAttribute('data-scene');$('#rows').onchange=()=>{beginEffectTrial11();effectTarget().rows=Number($('#rows').value);syncForm();changed();};$('#resetEffect').onclick=()=>{cancelEffectTrial();checkpoint();const source=selectedLayer();for(const target of source?scopedLayers(source).map(row=>row.layer):scopeScenes())delete target.effect;syncForm();changed();};$('#previewEffect').textContent='OK';$('#previewEffect').onclick=()=>{pause();syncForm();changed();};
    for(const id of ['palette','ratio','transition','musicCatalog','musicGenre','musicVocals','ttsVoice','ttsPitch','quality','exportFormat','storyFilter','postChannel'])pillSelect(id);compactNumbers();
    const narrator=$('.narrator-card'),audioPanel=$('[data-panel="audio"]');audioPanel.querySelector('h1').after(narrator);const updater=document.createElement('a');updater.className='button';updater.href='INICIAR_SALMOS.bat?v=27.9';updater.download='INICIAR_SALMOS.bat';updater.textContent='Actualizar conexión local';narrator.querySelector('.button-row').append(updater);const connection=$('#helperUrl').closest('details');if(connection){connection.querySelector('summary').textContent='Si la conexión falla';$('#helperUrl').closest('label').hidden=true;connection.open=false;}$('#ttsStatus').textContent='La conexión de voz se comprueba sola al generar. Si está cerrada o es anterior, usá Actualizar conexión local y abrí el archivo descargado.';$('#connectLocal').textContent='Volver a comprobar conexión';
    for(const card of [...audioPanel.querySelectorAll('.audio-card')])if(card!==narrator&&!card.querySelector('#musicResults')){const heading=card.querySelector('h2'),[d,b]=createFold(heading.textContent,true);heading.remove();b.append(...card.childNodes);card.replaceChildren(d);}
    $('#musicCatalog').dispatchEvent(new Event('change'));$('#musicListen').before(Object.assign(document.createElement('p'),{className:'hint',textContent:'Para escuchar el volumen final usá Escuchar con mi video. La música puede subir hasta 200%. La opción Bajar música reduce suavemente el fondo mientras habla la voz.'}));
    const trial=document.createElement('div');trial.id='musicTrialBar';trial.hidden=true;trial.className='note';trial.innerHTML='<strong id="musicTrialName"></strong><button id="cancelMusicTrial">Terminar prueba y volver a mi música</button>';$('#musicResults').before(trial);$('#cancelMusicTrial').onclick=cancelMusicTrial;$('#playMix').onclick=async()=>{pause();time=0;await play();};$('#stopMix').onclick=pause;$('#saveMusicLibrary').onclick=()=>{if(!project.audio.music||musicTrial)return notify('Elegí una pista antes de guardarla.');libraryTracks=readTracks();if(libraryTracks.some(x=>x.src===project.audio.music))return notify('Ya está guardada.');if(libraryTracks.length>=12)return notify('El listado admite 12 canciones.');try{libraryTracks.push({id:C.uid(),name:project.audio.musicName,src:project.audio.music,genre:$('#musicGenre').value==='all'?'pop':$('#musicGenre').value,vocals:$('#musicVocals').value==='all'?'instrumental':$('#musicVocals').value});writeTracks();notify('Canción guardada en este navegador.');}catch{libraryTracks.pop();notify('No hay espacio. Descargá tu proyecto para conservar el audio.','error');}};
    $('#ttsExample').onclick=async()=>{const id=$('#ttsVoice').value,a=$('#ttsAudition');pause();if(!/^edge:es-(AR|MX)-(Elena|Tomas|Dalia|Jorge)Neural$/.test(id))return notify('Para esta voz usá Escuchar muestra con tu texto.');a.src='muestras/'+id.slice(8)+'.mp3';a.hidden=false;await a.play();};$('#ttsSample').onclick=()=>generateTts(true);$('#tts').onclick=()=>generateTts(false);$('#downloadVoice').onclick=async()=>{if(!project.audio.voice)return notify('Primero generá una voz.');const blob=await(await fetch(project.audio.voice)).blob();download(blob,'SALMOS-narracion.'+(blob.type.includes('mpeg')?'mp3':blob.type.includes('webm')?'webm':'wav'));};
  }
  async function chooseProduct(){let dialog;try{const products=await requestParent('catalog');dialog=document.createElement('dialog');dialog.className='source-dialog';const title=document.createElement('h2');title.textContent='Tu producto de SALMOS';const search=document.createElement('input');search.type='search';search.placeholder='Buscar producto…';search.setAttribute('aria-label','Buscar producto');const list=document.createElement('div');list.className='source-grid';const status=document.createElement('p');status.className='hint';status.textContent='Elegí un producto para ver todas sus imágenes. No se modifica Producción.';const close=document.createElement('button');close.textContent='Cerrar';close.onclick=()=>dialog.close();const paint=()=>{list.replaceChildren();products.filter(p=>String(p.name).toLowerCase().includes(search.value.toLowerCase())).slice(0,120).forEach(p=>{const b=document.createElement('button');b.textContent=p.name;b.onclick=()=>showViews(p);list.append(b);});};async function showViews(p){status.textContent='Buscando las vistas de '+p.name+'…';const data=await requestParent('productViews',{productId:p.id});list.replaceChildren();title.textContent=data.name;const back=document.createElement('button');back.textContent='← Otros productos';back.onclick=()=>{title.textContent='Tu producto de SALMOS';paint();};list.append(back);if(!data.views.length)status.textContent='Este producto no tiene imágenes guardadas.';else status.textContent='Foto final: animás la imagen completa. Capas de Producción: elegís cada estampa con su tamaño y superficie ya preparados. Podés agregar varias vistas como escenas.';for(const view of data.views){const card=document.createElement('article'),img=document.createElement('img');img.src=view.url;img.alt=view.name;img.loading='lazy';const label=document.createElement('strong');label.textContent=view.name;card.append(img,label);for(const[mode,text]of[['final','Usar foto final'],...(view.layers?[['layers','Animar '+view.layers+' capa(s) de Producción']]:[])]){const b=document.createElement('button');b.textContent=text;b.onclick=async()=>{b.disabled=true;status.textContent='Preparando esta vista…';try{const payload=await requestParent('product',{productId:p.id,imageId:view.id,mode});if(current().sourceProductId===p.id&&!current().demo){if(project.scenes.length>=36)throw new Error('El máximo es de 12 escenas.');checkpoint();project.scenes.push({...defaultScene(),components:[],demo:false});active=project.scenes.length-1;}await importPayload(payload);status.textContent='Vista agregada. Elegí otra o tocá Cerrar.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};card.append(b);}if(!view.layers){const small=document.createElement('small');small.textContent='Guardada como imagen final; sin estampas separadas.';card.append(small);}list.append(card);}}search.oninput=paint;dialog.append(title,search,status,list,close);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);paint();dialog.showModal();}catch(e){dialog?.remove();notify(e.message,'error');}}
  async function chooseAsset(kind){let dialog;try{const items=await requestParent('assets',{kind});dialog=document.createElement('dialog');dialog.className='source-dialog';const title=document.createElement('h2');title.textContent=kind==='design'?'Tus estampas de SALMOS':'Modelos y productos lisos';const hint=document.createElement('p');hint.className='hint';hint.textContent=kind==='design'?'Agregá las estampas que necesites a esta escena. Para conservar posiciones y pliegues ya preparados, elegí Capas de Producción desde el producto.':'Estas imágenes ya están guardadas en SALMOS. Si el producto ya está armado, elegilo desde Producto de SALMOS para reutilizar sus estampas.';const search=document.createElement('input');search.type='search';search.placeholder='Buscar por nombre o color…';const list=document.createElement('div');list.className='source-grid';const close=document.createElement('button');close.textContent='Cerrar';close.onclick=()=>dialog.close();const paint=()=>{list.replaceChildren();for(const item of items.filter(x=>(x.name+' '+x.color+' '+x.side+' '+x.type).toLowerCase().includes(search.value.toLowerCase())).slice(0,100)){const b=document.createElement('button'),img=document.createElement('img');if(item.url){img.src=item.url;img.alt=item.name;img.loading='lazy';b.append(img);}b.append(document.createTextNode(item.name+' '+(item.color||'')));b.onclick=async()=>{b.disabled=true;try{const data=await requestParent('asset',{kind,assetId:item.id});if(kind==='design')await addPrint(await blobData(data.blob),data.name);else{checkpoint();current().base=await blobData(data.blob);current().final=null;current().baseName=data.name;current().demo=false;current().components=[];await prepareMedia();syncForm();changed();}dialog.close();}catch(e){notify(e.message,'error');b.disabled=false;}};list.append(b);}};search.oninput=paint;dialog.append(title,hint,search,list,close);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());paint();dialog.showModal();}catch(e){dialog?.remove();notify(e.message,'error');}}
  async function importPayload(payload){pause();const read=async value=>value instanceof Blob?blobData(value):value||null;const base=await read(payload.base),final=await read(payload.final);if(!base&&!final)throw new Error('Esta vista no tiene imagen.');const components=[];for(const l of payload.components||[])components.push({...l,src:await read(l.src)});checkpoint();const s=current();Object.assign(s,{base,final,stamp:null,video:null,background:null,giphy:null,productionBackground:await read(payload.background),backgroundName:payload.backgroundName||'',back:await read(payload.back),components,sourceProductId:payload.productId||null,sourceViewKey:payload.viewKey||'',baseName:payload.name||'Producto de SALMOS',shotTitle:payload.name||'',demo:false,source:payload.source||'salmos',template:'none',headline:'',detail:'',cta:'',bounds:null,bgMotion:''});if(components.length){components[0].fx='none';components[0].effect={start:.1,length:1.6,soft:.5};}selectedComponent=components[0]?.id||null;await prepareMedia();time=project.scenes.slice(0,active).reduce((v,s)=>v+s.duration,0);syncForm();changed();setTab('editor');notify('Producto cargado.');}


  const soundCache=new Map(),soundNodes=new Map();
  async function soundBlob(kind,duration=0){const key=kind+':'+duration;if(!soundCache.has(key))soundCache.set(key,T.makeSound(kind,duration));return soundCache.get(key);}
  let selectedSound10=null,soundPreview10=null;
  function installSoundControls(){const host=$('#soundChoices'),controls=document.createElement('div');controls.id='soundSelectionControls';controls.className='selection-controls';controls.hidden=true;controls.innerHTML='<strong id="soundSelectionName"></strong><label>Duración (s)<input id="soundDuration10" type="number" min=".1" max="10" step=".1" value="1"></label><button id="soundPlay10" aria-label="Reproducir o pausar sonido">▶ / Ⅱ</button><button id="soundAdd10" aria-label="Agregar sonido"></button>';host.after(controls);$('#soundAdd10').innerHTML=icon10('check');
    for(const[id,name,duration]of[['whoosh','Barrido',.8],['pop','Pop',.4],['sparkle','Destellos',1.2],['pencil','Trazo',1.1],['click','Clic',.12],['bell','Campana',1.5],['impact','Golpe grave',1],['shutter','Cámara',.65]]){const row=document.createElement('div');row.className='sound-choice';row.dataset.kind=id;const choose=document.createElement('button');choose.className='audio-tile';choose.textContent=name;choose.onclick=()=>{soundPreview10?.pause();soundPreview10=null;if(selectedSound10?.id!==id)$('#soundDuration10').value=duration;selectedSound10={id,name};$('#soundSelectionName').textContent=name;controls.hidden=false;host.querySelectorAll('.audio-tile').forEach(b=>b.classList.toggle('active',b===choose));$('#soundPlay10').onclick().catch(e=>notify(e.message,'error'));};row.append(choose);host.append(row);}
    $('#soundPlay10').onclick=async()=>{if(!selectedSound10)return;if(soundPreview10&&!soundPreview10.paused){soundPreview10.pause();return;}soundPreview10=new Audio(await blobData(await soundBlob(selectedSound10.id,Number($('#soundDuration10').value))));await soundPreview10.play();};
    $('#soundAdd10').onclick=async()=>{
      if(!selectedSound10)return;
      const button=$('#soundAdd10'),{id,name}=selectedSound10,source=selectedLayer();
      const targets=source?scopedLayers(source):scopeScenes().map(scene=>({scene,layer:null}));
      if(!targets.length)return notify('La capa elegida está en otra escena.');
      if((project.audio.sfx||[]).length+targets.length>24)return notify('El reel admite hasta 24 sonidos.');
      button.disabled=true;
      try{
        const seconds=Number($('#soundDuration10').value),src=await blobData(await soundBlob(id,seconds));
        checkpoint();
        const group=C.uid();
        for(const {scene,layer} of targets)(project.audio.sfx??=[]).push({id:C.uid(),scopeSoundId:group,name,kind:id,src,sceneId:scene.id,componentId:layer?.id||null,targetName:layer?.name||layer?.text||'Escena',start:0,volume:1,rate:1,duration:seconds});
        renderSoundEvents();changed();await setupAudioElements();
        notify(`${name} agregado en ${targets.length} ${targets.length===1?'escena':'escenas'}.`);
      }catch(error){notify(error.message,'error');}
      finally{button.disabled=false;}
    };
    renderSoundEvents();
  }
  function renderSoundEvents(){const host=$('#soundEvents');if(!host)return;host._audio=project.audio;host.replaceChildren();for(const event of project.audio.sfx||[]){const row=document.createElement('div');row.className='sound-event';row.dataset.soundId=event.id;const name=document.createElement('strong');name.textContent=event.name+' · '+(event.targetName||'Reel');row.append(name);for(const[key,label,min,max,step]of[['start','Segundo',0,1080,.1],['volume','Volumen',0,2,.05],['rate','Velocidad',.5,2,.05],['duration','Duración (s)',0,10,.1]]){const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type='number';i.value=event[key]??0;i.min=min;i.max=max;i.step=step;i.dataset.soundId=event.id;i.dataset.soundKey=key;i.onchange=async()=>{
      const item=(project.audio.sfx||[]).find(row=>row.id===event.id);
      if(!item)return;
      const sceneIds=new Set(scopeScenes().map(scene=>scene.id));
      const targets=item.sceneId?project.audio.sfx.filter(row=>sceneIds.has(row.sceneId)&&(row.id===item.id||item.scopeSoundId&&row.scopeSoundId===item.scopeSoundId)):[item];
      if(!targets.length)return;
      const value=Number(i.value);
      try{
        const src=key==='duration'&&item.kind?await blobData(await soundBlob(item.kind,value)):null;
        checkpoint();
        for(const target of targets){target[key]=value;if(src)target.src=src;}
        if(src)await setupAudioElements();
        changed();
      }catch(error){notify(error.message,'error');}
    };l.append(i);row.append(l);}const del=document.createElement('button');del.textContent='×';del.title='Quitar '+event.name;del.onclick=()=>{checkpoint();project.audio.sfx=project.audio.sfx.filter(x=>x.id!==event.id);setupAudioElements();renderSoundEvents();changed();};const position=document.createElement('button');position.textContent='↔';position.title='Ubicar en la próxima transición';position.disabled=active>=project.scenes.length-1;position.onclick=()=>{checkpoint();const item=(project.audio.sfx||[]).find(x=>x.id===event.id);if(item)item.start=project.scenes.slice(0,active+1).reduce((sum,s)=>sum+s.duration,0);renderSoundEvents();changed();};row.append(position,del);host.append(row);}compactNumbers();}
  const setupAudioV4=setupAudioElements;setupAudioElements=async function(){await setupAudioV4();const events=project.audio.sfx||[];for(const[id,n]of soundNodes)if(!events.some(e=>e.id===id)){n.audio.pause();n.source?.disconnect();n.gain?.disconnect();soundNodes.delete(id);}await Promise.all(events.map(async event=>{if(soundNodes.has(event.id)){const old=soundNodes.get(event.id);if(old.audio.getAttribute('src')===event.src)return;old.audio.pause();old.source?.disconnect();old.gain?.disconnect();soundNodes.delete(event.id);}const audio=new Audio(event.src);audio.preload='auto';soundNodes.set(event.id,{audio});await new Promise((resolve,reject)=>{if(audio.readyState>=1)return resolve();audio.addEventListener('loadedmetadata',resolve,{once:true});audio.addEventListener('error',reject,{once:true});});}));};
  const connectAudioV4=connectAudio;connectAudio=async function(){await connectAudioV4();for(const node of soundNodes.values())if(!node.source){node.source=audioCtx.createMediaElementSource(node.audio);node.gain=audioCtx.createGain();node.source.connect(node.gain);node.gain.connect(master);}};
  const syncSoundV4=syncSound;syncSound=function(){syncSoundV4();for(const event of project.audio.sfx||[]){const node=soundNodes.get(event.id);if(!node)continue;const sceneIndex=project.scenes.findIndex(s=>s.id===event.sceneId);if(event.sceneId&&sceneIndex<0){node.audio.pause();continue;}const scene=project.scenes[sceneIndex],layer=scene?.components?.find(l=>l.id===event.componentId);if(event.componentId&&!layer){node.audio.pause();continue;}const offset=sceneIndex>=0?project.scenes.slice(0,sceneIndex).reduce((n,s)=>n+s.duration,0)+(layer?T.effects(layer).start:0):0;const pos=(time-offset-event.start)*(event.rate||1);node.audio.playbackRate=event.rate||1;node.audio.preservesPitch=false;const length=event.duration>0?event.duration:node.audio.duration/(event.rate||1),elapsed=time-offset-event.start;syncOneAudio(node.audio,Math.max(0,pos%node.audio.duration),elapsed>=0&&elapsed<length);if(node.gain)node.gain.gain.value=event.volume??.65;}};
  const stopSoundV4=stopSound;stopSound=function(){stopSoundV4();for(const node of soundNodes.values())node.audio.pause();};
  let activeDock='effects',blankPreview=false,viewZoom=1;
  function openDock(id){
    activeDock=id;
    document.querySelectorAll('[data-drawer]').forEach(el=>el.hidden=el.dataset.drawer!==id);
    document.querySelectorAll('[data-dock]').forEach(el=>el.classList.toggle('active',el.dataset.dock===id));
    watchReelSongs();
    if(id==='music')syncReelSongDuration();
  }
  function showMarketingSection(section){
    const home=$('#studioHome'),tabs=[...home.querySelectorAll('[data-home-tab]')];
    if(!tabs.some(button=>button.dataset.homeTab===section))section='videos';
    for(const button of tabs){
      const selected=button.dataset.homeTab===section;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex=selected?0:-1;
      $('#home-'+button.dataset.homeTab).hidden=!selected;
    }
    if(section==='canciones')audioStudioEditor?.activate();
    else audioStudioEditor?.deactivate();
    if(section==='ideas')mountContentIdeas($('#home-ideas'));
    home.scrollTop=0;
  }

  async function homeView(section='videos'){
    cancelEffectTrial();closeWanPreview();pause();
    if(editorActive13){
      try{await cancelMusicTrial();await flushReelAutosave();}catch(error){notify(error.message,'error');return;}
      editorActive13=false;
      flushReelBackups();
    }
    $('#studioHome').hidden=false;$('.workspace').hidden=true;document.body.classList.add('reel-home');
    watchReelSongs();
    showMarketingSection(section);
    if(section==='videos'||typeof section!=='string')await loadSaved().catch(error=>notify(error.message,'error'));
  }

  function editorView(ai=false){editorActive13=true;audioStudioEditor?.deactivate();closeWanPreview();document.body.classList.remove('reel-home');document.body.classList.toggle('wan-mode',ai);$('#studioHome').hidden=true;$('.workspace').hidden=false;document.querySelectorAll('[data-main-mode]').forEach(b=>b.classList.toggle('active',(b.dataset.mainMode==='wan')===ai));if(ai){openDock('wan');}else openDock(activeDock==='wan'?'effects':activeDock);draw();}
  function installProductionLayout(){
    document.body.classList.add('production-reels','reel-home');const hidden=document.createElement('div');hidden.hidden=true;hidden.id='oldReelsPanels';document.body.append(hidden);const work=$('.workspace'),preview=$('.preview-panel'),oldControls=$('.controls-panel'),resource=document.createElement('div'),rail=document.createElement('aside'),side=document.createElement('aside'),dock=document.createElement('section');resource.id='resourceRail';rail.id='viewRail';side.id='reelInspector';dock.id='reelDock';
    resource.innerHTML='<button id="chooseReelProducts" title="Elegir productos">＋ Productos</button><div id="sourceAssets"></div><div class="choice-buttons"><button id="showFinished" class="active">Estampadas</button><button id="showBlank">Lisas</button></div>';
    work.append(resource,rail,side,dock);const sceneList=$('#scenes'),sceneHeading=$('.scene-heading'),sceneOrder=$('.scene-order');rail.append(sceneHeading,sceneList,sceneOrder);side.append($('#componentList'),$('#componentInfo'),$('#componentActions'));$('#componentInfo').hidden=true;$('#componentActions').hidden=true;
    const textTools=$('#layerTextTools');dock.innerHTML='<div id="reelTextToolbar"></div><div id="dockButtons"></div><div id="dockDrawers"></div>';const tt=dock.querySelector('#reelTextToolbar');for(const node of [$('#addTextLayer'),$('#showFonts'),$('#layerBold'),$('#layerItalic'),$('#layerColor').closest('label'),$('#duplicateComponent')])tt.append(node);const caseButton=document.createElement('button');caseButton.textContent='Aa';caseButton.dataset.textControl='1';caseButton.onclick=async()=>{const l=selectedLayer();if(l?.kind!=='text')return;checkpoint();const upper=l.text!==l.text.toUpperCase();await Promise.all(scopedLayers(l).map(async ({layer})=>{layer.text=upper?layer.text.toUpperCase():layer.text.toLowerCase();layer.name=layer.text;await renderTextLayer(layer);}));syncForm();changed();};tt.append(caseButton);for(const[title,delta]of[['↶',-90],['↷',90],['0°',0]]){const b=document.createElement('button');b.dataset.textControl='1';b.textContent=title;b.title='Girar texto';b.onclick=()=>{const l=selectedLayer();if(l?.kind!=='text')return;checkpoint();for(const {layer} of scopedLayers(l))layer.rotation=delta?(layer.rotation||0)+delta:0;syncForm();changed();};tt.append(b);}tt.append($('#undo'),$('#redo'));const textEntry=$('#layerText'),fonts=$('#fontGallery');textTools.replaceChildren(textEntry,fonts);dock.insertBefore(textTools,dock.querySelector('#dockButtons'));
    const drawer=(id,label,icon)=>{const b=document.createElement('button');b.dataset.dock=id;b.innerHTML='<span>'+icon+'</span>'+label;b.onclick=()=>openDock(activeDock===id?'':id);dock.querySelector('#dockButtons').append(b);const d=document.createElement('div');d.dataset.drawer=id;d.hidden=true;dock.querySelector('#dockDrawers').append(d);return d;};
    const effects=drawer('effects','Efectos','✦');effects.append($('#templates'),$('#effectSettingsBody'));const duplicateEdges=$('#effectSettingsBody .check-row');if(duplicateEdges)hidden.append(duplicateEdges);const entry=drawer('entry','Entrada','⇥'),exit=drawer('exit','Salida','⇤');for(const [host,key]of[[entry,'entryFx'],[exit,'exitFx']]){host.className='choice-buttons';for(const[id,label]of[['none','Sin efecto'],['fade','Fundido'],['slide','Deslizar'],['zoom','Acercar']]){const b=document.createElement('button');b.dataset.edgeKey=key;b.dataset.edgeValue=id;b.textContent=label;b.onclick=()=>{checkpoint();effectTarget()[key]=id;syncForm();changed();};host.append(b);}}
    const transitions=drawer('transition','Transición','⇄');transitions.append($('#transition').closest('label'));const transLabel=document.createElement('label');transLabel.textContent='Duración del fundido';const ti=document.createElement('input');ti.id='transitionDuration';ti.type='number';ti.min='.3';ti.max='3';ti.step='.1';ti.value=project.transitionDuration||1.1;ti.onchange=()=>{checkpoint();project.transitionDuration=Number(ti.value);changed();};transLabel.append(ti);transitions.append(transLabel);
    const music=drawer('music','Música','♫');const audioPanel=$('[data-panel="audio"]');music.append($('#musicCatalog').closest('label'),$('#musicGenre').closest('label'),$('#musicVocals').closest('label'),$('#musicTrialBar'),$('#musicResults'));const musicMix=document.createElement('div');musicMix.className='mix-inline';musicMix.append($('#musicVolume').closest('label'));const speed=document.createElement('label');speed.textContent='Velocidad';const rate=document.createElement('input');rate.id='musicRate';rate.type='number';rate.min='.5';rate.max='1.75';rate.step='.05';rate.value=project.audio.musicRate||1;rate.oninput=rate.onchange=()=>{checkpoint();project.audio.musicRate=Number(rate.value);changed();};speed.append(rate);musicMix.append(speed,$('#stopMix'),$('#removeMusic'),$('#musicFile').closest('label'));music.prepend(musicMix);$('#musicGenre').closest('label').hidden=true;$('#musicVocals').closest('label').hidden=true;$('#musicVolume').closest('label').childNodes[0].textContent='Volumen';const upload=$('#musicFile').closest('label');upload.classList.add('file-button');upload.childNodes[0].textContent='＋ Audio';
    const narration=drawer('narration','Narración','✎');narration.append($('#narration').closest('label'),$('#ttsVoice').closest('label'),$('#ttsPitch').closest('label'));const narrButtons=document.createElement('div');narrButtons.className='button-row';for(const id of ['ttsExample','tts','downloadVoice'])narrButtons.append($('#'+id));const updater=$('.narrator-card a[download]');if(updater)narrButtons.append(updater);narration.append(narrButtons,$('#ttsAudition'));$('#ttsExample').textContent='▶ Escuchar muestra';$('#ttsPitch').closest('label').childNodes[0].textContent='Tono';$('#ttsStatus').hidden=true;
    const voice=drawer('voice','Voz','●');voice.append($('#record'),$('#voiceFile').closest('label'));for(const id of ['voiceVolume','voiceRate','voiceBass','voiceTreble','voiceOffset'])voice.append($('#'+id).closest('label'));voice.append($('#removeVoice'));
    const sounds=drawer('sounds','Sonidos','♬');sounds.innerHTML='<div id="soundChoices"></div><div id="soundEvents"></div>';
    const format=drawer('format','Formato','▣');format.append($('#ratio').closest('label'),$('#duration').closest('label'),$('#showBrand').closest('label'));
    const backgrounds=drawer('background','Fondo','❀');backgrounds.append($('#backgroundShelf'),$('#salmosBackgrounds'),$('#backgroundFile').closest('label'),$('#removeBackground'));const reuse=document.createElement('button');reuse.textContent='Fondo de Producción';reuse.onclick=async()=>{if(!current().productionBackground)return;await applyScopedBackground({production:true});};backgrounds.prepend(reuse);
    drawer('wan','Movimiento','✦');
    const viewport=document.createElement('div');viewport.id='stageViewport';const shell=$('.canvas-shell');viewport.append(shell);preview.prepend(viewport);const oldTime=$('#time');oldTime.title='Tiempo del reel';$('#previewHint').hidden=true;$('.preview-top').hidden=true;$('.preview-options').hidden=true;
    hidden.append(oldControls);work.replaceChildren(resource,rail,preview,side,dock);
    const home=document.createElement('section');
    home.id='studioHome';
    home.innerHTML='<h1>Marketing y reels</h1><div class="marketing-tabs" role="tablist" aria-label="Marketing y reels"></div>';
    const homeTabs=home.querySelector('.marketing-tabs');
    for(const [id,label] of [['videos','Videos'],['canciones','Canciones'],['ideas','Ideas']]){
      const button=document.createElement('button'),panel=document.createElement('section');
      button.type='button';button.id='tab-'+id;button.dataset.homeTab=id;button.textContent=label;
      button.setAttribute('role','tab');button.setAttribute('aria-controls','home-'+id);
      button.onclick=()=>showMarketingSection(id);
      panel.id='home-'+id;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
      panel.hidden=id!=='videos';homeTabs.append(button);home.append(panel);
    }
    homeTabs.onkeydown=event=>{
      const buttons=[...homeTabs.children],index=buttons.indexOf(event.target);
      if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
        (index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      buttons[next].click();buttons[next].focus();
    };
    const videos=home.querySelector('#home-videos');
    videos.innerHTML='<div class="home-heading"><button id="createReel" class="primary">＋ Nuevo reel</button></div><div id="homeProjects"></div>';
    videos.querySelector('#homeProjects').append($('#savedProjects'));
    work.before(home);

    $('.top-title strong').textContent='SALMOS MARKETING Y REELS · ESTUDIO DE CONTENIDO';
    const nav=$('.tabs');nav.replaceChildren();
    for(const [id,label] of [['reel','Reel'],['wan','Movimientos · WanGP']]){
      const button=document.createElement('button');button.dataset.mainMode=id;button.textContent=label;
      button.onclick=()=>editorView(id==='wan');nav.append(button);
    }
    const back=document.createElement('button');back.textContent='▦ Proyectos';back.onclick=()=>homeView();$('.head-actions').prepend(back);
    const leave=document.createElement('button');leave.textContent='Volver al panel';
    leave.onclick=async()=>{await homeView();parent.postMessage({type:'salmos-marketing-close'},location.origin);};$('.head-actions').append(leave);
    const ideas=document.createElement('button');ideas.id='ideasIcon';ideas.title='Ideas y textos';
    ideas.setAttribute('aria-label','Ideas y textos');ideas.innerHTML='<i class="fa-solid fa-lightbulb" aria-hidden="true"></i>';
    ideas.onclick=()=>homeView('ideas');$('.head-actions').prepend(ideas);
    $('#createReel').onclick=()=>selectProductsForReel(true);$('#chooseReelProducts').onclick=()=>selectProductsForReel(false);$('#showBlank').onclick=()=>{blankPreview=true;syncStageAssets();draw();};$('#showFinished').onclick=()=>{blankPreview=false;syncStageAssets();draw();};
    const zoomTools=document.createElement('div');zoomTools.id='viewZoomTools';for(const[label,action,title]of[['−',()=>applyViewZoom(viewZoom/1.25),'Alejar'],['100%',()=>applyViewZoom(1),'Ajustar vista'],['+',()=>applyViewZoom(viewZoom*1.25),'Acercar · Ctrl + rueda']]){const button=document.createElement('button');button.textContent=label;button.title=title;button.onclick=action;zoomTools.append(button);}preview.append(zoomTools);viewport.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();applyViewZoom(viewZoom*Math.exp(-e.deltaY*.002));},{passive:false});
    installReelsV6();installReelsV7();requestParent('appearance').then(theme=>{for(const[k,v]of Object.entries(theme))if(v)document.body.style.setProperty('--production-'+k,v);}).catch(()=>{});compactNumbers();installSoundControls();installReelsV9();backgroundShelf();homeView();
  }
  function installReelsV6(){
    const inspector=$('#reelInspector');inspector.append($('#reelDock'));$('#componentList').classList.add('component-strip');
    const nav=$('.tabs');$('.head-actions').prepend(nav);$('.scene-order').querySelectorAll('button').forEach(b=>{if(/antes|después|despues/i.test(b.textContent))b.hidden=true;});
    const order=$('#dockButtons');for(const id of ['background','format'])order.prepend(order.querySelector('[data-dock="'+id+'"]'));
    const music=$('[data-drawer="music"]'),mix=music.querySelector('.mix-inline'),catalog=$('#musicCatalog').closest('label'),head=document.createElement('div');head.className='music-heading';head.append(catalog,mix);music.prepend(head);$('#musicTrialBar').hidden=true;$('#stopMix').hidden=true;$('#removeMusic').textContent='Quitar';
    const own=document.createElement('div');own.id='ownMusicTools';own.hidden=true;own.append($('#musicFile').closest('label'));for(const id of ['musicStart','musicEnd','musicLoop','duck']){const label=$('#'+id).closest('label');if(id==='musicStart')label.childNodes[0].textContent='Desde (s)';if(id==='musicEnd')label.childNodes[0].textContent='Hasta (s, 0 = final)';own.append(label);}const listen=document.createElement('button');listen.textContent='▶ / Ⅱ';listen.title='Reproducir o pausar mi canción';listen.onclick=()=>playing?pause():play();own.append(listen);music.append(own);musicCatalog();
    const bg=$('[data-drawer="background"]'),oldShelf=$('#backgroundShelf'),salmos=$('#salmosBackgrounds'),add=$('#backgroundFile').closest('label'),clear=$('#removeBackground'),reuse=[...bg.children].find(b=>b.textContent==='Fondo de Producción'),bar=document.createElement('div'),gallery=document.createElement('div');bar.className='background-tabs';gallery.id='backgroundGallery';let mode='motion';const choices=[];
    const render=async type=>{mode=type;gallery.classList.toggle('giphy-gallery',type==='giphy');gallery.replaceChildren();choices.forEach(b=>b.classList.toggle('active',b.dataset.bgMode===type));if(type==='giphy'){mountGiphyGallery(gallery);return;}if(type==='salmos'){try{const entries=await requestParent('backgrounds');if(reuse&&current().productionBackground)gallery.append(reuse);for(const item of entries){const b=document.createElement('button'),im=new Image();im.src=item.url;im.alt=item.name;b.title=item.name;b.append(im);b.onclick=async()=>{const targets=sceneVisualTargets();b.disabled=true;try{const data=await requestParent('background',{assetId:item.id});await applyScopedBackground({src:await blobData(data.blob),name:item.name},targets);}catch(e){notify(e.message,'error');}finally{b.disabled=false;}};gallery.append(b);}}catch(e){gallery.textContent='Los fondos guardados se cargan al abrir desde SALMOS.';}return;}if(type==='add'){gallery.append(add);return;}for(const [name,motion,palette] of (type==='masculine'?[['Acero','steel','slate'],['Plano azul','blueprint','navy'],['Brasas','embers','coal'],['Niebla','smoke','slate'],['Relieve bosque','terrain','forest'],['Velocidad','speed','burgundy']]:[['Corazones','hearts','pink'],['Pétalos','petals','pink'],['Destellos dorados','stars','gold'],['Luces suaves','bokeh','blue'],['Ondas','waves','lilac'],['Confeti','confetti','cream']])){const b=document.createElement('button'),c=document.createElement('canvas'),label=document.createElement('span');c.width=130;c.height=150;label.textContent=name;b.append(c,label);b.onclick=()=>{applyScopedBackground({motion,palette,name});};gallery.append(b);const context=c.getContext('2d');const tick=now=>{if(!c.isConnected||!['motion','masculine'].includes(mode))return;if(!c.getClientRects().length){requestAnimationFrame(tick);return;}const colors=C.palettes[palette],g=context.createLinearGradient(0,0,130,150);g.addColorStop(0,colors[0]);g.addColorStop(1,colors[1]);context.fillStyle=g;context.fillRect(0,0,130,150);context.save();context.scale(130/720,150/1280);paintBackdrop(context,{bgMotion:motion},now/1000,720,1280);context.restore();requestAnimationFrame(tick);};requestAnimationFrame(tick);}};
    for(const[id,label]of[['salmos','Fondos SALMOS'],['motion','Suaves'],['masculine','Varoniles'],['giphy','GIPHY'],['add','＋ Agregar']]){const b=document.createElement('button');b.textContent=label;b.dataset.bgMode=id;b.onclick=()=>render(id);choices.push(b);bar.append(b);}clear.textContent='Sin fondo';bar.append(clear);bg.replaceChildren(bar,gallery);$('#oldReelsPanels').append(oldShelf,salmos);oldShelf.hidden=true;salmos.hidden=true;render('motion');
    const startLink=document.createElement('a');
    startLink.className='button';startLink.href='INICIAR_SALMOS.bat?v=27.9';startLink.download='INICIAR_SALMOS.bat';
    startLink.textContent='Descargar iniciador';$('[data-drawer="narration"] .button-row').append(startLink);compactNumbers();
  }

  let shareAfterExport=false;
  const giphyRuntime=new Map();
  const sceneVisual=scene=>scene.video||scene.base||scene.final;
  const reelCoverCacheId=record=>'reel-cover:'+reelID(record);
  let reelCoverObserver,reelCoverQueue=Promise.resolve();
  function projectCover(source,scene=source.scenes.find(sceneVisual),read=(src)=>media.get(src)){
    if(!scene)return '';
    const visual=read(sceneVisual(scene),!!scene.video);
    if(!(visual?.videoWidth||visual?.width)||scene.video&&visual.readyState<2)return '';
    const geometry=componentGeometry,last=lastGeometry;
    const frame=document.createElement('canvas');
    frame.width=360;
    frame.height=dimensions(360,source.ratio||'9:16').h;
    try{
      paintScene(frame.getContext('2d'),scene,.75,frame.width,frame.height,false,{style:source,read,still:true});
      return frame.toDataURL('image/jpeg',.86);
    }finally{
      componentGeometry=geometry;lastGeometry=last;
    }
  }
  async function renderSavedSceneCover(record,scene){
    if(!sceneVisual(scene))return '';
    const view={...scene,components:scene.components?.map(layer=>({...layer}))};
    migrateScene(view,record);
    const cache=new Map(),read=(src,video)=>asset(src,video,cache);
    const loads=[read(sceneVisual(view),!!view.video)._ready];
    for(const src of [view.background,view.back,view.final,view.beforeWan21?.scene?.base,view.beforeWan21?.scene?.final]){
      if(src)loads.push(read(src,isVideoSource(src))._ready);
    }
    for(const layer of view.components){
      if(layer.hidden)continue;
      if(layer.kind==='text')loads.push(layer.render?read(layer.render)._ready:renderTextLayer(layer,read));
      else if(layer.src)loads.push(read(layer.src)._ready);
    }
    let timer;
    try{
      await Promise.race([Promise.allSettled(loads),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);
      return projectCover(record,view,src=>cache.get(src));
    }catch{return '';}
    finally{
      clearTimeout(timer);
      for(const item of cache.values())if(item instanceof HTMLVideoElement){item.removeAttribute('src');item.load();}
    }
  }
  function removeLegacyCoverMargins(cover,ratio){
    // Earlier project covers centered the portrait in a 360 × 450 matte.
    if(cover.naturalWidth!==360||cover.naturalHeight!==450)return null;
    const height=dimensions(360,ratio||'9:16').h,width=Math.round(450*360/height);
    if(width>=358||width<1)return null;
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    canvas.width=360;canvas.height=450;
    try{
      context.drawImage(cover,0,0);
      for(const x of [2,357]){
        const color=context.getImageData(x,225,1,1).data;
        if([48,26,41].some((value,i)=>Math.abs(value-color[i])>12))return null;
      }
      const crop=document.createElement('canvas');crop.width=width;crop.height=450;
      crop.getContext('2d').drawImage(canvas,(360-width)/2,0,width,450,0,0,width,450);
      return crop.toDataURL('image/jpeg',.9);
    }catch{return null;}
  }

  function createReelPreview(record,title,count){
    const element=document.createElement('div'),viewport=document.createElement('div'),position=document.createElement('span');
    const previous=document.createElement('button'),next=document.createElement('button'),slides=[];
    element.className='reel-card-preview';
    viewport.className='reel-card-frames';element.append(viewport);
    viewport.setAttribute('role','group');viewport.setAttribute('aria-label','Escenas de '+title);
    previous.type=next.type='button';
    previous.className='reel-card-arrow previous';next.className='reel-card-arrow next';
    previous.textContent='‹';next.textContent='›';
    previous.setAttribute('aria-label','Escena anterior');next.setAttribute('aria-label','Escena siguiente');
    position.className='reel-card-position';position.setAttribute('aria-live','polite');
    if(count>1)element.append(previous,next,position);
    const id=reelCoverCacheId(record),revision=record.revision||record._reelRevision||String(record.savedAt);
    let current=0,lastWheel=0,snapshot;
    const source=()=>{
      if(!record.cloudOnly)return Promise.resolve(record);
      return snapshot??=downloadReelSnapshot(record).catch(error=>{snapshot=null;throw error;});
    };
    for(let index=0;index<count;index++){
      const button=document.createElement('button'),cover=new Image(),status=document.createElement('span');
      button.className='project-preview';button.type='button';button.tabIndex=index===0?0:-1;
      button.setAttribute('aria-label','Abrir '+title+' en la escena '+(index+1));
      button.onclick=()=>openSavedProject(record,index).catch(error=>notify(error.message,'error'));
      cover.className='project-cover';cover.alt='';cover.hidden=true;
      status.textContent='Cargando vista previa…';
      button.append(cover,status);viewport.append(button);slides.push({button,cover,status,loaded:false});
    }
    async function show(slide,src,ratio,legacy=false){
      if(typeof src!=='string'||!src||!element.isConnected)return false;
      slide.cover.src=src;
      try{
        await slide.cover.decode();
        const cropped=legacy&&removeLegacyCoverMargins(slide.cover,ratio);
        if(cropped){slide.cover.src=cropped;await slide.cover.decode();}
      }catch{return false;}
      slide.cover.hidden=false;slide.status.hidden=true;
      return true;
    }
    async function loadSlide(index){
      const slide=slides[index];
      if(slide.loaded||!element.isConnected)return;
      slide.loaded=true;
      slide.status.textContent='Cargando vista previa…';
      try{
        if(index===0){
          if(await show(slide,record.cover,record.ratio,true))return;
          const cached=await dbAction('assets','readonly',store=>store.get(id)).catch(()=>null);
          if(cached?.revision===revision&&await show(slide,cached.src,record.ratio,true))return;
        }
        const saved=await source(),scene=saved.scenes[index];
        if(!element.isConnected)return;
        if(index===0&&await show(slide,saved.cover,saved.ratio,true))return;
        if(scene){
          const composed=await renderSavedSceneCover(saved,scene);
          for(const candidate of [composed,scene.thumbnail,scene.final,scene.base,scene.back,scene.background]){
            if(!await show(slide,candidate,saved.ratio))continue;
            if(index===0&&candidate.startsWith('data:image/')&&candidate.length<=300000){
              await dbAction('assets','readwrite',store=>store.put({id,kind:'reel-cover',revision,src:candidate})).catch(()=>{});
            }
            return;
          }
        }
      }catch{}
      slide.loaded=false;
      slide.cover.removeAttribute('src');
      slide.status.textContent='Vista previa no disponible';
    }
    function load(){
      reelCoverQueue=reelCoverQueue.then(()=>loadSlide(0));
    }
    function update(index){
      current=index;
      previous.disabled=index===0;next.disabled=index===count-1;
      position.textContent=(index+1)+' / '+count;
      slides.forEach((slide,i)=>{slide.button.tabIndex=i===index?0:-1;});
    }
    function move(index){
      if(index<0||index>=count)return;
      update(index);
      void loadSlide(index);
      viewport.scrollTo({left:viewport.clientWidth*index,behavior:'instant'});
    }
    update(0);
    previous.onclick=()=>move(current-1);next.onclick=()=>move(current+1);
    viewport.onscroll=()=>{
      if(!viewport.clientWidth)return;
      const index=C.clamp(Math.round(viewport.scrollLeft/viewport.clientWidth),0,count-1);
      if(index!==current){update(index);void loadSlide(index);}
    };
    viewport.addEventListener('wheel',event=>{
      if(event.ctrlKey||Math.abs(event.deltaX)>=Math.abs(event.deltaY))return;
      const index=current+Math.sign(event.deltaY);
      if(index<0||index>=count)return;
      event.preventDefault();
      if(performance.now()-lastWheel<240)return;
      lastWheel=performance.now();move(index);
    },{passive:false});
    viewport.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      move(current+(event.key==='ArrowLeft'?-1:1));slides[current].button.focus({preventScroll:true});
    };
    return {element,load};
  }
  function showReelPreviews(previews){
    reelCoverObserver?.disconnect();
    if(typeof IntersectionObserver!=='function'){previews.forEach(load=>load());return;}
    reelCoverObserver=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){
        reelCoverObserver.unobserve(entry.target);
        previews.get(entry.target)();
      }
    },{root:$('#studioHome'),rootMargin:'120px'});
    for(const button of previews.keys())reelCoverObserver.observe(button);
  }
  async function openSavedProject(record,sceneIndex=0){
    pause();
    await flushReelAutosave();
    const saved=reelRecord(record.cloudOnly?await restoreCloudReel(record):record);
    if(!saved)throw new Error('Este proyecto no tiene escenas para abrir.');
    reelSaveDirty=false;
    selectedMusic10=null;auditionTrack=null;musicTrial=null;selectCurrentSceneScope();
    selectedComponent=null;editingStamp=false;blankPreview=false;history.length=0;future.length=0;
    const defaults=newProject();
    project=structuredClone({...defaults,...saved,id:String(saved.originalId??saved.id??defaults.id),
      _reelBackupBase:reelBaseRevision(saved),_reelWriter:C.uid(),audio:{...defaults.audio,...saved.audio}});
    delete project.inCloud;
    delete project.localConflict;
    for(const scene of project.scenes){
      scene.id??=C.uid();
      scene.template||='clean';
      scene.duration=Number(scene.duration)||5;
    }
    normalizeProject();
    active=C.clamp(sceneIndex,0,project.scenes.length-1);
    time=C.totalDuration(project.scenes.slice(0,active));
    await prepareMedia().catch(error=>notify(error.message,'error'));
    syncForm();editorView();syncReelSaveState();
  }
  async function projectVideoAction(p,sharing){try{const stored=await dbAction('exports','readonly',s=>s.get(p.originalId||p.id));if(stored&&stored.updatedAt>=(p.updatedAt||0)){if(sharing)shareVideoDialog(stored.blob,stored.name,p.title,p.audio?.musicCredit);else download(stored.blob,stored.name);return;}await openSavedProject(p);shareAfterExport=sharing;$('#exportDialog').showModal();}catch(e){notify(e.message,'error');}}
  function shareVideoDialog(blob,name,titleText=project.title,musicCredit=project.audio.musicCredit){const d=document.createElement('dialog');d.className='share-video-dialog';const title=document.createElement('h2');title.textContent='Compartir video';const file=new File([blob],name,{type:blob.type}),share=document.createElement('button');share.textContent='Compartir en redes';share.onclick=async()=>{try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:titleText,text:projectShareText13(titleText,musicCredit)});else{notify('Este navegador no permite compartir archivos directamente. Podés usar Descargar video.');return;}d.close();}catch(e){if(e.name==='AbortError')d.close();else notify(e.message,'error');}};const down=document.createElement('button');down.textContent='Descargar video';down.onclick=()=>download(blob,name);const text=document.createElement('button');text.textContent='Copiar texto';text.onclick=()=>copyText(projectShareText13(titleText,musicCredit));const close=document.createElement('button');close.textContent='Cancelar';close.onclick=()=>d.close();d.append(title,share,down,text,close);d.onclose=()=>d.remove();document.body.append(d);d.showModal();}
  function soundCue(event){const index=project.scenes.findIndex(s=>s.id===event.sceneId);if(index<0)return Math.max(0,event.start||0);const scene=project.scenes[index],layer=scene.components.find(l=>l.id===event.componentId);return project.scenes.slice(0,index).reduce((n,s)=>n+s.duration,0)+(layer?T.effects({...layer,effect:layer.inheritSceneEffect?scene.effect:layer.effect}).start:0)+(event.start||0);}
  function renderUsedItems(){const host=$('#usedItems');if(!host||!project)return;host.replaceChildren();const add=(label,sceneId,componentId,dock,at,remove,soundId=null)=>{const chip=document.createElement('span');chip.className='used-item';const jump=document.createElement('button');jump.textContent=label;jump.title='Ir a '+label;jump.onclick=()=>{pause();let index=project.scenes.findIndex(s=>s.id===sceneId);if(index<0)index=C.sceneAt(project.scenes,at)?.index||0;active=index;selectedComponent=componentId||null;time=Math.min(C.totalDuration(project.scenes),at||project.scenes.slice(0,index).reduce((n,s)=>n+s.duration,0));syncForm();openDock(dock);if(dock==='sounds'){renderSoundEvents();if(soundId){const row=$('#soundEvents').querySelector('[data-sound-id="'+soundId+'"]');row?.classList.add('used-focus');row?.scrollIntoView({block:'nearest',behavior:'smooth'});}}draw();};const x=document.createElement('button');x.textContent='×';x.title='Quitar '+label;x.setAttribute('aria-label',x.title);x.onclick=()=>{pause();checkpoint();remove();syncForm();changed();};chip.append(jump,x);host.append(chip);};let start=0;for(const[si,s]of project.scenes.entries()){const n=''+(si+1)+' · ',base=start,visual=(target,key,label,layerId=null)=>{if(target[key]&&target[key]!=='none'&&target[key]!=='clean')add(n+label,s.id,layerId,key==='entryFx'?'entry':key==='exitFx'?'exit':'effects',base+(T.effects(target).start||0),()=>{target[key]='none';if(target===s&&key==='template')s.components.filter(l=>l.inheritSceneEffect).forEach(l=>{l.fx='none';l.inheritSceneEffect=false;});});};visual(s,'template',C.templates.find(t=>t.id===s.template)?.name||'Efecto');visual(s,'entryFx','Entrada');visual(s,'exitFx','Salida');for(const l of s.components){if(l.kind==='text')add(n+'Texto · '+l.text.slice(0,20),s.id,l.id,'effects',base,()=>{s.components=s.components.filter(x=>x.id!==l.id);});visual(l,'fx',(l.name||l.text||'Estampa').slice(0,16)+' · '+(C.templates.find(t=>t.id===l.fx)?.name||l.fx),l.id);visual(l,'entryFx','Entrada · '+(l.name||'Texto'),l.id);visual(l,'exitFx','Salida · '+(l.name||'Texto'),l.id);}if(s.background||s.bgMotion||s.giphy)add(n+'Fondo',s.id,null,'background',base,()=>{s.background=null;s.bgMotion='';delete s.giphy;});if(si>0&&project.transition!=='none')add(n+'Transición',s.id,null,'transition',base,()=>{project.transition='none';});start+=s.duration;}for(const e of project.audio.sfx||[])add('♫ '+e.name+' · '+C.formatTime(soundCue(e)),e.sceneId,e.componentId,'sounds',soundCue(e),()=>{project.audio.sfx=project.audio.sfx.filter(x=>x.id!==e.id);setupAudioElements().catch(()=>{});},e.id);for(const[key,dock,label]of[['music','music','Música'],['voice','voice','Narración']])if(project.audio[key])add('♫ '+label,null,null,dock,0,()=>{project.audio[key]=null;project.audio[key+'Name']='';setupAudioElements().catch(()=>{});});host.hidden=!host.childElementCount;}
  function installReelsV7(){const host=document.createElement('div');host.id='usedItems';host.setAttribute('aria-label','Elementos usados en el reel');$('#componentList').after(host);renderUsedItems();const ok=$('#previewEffect');if(ok)ok.textContent='OK';}
  const backdropV6=paintBackdrop;paintBackdrop=function(c,s,seconds,W,H){if(!['steel','blueprint','embers','smoke','terrain','speed'].includes(s.bgMotion))return backdropV6(c,s,seconds,W,H);c.save();if(s.bgMotion==='steel'){for(let i=-5;i<15;i++){const x=(i*150+seconds*18)%(W+600)-300;c.fillStyle=i%2?'#c6d3e31b':'#00000022';c.beginPath();c.moveTo(x,0);c.lineTo(x+100,0);c.lineTo(x+H*.35+100,H);c.lineTo(x+H*.35,H);c.fill();}}
    if(s.bgMotion==='blueprint'){const off=seconds*14%70;c.strokeStyle='#5bb9e650';c.lineWidth=1.5;for(let x=-70;x<W+70;x+=70){c.beginPath();c.moveTo(x+off,0);c.lineTo(x+off,H);c.stroke();}for(let y=-70;y<H+70;y+=70){c.beginPath();c.moveTo(0,y+off);c.lineTo(W,y+off);c.stroke();}c.strokeStyle='#9ce2ff55';c.lineWidth=4;c.strokeRect(W*.15+Math.sin(seconds*.3)*20,H*.2,W*.7,H*.6);}
    if(s.bgMotion==='embers'){for(let i=0;i<48;i++){const x=(i*113+Math.sin(seconds+i)*22)%W,y=((H-i*147-seconds*(28+i%6*9))%H+H)%H,r=2+i%4*2;c.fillStyle=['#ffa42a','#d75816','#ffd781'][i%3];c.globalAlpha=.35+.45*Math.abs(Math.sin(seconds+i));c.beginPath();c.arc(x,y,r,0,7);c.fill();}}
    if(s.bgMotion==='smoke'){for(let i=0;i<9;i++){const x=W*.5+Math.sin(seconds*.2+i)*W*.48,y=(i*180+seconds*12)%H,r=W*.45,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#b4bfcc23');g.addColorStop(1,'#b4bfcc00');c.fillStyle=g;c.fillRect(0,0,W,H);}}
    if(s.bgMotion==='terrain'){c.strokeStyle='#b4caa236';c.lineWidth=2;for(let i=0;i<25;i++){c.beginPath();for(let x=0;x<=W;x+=10){const y=i*64+Math.sin(x/110+i*.4+seconds*.2)*40+Math.cos(x/220+seconds*.13)*30;x?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}}
    if(s.bgMotion==='speed'){for(let i=0;i<30;i++){const x=((i*131+seconds*(90+i%5*25))%(W+600))-300,y=i*79%H;c.strokeStyle=i%3?'#e8b4c133':'#ef719788';c.lineWidth=i%3+2;c.beginPath();c.moveTo(x,y);c.lineTo(x+100+i%4*35,y-40);c.stroke();}}c.restore();};
  async function giphyRequest(path,params={}){const key=localStorage.getItem('salmos-giphy-key')||'';if(!key)throw Error('Ingresá tu clave de GIPHY.');const url=new URL('https://api.giphy.com/v1/gifs/'+path);url.searchParams.set('api_key',key);for(const[k,v]of Object.entries(params))url.searchParams.set(k,v);const r=await fetch(url,{cache:'no-store',referrerPolicy:'no-referrer'});if(!r.ok)throw Error(r.status===429?'Se alcanzó el límite de GIPHY. Probá más tarde.':'No se pudo conectar GIPHY. Revisá tu clave.');const data=await r.json();if(data.meta?.status&&data.meta.status!==200)throw Error('GIPHY no pudo completar la búsqueda.');return data;}
  async function loadGiphyScene(scene,entry=null){if(giphyRuntime.get(scene.id)?.id===scene.giphy?.id)return;if(!scene.giphy)return;const reused=[...giphyRuntime.values()].find(v=>v.id===scene.giphy.id);if(reused){giphyRuntime.set(scene.id,reused);return;}const gif=entry||ownGifs13().find(g=>g.id===scene.giphy.id)||(await giphyRequest(scene.giphy.id)).data;const rendition=gif.images?.original?.mp4?{url:gif.images.original.mp4,type:'video/mp4'}:gif.images?.downsized?{url:gif.images.downsized.url,type:'image/gif'}:null;if(!rendition?.url)throw Error('Este GIF no tiene un formato compatible.');const url=new URL(rendition.url);if(url.protocol!=='https:'||!/(^|\.)giphy\.com$/.test(url.hostname))throw Error('GIPHY devolvió una dirección de archivo no compatible.');const response=await fetch(rendition.url,{cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('No se pudo cargar el GIF seleccionado.');const blob=await response.blob();if(blob.size>40*1024*1024)throw Error('Este GIF es demasiado pesado. Elegí otro.');const src=await blobData(new Blob([blob],{type:rendition.type}));await asset(src,rendition.type.startsWith('video'))._ready;giphyRuntime.set(scene.id,{id:scene.giphy.id,src});}
  async function prepareGiphyBackgrounds(){for(const[id,value]of giphyRuntime)if(!project.scenes.some(s=>s.id===id&&s.giphy?.id===value.id)){asset(value.src,true)?.pause?.();giphyRuntime.delete(id);media.delete(value.src);}for(const scene of project.scenes)if(scene.giphy)await loadGiphyScene(scene);}
  function mountGiphyGallery(host){host.classList.add('giphy-gallery');const config=document.createElement('div');config.className='giphy-config';const key=document.createElement('input');key.type='password';key.autocomplete='off';key.placeholder='Tu clave API de GIPHY';key.setAttribute('aria-label',key.placeholder);key.value=localStorage.getItem('salmos-giphy-key')||'';const save=document.createElement('button');save.textContent='Conectar';const query=document.createElement('input');query.type='search';query.placeholder='Buscar fondos en GIPHY';query.setAttribute('aria-label',query.placeholder);query.value='Fondos abstractos';const search=document.createElement('button');search.textContent='Buscar';const status=document.createElement('output');const rights=document.createElement('label');rights.className='giphy-permission';const permission=document.createElement('input');permission.type='checkbox';permission.checked=localStorage.getItem('salmos-giphy-permission')==='yes';permission.onchange=()=>localStorage.setItem('salmos-giphy-permission',permission.checked?'yes':'no');rights.append(permission,document.createTextNode('Usar solo GIFs propios o con permiso'));const grid=document.createElement('div');grid.className='giphy-results';const more=document.createElement('button');more.textContent='Ver más';more.hidden=true;const brand=document.createElement('img');brand.src='giphy-attribution.png';brand.alt='Powered by GIPHY';brand.className='giphy-attribution';let offset=0,sequence=0;const run=async(next=false)=>{const seq=++sequence;search.disabled=more.disabled=true;status.textContent='Buscando…';if(!next)offset=0;try{const response=typeof next==='string'?await giphyRequest(next):await giphyRequest('search',{q:!query.value.trim()||query.value.trim().toLowerCase()==='fondos abstractos'?'abstract background':query.value.trim(),limit:12,offset,rating:'g',lang:'es'});const data=typeof next==='string'?{data:response.data?[response.data]:[]}:response;if(typeof next==='string'&&response.data)rememberGif13(response.data);if(query.value.trim().startsWith('@')){for(const item of data.data||[])rememberGif13(item);data.data=[...new Map([...(data.data||[]),...ownGifs13()].map(g=>[g.id,g])).values()];}if(seq!==sequence||!host.isConnected)return;grid.replaceChildren();for(const gif of data.data){const card=document.createElement('article'),img=new Image(),credit=document.createElement('a'),ok=document.createElement('button');img.src=gif.images?.fixed_height?.url||gif.images?.original?.url;img.alt=gif.title||'GIF';img.loading='lazy';credit.textContent=gif.user?.display_name||gif.username||gif.title||'Ver fuente';credit.href=gif.url;credit.target='_blank';credit.rel='noopener noreferrer';ok.textContent='OK';ok.onclick=async()=>{if(!permission.checked)return notify('Confirmá que tenés permiso para usar el GIF elegido en publicidad.','error');const scene=current();ok.disabled=true;try{await applyScopedBackground({giphy:{id:gif.id,title:gif.title||'GIF',author:gif.user?.display_name||gif.username||'',source:gif.url,permission:true}});notify('Fondo agregado.');}catch(e){notify(e.message,'error');}finally{ok.disabled=false;}};const choose=document.createElement('button');choose.className='giphy-image-choice';choose.setAttribute('aria-label','Aplicar '+(gif.title||'GIF'));choose.append(img);choose.onclick=async()=>{if(ok.disabled)return;choose.disabled=true;try{await ok.onclick();}finally{choose.disabled=false;}};card.append(choose,credit);grid.append(card);}more.hidden=response.pagination?response.pagination.offset+response.pagination.count>=response.pagination.total_count:data.data.length<12;status.textContent=data.data.length?'':query.value.trim().startsWith('@')?'GIPHY no devuelve este canal en su buscador. Subí tus GIFs para verlos siempre en Mis GIFs.':'No encontré resultados.';offset+=12;}catch(e){status.textContent=e.message;}finally{search.disabled=more.disabled=false;}};save.onclick=()=>{const value=key.value.trim();if(!/^[a-z0-9_-]{8,128}$/i.test(value))return notify('Revisá la clave de GIPHY.','error');localStorage.setItem('salmos-giphy-key',value);run();};search.onclick=()=>run();query.onkeydown=e=>{if(e.key==='Enter')run();};more.onclick=()=>run(true);const own=document.createElement('input'),find=document.createElement('button');own.type='url';own.placeholder='Enlace de mi GIF en GIPHY';own.setAttribute('aria-label',own.placeholder);find.textContent='Ver mi GIF';find.onclick=()=>{const value=own.value.trim();let id=value;if(/^https?:/.test(value)){try{const url=new URL(value);if(!/(^|\.)giphy\.com$/.test(url.hostname))throw Error();const parts=url.pathname.split('/').filter(Boolean);id=parts.includes('media')?parts[parts.indexOf('media')+1]:parts[parts.length-1].split('-').pop();}catch{return notify('Pegá el enlace de tu GIF de GIPHY.','error');}}if(!/^[a-z0-9]+$/i.test(id))return notify('Revisá el enlace del GIF.','error');run(id);};const fold=document.createElement('details'),summary=document.createElement('summary'),credentials=document.createElement('details'),keyTitle=document.createElement('summary'),fields=document.createElement('div');fold.className='giphy-search-fold';summary.textContent='Buscar / Mi enlace';fold.open=!key.value;keyTitle.textContent='Clave de GIPHY';credentials.open=!key.value;credentials.className='giphy-credentials';credentials.append(keyTitle,key,save);fields.className='giphy-search-fields';fields.append(query,search,own,find);fold.append(summary,credentials,fields);host.replaceChildren(fold,rights,status,brand,grid,more);installMyGifs13(host,query,search,own,find);const connect=save.onclick;save.onclick=()=>{connect();if(localStorage.getItem('salmos-giphy-key')){credentials.open=false;fold.open=false;}};if(key.value)run();}
  const syncSoundBeforeGiphy=syncSound;syncSound=function(){syncSoundBeforeGiphy();const at=C.sceneAt(project.scenes,time),activeSource=at?.scene.background||(at?.scene.giphy?giphyRuntime.get(at.scene.id)?.src:null),sources=new Set(project.scenes.map(scene=>scene.background||(scene.giphy?giphyRuntime.get(scene.id)?.src:null)).filter(isVideoSource));for(const src of sources){const video=asset(src,true);video.muted=true;syncOneAudio(video,src===activeSource&&video.duration>0?at.local%video.duration:0,src===activeSource);}};

  const wanClipBlobs=new Map();
  let wanPreviewURL='',closeWanVideo=null,wanStudio=null;
  async function wanClipBlob(clip){
    if(wanClipBlobs.has(clip.id))return wanClipBlobs.get(clip.id);
    const blob=await (await helperFetch('/api/wan/video/'+clip.id)).blob();
    if(blob.size>80*1024*1024)throw Error('Este clip supera los 80 MB del editor.');
    wanClipBlobs.set(clip.id,blob);
    if(wanClipBlobs.size>3)wanClipBlobs.delete(wanClipBlobs.keys().next().value);
    return blob;
  }
  function closeWanPreview(){
    closeWanVideo?.();closeWanVideo=null;
    $('#wanLargePreview')?.remove();
    document.body.classList.remove('previewing-wan');
    if(wanPreviewURL){URL.revokeObjectURL(wanPreviewURL);wanPreviewURL='';}
  }
  let sceneScope='current',effectSubtab='image',voiceSubtab='narrator',soundFocus=null,effectTrial=null;
  let durationSceneId='',durationDraft=null,pendingVisual=null;
  function selectCurrentSceneScope(){
    sceneScope='current';
    selectedSceneIds.clear();
    pendingVisual=null;
    durationDraft=null;
  }
  function syncSceneDuration(){
    const input=$('#duration'),scene=current();
    if(!scene||!input)return;
    if(durationSceneId!==scene.id){durationSceneId=scene.id;durationDraft=null;}
    const min=scopeScenes().some(target=>!target.video)?2:.1;
    input.min=String(min);
    input.step=min===2?'1':'.1';
    if(durationDraft===null)input.value=String(scene.duration);
  }
  function scopeScenes(){
    if(sceneScope==='all')return project.scenes;
    if(sceneScope==='selected'){
      const scenes=project.scenes.filter(scene=>selectedSceneIds.has(scene.id));
      if(scenes.length)return scenes;
      sceneScope='current';
    }
    return [current()];
  }
  function sceneVisualTargets(){
    return {project,sceneId:current().id,ids:scopeScenes().map(scene=>scene.id)};
  }
  function previewScene(scene){
    const pending=pendingVisual;
    if(!pending||pending.project!==project||pending.sceneId!==scene.id)return scene;
    const copy={...scene,...pending.edit.fields};
    if(pending.edit.production)copy.background=scene.productionBackground||null;
    return copy;
  }
  function applySceneVisual(edit,targets=sceneVisualTargets()){
    if(targets.project!==project||targets.sceneId!==current().id)return;
    pause();cancelEffectTrial();
    const previous=pendingVisual?.sceneId===current().id?pendingVisual.edit:null;
    pendingVisual={project,sceneId:targets.sceneId,edit:{...previous,...edit,fields:{...previous?.fields,...edit.fields}}};
    syncSceneScope();draw();
  }
  function setSceneScope(mode,ids=[]){
    sceneScope=mode;
    selectedSceneIds=new Set(ids);
    syncSceneScope();syncSceneDuration();syncTimeline();
  }
  function syncSceneScope(){
    const scope=$('#sceneScopeFooter'),scenes=scopeScenes();
    if(!scope)return;
    const visual=activeDock==='background'&&pendingVisual?.sceneId===current().id&&pendingVisual.project===project;
    const effects=activeDock==='effects'&&effectSubtab!=='sound';
    const applicable=project.scenes.length>1&&(activeDock==='background'||activeDock==='add'||effects||
      activeDock==='effects'&&effectSubtab==='sound'&&!!soundFocus);
    scope.hidden=!applicable&&!visual&&!(effects&&effectTrial);
    scope.querySelector('strong').hidden=!applicable;
    for(const button of scope.querySelectorAll('[data-scene-scope]')){
      const choice=button.dataset.sceneScope,applied=choice===sceneScope;
      button.hidden=!applicable;button.classList.toggle('active',applied);
      button.setAttribute('aria-pressed',String(applied));
      if(choice==='selected')button.textContent=applied?`Elegir escenas (${scenes.length})`:'Elegir escenas';
    }
    const ok=$('#confirmSceneScope'),cancel=$('#cancelSceneScope');
    ok.hidden=cancel.hidden=!visual&&!(effects&&effectTrial);
    const note=$('#scopePendingLabel');
    note.textContent=visual?pendingVisual.edit.label+' · Vista previa':effects&&effectTrial?'Efecto · Vista previa':'';
    note.hidden=!note.textContent;
  }
  function confirmPendingVisual(){
    const {edit}=pendingVisual;
    const targets=scopeScenes();
    pause();checkpoint();pendingVisual=null;
    for(const scene of targets){
      Object.assign(scene,structuredClone(edit.fields));
      if(edit.production)scene.background=scene.productionBackground||null;
    }
    syncForm();changed(edit.reload);
    notify(targets.length===1?edit.label+' aplicado a la escena.':edit.label+' aplicado a '+targets.length+' escenas.');
  }
  function installSceneScope(){
    const scope=document.createElement('div');
    scope.id='sceneScopeFooter';scope.className='scene-scope';
    scope.setAttribute('role','group');scope.setAttribute('aria-label','Aplicar cambios en');
    const label=document.createElement('strong');label.textContent='Aplicar en';scope.append(label);
    for(const [id,title] of [['current','Solo actual'],['selected','Elegir escenas'],['all','Todas las escenas']]){
      const button=document.createElement('button');
      button.type='button';button.dataset.sceneScope=id;button.textContent=title;
      button.onclick=()=>{
        if(id==='selected')pickScenes13('Elegí las escenas que vas a ajustar',scopeScenes().map(scene=>scene.id),
          ids=>setSceneScope('selected',ids),{confirmLabel:'Confirmar selección'});
        else setSceneScope(id);
      };
      scope.append(button);
    }
    const note=document.createElement('small'),ok=document.createElement('button'),cancel=document.createElement('button');
    note.id='scopePendingLabel';ok.id='confirmSceneScope';cancel.id='cancelSceneScope';
    ok.className='primary';ok.textContent='✓ Aplicar';cancel.textContent='Cancelar cambio';
    ok.onclick=()=>{if(activeDock==='background'&&pendingVisual)confirmPendingVisual();else $('#previewEffect').click();};
    cancel.onclick=()=>{pendingVisual=null;cancelEffectTrial();syncForm();draw();};
    scope.append(note,cancel,ok);$('#dockDrawers').after(scope);
    syncSceneScope();
  }
  function installSceneDuration(){
    const input=$('#duration'),label=input.closest('label'),row=document.createElement('div'),button=document.createElement('button');
    row.className='scene-duration';label.before(row);row.append(label);
    label.childNodes[0].textContent='Duración (s)';
    input.addEventListener('input',()=>{durationDraft=input.value;});
    const apply=()=>{
      const value=Number(input.value);
      if(!input.value.trim()||!Number.isFinite(value)||value<=0)return notify('Ingresá la duración de la escena.','error');
      pause();cancelEffectTrial();checkpoint();
      setScopedSceneField('duration',C.clamp(value,Number(input.min)||.1,30));
      durationDraft=null;syncForm();changed();
    };
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply();}});
    button.type='button';button.id='confirmSceneDuration';button.className='icon-action10';button.innerHTML=icon10('check');
    button.title='Aplicar duración';button.setAttribute('aria-label',button.title);button.onclick=apply;row.append(button);
    return row;
  }
  function relatedLayer(scene,source){
    if(!source)return null;
    const group=source.scopeLayerId||source.overlayGroupId;
    return scene.components.find(layer=>layer.id===source.id||group&&(layer.scopeLayerId===group||layer.overlayGroupId===group))||
      (!group&&source.kind==='print'&&!source.baked&&source.src?scene.components.find(layer=>layer.kind===source.kind&&!layer.baked&&layer.src===source.src):null);
  }
  function scopedLayers(source=selectedLayer()){
    return scopeScenes().map(scene=>({scene,layer:relatedLayer(scene,source)})).filter(row=>row.layer);
  }
  function setScopedSceneField(key,value){
    const elapsed=Math.max(0,time-project.scenes.slice(0,active).reduce((total,scene)=>total+scene.duration,0));
    for(const scene of scopeScenes())scene[key]=key==='duration'?C.clamp(value,scene.video ? .1 : 2,30):value;
    if(key==='duration')time=project.scenes.slice(0,active).reduce((total,scene)=>total+scene.duration,0)+Math.min(elapsed,Math.max(0,current().duration-.001));
  }
  async function addLayerInScope(source){
    const scenes=scopeScenes();
    for(const scene of scenes)migrateScene(scene);
    if(scenes.some(scene=>scene.components.length>=30))throw Error('Una de las escenas ya tiene 30 componentes.');
    pause();cancelEffectTrial();checkpoint();
    const group=C.uid(),focused=scenes.includes(current())?current():scenes[0];
    for(const scene of scenes){
      const layer={...structuredClone(source),id:C.uid(),scopeLayerId:group};
      if(layer.overlay)layer.visibleFor=scene.duration;
      scene.components.push(layer);
      if(scene===focused)selectedComponent=layer.id;
      if(layer.kind==='text')await renderTextLayer(layer);
    }
    if(focused!==current()){
      active=project.scenes.indexOf(focused);
      time=project.scenes.slice(0,active).reduce((sum,scene)=>sum+scene.duration,0);
    }
    syncForm();changed();
  }
  function applyScopedEffectTrial(){
    const trial=effectTrial;
    if(!trial)return;
    const source=current(),targets=scopeScenes();
    checkpoint(trial.before);
    for(const scene of targets){
      for(const row of trial.saved.values){
        const isScene=row.id===source.id;
        const updated=isScene?source:source.components.find(layer=>layer.id===row.id);
        const target=isScene?scene:relatedLayer(scene,updated);
        if(!target||!updated||target===updated)continue;
        for(const [key,value] of Object.entries(row.fields)){
          if(key==='effect'){
            const before=value||{},after=updated.effect||{};
            const changes=Object.entries(after).filter(([name,next])=>before[name]!==next||trial.touched.has(row.id+':'+name));
            if(changes.length)target.effect={...T.effects(target),...Object.fromEntries(changes)};
          }else if(JSON.stringify(value)!==JSON.stringify(updated[key]))target[key]=structuredClone(updated[key]);
        }
        if(trial.templateChoice&&((trial.layerId&&row.id===trial.layerId)||(!trial.layerId&&isScene))){
          target[isScene?'template':'fx']=trial.templateChoice;
          target.effectConfirmed=true;
          if(isScene&&['pencil','brush','wipe','before'].includes(trial.templateChoice)){
            for(const layer of scene.components.filter(item=>item.kind==='print')){
              layer.fx=trial.templateChoice;layer.inheritSceneEffect=true;
            }
          }
        }
      }
    }
    if(!targets.includes(source)){
      const {transition,transitionDuration}=project;
      restoreEffectFields(project,trial);
      Object.assign(project,{transition,transitionDuration});
    }else effectTarget().effectConfirmed=true;
    effectTrial=null;
  }
  async function applyScopedBackground(spec,targets=sceneVisualTargets()){
    if(spec.src)await asset(spec.src,isVideoSource(spec.src))._ready;
    const fields={background:spec.src||null,backgroundName:spec.name||'',giphy:spec.giphy||null};
    if(spec.motion!==undefined)fields.motionOverlay19=spec.motion;
    if(spec.palette!==undefined)fields.backgroundPalette=spec.palette;
    applySceneVisual({label:'Fondo',fields,production:spec.production,reload:true},targets);
  }
  function setEffectsTab(id){effectSubtab=id;for(const panel of $$('[data-effect-panel]'))panel.hidden=panel.dataset.effectPanel!==id;for(const button of $$('[data-effect-subtab]'))button.classList.toggle('active',button.dataset.effectSubtab===id);if(id!=='sound')soundFocus=null;renderSoundEvents();syncSceneScope();}
  function setVoiceTab(id){voiceSubtab=id;for(const panel of $$('[data-voice-panel]'))panel.hidden=panel.dataset.voicePanel!==id;for(const b of $$('[data-voice-subtab]'))b.classList.toggle('active',b.dataset.voiceSubtab===id);}
  const openDockBefore9=openDock;openDock=function(id){const alias={sounds:'effects',entry:'effects',exit:'effects',transition:'effects',voice:'narration'};const top=alias[id]||id;if(effectTrial&&top!=='effects')cancelEffectTrial();if(top!=='background')pendingVisual=null;openDockBefore9(top);syncSceneScope();if(id==='sounds')setEffectsTab('sound');if(['entry','exit','transition'].includes(id))setEffectsTab('general');if(id==='voice')setVoiceTab('record');};
  function effectFields(scene){return{sceneId:scene.id,transition:project.transition,transitionDuration:project.transitionDuration,values:[scene,...scene.components].map(t=>({id:t.id,fields:Object.fromEntries(['template','fx','effect','rows','entryFx','exitFx','inheritSceneEffect','effectConfirmed'].map(k=>[k,structuredClone(t[k])]))}))};}
  function restoreEffectFields(copy,trial=effectTrial){if(!trial)return;if('transition' in trial.saved){copy.transition=trial.saved.transition;copy.transitionDuration=trial.saved.transitionDuration;}const s=copy.scenes.find(s=>s.id===trial.saved.sceneId);if(!s)return;for(const row of trial.saved.values){const t=row.id===s.id?s:s.components.find(l=>l.id===row.id);if(!t)continue;for(const[k,v]of Object.entries(row.fields))if(v===undefined)delete t[k];else t[k]=structuredClone(v);}}
  function cancelEffectTrial(){if(!effectTrial)return;pause();restoreEffectFields(project);effectTrial=null;syncForm();draw();}
  function collectUsages(){if(!project)return[];const source=effectTrial?{...project,scenes:project.scenes.map(s=>({...s,components:s.components.map(l=>({...l}))}))}:project;if(effectTrial)restoreEffectFields(source);const entries=[];let start=0;for(const[index,s]of source.scenes.entries()){const add=(t,key,id,dock,label)=>{if(t[key]&&t[key]!=='none'&&(t[key]!=='clean'||t.effectConfirmed))entries.push({sceneId:s.id,componentId:id,kind:'visual',fx:t[key],key,targetId:t.id,dock,label:'Escena '+(index+1)+' · '+label,at:start+(key==='exitFx'?Math.max(0,s.duration-T.effects(t).soft):T.effects(t).start||0)});};add(s,'template',null,'image',C.templates.find(t=>t.id===s.template)?.name||'Imagen');add(s,'entryFx',null,'general','Entrada');add(s,'exitFx',null,'general','Salida');for(const l of s.components){add(l,'fx',l.id,'image',(l.name||l.text||'Estampa').slice(0,24));add(l,'entryFx',l.id,'general','Entrada · '+(l.name||'Texto'));add(l,'exitFx',l.id,'general','Salida · '+(l.name||'Texto'));}if(index>0&&source.transition!=='none')entries.push({sceneId:s.id,kind:'transition',dock:'general',label:'Escena '+(index+1)+' · Transición',at:start});start+=s.duration;}for(const e of source.audio.sfx||[]){const at=soundCue(e),sceneId=e.sceneId||C.sceneAt(source.scenes,at)?.scene.id;entries.push({sceneId,componentId:e.componentId||null,kind:'sound',soundId:e.id,soundKind:e.kind,label:e.name+' · '+(e.targetName||'Escena'),name:e.name,dock:'sound',at});}return entries;}
  function jumpUsage(entry){cancelEffectTrial();pause();const index=project.scenes.findIndex(s=>s.id===entry.sceneId);active=Math.max(0,index);selectedComponent=entry.componentId||null;time=C.clamp(entry.at,0,C.totalDuration(project.scenes));soundFocus=entry.kind==='sound'?entry.soundId:null;syncForm();openDockBefore9('effects');setEffectsTab(entry.dock);renderSoundEvents();draw();}
  function removeUsage(entry){pause();checkpoint();if(entry.kind==='sound'){project.audio.sfx=(project.audio.sfx||[]).filter(e=>e.id!==entry.soundId);soundNodes.get(entry.soundId)?.audio.pause();setupAudioElements().catch(()=>{});if(soundFocus===entry.soundId)soundFocus=null;}else if(entry.kind==='transition')project.transition='none';else{const s=project.scenes.find(s=>s.id===entry.sceneId),t=entry.targetId===s?.id?s:s?.components.find(l=>l.id===entry.targetId);if(t){t[entry.key]='none';if(t===s&&entry.key==='template')s.components.filter(l=>l.inheritSceneEffect).forEach(l=>{l.fx='none';l.inheritSceneEffect=false;});}}syncForm();changed();showUsageDetails(collectUsages().filter(e=>e.sceneId===current().id&&e.kind===entry.kind));}
  function showUsageDetails(entries){if(!entries.length){$('#usageDetails').hidden=true;return;}jumpUsage(entries[0]);const host=$('#usageDetails');host.replaceChildren();if(entries.length===1&&entries[0].kind==='sound'){host.hidden=true;return;}const heading=document.createElement('strong'),close=document.createElement('button');heading.textContent=entries[0].kind==='sound'?'Sonidos usados':'Efectos usados';close.textContent='×';close.title='Cerrar usados';close.onclick=()=>{host.hidden=true;soundFocus=null;renderSoundEvents();};host.append(heading,close);for(const entry of entries){const row=document.createElement('div'),go=document.createElement('button'),remove=document.createElement('button');go.textContent=entry.label;go.onclick=()=>jumpUsage(entry);remove.textContent='×';remove.title='Quitar '+entry.label;remove.onclick=()=>removeUsage(entry);row.append(go,remove);host.append(row);}host.hidden=false;}
  function usageBadge(entries,label){const b=document.createElement('button');b.type='button';b.className='usage-badge';b.textContent=label||'✓';b.title='Ver usados ('+entries.length+')';b.setAttribute('aria-label',b.title);b.onclick=e=>{e.stopPropagation();showUsageDetails(entries);};return b;}
  function renderUsedItems(){if(!$('#usageDetails')||!project)return;const entries=collectUsages();for(const node of $$('.usage-badge'))node.remove();for(const b of $$('[data-template]')){const list=entries.filter(e=>e.kind==='visual'&&e.key!=='entryFx'&&e.key!=='exitFx'&&e.fx===b.dataset.template);if(list.length)b.parentElement.append(usageBadge(list,'✓'));}for(const row of $$('#soundChoices .sound-choice')){const list=entries.filter(e=>e.kind==='sound'&&(e.soundKind===row.dataset.kind||e.name===row.querySelector('.audio-tile, strong')?.textContent));if(list.length)row.append(usageBadge(list,'✓'));}for(const[si,b]of [...$('#scenes').children].entries()){const s=project.scenes[si],list=entries.filter(e=>e.sceneId===s.id);for(const[kind,label]of[['visual','✦'],['sound','♪'],['transition','⇄']]){const marks=list.filter(e=>e.kind===kind);if(marks.length){const badge=usageBadge(marks,label);badge.dataset.usageType=kind;b.append(badge);}}}for(const[i,b]of [...$('#componentList').children].entries()){if(i===0)continue;const l=current().components[i-1],list=entries.filter(e=>e.sceneId===current().id&&e.componentId===l?.id);for(const[kind,label]of[['visual','✦'],['sound','♪'],['transition','⇄']]){const marks=list.filter(e=>e.kind===kind);if(marks.length){const badge=usageBadge(marks,label);badge.dataset.usageType=kind;b.append(badge);}}}}
  const soundEventsBefore9=renderSoundEvents;renderSoundEvents=function(){soundEventsBefore9();const host=$('#soundEvents');if(!host)return;if(soundFocus&&!(project.audio.sfx||[]).some(e=>e.id===soundFocus))soundFocus=null;host.hidden=!soundFocus;for(const row of host.children)row.hidden=!!soundFocus&&row.dataset.soundId!==soundFocus;};
  const timelineBefore9=syncTimeline;syncTimeline=function(){timelineBefore9();renderUsedItems();};
  const setFileBefore9=setFile;
  setFile=async function(file,kind){
    if(kind!=='background')return setFileBefore9(file,kind);
    const targets=sceneVisualTargets();
    const src=await fileData(file,file.type.startsWith('video/')?'video':'image');
    return applyScopedBackground({src,name:file.name},targets);
  };
  function installReelsV9(){
    $('#usedItems')?.remove();$('#layerColor').closest('label').childNodes[0].textContent='';$('#layerColor').setAttribute('aria-label','Color del texto');
    const effects=$('[data-drawer=effects]'),subnav=document.createElement('div');subnav.className='subtabs';const panels={};for(const[id,label]of[['image','Imagen'],['sound','Sonido'],['general','Generales']]){const b=document.createElement('button');b.textContent=label;b.dataset.effectSubtab=id;b.onclick=()=>{cancelEffectTrial();setEffectsTab(id);};subnav.append(b);const p=document.createElement('section');p.dataset.effectPanel=id;panels[id]=p;}panels.image.append($('#templates'),$('#effectSettingsBody'));panels.sound.append($('#soundChoices'),$('#soundSelectionControls'),$('#soundEvents'));for(const[id,label]of[['entry','Entrada'],['exit','Salida'],['transition','Transición']]){const section=document.createElement('section'),heading=document.createElement('strong');heading.textContent=label;section.append(heading,...$('[data-drawer='+id+']').childNodes);panels.general.append(section);}const used=document.createElement('section');used.id='usageDetails';used.hidden=true;effects.replaceChildren(subnav,panels.image,panels.sound,panels.general,used);
    for(const b of $$('[data-template]')){const box=document.createElement('div');box.className='effect-choice';b.before(box);box.append(b);b.onclick=()=>{pause();const id=b.dataset.template;if(id===targetTemplate()&&sceneScope==='current'){syncForm();time=project.scenes.slice(0,active).reduce((n,s)=>n+s.duration,0);play();return;}if(!effectTrial)beginEffectTrial11();else restoreEffectFields(project);const l=selectedLayer();effectTrial.templateChoice=id;effectTrial.layerId=l?.id;if(l){l.inheritSceneEffect=false;l.fx=id;l.effect={...T.effects({...l,template:id})};}else{current().template=id;if(['pencil','brush','wipe','before'].includes(id))for(const print of current().components.filter(x=>x.kind==='print')){print.fx=id;print.inheritSceneEffect=true;}current().effect={...T.effects({...current(),template:id})};}syncForm();changed();time=project.scenes.slice(0,active).reduce((n,s)=>n+s.duration,0);play();};}$('#previewEffect').onclick=()=>{pause();applyScopedEffectTrial();syncForm();changed();};
    const narration=$('[data-drawer=narration]'),voice=$('[data-drawer=voice]'),tabs=document.createElement('div'),narrator=document.createElement('section'),record=document.createElement('section'),mix=document.createElement('div');tabs.className='subtabs';narrator.dataset.voicePanel='narrator';record.dataset.voicePanel='record';for(const[id,label]of[['narrator','Narrador'],['record','Grabar voz']]){const b=document.createElement('button');b.textContent=label;b.dataset.voiceSubtab=id;b.onclick=()=>setVoiceTab(id);tabs.append(b);}narrator.append(...narration.childNodes);record.append($('#record'),$('#voiceFile').closest('label'));const voiceUpload=record.querySelector('#voiceFile').closest('label');for(const n of [...voiceUpload.childNodes])if(n.nodeType===3)n.remove();const voiceCaption=document.createElement('span');voiceCaption.textContent='＋ Subir grabación';voiceUpload.prepend(voiceCaption);voiceUpload.classList.add('upload-voice10');mix.className='voice-mix';mix.append(...voice.childNodes);narration.replaceChildren(tabs,narrator,record,mix);const links=[...narrator.querySelectorAll('a[download]')];links.forEach((a,i)=>{if(i)a.remove();else a.textContent='Descargar iniciador';});$('#voiceVolume').type='number';$('#voiceVolume').min='0';$('#voiceVolume').max='2';$('#voiceVolume').step='.05';for(const[id,label]of[['voiceVolume','Volumen'],['voiceRate','Velocidad'],['voiceBass','Graves'],['voiceTreble','Agudos'],['voiceOffset','Empieza en (s)']])$('#'+id).closest('label').childNodes[0].textContent=label;compactNumbers();$('#oldReelsPanels').append($('#ttsExample'));
    for(const id of ['entry','exit','transition','sounds','voice'])$('[data-dock='+id+']')?.remove();const order=$('#dockButtons');for(const id of ['format','background','effects','music','narration','wan'])order.append($('[data-dock='+id+']'));
    $('#removeBackground').onclick=()=>applyScopedBackground({});
    installSceneScope();setEffectsTab('image');setVoiceTab('narrator');installReelsV10();installReelsV11();installReelsV12();installReelsV13();renderUsedItems();
  }

  function musicSceneEnvelope12(at){const found=C.sceneAt(project.scenes,at);if(!found)return 0;const s=found.scene,fx=T.effects(s);let gain=1;if(s.entryFx&&s.entryFx!=='none')gain*=T.progress(found.local,0,fx.soft);if(s.exitFx&&s.exitFx!=='none')gain*=1-T.progress(found.local,s.duration-fx.soft,fx.soft);return C.clamp(gain,0,1);}
  function syncImageTiming12(){const host=$('#imageTiming12');if(!host)return;const layer=selectedLayer();host.hidden=!layer?.overlay;if(!layer?.overlay)return;for(const[id,key]of[['imageAppear12','appearAt'],['imageVisible12','visibleFor']])if(document.activeElement!==$('#'+id))$('#'+id).value=layer[key]??(key==='appearAt'?0:current().duration);}
  function installReelsV12(){project.showBrand=false;$('#oldReelsPanels').append($('#showBrand').closest('label'));const label=document.createElement('label');label.className='add-image12';label.innerHTML='<span>＋ Imagen</span><input type="file" accept="image/png,image/jpeg,image/webp" id="imageLayerFile12" aria-label="Agregar imagen">';$('#reelTextToolbar').prepend(label);label.querySelector('input').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;await addPrint(await fileData(file),file.name,true);}catch(e){notify(e.message,'error');}event.target.value='';};const controls=document.createElement('div');controls.id='imageTiming12';controls.className='image-timing12';controls.hidden=true;for(const[id,key,text]of[['imageAppear12','appearAt','Aparece en (s)'],['imageVisible12','visibleFor','Se ve durante (s)']]){const l=document.createElement('label'),input=document.createElement('input');l.textContent=text;input.id=id;input.type='number';input.min=key==='appearAt'?'0':'.1';input.max='30';input.step='.1';input.onfocus=()=>input._before=structuredClone(project);input.oninput=()=>{if(!selectedLayer()?.overlay)return;pause();selectedLayer()[key]=Number(input.value);changed();};input.onchange=()=>{checkpoint(input._before||project);input._before=null;syncImageTiming12();};l.append(input);controls.append(l);}$('#componentList').after(controls);compactNumbers();syncImageTiming12();}
  let editorActive13=false,selectedSceneIds=new Set();
  function jsonStore13(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch{return fallback;}}
  function creditText13(credit){return credit?`${credit.title} — ${credit.creator||'Autor indicado en la fuente'} · ${credit.license.toUpperCase()} ${credit.version||''}\n${credit.source}\n${credit.licenseUrl}`:'';}
  function projectShareText13(title,credit=project.audio.musicCredit){return title+(credit?'\n\nMúsica: '+creditText13(credit):'');}
  async function duplicateProject13(source){
    try{
      const snapshot=source.cloudOnly?await downloadReelSnapshot(source):source;
      const copy=await copyReelSnapshot(snapshot,' · copia');
      await openSavedProject(copy);
      notify('Reel duplicado.');
    }catch(error){notify(error.message,'error');}
  }
  const channelGifs14=[{"id": "vybukiMzTZu4Fi2TXe", "title": "Textura clara dorada", "username": "salmosstore7", "url": "https://giphy.com/gifs/vybukiMzTZu4Fi2TXe", "images": {"original": {"url": "https://media2.giphy.com/media/vybukiMzTZu4Fi2TXe/giphy.gif", "mp4": "https://media2.giphy.com/media/vybukiMzTZu4Fi2TXe/giphy.mp4"}}}, {"id": "Do9U7jEHFM1enrj2xO", "title": "Mármol negro y oro", "username": "salmosstore7", "url": "https://giphy.com/gifs/Do9U7jEHFM1enrj2xO", "images": {"original": {"url": "https://media2.giphy.com/media/Do9U7jEHFM1enrj2xO/giphy.gif", "mp4": "https://media2.giphy.com/media/Do9U7jEHFM1enrj2xO/giphy.mp4"}}}, {"id": "KRueaGQ0tuaBzf3jQO", "title": "Textura marrón", "username": "salmosstore7", "url": "https://giphy.com/gifs/KRueaGQ0tuaBzf3jQO", "images": {"original": {"url": "https://media2.giphy.com/media/KRueaGQ0tuaBzf3jQO/giphy.gif", "mp4": "https://media2.giphy.com/media/KRueaGQ0tuaBzf3jQO/giphy.mp4"}}}, {"id": "GRiA8ZPrnbiWJPwMWE", "title": "Mármol blanco y oro", "username": "salmosstore7", "url": "https://giphy.com/gifs/GRiA8ZPrnbiWJPwMWE", "images": {"original": {"url": "https://media0.giphy.com/media/GRiA8ZPrnbiWJPwMWE/giphy.gif", "mp4": "https://media0.giphy.com/media/GRiA8ZPrnbiWJPwMWE/giphy.mp4"}}}];
  function ownGifs13(){return [...new Map([...jsonStore13('salmos-own-gifs',[]),...channelGifs14].map(g=>[g.id,g])).values()];}
  function rememberGif13(gif){if(!gif?.id)return;const rows=ownGifs13(),i=rows.findIndex(g=>g.id===gif.id);if(i>=0)rows[i]=gif;else rows.unshift(gif);try{localStorage.setItem('salmos-own-gifs',JSON.stringify(rows.slice(0,100)));}catch{}}
  function installMyGifs13(host,query,search,own,find){const row=document.createElement('div');row.className='my-gifs13';const mine=document.createElement('button'),all=document.createElement('button'),channel=document.createElement('input');mine.textContent='Mis GIFs';all.textContent='Buscar GIFs';channel.value=localStorage.getItem('salmos-giphy-channel')||'salmosstore7';channel.placeholder='Mi canal de GIPHY';channel.setAttribute('aria-label','Mi canal de GIPHY');const extract=()=>{let text=channel.value.trim();if(/^https?:/.test(text)){const url=new URL(text);if(!/(^|\.)giphy\.com$/.test(url.hostname))throw Error('Usá el enlace de tu canal de GIPHY.');const parts=url.pathname.split('/').filter(Boolean);text=parts[0]==='channel'?parts[1]:parts[0];}if(!/^[a-z0-9_]{1,45}$/i.test(text))throw Error('Revisá el nombre del canal.');return text;};mine.onclick=()=>{renderOwnGifShelf14(host);host.querySelector('.giphy-search-fold').open=false;try{const username=extract();localStorage.setItem('salmos-giphy-channel',username);query.value='@'+username;if(username!=='salmosstore7'||localStorage.getItem('salmos-giphy-key'))search.click();mine.classList.add('active');all.classList.remove('active');}catch(e){notify(e.message,'error');}};all.onclick=()=>{host.querySelector('.giphy-search-fold').open=true;query.value='Fondos abstractos';search.click();all.classList.add('active');mine.classList.remove('active');};row.append(all,mine,channel);installGifUpload14(row,host);host.prepend(row);if(ownGifs13().length)host.querySelector('.giphy-search-fold').open=false;renderOwnGifShelf14(host);own.placeholder='Enlace de un GIF propio';find.textContent='Agregar mi GIF';}
  function pickScenes13(title,initial,apply,{confirmLabel='Aplicar en escenas elegidas',removing=false}={}){
    pause();
    const dialog=document.createElement('dialog'),heading=document.createElement('h2'),bar=document.createElement('div'),grid=document.createElement('div'),footer=document.createElement('footer'),cancel=document.createElement('button'),ok=document.createElement('button');
    dialog.className='scene-picker13';heading.textContent=title;grid.className='scene-picker-grid13';
    const chosen=new Set(initial);
    const sync=()=>{
      ok.disabled=!chosen.size||removing&&chosen.size===project.scenes.length;
      if(removing)ok.textContent=chosen.size?`Eliminar (${chosen.size})`:confirmLabel;
    };
    const render=()=>{
      grid.replaceChildren();
      for(const [index,scene] of project.scenes.entries()){
        const label=document.createElement('label'),check=document.createElement('input'),image=new Image();
        check.type='checkbox';check.checked=chosen.has(scene.id);check.setAttribute('aria-label','Escena '+(index+1));
        check.onchange=()=>{if(check.checked)chosen.add(scene.id);else chosen.delete(scene.id);sync();};
        image.src=scene.thumbnail||scene.final||scene.base||'';image.alt='';
        label.append(image,check,document.createTextNode(String(index+1)));grid.append(label);
      }
      sync();
    };
    const shortcuts=[['Actual',[current().id]],['Ninguna',[]]];
    if(!removing)shortcuts.splice(1,0,['Todas',project.scenes.map(scene=>scene.id)]);
    for(const [name,ids] of shortcuts){
      const button=document.createElement('button');button.type='button';button.textContent=name;
      button.onclick=()=>{chosen.clear();ids.forEach(id=>chosen.add(id));render();};bar.append(button);
    }
    cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>dialog.close();
    ok.type='button';ok.className='primary';ok.setAttribute('aria-label',confirmLabel);
    if(!removing)ok.textContent=confirmLabel;
    ok.onclick=async()=>{ok.disabled=true;try{await apply(chosen);dialog.close();}catch(error){notify(error.message,'error');sync();}};
    footer.append(cancel,ok);dialog.append(heading,bar,grid,footer);dialog.onclose=()=>dialog.remove();document.body.append(dialog);render();dialog.showModal();
  }
  function removeReelScenes(ids){
    if(!ids.size||ids.size>=project.scenes.length)return;
    pause();cancelEffectTrial();checkpoint();
    const previous=current().id;
    project.scenes=project.scenes.filter(scene=>!ids.has(scene.id));
    project.audio.sfx=(project.audio.sfx||[]).filter(sound=>!ids.has(sound.sceneId));
    const remaining=project.scenes.findIndex(scene=>scene.id===previous);
    if(remaining<0){active=Math.min(active,project.scenes.length-1);selectedComponent=null;}
    else active=remaining;
    selectCurrentSceneScope();
    time=project.scenes.slice(0,active).reduce((sum,scene)=>sum+scene.duration,0);
    syncForm();changed();
    setupAudioElements().catch(error=>notify(error.message,'error'));
  }
  function installReelsV13(){
    $('#musicCatalog').value='original';$('#oldReelsPanels').append($('#saveProject'));
    window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='salmos-marketing-home')homeView();});
    const copy=document.createElement('button');
    copy.type='button';copy.textContent='Copiar imagen al alcance';
    copy.onclick=async()=>{
      const source=selectedLayer();
      if(!source?.overlay)return;
      const scenes=scopeScenes().filter(scene=>scene!==current());
      if(!scenes.length)return;
      if(scenes.some(scene=>!relatedLayer(scene,source)&&scene.components.length>=30))return notify('Una de las escenas ya tiene 30 componentes.');
      pause();checkpoint();
      const targets=scenes.map(scene=>({scene,previous:relatedLayer(scene,source)}));
      source.scopeLayerId=source.scopeLayerId||source.overlayGroupId||C.uid();
      for(const {scene,previous} of targets){
        const layer={...structuredClone(source),id:previous?.id||C.uid()};
        if(previous)scene.components[scene.components.indexOf(previous)]=layer;else scene.components.push(layer);
        fitOverlayTime20(layer,scene);
      }
      syncForm();changed();
    };
    $('#imageTiming12').append(copy);
    musicCatalog();
  }
  const ttsCache11=new Map();
  function musicFields11(audio){return Object.fromEntries(['music','musicName','musicStart','musicEnd','musicLoop','musicVolume','musicRate','musicCredit','musicAssetId'].map(k=>[k,audio[k]]));}
  function beginEffectTrial11(){if(!effectTrial)effectTrial={saved:effectFields(current()),before:structuredClone(project),touched:new Set()};syncSceneScope();}
  function replayScene11(){pause();time=project.scenes.slice(0,active).reduce((n,s)=>n+s.duration,0);syncForm();play();}
  function backgroundSpec11(){const s=current();return{src:s.background||null,palette:s.backgroundPalette||project.palette,name:s.backgroundName||'',...(s.giphy?{giphy:s.giphy}:{})};}
  function installReelsV11(){
    for(const[id,label]of[['previousScene','Subir escena'],['nextScene','Bajar escena']]){const b=$('#'+id);b.hidden=false;b.textContent=id==='previousScene'?'↑':'↓';b.title=label;b.setAttribute('aria-label',label);}

    for(const b of $$('[data-edge-key]'))b.onclick=()=>{beginEffectTrial11();effectTarget()[b.dataset.edgeKey]=b.dataset.edgeValue;replayScene11();};
    const duration=$('#transitionDuration');duration.oninput=duration.onchange=()=>{beginEffectTrial11();project.transitionDuration=Number(duration.value);changed();};
    const apply=document.createElement('button');
    apply.id='confirmBackground11';apply.textContent='Copiar fondo actual';
    apply.onclick=()=>{
      const spec={...backgroundSpec11(),motion:current().motionOverlay19||''};
      applyScopedBackground(spec).catch(error=>notify(error.message,'error'));
    };
    $('#backgroundGallery').before(apply);
  }
  const groundBounds10=new WeakMap();
  function paintGround10(c,s,im,r,W,H){let b=groundBounds10.get(im);if(!b){try{const t=document.createElement('canvas');t.width=120;t.height=Math.max(1,Math.round(120*im.height/im.width));const x=t.getContext('2d');x.drawImage(im,0,0,t.width,t.height);const d=x.getImageData(0,0,t.width,t.height).data;let left=120,right=0,bottom=0;for(let y=0;y<t.height;y++)for(let i=0;i<120;i++)if(d[(y*120+i)*4+3]>90){left=Math.min(left,i);right=Math.max(right,i);bottom=Math.max(bottom,y);}b={x:(left+right)/240,y:(bottom+1)/t.height,w:(right-left)/120};groundBounds10.set(im,b);}catch{return;}}const y=r.y+r.h*b.y,x=r.x+r.w*b.x;c.save();const floor=c.createLinearGradient(0,y-60,0,H);floor.addColorStop(0,'#00000000');floor.addColorStop(1,'#23152228');c.fillStyle=floor;c.fillRect(0,y-60,W,H-y+60);c.translate(x,y+3);c.scale(Math.max(35,r.w*b.w*.5),14);const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'#1b102c66');g.addColorStop(1,'#1b102c00');c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();}
  function icon10(kind){return kind==='check'?'<i class="fa-solid fa-circle-check"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m7 12 3 3 7-7" fill="none" stroke="var(--production-panel,#442234)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></i>':'<i class="fa-solid fa-eraser"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m15 2 7 7-11 12H5l-5-5L15 2Zm-7 9-5 5 3 3h4l3-3-5-5Z"/></svg></i>';}
  function installReelsV10(){const form=$('#effectSettingsBody .form-grid');for(const[id,title,kind]of[['previewEffect','Aplicar efecto','check'],['resetEffect','Restablecer efecto','eraser']]){const b=$('#'+id);b.innerHTML=icon10(kind);b.title=title;b.setAttribute('aria-label',title);b.classList.add('icon-action10');form.append(b);}const controls=document.createElement('div');controls.id='musicSelectionControls';controls.className='selection-controls';controls.hidden=true;const name=document.createElement('strong');name.id='musicSelectionName';const ok=document.createElement('button');ok.id='confirmMusic10';ok.innerHTML=icon10('check');ok.title='Aplicar música';ok.setAttribute('aria-label','Aplicar música');const mix=$('[data-drawer=music] .mix-inline');controls.append(name,mix,ok);$('#musicResults').after(controls);const own=$('#ownMusicTools'),ownMix=document.createElement('div');ownMix.className='own-music-mix';for(const[id,label,key,min,max,step]of[['ownVolume10','Volumen','musicVolume',0,2,.05],['ownRate10','Velocidad','musicRate',.5,1.75,.05]]){const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.id=id;i.type='number';i.min=min;i.max=max;i.step=step;i.value=project.audio[key]??1;i.oninput=()=>{project.audio[key]=Number(i.value);$('#'+key).value=i.value;changed();};l.append(i);ownMix.append(l);}own.append(ownMix);const upload=$('#musicFile').closest('label');for(const n of [...upload.childNodes])if(n.nodeType===3)n.remove();const text=document.createElement('span');text.textContent='＋ Subir mi canción';upload.prepend(text);upload.classList.add('upload-song10');const support=document.createElement('div');support.className='ground-controls10';for(const[id,label]of[['none','Sin apoyo'],['shadow','Piso y sombra'],['near','Encuadre cercano']]){const b=document.createElement('button');b.textContent=label;b.dataset.ground10=id;b.onclick=()=>{pause();checkpoint();current().groundSupport=id==='shadow'?'shadow':null;current().framing=id==='near'?1.35:1;support.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));changed();};support.append(b);}$('[data-drawer=background]').prepend(support);compactNumbers();musicCatalog();}

  function applyViewZoom(value){viewZoom=C.clamp(value,1,5);const viewport=$('#stageViewport'),shell=$('.canvas-shell'),ratio=project.ratio.split(':').map(Number);viewport.classList.toggle('zoomed',viewZoom>1.01);shell.style.transform='';if(viewZoom>1.01){shell.style.maxHeight='none';shell.style.maxWidth='none';shell.style.height=viewport.clientHeight*viewZoom+'px';shell.style.width=viewport.clientHeight*ratio[0]/ratio[1]*viewZoom+'px';}else{shell.style.height='100%';shell.style.width='auto';shell.style.maxHeight='100%';shell.style.maxWidth='100%';viewport.scrollTop=viewport.scrollLeft=0;}}
  const REEL_SCENE_LIMIT=36;
  const REEL_FILE_TYPES={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm'};
  const REEL_SCENE_FILES=Object.keys(REEL_FILE_TYPES).map(extension=>'.'+extension).join(',');
  function selectInsertedReelScene(index){
    selectCurrentSceneScope();
    selectedComponent=null;editingStamp=false;blankPreview=false;
    active=index;
    time=C.totalDuration(project.scenes.slice(0,active));
    if(index>0&&project.transition!=='cut')time+=Math.min(current().duration*.8,project.transitionDuration||1.1);
    syncForm();changed();editorView();
  }
  async function appendReelFileScenes(files,fresh=false){
    if(!files.length)return;
    const previous=project,available=REEL_SCENE_LIMIT-(fresh?0:previous.scenes.length);
    if(files.length>available)throw new Error('El máximo es de 36 escenas por reel.');
    const scenes=[];
    for(const input of files){
      const extension=input.name.split('.').pop().toLowerCase();
      const mime=Object.values(REEL_FILE_TYPES).includes(input.type)?input.type:REEL_FILE_TYPES[extension];
      if(!mime)throw new Error('Elegí una imagen PNG, JPG, WebP o GIF, o un video MP4 o WebM.');
      const file=input.type===mime?input:new File([input],input.name,{type:mime});
      const video=/^video\/(mp4|webm)$/i.test(file.type);
      const src=await fileData(file,video?'video':'image');
      const clip=asset(src,video);
      await clip._ready;
      const name=file.name.replace(/\.[^.]+$/,'');
      const scene={...defaultScene(),shotTitle:name.slice(0,80),baseName:file.name,components:[],
        template:'clean',demo:false,headline:'',detail:'',cta:''};
      if(video){
        scene.video=src;
        scene.videoFullFrame21=true;
        scene.duration=C.clamp(Math.round((Number(clip.duration)||5)*10)/10,2,30);
        if(clip.videoWidth&&clip.videoHeight){
          const thumb=document.createElement('canvas');
          thumb.width=160;thumb.height=Math.max(1,Math.round(160*clip.videoHeight/clip.videoWidth));
          thumb.getContext('2d').drawImage(clip,0,0,thumb.width,thumb.height);
          scene.thumbnail=thumb.toDataURL('image/jpeg',.8);
        }
      }else{
        scene.final=src;
        scene.fullFrameImage21=true;
      }
      scenes.push(scene);
    }
    if(project!==previous)return;
    pause();cancelEffectTrial();
    if(fresh){
      if(editorActive13)await flushReelAutosave();
      if(project!==previous)return;
      clearTimeout(autosaveTimer);autosaveTimer=null;
      await cancelMusicTrial();
      project=newProject();
      project.title=scenes[0].shotTitle||'Nuevo reel';
      project.scenes=[];
      selectedSceneIds.clear();selectedMusic10=null;auditionTrack=null;
      history.length=0;future.length=0;syncUndo();
    }else{
      if(project.scenes.length+scenes.length>REEL_SCENE_LIMIT)throw new Error('El máximo es de 36 escenas por reel.');
      checkpoint();
    }
    const index=project.scenes.length;
    project.scenes.push(...scenes);
    selectInsertedReelScene(index);
  }
  async function selectProductsForReel(fresh=true,allowBlank=false){
    const dialog=document.createElement('dialog');
    dialog.className='source-dialog';
    const title=document.createElement('h2');
    title.textContent=fresh?'Nuevo reel':allowBlank?'Agregar escena':'Agregar productos';
    const sources=document.createElement('div');
    sources.className='button-row reel-scene-sources';
    const input=document.createElement('input');
    input.type='file';input.accept=REEL_SCENE_FILES;input.multiple=true;input.hidden=true;
    const upload=document.createElement('button');
    upload.textContent='Subir de la PC';upload.onclick=()=>input.click();
    sources.append(upload,input);
    const blank=allowBlank?document.createElement('button'):null;
    if(blank){
      blank.textContent='Escena en blanco';
      blank.onclick=()=>{
        if(project.scenes.length>=REEL_SCENE_LIMIT){status.textContent='El máximo es de 36 escenas por reel.';return;}
        pause();cancelEffectTrial();checkpoint();
        const index=project.scenes.length;
        project.scenes.push({...defaultScene(),components:[],template:'clean',demo:false,headline:'Tu próxima escena',detail:'',cta:current().cta});
        selectInsertedReelScene(index);dialog.close();
      };
      sources.append(blank);
    }
    const search=document.createElement('input');
    search.placeholder='Buscar producto';search.type='search';search.setAttribute('aria-label','Buscar producto');
    const grid=document.createElement('div');
    grid.className='source-grid';
    const status=document.createElement('output');
    status.setAttribute('role','status');
    const picked=new Set(),apply=document.createElement('button'),close=document.createElement('button');
    apply.className='primary';apply.textContent=fresh?'Crear con productos':'Agregar productos';apply.disabled=true;
    close.textContent='Cancelar';close.onclick=()=>dialog.close();
    let items=[],busy=false;
    const setBusy=value=>{
      busy=value;
      upload.disabled=close.disabled=search.disabled=value;
      if(blank)blank.disabled=value;
      for(const control of grid.querySelectorAll('input'))control.disabled=value;
      apply.disabled=value||!picked.size;
    };
    const paint=()=>{
      grid.replaceChildren();
      const query=search.value.toLowerCase();
      for(const product of items.filter(item=>String(item.name).toLowerCase().includes(query))){
        const label=document.createElement('label'),check=document.createElement('input');
        check.type='checkbox';check.checked=picked.has(product.id);check.disabled=busy;
        check.onchange=()=>{
          if(check.checked)picked.add(product.id);
          else picked.delete(product.id);
          apply.disabled=busy||!picked.size;
        };
        const thumb=product.thumbnail||product.image_url;
        if(thumb){const image=new Image();image.src=thumb;image.alt=product.name;label.append(image);}
        label.title=product.name;check.setAttribute('aria-label',product.name);label.append(check);grid.append(label);
      }
    };
    search.oninput=paint;
    input.onchange=async()=>{
      const files=[...input.files];input.value='';
      if(!files.length||busy)return;
      setBusy(true);status.textContent='Preparando archivos…';
      try{await appendReelFileScenes(files,fresh);dialog.close();}
      catch(error){status.textContent=error.message;}
      finally{setBusy(false);}
    };
    apply.onclick=async()=>{
      if(!picked.size||busy)return;
      setBusy(true);
      try{
        if(fresh){
          await flushReelAutosave();
          project=newProject();
          selectCurrentSceneScope();selectedMusic10=null;auditionTrack=null;
          project.scenes=[];
          project.title=items.filter(item=>picked.has(item.id)).map(item=>item.name).join(' · ');
          history.length=0;future.length=0;
        }
        for(const id of picked){
          if(project.scenes.length>=REEL_SCENE_LIMIT)break;
          const data=await requestParent('productViews',{productId:id});
          for(const view of data.views){
            if(project.scenes.length>=REEL_SCENE_LIMIT)break;
            status.textContent='Preparando '+data.name+' · '+view.name;
            const payload=await requestParent('product',{productId:id,imageId:view.id,mode:view.viewKey?'layers':'final'});
            project.scenes.push({...defaultScene(),components:[],demo:false});
            active=project.scenes.length-1;
            await importPayload(payload);
            current().duration=5;current().shotTitle=view.name;current().thumbnail=view.url;
          }
        }
        if(!project.scenes.length)project.scenes=[{...defaultScene(),components:[],demo:false}];
        active=0;selectedComponent=null;time=0;blankPreview=false;
        await prepareMedia();syncForm();changed();editorView();dialog.close();
      }catch(error){status.textContent=error.message;}
      finally{setBusy(false);}
    };
    const footer=document.createElement('footer');
    footer.className='product-picker-footer';
    footer.append(status,close,apply);dialog.append(title,sources,search,grid,footer);
    dialog.oncancel=event=>{if(busy)event.preventDefault();};
    dialog.onclose=()=>dialog.remove();
    document.body.append(dialog);dialog.showModal();
    grid.textContent='Cargando productos…';
    try{
      items=await requestParent('catalog');
      if(dialog.open){paint();if(!items.length)grid.textContent='Todavía no hay productos en el catálogo.';}
    }catch{
      if(dialog.open)grid.textContent='No se pudo cargar el catálogo.';
    }
  }
  function syncStageAssets(){if(!$('#sourceAssets')||!current())return;$('.canvas-shell').style.aspectRatio=project.ratio.replace(':','/');const ratio=project.ratio.split(':').map(Number);document.body.style.setProperty('--reel-preview-ratio',String(ratio[0]/ratio[1]));const host=$('#sourceAssets');host.replaceChildren();for(const l of current().components.filter(x=>x.kind==='print')){const b=document.createElement('button');b.className='asset-chip';const im=document.createElement('img');im.src=componentThumb(l);im.alt=l.name||'Estampa';b.append(im);b.title=l.name;b.onclick=()=>{setSelection(l.id);openDock('effects');};host.append(b);}$('#showBlank').classList.toggle('active',blankPreview);$('#showFinished').classList.toggle('active',!blankPreview);}
  function componentThumb(l){if(l.kind==='text')return l.render||'';const im=componentImage(l);if(!im?.complete)return l.src||l.render||'';if(!l.baked)return l.src;const b=l.bounds||{x:0,y:0,w:1,h:1},c=document.createElement('canvas');c.width=90;c.height=90;const x=b.x*im.width,y=b.y*im.height,w=b.w*im.width,h=b.h*im.height,k=Math.min(90/w,90/h);c.getContext('2d').drawImage(im,x,y,w,h,(90-w*k)/2,(90-h*k)/2,w*k,h*k);return c.toDataURL();}
  const syncComponentsV4=syncComponents;syncComponents=function(){syncComponentsV4();if(!document.body.classList.contains('production-reels'))return;const buttons=[...$('#componentList').children];for(let i=1;i<buttons.length;i++){const l=current().components[i-1],image=new Image();image.src=componentThumb(l);image.alt='';buttons[i].prepend(image);buttons[i].title=l.production?String(l.widthCm||'')+' × '+String(l.heightCm||'')+' cm':l.text||l.name;}
    for(const id of ['showFonts','layerBold','layerItalic','layerColor','duplicateComponent'])$('#'+id).disabled=selectedLayer()?.kind!=='text';$$('[data-text-control]').forEach(b=>b.disabled=selectedLayer()?.kind!=='text');$('#componentActions').hidden=true;$('#layerTextTools').hidden=selectedLayer()?.kind!=='text';for(const b of $$('[data-edge-key]'))b.classList.toggle('active',(effectTarget()[b.dataset.edgeKey]||'none')===b.dataset.edgeValue);if($('#soundEvents')?._audio!==project.audio)renderSoundEvents();$('#soundEvents')?.querySelectorAll('button[title="Ubicar en la próxima transición"]').forEach(b=>b.disabled=active>=project.scenes.length-1);if($('#musicRate')&&document.activeElement!==$('#musicRate'))$('#musicRate').value=project.audio.musicRate||1;for(const[id,key]of[['ownVolume10','musicVolume'],['ownRate10','musicRate']])if($('#'+id)&&document.activeElement!==$('#'+id))$('#'+id).value=project.audio[key]??1;for(const b of $$('[data-ground10]'))b.classList.toggle('active',b.dataset.ground10===(current().framing>1?'near':current().groundSupport?'shadow':'none'));syncImageTiming12();syncSceneScope();syncStageAssets();renderUsedItems();};
  const syncTimelineV4=syncTimeline;syncTimeline=function(){syncTimelineV4();if(!document.body.classList.contains('production-reels'))return;[...$('#scenes').children].forEach((b,i)=>{const s=project.scenes[i],img=new Image();img.src=s.thumbnail||s.final||s.base||'';img.alt=s.shotTitle||s.baseName||'';b.prepend(img);b.draggable=true;b.dataset.sceneId=s.id;b.ondragstart=e=>{e.dataTransfer.setData('text/plain',s.id);e.dataTransfer.effectAllowed='move';};b.ondragover=e=>{e.preventDefault();b.classList.add('drop-target');};b.ondragleave=()=>b.classList.remove('drop-target');b.ondrop=e=>{e.preventDefault();const from=project.scenes.findIndex(v=>v.id===e.dataTransfer.getData('text/plain')),to=project.scenes.findIndex(v=>v.id===s.id);if(from<0||from===to)return;pause();checkpoint();const chosen=current().id,moved=project.scenes.splice(from,1)[0];project.scenes.splice(to,0,moved);active=project.scenes.findIndex(v=>v.id===chosen);time=project.scenes.slice(0,active).reduce((n,v)=>n+v.duration,0);syncForm();changed();};});};
  setTab=function(tab){if(tab==='projects')return homeView();if(tab==='ai')return editorView(true);if(tab==='audio'){editorView();openDock('music');return;}if(tab==='editor')return editorView();};

  function bindExtra(){const help=document.createElement('div');help.id='shotHelp';help.className='shot-help';$('[data-panel="editor"] .section-heading').after(help);    for(const input of $$('[data-effect]')){input.onfocus=()=>input._before=structuredClone(project);input.oninput=()=>{pause();current().effect={...T.effects(current()),[input.dataset.effect]:checkedValue(input)};changed();};input.onchange=()=>{checkpoint(input._before||project);input._before=null;syncForm();changed();};}
    $('#placeHeadline').onclick=()=>{pause();editingStamp=false;focusPicking=false;textPicking=true;notify('Tocá el punto donde querés ubicar la frase. La frase queda como una capa fija sobre la escena.');draw();};$('#editStamp').onclick=()=>{textPicking=false;pause();if(!current().stamp||current().final)return notify('Para editar solo la estampa cargá una base lisa y un PNG separado. En una composición terminada podés ajustar el foco del zoom.');editingStamp=!editingStamp;time=project.scenes.slice(0,active).reduce((v,s)=>v+s.duration,0)+current().duration*.85;syncForm();draw();};
    for(const [id,axis] of [['centerX','x'],['centerY','y']])$('#'+id).onclick=()=>{if(!current().stamp||current().final)return;checkpoint();const p=current().placement,im=asset(current().stamp),base=asset(current().base),aspect=im.width/im.height;if(axis==='x')p.x=(1-p.w)/2;else p.y=(1-p.w*(base?.width||720)/(base?.height||1000)/aspect)/2;editingStamp=true;syncForm();changed();};$('#straighten').onclick=()=>{checkpoint();current().placement.rotation=0;syncForm();changed();};$('#chooseFocus').onclick=()=>{pause();textPicking=false;editingStamp=true;focusPicking=true;$('#chooseFocus').textContent='Tocá el punto en la imagen';syncForm();draw();};$('#previewEffect').onclick=()=>{editingStamp=false;focusPicking=false;time=project.scenes.slice(0,active).reduce((v,s)=>v+s.duration,0);syncForm();play();};$('#resetEffect').onclick=()=>{checkpoint();delete current().effect;current().focus=null;syncForm();changed();};
    canvas.tabIndex=0;canvas.addEventListener('pointerdown',componentPointer);canvas.addEventListener('pointermove',componentMove);canvas.addEventListener('pointerup',componentUp);canvas.addEventListener('pointercancel',componentUp);canvas.addEventListener('keydown',event=>{if(!editingStamp||!current().stamp||current().final||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();checkpoint();const p=current().placement,d=event.shiftKey?.01:.002;p.x+=event.key==='ArrowLeft'?-d:event.key==='ArrowRight'?d:0;p.y+=event.key==='ArrowUp'?-d:event.key==='ArrowDown'?d:0;syncForm();changed();});
    $('#copyNarration').onclick=()=>copyText(project.narration);$('#salmosBackgrounds').onclick=salmosBackgrounds;$('#localBackgrounds').onclick=backgroundShelf;$('#backFile').onchange=async event=>{try{const src=await fileData(event.target.files[0]);await asset(src)._ready;checkpoint();current().back=src;current().template='mirror';syncForm();changed();}catch(e){notify(e.message,'error');}event.target.value='';};$('#storySearch').oninput=buildStories;$('#storyFilter').onchange=buildStories;for(const id of ['musicCatalog','musicGenre','musicVocals'])$('#'+id).onchange=musicCatalog;buildStories();musicCatalog();backgroundShelf();}

  function bind(){
    for(const b of $$('[data-tab]'))b.onclick=()=>setTab(b.dataset.tab);
    for(const scope of ['scene','project','audio','placement'])for(const input of $$('[data-'+scope+']')){
      if(input.id==='rows'||input.id==='duration')continue;
      const key=input.dataset[scope];
      const write=()=>{
        const value=checkedValue(input);
        if(scope==='scene'){setScopedSceneField(key,value);return;}
        const target=scope==='project'?project:scope==='audio'?project.audio:current().placement;
        target[key]=value;
      };
      input.addEventListener('change',()=>{
        pause();checkpoint(input._rangeBefore||project);input._rangeBefore=null;write();
        if(scope==='audio')setupAudioElements().catch(error=>notify(error.message,'error'));
        syncForm();changed();
      });
      input.addEventListener('input',()=>{
        if(scope==='scene'&&input.type==='number'&&input.value==='')return;
        if(scope==='scene')pause();
        input._rangeBefore??=structuredClone(project);write();changed();
      });
    }
    const templateHost=$('#templates');C.templates.forEach(t=>{const b=document.createElement('button');b.type='button';b.dataset.template=t.id;b.title=t.description;const strong=document.createElement('strong');strong.textContent=t.name;const small=document.createElement('small');small.textContent=t.id==='pencil'?'Tu idea inicial':'Sin créditos de IA';b.append(strong,small);b.onclick=()=>{pause();checkpoint();current().template=t.id;editingStamp=false;focusPicking=false;time=project.scenes.slice(0,active).reduce((v,s)=>v+s.duration,0)+current().duration*.55;syncForm();changed();};templateHost.append(b);});
    for(const [id,key] of [['baseFile','base'],['stampFile','stamp'],['finalFile','final'],['backgroundFile','background'],['videoFile','video']])$('#'+id).onchange=async e=>{try{await setFile(e.target.files[0],key);}catch(err){notify(err.message,'error');}e.target.value='';};$('#galleryFiles').onchange=async event=>{
      const files=[...event.target.files];
      event.target.value='';
      event.target.disabled=true;
      try{await appendReelFileScenes(files);}catch(error){notify(error.message,'error');}
      finally{event.target.disabled=false;}
    };
    for(const kind of ['music','voice'])$('#'+kind+'File').onchange=async e=>{try{await setAudio(e.target.files[0],kind);}catch(err){notify(err.message,'error');}e.target.value='';};for(const kind of ['Music','Voice'])$('#remove'+kind).onclick=async()=>{pause();checkpoint();project.audio[kind.toLowerCase()]=null;project.audio[kind.toLowerCase()+'Name']='';await setupAudioElements();syncForm();changed();};$('#removeVideo').onclick=()=>{pause();checkpoint();current().video=null;syncForm();changed();};$('#removeBackground').onclick=()=>{checkpoint();current().background=null;delete current().giphy;current().bgMotion='';syncForm();changed();};$('#logoFile').onchange=async e=>{try{const src=await fileData(e.target.files[0]);await asset(src)._ready;checkpoint();project.logo=src;changed();}catch(err){notify(err.message,'error');}e.target.value='';};$('#removeLogo').onclick=()=>{checkpoint();project.logo=null;changed();};
    $('#play').onclick=()=>{if(playing){pause();selectSceneAtPreview();}else play();};$('#restart').onclick=()=>{pause();time=0;selectSceneAtPreview();draw();};$('#seek').oninput=()=>{pause();time=Number($('#seek').value);const next=C.sceneAt(project.scenes,time).index;if(next!==active){pendingVisual=null;selectedComponent=null;}active=next;syncForm();draw();};$('#guides').onchange=draw;$('#poster').onclick=()=>poster().catch(e=>notify(e.message,'error'));$('#aiFrame').onclick=()=>poster(true).catch(e=>notify(e.message,'error'));$('#undo').onclick=async()=>{if(!history.length)return;pause();future.push(structuredClone(project));project=history.pop();normalizeProject();active=Math.min(active,project.scenes.length-1);await prepareMedia();syncForm();changed();};$('#redo').onclick=async()=>{if(!future.length)return;pause();history.push(structuredClone(project));project=future.pop();normalizeProject();active=Math.min(active,project.scenes.length-1);await prepareMedia();syncForm();changed();};
    $('#addScene').onclick=()=>selectProductsForReel(false,true);$('#duplicateScene').onclick=()=>{if(project.scenes.length>=REEL_SCENE_LIMIT)return notify('El máximo es de 36 escenas.','error');checkpoint();selectCurrentSceneScope();selectedComponent=null;project.scenes.splice(active+1,0,{...structuredClone(current()),id:C.uid()});active++;time=project.scenes.slice(0,active).reduce((v,s)=>v+s.duration,0)+current().duration*.8;syncForm();changed();};$('#deleteScene').textContent='Eliminar escenas';$('#deleteScene').onclick=()=>{
      if(project.scenes.length>1)pickScenes13('Marcá las escenas para eliminar',[current().id],removeReelScenes,{confirmLabel:'Eliminar seleccionadas',removing:true});
    };for(const [id,delta] of [['previousScene',-1],['nextScene',1]])$('#'+id).onclick=()=>{const next=active+delta;if(next<0||next>=project.scenes.length)return;checkpoint();[project.scenes[active],project.scenes[next]]=[project.scenes[next],project.scenes[active]];active=next;time=project.scenes.slice(0,active).reduce((v,s)=>v+s.duration,0);syncForm();changed();};
    $('#saveProject').onclick=async()=>{cancelEffectTrial();await cancelMusicTrial();await saveRecord(project.id);notify('Proyecto guardado.');};$('#saveLocal').onclick=async()=>{try{await saveRecord();await loadSaved();notify('Proyecto guardado en este equipo.');}catch(e){notify(e.message,'error');}};$('#projectFile').onchange=async event=>{
      const input=event.target,file=input.files[0];
      input.value='';
      if(!file)return;
      try{
        if(file.size>220*1024*1024)throw new Error('Ese proyecto es demasiado grande para abrirlo.');
        const raw=JSON.parse(await file.text()),data=C.validateProject(raw.project||raw),id=C.uid();
        const copy={...data,id,originalId:id,savedAt:Date.now()};
        await dbAction('projects','readwrite',store=>store.add(copy));
        await openSavedProject(copy);
        notify('Respaldo abierto y guardado como proyecto.');
      }catch(error){notify(error.message,'error');}
    };$('#newProject').onclick=async()=>{try{await flushReelAutosave();}catch(error){notify(error.message,'error');return;}checkpoint();pause();project=newProject();active=0;time=0;syncForm();changed(true);setTab('editor');};
    C.niches.forEach(n=>$('#niche').add(new Option(n.name,n.id)));$('#niche').add(new Option('Mi propio público','custom'));$('#ideaFormat').add(new Option('Varios enfoques','all'));C.formats.forEach(f=>$('#ideaFormat').add(new Option(f.name,f.id)));$('#generateIdeas').onclick=generateIdeas;$('#nextIdeas').onclick=()=>{ideaOffset=(ideaOffset+4)%C.formats.length;$('#ideaFormat').value='all';generateIdeas();};$('#downloadIdeas').onclick=()=>{const rows=[['Público','Enfoque','Producto','Frase','Guion visual','Guion de voz','Texto para publicar']];for(const n of C.niches)for(const f of C.formats){const i=C.idea(n.id,f.id,$('#ideaProduct').value);rows.push([i.niche,i.format,$('#ideaProduct').value,i.headline,i.story,i.narration,i.caption]);}csv(rows,'SALMOS-240-ideas.csv');};
    $('#record').onclick=toggleRecord;$('#connectLocal').onclick=connectLocal;$('#tts').onclick=()=>generateTts(false);$('#aiMotion').onchange=updatePrompt;$('#copyPrompt').onclick=()=>copyText($('#aiPrompt').value);$('#export').onclick=async()=>{cancelEffectTrial();shareAfterExport=false;await cancelMusicTrial();$('#exportDialog').showModal();};$('#startExport').onclick=doExport;$('#cancelExport').onclick=()=>cancelled=true;$('#postDate').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date());$('#savePost').onclick=async()=>{try{if(!$('#postDate').value)throw new Error('Elegí una fecha.');await dbAction('posts','readwrite',s=>s.put({id:C.uid(),title:project.title,date:$('#postDate').value,channel:$('#postChannel').value,url:$('#postUrl').value,inquiries:Math.max(0,Number($('#postInquiries').value)||0),notes:$('#postNotes').value}));await loadLog();notify('Publicación anotada.');}catch(e){notify(e.message,'error');}};$('#downloadLog').onclick=async()=>{const all=await loadLog();csv([['Fecha','Proyecto','Canal','Enlace','Consultas','Notas'],...all.map(p=>[p.date,p.title,p.channel,p.url,p.inquiries,p.notes])],'SALMOS-registro-publicaciones.csv');};
    $('#importProduction').onclick=async()=>{try{await importPayload(await requestParent('composition'));}catch(e){notify(e.message,'error');}};
    const catalogButton=document.createElement('button');catalogButton.type='button';catalogButton.textContent='Elegir producto terminado de SALMOS';catalogButton.style.cssText='margin:0 0 15px;font-size:12px';catalogButton.onclick=chooseProduct;$('.upload-grid').after(catalogButton);
    document.addEventListener('keydown',event=>{if(['Delete','Backspace'].includes(event.key)&&selectedLayer()&&!event.target.closest('input,textarea,select,[contenteditable]')){event.preventDefault();$('#deleteComponent').click();return;}if(exporting||event.target.closest('input,textarea,select,[contenteditable]'))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$('#'+(event.shiftKey?'redo':'undo')).click();}if(event.code==='Space'){event.preventDefault();$('#play').click();}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&!exporting)pause();if(document.hidden&&exporting)$('#busyText').textContent='Volvé a esta pestaña para mantener la exportación fluida.';});window.addEventListener('beforeunload',e=>{if(recording||exporting){e.preventDefault();e.returnValue='';}recordStream?.getTracks().forEach(t=>t.stop());});
  }
  async function saveDraft14(){pause();clearTimeout(autosaveTimer);cancelEffectTrial();await cancelMusicTrial();project.status='draft';await saveRecord();notify('Borrador guardado en Proyectos.');}
  async function renderOwnGifShelf14(host){let shelf=host.querySelector('.own-gif-shelf14');if(!shelf){shelf=document.createElement('div');shelf.className='own-gif-shelf14';host.insertBefore(shelf,host.querySelector('.giphy-search-fold'));}const rows=await dbAction('assets','readonly',s=>s.getAll());if(!shelf.isConnected)return;shelf.replaceChildren();for(const gif of ownGifs13().filter(g=>g.username==='salmosstore7')){const card=document.createElement('article'),b=document.createElement('button'),img=new Image();img.src=gif.images?.fixed_height?.url||gif.images?.original?.url;img.alt=gif.title;b.title=gif.title;b.setAttribute('aria-label','Aplicar mi GIF '+gif.title);b.append(img);b.onclick=async()=>{b.disabled=true;try{await applyScopedBackground({giphy:{id:gif.id,title:gif.title,author:'salmosstore7',source:gif.url,permission:true}});}catch(e){notify(e.message,'error');}finally{b.disabled=false;}};card.append(b);shelf.append(card);}for(const gif of rows.filter(x=>x.kind==='gif')){const card=document.createElement('article'),b=document.createElement('button'),img=new Image(),del=document.createElement('button');img.src=gif.src;img.alt=gif.name;b.title=gif.name;b.setAttribute('aria-label','Aplicar mi GIF '+gif.name);b.append(img);b.onclick=()=>applyScopedBackground({src:gif.src,name:gif.name}).catch(e=>notify(e.message,'error'));del.textContent='×';del.title='Quitar de Mis GIFs';del.onclick=async()=>{if(!confirm('¿Quitar este GIF de tu galería? Los reels que ya lo usan lo conservan.'))return;await dbAction('assets','readwrite',s=>s.delete(gif.id));renderOwnGifShelf14(host);};card.append(b,del);shelf.append(card);}}
  function installGifUpload14(row,host){const label=document.createElement('label');label.className='file-button';label.textContent='＋ Subir mis GIFs';const input=document.createElement('input');input.type='file';input.accept='image/gif';input.multiple=true;input.setAttribute('aria-label','Subir mis GIFs');label.append(input);input.onchange=async()=>{try{for(const file of input.files){if(file.type!=='image/gif')throw Error('Elegí archivos GIF.');const src=await fileData(file);await dbAction('assets','readwrite',s=>s.put({id:C.uid(),kind:'gif',name:file.name,src}));}await renderOwnGifShelf14(host);notify('Tus GIFs quedaron guardados. Tocá uno para usarlo.');}catch(e){notify(e.message,'error');}input.value='';};row.append(label);}
  function mountContentIdeas(host){
    if(host.childElementCount)return;
    const tabs=document.createElement('div'),body=document.createElement('section');
    tabs.className='subtabs';body.className='marketing-ideas-content';
    const visual=$('[data-panel="ideas"]');
    const choices={
    'Ideas visuales':null,
    'Descripciones':[
      'Tu fe también puede acompañarte en lo que vestís. ♡ Elegí tu diseño SALMOS y consultanos por talle y color.',
      'Así queda el diseño terminado ✨ ¿Lo usarías en blanco o en negro? Escribinos y armamos el tuyo.',
      'Una palabra que inspira. Una prenda para llevarla con vos. Conocé los diseños de SALMOS: creer, amar, crear.',
      'Mirá el frente y la espalda de nuestro nuevo diseño ♡ ¿Qué detalle te gustó más?',
      '¿Tenés una idea para tu remera, taza o gorra? Contanos qué imaginaste y consultanos por la personalización.',
      '¿Buscás un regalo con un mensaje especial? Decinos para quién es y te mostramos diseños SALMOS para esa persona.',
      '¿Clásica u oversize? Si te cuesta elegir, mandanos por mensaje las medidas de una remera que ya te queda bien y te guiamos.',
      'De la plancha al perchero. Mirá cómo queda la estampa de cerca y escribinos para consultar colores y talles.',
      'Si esta frase te recordó a alguien, compartile el reel. Seguí a SALMOS para ver las próximas estampas y elegir cuál sacamos primero.',
      '¿Comprás para tu grupo, feria o emprendimiento? Mandanos cuántas prendas necesitás y te pasamos las opciones por mayor.',
      'Elegí un diseño para vos y otro para regalar. En el catálogo podés guardar tus favoritos y consultarnos por WhatsApp.'
    ],
    'Historias':[
      '1. Mostrá la prenda lisa: «De una idea…»\n2. Revelá la estampa: «…a algo que habla de vos».\n3. Producto final: «Consultanos por el tuyo ♡».',
      '1. Primer plano de la estampa: «¿Adivinás qué diseño es?»\n2. Mostrá el producto completo.\n3. «¿Frente pequeño o espalda protagonista?»',
      '1. Dos colores del mismo producto.\n2. «Hoy elegís vos».\n3. Publicá una encuesta y después compartí el favorito.',
      '1. Mostrá una taza, una gorra y una remera.\n2. «Un mismo mensaje, distintas formas de llevarlo».\n3. «¿Cuál regalarías?»',
      '1. Mostrá la prenda puesta y en percha.\n2. Compará clásica y oversize de frente.\n3. Agregá el enlace a la guía de talles o invitá a consultar por WhatsApp.',
      '1. Mostrá un pedido en preparación sin datos del cliente.\n2. Acercá la cámara al detalle de la estampa.\n3. «¿Querés ver el próximo diseño? Seguí a SALMOS».',
      '1. Mostrá dos estampas que todavía estás preparando.\n2. Abrí una votación.\n3. Al día siguiente, mostrales cuál ganó y dejá el enlace al catálogo.',
      '1. Mostrá tres ideas de regalo.\n2. Agregá una caja con «¿Para quién estás buscando?».\n3. Respondé con el enlace a la colección indicada.',
      '1. Mostrá una agenda o un libro por dentro.\n2. Enseñá una actividad o detalle de la tapa.\n3. Usá el sticker de enlace para ir a la ficha del producto.'
    ],
    'Encuestas':[
      '¿Con cuál te quedás?\n🤍 Remera blanca / 🖤 Remera negra',
      '¿Dónde te gusta más la estampa?\nAdelante / En la espalda',
      '¿Qué corte usás más?\nClásica / Oversize',
      '¿Para quién sería tu próximo regalo?\nPara alguien especial / Para mí ♡',
      '¿Qué producto querés ver después?\nTazas / Gorras',
      'Caja de preguntas: ¿Qué versículo te gustaría llevar en una remera?',
      '¿Qué querés que mostremos mañana?\nCómo queda puesta / Cómo la estampamos',
      'Para regalar, ¿cuál te gustaría recibir?\nUna agenda / Una remera',
      '¿Qué te ayudaría a elegir?\nVer guía de talles / Ver más fotos',
      '¿Qué diseño abrimos en la próxima colección?\nEl más discreto / El que ocupa toda la espalda',
      '¿Cómo te gustaría ver los nuevos diseños?\nReel corto / Detalles en historias',
      '¿Qué querés ver en Kids?\nRemeras estampadas / Libros para colorear'
    ]};
    function show(name){
      body.replaceChildren();
      for(const button of tabs.children)button.classList.toggle('active',button.textContent===name);
      if(name==='Ideas visuales'){
        visual.hidden=false;body.append(visual);buildStories();
        return;
      }
      const grid=document.createElement('div');grid.className='marketing-ideas-grid';
      for(const text of choices[name]){
        const card=document.createElement('article'),description=document.createElement('p'),copy=document.createElement('button');
        card.className='story-card';description.textContent=text;copy.textContent='Copiar';
        copy.onclick=()=>copyText(text);
        card.append(description,copy);grid.append(card);
      }
      body.append(grid);
    }
    for(const name of Object.keys(choices)){
      const button=document.createElement('button');
      button.type='button';button.textContent=name;button.onclick=()=>show(name);tabs.append(button);
    }
    host.append(tabs,body);show('Ideas visuales');
  }
  function cropOverlay14(){const layer=selectedLayer();if(!layer?.overlay)return notify('Elegí la imagen que agregaste.');pause();const im=asset(layer.src),dialog=document.createElement('dialog');dialog.className='crop-dialog14';const title=document.createElement('h2');title.textContent='Recortar imagen';const c=document.createElement('canvas'),x=c.getContext('2d');const iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height,k=Math.min(1,680/iw,500/ih,innerWidth*.8/iw,innerHeight*.6/ih);c.width=Math.round(iw*k);c.height=Math.round(ih*k);c.style.width=c.width+'px';c.style.height=c.height+'px';let rect={x:0,y:0,w:c.width,h:c.height},start=null;const paint=()=>{x.clearRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);x.fillStyle='#24112188';x.fillRect(0,0,c.width,c.height);x.save();x.beginPath();x.rect(rect.x,rect.y,rect.w,rect.h);x.clip();x.drawImage(im,0,0,c.width,c.height);x.restore();x.strokeStyle='#ff86bc';x.lineWidth=2;x.strokeRect(rect.x,rect.y,rect.w,rect.h);};const point=e=>{const b=c.getBoundingClientRect();return{x:C.clamp((e.clientX-b.left)*c.width/b.width,0,c.width),y:C.clamp((e.clientY-b.top)*c.height/b.height,0,c.height)};};c.onpointerdown=e=>{start=point(e);c.setPointerCapture(e.pointerId);};c.onpointermove=e=>{if(!start)return;const p=point(e);rect={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(start.x-p.x),h:Math.abs(start.y-p.y)};paint();};c.onpointerup=()=>{start=null;};const reset=document.createElement('button');reset.textContent='Imagen completa';reset.onclick=()=>{rect={x:0,y:0,w:c.width,h:c.height};paint();};const cancel=document.createElement('button');cancel.textContent='Cancelar';cancel.onclick=()=>dialog.close();const ok=document.createElement('button');ok.textContent='Aplicar recorte';ok.className='primary';ok.onclick=async()=>{if(rect.w<4||rect.h<4)return;try{const out=document.createElement('canvas');out.width=Math.round(rect.w/k);out.height=Math.round(rect.h/k);out.getContext('2d').drawImage(im,rect.x/k,rect.y/k,rect.w/k,rect.h/k,0,0,out.width,out.height);const src=out.toDataURL('image/png');await asset(src)._ready;checkpoint();layer.originalSrc14=layer.originalSrc14||layer.src;layer.src=src;delete layer.bounds;delete layer.render;syncForm();changed();dialog.close();}catch(e){notify(e.message,'error');}};const footer=document.createElement('footer');footer.append(reset,cancel,ok);dialog.append(title,c,footer);dialog.onclose=()=>dialog.remove();document.body.append(dialog);paint();dialog.showModal();}
  function installReelsV14(){
    const draft=document.createElement('button');draft.id='saveDraft14';draft.textContent='Guardar como borrador';draft.onclick=()=>saveDraft14().catch(e=>notify(e.message,'error'));$('.head-actions').insertBefore(draft,$('#export'));
    const dock=$('#reelDock'),buttons=$('#dockButtons'),drawers=$('#dockDrawers');
    const make=(id,name,icon)=>{const b=document.createElement('button');b.dataset.dock=id;b.innerHTML='<span>'+icon+'</span>'+name;b.onclick=()=>openDock(activeDock===id?'':id);buttons.append(b);const d=document.createElement('div');d.dataset.drawer=id;d.hidden=true;drawers.append(d);return d;};
    const add=make('add','Añadir','＋');const tabs=document.createElement('div');tabs.className='subtabs';const text=document.createElement('section'),images=document.createElement('section');text.dataset.addPanel14='text';images.dataset.addPanel14='image';text.append($('#reelTextToolbar'),$('#layerTextTools'));images.append(text.querySelector('.add-image12'),$('#imageTiming12'));const crop=document.createElement('button');crop.textContent='Recortar PNG';crop.onclick=cropOverlay14;const restore=document.createElement('button');restore.textContent='Restaurar imagen';restore.onclick=async()=>{const l=selectedLayer();if(!l?.overlay||!l.originalSrc14)return;checkpoint();l.src=l.originalSrc14;await asset(l.src)._ready;syncForm();changed();};images.prepend(crop,restore);for(const[id,name]of[['text','Texto'],['image','Imágenes']]){const b=document.createElement('button');b.textContent=name;b.onclick=()=>{text.hidden=id!=='text';images.hidden=id!=='image';for(const x of tabs.children)x.classList.toggle('active',x===b);};tabs.append(b);}add.append(tabs,text,images);tabs.firstChild.click();
    const bg=$('[data-drawer=background]'),format=$('[data-drawer=format]'),frame=make('framing','Encuadre','▣');
    frame.append($('.ground-controls10'));
    for(const button of frame.querySelectorAll('[data-ground10]')){
      button.onclick=()=>applySceneVisual({
        label:'Encuadre',
        fields:{groundSupport:button.dataset.ground10==='shadow'?'shadow':null,framing:button.dataset.ground10==='near'?1.35:1}
      });
    }
    const bgTabs=document.createElement('div');bgTabs.className='subtabs';const bgContents=document.createElement('section');bgContents.dataset.backgroundPanel14='background';bgContents.append(...bg.childNodes);const fmt=document.createElement('section');frame.dataset.backgroundPanel14='framing';frame.removeAttribute('data-drawer');frame.hidden=true;fmt.dataset.backgroundPanel14='format';fmt.hidden=true;fmt.append(...format.childNodes);for(const[id,name]of[['background','Fondos'],['framing','Encuadre'],['format','Formato']]){const b=document.createElement('button');b.textContent=name;b.onclick=()=>{bgContents.hidden=id!=='background';fmt.hidden=id!=='format';frame.hidden=id!=='framing';for(const x of bgTabs.children)x.classList.toggle('active',x===b);};bgTabs.append(b);}bg.append(bgTabs,bgContents,frame,fmt);$('[data-dock=framing]').remove();$('[data-dock=format]').remove();format.remove();bgTabs.firstChild.click();for(const id of ['background','add','effects','music','narration','wan'])buttons.append($('[data-dock='+id+']'));
    const info=$('#componentInfo');info.hidden=true;dock.prepend(buttons);openDock('background');
  }

  // Independent transparent motion layer; base images/GIFs never replace it.
  const motionLayers19=[['hearts','Corazones'],['petals','Pétalos'],['stars','Destellos dorados'],['bokeh','Luces suaves'],['waves','Ondas'],['confetti','Confeti'],['steel','Acero'],['blueprint','Plano azul'],['embers','Brasas'],['smoke','Niebla'],['terrain','Relieve bosque'],['speed','Velocidad']];
  function migrateMotion19(s){if(s.motionOverlay19===undefined)s.motionOverlay19=s.bgMotion||'';s.bgMotion='';}
  function refreshMotion19(){if(!project)return;for(const s of project.scenes)migrateMotion19(s);for(const b of $$('[data-motion19]')){const selected=b.dataset.motion19===(previewScene(current()).motionOverlay19||'');b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));}}
  function chooseMotion19(id){applySceneVisual({label:'Movimiento del fondo',fields:{motionOverlay19:id}});}
  function installMotion19(){
    for(const s of project.scenes)migrateMotion19(s);
    const panel=$('[data-background-panel14=background]');
    const layout=document.createElement('div');layout.className='background-layout19';
    const rail=document.createElement('aside');rail.className='motion-rail19';rail.setAttribute('aria-label','Capas de movimiento');
    const remove=document.createElement('button');remove.type='button';remove.className='remove-motion19';remove.dataset.motion19='';remove.innerHTML=icon10('eraser');remove.title='Quitar capa de movimiento';remove.setAttribute('aria-label',remove.title);remove.onclick=()=>chooseMotion19('');rail.append(remove);
    for(const[id,name]of motionLayers19){const b=document.createElement('button'),thumb=document.createElement('canvas');b.type='button';b.dataset.motion19=id;b.title=name;b.setAttribute('aria-label',name);thumb.width=thumb.height=100;b.append(thumb);b.onclick=()=>chooseMotion19(id);rail.append(b);}
    const body=document.createElement('div');body.className='background-body19';body.append(...panel.childNodes);layout.append(rail,body);panel.replaceChildren(layout);
    const swatch=$('#palette');
    swatch.onchange=()=>applySceneVisual({label:'Color de fondo',fields:{backgroundPalette:swatch.value}});
    const swatchLabel=swatch.closest('label');swatchLabel.childNodes[0].textContent='Color de fondo';
    body.querySelector('.background-tabs').after(swatchLabel);
    for(const id of ['motion','masculine'])body.querySelector('[data-bg-mode='+id+']')?.remove();
    body.querySelector('[data-bg-mode=salmos]')?.click();
    let last=-1;
    function animate(now){if(!rail.isConnected)return;if(rail.getClientRects().length&&now-last>70){last=now;for(const b of rail.querySelectorAll('button[data-motion19]')){const thumb=b.querySelector('canvas');if(!thumb)continue;const c=thumb.getContext('2d');c.clearRect(0,0,100,100);c.save();c.scale(100/720,100/720);paintBackdrop(c,{bgMotion:b.dataset.motion19},now/1000,720,720);c.restore();}if(!playing&&!exporting&&current().motionOverlay19){const at=C.sceneAt(project.scenes,time);if(at)draw();}}requestAnimationFrame(animate);}requestAnimationFrame(animate);refreshMotion19();
  }

  const syncExtraBefore19=syncExtraForm;syncExtraForm=function(){syncExtraBefore19();refreshMotion19();$('#palette').value=current().backgroundPalette||project.palette;};
  const normalizeBefore19=normalizeProject;normalizeProject=function(){const value=normalizeBefore19();for(const s of project.scenes)migrateMotion19(s);return value;};

  const aiDefault19={style:'house',details:'',lyrics:'',
    voice:'auto',instrumental:false,duration:null,name:'Mi canción'};
  let aiTracks19=[],aiSaved19=[],aiLoading19=false,audioStudioEditor=null,aiSongFilter,musicInitiator;
  let songAudition=0;
  let watchReelSongs=()=>{},syncReelGenerate=()=>{};
  function persistAi19(){project.audio.aiMusic19=aiSettings19();syncReelSongDuration();changed();}
  async function aiFetch19(path,options={}){const response=await helperFetch('/api/music'+path,options);return response.json();}
  async function loadAiTracks19(){
    aiSaved19=(await dbAction('assets','readonly',store=>store.getAll())).filter(entry=>entry.kind==='ai-music19');
    renderAiTracks19();
    if(aiLoading19||musicInitiator?.data?.audioApi!==2)return;
    aiLoading19=true;
    try{
      aiTracks19=(await aiFetch19('/tracks')).tracks||[];
      renderAiTracks19();
    }catch(error){
      if(!aiSaved19.length)throw error;
    }finally{aiLoading19=false;}
  }
  const musicCatalogBefore19=musicCatalog;
  musicCatalog=function(){
    const mode=$('#musicCatalog').value,ai=mode==='ai19',own=mode==='library';
    const panel=$('#aiMusic19'),host=$('#aiMusicLibrary');
    if(panel){
      panel.hidden=!ai;
      const container=own?$('#ownMusicTools'):panel;
      if(host.parentElement!==container)container.append(host);
    }
    if(!ai)musicCatalogBefore19();
    if(!ai&&!own)return;
    if(ai)$('#ownMusicTools').hidden=true;
    $('#musicResults').hidden=true;
    const controls=$('#musicSelectionControls');
    controls.hidden=!project.audio.music;
    $('#musicSelectionName').textContent=selectedMusic10?.name||project.audio.musicName||'Música';
    $('#confirmMusic10').hidden=!selectedMusic10;
    $('#confirmMusic10').onclick=async()=>{
      if(!selectedMusic10)return;
      pause();musicTrial=null;syncForm();changed();notify('Música agregada.');
    };
    renderAiTracks19();
  };
  function installAiMusic19(){
    const panel=document.createElement('section'),audio=window.SalmosAudioStudio;
    panel.id='aiMusic19';panel.hidden=true;
    panel.innerHTML=`<div id="aiMusicVariant" class="song-reference" hidden><p></p><button type="button">Volver a creación libre</button></div>
      <label>Nombre<input id="aiMusicName19" maxlength="100"></label>
      <div class="ai-music-options19"><div class="choice-buttons" aria-label="Tipo de canción"><button data-ai-mode19="vocal">Con letra</button><button data-ai-mode19="instrumental">Instrumental</button></div>
      <div id="aiVoiceChoices19" class="choice-buttons" aria-label="Voz cantada"><button data-ai-voice19="auto">Automática</button><button data-ai-voice19="male">Masculina</button><button data-ai-voice19="female">Femenina</button></div></div>
      <div id="aiStyleChoices19" class="choice-buttons" aria-label="Estilo musical"></div>
      <label>Detalles (opcional)<textarea id="aiMusicStyle19" rows="2" maxlength="700" placeholder="Por ejemplo: más batería, piano alegre, voz cálida…"></textarea></label>
      <label>Letra<textarea id="aiMusicLyrics19" rows="4" maxlength="3000"></textarea></label>
      <div class="ai-music-actions19"><label>Duración en segundos<input id="aiMusicDuration19" type="number" min="10" max="${audio.maxSongDuration}" step="1" placeholder="Automática" aria-describedby="reelSongDuration"></label></div>
      <small id="reelSongDuration"></small>
      <div id="aiMusicLibrary"><div id="aiMusicTracks19" class="song-library"></div></div>`;
    $('#musicResults').before(panel);
    const bar=audio.generationBar();
    bar.element.id='reelSongActions';bar.element.hidden=true;
    bar.generate.id='aiMusicGenerate19';bar.cancel.id='aiMusicCancel19';
    const status=document.createElement('output'),progress=document.createElement('progress');
    status.id='aiMusicStatus19';status.setAttribute('role','status');
    progress.id='aiMusicProgress19';progress.max=1;
    progress.setAttribute('aria-label','Progreso de generación');
    bar.element.append(status,progress);
    const musicHeading=$('[data-drawer=music] .music-heading');
    const lyricsField=$('#aiMusicLyrics19').closest('label');
    musicHeading.after(bar.element);
    aiSongFilter=audio.createSongFilter(renderAiTracks19);
    $('#aiMusicLibrary').prepend(aiSongFilter.element);
    const select=$('#musicCatalog');
    select.add(new Option('Crear con IA','ai19'),0);
    select.querySelector('[value=library]').textContent='Mis audios';
    let sending=false,visible=false,listed=false;
    function setStatus(message,state){
      if(status.textContent!==message)status.textContent=message;
      status.dataset.state=state;
    }
    const song=audio.createSongJob({helperFetch,storageKey:'salmos-active-reel-song',
      report(message,state,data){
        setStatus(message,state);
        if(data?.job?.progress>0)progress.value=data.job.progress;
        else progress.removeAttribute('value');
        syncReelGenerate();
      },
      async completed(track){
        aiTracks19=[track,...aiTracks19.filter(item=>item.id!==track.id)];
        try{await cacheAi20(track);}catch(error){if(audio.isConnectionError(error))throw error;}
        aiSongFilter.set('all');
        renderAiTracks19();
        if(visible)audio.revealSong($('#aiMusicTracks19'),track.id);
      }});
    syncReelGenerate=()=>{
      const composing=select.value==='ai19',settings=aiSettings19(),working=sending||!!song.id;
      const after=composing?(settings.instrumental?$('#reelSongDuration'):lyricsField):musicHeading;
      if(bar.element.previousElementSibling!==after)after.after(bar.element);
      const readiness=audio.generationState(musicInitiator.data,{instrumental:!composing||settings.instrumental,
        lyrics:settings.lyrics,needsLyrics:composing,working});
      if(working)readiness.help='';
      bar.update(readiness,{label:composing&&settings.variant?'Generar versión nueva':'Generar canción',
        job:!!song.id,cancelling:sending});
      progress.hidden=!song.id;
    };
    watchReelSongs=()=>{
      const open=activeDock==='music'&&!$('.workspace').hidden;
      bar.element.hidden=!open;
      if(visible===open)return;
      visible=open;listed=false;
      musicInitiator.watch('reels',open);
      if(open){
        loadAiTracks19().catch(()=>{});
        if(song.id)song.resume();
        syncReelGenerate();
      }
    };
    musicInitiator.subscribe(data=>{
      if(!visible)return;
      syncReelGenerate();
      const available=data?.audioApi===2&&data.setup?.state==='ready';
      if(available&&!listed){
        listed=true;
        loadAiTracks19().catch(()=>{listed=false;});
      }else if(!available)listed=false;
      if(song.id&&data)song.resume();
    });
    $('#aiMusicVariant button').onclick=()=>{
      project.audio.aiMusic19=aiSettings19();
      delete project.audio.aiMusic19.variant;
      restoreAi19();changed();
    };
    for(const attr of ['aiMode19','aiVoice19']){
      const field=attr==='aiMode19'?'data-ai-mode19':'data-ai-voice19';
      for(const button of panel.querySelectorAll('['+field+']'))button.onclick=()=>{
        for(const choice of panel.querySelectorAll('['+field+']'))choice.classList.toggle('active',choice===button);
        const instrumental=panel.querySelector('[data-ai-mode19="instrumental"]').classList.contains('active');
        $('#aiMusicLyrics19').closest('label').hidden=$('#aiVoiceChoices19').hidden=instrumental;
        persistAi19();
      };
    }
    for(const input of panel.querySelectorAll('input,textarea'))input.onchange=persistAi19;
    for(const input of [$('#aiMusicLyrics19'),$('#aiMusicDuration19')])input.addEventListener('input',syncReelSongDuration);
    bar.generate.onclick=async()=>{
      if(sending||song.id)return;
      if(select.value!=='ai19'){
        showReelSongForm();
        $('#dockDrawers').scrollTop=0;
        $('#aiMusicName19').focus({preventScroll:true});
        return;
      }
      const {variant,...request}=aiSettings19();
      request.duration??=reelSongEstimate(request);
      if(!variant?.sameBeat&&(!Number.isInteger(request.duration)||request.duration<10||request.duration>audio.maxSongDuration)){
        return notify('Elegí una duración entre 10 segundos y 10 minutos.','error');
      }
      pause();persistAi19();sending=true;progress.removeAttribute('value');
      setStatus('Comprobando el iniciador…','working');syncReelGenerate();
      try{
        const connection=await musicInitiator.check();
        const readiness=audio.generationState(connection,{...request,needsLyrics:true});
        if(!readiness.ready)throw Error(readiness.help);
        let source;
        if(variant){
          request.versionOf=variant.id;
          if(variant.sameBeat){
            const track=orderedAiTracks20().find(item=>item.id===variant.id);
            if(!track)throw Error('Elegí nuevamente el ritmo desde Mis audios.');
            setStatus('Preparando el ritmo de referencia…','working');
            source=await audio.prepareReference(track,T);
            request.duration=source.duration||request.duration;
            request.bpm=track.request?.bpm||null;
          }
        }
        await song.start(request,connection,source);
      }catch(error){setStatus(audio.isConnectionError(error)?'El iniciador no respondió. Revisá que siga abierto.':error.message,'error');}
      finally{sending=false;syncReelGenerate();}
    };
    bar.cancel.onclick=async()=>{
      if(!song.id||sending||!confirm('¿Querés cancelar la generación de esta canción?'))return;
      sending=true;setStatus('Cancelando la generación…','working');syncReelGenerate();
      try{await song.cancel();}catch(error){setStatus(error.message,'error');}
      finally{sending=false;syncReelGenerate();}
    };
    select.addEventListener('change',()=>{
      if(select.value==='ai19')restoreAi19();
      else syncReelGenerate();
    });
    restoreAi19();compactNumbers();
  }
  function installReelsV19(){installMotion19();installAiMusic19();}

  function fitOverlayTime20(layer,scene){layer.appearAt=C.clamp(Number(layer.appearAt)||0,0,29.9);layer.visibleFor=C.clamp(Number(layer.visibleFor)||.1,.1,30-layer.appearAt);scene.duration=Math.max(scene.duration,Math.round((layer.appearAt+layer.visibleFor)*100)/100);}
  function commitImageTime20(){
    const source=selectedLayer();
    if(!source?.overlay)return;
    const start=Number($('#imageAppear12').value),length=Number($('#imageVisible12').value);
    if(!Number.isFinite(start)||!Number.isFinite(length))return;
    for(const {scene,layer} of scopedLayers(source)){
      layer.appearAt=start;layer.visibleFor=length;fitOverlayTime20(layer,scene);
    }
  }
  const syncImageTimeBefore20=syncImageTiming12;syncImageTiming12=function(){syncImageTimeBefore20();if(!selectedLayer()?.overlay)return;$('#imageVisible12').max=String(Math.max(.1,30-(selectedLayer().appearAt||0)));};
  function arrangePanels20(){
    const bg=$('[data-drawer=background]'),layout=bg.querySelector('.background-layout19'),body=layout.querySelector('.background-body19'),frame=$('[data-background-panel14=framing]'),format=$('[data-background-panel14=format]'),side=document.createElement('aside');side.className='background-tools20';side.append(installSceneDuration());
    for(const[node,title]of[[frame,'Encuadre'],[format,'Formato']]){node.hidden=false;const h=document.createElement('strong');h.className='inline-section-title20';h.textContent=title;node.prepend(h);side.append(node);}
    bg.querySelector(':scope > .subtabs')?.remove();$('[data-background-panel14=background]').hidden=false;layout.append(side);
    const add=$('[data-drawer=add]');add.querySelector(':scope > .subtabs')?.remove();for(const[id,title]of[['text','Texto'],['image','Imágenes']]){const p=add.querySelector('[data-add-panel14='+id+']');p.hidden=false;const h=document.createElement('strong');h.className='inline-section-title20';h.textContent=title;p.prepend(h);}add.classList.add('add-layout20');
    for(const id of ['imageAppear12','imageVisible12']){const input=$('#'+id);input.oninput=null;input.onchange=()=>{if(!selectedLayer()?.overlay)return;pause();checkpoint(input._before||project);input._before=null;commitImageTime20();syncForm();changed();};}
    const apply=document.createElement('button');apply.id='confirmImageTime20';apply.innerHTML=icon10('check');apply.className='icon-action10';apply.title='Aplicar tiempo de la imagen';apply.setAttribute('aria-label',apply.title);apply.onclick=()=>{if(!selectedLayer()?.overlay)return;checkpoint();commitImageTime20();syncForm();changed();notify('Tiempo de la imagen aplicado.');};$('#imageTiming12').append(apply);
  }

  const musicGenres20={
    house:['House','Soulful house with steady four-on-the-floor kick, offbeat open hi hats, synth bass and piano chord stabs',122],
    deep:['Deep house','Deep house, four-on-the-floor club drums, warm subbass, subdued keys and spacious synths',120],
    organic:['Organic house','Organic house, four-on-the-floor electronic kick, textured hand percussion and warm expressive keys',117],
    urban:['Pop urbano','Contemporary Latin urban pop, mainstream electronic pop topline, tight programmed kick and snare, sustained 808 sub-bass, syncopated trap-pop hats, glossy synth pads and a melodic radio pop chorus',104],
    reggaeton:['Reggaetón','Latin reggaeton, unmistakable electronic dembow kick and snare pattern, tight sub-bass and clipped synth hooks',94],
    trap:['Trap latino','Latin trap, half-time programmed snare, fast rolling closed hats and long sliding 808 tones',138],
    hiphop:['Hip hop','Hip hop, head-nod backbeat with sampled-sounding kick and snare, dry bass and sparse keyboard motifs',92],
    dance:['Dance pop','Electronic dance pop, bright synth hooks, steady four-on-the-floor beat, sidechained bass and a soaring chorus',124],
    rnb:['R&B','Contemporary R&B, intimate melodic vocals, electric piano, silky harmony, deep bass and laid-back electronic drums',85],
    funk:['Funk','Funk pop, syncopated electric bass, crisp tight drums, muted electric guitar and brass accents',109],
    rock:['Pop rock','Melodic pop rock with electric guitars, acoustic kit backbeat, active bass and an open singalong chorus',118],
    gospel:['Gospel','Contemporary gospel, piano and organ, responsive ensemble harmonies, bass and live drums',89],
    worship:['Adoración','Contemporary worship, gentle piano, atmospheric guitars and pads, light live drums with a gradual lift',74],
    ballad:['Balada pop','Intimate pop ballad, piano and soft acoustic textures, spacious brushed drums and gentle sustained strings',76],
    reggae:['Reggae','Roots reggae one-drop drums, deep melodic bass and offbeat skank guitar and organ',83],
    cumbia:['Cumbia norteña','Mexican norteño cumbia, melodic button accordion, bajo sexto, güiro and a clear cumbia two-step groove',105],
    bachata:['Bachata','Dominican bachata, high requinto guitar phrases, arpeggiated rhythm guitar, bongos, güira and syncopated bass',126],
    salsa:['Salsa','Salsa, two-three clave, piano montuno, congas, timbales, tumbao bass and punchy brass',168],
    merengue:['Merengue','Dominican merengue with tambora, continuous güira, driving bass and short brass phrases',154],
    bossa:['Bossa nova','Bossa nova with nylon-string guitar syncopation, soft brushed drums, quiet bass and jazz chords',105],
    lofi:['Lo-fi','Laid-back lo-fi hip hop with a dusty drum groove, softened electric piano and warm rounded bass',80]
  };
  const musicMoods20={joyful:['Alegre','Joyful and uplifting, bright melodies, confident celebratory delivery'],dynamic:['Dinámico','Dynamic and energetic, punchy rhythmic accents, driving groove'],soft:['Suave','Soft and warm, relaxed gentle delivery, intimate texture'],spiritual:['Espiritual','Spiritual and hopeful, emotive and peaceful, uplifting atmosphere']};
  const musicRhythms20={style:['Según estilo',null],slow:['Suave',80],medium:['Medio',108],fast:['Rápido',132]};
  const musicInstruments20={piano:['Piano','bright piano chords'],bass:['Bajo','warm groovy bass'],drums:['Batería','punchy drums and crisp claps'],percussion:['Percusión','lively percussion'],acoustic:['Guitarra acústica','acoustic guitar'],electric:['Guitarra eléctrica','electric guitar'],synth:['Sintetizadores','melodic synthesizers'],pads:['Pads','ethereal pads'],strings:['Cuerdas','expressive strings'],claps:['Palmas','handclaps']};
  function aiSettings19(){
    const panel=$('#aiMusic19'),style=panel.querySelector('[data-ai-style19].active')?.dataset.aiStyle19||'house';
    const mood=panel.querySelector('[data-ai-mood20].active')?.dataset.aiMood20||'joyful';
    const rhythm=panel.querySelector('[data-ai-rhythm20].active')?.dataset.aiRhythm20||'style';
    const instruments=[...panel.querySelectorAll('[data-ai-instrument20].active')].map(button=>button.dataset.aiInstrument20);
    const details=$('#aiMusicStyle19').value.trim(),duration=$('#aiMusicDuration19').value;
    const caption=[musicGenres20[style][1],musicMoods20[mood][1],instruments.map(id=>musicInstruments20[id][1]).join(', '),details].filter(Boolean).join('. ');
    return {name:$('#aiMusicName19').value.trim()||'Mi canción',style,mood,rhythm,bpm:musicRhythms20[rhythm][1]||musicGenres20[style][2],instruments,details,caption,
      lyrics:$('#aiMusicLyrics19').value.trim(),voice:panel.querySelector('[data-ai-voice19].active')?.dataset.aiVoice19||'auto',
      instrumental:panel.querySelector('[data-ai-mode19].active')?.dataset.aiMode19==='instrumental',
      duration:duration===''?null:Number(duration),seed:-1,variant:project.audio.aiMusic19?.variant};
  }
  function openReelSongVariant(track,sameBeat){
    const audio=window.SalmosAudioStudio,settings=audio.versionSettings(track,sameBeat),request=track.request||{};
    project.audio.aiMusic19={...aiDefault19,...settings,style:settings.style||'house',duration:null,
      mood:request.mood||'joyful',rhythm:'style',instruments:request.instruments||[],details:request.details||'',
      variant:{id:track.id,name:track.name,sameBeat,duration:track.duration}};
    showReelSongForm();
    $('#aiMusicVariant').scrollIntoView({block:'nearest'});
    (sameBeat?$('#aiMusicLyrics19'):$('#aiStyleChoices19 button.active'))?.focus({preventScroll:true});
    changed();
  }
  function showReelSongForm(){
    const select=$('#musicCatalog');
    select.value='ai19';
    select.dispatchEvent(new Event('change',{bubbles:true}));
    $$('[data-select-id=musicCatalog]').forEach(button=>button.classList.toggle('active',button.dataset.selectValue===select.value));
  }
  function reelSongEstimate(settings){
    return window.SalmosAudioStudio.estimateSongDuration(settings.instrumental?'':settings.lyrics,settings.bpm,
      settings.instrumental?C.totalDuration(project.scenes):0);
  }
  function syncReelSongDuration(){
    const label=$('#reelSongDuration');
    if(!label)return;
    const settings=aiSettings19(),estimate=reelSongEstimate(settings),duration=C.totalDuration(project.scenes);
    const seconds=settings.duration??estimate,format=window.SalmosAudioStudio.durationText;
    const short=!settings.instrumental&&settings.lyrics&&settings.duration!==null&&settings.duration<estimate*.75;
    label.textContent=(settings.variant?.sameBeat?'Se toma la duración del ritmo de referencia. ':
      settings.duration===null?'Canción automática · '+format(estimate)+'. ':
      short?'Duración sugerida para la letra · '+format(estimate)+'. ':'')+
      'Tu reel dura '+format(duration)+'.'+(seconds>Math.ceil(duration)?' Podés recortar la canción al usarla en el reel.':'');
    syncReelGenerate();
  }
  function restoreAi19(){
    const panel=$('#aiMusic19');if(!panel)return;
    const settings={mood:'joyful',rhythm:'style',instruments:[],...aiDefault19,...project.audio.aiMusic19};
    if(!musicGenres20[settings.style])settings.style='house';
    $('#aiMusicName19').value=settings.name;
    $('#aiMusicStyle19').value=settings.details||'';
    $('#aiMusicLyrics19').value=settings.lyrics||'';
    $('#aiMusicDuration19').value=settings.duration??'';
    for(const [attr,value] of [['aiStyle19',settings.style],['aiMood20',settings.mood],['aiRhythm20',settings.rhythm],
      ['aiVoice19',settings.voice],['aiMode19',settings.instrumental?'instrumental':'vocal']]){
      for(const button of panel.querySelectorAll('[data-'+attr.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase())+']')){
        button.classList.toggle('active',button.dataset[attr]===value);
      }
    }
    for(const button of panel.querySelectorAll('[data-ai-instrument20]')){
      button.classList.toggle('active',settings.instruments.includes(button.dataset.aiInstrument20));
    }
    $('#aiMusicLyrics19').closest('label').hidden=$('#aiVoiceChoices19').hidden=settings.instrumental;
    const variant=$('#aiMusicVariant'),sameBeat=!!settings.variant?.sameBeat;
    variant.hidden=!settings.variant;
    variant.querySelector('p').textContent=settings.variant?(sameBeat?
      'Ritmo de referencia · '+settings.variant.name+'. La versión cantada se guarda aparte.':
      'Nueva versión de «'+settings.variant.name+'». Cambiá el estilo y generá cuando esté listo.'):'';
    panel.querySelector('[data-ai-mode19="instrumental"]').disabled=sameBeat;
    for(const button of panel.querySelectorAll('[data-ai-rhythm20]'))button.disabled=sameBeat;
    const duration=$('#aiMusicDuration19');duration.disabled=sameBeat;
    if(sameBeat)duration.placeholder=settings.variant.duration?String(Math.round(settings.variant.duration)):'Del ritmo';
    else duration.placeholder='Automática';
    syncReelSongDuration();
  }
  const aiHidden20=()=>new Set(jsonStore13('salmos-ai-hidden20',[]));
  function orderedAiTracks20(){const tracks=new Map(aiSaved19.map(t=>[t.id,t]));for(const t of aiTracks19){const local=tracks.get(t.id);tracks.set(t.id,{...local,...t,name:local?.renamed20?local.name:t.name,saved20:local?.saved20||t.request?.saved});}const hidden=aiHidden20();return[...tracks.values()].filter(t=>!hidden.has(t.id)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));}
  async function cacheAi20(t){let entry=aiSaved19.find(x=>x.id===t.id);if(!entry){const blob=await (await helperFetch('/api/music/audio/'+t.id)).blob();entry={...t,kind:'ai-music19',blob};await dbAction('assets','readwrite',s=>s.put(entry));aiSaved19.push(entry);}return entry;}
  const savedTrackSource=track=>track.src||blobData(track.blob);
  async function playAi20(track){
    const id='ai-'+track.id,same=auditionTrack===id,wasPlaying=playing,origin=project,request=++songAudition;
    pause();
    if(same&&wasPlaying)return;
    const current=()=>request===songAudition&&project===origin;
    if(!same){
      const saved=await cacheAi20(track),music=await savedTrackSource(saved);
      if(!current())return;
      if(!musicTrial)musicTrial=musicFields11(project.audio);
      Object.assign(project.audio,{music,musicName:saved.name,musicAssetId:saved.id,
        musicStart:saved.trim24?.start||0,musicEnd:saved.trim24?.end||0,musicLoop:true});
      delete project.audio.musicCredit;
      selectedMusic10={id,name:saved.name};auditionTrack=id;time=0;
    }
    await setupAudioElements();
    if(!current())return;
    await play();
    if(current())musicCatalog();
  }
  function reelAudioPreview(){
    const original=project,total=C.totalDuration(project.scenes);
    return {duration:total,rate:project.audio.musicRate||1,loop:!!project.audio.musicLoop,position:seconds=>C.clamp(seconds,0,total),
      caption:pos=>{const at=C.sceneAt(original.scenes,pos);return 'Escena '+(at.index+1);},
      draw(target,pos){
        if(project!==original)return;
        const at=C.sceneAt(project.scenes,pos),d=dimensions(360);
        if(target.width!==d.w||target.height!==d.h){target.width=d.w;target.height=d.h;}
        const context=target.getContext('2d'),oldLast=lastGeometry,oldComponents=componentGeometry;
        for(const src of [at.scene.video,isVideoSource(at.scene.background)?at.scene.background:null]){
          if(!src)continue;
          const video=asset(src,true),start=src===at.scene.video?at.scene.videoTrimStart||0:0;
          const end=src===at.scene.video?at.scene.videoTrimEnd||video.duration:video.duration;
          if(Number.isFinite(end)&&end>start){
            const offset=start+Math.min(Math.max(0,end-start-.02),at.local);
            if(Math.abs(video.currentTime-offset)>.08)video.currentTime=offset;
            video.onseeked=()=>{if(target.isConnected)drawFrame();};
          }
        }
        function drawFrame(){
          const geometry=componentGeometry,last=lastGeometry;
          try{
            paintScene(context,at.scene,at.progress,d.w,d.h,false,{still:true,previewMotion:true});
            const seconds=project.transitionDuration||1.1;
            if(at.index>0&&at.local<seconds&&!['none','cut'].includes(project.transition)){
              context.save();context.globalAlpha=1-C.ease(at.local/seconds);
              if(project.transition==='white'){context.fillStyle='#fff';context.fillRect(0,0,d.w,d.h);}
              else paintScene(context,project.scenes[at.index-1],1,d.w,d.h,false,{still:true,previewMotion:true});
              context.restore();
            }
          }finally{componentGeometry=geometry;lastGeometry=last;}
        }
        drawFrame();lastGeometry=oldLast;componentGeometry=oldComponents;
      }};
  }
  async function editReelSong(track){
    if(!audioStudioEditor)throw Error('El editor de audio sigue cargando.');
    await cancelMusicTrial();pause();
    const origin=project;
    await prepareMedia();
    const selected=track.id===project.audio.musicAssetId||!track.id;
    const trim=selected?{start:project.audio.musicStart,end:project.audio.musicEnd}:track.trim24;
    if(!track.id){
      const source=project.audio.music,blob=await (await fetch(source)).blob();
      track={id:crypto.randomUUID().replaceAll('-',''),name:project.audio.musicName||'Audio del reel',blob,localOnly:true,uploadKind:'song'};
    }
    if(project!==origin)return;
    await audioStudioEditor.editTrack(track,{trim,reel:reelAudioPreview(),onApply:async({blob,trim,name})=>{
      if(project!==origin)throw Error('Volvé al reel que estabas editando.');
      const src=await blobData(blob.size>40*1024*1024?
        await (await helperFetch('/api/music/mp3',{method:'POST',headers:{'Content-Type':'audio/wav'},body:blob},180000)).blob():blob);
      checkpoint();time=0;
      Object.assign(project.audio,{music:src,musicName:name,musicStart:trim.start,musicEnd:trim.end,musicAssetId:track.id});
      delete project.audio.musicCredit;
      selectedMusic10={id:'ai-'+track.id,name};auditionTrack=null;
      await setupAudioElements();syncForm();changed();notify('Fragmento aplicado al reel.');
    }});
  }
  function playingReelSong(){
    if(!playing||!musicAudio||musicAudio.paused||musicAudio.ended)return null;
    const id=auditionTrack||selectedMusic10?.id;
    return id?id.startsWith('ai-')?id.slice(3):null:project.audio.musicAssetId;
  }
  function renderAiTracks19(){
    const host=$('#aiMusicTracks19');if(!host)return;
    const own=$('#musicCatalog').value==='library';
    const tracks=orderedAiTracks20().filter(track=>own||!track.uploadKind);
    const audio=window.SalmosAudioStudio;
    audio.renderSongGallery(host,tracks,{filter:aiSongFilter,genres:musicGenres20,
      playing:playingReelSong(),
      empty:'Tus canciones aparecerán acá.',
      listen:track=>playAi20(track).catch(error=>notify(error.message,'error')),
      edit:track=>editReelSong(track).catch(error=>notify(error.message,'error')),
      download:track=>audio.openSongDownload(track,{helperFetch,tools:T}),variant:openReelSongVariant});
  }
  function installMusic20(){const panel=$('#aiMusic19');const genres=$('#aiStyleChoices19');genres.replaceChildren();const group=(host,data,attribute,multi=false)=>{for(const[id,[title]]of Object.entries(data)){const b=document.createElement('button');b.dataset[attribute]=id;b.textContent=title;b.onclick=()=>{if(multi)b.classList.toggle('active');else for(const x of host.children)x.classList.toggle('active',x===b);persistAi19();};host.append(b);}};group(genres,musicGenres20,'aiStyle19');const heading=document.createElement('strong');heading.className='inline-section-title20';heading.textContent='Género';genres.before(heading);let after=genres;for(const[data,label,attr,multi]of[[musicMoods20,'Carácter','aiMood20',false],[musicRhythms20,'Ritmo','aiRhythm20',false],[musicInstruments20,'Instrumentos','aiInstrument20',true]]){const block=document.createElement('div'),h=document.createElement('strong'),row=document.createElement('div');block.className='music-options20';h.textContent=label;row.className='choice-buttons';row.setAttribute('aria-label',label);group(row,data,attr,multi);block.append(h,row);after.after(block);after=block;}restoreAi19();}

  let reelDiskConnected=false;
  async function saveDraft20(){
    pause();clearTimeout(autosaveTimer);autosaveTimer=null;
    cancelEffectTrial();await cancelMusicTrial();project.status='draft';
    await saveRecord();
    flushReelBackups();
    notify('Borrador guardado en este navegador.');
    if(reelDiskConnected||localReady){
      const snapshot={...structuredClone(project),savedAt:Date.now()};
      try{
        await helperFetch('/api/projects/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
        notify('Borrador guardado con copia en tu disco.');
      }catch{reelDiskConnected=false;}
    }
  }
  function addStoredReels(rows,value,key){
    const collection=Array.isArray(value)?value:[value?.projects,value?.reels,value?.drafts].find(Array.isArray);
    const records=collection||[value];
    records.forEach((raw,index)=>{
      const row=reelRecord(raw,collection?key+'-'+index:key);
      if(row)rows.push(row);
    });
  }
  function readReelDraftStores(name){return new Promise((resolve,reject)=>{
    const request=indexedDB.open(name);
    request.onupgradeneeded=()=>request.transaction.abort();
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const database=request.result,rows=[];
      const stores=[...database.objectStoreNames].filter(store=>/project|draft|reel|autosave/i.test(store));
      if(!stores.length){database.close();resolve(rows);return;}
      const tx=database.transaction(stores,'readonly');
      for(const store of stores){
        const read=tx.objectStore(store).openCursor();
        read.onsuccess=()=>{
          const cursor=read.result;
          if(!cursor)return;
          addStoredReels(rows,cursor.value,String(cursor.primaryKey));
          cursor.continue();
        };
      }
      tx.oncomplete=()=>{database.close();resolve(rows);};
      tx.onabort=()=>{database.close();reject(tx.error);};
    };
  });}
  async function readBrowserReelDrafts(){
    const rows=[];
    for(const name of ['localStorage','sessionStorage']){
      try{
        const storage=window[name];
        for(const key of Object.keys(storage)){
          if(!/^salmos[-_].*(reel|marketing|project|draft|borrador)/i.test(key))continue;
          try{addStoredReels(rows,JSON.parse(storage.getItem(key)),key);}
          catch{}
        }
      }catch{}
    }
    const databases=await indexedDB.databases?.().catch(()=>[])||[];
    const names=new Set([REEL_DATABASE,...databases.map(info=>info.name)
      .filter(name=>/^salmos[-_].*(reel|marketing|project|draft)/i.test(name))]);
    for(const name of names){
      const saved=await readReelDraftStores(name).catch(()=>[]);
      rows.push(...saved);
    }
    return rows;
  }
  async function readReelDraftsOnDisk(){
    const list=await(await helperFetch('/api/projects')).json(),rows=[];
    for(const entry of list.projects||[]){
      try{
        const result=await(await helperFetch('/api/projects/'+encodeURIComponent(entry.id))).json();
        rows.push({...result,id:result.id??entry.id,savedAt:result.savedAt??entry.savedAt});
      }catch{}
    }
    return rows;
  }
  async function restoreMissingReels(rows){
    const candidates=latestReelRecords(rows);
    if(!candidates.length)return 0;
    let added=0;
    await dbAction('projects','readwrite',store=>{
      const request=store.getAll();
      request.onsuccess=()=>{
        const existing=latestReelRecords(request.result);
        const identities=new Set(existing.map(row=>row.originalId));
        const keys=new Set(request.result.map(row=>row.id));
        for(const draft of candidates){
          const id=draft.originalId;
          if(identities.has(id)||keys.has(id))continue;
          store.add({...draft,id,originalId:id});added++;
        }
      };
    });
    return added;
  }
  function setReelRecoveryStatus(text){
    const status=$('#reelRecoveryStatus');
    if(status){status.textContent=text;status.hidden=!text;}
  }
  async function recoverDrafts20(){
    const button=$('#recoverDrafts20');button.disabled=true;
    checkedBrowserDrafts=true;
    setReelRecoveryStatus('Buscando borradores en este perfil de Chrome…');
    try{
      const count=await restoreMissingReels(await readBrowserReelDrafts());
      const total=await loadSaved();
      setReelRecoveryStatus(count?`${count} ${count===1?'borrador recuperado':'borradores recuperados'}.`:
        total?'Estos son los proyectos guardados en este perfil.':'No encontré borradores en este perfil de Chrome.');
    }catch(error){setReelRecoveryStatus(error.message);}
    finally{button.disabled=false;}
  }
  async function recoverDiskReels(){
    const button=$('#recoverReelDisk');button.disabled=true;
    setReelRecoveryStatus('Buscando copias en el iniciador…');
    try{
      const rows=await readReelDraftsOnDisk();reelDiskConnected=true;
      const count=await restoreMissingReels(rows);
      const total=await loadSaved();
      setReelRecoveryStatus(count?`${count} ${count===1?'copia recuperada':'copias recuperadas'} del iniciador.`:
        rows.length&&total?'Las copias del iniciador ya figuran en Proyectos.':'El iniciador no encontró copias en el disco.');
    }catch(error){
      if(error instanceof TypeError||error.name==='AbortError'){
        reelDiskConnected=false;
        setReelRecoveryStatus('Abrí INICIAR_SALMOS.bat en tu PC y volvé a tocar Copias del iniciador.');
      }else setReelRecoveryStatus(error.message);
    }finally{button.disabled=false;}
  }

  let imageShelfPromise20=null,imageShelfRows20=[];
  async function rememberImage20(src,name='Imagen'){
    if(src instanceof Blob)src=await blobData(src);
    if(typeof src!=='string'||!/^data:image\//.test(src))return;
    const existing=imageShelfRows20.find(item=>item.src===src);
    if(existing)return existing;
    const entry={id:'reel-image20-'+C.uid(),kind:'reel-image20',src,name,createdAt:Date.now()};
    await dbAction('assets','readwrite',store=>store.put(entry));
    imageShelfRows20.unshift(entry);return entry;
  }
  async function refreshImageShelf20(){
    if(imageShelfPromise20)return imageShelfPromise20;
    imageShelfPromise20=(async()=>{
      const [assets,records]=await Promise.all([dbAction('assets','readonly',s=>s.getAll()),dbAction('projects','readonly',s=>s.getAll())]);
      imageShelfRows20=assets.filter(item=>item.kind==='reel-image20'&&item.src);
      for(const saved of [project,...records.map(row=>reelRecord(row)).filter(Boolean)]){
        for(const scene of saved.scenes||[])for(const layer of scene.components||[]){
          if(layer.kind==='text'||layer.production||!layer.overlay&&!layer.originalSrc14&&!layer.scopeLayerId)continue;
          await rememberImage20(layer.originalSrc14||layer.src,layer.name||'Imagen');
        }
      }
      renderImageShelf20();
    })().finally(()=>imageShelfPromise20=null);
    return imageShelfPromise20;
  }
  function renderImageShelf20(){
    const host=$('#reelImageShelf20');if(!host)return;
    host.replaceChildren();
    for(const item of [...imageShelfRows20].sort((a,b)=>(b.lastUsed||b.createdAt||0)-(a.lastUsed||a.createdAt||0))){
      const b=document.createElement('button'),im=new Image(),label=document.createElement('small');
      b.type='button';b.dataset.savedImage20=item.id;b.setAttribute('aria-label','Agregar '+item.name);
      im.loading='lazy';im.src=item.src;im.alt='';label.textContent=item.name;b.append(im,label);
      b.onclick=async()=>{
        b.disabled=true;
        try{
          await addPrint(item.src,item.name,true);item.lastUsed=Date.now();
          await dbAction('assets','readwrite',s=>s.put(item));syncForm();changed();
        }catch(error){notify(error.message,'error');}
        finally{b.disabled=false;}
      };
      host.append(b);
    }
    if(!host.childElementCount)host.textContent='Las imágenes que subas o traigas de tus reels aparecerán acá.';
  }
  function installImageShelf20(){
    const input=$('#imageLayerFile12'),upload=input.onchange,host=document.createElement('div');
    host.id='reelImageShelf20';host.className='reel-image-shelf20';host.setAttribute('aria-label','Mis imágenes para reels');
    input.closest('label').after(host);
    input.onchange=async event=>{
      const file=event.target.files[0];
      await upload(event);
      if(!file)return;
      const layer=selectedLayer();
      if(layer?.overlay){
        await refreshImageShelf20();await rememberImage20(layer.originalSrc14||layer.src,file.name);renderImageShelf20();
      }
    };
    const show=()=>refreshImageShelf20().catch(error=>{host.textContent='No se pudo abrir Mis imágenes. '+error.message;});
    $('[data-dock=add]').addEventListener('click',show);
    void show();
  }

  function installReelsV20(){
    arrangePanels20();installImageShelf20();installMusic20();
    const recover=document.createElement('button');recover.id='recoverDrafts20';
    recover.textContent='Buscar borradores';recover.onclick=recoverDrafts20;
    const disk=document.createElement('button');disk.id='recoverReelDisk';
    disk.textContent='Copias del iniciador';disk.onclick=recoverDiskReels;
    const open=document.createElement('button');open.textContent='Abrir respaldo';
    open.onclick=()=>$('#projectFile').click();
    const status=document.createElement('p');status.id='reelRecoveryStatus';
    status.className='reel-recovery-status';status.hidden=true;status.setAttribute('role','status');
    $('#homeProjects').before(status);
    const create=$('#createReel'),actions=document.createElement('div');actions.className='home-project-actions';
    create.before(actions);actions.append(recover,disk,open,create);
    $('#saveDraft14').onclick=async()=>{
      const button=$('#saveDraft14');button.disabled=true;
      try{await saveDraft20();}catch(error){notify(error.message,'error');}
      finally{button.disabled=false;}
    };
  }

  function wanSnapshot21(scene){const copy=structuredClone(scene);delete copy.beforeWan21;return{scene:copy,sounds:structuredClone((project.audio.sfx||[]).filter(e=>e.sceneId===scene.id))};}
  function productRect21(scene){const h=dimensions().h,im=scene.base?asset(scene.base):scene.final?asset(scene.final):null;const r=im?fitRect(im,25,65,670,h-130):{x:25,y:65,w:670,h:h-130};if(scene.framing>1){const k=scene.framing;r.x-=r.w*(k-1)/2;r.y-=r.h*(k-1)/2;r.w*=k;r.h*=k;}return r;}
  async function sourceScene21(scene){if(!scene.sourceProductId)throw Error('Esta escena no tiene una composición de Producción para recuperar.');const data=await requestParent('productViews',{productId:scene.sourceProductId}),view=data.views?.find(v=>scene.thumbnail&&v.url===scene.thumbnail)||data.views?.find(v=>scene.sourceViewKey&&v.viewKey===scene.sourceViewKey);if(!view)throw Error('No pude identificar la vista original. Elegila desde Productos.');const payload=await requestParent('product',{productId:scene.sourceProductId,imageId:view.id,mode:view.viewKey?'layers':'final'}),read=async value=>value instanceof Blob?blobData(value):value||null,components=[];for(const l of payload.components||[])components.push({...l,src:await read(l.src)});const base=await read(payload.base),final=await read(payload.final);if(!base&&!final)throw Error('La vista original no tiene imagen.');const restored={...structuredClone(scene),base:components.length||!final?base:null,final,video:null,stamp:null,components:[...components,...scene.components.filter(l=>l.kind==='text'||l.overlay)],template:'none',baseName:payload.name||data.name||scene.shotTitle||'Producto original',duration:Math.max(5,scene.duration),framing:1,groundSupport:null};delete restored.wanKey24;delete restored.beforeWan21;delete restored.videoFullFrame21;delete restored.wanClipId21;delete restored.videoTrimStart;delete restored.videoTrimEnd;return restored;}
  async function stillFromVideo21(scene){const video=asset(scene.video,true);await video._ready;const previous=video.currentTime;video.pause();if(Math.abs(previous)>.001){await new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);resolve();},timer=setTimeout(()=>{video.removeEventListener('seeked',done);reject(Error('No se pudo leer el primer cuadro del video.'));},5000);video.addEventListener('seeked',done,{once:true});video.currentTime=0;});}const c=document.createElement('canvas');c.width=video.videoWidth||720;c.height=video.videoHeight||1280;c.getContext('2d').drawImage(video,0,0,c.width,c.height);const src=c.toDataURL('image/png');video.currentTime=previous;await asset(src)._ready;const copy=structuredClone(scene);Object.assign(copy,{video:null,base:null,final:src,stamp:null,template:'none',framing:1,groundSupport:null,fullFrameImage21:!!scene.videoFullFrame21});delete copy.wanKey24;delete copy.beforeWan21;delete copy.videoFullFrame21;delete copy.videoTrimStart;delete copy.videoTrimEnd;delete copy.wanClipId21;return copy;}
  async function removeWan21(){const scene=current();if(!scene.video)return;const button=$('#removeWan21');if(button)button.disabled=true;pause();closeWanPreview();try{let restored,sounds=null;if(scene.beforeWan21){restored=structuredClone(scene.beforeWan21.scene);sounds=structuredClone(scene.beforeWan21.sounds||[]);}else restored=scene.sourceProductId?await sourceScene21(scene):await stillFromVideo21(scene);const index=project.scenes.findIndex(s=>s.id===scene.id);if(index<0)return;checkpoint();project.scenes[index]={...restored,id:scene.id};if(sounds)project.audio.sfx=[...(project.audio.sfx||[]).filter(e=>e.sceneId!==scene.id),...sounds];if(current().id===scene.id){selectedComponent=null;time=project.scenes.slice(0,index).reduce((n,s)=>n+s.duration,0);}await prepareMedia();syncForm();changed();notify(scene.beforeWan21?'Movimiento quitado. Se recuperó la composición anterior.':scene.sourceProductId?'Movimiento quitado. Se recuperó el producto desde Producción; las imágenes añadidas que faltan están en Añadir.':'Movimiento quitado. Se conservó el primer cuadro porque no había composición original guardada.');}catch(e){notify(e.message,'error');}finally{if(button)button.disabled=false;}}
  async function useWanClip(clip){
    pause();cancelEffectTrial();
    const origin=project,scene=wanSceneForClip(clip);
    const [blob,record]=await Promise.all([wanClipBlob(clip),dbAction('assets','readonly',s=>s.get('wan-trim24-'+clip.id))]);
    const src=await blobData(blob),video=asset(src,true);
    await video._ready;
    if(origin!==project||!project.scenes.includes(scene))throw Error('La escena de destino ya no está disponible.');
    checkpoint();closeWanPreview();pendingVisual=null;
    const source=scene.beforeWan21?.scene||scene,keyed=clip.foreground24;
    if(!scene.video)scene.beforeWan21=wanSnapshot21(scene);
    const rect=productRect21(source),h=dimensions().h;
    const components=scene.components.filter(l=>l.kind==='text'||l.overlay).map(l=>{
      const copy=structuredClone(l);
      if(copy.overlay&&copy.kind!=='text'&&!keyed&&!scene.videoFullFrame21){
        const box=layerRect(copy,rect,720,h);
        copy.placement={x:box.x/720,y:box.y/h,w:box.w/720,rotation:box.rotation||0};
        copy.baked=false;
      }
      return copy;
    });
    const retained=new Set(components.map(l=>l.id));
    for(const e of project.audio.sfx||[]){
      if(e.sceneId!==scene.id||!e.componentId||retained.has(e.componentId))continue;
      const layer=scene.components.find(x=>x.id===e.componentId);
      if(layer)e.start=(e.start||0)+(T.effects(layer).start||0);
      e.componentId=null;e.targetName='Escena';
    }
    const trim=record?.trim24||{start:0,end:Math.min(30,video.duration||2)};
    Object.assign(scene,{video:src,base:null,final:null,stamp:null,components,template:'none',demo:false,
      baseName:clip.name,videoTrimStart:trim.start,videoTrimEnd:trim.end,duration:Math.max(.1,trim.end-trim.start),
      videoFullFrame21:!keyed,wanClipId21:clip.id,fullFrameImage21:false,framing:keyed?source.framing||1:1,
      groundSupport:keyed?source.groundSupport:null,wanKey24:keyed?clip.keyColor||true:false});
    active=project.scenes.indexOf(scene);
    time=project.scenes.slice(0,active).reduce((t,item)=>t+item.duration,0);
    selectedComponent=null;await prepareMedia();syncForm();changed();editorView();
    notify('Movimiento aplicado en la escena '+(active+1)+'.');
  }
  const extraBefore21=syncExtraForm;syncExtraForm=function(){extraBefore21();const actions=$('#wanSceneActions21');if(actions)actions.hidden=!current()?.video;};
  function installReelsV21(){
    const row=document.createElement('div'),remove=document.createElement('button');
    row.id='wanSceneActions21';row.className='wan-scene-actions21';row.hidden=true;
    remove.id='removeWan21';remove.textContent='↶ Quitar movimiento del reel';remove.onclick=removeWan21;
    row.append(remove);$('.transport').after(row);$('#removeVideo').onclick=removeWan21;
  }

  const prepareBefore24=prepareMedia;prepareMedia=async function(){await prepareBefore24();await Promise.all(project.scenes.filter(s=>s.wanKey24&&s.beforeWan21).map(s=>{const src=s.beforeWan21.scene.base||s.beforeWan21.scene.final;return src?asset(src)._ready:Promise.resolve();}));};
  function trimBounds24(start,end,duration,min=.1){
    if(!Number.isFinite(duration)||duration<=0)throw Error('No se pudo leer la duración.');
    min=Math.min(min,duration);start=C.clamp(Number(start)||0,0,duration-min);
    return {start,end:C.clamp(Number(end)||duration,start+min,duration)};
  }
  async function trimVideoDialog(src,clip,initial,apply){
    pause();
    const dialog=document.createElement('dialog'),video=document.createElement('video');
    dialog.className='trim-dialog24 video-trim';
    dialog.innerHTML='<h2>Recortar video</h2><div class="trim-video-frame"></div>'+
      '<div class="trim-fields24"><label>Desde (segundos)<input type="number" min="0" step=".01" data-start></label>'+
      '<label>Hasta (segundos)<input type="number" min="0" step=".01" data-end></label></div>'+
      '<footer><button data-reset>Completo</button><button data-close>Cancelar</button>'+
      '<button class="primary" data-apply disabled>✓ Aplicar recorte</button></footer><p role="status"></p>';
    const get=key=>dialog.querySelector('[data-'+key+']');
    const fields={start:get('start'),end:get('end')};
    const bounds=()=>trimBounds24(fields.start.value,fields.end.value,video.duration);
    const stop=previewWanMedia(dialog.querySelector('.trim-video-frame'),video,clip,bounds);
    video.addEventListener('loadedmetadata',()=>{
      const range=trimBounds24(initial?.start,initial?.end,video.duration);
      for(const key of ['start','end']){fields[key].value=range[key];fields[key].max=video.duration;}
      video.currentTime=range.start;get('apply').disabled=false;
    },{once:true});
    for(const key of ['start','end'])fields[key].onchange=()=>{
      const range=bounds();fields.start.value=range.start;fields.end.value=range.end;
      video.currentTime=range[key];
    };
    get('reset').onclick=()=>{fields.start.value=0;fields.end.value=video.duration;video.currentTime=0;};
    get('close').onclick=()=>dialog.close();
    get('apply').onclick=async()=>{
      get('apply').disabled=true;
      try{await apply(bounds());dialog.close();}
      catch(error){dialog.querySelector('[role=status]').textContent=error.message;get('apply').disabled=false;}
    };
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    dialog.onclose=()=>{stop();dialog.remove();};
    document.body.append(dialog);dialog.showModal();video.src=src;
  }
  async function trimClip24(clip){
    const [blob,saved]=await Promise.all([wanClipBlob(clip),dbAction('assets','readonly',s=>s.get('wan-trim24-'+clip.id))]);
    return trimVideoDialog(await blobData(blob),clip,saved?.trim24,async trim=>{
      await dbAction('assets','readwrite',s=>s.put({id:'wan-trim24-'+clip.id,kind:'wan-trim24',trim24:trim}));
      const scenes=project.scenes.filter(s=>s.wanClipId21===clip.id);
      if(scenes.length)checkpoint();
      for(const scene of scenes){scene.videoTrimStart=trim.start;scene.videoTrimEnd=trim.end;scene.duration=trim.end-trim.start;}
      syncForm();changed();
    });
  }
  async function trimCurrentVideo24(){
    const source=project,scene=current();
    if(!scene.video)return;
    return trimVideoDialog(scene.video,{name:scene.baseName,foreground24:!!scene.wanKey24,keyColor:scene.wanKey24},
      {start:scene.videoTrimStart,end:scene.videoTrimEnd},async trim=>{
        if(project!==source||!source.scenes.includes(scene))throw Error('La escena ya no está disponible.');
        checkpoint();scene.videoTrimStart=trim.start;scene.videoTrimEnd=trim.end;scene.duration=trim.end-trim.start;
        if(scene.wanClipId21)await dbAction('assets','readwrite',s=>s.put({id:'wan-trim24-'+scene.wanClipId21,kind:'wan-trim24',trim24:trim}));
        time=project.scenes.slice(0,active).reduce((n,s)=>n+s.duration,0);syncForm();changed();
      });
  }
  function wanSceneForClip(clip){
    return String(clip.projectId)===String(project.id)&&project.scenes.find(scene=>scene.id===clip.sceneId)||current();
  }
  const keyColors=['#234cff','#ff18d4','#11d9fa'];
  function chroma(hex){
    if(hex===true||!hex)return [0,255,0];
    return [1,3,5].map(at=>parseInt(hex.slice(at,at+2),16));
  }
  function keyPixels(pixels,color){
    const sample=chroma(color),mean=(sample[0]+sample[1]+sample[2])/3;
    const axis=sample.map(channel=>channel-mean),norm=Math.hypot(...axis),unit=axis.map(value=>value/norm);
    for(let i=0;i<pixels.length;i+=4){
      const r=pixels[i],g=pixels[i+1],b=pixels[i+2],dr=r*unit[0]+g*unit[1]+b*unit[2];
      if(dr<55)continue;
      const gray=(r+g+b)/3,length=Math.sqrt((r-gray)**2+(g-gray)**2+(b-gray)**2),similarity=dr/length;
      if(similarity<.90)continue;
      const amount=C.clamp((dr-55)/66,0,1)*C.clamp((similarity-.9)/.075,0,1);
      pixels[i+3]=Math.round(pixels[i+3]*(1-amount));
      for(let ch=0;ch<3;ch++)pixels[i+ch]=C.clamp(pixels[i+ch]-unit[ch]*dr*amount*.75,0,255);
    }
  }
  let keyCanvas=null;
  function drawKeyed24(context,media,rect,color=true){
    keyCanvas||=document.createElement('canvas');
    const width=media.videoWidth||media.naturalWidth||media.width,height=media.videoHeight||media.naturalHeight||media.height;
    if(!width||!height)return;
    if(keyCanvas.width!==width||keyCanvas.height!==height){keyCanvas.width=width;keyCanvas.height=height;}
    const paint=keyCanvas.getContext('2d',{willReadFrequently:true});
    paint.clearRect(0,0,width,height);paint.drawImage(media,0,0,width,height);
    const picture=paint.getImageData(0,0,width,height);keyPixels(picture.data,color);paint.putImageData(picture,0,0);
    context.drawImage(keyCanvas,rect.x,rect.y,rect.w,rect.h);
  }
  function foregroundColor(context,width,height){
    const pixels=context.getImageData(0,0,width,height).data;
    let visible=0,transparent=0;
    const matches=keyColors.map(()=>0),colors=keyColors.map(chroma);
    for(let i=0;i<pixels.length;i+=28){
      if(pixels[i+3]<210){transparent++;continue;}
      visible++;
      for(let c=0;c<colors.length;c++){
        const [r,g,b]=colors[c],distance=Math.hypot(pixels[i]-r,pixels[i+1]-g,pixels[i+2]-b);
        if(distance<135)matches[c]++;
      }
    }
    if(!visible||!transparent)return null;
    return keyColors[matches.indexOf(Math.min(...matches))];
  }
  async function wanReference(scene,origin){
    const selected=scene.beforeWan21?.scene||scene;
    const src=selected.base||selected.final;
    if(!src||selected.video)throw Error('Elegí una escena con una foto original.');
    const image=asset(src);await image._ready;
    const scale=Math.min(1,1000/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height));
    const sheet=document.createElement('canvas');
    sheet.width=Math.max(16,Math.round((image.naturalWidth||image.width)*scale));
    sheet.height=Math.max(16,Math.round((image.naturalHeight||image.height)*scale));
    const graphic=sheet.getContext('2d',{willReadFrequently:true});
    graphic.drawImage(image,0,0,sheet.width,sheet.height);
    const frame=productRect21(selected),H=dimensions().h;
    if(selected.base){
      const prints=selected.components.filter(layer=>layer.kind==='print'&&!layer.overlay&&!layer.hidden);
      for(const layer of prints){
        const art=componentImage(layer);if(!art)continue;await art._ready;
        if(layer.baked)graphic.drawImage(art,0,0,sheet.width,sheet.height);
        else{
          const box=layerRect(layer,frame,720,H);
          graphic.save();graphic.scale(sheet.width/frame.w,sheet.height/frame.h);
          graphic.translate(box.x-frame.x+box.w/2,box.y-frame.y+box.h/2);
          graphic.rotate((box.rotation||0)*Math.PI/180);
          graphic.drawImage(art,-box.w/2,-box.h/2,box.w,box.h);graphic.restore();
        }
      }
    }
    const color=foregroundColor(graphic,sheet.width,sheet.height);
    if(color){
      graphic.globalCompositeOperation='destination-over';graphic.fillStyle=color;
      graphic.fillRect(0,0,sheet.width,sheet.height);graphic.globalCompositeOperation='source-over';
    }else if(!selected.fullFrameImage21){
      await prepareMedia();
      const d=dimensions(540);sheet.width=d.w;sheet.height=d.h;
      const previous=lastGeometry,selectedGeometry=componentGeometry;
      try{
        const shot={...selected,components:selected.components.filter(layer=>layer.kind!=='text'&&!layer.overlay)};
        paintScene(graphic,shot,0,d.w,d.h,false,{still:true});
      }finally{lastGeometry=previous;componentGeometry=selectedGeometry;}
    }
    if(project!==origin||!origin.scenes.includes(scene))throw Error('La escena de origen cambió.');
    return {image:sheet.toDataURL('image/png'),keyColor:color};
  }
  function previewWanMedia(host,video,clip,trim){
    const surface=document.createElement('canvas'),controls=document.createElement('div'),play=document.createElement('button'),seek=document.createElement('input');
    surface.setAttribute('aria-label','Vista previa de '+clip.name);surface.className='wan-player-frame';
    controls.className='wan-player-controls';play.textContent='▶ Reproducir';seek.type='range';seek.step='.01';
    seek.setAttribute('aria-label','Posición del video');video.muted=true;video.playsInline=true;play.disabled=seek.disabled=true;
    let frame=0;
    function draw(){
      if(!surface.isConnected||video.readyState<2)return;
      const width=video.videoWidth,height=video.videoHeight;
      if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height;}
      const ctx=surface.getContext('2d');ctx.clearRect(0,0,width,height);
      if(clip.foreground24)drawKeyed24(ctx,video,{x:0,y:0,w:width,h:height},clip.keyColor||true);
      else ctx.drawImage(video,0,0,width,height);
      seek.value=video.currentTime;
    }
    const bounds=()=>typeof trim==='function'?trim():trim?trimBounds24(trim.start,trim.end,video.duration,.05):{start:0,end:video.duration};
    video.onloadeddata=()=>{
      const {start,end}=bounds();seek.min=start;seek.max=end;play.disabled=seek.disabled=false;
      video.currentTime=Math.min(end,Math.max(start,.06));draw();
    };
    video.onseeked=()=>{
      if(Number.isFinite(video.duration)){const {start,end}=bounds();seek.min=start;seek.max=end;}
      draw();
    };
    video.onplay=()=>{
      play.textContent='Ⅱ Pausar';
      const update=()=>{
        draw();if(video.currentTime>=bounds().end)video.pause();
        if(!video.paused)frame=requestAnimationFrame(update);
      };
      update();
    };
    video.onpause=()=>{play.textContent='▶ Reproducir';cancelAnimationFrame(frame);draw();};
    seek.oninput=()=>{video.currentTime=Number(seek.value);};
    play.onclick=()=>{
      if(!video.paused){video.pause();return;}
      const {start,end}=bounds();
      if(video.currentTime<start||video.currentTime>=end-.03)video.currentTime=start;
      video.play().catch(error=>notify(error.message,'error'));
    };
    controls.append(play,seek);host.append(surface,controls);
    return ()=>{cancelAnimationFrame(frame);video.pause();video.src='';};
  }
  async function showWanPreview(clip){
    pause();
    const [blob,record]=await Promise.all([wanClipBlob(clip),dbAction('assets','readonly',s=>s.get('wan-trim24-'+clip.id))]);
    closeWanPreview();
    const box=document.createElement('div'),bar=document.createElement('div'),back=document.createElement('button');
    const video=document.createElement('video'),use=document.createElement('button');
    box.id='wanLargePreview';back.textContent='Volver';use.textContent='Usar en escena '+(project.scenes.indexOf(wanSceneForClip(clip))+1);
    back.onclick=closeWanPreview;use.onclick=()=>useWanClip(clip).catch(error=>notify(error.message,'error'));
    bar.append(back,use);box.append(bar);
    $('#stageViewport').append(box);document.body.classList.add('previewing-wan');
    closeWanVideo=previewWanMedia(box,video,clip,record?.trim24);
    wanPreviewURL=URL.createObjectURL(blob);video.src=wanPreviewURL;
  }
  function installReelsV24(){
    const cut=document.createElement('button');cut.id='trimCurrentVideo24';cut.textContent='✂ Recortar video';
    cut.onclick=()=>trimCurrentVideo24().catch(error=>notify(error.message,'error'));
    $('#wanSceneActions21').append(cut);
  }
  const dockBeforeWan=openDock;
  openDock=function(id){
    dockBeforeWan(id);
    if(id==='wan')wanStudio?.connect();
  };
  function installReelsV25(){
    wanStudio=window.SalmosWanStudio.install({
      host:$('[data-drawer=wan]'),helperFetch,notify,
      capture:async()=>{
        pause();selectSceneAtPreview();
        const origin=project,scene=current(),number=active+1,sceneTitle=scene.shotTitle||scene.baseName||'Escena '+number;
        return {...await wanReference(scene,origin),sceneId:scene.id,projectId:String(origin.id),
          sceneTitle:'Escena '+number+' · '+sceneTitle};
      },
      preview:showWanPreview,use:useWanClip,trim:trimClip24,paintKeyed:drawKeyed24,
      sceneNumber:clip=>project.scenes.indexOf(wanSceneForClip(clip))+1,
      closePreview:closeWanPreview,purge:clip=>wanClipBlobs.delete(clip.id)
    });
  }

  async function init(){
    project=newProject();normalizeProject();
    musicInitiator=window.SalmosAudioStudio.monitorInitiator(helperFetch);
    bind();bindExtra();tidyEditor();installProductionLayout();installReelsV14();installReelsV19();installReelsV20();
    installReelsV21();installReelsV24();installReelsV25();
    audioStudioEditor=window.SalmosAudioStudio.install({host:$('#home-canciones'),helperFetch,initiator:musicInitiator,dbAction,tools:T,genres:musicGenres20,
      refreshSongs:()=>loadAiTracks19(),hiddenSongs:aiHidden20,pause});
    const editApplied=document.createElement('button');
    editApplied.textContent='Recortar y editar';
    editApplied.onclick=async()=>{
      try{
        const track=orderedAiTracks20().find(t=>t.id===project.audio.musicAssetId)||
          orderedAiTracks20().find(t=>'ai-'+t.id===selectedMusic10?.id);
        await editReelSong(track||{});
      }catch(error){notify(error.message,'error');}
    };
    const narration=$('[data-drawer=narration]'),connectVoice=document.createElement('button');
    connectVoice.textContent='Comprobar iniciador';
    narration.querySelector('.button-row').prepend(connectVoice);
    let narrationPoll=0;
    async function refreshNarration(wait=false){
      clearTimeout(narrationPoll);localReady=false;syncNarrationGate();
      try{
        const state=await (await helperFetch('/api/music',{},4000)).json();
        if(state.setup?.state==='ready'){localReady=true;syncNarrationGate();return;}
        if(state.setup?.state==='preparing')narrationPoll=setTimeout(()=>void refreshNarration(true),2200);
        if(wait)notify('Esperando a que el iniciador diga SALMOS listo.');
      }catch(error){if(wait)notify('Abrí el iniciador y volvé a comprobarlo.','error');}
    }
    connectVoice.onclick=()=>refreshNarration(true);
    $('[data-dock=narration]').addEventListener('click',()=>refreshNarration());
    syncNarrationGate();
    $('#musicSelectionControls').append(editApplied);
    for(const key of ['musicStart','musicEnd'])$('[data-audio="'+key+'"]')?.closest('label')?.setAttribute('hidden','');
    const saveState=document.createElement('span');saveState.id='reelSaveState';saveState.setAttribute('role','status');
    const retry=document.createElement('button');retry.id='reelRetryBackup';retry.type='button';retry.hidden=true;retry.textContent='Reintentar respaldo';retry.onclick=retryReelBackups;
    $('.top-title').append(saveState,retry);
    await prepareMedia().catch(error=>notify(error.message,'error'));
    syncForm();generateIdeas();updatePrompt();draw();
    document.documentElement.dataset.studioReady='true';$('#studioBoot15')?.remove();
    if(parent!==window)parent.postMessage({type:'salmos-marketing-ready'},location.origin);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundReelSave();else retryReelBackups();});
  window.addEventListener('pagehide',backgroundReelSave);
  window.addEventListener('beforeunload',event=>{
    if(!reelSaveDirty&&!reelLocalWrites.size)return;
    event.preventDefault();
    event.returnValue='';
  });
  window.addEventListener('message',async event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='salmos-marketing-save-before-close')return;
    const answer={type:'salmos-marketing-close-ready',id:event.data.id};
    try{
      do{await flushReelAutosave();}while(reelSaveDirty);
      flushReelBackups();
    }catch(error){answer.error=error.message;}
    parent.postMessage(answer,location.origin);
  });
  window.addEventListener('unhandledrejection',e=>{notify(e.reason?.message||'No se pudo completar esa operación.','error');});
  init().catch(e=>{console.error(e.stack);const b=$('#studioBoot15');if(b){b.querySelector('p').textContent='No se pudo abrir el editor. Tocá Reintentar.';b.querySelector('button').hidden=false;}notify(e.message,'error');});
})();
