// SALMOS 25.27 · Paletas Pickr compartidas por Admin y la tienda.
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
  function openAdvanced(button,{value='',preview=()=>{},save=()=>{},opacity=false,swatches:choices=swatches,clearLabel='Restablecer',name=''}={}){
    if(!window.Pickr)throw new Error('No se pudo abrir la paleta de colores. Recargá la página.');
    if(active){active.hide();active.destroyAndRemove();active=null;}
    const original=normalize(value),container=button.closest('dialog[open]')||document.body;
    const picker=window.Pickr.create({el:button,container,useAsButton:true,theme:'nano',appClass:'salmos-color-palette',position:'bottom-middle',closeOnScroll:true,default:original||'#ffffff',defaultRepresentation:'HEX',swatches:[...new Set([...choices,...swatches])],comparison:true,
      components:{preview:true,opacity,hue:true,interaction:{hex:true,input:true,clear:true,save:true,cancel:true}},
      i18n:{'ui:dialog':'Elegir color','btn:toggle':'Abrir paleta','btn:swatch':'Elegir muestra','btn:last-color':'Color anterior','btn:save':'Aplicar','btn:cancel':'Cancelar','btn:clear':clearLabel,'aria:btn:save':'Aplicar color','aria:btn:cancel':'Cancelar cambio','aria:btn:clear':clearLabel,'aria:input':'Código del color','aria:palette':'Paleta de color','aria:hue':'Tono','aria:opacity':'Transparencia'}});
    active=picker;let committed=false;
    let nameInput;picker.on('init',()=>{const label=document.createElement('label');label.className='salmos-color-name';label.textContent='Nombre del color';nameInput=document.createElement('input');nameInput.type='text';nameInput.maxLength=80;nameInput.placeholder='Por ejemplo: verde oliva';nameInput.value=name||nameForColor(original)||'';label.append(nameInput);picker.getRoot().app.append(label);picker.show();});
    picker.on('change',color=>preview(normalize(color?.toHEXA().toString())));
    picker.on('save',async color=>{if(committed)return;committed=true;const selected=normalize(color?.toHEXA().toString());picker.hide();try{const label=String(nameInput?.value||'').trim()||nameForColor(selected)||selected;if(selected)remember(label,selected);await save(selected,selected?label:'')}catch(error){preview(original);document.dispatchEvent(new CustomEvent('salmos-color-error',{detail:error.message}));}});
    picker.on('cancel',()=>{preview(original);picker.hide();});
    picker.on('hide',()=>{if(!committed)preview(original);});
    if(container.tagName==='DIALOG')container.addEventListener('close',()=>{if(active===picker){picker.hide();picker.destroyAndRemove();active=null;}},{once:true});
    return picker;
  }
  const basics={'Negro':'#151515','Blanco':'#f7f5ef','Crudo':'#eee2cf','Crema':'#f5ead3','Beige':'#d4bd9b','Gris':'#9da0a5','Azul marino':'#18233d','Azul':'#2454ae','Celeste':'#86cbea','Rojo':'#c63b46','Bordó':'#722632','Verde':'#3b824d','Rosa':'#f29bbc','Marrón':'#79513c','Amarillo':'#e4bc32','Fucsia':'#d84691'};
  let custom=[];
  const catalog=()=>Object.entries({...basics,...Object.fromEntries(custom.map(x=>[x.name,x.color]))}).map(([name,color])=>({name,color}));
  function setCatalog(raw){if(typeof raw==='string')try{raw=JSON.parse(raw)}catch{raw=[]}custom=Array.isArray(raw)?raw.filter(x=>typeof x?.name==='string'&&x.name.trim()&&normalize(x.color)).map(x=>({name:x.name.trim().slice(0,80),color:normalize(x.color)})):[];}
  const colorForName=name=>catalog().find(x=>x.name.toLocaleLowerCase('es')===String(name||'').trim().toLocaleLowerCase('es'))?.color||normalize(name);
  const nameForColor=color=>catalog().find(x=>x.color===normalize(color))?.name||'';
  function remember(name,color){custom=custom.filter(x=>x.name.toLocaleLowerCase('es')!==name.toLocaleLowerCase('es'));custom.push({name,color});document.dispatchEvent(new CustomEvent('salmos-color-catalog-change',{detail:custom.map(x=>({...x}))}));}
  function open(button,options={}){
    if(active){active.hide();active.destroyAndRemove();active=null;}
    const panel=document.createElement('div'),host=button.closest('dialog[open]')||document.body;panel.className='salmos-basic-palette';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Colores');
    const header=document.createElement('div');header.className='salmos-basic-palette-head';header.textContent='Elegir color';const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Cerrar paleta');header.append(close);panel.append(header);
    const list=document.createElement('div');list.className='salmos-basic-palette-list';panel.append(list);
    const cleanup=()=>{panel.remove();if(active===controller)active=null;},controller={hide:cleanup,destroyAndRemove:cleanup};active=controller;close.onclick=cleanup;
    const apply=async(value,name)=>{cleanup();try{await options.save?.(value,name)}catch(error){options.preview?.(normalize(options.value));document.dispatchEvent(new CustomEvent('salmos-color-error',{detail:error.message}));}};
    for(const entry of catalog()){const row=document.createElement('div'),choose=document.createElement('button'),edit=document.createElement('button');choose.type=edit.type='button';choose.className='salmos-basic-color';const dot=document.createElement('i');dot.style.background=entry.color;choose.append(dot,document.createTextNode(entry.name));choose.onclick=()=>apply(entry.color,entry.name);edit.textContent='Editar';edit.setAttribute('aria-label',`Editar ${entry.name}`);edit.onclick=()=>{cleanup();openAdvanced(button,{...options,value:entry.color,name:entry.name});};row.append(choose,edit);list.append(row);}
    const add=document.createElement('button');add.type='button';add.className='btn btn-primary';add.textContent='Agregar color';add.onclick=()=>{cleanup();openAdvanced(button,{...options,name:''});};const clear=document.createElement('button');clear.type='button';clear.className='btn btn-ghost';clear.textContent=options.clearLabel||'Restablecer';clear.onclick=()=>apply('','');panel.append(add,clear);host.append(panel);
    if(host.tagName==='DIALOG')host.addEventListener('close',cleanup,{once:true});close.focus({preventScroll:true});return controller;
  }
  function photoBackgrounds(raw={}){
    if(typeof raw==='string')try{raw=JSON.parse(raw)}catch{raw={}}
    const id=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
    return {all:raw?.all==null?null:id(raw.all),categories:Object.fromEntries(Object.entries(raw?.categories||{}).map(([key,value])=>[key,id(value)])),products:Object.fromEntries(Object.entries(raw?.products||{}).map(([key,value])=>[key,id(value)]))};
  }
  function photoBackgroundFor(settings,category,productId){const value=photoBackgrounds(settings);if(productId&&Object.hasOwn(value.products,String(productId)))return value.products[String(productId)];if(Object.hasOwn(value.categories,category))return value.categories[category];return value.all;}
  function withPhotoBackground(settings,scope,id){const value=photoBackgrounds(settings);if(scope==='all')return {all:Number(id)<0?null:Math.max(0,Number(id)||0),categories:{},products:{}};const map=scope.startsWith('product-')?value.products:value.categories,key=scope.startsWith('product-')?scope.slice(8):scope;if(Number(id)<0)delete map[key];else map[key]=Math.max(0,Number(id)||0);return value;}
  window.SalmosColors={photoBackgrounds,photoBackgroundFor,withPhotoBackground,normalize,backgrounds,backgroundFor,withBackground,defaultBackground,open,openAdvanced,catalog,setCatalog,colorForName,nameForColor,swatches};
})();
