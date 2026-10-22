// SALMOS · Semitono y puntillismo sobre el archivo, conservando la transparencia.
(() => {
  'use strict';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const abort=signal=>{if(signal?.aborted)throw new DOMException('Proceso cancelado','AbortError');};
  async function render(image,options={},control={}){
    const originalWidth=image.naturalWidth||image.width,originalHeight=image.naturalHeight||image.height,maxSide=Number(control.maxSide)||Math.max(originalWidth,originalHeight),scale=Math.min(1,maxSide/Math.max(originalWidth,originalHeight)),width=Math.max(1,Math.round(originalWidth*scale)),height=Math.max(1,Math.round(originalHeight*scale));
    if(width*height>64000000||Math.max(width,height)>16384)throw new Error('La imagen supera la resolución que permite este dispositivo.');
    const source=document.createElement('canvas');source.width=width;source.height=height;const sourceContext=source.getContext('2d',{willReadFrequently:true});sourceContext.drawImage(image,0,0,width,height);const imageData=sourceContext.getImageData(0,0,width,height),pixels=imageData.data;
    const result=document.createElement('canvas');result.width=width;result.height=height;const ctx=result.getContext('2d'),cell=Math.max(1.25,clamp(Number(options.cell)||12,2,80)*scale),contrast=clamp(Number(options.contrast)||100,20,250)/100,brightness=clamp(Number(options.brightness??100),0,200)/100,saturation=clamp(Number(options.saturation??100),0,200)/100,inkOpacity=clamp(Number(options.inkOpacity??100),0,100)/100,parse=value=>/^#[a-f0-9]{6}$/i.test(value||'')?[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)):null,ink=parse(options.ink),fixed=parse(options.color),mode=options.mode==='pointillism'?'pointillism':'halftone';
    const sample=(x,y)=>{let r=0,g=0,b=0,a=0,n=0;for(const dy of [-.22,0,.22])for(const dx of [-.22,0,.22]){const px=Math.round(x+dx*cell),py=Math.round(y+dy*cell);if(px<0||px>=width||py<0||py>=height)continue;const i=(py*width+px)*4,alpha=pixels[i+3]/255;r+=pixels[i]*alpha;g+=pixels[i+1]*alpha;b+=pixels[i+2]*alpha;a+=alpha;n++;}if(!a||!n)return null;r/=a;g/=a;b/=a;const luminance=.2126*r+.7152*g+.0722*b;let rgb=[r,g,b].map(c=>clamp((luminance+(c-luminance)*saturation)*brightness,0,255));if(ink&&inkOpacity)rgb=rgb.map((c,i)=>c*(1-inkOpacity)+ink[i]*inkOpacity);return {rgb,alpha:a/n,light:(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])/255};};
    let tone=options.tone||'auto';if(tone==='auto'){let light=0,total=0;for(let y=height*.05;y<height;y+=Math.max(1,height/75))for(let x=width*.05;x<width;x+=Math.max(1,width/75)){const value=sample(x,y);if(value){light+=value.light*value.alpha;total+=value.alpha;}}tone=total&&light/total>.6?'light':'dark';}
    const coverage=value=>value?clamp(value.alpha*Math.pow(tone==='opacity'?1:tone==='light'?value.light:1-value.light,contrast),0,1):0;
    const random=(x,y,seed=0)=>{let n=Math.imul((x|0)^seed,374761393)^Math.imul(y|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;};
    const draw=(x,y,r,value,pigment=null)=>{if(r<.12||!value)return;const rgb=pigment||fixed||ink||(tone==='light'?[255,255,255]:[0,0,0]);ctx.fillStyle=`rgb(${rgb.map(c=>Math.round(c)).join(',')})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
    abort(control.signal);
    if(mode==='halftone'){
      const angle=Math.PI/4,cos=Math.cos(angle),sin=Math.sin(angle),extent=Math.ceil(Math.hypot(width,height)/cell),cx=width/2,cy=height/2,radii=new Float32Array(257);
      // Invert circle/square intersection area, so 50% tone covers 50% of a cell
      // and solid ink can reach 100%, including where neighboring dots join.
      const area=r=>r<=.5?Math.PI*r*r:Math.PI*r*r-4*(r*r*Math.acos(.5/r)-.5*Math.sqrt(r*r-.25));
      for(let index=0;index<=256;index++){let low=0,high=Math.SQRT1_2;for(let step=0;step<18;step++){const middle=(low+high)/2;if(area(middle)<index/256)low=middle;else high=middle;}radii[index]=(low+high)/2;}
      for(let row=-extent;row<=extent;row++){abort(control.signal);for(let column=-extent;column<=extent;column++){const u=column*cell,v=row*cell,x=cx+u*cos-v*sin,y=cy+u*sin+v*cos;if(x<-cell||y<-cell||x>width+cell||y>height+cell)continue;const value=sample(x,y),amount=coverage(value);if(amount>.002){const radius=cell*radii[Math.round(amount*256)];if(radius<=cell*.5)draw(x,y,radius,value);else{ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.rect(-cell/2,-cell/2,cell,cell);ctx.clip();draw(0,0,radius,value);ctx.restore();}}}if(row%24===0){control.progress?.((row+extent)/(2*extent+1));await new Promise(resolve=>setTimeout(resolve,0));}}
    }else{
      // Each mark is one flat pigment. Nearby marks create the perceived mixture.
      const palettes={classic:['#ed2939','#ffd326','#1658d4','#16a05b','#9138bb','#ff7a1a','#fffdf7','#15151c'],warm:['#e62e32','#ff7e21','#ffd43a','#a64330','#d23a79','#fff8dd','#27181d'],cool:['#1e5cda','#189fae','#3157a9','#8742b4','#2d976d','#f3f8ff','#131c33']},palette=(palettes[options.palette]||palettes.classic).map(parse),linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4,colors=palette.map(rgb=>rgb.map(c=>linear(c/255))),mixtures=new Map();
      const mixture=value=>{const target=value.rgb.map(c=>linear(clamp((c/255-.5)*contrast+.5,0,1))),key=target.map(c=>Math.round(c*20)).join(',');if(mixtures.has(key))return mixtures.get(key);let best={a:0,b:0,t:0,error:Infinity};for(let a=0;a<colors.length;a++)for(let b=a;b<colors.length;b++){const delta=colors[b].map((c,i)=>c-colors[a][i]),length=delta.reduce((sum,c)=>sum+c*c,0),t=length?clamp(delta.reduce((sum,c,i)=>sum+(target[i]-colors[a][i])*c,0)/length,0,1):0,error=target.reduce((sum,c,i)=>sum+(c-(colors[a][i]+delta[i]*t))**2*[.8,1,.7][i],0);if(error<best.error)best={a,b,t,error};}mixtures.set(key,best);return best;};
      const rows=Math.ceil(height/cell),columns=Math.ceil(width/cell);for(let row=0;row<rows;row++){abort(control.signal);for(let column=0;column<columns;column++){for(let point=0;point<8;point++){const x=(column+random(column,row,point*4+1))*cell,y=(row+random(column,row,point*4+2))*cell,value=sample(x,y);if(!value||random(column,row,point*4+3)>value.alpha)continue;const mix=mixture(value),pigment=palette[random(column,row,point*4+4)<mix.t?mix.b:mix.a];draw(x,y,cell*(.10+.12*random(column,row,point+67)),value,pigment);}}if(row%24===0){control.progress?.(row/rows);await new Promise(resolve=>setTimeout(resolve,0));}}
    }

    // Do not grow opaque pixels into the transparent outline of the original.
    for(let i=3;i<pixels.length;i+=4)pixels[i]=pixels[i]?255:0;sourceContext.putImageData(imageData,0,0);ctx.globalCompositeOperation='destination-in';ctx.drawImage(source,0,0);ctx.globalCompositeOperation='source-over';source.width=1;source.height=1;control.progress?.(1);abort(control.signal);return result;
  }
  window.SalmosDotEffects={render};
})();
