// SALMOS 25.77 · Talles 2.0: marca transparente, fondos con vista previa y referencias por prenda.
(() => {
  'use strict';
  let ctx;
  const key='size_charts_v1';
  const styleKeyPrefix='size_chart_style_v1:';
  const lastDownloadKey='salmos_size_chart_last_download_v1';
  const defaultStyle={background:'salmos-light',color:'#ffe5ef',wrapperColor:'#5b401e',wrapperOpacity:.9};
  const shirtDetails='Algodón 24.1 - cuello en rib con tapa costura';
  const formatPrice=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',trailingZeroDisplay:'stripIfInteger'});
  const priceLabels={unit:'Por unidad',bulk:'Desde 6 unidades'};
  const defaults=window.SalmosSizeGuides.defaults;
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const fit=value=>norm(value).includes('over')?'oversize':norm(value).includes('crop')?'crop':/clasic|regular|basic/.test(norm(value))||!value?'classic':norm(value);
  const esc=value=>ctx.escapeHtml(String(value??''));
  const isKids25=chart=>/^(kids|ninos|infantil|infantiles)$/.test(norm(chart.materialClass));
  const chartClass25=value=>/^(kids|ninos|infantil|infantiles)$/.test(norm(value))?'ninos':norm(value);
  function usesShirtDetails(chart){
    const type=norm(chart.productType),group=chartClass25(chart.materialClass)||'adultos';
    return ['shirt','remera'].includes(type)&&['adultos','ninos'].includes(group)&&
      ['classic','oversize'].includes(fit(chart.fit))&&!/especial/.test(norm(chart.title));
  }
  function readSavedStyle(raw){
    try{
      const entry=JSON.parse(raw);
      const style=entry?.style,hex=/^#[0-9a-f]{6}$/i;
      if(typeof entry?.name==='string'&&entry.name.trim()&&style&&
        /^(salmos-light|original|transparent|white|black|pink|color|asset:[1-9]\d*)$/.test(style.background)&&
        hex.test(style.color)&&hex.test(style.wrapperColor)&&
        Number.isFinite(style.wrapperOpacity)&&style.wrapperOpacity>=0&&style.wrapperOpacity<=1)return entry;
    }catch{}
    return null;
  }
  function savedStyles(){
    return Object.entries(ctx.settings()).filter(([key])=>key.startsWith(styleKeyPrefix))
      .map(([id,value])=>{
        const entry=readSavedStyle(value);
        return entry&&{...entry,id};
      }).filter(Boolean)
      .sort((a,b)=>b.savedAt-a.savedAt||a.name.localeCompare(b.name,'es'));
  }
  let lastDownload;
  function lastDownloadStyle(){
    try{return readSavedStyle(localStorage.getItem(lastDownloadKey))||lastDownload;}catch{return lastDownload;}
  }
  function rememberDownload(style){
    lastDownload={name:'Última descarga',style};
    try{localStorage.setItem(lastDownloadKey,JSON.stringify(lastDownload));}catch{}
  }
  function all(){let charts=defaults;try{const saved=JSON.parse(ctx.settings()[key]||'null');if(Array.isArray(saved))charts=saved;}catch{}charts=structuredClone(charts);if(!charts.some(c=>isKids25(c)&&c.productType==='shirt'))charts.push(structuredClone(defaults.find(c=>c.id==='salmos-kids')));return charts;}
  function reference({productType='shirt',materialClass='ADULTOS',garmentFit='',size='',chartId=''}={}){
    const charts=all(),chart=charts.find(chart=>chart.id===chartId)||charts.find(chart=>chart.productType===productType&&chartClass25(chart.materialClass)===chartClass25(materialClass)&&fit(chart.fit)===fit(garmentFit));
    if(!chart)return null;const row=chart.rows.find(row=>norm(row.size)===norm(size))||(!isKids25(chart)&&chart.rows.find(row=>row.size==='M'))||chart.rows[0];return row?{chart,row}:null;
  }
  function card(chart){return `<article class="size-chart-card"><div class="size-chart-sheet" data-chart-preview="${esc(chart.id)}"><span class="size-chart-loading">Preparando imagen…</span></div><div class="size-chart-actions"><button type="button" class="icon-btn" data-size-chart-edit="${esc(chart.id)}" title="Editar tabla" aria-label="Editar ${esc(chart.title)}"><i class="fa-solid fa-pen"></i></button><button type="button" class="icon-btn" data-size-chart-export="${esc(chart.id)}" title="Descargar imagen" aria-label="Descargar ${esc(chart.title)}"><i class="fa-solid fa-download"></i></button><button type="button" class="icon-btn" data-size-chart-share="${esc(chart.id)}" title="Compartir imagen" aria-label="Compartir ${esc(chart.title)}"><i class="fa-solid fa-share-nodes"></i></button></div></article>`;}
  function gallery(){return `<section class="size-charts-section"><div class="admin-section-head"><div><h2>Tablas de talles</h2><p class="muted">Medidas en centímetros · ancho de axila a axila y largo desde el hombro</p></div><button type="button" class="btn btn-ghost" data-size-chart-new>+ Nueva tabla</button></div><div class="size-chart-gallery">${all().map(card).join('')||'<p>Agregá una tabla de talles.</p>'}</div></section>`;}
  async function save(charts,extraSettings={}){
    const settings={...extraSettings,[key]:JSON.stringify(charts)};
    await ctx.api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings})});
    Object.assign(ctx.settings(),settings);
    ctx.changed?.();
  }
  function rowHtml(row={size:'',width:'',height:''}){return `<tr data-size-chart-row><td><input class="input" data-chart-size value="${esc(row.size)}" maxlength="40" required aria-label="Talle"></td><td><input class="input" data-chart-width type="number" min=".1" max="1000" step="any" value="${row.width}" required aria-label="Ancho en centímetros"></td><td><input class="input" data-chart-height type="number" min=".1" max="1000" step="any" value="${row.height}" required aria-label="Largo en centímetros"></td><td><button type="button" class="icon-btn" data-chart-remove-row aria-label="Quitar talle">×</button></td></tr>`;}
  function edit(id=''){
    const current=all().find(chart=>chart.id===id),draft=current||{id:crypto.randomUUID(),title:'',productType:'shirt',fit:'Clásica',materialClass:'ADULTOS',notes:'Medidas aproximadas',rows:[{size:'',width:'',height:''}]},dialog=ctx.dialog('sizeChartEditorDialog',current?'Editar tabla de talles':'Nueva tabla de talles');dialog.classList.add('size-chart-editor');
    dialog.querySelector('.dialog-body').innerHTML=`<form data-chart-form><div class="form-grid"><label class="field full">Título<input class="input" name="title" maxlength="160" required value="${esc(draft.title)}"></label><label class="field">Producto<select class="select" name="productType">${[['shirt','Remera'],['chomba','Chomba'],['hoodie','Buzo'],['other','Otro']].map(([value,label])=>`<option value="${value}" ${draft.productType===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="field">Corte<input class="input" name="fit" maxlength="80" value="${esc(draft.fit)}" placeholder="Clásica, oversize, crop…"></label><label class="field">Grupo de talles<input class="input" name="materialClass" maxlength="80" value="${esc(draft.materialClass)}" list="sizeChartClasses"><datalist id="sizeChartClasses"><option>ADULTOS</option><option>NIÑOS</option><option>KIDS</option><option>ESPECIALES</option></datalist></label><label class="field full">Nota<input class="input" name="notes" maxlength="300" value="${esc(draft.notes)}"></label></div><div class="size-chart-edit-table"><table><thead><tr><th>Talle</th><th>Ancho (cm)</th><th>Largo (cm)</th><th></th></tr></thead><tbody>${draft.rows.map(rowHtml).join('')}</tbody></table></div><button type="button" class="btn btn-ghost" data-chart-add-row>+ Agregar talle</button><p role="status"></p><div class="admin-actions"><button type="submit" class="btn btn-primary">Guardar tabla</button>${current?'<button type="button" class="icon-btn" data-chart-delete title="Eliminar tabla" aria-label="Eliminar tabla"><i class="fa-solid fa-trash-can"></i></button>':''}</div></form>`;
    const form=dialog.querySelector('form');form.insertAdjacentHTML('afterbegin','<label class="field full">Imagen de referencia<input type="file" accept="image/png,image/jpeg,image/webp" data-chart-reference-file><img data-chart-reference-preview alt="Prenda de referencia" style="height:150px;width:100%;object-fit:contain"></label>');form.querySelector('[data-chart-reference-preview]').src=chartReferenceImage(draft);form.querySelector('[data-chart-reference-file]').onchange=async event=>{const submit=form.querySelector('[type=submit]');submit.disabled=true;try{draft.referenceImage=await readChartReference(event.target.files[0]);delete draft.referenceAssetId;form.querySelector('[data-chart-reference-preview]').src=draft.referenceImage;}catch(e){form.querySelector('[role=status]').textContent=e.message;}finally{submit.disabled=false;}};form.onclick=async event=>{if(event.target.closest('[data-chart-add-row]'))form.querySelector('tbody').insertAdjacentHTML('beforeend',rowHtml());if(event.target.closest('[data-chart-remove-row]'))event.target.closest('tr').remove();if(event.target.closest('[data-chart-delete]')&&confirm('¿Eliminar esta tabla de talles?')){try{await save(all().filter(chart=>chart.id!==id));dialog.close();}catch(error){form.querySelector('[role=status]').textContent=error.message;}}};
    form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;const data=Object.fromEntries(new FormData(form)),rows=[...form.querySelectorAll('[data-size-chart-row]')].map(row=>({size:row.querySelector('[data-chart-size]').value.trim().toUpperCase(),width:Number(row.querySelector('[data-chart-width]').value),height:Number(row.querySelector('[data-chart-height]').value)}));if(!rows.length||new Set(rows.map(row=>norm(row.size))).size!==rows.length){form.querySelector('[role=status]').textContent='Agregá al menos un talle y evitá repetirlo.';return;}const button=form.querySelector('[type=submit]');button.disabled=true;try{const charts=all(),index=charts.findIndex(chart=>chart.id===id),next={...draft,...data,materialClass:data.materialClass.trim().toUpperCase(),rows};if(index<0)charts.push(next);else charts[index]=next;await save(charts);dialog.close();ctx.toast('Tabla guardada','success');}catch(error){form.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};dialog.showModal();
  }
  const images=new Map();
  async function brandImage(path){if(!images.has(path))images.set(path,(async()=>{const image=new Image();image.src=path;await image.decode();return image;})().catch(error=>{images.delete(path);throw error;}));return images.get(path);}
  let sources={};
  const garmentPhotos=new Map();
  function repairCollar(image,w,h,top,span){const data=image.data,limit=Math.min(h,Math.ceil(top+h*.22)),seen=new Uint8Array(w*limit),queue=new Int32Array(w*limit);for(let y=Math.max(1,top);y<limit-1;y++)for(let x=1;x<w-1;x++){const origin=y*w+x;if(seen[origin]||data[origin*4+3]>70)continue;let head=0,end=1,touch=false,minx=x,maxx=x,miny=y,maxy=y;queue[0]=origin;seen[origin]=1;while(head<end){const at=queue[head++],xx=at%w,yy=Math.floor(at/w);minx=Math.min(minx,xx);maxx=Math.max(maxx,xx);miny=Math.min(miny,yy);maxy=Math.max(maxy,yy);if(xx===0||xx===w-1||yy<=top||yy===limit-1)touch=true;for(const n of [xx?at-1:-1,xx<w-1?at+1:-1,yy?at-w:-1,yy<limit-1?at+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]<=70){seen[n]=1;queue[end++]=n;}}if(touch||end>span*span*.012||(maxx-minx)>span*.17||(maxy-miny)>span*.16)continue;const samples=[];for(let yy=Math.max(top,miny-4);yy<=Math.min(limit-1,maxy+4);yy++)for(let xx=Math.max(0,minx-4);xx<=Math.min(w-1,maxx+4);xx++){const k=(yy*w+xx)*4;if(data[k+3]>220&&Math.max(data[k],data[k+1],data[k+2])<100)samples.push([data[k],data[k+1],data[k+2]]);}if(!samples.length)continue;const color=[0,1,2].map(k=>samples.map(v=>v[k]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]);for(let j=0;j<end;j++){const k=queue[j]*4;data[k]=color[0];data[k+1]=color[1];data[k+2]=color[2];data[k+3]=255;}}
    // Close tiny exterior-connected notches around the collar, without filling the neckline.
    const radius=Math.max(2,Math.round(span*.012)),copy=new Uint8ClampedArray(data);for(let y=top+radius;y<Math.min(limit-radius,top+h*.12);y++)for(let x=Math.round(w*.28);x<Math.round(w*.72);x++){const at=(y*w+x)*4;if(copy[at+3]>70)continue;let left=-1,right=-1;for(let k=1;k<=radius;k++){if(left<0&&copy[(y*w+x-k)*4+3]>220)left=x-k;if(right<0&&copy[(y*w+x+k)*4+3]>220)right=x+k;}if(left<0||right<0)continue;const lo=(y*w+left)*4,ro=(y*w+right)*4;if(Math.max(copy[lo],copy[lo+1],copy[lo+2],copy[ro],copy[ro+1],copy[ro+2])>100)continue;for(let k=0;k<3;k++)data[at+k]=Math.round((copy[lo+k]+copy[ro+k])/2);data[at+3]=255;}}
  function chartReferenceImage(chart){if(chart.referenceImage)return chart.referenceImage;const type=norm(chart.productType+' '+chart.title),special=/especial/.test(norm(chart.materialClass+' '+chart.title));return 'size-chart-images/'+(/chomba|polo/.test(type)?'chomba':!special&&/over/.test(norm(chart.fit+' '+chart.title))?'oversize':'clasica')+'.png';}
  async function garmentPhoto(chart){return brandImage(chartReferenceImage(chart));}
  async function drawGarment(c,chart,x,y,w,h){const image=await garmentPhoto(chart),iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,k=Math.min(w/iw,h/ih);c.drawImage(image,x+(w-iw*k)/2,y+(h-ih*k)/2,iw*k,ih*k);}
  async function hydrateGarments(){if(!ctx)return;for(const el of document.querySelectorAll('[data-chart-preview]:not([data-loaded])')){el.dataset.loaded='1';const chart=all().find(x=>x.id===el.dataset.chartPreview);if(!chart)continue;try{const blob=await renderImage(chart),image=new Image();image.alt=chart.title+' · guía de talles';image.src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});await image.decode();el.replaceChildren(image);}catch(e){el.replaceChildren();el.dataset.failed='1';const choose=document.createElement('button');choose.textContent='Subir imagen';choose.onclick=()=>pickGarment(chart);const message=document.createElement('small');message.textContent='No se pudo cargar la imagen';el.append(message);el.append(choose);}}}

  async function readChartReference(file){if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>12*1024*1024)throw Error('Elegí una imagen PNG, JPG o WebP de hasta 12 MB.');const image=new Image(),url=URL.createObjectURL(file);try{image.src=url;await image.decode();const canvas=document.createElement('canvas'),k=Math.min(1,1400/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*k);canvas.height=Math.round(image.naturalHeight*k);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.92);}finally{URL.revokeObjectURL(url);}}
  async function pickGarment(chart){const dialog=document.createElement('dialog');dialog.className='chart-garment-picker';const title=document.createElement('h2');title.textContent='Imagen de la tabla';const upload=document.createElement('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp';upload.setAttribute('aria-label','Subir imagen de referencia');const preview=new Image();preview.src=chartReferenceImage(chart);preview.alt='Prenda de referencia';preview.style.cssText='width:100%;height:320px;object-fit:contain';const status=document.createElement('output'),ok=document.createElement('button'),cancel=document.createElement('button');ok.textContent='Guardar imagen';ok.disabled=true;cancel.textContent='Volver';let image=null,selected=false;upload.onchange=async()=>{try{image=await readChartReference(upload.files[0]);preview.src=image;ok.disabled=false;status.textContent='';}catch(e){status.textContent=e.message;}};ok.onclick=async()=>{ok.disabled=true;try{const charts=all(),index=charts.findIndex(c=>c.id===chart.id);if(index<0)throw Error('Guardá primero la tabla.');charts[index]={...charts[index],referenceImage:image};delete charts[index].referenceAssetId;await save(charts);chart.referenceImage=image;selected=true;dialog.close();}catch(e){status.textContent=e.message;ok.disabled=false;}};cancel.onclick=()=>dialog.close();dialog.append(title,preview,upload,status,ok,cancel);document.body.append(dialog);dialog.showModal();return new Promise(resolve=>dialog.onclose=()=>{dialog.remove();document.querySelectorAll('[data-chart-preview]').forEach(el=>delete el.dataset.loaded);hydrateGarments();resolve(selected);});}

  function golden(c,y=0,h=1800){const g=c.createLinearGradient(0,y,0,y+h);for(const [p,color] of [[0,'#ffeb99'],[.17,'#e5a426'],[.39,'#fff0aa'],[.48,'#fffbe3'],[.54,'#bc7510'],[.75,'#ffcf50'],[1,'#9c5906']])g.addColorStop(p,color);return g;}
  function frame(c){const path=inset=>{const r=58;c.beginPath();c.moveTo(inset+r,inset);c.lineTo(1800-inset-r,inset);c.lineTo(1800-inset,inset+r);c.lineTo(1800-inset,1800-inset-r);c.lineTo(1800-inset-r,1800-inset);c.lineTo(inset+r,1800-inset);c.lineTo(inset,1800-inset-r);c.lineTo(inset,inset+r);c.closePath();};c.strokeStyle=golden(c);c.lineWidth=7;c.shadowColor='#d59527';c.shadowBlur=14;path(30);c.stroke();c.shadowBlur=0;c.lineWidth=2;path(41);c.stroke();for(const [x,y]of [[95,31],[1705,31],[31,900],[1769,900],[95,1769],[1705,1769]]){const flare=c.createRadialGradient(x,y,0,x,y,34);flare.addColorStop(0,'#fffce4');flare.addColorStop(.1,'#fff3b4');flare.addColorStop(.3,'#f7b82980');flare.addColorStop(1,'#e5aa0000');c.fillStyle=flare;c.fillRect(x-34,y-34,68,68);c.fillStyle='#fff6c7';c.fillRect(x-26,y-.7,52,1.4);c.fillRect(x-.7,y-15,1.4,30);}}
  function labelPanel(c,x,y,width,height,light){
    c.fillStyle=light?'#fff8e4':'#352316';
    c.strokeStyle=golden(c,y,height);
    c.lineWidth=3;
    c.beginPath();
    c.roundRect(x,y,width,height,18);
    c.fill();
    c.stroke();
    c.textAlign='center';
    c.fillStyle=light?'#533613':'#ffe5aa';
  }
  function drawPrices(c,prices,x,y,width,height,light){
    c.save();
    labelPanel(c,x,y,width,height,light);
    const column=width/prices.length;
    prices.forEach(({label,value},index)=>{
      const center=x+column*(index+.5);
      c.fillStyle=light?'#533613':'#ffe5aa';
      c.font='bold 32px Inter, Arial';
      c.fillText(label,center,y+60,column-30);
      c.fillStyle=light?'#221509':'#fff9e9';
      c.font='bold 57px Inter, Arial';
      const amount=formatPrice.format(value)+(label===priceLabels.bulk?' c/u':'');
      c.fillText(amount,center,y+132,column-30);
    });
    if(prices.length===2){
      c.beginPath();
      c.moveTo(x+column,y+30);
      c.lineTo(x+column,y+height-30);
      c.stroke();
    }
    c.restore();
  }
  function drawAvailableColors(c,colors,x,y,width,height,light){
    c.save();
    labelPanel(c,x,y,width,height,light);
    c.font='bold 33px Inter, Arial';
    c.fillText('Colores disponibles',x+width/2,y+51,width-40);
    const space=width-56,rowsHeight=height-82;
    const columns=Math.min(colors.length,Math.max(8,Math.ceil(Math.sqrt(colors.length*space/rowsHeight))));
    const rows=Math.ceil(colors.length/columns);
    const spacing=Math.min(72,space/columns,rowsHeight/rows);
    colors.forEach((color,index)=>{
      const row=Math.floor(index/columns);
      const amount=Math.min(columns,colors.length-row*columns);
      const center=x+width/2+(index%columns-(amount-1)/2)*spacing;
      const top=y+65+(rowsHeight-rows*spacing)/2+(row+.5)*spacing;
      c.fillStyle=color;
      c.strokeStyle=light?'#84603d':'#e1bc82';
      c.lineWidth=Math.min(3,spacing*.09);
      c.beginPath();
      c.arc(center,top,spacing*.36,0,Math.PI*2);
      c.fill();
      c.stroke();
    });
    c.restore();
  }
  async function renderImage(chart,options={}){
    const {background='salmos-light',color='#ffffff',quality='max',wrapperColor='#5b401e',wrapperOpacity=.9,wrapperVisible=true}=Object.assign({},chart.exportStyle||{},options);
    await document.fonts?.load('bold 60px Georgia');await document.fonts?.load('bold 42px Inter');const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1800;const c=canvas.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
    const transparent=background==='transparent';
    if(!transparent){
      c.fillStyle=background==='color'?color:background==='pink'?'#ffe5ef':
        ['white','salmos-light'].includes(background)?'#fffdf8':'#070707';
      c.fillRect(0,0,1800,1800);
      if(background==='original'||background==='black'){
        for(const [x,y] of [[0,0],[1800,1800]]){
          const glow=c.createRadialGradient(x,y,0,x,y,1050);
          glow.addColorStop(0,'#96620b66');
          glow.addColorStop(.5,'#3a250c33');
          glow.addColorStop(1,'#00000000');
          c.fillStyle=glow;
          c.fillRect(0,0,1800,1800);
        }
      }
      if(background.startsWith('asset:')){
        const image=await ctx.background(Number(background.slice(6)));
        if(image){
          const scale=Math.max(1800/image.width,1800/image.height);
          c.drawImage(image,(1800-image.width*scale)/2,(1800-image.height*scale)/2,image.width*scale,image.height*scale);
        }
      }
    }
    if(background==='salmos-light'){
      const art=await brandImage('banner-salmos-light.png');
      c.save();
      c.globalAlpha=.13;
      const scale=Math.max(1800/art.width,1800/art.height)*12;
      c.drawImage(art,0,0,art.width*scale,art.height*scale);
      c.restore();
    }
    frame(c);
    c.save();
    c.translate(0,(1800-1615)/2-35);
    if(wrapperVisible){
      c.save();
      c.globalAlpha=Math.max(0,Math.min(1,Number(wrapperOpacity)));
      c.fillStyle=/^#[0-9a-f]{6}$/i.test(wrapperColor)?wrapperColor:defaultStyle.wrapperColor;
      c.beginPath();
      c.roundRect(85,35,1630,1615,30);
      c.fill();
      c.restore();
    }
    const isLightAt=(x,y)=>{
      const [r,g,b]=c.getImageData(x,y,1,1).data;
      return r*.299+g*.587+b*.114>145;
    };
    const light=isLightAt(900,900),ink=light?'#17140e':'#fff6e7';
    const contain=(image,x,y,w,h)=>{
      const scale=Math.min(w/image.width,h/image.height);
      c.drawImage(image,x+(w-image.width*scale)/2,y+(h-image.height*scale)/2,image.width*scale,image.height*scale);
    };
    if(isKids25(chart)){
      contain(await brandImage('salmos-kids.png'),180,45,640,350);
      c.font='bold 146px Georgia';
      c.textAlign='center';
      c.fillStyle='#ffda55';
      c.fillText('KIDS',1190,250,650);
    }else{
      const darkLettering=[660,1030,1400].filter(x=>isLightAt(x,300)).length>=2;
      contain(await brandImage(darkLettering?'logo-light.png':'logo-mark.png'),240,45,350,340);
      if(darkLettering){
        contain(await brandImage('brand-wordmark-light-v30.png'),600,45,1040,350);
      }else{
        const gold=await brandImage('logo-salmos.png');
        c.drawImage(gold,0,862,1254,350,634,70,982,290);
      }
    }
    c.font='bold 66px Georgia';
    c.textAlign='center';
    c.fillStyle=ink;
    c.fillText(String(chart.title).toLocaleUpperCase('es')+' • GUÍA DE TALLES',900,500,1540);
    c.strokeStyle=golden(c);c.lineWidth=2;c.beginPath();c.moveTo(120,435);c.lineTo(720,435);c.moveTo(1080,435);c.lineTo(1680,435);c.stroke();c.fillStyle=golden(c);c.save();c.translate(900,435);c.rotate(Math.PI/4);c.fillRect(-6,-6,12,12);c.restore();
    const prices=options.prices||[],colors=options.colors||[];
    const x=790,y=610,width=890,rowHeight=Math.min(150,(prices.length?670:870)/(chart.rows.length+1)),col=width/3,fontSize=Math.min(65,rowHeight*.62);c.save();c.globalAlpha=.5;c.fillStyle='#eabd64';c.fillRect(x,y,width,rowHeight);c.restore();c.globalAlpha=1;c.font=`bold ${Math.min(54,rowHeight*.53)}px Georgia`;c.fillStyle='#120b02';c.textAlign='center';['TALLE','ANCHO','LARGO'].forEach((text,i)=>c.fillText(text,x+col*(i+.5),y+rowHeight*.7));
    chart.rows.forEach((row,i)=>{const cy=y+(i+1)*rowHeight;if(!transparent){c.fillStyle=light?(i%2?'#a16b0c0b':'#a16b0c14'):(i%2?'#ffffff03':'#ffffff08');c.fillRect(x,cy,width,rowHeight);}c.fillStyle=ink;c.font=`bold ${fontSize}px Georgia`;[row.size,row.width+' cm',row.height+' cm'].forEach((text,j)=>c.fillText(String(text),x+col*(j+.5),cy+rowHeight*.7,col-25));});
    c.strokeStyle=golden(c,y,680);c.lineWidth=2;const end=y+(chart.rows.length+1)*rowHeight;for(let i=0;i<=chart.rows.length+1;i++){c.beginPath();c.moveTo(x,y+i*rowHeight);c.lineTo(x+width,y+i*rowHeight);c.stroke();}for(let i=0;i<=3;i++){c.beginPath();c.moveTo(x+i*col,y);c.lineTo(x+i*col,end);c.stroke();}
    await drawGarment(c,chart,120,600,650,colors.length?680:920);
    if(prices.length)drawPrices(c,prices,x,1314,width,182,light);
    if(colors.length)drawAvailableColors(c,colors,120,1314,650,182,light);
    const showShirtDetails=usesShirtDetails(chart);
    c.fillStyle=ink;
    c.textAlign='center';
    c.font='italic bold 34px Inter, Arial';
    c.fillText('*'+String(chart.notes||'Medidas aproximadas').replace(/^\*/,''),900,showShirtDetails?1564:1610,1500);
    if(showShirtDetails){
      c.font='bold 38px Inter, Arial';
      c.fillText(shirtDetails,900,1617,1500);
    }
    c.restore();
    if(options.returnCanvas)return canvas;
    const blob=window.SalmosDotEffects?.png?await window.SalmosDotEffects.png(canvas):await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('No se pudo generar la imagen.')),'image/png'));return ctx.quality?ctx.quality(blob,quality):blob;
  }
  function exportDialog(id,sharing=false){
    const chart=all().find(chart=>chart.id===id);
    if(!chart)return;
    const dialog=ctx.dialog('sizeChartDownloadDialog',sharing?'Compartir tabla de talles':'Descargar tabla de talles');
    dialog.classList.remove('tiny-dialog');
    dialog.classList.add('size-chart-export');
    const body=dialog.querySelector('.dialog-body');
    let footer=dialog.querySelector('.chart-export-footer');
    if(!footer){
      footer=document.createElement('footer');
      footer.className='dialog-foot chart-export-footer';
      body.after(footer);
    }
    footer.innerHTML=`
      <label class="field">Calidad<select class="select" data-chart-quality>
        <option value="max">Máxima calidad</option><option value="small">Menos de 5 MB · WhatsApp</option>
      </select></label>
      <div class="admin-actions">
        <button type="button" class="btn btn-primary" data-chart-download>Descargar</button>
        <button type="button" class="btn btn-ghost" data-chart-share>Compartir</button>
      </div>`;
    body.innerHTML=`
      <div class="chart-export-layout">
        <div class="chart-export-media">
          <div class="chart-export-preview">
            <img data-chart-preview alt="Vista previa de ${esc(chart.title)}">
            <p data-chart-preview-status role="status">Preparando vista previa…</p>
          </div>
          <section class="chart-backgrounds" aria-label="Fondos">
            <div class="chart-backgrounds-head">
              <strong>Fondos</strong>
              <label class="chart-background-custom" data-chart-color-field hidden>
                Color del fondo<input type="color" data-chart-color>
              </label>
              <input class="input" type="search" data-chart-background-search
                placeholder="Buscar fondo…" aria-label="Buscar un fondo">
            </div>
            <div class="chart-background-grid" data-chart-background-grid role="group" aria-label="Fondos con miniaturas"></div>
            <p data-chart-background-empty hidden>No hay fondos para esa búsqueda.</p>
          </section>
        </div>
        <section class="chart-export-controls">
          <div class="chart-export-controls-head">
            <strong>${esc(chart.title)}</strong>
            <button type="button" class="btn btn-ghost" data-chart-garment>Subir imagen</button>
          </div>
          <section class="chart-saved-styles">
            <label class="field">Estilos guardados<select class="select" data-chart-styles></select></label>
            <form class="chart-style-form" data-chart-style-form>
              <label class="field">Nombre del estilo<input class="input" name="name" maxlength="60" required></label>
              <button type="submit" class="btn btn-ghost">Guardar estilo</button>
            </form>
            <p data-chart-style-status role="status"></p>
          </section>
          <fieldset class="chart-wrapper-controls">
            <legend>Wrapper de la tabla</legend>
            <div class="chart-wrapper-color-row">
              <label class="field">Color<input type="color" data-chart-wrapper-color></label>
              <button type="button" class="btn btn-ghost" data-chart-wrapper-eyedropper>Cuentagotas del fondo</button>
            </div>
            <label class="field chart-wrapper-opacity"><span>Opacidad <output data-chart-wrapper-opacity-value></output></span>
              <input type="range" min="0" max="100" step="1" data-chart-wrapper-opacity>
            </label>
          </fieldset>
          <fieldset class="chart-annotation-controls">
            <legend>Etiqueta de precios</legend>
            <label class="chart-price-toggle"><input type="checkbox" data-chart-show-prices> Mostrar en la imagen</label>
            <div class="chart-price-fields" data-chart-price-fields hidden>
              <label class="field">Por unidad ($)<input class="input" type="number" min="0.01" step="0.01"
                 inputmode="decimal" placeholder="15000" data-chart-price="unit"></label>
              <label class="field">Desde 6 unidades ($ c/u)<input class="input" type="number" min="0.01" step="0.01"
                 inputmode="decimal" placeholder="12000" data-chart-price="bulk"></label>
              <p data-chart-price-status role="status"></p>
            </div>
          </fieldset>
          <fieldset class="chart-annotation-controls">
            <legend>Colores disponibles</legend>
            <div class="chart-color-tools">
              <div class="chart-colors-list" data-chart-colors></div>
              <button type="button" class="btn btn-ghost" data-chart-add-color>+ Agregar color</button>
            </div>
          </fieldset>
        </section>
      </div>`;
    const field=selector=>dialog.querySelector(selector);
    const color=field('[data-chart-color]');
    const wrapper=field('[data-chart-wrapper-color]'),opacity=field('[data-chart-wrapper-opacity]');
    const opacityLabel=field('[data-chart-wrapper-opacity-value]'),quality=field('[data-chart-quality]');
    const preview=field('[data-chart-preview]'),status=field('[data-chart-preview-status]');
    const picker=field('[data-chart-wrapper-eyedropper]');
    const showPrices=field('[data-chart-show-prices]'),priceFields=field('[data-chart-price-fields]');
    const priceStatus=field('[data-chart-price-status]'),priceInputs=[...priceFields.querySelectorAll('input')];
    const colorList=field('[data-chart-colors]');

    function selectedPrices(){
      return showPrices.checked?priceInputs.filter(input=>input.validity.valid&&input.valueAsNumber>0)
        .map(input=>({label:priceLabels[input.dataset.chartPrice],value:input.valueAsNumber})):[];
    }
    function validatePrices(){
      if(!showPrices.checked)return true;
      const invalid=priceInputs.find(input=>!input.validity.valid);
      if(!invalid&&selectedPrices().length)return true;
      priceStatus.textContent=invalid?'Ingresá un precio mayor a cero, con hasta dos decimales.':
        'Ingresá al menos un precio para mostrar la etiqueta.';
      (invalid||priceInputs[0]).focus();
      return false;
    }
    function selectedColors(){
      return [...colorList.querySelectorAll('input')].map(input=>input.value);
    }
    function labelColorFields(){
      [...colorList.children].forEach((row,index)=>{
        row.firstElementChild.setAttribute('aria-label','Color disponible '+(index+1));
        row.lastElementChild.setAttribute('aria-label','Quitar color '+(index+1));
      });
    }
    field('[data-chart-add-color]').onclick=()=>{
      const row=document.createElement('div');
      const input=document.createElement('input'),remove=document.createElement('button');
      input.type='color';
      input.value='#e98eb8';
      input.oninput=schedule;
      remove.type='button';
      remove.className='icon-btn';
      remove.textContent='×';
      remove.onclick=()=>{
        row.remove();
        labelColorFields();
        schedule();
        field('[data-chart-add-color]').focus();
      };
      row.append(input,remove);
      colorList.append(row);
      labelColorFields();
      input.focus();
      schedule();
    };
    showPrices.onchange=()=>{
      priceFields.hidden=!showPrices.checked;
      priceStatus.textContent='';
      schedule();
    };
    for(const input of priceInputs)input.oninput=()=>{
      priceStatus.textContent='';
      schedule();
    };
    const backgroundOptions=document.createElement('select');
    backgroundOptions.innerHTML=ctx.backgroundOptions();
    backgroundOptions.prepend(new Option('SALMOS · modo claro','salmos-light'));
    if(![...backgroundOptions.options].some(option=>option.value==='pink')){
      backgroundOptions.add(new Option('Rosa suave','pink'),Math.min(2,backgroundOptions.length));
    }
    const backgrounds=new Map([...backgroundOptions.options].map(option=>[option.value,option.textContent]));
    let background=defaultStyle.background;

    const grid=field('[data-chart-background-grid]'),search=field('[data-chart-background-search]');
    const backgroundEmpty=field('[data-chart-background-empty]');
    const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){
        observer.unobserve(entry.target);
        entry.target._loadThumb?.();
      }
    },{root:grid,rootMargin:'80px'}):null;
    const buttons=[...backgrounds].map(([value,label])=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='chart-background-choice';
      button.dataset.value=value;
      const swatch=document.createElement('span');
      swatch.className='chart-background-thumb';
      const fills={
        'salmos-light':'#fffdf8',
        white:'#fff',
        pink:'linear-gradient(135deg,#fff1f7,#edbfd4)',
        transparent:'repeating-conic-gradient(#e1ccda 0% 25%,#fff7fb 0% 50%) 0 0/12px 12px',
        color:'linear-gradient(130deg,#f6c4dc,#c9d8ef,#d2e2c4)'
      };
      swatch.style.background=fills[value]||'radial-gradient(ellipse at 0 0,#8a5b22,transparent),#0c0b0b';
      if(value.startsWith('asset:')){
        swatch.textContent='…';
        button._loadThumb=async()=>{
          try{
            const image=await ctx.background(Number(value.slice(6)));
            if(!image)throw Error();
            const thumb=new Image();
            thumb.src=image.src;
            thumb.alt='';
            thumb.loading='lazy';
            swatch.replaceChildren(thumb);
          }catch{
            swatch.textContent='Vista no disponible';
          }
        };
        if(observer)observer.observe(button);
        else button._loadThumb();
      }
      const name=document.createElement('small');
      name.textContent=label;
      button.append(swatch,name);
      button.onclick=()=>{
        if(value!==background){
          background=value;
          styleSelect.value='';
          selectionChanged();
        }
        if(value==='color')color.focus();
      };
      grid.append(button);
      return button;
    });

    const currentStyle=()=>({background,color:color.value,wrapperColor:wrapper.value,wrapperOpacity:Number(opacity.value)/100});
    function setStyle(style){
      background=backgrounds.has(style.background)?style.background:defaultStyle.background;
      color.value=style.color;
      wrapper.value=style.wrapperColor;
      opacity.value=Math.round(style.wrapperOpacity*100);
      opacityLabel.value=opacity.value+'%';
    }

    const styleSelect=field('[data-chart-styles]'),styleStatus=field('[data-chart-style-status]');
    const styleForm=field('[data-chart-style-form]'),styleName=styleForm.elements.namedItem('name');
    let stylesById=new Map(),suggestedName='';
    function refreshStyles(selected=styleSelect.value){
      const styles=savedStyles(),last=lastDownloadStyle();
      if(last)styles.unshift({...last,id:'last-download'});
      stylesById=new Map(styles.map(entry=>[entry.id,entry]));
      const placeholder=new Option(styles.length?'Elegí un estilo':'Todavía no hay estilos guardados','');
      styleSelect.replaceChildren(placeholder,...styles.map(entry=>{
        const label=backgrounds.has(entry.style.background)?entry.name:entry.name+' (fondo no disponible)';
        return new Option(label,entry.id);
      }));
      styleSelect.value=stylesById.has(selected)?selected:'';
      styleSelect.disabled=!styles.length;
    }
    function suggestStyleName(){
      const useSuggestion=!styleName.value.trim()||styleName.value===suggestedName;
      const taken=new Set([...stylesById.values()].map(entry=>norm(entry.name)));
      const prefix='Estilo '+backgrounds.get(background);
      let number=1;
      do{
        const suffix=' '+number++;
        suggestedName=prefix.slice(0,styleName.maxLength-suffix.length).trimEnd()+suffix;
      }while(taken.has(norm(suggestedName)));
      if(useSuggestion)styleName.value=suggestedName;
    }
    styleSelect.onchange=()=>{
      const entry=stylesById.get(styleSelect.value);
      if(!entry)return;
      if(!backgrounds.has(entry.style.background)){
        styleStatus.textContent='El fondo de «'+entry.name+'» ya no está disponible.';
        styleSelect.value='';
        return;
      }
      setStyle(entry.style);
      search.value='';
      filterBackgrounds();
      selectionChanged();
      styleStatus.textContent='Estilo «'+entry.name+'» aplicado.';
    };
    styleForm.onsubmit=async event=>{
      event.preventDefault();
      const name=styleName.value.trim(),submit=styleForm.querySelector('[type=submit]');
      if(!name){styleName.focus();styleStatus.textContent='Escribí un nombre para el estilo.';return;}
      if(submit.disabled)return;
      const id=styleKeyPrefix+crypto.randomUUID(),style=currentStyle();
      const value=JSON.stringify({name,style,savedAt:Date.now()});
      submit.disabled=true;
      try{
        const charts=all(),target=charts.find(item=>item.id===chart.id);
        if(!target)throw Error('Guardá primero la tabla.');
        target.exportStyle=style;
        await save(charts,{[id]:value});
        chart.exportStyle=style;
        if(dialog.open&&styleForm.isConnected){
          const applied=JSON.stringify(currentStyle())===JSON.stringify(style);
          refreshStyles(applied?id:styleSelect.value);
          if(styleName.value.trim()===name)styleName.value='';
          suggestStyleName();
          styleStatus.textContent='Estilo «'+name+'» guardado.';
        }
      }catch(error){
        styleStatus.textContent=error.message;
      }finally{
        submit.disabled=false;
      }
    };

    let prepared=null,preparing=null,sequence=0,previewUrl='',timer,picking=false,pickCanvas=null;
    const filename='SALMOS-'+chart.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-')+'.png';
    function showPreview(blob){
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      previewUrl=URL.createObjectURL(blob);
      preview.src=previewUrl;
    }
    async function prepare(){
      const style=currentStyle();
      const selected={...style,quality:quality.value,prices:selectedPrices(),colors:selectedColors()};
      const fingerprint=JSON.stringify(selected);
      if(prepared?.fingerprint===fingerprint)return prepared;
      if(preparing?.fingerprint===fingerprint)return preparing.promise;
      clearTimeout(timer);
      const request=++sequence;
      status.textContent='Preparando imagen…';
      const promise=(async()=>{
        const blob=await renderImage(chart,selected);
        if(request!==sequence||!dialog.open||picking||!preview.isConnected)return null;
        prepared={fingerprint,blob,name:filename,style};
        showPreview(blob);
        status.textContent='Así se descarga la imagen.';
        return prepared;
      })();
      preparing={fingerprint,promise};
      try{return await promise;}finally{if(preparing?.promise===promise)preparing=null;}
    }
    function schedule(){
      picking=false;
      preview.classList.remove('chart-picking-color');
      prepared=preparing=null;
      ++sequence;
      clearTimeout(timer);
      status.textContent='Preparando imagen…';
      timer=setTimeout(()=>prepare().catch(error=>status.textContent=error.message),130);
    }
    function selectionChanged(){
      field('[data-chart-color-field]').hidden=background!=='color';
      for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.value===background));
      suggestStyleName();
      schedule();
    }
    field('[data-chart-garment]').onclick=async()=>{
      if(await pickGarment(chart))selectionChanged();
    };
    function styleChanged(){
      styleSelect.value='';
      schedule();
    }
    color.oninput=wrapper.oninput=styleChanged;
    quality.onchange=schedule;
    opacity.oninput=()=>{opacityLabel.value=opacity.value+'%';styleChanged();};
    function filterBackgrounds(){
      const query=norm(search.value);
      for(const button of buttons)button.hidden=!norm(button.textContent).includes(query);
      const hasMatches=buttons.some(button=>!button.hidden);
      grid.hidden=!hasMatches;
      backgroundEmpty.hidden=hasMatches;
    }
    search.oninput=filterBackgrounds;

    picker.onclick=async()=>{
      if(picking){schedule();return;}
      picking=true;
      prepared=preparing=null;
      const request=++sequence;
      clearTimeout(timer);
      picker.disabled=true;
      try{
        pickCanvas=await renderImage(chart,{...currentStyle(),prices:selectedPrices(),colors:selectedColors(),
          wrapperVisible:false,returnCanvas:true});
        const blob=await new Promise(resolve=>pickCanvas.toBlob(resolve,'image/png'));
        if(request!==sequence||!dialog.open||!preview.isConnected)return;
        showPreview(blob);
        preview.classList.add('chart-picking-color');
        status.textContent='Tocá el fondo de la vista previa para tomar su color.';
      }catch(error){
        if(request===sequence){picking=false;status.textContent=error.message;}
      }finally{
        picker.disabled=false;
      }
    };
    preview.addEventListener('click',event=>{
      if(!picking||!pickCanvas)return;
      const rect=preview.getBoundingClientRect(),size=Math.min(rect.width,rect.height);
      const x=event.clientX-rect.left-(rect.width-size)/2,y=event.clientY-rect.top-(rect.height-size)/2;
      if(x<0||y<0||x>size||y>size)return;
      try{
        const pixel=pickCanvas.getContext('2d').getImageData(
          Math.min(1799,Math.floor(x/size*1800)),Math.min(1799,Math.floor(y/size*1800)),1,1
        ).data;
        if(!pixel[3]){status.textContent='Ese punto es transparente. Elegí una parte del fondo con color.';return;}
        wrapper.value='#'+[...pixel.slice(0,3)].map(value=>value.toString(16).padStart(2,'0')).join('');
        styleChanged();
      }catch{
        schedule();
        status.textContent='No se pudo tomar ese color. Podés elegirlo con el selector de color.';
      }
    });
    field('[data-chart-download]').onclick=async event=>{
      if(!validatePrices())return;
      const button=event.currentTarget;
      button.disabled=true;
      try{
        if(picking)schedule();
        const file=await prepare();
        if(!file||!dialog.open||!button.isConnected)return;
        await ctx.download(file.blob,file.name);
        rememberDownload(file.style);
        refreshStyles();
        styleStatus.textContent='Estilo guardado en «Última descarga».';
      }catch(error){
        status.textContent=error.message;
      }finally{
        button.disabled=false;
      }
    };
    field('[data-chart-share]').onclick=async()=>{
      if(!validatePrices())return;
      try{
        if(!prepared){
          if(picking)schedule();
          if(await prepare())status.textContent='Lista. Tocá Compartir para elegir la aplicación.';
          return;
        }
        await ctx.share([{name:prepared.name,blob:prepared.blob}],chart.title);
      }catch(error){
        if(error.name!=='AbortError')status.textContent=error.message;
      }
    };

    setStyle({...defaultStyle,...chart.exportStyle});
    refreshStyles();
    dialog.addEventListener('close',()=>{
      clearTimeout(timer);
      ++sequence;
      observer?.disconnect();
      if(previewUrl)URL.revokeObjectURL(previewUrl);
    },{once:true});
    dialog.showModal();
    selectionChanged();
  }
  function styles(){if(document.getElementById('salmosSizeChartsV2Style'))return;const style=document.createElement('style');style.id='salmosSizeChartsV2Style';style.textContent=`.size-chart-body{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:10px;align-items:center;padding:12px 8px;background:rgba(255,253,248,.86);border-radius:12px}.size-chart-body>.size-chart-garments{width:100%;height:220px!important;min-height:0!important;display:block}.size-chart-body>.size-chart-garments img{width:100%;height:100%;object-fit:contain}.size-chart-body table{width:100%;margin:0!important}.size-chart-body table th,.size-chart-body table td{font-size:12px;padding:8px 4px}.size-chart-body+small{margin-top:10px;display:block}.size-chart-garments>img{width:100%;height:100%;object-fit:contain}.size-chart-sheet{background:#fffdf8!important;color:#211b17!important}.size-chart-sheet table,.size-chart-sheet small{color:#211b17!important}.size-chart-garments{min-height:150px!important}.size-chart-garments>img{max-height:220px}body .size-chart-brand>.size-chart-brand-lockup{width:100%!important;height:100%!important;max-width:100%!important;object-fit:contain}body .size-chart-sheet>.size-chart-garments{width:100%!important;max-width:none!important;height:100%!important}`;style.textContent+='.size-chart-sheet>.size-chart-garments{height:190px!important;min-height:150px!important}.size-chart-garments>img{max-height:190px}';style.textContent+=`body .size-chart-card .size-chart-sheet[data-chart-preview]{display:block!important;aspect-ratio:1!important;min-height:0!important;height:auto!important;padding:0!important;border:0!important;outline:0!important;overflow:hidden!important;border-radius:10px!important;background:#fffdf8!important;line-height:0!important}body .size-chart-card .size-chart-sheet[data-chart-preview]>img{display:block!important;width:100%!important;height:auto!important;aspect-ratio:1!important;max-height:none!important;object-fit:contain!important;margin:0!important;padding:0!important}body .size-chart-loading{display:flex;align-items:center;justify-content:center;aspect-ratio:1;line-height:1.4;color:#533447;font-size:12px}.size-chart-card .size-chart-actions{margin-top:10px!important}`;style.textContent+=`body .size-chart-card .size-chart-sheet[data-chart-preview][data-failed]{line-height:1.4!important;display:flex!important;align-items:center;justify-content:center}.chart-garment-picker{width:min(1000px,92vw);max-height:88vh;border-radius:16px;background:#fff0f7;padding:16px}.chart-garment-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;max-height:65vh;overflow:auto}.chart-garment-grid button{padding:5px;border-radius:12px;border:1px solid #b86690;background:#fff8fc}.chart-garment-grid img{display:block;width:100%;height:170px;object-fit:contain}.chart-garment-picker>button{margin-top:10px}`;document.head.append(style);}
  let bound=false;
  function init(context){ctx=context;styles();setTimeout(hydrateGarments,0);if(!bound){bound=true;document.addEventListener('click',event=>{const button=event.target.closest('[data-size-chart-edit],[data-size-chart-export],[data-size-chart-share],[data-size-chart-new]');if(!button)return;event.preventDefault();if(button.hasAttribute('data-size-chart-new'))edit();if(button.dataset.sizeChartEdit)edit(button.dataset.sizeChartEdit);if(button.dataset.sizeChartExport)exportDialog(button.dataset.sizeChartExport);if(button.dataset.sizeChartShare)exportDialog(button.dataset.sizeChartShare,true);});}return {all,reference,gallery,edit,renderImage,save};}
  new MutationObserver(()=>hydrateGarments()).observe(document.body,{childList:true,subtree:true});window.SalmosSizeCharts={init,setSources(value){sources=value;garmentPhotos.clear();document.querySelectorAll('[data-chart-preview]').forEach(el=>delete el.dataset.loaded);hydrateGarments();}};
})();
