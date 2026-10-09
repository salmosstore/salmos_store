// SALMOS 25.26 · Efectos no destructivos compartidos por vista, fotos y descarga.
(() => {
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0)),cache=new WeakMap(),warpedCache=new WeakMap();
  function point(u,v,e={}){
    const curve=clamp(e.curve,-100,100)/100,fold=clamp(e.fold,0,100)/100,phase=(Number(e.phase)||0)*Math.PI/180;
    let x=u,y=v;
    if(curve){const a=Math.abs(curve)*1.5;x=.5+Math.sin((u-.5)*a)/(2*Math.sin(a/2));y+=(v-.5)*curve*.32*(1-Math.pow(2*u-1,2));}
    x+=fold*.035*Math.sin(v*Math.PI*6+phase)*Math.sin(u*Math.PI);y+=fold*.055*Math.sin(u*Math.PI*6+phase)*Math.sin(v*Math.PI);
    const grid=e.grid;if(Array.isArray(grid)&&grid.length===9){const gx=Math.min(1,Math.floor(u*2)),gy=Math.min(1,Math.floor(v*2)),tx=u*2-gx,ty=v*2-gy;for(const [i,j,weight] of [[0,0,(1-tx)*(1-ty)],[1,0,tx*(1-ty)],[0,1,(1-tx)*ty],[1,1,tx*ty]]){const offset=grid[(gy+j)*3+gx+i];x+=clamp(offset?.x,-.35,.35)*weight;y+=clamp(offset?.y,-.35,.35)*weight;}}
    return {x,y};
  }
  function mesh(e={},steps=24){const nodes=[];for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){const u=i/steps,v=j/steps;nodes.push({u,v,...point(u,v,e)});}const triangles=[];for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){const a=nodes[j*(steps+1)+i],b=nodes[j*(steps+1)+i+1],c=nodes[(j+1)*(steps+1)+i],d=nodes[(j+1)*(steps+1)+i+1];triangles.push([a,b,d],[a,d,c]);}return triangles;}
  function inverse(x,y,e={}){for(const [a,b,c] of mesh(e)){const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<1e-9)continue;const wa=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/det,wb=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/det,wc=1-wa-wb;if(Math.min(wa,wb,wc)>=-1e-5)return{x:a.u*wa+b.u*wb+c.u*wc,y:a.v*wa+b.v*wb+c.v*wc};}return null;}
  function source(image,e,w,h){if(!e.strokes?.length)return image;const size=Math.min(1,Math.max(w,h)/(Math.max(image.width,image.height)||1)),width=Math.max(1,Math.round(image.width*size)),height=Math.max(1,Math.round(image.height*size)),signature=JSON.stringify([width,height,e.strokes]);let entry=cache.get(image);if(entry?.signature===signature)return entry.canvas;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,width,height);ctx.globalCompositeOperation='destination-out';
    for(const stroke of e.strokes){ctx.globalAlpha=1;ctx.lineWidth=Math.max(1,Number(stroke.radius)||.025)*Math.min(width,height)*2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#000';ctx.fillStyle='#000';const points=stroke.points||[];if(!points.length)continue;
      // Each stroke is composited once: overlapping brush samples do not darken it.
      const mask=document.createElement('canvas');mask.width=width;mask.height=height;const paint=mask.getContext('2d');paint.lineWidth=(Number(stroke.radius)||.025)*Math.min(width,height)*2;paint.lineCap='round';paint.lineJoin='round';paint.strokeStyle='#000';paint.fillStyle='#000';paint.beginPath();paint.moveTo(points[0].x*width,points[0].y*height);for(const p of points.slice(1))paint.lineTo(p.x*width,p.y*height);paint.stroke();paint.beginPath();paint.arc(points[0].x*width,points[0].y*height,paint.lineWidth/2,0,Math.PI*2);paint.fill();const radius=paint.lineWidth/2,minX=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x*width))-radius-2)),minY=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y*height))-radius-2)),maxX=Math.min(width,Math.ceil(Math.max(...points.map(p=>p.x*width))+radius+2)),maxY=Math.min(height,Math.ceil(Math.max(...points.map(p=>p.y*height))+radius+2));if(maxX>minX&&maxY>minY){const pixels=paint.getImageData(minX,minY,maxX-minX,maxY-minY),strength=clamp(stroke.strength??1,0,1);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=Math.round(pixels.data[i]*strength);paint.putImageData(pixels,minX,minY);ctx.drawImage(mask,minX,minY,maxX-minX,maxY-minY,minX,minY,maxX-minX,maxY-minY);}

    }cache.set(image,{signature,canvas});return canvas;
  }
  function triangle(ctx,image,t,w,h){const [a,b,c]=t,sx=a.u*image.width,sy=a.v*image.height,ux=(b.u-a.u)*image.width,uy=(b.v-a.v)*image.height,vx=(c.u-a.u)*image.width,vy=(c.v-a.v)*image.height,det=ux*vy-uy*vx;if(Math.abs(det)<1e-9)return;
    const ax=(a.x-.5)*w,ay=(a.y-.5)*h,bx=(b.x-.5)*w,by=(b.y-.5)*h,cx=(c.x-.5)*w,cy=(c.y-.5)*h,m11=((bx-ax)*vy-(cx-ax)*uy)/det,m12=((by-ay)*vy-(cy-ay)*uy)/det,m21=((cx-ax)*ux-(bx-ax)*vx)/det,m22=((cy-ay)*ux-(by-ay)*vx)/det;
    if(Math.abs(m11*m22-m12*m21)<1e-12)return;ctx.save();ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.lineTo(cx,cy);ctx.closePath();ctx.clip();ctx.transform(m11,m12,m21,m22,ax-m11*sx-m21*sy,ay-m12*sx-m22*sy);ctx.drawImage(image,0,0);ctx.restore();
  }
  function draw(ctx,image,width,height,e={}){const fit=Math.min(width/image.width,height/image.height),w=image.width*fit,h=image.height*fit;ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.globalAlpha=clamp(e.opacity??100,0,100)/100;
    const input=source(image,e,w,h);if(!e.curve&&!e.fold&&!e.grid?.some(p=>p?.x||p?.y))ctx.drawImage(input,-w/2,-h/2,w,h);
    else{const rw=Math.max(1,Math.ceil(w)),rh=Math.max(1,Math.ceil(h)),signature=JSON.stringify([rw,rh,e.curve,e.fold,e.phase,e.grid,e.strokes]);let entry=warpedCache.get(image);if(entry?.signature!==signature){const canvas=document.createElement('canvas');canvas.width=Math.ceil(rw*1.8);canvas.height=Math.ceil(rh*1.8);const paint=canvas.getContext('2d');paint.imageSmoothingEnabled=true;paint.imageSmoothingQuality='high';paint.translate(canvas.width/2,canvas.height/2);paint.globalCompositeOperation='lighter';for(const t of mesh(e))triangle(paint,input,t,rw,rh);entry={signature,canvas,rw,rh};warpedCache.set(image,entry);}ctx.drawImage(entry.canvas,-entry.canvas.width*w/entry.rw/2,-entry.canvas.height*h/entry.rh/2,entry.canvas.width*w/entry.rw,entry.canvas.height*h/entry.rh);}
    ctx.restore();}
  /** @type {Window & {SalmosMontage?: {draw: typeof draw, point: typeof point, inverse: typeof inverse, mesh: typeof mesh}}} */
  const appWindow=window;appWindow.SalmosMontage={draw,point,inverse,mesh};
})();
