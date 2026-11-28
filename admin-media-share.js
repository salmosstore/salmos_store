/* Placas bíblicas y archivos para compartir desde Administración. */
(() => {
  'use strict';
  const safeName=value=>(value||'SALMOS').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[ .]+$/g,'');
  const download=file=>{
    const link=document.createElement('a'),url=URL.createObjectURL(file);
    link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  const image=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('No se pudo abrir la imagen.'));img.src=src;});
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
  async function passageFile(text,reference,appearance){
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;const ctx=canvas.getContext('2d');
    const gradient=ctx.createLinearGradient(0,0,1200,1500);gradient.addColorStop(0,'#8b4567');gradient.addColorStop(1,'#311928');ctx.fillStyle=gradient;ctx.fillRect(0,0,1200,1500);
    try{const bg=await image(new URL('admin-nina-ojos-bg.png',document.baseURI).href),scale=Math.max(1200/bg.width,1500/bg.height);ctx.drawImage(bg,(1200-bg.width*scale)/2,(1500-bg.height*scale)/2,bg.width*scale,bg.height*scale);}catch{}
    const width=1200*appearance.width/100,left=(1200-width)/2;
    ctx.fillStyle=appearance.color+Math.round(appearance.opacity*2.55).toString(16).padStart(2,'0');ctx.beginPath();ctx.roundRect(left,110,width,1280,46);ctx.fill();
    ctx.strokeStyle='#ad7957';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(left+25,135,width-50,1230,32);ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#9a6077';ctx.font='26px Georgia';ctx.fillText('✦   SU PALABRA NOS ACOMPAÑA   ✦',600,215);
    let size=54,wrapped;
    do{ctx.font=size+'px Georgia';wrapped=lines(ctx,text,width-160);if(wrapped.length*size*1.45<=830)break;size-=2;}while(size>24);
    ctx.fillStyle='#402437';let y=380+(830-wrapped.length*size*1.45)/2;
    for(const line of wrapped){ctx.fillText(line,600,y);y+=size*1.45;}
    ctx.font='bold 38px Georgia';ctx.fillText(reference||'',600,1235);ctx.font='24px Georgia';ctx.fillText('NTV',600,1282);
    ctx.fillStyle='#855168';ctx.font='bold 28px Georgia';ctx.fillText('SALMOS · creer amar crear',600,1340);
    return new File([await png(canvas)],safeName(reference||'Pasaje SALMOS')+'.png',{type:'image/png'});
  }
  function openPassage(text,reference){
    if(!text)return;
    const dialog=modal('Un momento en su Palabra');dialog.classList.add('passage-dialog');
    const card=document.createElement('article'),wrapper=document.createElement('div'),ornament=document.createElement('span');
    const quote=document.createElement('blockquote'),cite=document.createElement('p'),brand=document.createElement('small');
    card.className='passage-art';wrapper.className='passage-wrapper';ornament.textContent='✦';ornament.setAttribute('aria-hidden','true');
    quote.textContent=text;cite.textContent=reference+' · NTV';brand.textContent='SALMOS · creer amar crear';wrapper.append(ornament,quote,cite,brand);card.append(wrapper);
    const appearance={color:'#fff0f2',opacity:93,width:88};
    try{const stored=JSON.parse(localStorage.getItem('salmos-passage-wrapper')||'null');if(/^#[0-9a-f]{6}$/i.test(stored?.color))appearance.color=stored.color;if(Number.isFinite(stored?.opacity))appearance.opacity=Math.max(0,Math.min(100,stored.opacity));if(Number.isFinite(stored?.width))appearance.width=Math.max(60,Math.min(100,stored.width));}catch{}
    const controls=document.createElement('div');controls.className='passage-controls';
    const inputs={};
    for(const [key,title,type,min,max] of [['color','Color del wrapper','color'],['opacity','Opacidad','range',0,100],['width','Ancho del wrapper','range',60,100]]){
      const label=document.createElement('label'),input=document.createElement('input'),value=document.createElement('output');
      label.textContent=title;input.type=type;input.value=appearance[key];input.dataset.passageControl=key;
      if(type==='range'){input.min=min;input.max=max;input.step=1;}label.append(input,value);controls.append(label);inputs[key]={input,value};
    }
    const footer=document.createElement('footer'),send=document.createElement('button'),save=document.createElement('button'),status=document.createElement('p');
    send.textContent='Compartir por WhatsApp';send.className='btn btn-primary';save.textContent='Descargar placa';save.className='btn btn-ghost';send.disabled=save.disabled=true;status.setAttribute('role','status');
    footer.append(send,save);dialog.append(controls,card,status,footer);
    let latest=null,serial=0,timer;
    send.onclick=()=>{if(latest)share([latest],status);};save.onclick=()=>{if(latest)download(latest);};
    function update(){
      wrapper.style.background=appearance.color+Math.round(appearance.opacity*2.55).toString(16).padStart(2,'0');
      wrapper.style.width=appearance.width+'%';
      for(const key of ['opacity','width'])inputs[key].value.textContent=appearance[key]+'%';
      try{localStorage.setItem('salmos-passage-wrapper',JSON.stringify(appearance));}catch{}
      send.disabled=save.disabled=true;const turn=++serial;clearTimeout(timer);status.textContent='Preparando la placa…';
      timer=setTimeout(()=>passageFile(text,reference,{...appearance}).then(file=>{
        if(!dialog.open||turn!==serial)return;latest=file;send.disabled=save.disabled=false;status.textContent='Elegí WhatsApp al compartir la imagen.';
      }).catch(error=>{if(turn===serial)status.textContent=error.message;}),140);
    }
    for(const [key,{input}] of Object.entries(inputs))input.oninput=()=>{appearance[key]=key==='color'?input.value:Number(input.value);update();};
    update();
    return dialog;
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
