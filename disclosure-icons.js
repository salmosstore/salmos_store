(() => {
  'use strict';
  const oldIcons='.fa-chevron-down,.fa-chevron-up,.fa-angle-down,.fa-angle-up';
  const triangleOnly=/^[\s⌄⌃▸▾▴▼▲∨∧]+$/;
  function icon(up=false){const i=document.createElement('i');i.className='fa-solid fa-caret-down salmos-caret-icon';i.setAttribute('aria-hidden','true');if(up)i.dataset.caretDirection='up';return i;}
  function normalizeIcon(i){
    const up=i.matches('.fa-chevron-up,.fa-angle-up');
    i.classList.remove('fa-chevron-down','fa-chevron-up','fa-angle-down','fa-angle-up');
    i.classList.add('fa-solid','fa-caret-down','salmos-caret-icon');
    i.setAttribute('aria-hidden','true');if(up&&!i.closest('summary'))i.dataset.caretDirection='up';else delete i.dataset.caretDirection;
    const button=i.closest('button');if(button)button.classList.add('salmos-fold-button');
  }
  function summary(element){
    element.classList.add('salmos-summary39');
    let fold=element.querySelector('.montage-group-fold');
    if(fold){if(!fold.querySelector('.salmos-caret-icon'))fold.replaceChildren(icon());fold.classList.add('salmos-disclosure-icon');return;}
    if(element.querySelector('.salmos-caret-icon'))return;
    const prior=[...element.children].find(child=>child.tagName==='SPAN'&&triangleOnly.test(child.textContent));
    if(prior){prior.classList.add('salmos-disclosure-icon');prior.replaceChildren(icon());return;}
    const wrapper=document.createElement('span');wrapper.className='salmos-disclosure-icon';wrapper.setAttribute('aria-hidden','true');wrapper.append(icon());element.prepend(wrapper);
  }
  function enhance(root){
    if(root.nodeType!==1&&root.nodeType!==9)return;
    const find=selector=>[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
    for(const i of find(oldIcons))normalizeIcon(i);
    for(const element of find('summary'))summary(element);
    for(const button of find('button[aria-expanded],button[data-collapse-montage-groups],button[data-fullscreen-design-collapse]')){
      if(triangleOnly.test(button.textContent)&&!button.querySelector('i')){button.replaceChildren(icon());button.classList.add('salmos-fold-button');}
    }
  }
  function init(){
    enhance(document);
    const observer=new MutationObserver(records=>{
      const roots=new Set();
      for(const record of records){
        if(record.type==='attributes'){if(record.target.matches(oldIcons))roots.add(record.target);continue;}
        if(record.target.nodeType===1&&record.target.matches('summary,button'))roots.add(record.target);
        for(const node of record.addedNodes)if(node.nodeType===1)roots.add(node);
      }
      for(const root of roots)if(root.isConnected)enhance(root);
    });observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
