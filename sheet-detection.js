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
    if (regions.length > 1800) throw new Error('Hay demasiados fragmentos. Podés marcar las estampas sobre la plancha.');
    const grouped = [];
    for (let rect of regions) {
      for (let index = grouped.length - 1; index >= 0; index--) {
        if (!overlapArea(rect, grouped[index])) continue;
        rect = union(rect, grouped[index]);
        grouped.splice(index, 1);
        index = grouped.length;
      }
      grouped.push(rect);
    }
    return grouped.sort((a,b) => a.top-b.top || a.left-b.left);
  }

  async function detect(bitmap, size, progress = () => {}, signal) {
    const {width, height} = bitmap;
    const step = Math.ceil(Math.max(width,height) / 1450);
    const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
    const grid = {cols,rows,left:new Uint32Array(cols*rows),top:new Uint32Array(cols*rows),
      right:new Uint32Array(cols*rows),bottom:new Uint32Array(cols*rows)};
    grid.left.fill(width);
    grid.top.fill(height);
    const work = canvas(width,96);
    const context = work.getContext('2d',{willReadFrequently:true});
    let clear = 0;
    try {
      for (let y = 0; y < height; y += work.height) {
        signal?.throwIfAborted();
        const count = Math.min(height-y,work.height);
        context.clearRect(0,0,width,count);
        context.drawImage(bitmap,0,y,width,count,0,0,width,count);
        const {data} = context.getImageData(0,0,width,count);
        let offset = 3;
        for (let dy = 0; dy < count; dy++) {
          const row = Math.floor((y+dy)/step)*cols;
          for (let x = 0; x < width; x++, offset += 4) {
            if (!data[offset]) {clear++;continue;}
            const cell = row + Math.floor(x/step);
            grid.left[cell] = Math.min(grid.left[cell],x);
            grid.top[cell] = Math.min(grid.top[cell],y+dy);
            grid.right[cell] = Math.max(grid.right[cell],x+1);
            grid.bottom[cell] = Math.max(grid.bottom[cell],y+dy+1);
          }
        }
        if (y % (work.height*6) === 0) {
          progress(Math.round((y+count)/height * 100));
          await nextFrame();
        }
      }
    } finally {work.width = 0;}
    if (!clear) throw new Error('La plancha tiene fondo opaco. Usá un PNG con fondo transparente.');
    const pxPerCm = (width / size.width + height / size.height) / 2;
    return separateRegions(grid,Math.max(1,Math.round(.18*pxPerCm/step)),.04*width/size.width,.04*height/size.height);
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
            if (!data[offset]) continue;
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
    for (let i=0;i<rgba.length;i+=4) {
      const alpha=rgba[i+3]/255;
      normalized[i]=Math.round(rgba[i]*alpha);
      normalized[i+1]=Math.round(rgba[i+1]*alpha);
      normalized[i+2]=Math.round(rgba[i+2]*alpha);
      normalized[i+3]=rgba[i+3];
    }
    return {aspect:work.width/work.height,data:normalized};
  }

  async function assetSignature(blob) {
    const bitmap=await createImageBitmap(blob);
    try {
      const work=canvas(1,1);
      drawRegion(work,bitmap,{left:0,top:0,right:bitmap.width,bottom:bitmap.height},0,160);
      const bounds=inkBounds(work,{left:0,top:0,right:work.width,bottom:work.height});
      return bounds?signature(work,bounds):null;
    } finally {bitmap.close();}
  }

  function match(signatures, candidates) {
    const scores=[];
    for (const candidate of candidates) {
      let score=Infinity,rotation=0;
      for (let i=0;i<signatures.length;i++) {
        const reference=signatures[i];
        const aspectError=Math.abs(Math.log(candidate.signature.aspect/reference.aspect));
        if (aspectError>.18) continue;
        let difference=0,ink=0;
        for (let p=0;p<reference.data.length;p+=4) {
          for (let channel=0;channel<4;channel++) difference+=Math.abs(reference.data[p+channel]-candidate.signature.data[p+channel]);
          ink+=Math.max(reference.data[p+3],candidate.signature.data[p+3]);
        }
        const distance=difference/(4*ink||1)+aspectError*.45;
        if (distance<score) {score=distance;rotation=i*90;}
      }
      if (Number.isFinite(score)) scores.push({id:candidate.id,score,rotation});
    }
    scores.sort((a,b)=>a.score-b.score);
    const best=scores[0];
    return best&&best.score<.125&&(!scores[1]||scores[1].score-best.score>.028)?best:null;
  }

  // Canvas PNGs can carry the browser's default DPI. Use the calibrated sheet scale instead.
  async function withPrintDensity(blob, xPerMeter, yPerMeter) {
    const chunk=new Uint8Array(21), view=new DataView(chunk.buffer);
    view.setUint32(0,9);
    chunk.set([112,72,89,115],4);
    view.setUint32(8,Math.round(xPerMeter));
    view.setUint32(12,Math.round(yPerMeter));
    chunk[16]=1;
    let crc=0xffffffff;
    for (let i=4;i<17;i++) {
      crc^=chunk[i];
      for (let bit=0;bit<8;bit++) crc=(crc>>>1)^(crc&1?0xedb88320:0);
    }
    view.setUint32(17,(crc^0xffffffff)>>>0);
    let offset=33;
    while (offset+12<=blob.size) {
      const bytes=new Uint8Array(await blob.slice(offset,offset+8).arrayBuffer());
      const type=String.fromCharCode(...bytes.slice(4));
      const length=new DataView(bytes.buffer).getUint32(0);
      if (type==='pHYs') return new Blob([blob.slice(0,offset),chunk,blob.slice(offset+length+12)],{type:'image/png'});
      if (type==='IDAT') break;
      offset+=length+12;
    }
    return new Blob([blob.slice(0,33),chunk,blob.slice(33)],{type:'image/png'});
  }

  async function cropPng(bitmap, rect, rotation, size) {
    const work=canvas(1,1);
    try {
      drawRegion(work,bitmap,rect,rotation);
      const blob=await new Promise((resolve,reject)=>work.toBlob(value=>{
        if(value)resolve(value);
        else reject(new Error('No se pudo crear el PNG de la estampa.'));
      },'image/png'));
      const x=bitmap.width/size.width*100,y=bitmap.height/size.height*100;
      return await withPrintDensity(blob,rotation%180?y:x,rotation%180?x:y);
    } finally {work.width=0;}
  }

  window.SalmosSheetDetection = {openPng,detect,inkBounds,drawRegion,signature,assetSignature,match,cropPng,union,overlapArea};
})();
