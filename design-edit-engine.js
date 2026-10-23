// SALMOS · Edición no destructiva y comparativa del archivo de diseño.
(() => {
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0)),copy=value=>JSON.parse(JSON.stringify(value)),pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  const check=signal=>{if(signal?.aborted)throw new DOMException('Proceso cancelado','AbortError');};
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;};
  const rgb=value=>/^#[a-f\d]{6}$/i.test(value||'')?[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)):null;
  function viewDefaults(mode,appearance={}){return {mode,crop:null,clips:[],texts:[],regions:[],effects:[],selections:[],strokes:[],surface:{curve:0,fold:0,phase:0,grid:Array.from({length:9},()=>({x:0,y:0}))},brightness:Number(appearance.preview_brightness??100),saturation:Number(appearance.preview_saturation??100),opacity:100,background:appearance.preview_background||'',exportBackground:false,dots:{colorMode:'original',ink:'#000000',palette:'classic',screen:'am',shape:'circle',spacingMm:.6,sizeMm:.45,minMm:.2,maxMm:.5,density:85,contrast:100,gamma:1,tone:'opacity',angle:45,shapeAngle:0,grid:'square',aspect:1,jitter:100,points:3,invert:false,lower:0,upper:100,channel:'luminance'}};}
  function project(asset,image){const first=(asset.measure_options||[])[0],width=Number(asset.width_cm)||Number(first?.widthCm)||(image.naturalWidth||image.width)*2.54/300,height=width*(image.naturalHeight||image.height)/(image.naturalWidth||image.width);return {version:1,widthCm:width,heightCm:height,active:'original',order:['original','halftone','pointillism'],views:Object.fromEntries(['original','halftone','pointillism'].map(mode=>[mode,viewDefaults(mode,asset)]))};}
  function validateProject(value){
    if(!value||value.version!==1||!value.views||!Number.isFinite(Number(value.widthCm))||!Number.isFinite(Number(value.heightCm))||value.widthCm<=0||value.heightCm<=0)throw new Error('La edición guardada está incompleta.');
    for(const mode of ['original','halftone','pointillism']){
      if(!value.views[mode])throw new Error('Falta una de las vistas de la edición.');
      const original=value.views[mode],defaults=viewDefaults(mode),view=value.views[mode]={...defaults,...original,dots:{...defaults.dots,...original.dots},surface:{...defaults.surface,...original.surface,grid:Array.from({length:9},(_,i)=>({x:clamp(original.surface?.grid?.[i]?.x,-.35,.35),y:clamp(original.surface?.grid?.[i]?.y,-.35,.35)}))}};
      for(const key of ['regions','effects','selections','strokes','texts','clips'])view[key]=Array.isArray(original[key])?original[key]:[];
      // Older editions stored a mask on each rule. Give equal contours one identity.
      view.selections=view.selections.map((shape,i)=>({...shape,id:shape.id||'selection-'+(i+1)}));
      const shapes=new Map(view.selections.map(shape=>[JSON.stringify([shape.kind,shape.points]),shape])),byId=new Map(view.selections.map(shape=>[shape.id,shape]));
      const identify=shape=>{if(!shape?.points?.length)return null;const key=JSON.stringify([shape.kind,shape.points]);let known=shape.id?byId.get(shape.id):shapes.get(key);if(!known){known={...copy(shape),id:shape.id||'selection-'+(byId.size+1)};shapes.set(key,known);byId.set(known.id,known);view.selections.push(known);}return copy(known);};
      if(view.selection)view.selection=identify(view.selection);
      for(const rule of [...view.regions,...view.effects])if(rule.selection){rule.selection=identify(rule.selection);rule.selectionId=rule.selection.id;}
      if(view.effectDraft?.selection)view.effectDraft.selection=identify(view.effectDraft.selection);
    }
    return copy(value);
  }
  function selectionMask(selection,w,h){const c=canvas(w,h),ctx=c.getContext('2d');ctx.fillStyle='#fff';if(!selection){ctx.fillRect(0,0,w,h);return c;}const points=selection.points||[],a=points[0],b=points.at(-1);if(!a||!b)return c;ctx.beginPath();if(selection.kind==='rect')ctx.rect(Math.min(a.x,b.x)*w,Math.min(a.y,b.y)*h,Math.abs(a.x-b.x)*w,Math.abs(a.y-b.y)*h);else if(selection.kind==='ellipse')ctx.ellipse((a.x+b.x)*w/2,(a.y+b.y)*h/2,Math.abs(a.x-b.x)*w/2,Math.abs(a.y-b.y)*h/2,0,0,Math.PI*2);else{ctx.moveTo(a.x*w,a.y*h);for(const point of points.slice(1))ctx.lineTo(point.x*w,point.y*h);ctx.closePath();}ctx.fill();return c;}
  function composeCrop(previous,rect){const p=previous||{x:0,y:0,w:1,h:1};return {x:p.x+rect.x*p.w,y:p.y+rect.y*p.h,w:p.w*rect.w,h:p.h*rect.h};}
  function rebaseSelection(selection,crop){if(!selection)return null;return {...selection,points:selection.points.map(p=>({x:(p.x-crop.x)/crop.w,y:(p.y-crop.y)/crop.h}))};}
  async function colorRulesAfter(canvas,rules,control){
    const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,w,h),pixels=data.data,original=new Uint8ClampedArray(pixels);
    for(let n=0;n<rules.length;n++){const rule=rules[n];if(rule.enabled===false)continue;const mask=selectionMask(rule.selection,w,h),coverage=mask.getContext('2d').getImageData(0,0,w,h).data,from=rgb(rule.source),to=rgb(rule.color),tolerance=clamp(rule.tolerance??12,0,100)*4.41673,soft=clamp(rule.softness??0,0,100)/100,intensity=clamp(rule.opacity??100,0,100)/100;
      for(let y=0;y<h;y++){check(control.signal);for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!pixels[i+3]||!coverage[i+3])continue;const currentDistance=from?Math.hypot(pixels[i]-from[0],pixels[i+1]-from[1],pixels[i+2]-from[2]):0,originalDistance=from?Math.hypot(original[i]-from[0],original[i+1]-from[1],original[i+2]-from[2]):0,distance=Math.min(currentDistance,originalDistance),shade=originalDistance<=currentDistance?original:pixels;if(from&&distance>tolerance)continue;let amount=coverage[i+3]/255*intensity;if(soft&&tolerance)amount*=Math.min(1,(1-distance/tolerance)/Math.max(.01,soft));if(rule.action==='transparent')pixels[i+3]*=1-amount;else if(to){const light=rule.keepShading&&from&&(.2126*from[0]+.7152*from[1]+.0722*from[2])>1?clamp((.2126*shade[i]+.7152*shade[i+1]+.0722*shade[i+2])/Math.max(1,.2126*from[0]+.7152*from[1]+.0722*from[2]),0,2):1;for(let c=0;c<3;c++)pixels[i+c]=pixels[i+c]*(1-amount)+clamp(to[c]*light,0,255)*amount;}}if(y%48===0){control.progress?.(.8+.19*(n+y/h)/Math.max(1,rules.length));await pause();}}mask.width=1;mask.height=1;}
    ctx.putImageData(data,0,0);return canvas;
  }
  async function applyTechniques(prepared,rawSource,rules,widthCm,heightCm,control){
    const w=prepared.width,h=prepared.height,result=canvas(w,h),ctx=result.getContext('2d',{willReadFrequently:true});ctx.drawImage(prepared,0,0);
    const source=prepared.getContext('2d').getImageData(0,0,w,h).data,raw=rawSource||source,output=ctx.getImageData(0,0,w,h),pixels=output.data,active=rules.filter(rule=>rule.enabled!==false);
    for(let n=0;n<active.length;n++){
      check(control.signal);const rule=active[n],d=rule.dots||{},px=300/25.4;
      const points=await window.SalmosDotEffects.render(prepared,{...d,mode:rule.mode,colorMode:rule.colorMode==='pigments'?'pigments':'original',color:'',cell:Number(d.spacingMm)*px,dotSize:Number(d.sizeMm)*px,minSize:Number(d.minMm)*px,maxSize:Number(d.maxMm)*px,widthCm,heightCm,brightness:100,saturation:100,inkOpacity:0},{...control,progress:v=>control.progress?.(.4+.4*(n+v)/Math.max(1,active.length))});
      const dots=points.getContext('2d').getImageData(0,0,w,h).data,mask=selectionMask(rule.selection,w,h),coverage=mask.getContext('2d').getImageData(0,0,w,h).data,from=rgb(rule.source),replacement=rule.colorMode==='replace'?rgb(rule.color):null,tolerance=clamp(rule.tolerance??12,0,100)*4.41673,soft=clamp(rule.softness??0,0,100)/100;
      for(let y=0;y<h;y++){check(control.signal);for(let x=0;x<w;x++){
        const i=(y*w+x)*4;if(!coverage[i+3])continue;
        const distance=from?Math.min(Math.hypot(raw[i]-from[0],raw[i+1]-from[1],raw[i+2]-from[2]),Math.hypot(source[i]-from[0],source[i+1]-from[1],source[i+2]-from[2])):0;
        if(from&&distance>tolerance)continue;let amount=coverage[i+3]/255;if(from&&soft&&tolerance)amount*=Math.min(1,(1-distance/tolerance)/Math.max(.01,soft));if(amount<=0)continue;
        // Interpolate premultiplied pixels: holes in a local dot screen stay transparent.
        if(replacement)for(let c=0;c<3;c++)dots[i+c]=replacement[c];const a=pixels[i+3]/255,b=dots[i+3]/255,alpha=a*(1-amount)+b*amount;
        for(let c=0;c<3;c++)pixels[i+c]=alpha?(pixels[i+c]*a*(1-amount)+dots[i+c]*b*amount)/alpha:0;
        pixels[i+3]=alpha*255;
      }if(y%64===0)await pause();}
      points.width=1;points.height=1;mask.width=1;mask.height=1;
    }
    ctx.putImageData(output,0,0);return result;
  }
  async function render(image,project,mode,control={}){
    check(control.signal);const cfg=project.views[mode],crop=cfg.crop||{x:0,y:0,w:1,h:1},widthCm=Number(cfg.printWidthCm)||project.widthCm*crop.w,heightCm=Number(cfg.printHeightCm)||project.heightCm*crop.h,target=window.SalmosDotEffects.printDimensions(image,{widthCm,heightCm}),scale=Math.min(1,(Number(control.maxSide)||Math.max(target.width,target.height))/Math.max(target.width,target.height)),w=Math.max(1,Math.round(target.width*scale)),h=Math.max(1,Math.round(target.height*scale));
    let artwork=image;const textBoxes=[];
    if(cfg.texts?.length){const rawWidth=w/crop.w,rawHeight=h/crop.h,factor=Math.min(1,16384/Math.max(rawWidth,rawHeight),Math.sqrt(64000000/(rawWidth*rawHeight))),layer=canvas(rawWidth*factor,rawHeight*factor),tx=layer.getContext('2d');tx.drawImage(image,0,0,layer.width,layer.height);
      for(const item of cfg.texts){if(item.hidden||!String(item.text||'').trim())continue;const bitmap=control.textImages?.[item.id];if(!bitmap)throw new Error('No se pudo preparar una capa de texto. Reintentá.');const width=Math.max(.002,Number(item.width)||.4)*layer.width,height=width*bitmap.height/bitmap.width,x=Number(item.x??.5)*layer.width,y=Number(item.y??.5)*layer.height;tx.save();tx.translate(x,y);tx.rotate(Number(item.angle||0)*Math.PI/180);tx.globalAlpha=clamp(item.opacity??100,0,100)/100;tx.drawImage(bitmap,-width/2,-height/2,width,height);tx.restore();textBoxes.push({id:item.id,x:(Number(item.x??.5)-crop.x)/crop.w,y:(Number(item.y??.5)-crop.y)/crop.h,w:Number(item.width||.4)/crop.w,h:height/layer.height/crop.h,angle:Number(item.angle)||0});}artwork=layer;
    }
    const base=canvas(w,h),ctx=base.getContext('2d',{willReadFrequently:true}),iw=artwork.naturalWidth||artwork.width,ih=artwork.naturalHeight||artwork.height;ctx.imageSmoothingEnabled=iw*crop.w!==w||ih*crop.h!==h;ctx.imageSmoothingQuality='high';
    if(cfg.surface&&(cfg.surface.fold||cfg.surface.curve||cfg.surface.grid?.some(p=>p.x||p.y))){const fullWidth=w/crop.w,fullHeight=h/crop.h,factor=Math.min(1,8192/Math.max(fullWidth,fullHeight),Math.sqrt(12000000/(fullWidth*fullHeight))),warped=canvas(fullWidth*factor,fullHeight*factor),warp=warped.getContext('2d');warp.translate(warped.width/2,warped.height/2);window.SalmosMontage.draw(warp,artwork,warped.width,warped.height,{...cfg.surface,opacity:100,strokes:[]});ctx.drawImage(warped,crop.x*warped.width,crop.y*warped.height,crop.w*warped.width,crop.h*warped.height,0,0,w,h);}else ctx.drawImage(artwork,crop.x*iw,crop.y*ih,crop.w*iw,crop.h*ih,0,0,w,h);
    for(const clip of cfg.clips||[]){ctx.save();ctx.globalCompositeOperation='destination-in';ctx.drawImage(selectionMask(clip,w,h),0,0);ctx.restore();}control.progress?.(.04);await pause();check(control.signal);let prepared=base;
    const sample=control.exporting?null:canvas(w,h);if(sample)sample.getContext('2d').drawImage(prepared,0,0);const paint=prepared.getContext('2d',{willReadFrequently:true}),data=paint.getImageData(0,0,w,h),pixels=data.data,raw=cfg.regions?.length||cfg.effects?.length?new Uint8ClampedArray(pixels):pixels;
    for(let index=0;index<(cfg.regions||[]).length;index++){const rule=cfg.regions[index];if(rule.enabled===false||rule.stage==='after')continue;const mask=selectionMask(rule.selection,w,h),coverage=mask.getContext('2d').getImageData(0,0,w,h).data,from=rgb(rule.source),to=rgb(rule.color),tolerance=clamp(rule.tolerance??12,0,100)*4.41673,soft=clamp(rule.softness??0,0,100)/100,opacity=clamp(rule.opacity??100,0,100)/100;
      for(let y=0;y<h;y++){check(control.signal);for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!raw[i+3]||!coverage[i+3])continue;const distance=from?Math.hypot(raw[i]-from[0],raw[i+1]-from[1],raw[i+2]-from[2]):0;if(from&&distance>tolerance)continue;let amount=coverage[i+3]/255*opacity;if(soft&&tolerance)amount*=Math.min(1,(1-distance/tolerance)/Math.max(.01,soft));if(rule.action==='transparent')pixels[i+3]*=1-amount;else if(to){const luminance=rule.keepShading&&from&&(.2126*from[0]+.7152*from[1]+.0722*from[2])>1?clamp((.2126*raw[i]+.7152*raw[i+1]+.0722*raw[i+2])/Math.max(1,.2126*from[0]+.7152*from[1]+.0722*from[2]),0,2):1;for(let c=0;c<3;c++)pixels[i+c]=pixels[i+c]*(1-amount)+clamp(to[c]*luminance,0,255)*amount;}}if(y%48===0)await pause();}mask.width=1;mask.height=1;control.progress?.(.05+.28*(index+1)/Math.max(1,cfg.regions.length));}
    const brightness=clamp(cfg.brightness??100,0,400)/100,saturation=clamp(cfg.saturation??100,0,400)/100,opacity=clamp(cfg.opacity??100,0,100)/100;
    for(let y=0;y<h;y++){check(control.signal);for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!pixels[i+3])continue;const l=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];for(let c=0;c<3;c++)pixels[i+c]=clamp((l+(pixels[i+c]-l)*saturation)*brightness,0,255);pixels[i+3]*=opacity;}if(y%64===0)await pause();}paint.putImageData(data,0,0);control.progress?.(.4);
    if(cfg.strokes?.length){const erased=canvas(w,h),ex=erased.getContext('2d');ex.translate(w/2,h/2);window.SalmosMontage.draw(ex,prepared,w,h,{strokes:cfg.strokes,opacity:100});prepared=erased;}
    check(control.signal);let result=prepared;
    if(cfg.techniqueLayers||cfg.effects?.length)result=await applyTechniques(prepared,raw,cfg.effects||[],widthCm,heightCm,control);
    else if(mode!=='original'){const d=cfg.dots||{},px=300/25.4;result=await window.SalmosDotEffects.render(prepared,{...d,mode,colorMode:d.colorMode==='ink'?'ink':d.colorMode==='pigments'?'pigments':'original',color:d.colorMode==='ink'?d.ink:'',cell:Number(d.spacingMm)*px,dotSize:Number(d.sizeMm)*px,minSize:Number(d.minMm)*px,maxSize:Number(d.maxMm)*px,widthCm,heightCm,brightness:100,saturation:100,inkOpacity:0},{...control,progress:value=>control.progress?.(.4+.4*value)});}
    const post=(cfg.regions||[]).filter(rule=>rule.stage==='after');if(post.length)result=await colorRulesAfter(result,post,control);
    if(control.exporting&&cfg.exportBackground&&rgb(cfg.background)){const cx=result.getContext('2d');cx.save();cx.globalCompositeOperation='destination-over';cx.fillStyle=cfg.background;cx.fillRect(0,0,result.width,result.height);cx.restore();}
    control.progress?.(1);check(control.signal);return {canvas:result,sample,widthCm,heightCm,textBoxes};
  }
  window.SalmosDesignEngine={project,viewDefaults,validateProject,selectionMask,composeCrop,rebaseSelection,render,copy};
})();
