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
  async function passageFile(text,reference){
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;const ctx=canvas.getContext('2d');
    const gradient=ctx.createLinearGradient(0,0,1200,1500);gradient.addColorStop(0,'#8b4567');gradient.addColorStop(1,'#311928');ctx.fillStyle=gradient;ctx.fillRect(0,0,1200,1500);
    try{const bg=await image(new URL('admin-nina-ojos-bg.png',document.baseURI).href),scale=Math.max(1200/bg.width,1500/bg.height);ctx.drawImage(bg,(1200-bg.width*scale)/2,(1500-bg.height*scale)/2,bg.width*scale,bg.height*scale);}catch{}
    ctx.fillStyle='#fff0f2ed';ctx.beginPath();ctx.roundRect(75,110,1050,1280,46);ctx.fill();
    ctx.strokeStyle='#ad7957';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(100,135,1000,1230,32);ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#9a6077';ctx.font='26px Georgia';ctx.fillText('✦   SU PALABRA NOS ACOMPAÑA   ✦',600,215);
    let size=54,wrapped;
    do{ctx.font=size+'px Georgia';wrapped=lines(ctx,text,850);if(wrapped.length*size*1.45<=830)break;size-=2;}while(size>24);
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
    const footer=document.createElement('footer'),send=document.createElement('button'),save=document.createElement('button'),status=document.createElement('p');
    send.textContent='Compartir por WhatsApp';send.className='btn btn-primary';save.textContent='Descargar placa';save.className='btn btn-ghost';send.disabled=save.disabled=true;status.setAttribute('role','status');
    footer.append(send,save);dialog.append(card,status,footer);status.textContent='Preparando la placa…';
    passageFile(text,reference).then(file=>{if(!dialog.open)return;status.textContent='Elegí WhatsApp al compartir la imagen.';send.disabled=save.disabled=false;send.onclick=()=>share([file],status);save.onclick=()=>download(file);}).catch(error=>{status.textContent=error.message;});
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
