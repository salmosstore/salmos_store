(() => {
  'use strict';
  const names=['Hombre','Mujer','Kids'];
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function parse(value){
    const text=normalize(Array.isArray(value)?value.join(' '):value),out=[];
    const male=/hombre|varon|masculin/.test(text),female=/mujer|femenin/.test(text),unisex=/unisex/.test(text)||(!male&&!female&&/adult/.test(text));
    if(male||unisex)out.push('Hombre');
    if(female||unisex)out.push('Mujer');
    if(/kids|\bninos?\b|\bninas?\b|infantil/.test(text))out.push('Kids');
    return out;
  }
  const serialize=value=>names.filter(name=>parse(value).includes(name)).join(' | ');
  function html(value,scope){const selected=parse(value);return `<fieldset class="product-audiences" data-audience-scope="${scope}"><legend>Mostrar en</legend>${names.map(name=>`<label><input type="checkbox" data-product-audience value="${name}" ${selected.includes(name)?'checked':''}>${name}</label>`).join('')}<button type="button" class="btn btn-ghost" data-audience-unisex>Unisex</button></fieldset>`;}
  function read(root){return serialize([...root.querySelectorAll('[data-product-audience]:checked')].map(input=>input.value));}
  window.SalmosAudience={parse,serialize,html,read};
})();
