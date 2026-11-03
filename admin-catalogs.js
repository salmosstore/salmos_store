/* Listas propias de SALMOS: altas, cambios y bajas sin borrar el historial. */
(() => {
  'use strict';
  let context,dialog,scheduled=false;const seeds=new Map();
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const code=x=>'custom_'+norm(x).replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48);
  const titles={productTypes:'Tipos de producto y material',paperKinds:'Tipos de papel y cartón',paperFinishes:'Terminaciones',paperFormats:'Formatos de papel',bindingCapacities:'Capacidades de ganchos',bookKinds:'Líneas de libros',bindingKinds:'Encuadernados',fits:'Cortes',classes:'Clases',genders:'Públicos',poses:'Vistas',models:'Modelos',financeReasons:'Motivos de Caja',designDestinations:'Destinos de diseños'};
  const stableKeys=new Set(['productTypes','paperFormats','bindingKinds','poses']);
  function normalizeRows(values){const seen=new Set();return (values||[]).map(item=>Array.isArray(item)?{value:String(item[0]),label:String(item[1])}:typeof item==='object'?{...item,value:String(item.value??item.code??item.label),label:String(item.label??item.value??item.code)}:{value:String(item),label:String(item)}).filter(item=>item.value&&!item.value.startsWith('__')&&!/^otro(?:s| producto|\.\.\.)?$/i.test(item.label.trim())&&!seen.has(item.value)&&seen.add(item.value));}
  function register(key,values){if(!seeds.has(key)||!seeds.get(key).length)seeds.set(key,normalizeRows(values));return rows(key,values);}
  function rows(key,fallback=[]){if(!seeds.has(key))seeds.set(key,normalizeRows(fallback));const saved=context?.state.purchaseOptions.managedLists?.[key];return normalizeRows(Array.isArray(saved)?saved:seeds.get(key));}
  function values(key,fallback=[]){return rows(key,fallback).map(row=>row.value);}
  function label(key,value,fallback=''){return rows(key).find(row=>row.value===String(value))?.label||(key==='paperFormats'?context?.state.purchaseOptions.formatArchive?.[value]?.label:'')||fallback||String(value||'');}
  function formats(defaults){const result={...defaults};for(const [key,row] of Object.entries(context?.state.purchaseOptions.formatArchive||{}))if(row.width>0&&row.height>0){result[key]=[row.width,row.height];result[row.label]=[row.width,row.height];}for(const row of rows('paperFormats',Object.entries(defaults).map(([value,size])=>({value,label:value,width:size[0],height:size[1]}))))if(Number(row.width)>0&&Number(row.height)>0){result[row.value]=[Number(row.width),Number(row.height)];result[row.label]=result[row.value];}return result;}
  function defaultValue(key,fallback){const managed=context?.state.purchaseOptions.managedLists?.[key];if(!Array.isArray(managed))return fallback;return managed.some(row=>String(row.value)===String(fallback))?fallback:String(managed[0]?.value||'');}
  function options(key,value,fallback=[],emptyLabel=null){const list=register(key,fallback),current=String(value??'');if(current&&!list.some(row=>row.value===current)&&!current.startsWith('__'))list.push({value:current,label:label(key,current)+(Array.isArray(context?.state.purchaseOptions.managedLists?.[key])?' (archivado)':'')});return (emptyLabel!==null?`<option value="">${esc(emptyLabel)}</option>`:'')+list.map(row=>`<option value="${esc(row.value)}" ${row.value===current?'selected':''}>${esc(row.label)}</option>`).join('')+'<option value="__manage_catalog__">Administrar…</option>';}

  function keyFor(select){
    if(select.dataset.managedList)return select.dataset.managedList;
    if(select.matches('[data-purchase-type-select],#productionMaterialType,[data-mockup-field="productType"],[data-material-field="materialType"]'))return 'productTypes';
    const choice=select.dataset.purchaseChoice||select.dataset.materialField;
    if(choice==='fit')return 'fits';if(choice==='materialClass'||choice==='material_class')return 'classes';if(choice==='gender')return 'genders';
    if(choice==='size'){const row=select.closest('[data-purchase-row]'),item=context.state.purchaseItems[Number(row?.dataset.purchaseRow)];return 'sizes:'+(item?.materialClass||'ADULTOS');}
    const mock=select.dataset.mockupField;if(mock==='garmentStyle')return 'fits';if(mock==='modelName')return 'models';if(mock==='gender')return 'genders';if(mock==='pose')return 'poses';
    if(select.id==='movementCategorySelect')return 'financeReasons';
    if([...select.options].some(option=>option.value==='__other__'))return 'field:'+(select.id||select.name||choice||mock||'opciones');
    return null;
  }
  function decorate(root=document){
    if(!context)return;
    for(const select of root.querySelectorAll('select')){
      if(select.closest('#salmosCatalogDialog'))continue;const key=keyFor(select);if(!key)continue;
      let fallback=[...select.options].filter(option=>option.value&&!option.value.startsWith('__')).map(option=>({value:option.value,label:option.textContent}));
      if(key==='productTypes')fallback=context.typeEntries();
      const current=select.value,empty=[...select.options].find(option=>option.value==='')?.textContent??null;register(key,fallback);
      const html=options(key,current,fallback,empty),fingerprint=key+'|'+html;
      if(select._catalogFingerprint===fingerprint&&[...select.options].some(option=>option.value==='__manage_catalog__'))continue;
      select.innerHTML=html;select.dataset.managedList=key;select.value=current;select._catalogFingerprint=fingerprint;select.dataset.catalogPrevious=current;
    }
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;decorate();});}
  function rowHtml(row={value:'',label:''}){return `<div class="salmos-catalog-row" data-catalog-row data-original="${esc(row.value)}"><input class="input" data-catalog-label value="${esc(row.label)}" placeholder="Nombre de la opción" maxlength="160" aria-label="Nombre de la opción">${dialog.dataset.key==='paperFormats'?`<label>Ancho (mm)<input class="input" type="number" min="1" step=".1" data-catalog-width value="${esc(row.width||'')}"></label><label>Alto (mm)<input class="input" type="number" min="1" step=".1" data-catalog-height value="${esc(row.height||'')}"></label>`:''}<button class="icon-btn" type="button" data-catalog-remove aria-label="Eliminar opción" title="Eliminar opción">×</button></div>`;}
  function syncNative(key,list){
    const settings=context.state.purchaseOptions;
    if(key==='paperFormats'){settings.formatArchive??={};for(const row of list)settings.formatArchive[row.value]={...row};}
    if(key==='productTypes'){settings.typeCatalog=list.map(r=>({code:r.value,label:r.label}));settings.types=list.map(r=>({code:r.value,label:r.label}));}
    if(key==='fits')settings.fitCatalog=list.map(r=>r.value);
    if(key==='classes')settings.classCatalog=list.map(r=>r.value);
    if(key.startsWith('sizes:')){settings.sizeCatalog??={};settings.sizeCatalog[key.slice(6)]=list.map(r=>r.value);}
    if(key==='models'){context.state.mockupCatalog??={};context.state.mockupCatalog.models=list.map(r=>r.value);}
    if(key==='financeReasons')settings.financeReasons=list.map(r=>r.value);
  }
  async function manage(key,source=null){
    context.before?.();
    if(!dialog){dialog=document.createElement('dialog');dialog.id='salmosCatalogDialog';dialog.className='admin-dialog salmos-catalog-dialog';document.body.append(dialog);}
    dialog.dataset.key=key;
    const original=structuredClone(rows(key));
    dialog.innerHTML=`<div class="dialog-shell"><div class="dialog-head"><h2>Administrar · ${esc(titles[key]||'Opciones')}</h2><button class="icon-btn" type="button" data-catalog-close aria-label="Cerrar">×</button></div><div class="dialog-body"><div class="salmos-catalog-rows">${original.map(rowHtml).join('')}</div><button class="btn btn-ghost" type="button" data-catalog-add>+ Agregar opción</button><p class="salmos-catalog-status" role="status"></p></div><div class="dialog-foot"><button class="btn btn-ghost" type="button" data-catalog-close>Cancelar</button><button class="btn btn-primary" type="button" data-catalog-save>Guardar lista</button></div></div>`;
    dialog.querySelector('h2').textContent='Administrar · '+(titles[key]||(key.startsWith('sizes:')?'Talles · '+key.slice(6):'Opciones'));
    dialog.onclick=async event=>{
      if(event.target.closest('[data-catalog-close]'))dialog.close();
      if(event.target.closest('[data-catalog-add]')){dialog.querySelector('.salmos-catalog-rows').insertAdjacentHTML('beforeend',rowHtml());dialog.querySelectorAll('[data-catalog-label]')[dialog.querySelectorAll('[data-catalog-label]').length-1].focus();}
      const remove=event.target.closest('[data-catalog-remove]');if(remove)remove.closest('[data-catalog-row]').remove();
      const save=event.target.closest('[data-catalog-save]');if(!save)return;save.disabled=true;
      const previous=structuredClone(context.state.purchaseOptions),renames=new Map();
      try{
        const list=[...dialog.querySelectorAll('[data-catalog-row]')].map(row=>{
          const name=row.querySelector('[data-catalog-label]').value.trim();if(!name)return null;
          const old=row.dataset.original,prior=original.find(item=>item.value===old),value=stableKeys.has(key)?old||(key==='productTypes'?code(name):'custom_'+crypto.randomUUID().slice(0,12)):name;
          const item={...prior,value,label:name};if(old&&old!==value)renames.set(old,value);
          if(key==='paperFormats'){item.width=Number(row.querySelector('[data-catalog-width]').value);item.height=Number(row.querySelector('[data-catalog-height]').value);if(!(item.width>0&&item.height>0))throw Error('Completá ancho y alto de cada formato.');}
          if(key==='bindingCapacities'&&!(Number(value)>0))throw Error('La capacidad debe ser un número de hojas mayor a cero.');
          return item;
        }).filter(Boolean);
        const seen=new Set();for(const item of list){const k=norm(item.label);if(seen.has(k))throw Error('Hay nombres repetidos.');seen.add(k);}
        context.state.purchaseOptions.managedLists??={};context.state.purchaseOptions.managedLists[key]=list;syncNative(key,list);
        await context.save();context.remap?.(key,renames);await context.refresh?.(key);dialog.close();decorate();
        if(source?.isConnected&&renames.has(source.value)){source.value=renames.get(source.value);source.dispatchEvent(new Event('change',{bubbles:true}));}
        context.toast('Lista guardada','success');
      }catch(error){context.state.purchaseOptions=previous;dialog.querySelector('.salmos-catalog-status').textContent=error.message;}finally{save.disabled=false;}
    };
    dialog.showModal();
  }
  function init(options){context=options;
    register('productTypes',context.typeEntries());
    document.addEventListener('focusin',event=>{if(event.target.matches?.('select[data-managed-list]'))event.target.dataset.catalogPrevious=event.target.value;});
    document.addEventListener('change',event=>{const select=event.target;if(!select.matches?.('select'))return;
      if(['__manage_catalog__','__other__'].includes(select.value)){const key=keyFor(select);if(!key)return;event.preventDefault();event.stopImmediatePropagation();select.value=select.dataset.catalogPrevious||'';manage(key,select).catch(error=>context.toast(error.message,'error'));}
      else if(select.dataset.managedList)select.dataset.catalogPrevious=select.value;
    },true);
    document.addEventListener('click',event=>{const button=event.target.closest('[data-manage-catalog]');if(button){event.preventDefault();manage(button.dataset.manageCatalog).catch(error=>context.toast(error.message,'error'));}});
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});decorate();
  }
  window.SalmosCatalog={init,rows,values,label,options,formats,register,manage,decorate,syncNative,defaultValue};
})();
