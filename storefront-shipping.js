(() => {
  'use strict';
  let context;
  const $ = (selector, root=document) => root.querySelector(selector);
  const esc = value => context.escapeHtml(value ?? '');
  const {validCode,requestCode} = window.SalmosShippingRequestView;
  const requestId = requestCode();
  let viewVersion = 0;
  let pendingDraft;

  function form() {
    const {state} = context, draft = state.manualDelivery || {};
    const email = state.auth.user?.email || draft.email || state.customer?.email || '';
    const input = (name,label,value,autocomplete,attributes='') => `<label class="field">${label}
      <input class="input" name="${name}" value="${esc(value)}" autocomplete="${autocomplete}" ${attributes}></label>`;
    return `<form class="manual-shipping" data-shipping-request-form>
      <p>Completá el destino para pedirnos una cotización de envío por WhatsApp.</p>
      ${state.cart.length?'':'<p class="shipping-empty-cart">Los envíos pueden variar según el carrito de compras. Para consultar un costo más preciso, armá un carrito y volvé a consultar.</p>'}
      <div class="form-grid">
        ${input('name','Nombre',draft.name || state.customer?.name || state.auth.user?.displayName,'name','required maxlength="120"')}
        ${input('phone','WhatsApp (opcional)',draft.phone || state.customer?.phone,'tel','type="tel" maxlength="40"')}
        <label class="field full">Correo<input class="input" name="email" type="email" value="${esc(email)}" required maxlength="254" autocomplete="email" ${state.auth.user?.email?'readonly':''}>
          <small class="field-help">Usá este correo al ingresar para volver a ver tu consulta.</small></label>
        ${input('locality','Localidad',draft.locality,'address-level2','required maxlength="100"')}
        ${input('province','Provincia',draft.province,'address-level1','required maxlength="100"')}
        ${input('postalCode','Código postal (opcional)',draft.postalCode,'postal-code','maxlength="12"')}
        <label class="field">Preferencia de entrega<select class="select" name="type"><option value="">A coordinar</option>
          <option value="home" ${draft.type==='home'?'selected':''}>A domicilio</option><option value="agency" ${draft.type==='agency'?'selected':''}>A sucursal</option></select></label>
        <label class="field full">Calle y altura<input class="input" name="street" value="${esc(draft.street)}" autocomplete="street-address" maxlength="160" ${draft.type==='home'?'required pattern=".*[0-9].*"':''}></label>
        <label class="field full">Aclaraciones (opcional)<textarea class="textarea" name="notes" rows="2" maxlength="320">${esc(draft.notes)}</textarea></label>
      </div>
      <div data-shipping-request-status aria-live="polite"></div>
      <button class="btn btn-primary full" type="submit">Consultar por WhatsApp</button>
      <p class="field-help">El envío se cotiza antes de confirmar la compra.</p>
    </form>`;
  }

  function remember(event) {
    const input = event.target;
    if (!input.name || !input.closest('[data-shipping-request-form]')) return;
    (context.state.manualDelivery ??= {})[input.name] = input.value;
    if (input.name === 'type') {
      const street = input.form.elements.street;
      street.required = input.value === 'home';
      if (street.required) street.pattern = '.*[0-9].*';
      else street.removeAttribute('pattern');
    }
  }

  async function submit(event) {
    const form = event.target;
    if (!form.matches('[data-shipping-request-form]')) return;
    event.preventDefault();
    const button = $('button[type="submit"]',form), status = $('[data-shipping-request-status]',form);
    if (button.disabled) return;
    const fields = new FormData(form), get = name => String(fields.get(name) || '').trim();
    const cart = [...context.state.cart], items = cart.map(row=>({variantId:Number(row.variantId),quantity:Number(row.qty)}));
    const destination = Object.fromEntries(['street','locality','province','postalCode','type','notes'].map(key=>[key,get(key)]));
    const data = {name:get('name'),email:get('email'),phone:get('phone'),destination,items};
    const key = JSON.stringify([context.state.auth.user?.uid || '',data]);
    if (pendingDraft?.key !== key) pendingDraft = {key,id:crypto.randomUUID()};
    const requestKey = pendingDraft.id;
    button.disabled = true;
    status.textContent = 'Guardando la consulta…';
    let popup;
    try {
      popup = window.open('', '_blank');
      if (popup) {
        popup.opener = null;
        popup.document.title = 'Consulta de envío · SALMOS';
        popup.document.body.textContent = 'Preparando tu consulta de envío…';
      }
    } catch {}
    try {
      const token = await context.currentIdToken();
      const response = await context.api('/api/shipping/requests', {
        method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},
        body:JSON.stringify({...data,requestKey})
      });
      if (!validCode(response?.id)) throw new Error('No pudimos confirmar que se guardó la consulta. Volvé a intentar.');
      const link = new URL('/carrito/'+response.id,location.origin);
      const area = [destination.locality,destination.province,destination.postalCode].filter(Boolean).join(', ');
      const count = items.reduce((n,item)=>n+item.quantity,0);
      const lines = cart.slice(0,10).map(item => {
        const details = [item.name,item.color,item.size].filter(Boolean).join(' · ').replace(/\s+/g,' ').slice(0,160);
        return `${item.qty} × ${details}`;
      });
      const message = [
        'Hola SALMOS, quisiera consultar el costo de envío.',
        'Destino: '+area,
        'Entrega: '+({home:'A domicilio',agency:'A sucursal'}[destination.type] || 'A coordinar'),
        count ? `Mi carrito tiene ${count} ${count===1?'unidad':'unidades'}.` : 'Por ahora mi carrito está vacío.',
        ...lines,
        cart.length > lines.length ? 'El resto del carrito está en el enlace.' : '',
        'Mi consulta: '+link.href
      ].filter(Boolean).join('\n');
      const url = context.whatsapp(message);
      status.innerHTML = `<p>Consulta guardada. Enviá el mensaje preparado en WhatsApp.</p>
        <a class="btn btn-secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>`;
      if (popup && !popup.closed) popup.location.replace(url);
    } catch (error) {
      popup?.close();
      status.textContent = error.message || 'No se pudo guardar la consulta.';
    } finally {
      button.disabled = false;
    }
  }

  async function refreshRequest() {
    const host = $('#shippingRequestDialog [data-shipping-request-body]');
    if (!host || !host.closest('dialog').open) return;
    const version = ++viewVersion, user = context.state.auth.user;
    if (!user) {
      host.innerHTML = `<p>Ingresá con Google usando el mismo correo que dejaste en la consulta.</p>
        <button type="button" class="btn btn-primary" data-shipping-request-sign-in>Ingresar o registrarme con Google</button>`;
      return;
    }
    host.textContent = 'Cargando tu consulta…';
    try {
      const {item} = await context.authApi('/api/account/shipping-requests/'+requestId);
      if (version !== viewVersion) return;
      host.innerHTML = window.SalmosShippingRequestView.summary(item,esc);
    } catch (error) {
      if (version !== viewVersion) return;
      host.innerHTML = `<p role="alert">${esc(error.message)}</p><button type="button" class="btn btn-secondary" data-shipping-request-sign-in>Ingresar con otro correo</button>`;
    }
  }

  function openRequest() {
    const adminUrl = '/admin.html?consulta-envio='+encodeURIComponent(requestId);
    context.dialog('shippingRequestDialog','Consulta de envío',`<div data-shipping-request-body></div>
      <a class="shipping-admin-link" href="${adminUrl}">Administración SALMOS</a>`);
    const dialog = $('#shippingRequestDialog');
    dialog.addEventListener('close', () => {
      viewVersion++;
      $('[data-shipping-request-body]',dialog).replaceChildren();
    });
    refreshRequest();
    // A visitor without an Access session stays on the customer view.
    fetch(context.apiUrl('/api/admin/session?check=1'),{credentials:'include',cache:'no-store',redirect:'manual'})
      .then(async response=>{if(response.ok && (await response.json()).ok && dialog.open) location.replace(adminUrl);}).catch(()=>{});
  }

  function init(options) {
    context = options;
    document.addEventListener('submit',submit);
    document.addEventListener('input',remember);
    document.addEventListener('change',remember);
    document.addEventListener('click',event=>{
      if (event.target.closest('[data-shipping-request-sign-in]')) context.signIn();
    });
    if (requestId) openRequest();
  }

  window.SalmosStoreShipping = {init,form,refreshRequest};
})();
