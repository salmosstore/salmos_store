(() => {
  'use strict';
  function summary(item, escapeHtml, money) {
    const d = item.destination;
    const fields = [
      ['Nombre',item.name], ['Correo',item.email], ['WhatsApp',item.phone],
      ['Dirección',d.street], ['Localidad',d.locality], ['Provincia',d.province], ['Código postal',d.postalCode],
      ['Entrega',{home:'A domicilio',agency:'A sucursal'}[d.type] || 'A coordinar'], ['Aclaraciones',d.notes]
    ].filter(([,value])=>value);
    return `<dl class="shipping-request-data">${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
      <h3>Carrito de la consulta</h3>
      ${item.items.length ? `<ul class="shipping-request-items">${item.items.map(row=>{
        const variant = [row.color,row.size].filter(Boolean).join(' · ');
        return `<li><span>${row.quantity} × ${escapeHtml(row.name)}${variant?' · '+escapeHtml(variant):''}</span>
          ${money && row.unitPriceCents !== null ? `<small>${money(row.unitPriceCents)} / u</small>`:''}</li>`;
      }).join('')}</ul>` : '<p class="muted">El carrito estaba vacío.</p>'}`;
  }
  function validCode(code) {
    return /^\d{6}$/.test(code || '');
  }
  function requestCode() {
    const path = location.pathname.match(/^\/carrito\/([^/]+)\/?$/i);
    const code = path?.[1] || new URLSearchParams(location.search).get('consulta-envio');
    return validCode(code) ? code : '';
  }
  window.SalmosShippingRequestView = {summary,validCode,requestCode};
})();
