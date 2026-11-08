(() => {
  'use strict';
  const defaults=[
    {id:'remeras-clasicas',title:'Remeras clásicas',productType:'shirt',fit:'Clásica',materialClass:'ADULTOS',rows:[['S',48,71],['M',50,74],['L',52,76],['XL',54,78],['XXL',56,80]]},
    {id:'remeras-oversize',title:'Remeras oversize',productType:'shirt',fit:'Oversize',materialClass:'ADULTOS',rows:[['S',54,74],['M',56,75],['L',58,77],['XL',61,79],['XXL',62,80]]},
    {id:'remeras-especiales',title:'Remeras · talles especiales',productType:'shirt',fit:'Clásica',materialClass:'ESPECIALES',rows:[['6',63,81],['8',65,85]]},
    {id:'chombas',title:'Chombas',productType:'chomba',fit:'Clásica',materialClass:'ADULTOS',notes:'Algodón piqué · Medidas aproximadas',rows:[['S',46,69],['M',47,70],['L',49,71],['XL',52,73],['XXL',55,75]]},
    {id:'salmos-kids',title:'Remeras Kids',productType:'shirt',fit:'Clásica',materialClass:'NIÑOS',notes:'Algodón peinado · Medidas aproximadas',rows:[['4',33,47],['6',34,49],['8',37,51],['10',39,53],['12',39,56],['14',41,60],['16',42,62]]},
    {id:'chombas-especiales',title:'Chombas · talles especiales',productType:'chomba',fit:'Clásica',materialClass:'ESPECIALES',notes:'Algodón piqué · Medidas aproximadas',rows:[['6',59,78],['7',61,82],['8',62,85]]}
  ].map(chart=>({...chart,notes:chart.notes||'Medidas aproximadas',rows:chart.rows.map(([size,width,height])=>({size,width,height}))}));
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  function fit(value) {
    const key = normalize(value);
    if (key.includes('over')) return 'oversize';
    if (key.includes('crop')) return 'crop';
    return /clasic|regular|basic/.test(key) || !key ? 'classic' : key;
  }
  function materialClass(value) {
    const key = normalize(value);
    if (/^(kids|ninos|infantil|infantiles)$/.test(key)) return 'ninos';
    return key || 'adultos';
  }
  function productType(product) {
    const type = normalize(product.production_catalog?.materialType);
    if (type) return ({remera:'shirt',buzo:'hoodie'})[type] || type;
    const category = normalize(product.category_slug || product.category_name);
    if (/chomba/.test(category)) return 'chomba';
    if (/buzo|hoodie/.test(category)) return 'hoodie';
    return 'shirt';
  }
  function matching(product, savedCharts) {
    const catalog = product.production_catalog || {};
    const type = productType(product);
    const audience = window.SalmosAudience?.parse(product.audience) || [];
    const kids = audience.length === 1 && audience[0] === 'Kids' ||
      /kids|ninos|infantil/.test(normalize(product.category_slug || product.category_name));
    const klass = materialClass(catalog.materialClass || (kids ? 'NIÑOS' : 'ADULTOS'));
    const cut = fit(product.fit || catalog.fit);
    const charts = Array.isArray(savedCharts) ? [...savedCharts] : defaults;
    if (!charts.some(chart => chart.productType === 'shirt' && materialClass(chart.materialClass) === 'ninos')) {
      charts.push(defaults.find(chart => chart.id === 'salmos-kids'));
    }
    const sameType = charts.filter(chart => chart.productType === type && materialClass(chart.materialClass) === klass);
    return sameType.find(chart => chart.id === catalog.sizeChartId) ||
      sameType.find(chart => fit(chart.fit) === cut) || null;
  }
  function illustration(chart) {
    const type = normalize(`${chart.productType} ${chart.title}`);
    const special = /especial/.test(normalize(`${chart.materialClass} ${chart.title}`));
    const oversize = /over/.test(normalize(`${chart.fit} ${chart.title}`));
    const asset = /chomba|polo/.test(type) ? 'chomba' : oversize && !special ? 'oversize' : 'clasica';
    return `/size-chart-images/${asset}.png`;
  }
  window.SalmosSizeGuides = {defaults, matching, illustration};
})();
