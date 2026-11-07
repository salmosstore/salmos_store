(() => {
  'use strict';
  function customProductTypes(options = {}) {
    if (typeof options === 'string') { try { options = JSON.parse(options); } catch { options = {}; } }
    const defaults = [{code:'shirt',label:'Remera'},{code:'chomba',label:'Chomba'},{code:'hoodie',label:'Buzo'},{code:'cap',label:'Gorra'},{code:'mug',label:'Taza'},{code:'glass',label:'Vaso'},{code:'thermos',label:'Termo'},{code:'bag',label:'Bolso'},{code:'custom_libro',label:'Libro / cuaderno'}];
    const rows = Array.isArray(options.typeCatalog) ? options.typeCatalog : [...defaults,...(options.types || [])];
    const result = [], seen = new Set(), aliases = {cap:'cap',mug:'mug',glass:'glass',thermos:'thermos',bag:'bag'};
    for (const row of rows) {
      if (!row?.code || !/^[a-zA-Z0-9_-]{1,80}$/.test(row.code) || !row.label || seen.has(row.code) || /^(dtf_|packaging$|custom_(papel|tapas|espiral|grampas)$)/.test(row.code)) continue;
      seen.add(row.code);
      if (row.code === 'shirt') result.push({code:'shirt_classic',label:row.label+' clásica',promotionType:'shirt_classic'},{code:'shirt_oversize',label:row.label+' oversize',promotionType:'shirt_oversize'},{code:'shirt_crop',label:row.label+' crop',promotionType:'shirt_crop'});
      else result.push({code:String(row.code).slice(0,80),label:String(row.label).slice(0,100),promotionType:aliases[row.code] || String(row.label).toLowerCase()});
    }
    return result;
  }
  function normalizeOrderConditions(rows = [
    {id:'plazo',kind:'all',text:'Tiempo estimado de 24 a 72 horas, sujeto a cantidad y disponibilidad.'},
    {id:'acomodo-dtf',kind:'dtf',dtfSubtype:'sheet',text:'El cálculo final depende del acomodo de los diseños en la plancha.'}
  ]) {
    if (!Array.isArray(rows) || rows.length > 50) throw new Error('Podés cargar hasta 50 condiciones de pedido.');
    return rows.map((row,index)=>{
      const kind=row?.kind, text=typeof row?.text==='string'?row.text.trim():'';
      if (!['all','clothing','dtf'].includes(kind) || !text || text.length>600) {
        throw new Error('Elegí dónde se aplica cada condición y escribí un texto de hasta 600 caracteres.');
      }
      const value=(key,allowed)=>{
        const current=row[key]??'';
        if (current!=='' && !allowed.includes(current)) throw new Error('Revisá las opciones de la condición.');
        return current;
      };
      const result={id:String(row.id||'condicion-'+index).slice(0,80),kind,text,active:![false,0,'false','0'].includes(row.active)};
      if (kind==='clothing') {
        const productType=row.productType??'';
        if (typeof productType!=='string' || !/^[a-zA-Z0-9_-]{0,80}$/.test(productType)) throw new Error('Revisá el tipo de producto de la condición.');
        Object.assign(result,{productType,finish:value('finish',['estampada','lisa'])});
      } else if (kind==='dtf') {
        Object.assign(result,{
          dtfMaterial:value('dtfMaterial',['textile','uv']),
          dtfSubtype:value('dtfSubtype',['sheet','individual']),
          fileMode:value('fileMode',['ready','configure'])
        });
      }
      return result;
    });
  }
  function normalizeOrderPricing(raw = {}) {
    if (typeof raw === 'string') raw = JSON.parse(raw || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Revisá los precios de personalizados.');
    const amount = (value, fallback = null) => {
      if (value === undefined || value === null || value === '') return fallback;
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < 0 || number > 1000000000) throw new Error('Los precios deben ser importes válidos, sin valores negativos.');
      return number;
    };
    const dtf = {};
    for (const [type, ready, configure, lengthCm] of [['textile',1200000,1500000,100],['uv',1400000,1700000,50]]) {
      const row = raw.dtf?.[type] || {};
      dtf[type] = {readyCents:amount(row.readyCents,ready),configureCents:amount(row.configureCents,configure),individualReadyCents:amount(row.individualReadyCents,300000),individualConfigureCents:amount(row.individualConfigureCents,400000),widthCm:58,lengthCm};
    }
    const products = {};
    for (const [code,row] of Object.entries(raw.products || {})) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(code) || !row || typeof row !== 'object') throw new Error('Revisá los tipos y precios de personalizados.');
      products[code] = {printedCents:amount(row.printedCents),plainCents:amount(row.plainCents)};
    }
    if (!Array.isArray(raw.discounts ?? []) || (raw.discounts || []).length > 50) throw new Error('Podés cargar hasta 50 descuentos de personalizados.');
    const discounts = (raw.discounts || []).map((row,index) => {
      const result = {id:String(row.id || 'personalizado-'+index).slice(0,80),name:String(row.name || '').trim().slice(0,100),active:![false,0,'false','0'].includes(row.active),type:String(row.type || '').slice(0,80),minimum:Number(row.minimum),benefit:row.benefit,value:Number(row.value)};
      if (!result.name || !Number.isSafeInteger(result.minimum) || result.minimum < 1 || result.minimum > 10000 || !['percent','fixed','unit_price'].includes(result.benefit) || !Number.isFinite(result.value) || result.value < 0 || (result.benefit === 'percent' ? result.value > 100 : !Number.isSafeInteger(result.value))) throw new Error('Revisá nombre, cantidad y beneficio del descuento de personalizados.');
      return result;
    });
    return {dtf,products,discounts,conditions:normalizeOrderConditions(raw.conditions)};
  }
  function quoteOrderPricing(config, request, rules = [], referencePriceCents = null) {
    const policy = normalizeOrderPricing(config),quantity = Number(request.quantity || 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Revisá la cantidad solicitada.');
    let unitCents = null, units = quantity, areaUnits = 0, type = request.productType || request.subtype || '', preparationCents = 0;
    if (request.kind === 'dtf') {
      const material = request.dtfMaterial === 'uv' ? 'uv' : 'textile', row = policy.dtf[material], configure = request.fileMode === 'configure';
      type = 'dtf_'+material;
      if (request.subtype === 'individual') {
        unitCents = configure ? row.individualConfigureCents : row.individualReadyCents;
        preparationCents = configure ? Math.max(0,unitCents-row.individualReadyCents)*quantity : 0;
      } else {
        const designs = Array.isArray(request.designs) ? request.designs : [];
        if (!designs.length || designs.some(d => !Number.isFinite(Number(d.widthCm)) || !Number.isFinite(Number(d.heightCm)) || Number(d.widthCm) <= 0 || Number(d.heightCm) <= 0 || Number(d.widthCm) > row.widthCm || Number(d.heightCm) > row.lengthCm || !Number.isSafeInteger(Number(d.quantity)) || Number(d.quantity) < 1)) throw new Error('Revisá las medidas y cantidades: cada diseño debe entrar en la plancha elegida.');
        areaUnits = Math.max(1,Math.ceil(designs.reduce((n,d)=>n+Number(d.widthCm)*Number(d.heightCm)*Number(d.quantity),0)/(row.widthCm*row.lengthCm)));
        units = Math.max(1,Math.trunc(Number(request.requestedSheets)||1),areaUnits);
        if (units > 10000) throw new Error('La cantidad de planchas supera el máximo permitido.');
        unitCents = configure ? row.configureCents : row.readyCents;
        preparationCents = configure ? Math.max(0,unitCents-row.readyCents)*units : 0;
      }
    } else {
      unitCents = policy.products[type]?.[request.finish === 'lisa' ? 'plainCents' : 'printedCents'] ?? referencePriceCents;
    }
    if (unitCents === null || unitCents === undefined) return {unitCents:null,units,subtotalCents:null,discountCents:0,totalCents:null,label:'',depositCents:0,areaUnits};
    const subtotalCents = Math.round(Number(unitCents))*units;
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) throw new Error('Revisá el precio configurado.');
    const candidates = policy.discounts.filter(r=>r.active && (!r.type || r.type === type) && units >= r.minimum).map(r=>({...r,discount:r.benefit==='percent'?Math.round(subtotalCents*r.value/100):r.benefit==='unit_price'?Math.max(0,Number(unitCents)-r.value)*units:r.value*units}));
    for (const rule of rules || []) {
      if ([false,0,'false','0'].includes(rule.active) || rule.trigger !== 'quantity' || rule.requireCurve || rule.target !== 'products' || rule.triggerProductId || rule.targetProductId || (rule.triggerType && rule.triggerType !== request.promotionType) || (rule.targetType && rule.targetType !== request.promotionType) || units < Number(rule.threshold)) continue;
      candidates.push({name:rule.name,discount:rule.benefit==='percent'?Math.round(subtotalCents*rule.value/100):rule.benefit==='unit_price'?Math.max(0,Number(unitCents)-rule.value)*units:rule.value*(rule.basis==='unit'?units:1)});
    }
    const best = candidates.sort((a,b)=>b.discount-a.discount)[0],discountCents = Math.min(subtotalCents,Math.max(0,Math.round(best?.discount||0))),totalCents = subtotalCents-discountCents;
    return {unitCents:Number(unitCents),units,areaUnits,subtotalCents,discountCents,totalCents,label:discountCents?best.name:'',depositCents:Math.round(totalCents/2),preparationCents};
  }
  function conditionsFor(config, request) {
    const targets=request.kind==='dtf'?
      {dtfMaterial:request.dtfMaterial,dtfSubtype:request.subtype,fileMode:request.fileMode}:
      {productType:request.subtype,finish:request.finish};
    return normalizeOrderConditions(config?.conditions).filter(rule=>rule.active && (
      rule.kind==='all' || rule.kind===request.kind &&
        Object.keys(targets).every(key=>!rule[key] || rule[key]===targets[key])
    ));
  }
  window.SalmosOrderPricing = {normalize:normalizeOrderPricing,quote:quoteOrderPricing,productTypes:customProductTypes,conditionsFor};
})();
