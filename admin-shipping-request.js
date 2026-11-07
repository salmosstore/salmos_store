(() => {
  'use strict';
  let mapsPromise;

  function googleMaps(key) {
    if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
    if (!mapsPromise) {
      mapsPromise = new Promise((resolve,reject)=>{
        const script = document.createElement('script');
        script.src = 'https://maps.googleapis.com/maps/api/js?v=weekly&key='+encodeURIComponent(key);
        script.async = true;
        script.referrerPolicy = 'origin';
        script.onload = () => window.google?.maps?.Map ? resolve(window.google.maps) : reject();
        script.onerror = reject;
        document.head.append(script);
      });
      mapsPromise.catch(()=>{mapsPromise=null;});
    }
    return mapsPromise;
  }

  function decodePolyline(encoded) {
    let index = 0, lat = 0, lng = 0;
    const points = [];
    const coordinate = () => {
      let result = 0, shift = 0, byte;
      do {
        byte = encoded.charCodeAt(index++)-63;
        if (!Number.isInteger(byte) || byte<0 || byte>63 || shift>30) throw new Error('Recorrido inválido.');
        result |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    while (index < encoded.length) {
      lat += coordinate();
      lng += coordinate();
      points.push({lat:lat/100000,lng:lng/100000});
    }
    return points;
  }

  async function drawMap(host,key,encoded) {
    if (!key || !encoded) return;
    try {
      const path = decodePolyline(encoded);
      if (path.length < 2) return;
      const maps = await googleMaps(key);
      if (!host.isConnected) return;
      host.hidden = false;
      const map = new maps.Map(host,{mapTypeControl:false,streetViewControl:false,gestureHandling:'cooperative'});
      const bounds = new maps.LatLngBounds();
      path.forEach(point=>bounds.extend(point));
      new maps.Polyline({map,path,strokeColor:'#ad780e',strokeOpacity:.95,strokeWeight:5});
      map.fitBounds(bounds,35);
    } catch {
      host.hidden = true;
    }
  }

  async function showRoute(host,id,{api,money,escapeHtml}) {
    host.innerHTML = '<p role="status">Calculando recorrido y costo estimado…</p>';
    try {
      const {route,message,mapsWebKey} = await api('/api/admin/shipping-requests/'+id+'/route',{method:'POST'});
      if (!host.isConnected) return;
      if (!route) { host.textContent=message; return; }
      const direction = new URL('https://www.google.com/maps/dir/');
      direction.search = new URLSearchParams({
        api:'1',origin:route.origin.address,destination:route.destination.address,travelmode:'driving'
      });
      host.innerHTML = `<h3>Recorrido y costo estimado</h3>
        <dl class="shipping-request-data">
          <div><dt>Salida</dt><dd>${escapeHtml(route.origin.address)}</dd></div>
          <div><dt>Llegada</dt><dd>${escapeHtml(route.destination.address)}</dd></div>
          <div><dt>Distancia</dt><dd>${route.distanceKm.toLocaleString('es-AR')} km</dd></div>
          <div><dt>Tarifa general por km</dt><dd>${money(route.ratePerKm*100)}</dd></div>
          <div><dt>Envío estimado</dt><dd><strong>${money(route.costCents)}</strong></dd></div>
        </dl>
        ${route.inRange?'':`<p class="muted">Destino fuera del radio de motomensajería de ${route.maxKm} km.</p>`}
        ${route.adjustmentCents?`<p class="muted">Ajuste de zona incluido · ${money(route.adjustmentCents)}</p>`:''}
        ${route.discountCents?`<p class="muted">Descuento estimado del pedido · ${money(route.discountCents)}</p>`:''}
        <div class="shipping-request-map" aria-label="Mapa del recorrido" hidden></div>
        <a class="btn btn-ghost" href="${escapeHtml(direction.href)}" target="_blank" rel="noopener noreferrer">Abrir recorrido en Google Maps</a>`;
      drawMap(host.querySelector('.shipping-request-map'),mapsWebKey,route.encodedPolyline);
    } catch (error) {
      host.innerHTML = `<p role="alert">${escapeHtml(error.message || 'No pudimos calcular el recorrido.')}</p>
        <button type="button" class="btn btn-ghost">Reintentar recorrido</button>`;
      host.querySelector('button').onclick = () => showRoute(host,id,{api,money,escapeHtml});
    }
  }

  async function open(options) {
    const id = window.SalmosShippingRequestView.requestCode();
    if (!id) return;
    const {api,escapeHtml,money} = options;
    const dialog = document.createElement('dialog');
    dialog.className = 'admin-dialog shipping-request-dialog';
    dialog.setAttribute('aria-label','Consulta de envío');
    dialog.innerHTML = `<div class="dialog-shell"><div class="dialog-head"><h2>Consulta de envío</h2>
      <button type="button" class="icon-btn" aria-label="Cerrar">×</button></div>
      <div class="dialog-body"><div data-shipping-admin-data><p role="status">Cargando consulta…</p></div>
      <section class="shipping-request-route"></section></div></div>`;
    document.body.append(dialog);
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    dialog.showModal();
    const host = dialog.querySelector('[data-shipping-admin-data]');
    try {
      const {item} = await api('/api/admin/shipping-requests/'+id,{cache:'no-store'});
      if (!dialog.isConnected) return;
      host.innerHTML = window.SalmosShippingRequestView.summary(item,escapeHtml,money);
      showRoute(dialog.querySelector('.shipping-request-route'),id,options);
    } catch (error) {
      host.textContent = error.message || 'No pudimos cargar la consulta.';
    }
  }
  window.SalmosShippingRequestAdmin = {open};
})();
