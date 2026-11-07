(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=(selector,root=document)=>root.querySelector(selector);
  const all=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const materials=[['textile','DTF Textil'],['uv','DTF UV']];
  const kinds=[['all','Todos los pedidos'],['clothing','Productos por pedido'],['dtf','DTF']];
  const finishes=[['estampada','Estampado'],['lisa','Liso']];
  const modalities=[['sheet','Por plancha'],['individual','Diseño individual']];
  const fileModes=[['ready','Archivo listo'],['configure','Archivo a configurar']];
  const benefits=[['percent','Porcentaje (%)'],['fixed','Descuento por unidad ($)'],['unit_price','Precio final por unidad ($)']];
  const priceTitles={sheet:'DTF por plancha',individual:'Precios por diseño individual',products:'Productos personalizados'};
  const options=(rows,current='')=>rows.map(([value,label])=>
    `<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`).join('');
  const labelOf=(rows,value)=>rows.find(row=>row[0]===value)?.[1]||value;
  const money=cents=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(cents||0)/100);
  const amount=cents=>cents==null?'A cotizar':money(cents);
  let types=[],sourceRules=[],context,host,policyState,busy=false;

  function priceTable(section,editing=false) {
    const products=section==='products',individual=section==='individual';
    const headings=products?['Producto','Personalizado','Liso']:['Material','Archivo listo','A configurar'];
    const rows=products?types.map(type=>[type.label,'products',type.code,['printedCents','plainCents']]):
      materials.map(([code,label])=>[
        individual?label:label+(code==='uv'?' · medio metro':' · metro'),
        'dtf',code,individual?['individualReadyCents','individualConfigureCents']:['readyCents','configureCents']
      ]);
    const prefix=editing?'custom':'saved';
    return `<div class="${prefix}-price-table"><div class="${prefix}-price-row ${prefix}-price-heading">${headings.map(text=>`<span>${text}</span>`).join('')}</div>
      ${rows.map(([label,group,code,fields])=>`<div class="${prefix}-price-row"><strong>${esc(label)}</strong>${fields.map((field,index)=>{
        const cents=policyState[group][code]?.[field];
        if (!editing) return `<span>${amount(cents)}</span>`;
        return `<label><span class="sr-only">${esc(label)} · ${headings[index+1]}</span><input class="input" type="number"
          min="0" max="10000000" step=".01" data-custom-price="${esc([group,code,field].join('.'))}"
          value="${cents==null?'':cents/100}" ${products?'placeholder="A cotizar"':'required'}></label>`;
      }).join('')}</div>`).join('')}</div>`;
  }
  function editPriceButton(section,label) {
    return `<button class="btn btn-ghost" type="button" data-edit-custom-prices="${section}">${label}</button>`;
  }
  function discountDescription(row) {
    if (row.benefit==='percent') return `${row.value}% de descuento`;
    return row.benefit==='unit_price'?`${money(row.value)} por unidad`:`${money(row.value)} menos por unidad`;
  }
  function productOptions(current='') {
    const entries=types.map(type=>[type.code,type.label]);
    if(current&&!entries.some(([code])=>code===current))entries.push([current,current]);
    return entries;
  }
  function discountRow(row={}) {
    const benefit=row.benefit||'percent',typesForRule=[
      ...productOptions(/^dtf_/.test(row.type||'')?'':row.type),['dtf_textile','DTF Textil'],['dtf_uv','DTF UV']
    ];
    return `<fieldset class="custom-discount-row" data-custom-discount><legend>Descuento por cantidad</legend>
      <div class="form-grid">
        <label class="field">Nombre<input class="input" data-discount-name value="${esc(row.name||'')}" required maxlength="100"></label>
        <label class="field">Aplicar a<select class="select" data-discount-type>${options([['','Todos los personalizados'],...typesForRule],row.type)}</select></label>
        <label class="field">Desde (unidades / planchas)<input class="input" type="number" min="1" max="10000" step="1" data-discount-minimum value="${Number(row.minimum)||5}" required></label>
        <label class="field">Beneficio<select class="select" data-discount-benefit>${options(benefits,benefit)}</select></label>
        <label class="field"><span data-discount-value-label>${benefit==='percent'?'Porcentaje (%)':'Importe ($)'}</span><input class="input" type="number" min="0" step=".01" data-discount-value value="${row.value==null?'':benefit==='percent'?row.value:row.value/100}" required></label>
        <label class="toggle-label"><input type="checkbox" data-discount-active ${row.active===false?'':'checked'}> Activo</label>
      </div>
    </fieldset>`;
  }
  function conditionScope(rule) {
    if (rule.kind==='all') return labelOf(kinds,rule.kind);
    if (rule.kind==='clothing') {
      return [types.find(type=>type.code===rule.productType)?.label||rule.productType||'Todos los productos',
        labelOf(finishes,rule.finish)].filter(Boolean).join(' · ');
    }
    return [labelOf(materials,rule.dtfMaterial)||'Todo DTF',labelOf(modalities,rule.dtfSubtype),
      labelOf(fileModes,rule.fileMode)].filter(Boolean).join(' · ');
  }
  function ruleActions(kind,index,active) {
    return `<div class="saved-rule-actions">
      <button class="btn btn-ghost" type="button" data-edit-custom-${kind}="${index}">Editar</button>
      <button class="btn btn-ghost" type="button" data-toggle-custom-${kind}="${index}">${active?'Pausar':'Activar'}</button>
      <button class="btn btn-danger" type="button" data-delete-custom-${kind}="${index}">Eliminar</button>
    </div>`;
  }
  function ruleStatus(row) {
    return `<span class="status ${row.active?'success':'warning'}">${row.active?'Activo':'Pausado'}</span>`;
  }
  function html(settings) {
    policyState=window.SalmosOrderPricing.normalize(settings.custom_pricing_v1||'{}');
    types=window.SalmosOrderPricing.productTypes(settings.admin_purchase_options_v2||'{}');
    try { sourceRules=JSON.parse(settings.automatic_promotions||'[]').filter(rule=>rule.trigger==='quantity'&&rule.target==='products'); }
    catch { sourceRules=[]; }
    return `<section class="settings-card custom-pricing-settings">
      <div class="settings-card-heading"><h3>Precios y condiciones del pedido</h3></div>
      <div class="settings-card-heading custom-price-tools"><h4>${priceTitles.sheet}</h4>${editPriceButton('sheet','Editar precios por plancha')}</div>
      ${priceTable('sheet')}
      <details class="custom-price-individual" data-custom-price-section="individual">
        <summary>${priceTitles.individual}</summary>
        <div class="custom-price-tools">${editPriceButton('individual','Editar precios por diseño')}</div>
        ${priceTable('individual')}
      </details>
      <details class="custom-product-prices" data-custom-price-section="products" open>
        <summary>${priceTitles.products}</summary>
        <div class="custom-price-tools">${editPriceButton('products','Editar precios de productos')}</div>
        ${priceTable('products')}
      </details>
      <div class="settings-card-heading"><h4>Condiciones del pedido</h4><button class="btn btn-secondary" type="button" data-add-custom-condition>+ Condición</button></div>
      <p>En «Solicitar por pedido», el cliente ve las condiciones activas que coinciden con su selección.</p>
      <div class="saved-rules-grid">${policyState.conditions.map((row,index)=>`<article class="saved-rule-card">
        <header><h4>${esc(conditionScope(row))}</h4>${ruleStatus(row)}</header>
        <p class="custom-condition-copy">${esc(row.text)}</p>${ruleActions('condition',index,row.active)}
      </article>`).join('')||'<p class="settings-empty">Todavía no hay condiciones cargadas.</p>'}</div>
      <div class="settings-card-heading"><h4>Descuentos de personalizados</h4><button class="btn btn-secondary" type="button" data-add-custom-discount>+ Descuento</button></div>
      <div class="saved-rules-grid">${policyState.discounts.map((row,index)=>`<article class="saved-rule-card">
        <header><h4>${esc(row.name)}</h4>${ruleStatus(row)}</header><strong class="saved-rule-benefit">${esc(discountDescription(row))}</strong>
        <p>Desde ${row.minimum} unidades / planchas · ${esc(types.find(type=>type.code===row.type)?.label||({dtf_textile:'DTF Textil',dtf_uv:'DTF UV'}[row.type])||'Todos los personalizados')}</p>
        ${ruleActions('discount',index,row.active)}
      </article>`).join('')||'<p class="settings-empty">Todavía no hay descuentos propios de personalizados.</p>'}</div>
      ${sourceRules.length?`<div class="custom-discount-tools"><select class="select" data-custom-promo-source><option value="">Copiar una promoción existente…</option>
        ${sourceRules.map((row,index)=>`<option value="${index}">${esc(row.name)}</option>`).join('')}</select>
        <button class="btn btn-ghost" type="button" data-import-custom-promo>Agregar desde promoción</button></div>`:''}
    </section>`;
  }
  function collect(root) {
    const value=structuredClone(policyState);
    for (const input of all('[data-custom-price]',root)) {
      const [group,key,field]=input.dataset.customPrice.split('.');
      value[group][key]??={};
      value[group][key][field]=input.value===''?null:Math.round(Number(input.value)*100);
    }
    return value;
  }
  async function persist(next) {
    const panel=host;
    await context.save(window.SalmosOrderPricing.normalize(next),policyState);
    if (!panel.isConnected || panel!==host) return;
    const open=new Map(all('[data-custom-price-section]',panel).map(detail=>[detail.dataset.customPriceSection,detail.open]));
    const temp=document.createElement('div');
    temp.innerHTML=html(context.settings());
    panel.innerHTML=temp.firstElementChild.innerHTML;
    for(const detail of all('[data-custom-price-section]',panel))detail.open=open.get(detail.dataset.customPriceSection);
  }
  function openEditor(title,body,label,success,read) {
    const dialog=context.dialog('customPricingEditor38',title);
    dialog.classList.add('settings-editor38');
    $('.dialog-body',dialog).innerHTML=`<form>${body}<div class="settings-editor-actions">
      <button class="btn btn-ghost" type="button" data-cancel-custom-editor>Cancelar</button>
      <button class="btn btn-primary" type="submit">${label}</button>
    </div></form>`;
    const form=$('form',dialog),button=$('[type="submit"]',form);
    $('[data-cancel-custom-editor]',form).onclick=()=>{if(!busy)dialog.close();};
    form.onsubmit=async event=>{
      event.preventDefault();
      if(busy)return;
      try {
        busy=true;
        button.disabled=true;
        await persist(read(form));
        dialog.close();
        context.toast(success,'success');
      } catch(error) {
        context.toast(error.message,'error');
      } finally {
        busy=false;
        button.disabled=false;
      }
    };
    dialog.showModal();
    return form;
  }
  function openPrices(section) {
    if(!Object.hasOwn(priceTitles,section))return;
    const hint=section==='products'?'Dejá vacío un importe si ese producto se cotiza a pedido.':'Ingresá los importes en pesos.';
    openEditor('Editar precios · '+priceTitles[section],`<p class="muted">${hint}</p>${priceTable(section,true)}`,
      'Guardar precios','Precios guardados',collect);
  }
  function openDiscount(index=-1,copy=null) {
    const current=index>=0?policyState.discounts[index]:copy||{};
    const form=openEditor(index>=0?'Editar descuento de personalizados':'Nuevo descuento de personalizados',
      discountRow(current),'Guardar descuento','Descuento guardado',editor=>{
        const benefit=$('[data-discount-benefit]',editor).value;
        const value=Number($('[data-discount-value]',editor).value);
        const discount={
          id:current.id||crypto.randomUUID(),
          name:$('[data-discount-name]',editor).value.trim(),
          type:$('[data-discount-type]',editor).value,
          minimum:Number($('[data-discount-minimum]',editor).value),
          benefit,
          value:benefit==='percent'?value:Math.round(value*100),
          active:$('[data-discount-active]',editor).checked
        };
        return withRule('discounts',index,discount);
      });
    $('[data-discount-benefit]',form).onchange=event=>{
      $('[data-discount-value-label]',form).textContent=event.target.value==='percent'?'Porcentaje (%)':'Importe ($)';
      $('[data-discount-value]',form).value='';
    };
  }
  function withRule(collection,index,rule) {
    const next=structuredClone(policyState);
    if(index<0)next[collection].push(rule);
    else next[collection][index]=rule;
    return next;
  }
  function openCondition(index=-1) {
    const row=index>=0?policyState.conditions[index]:{kind:'all'};
    const select=(key,label,values)=>`<label class="field">${label}<select class="select" name="${key}">${options(values,row[key])}</select></label>`;
    const body=`<div class="form-grid">
      ${select('kind','Mostrar en',kinds)}
      <div class="form-grid full custom-condition-fields" data-condition-fields="clothing" ${row.kind==='clothing'?'':'hidden'}>
        ${select('productType','Producto',[['','Todos los productos'],...productOptions(row.productType)])}
        ${select('finish','Terminación',[['','Cualquier terminación'],...finishes])}
      </div>
      <div class="form-grid full custom-condition-fields" data-condition-fields="dtf" ${row.kind==='dtf'?'':'hidden'}>
        ${select('dtfMaterial','Material',[['','Textil y UV'],...materials])}
        ${select('dtfSubtype','Modalidad',[['','Cualquier modalidad'],...modalities])}
        ${select('fileMode','Preparación',[['','Cualquier preparación'],...fileModes])}
      </div>
      <label class="field full">Texto para el cliente<textarea class="textarea" name="text" rows="4" maxlength="600" required placeholder="Por ejemplo, las tazas personalizadas se preparan en 72 horas.">${esc(row.text||'')}</textarea></label>
      <label class="toggle-label"><input type="checkbox" name="active" ${row.active===false?'':'checked'}> Activa</label>
    </div>`;
    const form=openEditor(index>=0?'Editar condición':'Nueva condición',body,'Guardar condición','Condición guardada',editor=>{
      const fields=new FormData(editor);
      return withRule('conditions',index,{
        id:row.id||crypto.randomUUID(),
        kind:fields.get('kind'),text:fields.get('text'),active:fields.has('active'),
        productType:fields.get('productType'),finish:fields.get('finish'),
        dtfMaterial:fields.get('dtfMaterial'),dtfSubtype:fields.get('dtfSubtype'),fileMode:fields.get('fileMode')
      });
    });
    form.elements.kind.onchange=()=>{
      for(const fields of all('[data-condition-fields]',form))fields.hidden=fields.dataset.conditionFields!==form.elements.kind.value;
    };
  }
  function bind(root,value) {
    context=value;
    host=$('.custom-pricing-settings',root)||$('.custom-pricing-settings');
    if(!host)return;
    host.addEventListener('click',async event=>{
      if(busy)return;
      const button=event.target.closest('button');
      if(!button)return;
      const data=button.dataset;
      if(data.editCustomPrices!==undefined){openPrices(data.editCustomPrices);return;}
      if(data.addCustomDiscount!==undefined){openDiscount();return;}
      if(data.editCustomDiscount!==undefined){openDiscount(Number(data.editCustomDiscount));return;}
      if(data.addCustomCondition!==undefined){openCondition();return;}
      if(data.editCustomCondition!==undefined){openCondition(Number(data.editCustomCondition));return;}
      if(data.importCustomPromo!==undefined){
        const choice=$('[data-custom-promo-source]',host).value,rule=choice===''?null:sourceRules[Number(choice)];
        if(rule)openDiscount(-1,{name:rule.name,type:types.find(type=>type.promotionType===(rule.targetType||rule.triggerType))?.code||'',
          minimum:Math.max(1,Number(rule.threshold)||5),benefit:rule.benefit,value:rule.value,active:true});
        return;
      }
      const condition=data.deleteCustomCondition??data.toggleCustomCondition;
      const discount=data.deleteCustomDiscount??data.toggleCustomDiscount;
      if(condition===undefined&&discount===undefined)return;
      const index=Number(condition??discount),collection=condition===undefined?'discounts':'conditions';
      const remove=data.deleteCustomCondition!==undefined||data.deleteCustomDiscount!==undefined;
      if(remove&&!window.confirm(condition===undefined?'¿Eliminar este descuento?':'¿Eliminar esta condición?'))return;
      try {
        busy=true;
        const next=structuredClone(policyState);
        if(remove)next[collection].splice(index,1);
        else next[collection][index].active=!next[collection][index].active;
        await persist(next);
        context.toast(remove?(condition===undefined?'Descuento eliminado':'Condición eliminada'):'Estado actualizado','success');
      } catch(error) {
        context.toast(error.message,'error');
      } finally {
        busy=false;
      }
    });
  }
  window.SalmosCustomPricingAdmin={html,bind,collect};
})();
