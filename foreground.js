// SALMOS 25.25 · Reconstruye el producto sin mezclarle el fondo del montaje.
(() => {
  'use strict';
  const load=async url=>{const image=new Image();image.crossOrigin='use-credentials';image.src=url;await image.decode();return image;};
  async function render({project,view,key,base,designs,assetUrl}){
    const canvas=document.createElement('canvas');canvas.width=720;canvas.height=900;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No se pudo preparar la foto sin fondo.');
    const model=await load(assetUrl(base)),scale=Math.min(canvas.width/model.width,canvas.height/model.height);ctx.drawImage(model,(canvas.width-model.width*scale)/2,(canvas.height-model.height*scale)/2,model.width*scale,model.height*scale);
    const side=base.pose==='back'?'back':'front',layers=Array.isArray(view.layers)?view.layers:project.layers||[];
    for(const item of layers){if((item.printSide||'front')!==side||(item.bakedViewKeys||[]).includes(key))continue;const asset=designs.find(asset=>Number(asset.id)===Number(item.designAssetId)),position=item.mockupPlacements?.[key]||item.mockupPlacement;if(!asset||!position)throw new Error('Falta una estampa o su posición guardada. Abrí el montaje para actualizarlo.');
      let image=await load(assetUrl(asset,true));const color=item.designColor??asset.preview_color;if(color){const ink=document.createElement('canvas');ink.width=image.width;ink.height=image.height;const paint=ink.getContext('2d');paint.drawImage(image,0,0);paint.globalCompositeOperation='source-in';paint.fillStyle=color;paint.fillRect(0,0,ink.width,ink.height);image=ink;}
      const width=position.w*canvas.width,height=position.h*canvas.height,fit=Math.min(width/image.width,height/image.height),drawWidth=image.width*fit,drawHeight=image.height*fit;ctx.save();ctx.translate((position.x+position.w/2)*canvas.width,(position.y+position.h/2)*canvas.height);ctx.rotate((position.rotation||0)*Math.PI/180);ctx.drawImage(image,-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);ctx.restore();
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('No se pudo guardar la vista sin fondo.');return blob;
  }
  window.SalmosForeground={render};
})();
