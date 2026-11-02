/* Papelería: costos estimados y consumo de materiales reales. */
(() => {
  'use strict';
  const BOOK='custom_libro',PAPER='custom_papel',COVER='custom_tapas',SPIRAL='custom_espiral',STAPLE='custom_grampas';
  const TYPES=[[BOOK,'Libro / cuaderno'],[PAPER,'Papel'],[COVER,'Tapas'],[SPIRAL,'Espiral / gancho'],[STAPLE,'Grampas']];
  const FORMATS={A3:[297,420],A4:[210,297],A5:[148,210],A6:[105,148]},A4_FACTOR={A3:2,A4:1,A5:.5,A6:.25};
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isBookType=type=>[BOOK,'book','notebook','libro','cuaderno'].includes(type);
  const isMaterial=type=>[PAPER,COVER,SPIRAL,STAPLE].includes(type);
  let context;
  function materialInfo(material={}){
    let features=material.features;try{if(!Array.isArray(features))features=JSON.parse(material.features_json||'[]');}catch{features=[];}
    const text=[...(features||[]),material.name||material.material_name||''].join(' | ');
    const get=(re,fallback)=>text.match(re)?.[1]||fallback;
    return {kind:get(/Papel:\s*([^|·]+)/i,material.materialType===COVER||material.material_type===COVER?'Cartulina':'Obra').trim(),gsm:Number(get(/Gramaje:\s*(\d+(?:[.,]\d+)?)/i,material.materialType===COVER||material.material_type===COVER?240:70)),format:get(/Formato:\s*(A[3456])/i,'A4'),finish:get(/Acabado:\s*([^|·]+)/i,'Mate').trim(),faces:/Faz:\s*simple/i.test(text)?'simple':'double',capacity:Number(get(/Capacidad:\s*(\d+)/i,40)),referenceGsm:70};
  }
  function features(meta,type){
    if(type===SPIRAL)return ['Espiral / gancho',`Capacidad: ${Number(meta.capacity)||40} hojas de 70 g`];
    if(type===STAPLE)return ['Grampas'];
    return [`Papel: ${meta.kind||'Obra'}`,`Gramaje: ${Number(meta.gsm)||70} g/m²`,`Formato: ${meta.format||'A4'}`,`Acabado: ${meta.finish||'Mate'}`,`Faz: ${meta.faces==='simple'?'simple':'doble'}`];
  }
  function defaults(rates={}){return {version:1,kind:'Álbum de figuritas',format:'A5',leaves:40,duplex:true,paperId:0,useCovers:true,coverId:0,printCovers:true,binding:'spiral',bindingId:0,staples:2,colorFaces:null,colorRateCents:Math.max(0,Number(rates.colorRateCents??3000)),bwRateCents:Math.max(0,Number(rates.bwRateCents??1000))};}
  function yieldPerSheet(sheetFormat,finishedFormat){const sheet=FORMATS[sheetFormat],finished=FORMATS[finishedFormat];if(!sheet||!finished)return 0;return Math.max(Math.floor(sheet[0]/finished[0])*Math.floor(sheet[1]/finished[1]),Math.floor(sheet[0]/finished[1])*Math.floor(sheet[1]/finished[0]));}
  function calculate(book,materials,quantity=1,stockKind='physical',reserved=[]){
    const b={...defaults(),...book},count=Math.max(1,Math.floor(Number(quantity)||1)),leaves=Number(b.leaves),paper=materials.find(m=>Number(m.id)===Number(b.paperId)),cover=materials.find(m=>Number(m.id)===Number(b.coverId)),binding=materials.find(m=>Number(m.id)===Number(b.bindingId)),p=materialInfo(paper),c=materialInfo(cover),missing=[],warnings=[];
    const needs=new Map(),add=(m,qty,label)=>{if(!m){missing.push(`Elegí ${label}.`);return;}if(!(Number(m.average_cost_cents)>0))missing.push(`Cargá el costo de ${m.name} en Compras.`);needs.set(Number(m.id),(needs.get(Number(m.id))||0)+qty);};
    if(!Number.isSafeInteger(leaves)||leaves<1||leaves>2000)missing.push('Ingresá una cantidad de hojas entre 1 y 2000.');
    const cut=yieldPerSheet(p.format,b.format),coverCut=yieldPerSheet(c.format,b.format);
    if(!cut)missing.push('El formato del papel es menor que el formato del libro.');
    const sheets=cut?Math.ceil(Math.max(0,leaves)/cut):0,faces=sheets*(b.duplex?2:1),colorFaces=b.colorFaces==null?faces:Math.max(0,Math.min(faces,Math.floor(Number(b.colorFaces)||0))),bwFaces=faces-colorFaces;
    if(b.duplex&&p.faces==='simple'&&paper)missing.push('El papel está cargado como simple faz. Cambiá el papel o la impresión.');
    add(paper,sheets,'el papel');
    const coverSheets=b.useCovers&&coverCut?Math.ceil(2/coverCut):0;
    if(b.useCovers){if(!coverCut)missing.push('El formato de las tapas es menor que el del libro.');add(cover,coverSheets,'el material de las tapas');}
    if(b.binding!=='none')add(binding,b.binding==='staples'?Math.max(1,Math.floor(Number(b.staples)||2)):1,b.binding==='staples'?'las grampas':'el espiral / gancho');
    const equivalentLeaves=(Math.max(0,leaves)*p.gsm+(b.useCovers?2*c.gsm:0))/70;
    if(b.binding==='spiral'&&binding){const capacity=materialInfo(binding).capacity;if(equivalentLeaves>capacity)warnings.push(`Capacidad orientativa del gancho: ${capacity} hojas de 70 g. Este armado equivale aproximadamente a ${Math.ceil(equivalentLeaves)} hojas de 70 g, incluidas las tapas. Revisá el tamaño del gancho.`);}
    const colorRate=Math.max(0,Math.round(Number(b.colorRateCents)||0)),bwRate=Math.max(0,Math.round(Number(b.bwRateCents)||0));
    const interiorInk=Math.round((colorFaces*colorRate+bwFaces*bwRate)*(A4_FACTOR[p.format]||1)),coverInk=b.useCovers&&b.printCovers?Math.round(coverSheets*colorRate*(A4_FACTOR[c.format]||1)):0,inkCents=interiorInk+coverInk;
    let materialCents=0;const recipeMaterials=[];
    for(const [id,perUnit] of needs){const m=materials.find(m=>Number(m.id)===id);materialCents+=perUnit*(Number(m.average_cost_cents)||0);recipeMaterials.push({materialId:id,quantity:perUnit});const available=Number(m.stock_qty||0)+Number(reserved.find(row=>Number(row.material_id)===id)?.quantity_used||0);if(stockKind==='physical'&&available+1e-8<perUnit*count)missing.push(`No alcanza ${m.name}: necesitás ${perUnit*count} y hay ${available}.`);}
    return {book:b,sheets,faces,colorFaces,bwFaces,coverSheets,equivalentLeaves,inkCents,interiorInk,coverInk,materialCents:Math.round(materialCents),unitCents:Math.round(materialCents+inkCents),recipeMaterials,missing:[...new Set(missing)],warnings,quantity:count,paperFormat:p.format};
  }
  function field(label,key,value,type='number',extra=''){return `<label class="field">${label}<input class="input" data-book-field="${key}" type="${type}" value="${escape(value)}" ${extra}></label>`;}
  function select(label,key,value,options){return `<label class="field">${label}<select class="select" data-book-field="${key}">${options.map(([id,name])=>`<option value="${escape(id)}" ${String(value)===String(id)?'selected':''}>${escape(name)}</option>`).join('')}</select></label>`;}
  const $=selector=>document.querySelector(selector);
  function current(){return context.state.productionBook??=defaults(context.state.purchaseOptions.bookInk);}
  function plan(){return calculate(current(),context.state.materials,context.virtual()?1:Number($('#productionQuantity')?.value)||1,$('#productionStockKind')?.value,context.state.productionEditingJob?.materials);}
  function refreshSummary(){
    if(!context||!isBookType($('#productionMaterialType')?.value))return;
    const p=plan();context.state.productionMaterialsSelected=p.recipeMaterials;
    const el=$('#bookUsageSummary');if(el)el.innerHTML=`<strong>Por ejemplar:</strong> ${p.book.leaves} hojas finales · ${p.sheets} hojas de papel ${escape(p.paperFormat)} · ${p.faces} caras ${escape(p.paperFormat)} a imprimir (${Number(p.book.leaves)*(p.book.duplex?2:1)} páginas finales)${p.book.useCovers?` · ${p.coverSheets} hoja(s) para las tapas`:''}.<br><strong>Tinta estimada:</strong> ${context.money(p.inkCents)}${p.warnings.length?`<p class="book-capacity-note">${p.warnings.map(escape).join('<br>')}</p>`:''}`;
    const bw=$('#bookBwFaces');if(bw)bw.textContent=p.bwFaces;
    const colors=document.querySelector('[data-book-field="colorFaces"]');if(colors){colors.max=String(p.faces);if(document.activeElement!==colors)colors.value=String(p.colorFaces);}
  }
  function render(){
    if(!context)return;
    const enabled=isBookType($('#productionMaterialType')?.value),dialog=$('#productionDialog');if(dialog)dialog.dataset.book=String(enabled);
    let host=$('#bookProductionPanel');
    if(!host){host=document.createElement('section');host.id='bookProductionPanel';host.className='book-production-panel';$('#productionStockNote')?.after(host);}
    host.hidden=!enabled;window.SalmosBookDigitalAdmin?.render();if(!enabled)return;
    const b=current(),materials=context.state.materials,options=types=>[['','Elegir…'],...materials.filter(m=>types.includes(m.material_type)).map(m=>[m.id,`${m.name} · ${context.money(m.average_cost_cents)} / u`])];
    host.innerHTML=`<div class="book-section-heading"><h3>Libro / cuaderno</h3><button type="button" class="btn btn-ghost" data-book-purchase="${PAPER}">+ Comprar materiales</button></div><div class="book-fields-grid">${select('Línea','kind',b.kind,['Álbum de figuritas','Libros para colorear','Animales por tomos','Cuadernos','Otros libros'].map(x=>[x,x]))}${select('Formato final','format',b.format,Object.keys(FORMATS).map(x=>[x,x]))}${field('Hojas por ejemplar','leaves',b.leaves,'number','min="1" max="2000" step="1"')}${select('Impresión interior','duplex',String(b.duplex),[['true','Doble faz'],['false','Simple faz']])}</div><div class="book-fields-grid book-material-grid">${select('Papel interior','paperId',b.paperId,options([PAPER]))}<button type="button" class="btn btn-ghost book-add-material" data-book-purchase="${PAPER}">+ Papel</button></div><div class="book-section-heading"><label class="book-check"><input type="checkbox" data-book-field="useCovers" ${b.useCovers?'checked':''}>Con tapas</label></div>${b.useCovers?`<div class="book-fields-grid book-material-grid">${select('Material para las tapas','coverId',b.coverId,options([COVER,PAPER]))}<button type="button" class="btn btn-ghost book-add-material" data-book-purchase="${COVER}">+ Tapas</button></div><label class="book-check"><input type="checkbox" data-book-field="printCovers" ${b.printCovers?'checked':''}>Estimar tinta de las tapas a color</label>`:''}<div class="book-fields-grid">${select('Encuadernado','binding',b.binding,[['spiral','Espiral / gancho'],['staples','Grampas'],['none','Sin encuadernar']])}${b.binding!=='none'?select(b.binding==='staples'?'Grampas':'Espiral y capacidad','bindingId',b.bindingId,options([b.binding==='staples'?STAPLE:SPIRAL])):''}${b.binding==='staples'?field('Grampas por ejemplar','staples',b.staples,'number','min="1" step="1"'):''}${b.binding!=='none'?`<button class="btn btn-ghost book-add-material" type="button" data-book-purchase="${b.binding==='staples'?STAPLE:SPIRAL}">+ ${b.binding==='staples'?'Grampas':'Espiral / gancho'}</button>`:''}</div><details class="book-ink-panel" open><summary>Tintas · estimación editable</summary><p>Valores de ejemplo, por cada cara A4 impresa. Podés cambiarlos.</p><div class="book-fields-grid">${field('Color por cara A4 ($)','colorRateCents',(b.colorRateCents/100).toFixed(2),'number','min="0" step=".01"')}${field('Blanco y negro por cara A4 ($)','bwRateCents',(b.bwRateCents/100).toFixed(2),'number','min="0" step=".01"')}${field('Caras '+plan().paperFormat+' a color','colorFaces',b.colorFaces??plan().faces,'number','min="0" step="1"')}<div class="field"><span>Caras ${escape(plan().paperFormat)} B/N</span><strong id="bookBwFaces"></strong></div></div><button type="button" class="btn btn-ghost" data-book-save-rates>Usar estos valores en próximos libros</button></details><div class="book-usage-summary" id="bookUsageSummary" aria-live="polite"></div>`;
    refreshSummary();
  }
  function load(product){
    const saved=product?.mount?.project?.book||product?.production_catalog?.book;
    context.state.productionBook={...defaults(context.state.purchaseOptions.bookInk),...(saved?structuredClone(saved):{})};
    render();
  }
  function costs(){const p=plan(),sale=Math.max(0,Math.round(Number($('#productionSalePrice')?.value||0)*100)),profit=sale-p.unitCents;return {unitCost:p.unitCents,materialCost:p.materialCents,printCost:p.inkCents,baseSale:sale,capSale:0,capCost:0,sale,profit,margin:sale?profit/sale*100:0,lines:[`${p.sheets} hojas de papel ${p.paperFormat} por ejemplar`,`${p.colorFaces} caras color + ${p.bwFaces} B/N`,`Tintas: ${context.money(p.inkCents)} (estimación)`],missing:p.missing,warnings:p.warnings,finalQty:p.quantity,stockKind:$('#productionStockKind')?.value,virtualCost:{cents:null,source:null},bookPlan:p};}
  function purchaseFields(item,index){
    const type=item.materialType;if(!isMaterial(type))return '';
    const meta=item.bookMaterial??=materialInfo(item),input=(label,key,value,kind='text',extra='')=>`<label class="field">${label}<input class="input" type="${kind}" data-book-material="${key}" data-book-row="${index}" value="${escape(value)}" ${extra}></label>`,choose=(label,key,value,values)=>`<label class="field">${label}<select class="select" data-book-material="${key}" data-book-row="${index}">${values.map(x=>`<option value="${escape(x)}" ${String(x)===String(value)?'selected':''}>${escape(x)}</option>`).join('')}</select></label>`;
    if(type===STAPLE)return '<div class="book-purchase-fields"><p>La cantidad se carga en grampas individuales; el precio, por cada grampa.</p></div>';
    if(type===SPIRAL)return `<div class="book-purchase-fields">${choose('Capacidad en hojas de 70 g','capacity',meta.capacity,[40,100])}<small>Una unidad = un espiral / gancho completo.</small></div>`;
    return `<div class="book-purchase-fields">${choose('Tipo de papel','kind',meta.kind,['Obra','Ilustración','Fotográfico','Cartulina','Cartón','Otro'])}${input('Gramaje (g/m²)','gsm',meta.gsm,'number','min="1" step="1"')}${choose('Formato de la hoja','format',meta.format,Object.keys(FORMATS))}${choose('Terminación','finish',meta.finish,['Mate','Brillante','Satinado','Sin terminación'])}${choose('Caras aptas para impresión','faces',meta.faces==='simple'?'Simple faz':'Doble faz',['Simple faz','Doble faz'])}<small>La cantidad y el precio de abajo corresponden a una hoja de este formato.</small></div>`;
  }
  function syncPurchase(item,row){
    if(!isMaterial(item.materialType))return;
    const meta=item.bookMaterial??=materialInfo(item);
    row?.querySelectorAll('[data-book-material]').forEach(input=>{const key=input.dataset.bookMaterial;meta[key]=['gsm','capacity'].includes(key)?Number(input.value):key==='faces'?input.value==='Simple faz'?'simple':'double':input.value;});
    item.features=features(meta,item.materialType);item.name=item.features.join(' · ');
    const title=row?.querySelector('[data-purchase-item-title]');if(title)title.textContent=item.name;
  }
  function init(options){
    context=options;
    document.addEventListener('input',event=>{
      const material=event.target.closest('[data-book-material]');if(material){const item=context.state.purchaseItems[Number(material.dataset.bookRow)];if(item)syncPurchase(item,material.closest('[data-purchase-row]'));}
      const input=event.target.closest('[data-book-field]');if(!input||input.type==='checkbox'||input.tagName==='SELECT')return;
      const key=input.dataset.bookField;current()[key]=['colorRateCents','bwRateCents'].includes(key)?Math.max(0,Math.round(Number(input.value||0)*100)):Number(input.value)||0;
      refreshSummary();context.recalculate();
    });
    document.addEventListener('change',event=>{
      const input=event.target.closest('[data-book-field]');
      if(input&&(input.type==='checkbox'||input.tagName==='SELECT')){const b=current(),key=input.dataset.bookField;b[key]=input.type==='checkbox'?input.checked:key==='duplex'?input.value==='true':['paperId','coverId','bindingId'].includes(key)?Number(input.value):input.value;if(key==='binding')b.bindingId=0;if(key==='paperId'){const paper=context.state.materials.find(m=>Number(m.id)===b.paperId);if(paper)b.duplex=materialInfo(paper).faces!=='simple';b.colorFaces=null;}render();context.recalculate();}
      const material=event.target.closest('[data-book-material]');if(material){const item=context.state.purchaseItems[Number(material.dataset.bookRow)];if(item)syncPurchase(item,material.closest('[data-purchase-row]'));}
    });
    document.addEventListener('click',async event=>{
      const purchase=event.target.closest('[data-book-purchase]');if(purchase){event.preventDefault();try{await context.openPurchase(purchase.dataset.bookPurchase);}catch(error){context.toast(error.message,'error');}}
      if(event.target.closest('[data-book-save-rates]')){context.state.purchaseOptions.bookInk={colorRateCents:current().colorRateCents,bwRateCents:current().bwRateCents};try{await context.saveOptions();context.toast('Valores de tinta guardados.','success');}catch(error){context.toast(error.message,'error');}}
    });
  }
  window.SalmosBook={BOOK,PAPER,COVER,SPIRAL,STAPLE,TYPES,FORMATS,isBookType,isMaterial,materialInfo,features,defaults,yieldPerSheet,calculate,init,render,load,current,plan,costs,refreshSummary,purchaseFields,syncPurchase};
})();
