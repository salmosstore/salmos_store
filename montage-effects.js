// SALMOS 25.57 · Efectos no destructivos compartidos por vista, fotos y descarga.
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
  function extendMask(mask,stroke,from=0){
    const paint=mask.getContext('2d'),points=stroke.points||[],width=mask.width,height=mask.height;if(!points.length)return;
    paint.lineWidth=(Number(stroke.radius)||.025)*Math.min(width,height)*2;paint.lineCap='round';paint.lineJoin='round';paint.strokeStyle='#000';paint.fillStyle='#000';
    paint.beginPath();const start=points[Math.max(0,from-1)];paint.moveTo(start.x*width,start.y*height);for(let i=Math.max(1,from);i<points.length;i++)paint.lineTo(points[i].x*width,points[i].y*height);paint.stroke();
    if(from===0){paint.beginPath();paint.arc(start.x*width,start.y*height,paint.lineWidth/2,0,Math.PI*2);paint.fill();}
  }
  function eraseMask(canvas,mask,stroke){const ctx=canvas.getContext('2d');ctx.save();ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=clamp(stroke.strength??1,0,1);ctx.drawImage(mask,0,0);ctx.restore();}
  function source(image,e,w,h){
    if(!e.strokes?.length)return image;
    const scale=Math.min(1,Math.max(w,h)/(Math.max(image.width,image.height)||1)),width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale)),size=width+'x'+height;
    let effects=cache.get(image);if(!effects){effects=new WeakMap();cache.set(image,effects);}let sizes=effects.get(e);if(!sizes){sizes=new Map();effects.set(e,sizes);}let entry=sizes.get(size);
    const strokes=e.strokes,completed=strokes.length-1;
    if(!entry||entry.strokes!==strokes||entry.completed>completed||entry.refs.some((stroke,i)=>stroke!==strokes[i])){
      const base=newCanvas(width,height);base.getContext('2d').drawImage(image,0,0,width,height);entry={strokes,completed:0,refs:[],base,mask:newCanvas(width,height),result:newCanvas(width,height),active:null,drawn:0};sizes.set(size,entry);if(sizes.size>2)sizes.delete(sizes.keys().next().value);
    }
    const mask=entry.mask,maskCtx=mask.getContext('2d');
    for(let i=entry.completed;i<completed;i++){maskCtx.clearRect(0,0,width,height);extendMask(mask,strokes[i]);eraseMask(entry.base,mask,strokes[i]);entry.refs[i]=strokes[i];entry.active=null;entry.drawn=0;}
    entry.completed=completed;const stroke=strokes.at(-1),count=stroke.points?.length||0;
    if(entry.active!==stroke||entry.drawn>count){maskCtx.clearRect(0,0,width,height);entry.active=stroke;entry.drawn=0;}
    if(entry.drawn<count){extendMask(mask,stroke,entry.drawn);entry.drawn=count;}
    const ctx=entry.result.getContext('2d');ctx.clearRect(0,0,width,height);ctx.drawImage(entry.base,0,0);eraseMask(entry.result,mask,stroke);return entry.result;
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
  function draw(ctx,image,width,height,e={}){const fit=Math.min(width/image.width,height/image.height),w=image.width*fit,h=image.height*fit;ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.globalAlpha=clamp(e.opacity??100,0,100)/100;
    const input=source(image,e,w,h);if(!e.curve&&!e.fold&&!e.grid?.some(p=>p?.x||p?.y))ctx.drawImage(input,-w/2,-h/2,w,h);
    else{const rasterScale=Math.min(1,8192/(1.8*Math.max(w,h)),Math.sqrt(12000000/(3.24*w*h))),rw=Math.max(1,Math.floor(w*rasterScale)),rh=Math.max(1,Math.floor(h*rasterScale)),signature=JSON.stringify([rw,rh,e.curve,e.fold,e.phase,e.grid,e.strokes?.length,e.strokes?.at(-1)?.points?.length]);let entries=warpedCache.get(image);if(!entries){entries=new WeakMap();warpedCache.set(image,entries);}let entry=entries.get(e);if(entry?.signature!==signature||entry.effects!==e||entry.strokes!==e.strokes||entry.lastStroke!==e.strokes?.at(-1)){const canvas=document.createElement('canvas');canvas.width=Math.ceil(rw*1.8);canvas.height=Math.ceil(rh*1.8);const paint=canvas.getContext('2d');paint.imageSmoothingEnabled=true;paint.imageSmoothingQuality='high';paint.translate(canvas.width/2,canvas.height/2);paint.globalCompositeOperation='lighter';for(const t of mesh(e))triangle(paint,input,t,rw,rh);entry={signature,canvas,rw,rh,effects:e,strokes:e.strokes,lastStroke:e.strokes?.at(-1)};entries.set(e,entry);}ctx.drawImage(entry.canvas,-entry.canvas.width*w/entry.rw/2,-entry.canvas.height*h/entry.rh/2,entry.canvas.width*w/entry.rw,entry.canvas.height*h/entry.rh);}
    ctx.restore();}
  /** @type {Window & {SalmosMontage?: {draw: typeof draw, point: typeof point, inverse: typeof inverse, mesh: typeof mesh, artwork: typeof artwork}}} */
  const appWindow=window;appWindow.SalmosMontage={draw,point,inverse,mesh,artwork};
})();
