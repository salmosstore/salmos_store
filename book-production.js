/* Papelería: costos estimados y consumo de materiales reales. */
(() => {
  'use strict';
  const BOOK_VARIANTS=['Libro','Agenda','Libro para colorear','Álbum de figuritas','Cuaderno','Animales por tomos'];
  const BOOK='custom_libro',PAPER='custom_papel',COVER='custom_tapas',SPIRAL='custom_espiral',STAPLE='custom_grampas';
  const TYPES=[[BOOK,'Libro / cuaderno'],[PAPER,'Papel'],[COVER,'Tapas'],[SPIRAL,'Espiral / gancho'],[STAPLE,'Grampas']];
  const FORMATS={A3:[297,420],A4:[210,297],A5:[148,210],A6:[105,148]},A4_FACTOR={A3:2,A4:1,A5:.5,A6:.25};
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isBookType=type=>[BOOK,'book','notebook','libro','cuaderno'].includes(type)||/(?:^|_)(?:libros?|cuadernos?|books?|notebook|agendas?|album)(?:_|$)/.test(norm(type).replace(/[^a-z0-9]+/g,'_'));
  const isMaterial=type=>[PAPER,COVER,SPIRAL,STAPLE].includes(type);
  let context;
  const defaultOption=(key,value)=>window.SalmosCatalog?.defaultValue(key,value)??value;
  function materialInfo(material={}){
    let features=material.features;try{if(!Array.isArray(features))features=JSON.parse(material.features_json||'[]');}catch{features=[];}
    const text=[...(features||[]),material.name||material.material_name||''].join(' | ');
    const get=(re,fallback)=>text.match(re)?.[1]||fallback;
    const formatName=get(/Formato:\s*([^|·]+)/i,defaultOption('paperFormats','A4')).trim(),formatValue=window.SalmosCatalog?.rows('paperFormats').find(row=>row.label===formatName||row.value===formatName)?.value||formatName;
    return {kind:get(/Papel:\s*([^|·]+)/i,material.materialType===COVER||material.material_type===COVER?defaultOption('paperKinds','Cartulina'):defaultOption('paperKinds','Papel común')).trim(),gsm:Number(get(/Gramaje:\s*(\d+(?:[.,]\d+)?)/i,material.materialType===COVER||material.material_type===COVER?240:70)),format:formatValue,finish:get(/Acabado:\s*([^|·]+)/i,defaultOption('paperFinishes','Mate')).trim(),faces:/Faz:\s*simple/i.test(text)?'simple':'double',capacity:Number(get(/Capacidad:\s*(\d+)/i,40)),referenceGsm:70,widthMm:Number(get(/Ancho hoja:\s*([0-9.]+)/i,0)),heightMm:Number(get(/Alto hoja:\s*([0-9.]+)/i,0))};
  }
  function features(meta,type){
    if(type===SPIRAL)return ['Espiral / gancho',`Capacidad: ${Number(meta.capacity)||40} hojas de 70 g`];
    if(type===STAPLE)return ['Grampas'];
    return [`Papel: ${meta.kind||'Obra'}`,`Gramaje: ${Number(meta.gsm)||70} g/m²`,`Formato: ${window.SalmosCatalog?.label('paperFormats',meta.format)||meta.format||'A4'}`,`Ancho hoja: ${(window.SalmosCatalog?.formats(FORMATS)||FORMATS)[meta.format]?.[0]||0} mm`,`Alto hoja: ${(window.SalmosCatalog?.formats(FORMATS)||FORMATS)[meta.format]?.[1]||0} mm`,`Acabado: ${meta.finish||'Mate'}`,`Faz: ${meta.faces==='simple'?'simple':'doble'}`];
  }
  function defaults(rates={}){return {version:1,kind:defaultOption('bookKinds','Álbum de figuritas'),format:defaultOption('paperFormats','A5'),leaves:40,duplex:true,paperId:0,useCovers:true,coverId:0,printCovers:true,binding:'spiral',bindingId:0,staples:2,coverLayers:[],colorFaces:null,colorRateCents:Math.max(0,Number(rates.colorRateCents??3000)),bwRateCents:Math.max(0,Number(rates.bwRateCents??1000))};}
  function yieldPerSheet(sheetFormat,finishedFormat,width=0,height=0){const formats=window.SalmosCatalog?.formats(FORMATS)||FORMATS,sheet=width>0&&height>0?[width,height]:formats[sheetFormat],finished=formats[finishedFormat];if(!sheet||!finished)return 0;return Math.max(Math.floor(sheet[0]/finished[0])*Math.floor(sheet[1]/finished[1]),Math.floor(sheet[0]/finished[1])*Math.floor(sheet[1]/finished[0]));}
  function formatFactor(format,width=0,height=0){const size=width>0&&height>0?[width,height]:(window.SalmosCatalog?.formats(FORMATS)||FORMATS)[format];if(A4_FACTOR[format]&&(!size||size[0]===FORMATS[format][0]&&size[1]===FORMATS[format][1]))return A4_FACTOR[format];return size?size[0]*size[1]/(210*297):1;}
  function normalizeBook(value={}){
    const b={...defaults(),...value};
    b.papers=Array.isArray(value.papers)?value.papers.map(row=>({...row})): [{materialId:Number(b.paperId)||0,quantity:Number(b.leaves)||40,unit:'final',duplex:b.duplex!==false,printMode:b.colorFaces==null?'color':'mixed',colorFaces:b.colorFaces}];
    b.covers=Array.isArray(value.covers)?value.covers.map(row=>({...row})):[{materialId:Number(b.coverId)||0,quantity:2,unit:'final',printFaces:b.printCovers?1:0,color:true},...(b.coverLayers||[]).map(row=>({...row,unit:'source'}))];
    b.version=2;b.coverLayers=[];return b;
  }
  function materialUsageCost(material,units){
    const unitCents=Number(material?.average_cost_cents)||0;
    return unitCents>0?units*unitCents:null;
  }
  function calculate(book,materials,quantity=1,stockKind='physical',reserved=[]){
    const b=normalizeBook(book),count=Math.max(1,Math.floor(Number(quantity)||1)),missing=[],warnings=[],needs=new Map(),colorRate=Math.max(0,Math.round(Number(b.colorRateCents)||0)),bwRate=Math.max(0,Math.round(Number(b.bwRateCents)||0));
    const find=id=>materials.find(m=>Number(m.id)===Number(id));
    const add=(m,qty,label)=>{if(!m){missing.push(`Elegí ${label}.`);return;}if(!(Number(m.average_cost_cents)>0))missing.push(`Cargá el costo de ${m.name} en Compras.`);if(qty>0)needs.set(Number(m.id),(needs.get(Number(m.id))||0)+qty);};
    const usage=(row,cover=false)=>{
      const material=find(row.materialId),meta=materialInfo(material),amount=Number(row.quantity),cut=yieldPerSheet(meta.format,b.format,meta.widthMm,meta.heightMm),label=cover?'el material de las tapas':'el papel interior';
      const validQuantity=amount>0&&Number.isFinite(amount)&&(row.unit==='source'||Number.isSafeInteger(amount));
      if(!validQuantity)missing.push(`Revisá la cantidad de ${cover?'las tapas':'papel'}.`);
      if(!cut)missing.push(`El formato de ${cover?'las tapas':'ese papel'} es menor que el del libro.`);
      const pagesEntered=!cover&&row.unit==='pages';
      const pagesPerLeaf=!cover&&(row.duplex||row.printMode==='none')?2:1;
      const leaves=validQuantity?(row.unit==='source'?amount*cut:pagesEntered?Math.ceil(amount/pagesPerLeaf):amount):0;
      const sheets=validQuantity&&cut?(row.unit==='source'?amount:Math.ceil(leaves/cut)):0;
      const pages=pagesEntered&&validQuantity?amount:leaves*pagesPerLeaf;
      add(material,sheets,label);
      const faces=cover?sheets*Math.max(0,Math.min(2,Number(row.printFaces)||0)):(row.printMode==='none'?0:pagesEntered&&sheets?Math.ceil(pages/cut):sheets*(row.duplex?2:1));
      const incompatiblePrint=Boolean(!cover&&row.duplex&&faces>0&&meta.faces==='simple'&&material);
      if(incompatiblePrint)missing.push(`El papel ${material.name} está cargado como simple faz.`);
      const colorFaces=cover?(row.color===false?0:faces):row.printMode==='bw'?0:row.printMode==='mixed'?Math.max(0,Math.min(faces,Math.floor(Number(row.colorFaces)||0))):faces,bwFaces=faces-colorFaces;
      const inkCents=Math.round((colorFaces*colorRate+bwFaces*bwRate)*formatFactor(meta.format,meta.widthMm,meta.heightMm));
      return {...row,materialName:material?materialLabel(material):'',format:meta.format,sheets,leaves,pages,faces,colorFaces,bwFaces,inkCents,equivalentLeaves:leaves*meta.gsm/70,
        materialCents:sheets>0?materialUsageCost(material,sheets):null,ready:Boolean(material&&validQuantity&&cut&&!incompatiblePrint)};
    };
    if(!b.papers.length)missing.push('Agregá al menos un papel interior.');
    const paperRows=b.papers.map(row=>usage(row)),coverRows=b.useCovers?b.covers.map(row=>usage(row,true)):[];
    if(b.useCovers&&!b.covers.length)missing.push('Agregá el material de las tapas o desmarcá «Con tapas».');
    const sum=(rows,key)=>rows.reduce((total,row)=>total+(Number(row[key])||0),0),leaves=sum(paperRows,'leaves'),sheets=sum(paperRows,'sheets'),faces=sum(paperRows,'faces'),colorFaces=sum(paperRows,'colorFaces'),bwFaces=sum(paperRows,'bwFaces'),coverSheets=sum(coverRows,'sheets'),interiorInk=sum(paperRows,'inkCents'),coverInk=sum(coverRows,'inkCents'),inkCents=interiorInk+coverInk,equivalentLeaves=sum([...paperRows,...coverRows],'equivalentLeaves');
    const binding=find(b.bindingId),stapled=b.binding==='staples',bindingQuantity=stapled?Math.max(1,Math.floor(Number(b.staples)||2)):1;
    const bindingRow=b.binding==='none'?{materialName:'Sin encuadernar',quantity:0,materialCents:0,ready:true}:{materialName:binding?(stapled?materialLabel(binding):`Espiral / gancho · ${materialLabel(binding)}`):'',quantity:bindingQuantity,materialCents:materialUsageCost(binding,bindingQuantity),ready:Boolean(binding)};
    if(b.binding!=='none')add(binding,bindingQuantity,stapled?'las grampas':'el espiral / gancho');
    if(b.binding==='spiral'&&binding&&equivalentLeaves>materialInfo(binding).capacity)warnings.push(`Capacidad orientativa del gancho: ${materialInfo(binding).capacity} hojas de 70 g. Este armado equivale aproximadamente a ${Math.ceil(equivalentLeaves)} hojas, incluidas las tapas.`);
    let materialCents=0;const recipeMaterials=[];
    for(const [id,perUnit] of needs){const material=find(id);materialCents+=perUnit*(Number(material.average_cost_cents)||0);recipeMaterials.push({materialId:id,quantity:perUnit});const available=Number(material.stock_qty||0)+Number(reserved.find(row=>Number(row.material_id)===id)?.quantity_used||0);if(stockKind==='physical'&&available+1e-8<perUnit*count)missing.push(`No alcanza ${material.name}: necesitás ${perUnit*count} y hay ${available}.`);}
    b.leaves=leaves;b.paperId=Number(b.papers[0]?.materialId)||0;b.coverId=Number(b.covers[0]?.materialId)||0;
    return {book:b,paperRows,coverRows,bindingRow,totalLeaves:leaves,totalPages:sum(paperRows,'pages'),sheets,faces,colorFaces,bwFaces,coverSheets,equivalentLeaves,inkCents,interiorInk,coverInk,materialCents:Math.round(materialCents),unitCents:Math.round(materialCents+inkCents),recipeMaterials,missing:[...new Set(missing)],warnings,quantity:count,paperFormat:paperRows[0]?.format||'A4'};
  }
  function materialLabel(item){const type=item.material_type||item.materialType,meta=item.bookMaterial||materialInfo(item);if(type===SPIRAL)return `${meta.capacity} hojas de 70 g`;if(type===STAPLE)return 'Grampas';if([PAPER,COVER].includes(type))return [meta.kind,`${meta.gsm} g`,window.SalmosCatalog?.label('paperFormats',meta.format)||meta.format,meta.finish].filter(Boolean).join(' · ');return item.name||'';}
  function field(label,key,value,type='number',extra=''){return `<label class="field">${label}<input class="input" data-book-field="${key}" type="${type}" value="${escape(value)}" ${extra}></label>`;}
  function select(label,key,value,options){const catalog={kind:'bookKinds',format:'paperFormats',binding:'bindingKinds'}[key];return `<label class="field">${label}<select class="select" data-book-field="${key}" ${catalog?`data-managed-list="${catalog}"`:''}>${catalog&&window.SalmosCatalog?window.SalmosCatalog.options(catalog,value,options):options.map(([id,name])=>`<option value="${escape(id)}" ${String(value)===String(id)?'selected':''}>${escape(name)}</option>`).join('')}</select></label>`;}
  const $=selector=>document.querySelector(selector);
  const confirmedRows=new WeakSet();
  const countLabel=new Intl.NumberFormat('es-AR',{maximumFractionDigits:3});
  const formatLabel=value=>window.SalmosCatalog?.label('paperFormats',value)||value;
  const hiddenMaterialIds=()=>new Set((context.state.purchaseOptions.bookHiddenMaterialIds||[]).map(Number));
  const isConfirmed=(item,group)=>group==='binding'?item.bindingCollapsed===true:confirmedRows.has(item);
  function current(){const saved=context.state.productionBook??defaults(context.state.purchaseOptions.bookInk);if(!Array.isArray(saved.papers)||!Array.isArray(saved.covers))context.state.productionBook=normalizeBook(saved);else context.state.productionBook=saved;return context.state.productionBook;}
  function plan(){return calculate(current(),context.state.materials,context.virtual()?1:Number($('#productionQuantity')?.value)||1,$('#productionStockKind')?.value,context.state.productionEditingJob?.materials);}
  function usageLabel(row,group){
    const name=row?.materialName||'Material pendiente';
    if(!row)return name;
    if(group==='binding')return row.quantity?`${name} · ${countLabel.format(row.quantity)} u`:name;
    const result=group==='covers'?row.leaves:row.pages;
    const unit=group==='covers'?(result===1?'tapa lograda':'tapas logradas'):(result===1?'página lograda':'páginas logradas');
    return `${name} · ${countLabel.format(row.sheets)} ${row.sheets===1?'hoja utilizada':'hojas utilizadas'} · ${countLabel.format(result)} ${unit}`;
  }
  function usageCostLabel(row,quantity,compact=false){
    if(row?.materialCents==null)return 'Costo pendiente';
    const perCopy=context.money(Math.round(row.materialCents));
    if(quantity===1)return `${perCopy} / ej.`;
    const total=`${context.money(Math.round(row.materialCents*quantity))} total`;
    return compact?total:`${total} · ${perCopy} / ej.`;
  }
  function refreshSummary(p){
    if(!context||!isBookType($('#productionMaterialType')?.value))return;
    p??=plan();context.state.productionMaterialsSelected=p.recipeMaterials;
    const groups={papers:p.paperRows,covers:p.coverRows,binding:[p.bindingRow]};
    for(const card of $('#bookProductionPanel')?.querySelectorAll('[data-book-material-group]')||[]){
      const group=card.dataset.bookMaterialGroup,row=groups[group][Number(card.dataset.bookMaterialIndex)];
      const summary=card.querySelector('[data-book-row-summary]'),ok=card.querySelector('[data-book-confirm-row]');
      card.querySelector('[data-book-row-cost]').textContent=usageCostLabel(row,p.quantity,Boolean(summary));
      if(summary)summary.title=summary.textContent=usageLabel(row,group);
      if(ok)ok.disabled=!row?.ready;
      const yieldNote=card.querySelector('[data-book-row-yield]');
      if(yieldNote)yieldNote.textContent=row?.materialName?`${countLabel.format(row.sheets)} ${row.sheets===1?'hoja utilizada':'hojas utilizadas'} ${formatLabel(row.format)} · ${countLabel.format(group==='covers'?row.leaves:row.pages)} ${group==='covers'?'tapas':'páginas'} ${formatLabel(p.book.format)}`:'Elegí el material para calcular el rendimiento.';
    }
    const el=$('#bookUsageSummary');if(el)el.innerHTML=`<strong>Por ejemplar</strong> · ${countLabel.format(p.totalPages)} páginas interiores logradas · ${countLabel.format(p.sheets)} hojas utilizadas para el interior${p.book.useCovers?` · ${countLabel.format(p.coverSheets)} para las tapas`:''}.<ul>${Object.entries(groups).flatMap(([group,rows])=>rows.map(row=>`<li>${escape(usageLabel(row,group))} · <strong>${escape(usageCostLabel(row,p.quantity))}</strong></li>`)).join('')}</ul>${p.inkCents?`<strong>Tinta estimada</strong> · ${context.money(p.inkCents)}`:''}${p.warnings.length?`<p class="book-capacity-note">${p.warnings.map(escape).join('<br>')}</p>`:''}`;
  }
  function materialRow(group,index,item,title,fields){
    const attrs=`data-book-material-group="${group}" data-book-material-index="${index}"`;
    const cost='<strong class="book-row-cost" data-book-row-cost></strong>',label=escape(title);
    if(isConfirmed(item,group))return `<div class="book-material-row is-confirmed" ${attrs}>
      <div class="book-row-compact"><span class="book-row-compact-info" data-book-row-summary></span>${cost}<button type="button" class="icon-btn" data-book-edit-row aria-label="Editar ${label}" title="Editar ${label}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button></div>
    </div>`;
    const remove=group==='binding'?'':`<button type="button" class="icon-btn" data-book-remove-row="${group}" data-book-row-index="${index}" aria-label="Quitar ${label}" title="Quitar ${label}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>`;
    return `<div class="book-material-row" ${attrs}>
      <div class="book-row-heading"><strong>${label}</strong><div class="book-row-actions">${cost}<button type="button" class="btn btn-primary" data-book-confirm-row aria-label="OK · ${label}" disabled>OK</button>${remove}</div></div>
      ${fields}
    </div>`;
  }
  function render(){
    if(!context)return;
    const enabled=isBookType($('#productionMaterialType')?.value),dialog=$('#productionDialog');if(dialog)dialog.dataset.book=String(enabled);
    let host=$('#bookProductionPanel');if(!host){host=document.createElement('section');host.id='bookProductionPanel';host.className='book-production-panel';$('#productionStockNote')?.after(host);}
    let variant=$('#productionBookVariantField');if(!variant){variant=document.createElement('label');variant.id='productionBookVariantField';variant.className='field production-book-variant-field';$('.production-type-field')?.after(variant);}variant.hidden=!enabled;
    host.hidden=!enabled;window.SalmosBookDigitalAdmin?.render();if(!enabled)return;
    const kind=current().kind,variantMarkup=document.createElement('template');variantMarkup.innerHTML=select('Variante','kind',kind,BOOK_VARIANTS.map(value=>[value,value]));variant.replaceChildren(...variantMarkup.content.firstElementChild.childNodes);

    const b=current(),materials=context.state.materials,hidden=hiddenMaterialIds();
    const options=(types,selected)=>[['','Elegir…'],...materials.filter(m=>(types.includes(m.material_type)&&!hidden.has(Number(m.id)))||Number(m.id)===Number(selected)).map(m=>[m.id,`${materialLabel(m)} · ${context.money(m.average_cost_cents)} / u${hidden.has(Number(m.id))?' · oculto':''}`])];
    const inkOpen=host.querySelector('.book-ink-panel')?.open??true;
    const rowField=(group,index,key,label,value,attrs='')=>`<label class="field">${label}<input class="input" type="number" data-book-row-group="${group}" data-book-row-index="${index}" data-book-row-field="${key}" value="${escape(value)}" aria-label="${escape(label)}" ${attrs}></label>`;
    const rowSelect=(group,index,key,label,value,choices)=>`<label class="field">${label}<select class="select" data-book-row-group="${group}" data-book-row-index="${index}" data-book-row-field="${key}">${choices.map(([id,name])=>`<option value="${escape(id)}" ${String(id)===String(value)?'selected':''}>${escape(name)}</option>`).join('')}</select></label>`;
    const rows=(group,cover=false)=>b[group].map((row,index)=>{
      const title=`${cover?'Tapas':'Papel interior'} ${index+1}`;
      if(confirmedRows.has(row))return materialRow(group,index,row,title,'');
      const choices=options(cover?[COVER,PAPER]:[PAPER],row.materialId);
      const numberAttrs=row.unit==='source'?'min=".001" step="any" inputmode="decimal"':'min="1" step="1" inputmode="numeric"';
      const units=cover?[['source','Hojas utilizadas'],['final','Tapas logradas']]:[['source','Hojas utilizadas'],['pages','Páginas logradas'],['final','Hojas logradas']];
      const ink=cover
        ?rowSelect(group,index,'printFaces','Caras impresas por hoja',row.printFaces,[[0,'Sin imprimir'],[1,'Una cara'],[2,'Dos caras']])+(Number(row.printFaces)>0?rowSelect(group,index,'color','Tinta',row.color===false?'bw':'color',[['color','Color'],['bw','Blanco y negro']]):'')
        :rowSelect(group,index,'printMode','Impresión',row.printMode,[['color','Color'],['bw','Blanco y negro'],['mixed','Color y blanco y negro'],['none','Sin imprimir']])+(row.printMode!=='none'?`<label class="book-check"><input type="checkbox" data-book-row-group="${group}" data-book-row-index="${index}" data-book-row-field="duplex" ${row.duplex?'checked':''}>Doble faz</label>`:'')+(row.printMode==='mixed'?rowField(group,index,'colorFaces','Caras a color de las hojas utilizadas',row.colorFaces??0,'min="0" step="1"'):'');
      const fields=`<div class="book-row-fields">
        ${rowSelect(group,index,'materialId','Material',row.materialId,choices)}
        ${rowSelect(group,index,'unit','¿Qué querés contar?',row.unit,units)}
        ${rowField(group,index,'quantity','Cantidad por ejemplar',row.quantity,numberAttrs)}
        ${ink}
      </div><small class="book-row-yield" data-book-row-yield></small>`;
      return materialRow(group,index,row,title,fields);
    }).join('');
    const stapled=b.binding==='staples';
    const bindingOptions=select('Encuadernado','binding',b.binding,[['spiral','Espiral / gancho'],['staples','Grampas'],['none','Sin encuadernar']]);
    const bindingFields=`<div class="book-fields-grid">${bindingOptions}${b.binding!=='none'?`${select(stapled?'Grampas':'Espiral y capacidad','bindingId',b.bindingId,options(stapled?[STAPLE]:[SPIRAL],b.bindingId))}${stapled?field('Grampas por ejemplar','staples',b.staples,'number','min="1" step="1"'):''}<button class="btn btn-ghost book-add-material" type="button" data-book-purchase="${stapled?STAPLE:SPIRAL}">Comprar ${stapled?'grampas':'espirales'}</button>`:''}</div>`;
    const binding=materialRow('binding',0,b,'Encuadernado',bindingFields);
    const prints=b.papers.some(row=>row.printMode!=='none')||b.useCovers&&b.covers.some(row=>Number(row.printFaces)>0);
    host.innerHTML=`<div class="book-section-heading"><h3>Libro / cuaderno</h3><div class="book-row-actions"><button type="button" class="btn btn-ghost" data-book-manage-materials>Administrar materiales</button><button type="button" class="btn btn-ghost" data-book-purchase="${PAPER}">Comprar materiales</button></div></div>
      <div class="book-fields-grid">${select('Formato final','format',b.format,Object.keys(FORMATS).map(x=>[x,x]))}</div>
      <div class="book-section-heading"><h4>Papeles interiores</h4><button type="button" class="btn btn-ghost" data-book-add-row="papers">+ Papel</button></div>${rows('papers')}
      <div class="book-section-heading"><label class="book-check"><input type="checkbox" data-book-field="useCovers" ${b.useCovers?'checked':''}>Con tapas</label>${b.useCovers?'<button type="button" class="btn btn-ghost" data-book-add-row="covers">+ Tapas</button>':''}</div>${b.useCovers?rows('covers',true):''}
      ${binding}
      <details class="book-ink-panel" ${inkOpen?'open':''} ${prints?'':'hidden'}><summary>Tintas · estimación editable</summary><p>Precio por cada cara A4 impresa.</p><div class="book-fields-grid">${field('Color por cara A4 ($)','colorRateCents',(b.colorRateCents/100).toFixed(2),'number','min="0" step=".01"')}${field('Blanco y negro por cara A4 ($)','bwRateCents',(b.bwRateCents/100).toFixed(2),'number','min="0" step=".01"')}</div><button type="button" class="btn btn-ghost" data-book-save-rates>Usar estos valores en próximos libros</button></details>
      <div class="book-usage-summary" id="bookUsageSummary" aria-live="polite"></div>`;
    refreshSummary();
  }
  function load(product){
    const saved=product?.mount?.project?.book||product?.production_catalog?.book;
    context.state.productionBook=normalizeBook({...defaults(context.state.purchaseOptions.bookInk),...(saved?structuredClone(saved):{})});
    render();
  }
  function costs(){const p=plan(),sale=Math.max(0,Math.round(Number($('#productionSalePrice')?.value||0)*100)),profit=sale-p.unitCents;return {unitCost:p.unitCents,materialCost:p.materialCents,printCost:p.inkCents,baseSale:sale,capSale:0,capCost:0,sale,profit,margin:sale?profit/sale*100:0,lines:[`${p.sheets} hojas de papel ${p.paperFormat} por ejemplar`,`${p.colorFaces} caras color + ${p.bwFaces} B/N`,`Tintas: ${context.money(p.inkCents)} (estimación)`],missing:p.missing,warnings:p.warnings,finalQty:p.quantity,stockKind:$('#productionStockKind')?.value,virtualCost:{cents:null,source:null},bookPlan:p};}
  function purchaseFields(item,index){
    const type=item.materialType;if(!isMaterial(type))return '';
    const meta=item.bookMaterial??=materialInfo(item),C=window.SalmosCatalog,
      input=(label,key,value,kind='text',extra='')=>`<label class="field">${label}<input class="input" type="${kind}" data-book-material="${key}" data-book-row="${index}" value="${escape(value)}" ${extra}></label>`,
      choose=(label,key,value,values,catalog)=>`<label class="field">${label}<select class="select" data-book-material="${key}" data-book-row="${index}" data-managed-list="${catalog}">${C?C.options(catalog,value,values):values.map(x=>`<option value="${escape(x)}" ${String(x)===String(value)?'selected':''}>${escape(x)}</option>`).join('')}</select></label>`;
    if(type===STAPLE)return '<div class="book-purchase-fields"><p>Podés comprar por unidad o por pack.</p></div>';
    if(type===SPIRAL)return `<div class="book-purchase-fields">${choose('Capacidad en hojas de 70 g','capacity',meta.capacity,[40,100],'bindingCapacities')}<small>La capacidad es orientativa; podés administrar la lista.</small></div>`;
    return `<div class="book-purchase-fields">${choose('Tipo de papel / cartón','kind',meta.kind,['Papel común','Obra','Ilustración','Autoadhesivo','Autoadhesivo fotográfico','Fotográfico','Cartulina','Cartón','Papel para forrar'],'paperKinds')}${input('Gramaje (g/m²)','gsm',meta.gsm,'number','min="1" step="1"')}${choose('Formato de la hoja','format',meta.format,Object.keys(FORMATS),'paperFormats')}${choose('Terminación','finish',meta.finish,['Mate','Brillante','Satinado','Sin terminación'],'paperFinishes')}<label class="book-check"><input type="checkbox" data-book-material="faces" data-book-row="${index}" ${meta.faces==='double'?'checked':''}>Apto para doble faz</label></div>`;
  }
  function syncPurchase(item,row){
    if(!isMaterial(item.materialType))return;
    const meta=item.bookMaterial??=materialInfo(item);
    row?.querySelectorAll('[data-book-material]').forEach(input=>{const key=input.dataset.bookMaterial;meta[key]=['gsm','capacity'].includes(key)?Number(input.value):key==='faces'?(input.type==='checkbox'?input.checked:input.value==='Doble faz')?'double':'simple':input.value;});
    item.features=features(meta,item.materialType);item.name=item.features.join(' · ');
    const title=row?.querySelector('[data-purchase-item-title]');if(title)title.textContent=context?.title?context.title(item,Number(row.dataset.purchaseRow)):item.name;
  }
  function manageMaterials(){
    const dialog=context.dialog('bookMaterialsDialog','Administrar materiales de libros');
    const hidden=hiddenMaterialIds(),materials=context.state.materials.filter(m=>isMaterial(m.material_type));
    const body=dialog.querySelector('.dialog-body');
    body.innerHTML=`<form class="book-material-manager"><p class="muted">Elegí qué insumos aparecen al armar libros. Las recetas guardadas conservan sus materiales.</p><fieldset><legend>Mostrar al armar libros</legend>${materials.map(m=>`<label class="book-check"><input type="checkbox" value="${Number(m.id)}" ${hidden.has(Number(m.id))?'':'checked'}><span>${escape(materialLabel(m))} · ${escape(context.money(m.average_cost_cents))} / u</span></label>`).join('')||'<p>Todavía no hay materiales de libros en Compras.</p>'}</fieldset><button type="submit" class="btn btn-primary">Guardar lista</button></form>`;
    const form=body.querySelector('form'),save=form.querySelector('button');
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(save.disabled)return;
      save.disabled=true;
      const ids=Array.from(form.querySelectorAll('input')).filter(input=>!input.checked).map(input=>Number(input.value));
      const previous=context.state.purchaseOptions.bookHiddenMaterialIds;
      context.state.purchaseOptions.bookHiddenMaterialIds=ids;
      try{await context.saveOptions();render();dialog.close();context.toast('Lista de materiales guardada.','success');}
      catch(error){context.state.purchaseOptions.bookHiddenMaterialIds=previous;context.toast(error.message,'error');}
      finally{save.disabled=false;}
    });
    dialog.showModal();
  }
  function init(options){
    context=options;window.SalmosCatalog?.register('paperFormats',Object.entries(FORMATS).map(([value,size])=>({value,label:value,width:size[0],height:size[1]})));
    const updateRow=input=>{const row=current()[input.dataset.bookRowGroup]?.[Number(input.dataset.bookRowIndex)];if(!row)return;const key=input.dataset.bookRowField;row[key]=input.type==='checkbox'?input.checked:key==='color'?input.value!=='bw':['materialId','quantity','printFaces','colorFaces'].includes(key)?Number(input.value):input.value;if(key==='materialId'){const material=context.state.materials.find(m=>Number(m.id)===Number(row.materialId));if(material&&materialInfo(material).faces==='simple')row.duplex=false;}refreshSummary();context.recalculate();};
    document.addEventListener('input',event=>{if(event.target.matches('[data-book-row-field]')&&event.target.tagName!=='SELECT'&&event.target.type!=='checkbox'){updateRow(event.target);return;}
      const material=event.target.closest('[data-book-material]');if(material){const item=context.state.purchaseItems[Number(material.dataset.bookRow)];if(item)syncPurchase(item,material.closest('[data-purchase-row]'));}
      const input=event.target.closest('[data-book-field]');if(!input||input.type==='checkbox'||input.tagName==='SELECT')return;
      const key=input.dataset.bookField;current()[key]=['colorRateCents','bwRateCents'].includes(key)?Math.max(0,Math.round(Number(input.value||0)*100)):Number(input.value)||0;
      refreshSummary();context.recalculate();
    });
    document.addEventListener('change',event=>{if(event.target.matches('[data-book-row-field]')){if(event.target.tagName==='SELECT'||event.target.type==='checkbox'){updateRow(event.target);render();}return;}
      const input=event.target.closest('[data-book-field]');
      if(input&&(input.type==='checkbox'||input.tagName==='SELECT')){const b=current(),key=input.dataset.bookField;b[key]=input.type==='checkbox'?input.checked:key==='duplex'?input.value==='true':['paperId','coverId','bindingId'].includes(key)?Number(input.value):input.value;if(key==='binding')b.bindingId=0;if(key==='paperId'){const paper=context.state.materials.find(m=>Number(m.id)===b.paperId);if(paper)b.duplex=materialInfo(paper).faces!=='simple';b.colorFaces=null;}render();context.recalculate();if(key==='kind')context.galleryChanged?.();}
      const material=event.target.closest('[data-book-material]');if(material){const item=context.state.purchaseItems[Number(material.dataset.bookRow)];if(item)syncPurchase(item,material.closest('[data-purchase-row]'));}
    });
    document.addEventListener('click',async event=>{
      const toggle=event.target.closest('[data-book-confirm-row],[data-book-edit-row]');
      if(toggle){
        const card=toggle.closest('[data-book-material-group]'),group=card.dataset.bookMaterialGroup,index=Number(card.dataset.bookMaterialIndex),book=current();
        const row=group==='binding'?book:book[group][index],confirming=toggle.hasAttribute('data-book-confirm-row');
        if(group==='binding')book.bindingCollapsed=confirming;
        else if(confirming)confirmedRows.add(row);else confirmedRows.delete(row);
        render();
        if(group==='binding')context.recalculate();
        const next=$(`[data-book-material-group="${group}"][data-book-material-index="${index}"]`);
        next?.querySelector(confirming?'[data-book-edit-row]':'select')?.focus({preventScroll:true});
        return;
      }
      const add=event.target.closest('[data-book-add-row]');if(add){const group=add.dataset.bookAddRow;current()[group].push(group==='papers'?{materialId:0,quantity:1,unit:'source',duplex:false,printMode:'none',colorFaces:0}:{materialId:0,quantity:2,unit:'final',printFaces:0,color:true});render();context.recalculate();return;}
      const remove=event.target.closest('[data-book-remove-row]');if(remove){current()[remove.dataset.bookRemoveRow].splice(Number(remove.dataset.bookRowIndex),1);render();context.recalculate();return;}
      if(event.target.closest('[data-book-manage-materials]')){manageMaterials();return;}
      const purchase=event.target.closest('[data-book-purchase]');if(purchase){event.preventDefault();try{await context.openPurchase(purchase.dataset.bookPurchase);}catch(error){context.toast(error.message,'error');}}
      if(event.target.closest('[data-book-save-rates]')){context.state.purchaseOptions.bookInk={colorRateCents:current().colorRateCents,bwRateCents:current().bwRateCents};try{await context.saveOptions();context.toast('Valores de tinta guardados.','success');}catch(error){context.toast(error.message,'error');}}
    });
  }
  window.SalmosBook={BOOK,BOOK_VARIANTS,PAPER,COVER,SPIRAL,STAPLE,TYPES,FORMATS,isBookType,isMaterial,materialInfo,features,defaults,normalizeBook,yieldPerSheet,calculate,init,render,load,current,plan,costs,refreshSummary,purchaseFields,syncPurchase,materialLabel};
})();
