// SALMOS 25.24 · Paletas Pickr compartidas por Admin y la tienda.
(() => {
  'use strict';
  const swatches=['#ffffff','#000000','#faedf3','#f3cadc','#e98bb0','#ef5350','#ffb74d','#ffee58','#81c784','#26a69a','#4fc3f7','#5c6bc0','#ab47bc','#8d6e63','#90a4ae'];
  const normalize=value=>{
    let color=String(value||'').trim().toLowerCase();
    if(/^#[0-9a-f]{3}$/.test(color))color='#'+[...color.slice(1)].map(x=>x+x).join('');
    if(/^#[0-9a-f]{8}$/.test(color)&&color.endsWith('ff'))color=color.slice(0,7);
    return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/.test(color)?color:'';
  };
  function backgrounds(raw={}){
    if(typeof raw==='string')try{raw=JSON.parse(raw)}catch{raw={}}
    return {all:normalize(raw?.all),categories:Object.fromEntries(Object.entries(raw?.categories||{}).flatMap(([key,value])=>normalize(value)?[[key,normalize(value)]]:[]))};
  }
  const backgroundFor=(settings,category)=>{const value=backgrounds(settings);return value.categories[category]||value.all;};
  function withBackground(settings,category,color){
    const value=backgrounds(settings),selected=normalize(color);
    if(category==='all')return {all:selected,categories:{}};
    if(selected)value.categories[category]=selected;else delete value.categories[category];return value;
  }
  const defaultBackground=theme=>theme==='light'?'#f7f0e3':'#222226';
  let active=null;
  function open(button,{value='',preview=()=>{},save=()=>{},opacity=false,swatches:choices=swatches,clearLabel='Restablecer'}={}){
    if(!window.Pickr)throw new Error('No se pudo abrir la paleta de colores. Recargá la página.');
    if(active){active.hide();active.destroyAndRemove();active=null;}
    const original=normalize(value),container=button.closest('dialog[open]')||document.body;
    const picker=window.Pickr.create({el:button,container,useAsButton:true,theme:'nano',appClass:'salmos-color-palette',position:'bottom-middle',closeOnScroll:true,default:original||'#ffffff',defaultRepresentation:'HEX',swatches:[...new Set([...choices,...swatches])],comparison:true,
      components:{preview:true,opacity,hue:true,interaction:{hex:true,input:true,clear:true,save:true,cancel:true}},
      i18n:{'ui:dialog':'Elegir color','btn:toggle':'Abrir paleta','btn:swatch':'Elegir muestra','btn:last-color':'Color anterior','btn:save':'Aplicar','btn:cancel':'Cancelar','btn:clear':clearLabel,'aria:btn:save':'Aplicar color','aria:btn:cancel':'Cancelar cambio','aria:btn:clear':clearLabel,'aria:input':'Código del color','aria:palette':'Paleta de color','aria:hue':'Tono','aria:opacity':'Transparencia'}});
    active=picker;let committed=false;
    picker.on('init',()=>picker.show());
    picker.on('change',color=>preview(normalize(color?.toHEXA().toString())));
    picker.on('save',async color=>{if(committed)return;committed=true;const selected=normalize(color?.toHEXA().toString());picker.hide();try{await save(selected)}catch(error){preview(original);document.dispatchEvent(new CustomEvent('salmos-color-error',{detail:error.message}));}});
    picker.on('cancel',()=>{preview(original);picker.hide();});
    picker.on('hide',()=>{if(!committed)preview(original);});
    if(container.tagName==='DIALOG')container.addEventListener('close',()=>{if(active===picker){picker.hide();picker.destroyAndRemove();active=null;}},{once:true});
    return picker;
  }
  window.SalmosColors={normalize,backgrounds,backgroundFor,withBackground,defaultBackground,open,swatches};
})();
