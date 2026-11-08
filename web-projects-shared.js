(() => {
  'use strict';

  const included = 15;
  const basic = 180000;
  const deposit = 90000;
  const extra = 30000;
  const limit = 150;
  const format = 'salmos-catalogo-v1';
  const number = new Intl.NumberFormat('es-AR',{maximumFractionDigits:2});
  const amount = value => '$ '+number.format(value);
  const totals = count => {
    const blocks = Math.max(0,Math.ceil((count-included)/included));
    return {blocks, total:basic+blocks*extra, balance:basic-deposit+blocks*extra};
  };
  const labels = {
    draft:'Borrador', rejected:'Pago rechazado', pending:'Pago pendiente', approved:'Anticipo confirmado',
    refunded:'Pago devuelto', charged_back:'Pago revertido', in_mediation:'Pago en revisión'
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g,char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);

  async function prepareImage(file,maxSide) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 20*1024*1024) {
      throw new Error('Elegí un JPG, PNG o WEBP de hasta 20 MB.');
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      let scale = Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
      for (let attempt=0; attempt<5; attempt++) {
        canvas.width = Math.max(1,Math.round(image.naturalWidth*scale));
        canvas.height = Math.max(1,Math.round(image.naturalHeight*scale));
        context.drawImage(image,0,0,canvas.width,canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',.85-attempt*.07));
        if (blob?.size && blob.size <= 96*1024) return blob;
        scale *= .75;
      }
      throw new Error('No pudimos preparar la imagen. Probá con una foto más chica.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function photoForm(form,maxSide) {
    const data = new FormData(form);
    const file = data.get('photo');
    if (file?.size) data.set('photo',await prepareImage(file,maxSide),'imagen');
    else data.delete('photo');
    return data;
  }

  function photoField(form,initialUrl) {
    const photo = form.querySelector('[name="photo"]');
    const removed = form.querySelector('[name="removePhoto"]');
    const image = form.querySelector('[data-photo-preview]');
    const remove = form.querySelector('[data-photo-remove]');
    const hint = form.querySelector('[data-photo-hint]');
    let currentUrl = '';
    function show(url) {
      image.hidden = !url;
      remove.hidden = !url;
      if (url) image.src = url;
      else image.removeAttribute('src');
    }
    function clearPreview() {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = '';
    }
    show(initialUrl);
    photo.onchange = () => {
      clearPreview();
      const file = photo.files[0];
      if (!file) {show(removed.value === '1' ? '' : initialUrl);return;}
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 20*1024*1024) {
        hint.textContent = 'Elegí un JPG, PNG o WEBP de hasta 20 MB.';
        photo.value = '';
        show(removed.value === '1' ? '' : initialUrl);
        return;
      }
      removed.value = '0';
      currentUrl = URL.createObjectURL(file);
      show(currentUrl);
      hint.textContent = 'Imagen seleccionada.';
    };
    remove.onclick = () => {
      clearPreview();
      photo.value = '';
      removed.value = '1';
      show('');
      hint.textContent = 'Imagen quitada.';
    };
    return clearPreview;
  }

  window.SalmosWebProjects = {included,basic,deposit,extra,limit,format,amount,totals,labels,escape,photoForm,photoField};
})();
