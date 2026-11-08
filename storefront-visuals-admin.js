(() => {
  'use strict';

  const views = {home:'Portada',catalog:'Colecciones',wholesale:'Mayoristas'};
  const groups = {
    hombre:'Hombre',mujer:'Mujer',kids:'Kids',ropa:'Ropa',gorras:'Gorras',tazas:'Tazas y Vasos',
    libros:'Libros',agendas:'Agendas',actividades:'Actividades',cuadernos:'Cuadernos'
  };
  const coverGroups = ['gorras','tazas','libros','agendas','actividades'];
  const baseTargets = {page:'Fondo de la página',people:'Fichas de prendas y personas',objects:'Fichas de objetos'};
  const modes = {dark:'Modo oscuro',light:'Modo claro'};
  const esc = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let context;

  function applyBackgroundPatch(saved, patch) {
    const result = structuredClone(saved||{});
    for (const [view, targets] of Object.entries(patch)) {
      for (const [target, choices] of Object.entries(targets)) {
        for (const [theme,id] of Object.entries(choices)) {
          const row = ((result[view]??={})[target]??={});
          if (id===null) delete row[theme];
          else row[theme]=id;
        }
      }
    }
    return result;
  }

  function legacyBackground(visuals,view,target,theme) {
    const names = view==='wholesale'
      ? {page:'wholesalePageBackgrounds',people:'wholesalePeoplePhotoBackgrounds',objects:'wholesaleObjectPhotoBackgrounds'}
      : {page:'pageBackgrounds',people:'peoplePhotoBackgrounds',objects:'objectPhotoBackgrounds'};
    return visuals?.[names[target]]?.[theme]||null;
  }

  function backgroundPanel(host, options) {
    let saved=structuredClone(options.backgrounds||{}),assets=options.assets||[],pending=new Map();
    let view=options.view||'home',target='page',busy=false;
    const getId=(where,key,theme)=>saved[where]?.[key]?.[theme]??null;
    const index=(where,key,theme)=>`${where}|${key}|${theme}`;
    const keyFor=theme=>index(view,target,theme);
    const categories=new Map((options.categories||[]).filter(item=>/^[a-z0-9][a-z0-9-]{0,99}$/.test(item.slug)).map(item=>[`category:${item.slug}`,item.name]));
    const products=new Map((options.products||[]).map(item=>[`product:${Number(item.id)}`,item.name]));
    const assetById=id=>assets.find(asset=>Number(asset.id)===id);
    const option=(key,label)=>`<option value="${esc(key)}"${key===target?' selected':''}>${esc(label)}</option>`;
    const targetChoices=(map)=>[...map].map(([key,label])=>option(key,label)).join('');
    const available=()=>assets.filter(asset=>!Number(asset.duplicate_of));
    const patch=()=>{
      const result={};
      for(const [key,id] of pending){
        const [where,group,theme]=key.split('|');
        ((result[where]??={})[group]??={})[theme]=id;
      }
      return result;
    };

    function inherited(theme){
      const broad=Object.hasOwn(baseTargets,target)?target:
        ['hombre','mujer','kids','ropa'].includes(target)?'people':
        Object.hasOwn(groups,target)?'objects':null;
      if(!broad)return null;
      if(broad!==target){
        const key=index(view,broad,theme),general=pending.has(key)?pending.get(key):getId(view,broad,theme);
        if(general===0)return {none:true};
        const selected=assetById(general);
        if(selected)return selected;
      }
      return legacyBackground(options.visuals,view,broad,theme);
    }

    function themeCard(theme,label){
      const key=keyFor(theme),id=pending.has(key)?pending.get(key):getId(view,target,theme);
      const asset=assetById(id),visibleId=asset?Number(asset.duplicate_of)||Number(asset.id):id;
      const example=id===null?inherited(theme):asset;
      const title=example?.name||(id===0||example?.none?'Sin fondo':'Fondo heredado');
      const url=example&&!example.none&&(example.url||options.assetUrl(example));
      return `<section class="visual-background-card" data-visual-theme="${theme}">
        <div class="visual-background-head"><h4>${label}</h4><button type="button" class="btn btn-ghost" data-visual-upload="${theme}">+ Fondo</button></div>
        <div class="visual-background-preview ${theme}">${url?`<img src="${esc(url)}" alt="${esc(title)}">`:`<span>${esc(title)}</span>`}</div>
        <label class="visual-background-label">Fondo en ${label.toLowerCase()}
          <select class="select" data-visual-theme-select="${theme}">
            <option value="" ${id===null?'selected':''}>Heredar fondo</option>
            <option value="0" ${id===0?'selected':''}>${target==='page'?'Fondo liso':'Sin fondo'}</option>
            ${available().map(item=>`<option value="${Number(item.id)}" ${Number(item.id)===visibleId?'selected':''}>${esc(item.name)}</option>`).join('')}
          </select>
        </label>
        <div class="visual-background-swatches" aria-label="Fondos de ${label.toLowerCase()}">
          ${available().map(item=>`<button type="button" data-visual-asset="${Number(item.id)}" aria-pressed="${Number(item.id)===visibleId}">
            <img src="${esc(options.assetUrl(item))}" alt="" loading="lazy" decoding="async"><span>${esc(item.name)}</span>
          </button>`).join('')}
        </div>
      </section>`;
    }
    function render(focusTheme){
      const scrollPositions=[...host.querySelectorAll('.visual-background-swatches')].map(list=>list.scrollLeft);
      host.innerHTML=`<fieldset class="visual-background-editor" ${busy?'disabled':''}>
        <div class="visual-background-tabs" role="group" aria-label="Dónde se verá el fondo">
          ${Object.entries(views).map(([key,label])=>`<button type="button" class="btn ${key===view?'btn-primary':'btn-ghost'}" data-visual-view="${key}" aria-pressed="${key===view}">${label}</button>`).join('')}
        </div>
        <label class="visual-background-label">Aplicar fondo a
          <select class="select" data-visual-target>
            ${Object.entries(baseTargets).map(([key,label])=>option(key,label)).join('')}
            <optgroup label="Fichas por colección y tipo">${Object.entries(groups).map(([key,label])=>option(key,label)).join('')}</optgroup>
            ${categories.size?`<optgroup label="Fichas por categoría">${targetChoices(categories)}</optgroup>`:''}
            ${products.size?`<optgroup label="Fichas individuales">${targetChoices(products)}</optgroup>`:''}
          </select>
        </label>
        <div class="visual-background-grid">${Object.entries(modes).map(([theme,label])=>themeCard(theme,label)).join('')}</div>
      </fieldset>`;
      host.querySelectorAll('.visual-background-swatches').forEach((list,index)=>{list.scrollLeft=scrollPositions[index]||0;});
      if(focusTheme)host.querySelector(`[data-visual-theme-select="${focusTheme}"]`)?.focus({preventScroll:true});
    }
    function change(where,key,theme,id){
      const indexKey=index(where,key,theme);
      if(getId(where,key,theme)===id)pending.delete(indexKey);
      else pending.set(indexKey,id);
      render(theme);
      options.onChange?.(applyBackgroundPatch(saved,patch()),pending.size>0);
    }

    function addBackground(theme){
      const where=view,key=target,dialog=document.createElement('dialog');
      dialog.className='storefront-background-upload';
      dialog.innerHTML=`<form>
        <div class="visual-background-head"><h3>Agregar fondo</h3><button type="button" class="icon-btn" data-close-background aria-label="Cerrar">×</button></div>
        <label class="visual-background-label">Imagen <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required></label>
        <label class="visual-background-label">Nombre <input class="input" name="name" maxlength="120" required></label>
        <img class="visual-upload-preview" alt="Vista previa del fondo" hidden>
        <p role="status"></p><button type="submit" class="btn btn-primary">Agregar fondo</button>
      </form>`;
      document.body.append(dialog);
      const form=dialog.querySelector('form'),status=form.querySelector('[role=status]'),close=form.querySelector('[data-close-background]'),preview=form.querySelector('img'),submit=form.querySelector('[type=submit]');
      let url='',uploading=false,token=crypto.randomUUID();
      close.onclick=()=>{if(!uploading)dialog.close();};
      dialog.addEventListener('cancel',event=>{if(uploading)event.preventDefault();});
      dialog.addEventListener('close',()=>{if(url)URL.revokeObjectURL(url);dialog.remove();},{once:true});
      form.elements.image.onchange=()=>{
        if(url)URL.revokeObjectURL(url);
        const file=form.elements.image.files[0];
        url=file?URL.createObjectURL(file):'';
        preview.hidden=!file;
        if(url)preview.src=url;
        token=crypto.randomUUID();
      };
      form.onsubmit=async event=>{
        event.preventDefault();
        if(uploading||!form.reportValidity())return;
        const file=form.elements.image.files[0],name=form.elements.name.value.trim();
        if(!file||!name||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024){
          status.textContent='Elegí un PNG, JPG o WEBP de hasta 20 MB y escribí el nombre.';
          return;
        }
        uploading=close.disabled=submit.disabled=true;
        status.textContent='Agregando fondo…';
        try{
          const asset=await options.uploadBackground(file,name,token);
          assets=[...assets.filter(item=>Number(item.id)!==Number(asset.id)),asset];
          change(where,key,theme,Number(asset.id));
          dialog.close();
        }catch(error){status.textContent=error.message;}
        finally{uploading=close.disabled=submit.disabled=false;}
      };
      dialog.showModal();
    }

    function setLocation(nextView,nextTarget='page'){
      if(view===nextView&&target===nextTarget)return;
      view=nextView;
      target=Object.hasOwn(baseTargets,nextTarget)||Object.hasOwn(groups,nextTarget)||categories.has(nextTarget)||products.has(nextTarget)?nextTarget:'page';
      render();
    }
    host.onclick=event=>{
      const viewButton=event.target.closest('[data-visual-view]');
      if(viewButton){
        setLocation(viewButton.dataset.visualView);
        options.onView?.(view);
        host.querySelector(`[data-visual-view="${view}"]`)?.focus({preventScroll:true});
        return;
      }
      const upload=event.target.closest('[data-visual-upload]');
      if(upload){addBackground(upload.dataset.visualUpload);return;}
      const swatch=event.target.closest('[data-visual-asset]');
      if(swatch)change(view,target,swatch.closest('[data-visual-theme]').dataset.visualTheme,Number(swatch.dataset.visualAsset));
    };
    host.onchange=event=>{
      const el=event.target;
      if(el.matches('[data-visual-target]')){
        target=el.value;
        render();
        host.querySelector('[data-visual-target]').focus({preventScroll:true});
      }else if(el.matches('[data-visual-theme-select]')){
        change(view,target,el.dataset.visualThemeSelect,el.value===''?null:Number(el.value));
      }
    };
    render();
    return {
      patch,setLocation,
      dirty:()=>pending.size>0,
      setBusy:value=>{busy=value;host.querySelector('fieldset').disabled=value;},
      commit:values=>{saved=structuredClone(values||{});pending.clear();render();},
      reset:()=>{pending.clear();render();options.onChange?.(structuredClone(saved),false);}
    };
  }

  async function render(host) {
    const data=await context.load();
    if(!host.isConnected)return;
    let config={};
    try{config=JSON.parse(data.settings.storefront_visuals_v1||'{}');}catch{}
    const products=data.products.filter(product=>product.status==='published');
    const covers=products.filter(product=>product.primary_image_url);
    const dirtyCovers=new Set();
    host.innerHTML=`<section class="storefront-settings">
      <div class="admin-section-head"><h2>Portada de tienda</h2><a class="btn btn-ghost" href="index.html?ordenar=1">Ordenar en la tienda</a></div>
      <h3>Fondos de la tienda</h3><div data-visual-background-panel></div>
      <details class="visual-cover-settings"><summary>Imágenes de los accesos de portada</summary>
        <div class="storefront-covers-grid">${coverGroups.map(key=>{
          const id=Number(config.covers?.[key]?.dark?.id)||0;
          return `<section class="storefront-cover-edit"><h3>${groups[key]}</h3><div class="storefront-cover-edit-preview" data-cover-preview="${key}"></div>
            <label class="field">Producto para la imagen<select class="select" data-home-cover="${key}"><option value="">Primera publicación</option>
              ${covers.map(product=>`<option value="${Number(product.id)}" ${Number(product.id)===id?'selected':''}>${esc(product.name)}</option>`).join('')}</select></label></section>`;
        }).join('')}</div>
      </details>
      <div class="storefront-settings-save"><p role="status" data-visual-status></p><button type="button" class="btn btn-primary" data-visual-save disabled>Guardar cambios</button></div>
    </section>`;
    const save=host.querySelector('[data-visual-save]'),status=host.querySelector('[data-visual-status]');
    const panel=backgroundPanel(host.querySelector('[data-visual-background-panel]'),{
      backgrounds:data.publicConfig.storefrontBackgrounds,
      visuals:data.publicConfig.storefrontVisuals,
      assets:data.assets.filter(asset=>asset.asset_type==='background'),
      products,categories:data.categories,assetUrl:context.assetUrl,uploadBackground:context.uploadBackground,
      onChange:()=>{save.disabled=!panel.dirty()&&!dirtyCovers.size;status.textContent='';}
    });
    function coverPreview(select){
      const preview=host.querySelector(`[data-cover-preview="${select.dataset.homeCover}"]`),product=covers.find(item=>Number(item.id)===Number(select.value));
      preview.innerHTML=product?`<img src="${esc(product.primary_image_url)}" alt="${esc(product.name)}" loading="lazy">`:'Primera publicación de esta sección';
    }
    for(const select of host.querySelectorAll('[data-home-cover]')){
      coverPreview(select);
      select.onchange=()=>{dirtyCovers.add(select.dataset.homeCover);coverPreview(select);save.disabled=false;};
    }
    save.onclick=async()=>{
      save.disabled=true;panel.setBusy(true);
      const selects=[...host.querySelectorAll('[data-home-cover]')];
      for(const select of selects)select.disabled=true;
      status.textContent='Guardando cambios…';
      try{
        if(panel.dirty()){
          const result=await context.saveBackgrounds(panel.patch());
          panel.commit(result.backgrounds);
        }
        if(dirtyCovers.size){
          const selections={};
          for(const select of selects){
            const key=select.dataset.homeCover;
            if(!dirtyCovers.has(key))continue;
            const selected=select.value?{kind:'product',id:Number(select.value)}:null;
            selections[key]=selected?{dark:selected,light:selected}:null;
          }
          await context.saveCovers(selections);
          dirtyCovers.clear();
        }
        status.textContent='Cambios guardados.';
      }catch(error){status.textContent=error.message;}
      finally{
        panel.setBusy(false);
        for(const select of selects)select.disabled=false;
        save.disabled=!panel.dirty()&&!dirtyCovers.size;
      }
    };
  }
  async function open(){
    const dialog=document.createElement('dialog');
    dialog.className='admin-dialog storefront-covers-editor';
    dialog.innerHTML='<div class="dialog-shell"><div class="dialog-head"><h2>Fondos de la tienda</h2><button type="button" class="icon-btn" aria-label="Cerrar">×</button></div><div class="dialog-body"></div></div>';
    document.body.append(dialog);
    dialog.querySelector('button').onclick=()=>dialog.close();
    dialog.onclose=()=>dialog.remove();
    dialog.showModal();
    await render(dialog.querySelector('.dialog-body'));
  }
  function init(options){
    context=options;
    document.addEventListener('click',event=>{if(event.target.closest('[data-open-storefront-visuals]'))open().catch(error=>context.toast(error.message,'error'));});
  }
  window.SalmosStorefrontVisualsAdmin={init,open,render,backgroundPanel,legacyBackground,groups};
})();
