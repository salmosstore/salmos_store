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
  const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'
  })[c]);
  function image(chart) {
    const rowHeight = 40;
    const height = 174 + chart.rows.length * rowHeight;
    const rows = chart.rows.map((row, index) => {
      const y = 114 + rowHeight * index;
      return `<rect x="24" y="${y}" width="432" height="${rowHeight}" fill="${index % 2 ? '#f8efdc' : '#fffaf0'}"/>
        <text x="96" y="${y+26}" font-weight="bold">${xml(row.size)}</text>
        <text x="240" y="${y+26}">${xml(row.width)} cm</text><text x="384" y="${y+26}">${xml(row.height)} cm</text>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${height}" viewBox="0 0 480 ${height}">
      <rect width="480" height="${height}" rx="18" fill="#f5e9d0"/><rect x="7" y="7" width="466" height="${height-14}" rx="13" fill="none" stroke="#9e751f"/>
      <g font-family="Georgia, serif" text-anchor="middle" fill="#30220e" font-size="17">
        <text x="240" y="36" font-size="24" font-weight="bold">SALMOS</text>
        <text x="240" y="65" textLength="${Math.min(410, Math.max(75, chart.title.length * 10))}" lengthAdjust="spacingAndGlyphs" font-size="20">${xml(chart.title)}</text>
        <rect x="24" y="82" width="432" height="32" rx="5" fill="#d7b86f"/>
        <text x="96" y="104">Talle</text><text x="240" y="104">Ancho</text><text x="384" y="104">Largo</text>
        ${rows}
        <text x="240" y="${height-33}" font-size="14">Ancho de axila a axila · Largo desde el hombro</text>
        <text x="240" y="${height-16}" font-size="13" font-style="italic">Medidas aproximadas</text>
      </g></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  window.SalmosSizeGuides = {defaults, matching, image};
})();
