/* Placas bíblicas y archivos para compartir desde Administración. */
(() => {
  'use strict';
  const safeName=value=>(value||'SALMOS').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[ .]+$/g,'');
  const download=file=>{
    const link=document.createElement('a'),url=URL.createObjectURL(file);
    link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  const image=src=>new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='use-credentials';img.onload=()=>resolve(img);img.onerror=()=>reject(Error('No se pudo abrir la imagen.'));img.src=src;});
  const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo preparar la imagen.')),'image/png'));
  function modal(title){
    const dialog=document.createElement('dialog');dialog.className='admin-media-dialog';
    const head=document.createElement('header'),heading=document.createElement('h2'),close=document.createElement('button');
    heading.textContent=title;close.type='button';close.textContent='×';close.setAttribute('aria-label','Cerrar');
    close.onclick=()=>dialog.close();head.append(heading,close);dialog.append(head);
    dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();return dialog;
  }
  function share(files,status,text=''){
    if(!navigator.share||navigator.canShare&&!navigator.canShare({files})){
      status.textContent='Este navegador no permite compartir archivos. Descargalos y adjuntalos en WhatsApp.';return;
    }
    // The files are ready before this click, preserving the browser's share gesture.
    try{Promise.resolve(navigator.share({files,...(text?{text}:{})})).catch(error=>{
      status.textContent=error.name==='AbortError'?'Envío cancelado.':'No se pudo compartir. Podés descargar el archivo.';
    });}catch{status.textContent='No se pudo abrir Compartir. Podés descargar los archivos.';}
  }
  function lines(ctx,text,width){
    const result=[];
    for(const paragraph of text.split('\n')){
      let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
        const next=line?line+' '+word:word;
        if(line&&ctx.measureText(next).width>width){result.push(line);line=word;}else line=next;
      }if(line)result.push(line);
    }return result;
  }
  function openPassage(text,reference,options={}){
    if(!text)return;
    const dialog=modal('Un momento en su Palabra');dialog.classList.add('passage-dialog');
    const fonts=window.SalmosText?.fonts||[{id:'lora',name:'Lora',family:'Lora'}];
    const appearance={color:'#fff0f2',opacity:93,fontId:'gf-lora',bold:false,italic:false,underline:false,textColor:'#402437',fontSize:54,rect:{x:.07,y:.073,w:.86,h:.85}};
    try{
      const saved=JSON.parse(localStorage.getItem('salmos-passage-wrapper')||'null');
      for(const key of ['color','textColor'])if(/^#[0-9a-f]{6}$/i.test(saved?.[key]||''))appearance[key]=saved[key];
      if(Number.isFinite(saved?.opacity))appearance.opacity=Math.max(0,Math.min(100,saved.opacity));
      if(fonts.some(f=>f.id===saved?.fontId))appearance.fontId=saved.fontId;
      for(const key of ['bold','italic','underline'])appearance[key]=saved?.[key]===true;
      if(Number.isFinite(saved?.fontSize))appearance.fontSize=Math.max(24,Math.min(96,saved.fontSize));
      const r=saved?.rect;
      if(r&&[r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>=.3&&r.h>=.3&&r.x>=0&&r.y>=0&&r.x+r.w<=1&&r.y+r.h<=1)appearance.rect={...r};
    }catch{}
    // The background always starts with La niña de sus ojos.
    const defaultBackground={id:'nina',name:'La niña de sus ojos',src:new URL('admin-nina-ojos-bg.png',document.baseURI).href};
    let background=defaultBackground,library=[],filter='',serial=0,timer,latest=null,drag=null;
    const body=document.createElement('div');body.className='passage-workspace';
    const stage=document.createElement('div');stage.className='passage-stage';
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',text+' · '+reference);
    const frame=document.createElement('div');frame.className='passage-frame';frame.tabIndex=0;frame.setAttribute('aria-label','Mover el recuadro del versículo');
    for(const key of ['nw','n','ne','e','se','s','sw','w']){
      const handle=document.createElement('button');handle.type='button';handle.dataset.resize=key;handle.className='passage-handle';
      handle.setAttribute('aria-label','Redimensionar '+({nw:'arriba izquierda',n:'arriba',ne:'arriba derecha',e:'derecha',se:'abajo derecha',s:'abajo',sw:'abajo izquierda',w:'izquierda'})[key]);frame.append(handle);
    }
    stage.append(canvas,frame);
    const help=document.createElement('p');help.className='passage-drag-help';help.textContent='Arrastrá el recuadro para moverlo. Usá los puntos de las esquinas y de los lados para cambiar su tamaño.';
    const preview=document.createElement('div');preview.className='passage-preview';preview.append(stage,help);
    const settings=document.createElement('div');settings.className='passage-settings';
    const heading=title=>{const h=document.createElement('h3');h.textContent=title;return h;};
    const fontGallery=document.createElement('div');fontGallery.className='passage-fonts';fontGallery.setAttribute('role','group');fontGallery.setAttribute('aria-label','Fuentes SALMOS');
    for(const font of fonts){
      const b=document.createElement('button');b.type='button';b.className='passage-font';b.dataset.passageFont=font.id;b.style.fontFamily='"'+font.family+'"';b.textContent=font.name;b.title=font.name;
      b.setAttribute('aria-pressed',String(font.id===appearance.fontId));b.onclick=()=>{appearance.fontId=font.id;for(const item of fontGallery.children)item.setAttribute('aria-pressed',String(item===b));update();};fontGallery.append(b);
    }
    settings.append(heading('Fuente'),fontGallery);
    const styles=document.createElement('div');styles.className='passage-style-buttons';styles.setAttribute('role','group');styles.setAttribute('aria-label','Estilo de la fuente');
    for(const [key,label] of [['bold','Negrita'],['italic','Cursiva'],['underline','Subrayado']]){
      const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.passageStyle=key;b.setAttribute('aria-pressed',String(appearance[key]));b.onclick=()=>{appearance[key]=!appearance[key];b.setAttribute('aria-pressed',String(appearance[key]));update();};styles.append(b);
    }
    settings.append(styles);
    const controls=document.createElement('div');controls.className='passage-value-controls';
    for(const [key,title,type,min,max] of [['textColor','Color del texto','color'],['fontSize','Tamaño de letra','range',24,96],['color','Color del recuadro','color'],['opacity','Opacidad del recuadro','range',0,100]]){
      const label=document.createElement('label'),input=document.createElement('input'),value=document.createElement('output');label.textContent=title;input.type=type;input.value=appearance[key];input.dataset.passageControl=key;
      if(type==='range'){input.min=min;input.max=max;input.step=1;value.textContent=appearance[key]+(key==='opacity'?'%':'');}
      input.oninput=()=>{appearance[key]=type==='color'?input.value:Number(input.value);value.textContent=type==='range'?appearance[key]+(key==='opacity'?'%':''):'';update();};label.append(input,value);controls.append(label);
    }
    settings.append(controls,heading('Fondo'));
    const search=document.createElement('input');search.type='search';search.placeholder='Buscar en tus diseños SALMOS…';search.setAttribute('aria-label','Buscar fondo');
    const backgrounds=document.createElement('div');backgrounds.className='passage-backgrounds';backgrounds.setAttribute('role','group');backgrounds.setAttribute('aria-label','Fondos y diseños SALMOS');
    const libraryStatus=document.createElement('p');libraryStatus.className='passage-library-status';settings.append(search,backgrounds,libraryStatus);
    search.oninput=()=>{filter=search.value.trim().toLocaleLowerCase('es');paintBackgrounds();};
    function paintBackgrounds(){
      backgrounds.replaceChildren();const matches=library.filter(a=>!filter||a.name.toLocaleLowerCase('es').includes(filter));
      for(const asset of [defaultBackground,...matches.slice(0,80)]){
        const b=document.createElement('button');b.type='button';b.dataset.passageBackground=asset.id;b.setAttribute('aria-pressed',String(asset.id===background.id));
        const img=document.createElement('img');img.src=asset.thumb||asset.src;img.alt='';img.loading='lazy';const name=document.createElement('span');name.textContent=asset.name;b.append(img,name);
        b.onclick=()=>{background=asset;paintBackgrounds();update();};backgrounds.append(b);
      }
      libraryStatus.textContent=filter&&matches.length>80?'Se muestran 80 resultados. Afiná la búsqueda.':library.length?'Fondos y diseños de tu galería.':'';
    }
    paintBackgrounds();
    if(options.loadBackgrounds){libraryStatus.textContent='Cargando tus diseños…';Promise.resolve().then(options.loadBackgrounds).then(items=>{if(!dialog.open)return;library=items.filter(item=>item.id!=='nina');paintBackgrounds();}).catch(error=>{libraryStatus.textContent='No se pudo abrir tu galería: '+error.message;});}
    body.append(preview,settings);
    const footer=document.createElement('footer'),send=document.createElement('button'),save=document.createElement('button'),status=document.createElement('p');
    send.textContent='Compartir por WhatsApp';send.className='btn btn-primary';save.textContent='Descargar placa';save.className='btn btn-ghost';send.disabled=save.disabled=true;status.setAttribute('role','status');
    footer.append(send,save);dialog.append(body,status,footer);send.onclick=()=>{if(latest)share([latest],status);};save.onclick=()=>{if(latest)download(latest);};
    const images=new Map();
    async function render(turn){
      const face=fonts.find(f=>f.id===appearance.fontId)||fonts[0],font=`${appearance.italic?'italic ':''}${appearance.bold?'700':'400'}`;
      if(document.fonts?.load)await document.fonts.load(`${font} 54px "${face.family}"`,text);
      if(!images.has(background.src))images.set(background.src,image(background.src));
      const bg=await images.get(background.src);if(turn!==serial||!dialog.open)return;
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,1200,1500);ctx.fillStyle='#422235';ctx.fillRect(0,0,1200,1500);
      const scale=Math.max(1200/bg.width,1500/bg.height);ctx.drawImage(bg,(1200-bg.width*scale)/2,(1500-bg.height*scale)/2,bg.width*scale,bg.height*scale);
      const r=appearance.rect,x=r.x*1200,y=r.y*1500,w=r.w*1200,h=r.h*1500,pad=Math.min(50,w*.08),radius=Math.min(40,w*.06);
      ctx.fillStyle=appearance.color+Math.round(appearance.opacity*2.55).toString(16).padStart(2,'0');ctx.beginPath();ctx.roundRect(x,y,w,h,radius);ctx.fill();
      ctx.strokeStyle='#ad7957';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(x+14,y+14,w-28,h-28,Math.max(6,radius-8));ctx.stroke();
      ctx.textAlign='center';ctx.textBaseline='middle';const center=x+w/2;
      ctx.fillStyle='#a37352';ctx.font='26px Georgia';ctx.fillText('✦',center,y+48);
      let size=appearance.fontSize,wrapped=[],lineHeight=0;const available=Math.max(60,h-200);
      do{ctx.font=`${font} ${size}px "${face.family}"`;wrapped=lines(ctx,text,w-pad*2);lineHeight=size*1.42;if(wrapped.length*lineHeight<=available)break;size-=1;}while(size>16);
      ctx.fillStyle=appearance.textColor;let at=y+83+(available-wrapped.length*lineHeight)/2+lineHeight/2;
      for(const line of wrapped){ctx.fillText(line,center,at);if(appearance.underline){const len=ctx.measureText(line).width;ctx.strokeStyle=appearance.textColor;ctx.lineWidth=Math.max(1,size*.035);ctx.beginPath();ctx.moveTo(center-len/2,at+size*.52);ctx.lineTo(center+len/2,at+size*.52);ctx.stroke();}at+=lineHeight;}
      ctx.fillStyle=appearance.textColor;ctx.font='bold 30px Georgia';ctx.fillText(reference||'',center,y+h-85,Math.max(100,w-pad*2));ctx.font='20px Georgia';ctx.fillText('NTV · SALMOS · creer amar crear',center,y+h-44,Math.max(100,w-pad*2));
      clearTimeout(timer);timer=setTimeout(async()=>{try{const file=new File([await png(canvas)],safeName(reference||'Pasaje SALMOS')+'.png',{type:'image/png'});if(turn!==serial||!dialog.open)return;latest=file;send.disabled=save.disabled=false;status.textContent='La imagen compartida conserva estos ajustes.';}catch(error){if(turn===serial)status.textContent=error.message;}},100);
    }
    function update(){
      const r=appearance.rect;Object.assign(frame.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});
      try{localStorage.setItem('salmos-passage-wrapper',JSON.stringify(appearance));}catch{}
      send.disabled=save.disabled=true;const turn=++serial;clearTimeout(timer);status.textContent='Preparando la placa…';void render(turn).catch(error=>{if(turn===serial)status.textContent=error.message;});
    }
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    frame.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();const rect=stage.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,bounds:rect,rect:{...appearance.rect},handle:event.target.dataset.resize||''};frame.setPointerCapture(event.pointerId);};
    frame.onpointermove=event=>{
      if(!drag||event.pointerId!==drag.id)return;const {rect:r,handle:k,bounds}=drag,dx=(event.clientX-drag.x)/bounds.width,dy=(event.clientY-drag.y)/bounds.height;
      if(!k)appearance.rect={...r,x:clamp(r.x+dx,.015,.985-r.w),y:clamp(r.y+dy,.015,.985-r.h)};
      else{let l=r.x,t=r.y,right=r.x+r.w,bottom=r.y+r.h;if(k.includes('w'))l=clamp(l+dx,.015,right-.3);if(k.includes('e'))right=clamp(right+dx,l+.3,.985);if(k.includes('n'))t=clamp(t+dy,.015,bottom-.3);if(k.includes('s'))bottom=clamp(bottom+dy,t+.3,.985);appearance.rect={x:l,y:t,w:right-l,h:bottom-t};}update();
    };
    frame.onpointerup=frame.onpointercancel=()=>{drag=null;};
    frame.onkeydown=event=>{const step=event.shiftKey?.015:.003,r=appearance.rect;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();r.x=clamp(r.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),.015,.985-r.w);r.y=clamp(r.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0),.015,.985-r.h);update();};
    update();return dialog;
  }
  async function designFile(asset,quality,apiUrl){
    const response=await fetch(apiUrl('/api/admin/design-assets/'+Number(asset.id)+'/file'),{credentials:'include',redirect:'manual'});
    if(!response.ok||response.type==='opaqueredirect')throw Error('No se pudo abrir el diseño. Revisá tu sesión.');
    let blob=await response.blob(),name=safeName(asset.file_name||asset.name||'Diseño');
    const header=new Uint8Array(await blob.slice(0,8).arrayBuffer()),isPng=[137,80,78,71,13,10,26,10].every((byte,index)=>header[index]===byte);
    if(String(asset.mime_type||blob.type).startsWith('image/')&&!(quality==='original'&&isPng)){
      const url=URL.createObjectURL(blob);
      try{const img=await image(url),canvas=document.createElement('canvas'),scale=quality==='light'?Math.min(1,1200/Math.max(img.width,img.height)):1;
        canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        blob=quality==='light'?await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('No se pudo preparar la imagen liviana.')),'image/webp',.82)):await png(canvas);
        name=name.replace(/\.[^.]+$/,'')+(blob.type==='image/webp'?'.webp':'.png');
      }finally{URL.revokeObjectURL(url);}
    }
    return new File([blob],name,{type:blob.type||asset.mime_type||'application/octet-stream'});
  }
  function openDesignFiles(assets,{apiUrl,sharing=true}={}){
    if(!assets.length)return;
    const dialog=modal(sharing?'Compartir diseños':'Descargar diseños'),body=document.createElement('div');body.className='admin-media-body';
    const label=document.createElement('label'),select=document.createElement('select'),status=document.createElement('p'),footer=document.createElement('footer'),send=document.createElement('button'),save=document.createElement('button');
    label.textContent='Calidad';select.className='select';select.add(new Option('Buena calidad · tamaño original','original'));select.add(new Option('Liviana · WebP hasta 1200 px','light'));label.append(select);
    const list=document.createElement('ul');for(const asset of assets){const item=document.createElement('li');item.textContent=asset.name||asset.file_name||'Diseño';list.append(item);}
    status.setAttribute('role','status');send.textContent='Compartir';send.className='btn btn-primary';save.textContent=assets.length>1?'Descargar archivos':'Descargar';save.className='btn btn-ghost';send.hidden=!sharing;footer.append(send,save);body.append(label,list,status);dialog.append(body,footer);
    let files=[],turn=0;
    async function prepare(){const current=++turn;send.disabled=save.disabled=true;status.textContent='Preparando '+assets.length+' archivo(s)…';
      try{const result=[];for(const asset of assets)result.push(await designFile(asset,select.value,apiUrl));if(current!==turn||!dialog.open)return;files=result;send.disabled=save.disabled=false;status.textContent=files.length+' archivo(s) listo(s). La transparencia se conserva.';}
      catch(error){if(current===turn)status.textContent=error.message;}
    }
    select.onchange=prepare;send.onclick=()=>share(files,status);save.onclick=()=>files.forEach(download);void prepare();return dialog;
  }
  window.SalmosAdminMedia={openPassage,openDesignFiles};
})();
