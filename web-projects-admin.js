(() => {
  'use strict';

  const endpoint = '/api/admin/web-projects';

  async function render(host,{api,apiUrl,toast}) {
    const {escape:esc,labels,totals,amount,photoForm,photoField,format} = window.SalmosWebProjects;
    const panel = document.createElement('section');
    panel.className = 'web-projects-admin';
    panel.innerHTML = '<div class="web-project-toolbar"><div><h2>Páginas para negocios</h2><p class="muted">Prepará la marca, compartí la muestra y descargá el catálogo cuando se confirme el anticipo.</p></div>'+
      '<div class="web-project-actions"><a class="btn btn-ghost" href="/quieromipagina/" target="_blank" rel="noopener">Ver precios</a>'+
      '<button class="btn btn-primary" type="button" data-create>+ Proyecto</button></div></div>'+
      '<p class="notice" data-payment-warning hidden>Para habilitar el anticipo en SALMOS hacen falta las credenciales de producción de Mercado Pago y la firma del webhook.</p>'+
      '<div class="web-project-list"></div><section class="web-project-detail" hidden></section>'+
      '<dialog class="admin-dialog web-project-admin-dialog" aria-labelledby="web-project-brand-title"><form class="dialog-shell">'+
      '<div class="dialog-head"><h2 id="web-project-brand-title"></h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">×</button></div>'+
      '<div class="dialog-body"><div class="form-grid">'+
      '<label class="field">Nombre del negocio<input class="input" name="name" maxlength="70" required></label>'+
      '<label class="field">WhatsApp con código de país<input class="input" type="tel" name="whatsapp" maxlength="24" placeholder="549..." required></label>'+
      '<label class="field full">Descripción breve<input class="input" name="description" maxlength="240"></label>'+
      '<label class="field">Color principal<input class="input" type="color" name="accent"></label>'+
      '<label class="field">Color de fondo<input class="input" type="color" name="background"></label>'+
      '<label class="field">Disposición<select class="select" name="grouped"><option value="false">Galería única</option><option value="true">Galerías por categoría</option></select></label>'+
      '<div class="web-project-logo"><img data-photo-preview alt="Vista previa del logo" width="52" height="52" hidden>'+
      '<label class="btn btn-ghost wp-file">Elegir logo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>'+
      '<button type="button" class="btn btn-ghost" data-photo-remove hidden>Quitar logo</button><input name="removePhoto" type="hidden" value="0"><small data-photo-hint class="muted" role="status"></small></div>'+
      '</div><p data-form-error class="notice" role="alert" hidden></p></div>'+
      '<div class="dialog-foot"><button type="submit" class="btn btn-primary">Guardar proyecto</button></div></form></dialog>';
    host.replaceChildren(panel);
    const $ = selector => panel.querySelector(selector);
    const detail = $('.web-project-detail');
    const dialog = $('dialog');
    const form = $('form');
    const submit = form.querySelector('[type="submit"]');
    const invitations = new Map();
    let current = null;
    let items = [];
    let editing = null;
    let clearPhoto;
    let selection = 0;

    function drawList() {
      $('.web-project-list').innerHTML = items.length ? items.map(item =>
        '<button type="button" class="web-project-row" data-project="'+esc(item.id)+'" aria-current="'+String(item.id===current?.id)+'">'+
        '<span><strong>'+esc(item.name)+'</strong> · <small>'+item.productCount+' producto(s)</small></span><small>'+esc(labels[item.status])+
        (item.duplicatePaymentId ? ' · Revisar segundo pago' : '')+'</small></button>'
      ).join('') : '<p class="muted">Todavía no hay proyectos.</p>';
    }

    function renderDetail() {
      drawList();
      if (!current) return;
      const estimate = totals(current.products.length);
      const link = invitations.get(current.id);
      detail.hidden = false;
      detail.innerHTML = '<h2>'+esc(current.name)+'</h2><p class="muted">'+esc(labels[current.status])+
        (current.paymentId ? ' · Operación '+esc(current.paymentId) : '')+' · Saldo '+amount(estimate.balance)+'</p>'+
        (current.duplicatePaymentId ? '<p class="notice">Mercado Pago registró un segundo anticipo. Revisá la operación '+esc(current.duplicatePaymentId)+'.</p>' : '')+
        '<div class="web-project-actions"><button type="button" class="btn btn-ghost" data-edit-brand>Editar marca</button>'+
        '<button type="button" class="btn btn-ghost" data-invite>'+(link ? 'Renovar enlace privado' : 'Generar enlace privado')+'</button>'+
        (current.checkoutStarted ? '<button type="button" class="btn btn-ghost" data-check-payment>Verificar pago</button>' : '')+
        (current.status === 'approved' ? '<button type="button" class="btn btn-primary" data-export>Descargar catálogo</button>' : '')+'</div>'+
        (link ? '<div class="web-project-share"><input class="input" data-invitation readonly aria-label="Enlace privado del proyecto" value="'+esc(link)+'">'+
        '<button type="button" class="btn btn-primary" data-copy>Copiar enlace</button><a class="btn btn-ghost" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Ver muestra</a></div>'+
        '<p class="muted">Compartilo solo con tu cliente. Al renovarlo, cambia el acceso.</p>' : '')+
        (current.products.length ? '<ul class="web-project-rows">'+current.products.map(item =>
          '<li>'+(item.photo ? '<img src="'+esc(apiUrl(item.photo))+'" width="36" height="36" loading="lazy" alt="">' : '')+
          '<span>'+esc(item.name)+'</span><small>'+amount(item.priceCents/100)+'</small></li>'
        ).join('')+'</ul>' : '<p class="muted">El proyecto está listo para mostrar los productos de ejemplo.</p>');
    }

    async function loadList() {
      const result = await api(endpoint,{cache:'no-store'});
      items = result.items;
      $('[data-payment-warning]').hidden = result.paymentEnabled;
      drawList();
    }

    async function select(id) {
      const attempt = ++selection;
      const {item} = await api(endpoint+'/'+id,{cache:'no-store'});
      if (attempt !== selection || !panel.isConnected) return;
      current = item;
      renderDetail();
    }

    function editBrand(item) {
      editing = item || null;
      form.reset();
      const defaults = {name:'',whatsapp:'',description:'',accent:'#246453',background:'#f7f4ed',grouped:false};
      for (const name of Object.keys(defaults)) form.elements[name].value = item?.[name] ?? defaults[name];
      form.elements.removePhoto.value = '0';
      form.querySelector('[data-photo-hint]').textContent = '';
      $('[data-form-error]').hidden = true;
      $('#web-project-brand-title').textContent = item ? 'Editar marca' : 'Nuevo proyecto';
      clearPhoto?.();
      clearPhoto = photoField(form,item?.logo ? apiUrl(item.logo) : '');
      dialog.showModal();
      form.elements.name.focus();
    }

    async function getPhoto(url) {
      if (!url) return '';
      const response = await fetch(apiUrl(url),{credentials:'include',cache:'no-store',redirect:'manual'});
      if (!response.ok) throw new Error('No se pudo recuperar una imagen. Volvé a intentar con la sesión activa.');
      const blob = await response.blob();
      if (!['image/png','image/jpeg','image/webp'].includes(blob.type) || blob.size > 96*1024) throw new Error('Una foto del proyecto no tiene un formato válido.');
      return await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer una foto del catálogo.'));
        reader.readAsDataURL(blob);
      });
    }

    async function exportCatalog(id) {
      const {item} = await api(endpoint+'/'+id+'/export',{cache:'no-store'});
      const {name,whatsapp,description,accent,background,grouped,currency} = item;
      const products = [];
      for (let index=0; index<item.products.length; index+=6) {
        products.push(...await Promise.all(item.products.slice(index,index+6).map(async product =>
          ({...product,photo:await getPhoto(product.photo)}))));
      }
      const data = {format,id,name,whatsapp,description,accent,background,grouped,currency,products,logo:await getPhoto(item.logo)};
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
      const download = document.createElement('a');
      download.href = url;
      download.download = (name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\d]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'catalogo')+'.salmos-catalogo.json';
      document.body.append(download);
      download.click();
      download.remove();
      setTimeout(() => URL.revokeObjectURL(url),3000);
      toast('Catálogo listo para abrir en el personalizador.','success');
    }

    panel.onclick = async event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.matches('[data-create]')) return editBrand();
      if (button.matches('[data-edit-brand]')) return editBrand(current);
      if (button.matches('[data-close]')) {if (!submit.disabled) dialog.close();return;}
      const id = current?.id;
      try {
        button.disabled = true;
        if (button.dataset.project) {
          await select(button.dataset.project);
        } else if (button.matches('[data-invite]')) {
          if (!confirm('¿Generar un nuevo enlace privado? El anterior dejará de funcionar.')) return;
          const {invitation} = await api(endpoint+'/'+id+'/invite',{method:'POST'});
          invitations.set(id,invitation);
          if (id===current?.id) renderDetail();
        } else if (button.matches('[data-copy]')) {
          const input = $('[data-invitation]');
          try {
            await navigator.clipboard.writeText(input.value);
            toast('Enlace privado copiado.','success');
          } catch {
            input.focus();
            input.select();
          }
        } else if (button.matches('[data-check-payment]')) {
          const {item} = await api(endpoint+'/'+id+'/verify',{method:'POST'});
          await loadList();
          if (id===current?.id) {current = item;renderDetail();}
          toast(labels[item.status]+'.','success');
        } else if (button.matches('[data-export]')) {
          await exportCatalog(id);
        }
      } catch (error) {
        toast(error.message,'error');
      } finally {
        button.disabled = false;
      }
    };

    dialog.addEventListener('cancel',event => {if (submit.disabled) event.preventDefault();});
    dialog.addEventListener('close',() => clearPhoto?.());
    form.onsubmit = async event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      const warning = $('[data-form-error]');
      warning.hidden = true;
      try {
        const data = await photoForm(form,450);
        if (editing) data.set('revision',editing.revision);
        const result = await api(endpoint+(editing ? '/'+editing.id : ''),{method:editing ? 'PUT' : 'POST',body:data});
        if (result.invitation) invitations.set(result.item.id,result.invitation);
        current = result.item;
        dialog.close();
        renderDetail();
        await loadList();
        toast('Proyecto guardado.','success');
      } catch (error) {
        warning.textContent = error.message;
        warning.hidden = false;
        if (!dialog.open) toast(error.message,'error');
      } finally {
        submit.disabled = false;
      }
    };

    await loadList();
  }

  window.SalmosWebProjectsAdmin = {render};
})();
