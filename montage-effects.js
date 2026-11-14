// SALMOS 25.64 · Efectos no destructivos compartidos por vista, fotos y descarga.
(() => {
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0)),cache=new WeakMap(),warpedCache=new WeakMap(),meshCache=new WeakMap(),artworkCache=new WeakMap();
  function point(u,v,e={}){
    const curve=clamp(e.curve,-100,100)/100,fold=clamp(e.fold,0,100)/100,phase=(Number(e.phase)||0)*Math.PI/180;
    let x=u,y=v;
    if(curve){const a=Math.abs(curve)*1.5;x=.5+Math.sin((u-.5)*a)/(2*Math.sin(a/2));y+=curve*.16*(1-Math.pow(2*u-1,2));}
    x+=fold*.035*Math.sin(v*Math.PI*6+phase)*Math.sin(u*Math.PI);y+=fold*.055*Math.sin(u*Math.PI*6+phase)*Math.sin(v*Math.PI);
    const grid=e.grid;if(Array.isArray(grid)&&grid.length===9){const gx=Math.min(1,Math.floor(u*2)),gy=Math.min(1,Math.floor(v*2)),tx=u*2-gx,ty=v*2-gy;for(const [i,j,weight] of [[0,0,(1-tx)*(1-ty)],[1,0,tx*(1-ty)],[0,1,(1-tx)*ty],[1,1,tx*ty]]){const offset=grid[(gy+j)*3+gx+i];x+=clamp(offset?.x,-.35,.35)*weight;y+=clamp(offset?.y,-.35,.35)*weight;}}
    return {x,y};
  }
  function mesh(e={},steps=24){const signature=JSON.stringify([steps,e.curve,e.fold,e.phase,e.grid]),prior=meshCache.get(e);if(prior?.signature===signature)return prior.triangles;const nodes=[];for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){const u=i/steps,v=j/steps;nodes.push({u,v,...point(u,v,e)});}const triangles=[];for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){const a=nodes[j*(steps+1)+i],b=nodes[j*(steps+1)+i+1],c=nodes[(j+1)*(steps+1)+i],d=nodes[(j+1)*(steps+1)+i+1];triangles.push([a,b,d],[a,d,c]);}meshCache.set(e,{signature,triangles});return triangles;}
  function inverse(x,y,e={}){if(!e.curve&&!e.fold&&!e.grid?.some(p=>p?.x||p?.y))return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;for(const [a,b,c] of mesh(e)){const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<1e-9)continue;const wa=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/det,wb=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/det,wc=1-wa-wb;if(Math.min(wa,wb,wc)>=-1e-5)return{x:a.u*wa+b.u*wb+c.u*wc,y:a.v*wa+b.v*wb+c.v*wc};}return null;}
  function newCanvas(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
  function extendMask(mask,stroke,from,frame){
    const paint=mask.getContext('2d'),points=stroke.points||[];
    if(!points.length)return;
    const {x,y,w,h}=frame,clip=stroke.clip;
    paint.save();
    if(clip){
      paint.beginPath();
      paint.rect(x+clip.x*w,y+clip.y*h,clip.w*w,clip.h*h);
      paint.clip();
    }
    paint.lineWidth=(Number(stroke.radius)||.025)*Math.min(w,h)*2;
    paint.lineCap='round';
    paint.lineJoin='round';
    paint.strokeStyle=paint.fillStyle='#000';
    paint.beginPath();
    for(let i=Math.max(0,from-1);i<points.length;i++){
      const p=points[i],px=x+p.x*w,py=y+p.y*h;
      if(i===Math.max(0,from-1)||p.start)paint.moveTo(px,py);
      else paint.lineTo(px,py);
    }
    paint.stroke();
    paint.beginPath();
    for(let i=from;i<points.length;i++){
      const p=points[i];
      if(i&&!p.start)continue;
      const px=x+p.x*w,py=y+p.y*h,radius=paint.lineWidth/2;
      paint.moveTo(px+radius,py);
      paint.arc(px,py,radius,0,Math.PI*2);
    }
    paint.fill();
    paint.restore();
  }
  function eraseMask(canvas,mask,stroke){
    const ctx=canvas.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation='destination-out';
    ctx.globalAlpha=clamp(stroke.strength??1,0,1);
    ctx.drawImage(mask,0,0);
    ctx.restore();
  }
  function source(image,strokes,w,h,frame){
    if(!strokes?.length)return image;
    const scale=Math.min(1,Math.max(w,h)/(Math.max(image.width,image.height)||1),
      4096/Math.max(image.width,image.height),Math.sqrt(8000000/(image.width*image.height)));
    const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
    const region=frame?{x:frame.x*width,y:frame.y*height,w:frame.w*width,h:frame.h*height}:{x:0,y:0,w:width,h:height};
    const size=width+'x'+height;
    let masks=cache.get(image);
    if(!masks){masks=new WeakMap();cache.set(image,masks);}
    let sizes=masks.get(strokes);
    if(!sizes){sizes=new Map();masks.set(strokes,sizes);}
    let entry=sizes.get(size),completed=strokes.length-1;
    if(!entry||entry.completed>completed||entry.refs.some((stroke,i)=>stroke!==strokes[i])){
      const base=newCanvas(width,height);
      base.getContext('2d').drawImage(image,0,0,width,height);
      entry={completed:0,refs:[],base,mask:newCanvas(width,height),result:newCanvas(width,height),active:null,drawn:0};
      sizes.set(size,entry);
      if(sizes.size>2)sizes.delete(sizes.keys().next().value);
    }
    const mask=entry.mask,maskCtx=mask.getContext('2d');
    for(let i=entry.completed;i<completed;i++){
      maskCtx.clearRect(0,0,width,height);
      extendMask(mask,strokes[i],0,region);
      eraseMask(entry.base,mask,strokes[i]);
      entry.refs[i]=strokes[i];entry.active=null;entry.drawn=0;
    }
    entry.completed=completed;
    const stroke=strokes.at(-1),count=stroke.points?.length||0;
    if(entry.active!==stroke||entry.drawn>count){
      maskCtx.clearRect(0,0,width,height);entry.active=stroke;entry.drawn=0;
    }
    if(entry.drawn<count){extendMask(mask,stroke,entry.drawn,region);entry.drawn=count;}
    const ctx=entry.result.getContext('2d');ctx.clearRect(0,0,width,height);
    ctx.drawImage(entry.base,0,0);eraseMask(entry.result,mask,stroke);
    return entry.result;
  }
  function artwork(image,edit={}){
    const crop=edit.crop||{x:0,y:0,w:1,h:1},signature=JSON.stringify(edit);let cached=artworkCache.get(image);if(!cached){cached=new Map();artworkCache.set(image,cached);}if(cached.has(signature))return cached.get(signature);
    const x=clamp(crop.x,0,.999),y=clamp(crop.y,0,.999),w=clamp(crop.w??1,.001,1-x),h=clamp(crop.h??1,.001,1-y),canvas=newCanvas(Math.max(1,Math.round(w*image.width)),Math.max(1,Math.round(h*image.height))),ctx=canvas.getContext('2d');
    ctx.drawImage(image,x*image.width,y*image.height,w*image.width,h*image.height,0,0,canvas.width,canvas.height);
    if(edit.ink){ctx.save();ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=clamp(edit.inkOpacity??50,0,100)/100;ctx.fillStyle=edit.ink;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.restore();}
    if((edit.brightness??100)!==100||(edit.saturation??100)!==100){const temp=newCanvas(canvas.width,canvas.height);temp.getContext('2d').drawImage(canvas,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.filter='brightness('+clamp(edit.brightness??100,0,200)/100+') saturate('+clamp(edit.saturation??100,0,200)/100+')';ctx.drawImage(temp,0,0);ctx.restore();}
    if(edit.background){ctx.save();ctx.globalCompositeOperation='destination-over';ctx.fillStyle=edit.background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.restore();}
    cached.set(signature,canvas);if(cached.size>2)cached.delete(cached.keys().next().value);return canvas;
  }
  function triangle(ctx,image,t,w,h){const [a,b,c]=t,sx=a.u*image.width,sy=a.v*image.height,ux=(b.u-a.u)*image.width,uy=(b.v-a.v)*image.height,vx=(c.u-a.u)*image.width,vy=(c.v-a.v)*image.height,det=ux*vy-uy*vx;if(Math.abs(det)<1e-9)return;
    const ax=(a.x-.5)*w,ay=(a.y-.5)*h,bx=(b.x-.5)*w,by=(b.y-.5)*h,cx=(c.x-.5)*w,cy=(c.y-.5)*h,m11=((bx-ax)*vy-(cx-ax)*uy)/det,m12=((by-ay)*vy-(cy-ay)*uy)/det,m21=((cx-ax)*ux-(bx-ax)*vx)/det,m22=((cy-ay)*ux-(by-ay)*vx)/det;
    if(Math.abs(m11*m22-m12*m21)<1e-12)return;ctx.save();ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.lineTo(cx,cy);ctx.closePath();ctx.clip();ctx.transform(m11,m12,m21,m22,ax-m11*sx-m21*sy,ay-m12*sx-m22*sy);ctx.drawImage(image,0,0);ctx.restore();
  }
  function outputGeometry(width,height,imageRatio,crop={x:0,y:0,w:1,h:1}){
    const fullWidth=Math.min(width/crop.w,height/crop.h*imageRatio),fullHeight=fullWidth/imageRatio;
    return {fullWidth,fullHeight,width:fullWidth*crop.w,height:fullHeight*crop.h,crop};
  }
  function draw(ctx,image,width,height,e={}){
    const {fullWidth:w,fullHeight:h,width:visibleW,height:visibleH,crop}=outputGeometry(width,height,image.width/image.height,e.outputCrop);
    ctx.save();
    if(e.outputCrop){
      ctx.beginPath();ctx.rect(-visibleW/2,-visibleH/2,visibleW,visibleH);ctx.clip();
      ctx.translate((.5-crop.x-crop.w/2)*w,(.5-crop.y-crop.h/2)*h);
    }
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.globalAlpha=clamp(e.opacity??100,0,100)/100;
    const input=source(image,e.strokes,w,h);
    if(!e.curve&&!e.fold&&!e.grid?.some(p=>p?.x||p?.y)){
      ctx.drawImage(source(input,e.outputStrokes,w,h),-w/2,-h/2,w,h);
    }else{
      const rasterScale=Math.min(1,8192/(1.8*Math.max(w,h)),Math.sqrt(12000000/(3.24*w*h)));
      const rw=Math.max(1,Math.floor(w*rasterScale)),rh=Math.max(1,Math.floor(h*rasterScale));
      const signature=JSON.stringify([rw,rh,e.curve,e.fold,e.phase,e.grid,e.strokes?.length,e.strokes?.at(-1)?.points?.length]);
      let entries=warpedCache.get(image);
      if(!entries){entries=new WeakMap();warpedCache.set(image,entries);}
      let entry=entries.get(e);
      if(entry?.signature!==signature||entry.strokes!==e.strokes||entry.lastStroke!==e.strokes?.at(-1)){
        const canvas=newCanvas(Math.ceil(rw*1.8),Math.ceil(rh*1.8)),paint=canvas.getContext('2d');
        paint.imageSmoothingEnabled=true;paint.imageSmoothingQuality='high';paint.translate(canvas.width/2,canvas.height/2);
        paint.globalCompositeOperation='lighter';
        for(const t of mesh(e))triangle(paint,input,t,rw,rh);
        entry={signature,canvas,rw,rh,strokes:e.strokes,lastStroke:e.strokes?.at(-1)};entries.set(e,entry);
      }
      const {canvas,rw:renderWidth,rh:renderHeight}=entry;
      const region={x:(1-renderWidth/canvas.width)/2,y:(1-renderHeight/canvas.height)/2,w:renderWidth/canvas.width,h:renderHeight/canvas.height};
      const rendered=source(canvas,e.outputStrokes,canvas.width,canvas.height,region);
      const targetW=canvas.width*w/renderWidth,targetH=canvas.height*h/renderHeight;
      ctx.drawImage(rendered,-targetW/2,-targetH/2,targetW,targetH);
    }
    ctx.restore();
  }
  /** @type {Window & {SalmosMontage?: {draw: typeof draw, point: typeof point, inverse: typeof inverse, mesh: typeof mesh, artwork: typeof artwork, outputGeometry: typeof outputGeometry}}} */
  const appWindow=window;appWindow.SalmosMontage={draw,point,inverse,mesh,artwork,outputGeometry};
})();
