(() => {
  'use strict';
  let context, draft=null, saving=false;
  const $=(selector,root=document)=>root.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const active=rule=>![false,0,'false','0'].includes(rule.active);
  function rules(){return context.normalize(context.state.settings.automatic_promotions||'[]');}
  function typeLabel(type){const select=document.createElement('select');select.innerHTML=context.typeOptions(type);return [...select.options].find(option=>option.value===type)?.textContent||type||'todos los productos';}
  function summary(rule){
    const condition=rule.trigger==='combination'?(rule.requirements||[]).map(row=>`${row.quantity} ${typeLabel(row.type)}`).join(' + '):rule.trigger==='amount'?`Desde ${context.money(rule.threshold)} de compra`:`Desde ${rule.threshold} unidades · ${typeLabel(rule.triggerType)}`;
    const target=rule.target==='shipping'?'el envío':rule.target==='order'?'la compra':rule.targetType?typeLabel(rule.targetType):'los productos';
    const benefit=rule.benefit==='unit_price'?`${context.money(rule.value)} por unidad`:rule.benefit==='percent'?`${rule.value}% de descuento en ${target}`:`${context.money(rule.value)} de descuento ${rule.basis==='unit'&&rule.target==='products'?'por unidad':`en ${target}`}`;
    return {condition,benefit,curve:rule.requireCurve?`Curva: ${(rule.curveSizes||[]).join(' · ')}${rule.curveMixed===false?' · mismo diseño y color':''}${rule.allowAssorted!==false?' · también surtidos desde 5 prendas':''}`:''};
  }
  function cards(items){return items.length?`<div class="saved-rules-grid">${items.map(rule=>{const text=summary(rule);return `<article class="saved-rule-card" data-saved-promotion="${esc(rule.id)}"><header><h4>${esc(rule.name)}</h4><span class="status ${active(rule)?'success':'warning'}">${active(rule)?'Activa':'Pausada'}</span></header><strong class="saved-rule-benefit">${esc(text.benefit)}</strong><p>${esc(text.condition)}</p>${text.curve?`<small>${esc(text.curve)}</small>`:''}<div class="saved-rule-actions"><button type="button" class="btn btn-ghost" data-edit-saved-promo="${esc(rule.id)}">Editar</button><button type="button" class="btn btn-ghost" data-toggle-saved-promo="${esc(rule.id)}">${active(rule)?'Pausar':'Activar'}</button><button type="button" class="btn btn-danger" data-delete-saved-promo="${esc(rule.id)}">Eliminar</button></div></article>`;}).join('')}</div>`:'<p class="settings-empty">Todavía no hay promociones guardadas.</p>';}
  function render(){const host=$('#promotionsEditor');if(!host||!context)return;const items=rules();host.innerHTML=cards(items);const badge=$('[data-promo-section-count="automatic"]');if(badge)badge.textContent=`${items.length} guardadas · ${items.filter(active).length} activas`;}
  async function commit(id,change,original=null){
    const fresh=await context.api('/api/admin/settings',{cache:'no-store'}),items=context.normalize(fresh.settings?.automatic_promotions||'[]'),index=items.findIndex(rule=>rule.id===id);
    if(id&&index<0)throw new Error('Esta promoción ya no existe. Cerrá la edición y revisá el listado.');
    if(original&&JSON.stringify(items[index])!==JSON.stringify(original))throw new Error('La promoción cambió en otra ventana. Cerrá y volvé a abrirla para editar la versión actual.');
    const next=change(items,index),normalized=context.normalize(next);
    await context.api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:{automatic_promotions:JSON.stringify(normalized)}})});
    context.state.settings.automatic_promotions=JSON.stringify(normalized);render();
  }
  function open(id=''){
    const original=id?rules().find(rule=>rule.id===id):null;if(id&&!original)return;
    draft={id,original:original?structuredClone(original):null};
    const dialog=context.dialog('promotionEditorDialog38',original?'Editar promoción':'Nueva promoción');dialog.classList.add('settings-editor38');
    $('.dialog-body',dialog).innerHTML=context.editor(original||{});
    const remove=$('[data-remove-promotion]',dialog);remove.removeAttribute('data-remove-promotion');remove.setAttribute('data-cancel-promo-editor','');remove.className='btn btn-ghost';remove.textContent='Cancelar';
    const row=$('[data-promotion-row]',dialog);context.sync(row);dialog.showModal();
  }
  async function save(button){
    if(saving||!draft)return;const dialog=$('#promotionEditorDialog38'),row=$('[data-promotion-row]',dialog);
    if(![...row.querySelectorAll('input,select')].filter(input=>!input.disabled&&!input.closest('.hidden')).every(input=>input.reportValidity()))return;
    try{saving=true;button.disabled=true;const edited=context.normalize([context.read(row)])[0];await commit(draft.id,(items,index)=>{if(index<0)items.push(edited);else items[index]=edited;return items;},draft.original);dialog.close();draft=null;context.toast('Promoción guardada','success');}catch(error){context.toast(error.message,'error');}finally{saving=false;button.disabled=false;}
  }
  function bind(value){context=value;render();}
  document.addEventListener('click',async event=>{
    if(!context)return;
    const add=event.target.closest('#addPromotionBtn'),edit=event.target.closest('[data-edit-saved-promo]'),toggle=event.target.closest('[data-toggle-saved-promo]'),remove=event.target.closest('[data-delete-saved-promo]'),confirm=event.target.closest('#promotionEditorDialog38 [data-promo-confirm]'),cancel=event.target.closest('[data-cancel-promo-editor]');
    if(!add&&!edit&&!toggle&&!remove&&!confirm&&!cancel)return;
    event.preventDefault();event.stopImmediatePropagation();if(saving)return;
    if(add||edit){open(edit?.dataset.editSavedPromo||'');return;}if(confirm){await save(confirm);return;}if(cancel){$('#promotionEditorDialog38').close();draft=null;return;}
    const id=toggle?.dataset.toggleSavedPromo||remove?.dataset.deleteSavedPromo,rule=rules().find(row=>row.id===id);if(!rule)return;
    if(remove&&!window.confirm(`¿Eliminar la promoción “${rule.name}”?`))return;
    const button=toggle||remove;
    try{saving=true;button.disabled=true;await commit(id,(items,index)=>{if(remove)items.splice(index,1);else items[index].active=!active(items[index]);return items;},rule);context.toast(remove?'Promoción eliminada':active(rule)?'Promoción pausada':'Promoción activada','success');}catch(error){context.toast(error.message,'error');button.disabled=false;}finally{saving=false;}
  },true);
  window.SalmosPromotionsAdmin={bind,render,open};
})();
