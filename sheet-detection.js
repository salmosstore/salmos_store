(() => {
  'use strict';

  const PNG_HEADER = [137, 80, 78, 71, 13, 10, 26, 10];
  const SIGNATURE_SIZE = 24;
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

  function canvas(width, height) {
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    return target;
  }

  async function openPng(blob) {
    const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
    if (bytes.length !== 24 || !PNG_HEADER.every((byte, index) => bytes[index] === byte)) {
      throw new Error('Elegí la plancha original en PNG con fondo transparente.');
    }
    const header = new DataView(bytes.buffer);
    const width = header.getUint32(16), height = header.getUint32(20);
    if (!width || !height || width * height > 120_000_000 || Math.max(width, height) > 16_384) {
      throw new Error('La imagen es demasiado grande para medirla en el navegador. Revisá el tamaño de la plancha.');
    }
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
  function partitionSheet(grid,step,bitmap,size) {
    const pxPerCm=(bitmap.width/size.width+bitmap.height/size.height)/2;
    const minSide=Math.max(4,Math.ceil(.42*pxPerCm/step));
    const gap=Math.max(1,Math.round(.09*pxPerCm/step));
    const bounds={left:0,top:0,right:grid.cols,bottom:grid.rows};
    const candidates=[],leaves=[],seen=new Set();
    function keep(rect){
      if(!rect||coversSheet(rect,bitmap.width,bitmap.height))return false;
      if(Math.min(rect.right-rect.left,rect.bottom-rect.top)<.19*pxPerCm||
        boxArea(rect)<.12*pxPerCm*pxPerCm||candidates.length>=640)return false;
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
      if(primary&&depth<3){
        for(const cut of cuts.slice(1,4)){
          for(const child of children(cut)){
            keep(cellsToPixels(grid,child));
            if(depth===0&&cut.axis!==cuts[0].axis)divide(child,depth+1,false);
          }
        }
      }
    }
    divide(bounds,0,true);
    for(const component of separateRegions(grid,Math.max(1,Math.round(.04*pxPerCm/step)),.1*pxPerCm,.1*pxPerCm))keep(component);
    const ordered=(a,b)=>a.top-b.top||a.left-b.left;
    return {boxes:leaves.sort(ordered),candidates:candidates.sort(ordered)};
  }
  async function detect(bitmap,size,progress=()=>{},signal) {
    const {width,height}=bitmap, step=Math.ceil(Math.max(width,height)/1400);
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
    context.imageSmoothingQuality='high';
    context.translate(target.width/2,target.height/2);
    context.rotate(rotation*Math.PI/180);
    context.drawImage(image,rect.left,rect.top,sourceWidth,sourceHeight,-width/2,-height/2,width,height);
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

  async function assetSignature(blob) {
    const bitmap=await createImageBitmap(blob,{colorSpaceConversion:'none'});
    try {
      const {width,height}=bitmap,full={left:0,top:0,right:width,bottom:height};
      const work=canvas(1,1);
      drawRegion(work,bitmap,full,0,512);
      const bounds=inkBounds(work,{left:0,top:0,right:work.width,bottom:work.height});
      const rect=bounds&&{
        left:Math.floor(bounds.left*width/work.width),top:Math.floor(bounds.top*height/work.height),
        right:Math.ceil(bounds.right*width/work.width),bottom:Math.ceil(bounds.bottom*height/work.height)
      };
      work.width=0;
      return rect?signature(bitmap,rect):null;
    } finally {bitmap.close();}
  }

  function match(signatures, candidates) {
    const scores=[];
    for (const candidate of candidates) {
      let score=Infinity,rotation=0;
      for (let i=0;i<signatures.length;i++) {
        const reference=signatures[i];
        const aspectError=Math.abs(Math.log(candidate.signature.aspect/reference.aspect));
        if (aspectError>.2) continue;
        let difference=0,ink=0;
        for (let p=0;p<reference.data.length;p+=4) {
          const alpha=reference.data[p+3],templateAlpha=candidate.signature.data[p+3];
          difference+=Math.abs(alpha-templateAlpha)*.75;
          for (let channel=0;channel<3;channel++) difference+=Math.abs(reference.data[p+channel]-candidate.signature.data[p+channel])*.083333333;
          ink+=Math.max(alpha,templateAlpha);
        }
        const distance=difference/(ink||1)+aspectError*.35;
        if (distance<score) {score=distance;rotation=i*90;}
      }
      if (Number.isFinite(score)) scores.push({id:candidate.id,score,rotation});
    }
    scores.sort((a,b)=>a.score-b.score);
    const best=scores[0];
    return best&&best.score<.19&&(!scores[1]||scores[1].score-best.score>.025)?best:null;
  }

  window.SalmosSheetDetection={openPng,pngSheetFormat,formatForAspect,detect,drawRegion,signature,assetSignature,match,selectMatches,overlapArea};
})();
