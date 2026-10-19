// SALMOS 25.26 · Reconstruye el producto sin mezclarle el fondo del montaje.
(() => {
  'use strict';
  /** @type {Window & {SalmosMontage?: {draw: (ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number, effects?: object) => void, artwork: (image: HTMLImageElement | HTMLCanvasElement, edit?: object) => HTMLImageElement | HTMLCanvasElement}, SalmosForeground?: {render: typeof render}}} */
  const appWindow=window;
  const load=async url=>{const image=new Image();image.crossOrigin='use-credentials';image.src=url;await image.decode();return image;};
  async function render({project,view,key,base,designs,assetUrl}){
    const model=await load(assetUrl(base)),factor=Math.max(model.width/720,model.height/900),canvas=document.createElement('canvas');canvas.width=Math.round(720*factor);canvas.height=Math.round(900*factor);if(canvas.width*canvas.height>64000000||Math.max(canvas.width,canvas.height)>16384)throw new Error('La foto supera el tamaño permitido para exportar.');const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No se pudo preparar la foto sin fondo.');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    const scale=Math.min(canvas.width/model.width,canvas.height/model.height);ctx.drawImage(model,(canvas.width-model.width*scale)/2,(canvas.height-model.height*scale)/2,model.width*scale,model.height*scale);
    const side=base.pose==='back'?'back':'front',layers=Array.isArray(view.layers)?view.layers:project.layers||[];
    for(const item of layers){if((item.printSide||'front')!==side||(item.bakedViewKeys||[]).includes(key))continue;const asset=designs.find(asset=>Number(asset.id)===Number(item.designAssetId)),position=item.mockupPlacements?.[key]||item.mockupPlacement;if(!asset||!position)throw new Error('Falta una estampa o su posición guardada. Abrí el montaje para actualizarlo.');
      /** @type {HTMLImageElement | HTMLCanvasElement} */
      let image=await load(assetUrl(asset,true));const appearance=item.designAppearance||asset;
      image=appWindow.SalmosMontage.artwork(image,item.artworkEdit||{ink:appearance.preview_color??item.designColor??'',inkOpacity:appearance.preview_color_opacity??100,brightness:appearance.preview_brightness??100,saturation:appearance.preview_saturation??100});
      const width=position.w*canvas.width,height=position.h*canvas.height;ctx.save();ctx.translate((position.x+position.w/2)*canvas.width,(position.y+position.h/2)*canvas.height);ctx.rotate((position.rotation||0)*Math.PI/180);appWindow.SalmosMontage.draw(ctx,image,width,height,item.surface||{});ctx.restore();
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('No se pudo guardar la vista sin fondo.');return blob;
  }
  appWindow.SalmosForeground={render};
})();
