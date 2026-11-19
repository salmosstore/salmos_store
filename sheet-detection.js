(() => {
  'use strict';

  const PNG_HEADER = [137, 80, 78, 71, 13, 10, 26, 10];
  const SIGNATURE_SIZE = 24;
  const MAX_CANDIDATES = 960;
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

  function canvas(width, height) {
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    return target;
  }

  function sourceDimensions(image) {
    return {width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};
  }

  function checkSheetPixels(width,height) {
    if (!width || !height || width * height > 120_000_000 || Math.max(width, height) > 16_384) {
      throw new Error('La imagen es demasiado grande para medirla en el navegador. Revisá el tamaño de la plancha.');
    }
  }

  async function openPng(blob) {
    const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
    if (bytes.length !== 24 || !PNG_HEADER.every((byte, index) => bytes[index] === byte)) {
      throw new Error('Elegí la plancha original en PNG con fondo transparente.');
    }
    const header = new DataView(bytes.buffer);
    checkSheetPixels(header.getUint32(16),header.getUint32(20));
    return await createImageBitmap(blob, {colorSpaceConversion: 'none'});
  }

  const rectWidth = rect => rect.right - rect.left;
  const rectHeight = rect => rect.bottom - rect.top;
  const union = (a, b) => ({
    left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom)
  });
  const overlapArea = (a, b) =>
    Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left)) *
    Math.max(0, Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));

  function separateRegions(grid, radius, minWidth, minHeight) {
    const {cols, rows, left, top, right, bottom} = grid;
    // The integral image finds nearby ink. The resulting envelopes still use original pixels.
    const integral = new Uint32Array((cols + 1) * (rows + 1));
    const stride = cols + 1;
    for (let y = 0; y < rows; y++) {
      let sum = 0;
      for (let x = 0; x < cols; x++) {
        sum += Number(right[y * cols + x] > 0);
        integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + sum;
      }
    }
    const nearInk = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      const y0 = Math.max(0, y - radius), y1 = Math.min(rows, y + radius + 1);
      for (let x = 0; x < cols; x++) {
        const x0 = Math.max(0, x - radius), x1 = Math.min(cols, x + radius + 1);
        const count = integral[y1 * stride + x1] - integral[y1 * stride + x0] -
          integral[y0 * stride + x1] + integral[y0 * stride + x0];
        nearInk[y * cols + x] = Number(count > 0);
      }
    }
    const queue = new Uint32Array(nearInk.length), regions = [];
    for (let index = 0; index < nearInk.length; index++) {
      if (!nearInk[index]) continue;
      let rect = {left:Infinity,top:Infinity,right:0,bottom:0};
      let head = 0, tail = 1;
      queue[0] = index;
      nearInk[index] = 0;
      while (head < tail) {
        const cell = queue[head++], y = Math.floor(cell / cols), x = cell % cols;
        if (right[cell]) {
          rect.left = Math.min(rect.left,left[cell]);
          rect.top = Math.min(rect.top,top[cell]);
          rect.right = Math.max(rect.right,right[cell]);
          rect.bottom = Math.max(rect.bottom,bottom[cell]);
        }
        for (let yy = Math.max(0,y-1); yy <= Math.min(rows-1,y+1); yy++) {
          for (let xx = Math.max(0,x-1); xx <= Math.min(cols-1,x+1); xx++) {
            const neighbor = yy * cols + xx;
            if (!nearInk[neighbor]) continue;
            nearInk[neighbor] = 0;
            queue[tail++] = neighbor;
          }
        }
      }
      if (rectWidth(rect) >= minWidth || rectHeight(rect) >= minHeight) regions.push(rect);
    }
    // A detached detail may be inside the footprint of the same print.
    if (regions.length > 1800) return [];
    const grouped = [];
    for (let rect of regions) {
      for (let index = grouped.length - 1; index >= 0; index--) {
        if (overlapArea(rect,grouped[index]) < Math.min(boxArea(rect),boxArea(grouped[index]))*.33) continue;
        rect = union(rect, grouped[index]);
        grouped.splice(index, 1);
        index = grouped.length;
      }
      grouped.push(rect);
    }
    return grouped.sort((a,b) => a.top-b.top || a.left-b.left);
  }

  const sheetFormats = [
    {width:58,height:100},{width:58,height:50},{width:100,height:58},{width:50,height:58}
  ];
  function formatForAspect(width,height) {
    return width>0&&height>0 ? sheetFormats.find(size=>Math.abs((width/height)/(size.width/size.height)-1)<.012)||null : null;
  }
  async function pngSheetFormat(blob) {
    const bytes = new Uint8Array(await blob.slice(0,65536).arrayBuffer());
    if(bytes.length<33||!PNG_HEADER.every((byte,index)=>bytes[index]===byte))return null;
    const header=new DataView(bytes.buffer),width=header.getUint32(16),height=header.getUint32(20);
    const format=formatForAspect(width,height);
    if(!format)return null;
    let pxPerCmX=300/2.54,pxPerCmY=pxPerCmX;
    for(let offset=33;offset+12<=bytes.length;){
      const length=header.getUint32(offset),tag=String.fromCharCode(...bytes.slice(offset+4,offset+8));
      if(tag==='IDAT'||offset+12+length>bytes.length)break;
      if(tag==='pHYs'&&length===9&&bytes[offset+16]===1){
        const x=header.getUint32(offset+8)/100,y=header.getUint32(offset+12)/100;
        if(x>=50&&y>=50&&Math.abs(width/x-format.width)<.65&&Math.abs(height/y-format.height)<.8)return {...format};
        break;
      }
      offset+=12+length;
    }
    if(Math.abs(width/pxPerCmX-format.width)<.38&&Math.abs(height/pxPerCmY-format.height)<.5)return {...format};
    return /(?:^|[\s_-])plancha(?:[\s_.-]|$)/i.test(blob.name||'')?{...format}:null;
  }

  function boxArea(rect) {
    return (rect.right-rect.left)*(rect.bottom-rect.top);
  }
  function coversSheet(rect,width,height) {
    return (rect.right-rect.left)/width>=.91&&(rect.bottom-rect.top)/height>=.91;
  }
  function cellsToPixels(grid,rect) {
    const out={left:Infinity,top:Infinity,right:0,bottom:0};
    let ink=0;
    for(let y=rect.top;y<rect.bottom;y++){
      for(let x=rect.left;x<rect.right;x++){
        const i=y*grid.cols+x;
        if(!grid.right[i])continue;
        ink++;
        out.left=Math.min(out.left,grid.left[i]);out.top=Math.min(out.top,grid.top[i]);
        out.right=Math.max(out.right,grid.right[i]);out.bottom=Math.max(out.bottom,grid.bottom[i]);
      }
    }
    return ink?out:null;
  }
  function whitespaceCuts(grid,rect,axis,minBlank,minSide) {
    const vertical=axis==='x',start=vertical?rect.left:rect.top,end=vertical?rect.right:rect.bottom;
    const otherStart=vertical?rect.top:rect.left,otherEnd=vertical?rect.bottom:rect.right;
    const densities=new Uint32Array(end-start);
    for(let k=start;k<end;k++){
      for(let i=otherStart;i<otherEnd;i++){
        densities[k-start]+=Number(grid.right[vertical?i*grid.cols+k:k*grid.cols+i]>0);
      }
    }
    let first=0,last=densities.length;
    while(first<last&&!densities[first])first++;
    while(last>first&&!densities[last-1])last--;
    if(last-first<minSide*2)return [];
    const maxDensity=Math.max(...densities),floor=Math.floor(Math.min(maxDensity*.035,(otherEnd-otherStart)*.025));
    const cuts=[];
    for(let i=first+minSide;i<last-minSide;){
      if(densities[i]>floor){i++;continue;}
      const begin=i;
      let occupied=0;
      while(i<last-minSide&&densities[i]<=floor)occupied+=densities[i++];
      const span=i-begin;
      if(span<minBlank)continue;
      const at=Math.floor((i+begin)/2)+start;
      const balance=Math.min(at-(start+first),start+last-at)/(last-first);
      cuts.push({axis,at,score:Math.log1p(span)*(.7+balance)-occupied/(span*(maxDensity||1))});
    }
    return cuts;
  }
  function neighboringInkBounds(regions,keep){
    if(regions.length>130)return;
    for(const [start,end,crossStart,crossEnd] of [['left','right','top','bottom'],['top','bottom','left','right']]){
      const ordered=[...regions].sort((a,b)=>a[start]-b[start]);
      for(let i=0;i<ordered.length-1;i++){
        let bounds=ordered[i],parts=1;
        for(let j=i+1;j<ordered.length&&parts<9;j++){
          const next=ordered[j],span=bounds[crossEnd]-bounds[crossStart],other=next[crossEnd]-next[crossStart];
          const gap=next[start]-bounds[end];
          if(gap>span*.48)break;
          const aligned=Math.min(bounds[crossEnd],next[crossEnd])-Math.max(bounds[crossStart],next[crossStart]);
          if(gap < -span*.15||aligned<Math.min(span,other)*.7||Math.max(span,other)>2.3*Math.min(span,other))continue;
          bounds=union(bounds,next);
          keep(bounds);
          parts++;
        }
      }
    }
  }
  function inkHue(r,g,b){
    const high=Math.max(r,g,b),low=Math.min(r,g,b),spread=high-low;
    if(spread<38||spread<high*.51)return -1;
    const angle=high===r?(g-b)/spread:high===g?2+(b-r)/spread:4+(r-g)/spread;
    return (Math.round(angle)+6)%6;
  }
  function chromaticRegions(bitmap,size,keep){
    const {width,height}=sourceDimensions(bitmap),scale=Math.min(1,840/Math.max(width,height));
    const work=canvas(Math.round(width*scale),Math.round(height*scale));
    const context=work.getContext('2d',{willReadFrequently:true});
    context.drawImage(bitmap,0,0,work.width,work.height);
    const {data}=context.getImageData(0,0,work.width,work.height),{width:cols,height:rows}=work;
    const hues=new Int8Array(cols*rows).fill(-1),counts=new Uint32Array(6);
    for(let i=0,j=0;i<data.length;i+=4,j++){
      if(data[i+3]<110)continue;
      const hue=inkHue(data[i],data[i+1],data[i+2]);
      if(hue>=0){hues[j]=hue;counts[hue]++;}
    }
    work.width=0;
    const toOriginal=rect=>keep({
      left:Math.floor(rect.left*width/cols),top:Math.floor(rect.top*height/rows),
      right:Math.ceil(rect.right*width/cols),bottom:Math.ceil(rect.bottom*height/rows)
    });
    const pxPerCm=(cols/size.width+rows/size.height)/2;
    const length=cols*rows;
    const grid={cols,rows,left:new Uint16Array(length),right:new Uint16Array(length),top:new Uint16Array(length),bottom:new Uint16Array(length)};
    for(let hue=0;hue<counts.length;hue++){
      if(counts[hue]<20)continue;
      grid.right.fill(0);
      for(let i=0;i<length;i++){
        if(hues[i]!==hue)continue;
        const x=i%cols,y=Math.floor(i/cols);
        grid.left[i]=x;grid.right[i]=x+1;grid.top[i]=y;grid.bottom[i]=y+1;
      }
      const radii=new Set([1,Math.max(1,Math.round(.22*pxPerCm)),Math.max(1,Math.round(.5*pxPerCm))]);
      for(const radius of radii){
        const regions=separateRegions(grid,radius,.18*pxPerCm,.18*pxPerCm);
        for(const rect of regions)toOriginal(rect);
        if(radius===1)neighboringInkBounds(regions,toOriginal);
      }
    }
  }
  function partitionSheet(grid,step,bitmap,size) {
    const {width,height}=sourceDimensions(bitmap);
    const pxPerCm=(width/size.width+height/size.height)/2;
    const minSide=Math.max(4,Math.ceil(.42*pxPerCm/step));
    const gap=Math.max(1,Math.round(.09*pxPerCm/step));
    const bounds={left:0,top:0,right:grid.cols,bottom:grid.rows};
    const candidates=[],leaves=[],seen=new Set();
    function keep(rect){
      if(!rect||coversSheet(rect,width,height))return false;
      if(Math.min(rect.right-rect.left,rect.bottom-rect.top)<.19*pxPerCm||
        boxArea(rect)<.12*pxPerCm*pxPerCm||candidates.length>=MAX_CANDIDATES)return false;
      const key=[rect.left,rect.top,rect.right,rect.bottom].join(',');
      if(!seen.has(key)){seen.add(key);candidates.push(rect);}
      return true;
    }
    function divide(rect,depth,primary){
      const ink=cellsToPixels(grid,rect);
      if(!ink)return;
      const valid=keep(ink);
      if(depth>=10||candidates.length>=590){
        if(primary&&valid)leaves.push(ink);
        return;
      }
      const interior={left:Math.max(rect.left,Math.floor(ink.left/step)),top:Math.max(rect.top,Math.floor(ink.top/step)),
        right:Math.min(rect.right,Math.ceil(ink.right/step)),bottom:Math.min(rect.bottom,Math.ceil(ink.bottom/step))};
      const cuts=[...whitespaceCuts(grid,interior,'x',gap,minSide),...whitespaceCuts(grid,interior,'y',gap,minSide)]
        .sort((a,b)=>b.score-a.score);
      if(!cuts.length){if(primary&&valid)leaves.push(ink);return;}
      function children(cut){
        const vertical=cut.axis==='x';
        return [{...interior,[vertical?'right':'bottom']:cut.at},{...interior,[vertical?'left':'top']:cut.at}];
      }
      for(const child of children(cuts[0]))divide(child,depth+1,primary);
      // Try a few alternative gutters before committing to word-like fragments.
      if(primary&&depth<5){
        for(const cut of cuts.slice(1,depth<3?4:2)){
          for(const child of children(cut)){
            keep(cellsToPixels(grid,child));
            if(depth===0&&cut.axis!==cuts[0].axis)divide(child,depth+1,false);
          }
        }
      }
    }
    divide(bounds,0,true);
    const radii=new Set([1,Math.max(1,Math.round(.15*pxPerCm/step)),Math.max(1,Math.round(.32*pxPerCm/step))]);
    for(const radius of radii){
      const regions=separateRegions(grid,radius,.18*pxPerCm,.18*pxPerCm);
      for(const component of regions)keep(component);
      if(radius===1)neighboringInkBounds(regions,keep);
    }
    chromaticRegions(bitmap,size,keep);
    const ordered=(a,b)=>a.top-b.top||a.left-b.left;
    return {boxes:leaves.sort(ordered),candidates:candidates.sort(ordered)};
  }
  async function detect(bitmap,size,progress=()=>{},signal) {
    const {width,height}=sourceDimensions(bitmap);
    checkSheetPixels(width,height);
    const step=Math.ceil(Math.max(width,height)/1400);
    const cols=Math.ceil(width/step),rows=Math.ceil(height/step),length=cols*rows;
    const grid={cols,rows,left:new Uint32Array(length),top:new Uint32Array(length),right:new Uint32Array(length),bottom:new Uint32Array(length)};
    grid.left.fill(width);grid.top.fill(height);
    const work=canvas(width,96);
    const context=work.getContext('2d',{willReadFrequently:true});
    let transparent=0;
    try{
      for(let y=0;y<height;y+=work.height){
        signal?.throwIfAborted();
        const count=Math.min(height-y,work.height);
        context.clearRect(0,0,width,count);context.drawImage(bitmap,0,y,width,count,0,0,width,count);
        const {data}=context.getImageData(0,0,width,count);
        let offset=3;
        for(let dy=0;dy<count;dy++){
          const row=Math.floor((y+dy)/step)*cols, yy=y+dy;
          for(let x=0;x<width;x++,offset+=4){
            const alpha=data[offset];
            if(alpha<18){transparent++;continue;}
            const i=row+Math.floor(x/step);
            const left=grid.left[i],top=grid.top[i],right=grid.right[i],bottom=grid.bottom[i];
            if(x<left)grid.left[i]=x;
            if(yy<top)grid.top[i]=yy;
            if(x>=right)grid.right[i]=x+1;
            if(yy>=bottom)grid.bottom[i]=yy+1;
          }
        }
        if(y%(work.height*6)===0){progress(Math.round((y+count)/height*100));await nextFrame();}
      }
    }finally{work.width=0;}
    if(!transparent)throw new Error('Usá el PNG original con fondo transparente.');
    return partitionSheet(grid,step,bitmap,size);
  }

  function selectMatches(matches,width,height) {
    const overlaps=(a,b)=>overlapArea(a,b)/Math.min(boxArea(a),boxArea(b))>.22;
    const chosen=[];
    for(const row of [...matches].sort((a,b)=>a.score-b.score||boxArea(b.rect)-boxArea(a.rect))){
      if(coversSheet(row.rect,width,height)||chosen.some(item=>overlaps(item.rect,row.rect)))continue;
      chosen.push(row);
    }
    return chosen;
  }

  function inkBounds(bitmap, rect) {
    const width = rectWidth(rect), height = rectHeight(rect);
    if (width < 1 || height < 1) return null;
    const work = canvas(width, Math.min(96, height));
    const context = work.getContext('2d',{willReadFrequently:true});
    const found = {left:width,top:height,right:0,bottom:0};
    try {
      for (let y = 0; y < height; y += work.height) {
        const count = Math.min(height-y,work.height);
        context.clearRect(0,0,width,count);
        context.drawImage(bitmap,rect.left,rect.top+y,width,count,0,0,width,count);
        const {data} = context.getImageData(0,0,width,count);
        let offset = 3;
        for (let dy = 0; dy < count; dy++) {
          for (let x = 0; x < width; x++, offset += 4) {
            if (data[offset]<18) continue;
            found.left = Math.min(found.left,x);
            found.top = Math.min(found.top,y+dy);
            found.right = Math.max(found.right,x+1);
            found.bottom = Math.max(found.bottom,y+dy+1);
          }
        }
      }
    } finally {work.width = 0;}
    return found.right ? {left:rect.left+found.left,top:rect.top+found.top,
      right:rect.left+found.right,bottom:rect.top+found.bottom} : null;
  }

  function drawRegion(target,image,rect,rotation=0,limit=Infinity) {
    const sourceWidth = rectWidth(rect), sourceHeight = rectHeight(rect);
    const swapped = rotation % 180 !== 0, scale = Math.min(1,limit/Math.max(sourceWidth,sourceHeight));
    const width = Math.max(1,Math.round(sourceWidth*scale)), height = Math.max(1,Math.round(sourceHeight*scale));
    target.width = swapped ? height : width;
    target.height = swapped ? width : height;
    const context = target.getContext('2d');
    context.save();
    context.imageSmoothingQuality='high';
    context.translate(target.width/2,target.height/2);
    context.rotate(rotation*Math.PI/180);
    context.drawImage(image,rect.left,rect.top,sourceWidth,sourceHeight,-width/2,-height/2,width,height);
    context.restore();
  }

  function signature(image, rect, rotation = 0) {
    const work=canvas(1,1);
    drawRegion(work,image,rect,rotation,160);
    const compact=canvas(SIGNATURE_SIZE,SIGNATURE_SIZE);
    const context=compact.getContext('2d',{willReadFrequently:true});
    context.drawImage(work,0,0,SIGNATURE_SIZE,SIGNATURE_SIZE);
    const rgba=context.getImageData(0,0,SIGNATURE_SIZE,SIGNATURE_SIZE).data;
    const normalized=new Uint8Array(rgba.length);
    for(let y=0;y<SIGNATURE_SIZE;y++){
      for(let x=0;x<SIGNATURE_SIZE;x++){
        const sums=[0,0,0,0];
        for(let dy=-1;dy<=1;dy++){
          for(let dx=-1;dx<=1;dx++){
            if(x+dx<0||x+dx>=SIGNATURE_SIZE||y+dy<0||y+dy>=SIGNATURE_SIZE)continue;
            const offset=((y+dy)*SIGNATURE_SIZE+x+dx)*4,weight=(dx===0?2:1)*(dy===0?2:1);
            const alpha=Math.max(0,(rgba[offset+3]-12)*255/243);
            for(let channel=0;channel<3;channel++)sums[channel]+=rgba[offset+channel]*alpha*weight/255;
            sums[3]+=alpha*weight;
          }
        }
        const start=(y*SIGNATURE_SIZE+x)*4;
        for(let channel=0;channel<4;channel++)normalized[start+channel]=Math.round(sums[channel]/16);
      }
    }
    const aspect=work.width/work.height;
    work.width=0;compact.width=0;
    return {aspect,data:normalized};
  }

  function fingerprints(image,rect){
    const initial=signature(image,rect),variants=[initial],size=SIGNATURE_SIZE;
    for(let turn=1;turn<4;turn++){
      const previous=variants[turn-1],data=new Uint8Array(initial.data.length);
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const from=(y*size+x)*4,to=(x*size+size-1-y)*4;
        for(let c=0;c<4;c++)data[to+c]=previous.data[from+c];
      }
      variants.push({aspect:1/previous.aspect,data});
    }
    return variants;
  }
  function flatBackgroundSignature(work){
    const {width,height}=work;
    if(width<6||height<6)return null;
    const context=work.getContext('2d',{willReadFrequently:true});
    const frame=context.getImageData(0,0,width,height),{data}=frame;
    const r=data[0],g=data[1],b=data[2];
    const isBackground=index=>data[index+3]>=245&&
      Math.max(Math.abs(data[index]-r),Math.abs(data[index+1]-g),Math.abs(data[index+2]-b))<=22;
    let edge=0,flat=0;
    for(let i=0;i<width*height;i++){
      const x=i%width,y=Math.floor(i/width);
      if(x!==0&&x!==width-1&&y!==0&&y!==height-1)continue;
      edge++;
      if(isBackground(i*4))flat++;
    }
    if(flat<edge*.96)return null;
    let foreground=0;
    const bounds={left:width,top:height,right:0,bottom:0};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      if(isBackground(i)){data[i+3]=0;continue;}
      if(data[i+3]<18)continue;
      foreground++;
      bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x+1);
      bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y+1);
    }
    if(foreground<width*height*.015||foreground>width*height*.86)return null;
    const isolated=canvas(width,height);
    isolated.getContext('2d').putImageData(frame,0,0);
    const signatureWithoutBackground=signature(isolated,bounds);
    isolated.width=0;
    return signatureWithoutBackground;
  }
  function imageSignature(image) {
    const {width,height}=sourceDimensions(image),full={left:0,top:0,right:width,bottom:height};
    if(!width||!height)return null;
    const work=canvas(1,1);
    try {
      drawRegion(work,image,full,0,512);
      const bounds=inkBounds(work,{left:0,top:0,right:work.width,bottom:work.height});
      const rect=bounds&&{
        left:Math.floor(bounds.left*width/work.width),top:Math.floor(bounds.top*height/work.height),
        right:Math.ceil(bounds.right*width/work.width),bottom:Math.ceil(bounds.bottom*height/work.height)
      };
      const original=rect&&signature(image,rect);
      const alternate=original&&flatBackgroundSignature(work);
      return alternate?{...original,alternate}:original;
    } finally {work.width=0;}
  }
  async function assetSignature(blob) {
    const bitmap=await createImageBitmap(blob,{colorSpaceConversion:'none'});
    try{return imageSignature(bitmap);}
    finally{bitmap.close();}
  }

  function signatureDistance(reference,template){
    const aspectError=Math.abs(Math.log(template.aspect/reference.aspect));
    if(aspectError>.2)return Infinity;
    let difference=0,ink=0;
    for(let p=0;p<reference.data.length;p+=4){
      const alpha=reference.data[p+3],templateAlpha=template.data[p+3];
      difference+=Math.abs(alpha-templateAlpha)*.75;
      for(let channel=0;channel<3;channel++)difference+=Math.abs(reference.data[p+channel]-template.data[p+channel])*.083333333;
      ink+=Math.max(alpha,templateAlpha);
    }
    return difference/(ink||1)+aspectError*.35;
  }
  function comparablePrint(reference,template){
    let shared=0,union=0,colorError=0;
    for(let i=0;i<reference.data.length;i+=4){
      const a=reference.data[i+3],b=template.data[i+3],weight=Math.min(a,b);
      shared+=weight;union+=Math.max(a,b);
      if(weight<22)continue;
      for(let channel=0;channel<3;channel++){
        colorError+=weight*Math.abs(reference.data[i+channel]/a-template.data[i+channel]/b);
      }
    }
    return union>0&&shared/union>=.83&&colorError/(3*(shared||1))<=.16;
  }
  function match(signatures, candidates, {strict=false}={}) {
    const scores=[];
    for (const candidate of candidates) {
      let score=Infinity,rotation=0;
      for (let i=0;i<signatures.length;i++) {
        const reference=signatures[i],template=candidate.signature;
        const compare=design=>strict&&!comparablePrint(reference,design)?Infinity:signatureDistance(reference,design);
        const original=compare(template);
        const distance=template.alternate?
          Math.min(original<.035?original:Infinity,compare(template.alternate)+.012):original;
        if (distance<score) {score=distance;rotation=i*90;}
      }
      if (Number.isFinite(score)) scores.push({id:candidate.id,score,rotation});
    }
    scores.sort((a,b)=>a.score-b.score);
    const best=scores[0];
    const limit=strict ? .115 : .19,margin=strict ? .04 : .025;
    return best&&best.score<limit&&(!scores[1]||scores[1].score-best.score>margin)?best:null;
  }

  const occurrenceSamples=new WeakMap();
  function normalizedRect(box,width,height,padding=0){
    return {
      left:Math.max(0,Math.floor(box.x*width-padding)),top:Math.max(0,Math.floor(box.y*height-padding)),
      right:Math.min(width,Math.ceil((box.x+box.width)*width+padding)),
      bottom:Math.min(height,Math.ceil((box.y+box.height)*height+padding))
    };
  }
  function normalizedBox(rect,width,height){
    return {x:rect.left/width,y:rect.top/height,width:rectWidth(rect)/width,height:rectHeight(rect)/height};
  }
  function occurrenceRotation(image,seed,box){
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    const rotation=Number(seed.rotation)||0;
    const template=signature(image,normalizedRect(seed,width,height));
    const found=match(fingerprints(image,normalizedRect(box,width,height)),[{id:1,signature:template}]);
    return (rotation+(found?.rotation||0))%360;
  }
  async function occurrenceSample(image,size){
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,
      source=image.currentSrc||image.src||'',key=[width,height,source,size.width,size.height].join(':');
    const current=occurrenceSamples.get(image);
    if(current?.key===key)return current.result;
    const scale=Math.min(1,1280/Math.max(width,height));
    const work=canvas(Math.round(width*scale),Math.round(height*scale));
    work.getContext('2d').drawImage(image,0,0,work.width,work.height);
    const result=detect(work,size).then(found=>({
      work,boxes:found.boxes,candidates:found.candidates,templatesBySeed:new WeakMap(),fingerprintsByRect:new WeakMap()
    }));
    occurrenceSamples.set(image,{key,result});
    try{return await result;}
    catch(error){
      if(occurrenceSamples.get(image)?.result===result)occurrenceSamples.delete(image);
      throw error;
    }
  }
  function sampleFingerprints(sample,rect){
    if(!sample.fingerprintsByRect.has(rect))sample.fingerprintsByRect.set(rect,fingerprints(sample.work,rect));
    return sample.fingerprintsByRect.get(rect);
  }
  function freeOccurrence(occupied,rect){
    return !occupied.some(old=>overlapArea(old,rect)>Math.min(boxArea(old),boxArea(rect))*.25);
  }
  function confirmOccurrences(image,work,hits,templates,occupied,limit){
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    const confirmed=[],padding=Math.ceil(Math.max(width/work.width,height/work.height));
    for(const hit of hits.sort((a,b)=>a.score-b.score).slice(0,limit)){
      const estimated=normalizedBox(hit.rect,work.width,work.height);
      for(const margin of [padding,0]){
        const rect=inkBounds(image,normalizedRect(estimated,width,height,margin));
        if(!rect||!freeOccurrence(occupied,normalizedRect(normalizedBox(rect,width,height),work.width,work.height)))continue;
        const result=match(fingerprints(image,rect),templates);
        if(result){confirmed.push({...result,rect,score:result.score+hit.score*.2});break;}
      }
    }
    return confirmed.sort((a,b)=>a.score-b.score);
  }
  function sampledColor(frame,x,y){
    const px=Math.max(0,Math.min(frame.width-1,x)),py=Math.max(0,Math.min(frame.height-1,y));
    const left=Math.floor(px),top=Math.floor(py),right=Math.min(frame.width-1,left+1),bottom=Math.min(frame.height-1,top+1);
    const dx=px-left,dy=py-top,out=[0,0,0,0];
    for(const [xx,yy,weight] of [[left,top,(1-dx)*(1-dy)],[right,top,dx*(1-dy)],[left,bottom,(1-dx)*dy],[right,bottom,dx*dy]]){
      const index=(yy*frame.width+xx)*4,alpha=frame.data[index+3]/255;
      out[3]+=alpha*weight;
      for(let channel=0;channel<3;channel++)out[channel]+=frame.data[index+channel]/255*alpha*weight;
    }
    return out;
  }
  async function findSeedOccurrence(image,sample,seed,point,occupied){
    const {work}=sample;
    const frame=sample.rgba??=work.getContext('2d',{willReadFrequently:true}).getImageData(0,0,work.width,work.height);
    const seedRect=inkBounds(work,normalizedRect(seed,work.width,work.height));
    if(!seedRect)return null;
    const seedWidth=rectWidth(seedRect),seedHeight=rectHeight(seedRect),grid=14,template=[];
    for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
      const u=(x+.5)/grid-.5,v=(y+.5)/grid-.5;
      template.push({u,v,color:sampledColor(frame,(seedRect.left+seedRect.right)/2+u*seedWidth,(seedRect.top+seedRect.bottom)/2+v*seedHeight)});
    }
    const ink=template.reduce((sum,pixel)=>sum+pixel.color[3],0);
    if(ink<8)return null;
    const px=point.x*work.width,py=point.y*work.height;
    const evaluate=proposal=>{
      const {x,y,width,height,quarter}=proposal;
      const rect={left:x-width/2,top:y-height/2,right:x+width/2,bottom:y+height/2};
      if(rect.left<0||rect.top<0||rect.right>work.width||rect.bottom>work.height||
        !regionContains(rect,px,py)||!freeOccurrence(occupied,rect))return null;
      let difference=0;
      for(const pixel of template){
        let u=pixel.u,v=pixel.v;
        if(quarter===1)[u,v]=[-v,u];
        if(quarter===2){u=-u;v=-v;}
        if(quarter===3)[u,v]=[v,-u];
        const target=sampledColor(frame,x+u*width,y+v*height),reference=pixel.color;
        difference+=Math.abs(target[3]-reference[3])*.75;
        for(let channel=0;channel<3;channel++)difference+=Math.abs(target[channel]-reference[channel])/12;
        if(difference>ink*.32)return null;
      }
      return {...proposal,rect,score:difference/ink};
    };
    const hits=[],scales=[1,.9,1.1,.8,1.25,.67,1.5,.5,2,.4,2.5,.33,3,.25,4];
    for(const scale of scales){
      for(let quarter=0;quarter<4;quarter++){
        const width=(quarter%2?seedHeight:seedWidth)*scale,height=(quarter%2?seedWidth:seedHeight)*scale;
        if(width<5||height<5||width>work.width||height>work.height)continue;
        for(const dx of [-.4,-.25,-.1,0,.1,.25,.4])for(const dy of [-.4,-.25,-.1,0,.1,.25,.4]){
          const hit=evaluate({x:px+dx*width,y:py+dy*height,width,height,quarter});
          if(hit)hits.push(hit);
        }
      }
      await nextFrame();
    }
    hits.sort((a,b)=>a.score-b.score);
    let refined=hits.slice(0,8);
    for(const step of [.06,.025,.01]){
      const next=[];
      for(const candidate of refined){
        let best=candidate;
        for(const dx of [-step,0,step])for(const dy of [-step,0,step])for(const ds of [-step,0,step]){
          const hit=evaluate({...candidate,x:candidate.x+dx*candidate.width,y:candidate.y+dy*candidate.height,
            width:candidate.width*(1+ds),height:candidate.height*(1+ds)});
          if(hit&&hit.score<best.score)best=hit;
        }
        next.push(best);
      }
      refined=next.sort((a,b)=>a.score-b.score);
    }
    const best=refined[0];
    if(!best||best.score>.155)return null;
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    const estimate=normalizedBox(best.rect,work.width,work.height);
    const bounds=inkBounds(image,normalizedRect(estimate,width,height));
    if(!bounds)return null;
    const box=normalizedBox(bounds,width,height);
    return {...box,rotation:((Number(seed.rotation)||0)+360-best.quarter*90)%360,...(seed.shape?{shape:seed.shape}:{})};
  }
  async function findOccurrence(image,size,seed,point,used){
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    if(!width||!height)return null;
    const sample=await occurrenceSample(image,size),{work,candidates,templatesBySeed}=sample;
    if(!templatesBySeed.has(seed)){
      const bounds=inkBounds(image,normalizedRect(seed,width,height));
      if(!bounds)return null;
      templatesBySeed.set(seed,[{id:1,signature:signature(image,bounds)}]);
    }
    const templates=templatesBySeed.get(seed);
    const px=point.x*work.width,py=point.y*work.height;
    const occupied=used.map(box=>normalizedRect(box,work.width,work.height));
    if(occupied.some(rect=>px>=rect.left&&px<=rect.right&&py>=rect.top&&py<=rect.bottom))return null;
    const seeded=await findSeedOccurrence(image,sample,seed,point,occupied);
    if(seeded)return seeded;
    const hits=[];
    for(const rect of candidates){
      if(px<rect.left||px>rect.right||py<rect.top||py>rect.bottom||!freeOccurrence(occupied,rect))continue;
      const hit=match(sampleFingerprints(sample,rect),templates);
      if(hit)hits.push({...hit,rect});
    }
    const confirmed=confirmOccurrences(image,work,hits,templates,occupied,12);
    const best=confirmed[0];
    if(!best||confirmed.slice(1).some(row=>row.score-best.score<.035&&
      overlapArea(row.rect,best.rect)<.7*Math.max(boxArea(row.rect),boxArea(best.rect))))return null;
    return {...normalizedBox(best.rect,width,height),rotation:((Number(seed.rotation)||0)+best.rotation)%360};
  }
  async function findDesignOnSheet(image,size,template,used,signal,point=null){
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    if(!width||!height||!template)return null;
    const sample=await occurrenceSample(image,size),{work,candidates}=sample;
    const occupied=used.map(box=>normalizedRect(box,work.width,work.height));
    const templates=[{id:1,signature:template}],hits=[];
    for(let i=0;i<candidates.length;i++){
      if(i%30===0){signal?.throwIfAborted();await nextFrame();}
      const rect=candidates[i],aspect=rectWidth(rect)/rectHeight(rect);
      if(point&&!regionContains(rect,point.x*work.width,point.y*work.height,2))continue;
      if(rectWidth(rect)/work.width<.005||rectHeight(rect)/work.height<.005||!freeOccurrence(occupied,rect))continue;
      const agrees=value=>Math.min(Math.abs(Math.log(value/aspect)),Math.abs(Math.log(value*aspect)))<=.21;
      if(!agrees(template.aspect)&&!(template.alternate&&agrees(template.alternate.aspect)))continue;
      const hit=match(sampleFingerprints(sample,rect),templates);
      if(hit)hits.push({...hit,rect});
    }
    signal?.throwIfAborted();
    const [best]=confirmOccurrences(image,work,hits,templates,occupied,6);
    return best&&best.score<.185?{...normalizedBox(best.rect,width,height),rotation:best.rotation}:null;
  }
  function regionContains(rect,x,y,padding=0){
    return x>=rect.left-padding&&x<=rect.right+padding&&y>=rect.top-padding&&y<=rect.bottom+padding;
  }
  async function proposeRegionAtPoint(image,size,point,used,aspect=0){
    const {work,boxes,candidates}=await occurrenceSample(image,size);
    const x=point.x*work.width,y=point.y*work.height;
    const occupied=used.map(box=>normalizedRect(box,work.width,work.height));
    if(occupied.some(rect=>regionContains(rect,x,y)))return null;
    const valid=rect=>regionContains(rect,x,y,3)&&freeOccurrence(occupied,rect)&&
      rectWidth(rect)/work.width>=.005&&rectHeight(rect)/work.height>=.005;
    const fitting=[...boxes,...candidates].filter(valid);
    if(!fitting.length)return null;
    const leaf=boxes.find(valid),leafSet=new Set(boxes);
    const rank=rect=>{
      const ratio=rectWidth(rect)/rectHeight(rect),area=boxArea(rect);
      const error=aspect>0?Math.min(Math.abs(Math.log(ratio/aspect)),Math.abs(Math.log(ratio*aspect))):0;
      const growsPastLeaf=leaf&&area>boxArea(leaf)*2.6?0.55:0;
      const distance=Math.hypot((x-(rect.left+rect.right)/2)/rectWidth(rect),(y-(rect.top+rect.bottom)/2)/rectHeight(rect));
      return error+distance*.24+growsPastLeaf+(leafSet.has(rect)?0:.12);
    };
    const rect=fitting.sort((a,b)=>rank(a)-rank(b))[0];
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    const raw=normalizedBox(rect,work.width,work.height);
    const tight=inkBounds(image,normalizedRect(raw,width,height));
    return tight?{...normalizedBox(tight,width,height),rotation:0}:null;
  }
  function pngDensityChunk(x,y){
    const chunk=new Uint8Array(21),view=new DataView(chunk.buffer);
    view.setUint32(0,9);
    chunk.set([112,72,89,115],4);
    view.setUint32(8,x);
    view.setUint32(12,y);
    chunk[16]=1;
    let crc=0xffffffff;
    for(const byte of chunk.subarray(4,17)){
      crc^=byte;
      for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
    }
    view.setUint32(17,crc^0xffffffff);
    return chunk;
  }
  async function applyPngDensity(blob,x,y){
    const bytes=new Uint8Array(await blob.slice(0,65536).arrayBuffer()),view=new DataView(bytes.buffer);
    const density=pngDensityChunk(x,y);
    for(let offset=33;offset+12<=bytes.length;){
      const length=view.getUint32(offset),tag=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
      if(tag==='pHYs'&&length===9)return new Blob([blob.slice(0,offset),density,blob.slice(offset+21)],{type:'image/png'});
      if(tag==='IDAT'||offset+12+length>bytes.length)break;
      offset+=length+12;
    }
    return new Blob([blob.slice(0,33),density,blob.slice(33)],{type:'image/png'});
  }
  function artworkShapePath(context,width,height,shape){
    context.beginPath();
    if(shape==='circle'||shape==='ellipse')context.ellipse(width/2,height/2,width/2,height/2,0,0,Math.PI*2);
    else if(shape==='rounded')context.roundRect(0,0,width,height,Math.min(width,height)*.16);
    else context.rect(0,0,width,height);
  }
  function applyArtworkShape(work,shape){
    if(!shape||shape==='rectangle')return;
    const context=work.getContext('2d');
    context.save();context.globalCompositeOperation='destination-in';
    artworkShapePath(context,work.width,work.height,shape);context.fill();context.restore();
  }
  function cropArtworkCanvas(image,box,mask=true){
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    if(!width||!height)throw new Error('Abrí la imagen de la plancha para recortar.');
    const rect=normalizedRect(box,width,height),w=rectWidth(rect),h=rectHeight(rect);
    if(w<1||h<1)throw new Error('Marcá el contorno completo de la estampa.');
    const work=canvas(w,h),rotation=Number(box.rotation)||0;
    drawRegion(work,image,rect,rotation);
    if(mask)applyArtworkShape(work,box.shape);
    return {canvas:work,box:{...box,...normalizedBox(rect,width,height),rotation}};
  }
  function rotateArtworkCanvas(work,angle){
    const rotated=canvas(work.height,work.width),context=rotated.getContext('2d');
    context.save();
    context.imageSmoothingEnabled=false;
    context.translate(angle>0?rotated.width:0,angle>0?0:rotated.height);
    context.rotate(angle*Math.PI/180);
    context.drawImage(work,0,0);
    context.restore();
    return rotated;
  }
  async function cropArtwork(image,box,size,edited=null){
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    if(!(size.width>0&&size.height>0))throw new Error('Elegí una plancha con medidas válidas.');
    const crop=edited?{canvas:canvas(edited.width,edited.height),box}:cropArtworkCanvas(image,box);
    const work=crop.canvas;
    if(edited){work.getContext('2d').drawImage(edited,0,0);applyArtworkShape(work,box.shape);}
    try{
      const png=await new Promise((resolve,reject)=>work.toBlob(blob=>
        blob?resolve(blob):reject(new Error('No se pudo preparar el PNG de la estampa.')),'image/png'));
      const x=Math.round(width/size.width*100),y=Math.round(height/size.height*100);
      const swap=(Number(crop.box.rotation)||0)%180!==0;
      return {
        blob:await applyPngDensity(png,swap?y:x,swap?x:y),
        box:crop.box
      };
    }finally{work.width=0;}
  }

  window.SalmosSheetDetection={openPng,pngSheetFormat,formatForAspect,detect,drawRegion,signature,fingerprints,imageSignature,assetSignature,match,
    selectMatches,overlapArea,findOccurrence,occurrenceRotation,findDesignOnSheet,proposeRegionAtPoint,cropArtworkCanvas,rotateArtworkCanvas,cropArtwork,applyArtworkShape};
})();
