// SALMOS 25.26
(() => {
  'use strict';

  const cfg = window.SALMOS_CONFIG || {};
  const API = (cfg.API_BASE_URL || '').replace(/\/$/, '');
  const apiUrl = path => `${API}${path}`;
  const qs = (s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[s]));
  const money=(c=0)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format((Number(c)||0)/100);
  const pesosToCents=v=>Math.round((Number(v)||0)*100);
  const centsToPesos=v=>String(Math.round(Number(v)||0)/100);
  const today=(date=new Date())=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),part=type=>parts.find(p=>p.type===type).value;return `${part('year')}-${part('month')}-${part('day')}`;};

  const adminDateFormatter=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric'});
  const adminTimeFormatter=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  function parseAdminDate(value){
    if(value instanceof Date)return Number.isFinite(value.getTime())?value:null;
    let text=String(value||'').trim();if(!text)return null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(text))text+='T12:00:00-03:00';
    else if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)){text=text.replace(' ','T');if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text))text+='Z';}
    const date=new Date(text);return Number.isFinite(date.getTime())?date:null;
  }
  function adminDateTimeHtml(value){
    const date=parseAdminDate(value);if(!date)return '—';
    const hasTime=value instanceof Date||/[T ]\d{2}:\d{2}/.test(String(value)),time=adminTimeFormatter.format(date).slice(0,5);
    return `<span class="admin-date-stamp">${adminDateFormatter.format(date)}${hasTime?`<small class="admin-date-time">${time}</small>`:''}</span>`;
  }
  function recordDateTime(day,original,now=new Date()){
    const previous=parseAdminDate(original),clock=previous||now;
    if(previous&&today(previous)===day)return previous.toISOString();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('Ingresá una fecha válida.');
    const date=new Date(`${day}T${adminTimeFormatter.format(clock)}-03:00`);
    if(!Number.isFinite(date.getTime())||today(date)!==day)throw new Error('Ingresá una fecha válida.');
    return date.toISOString();
  }

  const state={designUploadContext:'designs',editingPurchaseId:null,purchaseContext:'purchases',purchaseOriginalOccurredAt:null,movementOriginalOccurredAt:null,otherEditor:null,colorEditorRow:null,view:'dashboard',categories:[],products:[],orders:[],customOrders:[],coupons:[],flyers:[],settings:{},correoStatus:null,editingProduct:null,editingCouponId:null,editingMovementId:null,newFiles:[],mediaItems:[],mediaDragKey:null,mediaHostId:'mediaOrderList',reportRange:'month',purchaseReportRange:'total',customFrom:'',customTo:'',stockItems:[],stockFilters:{category:'',stage:'',size:'',color:'',fit:'',audience:'',sort:'product'},designAssets:[],mockupAssets:[],mockupImageCache:new Map(),mockupRenderSeq:0,mockupLayerBoxes:[],mockupSelectedLayer:'',mockupPointer:null,mockupZoom:1,mockupPanX:0,mockupPanY:0,sheetZoom:1,mockupCapDesign:null,mockupUploadFromPurchaseRow:null,activeDesignId:null,activeFlyerId:null,purchases:[],materials:[],productionJobs:[],purchaseItems:[],productRecipeDesigns:[],productRecipeMaterials:[],costingLoaded:false,productionProduct:null,productionMaterialsSelected:[],productionDesignsSelected:[],productionWizardTab:1,productionPriceDirty:false,productionShippingDirty:false,purchaseOptionsLoaded:false,purchaseOptions:{types:[],fits:[],classes:[],sizes:{},materials:{},colors:[],financeReasons:[]},recentFinanceReasons:[]};

  const apiCache=new Map(),apiRequests=new Map(),apiReadVersions=new Map();let apiGeneration=0,adminSessionWindow=null;
  function clearApiCache(){apiGeneration++;apiCache.clear();apiRequests.clear();apiReadVersions.clear();}
  function apiCacheLifetime(path){const route=path.split('?')[0];return ['/api/admin/settings','/api/admin/categories'].includes(route)?60000:['/api/admin/products','/api/admin/design-assets','/api/admin/materials','/api/admin/mockup-assets','/api/admin/production'].includes(route)?10000:0;}
  function adminSessionError(){
    clearApiCache();const err=new Error('Tu sesión venció. Volvé a ingresar y después retomá la carga; tus archivos siguen en este panel.');err.status=401;err.sessionExpired=true;showAdminSessionNotice();return err;
  }
  function adminSessionActions(){return '<div class="admin-actions admin-session-actions"><button type="button" class="btn btn-primary" data-admin-session-login>Volver a ingresar</button><button type="button" class="btn btn-ghost" data-admin-session-check>Ya volví a ingresar</button></div>';}
  function showAdminSessionNotice(){
    const dialog=qsa('dialog[open]').at(-1);if(!dialog||qs('[data-admin-session-notice]',dialog))return;
    const notice=document.createElement('div');notice.className='notice admin-session-notice';notice.dataset.adminSessionNotice='';notice.setAttribute('role','alert');notice.innerHTML='<strong>La sesión venció</strong><p>Volvé a ingresar en otra ventana. Los archivos y ajustes que cargaste acá se conservan.</p>'+adminSessionActions();(qs('.dialog-body',dialog)||dialog).prepend(notice);notice.scrollIntoView({block:'nearest'});
  }
  function openAdminSession(){
    const origin=window.location.origin;adminSessionWindow=window.open(apiUrl('/api/admin/session?origin='+encodeURIComponent(origin)),'salmos-admin-session','popup,width=560,height=720');
    if(!adminSessionWindow)toast('Habilitá la ventana de ingreso y tocá «Volver a ingresar» otra vez.','error',6000);
  }
  async function resumeAdminSession(){
    await api('/api/admin/session?check=1',{cache:'no-store'});clearApiCache();qsa('[data-admin-session-notice]').forEach(el=>el.remove());state.purchaseOptionsLoaded=false;
    if(qsa('dialog[open]').length)toast('Sesión activa. Ya podés retomar la carga con los archivos que tenías.','success');else await navigate(state.view);
  }
  async function requestApi(path, options={}){
    const headers=new Headers(options.headers||{});
    if(options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    const res=await fetch(apiUrl(path),{...options,headers,credentials:'include',redirect:'manual'});
    if(res.type==='opaqueredirect'||res.status===401)throw adminSessionError();
    const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{if(/cloudflare access|cloudflareaccess\.com|cdn-cgi\/access\/login/i.test(text))throw adminSessionError();const err=new Error('La API devolvió una respuesta inválida. Volvé a intentar la carga.');err.status=res.status>=400?res.status:502;throw err;}
    if(!res.ok){
      const err=new Error(data?.error||data?.message||`Error ${res.status}`); err.status=res.status; throw err;
    }
    if(path==='/api/admin/settings'&&(!options.method||options.method==='GET')){state.settings={...state.settings,...(data.settings||{})};window.SalmosColors?.setCatalog(state.settings.named_color_catalog);}return data;
  }
  async function api(path,options={}){
    const method=String(options.method||'GET').toUpperCase();
    if(method!=='GET'){clearApiCache();try{return await requestApi(path,options)}finally{clearApiCache()}}
    if(options.signal||options.headers)return await requestApi(path,options);
    const lifetime=apiCacheLifetime(path),fresh=['no-store','reload'].includes(options.cache),cached=apiCache.get(path);
    if(!fresh&&cached&&cached.expires>Date.now())return structuredClone(cached.data);
    if(apiRequests.has('fresh:'+path))return structuredClone(await apiRequests.get('fresh:'+path));
    if(fresh){apiCache.delete(path);apiReadVersions.set(path,(apiReadVersions.get(path)||0)+1);}
    const version=apiReadVersions.get(path)||0,key=(fresh?'fresh:':version+':')+path,generation=apiGeneration;
    if(apiRequests.has(key))return structuredClone(await apiRequests.get(key));
    const request=requestApi(path,options).then(data=>{if(lifetime&&options.cache!=='no-store'&&generation===apiGeneration&&version===(apiReadVersions.get(path)||0))apiCache.set(path,{data:structuredClone(data),expires:Date.now()+lifetime});return data;});
    apiRequests.set(key,request);
    try{return structuredClone(await request)}finally{if(apiRequests.get(key)===request)apiRequests.delete(key)}
  }
  async function downloadAdminFile(path,fallbackName='archivo.pdf'){
    const res=await fetch(apiUrl(path),{credentials:'include',redirect:'manual'});if(res.type==='opaqueredirect'||res.status===401)throw adminSessionError();if(!res.ok){let msg=`Error ${res.status}`;try{const d=await res.json();msg=d.error||d.message||msg}catch{}throw new Error(msg);}const blob=await res.blob();const disp=res.headers.get('content-disposition')||'';const m=disp.match(/filename="?([^";]+)"?/i);const name=m?.[1]||fallbackName;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function toast(msg,type='',duration){
    const dialog=qsa('dialog[open]').at(-1);let host=qs('#toastStack');
    if(dialog){host=qs('.dialog-notices',dialog);if(!host){host=document.createElement('div');host.className='dialog-notices';host.setAttribute('role','status');dialog.appendChild(host);}}
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;host.appendChild(el);setTimeout(()=>el.remove(),duration??(type==='error'?12000:4500));
  }
  function setTheme(t){document.documentElement.dataset.theme=t==='light'?'light':'dark';localStorage.setItem('salmos_theme',document.documentElement.dataset.theme)}
  function initTheme(){const s=localStorage.getItem('salmos_theme');setTheme(s|| (matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'))}
  function previewColor(value){let color=String(value||'').trim().toLowerCase();if(color==='white')color='#ffffff';if(color==='black')color='#000000';if(/^#[0-9a-f]{3}$/.test(color))color='#'+[...color.slice(1)].map(x=>x+x).join('');return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/.test(color)?color:'';}
  function designAppearanceTarget(owner='detail'){
    const assetId=owner.startsWith('asset-')?Number(owner.slice(6)):['detail','sheet-detail'].includes(owner)?Number(state.activeDesignId):0;
    if(assetId)return state.designAssets.find(asset=>Number(asset.id)===assetId);
    if(owner.startsWith('batch-')){const record=(state.designUploadFiles||[]).find(record=>String(record.id)===owner.slice(6));if(record)return record.appearance??={};}
    if(['upload','sheet-upload'].includes(owner))return state.sheetUploadAppearance??={};
    return null;
  }
  function designVisualOwner(owner){return ['detail','sheet-detail'].includes(owner)?'asset-'+state.activeDesignId:owner==='upload'?'sheet-upload':owner;}
  function designViewerBackground(owner='detail'){return previewColor(designAppearanceTarget(owner)?.preview_background)||'default';}
  function initDesignBackground(){delete document.documentElement.dataset.designBackground;}
  function designVisualAttrs(assetOrOwner){
    const owner=typeof assetOrOwner==='string'?designVisualOwner(assetOrOwner):'asset-'+assetOrOwner.id,asset=typeof assetOrOwner==='string'?designAppearanceTarget(owner):assetOrOwner,bg=previewColor(asset?.preview_background),color=previewColor(asset?.preview_color);
    return `data-design-visual="${escapeHtml(owner)}" data-design-ink="${color}"${bg?` style="--design-preview-bg:${bg};--design-preview-pattern:none"`:''}`;
  }
  function designBackgroundControlHtml(owner='detail'){
    if(['library','production'].includes(owner))return '';owner=designVisualOwner(owner);const asset=owner.startsWith('asset-'),value=designAppearanceTarget(owner)||{},catalog=window.SalmosColors.catalog();
    const choices=kind=>{const current=previewColor(value['preview_'+kind]);return current&&!catalog.some(c=>c.color===current)?[{name:'Color actual',color:current},...catalog]:catalog;};
    return `<details class="design-appearance-dock" data-design-appearance-actions="${escapeHtml(owner)}"><summary>Colores</summary><div class="design-palette-columns">${[['background','Fondo'],['color','Diseño']].map(([kind,title])=>`<section class="design-palette-column"><header><strong>${title}</strong>${asset?`<button type="button" class="icon-btn" ${kind==='background'?'data-save-design-appearance':'data-copy-design-appearance'}="${escapeHtml(owner)}" aria-label="${kind==='background'?'Guardar colores':'Guardar como nuevo'}" title="${kind==='background'?'Guardar colores':'Guardar como nuevo'}"><i class="fa-solid ${kind==='background'?'fa-circle-check':'fa-circle-plus'}" aria-hidden="true"></i></button>`:''}<button type="button" class="icon-btn" data-reset-design-channel="${kind}" data-design-color-owner="${escapeHtml(owner)}" aria-label="Restablecer ${title.toLowerCase()} original"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i></button></header><div class="design-channel-colors">${choices(kind).map(entry=>`<div class="design-color-row"><button type="button" class="salmos-color-button ${previewColor(value['preview_'+kind])===entry.color?'active':''}" aria-pressed="${previewColor(value['preview_'+kind])===entry.color}" data-design-color-choice="${entry.color}" data-design-color-kind="${kind}" data-design-color-owner="${escapeHtml(owner)}" style="--color-swatch:${entry.color}">${escapeHtml(entry.name)}</button><button type="button" class="icon-btn" data-design-color-edit="${entry.color}" data-design-color-kind="${kind}" data-design-color-owner="${escapeHtml(owner)}" aria-label="Editar ${escapeHtml(entry.name)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button></div>`).join('')}</div><button type="button" class="btn btn-ghost" data-design-color-kind="${kind}" data-design-color-owner="${escapeHtml(owner)}">+ Color</button><div class="design-advanced-palette"></div></section>`).join('')}</div><small data-design-appearance-status></small></details>`;
  }

  function syncDesignAppearance(owner){
    owner=designVisualOwner(owner);const target=designAppearanceTarget(owner)||{},bg=previewColor(target.preview_background),color=previewColor(target.preview_color);
    for(const host of qsa(`[data-design-visual="${owner}"]`)){host.style.setProperty('--design-preview-bg',bg||(owner.startsWith('asset-')&&host.closest('#designPreviewDialog')?'#faedf3':'var(--design-pink)'));host.style.setProperty('--design-preview-pattern',bg?'none':host.closest('#designPreviewDialog')?'repeating-conic-gradient(#faedf3 0 25%,#efdae5 0 50%)':'none');host.dataset.designInk=color;paintDesignVisual(host);}
    for(const button of qsa(`[data-design-color-choice][data-design-color-owner="${owner}"]`)){const selected=previewColor(target['preview_'+button.dataset.designColorKind])===button.dataset.designColorChoice;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));}
  }
  function setDesignBackground(value,owner='detail'){const target=designAppearanceTarget(owner);if(!target)return;target.preview_background=previewColor(value);syncDesignAppearance(owner);}
  async function setDesignAppearance(owner,kind,value,persist=false){
    owner=designVisualOwner(owner);const target=designAppearanceTarget(owner);if(!target||!['background','color'].includes(kind))return;
    if(owner.startsWith('asset-')){state.designAppearanceDrafts??={};state.designAppearanceDrafts[owner]??={original:{preview_background:target.preview_background||'',preview_color:target.preview_color||''}};}
    target['preview_'+kind]=previewColor(value);syncDesignAppearance(owner);
    if(owner.startsWith('asset-')){state.designAppearanceDrafts[owner].current={preview_background:target.preview_background||'',preview_color:target.preview_color||''};syncDesignAppearanceActions(owner);}
    if(persist&&owner==='sheet-upload')persistSheetDraft();
  }
  function syncDesignAppearanceActions(owner){
    const target=designAppearanceTarget(owner),draft=state.designAppearanceDrafts?.[owner],busy=!!state.designAppearanceBusy?.[owner];
    for(const group of qsa(`[data-design-appearance-actions="${owner}"]`)){qsa('button',group).forEach(button=>button.disabled=busy);const status=qs('[data-design-appearance-status]',group);if(status)status.textContent=busy?'Guardando…':draft&&JSON.stringify(draft.original)!==JSON.stringify(draft.current)?'Sin guardar':'';}
  }
  async function saveDesignAppearance(owner,asNew=false){
    const target=designAppearanceTarget(owner);if(!target||state.designAppearanceBusy?.[owner])return;
    state.designAppearanceBusy??={};state.designAppearanceBusy[owner]=true;syncDesignAppearanceActions(owner);
    const payload={preview_background:target.preview_background||'',preview_color:target.preview_color||''};if(asNew){state.designVariantRequests??={};const signature=JSON.stringify(payload);if(state.designVariantRequests[owner]?.signature!==signature)state.designVariantRequests[owner]={signature,id:crypto.randomUUID()};payload.requestId=state.designVariantRequests[owner].id;}
    try{const result=await api(`/api/admin/design-assets/${Number(target.id)}/${asNew?'variant':'appearance'}`,{method:asNew?'POST':'PATCH',body:JSON.stringify(payload)});
      if(asNew){const original=state.designAppearanceDrafts?.[owner]?.original;if(original)Object.assign(target,original);state.designAssets.push(result.item);}else Object.assign(target,result.item);
      delete state.designAppearanceDrafts?.[owner];delete state.designVariantRequests?.[owner];syncDesignAppearance(owner);
      if(state.view==='designs'||qs('#designGalleryDialog')?.open){const clients=state.designAssets.filter(x=>x.scope==='clients'),salmos=state.designAssets.filter(x=>x.scope==='salmos'),mixed=state.designAssets.filter(x=>x.scope==='mixed');designLibraryHost().innerHTML=`<div class="design-library-content">${designLibraryToolbarHtml()}${designGroup('SALMOS',salmos,'salmos')}${designGroup('Clientes',clients,'clients')}${designSection('Planchas mixtas',mixed,'mixed')}</div>`;dockDesignGalleryToolbar();updateDesignSelectionUI();observeDesignThumbnails();}
      if(qs('#productionDialog')?.open){renderProductionDesignGallery();await refreshMockupPreview();}
      if(asNew)openDesignPreview(result.item.id);toast(asNew?'Nuevo diseño guardado. El original se conserva.':'Colores guardados','success');
    }finally{delete state.designAppearanceBusy[owner];syncDesignAppearanceActions(owner);}
  }
  async function resetDesignAppearance(owner){
    await setDesignAppearance(owner,'background','');await setDesignAppearance(owner,'color','');await saveDesignAppearance(owner);
  }
  function openDesignColorPalette(button){
    const owner=button.dataset.designColorOwner,kind=button.dataset.designColorKind,target=designAppearanceTarget(owner);if(!target||state.designAppearanceBusy?.[owner])return;
    if(button.hasAttribute('data-design-color-choice')){setDesignAppearance(owner,kind,button.dataset.designColorChoice,true);return;}
    const host=qs('.design-advanced-palette',button.closest('.design-palette-column'));
    window.SalmosColors.openAdvanced(button,{value:button.dataset.designColorEdit||target['preview_'+kind],name:window.SalmosColors.nameForColor(button.dataset.designColorEdit),cancelValue:target['preview_'+kind],container:host,inline:true,opacity:kind==='color',preview:value=>setDesignAppearance(owner,kind,value),save:value=>setDesignAppearance(owner,kind,value,true)});
  }

  function paintDesignVisual(host){
    const image=qs('img',host),color=previewColor(host.dataset.designInk);if(!image)return;
    let canvas=qs(':scope > .design-color-overlay',host);image.style.opacity=color?'0':'1';
    if(!color){canvas?.remove();host._designPaintSignature='';return;}
    if(!image.naturalWidth||!image.naturalHeight)return;
    const signature=[image.currentSrc||image.src,image.naturalWidth,image.naturalHeight,color].join(':');
    if(!canvas){canvas=document.createElement('canvas');canvas.className='design-color-overlay';canvas.setAttribute('aria-hidden','true');host.appendChild(canvas);}
    if(host._designPaintSignature!==signature){const scale=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=canvas.getContext('2d');try{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over';host._designPaintSignature=signature;}catch{image.style.opacity='1';canvas.remove();return;}}
    canvas.style.width=image.clientWidth+'px';canvas.style.height=image.clientHeight+'px';
  }
  function bindDesignVisuals(root=document){
    const hosts=[...(root.matches?.('[data-design-visual]')?[root]:[]),...qsa('[data-design-visual]',root)];
    for(const host of hosts){const image=qs('img',host);if(!image)continue;if(!image._designColorBound){image._designColorBound=true;image.addEventListener('load',()=>paintDesignVisual(host));if(window.ResizeObserver){host._designColorResize=new ResizeObserver(()=>paintDesignVisual(host));host._designColorResize.observe(image);}}paintDesignVisual(host);}
  }
  function initDesignVisuals(){
    bindDesignVisuals();if(window.MutationObserver){const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)bindDesignVisuals(node)});observer.observe(document.body,{childList:true,subtree:true});}
  }

  function mediaTypeFromName(name=''){return /\.(mp4|webm|mov|m4v|ogv)(?:$|\?)/i.test(String(name))?'video':'image'}
  function mediaPreviewHtml(item){
    if(item.mediaType==='video') return `<video src="${escapeHtml(item.url)}" muted playsinline preload="metadata"></video><span class="salmos-media-kind">VIDEO</span>`;
    return `<img src="${escapeHtml(item.url)}" alt=""><span class="salmos-media-kind">FOTO</span>`;
  }
  function ensureMediaAdminStyles(){
    if(document.getElementById('salmosMediaAdminStyles'))return;
    const style=document.createElement('style');style.id='salmosMediaAdminStyles';style.textContent=`
      .salmos-media-help{margin:6px 0 12px;color:var(--muted);font-size:.84rem;line-height:1.45}
      .salmos-media-list{display:grid;gap:10px;margin-top:12px}
      .salmos-media-item{display:grid;grid-template-columns:44px 86px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:16px;background:var(--surface);cursor:grab}
      .salmos-media-item.dragging{opacity:.45}.salmos-media-order{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--surface-2);font-weight:900;color:var(--gold-2)}
      .salmos-media-preview{width:86px;height:86px;border-radius:12px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center;position:relative}
      .salmos-media-preview img,.salmos-media-preview video{width:100%;height:100%;object-fit:contain;background:#0b0b0c}
      .salmos-media-kind{position:absolute;left:5px;bottom:5px;font-size:.58rem;font-weight:900;letter-spacing:.08em;padding:3px 5px;border-radius:6px;background:rgba(0,0,0,.72);color:#fff}
      .salmos-media-copy{min-width:0}.salmos-media-copy strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.salmos-media-copy small{display:block;color:var(--muted);margin-top:4px}
      .salmos-media-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.salmos-media-actions .btn{min-width:42px;padding:0 12px}
      @media(max-width:700px){.salmos-media-item{grid-template-columns:38px 68px 1fr}.salmos-media-preview{width:68px;height:68px}.salmos-media-actions{grid-column:2/-1;justify-content:flex-start}}
    `;document.head.appendChild(style);
  }
  function renderMediaManager(hostId=state.mediaHostId||'mediaOrderList'){
    state.mediaHostId=hostId;const host=qs(`#${hostId}`);if(!host)return;
    host.innerHTML=state.mediaItems.length?state.mediaItems.map((item,i)=>`<div class="salmos-media-item" draggable="true" data-media-key="${escapeHtml(item.key)}"><div class="salmos-media-order">${i+1}</div><div class="salmos-media-preview">${mediaPreviewHtml(item)}</div><div class="salmos-media-copy"><strong>${escapeHtml(item.name||`Archivo ${i+1}`)}</strong><small>${item.existing?'Ya guardado':'Nuevo · se sube al guardar'} · posición ${i+1}</small></div><div class="salmos-media-actions"><button type="button" class="btn btn-ghost" data-move-media="-1" data-media-key="${escapeHtml(item.key)}" ${i===0?'disabled':''} aria-label="Subir">↑</button><button type="button" class="btn btn-ghost" data-move-media="1" data-media-key="${escapeHtml(item.key)}" ${i===state.mediaItems.length-1?'disabled':''} aria-label="Bajar">↓</button><button type="button" class="btn btn-danger" data-remove-media="${escapeHtml(item.key)}" aria-label="Eliminar">×</button></div></div>`).join(''):`<div class="notice">Todavía no cargaste fotos ni videos.</div>`;
    if(hostId==='productionMediaOrderList')renderMockupProductViews();
  }
  function moveMedia(key,delta){const i=state.mediaItems.findIndex(x=>x.key===key);if(i<0)return;const j=i+delta;if(j<0||j>=state.mediaItems.length)return;[state.mediaItems[i],state.mediaItems[j]]=[state.mediaItems[j],state.mediaItems[i]];renderMediaManager()}
  async function removeMediaItem(key){
    const item=state.mediaItems.find(x=>x.key===key);if(!item)return;
    if(item.id&&state.mediaHostId==='productionMediaOrderList'){
      state.productionRemovedMediaIds??=[];if(!state.productionRemovedMediaIds.includes(Number(item.id)))state.productionRemovedMediaIds.push(Number(item.id));
    }else if(item.existing&&item.id){if(!confirm('¿Eliminar este archivo del producto?'))return;await api(`/api/admin/media/${item.id}`,{method:'DELETE'});}
    if(item.url?.startsWith('blob:'))URL.revokeObjectURL(item.url);
    if(item.viewKey&&state.productionMountViews?.[item.viewKey]){state.productionMountViews[item.viewKey].included=false;state.productionMountViews[item.viewKey].removed=true;}
    state.mediaItems=state.mediaItems.filter(x=>x.key!==key);state.newFiles=state.mediaItems.filter(x=>!x.existing).map(x=>x.file);renderMediaManager(state.mediaHostId);
  }
  function addSelectedMedia(files,hostId=state.mediaHostId||'mediaOrderList'){
    state.mediaHostId=hostId;for(const file of files){const mediaType=file.type?.startsWith('video/')||mediaTypeFromName(file.name)==='video'?'video':'image';const key=`new-${Date.now()}-${Math.random().toString(36).slice(2)}`;state.mediaItems.push({key,existing:false,file,url:URL.createObjectURL(file),name:file.name,mediaType})}
    state.newFiles=state.mediaItems.filter(x=>!x.existing).map(x=>x.file);renderMediaManager(state.mediaHostId);
  }
  function resetProductDialogState(){
    for(const item of state.mediaItems||[]){if(!item.existing&&item.url?.startsWith('blob:')){try{URL.revokeObjectURL(item.url)}catch{}}}
    state.newFiles=[];state.mediaItems=[];state.mediaDragKey=null;state.mediaHostId='mediaOrderList';state.editingProduct=null;
    const saveBtn=qs('#saveProductBtn');if(saveBtn)saveBtn.disabled=false;
  }
  function closeProductDialog(){const dialog=qs('#productDialog');if(dialog?.open)dialog.close();}

  const titles={dashboard:'Dashboard',products:'Productos',orders:'Órdenes',customOrders:'Pedidos',clients:'Clientes',purchases:'Compras',production:'Producción',stock:'Stock',coupons:'Cupones',categories:'Categorías',expenses:'Caja',flyers:'Flyers',designs:'Diseños',settings:'Configuración'};

  function clientDirectory(){return window.SalmosClients.init({api,apiUrl,money,escapeHtml,toast,navigate});}

  async function navigate(view){if(view==='stock')view='products';state.view=view;qs('#viewTitle').textContent=titles[view]||view;qs('#viewTitle').insertAdjacentHTML('beforeend',view==='customOrders'?'<small class="panel-title-subtitle">Por encargo y personalizados</small>':'');qsa('.admin-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));qs('#adminSidebar').classList.remove('open');const host=qs('#adminContent');host.innerHTML='<div class="empty-state"><strong>Cargando...</strong></div>';try{if(view==='dashboard')await renderDashboard();if(view==='products')await renderProducts();if(view==='orders')await renderOrders();if(view==='customOrders')await renderCustomOrders();if(view==='clients')await clientDirectory().render();if(view==='purchases')await renderPurchases();if(view==='production')await renderProduction();if(view==='stock')await renderStock();if(view==='coupons')await renderCoupons();if(view==='categories')await renderCategories();if(view==='expenses')await renderExpenses();if(view==='flyers')await renderFlyers();if(view==='designs')await renderDesigns();if(view==='settings')await renderSettings();setAdminListsCollapsed(Boolean(state.adminListsCollapsed))}catch(e){renderAccessError(e)}}

  function renderAccessError(e){
    const msg=e.status===503?'Falta completar la configuración de Cloudflare Access en la API.':e.status===401?'La sesión venció o necesita volver a autorizarse.':e.message;
    qs('#adminContent').innerHTML=`<div class="empty-state"><strong>${e.status===401?'Volvé a ingresar':'No se pudo cargar el panel'}</strong><p>${escapeHtml(msg)}</p>${e.status===401?adminSessionActions():'<button type="button" class="btn btn-primary" data-admin-retry>Reintentar</button>'}</div>`;
  }

  async function ensureCategories(force=false){if(state.categories.length&&!force)return;const d=await api('/api/admin/categories');state.categories=d.items||[]}

  function reportRangeDates(range=state.reportRange){
    const day=today(),to=new Date(`${day}T23:59:59.999-03:00`).toISOString();
    if(range==='total')return {from:'1970-01-01T00:00:00.000Z',to};
    if(range==='year')return {from:new Date(`${day.slice(0,4)}-01-01T00:00:00-03:00`).toISOString(),to};
    if(range==='custom')return {from:state.customFrom?new Date(`${state.customFrom}T00:00:00-03:00`).toISOString():'1970-01-01T00:00:00.000Z',to:state.customTo?new Date(`${state.customTo}T23:59:59.999-03:00`).toISOString():to};
    return {from:new Date(`${day.slice(0,7)}-01T00:00:00-03:00`).toISOString(),to};
  }
  function reportFiltersHtml(range=state.reportRange){
    return `<div class="report-filter-wrap"><div class="finance-filters">${[['month','Mes'],['year','Año'],['total','Total'],['custom','Fechas']].map(([v,l])=>`<button type="button" class="btn btn-ghost ${range===v?'active':''}" data-report-range="${v}">${l}</button>`).join('')}</div>${range==='custom'?`<div class="custom-date-filter"><label>Desde <input class="input" id="reportFrom" type="date" value="${escapeHtml(state.customFrom)}"></label><label>Hasta <input class="input" id="reportTo" type="date" value="${escapeHtml(state.customTo)}"></label><button type="button" class="btn btn-primary" id="applyReportDates">Aplicar</button></div>`:''}</div>`;
  }
  function miniStockSummary(summary={}){
    const total=Number(summary.total)||0;
    const categories=Array.isArray(summary.categories)?summary.categories:[];
    const products=Array.isArray(summary.products)?summary.products:[];
    const productCards=products.map(p=>{
      const variants=Array.isArray(p.variants)?p.variants:[];
      const sizeMap=new Map(),colorMap=new Map();
      variants.forEach(v=>{const n=Number(v.units)||0;if(v.size)sizeMap.set(v.size,(sizeMap.get(v.size)||0)+n);if(v.color)colorMap.set(v.color,(colorMap.get(v.color)||0)+n)});
      const sizes=[...sizeMap.entries()].sort((a,b)=>stockSizeRank(a[0])-stockSizeRank(b[0])||String(a[0]).localeCompare(String(b[0])));
      const colors=[...colorMap.entries()];
      const counts=sizes.length?sizes.map(([k,n])=>`${escapeHtml(k)}: ${n}`).join(' · '):colors.length?colors.map(([k,n])=>`${escapeHtml(k)}: ${n}`).join(' · '):`Unidades: ${Number(p.units)||0}`;
      return `<article class="dashboard-stock-product" data-stock-product-card data-stock-category="${escapeHtml(String(p.category||''))}"><div class="dashboard-stock-product-media">${p.imageUrl?`<img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name||'Producto')}" loading="lazy">`:'<span>SALMOS</span>'}</div><div class="dashboard-stock-product-copy"><strong>${escapeHtml(p.name||'Producto')}</strong><small>${escapeHtml(p.category||'Sin categoría')}</small><div>${counts}</div></div></article>`;
    }).join('');
    return `<div class="admin-card dashboard-stock-summary"><div class="stock-size-summary"><button type="button" class="stock-count-chip total active" data-stock-filter=""><span>Todo</span><strong>${total}</strong></button>${categories.map(x=>`<button type="button" class="stock-count-chip" data-stock-filter="${escapeHtml(String(x.name||''))}"><span>${escapeHtml(x.name||'Sin categoría')}</span><strong>${Number(x.units)||0}</strong></button>`).join('')}</div><div class="horizontal-gallery-shell"><button type="button" class="gallery-arrow gallery-arrow-left" data-scroll-target="dashboardStockGallery" data-scroll-dir="-1" aria-label="Anterior">‹</button><div class="dashboard-stock-products" id="dashboardStockGallery">${productCards||'<div class="empty-state"><strong>Sin productos con stock.</strong></div>'}</div><button type="button" class="gallery-arrow gallery-arrow-right" data-scroll-target="dashboardStockGallery" data-scroll-dir="1" aria-label="Siguiente">›</button></div></div>`
  }

  function miniCouponsTable(items=[]){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Código</th><th>Beneficio</th><th>Estado</th></tr></thead><tbody>${items.length?items.map(c=>`<tr><td><strong>${escapeHtml(c.code)}</strong></td><td>${escapeHtml(couponBenefitText(c))}</td><td><span class="status ${Number(c.active)?'success':'warning'}">${Number(c.active)?'Activo':'Pausado'}</span></td></tr>`).join(''):'<tr><td colspan="3">Sin cupones.</td></tr>'}</tbody></table></div>`}
  function miniCategoriesTable(items=[]){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Categoría</th><th>Estado</th></tr></thead><tbody>${items.length?items.map(c=>`<tr><td><strong>${escapeHtml(c.name)}</strong></td><td><span class="status ${Number(c.active)?'success':'warning'}">${Number(c.active)?'Activa':'Oculta'}</span></td></tr>`).join(''):'<tr><td colspan="2">Sin categorías.</td></tr>'}</tbody></table></div>`}

  function reportDatePopoverHtml(range=state.reportRange){return `<details class="purchase-date-popover report-date-popover"><summary class="btn btn-ghost">Fechas</summary><div>${reportFiltersHtml(range).replace('>Fechas</button>','>Personalizadas</button>')}</div></details>`;}
  function openBalanceChart(){
    const k=state.dashboardKpis||{},rows=[['Ventas',Number(k.productSalesCents)||0],['Envíos',Number(k.shippingRevenueCents)||0],['Ingresos / aportes',Number(k.extraIncomeCents)||0],['Egresos',-(Number(k.expensesCents)||0)],['Balance',Number(k.balanceCents)||0]],limit=Math.max(1,...rows.map(([,v])=>Math.abs(v))),dialog=ensureAdminDialog('balanceChartDialog','Balance');
    qs('.dialog-body',dialog).innerHTML=`<div class="balance-chart" role="img" aria-label="Comparación de ventas, envíos, aportes, egresos y balance">${rows.map(([label,value])=>`<div><strong>${label}</strong><span class="balance-chart-track"><i style="width:${Math.abs(value)/limit*100}%;background:${value<0?'#db6875':'#78b994'}"></i></span><b>${money(value)}</b></div>`).join('')}</div>`;dialog.showModal();
  }
  function ensureAdminDialog(id,title){let dialog=qs('#'+id);if(!dialog){dialog=document.createElement('dialog');dialog.id=id;dialog.className='admin-dialog compact-admin-dialog';dialog.innerHTML=`<div class="dialog-shell"><div class="dialog-head"><h2>${escapeHtml(title)}</h2><button type="button" class="icon-btn" data-close-review-dialog aria-label="Cerrar">×</button></div><div class="dialog-body"></div></div>`;document.body.append(dialog);}qs('.dialog-head h2',dialog).textContent=title;return dialog;}
  async function renderDashboard(){
    const r=reportRangeDates();
    const d=await api(`/api/admin/dashboard?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);const k=d.kpis||{};state.dashboardKpis=k;
    qs('#adminContent').innerHTML=`
      <div class="dashboard-quick-grid">
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Órdenes recientes</h2><button class="btn btn-ghost" data-go="orders">Abrir</button></div>${ordersTable(d.recentOrders||[])}</section>
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Stock</h2><button class="btn btn-ghost" data-go="products">Abrir</button></div>${miniStockSummary(d.stockSummary||{})}</section>
        <section class="dashboard-finance-section">      <div class="admin-section-head dashboard-filter-head"><div><h2 style="margin:0">Resumen financiero</h2></div>${reportDatePopoverHtml()}</div>
      <div class="kpi-grid finance-kpis-v4">
        <div class="kpi"><small>Ventas</small><strong>${money(k.productSalesCents)}</strong></div>
        <div class="kpi"><small>Envíos</small><strong>${money(k.shippingRevenueCents)}</strong></div>
        <div class="kpi"><small>Ingresos</small><strong>${money(k.extraIncomeCents)}</strong></div><div class="kpi expense-kpi"><small>Egresos</small><strong>− ${money(k.expensesCents)}</strong></div>
        <button type="button" data-open-balance-chart class="kpi balance-chart-button ${Number(k.balanceCents)<0?'negative-kpi':''}"><small>Balance</small><strong>${money(k.balanceCents)}</strong></button>
      </div>
</section>
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Cupones</h2><button class="btn btn-ghost" data-go="coupons">Abrir</button></div>${miniCouponsTable(d.coupons||[])}</section>
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Categorías</h2><button class="btn btn-ghost" data-go="categories">Abrir</button></div>${miniCategoriesTable(d.categories||[])}</section>
      </div>`;
  }

  async function renderProducts(){
    await ensureCategories();const [products,stock,materials]=await Promise.all([api('/api/admin/products'),api('/api/admin/stock'),api('/api/admin/materials'),loadMockupAssets()]);state.products=products.items||[];state.stockItems=stock.items||[];state.materials=materials.items||[];state.selectedProductIds??=new Set();
    const options=(field,current)=>`<option value="">Todos</option>${stockUnique(field).map(v=>`<option value="${escapeHtml(v)}" ${current===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}`,f=state.stockFilters;
    qs('#adminContent').innerHTML=`<div class="unified-product-toolbar"><input class="input" id="adminProductSearch" type="search" placeholder="Buscar producto…" value="${escapeHtml(state.productSearch||'')}"><div id="productStockSummary" class="product-stock-summary"></div><details class="product-filter-menu"><summary class="btn btn-ghost">Filtrar</summary><div class="product-filter-fields">${[['Category','category','Categoría','category_name'],['Stage','stage','Estado','inventory_stage'],['Size','size','Talle','size'],['Color','color','Color','color'],['Fit','fit','Corte','fit'],['Audience','audience','Género','audience']].map(([id,key,label,field])=>`<label>${label}<select class="select" id="stockFilter${id}">${key==='stage'?`<option value="">Todos</option>${[['finished','Terminado'],['to_print','En producción'],['outlet','Outlet']].map(([v,name])=>`<option value="${v}" ${f.stage===v?'selected':''}>${name}</option>`).join('')}`:options(field,f[key])}</select></label>`).join('')}<label>Publicación<select class="select" data-product-publication-filter><option value="">Todas</option>${[['published','Publicado'],['draft','Borrador'],['hidden','Oculto']].map(([value,label])=>`<option value="${value}" ${state.productPublication===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Ordenar<select class="select" id="stockSort">${[['product','Producto'],['size','Talle'],['color','Color'],['fit','Corte'],['stock_desc','Mayor stock'],['stock_asc','Menor stock']].map(([v,label])=>`<option value="${v}" ${f.sort===v?'selected':''}>${label}</option>`).join('')}</select></label><button class="btn btn-ghost" type="button" id="clearStockFiltersBtn">Limpiar filtros</button></div></details><details class="product-color-menu"><summary class="btn btn-ghost">Colores <span aria-hidden="true">⌄</span></summary><div>${stockUnique('color').map(color=>`<button class="btn btn-ghost" type="button" data-product-global-color="${escapeHtml(color)}">${colorDetail(color)}</button>`).join('')}</div></details><div class="unified-product-actions"><a class="icon-btn" href="index.html?ordenar=1#productos" aria-label="Ordenar en la tienda" title="Ordenar en la tienda">↗</a><button class="icon-btn" type="button" id="toggleBulkPriceBtn" aria-label="Ajustes masivos" title="Ajustes masivos"><i class="fa-solid fa-sliders" aria-hidden="true"></i></button><button class="icon-btn" type="button" id="newProductBtn" aria-label="Nuevo producto" title="Nuevo producto"><i class="fa-solid fa-circle-plus" aria-hidden="true"></i></button></div></div>
      <section class="settings-card bulk-price-card hidden" id="bulkPricePanel">
        <div class="admin-section-head"><div><h3 style="margin:0">Actualización masiva de precios</h3></div><button class="btn btn-ghost" type="button" id="closeBulkPriceBtn">Cerrar</button></div>
        <div class="form-grid">
          <div class="field"><label>Aplicar a</label><select class="select" id="bulkCategory"><option value="">Todos los productos</option>${state.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Acción</label><select class="select" id="bulkDirection"><option value="increase">Aumentar</option><option value="decrease">Bajar</option></select></div>
          <div class="field"><label>Tipo</label><select class="select" id="bulkMode"><option value="percent">Porcentaje (%)</option><option value="fixed">Monto fijo ($)</option></select></div>
          <div class="field"><label>Valor</label><input class="input" id="bulkValue" type="number" min="0" step="1"></div>
          <div class="field"><label>Precio desde ($)</label><input class="input" id="bulkMinPrice" type="number" min="0" placeholder="Opcional"></div><div class="field"><label>Precio hasta ($)</label><input class="input" id="bulkMaxPrice" type="number" min="0" placeholder="Opcional"></div><div class="field"><label>Redondear a</label><select class="select" id="bulkRound"><option value="100">$100</option><option value="500">$500</option><option value="1000">$1.000</option></select></div>
          <div class="field" style="align-self:end"><button class="btn btn-primary" type="button" id="applyBulkPriceBtn">Aplicar cambio</button></div>
        </div>
        <small class="field-help">Se aplica sobre los productos marcados ✓. Si no marcás ninguno, usa categoría y rango de precio. Siempre redondea al importe elegido.</small>
      </section>
<div id="adminProductsTable" class="unified-products-grid"></div>`;renderUnifiedProducts();
  }
  function productInventoryCard(p,rows){
    const key='product:'+p.id,photos=[...new Map(rows.flatMap(x=>x.images||[]).concat(p.primary_image_url?[{url:p.primary_image_url}]:[]).filter(x=>x.url).map(x=>[x.url,x])).values()];state.stockGroupPhotos??={};state.stockGroupPhotos[key]=photos;const active=state.stockPhotoIndexes?.[key]||0,editing=state.stockEditingGroups?.has(key),colors=[...new Set(rows.map(x=>x.color).filter(Boolean))],selectedColor=state.productColorFilters?.[p.id]||'',visibleRows=rows.filter(x=>!selectedColor||x.color===selectedColor);
    const step=(x,kind,value)=>`<div class="stock-inline-stepper"><button type="button" data-stock-level-step="-1" data-kind="${kind}" ${editing?'':'disabled'} aria-label="Restar stock ${kind==='physical'?'físico':'virtual'}">−</button><input type="number" min="0" step="1" data-stock-level="${kind}" value="${value}" ${editing?'':'readonly'} aria-label="Stock ${kind==='physical'?'físico':'virtual'} ${escapeHtml(x.size||x.color||'Única')}"><button type="button" data-stock-level-step="1" data-kind="${kind}" ${editing?'':'disabled'} aria-label="Sumar stock ${kind==='physical'?'físico':'virtual'}">+</button></div>`;
    return `<article class="unified-product-card" data-stock-group="${key}" data-product-id="${p.id}"><header><h3>${escapeHtml(p.name)}</h3><span class="publication-dot ${p.status==='published'?'published':p.status==='draft'?'draft':'hidden-status'}" role="img" aria-label="${p.status==='published'?'Publicado':p.status==='draft'?'Borrador':'Oculto'}" title="${p.status==='published'?'Publicado':p.status==='draft'?'Borrador':'Oculto'}"></span><strong>${money(p.price_cents)}</strong></header><div class="unified-product-image-row"><div class="stock-group-image">${photos.length?`<button type="button" class="unified-product-preview" data-edit-product="${p.id}" aria-label="Editar ${escapeHtml(p.name)}"><img src="${escapeHtml(photos[active%photos.length].url)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async"></button>`:'<span class="muted">Sin foto</span>'}${photos.length>1?'<button type="button" class="icon-btn" data-stock-photo-arrow="-1" aria-label="Foto anterior">‹</button><button type="button" class="icon-btn" data-stock-photo-arrow="1" aria-label="Foto siguiente">›</button>':''}</div><aside class="unified-product-card-actions"><label class="icon-btn product-select-control" title="Marcar producto"><input type="checkbox" data-bulk-product="${p.id}" ${state.selectedProductIds?.has(Number(p.id))?'checked':''} aria-label="Marcar ${escapeHtml(p.name)}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></label><button type="button" class="icon-btn ${editing?'active':''}" data-stock-edit-group aria-label="${editing?'Ocultar controles de stock':'Editar stock'}" title="Editar stock"><i class="fa-solid ${editing?'fa-chevron-up':'fa-pen'}" aria-hidden="true"></i></button><button type="button" class="icon-btn" data-edit-product="${p.id}" aria-label="Editar producto" title="Editar producto"><i class="fa-solid fa-sliders" aria-hidden="true"></i></button><button type="button" class="icon-btn" data-duplicate-product="${p.id}" aria-label="Duplicar producto" title="Duplicar producto"><i class="fa-solid fa-copy" aria-hidden="true"></i></button></aside></div><details class="product-card-colors" ${state.productColorMenusOpen?.[p.id]?'open':''}><summary><span>Colores</span><span class="product-color-dots">${colors.map(color=>`<span class="color-dot" style="--swatch:${escapeHtml(colorSwatch(color))}"></span>`).join('')}</span><span class="color-arrow" aria-hidden="true">⌄</span></summary><div>${colors.map(color=>`<button type="button" class="btn btn-ghost ${selectedColor===color?'active':''}" data-product-color-filter="${p.id}" data-color="${escapeHtml(color)}" aria-pressed="${selectedColor===color}">${colorDetail(color)}</button>`).join('')}</div></details><div class="stock-level-head"><span>Talle / variante</span><span>Físico</span><span>Virtual</span><span></span></div>${visibleRows.sort((a,b)=>stockSizeRank(a.size)-stockSizeRank(b.size)||String(a.color).localeCompare(String(b.color),'es')).map(x=>{const draft=state.stockLevelDrafts?.[x.id];return `<div class="stock-level-row" data-stock-level-row="${x.id}"><div><strong>${escapeHtml(x.size||'Única')}</strong>${colorDetail(x.color)}</div>${step(x,'physical',draft?.physical??Number(x.stock))}${step(x,'virtual',draft?.virtual??Number(x.virtual_stock??100))}${editing?`<button type="button" class="icon-btn" data-save-stock-levels="${x.id}" aria-label="Guardar stock"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></button>`:'<span></span>'}</div>`;}).join('')||'<p class="muted">Sin variantes para este filtro.</p>'}</article>`;
  }
  function renderUnifiedProducts(){
    const host=qs('#adminProductsTable');if(!host)return;state.productColorMenusOpen??={};qsa('[data-product-id]',host).forEach(card=>{state.productColorMenusOpen[card.dataset.productId]=Boolean(qs('.product-card-colors',card)?.open);});const f=state.stockFilters,query=normalizeCategoryKey(state.productSearch||''),filtered=stockFilteredItems(),variantFilters=['size','color','fit','audience'].some(key=>f[key]);let products=state.products.filter(p=>(!query||normalizeCategoryKey(p.name+' '+p.category_name).includes(query))&&(!f.category||p.category_name===f.category)&&(!f.stage||filtered.some(x=>Number(x.product_id)===Number(p.id))||(!state.stockItems.some(x=>Number(x.product_id)===Number(p.id))&&productStageKey(p)===f.stage))&&(!state.productPublication||p.status===state.productPublication)&&(!variantFilters||filtered.some(x=>Number(x.product_id)===Number(p.id))));
    const stockTotal=p=>filtered.filter(x=>Number(x.product_id)===Number(p.id)).reduce((sum,x)=>sum+Number(x.stock||0),0);products.sort((a,b)=>f.sort==='stock_desc'?stockTotal(b)-stockTotal(a):f.sort==='stock_asc'?stockTotal(a)-stockTotal(b):String(a.category_name+' '+a.name).localeCompare(String(b.category_name+' '+b.name),'es'));
    host.innerHTML=products.map(p=>productInventoryCard(p,filtered.filter(x=>Number(x.product_id)===Number(p.id)))).join('')||'<p>Sin productos en este filtro.</p>';
    const ids=new Set(products.map(p=>Number(p.id))),rows=filtered.filter(x=>ids.has(Number(x.product_id))),sizes=new Map();for(const x of rows)if(x.size)sizes.set(x.size,(sizes.get(x.size)||0)+Number(x.stock||0));const summary=qs('#productStockSummary');if(summary)summary.innerHTML=`<button type="button" class="stock-count-chip total" data-product-size-filter="" title="Stock físico total"><span>Total</span><strong>${rows.reduce((sum,x)=>sum+Number(x.stock||0),0)}</strong></button>${[...sizes].sort(([a],[b])=>stockSizeRank(a)-stockSizeRank(b)).map(([size,total])=>`<button type="button" class="stock-count-chip ${f.size===size?'active':''}" data-product-size-filter="${escapeHtml(size)}"><span>${escapeHtml(size)}</span><strong>${total}</strong></button>`).join('')}`;
    qsa('[data-product-global-color]').forEach(b=>{b.classList.toggle('active',b.dataset.productGlobalColor===f.color);b.setAttribute('aria-pressed',String(b.dataset.productGlobalColor===f.color));});
  }
  function internalPrepLabel(p){
    if(p.inventory_stage==='outlet')return '<span class="status warning">Outlet</span>';
    if(p.inventory_stage!=='to_print')return '<span class="status success">Terminado</span>';
    const missing=[];if(!Number(p.garment_ready))missing.push('falta producto base');if(!Number(p.print_ready))missing.push('falta estampa');
    return `<span class="status warning">En producción</span>${missing.length?`<small class="internal-stock-note">${escapeHtml(missing.join(' · '))}</small>`:'<small class="internal-stock-note">producto base y estampa disponibles</small>'}`;
  }
  function publicationLabel(p){return `<span class="status ${p.status==='published'?'success':'warning'}">${p.status==='published'?'Publicado':p.status==='draft'?'Borrador':'Oculto'}</span>`}
  function productsTable(items){return `<div class="products-compact-list">${items.map(p=>`<article class="product-compact-row"><input type="checkbox" data-bulk-product="${p.id}" aria-label="Seleccionar ${escapeHtml(p.name)}"><button class="product-compact-main" type="button" data-edit-product="${p.id}">${p.primary_image_url?`<img class="mini-image" src="${escapeHtml(p.primary_image_url)}" alt="">`:''}<strong>${escapeHtml(p.name)}</strong><span class="publication-dot ${p.status==='published'?'published':p.status==='draft'?'draft':'hidden-status'}" role="img" aria-label="${p.status==='published'?'Publicado':p.status==='draft'?'Borrador':'Oculto'}" title="${p.status==='published'?'Publicado':p.status==='draft'?'Borrador':'Oculto'}"></span></button><div class="product-compact-values"><span><small>Precio</small>${money(p.price_cents)}</span><span><small>Stock</small>${Number(p.available_stock)||0}</span></div><button type="button" class="icon-btn" data-duplicate-product="${p.id}" aria-label="Duplicar producto"><i class="fa-solid fa-copy" aria-hidden="true"></i></button></article>`).join('')||'<p>Sin productos.</p>'}</div>`;}

  function productStageKey(p){return p.inventory_stage==='outlet'?'outlet':p.inventory_stage==='to_print'?'to_print':'finished'}
  function stageTitle(k){return k==='outlet'?'Outlet':k==='to_print'?'En producción':'Terminado'}
  function groupedProductsHtml(items){if(!items.length)return productsTable([]);const catOrder=new Map(state.categories.map((c,i)=>[String(c.name),i]));const groups=new Map();for(const p of items){const cat=p.category_name||'Sin categoría';const stage=productStageKey(p);const key=`${cat}|||${stage}`;if(!groups.has(key))groups.set(key,{cat,stage,items:[]});groups.get(key).items.push(p)}return [...groups.values()].sort((a,b)=>(catOrder.get(a.cat)??999)-(catOrder.get(b.cat)??999)||a.cat.localeCompare(b.cat,'es')||['finished','to_print','outlet'].indexOf(a.stage)-['finished','to_print','outlet'].indexOf(b.stage)).map(g=>`<section class="inventory-group"><div class="inventory-group-head"><h3>${escapeHtml(g.cat)}</h3><span>${stageTitle(g.stage)} · ${g.items.length}</span></div>${productsTable(g.items)}</section>`).join('')}

  function bindProductSort(){
    const body=qs('#sortableProducts');if(!body)return;let dragging=null;
    body.querySelectorAll('.drag-handle').forEach(handle=>handle.addEventListener('pointerdown',e=>{const row=handle.closest('[data-sort-product]');if(!row)return;dragging=row;row.classList.add('sorting');handle.setPointerCapture?.(e.pointerId);e.preventDefault()}));
    body.addEventListener('pointermove',e=>{if(!dragging)return;const el=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-sort-product]');if(!el||el===dragging||el.parentElement!==body)return;const rect=el.getBoundingClientRect();body.insertBefore(dragging,e.clientY<rect.top+rect.height/2?el:el.nextSibling)});
    const finish=async()=>{if(!dragging)return;dragging.classList.remove('sorting');dragging=null;const ids=qsa('[data-sort-product]',body).map(r=>Number(r.dataset.sortProduct));try{await api('/api/admin/products/order',{method:'PATCH',body:JSON.stringify({ids})});toast('Orden guardado','success')}catch(err){toast(err.message,'error')}};
    body.addEventListener('pointerup',finish);body.addEventListener('pointercancel',finish);
  }

  function normalizeCategoryKey(value=''){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
  function productCategoryById(id){return state.categories.find(c=>Number(c.id)===Number(id))||null}
  function productCategoryMode(categoryId){
    const c=productCategoryById(categoryId);if(!c)return '';
    const key=normalizeCategoryKey(`${c.slug||''} ${c.name||''}`);
    return /(remera|camiseta|chomba|buzo|prenda)/.test(key)?'sized':'simple';
  }
  function defaultVariantsForMode(mode,color='Negro'){
    if(mode==='sized')return ['S','M','L','XL','XXL'].map(size=>({id:null,color,size,stock:0,stockKind:'untracked',sku:''}));
    if(mode==='simple')return [{id:null,color:'',size:'',stock:0,stockKind:'untracked',sku:''}];
    return [];
  }
  function collectVariantRows(){
    const builder=qs('#variantBuilder');if(!builder)return [];
    return qsa('.variant-row',builder).map(r=>({
      id:Number(qs('[data-v="id"]',r)?.value)||null,
      color:String(qs('[data-v="color"]',r)?.value||'').trim(),
      size:String(qs('[data-v="size"]',r)?.value||'').trim(),
      stock:Math.max(0,Math.trunc(Number(qs('[data-v="stock"]',r)?.value)||0)),
      stockKind:qs('[data-v="stockKind"]',r)?.value||'untracked',
      sku:String(qs('[data-v="sku"]',r)?.value||'').trim()
    }));
  }
  function convertVariantsForMode(items,fromMode,toMode){
    const rows=Array.isArray(items)?items:[];
    if(toMode==='simple'){
      if(!rows.length)return defaultVariantsForMode('simple');
      const groups=new Map();
      for(const row of rows){
        const key=String(row.color||'').trim();
        const current=groups.get(key)||{id:null,color:key,size:'',stock:0,sku:''};
        if(!current.id&&row.id)current.id=row.id;
        current.stock+=Math.max(0,Number(row.stock)||0);
        if(!current.sku&&row.sku)current.sku=row.sku;
        groups.set(key,current);
      }
      return [...groups.values()];
    }
    if(toMode==='sized'){
      if(fromMode==='sized'&&rows.length)return rows;
      const source=rows.length?rows:[{color:'Negro',stock:0,stockKind:'untracked'}];
      const out=[];
      for(const row of source){
        ['S','M','L','XL','XXL'].forEach((size,i)=>out.push({id:i===0?(row.id||null):null,color:row.color||'Negro',size,stock:i===0?(Number(row.stock)||0):0,stockKind:i===0?(row.stockKind||row.stock_kind||'untracked'):'untracked',sku:i===0?(row.sku||''):''}));
      }
      return out;
    }
    return rows;
  }
  function internalStockKindOptions(selected='untracked'){return [['untracked','Sin aclarar (opcional)'],['physical','Stock real'],['production','En producción'],['to_stock','A stockear']].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('')}
  function stockStepper(value=0){
    const n=Math.max(0,Math.trunc(Number(value)||0));
    return `<div class="variant-stock-control" aria-label="Stock"><button type="button" class="variant-stock-btn" data-stock-step="-1" aria-label="Restar una unidad">−</button><input class="input variant-stock-number" data-v="stock" type="number" min="0" inputmode="numeric" value="${n}" aria-label="Cantidad interna (opcional)"><button type="button" class="variant-stock-btn" data-stock-step="1" aria-label="Sumar una unidad">+</button></div>`;
  }
  function variantRow(v={id:null,color:'',size:'',stock:0,sku:''},mode='sized'){
    const sized=mode==='sized';
    const stockKind=v.stockKind||v.stock_kind||'untracked',stock=stockKind==='physical'?(v.physical_qty??v.stock):v.stock;
    return `<div class="variant-row ${sized?'variant-row-sized':'variant-row-simple'}"><input type="hidden" data-v="id" value="${v.id||''}"><input class="input" data-v="color" placeholder="${sized?'Color':'Color (opcional)'}" value="${escapeHtml(v.color||'')}">${sized?`<input class="input variant-size-input" data-v="size" placeholder="Talle" value="${escapeHtml(v.size||'')}">`:`<input type="hidden" data-v="size" value="">`}${stockStepper(stock)}<select class="select variant-internal-kind" data-v="stockKind" aria-label="Estado interno (opcional)">${internalStockKindOptions(stockKind)}</select><button type="button" class="btn btn-danger remove-variant" aria-label="Quitar variante">×</button><input type="hidden" data-v="sku" value="${escapeHtml(v.sku||'')}"></div>`;
  }
  function renderVariantBuilder(mode,items=[]){
    const builder=qs('#variantBuilder');if(!builder)return;
    const rows=(items&&items.length)?items:defaultVariantsForMode(mode);
    builder.dataset.mode=mode||'';
    builder.innerHTML=mode?rows.map(v=>variantRow(v,mode)).join(''):'<div class="variant-empty-note">Elegí una categoría para configurar el stock.</div>';
  }
  function syncProductCategoryForm(options={}){
    const form=qs('#productForm');if(!form)return;
    const categoryId=form.elements.category_id?.value||'';
    const mode=productCategoryMode(categoryId);
    const builder=qs('#variantBuilder');
    const previousMode=builder?.dataset.mode||'';
    const current=collectVariantRows();
    const next=(mode&&mode!==previousMode)?convertVariantsForMode(current,previousMode,mode):(current.length?current:defaultVariantsForMode(mode));
    renderVariantBuilder(mode,next);
    qs('#productFitField')?.classList.toggle('hidden',mode!=='sized');
    qs('#productAudienceField')?.classList.toggle('hidden',mode!=='sized');
    const title=qs('#variantSectionTitle');if(title)title.textContent=mode==='sized'?'Talles y stock':mode==='simple'?'Opciones y stock':'Variantes y stock';
    const help=qs('#variantSectionHelp');if(help)help.textContent=mode==='sized'?'Podés indicar stock real, en producción o a stockear por talle. La aclaración es opcional.':mode==='simple'?'Podés indicar el estado y la cantidad interna por color. Es opcional.':'Elegí una categoría para configurar el stock.';
    const add=qs('#addVariantBtn');if(add){add.classList.toggle('hidden',!mode);add.textContent=mode==='sized'?'+ Agregar talle / variante':'+ Agregar color / variante';}
    const ready=qs('#productBaseReadyLabel');if(ready)ready.textContent=mode==='sized'?'Prenda disponible':'Producto base disponible';
  }


  const MATERIAL_TYPES=[['shirt','Remera'],['chomba','Chomba'],['hoodie','Buzo'],['cap','Gorra'],['mug','Taza'],['glass','Vaso'],['thermos','Termo'],['bag','Bolso'],['dtf_textile','DTF textil'],['dtf_uv','DTF UV'],['packaging','Packaging']];
  const LEGACY_MATERIAL_TYPES={tumbler:'Vaso / termo (anterior)',other:'Otros'};
  const CLOTHING_FEATURES=['Algodón piqué','Algodón peinado 24.1','Cuello en rib','Tapa costuras','Costuras reforzadas'];
  const PURCHASE_BASIC_MATERIALS={shirt:CLOTHING_FEATURES,chomba:CLOTHING_FEATURES,hoodie:CLOTHING_FEATURES,mug:['Cerámica'],cap:['Gabardina','Trucker con red','Ajustable con traba de metal','Ajustable con traba de plástico'],dtf_textile:['DTF textil'],dtf_uv:['DTF UV']};
  const PURCHASE_BASIC_COLORS=['Negro','Blanco','Crudo','Crema','Beige','Gris','Azul marino','Azul','Celeste','Rojo','Bordó','Verde','Rosa','Marrón','Amarillo','Fucsia'];
  const PURCHASE_BASIC_FITS=['Clásico','Oversize','Boxy fit','Crop'];
  const PURCHASE_CLASSES=['ADULTOS','NIÑOS','ESPECIALES'];
  const PURCHASE_GENDERS=['Hombre','Mujer','Unisex'];
  const PURCHASE_SIZES_BY_CLASS={ADULTOS:['S','M','L','XL','XXL'],NIÑOS:Array.from({length:16},(_,i)=>String(i+1)),ESPECIALES:['6','7','8','9','10']};
  const PURCHASE_COLOR_HEX={'Negro':'#151515','Blanco':'#f7f5ef','Crudo':'#eee2cf','Crema':'#f5ead3','Beige':'#d4bd9b','Gris':'#9da0a5','Azul marino':'#18233d','Azul':'#2454ae','Celeste':'#86cbea','Rojo':'#c63b46','Bordó':'#722632','Verde':'#3b824d','Rosa':'#f29bbc','Marrón':'#79513c','Amarillo':'#e4bc32','Fucsia':'#d84691'};
  const FINANCE_BASIC_REASONS=['Venta','Aporte','Publicidad','Servicio','Gasto','Inversión'];

  const normalizeOption=v=>String(v||'').trim().replace(/\s+/g,' ');
  const uniqOptions=(arr=[])=>[...new Set(arr.map(normalizeOption).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  const safeCustomTypeCode=label=>`custom_${normalizeOption(label).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||'material'}`;
  function customTypeEntries(){return Array.isArray(state.purchaseOptions?.types)?state.purchaseOptions.types.filter(x=>x&&x.code&&x.label):[]}
  function materialTypeLabel(t){
    const fixed=Object.fromEntries(MATERIAL_TYPES)[t]||LEGACY_MATERIAL_TYPES[t];
    if(fixed)return fixed;
    const custom=customTypeEntries().find(x=>x.code===t);
    if(custom)return custom.label;
    if(String(t||'').startsWith('custom_'))return String(t).slice(7).replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
    return 'Otros';
  }
  const materialIsGarment=t=>['shirt','chomba','hoodie'].includes(String(t));
  const materialUsesColor=t=>!['dtf_textile','dtf_uv','packaging'].includes(String(t));
  const materialIsDtf=t=>['dtf_textile','dtf_uv'].includes(String(t));
  const materialUsesCapacity=t=>['mug','glass','thermos'].includes(String(t));
  const PURCHASE_CAPACITY_OPTIONS={mug:[250,300,330,350,400,450,500],glass:[350,500,600,700,750,1000],thermos:[350,500,600,750,1000,1200,1500]};
  function purchaseCapacityField(item,type){
    if(!materialUsesCapacity(type))return '';
    const opts=PURCHASE_CAPACITY_OPTIONS[type]||[];
    const value=Math.max(0,Number(item.capacityMl)||0);
    return `<div class="field purchase-capacity"><label>Capacidad</label><div class="capacity-input-wrap"><input class="input" data-purchase-field="capacityMl" type="number" min="1" step="10" list="capacity-${type}" value="${value||''}" placeholder="ml"><span>ml</span></div><datalist id="capacity-${type}">${opts.map(v=>`<option value="${v}"></option>`).join('')}</datalist></div>`;
  }

  async function ensureAdminOptionSettings(){
    if(state.purchaseOptionsLoaded)return;
    try{
      const d=await api('/api/admin/settings');state.settings={...state.settings,...(d.settings||{})};window.SalmosColors?.setCatalog(state.settings.named_color_catalog);
      const raw=JSON.parse(state.settings.admin_purchase_options_v2||'{}');
      state.purchaseOptions={
        types:Array.isArray(raw.types)?raw.types:[],
        fits:Array.isArray(raw.fits)?raw.fits:[],
        classes:Array.isArray(raw.classes)?raw.classes:[],
        sizes:raw.sizes&&typeof raw.sizes==='object'?raw.sizes:{},
        materials:raw.materials&&typeof raw.materials==='object'?raw.materials:{},
        featureCatalog:raw.featureCatalog&&typeof raw.featureCatalog==='object'?raw.featureCatalog:{},
        colors:Array.isArray(raw.colors)?raw.colors:[],
        financeReasons:Array.isArray(raw.financeReasons)?raw.financeReasons:[]
      };
    }catch(err){if(err.status===401||err.status===503)throw err;state.purchaseOptions={types:[],fits:[],classes:[],sizes:{},materials:{},colors:[],financeReasons:[]}}
    state.purchaseOptionsLoaded=true;
  }
  async function persistAdminOptionSettings(){
    const payload=JSON.stringify(state.purchaseOptions||{});
    await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:{admin_purchase_options_v2:payload}})});
    state.settings.admin_purchase_options_v2=payload;
  }
  async function ensureCostingData(force=false){if(state.costingLoaded&&!force&&Date.now()-(state.costingLoadedAt||0)<10000){await ensureAdminOptionSettings();return;}const [m,d]=await Promise.all([api('/api/admin/materials',force?{cache:'reload'}:{}),api('/api/admin/design-assets',force?{cache:'reload'}:{}),ensureAdminOptionSettings()]);state.materials=m.items||[];state.designAssets=d.items||[];state.costingLoaded=true;state.costingLoadedAt=Date.now();}
  function materialFamilies(){const seen=new Set(),out=[];for(const m of state.materials){if(!m.name||materialIsDtf(m.material_type))continue;const key=`${m.material_type}|||${m.name}`.toLowerCase();if(seen.has(key))continue;seen.add(key);out.push({type:m.material_type,name:m.name});}return out.sort((a,b)=>materialTypeLabel(a.type).localeCompare(materialTypeLabel(b.type),'es')||a.name.localeCompare(b.name,'es'));}
  function recipeFamilyValue(type='',name=''){return type&&name?`${type}|||${name}`:''}
  function productRecipeDesignRow(row={},i=0){const selected=Number(row.designAssetId??row.design_asset_id)||0,qty=Math.max(.01,Number(row.quantity)||1);const options=state.designAssets.filter(d=>d.kind==='individual').map(d=>`<option value="${d.id}" ${Number(d.id)===selected?'selected':''}>${escapeHtml(d.name||d.file_name)} · ${Number(d.width_cm)||'?'}×${Number(d.height_cm)||'?'} cm · ${d.print_material_type==='dtf_uv'?'DTF UV':d.print_material_type==='none'?'Sin DTF':'DTF textil'}</option>`).join('');return `<div class="recipe-design-row" data-recipe-design-row="${i}"><select class="select" data-recipe-design-id><option value="">Elegir diseño...</option>${options}</select><input class="input" data-recipe-design-qty type="number" min=".01" step="1" value="${qty}" title="Cantidad de estampas"><button type="button" class="icon-btn" data-remove-recipe-design="${i}" aria-label="Quitar">×</button>${row.measureLabel?`<small class="recipe-measure-note">${escapeHtml(row.measureLabel)}</small>`:''}</div>`;}
  function renderProductRecipeDesigns(){const host=qs('#productRecipeDesignRows');if(host)host.innerHTML=state.productRecipeDesigns.length?state.productRecipeDesigns.map(productRecipeDesignRow).join(''):'<div class="muted">Sin diseños vinculados todavía.</div>';updateProductCostEstimate();}
  function productRecipeMaterialRow(row={},i=0){const selected=Number(row.materialId??row.material_id)||0,qty=Math.max(.001,Number(row.quantity)||1);const options=state.materials.filter(m=>!materialIsDtf(m.material_type)).map(m=>{const bits=[materialTypeLabel(m.material_type),m.name,m.color,m.size,m.fit].filter(Boolean).join(' · ');return `<option value="${m.id}" ${Number(m.id)===selected?'selected':''}>${escapeHtml(bits)} · stock ${Number(m.stock_qty||0).toLocaleString('es-AR',{maximumFractionDigits:2})}</option>`}).join('');return `<div class="recipe-design-row recipe-material-row" data-recipe-material-row="${i}"><select class="select" data-recipe-material-id><option value="">Elegir insumo...</option>${options}</select><input class="input" data-recipe-material-qty type="number" min=".001" step=".1" value="${qty}" title="Cantidad por producto"><button type="button" class="icon-btn" data-remove-recipe-material="${i}" aria-label="Quitar">×</button></div>`;}
  function renderProductRecipeMaterials(){const host=qs('#productRecipeMaterialRows');if(host)host.innerHTML=state.productRecipeMaterials.length?state.productRecipeMaterials.map(productRecipeMaterialRow).join(''):'<div class="muted">Sin insumos adicionales. Útil para bolsa, packaging, etiqueta u otros consumibles.</div>';updateProductCostEstimate();}
  function selectedRecipeFamily(){const raw=String(qs('#productBaseMaterialFamily')?.value||'');const [type='',...parts]=raw.split('|||');return {type,name:parts.join('|||')};}
  function collectRecipeDesigns(){return qsa('[data-recipe-design-row]').map((r,i)=>{const id=Number(qs('[data-recipe-design-id]',r)?.value)||0,previous=state.productRecipeDesigns[i],kept=Number(previous?.designAssetId)===id?previous:{};return {...kept,designAssetId:id,quantity:Math.max(.01,Number(qs('[data-recipe-design-qty]',r)?.value)||1)}}).filter(x=>x.designAssetId);}

  function collectRecipeMaterials(){return qsa('[data-recipe-material-row]').map(r=>({materialId:Number(qs('[data-recipe-material-id]',r)?.value)||0,quantity:Math.max(.001,Number(qs('[data-recipe-material-qty]',r)?.value)||0)})).filter(x=>x.materialId&&x.quantity>0);}
  function materialMatchForVariant(type,name,variant,fit){const norm=v=>String(v||'').trim().toLowerCase();return state.materials.filter(m=>m.material_type===type&&norm(m.name)===norm(name)&&( !m.color||norm(m.color)===norm(variant.color))&&( !m.size||norm(m.size)===norm(variant.size))&&( !m.fit||norm(m.fit)===norm(fit))).sort((a,b)=>(Boolean(b.color)-Boolean(a.color))+(Boolean(b.size)-Boolean(a.size))+(Boolean(b.fit)-Boolean(a.fit)))[0]||null;}
  function updateProductCostEstimate(){
    const costInput=qs('#productEstimatedCost');if(!costInput)return;
    const family=selectedRecipeFamily(),variants=collectVariantRows(),variant=variants.find(v=>Number(v.stock)>0)||variants[0]||{color:'',size:''},fit=qs('#productForm [name="fit"]')?.value||'',waste=Math.max(0,Number(qs('#productRecipeWaste')?.value)||0),fixedExtra=pesosToCents(qs('#productRecipeExtra')?.value||0);let base=0,print=0,materialsCost=0;const notes=[];
    if(family.name){const m=materialMatchForVariant(family.type,family.name,variant,fit);if(m){base=Number(m.average_cost_cents)||0;notes.push(`${m.name}: ${money(base)}`)}else notes.push(`Falta materia prima compatible: ${family.name}`)}
    for(const row of collectRecipeDesigns()){const d=state.designAssets.find(x=>Number(x.id)===Number(row.designAssetId));if(!d)continue;const type=d.print_material_type||'dtf_textile';if(type==='none')continue;const mat=state.materials.filter(x=>x.material_type===type&&Number(x.stock_qty)>0)[0]||state.materials.find(x=>x.material_type===type);if(!mat){notes.push(`Falta ${type==='dtf_uv'?'DTF UV':'DTF textil'}`);continue}const width=Math.max(1,Number(mat.width_cm)||58),area=(Number(row.widthCm)||Number(d.width_cm)||0)*(Number(row.heightCm)||Number(d.height_cm)||0)*row.quantity;if(!area){notes.push(`${d.name}: faltan medidas`);continue}const meters=(area/(100*width))*(1+waste/100),line=meters*(Number(mat.average_cost_cents)||0);print+=line;notes.push(`${d.name}: ${meters.toFixed(3)} m · ${money(line)}`)}
    for(const row of collectRecipeMaterials()){const m=state.materials.find(x=>Number(x.id)===Number(row.materialId));if(!m)continue;const line=(Number(m.average_cost_cents)||0)*row.quantity;materialsCost+=line;notes.push(`${m.name}: ${row.quantity.toLocaleString('es-AR',{maximumFractionDigits:3})} ${m.unit==='meter'?'m':'u'} · ${money(line)}`)}
    const total=Math.round(base+print+materialsCost+fixedExtra);costInput.value=(total/100).toFixed(0);const out=qs('#productCostBreakdown');if(out)out.innerHTML=`<strong>Costo estimado: ${money(total)}</strong><small>${notes.length?notes.map(escapeHtml).join(' · '):'Elegí materia prima y/o diseños para calcular automáticamente.'}${fixedExtra?` · Otros costos: ${money(fixedExtra)}`:''}</small>`;
  }
  async function openProductDuplicateDialog(id){
    await Promise.all([ensureCategories(),ensureCostingData()]);
    ensureMediaAdminStyles();
    state.newFiles=[];state.mediaItems=[];state.mediaDragKey=null;state.mediaHostId='mediaOrderList';
    if(id){
      const d=await api(`/api/admin/products/${id}`);
      state.editingProduct={...d.item,id:null,name:`${d.item.name} copia`,slug:'',variants:(d.item.variants||[]).map(v=>({...v,id:null})),images:[]};
    }else state.editingProduct=null;
    const isNewProduct=!state.editingProduct;const p=state.editingProduct||{status:'draft',price_cents:null,compare_at_cents:null,cost_cents:null,weight_grams:0,height_cm:0,width_cm:0,depth_cm:0,is_featured:0,is_new:0,is_bestseller:0,fit:'',audience:'',sale_mode:'stock',inventory_stage:'finished',garment_ready:1,print_ready:1,variants:[],images:[]};
    const recipe=p.recipe||{base_material_type:'',base_material_name:'',waste_percent:10,extra_cost_cents:0,designs:[],materials:[]};state.productRecipeDesigns=(recipe.designs||[]).map(x=>({designAssetId:Number(x.design_asset_id??x.designAssetId),quantity:Number(x.quantity)||1,widthCm:Number(x.width_cm??x.widthCm)||0,heightCm:Number(x.height_cm??x.heightCm)||0,measureOptionId:x.measure_option_id??x.measureOptionId??'',measureLabel:x.measure_label??x.measureLabel??'',printSide:x.print_side??x.printSide??'front'}));state.productRecipeMaterials=(recipe.materials||[]).map(x=>({materialId:Number(x.material_id??x.materialId),quantity:Number(x.quantity)||1}));
    const initialVariantMode=productCategoryMode(p.category_id);
    const initialVariants=(p.variants||[]).length?(p.variants||[]):defaultVariantsForMode(initialVariantMode);
    state.mediaItems=(p.images||[]).map(im=>({key:`existing-${im.id}`,id:Number(im.id),existing:true,url:im.url,name:(im.r2_key||'').split('/').pop()||`Archivo ${im.id}`,mediaType:im.media_type||mediaTypeFromName(im.r2_key||im.url)}));
    qs('#productDialogTitle').textContent='Duplicar producto';
    const saveBtn=qs('#saveProductBtn');if(saveBtn)saveBtn.disabled=false;
    qs('#productFormBody').innerHTML=`
      <section class="form-section"><h3>Fotos y videos</h3><p class="salmos-media-help">Cargalos primero y acomodalos en el orden exacto en que querés que se vean. Podés arrastrar cada archivo o usar ↑ y ↓. Las fotos se muestran completas, sin recortes. Videos cortos: MP4/WebM/MOV, hasta 30 MB.</p><input class="input" id="productImagesInput" type="file" accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v" multiple><div class="salmos-media-list" id="mediaOrderList"></div></section>
      <section class="form-section"><h3>Información</h3><div class="form-grid">
        <div class="field full"><label>Nombre</label><input class="input" name="name" required value="${escapeHtml(p.name||'')}"></div>
        <div class="field"><label>Categoría</label><select class="select" name="category_id" required><option value="">Elegir...</option>${state.categories.map(c=>`<option value="${c.id}" ${Number(p.category_id)===Number(c.id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Estado de la publicación</label><select class="select" name="status"><option value="draft" ${p.status==='draft'?'selected':''}>Borrador</option><option value="published" ${p.status==='published'?'selected':''}>Publicado</option><option value="hidden" ${p.status==='hidden'?'selected':''}>Oculto</option></select></div>
        <div class="field ${initialVariantMode==='sized'?'':'hidden'}" id="productFitField"><label>Corte / fit</label><input class="input" name="fit" list="salmosFitOptions" placeholder="Elegí o escribí otro" value="${escapeHtml(p.fit||'')}"><datalist id="salmosFitOptions"><option value="Clásico"><option value="Oversize"><option value="Boxy fit"></datalist></div>
        <div class="field ${initialVariantMode==='sized'?'':'hidden'}" id="productAudienceField"><label>Hombre / Mujer / Unisex</label><input class="input" name="audience" list="salmosAudienceOptions" placeholder="Elegí o escribí otro" value="${escapeHtml(p.audience||'')}"><datalist id="salmosAudienceOptions"><option value="Hombre"><option value="Mujer"><option value="Unisex"></datalist></div>
        <div class="field"><label>Estado del producto</label><select class="select" name="inventory_stage" id="inventoryStage"><option value="finished" ${p.inventory_stage==='finished'||!p.inventory_stage?'selected':''}>Terminado</option><option value="to_print" ${p.inventory_stage==='to_print'?'selected':''}>En producción</option><option value="outlet" ${p.inventory_stage==='outlet'?'selected':''}>Outlet</option></select></div>
        <div class="field full internal-prep-box ${p.inventory_stage==='to_print'?'':'hidden'}" id="internalPrepBox"><div class="internal-prep-title">Solo administración · control de producción</div><div class="toggle-row"><label class="toggle-label"><input type="checkbox" name="garment_ready" ${Number(p.garment_ready)!==0?'checked':''}><span id="productBaseReadyLabel">${initialVariantMode==='sized'?'Prenda disponible':'Producto base disponible'}</span></label><label class="toggle-label"><input type="checkbox" name="print_ready" ${Number(p.print_ready)!==0?'checked':''}> Estampa disponible</label></div><small class="field-help">En producción podés indicar si ya está disponible el producto base y la estampa.</small></div>
        <div class="field"><label>Precio</label><input class="input" name="price" type="number" min="0" value="${isNewProduct?'':centsToPesos(p.price_cents)}"></div>
        <div class="field"><label>Precio anterior</label><input class="input" name="compare" type="number" min="0" value="${centsToPesos(p.compare_at_cents)}"></div>
        <div class="field"><label>Costo estimado</label><input class="input" id="productEstimatedCost" name="cost" type="number" min="0" value="${centsToPesos(p.cost_cents)}" readonly><small class="field-help">Se calcula desde Compras + receta de producción.</small></div>
        <div class="field full"><label>Descripción corta</label><textarea class="textarea" name="short_description">${escapeHtml(p.short_description||'')}</textarea></div>
        <div class="field full"><label>Significado del diseño</label><textarea class="textarea" name="meaning_text">${escapeHtml(p.meaning_text||'')}</textarea></div>
        <div class="field full"><label>Versículo (opcional)</label><textarea class="textarea" name="verse_text" style="min-height:82px">${escapeHtml(p.verse_text||'')}</textarea></div>
        <div class="field full"><label>Cita / referencia del versículo</label><input class="input" name="verse_reference" placeholder="Ej.: Marcos 14:36" value="${escapeHtml(p.verse_reference||'')}"></div>
      </div><div class="toggle-row" style="margin-top:14px"><label class="toggle-label"><input type="checkbox" name="is_new" ${p.is_new?'checked':''}> Novedad</label><label class="toggle-label"><input type="checkbox" name="is_featured" ${p.is_featured?'checked':''}> Destacado</label><label class="toggle-label"><input type="checkbox" name="is_bestseller" ${p.is_bestseller?'checked':''}> Más vendido</label></div></section>
      <section class="form-section"><label class="toggle-label"><input type="checkbox" name="show_all_sizes" ${Number(p.show_all_sizes??1)!==0?'checked':''}> Mostrar disponibles todos los talles / variantes</label><p class="field-help">Activado por defecto. El estado y las cantidades de abajo son internos y opcionales. Desactivá esta opción si querés vender solo las unidades contadas.</p><div class="admin-section-head"><h3 id="variantSectionTitle">${initialVariantMode==='sized'?'Talles y stock':initialVariantMode==='simple'?'Opciones y stock':'Variantes y stock'}</h3><button type="button" class="btn btn-ghost ${initialVariantMode?'':'hidden'}" id="addVariantBtn">${initialVariantMode==='sized'?'+ Agregar talle / variante':'+ Agregar color / variante'}</button></div><p class="field-help variant-section-help" id="variantSectionHelp">${initialVariantMode==='sized'?'Podés indicar stock real, en producción o a stockear por talle. La aclaración es opcional.':initialVariantMode==='simple'?'Podés indicar el estado y la cantidad interna por color. Es opcional.':'Elegí una categoría para configurar el stock.'}</p><div class="variant-builder" id="variantBuilder" data-mode="${initialVariantMode}">${initialVariantMode?initialVariants.map(v=>variantRow(v,initialVariantMode)).join(''):'<div class="variant-empty-note">Elegí una categoría para configurar el stock.</div>'}</div></section>
      <section class="form-section product-recipe-section"><div class="admin-section-head"><div><h3>Receta de costo / producción</h3><p class="field-help">Vinculá materia prima, insumos y diseños. Los costos vienen de Compras y Producción descuenta el stock automáticamente.</p></div><div class="admin-actions"><button type="button" class="btn btn-ghost" id="addRecipeDesignBtn">+ Diseño / estampa</button><button type="button" class="btn btn-ghost" id="addRecipeMaterialBtn">+ Otro insumo</button></div></div><div class="form-grid"><div class="field full"><label>Producto base / materia prima</label><select class="select" id="productBaseMaterialFamily"><option value="">Sin producto base</option>${materialFamilies().map(f=>`<option value="${escapeHtml(recipeFamilyValue(f.type,f.name))}" ${recipeFamilyValue(recipe.base_material_type,recipe.base_material_name)===recipeFamilyValue(f.type,f.name)?'selected':''}>${escapeHtml(materialTypeLabel(f.type))} · ${escapeHtml(f.name)}</option>`).join('')}</select><small class="field-help">Para una remera terminada elegí, por ejemplo, “Remera · Remera clásica”. El color, talle y corte se buscan según la variante.</small></div><div class="field"><label>Extra DTF por desperdicio (%)</label><input class="input" id="productRecipeWaste" type="number" min="0" step=".01" value="${Number(recipe.waste_percent??10)}"></div><div class="field"><label>Otros costos fijos por unidad ($)</label><input class="input" id="productRecipeExtra" type="number" min="0" step="1" value="${centsToPesos(recipe.extra_cost_cents)}"></div></div><div class="recipe-subtitle">Diseños / estampas</div><div class="recipe-design-list" id="productRecipeDesignRows"></div><div class="recipe-subtitle">Otros insumos que se consumen</div><div class="recipe-design-list" id="productRecipeMaterialRows"></div><div class="product-cost-breakdown" id="productCostBreakdown"></div></section>
      <section class="form-section"><h3>Datos para envío</h3><p class="field-help">Cargá el peso y las medidas reales de este producto. Correo Argentino arma el paquete final según las unidades que compre el cliente; no se usa un paquete fijo para todos.</p><div class="form-grid"><div class="field"><label>Peso (g)</label><input class="input" name="weight_grams" type="number" min="0" value="${p.weight_grams||0}"></div><div class="field"><label>Alto (cm)</label><input class="input" name="height_cm" type="number" min="0" step=".1" value="${p.height_cm||0}"></div><div class="field"><label>Ancho (cm)</label><input class="input" name="width_cm" type="number" min="0" step=".1" value="${p.width_cm||0}"></div><div class="field"><label>Largo (cm)</label><input class="input" name="depth_cm" type="number" min="0" step=".1" value="${p.depth_cm||0}"></div></div></section>`;
    renderMediaManager();renderProductRecipeDesigns();renderProductRecipeMaterials();updateProductCostEstimate();
    qs('#productDialog').showModal();
  }
  async function saveProduct(){
    const form=qs('#productForm');const fd=new FormData(form);
    if(!fd.get('name')?.trim()||!fd.get('category_id')) throw new Error('Completá nombre y categoría.');
    const variantMode=productCategoryMode(fd.get('category_id'));
    let variants=collectVariantRows().map(v=>({...v,size:variantMode==='sized'?v.size:''})).filter(v=>v.id||v.color||v.size||v.stock>0);
    if(variantMode==='sized'&&variants.some(v=>!v.size))throw new Error('Completá el talle de cada variante de remera.');
    if(!variants.length)variants=defaultVariantsForMode(variantMode);
    const family=selectedRecipeFamily(),recipe={baseMaterialType:family.type,baseMaterialName:family.name,wastePercent:Math.max(0,Number(qs('#productRecipeWaste')?.value)||0),extraCostCents:pesosToCents(qs('#productRecipeExtra')?.value||0),designs:collectRecipeDesigns(),materials:collectRecipeMaterials()};const payload={name:fd.get('name').trim(),category_id:Number(fd.get('category_id')),status:fd.get('status'),price_cents:pesosToCents(fd.get('price')),compare_at_cents:pesosToCents(fd.get('compare')),cost_cents:pesosToCents(fd.get('cost')),recipe,short_description:fd.get('short_description')||'',meaning_text:fd.get('meaning_text')||'',verse_text:fd.get('verse_text')||'',verse_reference:fd.get('verse_reference')||'',fit:variantMode==='sized'?(fd.get('fit')||''):'',audience:variantMode==='sized'?(fd.get('audience')||''):'',sale_mode:'stock',show_all_sizes:fd.get('show_all_sizes')?1:0,inventory_stage:fd.get('inventory_stage')||'finished',garment_ready:fd.get('garment_ready')?1:0,print_ready:fd.get('print_ready')?1:0,is_new:fd.get('is_new')?1:0,is_featured:fd.get('is_featured')?1:0,is_bestseller:fd.get('is_bestseller')?1:0,weight_grams:Number(fd.get('weight_grams'))||0,height_cm:Number(fd.get('height_cm'))||0,width_cm:Number(fd.get('width_cm'))||0,depth_cm:Number(fd.get('depth_cm'))||0,variants};
    const d=await api('/api/admin/products',{method:'POST',body:JSON.stringify(payload)});const productId=d.item.id;
    const orderedIds=[];
    for(const item of state.mediaItems){
      if(item.existing&&item.id){orderedIds.push(Number(item.id));continue}
      if(!item.file)continue;
      const f=new FormData();f.append('file',item.file);
      const uploaded=await api(`/api/admin/products/${productId}/media`,{method:'POST',body:f});
      item.existing=true;item.id=Number(uploaded.id);item.url=uploaded.url||item.url;item.mediaType=uploaded.media_type||item.mediaType;orderedIds.push(item.id);
    }
    if(orderedIds.length)await api(`/api/admin/products/${productId}/media-order`,{method:'PATCH',body:JSON.stringify({ids:orderedIds})});
    state.newFiles=[];
    qs('#productDialog').close();toast('Producto guardado','success');await renderProducts();
  }

  async function renderCategories(){
    const d=await api('/api/admin/categories');state.categories=d.items||[];
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head"><div><h2 style="margin:0">Categorías</h2><p class="muted" style="margin:4px 0 0">Solo las categorías activas pueden aparecer en la tienda. Mientras solo esté activa Remeras, la barra pública de categorías queda oculta.</p></div><button class="btn btn-primary" id="newCategoryBtn">+ Nueva categoría</button></div>
      <div class="admin-card admin-table-wrap"><table class="admin-table editable-category-table"><thead><tr><th>Nombre</th><th>Slug</th><th>Orden</th><th>Activa</th><th></th></tr></thead><tbody>${state.categories.map(c=>`<tr data-category-row="${c.id}"><td><input class="input" data-category-name value="${escapeHtml(c.name)}"></td><td>${escapeHtml(c.slug)}</td><td><input class="input small-number" data-category-sort type="number" value="${Number(c.sort_order)||0}"></td><td><label class="toggle-label"><input type="checkbox" data-category-active ${Number(c.active)?'checked':''}> Sí</label></td><td><button class="btn btn-ghost" data-save-category="${c.id}">Guardar</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function stockUnique(field){return [...new Set(state.stockItems.map(x=>String(x[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true,sensitivity:'base'}))}
  function stockSizeRank(v=''){const s=String(v).toUpperCase().replace(/\s+/g,'');const order=['XXXS','XXS','XS','S','M','L','XL','XXL','2XL','XXXL','3XL','4XL','5XL'];const i=order.indexOf(s);return i<0?999:i}
  function stockFilteredItems(){
    const f=state.stockFilters||{};let items=state.stockItems.filter(x=>(!f.category||String(x.category_name||'')===f.category)&&(!f.stage||String(x.inventory_stage||'finished')===f.stage)&&(!f.size||String(x.size||'')===f.size)&&(!f.color||String(x.color||'')===f.color)&&(!f.fit||String(x.fit||'')===f.fit)&&(!f.audience||String(x.audience||'')===f.audience));
    const cmpText=(a,b)=>String(a||'').localeCompare(String(b||''),'es',{numeric:true,sensitivity:'base'});
    items=[...items].sort((a,b)=>{
      if(f.sort==='size'){const r=stockSizeRank(a.size)-stockSizeRank(b.size);return r||cmpText(a.size,b.size)||cmpText(a.product_name,b.product_name)}
      if(f.sort==='color')return cmpText(a.color,b.color)||cmpText(a.product_name,b.product_name);
      if(f.sort==='fit')return cmpText(a.fit,b.fit)||cmpText(a.product_name,b.product_name);
      if(f.sort==='audience')return cmpText(a.audience,b.audience)||cmpText(a.product_name,b.product_name);
      if(f.sort==='stock_desc')return (Number(b.stock)||0)-(Number(a.stock)||0)||cmpText(a.product_name,b.product_name);
      if(f.sort==='stock_asc')return (Number(a.stock)||0)-(Number(b.stock)||0)||cmpText(a.product_name,b.product_name);
      return cmpText(a.product_name,b.product_name)||stockSizeRank(a.size)-stockSizeRank(b.size);
    });
    return items;
  }
  function rememberStockLevels(row){const id=Number(row.dataset.stockLevelRow);(state.stockLevelDrafts??={})[id]={physical:Number(qs('[data-stock-level="physical"]',row).value),virtual:Number(qs('[data-stock-level="virtual"]',row).value)};}
  async function saveStockLevels(id){const item=state.stockItems.find(x=>Number(x.id)===id),draft=state.stockLevelDrafts?.[id];if(!item||!draft)return;for(const value of Object.values(draft))if(!Number.isSafeInteger(value)||value<0)throw new Error('Ingresá cantidades enteras desde cero.');
    const delta=draft.physical-Number(item.stock);if(delta>0&&(state.view==='products'||confirm('¿Cargar este aumento como compra?'))){await openPurchaseDialog(null,'stock');const family=state.materials.find(m=>Number(m.id)===Number(item.material_id)),matches=m=>(!m.size||m.size===item.size)&&(!m.color||m.color===item.color)&&(!m.fit||m.fit===item.fit);const material=(family&&matches(family)?family:null)||state.materials.find(m=>matches(m)&&(family?(m.name===family.name&&m.material_type===family.material_type):m.material_type===(/buzo/i.test(item.category_name)?'hoodie':/taza/i.test(item.category_name)?'mug':'shirt')));state.purchaseItems=[material?{...purchaseDefaultItem(material.material_type),name:material.name,features:itemFeatures(material),fit:material.fit,size:material.size,color:material.color,materialClass:material.material_class,gender:material.gender,capacityMl:material.capacity_ml,quantity:delta,unitPricePesos:Number(material.average_cost_cents)/100,imageAssetIds:materialPhotos(material.id).map(a=>Number(a.id))}:{...purchaseDefaultItem(/buzo/i.test(item.category_name)?'hoodie':/taza/i.test(item.category_name)?'mug':'shirt'),name:item.product_name,features:[item.product_name],fit:item.fit,size:item.size,color:item.color,quantity:delta}];state.stockPurchaseDraft={variantId:id,virtual:draft.virtual,expectedVirtual:Number(item.virtual_stock??100)};renderPurchaseItems();return;}
    await api(`/api/admin/stock/${id}/levels`,{method:'PATCH',body:JSON.stringify({...draft,expectedPhysical:Number(item.stock),expectedVirtual:Number(item.virtual_stock??100)})});delete state.stockLevelDrafts[id];toast('Stock actualizado','success');await renderStock();}
  function groupedStockHtml(items){
    const groups=new Map();for(const item of items){const key=[item.product_id,item.category_name,item.fit,item.color,item.audience,(item.features||itemFeatures(state.materials.find(m=>Number(m.id)===Number(item.material_id))||{}).join(' · '))].map(x=>String(x||'').trim().toLocaleLowerCase('es')).join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
    return [...groups.entries()].sort(([,a],[,b])=>[a[0].category_name,a[0].fit,a[0].color,a[0].product_name].join('|').localeCompare([b[0].category_name,b[0].fit,b[0].color,b[0].product_name].join('|'),'es')).map(([key,rows],index)=>{const photos=[...new Map(rows.flatMap(x=>x.images||[{url:x.primary_image_url}]).filter(x=>x.url).map(x=>[x.url,x])).values()],title=rows[0].product_name||[rows[0].category_name,rows[0].fit,rows[0].color].filter(Boolean).join(' · '),active=state.stockPhotoIndexes?.[key]||0;state.stockGroupPhotos??={};state.stockGroupPhotos[key]=photos;const editing=state.stockEditingGroups?.has(key);return `<section class="stock-product-group inventory-group" data-stock-group="${escapeHtml(key)}"><div class="stock-group-image"><img src="${escapeHtml(photos[active%Math.max(1,photos.length)]?.url||'')}" alt="${escapeHtml(title)}" ${photos.length?'':'class="hidden"'} loading="lazy">${photos.length>1?`<button type="button" class="icon-btn" data-stock-photo-arrow="-1" aria-label="Foto anterior">‹</button><button type="button" class="icon-btn" data-stock-photo-arrow="1" aria-label="Foto siguiente">›</button>`:''}</div><div class="stock-group-details"><header><h3>${escapeHtml(title||rows[0].product_name)}</h3><button type="button" class="icon-btn" data-stock-edit-group aria-label="${editing?'Ocultar controles':'Editar stock'}"><i class="fa-solid ${editing?'fa-chevron-up':'fa-pen'}" aria-hidden="true"></i></button></header><div class="stock-level-head"><span>Talle / variante</span><span>Físico</span><span>Virtual</span></div>${rows.sort((a,b)=>stockSizeRank(a.size)-stockSizeRank(b.size)).map(x=>{const draft=state.stockLevelDrafts?.[x.id],step=(kind,value)=>`<div class="stock-inline-stepper"><button type="button" data-stock-level-step="-1" data-kind="${kind}" ${editing?'':'disabled'} aria-label="Restar ${kind}">−</button><input type="number" min="0" step="1" data-stock-level="${kind}" value="${value}" ${editing?'':'readonly'} aria-label="Stock ${kind} ${escapeHtml(x.size||'Única')}"><button type="button" data-stock-level-step="1" data-kind="${kind}" ${editing?'':'disabled'} aria-label="Sumar ${kind}">+</button></div>`;return `<div class="stock-level-row" data-stock-level-row="${x.id}"><div><strong>${escapeHtml(x.size||'Única')}</strong>${new Set(rows.map(r=>r.product_id)).size>1?`<small>${escapeHtml(x.product_name)}</small>`:''}</div>${step('physical',draft?.physical??Number(x.stock))}${step('virtual',draft?.virtual??Number(x.virtual_stock??100))}${editing?`<button type="button" class="icon-btn" data-save-stock-levels="${x.id}" aria-label="Guardar stock"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></button>`:''}</div>`}).join('')}</div></section>`;}).join('')||'<p>Sin variantes para este filtro.</p>';
  }

  function renderStockFiltered(){if(qs('#adminProductsTable.unified-products-grid')){renderUnifiedProducts();return;}const items=stockFilteredItems();const host=qs('#stockGroupedHost');if(host)host.innerHTML=groupedStockHtml(items);const count=qs('#stockFilteredCount');if(count)count.textContent=`${items.length} variante${items.length===1?'':'s'}`}
  async function renderStock(){state.view='products';qs('#viewTitle').textContent='Productos';return renderProducts();}

  function ordersTable(items){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Orden</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Fecha</th></tr></thead><tbody>${items.length?items.map(o=>`<tr><td><strong>${escapeHtml(o.code)}</strong></td><td>${escapeHtml(o.customer_name||'')}</td><td>${money(o.total_cents)}</td><td><span class="status ${o.payment_status==='paid'?'success':o.payment_status==='rejected'?'danger':'warning'}">${escapeHtml(o.payment_status)}</span></td><td><span class="status">${escapeHtml(o.fulfillment_status)}</span></td><td>${adminDateTimeHtml(o.created_at)}</td></tr>`).join(''):`<tr><td colspan="6">Sin órdenes.</td></tr>`}</tbody></table></div>`}

  function correoOrderActions(o){
    if(o.shipping_method!=='correo')return '—';const tracking=String(o.correo_tracking_number||o.tracking_number||'');const status=String(o.correo_last_status||'');
    return `<div class="correo-order-admin"><div>${tracking?`<strong>${escapeHtml(tracking)}</strong>${status?`<small>${escapeHtml(status)}</small>`:''}`:'<span class="muted">Sin preimposición</span>'}</div><div class="admin-actions correo-actions">${!tracking?`<button class="btn btn-primary" data-correo-create="${o.id}">Crear envío</button>`:`<button class="btn btn-ghost" data-correo-label="${o.id}">Rótulo 10×15</button><button class="btn btn-ghost" data-correo-track="${o.id}">Seguimiento</button><button class="btn btn-danger" data-correo-cancel="${o.id}">Cancelar CA</button>`}</div></div>`;
  }
  function viaCargoOrderSummary(o){let data={};try{data=JSON.parse(o.shipping_address_json||'{}').viaCargo||{}}catch{}return `<strong>Vía Cargo</strong><small class="table-sub">Envío a coordinar · pago separado<br>${escapeHtml(data.destination||'')}${data.agency?`<br>${escapeHtml(data.agency)}`:''}</small>`;}
  async function renderOrders(){
    const d=await api('/api/admin/orders');state.orders=d.items||[];
    qs('#adminContent').innerHTML=`<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Orden</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Fecha</th><th>Estado</th><th>Correo Argentino</th><th></th></tr></thead><tbody>${state.orders.length?state.orders.map(o=>`<tr><td><strong>${escapeHtml(o.code)}</strong></td><td>${escapeHtml(o.customer_name||'')}</td><td>${money(o.total_cents)}</td><td><span class="status ${o.payment_status==='paid'?'success':o.payment_status==='rejected'?'danger':'warning'}">${escapeHtml(o.payment_status)}</span></td><td>${o.shipping_method==='via_cargo'?viaCargoOrderSummary(o):escapeHtml(o.shipping_method||'')}</td><td>${adminDateTimeHtml(o.created_at)}</td><td><select class="select order-status-select" data-order-id="${o.id}" style="min-width:145px"><option value="new" ${o.fulfillment_status==='new'?'selected':''}>Nuevo</option><option value="preparing" ${o.fulfillment_status==='preparing'?'selected':''}>Preparando</option><option value="ready" ${o.fulfillment_status==='ready'?'selected':''}>Listo</option><option value="on_the_way" ${o.fulfillment_status==='on_the_way'?'selected':''}>En camino</option><option value="delivered" ${o.fulfillment_status==='delivered'?'selected':''}>Entregado</option><option value="cancelled" ${o.fulfillment_status==='cancelled'?'selected':''}>Cancelado</option></select></td><td>${correoOrderActions(o)}</td><td>${o.fulfillment_status==='cancelled'&&o.payment_status!=='paid'?`<button class="btn btn-danger" data-delete-order="${o.id}">Borrar prueba</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="9">Sin órdenes.</td></tr>'}</tbody></table></div><div class="admin-section"><div class="notice"><strong>Correo Argentino:</strong> el botón “Crear envío” genera la preimposición y guarda el Tracking Number. En TEST podés usarlo para validar el flujo. El rótulo se descarga en PDF 10×15.</div><div class="notice">Las órdenes canceladas de prueba que no estén pagadas se pueden borrar. Una orden pagada no se elimina desde acá.</div></div>`;
  }

  function couponBenefitText(c){
    if(c.applies_to==='shipping'&&c.discount_type==='free')return 'Envío gratis';
    if(c.discount_type==='percent')return `${Number(c.value)||0}% en ${c.applies_to==='shipping'?'envío':'prendas'}`;
    return `${money(Number(c.value)||0)} en ${c.applies_to==='shipping'?'envío':'prendas'}`;
  }
  function renderCouponEditor(c=null){
    state.editingCouponId=c?.id?Number(c.id):null;
    const title=qs('#couponEditorTitle');if(title)title.textContent=c?'Editar cupón':'Nuevo cupón';
    const value=c?.discount_type==='fixed'?((Number(c.value)||0)/100):(Number(c?.value)||0);
    const expires=c?.expires_at?String(c.expires_at).slice(0,10):'';
    const form=qs('#couponForm');if(!form)return;
    form.innerHTML=`
      <div class="form-grid">
        <div class="field"><label>Código</label><input class="input" name="code" required placeholder="SALMOS10" value="${escapeHtml(c?.code||'')}"></div>
        <div class="field"><label>Aplica a</label><select class="select" name="applies_to"><option value="products" ${c?.applies_to!=='shipping'?'selected':''}>Prendas / productos</option><option value="shipping" ${c?.applies_to==='shipping'?'selected':''}>Envío</option></select></div>
        <div class="field"><label>Tipo de descuento</label><select class="select" name="discount_type"><option value="percent" ${c?.discount_type==='percent'||!c?'selected':''}>Porcentaje (%)</option><option value="fixed" ${c?.discount_type==='fixed'?'selected':''}>Importe fijo ($)</option><option value="free" ${c?.discount_type==='free'?'selected':''}>Envío gratis</option></select></div>
        <div class="field"><label>Valor</label><input class="input" name="value" type="number" min="0" step="1" value="${escapeHtml(value||'')}"><small class="field-help">Ej.: 10 para 10% o 2000 para $2.000.</small></div>
        <div class="field"><label>Compra mínima (opcional)</label><input class="input" name="min_subtotal" type="number" min="0" step="1" value="${c?Math.round((Number(c.min_subtotal_cents)||0)/100):0}"></div>
        <div class="field"><label>Vence (opcional)</label><input class="input" name="expires" type="date" value="${escapeHtml(expires)}"></div>
        <div class="field full"><label class="toggle-label"><input type="checkbox" name="active" ${!c||Number(c.active)?'checked':''}> Cupón activo</label></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        ${c?'<button type="button" class="btn btn-ghost" id="cancelCouponEditBtn">Cancelar edición</button>':''}
        <button type="button" class="btn btn-primary" id="saveCouponBtn">${c?'Guardar cambios':'Crear cupón'}</button>
      </div>`;
  }
  async function renderCoupons(){
    const d=await api('/api/admin/coupons');state.coupons=d.items||[];
    qs('#adminContent').innerHTML=`
      <section class="settings-card">
        <h3>Crear varios cupones</h3>
        <div class="form-grid"><div class="field"><label>Cantidad</label><input class="input" id="batchCouponCount" type="number" min="1" max="100" value="5"></div><div class="field"><label>Prefijo</label><input class="input" id="batchCouponPrefix" value="SALMOS"></div><div class="field"><label>Aplica a</label><select class="select" id="batchCouponApplies"><option value="products">Productos</option><option value="shipping">Envío</option></select></div><div class="field"><label>Tipo</label><select class="select" id="batchCouponType"><option value="percent">Porcentaje</option><option value="fixed">Monto fijo</option><option value="free">Envío gratis</option></select></div><div class="field"><label>Valor</label><input class="input" id="batchCouponValue" type="number" min="0" value="10"></div><div class="field" style="align-self:end"><button class="btn btn-primary" type="button" id="createCouponBatchBtn">Generar cupones</button></div></div>
        <small class="field-help">Genera códigos únicos con el mismo descuento para que los clientes los carguen en el carrito.</small>
      </section>
      <section class="settings-card">
        <h3 id="couponEditorTitle">${state.editingCouponId?'Editar cupón':'Nuevo cupón'}</h3>
        <p style="margin:0 0 14px;color:var(--muted)">Podés crear códigos para redes: envío gratis, descuento en el envío o descuento en las prendas.</p>
        <form id="couponForm"></form>
      </section>
      <section class="admin-section">
        <div class="admin-section-head"><h2>Cupones creados</h2></div>
        <div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Código</th><th>Beneficio</th><th>Compra mínima</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>
        ${state.coupons.length?state.coupons.map(c=>`<tr><td><strong>${escapeHtml(c.code)}</strong></td><td>${escapeHtml(couponBenefitText(c))}</td><td>${Number(c.min_subtotal_cents)?money(c.min_subtotal_cents):'—'}</td><td>${c.expires_at?adminDateTimeHtml(c.expires_at):'Sin vencimiento'}</td><td><span class="status ${Number(c.active)?'success':'warning'}">${Number(c.active)?'Activo':'Pausado'}</span></td><td><div class="admin-actions"><button class="btn btn-ghost" data-edit-coupon="${c.id}">Editar</button><button class="btn btn-danger" data-delete-coupon="${c.id}">Eliminar</button></div></td></tr>`).join(''):`<tr><td colspan="6">Todavía no creaste cupones.</td></tr>`}
        </tbody></table></div>
      </section>`;
    const current=state.editingCouponId?state.coupons.find(x=>Number(x.id)===Number(state.editingCouponId)):null;
    renderCouponEditor(current||null);
  }
  async function saveCouponFromForm(){
    const form=qs('#couponForm');if(!form)return;
    const fd=new FormData(form);
    const appliesTo=fd.get('applies_to');
    const discountType=fd.get('discount_type');
    if(appliesTo==='products'&&discountType==='free')throw new Error('Envío gratis solo puede aplicarse al envío.');
    let value=Number(fd.get('value'))||0;
    if(discountType==='fixed')value=pesosToCents(value);
    if(discountType==='free')value=0;
    const expiresDate=String(fd.get('expires')||'').trim();
    const payload={
      code:String(fd.get('code')||'').trim(),
      appliesTo,
      discountType,
      value,
      minSubtotalCents:pesosToCents(fd.get('min_subtotal')),
      expiresAt:expiresDate?`${expiresDate}T23:59:59-03:00`:null,
      active:Boolean(fd.get('active'))
    };
    const id=state.editingCouponId;
    await api(id?`/api/admin/coupons/${id}`:'/api/admin/coupons',{method:id?'PUT':'POST',body:JSON.stringify(payload)});
    state.editingCouponId=null;
    toast(id?'Cupón actualizado':'Cupón creado','success');
    await renderCoupons();
  }

  function purchaseDefaultItem(type='shirt'){
    const defaultCapacity=type==='mug'?330:(type==='glass'||type==='thermos'?500:0);
    return {materialType:type,customTypeLabel:'',name:type==='dtf_textile'?'DTF textil':type==='dtf_uv'?'DTF UV':'',quantity:1,color:'',size:'',fit:'',materialClass:materialIsGarment(type)?'ADULTOS':'',gender:materialIsGarment(type)?'Unisex':'',capacityMl:defaultCapacity,widthCm:materialIsDtf(type)?58:0,unitPricePesos:type==='dtf_textile'?10000:type==='dtf_uv'?20000:'',_custom:{}};
  }
  function currentPurchaseTypes(){
    const fixed=[...MATERIAL_TYPES];
    for(const x of customTypeEntries())if(!fixed.some(([v])=>v===x.code))fixed.push([x.code,x.label]);
    return fixed;
  }
  function purchaseHistoricalValues(field,filter=()=>true){return state.materials.filter(filter).map(m=>String(m?.[field]||'').trim()).filter(Boolean)}
  function mergePurchaseOptions(base=[],extra=[]){const out=[],seen=new Set();for(const raw of [...base,...extra]){const v=normalizeOption(raw),k=v.toLocaleLowerCase('es');if(v&&!seen.has(k)){seen.add(k);out.push(v)}}return out}
  function purchaseFitOptions(){return mergePurchaseOptions(PURCHASE_BASIC_FITS,[...(state.purchaseOptions.fits||[]),...purchaseHistoricalValues('fit')])}
  function normalizePurchaseClass(value){const k=normalizeOption(value).toUpperCase();return k==='ADULTO'?'ADULTOS':k==='NIÑO'?'NIÑOS':k;}
  function purchaseClassOptions(){return mergePurchaseOptions(PURCHASE_CLASSES,(state.purchaseOptions.classes||[]).filter(v=>!['ADULTO','NIÑO'].includes(normalizeOption(v).toUpperCase())))}
  function purchaseSizeOptions(item){
    const klass=normalizePurchaseClass(item.materialClass);
    const base=PURCHASE_SIZES_BY_CLASS[klass]||[];
    const custom=Array.isArray(state.purchaseOptions.sizes?.[klass])?state.purchaseOptions.sizes[klass]:[];
    if(PURCHASE_SIZES_BY_CLASS[klass])return [...base,...custom.filter(v=>!base.includes(v))];
    const historical=purchaseHistoricalValues('size',m=>normalizePurchaseClass(m.material_class)===klass);
    return uniqOptions([...custom,...historical]);
  }
  function itemFeatures(item={}) {
    let list=item.features;try{if(!Array.isArray(list))list=JSON.parse(item.features_json||'[]')}catch{}
    return uniqOptions(Array.isArray(list)&&list.length?list:[item.name||item.material_name||'']);
  }
  function purchaseMaterialOptions(type){
    if(Array.isArray(state.purchaseOptions.featureCatalog?.[type]))return state.purchaseOptions.featureCatalog[type];
    return mergePurchaseOptions(PURCHASE_BASIC_MATERIALS[type]||[],[...(state.purchaseOptions.materials?.[type]||[]),...state.materials.filter(m=>m.material_type===type).flatMap(itemFeatures)]);
  }
  function purchaseFeaturesField(item,i){
    const selected=itemFeatures(item),options=uniqOptions([...purchaseMaterialOptions(item.materialType),...selected]);
    return `<div class="field purchase-features"><label>Materiales y características</label><details class="purchase-features-list"><summary><span data-purchase-selected-features>${escapeHtml(selected.join(' · ')||'Elegir materiales y características')}</span></summary><div class="feature-options">${options.map(v=>`<label><input type="checkbox" data-purchase-feature value="${escapeHtml(v)}" ${selected.includes(v)?'checked':''}><span>${escapeHtml(v)}</span></label>`).join('')}<button type="button" class="btn btn-ghost purchase-feature-manage" data-manage-features="${i}">Agregar, editar o eliminar características</button></div></details></div>`;
  }
  function materialFeatureChips(features){return features.map(value=>`<span>${escapeHtml(value)}</span>`).join('')||'<small class="muted">Sin características elegidas</small>';}
  function updatePurchaseFeatureSummary(row,features=[]){const chosen=qs('[data-purchase-selected-features]',row);if(chosen)chosen.textContent=features.join(' · ')||'Elegir materiales y características';const title=qs('[data-purchase-item-title]',row),item=state.purchaseItems[Number(row.dataset.purchaseRow)];if(title&&item)title.textContent=purchaseItemTitle(item,Number(row.dataset.purchaseRow));}
  function openFeatureManager(row){
    qsa('[data-purchase-row]').forEach(syncPurchaseRowFromDom);
    const item=state.purchaseItems[row];state.featureManager={row,type:item.materialType,original:uniqOptions([...purchaseMaterialOptions(item.materialType),...state.purchaseItems.filter(x=>x.materialType===item.materialType).flatMap(itemFeatures)])};
    let d=qs('#featureManagerDialog');if(!d){d=document.createElement('dialog');d.id='featureManagerDialog';d.className='admin-dialog small';document.body.appendChild(d)}
    d.innerHTML=`<div class="dialog-shell"><div class="dialog-head"><h2>Características · ${escapeHtml(materialTypeLabel(item.materialType))}</h2></div><div class="dialog-body"><p>Podés cambiar los nombres o quitar opciones. Las compras anteriores conservan su detalle.</p><div data-feature-manager-rows>${state.featureManager.original.map((v,i)=>featureManagerRow(v,i)).join('')}</div><button type="button" class="btn btn-ghost" data-feature-add>+ Agregar característica</button></div><div class="dialog-foot"><button type="button" class="btn btn-ghost" data-feature-close>Cancelar</button><button type="button" class="btn btn-primary" data-feature-save>Guardar</button></div></div>`;d.showModal();
  }
  function featureManagerRow(value='',index=-1){return `<div class="feature-manager-row"><input class="input" data-feature-value data-original-index="${index}" value="${escapeHtml(value)}" placeholder="Nueva característica" maxlength="120"><button type="button" class="icon-btn" data-feature-remove aria-label="Quitar característica">×</button></div>`}
  async function saveFeatureManager(button){
    const draft=state.featureManager,inputs=qsa('[data-feature-value]',qs('#featureManagerDialog')),catalog=uniqOptions(inputs.map(x=>x.value));
    const previous=state.purchaseOptions.featureCatalog;state.purchaseOptions.featureCatalog={...previous,[draft.type]:catalog};button.disabled=true;
    try{await persistAdminOptionSettings();for(const item of state.purchaseItems.filter(x=>x.materialType===draft.type)){item.features=itemFeatures(item).map(v=>{const i=draft.original.indexOf(v);return i<0?v:normalizeOption(inputs.find(x=>Number(x.dataset.originalIndex)===i)?.value)}).filter(Boolean);item.name=item.features.join(' · ')}qs('#featureManagerDialog').close();renderPurchaseItems();toast('Características guardadas','success')}catch(e){state.purchaseOptions.featureCatalog=previous;toast(e.message,'error')}finally{button.disabled=false}
  }
  function purchaseColorOptions(){return mergePurchaseOptions(PURCHASE_BASIC_COLORS,[...(state.purchaseOptions.colors||[]),...purchaseHistoricalValues('color')])}
  function purchaseChoiceField(item,field,label,options,placeholder='Escribí una opción'){
    const value=normalizeOption(item[field]),known=options.some(v=>v.toLocaleLowerCase('es')===value.toLocaleLowerCase('es'));
    const shown=value||'';
    return `<div class="field purchase-choice-field purchase-${field}"><label>${escapeHtml(label)}</label><select class="select purchase-choice-select" data-purchase-choice="${field}"><option value="">Elegir...</option>${options.map(v=>`<option value="${escapeHtml(v)}" ${shown===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}${shown&&!known?`<option value="${escapeHtml(shown)}" selected>${escapeHtml(shown)}</option>`:''}<option value="__other__">＋ Otro...</option></select></div>`;
  }
  function colorDetail(name){return name?`<span class="material-color"><span class="color-dot" style="--swatch:${escapeHtml(colorSwatch(name))}"></span>${escapeHtml(name)}</span>`:'—'}
  function colorSwatch(name){
    const color=window.SalmosColors?.colorForName(name)||previewColor(name);if(color)return color;
    const known=Object.keys(PURCHASE_COLOR_HEX).find(key=>key.toLocaleLowerCase('es')===String(name||'').trim().toLocaleLowerCase('es'));if(known)return PURCHASE_COLOR_HEX[known];
    let h=0;for(const c of String(name||''))h=(h*31+c.charCodeAt(0))%360;
    const saturation=.58,lightness=.58,a=saturation*Math.min(lightness,1-lightness),channel=n=>{const k=(n+h/30)%12;return Math.round((lightness-a*Math.max(-1,Math.min(k-3,9-k,1)))*255).toString(16).padStart(2,'0')};return '#'+channel(0)+channel(8)+channel(4);
  }
  function purchaseColorField(item,i){
    const value=normalizeOption(item.color),label=value||'Elegí un color';
    return `<div class="field purchase-color-field"><label>Color</label><button class="purchase-color-trigger" type="button" data-open-purchase-color="${i}"><span class="color-dot" style="--swatch:${escapeHtml(colorSwatch(value||'Rosa'))}"></span><span>${escapeHtml(label)}</span><b>⌄</b></button></div>`;
  }
  function purchaseTypeField(item,i){
    const type=item.materialType||'shirt',opts=currentPurchaseTypes(),isKnown=opts.some(([v])=>v===type);
    return `<div class="field purchase-type-field"><label>Tipo</label><select class="select" data-purchase-type-select data-row="${i}">${opts.map(([v,l])=>`<option value="${v}" ${type===v?'selected':''}>${escapeHtml(l)}</option>`).join('')}${!isKnown&&type!=='__other__'?`<option value="${escapeHtml(type)}" selected>${escapeHtml(materialTypeLabel(type))}</option>`:''}<option value="__other__">＋ Otro...</option></select></div>`;
  }
  function purchaseImageField(item,i){
    if(materialIsDtf(item.materialType)){
      const sheets=state.designAssets.filter(a=>a.kind==='sheet'&&a.print_material_type===item.materialType),selected=sheets.find(a=>Number(a.id)===Number(item.sheetAssetId));
      return `<div class="field purchase-sheet-choice"><label>Plancha de este renglón</label><div class="purchase-sheet-choice-row">${selected?purchaseSheetPreviewHtml({sheet_asset_id:selected.id,sheet_name:selected.name,sheet_mime_type:selected.mime_type}):''}<select class="select" data-purchase-sheet="${i}"><option value="">Sin asociar</option>${sheets.map(a=>`<option value="${a.id}" ${Number(item.sheetAssetId)===Number(a.id)?'selected':''}>${escapeHtml(a.name||a.file_name)}</option>`).join('')}</select></div><small class="field-help">Elegí la plancha para reconocerla desde Compras.</small></div>`;
    }
    return `<div class="field purchase-image-choice">${purchaseImagePickerHtml(item,i)}</div>`;
  }
  function purchasePhotoIds(item){return [...new Set((Array.isArray(item.imageAssetIds)?item.imageAssetIds:item.imageAssetId?[item.imageAssetId]:[]).map(Number).filter(id=>id>0))];}
  function galleryOrder(kind,items){let saved={};try{saved=JSON.parse(state.settings.admin_gallery_order||'{}')}catch{}const ids=state.galleryOrders?.[kind]||saved[kind]||[],positions=new Map(ids.map((id,i)=>[Number(id),i]));return [...items].sort((a,b)=>(positions.get(Number(a.id))??1e6)-(positions.get(Number(b.id))??1e6));}
  function photoFit(value){const text=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return text.includes('over')?'oversize':text.includes('crop')?'crop':text.includes('boxy')?'boxy':text.includes('clasic')||text.includes('basic')?'clasico':text.replace(/remera|buzo|chomba|camisa/g,'').trim();}
  function photoColor(value){const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase(),text=normalize(value);if(['negro','negra','black'].includes(text))return 'negro';if(['blanco','blanca','white'].includes(text))return 'blanco';const named=window.SalmosColors?.colorForName(value)||window.SalmosColors?.catalog().find(c=>normalize(c.name)===text)?.color||previewColor(value);return ['#ffffff','#f7f5ef'].includes(named)?'blanco':['#000000','#151515'].includes(named)?'negro':named||text;}
  function photoMatchesItem(asset,item){const type=item.materialType||item.material_type||'shirt';if(asset.asset_type!=='base'||asset.product_type!==type)return false;const color=String(item.color||'').trim(),fit=item.fit||'';return (!color||photoColor(asset.color)===photoColor(color))&&(!fit||photoFit(asset.garment_style)===photoFit(fit));}
  function photosForItem(item,ids=[]){const chosen=new Set(ids.map(Number));return galleryOrder('photos',state.mockupAssets.filter(a=>photoMatchesItem(a,item)||chosen.has(Number(a.id)))).sort((a,b)=>{const order=item.imageGalleryOrder||ids,ai=order.indexOf(Number(a.id)),bi=order.indexOf(Number(b.id));return (ai<0?1e9:ai)-(bi<0?1e9:bi);});}
  function photoProductDetails(a){const ids=[a.material_id,...(a.material_ids||[])].filter(Boolean).map(Number),material=state.materials.find(m=>ids.includes(Number(m.id))),type=a.product_type||material?.material_type||'',variant=materialIsGarment(type)?photoFit(a.garment_style||material?.fit||a.variant_label):String(a.variant_label||'').trim(),features=material?itemFeatures(material):[];return {type,variant,color:a.color||material?.color||'',features};}
  function photoProductKey(a){if(a.asset_type==='background')return 'Fondos';const d=photoProductDetails(a),norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();return JSON.stringify([d.type,norm(d.variant),photoColor(d.color),materialIsGarment(d.type)?[]:d.features.map(norm).sort()]);}
  function shortGarmentName(value){return String(value||'').replace(/\b(remera|camiseta|buzo|chomba|camisa)\s*/ig,'').trim();}
  function photoProductLabel(a){if(a.asset_type==='background')return 'Fondos';const d=photoProductDetails(a);return [...new Set([materialTypeLabel(d.type),...d.features,shortGarmentName(d.variant),materialColorName(d.color)].filter(Boolean))].join(' · ');}
  function comparePhotoProducts(a,b){const order=['shirt','chomba','hoodie','cap','mug','glass','thermos','tumbler','bag','other'],x=photoProductDetails(a),y=photoProductDetails(b),rank=t=>{const i=order.indexOf(t);return i<0?order.length:i;};return rank(x.type)-rank(y.type)||String(x.type).localeCompare(String(y.type),'es')||photoProductKey(a).localeCompare(photoProductKey(b),'es',{numeric:true});}
  function orderedProductPhotos(items){return galleryOrder('photos',items).sort(comparePhotoProducts);}
  function sortablePhotoAttrs(id,owner){return `data-sort-photo="${id}" data-photo-owner="${owner}" draggable="true"`;}
  function sortablePhotoHandle(){return '<span class="photo-sort-handle" data-photo-sort-handle title="Arrastrar para ordenar">↔</span>';}
  function animateGalleryOrder(root,before){if(!root)return;for(const card of qsa('[data-sort-photo]',root)){const old=before.get(`${card.dataset.photoOwner}:${card.dataset.sortPhoto}`),now=card.getBoundingClientRect();if(old&&card.animate){const x=old.left-now.left,y=old.top-now.top;if(x||y)card.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});}}}
  function materialPhotos(id){return state.mockupAssets.filter(a=>a.asset_type==='base'&&(Number(a.material_id)===Number(id)||(a.material_ids||[]).map(Number).includes(Number(id)))).sort((a,b)=>(a.material_positions?.[id]??0)-(b.material_positions?.[id]??0)||Number(a.id)-Number(b.id));}
  function orderedPhotoAssets(type,ids=[]){const positions=new Map(ids.map((id,i)=>[Number(id),i]));return galleryOrder('photos',state.mockupAssets).filter(a=>a.asset_type==='base'&&a.product_type===type).sort((a,b)=>(positions.get(Number(a.id))??1e6)-(positions.get(Number(b.id))??1e6));}
  function materialEditorFeaturesHtml(){
    const editor=state.materialEditor;if(!editor)return '';const selected=editor.features,options=uniqOptions([...purchaseMaterialOptions(editor.material.material_type),...editor.featureOptions,...selected]);
    return `<label>Materiales y características</label><div class="material-feature-chips">${materialFeatureChips(selected)}</div><details class="purchase-features-list"><summary>Elegir características</summary><div class="feature-options">${options.map(value=>`<label><input type="checkbox" data-material-feature value="${escapeHtml(value)}" ${selected.includes(value)?'checked':''}><span>${escapeHtml(value)}</span></label>`).join('')}</div></details><div class="material-feature-add"><input class="input" data-material-new-feature placeholder="Nueva característica"><button class="btn btn-ghost" type="button" data-material-add-feature>Agregar</button></div>`;
  }
  function renderMaterialEditorPhotos(){
    const editor=state.materialEditor,host=qs('#materialEditorPhotos');if(!editor||!host)return;const ids=editor.imageAssetIds,assets=photosForItem({...editor.material,imageGalleryOrder:editor.imageGalleryOrder},ids);
    host.innerHTML=`<div class="admin-section-head"><div><h3>Fotos de esta materia prima</h3><small>${ids.length} elegida${ids.length===1?'':'s'}</small></div><button class="btn btn-primary" type="button" data-upload-editor-material-photo>+ Subir fotos</button></div><div class="material-photo-editor-gallery">${assets.map(asset=>`<button type="button" class="purchase-image-option ${ids.includes(Number(asset.id))?'selected':''}" data-choose-material-photo="${asset.id}" data-sort-photo="${asset.id}" data-photo-owner="material" draggable="true" aria-pressed="${ids.includes(Number(asset.id))}" title="${escapeHtml(asset.name)}"><span class="photo-sort-handle" data-photo-sort-handle title="Arrastrar para ordenar">↔</span><img draggable="false" src="${escapeHtml(mockupAssetUrl(asset))}" alt="${escapeHtml(asset.name)}" loading="lazy">${ids.includes(Number(asset.id))?'<span class="purchase-photo-check">✓</span>':''}</button>`).join('')||'<p class="muted">Todavía no hay fotos para este tipo de producto.</p>'}</div>`;
  }
  async function openProductionMaterialEditor(id){
    await Promise.all([ensureCostingData(),loadMockupAssets(),ensureAdminOptionSettings()]);const material=state.materials.find(item=>Number(item.id)===Number(id));if(!material)throw new Error('Materia prima no encontrada.');
    const photoIds=materialPhotos(id).map(asset=>Number(asset.id));state.materialEditor={material:structuredClone(material),features:itemFeatures(material),featureOptions:[],imageAssetIds:[...photoIds],originalImageAssetIds:[...photoIds]};
    let dialog=qs('#materialEditorDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='materialEditorDialog';dialog.className='admin-dialog material-editor-dialog';dialog.addEventListener('cancel',event=>{if(state.materialEditorBusy)event.preventDefault()});document.body.append(dialog);}
    const choice=(name,label,value,options)=>`<label class="field"><span>${label}</span><select class="select" data-material-field="${name}"><option value="">Sin especificar</option>${mergePurchaseOptions(options,[value]).map(v=>`<option value="${escapeHtml(v)}" ${v===value?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></label>`,field=(name,label,value,type='text')=>`<label class="field"><span>${label}</span><input class="input" data-material-field="${name}" type="${type}" ${type==='number'?'min="0" step=".01"':'maxlength="120"'} value="${escapeHtml(value??'')}"></label>`,garment=materialIsGarment(material.material_type);
    dialog.innerHTML=`<div class="dialog-shell"><div class="dialog-head"><div><div class="admin-eyebrow">${escapeHtml(materialTypeLabel(material.material_type))}</div><h2>Editar materia prima</h2></div><button class="icon-btn" type="button" data-close-material-editor aria-label="Cerrar">×</button></div><div class="dialog-body"><div class="material-editor-stock">${Number(material.stock_qty).toLocaleString('es-AR',{maximumFractionDigits:3})} ${material.unit==='meter'?'m':'u'} disponibles · ${money(material.average_cost_cents)} por ${material.unit==='meter'?'metro':'unidad'}</div><div class="field" id="materialEditorFeatures">${materialEditorFeaturesHtml()}</div><div class="form-grid material-editor-fields">${materialUsesColor(material.material_type)?`<label class="field"><span>Color</span><div class="salmos-color-field"><input class="input" data-material-field="color" data-material-color-palette readonly aria-haspopup="dialog" value="${escapeHtml(material.color||'')}"><button class="salmos-color-button" type="button" data-material-color-palette style="--color-swatch:${escapeHtml(colorSwatch(material.color))}" aria-label="Elegir color desde la paleta"></button></div></label>`:''}${garment?choice('fit','Corte',material.fit,purchaseFitOptions())+choice('size','Talle',material.size,purchaseSizeOptions({materialClass:material.material_class}))+choice('materialClass','Clase',material.material_class,purchaseClassOptions())+choice('gender','Género',material.gender,['Unisex','Varón','Mujer']):''}${Number(material.capacity_ml)>0||['mug','glass','thermos','tumbler'].includes(material.material_type)?field('capacityMl','Capacidad (ml)',material.capacity_ml,'number'):''}${material.unit==='meter'?field('widthCm','Ancho (cm)',material.width_cm,'number'):''}${field('unitCostPesos',material.unit==='meter'?'Costo pagado por metro ($)':'Costo pagado por unidad ($)',centsToPesos(material.average_cost_cents),'number')}</div><div class="material-cost-history"><small class="field-help">Costo usado para la producción.</small><button type="button" class="btn btn-ghost" data-edit-material-purchase>Editar última compra y pago</button></div><section id="materialEditorPhotos"></section></div><div class="dialog-foot"><button class="btn btn-ghost" type="button" data-close-material-editor>Cancelar</button><button class="btn btn-primary" type="button" id="saveMaterialEditorBtn">Guardar materia prima</button></div></div>`;
    renderMaterialEditorPhotos();document.body.append(dialog);if(!dialog.open)dialog.showModal();
  }
  async function saveMaterialEditor(button){
    const editor=state.materialEditor;if(!editor)return;const features=uniqOptions(editor.features);if(!features.length)throw new Error('Elegí los materiales y características.');
    const payload={features,name:features.join(' · '),imageAssetIds:editor.imageAssetIds,expectedUpdatedAt:editor.material.updated_at,expectedImageAssetIds:editor.originalImageAssetIds};qsa('[data-material-field]',qs('#materialEditorDialog')).forEach(input=>payload[input.dataset.materialField]=input.type==='number'?Number(input.value):input.value.trim());
    payload.unitCostCents=pesosToCents(payload.unitCostPesos);delete payload.unitCostPesos;payload.expectedUnitCostCents=Number(editor.material.average_cost_cents)||0;const controls=qsa('input,select,textarea,button',qs('#materialEditorDialog')).map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);state.materialEditorBusy=true;button.disabled=true;
    try{const result=await api(`/api/admin/materials/${Number(editor.material.id)}`,{method:'PATCH',body:JSON.stringify(payload)});state.materials=state.materials.map(material=>Number(material.id)===Number(result.item.id)?result.item:material);if(Array.isArray(result.photos))state.mockupAssets=result.photos;
      for(const feature of features)addPurchaseOption('materials',feature,result.item.material_type);if(Array.isArray(state.purchaseOptions.featureCatalog?.[result.item.material_type]))state.purchaseOptions.featureCatalog[result.item.material_type]=uniqOptions([...state.purchaseOptions.featureCatalog[result.item.material_type],...features]);persistAdminOptionSettings().catch(()=>{});
      renderProductionMaterialGallery();renderProductionSelectedMaterials();renderMockupStudioOptions();if(!qs('#mockupBaseSelect')?.value){const first=materialPhotos(editor.material.id)[0];if(first)selectMockupVariant(first.id);}await refreshMockupPreview().catch(()=>{});qs('#materialEditorDialog').close();state.materialEditor=null;toast('Materia prima y fotos guardadas','success');
    }finally{controls.forEach(([control,disabled])=>control.disabled=disabled);state.materialEditorBusy=false;button.disabled=false;}
  }
  function purchaseImagePickerHtml(item,i){
    const type=item.materialType||'shirt',ids=purchasePhotoIds(item),assets=photosForItem(item,ids),selected=assets.filter(a=>ids.includes(Number(a.id)));
    return `<div class="purchase-image-picker-head"><label>Fotos de la materia prima<small>${selected.length} elegida${selected.length===1?'':'s'}</small></label><button class="btn btn-ghost" type="button" data-purchase-photos-all="${i}">${assets.length&&assets.every(a=>ids.includes(Number(a.id)))?'Desmarcar todas':'Marcar todas'}</button><button class="btn btn-ghost" type="button" data-upload-material-image="${i}">+ Subir fotos</button></div><div class="horizontal-gallery-shell"><button type="button" class="gallery-arrow gallery-arrow-left" data-scroll-target="purchaseImageGallery-${i}" data-scroll-dir="-1" aria-label="Fotos anteriores">‹</button><div class="purchase-image-gallery" id="purchaseImageGallery-${i}" aria-label="Elegir varias fotos de la materia prima"><button type="button" class="purchase-image-option ${!ids.length?'selected':''}" data-choose-purchase-image="0" data-purchase-image-row="${i}" aria-pressed="${!ids.length}" aria-label="Sin foto"><span>Sin foto</span></button>${assets.map((a,index)=>`<button type="button" class="purchase-image-option ${ids.includes(Number(a.id))?'selected':''}" data-choose-purchase-image="${a.id}" data-purchase-image-row="${i}" data-sort-photo="${a.id}" data-photo-owner="purchase-${i}" draggable="true" aria-pressed="${ids.includes(Number(a.id))}" aria-label="Foto ${index+1}"><span class="photo-sort-handle" data-photo-sort-handle title="Arrastrar para ordenar">↔</span><img draggable="false" src="${escapeHtml(mockupAssetUrl(a))}" alt="Foto ${index+1}" loading="lazy" decoding="async">${ids.includes(Number(a.id))?'<span class="purchase-photo-check">✓</span>':''}</button>`).join('')}</div><button type="button" class="gallery-arrow gallery-arrow-right" data-scroll-target="purchaseImageGallery-${i}" data-scroll-dir="1" aria-label="Fotos siguientes">›</button></div>`;
  }
  function choosePurchaseImage(index,id){
    const item=state.purchaseItems[index],row=qs(`[data-purchase-row="${index}"]`);if(!item||!row)return;
    if(id&&!state.mockupAssets.some(a=>Number(a.id)===id&&a.asset_type==='base'&&a.product_type===(item.materialType||'shirt')))return;
    syncPurchaseRowFromDom(row);const ids=purchasePhotoIds(item);item.imageAssetIds=!id?[]:ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];item.imageAssetId=item.imageAssetIds[0]||null;item._imageTouched=true;
    const field=qs('.purchase-image-choice',row),left=qs('.purchase-image-gallery',field)?.scrollLeft||0;
    if(field){field.innerHTML=purchaseImagePickerHtml(item,index);const gallery=qs('.purchase-image-gallery',field);if(gallery)gallery.scrollLeft=left;}
  }
  function refreshPurchasePhotoField(index){
    const item=state.purchaseItems[index],row=qs(`[data-purchase-row="${index}"]`);if(!item||!row)return;const field=qs('.purchase-image-choice',row);if(!field)return;
    const left=qs('.purchase-image-gallery',field)?.scrollLeft||0;field.innerHTML=purchaseImagePickerHtml(item,index);const gallery=qs('.purchase-image-gallery',field);if(gallery)gallery.scrollLeft=left;
  }
  function reorderPhotoThumbnails(owner,fromId,toId){
    if(String(fromId)===String(toId))return;const before=new Map(qsa('[data-sort-photo]').map(card=>[`${card.dataset.photoOwner}:${card.dataset.sortPhoto}`,card.getBoundingClientRect()]));
    if(owner.startsWith('catalog-')){const kind=owner.slice(8),items=kind==='photos'?state.mockupAssets:kind==='designs'?state.designAssets:state.materials,ordered=galleryOrder(kind,items).map(a=>Number(a.id)),from=ordered.indexOf(Number(fromId)),to=ordered.indexOf(Number(toId));if(from<0||to<0)return;const [id]=ordered.splice(from,1);ordered.splice(to,0,id);state.galleryOrders??={};let saved={};try{saved=JSON.parse(state.settings.admin_gallery_order||'{}')}catch{}state.galleryOrders={...saved,...state.galleryOrders,[kind]:ordered};state.settings.admin_gallery_order=JSON.stringify(state.galleryOrders);const revision=state.galleryOrderSeq=(state.galleryOrderSeq||0)+1;renderMockupStudioOptions();renderProductionDesignGallery();renderProductionMaterialGallery();renderMockupAssetList();animateGalleryOrder(document,before);state.galleryOrderSave=(state.galleryOrderSave||Promise.resolve()).catch(()=>{}).then(()=>api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:{admin_gallery_order:state.settings.admin_gallery_order}})})).catch(err=>{if(revision===state.galleryOrderSeq)toast('No se pudo guardar el orden. Mové una miniatura para reintentar. '+err.message,'error');});return;}
    if(owner==='product'){
      const from=state.mediaItems.findIndex(item=>item.key===fromId),to=state.mediaItems.findIndex(item=>item.key===toId);if(from<0||to<0)return;
      const [item]=state.mediaItems.splice(from,1);state.mediaItems.splice(to,0,item);state.newFiles=state.mediaItems.filter(item=>!item.existing).map(item=>item.file);renderMediaManager('productionMediaOrderList');renderMockupProductViews();animateGalleryOrder(document,before);return;
    }
    const index=owner.startsWith('purchase-')?Number(owner.slice(9)):null,item=index!==null?state.purchaseItems[index]:state.materialEditor;if(!item)return;
    const type=index!==null?item.materialType:item.material.material_type,ids=index!==null?purchasePhotoIds(item):item.imageAssetIds;
    const ordered=orderedPhotoAssets(type,item.imageGalleryOrder||ids).map(asset=>Number(asset.id)),from=ordered.indexOf(Number(fromId)),to=ordered.indexOf(Number(toId));if(from<0||to<0)return;
    const [id]=ordered.splice(from,1);ordered.splice(to,0,id);item.imageGalleryOrder=ordered;item.imageAssetIds=ordered.filter(id=>ids.includes(id));
    if(index!==null){item.imageAssetId=item.imageAssetIds[0]||null;item._imageTouched=true;refreshPurchasePhotoField(index);}else renderMaterialEditorPhotos();animateGalleryOrder(document,before);
  }
  function enhanceActionIcons(root=document){if(!root)return;for(const button of [...(root.matches?.('button')?[root]:[]),...(root.querySelectorAll?.('button')||[])]){const collapseLabel=button.textContent.trim();if(/^(Comprimir|Descomprimir|Expandir)(?: |$)/.test(collapseLabel)){button.setAttribute('aria-label',collapseLabel);button.title=collapseLabel;button.innerHTML='<i class="fa-solid '+(/^Comprimir/.test(collapseLabel)?'fa-chevron-up':'fa-chevron-down')+'" aria-hidden="true"></i>';}if(button.matches('[data-mockup-copy-info],[data-duplicate-purchase-item]')&&!button.querySelector('.fa-copy')){button.innerHTML='<i class="fa-solid fa-copy" aria-hidden="true"></i>';button.classList.add('action-icon');}const icons={'data-edit-production-mount':'fa-image','data-edit-production':'fa-pen','data-complete-production':'fa-check','data-cancel-production':'fa-ban'};for(const [attr,icon] of Object.entries(icons))if(button.hasAttribute(attr)&&!button.querySelector('.'+icon)){button.setAttribute('aria-label',button.getAttribute('aria-label')||button.textContent.trim());button.title=button.getAttribute('aria-label');button.innerHTML='<i class="fa-solid '+icon+'" aria-hidden="true"></i>';button.classList.add('action-icon');}if(button.querySelector('.fa-trash-can'))continue;const text=button.textContent.trim(),remove=Array.from(button.attributes).some(x=>/^data-(delete|remove|mockup-remove)/.test(x.name));if(/^Eliminar(?:\s|$)/.test(text)||(remove&&text==='×')){button.setAttribute('aria-label',button.getAttribute('aria-label')||text||'Eliminar');button.setAttribute('title',button.getAttribute('title')||button.getAttribute('aria-label'));button.classList.add('action-icon-delete');button.innerHTML='<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';}}}
  function bindActionIcons(){enhanceActionIcons();if(!window.MutationObserver)return;const observer=new MutationObserver(records=>{for(const record of records){if(record.target.nodeType===1)enhanceActionIcons(record.target);for(const node of record.addedNodes)if(node.nodeType===1){enhanceActionIcons(node);if(node.tagName==='BUTTON')enhanceActionIcons(node.parentElement);}}});observer.observe(document.body,{childList:true,subtree:true});}
  function bindPhotoReordering(){document.addEventListener('change',event=>{if(event.target.matches('[data-mockup-replace-file]')){const record=state.mockupUploadQueue.find(r=>String(r.id)===event.target.dataset.mockupReplaceFile),file=event.target.files?.[0];if(!record||!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Usá PNG, JPG o WEBP.','error');return;}captureMockupQueue();record.file=file;record.url=URL.createObjectURL(file);record.needsFile=false;record.saved=null;renderMockupUploadQueue();return;}const card=event.target.closest('[data-mockup-upload]'),key=event.target.dataset.mockupField;if(!card||!key||['name','pose'].includes(key))return;const rows=state.mockupUploadQueue||[],index=rows.findIndex(r=>String(r.id)===card.dataset.mockupUpload),record=rows[index];if(!record)return;const old=record.values?.[key],value=event.target.value;for(const next of rows.slice(index+1)){const target=qs(`[data-mockup-field="${key}"]`,qs(`[data-mockup-upload="${next.id}"]`));if(!target||target.value!==old)continue;if(target.tagName==='SELECT'&&![...target.options].some(o=>o.value===value))target.add(new Option(value,value));target.value=value;syncMockupUploadCard(target.closest('[data-mockup-upload]'));}captureMockupQueue();});document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&qs('#productionDialog')?.open&&!event.target.closest?.('input,textarea,select,[contenteditable=true]')&&undoMockupBrush())event.preventDefault();});
    document.addEventListener('salmos-color-error',event=>toast(event.detail,'error'));document.addEventListener('salmos-color-catalog-change',event=>{for(const dock of qsa('.design-appearance-dock')){const fresh=document.createElement('div');fresh.innerHTML=designBackgroundControlHtml(dock.dataset.designAppearanceActions);qsa('.design-channel-colors',dock).forEach((list,i)=>{list.innerHTML=qsa('.design-channel-colors',fresh)[i].innerHTML;});}state.settings.named_color_catalog=JSON.stringify(event.detail);const payload=state.settings.named_color_catalog;state.colorCatalogSave=(state.colorCatalogSave||Promise.resolve()).catch(()=>{}).then(()=>api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:{named_color_catalog:payload}})})).catch(err=>toast(err.message,'error'));});
    let drag=null,suppressClickUntil=0;
    const photo=target=>target?.closest('[data-sort-photo]');
    document.addEventListener('dragstart',event=>{const card=photo(event.target);if(!card)return;drag={card,owner:card.dataset.photoOwner,id:card.dataset.sortPhoto,target:null};event.dataTransfer?.setData('text/plain',drag.id);card.classList.add('photo-sorting');});
    document.addEventListener('dragover',event=>{const card=photo(event.target);if(drag&&card&&card.dataset.photoOwner===drag.owner){event.preventDefault();drag.target=card.dataset.sortPhoto;}});
    document.addEventListener('drop',event=>{if(!drag)return;const card=photo(event.target);if(card&&card.dataset.photoOwner===drag.owner){event.preventDefault();reorderPhotoThumbnails(drag.owner,drag.id,card.dataset.sortPhoto);suppressClickUntil=Date.now()+350;}drag.card.classList.remove('photo-sorting');drag=null;});
    document.addEventListener('dragend',()=>{if(drag)drag.card.classList.remove('photo-sorting');drag=null;});
    document.addEventListener('pointerdown',event=>{const handle=event.target.closest('[data-photo-sort-handle]'),card=handle&&photo(handle);if(!card||event.button>0)return;event.preventDefault();drag={card,owner:card.dataset.photoOwner,id:card.dataset.sortPhoto,pointer:event.pointerId,x:event.clientX,y:event.clientY,target:null};handle.setPointerCapture?.(event.pointerId);});
    document.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;event.preventDefault();if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;drag.card.classList.add('photo-sorting');drag.card.style.translate=`${event.clientX-drag.x}px ${event.clientY-drag.y}px`;drag.card.style.pointerEvents='none';const card=photo(document.elementFromPoint(event.clientX,event.clientY));drag.card.style.pointerEvents='';if(card&&card.dataset.photoOwner===drag.owner)drag.target=card.dataset.sortPhoto;const gallery=drag.card.closest('.purchase-image-gallery,.material-photo-editor-gallery,#mockupProductViews,#mockupVariantGallery,#productionDesignGallery,#productionMaterialGallery,.montage-photo-grid');if(gallery){const box=gallery.getBoundingClientRect();if(drag.owner==='product'){if(event.clientY>box.bottom-30)gallery.scrollTop+=12;else if(event.clientY<box.top+30)gallery.scrollTop-=12;}else if(event.clientX>box.right-30)gallery.scrollLeft+=12;else if(event.clientX<box.left+30)gallery.scrollLeft-=12;}});
    const finish=event=>{if(!drag||drag.pointer!==event.pointerId)return;const current=drag;drag=null;current.card.classList.remove('photo-sorting');current.card.style.translate='';suppressClickUntil=Date.now()+350;if(event.type==='pointerup'&&current.target)reorderPhotoThumbnails(current.owner,current.id,current.target);};
    document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',finish);
    document.addEventListener('click',event=>{if(photo(event.target)&&Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
    document.addEventListener('keydown',event=>{const card=photo(event.target);if(!card||!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;const cards=qsa('[data-sort-photo]',card.closest('.purchase-image-gallery,.material-photo-editor-gallery,#mockupProductViews,#mockupVariantGallery,#productionDesignGallery,#productionMaterialGallery,.montage-photo-grid')||card.parentElement),index=cards.indexOf(card),next=cards[index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)];if(next){event.preventDefault();reorderPhotoThumbnails(card.dataset.photoOwner,card.dataset.sortPhoto,next.dataset.sortPhoto);}});
  }
  function purchaseItemTitle(item={},index=0){
    const type=item.materialType||'shirt',quantity=Number(item.quantity)||1;
    if(materialIsDtf(type))return `${quantity.toLocaleString('es-AR',{maximumFractionDigits:3})} m ${materialTypeLabel(type)}${Number(item.widthCm)>0?` · ${Number(item.widthCm)} cm`:''}`;
    const feminine=['shirt','chomba','cap','cup','mug'].includes(type),label=materialTypeLabel(type).toLocaleLowerCase('es');
    const adjective=value=>{const text=String(value||'').toLocaleLowerCase('es');return feminine?text.replace(/^(clásic|blanc|negr|roj|amarill|rosad|morad)o$/,'$1a'):text;};
    const title=[quantity.toLocaleString('es-AR',{maximumFractionDigits:3}),label||`artículo ${index+1}`,adjective(item.fit),item.size,Number(item.capacityMl)>0?`${Number(item.capacityMl)} ml`:'',adjective(item.color)].filter(Boolean).join(' '),features=itemFeatures(item);
    return title+(features.length?` · ${features.join(' · ')}`:'');
  }
  function closePurchaseFeatureLists(target){qsa('.purchase-features-list[open]').forEach(list=>{if(!list.contains(target))list.open=false;});}
  function purchaseItemRow(x={},i=0){
    const type=x.materialType||'shirt',resolvedType=type==='__other__'?'other':type,garment=materialIsGarment(resolvedType),color=materialUsesColor(resolvedType),dtf=materialIsDtf(resolvedType),qty=Math.max(dtf?.01:1,Number(x.quantity)||1);
    const fitField=garment?purchaseChoiceField(x,'fit','Corte',purchaseFitOptions(),'Nuevo corte'):'';
    const classField=garment?purchaseChoiceField(x,'materialClass','Clase',purchaseClassOptions(),'Nueva clase'):'';
    const sizeField=garment?purchaseChoiceField(x,'size','Talle',purchaseSizeOptions(x),'Nuevo talle'):'';
    const genderField=garment?`<div class="field purchase-gender"><label>Género</label><select class="select" data-purchase-choice="gender">${PURCHASE_GENDERS.map(v=>`<option value="${v}" ${(x.gender||'Unisex')===v?'selected':''}>${v}</option>`).join('')}</select></div>`:'';
    const colorField=color?purchaseColorField(x,i):'';
    const materialOptions=purchaseMaterialOptions(resolvedType);
    const materialField=purchaseFeaturesField(x,i);
    const capacityField=purchaseCapacityField(x,resolvedType);
    return `<div class="purchase-item-row ${garment?'is-garment':''} ${dtf?'is-dtf':''}" data-purchase-row="${i}">
      <strong class="purchase-item-title" data-purchase-item-title>${escapeHtml(purchaseItemTitle(x,i))}</strong>
      ${purchaseTypeField(x,i)}
      ${fitField}${classField}${sizeField}${genderField}${colorField}
      ${materialField}${capacityField}
      ${dtf?`<div class="field purchase-width"><label>Ancho del rollo (cm)</label><input class="input" data-purchase-field="widthCm" type="number" min="1" step=".1" value="${Number(x.widthCm)||58}"></div>`:''}
      <div class="purchase-item-pricing">
      <div class="field purchase-quantity"><label>${dtf?'Metros':'Cantidad'}</label><div class="purchase-stepper"><button type="button" data-purchase-step="-1" data-row="${i}">−</button><input class="input" data-purchase-field="quantity" type="number" min="${dtf?'.01':'1'}" step="${dtf?'.1':'1'}" value="${qty}"><button type="button" data-purchase-step="1" data-row="${i}">+</button></div></div>
      <div class="field purchase-price"><label>Precio por ${dtf?'metro':'unidad'} ($)</label><input class="input" data-purchase-field="unitPricePesos" type="number" min="0" step=".01" value="${escapeHtml(x.unitPricePesos??'')}" placeholder="Precio"><small class="purchase-line-total" data-purchase-line-total="${i}">Total: ${money(purchaseLineCents(x))}</small></div>
      <div class="purchase-row-actions"><button type="button" class="icon-btn" data-duplicate-purchase-item="${i}" aria-label="Duplicar" title="Duplicar">⧉</button><button type="button" class="icon-btn purchase-remove" data-remove-purchase-item="${i}" aria-label="Quitar" title="Quitar">×</button></div>
      </div>
      ${purchaseImageField(x,i)}
    </div>`;
  }
  function surchargeData(prefix,baseCents){
    const type=qs(`#${prefix}SurchargeType`)?.value==='percent'?'percent':'fixed',value=Number(qs(`#${prefix}Surcharge`)?.value||0);
    const valid=Number.isFinite(value)&&value>=0;
    const surcharge=valid?Math.round(type==='percent'?baseCents*value/100:value*100):0;
    return {type,value,surcharge,total:baseCents+surcharge,valid};
  }
  function renderSurchargeHelp(prefix,data){const el=qs(`#${prefix}SurchargeHelp`);if(el)el.textContent=data.type==='percent'?`${data.value||0}% sobre el importe base · ${money(data.surcharge)}`:`Importe fijo: ${money(data.surcharge)}`;}
  function paymentSplit(prefix,total){
    const method=qs(`#${prefix}PaymentMethod`)?.value||'cash';
    const cash=method==='transfer'?0:method==='cash'?total:pesosToCents(qs(`#${prefix}CashAmount`)?.value);
    const transfer=method==='cash'?0:method==='transfer'?total:pesosToCents(qs(`#${prefix}TransferAmount`)?.value);
    if(cash<0||transfer<0||cash+transfer!==total)throw new Error(`Efectivo + transferencia debe sumar ${money(total)}.`);
    const origin=String(qs(`#${prefix}TransferOrigin`)?.value||'').trim(),destination=String(qs(`#${prefix}TransferDestination`)?.value||'').trim();
    const payments=[];
    if(cash>0)payments.push({method:'cash',amountCents:cash,origin:'Efectivo',destination:''});
    if(transfer>0)payments.push({method:'transfer',amountCents:transfer,origin,destination,reference:String(qs(`#${prefix}TransferReference`)?.value||'').trim(),details:String(qs(`#${prefix}TransferDetails`)?.value||'').trim()});
    return {method,payments};
  }
  function updateMovementPayment(){
    const form=qs('#movementForm'),method=qs('#movementPaymentMethod').value,base=pesosToCents(form.elements.amount.value),charge=surchargeData('movement',base);
    qs('#movementTotal').textContent=money(charge.total);qs('#movementTotalLabel').textContent=form.elements.type.value==='income'?'Total del ingreso':'Total del egreso';renderSurchargeHelp('movement',charge);
    qsa('.movement-cash-field',form).forEach(x=>x.classList.toggle('hidden',method==='transfer'));
    qsa('.movement-transfer-field',form).forEach(x=>x.classList.toggle('hidden',method==='cash'));
    if(method==='cash')qs('#movementCashAmount').value=centsToPesos(charge.total);
    if(method==='transfer')qs('#movementTransferAmount').value=centsToPesos(charge.total);
    qs('#movementCashAmount').readOnly=method!=='mixed';qs('#movementTransferAmount').readOnly=method!=='mixed';
    qs('#movementPaymentHelp').textContent=method==='mixed'?'Efectivo + transferencia debe coincidir con el total.':'El total incluye el recargo indicado.';
  }
  async function loadMovementSale(m={}){
    const data=await api('/api/admin/stock');state.saleVariants=data.items||[];state.movementSaleItems=(m.saleItems||[]).map(x=>({variantId:Number(x.variantId??x.variant_id),quantity:Number(x.quantity),unitPriceCents:Number(x.unitPriceCents??x.unit_price_cents),name:x.product_name||x.name,label:x.variant_label||x.label}));
    qs('#movementSaleEnabled').checked=state.movementSaleItems.length>0;state.movementRequestKey=crypto.randomUUID();renderMovementSales();
  }
  function renderMovementSales(){
    const income=qs('#movementType').value==='income',enabled=qs('#movementSaleEnabled').checked&&income;qs('#movementSaleSection').classList.toggle('hidden',!income);qs('#movementSaleDetails').classList.toggle('hidden',!enabled);qs('#movementAmount').readOnly=enabled;
    qs('#movementSaleRows').innerHTML=(state.movementSaleItems||[]).map((item,i)=>{const selected=(state.saleVariants||[]).find(x=>Number(x.id)===Number(item.variantId)),options=(state.saleVariants||[]).map(x=>`<option value="${x.id}" ${Number(x.id)===Number(item.variantId)?'selected':''}>${escapeHtml([x.product_name,x.color,x.size].filter(Boolean).join(' · '))}</option>`).join('');return `<div class="movement-sale-row" data-sale-row="${i}">${selected?.primary_image_url?`<img src="${escapeHtml(selected.primary_image_url)}" alt="" class="design-small-image">`:'<span></span>'}<label class="field">Producto / variante<select class="select" data-sale-field="variantId"><option value="">Elegir producto...</option>${options}${!selected&&item.variantId?`<option value="${item.variantId}" selected>${escapeHtml(item.name||'Producto')} · ${escapeHtml(item.label||'')}</option>`:''}</select></label><label class="field">Cantidad<input class="input" type="number" min="1" step="1" data-sale-field="quantity" value="${item.quantity||1}"></label><label class="field">Precio por unidad ($)<input class="input" type="number" min="0" step=".01" data-sale-field="price" value="${(Number(item.unitPriceCents)||0)/100}"></label><button type="button" class="icon-btn" data-remove-sale="${i}" aria-label="Quitar producto">×</button><small class="field-help">${selected?`Stock interno: ${selected.stock_kind==='to_stock'?0:Number(selected.stock)||0} · ${(Number(item.quantity)||0)>(selected.stock_kind==='to_stock'?0:Number(selected.stock)||0)?'Hay unidades a preparar':'Disponible'}`:''}</small></div>`}).join('');
    if(enabled)updateMovementSaleTotal();
    if(state.movementReadOnly)qsa('input,select,button',qs('#movementSaleSection')).forEach(x=>x.disabled=true);
  }
  function movementSalePayload(){if(!qs('#movementSaleEnabled').checked||qs('#movementType').value!=='income')return [];return (state.movementSaleItems||[]).map(x=>({variantId:Number(x.variantId),quantity:Number(x.quantity),unitPriceCents:Number(x.unitPriceCents)}))}
  function updateMovementSaleTotal(){if(!qs('#movementSaleEnabled').checked||qs('#movementType').value!=='income')return;const items=movementSalePayload();qs('#movementAmount').value=centsToPesos(items.reduce((sum,x)=>sum+x.quantity*x.unitPriceCents,0));const detail=qs('#movementForm').elements.description;if(!detail.value)detail.value='Venta de productos';updateMovementPayment();}
  function movementPayload(){
    const f=new FormData(qs('#movementForm')),base=pesosToCents(f.get('amount')),charge=surchargeData('movement',base),split=paymentSplit('movement',charge.total);
    if(base<=0||!charge.valid)throw new Error('Ingresá un importe base mayor a cero y un recargo válido.');
    if(!String(f.get('category')||'').trim()||!String(f.get('description')||'').trim())throw new Error('Completá motivo y detalle.');
    const saleItems=movementSalePayload();if(qs('#movementSaleEnabled').checked&&f.get('type')==='income'&&!saleItems.length)throw new Error('Agregá el producto vendido.');
    return {requestKey:state.movementRequestKey,saleItems,type:f.get('type'),category:f.get('category'),description:f.get('description'),origin:f.get('origin'),destination:f.get('destination'),base_cents:base,amount_cents:charge.total,surchargeType:charge.type,surchargeValue:charge.value,payment_method:split.method,payments:split.payments,occurred_at:recordDateTime(String(f.get('date')),state.movementOriginalOccurredAt)};
  }
  function loadMovementPayment(m={}){
    const form=qs('#movementForm');let payments=Array.isArray(m.payments)?m.payments:[];
    if(!payments.length){try{payments=JSON.parse(m.payment_json||'[]')}catch{}}
    const method=m.payment_method||payments[0]?.method||'cash',tp=payments.find(p=>p.method==='transfer');
    qs('#movementPaymentMethod').value=method;form.elements.amount.value=centsToPesos(m.base_cents??m.amount_cents??0);
    qs('#movementSurchargeType').value=m.surcharge_type||'fixed';qs('#movementSurcharge').value=(m.surcharge_value??((Number(m.surcharge_cents)||0)/100))||'';
    for(const [part,label] of [['cash','Cash'],['transfer','Transfer']])qs(`#movement${label}Amount`).value=centsToPesos(payments.filter(p=>p.method===part).reduce((sum,p)=>sum+Number(p.amountCents??p.amount_cents??0),0));
    qs('#movementTransferOrigin').value=tp?.origin||m.transfer_origin||((method==='transfer')?m.origin:'')||'';qs('#movementTransferDestination').value=tp?.destination||m.transfer_destination||((method==='transfer')?m.destination:'')||'';
    qs('#movementTransferReference').value=tp?.reference||m.transfer_reference||'';qs('#movementTransferDetails').value=tp?.details||m.transfer_details||'';updateMovementPayment();
  }

  function purchaseLineCents(x){return x.sheetAssetId&&Number.isSafeInteger(Number(x.lineTotalCents))?Number(x.lineTotalCents):Math.round((Number(x.quantity)||0)*pesosToCents(x.unitPricePesos));}
  function purchaseSubtotalCents(){return state.purchaseItems.reduce((sum,x)=>sum+purchaseLineCents(x),0);}
  function updatePurchasePaymentVisibility(){
    const method=qs('#purchasePaymentMethod')?.value||'cash';
    qsa('.payment-cash-field',qs('#purchaseForm')).forEach(x=>x.classList.toggle('hidden',method==='transfer'));
    qsa('.payment-transfer-field',qs('#purchaseForm')).forEach(x=>x.classList.toggle('hidden',method==='cash'));
    const breakdown=qs('#purchasePaidBreakdown');if(breakdown)breakdown.dataset.method=method;
    const subtotal=purchaseSubtotalCents(),surcharge=surchargeData('purchase',subtotal).surcharge,grand=subtotal+surcharge,cash=qs('#purchaseCashAmount'),transfer=qs('#purchaseTransferAmount');
    if(method==='cash'&&cash)cash.value=centsToPesos(grand);
    if(method==='transfer'&&transfer)transfer.value=centsToPesos(grand);
    if(cash)cash.readOnly=method!=='mixed';if(transfer)transfer.readOnly=method!=='mixed';renderSurchargeHelp('purchase',surchargeData('purchase',subtotal));
    const help=qs('#purchasePaymentHelp');
    if(help)help.textContent=method==='mixed'
      ?'Efectivo + transferencia debe coincidir con el total. Al guardar la compra, el pago se registra automáticamente en Caja.'
      :'Al guardar la compra, el pago se registra automáticamente en Caja.';
  }
  function updatePurchaseTotal(){qsa('[data-purchase-line-total]').forEach(el=>{const item=state.purchaseItems[Number(el.dataset.purchaseLineTotal)];if(item)el.textContent=`Total: ${money(purchaseLineCents(item))}`;});const subtotal=purchaseSubtotalCents(),surcharge=surchargeData('purchase',subtotal).surcharge,grand=subtotal+surcharge;const a=qs('#purchaseSubtotal'),b=qs('#purchaseTotal');if(a)a.textContent=money(subtotal);if(b)b.textContent=money(grand);updatePurchasePaymentVisibility();}
  function renderPurchaseItems(){const host=qs('#purchaseItems');if(!host)return;updatePurchaseSupplierSuggestion();host.innerHTML=`<datalist id="purchaseAccountOptions"><option value="Mercado Pago"><option value="Banco"><option value="Caja SALMOS"></datalist>${state.purchaseItems.map(purchaseItemRow).join('')}`;updatePurchaseTotal();}
  function syncPurchaseRowFromDom(row){const i=Number(row.dataset.purchaseRow),x=state.purchaseItems[i];if(!x)return;const oldQty=Number(x.quantity),oldPrice=Number(x.unitPricePesos);qsa('[data-purchase-field]',row).forEach(el=>{const k=el.dataset.purchaseField;x[k]=['quantity','capacityMl','widthCm','unitPricePesos'].includes(k)?Number(el.value)||0:el.value});if(Number(x.quantity)!==oldQty||Number(x.unitPricePesos)!==oldPrice)delete x.lineTotalCents;const title=qs('[data-purchase-item-title]',row);if(title)title.textContent=purchaseItemTitle(x,i);}
  function addPurchaseOption(bucket,value,subkey=''){
    value=normalizeOption(value);if(!value)return;
    if(subkey){state.purchaseOptions[bucket]??={};state.purchaseOptions[bucket][subkey]??=[];state.purchaseOptions[bucket][subkey]=uniqOptions([...state.purchaseOptions[bucket][subkey],value]);}
    else {state.purchaseOptions[bucket]??=[];state.purchaseOptions[bucket]=uniqOptions([...state.purchaseOptions[bucket],value]);}
  }
  function collectPurchaseCustomOptions(){
    for(const x of state.purchaseItems){
      const type=x.materialType;
      if(type&&type!=='__other__'&&!MATERIAL_TYPES.some(([v])=>v===type)&&!customTypeEntries().some(t=>t.code===type))state.purchaseOptions.types.push({code:type,label:materialTypeLabel(type)});
      if(x.fit&&!PURCHASE_BASIC_FITS.includes(x.fit))addPurchaseOption('fits',x.fit);
      if(x.materialClass&&!PURCHASE_CLASSES.includes(x.materialClass))addPurchaseOption('classes',x.materialClass);
      const klass=normalizePurchaseClass(x.materialClass);if(x.size&&!(PURCHASE_SIZES_BY_CLASS[klass]||[]).includes(x.size))addPurchaseOption('sizes',x.size,klass||'OTROS');
      if(x.color&&!PURCHASE_BASIC_COLORS.includes(x.color))addPurchaseOption('colors',x.color);
      for(const feature of itemFeatures(x))addPurchaseOption('materials',feature,type);
    }
    const seen=new Set();state.purchaseOptions.types=(state.purchaseOptions.types||[]).filter(x=>x?.code&&x?.label&&!seen.has(x.code)&&(seen.add(x.code),true));
  }
  async function openPurchaseDialog(purchase=null,context='purchases'){await Promise.all([ensureCostingData(true),loadMockupAssets()]);state.stockPurchaseDraft=null;state.purchaseContext=context;state.editingPurchaseId=purchase?Number(purchase.id):null;state.purchaseOriginalOccurredAt=purchase?.occurred_at||null;state.purchaseSupplierAutoValue='';const f=qs('#purchaseForm');f.reset();const title=qs('#purchaseDialogTitle');if(title)title.textContent=purchase?`Editar compra #${purchase.id}`:'Nueva compra';if(purchase){state.purchaseItems=(purchase.items||[]).map(i=>({materialType:i.material_type,name:i.material_name,features:itemFeatures(i),quantity:Number(i.quantity)||1,color:i.color||'',size:i.size||'',fit:i.fit||'',materialClass:i.material_class||'',gender:i.gender||'Unisex',capacityMl:Number(i.capacity_ml)||0,widthCm:Number(i.width_cm)||0,unitPricePesos:(Number(i.unit_price_cents)||0)/100,sheetAssetId:Number(i.sheet_asset_id)||null,lineTotalCents:Number(i.line_total_cents),imageAssetIds:materialPhotos(i.material_id).map(a=>Number(a.id)),imageAssetId:Number(materialPhotos(i.material_id)[0]?.id)||null,_imageTouched:false,_custom:{}}));f.elements.date.value=today(parseAdminDate(purchase.occurred_at)||new Date());f.elements.supplier.value=purchase.supplier||'';f.elements.reference.value=purchase.reference||'';f.elements.notes.value=purchase.notes||'';qs('#purchaseSurchargeType').value=purchase.surcharge_type||'fixed';qs('#purchaseSurcharge').value=purchase.surcharge_value??((Number(purchase.surcharge_cents)||0)/100);const pays=purchase.payments||[],cash=pays.filter(p=>p.method!=='transfer').reduce((s,p)=>s+Number(p.amount_cents??p.amountCents??0),0),tr=pays.filter(p=>p.method==='transfer').reduce((s,p)=>s+Number(p.amount_cents??p.amountCents??0),0);qs('#purchasePaymentMethod').value=cash&&tr?'mixed':tr?'transfer':'cash';qs('#purchaseCashAmount').value=cash/100||'';qs('#purchaseTransferAmount').value=tr/100||'';const tp=pays.find(p=>p.method==='transfer');qs('#purchaseTransferOrigin').value=tp?.origin||'';qs('#purchaseTransferDestination').value=tp?.destination||'';qs('#purchaseTransferReference').value=tp?.reference||'';qs('#purchaseTransferDetails').value=tp?.details||'';}else{state.purchaseItems=[purchaseDefaultItem(context==='production'&&qs('#productionDialog')?.open?(qs('#productionMaterialType')?.value||'shirt'):'shirt')];f.elements.date.value=today();qs('#purchasePaymentMethod').value='cash';qs('#purchaseSurcharge').value='';}renderPurchaseItems();qs('#purchaseDialog')?.showModal();}
  async function savePurchase(){
    const form=qs('#purchaseForm');qsa('[data-purchase-row]',form).forEach(syncPurchaseRowFromDom);const fd=new FormData(form);
    for(const x of state.purchaseItems){if(x.materialType==='__other__'){const label=normalizeOption(x.customTypeLabel);if(!label)throw new Error('Escribí el nombre del nuevo tipo.');const code=safeCustomTypeCode(label);x.materialType=code;if(!customTypeEntries().some(t=>t.code===code))state.purchaseOptions.types.push({code,label});}}
    const items=state.purchaseItems.map(x=>({materialType:x.materialType,name:itemFeatures(x).join(' · '),features:itemFeatures(x),quantity:Number(x.quantity)||0,color:String(x.color||'').trim(),size:String(x.size||'').trim(),fit:String(x.fit||'').trim(),materialClass:String(x.materialClass||'').trim(),gender:String(x.gender||'').trim(),capacityMl:Number(x.capacityMl)||0,widthCm:Number(x.widthCm)||0,unit:materialIsDtf(x.materialType)?'meter':'unit',unitPriceCents:pesosToCents(x.unitPricePesos),sheetAssetId:Number(x.sheetAssetId)||null,...(x.sheetAssetId&&Number.isSafeInteger(Number(x.lineTotalCents))?{lineTotalCents:Number(x.lineTotalCents)}:{}),...(x._imageTouched?{imageAssetIds:purchasePhotoIds(x),imageAssetId:Number(x.imageAssetId)||null}:{})}));if(!items.length)throw new Error('Agregá al menos un producto o material.');for(const [i,item] of items.entries()){if(!item.name)throw new Error(`Elegí el material del renglón ${i+1}.`);if(!Number.isFinite(item.quantity)||item.quantity<=0)throw new Error(`Revisá la cantidad del renglón ${i+1}.`);if(!Number.isSafeInteger(item.unitPriceCents)||item.unitPriceCents<=0)throw new Error(`Ingresá un precio mayor a cero en el renglón ${i+1}.`);}
    const subtotal=purchaseSubtotalCents(),charge=surchargeData('purchase',subtotal),surcharge=charge.surcharge,grand=charge.total;
    if(!charge.valid)throw new Error('Ingresá un recargo válido, mayor o igual a cero.');
    const {payments}=paymentSplit('purchase',grand);for(const payment of payments)if(payment.method==='cash')payment.destination=String(fd.get('supplier')||'').trim();
    const occurredAt=recordDateTime(String(fd.get('date')),state.purchaseOriginalOccurredAt);const purchaseUrl=state.editingPurchaseId?`/api/admin/purchases/${state.editingPurchaseId}`:'/api/admin/purchases';const saved=await api(purchaseUrl,{method:state.editingPurchaseId?'PUT':'POST',body:JSON.stringify({supplier:fd.get('supplier'),reference:fd.get('reference'),notes:fd.get('notes'),surchargeCents:surcharge,surchargeType:charge.type,surchargeValue:charge.value,payments,occurredAt,items})});if(saved.item?.id){state.editingPurchaseId=Number(saved.item.id);state.purchaseOriginalOccurredAt=saved.item.occurred_at||occurredAt;}if(state.stockPurchaseDraft){const pending=state.stockPurchaseDraft,delta=Number(state.purchaseItems[0]?.quantity);await api(`/api/admin/stock/${pending.variantId}/levels`,{method:'PATCH',body:JSON.stringify({purchaseId:state.editingPurchaseId,purchaseQuantity:delta,virtual:pending.virtual,expectedVirtual:pending.expectedVirtual})});delete state.stockLevelDrafts?.[pending.variantId];state.stockPurchaseDraft=null;}state.costingLoaded=false;collectPurchaseCustomOptions();try{await persistAdminOptionSettings()}catch{}const files=[...(form.elements.attachments?.files||[])];if(saved?.item?.financeMovementId&&files.length){const up=new FormData();files.forEach(file=>up.append('files',file));await api(`/api/admin/finance/${saved.item.financeMovementId}/attachments`,{method:'POST',body:up});}state.costingLoaded=false;state.mockupAssetsLoaded=false;return saved.item;
  }
  async function openProductionMaterialPurchase(){return openPurchaseDialog(null,'production');}
  async function refreshProductionAfterPurchase(purchase={}){
    const [materials]=await Promise.all([api('/api/admin/materials'),loadMockupAssets(true)]);state.materials=materials.items||[];syncProductionCustomTypes();const editor=state.materialEditor,edited=editor&&state.materials.find(m=>Number(m.id)===Number(editor.material.id));if(edited&&qs('#materialEditorDialog')?.open){editor.material=structuredClone(edited);const cost=qs('[data-material-field="unitCostPesos"]');if(cost)cost.value=centsToPesos(edited.average_cost_cents);const summary=qs('.material-editor-stock');if(summary)summary.textContent=`${Number(edited.stock_qty)} ${edited.unit==='meter'?'m':'u'} disponibles · ${money(edited.average_cost_cents)} por ${edited.unit==='meter'?'metro':'unidad'}`;}
    if(qs('#productionDialog')?.open){const purchased=(purchase.materialIds||[]).map(id=>state.materials.find(material=>Number(material.id)===Number(id))).find(material=>material?.material_type===qs('#productionMaterialType')?.value);if(purchased&&!state.productionMaterialsSelected.some(item=>Number(item.materialId)===Number(purchased.id)))state.productionMaterialsSelected.unshift({materialId:Number(purchased.id),quantity:1});renderProductionMaterialGallery();renderProductionSelectedMaterials();renderMockupStudioOptions();await refreshMockupPreview();}
    else if(state.view==='production')await renderProduction();
  }
  async function savePurchaseAndReturn(){
    const context=state.purchaseContext,saved=await savePurchase();
    if(context==='production')await refreshProductionAfterPurchase(saved);
    qs('#purchaseDialog')?.close();state.purchaseContext='purchases';toast('Compra guardada · Stock y Caja actualizados','success');
    if(context==='stock'){await renderStock();}else if(context!=='production'){if(state.view==='expenses')await renderExpenses();else await renderPurchases();}
    return saved;
  }
  function purchaseSheetPreviewHtml(item){
    const id=Number(item.sheet_asset_id);if(!id)return '';
    const name=escapeHtml(item.sheet_name||item.sheet_file_name||`Plancha #${id}`),mime=String(item.sheet_mime_type||'image/png');
    return `<button type="button" class="purchase-sheet-thumb checkerboard" data-purchase-sheet-preview="${id}" data-sheet-name="${name}" data-sheet-mime="${escapeHtml(mime)}" title="Ver ${name}">${mime.startsWith('image/')?`<img src="${apiUrl(`/api/admin/design-assets/${id}/file`)}" loading="lazy" alt="${name}">`:'Ver plancha'}</button>`;
  }
  function openPurchaseSheetPreview(id,name,mime='image/png'){
    const url=apiUrl(`/api/admin/design-assets/${Number(id)}/file`);
    qs('#purchaseSheetPreviewTitle').textContent=name||`Plancha #${id}`;
    qs('#purchaseSheetPreviewStage').innerHTML=mime.startsWith('image/')?`<img src="${url}" alt="${escapeHtml(name||'Plancha')}">`:`<iframe src="${url}" title="Plancha"></iframe>`;
    qs('#purchaseSheetPreviewDialog').showModal();
  }
  function updatePurchaseSupplierSuggestion(){
    const field=qs('#purchaseForm [name="supplier"]');if(!field||state.editingPurchaseId)return;
    if(field.value&&field.value!==state.purchaseSupplierAutoValue)return;
    const allDtf=state.purchaseItems.length&&state.purchaseItems.every(x=>materialIsDtf(x.materialType));
    const allGarments=state.purchaseItems.length&&state.purchaseItems.every(x=>materialIsGarment(x.materialType));
    const value=allDtf?'Adrian':allGarments?'Soari':'';
    field.value=value;state.purchaseSupplierAutoValue=value;
  }
  async function openPurchaseReview(id){
    const purchase=state.purchases.find(p=>Number(p.id)===Number(id));if(!purchase)throw new Error('Compra no encontrada.');await Promise.all([loadMockupAssets(),ensureCostingData()]);
    const photos=[];for(const item of purchase.items||[]){if(item.sheet_asset_id){const asset=state.designAssets.find(a=>Number(a.id)===Number(item.sheet_asset_id));photos.push({url:apiUrl(`/api/admin/design-assets/${Number(item.sheet_asset_id)}/file`),name:asset?.name||item.material_name});}for(const photo of materialPhotos(item.material_id))photos.push({url:mockupAssetUrl(photo),name:item.material_name});}
    for(const attachment of purchase.attachments||[])photos.push({url:apiUrl(attachment.url),name:"Comprobante"});const unique=[...new Map(photos.map(p=>[p.url,p])).values()];state.purchaseReview={id:purchase.id,photos:unique,index:0};const dialog=ensureAdminDialog('purchaseReviewDialog',`Compra #${purchase.id}`);
    qs('.dialog-body',dialog).innerHTML=`<div class="purchase-review-layout"><div class="review-image-carousel"><img data-purchase-review-image alt="Imagen de la compra"><span data-purchase-review-empty ${unique.length?'class="hidden"':''}>Sin foto cargada</span><button type="button" class="icon-btn" data-purchase-review-arrow="-1" aria-label="Imagen anterior">‹</button><button type="button" class="icon-btn" data-purchase-review-arrow="1" aria-label="Imagen siguiente">›</button></div><div class="purchase-review-info"><header><strong>${escapeHtml(purchase.supplier||'Sin proveedor')}</strong><button type="button" class="icon-btn" data-edit-reviewed-purchase="${purchase.id}" aria-label="Editar compra"><i class="fa-solid fa-pen" aria-hidden="true"></i></button></header><div>${adminDateTimeHtml(purchase.occurred_at)}</div>${(purchase.items||[]).map(i=>`<section class="purchase-review-item"><div class="purchase-review-item-detail">${colorDetail(i.color)}<strong>${escapeHtml([i.size,i.fit,i.material_name,i.material_class,i.gender,Number(i.capacity_ml)>0?i.capacity_ml+' ml':''].filter(Boolean).join(' · '))}</strong></div><div class="purchase-review-item-quantity"><b>${Number(i.quantity).toLocaleString('es-AR')}</b><small>${i.unit==='meter'?'metros':'unidades'}</small></div><div class="purchase-review-item-price"><b>${money(i.line_total_cents)}</b><small>${money(i.unit_price_cents)} / ${i.unit==='meter'?'m':'u'}</small></div></section>`).join('')}<div>Subtotal ${money(purchase.subtotal_cents??Number(purchase.total_cents)-Number(purchase.surcharge_cents||0))}</div>${Number(purchase.surcharge_cents)>0?`<div>Recargo ${money(purchase.surcharge_cents)}</div>`:''}<h3>Total ${money(purchase.total_cents)}</h3>${(purchase.payments||[]).map(payment=>`<section><strong>${payment.method==='transfer'?'Transferencia':'Efectivo'} ${money(payment.amount_cents)}</strong><div>${escapeHtml([payment.origin,payment.destination,payment.reference,payment.details].filter(Boolean).join(' · '))}</div></section>`).join('')}${purchase.reference?`<p>${escapeHtml(purchase.reference)}</p>`:''}${purchase.notes?`<p>${escapeHtml(purchase.notes)}</p>`:''}</div></div>`;renderPurchaseReviewPhoto();dialog.showModal();
  }
  function renderPurchaseReviewPhoto(){const view=state.purchaseReview,dialog=qs('#purchaseReviewDialog');if(!view||!dialog)return;const image=qs('[data-purchase-review-image]',dialog),photo=view.photos[view.index];image.classList.toggle('hidden',!photo);if(photo){image.src=photo.url;image.alt=photo.name||'Foto de la compra';}qsa('[data-purchase-review-arrow]',dialog).forEach(b=>b.classList.toggle('hidden',view.photos.length<2));}
  async function renderPurchases(){
    const r=reportRangeDates(state.purchaseReportRange),query=state.purchaseReportRange==='total'?'':`?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`,[d,m]=await Promise.all([api(`/api/admin/purchases${query}`),api('/api/admin/materials')]);state.purchases=d.items||[];state.materials=m.items||[];
    const suppliers=[...new Set(state.purchases.map(x=>x.supplier||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const items=state.purchases.filter(x=>!state.purchaseSupplier||x.supplier===state.purchaseSupplier),total=items.reduce((sum,x)=>sum+(Number(x.total_cents)||0),0);
    qs('#adminContent').innerHTML=`<div class="admin-section-head"><h2>Compras</h2><button class="btn btn-primary" id="newPurchaseBtn">+ Nueva compra</button></div><div class="purchase-filter-bar"><details class="purchase-date-popover"><summary class="btn btn-ghost">Fechas</summary><div>${reportFiltersHtml(state.purchaseReportRange).replace('>Fechas</button>','>Personalizadas</button>')}</div></details><label class="field">Proveedor<select class="select" id="purchaseSupplierFilter"><option value="">Todos</option>${suppliers.map(name=>`<option ${state.purchaseSupplier===name?'selected':''} value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}</select></label><strong>${items.length} compras · ${money(total)}</strong></div><section class="purchase-compact-list">${items.map(x=>`<button class="purchase-compact-row" type="button" data-view-purchase="${x.id}"><span class="purchase-row-heading"><strong>Compra #${x.id}</strong><small>${adminDateTimeHtml(x.occurred_at)}</small></span><span class="purchase-row-supplier">${escapeHtml(x.supplier||'Sin proveedor')}</span><span class="purchase-row-items">${(x.items||[]).map(i=>`${escapeHtml([i.material_name,i.fit,i.size,i.material_class,i.gender,i.color,Number(i.capacity_ml)>0?i.capacity_ml+' ml':''].filter(Boolean).join(' · '))} × ${Number(i.quantity).toLocaleString('es-AR',{maximumFractionDigits:2})}${i.unit==='meter'?' m':''}`).join('<br>')}</span><span class="purchase-row-payment">${(x.payments||[]).map(p=>`${p.method==='transfer'?'Transferencia':'Efectivo'} ${money(p.amount_cents)}`).join('<br>')}</span><strong class="purchase-row-total">${money(x.total_cents)}</strong><i class="fa-solid fa-eye" aria-hidden="true"></i></button>`).join('')||'<p class="muted">Sin compras en este filtro.</p>'}</section>`;
  }

  function syncProductionCustomTypes(){const select=qs('#productionMaterialType');if(!select)return;for(const type of [...new Set([...state.materials.map(m=>m.material_type),...state.mockupAssets.map(a=>a.product_type)])]){if(!/^custom_[a-z0-9_]{1,56}$/.test(type)||qs(`option[value="${type}"]`,select))continue;select.insertAdjacentHTML('beforeend',`<option value="${type}">${escapeHtml(materialTypeLabel(type))}</option>`);}}
  function productionPrimaryMaterial(){const type=qs('#productionMaterialType')?.value||'shirt';return state.productionMaterialsSelected.map(x=>({...x,material:state.materials.find(m=>Number(m.id)===Number(x.materialId))})).find(x=>x.material?.material_type===type)?.material||null;}
  function productionCategoryGuess(type){const names={shirt:['remera','remeras'],chomba:['chomba','chombas'],hoodie:['buzo','buzos'],cap:['gorra','gorras'],mug:['taza','tazas'],glass:['vaso','vasos'],thermos:['termo','termos'],tumbler:['vaso','vasos','termo','termos'],bag:['bolso','bolsos']};const words=names[type]||[];return state.categories.find(c=>words.some(w=>String(c.name||'').toLowerCase().includes(w)))||null;}
  async function ensureProductionCategory(type){
    let cat=state.productionEditingProduct?state.categories.find(c=>Number(c.id)===Number(state.productionEditingProduct.category_id)):productionCategoryGuess(type);if(cat)return cat;
    const name=PRODUCTION_CATEGORY_LABEL[type]||'Otros';
    try{const d=await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name,active:true,sort_order:100})});cat=d.item||d;await ensureCategories(true);return productionCategoryGuess(type)||cat;}catch{await ensureCategories(true);return productionCategoryGuess(type)||state.categories.find(c=>c.active)||state.categories[0]||null;}
  }
  function productionMaterialLabel(m){return uniqOptions([materialTypeLabel(m.material_type),...itemFeatures(m),m.fit,m.size,m.material_class,m.gender,m.color,Number(m.capacity_ml)>0?`${Number(m.capacity_ml)} ml`:''].filter(Boolean)).join(' · ');}
  function productionMaterialCard(m){const selected=state.productionMaterialsSelected.some(x=>Number(x.materialId)===Number(m.id)),stock=Number(m.stock_qty)||0,preview=materialPhotos(m.id)[0];return `<article class="production-picker-card ${selected?'selected':''} ${stock<=0?'out-of-stock':''}"><button type="button" class="production-material-select" data-add-production-material="${m.id}" ${sortablePhotoAttrs(m.id,'catalog-materials')} aria-label="Elegir ${escapeHtml(productionMaterialLabel(m))}">${sortablePhotoHandle()}${preview?`<img class="production-material-thumb" src="${escapeHtml(mockupAssetUrl(preview))}" alt="Vista de ${escapeHtml(m.name)}" loading="lazy">`:''}<strong>${escapeHtml(materialTypeLabel(m.material_type))}</strong><div class="material-feature-chips">${materialFeatureChips(itemFeatures(m))}</div><span>${escapeHtml([m.fit,m.size,m.material_class,m.gender,Number(m.capacity_ml)>0?`${Number(m.capacity_ml)} ml`:''].filter(Boolean).join(' · '))}</span>${m.color?colorDetail(m.color):''}<small>${stock>0?`Disponible: ${stock.toLocaleString('es-AR',{maximumFractionDigits:3})} ${m.unit==='meter'?'m':'u'}`:'Sin stock físico · disponible para A stockear'}</small><b>${money(m.average_cost_cents)} / ${m.unit==='meter'?'m':'u'}</b></button><button class="btn btn-ghost" type="button" data-edit-production-material="${m.id}">Editar materia prima / fotos</button></article>`;}
  function renderProductionMaterialGallery(){const host=qs('#productionMaterialGallery');if(!host)return;const type=qs('#productionMaterialType')?.value||'shirt',kind=qs('#productionStockKind')?.value||'physical';const mats=galleryOrder('materials',state.materials).filter(m=>m.material_type===type&&(kind==='to_stock'||Number(m.stock_qty)>0||state.productionMaterialsSelected.some(x=>Number(x.materialId)===Number(m.id))));host.innerHTML=mats.length?mats.map(productionMaterialCard).join(''):`<div class="notice">No hay ${escapeHtml(materialTypeLabel(type).toLowerCase())} cargadas. Ingresalas desde Compras.</div>`;}
  function renderProductionSelectedMaterials(){const host=qs('#productionSelectedMaterials');if(!host)return;host.innerHTML=state.productionMaterialsSelected.length?`<div class="production-selected-title">Materia prima elegida</div>${state.productionMaterialsSelected.map((x,i)=>{const m=state.materials.find(a=>Number(a.id)===Number(x.materialId));if(!m)return'';return `<div class="production-selected-row"><div><strong>${escapeHtml(productionMaterialLabel(m))}</strong><small>${money(m.average_cost_cents)} por ${m.unit==='meter'?'metro':'unidad'}</small><button class="link-action" type="button" data-edit-production-material="${m.id}">Editar materia prima / fotos</button></div><div class="purchase-stepper compact-stepper"><button type="button" data-prod-material-step="-1" data-index="${i}">−</button><input class="input" value="${Number(x.quantity)||1}" readonly><button type="button" data-prod-material-step="1" data-index="${i}">+</button></div><button class="icon-btn" type="button" data-remove-production-material="${i}">×</button></div>`}).join('')}`:'';syncProductionPublicationDefaults();calcProductionBuilderCost();}
  function productionDesignCard(d){const selected=state.productionDesignsSelected.some(x=>Number(x.designAssetId)===Number(d.id)),url=designThumbnailUrl(d),name=escapeHtml(d.name||d.file_name);return `<button type="button" class="production-design-card ${selected?'selected':''}" data-add-production-design="${d.id}" ${sortablePhotoAttrs(d.id,'catalog-designs')} ${designVisualAttrs(d)} title="${name}" aria-label="Elegir ${name}">${sortablePhotoHandle()}${String(d.mime_type||'').startsWith('image/')?`<img crossorigin="use-credentials" src="${url}" alt="${name}" loading="lazy">`:`<span class="design-file-placeholder">${escapeHtml((d.file_name||'ARCHIVO').split('.').pop().toUpperCase())}</span>`}</button>`;}
  function renderProductionDesignGallery(){const host=qs('#productionDesignGallery');if(!host)return;const designs=galleryOrder('designs',state.designAssets).filter(d=>d.kind==='individual');const filters=qs('#productionDesignFilters');if(filters){const open=Boolean(qs('details',filters)?.open);filters.innerHTML=designTagFilterHtml('production',designs);if(qs('details',filters))qs('details',filters).open=open;}host.innerHTML=designs.length?designs.filter(d=>designVisible('production',d)).map(productionDesignCard).join(''):'<div class="notice">No hay diseños individuales cargados.</div>';}
  async function loadMockupAssets(force=false){if(state.mockupAssetsLoaded&&!force)return;const data=await api('/api/admin/mockup-assets');state.mockupAssets=data.items||[];state.mockupAssetsLoaded=true;}
  function mockupBaseAssets(){return [...state.mockupAssets.filter(a=>a.asset_type==='base'),...(state.productionSavedPhotoBases||[])];}
  function mockupBaseAsset(id=qs('#mockupBaseSelect')?.value){return mockupBaseAssets().find(a=>Number(a.id)===Number(id));}
  function mockupViewKey(id=qs('#mockupBaseSelect')?.value){const base=mockupBaseAsset(id);return base?.source_media_id?`saved:${base.source_media_id}`:`base:${Number(id)||0}`;}
  function rememberMockupView(id=qs('#mockupBaseSelect')?.value){if(!Number(id))return null;const key=mockupViewKey(id);state.productionMountViews??={};return state.productionMountViews[key]??={baseId:Number(id),backgroundId:Number(qs('#mockupBackgroundSelect')?.value)||0,included:true};}
  function snapshotActiveMockupView(){
    const id=Number(qs('#mockupBaseSelect')?.value);if(!id)return null;
    const view=rememberMockupView(id),canvas=qs('#productionMockupCanvas');view.backgroundId=Number(qs('#mockupBackgroundSelect')?.value)||0;
    view.layers=mockupLayers().map(layer=>{layer.item.layerId??=crypto.randomUUID();layer.item.designColor=layer.asset?.preview_color||'';mockupPlacement(layer,canvas);return structuredClone(layer.item)});
    return view;
  }
  function restoreMockupViewLayers(view){
    state.mockupVisibleLayerIds=new Set();if(!Array.isArray(view?.layers)){if(view)view.layers=[];return;}
    const ids=new Set();for(const saved of view.layers){
      const layer=structuredClone(saved);layer.layerId??=crypto.randomUUID();ids.add(layer.layerId);
      const index=state.productionDesignsSelected.findIndex(x=>x.layerId===layer.layerId);
      if(index<0)state.productionDesignsSelected.push(layer);
      else{const prior=state.productionDesignsSelected[index];state.productionDesignsSelected[index]={...prior,...layer,mockupPlacements:{...prior.mockupPlacements,...layer.mockupPlacements}};}
    }
    state.mockupVisibleLayerIds=ids;
  }
  function renderMockupProductViews(){
    const host=qs('#mockupProductViews');if(!host)return;
    const current=mockupViewKey();
    const items=state.mediaItems.filter(item=>item.mediaType!=='video').flatMap(item=>{
      const key=item.viewKey||Object.keys(state.productionMountViews||{}).find(key=>Number(state.productionMountViews[key].outputMediaId)===Number(item.id));
      if(!key||!state.productionMountViews[key]?.included)return [];item.viewKey=key;return [{item,key}];
    });
    host.innerHTML=items.map(({item,key},i)=>`<div class="mockup-product-view ${key===current?'active':''}"><button type="button" data-edit-product-view="${escapeHtml(key)}" data-sort-photo="${escapeHtml(item.key)}" data-photo-owner="product" draggable="true" title="Editar vista ${i+1}" aria-label="Editar vista ${i+1}" aria-pressed="${key===current}"><span class="photo-sort-handle" data-photo-sort-handle title="Arrastrar para ordenar">↕</span><img draggable="false" src="${escapeHtml(item.url)}" alt="Vista ${i+1}" loading="lazy"></button><button type="button" data-remove-media="${escapeHtml(item.key)}" title="Quitar vista ${i+1}" aria-label="Quitar vista ${i+1}">×</button></div>`).join('');
  }
  async function editMockupProductView(key,button){
    if(state.mockupViewBusy)return;
    const target=state.productionMountViews?.[key];if(!target||!mockupBaseAsset(target.baseId))return;
    if(key===mockupViewKey())return;state.mockupViewBusy=true;button.disabled=true;syncMockupActions();
    try{
      const current=snapshotActiveMockupView();if(current&&!current.removed){current.included=true;await captureMockupView(current.baseId);}
      state.mockupViewBusy=false;selectMockupVariant(target.baseId);renderMockupProductViews();
    }catch(err){toast(err.message,'error')}finally{state.mockupViewBusy=false;button.disabled=false;syncMockupActions();}
  }
  function collectProductionMount(){
    snapshotActiveMockupView();return {version:1,saveToken:state.productionMountSaveToken,materialType:qs('#productionMaterialType').value,activeBaseId:Number(qs('#mockupBaseSelect').value)||0,backgroundId:Number(qs('#mockupBackgroundSelect')?.value)||0,views:structuredClone(state.productionMountViews||{}),layers:state.productionDesignsSelected.map(item=>{item.layerId??=crypto.randomUUID();return structuredClone(item)}),legacySources:(state.productionSavedPhotoBases||[]).map(base=>({mediaId:Number(base.source_media_id),pose:base.pose,name:base.name})),capMaterialId:Number(qs('#mockupCapMaterialSelect')?.value)||0,capSalePrice:qs('#mockupCapSalePrice')?.value||''};
  }
  function mockupViewFingerprint(baseId){const base=mockupBaseAsset(baseId),key=mockupViewKey(baseId),view=state.productionMountViews?.[key],side=base?.pose==='back'?'back':'front',canvas=qs('#productionMockupCanvas');return JSON.stringify([baseId,base?.image_version,view?.backgroundId||0,1,mockupLayers(side,key).map(layer=>[layer.item.designAssetId,layer.item.widthCm,layer.item.heightCm,layer.asset?.preview_color||'',layer.item.surface||{},view?.calibration||null,{...mockupPlacement(layer,canvas,key)}])]);}
  async function captureMockupView(baseId){
    if(Number(baseId)===Number(qs('#mockupBaseSelect')?.value))snapshotActiveMockupView();
    const key=mockupViewKey(baseId),view=state.productionMountViews?.[key];if(!view||!view.included||!mockupBaseAsset(baseId))return;
    const fingerprint=mockupViewFingerprint(baseId),prior=state.mediaItems.find(item=>item.viewKey===key||view.outputMediaId&&Number(item.id)===Number(view.outputMediaId));if(prior&&view.fingerprint===fingerprint&&view.foregroundReady)return prior;
    const {blob,filename}=await renderMockupExport(true,{baseId,backgroundId:view.backgroundId}),file=new File([blob],filename,{type:'image/png'}),item={key:prior?.key||`montage-${crypto.randomUUID()}`,existing:false,file,url:URL.createObjectURL(file),name:filename,mediaType:'image',viewKey:key};
    const foreground=await renderMockupExport(true,{baseId,backgroundId:0});item.foregroundFile=new File([foreground.blob],filename,{type:'image/png'});
    if(prior){if(prior.id){state.productionRemovedMediaIds??=[];if(!state.productionRemovedMediaIds.includes(Number(prior.id)))state.productionRemovedMediaIds.push(Number(prior.id));}else if(prior.url?.startsWith('blob:'))URL.revokeObjectURL(prior.url);state.mediaItems.splice(state.mediaItems.indexOf(prior),1,item);}else state.mediaItems.push(item);
    view.foregroundReady=true;view.fingerprint=fingerprint;view.outputMediaId=null;renderMediaManager('productionMediaOrderList');return item;
  }
  async function openProductionMount(productId,jobId=0){
    await openProductionDialog(false);const [productData,jobData]=await Promise.all([api(`/api/admin/products/${Number(productId)}`),jobId?api(`/api/admin/production/${Number(jobId)}`):Promise.resolve(null)]),product=productData.item,job=jobData?.item;if(!product)throw new Error('Producto no encontrado.');
    state.productionEditingProduct=product;state.productionEditingJob=job||null;state.productionMountRevision=Number(product.mount?.revision)||0;state.productionRemovedMediaIds=[];state.productionPriceDirty=true;state.productionShippingDirty=true;
    const project=product.mount?.project,recipe=product.recipe||{},sourceRows=product.mount?.sources||[];
    state.productionMaterialsSelected=(recipe.materials||[]).map(m=>({materialId:Number(m.material_id),quantity:Number(m.quantity)||1}));
    if(recipe.base_material_name&&!state.productionMaterialsSelected.length){const found=state.materials.find(m=>m.material_type===recipe.base_material_type&&m.name===recipe.base_material_name);if(found)state.productionMaterialsSelected.push({materialId:Number(found.id),quantity:1});}
    state.productionDesignsSelected=project?.layers?.length?structuredClone(project.layers):(recipe.designs||[]).map(d=>({layerId:crypto.randomUUID(),designAssetId:Number(d.design_asset_id),quantity:Number(d.quantity)||1,widthCm:Number(d.width_cm)||0,heightCm:Number(d.height_cm)||0,measureOptionId:d.measure_option_id||'',measureLabel:d.measure_label||'',printSide:d.print_side||'front',unitPrintCostCents:d.unit_print_cost_cents??null}));
    state.productionMountViews=structuredClone(project?.views||{});
    state.mediaItems=(product.images||[]).map(image=>({key:`existing-${image.id}`,id:Number(image.id),existing:true,url:image.url,name:image.alt_text||product.name,mediaType:image.media_type||'image',viewKey:Object.keys(state.productionMountViews).find(key=>Number(state.productionMountViews[key].outputMediaId)===Number(image.id))||''}));state.mediaHostId='productionMediaOrderList';
    const primary=state.materials.find(m=>Number(m.id)===Number(state.productionMaterialsSelected[0]?.materialId)),type=project?.materialType||primary?.material_type||recipe.base_material_type||'shirt';qs('#productionMaterialType').value=type;
    const legacy=project?.legacySources||(product.images||[]).filter(image=>image.media_type!=='video').map((image,index)=>({mediaId:Number(image.id),name:image.alt_text||product.name,pose:/dorso|espalda|back/i.test(image.r2_key||image.url||'')?'back':index===0?'front':'front'}));
    state.productionSavedPhotoBases=legacy.map(source=>{const saved=sourceRows.find(row=>Number(row.source_media_id)===Number(source.mediaId)),image=(product.images||[]).find(row=>Number(row.id)===Number(source.mediaId));if(!saved&&!image)return null;return {id:-Number(source.mediaId),source_media_id:Number(source.mediaId),source_url:saved?apiUrl(saved.url):image.url,asset_type:'base',product_type:type,gender:'Producto',model_name:'Fotos guardadas',name:source.name||product.name,color:primary?.color||'',garment_style:primary?.fit||'',pose:source.pose||'front',cap_style:'none'};}).filter(Boolean);
    if(!project){for(const base of state.productionSavedPhotoBases){const key=mockupViewKey(base.id);state.productionMountViews[key]={baseId:base.id,backgroundId:0,included:true,outputMediaId:base.source_media_id};for(const layer of state.productionDesignsSelected)layer.bakedViewKeys=[...(layer.bakedViewKeys||[]),key];}}
    const mainVariant=product.variants?.find(v=>v.active);qs('#productionQuantity').value=String(job?.quantity??(mainVariant?.stock_kind==='to_stock'?mainVariant.prepare_qty:mainVariant?.stock)??1);state.productionOriginalQuantity=Number(qs('#productionQuantity').value)||1;qs('#productionWaste').value=String(recipe.waste_percent??10);qs('#productionSalePrice').value=centsToPesos(product.price_cents);qs('#productionNotes').value=job?.notes||'';qs('#productionProductName').value=product.name;qs('#productionCategory').value=String(product.category_id);qs('#productionStockKind').value=job?'physical':product.variants?.find(v=>v.active)?.stock_kind||'to_stock';qs('#productionStatus').value=product.status||'draft';
    for(const [id,key] of [['productionDescription','short_description'],['productionMeaning','meaning_text'],['productionVerse','verse_text'],['productionVerseReference','verse_reference'],['productionCapacity','capacity_ml'],['productionWeight','weight_grams'],['productionHeight','height_cm'],['productionWidth','width_cm'],['productionDepth','depth_cm']])qs('#'+id).value=String(product[key]??'');for(const [id,key] of [['productionIsNew','is_new'],['productionFeatured','is_featured'],['productionBestseller','is_bestseller']])qs('#'+id).checked=Boolean(Number(product[key]));
    state.mockupVariantFilters={};state.productionLimitMaterialPhotos=true;state.mockupPreferredBaseId=String(project?.activeBaseId||state.productionSavedPhotoBases[0]?.id||materialPhotos(primary?.id)[0]?.id||'');state.mockupPreferredBackgroundId=String(project?.backgroundId||'');qs('#mockupCapSalePrice').value=project?.capSalePrice||'';qs('#mockupCapMaterialSelect').value=String(project?.capMaterialId||'');
    renderProductionMaterialGallery();renderProductionSelectedMaterials();renderProductionDesignGallery();renderProductionSelectedDesigns();renderMockupStudioOptions();restoreMockupViewLayers(state.productionMountViews[mockupViewKey()]);renderProductionSelectedDesigns();renderMediaManager('productionMediaOrderList');
    if(!project){for(const view of Object.values(state.productionMountViews))view.fingerprint=mockupViewFingerprint(view.baseId);}
    renderProductionVariantStock();qs('#productionDialogTitle').textContent='Editar producto';qs('#saveProductionBtn').textContent='Guardar cambios';qs('#productionStockNote').textContent='Estás editando este producto. Las fotos y las posiciones se guardan junto con el montaje.';
    setProductionTab(1);qs('#productionDialog').showModal();applyMockupZoom();await refreshMockupPreview();
  }
  function renderProductionVariantStock(){
    let host=qs('#productionVariantStock');if(!host){host=document.createElement('div');host.id='productionVariantStock';qs('#productionStockNote').after(host);}const variants=(state.productionEditingProduct?.variants||[]).filter(v=>v.active!==0),multiple=!state.productionEditingJob&&variants.length>1;host.innerHTML=multiple?`<div class="production-variant-stock"><strong>Cantidades por variante</strong>${variants.map(v=>`<label class="production-variant-stock-row"><span>${escapeHtml([v.color,v.size,v.sku].filter(Boolean).join(' · ')||'Única')} · ${v.stock_kind==='to_stock'?'A stockear':'Stock físico'}</span><input class="input" type="number" min="0" step="1" data-production-variant-stock="${v.id}" value="${v.stock_kind==='to_stock'?Number(v.prepare_qty)||0:Number(v.stock)||0}" aria-label="Cantidad ${escapeHtml([v.color,v.size].join(' '))}"></label>`).join('')}</div>`:'';qs('#productionQuantity').closest('.field').classList.toggle('hidden',multiple);qs('#productionStockKind').disabled=Boolean(state.productionEditingProduct);qs('#productionQuantity').min=state.productionEditingProduct&&!state.productionEditingJob?'0':'1';
  }
  function productionVariantUpdates(){if(!state.productionEditingProduct||state.productionEditingJob)return undefined;const variants=(state.productionEditingProduct.variants||[]).filter(v=>v.active!==0),multiple=variants.length>1;return variants.map(v=>{const stockKind=v.stock_kind||'physical',expected=stockKind==='to_stock'?Number(v.prepare_qty)||0:Number(v.stock)||0,value=Number(multiple?qs(`[data-production-variant-stock="${v.id}"]`)?.value:qs('#productionQuantity').value);if(!Number.isSafeInteger(value)||value<0)throw new Error('Revisá las cantidades de las variantes.');return{id:Number(v.id),stockKind,quantity:value,expectedQuantity:expected};}).filter(v=>v.quantity!==v.expectedQuantity);}
  async function persistProductionBuilderMedia(productId){
    for(const item of state.mediaItems){if(item.file&&!item.id){const form=new FormData();form.append('file',item.file);const uploaded=await api(`/api/admin/products/${productId}/media`,{method:'POST',body:form});item.id=Number(uploaded.id);item.url=uploaded.url||item.url;}if(item.foregroundFile&&!item.foregroundSaved){const form=new FormData();form.append('file',item.foregroundFile);await api(`/api/admin/products/${productId}/media/${item.id}/foreground`,{method:'POST',body:form});item.foregroundSaved=true;}if(item.viewKey&&state.productionMountViews?.[item.viewKey])state.productionMountViews[item.viewKey].outputMediaId=Number(item.id)||null;}
    return state.mediaItems.map(item=>Number(item.id)).filter(Boolean);
  }

  function mockupAssetUrl(asset){return asset.source_url||apiUrl(`/api/admin/mockup-assets/${Number(asset.id)}/file`)+(asset.image_version?'?v='+encodeURIComponent(asset.image_version):'')}
  function setupProductionStudioLayout(){
    const studio=qs('#productionMockupStudio');if(!studio||studio.dataset.compactLayout)return;studio.dataset.compactLayout='true';
    const sidebar=qs('.production-mockup-sidebar',studio),column=qs('.production-mockup-preview-column',studio),preview=qs('.production-mockup-preview',column),workspace=qs('.production-mockup-workspace',studio),gallery=qs('#mockupVariantGallery');
    const section=document.createElement('section');section.id='productionVariantSection';section.className='production-picker-section';section.innerHTML='<div class="production-picker-head"><h3>Modelos y productos</h3><div class="production-picker-actions"><button type="button" class="btn btn-ghost" id="showAllMockupVariants">Ver todas</button><button type="button" class="btn btn-primary" id="productionUploadMockupBtn">+ Fotos de montaje</button></div></div><div class="horizontal-gallery-shell"><button type="button" class="gallery-arrow gallery-arrow-left" data-scroll-target="mockupVariantGallery" data-scroll-dir="-1" aria-label="Variantes anteriores">‹</button><button type="button" class="gallery-arrow gallery-arrow-right" data-scroll-target="mockupVariantGallery" data-scroll-dir="1" aria-label="Variantes siguientes">›</button></div>';
    const old=gallery.closest('.field'),shell=qs('.horizontal-gallery-shell',section);shell.insertBefore(gallery,qs('.gallery-arrow-right',shell));old?.remove();studio.insertBefore(section,workspace);
    const designSection=qs('#productionDesignGallery')?.closest('.production-picker-section');if(designSection){designSection.id='productionDesignSection';const head=qs('.production-picker-head',designSection),filter=qs('#productionDesignFilters');if(filter)head.append(filter);qs('.muted',head)?.remove();studio.insertBefore(designSection,workspace);}
    const zoom=qs('.mockup-zoom-controls',column),hint=qs('.mockup-touch-hint',column),frame=document.createElement('div');frame.className='production-preview-frame';column.insertBefore(frame,preview);const rail=document.createElement('aside');rail.className='mockup-saved-views-rail';rail.setAttribute('aria-label','Vistas del producto');rail.innerHTML='<h4>Vistas</h4>';rail.append(qs('#mockupProductViews'));frame.append(rail,preview);if(zoom)frame.after(zoom);if(hint)hint.remove();
    const previewActions=qs('.production-mockup-actions',sidebar);if(previewActions){column.append(previewActions);qs('#mockupAssetHint',previewActions)?.remove();previewActions.insertAdjacentHTML('beforeend','<button type="button" class="btn btn-ghost" data-production-purchase>Compra y pago</button>');}
    const controls=qs('.production-mockup-controls',sidebar),editor=qs('#mockupLayerEditor');column.append(editor);editor.classList.remove('mockup-tools-below');editor.classList.add('mockup-tools-near');controls.classList.add('mockup-background-controls');
    const selected=qs('#productionSelectedDesigns');workspace.after(selected);qs('.production-mockup-head',studio)?.remove();
  }
  function mockupCurrentSide(){const base=mockupBaseAsset();return (base?.pose||state.mockupVariantFilters?.side)==='back'?'back':'front';}
  function renderMockupStudioOptions(){
    const baseSelect=qs('#mockupBaseSelect'),backgroundSelect=qs('#mockupBackgroundSelect');if(!baseSelect)return;
    const assets=orderedProductPhotos(mockupBaseAssets()),filters=state.mockupVariantFilters??={},oldBase=String(state.mockupPreferredBaseId??baseSelect.value),oldBackground=String(state.mockupPreferredBackgroundId??backgroundSelect.value);delete state.mockupPreferredBaseId;delete state.mockupPreferredBackgroundId;
    const primary=productionPrimaryMaterial(),linked=primary?photosForItem(primary,materialPhotos(primary.id).map(a=>Number(a.id))):[],allowed=new Set([...linked.map(a=>Number(a.id)),...(state.productionSavedPhotoBases||[]).map(a=>Number(a.id))]);
    const available=assets.filter(a=>(!state.productionLimitMaterialPhotos||!primary||allowed.has(Number(a.id))));
    const description=a=>[a.model_name||a.name,a.garment_style,a.color,a.pose==='back'?'Espalda / lado B':'Frente / lado A',a.variant_label].filter(Boolean).join(' · ');
    baseSelect.innerHTML='<option value="">Elegir una variante de la galería</option>'+assets.map(a=>`<option value="${a.id}">${escapeHtml(description(a))}</option>`).join('');baseSelect.value=assets.some(a=>String(a.id)===oldBase)?oldBase:'';
    const gallery=qs('#mockupVariantGallery');if(gallery){const scroll=gallery.scrollLeft;gallery.innerHTML=available.length?available.map(a=>`<button type="button" class="mockup-variant-card ${Number(a.id)===Number(baseSelect.value)?'selected':''}" data-select-mockup-variant="${a.id}" ${sortablePhotoAttrs(a.id,'catalog-photos')} title="Elegir ${escapeHtml(description(a))}">${sortablePhotoHandle()}<img draggable="false" src="${mockupAssetUrl(a)}" alt="${escapeHtml(description(a))}" loading="lazy"></button>`).join(''):'<p class="muted">No hay variantes con estos filtros. Tocá «Ver todas» para ver las disponibles.</p>';gallery.scrollLeft=scroll;}
    const count=qs('#mockupVariantCount');if(count)count.textContent=`${available.length} de ${assets.length} variantes · Filtros junto a la vista previa.`;
    const backgrounds=state.mockupAssets.filter(a=>a.asset_type==='background');backgroundSelect.innerHTML='<option value="">Sin fondo agregado</option>'+backgrounds.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');backgroundSelect.value=backgrounds.some(a=>String(a.id)===oldBackground)?oldBackground:'';
    const backgroundGallery=qs('#mockupBackgroundGallery');if(backgroundGallery)backgroundGallery.innerHTML=`<button type="button" class="mockup-background-card ${!backgroundSelect.value?'selected':''}" data-select-mockup-background="" aria-label="Sin fondo" title="Sin fondo"><i class="fa-solid fa-ban" aria-hidden="true"></i></button>`+backgrounds.map(a=>`<button type="button" class="mockup-background-card ${Number(a.id)===Number(backgroundSelect.value)?'selected':''}" data-select-mockup-background="${a.id}" title="${escapeHtml(a.name)}"><img src="${mockupAssetUrl(a)}" alt="${escapeHtml(a.name)}" loading="lazy"></button>`).join('');
    renderMockupLayerControls();syncMockupActions();applyMockupZoom();syncProductionCapControls();calcProductionBuilderCost();
  }
  function selectMockupVariant(id){state.mockupCalibration=null;state.mockupTool='move';
    if(state.mockupViewBusy)return;
    snapshotActiveMockupView();const asset=mockupBaseAsset(id);if(!asset)return;
    qs('#mockupBaseSelect').value=String(asset.id);const view=rememberMockupView(asset.id);qs('#mockupBackgroundSelect').value=String(view.backgroundId||'');state.mockupPointer=null;state.mockupZoom=1;state.mockupPanX=0;state.mockupPanY=0;
    restoreMockupViewLayers(view);state.mockupSelectedLayer='';renderProductionSelectedDesigns();renderMockupStudioOptions();renderMockupProductViews();refreshMockupPreview().catch(err=>toast(err.message,'error'));
  }
  function selectMockupLayerByKey(key){
    const item=state.productionDesignsSelected[Number(key.split('-')[1])];if(!item)return;
    if((item.printSide||'front')!==mockupCurrentSide()){
      const base=mockupBaseAsset(),match=base&&state.mockupAssets.find(a=>a.asset_type==='base'&&a.pose===(item.printSide||'front')&&['product_type','model_name','garment_style','color','cap_style','variant_label'].every(k=>(a[k]||'')===(base[k]||'')));
      if(match)selectMockupVariant(match.id);else{toast(`Elegí una foto de ${item.printSide==='back'?'espalda / lado B':'frente / lado A'} para ajustar esta estampa.`,'');return;}
    }
    state.mockupVisibleLayerIds?.add(item.layerId);state.mockupSelectedLayer=key;renderMockupLayerControls();refreshMockupPreview().catch(()=>{});
  }
  function duplicateProductionDesign(index,otherSide=false){
    const source=state.productionDesignsSelected[index],canvas=qs('#productionMockupCanvas');if(!source||!canvas)return;
    const asset=state.designAssets.find(a=>Number(a.id)===Number(source.designAssetId)),p=mockupPlacement({item:source,asset},canvas),copy={...source,layerId:crypto.randomUUID(),bakedViewKeys:[],mockupPlacements:{},quantity:1,printSide:otherSide?((source.printSide||'front')==='front'?'back':'front'):(source.printSide||'front'),mockupPlacement:{...p,x:p.x+.025,y:p.y+.025}};
    clampMockupPlacement(copy.mockupPlacement,canvas);state.productionDesignsSelected.push(copy);state.mockupVisibleLayerIds?.add(copy.layerId);state.mockupSelectedLayer=`design-${state.productionDesignsSelected.length-1}`;renderProductionSelectedDesigns();renderProductionDesignGallery();
  }
  function removeProductionDesign(index){state.productionDesignsSelected.splice(index,1);state.mockupSelectedLayer='';state.mockupPointer=null;renderProductionSelectedDesigns();renderProductionDesignGallery();}
  function syncProductionCapControls(){const base=mockupBaseAsset(),hasCap=base?.cap_style&&base.cap_style!=='none',box=qs('#productionCapPriceBox'),select=qs('#mockupCapMaterialSelect');if(!box||!select)return;box.classList.toggle('hidden',!hasCap);if(!hasCap)return;const old=select.value,mats=state.materials.filter(m=>m.material_type==='cap');select.innerHTML='<option value="">Elegir gorra para conocer su costo</option>'+mats.map(m=>`<option value="${m.id}">${escapeHtml(m.name)} · ${escapeHtml(m.color||'')} · ${money(m.average_cost_cents)}</option>`).join('');select.value=mats.some(m=>String(m.id)===old)?old:(mats[0]?String(mats[0].id):'');if(select.value&&!qs('#mockupCapSalePrice').value)loadCapPriceSuggestion(select.value);}
  async function loadCapPriceSuggestion(id){try{const d=await api(`/api/admin/production/price-suggestion?materialId=${Number(id)}`);if(Number(d.price_cents)>0&&!qs('#mockupCapSalePrice')?.value){qs('#mockupCapSalePrice').value=centsToPesos(d.price_cents);calcProductionBuilderCost()}}catch{}}
  function renderMockupCapDesignOptions(){
    const designSelect=qs('#mockupCapDesignSelect'),measureSelect=qs('#mockupCapMeasureSelect');if(!designSelect||!measureSelect)return;const designs=state.designAssets.filter(a=>a.kind==='individual'),old=Number(state.mockupCapDesign?.designAssetId)||Number(designSelect.value),design=designs.find(a=>Number(a.id)===old);designSelect.innerHTML='<option value="">Elegir estampa de gorra</option>'+designs.map(a=>`<option value="${a.id}">${escapeHtml(a.name||a.file_name)}</option>`).join('');designSelect.value=design?String(design.id):'';
    const options=design?productionMeasureOptions(design):[],oldMeasure=state.mockupCapDesign?.measureOptionId;measureSelect.innerHTML='<option value="">Elegir medida</option>'+options.map(o=>`<option value="${escapeHtml(o.id)}">${escapeHtml(designMeasureLabel(o))}</option>`).join('');const chosen=options.find(o=>o.id===oldMeasure)||options[0];measureSelect.value=chosen?.id||'';if(chosen){state.mockupCapDesign={...(state.mockupCapDesign||{}),designAssetId:Number(design.id),measureOptionId:chosen.id,widthCm:Number(chosen.widthCm)||0,heightCm:Number(chosen.heightCm)||0,measureLabel:designMeasureLabel(chosen),printSide:'front'};}else state.mockupCapDesign=null;
    qsa('.mockup-cap-field').forEach(el=>el.classList.toggle('hidden',!qs('#mockupAddCap')?.checked));
  }
  function mockupLayers(side=mockupCurrentSide(),viewKey=mockupViewKey()){
    const active=viewKey===mockupViewKey(),saved=state.productionMountViews?.[viewKey]?.layers,items=!active&&Array.isArray(saved)?saved:state.productionDesignsSelected;
    return items.map((item,index)=>({key:`design-${index}`,item,index,asset:state.designAssets.find(a=>Number(a.id)===Number(item.designAssetId)),cap:false})).filter(x=>x.asset&&(x.item.printSide||'front')===side&&!(x.item.bakedViewKeys||[]).includes(viewKey)&&(!active||!state.mockupVisibleLayerIds||state.mockupVisibleLayerIds.has(x.item.layerId)));
  }
  function syncMockupActions(){const base=Number(qs('#mockupBaseSelect')?.value);for(const id of ['addMockupToProductBtn','downloadMockupBtn','downloadAllProductViewsBtn']){const button=qs('#'+id);if(button)button.disabled=Boolean(state.mockupViewBusy)||(id==='downloadAllProductViewsBtn'?!base&&!(state.mediaItems||[]).some(item=>!String(item.mime_type||item.file?.type||'').startsWith('video/')):!base);}}
  async function loadMockupImage(asset){const key=`${asset.asset_type}:${asset.id}`;if(state.mockupImageCache.has(key))return state.mockupImageCache.get(key);const image=new Image();image.decoding='async';image.crossOrigin='use-credentials';image.src=mockupAssetUrl(asset);await image.decode();state.mockupImageCache.set(key,image);return image;}
  async function loadDesignMockupImage(asset){const color=previewColor(asset.preview_color),key=`design:${asset.id}:${color}`;if(state.mockupImageCache.has(key))return state.mockupImageCache.get(key);const image=new Image();image.decoding='async';image.crossOrigin='use-credentials';image.src=apiUrl(`/api/admin/design-assets/${Number(asset.id)}/file`);await image.decode();let result=image;if(color){result=document.createElement('canvas');result.width=image.naturalWidth;result.height=image.naturalHeight;const ctx=result.getContext('2d');ctx.drawImage(image,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,result.width,result.height);ctx.globalCompositeOperation='source-over';}state.mockupImageCache.set(key,result);return result;}
  function drawContained(ctx,image,x,y,width,height,cover=false){const scale=cover?Math.max(width/image.width,height/image.height):Math.min(width/image.width,height/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);}
  function containedRect(image,width,height){const scale=Math.min(width/image.width,height/image.height),w=image.width*scale,h=image.height*scale;return{x:(width-w)/2,y:(height-h)/2,w,h};}
  function mockupPlacement(layer,canvas,viewKey=mockupViewKey()){
    layer.item.mockupPlacements??={};if(layer.item.mockupPlacements[viewKey]){if(viewKey===mockupViewKey())layer.item.mockupPlacement=layer.item.mockupPlacements[viewKey];return mockupMeasureBasis(layer,layer.item.mockupPlacements[viewKey]);}
    if(layer.item.mockupPlacement)layer.item.mockupPlacement={...layer.item.mockupPlacement};
    if(!layer.item.mockupPlacement){const iw=Number(layer.item.widthCm)||Number(layer.asset?.width_cm)||10,ih=Number(layer.item.heightCm)||Number(layer.asset?.height_cm)||10,ratio=iw/ih,cm=Math.max(.01,Number(layer.item.widthCm)||10),w=Math.max(.03,Math.min(.8,cm/(state.productionMountViews?.[viewKey]?.calibration?.canvasWidthCm||90))),h=w*(canvas.width/canvas.height)/Math.max(.15,ratio),type=mockupBaseAsset()?.product_type||qs('#productionMaterialType')?.value||'',centerY=layer.cap ? .15 : ((type==='mug'||type==='glass'||type==='thermos') ? .42 : .34);layer.item.mockupPlacement={x:.5-w/2,y:centerY-h/2,w,h,rotation:0};}
    layer.item.mockupPlacements[viewKey]=layer.item.mockupPlacement;return mockupMeasureBasis(layer,layer.item.mockupPlacements[viewKey]);
  }

  async function refreshMockupPreview(){
    const canvas=qs('#productionMockupCanvas'),empty=qs('#productionMockupEmpty');if(!canvas)return;const ctx=canvas.getContext('2d'),seq=++state.mockupRenderSeq;ctx.clearRect(0,0,canvas.width,canvas.height);syncMockupActions();
    const base=mockupBaseAsset(),background=state.mockupAssets.find(a=>a.asset_type==='background'&&Number(a.id)===Number(qs('#mockupBackgroundSelect')?.value)),side=mockupCurrentSide();
    if(!base){empty.textContent='Elegí una miniatura de las variantes cargadas para ver el montaje.';empty.classList.remove('hidden');state.mockupLayerBoxes=[];return;}
    try{
      if(background){const bg=await loadMockupImage(background);if(seq!==state.mockupRenderSeq)return;drawContained(ctx,bg,0,0,canvas.width,canvas.height,true);}
      const model=await loadMockupImage(base);if(seq!==state.mockupRenderSeq)return;drawContained(ctx,model,0,0,canvas.width,canvas.height);
      state.mockupLayerBoxes=[];for(const layer of mockupLayers(side)){
        const image=await loadDesignMockupImage(layer.asset);(state.mockupDesignRatios??={})[layer.asset.id]=image.width/image.height;if(seq!==state.mockupRenderSeq)return;const p=mockupPlacement(layer,canvas),box={x:p.x*canvas.width,y:p.y*canvas.height,w:p.w*canvas.width,h:p.h*canvas.height,rotation:p.rotation||0,key:layer.key,item:layer.item,cap:layer.cap,asset:layer.asset};drawMockupLayer(ctx,image,box,false,canvas);state.mockupLayerBoxes.push(box);
      }
      if(seq!==state.mockupRenderSeq)return;const selectedBox=state.mockupLayerBoxes.find(b=>b.key===state.mockupSelectedLayer);if(selectedBox)drawMockupLayer(ctx,null,selectedBox,true,canvas);drawMockupCenterGuides(ctx,canvas);empty.classList.add('hidden');const hint=qs('#mockupAssetHint');if(hint)hint.textContent=`${base.model_name||base.name} · ${base.gender==='Producto'&&!materialIsGarment(base.product_type)?(base.pose==='back'?'lado B':'lado A'):(base.pose==='back'?'espalda':'frente')} · ${[base.garment_style,base.color,base.cap_style&&base.cap_style!=='none'?(base.cap_style==='mesh'?'gorra con red':'gorra sin red'):''].filter(Boolean).join(' · ')}. Mové, girá y escalá las estampas directamente en la imagen.`;
    }catch(err){empty.textContent='No pude abrir una de las imágenes. Revisá que el archivo siga disponible.';empty.classList.remove('hidden');throw err;}
  }
  function applyMockupZoom(){
    const canvas=qs('#productionMockupCanvas');if(!canvas)return;
    const zoom=Math.max(1,Math.min(8,Number(state.mockupZoom)||1)),viewport=canvas.parentElement;
    if(viewport.clientWidth>16&&viewport.clientHeight>16){
      const fit=Math.min((viewport.clientWidth-16)/canvas.width,(viewport.clientHeight-16)/canvas.height);
      Object.assign(canvas.style,{width:`${canvas.width*fit}px`,height:`${canvas.height*fit}px`,maxWidth:'none',maxHeight:'none'});
    }
    const maxX=Math.max(0,(canvas.clientWidth*zoom-viewport.clientWidth)/2),maxY=Math.max(0,(canvas.clientHeight*zoom-viewport.clientHeight)/2);
    state.mockupZoom=zoom;state.mockupPanX=Math.max(-maxX,Math.min(maxX,Number(state.mockupPanX)||0));state.mockupPanY=Math.max(-maxY,Math.min(maxY,Number(state.mockupPanY)||0));
    canvas.style.transform=`translate(${state.mockupPanX}px,${state.mockupPanY}px) scale(${zoom})`;
    const label=qs('#mockupZoomValue'),slider=qs('#mockupZoomSlider');if(label)label.textContent=`${Math.round(zoom*100)}%`;if(slider)slider.value=String(zoom);
  }
  function clearMockupSelection(){state.mockupSelectedLayer='';renderMockupLayerControls();refreshMockupPreview().catch(()=>{});}
  function mockupRotation(value){const angle=(Number(value)||0)%360;return angle>180?angle-360:angle<-180?angle+360:angle;}
  function mockupBoxPoint(box,x,y){const angle=mockupRotation(box.rotation??box.item?.mockupPlacement?.rotation)*Math.PI/180,dx=x-box.w/2,dy=y-box.h/2;return {x:box.x+box.w/2+dx*Math.cos(angle)-dy*Math.sin(angle),y:box.y+box.h/2+dx*Math.sin(angle)+dy*Math.cos(angle)};}
  function mockupBoxLocalPoint(box,point){const angle=mockupRotation(box.rotation??box.item?.mockupPlacement?.rotation)*Math.PI/180,dx=point.x-box.x-box.w/2,dy=point.y-box.y-box.h/2;return {x:dx*Math.cos(angle)+dy*Math.sin(angle)+box.w/2,y:-dx*Math.sin(angle)+dy*Math.cos(angle)+box.h/2};}
  function mockupControlScale(canvas){const width=canvas.getBoundingClientRect().width;return canvas.width/Math.max(1,width||canvas.width);}
  function clampMockupPlacement(p,canvas){
    const angle=mockupRotation(p.rotation)*Math.PI/180,halfX=Math.min(.5,(Math.abs(Math.cos(angle))*p.w*canvas.width+Math.abs(Math.sin(angle))*p.h*canvas.height)/(2*canvas.width)),halfY=Math.min(.5,(Math.abs(Math.sin(angle))*p.w*canvas.width+Math.abs(Math.cos(angle))*p.h*canvas.height)/(2*canvas.height));
    p.x=Math.max(halfX,Math.min(1-halfX,p.x+p.w/2))-p.w/2;p.y=Math.max(halfY,Math.min(1-halfY,p.y+p.h/2))-p.h/2;
  }
  function syncMockupRotationInputs(key,angle){qsa('[data-mockup-rotation]').filter(el=>el.dataset.mockupRotation===key).forEach(el=>el.value=String(Math.round(angle)));}
  function setMockupRotation(key,value){const canvas=qs('#productionMockupCanvas'),layer=mockupLayers().find(x=>x.key===key);if(!canvas||!layer)return;const p=mockupPlacement(layer,canvas);p.rotation=mockupRotation(value);clampMockupPlacement(p,canvas);syncMockupRotationInputs(key,p.rotation);refreshMockupPreview().catch(()=>{});}
  function renderMockupLayerControls(){
    const host=qs('#mockupLayerEditor'),canvas=qs('#productionMockupCanvas');if(!host||!canvas)return;const layers=mockupLayers(),selected=layers.find(x=>x.key===state.mockupSelectedLayer);if(!selected)state.mockupSelectedLayer='';
    qsa('[data-production-design-row]').forEach(row=>row.classList.toggle('selected',`design-${row.dataset.productionDesignRow}`===state.mockupSelectedLayer));
    if(!selected){updateMockupCursor();host.innerHTML='';return;}
    const p=mockupPlacement(selected,canvas),angle=Math.round(mockupRotation(p.rotation));updateMockupCursor();
    host.innerHTML=`<div class="mockup-rotation-controls"><strong>Estampa #${selected.index+1}</strong><div class="mockup-rotation-inputs"><input type="range" min="-180" max="180" step="1" value="${angle}" data-mockup-rotation="${selected.key}" aria-label="Girar estampa ${selected.index+1}"><label><input class="input" type="number" step="1" value="${angle}" data-mockup-rotation="${selected.key}" aria-label="Ángulo de estampa ${selected.index+1}">°</label></div><div class="mockup-rotation-actions"><button class="btn btn-ghost" type="button" data-mockup-turn="-90" data-layer="${selected.key}">↶ 90°</button><button class="btn btn-ghost" type="button" data-mockup-turn="90" data-layer="${selected.key}">↷ 90°</button><button class="btn btn-ghost" type="button" data-mockup-turn="0" data-layer="${selected.key}">0°</button></div></div>${mockupSurfaceControls(selected,p,canvas)}`;
  }
  function mockupSurfaceControls(layer,p,canvas){
    const e=layer.item.surface||{},view=state.productionMountViews?.[mockupViewKey()],reference=view?.calibration,tool=state.mockupTool||'move';
    const field=(key,label,min,max,value)=>`<label class="field"><span>${label}</span><input type="range" min="${min}" max="${max}" step="1" value="${value}" data-surface-field="${key}" data-layer="${layer.key}"></label>`;
    return `<div class="mockup-surface-controls"><strong id="mockupSizeReadout">${mockupSizeLabel(layer,canvas)}</strong><div class="mockup-tool-row mobile-surface-toolbar">${[['move','Mover','fa-arrows-up-down-left-right'],['warp','Ajustar superficie','fa-vector-square'],['brush','Borrar / suavizar','fa-eraser'],['curve','Curvatura','fa-mug-hot'],['fold','Pliegues','fa-water'],['phase','Posición del pliegue','fa-wave-square'],['opacity','Opacidad','fa-droplet']].map(([key,label,icon])=>`<button type="button" class="btn ${tool===key?'btn-primary':'btn-ghost'}" data-mockup-tool="${key}" aria-label="${label}" title="${label}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span></button>`).join('')}</div><div class="mockup-effect-sliders">${field('curve','Curvatura · taza',-100,100,e.curve||0)}${field('fold','Pliegues',0,100,e.fold||0)}${field('phase','Posición del pliegue',0,360,e.phase||0)}${field('opacity','Opacidad de la estampa',0,100,e.opacity??100)}</div>${tool==='brush'?`<div class="mockup-brush-mobile"><label><i class="fa-solid fa-expand" aria-hidden="true"></i><input type="number" min="1" max="30" value="${state.mockupBrushSize||5}" data-surface-field="brushSize" aria-label="Tamaño de pincel"></label><label><i class="fa-solid fa-droplet" aria-hidden="true"></i><input type="number" min="1" max="100" value="${state.mockupBrushStrength??100}" data-surface-field="brushStrength" aria-label="Intensidad del borrado">%</label></div><div class="mockup-effect-sliders">${field('brushSize','Tamaño del pincel',1,30,state.mockupBrushSize||5)}${field('brushStrength','Cuánto borrar · 100% borra',1,100,state.mockupBrushStrength??100)}</div>`:''}<div class="mockup-tool-row"><button type="button" class="btn btn-ghost" data-mockup-mask-undo ${e.strokes?.length?'':'disabled'} aria-label="Deshacer pincel"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button><button type="button" class="btn btn-ghost" data-mockup-surface-reset aria-label="Restablecer superficie"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i></button></div></div>`;
  }
  function mockupMeasureBasis(layer,p){return p;}
  function mockupDimensions(layer,canvas){return {width:Number(layer.item.widthCm)||10,height:Number(layer.item.heightCm)||10,real:false};}
  function mockupSizeLabel(layer,canvas){const d=mockupDimensions(layer,canvas);return `${d.width.toLocaleString('es-AR',{maximumFractionDigits:2})} × ${d.height.toLocaleString('es-AR',{maximumFractionDigits:2})} cm · medida de impresión`;} 
  function syncMockupSize(layer,canvas){if(!layer)return;const label=qs('#mockupSizeReadout');if(label)label.textContent=mockupSizeLabel(layer,canvas);}
  function updateMockupCursor(){const canvas=qs('#productionMockupCanvas');if(!canvas)return;canvas.style.cursor=state.mockupTool==='brush'?`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='12' fill='none' stroke='white' stroke-width='3'/%3E%3Ccircle cx='16' cy='16' r='12' fill='none' stroke='black'/%3E%3C/svg%3E") 16 16, crosshair`:state.mockupTool==='warp'?'crosshair':'default';}
  function undoMockupBrush(){const layer=mockupLayers().find(l=>l.key===state.mockupSelectedLayer);if(!layer?.item.surface?.strokes?.length)return false;state.mockupPointer=null;layer.item.surface.strokes.pop();renderMockupLayerControls();refreshMockupPreview().catch(()=>{});return true;}
  function updateMockupSurface(input){const key=input.dataset.surfaceField,value=Number(input.value);if(!Number.isFinite(value)||input.value==='')return;if(key==='brushSize'){state.mockupBrushSize=Math.max(1,Math.min(30,value));return;}if(key==='brushStrength'){state.mockupBrushStrength=Math.max(1,Math.min(100,value));return;}const layer=mockupLayers().find(x=>x.key===input.dataset.layer);if(!layer)return;layer.item.surface??={};layer.item.surface[key]=value;if(key==='phase'&&!layer.item.surface.fold){layer.item.surface.fold=25;const slider=qs('[data-surface-field="fold"]');if(slider)slider.value='25';}refreshMockupPreview().catch(()=>{});}
  function applyMockupCalibrationPoint(point,canvas){const pending=state.mockupCalibration;if(!pending.first){pending.first=point;toast('Ahora marcá el segundo extremo.');return;}const distance=Math.hypot(point.x-pending.first.x,point.y-pending.first.y);if(distance<8){toast('Separá los puntos para medir la referencia.','error');return;}const view=rememberMockupView(mockupBaseAsset()?.id);view.calibration={confirmed:true,distanceCm:pending.cm,points:[{x:pending.first.x/canvas.width,y:pending.first.y/canvas.height},{x:point.x/canvas.width,y:point.y/canvas.height}],canvasWidthCm:canvas.width*pending.cm/distance};state.mockupCalibration=null;for(const layer of mockupLayers())syncMockupSize(layer,canvas);renderProductionSelectedDesigns();renderMockupLayerControls();toast('Referencia real guardada para esta foto.','success');}
  function startMockupSurfacePointer(point,event,canvas){const tool=state.mockupTool;if(!['warp','brush','curve','fold','phase','opacity'].includes(tool))return false;const box=state.mockupLayerBoxes.find(b=>b.key===state.mockupSelectedLayer);if(!box)return false;const layer=mockupLayers().find(l=>l.key===box.key),local=mockupBoxLocalPoint(box,point),ratio=state.mockupDesignRatios?.[box.asset?.id]||box.w/box.h,fitW=Math.min(box.w,box.h*ratio),fitH=fitW/ratio;if(!layer)return false;layer.item.surface??={};const effects=layer.item.surface;
    if(['curve','fold','phase','opacity'].includes(tool)){if(tool==='phase'&&!effects.fold)effects.fold=25;state.mockupPointer={mode:'effect',key:box.key,effect:tool,startClient:{x:event.clientX,y:event.clientY},initial:Number(effects[tool]??(tool==='opacity'?100:0))};return true;}
    if(tool==='warp'){let closest=-1,distance=Infinity;for(let i=0;i<9;i++){const q=window.SalmosMontage.point(i%3/2,Math.floor(i/3)/2,effects),d=Math.hypot(local.x-((q.x-.5)*fitW+box.w/2),local.y-((q.y-.5)*fitH+box.h/2));if(d<distance){distance=d;closest=i;}}if(distance>16*mockupControlScale(canvas))return false;effects.grid??=Array.from({length:9},()=>({x:0,y:0}));state.mockupPointer={key:box.key,mode:'warp',node:closest,start:local,initial:{...effects.grid[closest]},box,fitW,fitH};return true;}
    // Bounding fit follows the original design aspect ratio.
    const uv=window.SalmosMontage.inverse((local.x-box.w/2)/fitW+.5,(local.y-box.h/2)/fitH+.5,effects);if(!uv)return false;
    effects.strokes??=[];const stroke={radius:(Number(state.mockupBrushSize)||5)/100,strength:(state.mockupBrushStrength??100)/100,points:[uv]};effects.strokes.push(stroke);state.mockupPointer={key:box.key,mode:'brush',stroke,box,fitW,fitH};renderMockupLayerControls();refreshMockupPreview().catch(()=>{});return true;
  }
  function moveMockupSurfacePointer(drag,point,layer,canvas){if(drag.mode!=='warp'&&drag.mode!=='brush')return false;const local=mockupBoxLocalPoint(drag.box,point);if(drag.mode==='warp'){const offset=layer.item.surface.grid[drag.node];offset.x=Math.max(-.35,Math.min(.35,drag.initial.x+(local.x-drag.start.x)/drag.fitW));offset.y=Math.max(-.35,Math.min(.35,drag.initial.y+(local.y-drag.start.y)/drag.fitH));}else{const uv=window.SalmosMontage.inverse((local.x-drag.box.w/2)/drag.fitW+.5,(local.y-drag.box.h/2)/drag.fitH+.5,layer.item.surface);if(uv){const last=drag.stroke.points.at(-1);if(Math.hypot(uv.x-last.x,uv.y-last.y)>.002)drag.stroke.points.push(uv);}}refreshMockupPreview().catch(()=>{});return true;}
  function drawMockupLayer(ctx,image,box,selected,canvas){
    ctx.save();ctx.translate(box.x+box.w/2,box.y+box.h/2);ctx.rotate(mockupRotation(box.rotation)*Math.PI/180);if(image)window.SalmosMontage.draw(ctx,image,box.w,box.h,box.item?.surface||{});
    if(selected&&state.mockupTool==='warp'){const scale=mockupControlScale(canvas),effects=box.item?.surface||{},ratio=state.mockupDesignRatios?.[box.asset?.id]||box.w/box.h,fitW=Math.min(box.w,box.h*ratio),fitH=fitW/ratio;ctx.strokeStyle='#77e8ff';ctx.fillStyle='#77e8ff';ctx.lineWidth=scale;for(let i=0;i<9;i++){const q=window.SalmosMontage.point((i%3)/2,Math.floor(i/3)/2,effects);ctx.beginPath();ctx.arc((q.x-.5)*fitW,(q.y-.5)*fitH,6*scale,0,Math.PI*2);ctx.fill();}ctx.restore();return;}
    if(selected){const s=mockupControlScale(canvas),x=-box.w/2,y=-box.h/2;ctx.strokeStyle='#f0ba39';ctx.fillStyle='#f0ba39';ctx.lineWidth=2*s;ctx.setLineDash([6*s,4*s]);ctx.strokeRect(x,y,box.w,box.h);ctx.setLineDash([]);
      for(const [cx,cy] of [[x+box.w,y],[x,y+box.h],[x+box.w,y+box.h]]){ctx.beginPath();ctx.arc(cx,cy,6*s,0,Math.PI*2);ctx.fill();}
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(0,y-32*s);ctx.stroke();ctx.beginPath();ctx.arc(0,y-32*s,9*s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#241620';ctx.font=`bold ${14*s}px sans-serif`;ctx.textAlign='center';ctx.fillText('↻',0,y-27*s);
      ctx.fillStyle='#6b142a';ctx.beginPath();ctx.arc(x,y,10*s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=`bold ${16*s}px sans-serif`;ctx.fillText('×',x,y+5*s);
    }ctx.restore();
  }
  function mockupHitTest(box,point,scale,selected){
    const p=mockupBoxLocalPoint(box,point),near=(x,y,r)=>Math.hypot(p.x-x,p.y-y)<=r*scale;
    if(selected){if(near(0,0,13))return {mode:'remove'};if(near(box.w/2,-32*scale,14))return {mode:'rotate'};for(const [corner,x,y] of [['tr',box.w,0],['bl',0,box.h],['br',box.w,box.h]])if(near(x,y,14))return {mode:'resize',corner};}
    return p.x>=0&&p.x<=box.w&&p.y>=0&&p.y<=box.h?{mode:'move'}:null;
  }
  function drawMockupCenterGuides(ctx,canvas){
    const drag=state.mockupPointer;if(drag?.mode!=='move'||!drag.moved)return;
    const layer=mockupLayers().find(x=>x.key===drag.key),p=layer?.item.mockupPlacement;if(!p)return;const w=canvas.width,h=canvas.height,s=mockupControlScale(canvas),centerX=Math.abs(p.x+p.w/2-.5)<1e-6,centerY=Math.abs(p.y+p.h/2-.5)<1e-6;
    ctx.save();ctx.lineWidth=1.5*s;ctx.shadowColor='#17212b';ctx.shadowBlur=2*s;
    for(const vertical of [true,false]){ctx.strokeStyle=(vertical?centerX:centerY)?'#ff3030':'#76e8ff';ctx.setLineDash([8*s,6*s]);ctx.beginPath();if(vertical){ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);}else{ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);}ctx.stroke();ctx.setLineDash([]);ctx.beginPath();for(let i=1;i<20;i++){const tick=(i%5===0?8:4)*s;if(vertical){ctx.moveTo(w/2-tick,h*i/20);ctx.lineTo(w/2+tick,h*i/20);}else{ctx.moveTo(w*i/20,h/2-tick);ctx.lineTo(w*i/20,h/2+tick);}}ctx.stroke();}ctx.restore();
  }
  function bindMockupCanvas(){
    const canvas=qs('#productionMockupCanvas');if(!canvas||canvas.dataset.pointerBound)return;
    canvas.dataset.pointerBound='1';canvas.style.touchAction='none';canvas.style.transition='none';const pointers=new Map(),viewport=canvas.parentElement;
    const controls=qs('.mockup-zoom-controls'),hint=controls&&qs('small',controls);hint?.remove();
    if(controls&&!qs('#mockupZoomSlider')){const slider=document.createElement('input');slider.type='range';slider.id='mockupZoomSlider';slider.min='1';slider.max='8';slider.step='.05';slider.value='1';slider.setAttribute('aria-label','Zoom del modelo');controls.insertBefore(slider,qs('#mockupZoomValue',controls));slider.addEventListener('input',()=>{state.mockupZoom=Number(slider.value)||1;applyMockupZoom();});}
    if(window.ResizeObserver)new ResizeObserver(applyMockupZoom).observe(viewport);
    const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}};
    viewport.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();state.mockupZoom=Math.max(1,Math.min(8,(Number(state.mockupZoom)||1)*(e.deltaY<0?1.12:1/1.12)));applyMockupZoom();},{passive:false});
    viewport.addEventListener('pointerdown',e=>{if(e.target===viewport||e.target.id==='productionMockupEmpty'){state.mockupPointer=null;clearMockupSelection();}});
    canvas.addEventListener('pointerdown',e=>{
      if(e.button!==0&&e.pointerType!=='touch')return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});e.preventDefault();canvas.setPointerCapture?.(e.pointerId);
      if(pointers.size===2){const [a,b]=[...pointers.values()];state.mockupPointer={mode:'pinch',distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:state.mockupZoom};refreshMockupPreview().catch(()=>{});return;}if(pointers.size>2)return;
      const p=point(e);if(state.mockupCalibration){applyMockupCalibrationPoint(p,canvas);return;}if(startMockupSurfacePointer(p,e,canvas))return;const scale=mockupControlScale(canvas),boxes=[...state.mockupLayerBoxes].reverse(),selected=boxes.find(b=>b.key===state.mockupSelectedLayer),control=selected&&mockupHitTest(selected,p,scale,true);
      let hit=control&&control.mode!=='move'?selected:boxes.find(b=>mockupHitTest(b,p,scale,false));
      if(!hit){state.mockupPointer=state.mockupZoom>1?{mode:'pan',startClient:{x:e.clientX,y:e.clientY},initialPan:{x:state.mockupPanX,y:state.mockupPanY}}:null;clearMockupSelection();return;}
      const action=mockupHitTest(hit,p,scale,state.mockupSelectedLayer===hit.key);if(action.mode==='remove'){removeProductionDesign(Number(hit.key.split('-')[1]));return;}
      state.mockupSelectedLayer=hit.key;syncMockupSize(mockupLayers().find(l=>l.key===hit.key),canvas);const initial={...hit.item.mockupPlacement};state.mockupPointer={key:hit.key,...action,start:p,startClient:{x:e.clientX,y:e.clientY},moved:false,initial,box:{...hit,rotation:initial.rotation||0},startAngle:Math.atan2(p.y-hit.y-hit.h/2,p.x-hit.x-hit.w/2)};
      renderMockupLayerControls();refreshMockupPreview().catch(()=>{});
    });
    canvas.addEventListener('pointermove',e=>{
      if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const drag=state.mockupPointer;if(!drag)return;
      if(drag.mode==='pinch'){if(pointers.size<2)return;const [a,b]=[...pointers.values()];state.mockupZoom=Math.max(1,Math.min(8,drag.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,drag.distance)));applyMockupZoom();return;}
      if(drag.mode==='pan'){state.mockupPanX=drag.initialPan.x+e.clientX-drag.startClient.x;state.mockupPanY=drag.initialPan.y+e.clientY-drag.startClient.y;applyMockupZoom();return;}
      const p=point(e),layer=mockupLayers().find(x=>x.key===drag.key);if(!layer)return;if(drag.mode==='effect'){const max=drag.effect==='phase'?360:100,min=drag.effect==='curve'?-100:0,value=Math.max(min,Math.min(max,Math.round(drag.initial+(e.clientX-drag.startClient.x)*max/Math.max(80,canvas.getBoundingClientRect().width))));layer.item.surface[drag.effect]=value;const input=qs(`[data-surface-field="${drag.effect}"]`);if(input)input.value=String(value);refreshMockupPreview().catch(()=>{});return;}if(moveMockupSurfacePointer(drag,p,layer,canvas))return;const q=layer.item.mockupPlacement,dx=p.x-drag.start.x,dy=p.y-drag.start.y;
      if(drag.mode==='move'){
        drag.moved=drag.moved||Math.hypot(e.clientX-drag.startClient.x,e.clientY-drag.startClient.y)>2;q.x=drag.initial.x+dx/canvas.width;q.y=drag.initial.y+dy/canvas.height;clampMockupPlacement(q,canvas);
        const tolerance=3*mockupControlScale(canvas);if(Math.abs(q.x+q.w/2-.5)*canvas.width<=tolerance)q.x=(1-q.w)/2;if(Math.abs(q.y+q.h/2-.5)*canvas.height<=tolerance)q.y=(1-q.h)/2;
      }else if(drag.mode==='rotate'){
        let angle=(drag.initial.rotation||0)+(Math.atan2(p.y-drag.box.y-drag.box.h/2,p.x-drag.box.x-drag.box.w/2)-drag.startAngle)*180/Math.PI;if(e.shiftKey)angle=Math.round(angle/15)*15;q.rotation=mockupRotation(angle);clampMockupPlacement(q,canvas);syncMockupRotationInputs(drag.key,q.rotation);
      }else{
        const sx=drag.corner.includes('l')?-1:1,sy=drag.corner.includes('t')?-1:1,angle=(drag.initial.rotation||0)*Math.PI/180,lx=dx*Math.cos(angle)+dy*Math.sin(angle),ly=-dx*Math.sin(angle)+dy*Math.cos(angle),iw=drag.box.w,ih=drag.box.h,requested=1+(lx*sx*iw+ly*sy*ih)/(iw*iw+ih*ih),factor=Math.max(.04/drag.initial.w,Math.min(.85/drag.initial.w,.96/drag.initial.h,requested)),fixed=mockupBoxPoint(drag.box,sx===1?0:iw,sy===1?0:ih);
        q.w=drag.initial.w*factor;q.h=drag.initial.h*factor;const hx=sx*q.w*canvas.width/2,hy=sy*q.h*canvas.height/2;q.x=(fixed.x+hx*Math.cos(angle)-hy*Math.sin(angle))/canvas.width-q.w/2;q.y=(fixed.y+hx*Math.sin(angle)+hy*Math.cos(angle))/canvas.height-q.h/2;clampMockupPlacement(q,canvas);
      }syncMockupSize(layer,canvas);refreshMockupPreview().catch(()=>{});
    });
    const stop=e=>{pointers.delete(e.pointerId);const changed=state.mockupPointer;state.mockupPointer=null;if(changed?.key){renderProductionSelectedDesigns();calcProductionBuilderCost();}refreshMockupPreview().catch(()=>{});};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);qs('#productionDialog')?.addEventListener('close',()=>{pointers.clear();state.mockupPointer=null;});
  }
  function renderMockupAssetList(){if(state.productionSection==='photos'&&qs('#productionPhotosGallery'))renderProductionPhotos();}
  function mockupAssetCategory(asset){return asset.asset_type==='background'?'Fondo':asset.gender==='Producto'||asset.asset_type==='cap'?'Producto':'Persona';}
  function mockupPhotoLabel(asset){return [asset.model_name===materialTypeLabel(asset.product_type)?'':asset.model_name,shortGarmentName(asset.garment_style),asset.variant_label,asset.pose==='back'?'Espalda':asset.pose==='side'?'Perfil':'Frente',asset.color].filter(Boolean).join(' · ');}
  function montagePhotoCard(a){return `<article class="montage-photo-card"><button type="button" class="montage-photo-thumb checkerboard" data-edit-mockup-asset="${a.id}" ${sortablePhotoAttrs(a.id,'catalog-photos')} aria-label="Editar ${escapeHtml(a.name)}">${sortablePhotoHandle()}<img draggable="false" src="${escapeHtml(mockupAssetUrl(a))}" alt="${escapeHtml(a.name)}" loading="lazy" decoding="async"></button><div class="montage-photo-info"><strong>${escapeHtml(photoProductLabel(a))}</strong><small>${escapeHtml([a.model_name,a.pose==='back'?'Espalda':a.pose==='side'?'Perfil':'Frente'].filter(Boolean).join(' · '))}</small>${a.color?`<span class="montage-photo-color"><span class="color-dot" style="--swatch:${escapeHtml(colorSwatch(a.color))}"></span>${escapeHtml(a.color)}</span>`:''}<div class="admin-actions"><button type="button" class="btn btn-ghost" data-edit-mockup-asset="${a.id}">Editar</button><button type="button" class="btn btn-danger small-delete" data-delete-mockup-asset="${a.id}">Eliminar</button></div></div></article>`;}
  function setMontageGroupsCollapsed(collapsed){state.productionPhotosCollapsed=collapsed;state.productionPhotoGroupOpen={};qsa('[data-montage-group]').forEach(group=>group.open=!collapsed);}
  function syncAdminListButtons(){
    qs('#collapseAdminListsBtn')?.classList.toggle('hidden',Boolean(state.adminListsCollapsed));
    qs('#expandAdminListsBtn')?.classList.toggle('hidden',!state.adminListsCollapsed);
  }
  function setAdminListsCollapsed(collapsed){
    state.adminListsCollapsed=collapsed;
    const content=qs('#designGalleryDialog[open] #designGalleryBody')||qs('#adminContent');
    qsa('.purchase-row-detail,.finance-row-detail',content).forEach(x=>x.open=!collapsed);
    qsa('.admin-table-wrap',content).forEach(w=>{if(!w.closest('.inventory-group')&&w.querySelectorAll('tbody tr').length>=5)w.classList.toggle('admin-list-collapsed',collapsed)});
    qsa('.inventory-group',content).forEach(g=>g.classList.toggle('list-collapsed',collapsed));
    qsa('[data-design-list]',content).forEach(g=>{g.open=!collapsed;(state.designListOpen??={})[g.dataset.designList]=g.open;});
    if(qs('#productionPhotosGallery'))setMontageGroupsCollapsed(collapsed);
    syncAdminListButtons();
  }
  function mockupHasGarmentCut(asset){
    return mockupAssetCategory(asset)!=='Fondo'&&(['shirt','hoodie','chomba'].includes(asset.product_type)||/remera|buzo|chomba|camisa/i.test(asset.product_type||''));
  }
  function mockupPhotoVariant(asset){
    if(mockupAssetCategory(asset)==='Fondo')return '';
    if(mockupHasGarmentCut(asset))return String(asset.garment_style||'').trim();
    return String(asset.variant_label||(!/cl[aá]sic[oa]|oversize|crop/i.test(asset.garment_style||'')?asset.garment_style:'')||'').trim();
  }
  function syncMontageVariantFilter(){
    const select=qs('#montagePhotoCut');if(!select)return;
    const filter=state.productionPhotoFilter??={},assets=state.mockupAssets.filter(a=>(!filter.category||mockupAssetCategory(a)===filter.category)&&(!filter.model||String(a.model_name||a.name)===filter.model));
    const values=[...new Set(assets.map(mockupPhotoVariant).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true})),hasCuts=assets.some(mockupHasGarmentCut),hasVariants=assets.some(a=>!mockupHasGarmentCut(a)&&mockupPhotoVariant(a)),label=hasCuts&&hasVariants?'Corte / variante':hasCuts?'Corte':'Variante';
    if(!values.includes(filter.cut)||values.length<2)filter.cut='';
    select.innerHTML='<option value="">Todos</option>'+values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');select.value=filter.cut||'';
    const field=select.closest('.field');field.replaceChildren(document.createTextNode(label),select);field.classList.toggle('hidden',values.length<2);
  }
  function renderProductionPhotos(){
    const host=qs('#productionPhotosGallery');if(!host)return;
    const open=state.productionPhotoGroupOpen??={};qsa('[data-montage-group]',host).forEach(group=>open[group.dataset.montageGroup]=group.open);
    syncMontageVariantFilter();
    const filter=state.productionPhotoFilter||{},search=String(filter.search||'').toLocaleLowerCase('es-AR'),assets=state.mockupAssets.filter(a=>(!filter.category||mockupAssetCategory(a)===filter.category)&&(!filter.model||String(a.model_name||a.name)===filter.model)&&(!filter.cut||mockupPhotoVariant(a)===filter.cut)&&(!filter.color||String(a.color||'')===filter.color)&&(!search||[a.name,mockupPhotoLabel(a),a.gender].join(' ').toLocaleLowerCase('es-AR').includes(search)));
    const groups=new Map();for(const asset of orderedProductPhotos(assets)){const key=photoProductKey(asset);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(asset);}host.innerHTML=groups.size?[...groups].map(([key,photos])=>`<details class="montage-photo-group" data-montage-group="${escapeHtml(key)}" ${(open[key]??!state.productionPhotosCollapsed)?'open':''}><summary><strong>${escapeHtml(photoProductLabel(photos[0]))}</strong><small>${photos.length} fotos</small></summary><div class="montage-photo-grid">${photos.map(montagePhotoCard).join('')}</div></details>`).join(''):'<div class="notice">No hay fotos para esta selección.</div>';
    const count=qs('#productionPhotosCount');if(count)count.textContent=`${assets.length} de ${state.mockupAssets.length} foto${assets.length===1?'':'s'}`;
  }
  const MOCKUP_CATALOG_DEFAULT={models:[],garments:['Remera clásica','Remera oversize','Remera crop','Chomba','Buzo'],products:[],variants:['Blanca','Interior de color'],colors:[...PURCHASE_BASIC_COLORS]};
  async function ensureMockupCatalog(){let stored=state.mockupCatalog||{};if(!state.mockupCatalog){try{const data=await api('/api/admin/settings');stored=JSON.parse(data.settings?.mockup_catalog||'{}')||{}}catch(err){if(err.status===401||err.status===503)throw err;}}const existing={models:state.mockupAssets.filter(a=>mockupAssetCategory(a)==='Persona').map(a=>a.model_name),garments:state.mockupAssets.map(a=>a.garment_style),variants:state.mockupAssets.map(a=>a.variant_label),colors:state.mockupAssets.map(a=>a.color)};state.mockupCatalog=Object.fromEntries(Object.entries(MOCKUP_CATALOG_DEFAULT).map(([key,defaults])=>[key,uniqOptions([...defaults,...(Array.isArray(stored[key])?stored[key]:[]),...(existing[key]||[]).filter(Boolean)])]));}
  async function persistMockupCatalog(){await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:{mockup_catalog:JSON.stringify(state.mockupCatalog)}})});}
  function mockupProductCode(label){const x=String(label||'').toLowerCase();if(x.includes('taza'))return 'mug';if(x.includes('vaso'))return 'glass';if(x.includes('termo'))return 'thermos';if(x.includes('mochila')||x.includes('bolso'))return 'bag';if(x.includes('gorra'))return 'cap';return 'custom_'+x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,56)}
  function mockupCatalogOptions(key){return uniqOptions([...(state.mockupCatalog?.[key]||[]),...(key==='models'?state.mockupAssets.filter(a=>mockupAssetCategory(a)==='Persona').map(a=>a.model_name):[])]).map(x=>`<option value="${escapeHtml(x)}"></option>`).join('')}
  function mockupColorChoices(){return [...new Set([...(state.mockupCatalog?.colors||MOCKUP_CATALOG_DEFAULT.colors),...(state.purchaseOptions?.colors||[]),...state.materials.map(m=>m.color).filter(Boolean)])]}
  function renderMockupCatalogEditor(){const host=qs('#mockupCatalogEditor');if(!host)return;const key=state.mockupCatalogKey||'models',labels={models:'Modelos',garments:'Prendas',products:'Productos',variants:'Variantes',colors:'Colores'};host.innerHTML=`<div class="mockup-catalog-add"><select class="select" id="mockupCatalogKind">${Object.entries(labels).map(([v,label])=>`<option value="${v}" ${key===v?'selected':''}>${label}</option>`).join('')}</select><input class="input" id="mockupCatalogNew" placeholder="Nueva opción"><button type="button" class="btn btn-ghost" data-mockup-catalog-add>+ Agregar</button></div><div class="mockup-catalog-rows">${(state.mockupCatalog?.[key]||[]).map((item,i)=>`<div><input class="input" data-mockup-catalog-value="${i}" value="${escapeHtml(item)}"><button type="button" class="btn btn-ghost" data-mockup-catalog-save="${i}">Guardar</button><button type="button" class="icon-btn" data-mockup-catalog-delete="${i}" aria-label="Eliminar ${escapeHtml(item)}">×</button></div>`).join('')}</div>`}
  function mockupColorPickerHtml(id,color='',custom=''){
    const value=color==='__custom__'?custom:color;
    return `<div class="mockup-color-picker salmos-color-field"><input class="input" data-mockup-field="color" value="${escapeHtml(value)}" data-mockup-palette="${id}" readonly aria-haspopup="dialog" placeholder="Elegir color"><button type="button" class="salmos-color-button" data-mockup-palette="${id}" style="--color-swatch:${escapeHtml(value?colorSwatch(value):'transparent')}" aria-label="Elegir color desde la paleta"></button></div>`;
  }
  function mockupUploadValues(asset){return {name:asset.name,category:mockupAssetCategory(asset),gender:asset.gender||'Varón',modelName:asset.model_name||'',productType:asset.product_type||'shirt',garmentStyle:asset.garment_style||'',pose:asset.pose||'front',color:asset.color||'',capStyle:asset.cap_style||'none',variantLabel:asset.variant_label||''};}
  function mockupCardValues(card){const values=Object.fromEntries(qsa('[data-mockup-field]',card).map(el=>[el.dataset.mockupField,el.value]));return values;}
  function captureMockupQueue(){for(const r of state.mockupUploadQueue||[]){const card=qs(`[data-mockup-upload="${r.id}"]`);if(card)r.values=mockupCardValues(card);}}
  function mockupDefaultGarment(item){
    const word=item?.materialType==='hoodie'?'buzo':item?.materialType==='chomba'?'chomba':'remera',plain=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),fit=plain(item?.fit),choices=(state.mockupCatalog?.garments||[]).filter(value=>plain(value).includes(word)),match=fit.includes('over')?'over':fit.includes('crop')?'crop':fit.includes('boxy')?'boxy':'clasic';
    return choices.find(value=>plain(value).includes(match))||choices[0]||(word==='buzo'?'Buzo':word==='chomba'?'Chomba':'Remera clásica');
  }
  function renderMockupUploadQueue(){
    const host=qs('#mockupUploadQueue');if(!host)return;const colors=mockupColorChoices(),products=new Map([['shirt','Remera'],['chomba','Chomba'],['hoodie','Buzo'],['cap','Gorra'],['mug','Taza'],['glass','Vaso'],['thermos','Termo'],['bag','Mochila'],['other','Otro producto']]);for(const label of state.mockupCatalog?.products||[])products.set(mockupProductCode(label),label);
    host.innerHTML=(state.mockupUploadQueue||[]).map(r=>{
      if(!r.values){const item=mockupUploadContextItem(),person=!item||['shirt','chomba','hoodie'].includes(item.materialType);r.values={name:(r.file?.name||r.fileName||'Foto').replace(/\.[^.]+$/,''),category:person?'Persona':'Producto',gender:item?.gender==='Mujer'?'Mujer':'Varón',modelName:person?(state.mockupCatalog?.models?.[0]||''):'',productType:item?.materialType||'shirt',garmentStyle:item&&materialIsGarment(item.materialType)?mockupDefaultGarment(item):'',pose:'front',color:item?.color||'',capStyle:'none',variantLabel:''};}
      const v=r.values,color=v.color==='__custom__'?v.customColor:v.color,custom=color&&!colors.includes(color),select=(key,options)=>options.map(([value,label])=>`<option value="${escapeHtml(value)}" ${v[key]===value?'selected':''}>${escapeHtml(label)}</option>`).join(''),garments=[...new Set([...(state.mockupCatalog?.garments||[]),v.garmentStyle].filter(Boolean))];if(v.productType&&!products.has(v.productType))products.set(v.productType,v.productType);
      return `<div class="mockup-upload-card" data-mockup-upload="${r.id}"><button type="button" class="mockup-upload-photo checkerboard" data-open-mockup-queue="${r.id}" aria-label="Ampliar ${escapeHtml(v.name)}"><img src="${escapeHtml(r.url)}" alt="${escapeHtml(v.name)}"><span>Ampliar / zoom</span></button><div class="mockup-upload-fields"><label class="field">Nombre<input class="input" data-mockup-field="name" value="${escapeHtml(v.name)}"></label><label class="field">Qué es<select class="select" data-mockup-field="category">${select('category',[['Persona','Persona'],['Producto','Producto'],['Fondo','Fondo']])}</select></label><label class="field" data-person-field>Género<select class="select" data-mockup-field="gender">${select('gender',[...new Set(['Varón','Mujer','Unisex',v.gender].filter(Boolean))].map(x=>[x,x]))}</select></label><label class="field" data-person-field><span class="mockup-model-label">Nombre del modelo</span><select class="select" data-mockup-field="modelName"><option value="" hidden></option>${uniqOptions([...(state.mockupCatalog?.models||[]),...state.mockupAssets.filter(a=>mockupAssetCategory(a)==='Persona').map(a=>a.model_name),v.modelName]).map(name=>`<option value="${escapeHtml(name)}" ${v.modelName===name?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select><button class="btn btn-ghost" type="button" data-add-mockup-model="${r.id}">+ Agregar modelo</button></label><label class="field" data-product-field>Tipo de producto<select class="select" data-mockup-field="productType">${select('productType',[...products])}</select></label><label class="field" data-cut-field>Corte / prenda<select class="select" data-mockup-field="garmentStyle">${select('garmentStyle',[['','Sin especificar'],...garments.map(x=>[x,x])])}</select></label><label class="field" data-base-field>Vista<select class="select" data-mockup-field="pose">${select('pose',[['front','Frente'],['back','Espalda'],['side','Perfil']])}</select></label><div class="field" data-colored-field><label>Color</label>${mockupColorPickerHtml(r.id,custom?'__custom__':v.color,custom?color:v.customColor||'')}</div><label class="field" data-person-field>Gorra en la foto<select class="select" data-mockup-field="capStyle">${select('capStyle',[['none','Sin gorra'],['mesh','Gorra con red'],['solid','Gorra sin red']])}</select></label><label class="field" data-product-field>Capacidad / formato<input class="input" data-mockup-field="variantLabel" list="mockupVariants" value="${escapeHtml(v.variantLabel||'')}"></label><div class="mockup-upload-actions"><button class="btn btn-ghost" type="button" data-mockup-copy-info="${r.id}" aria-label="Copiar datos o duplicar ficha" title="Copiar datos a las siguientes; si no hay otra, duplicar ficha">⧉</button><label class="mockup-card-file-action" title="Elegir foto para esta ficha"><span>Foto</span><input type="file" accept="image/png,image/jpeg,image/webp" data-mockup-replace-file="${r.id}" aria-label="Cambiar foto de esta ficha"></label><small data-mockup-status>${r.needsFile?'Elegí la foto de esta ficha':r.saved?'Guardado ✓':r.assetId?'Editar foto':'Pendiente'}</small>${r.assetId?'':`<button type="button" class="icon-btn" data-mockup-remove="${r.id}" aria-label="Quitar foto">×</button>`}</div></div></div>`;
    }).join('')+`<datalist id="mockupModelNames">${mockupCatalogOptions('models')}</datalist><datalist id="mockupVariants">${mockupCatalogOptions('variants')}</datalist><datalist id="mockupColorNames">${mockupColorChoices().map(color=>`<option value="${escapeHtml(color)}"></option>`).join('')}</datalist>`;
    for(const card of qsa('[data-mockup-upload]',host)){const record=state.mockupUploadQueue.find(row=>String(row.id)===card.dataset.mockupUpload);for(const select of qsa('select[data-mockup-field]',card))select.value=record?.values?.[select.dataset.mockupField]||'';syncMockupUploadCard(card);}
  }
  function openMockupModelDialog(id){
    captureMockupQueue();let dialog=qs('#mockupModelDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='mockupModelDialog';dialog.className='admin-dialog tiny-dialog';dialog.innerHTML='<form class="dialog-shell"><div class="dialog-head"><h2>Agregar modelo</h2><button type="button" class="icon-btn" data-close-model aria-label="Cerrar">×</button></div><div class="dialog-body"><label class="field">Nombre del modelo<input class="input" name="model" required maxlength="120" autocomplete="off"></label></div><div class="dialog-foot"><button type="button" class="btn btn-ghost" data-close-model>Cancelar</button><button class="btn btn-primary" type="submit">OK</button></div></form>';document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target.closest('[data-close-model]'))dialog.close();});qs('form',dialog).addEventListener('submit',async e=>{e.preventDefault();const name=qs('input',dialog).value.trim(),record=state.mockupUploadQueue.find(r=>String(r.id)===dialog.dataset.record);if(!name||!record)return;const button=qs('[type=submit]',dialog),previous=[...state.mockupCatalog.models];button.disabled=true;try{state.mockupCatalog.models=uniqOptions([...previous,name]);await persistMockupCatalog();const old=record.values.modelName,index=state.mockupUploadQueue.indexOf(record);for(const next of state.mockupUploadQueue.slice(index))if(next===record||next.values?.modelName===old)next.values.modelName=name;renderMockupUploadQueue();renderMockupCatalogEditor();dialog.close();}catch(err){state.mockupCatalog.models=previous;toast(err.message,'error');}finally{button.disabled=false;}});}dialog.dataset.record=String(id);qs('input',dialog).value='';dialog.showModal();qs('input',dialog).focus();
  }
  function copyMockupInfo(id){
    captureMockupQueue();const rows=state.mockupUploadQueue||[],index=rows.findIndex(r=>String(r.id)===String(id)),source=rows[index];if(!source)return;
    const following=rows.slice(index+1);if(following.length){for(const row of following){row.values={...source.values,name:row.values?.name||row.file?.name||source.values.name};row.savedPayload=null;}renderMockupUploadQueue();toast('Datos copiados a las fotos siguientes.','success');return;}
    const idNew=++state.mockupUploadId;rows.push({id:idNew,url:source.file?URL.createObjectURL(source.file):source.url,file:source.file||null,fileName:source.fileName||source.values.name,needsFile:!source.file,values:{...source.values},saved:null});renderMockupUploadQueue();const card=qs(`[data-mockup-upload="${idNew}"]`);card?.scrollIntoView?.({block:'nearest'});if(!source.file)qs('[data-mockup-replace-file]',card)?.click();
  }
  function addMockupFiles(files){
    if(state.mockupUploadBusy)return;
    captureMockupQueue();for(const file of files){if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast(`${file.name}: usá PNG, JPG o WEBP.`,'error');continue;}
      const edited=state.mockupUploadQueue?.length===1?state.mockupUploadQueue.find(r=>r.assetId):null;if(edited){if(edited.url.startsWith('blob:'))URL.revokeObjectURL(edited.url);edited.file=file;edited.url=URL.createObjectURL(file);edited.saved=null;break;}
      const prior=state.mockupUploadQueue.at(-1);state.mockupUploadQueue.push({id:++state.mockupUploadId,file,url:URL.createObjectURL(file),saved:null,values:prior?.values?{...prior.values,name:file.name.replace(/\.[^.]+$/,'')}:undefined});
    }renderMockupUploadQueue();
  }
  function releaseMockupQueue(){qs('#mockupPhotoPreviewDialog')?.close();for(const r of state.mockupUploadQueue||[])if(r.url?.startsWith('blob:'))URL.revokeObjectURL(r.url);state.mockupUploadQueue=[];state.mockupUploadFromPurchaseRow=null;state.mockupUploadContext=null;}
  function openMockupPhotoPreview(id){
    const row=state.mockupUploadQueue?.find(r=>Number(r.id)===Number(id));if(!row)return;const dialog=qs('#mockupPhotoPreviewDialog'),stage=qs('#mockupPhotoPreviewStage');state.mockupPhotoZoom=1;state.mockupPhotoFit=null;qs('#mockupPhotoPreviewTitle').textContent=qs('[data-mockup-field="name"]',qs(`[data-mockup-upload="${row.id}"]`))?.value||row.file?.name||row.fileName||'Foto de montaje';
    stage.innerHTML=`<img src="${escapeHtml(row.url)}" alt="${escapeHtml(qs('#mockupPhotoPreviewTitle').textContent)}">`;dialog.showModal();const img=qs('img',stage),fit=()=>{if(qs('img',stage)!==img||!img.naturalWidth||!stage.clientWidth||!stage.clientHeight)return;state.mockupPhotoFit=Math.min((stage.clientWidth-24)/img.naturalWidth,(stage.clientHeight-24)/img.naturalHeight);setMockupPhotoZoom(state.mockupPhotoZoom||1);};
    img.addEventListener('load',fit);if(img.complete)fit();stage._photoObserver?.disconnect();if(window.ResizeObserver){stage._photoObserver=new ResizeObserver(fit);stage._photoObserver.observe(stage);}setMockupPhotoZoom(1);
  }
  function setMockupPhotoZoom(value){
    const stage=qs('#mockupPhotoPreviewStage'),img=qs('img',stage);if(!img)return;const previous=state.mockupPhotoZoom||1,zoom=Math.max(.25,Math.min(8,Number(value)||1)),ratio=zoom/previous,left=(stage.scrollLeft+stage.clientWidth/2)*ratio-stage.clientWidth/2,top=(stage.scrollTop+stage.clientHeight/2)*ratio-stage.clientHeight/2;state.mockupPhotoZoom=zoom;
    const scale=(state.mockupPhotoFit||1)*zoom;if(img.naturalWidth){img.style.width=`${Math.max(1,Math.round(img.naturalWidth*scale))}px`;img.style.height=`${Math.max(1,Math.round(img.naturalHeight*scale))}px`;}
    qs('#mockupPhotoZoomValue').textContent=`${Math.round(zoom*100)}%`;stage.scrollLeft=Math.max(0,left);stage.scrollTop=Math.max(0,top);
  }
  function syncMockupUploadCard(card){if(!card)return;const category=qs('[data-mockup-field="category"]',card)?.value,person=category==='Persona',garment=materialIsGarment(qs('[data-mockup-field="productType"]',card)?.value),pose=qs('[data-mockup-field="pose"]',card);qsa('[data-person-field]',card).forEach(el=>el.classList.toggle('hidden',!person));qsa('[data-product-field]',card).forEach(el=>el.classList.toggle('hidden',category==='Fondo'||(person&&!!qs('[data-mockup-field="variantLabel"]',el))));qsa('[data-cut-field]',card).forEach(el=>el.classList.toggle('hidden',category==='Fondo'||!['shirt','chomba','hoodie'].includes(qs('[data-mockup-field="productType"]',card)?.value)));qsa('[data-base-field]',card).forEach(el=>el.classList.toggle('hidden',category==='Fondo'));qsa('[data-colored-field]',card).forEach(el=>el.classList.toggle('hidden',category==='Fondo'));if(pose){pose.options[0].textContent=(person||garment)?'Frente':'Lado A';pose.options[1].textContent=(person||garment)?'Espalda':'Lado B';}const color=qs('[data-mockup-field="color"]',card),custom=qs('[data-mockup-field="customColor"]',card);custom?.classList.toggle('hidden',color?.value!=='__custom__');}
  function syncMockupAssetForm(){qsa('[data-mockup-upload]').forEach(syncMockupUploadCard)}
  function mockupUploadContextItem(){
    if(Number.isInteger(state.mockupUploadFromPurchaseRow))return state.purchaseItems[state.mockupUploadFromPurchaseRow];
    const context=state.mockupUploadContext,material=context?.materialId?state.materials.find(item=>Number(item.id)===Number(context.materialId)):context?.production?productionPrimaryMaterial():null;
    return material?{materialType:material.material_type,fit:material.fit,color:material.color,gender:material.gender}:null;
  }
  async function openMockupAssetDialog(purchaseRow=null,assetId=null,context={}){
    await Promise.all([loadMockupAssets(),ensureAdminOptionSettings(),state.materials.length?Promise.resolve():api('/api/admin/materials').then(d=>{state.materials=d.items||[]})]);await ensureMockupCatalog();
    const asset=assetId?state.mockupAssets.find(a=>Number(a.id)===Number(assetId)):null;if(assetId&&!asset)throw new Error('Foto no encontrada.');
    releaseMockupQueue();state.mockupUploadFromPurchaseRow=Number.isInteger(purchaseRow)?purchaseRow:null;state.mockupUploadContext={...context,materialId:context.materialId||(context.production?Number(productionPrimaryMaterial()?.id)||null:null)};state.mockupUploadId=0;qs('#mockupAssetFile').value='';qs('#mockupAssetFile').multiple=!asset;
    state.mockupUploadQueue=asset?[{id:++state.mockupUploadId,assetId:Number(asset.id),assetType:asset.asset_type,file:null,fileName:asset.file_name,url:mockupAssetUrl(asset),values:mockupUploadValues(asset)}]:[];
    qs('#mockupAssetDialogTitle').textContent=asset?'Editar foto de montaje':'Subir fotos de montaje';qs('#mockupAssetFileLabel').textContent=asset?'Reemplazar imagen (opcional)':'Fotos para clasificar';qs('#saveMockupAssetBtn').textContent=asset?'Guardar cambios':'Guardar fotos';renderMockupUploadQueue();renderMockupCatalogEditor();const dialog=qs('#mockupAssetDialog');document.body.append(dialog);if(!dialog.open)dialog.showModal();
  }
  async function saveMockupAsset(form,button){
    if(state.mockupUploadBusy)return;const queue=state.mockupUploadQueue||[];if(!queue.length)throw new Error('Elegí una o más fotos.');const controls=qsa('input,select,textarea,button',qs('#mockupAssetDialog')).map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);state.mockupUploadBusy=true;button.disabled=true;
    try{for(const r of queue){const card=qs(`[data-mockup-upload="${r.id}"]`),values=mockupCardValues(card),field=name=>String(values[name]||'').trim(),category=field('category'),name=field('name')||(r.file?.name||r.fileName||'Foto').replace(/\.[^.]+$/,''),color=field('color')==='__custom__'?field('customColor'):field('color');
      if(r.needsFile)throw new Error(`Elegí la foto para ${name}.`);if(category!=='Fondo'&&(category==='Producto'?!field('productType'):!field('modelName')))throw new Error(`Completá ${category==='Producto'?'el tipo de producto':'el nombre del modelo'} para ${name}.`);if(field('color')==='__custom__'&&!color)throw new Error(`Escribí el color de ${name}.`);
      const payload={assetType:category==='Fondo'?'background':r.assetType==='cap'&&category==='Producto'&&field('productType')==='cap'?'cap':'base',name,gender:category==='Fondo'?'':category==='Persona'?field('gender'):'Producto',modelName:category==='Producto'?qs('[data-mockup-field="productType"] option:checked',card)?.textContent||field('productType'):field('modelName'),productType:field('productType')||'shirt',pose:field('pose')||'front',garmentStyle:category==='Fondo'?'':field('garmentStyle'),capStyle:category==='Persona'?field('capStyle'):'none',variantLabel:category==='Producto'?field('variantLabel'):'',color:category==='Fondo'?'':color};
      const linkedItem=mockupUploadContextItem();if((Number.isInteger(state.mockupUploadFromPurchaseRow)||state.mockupUploadContext?.materialId)&&linkedItem&&(payload.assetType!=='base'||payload.productType!==linkedItem.materialType))throw new Error(`La foto de ${name} debe corresponder a ${materialTypeLabel(linkedItem.materialType).toLowerCase()}.`);
      if(r.saved&&JSON.stringify(payload)===JSON.stringify(r.savedPayload))continue;const editingId=r.assetId||r.saved?.id;
      let body,method;if(r.file&&!r.saved){body=new FormData();body.append('file',r.file);for(const [key,value] of Object.entries(payload))body.append(key,value);method=r.assetId?'PUT':'POST';}else{body=JSON.stringify(payload);method='PATCH';}
      const saved=await api(editingId?`/api/admin/mockup-assets/${editingId}`:'/api/admin/mockup-assets',{method,body});r.saved=saved.item;r.savedPayload={...payload};
      const index=state.mockupAssets.findIndex(a=>Number(a.id)===Number(saved.item.id));if(index<0)state.mockupAssets.push(saved.item);else state.mockupAssets[index]={...state.mockupAssets[index],...saved.item};
      if(r.assetId)for(const key of [...state.mockupImageCache.keys()])if(key.endsWith(`:${r.assetId}`))state.mockupImageCache.delete(key);
      qs('[data-mockup-status]',card).textContent='Guardado ✓';if(color&&!state.mockupCatalog.colors.includes(color))state.mockupCatalog.colors.push(color);if(category==='Persona'){const n=field('modelName');if(n&&!state.mockupCatalog.models.includes(n))state.mockupCatalog.models.push(n)}
    }await persistMockupCatalog();
      const purchaseRow=state.mockupUploadFromPurchaseRow;if(Number.isInteger(purchaseRow)&&state.purchaseItems[purchaseRow]){const item=state.purchaseItems[purchaseRow],row=qs(`[data-purchase-row="${purchaseRow}"]`);if(row)syncPurchaseRowFromDom(row);item.imageAssetIds=[...new Set([...purchasePhotoIds(item),...queue.map(row=>Number(row.saved.id))])];item.imageAssetId=item.imageAssetIds[0]||null;item._imageTouched=true;refreshPurchasePhotoField(purchaseRow);}
      const context=state.mockupUploadContext;if(context?.materialId){
        const ids=queue.map(row=>Number(row.saved.id)),result=await api(`/api/admin/materials/${Number(context.materialId)}/photos`,{method:'POST',body:JSON.stringify({ids})});
        if(Array.isArray(result.photos))state.mockupAssets=result.photos;
        if(Number(state.materialEditor?.material.id)===Number(context.materialId)){const editor=state.materialEditor;editor.imageAssetIds=[...new Set([...editor.imageAssetIds,...ids])];editor.originalImageAssetIds=materialPhotos(context.materialId).map(asset=>Number(asset.id));renderMaterialEditorPhotos();}
      }
      renderMockupAssetList();if(qs('#productionDialog')?.open){if(context?.production){state.productionLimitMaterialPhotos=!!context.materialId;state.mockupVariantFilters={};}renderMockupStudioOptions();renderProductionMaterialGallery();if(context?.production){const first=queue.find(row=>row.saved.asset_type==='base');if(first)selectMockupVariant(first.saved.id);}await refreshMockupPreview().catch(()=>{});}
      toast(queue.some(r=>r.assetId)?'Foto actualizada':'Fotos guardadas','success');qs('#mockupAssetDialog').close();releaseMockupQueue();
    }finally{controls.forEach(([control,disabled])=>control.disabled=disabled);state.mockupUploadBusy=false;button.disabled=false;}
  }
  async function removeMockupAsset(id){if(!confirm('¿Eliminar esta imagen reutilizable?'))return;await api(`/api/admin/mockup-assets/${Number(id)}`,{method:'DELETE'});state.mockupAssets=state.mockupAssets.filter(a=>Number(a.id)!==Number(id));for(const key of [...state.mockupImageCache.keys()])if(key.endsWith(`:${Number(id)}`))state.mockupImageCache.delete(key);renderMockupAssetList();if(qs('#productionDialog')?.open){renderMockupStudioOptions();renderProductionMaterialGallery();await refreshMockupPreview();}}
  async function renderMockupExport(nativeResolution=true,view={}){
    const reference=qs('#productionMockupCanvas'),base=mockupBaseAsset(view.baseId??qs('#mockupBaseSelect')?.value),background=state.mockupAssets.find(a=>a.asset_type==='background'&&Number(a.id)===Number(view.backgroundId??qs('#mockupBackgroundSelect')?.value)),side=base?.pose==='back'?'back':'front',viewKey=mockupViewKey(base?.id);
    if(!reference||!base)throw new Error('Elegí una foto para esta vista.');
    const layers=mockupLayers(side,viewKey).map(layer=>({layer,placement:{...mockupPlacement(layer,reference,viewKey)}}));
    const model=await loadMockupImage(base),rect=containedRect(model,reference.width,reference.height),nativeScale=model.width/rect.w,maxScale=Math.min(4,Math.sqrt(63000000/(reference.width*reference.height*nativeScale*nativeScale)),16000/(Math.max(reference.width,reference.height)*nativeScale)),scale=nativeResolution?nativeScale*(view.maxQuality?Math.max(1,maxScale):1):1;
    if(reference.width*reference.height*scale*scale>64000000||Math.max(reference.width,reference.height)*scale>16384)throw new Error('Esa resolución supera el límite de exportación. La imagen es demasiado grande para este dispositivo.');
    const canvas=document.createElement('canvas');canvas.width=Math.round(reference.width*scale);canvas.height=Math.round(reference.height*scale);
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('El navegador no pudo preparar la descarga.');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(background)drawContained(ctx,await loadMockupImage(background),0,0,canvas.width,canvas.height,true);
    drawContained(ctx,model,0,0,canvas.width,canvas.height);
    for(const {layer,placement:p} of layers){const image=await loadDesignMockupImage(layer.asset);drawMockupLayer(ctx,image,{x:p.x*canvas.width,y:p.y*canvas.height,w:p.w*canvas.width,h:p.h*canvas.height,rotation:p.rotation||0,item:layer.item},false,canvas);}
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('El navegador no pudo exportar esta imagen con su resolución original.');
    const name=qs('#productionProductName')?.value||base.name||'producto',filename=`SALMOS-${String(name).replace(/[^a-z0-9_-]+/gi,'-')}-${String(base.model_name||'producto').replace(/[^a-z0-9_-]+/gi,'-')}-${side}.png`;
    return {blob,filename,width:canvas.width,height:canvas.height};
  }
  async function zipProductViews(files){const chunks=[],directory=[];let offset=0;const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}for(const file of files){const bytes=new Uint8Array(await file.blob.arrayBuffer()),name=new TextEncoder().encode(file.name),crc=bytes.reduce((c,b)=>table[(c^b)&255]^(c>>>8),0xffffffff)^0xffffffff,local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint32(14,crc>>>0,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);local.set(name,30);const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint32(16,crc>>>0,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);chunks.push(local,file.blob);directory.push(central);offset+=local.length+bytes.length;}const size=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);return new Blob([...chunks,...directory,end],{type:'application/zip'});}
  async function downloadAllProductViews(button){if(state.mockupViewBusy)return;const label=button.textContent;state.mockupViewBusy=true;button.disabled=true;try{snapshotActiveMockupView();const files=[],done=new Set(),views=state.productionMountViews||{};for(const item of state.mediaItems.filter(i=>i.mediaType!=='video')){const key=item.viewKey||Object.keys(views).find(k=>Number(views[k].outputMediaId)===Number(item.id)),view=views[key];button.textContent=`Preparando imagen ${files.length+1}…`;if(view?.included&&mockupBaseAsset(view.baseId)){const result=await renderMockupExport(true,{baseId:view.baseId,backgroundId:view.backgroundId,maxQuality:true});files.push({name:`${files.length+1}-${result.filename}`,blob:result.blob});done.add(key);}else{const response=await fetch(apiUrl(item.url),{credentials:'include'});if(!response.ok)throw new Error('No se pudo descargar una foto del producto.');files.push({name:`${files.length+1}-${String(item.name||'foto.png').replace(/[\/\\]/g,'-')}`,blob:await response.blob()});}}const key=mockupViewKey(),current=views[key];if(current?.included&&!done.has(key)&&mockupBaseAsset(current.baseId)){const result=await renderMockupExport(true,{baseId:current.baseId,backgroundId:current.backgroundId,maxQuality:true});files.push({name:`${files.length+1}-${result.filename}`,blob:result.blob});}if(!files.length)throw new Error('Agregá primero una vista del producto.');const blob=await zipProductViews(files),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='SALMOS-vistas-producto.zip';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast(`${files.length} imágenes descargadas en ZIP`,'success');}catch(err){toast(err.message,'error');}finally{state.mockupViewBusy=false;button.textContent=label;syncMockupActions();}}
  async function downloadMockupPreview(button){
    const label=button.textContent;button.disabled=true;button.textContent='Preparando PNG…';
    try{const result=await renderMockupExport(true,{maxQuality:true}),url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast(`PNG descargado · ${result.width} × ${result.height} píxeles`,'success');}
    catch(err){toast(err.message,'error')}finally{button.textContent=label;syncMockupActions();}
  }
  async function addMockupPreviewToProduct(button){
    if(state.mockupViewBusy)return;state.mockupViewBusy=true;button.disabled=true;
    try{const view=snapshotActiveMockupView();if(view){view.included=true;view.removed=false;}await captureMockupView(Number(qs('#mockupBaseSelect').value));renderMockupProductViews();toast('Vista agregada a las fotos del producto','success');}
    catch(err){toast(err.message,'error')}finally{state.mockupViewBusy=false;syncMockupActions();}
  }
  function designPrintMaterial(design){const type=design?.print_material_type||'dtf_textile';if(type==='none')return null;return [...state.materials].filter(m=>m.material_type===type).sort((a,b)=>(Number(b.stock_qty)||0)-(Number(a.stock_qty)||0))[0]||null;}
  function designPrintRollWidth(design){const material=designPrintMaterial(design);return Math.max(1,Number(material?.width_cm)||58);}
  function generalPrintCostCents(design,width,height){if(design?.print_material_type==='none')return 0;const area=Math.max(0,Number(width)||0)*Math.max(0,Number(height)||0),material=designPrintMaterial(design);if(material)return Math.round(area/(100*designPrintRollWidth(design))*(Number(material.average_cost_cents)||0));const sheets=state.designAssets.filter(a=>a.kind==='sheet'&&(a.print_material_type||'dtf_textile')===(design?.print_material_type||'dtf_textile')&&Number(a.width_cm)>0&&Number(a.height_cm)>0&&Number(a.cost_cents)>0),rates=sheets.map(s=>Number(s.cost_cents)/(Number(s.width_cm)*Number(s.height_cm)));return Math.round(area*(rates.length?rates.reduce((n,x)=>n+x,0)/rates.length:1000000/(100*58)));}
  function updateProductionMeasureSuggestion(force=false){const design=state.designAssets.find(a=>Number(a.id)===Number(state.productionMeasureDesignId)),input=qs('#productionMeasureCost'),hint=qs('#productionMeasureCostHint');if(!input||!design)return;const w=Number(qs('#productionMeasureWidth')?.value)||0,h=Number(qs('#productionMeasureHeight')?.value)||0,suggestion=generalPrintCostCents(design,w,h);if(force||!state.productionMeasureCostDirty)input.value=w&&h?centsToPesos(suggestion):'';if(force)state.productionMeasureCostDirty=false;if(hint)hint.textContent=`Sugerido: ${money(suggestion)} por estampa · ${designPrintMaterial(design)?'costo del DTF registrado':'costo por superficie de las planchas'}`;}
  function designPrintCostCents(design,width,height,optionId=''){
    const option=parseDesignMeasureOptions(design).find(o=>o.id===optionId||(!optionId&&Math.abs(Number(o.widthCm)-width)<.02&&Math.abs(Number(o.heightCm)-height)<.02));
    for(const source of option?.sources||[]){const sheet=state.designAssets.find(a=>Number(a.id)===Number(source.sheetAssetId));if(!sheet?.sheet_metrics)continue;const i=(sheet.components||[]).findIndex(c=>Number(c.designAssetId)===Number(design.id)&&String(c.measureOptionId)===String(option.id));if(i>=0)return Math.round((sheet.sheet_metrics.componentCostsCents?.[i]||0)/Math.max(1,Number(sheet.components[i].quantity)||1));}
    const material=designPrintMaterial(design);if(!material)return null;const area=Math.max(0,Number(width)||0)*Math.max(0,Number(height)||0);return Math.round(area/(100*designPrintRollWidth(design))*(Number(material.average_cost_cents)||0));
  }
  function designOriginCostCents(design,option,source){const sheet=state.designAssets.find(a=>Number(a.id)===Number(source?.sheetAssetId));if(!sheet)return null;const i=(sheet.components||[]).findIndex(c=>Number(c.designAssetId)===Number(design.id)&&String(c.measureOptionId)===String(option?.id));if(i<0)return null;return Math.round((sheet.sheet_metrics?.componentCostsCents?.[i]||0)/Math.max(1,Number(sheet.components[i].quantity)||1));}
  function designMeasuresOriginsHtml(design,options){return `<div class="design-origin-costs">${options.map(option=>{const sources=option.sources||[],size=`${Number(option.widthCm)} × ${Number(option.heightCm)} cm`;return `<section><strong>${escapeHtml(designMeasureLabel(option))}</strong>${sources.length?sources.map(source=>{const sheet=state.designAssets.find(a=>Number(a.id)===Number(source.sheetAssetId)),cost=designOriginCostCents(design,option,source);return `<div class="design-origin-cost-row">${designSmallImage(sheet||design)}<span><small>${sheet?`Plancha ${Number(sheet.width_cm)||'—'} × ${Number(sheet.height_cm)||'—'} cm · `:''}Diseño ${size}</small></span><strong>${cost===null?'Costo pendiente':money(cost)} / diseño</strong></div>`}).join(''):`<small>Sin origen de plancha registrado${designPrintCostCents(design,option.widthCm,option.heightCm,option.id)===null?' · costo DTF pendiente':` · costo estimado ${money(designPrintCostCents(design,option.widthCm,option.heightCm,option.id))}`}</small>`}</section>`}).join('')}</div>`}
  function designOriginHtml(option){const sources=(option?.sources||[]).slice(0,4);return sources.length?`<span class="design-origin-thumbs">${sources.map(s=>`<a href="${apiUrl(`/api/admin/design-assets/${Number(s.sheetAssetId)}/file`)}" target="_blank" rel="noopener" title="Plancha de origen: ${escapeHtml(s.name||s.fileName||'Abrir plancha')}"><img src="${apiUrl(`/api/admin/design-assets/${Number(s.sheetAssetId)}/file`)}" alt="Plancha de origen" loading="lazy"></a>`).join('')}</span>`:''}
  function renderProductionSelectedDesigns(){
    const host=qs('#productionSelectedDesigns');if(!host)return;
    host.innerHTML=state.productionDesignsSelected.length?`<div class="production-selected-title">Estampas elegidas</div>${state.productionDesignsSelected.map((x,i)=>{
      const d=state.designAssets.find(a=>Number(a.id)===Number(x.designAssetId));if(!d)return'';const option=productionMeasureOptions(d).find(o=>o.id===x.measureOptionId),unitCost=x.unitPrintCostCents??designPrintCostCents(d,x.widthCm,x.heightCm,x.measureOptionId);
      return `<div class="production-selected-row production-design-selected-row" data-production-design-row="${i}"><div class="production-selected-design-main"><button type="button" class="production-design-select" data-select-mockup-layer="design-${i}" title="Seleccionar estampa ${i+1}">${designSmallImage(d)}<strong>#${i+1} · ${escapeHtml(d.name||d.file_name)}</strong></button><small>${escapeHtml(x.measureLabel||`${Number(x.widthCm)||'?'} × ${Number(x.heightCm)||'?'} cm`)}${unitCost===null?'':` · DTF aprox. ${money(unitCost)} / unidad`}</small><div class="production-design-row-actions"><button class="btn btn-ghost production-change-measure" type="button" data-change-production-measure="${d.id}" data-index="${i}">Cambiar medida</button><label class="field production-design-side-field">Aplicar en<select class="select" data-production-design-side data-index="${i}"><option value="front" ${(x.printSide||'front')==='front'?'selected':''}>Frente / lado A</option><option value="back" ${x.printSide==='back'?'selected':''}>Espalda / lado B</option></select></label><button class="btn btn-ghost" type="button" data-copy-production-design="${i}">+ Otra copia</button><button class="link-action" type="button" data-duplicate-production-design="${i}">Agregar a la otra cara</button></div></div><button class="icon-btn" type="button" data-remove-production-design="${i}" aria-label="Quitar estampa ${i+1}">×</button></div>`;
    }).join('')}`:'<p class="muted">Elegí estampas en la galería de arriba. Podés repetir el mismo diseño.</p>';
    renderMockupLayerControls();syncProductionPublicationDefaults();calcProductionBuilderCost();refreshMockupPreview().catch(()=>{});
  }
  function productionBuilderCostData(){
    const finalQty=Math.max(1,Number(qs('#productionQuantity')?.value)||1),waste=Math.max(0,Number(qs('#productionWaste')?.value)||0),stockKind=qs('#productionStockKind')?.value||'physical';
    let materialCost=0,printCost=0;const lines=[],missing=[],warnings=[];
    for(const x of state.productionMaterialsSelected){const m=state.materials.find(a=>Number(a.id)===Number(x.materialId));if(!m)continue;const q=Math.max(.001,Number(x.quantity)||1),line=q*(Number(m.average_cost_cents)||0);materialCost+=line;const need=q*finalQty;if(Number(m.stock_qty)+(Number(state.productionEditingJob?.materials?.find(row=>Number(row.material_id)===Number(m.id))?.quantity_used)||0)+1e-9<need){const msg=`No alcanza ${m.name}: necesitás ${need.toLocaleString('es-AR',{maximumFractionDigits:3})} y hay ${Number(m.stock_qty).toLocaleString('es-AR',{maximumFractionDigits:3})}.`;if(stockKind==='physical')missing.push(msg);else warnings.push(msg)}lines.push(`${m.name}: ${money(line)}`)}
    for(const x of state.productionDesignsSelected){const d=state.designAssets.find(a=>Number(a.id)===Number(x.designAssetId));if(!d)continue;const type=d.print_material_type||'dtf_textile';if(type==='none')continue;const area=(Number(x.widthCm)||Number(d.width_cm)||0)*(Number(x.heightCm)||Number(d.height_cm)||0)*Math.max(1,Number(x.quantity)||1);if(!area){missing.push(`Faltan las medidas del diseño ${d.name}.`);continue}
      const unit=x.unitPrintCostCents??designPrintCostCents(d,Number(x.widthCm),Number(x.heightCm),x.measureOptionId),mat=designPrintMaterial(d);if(unit!==null){const line=unit*Math.max(1,Number(x.quantity)||1)*(1+waste/100);printCost+=line;lines.push(`${d.name}: ${money(line)} · ${Number(x.widthCm)} × ${Number(x.heightCm)} cm`);if(!mat)warnings.push(`Costo de ${d.name} tomado de la plancha; sin stock DTF cargado.`);continue;}
      warnings.push(`Costo DTF pendiente para ${d.name}. Podés guardar y completarlo más tarde.`);
    }
    let capCost=0;const capVisible=!qs('#productionCapPriceBox')?.classList.contains('hidden'),capMaterial=state.materials.find(m=>Number(m.id)===Number(qs('#mockupCapMaterialSelect')?.value));if(capVisible){if(capMaterial){capCost=Number(capMaterial.average_cost_cents)||0;lines.push(`Gorra: ${money(capCost)}`);if(Number(capMaterial.stock_qty)+(Number(state.productionEditingJob?.materials?.find(row=>Number(row.material_id)===Number(capMaterial.id))?.quantity_used)||0)<finalQty){const msg='Revisá el stock de gorras antes de iniciar producción.';if(stockKind==='physical')missing.push(msg);else warnings.push(msg)}}else{const msg='Elegí la materia prima de la gorra para estimar su costo.';if(stockKind==='physical')missing.push(msg);else warnings.push(msg)}}materialCost+=capCost;
    const unitCost=Math.round(materialCost+printCost),baseSale=pesosToCents(qs('#productionSalePrice')?.value||0),capSale=capVisible?pesosToCents(qs('#mockupCapSalePrice')?.value||0):0,sale=baseSale+capSale,profit=sale-unitCost,margin=sale>0?(profit/sale)*100:0;return {unitCost,materialCost:Math.round(materialCost),printCost:Math.round(printCost),baseSale,capSale,capCost,sale,profit,margin,lines,missing,warnings,finalQty,stockKind};
  }
  function calcProductionBuilderCost(){const host=qs('#productionBuilderCost');if(!host)return;const c=productionBuilderCostData();host.innerHTML=`<div><span>Precio total de venta</span><strong>${money(c.sale)}</strong><small>${c.capSale?`Prenda ${money(c.baseSale)} + gorra ${money(c.capSale)}`:'Precio que ingresaste arriba'}</small></div><div><span>Costo materia prima${c.capCost?' (incluye gorra)':''}</span><strong>${money(c.materialCost)}</strong></div><div><span>Costo estampas</span><strong>${money(c.printCost)}</strong></div><div class="production-cost-main"><span>Costo unitario estimado</span><strong>${money(c.unitCost)}</strong></div><div><span>Ganancia estimada por unidad</span><strong class="${c.profit>=0?'profit-positive':'profit-negative'}">${money(c.profit)}</strong><small>${c.sale>0?`${c.margin.toFixed(1)}% sobre venta`:'Ingresá un precio de venta'}</small></div><div><span>Ganancia estimada total</span><strong class="${c.profit>=0?'profit-positive':'profit-negative'}">${money(c.profit*c.finalQty)}</strong><small>${c.finalQty} unidad${c.finalQty===1?'':'es'}</small></div>${c.lines.length?`<small class="production-cost-lines">${c.lines.map(escapeHtml).join(' · ')}</small>`:''}${c.warnings.length?`<div class="notice">${c.warnings.map(escapeHtml).join('<br>')}</div>`:''}${c.missing.length?`<div class="notice danger">${c.missing.map(escapeHtml).join('<br>')}</div>`:''}`;}
  async function loadProductionPriceSuggestion(materialId){if(state.productionPriceDirty||!materialId)return;try{const d=await api(`/api/admin/production/price-suggestion?materialId=${Number(materialId)}`);if(Number(d.price_cents)>0&&!state.productionPriceDirty){const el=qs('#productionSalePrice');if(el){el.value=centsToPesos(d.price_cents);calcProductionBuilderCost();}}}catch{}}
  function productionShippingDefaults(type,capacity=0){
    const cap=Math.max(0,Number(capacity)||0);
    if(type==='shirt')return {weight:250,height:4,width:25,depth:30,label:'Remera doblada'};
    if(type==='chomba')return {weight:320,height:5,width:28,depth:34,label:'Chomba doblada'};
    if(type==='hoodie')return {weight:650,height:12,width:30,depth:38,label:'Buzo doblado'};
    if(type==='cap')return {weight:180,height:12,width:22,depth:24,label:'Gorra protegida'};
    if(type==='mug'){if(cap>=450)return {weight:550,height:14,width:14,depth:14,label:`Taza ${cap||500} ml`};return {weight:420,height:12,width:12,depth:12,label:`Taza ${cap||330} ml`}}
    if(type==='glass'){if(cap>=900)return {weight:550,height:30,width:12,depth:12,label:`Vaso ${cap} ml`};if(cap>=600)return {weight:450,height:26,width:11,depth:11,label:`Vaso ${cap} ml`};return {weight:350,height:22,width:10,depth:10,label:`Vaso ${cap||500} ml`}}
    if(type==='thermos'){if(cap>=900)return {weight:760,height:35,width:11,depth:11,label:`Termo ${cap} ml`};if(cap>=600)return {weight:600,height:32,width:10,depth:10,label:`Termo ${cap} ml`};return {weight:430,height:28,width:9,depth:9,label:`Termo ${cap||500} ml`}}
    if(type==='bag')return {weight:250,height:5,width:30,depth:35,label:'Bolso plegado'};
    return {weight:500,height:10,width:20,depth:30,label:'Estimación editable'};
  }
  function applyProductionShippingDefaults(force=false){
    if(state.productionShippingDirty&&!force)return;
    const primary=productionPrimaryMaterial(),type=qs('#productionMaterialType')?.value||'shirt',cap=Number(primary?.capacity_ml)||Number(qs('#productionCapacity')?.value)||0,d=productionShippingDefaults(type,cap);
    if(qs('#productionCapacity')&&materialUsesCapacity(type))qs('#productionCapacity').value=cap||d.capacity||'';
    for(const [id,key] of [['productionWeight','weight'],['productionHeight','height'],['productionWidth','width'],['productionDepth','depth']]){const el=qs(`#${id}`);if(el&&(force||!el.value))el.value=d[key]}
    const hint=qs('#productionShippingHint');if(hint)hint.textContent=`Sugerido · ${d.label}`;
  }
  function productionProductTitle(){const primary=productionPrimaryMaterial();if(!primary)return '';const designs=uniqOptions(state.productionDesignsSelected.map(item=>state.designAssets.find(asset=>Number(asset.id)===Number(item.designAssetId))?.name).filter(Boolean));return uniqOptions([materialTypeLabel(primary.material_type),primary.fit,...itemFeatures(primary),...designs,Number(primary.capacity_ml)>0?`${Number(primary.capacity_ml)} ml`:''].filter(Boolean)).join(' · ');}
  function syncProductionSaleTitle(){const label=qs('#productionSalePriceLabel');if(label)label.textContent=(qs('#productionProductName')?.value.trim()||productionProductTitle()||materialTypeLabel(qs('#productionMaterialType')?.value||'shirt'))+' · Precio de venta ($)';}
  function syncProductionPublicationDefaults(){const nameInput=qs('#productionProductName'),suggestion=productionProductTitle();if(nameInput&&(!nameInput.value.trim()||nameInput.value===state.productionAutoName)){nameInput.value=suggestion;state.productionAutoName=suggestion;}const primary=productionPrimaryMaterial(),type=qs('#productionMaterialType')?.value||'shirt',cat=state.productionEditingProduct?state.categories.find(c=>Number(c.id)===Number(state.productionEditingProduct.category_id)):productionCategoryGuess(type),catInput=qs('#productionCategory');if(catInput)catInput.value=cat?String(cat.id):'';if(primary&&qs('#productionCapacity')&&Number(primary.capacity_ml)>0&&!qs('#productionCapacity').value)qs('#productionCapacity').value=String(Number(primary.capacity_ml));applyProductionShippingDefaults();syncProductionSaleTitle();}
  function setProductionTab(tab){
    const next=Number(tab)||1,changed=state.productionWizardTab!==next;state.productionWizardTab=next;
    qsa('[data-production-tab]').forEach(b=>b.classList.toggle('active',Number(b.dataset.productionTab)===next));qsa('[data-production-panel]').forEach(p=>p.classList.toggle('hidden',Number(p.dataset.productionPanel)!==next));
    qs('#productionBackBtn')?.classList.toggle('hidden',next!==2);qs('#saveProductionBtn')?.classList.toggle('hidden',next!==2);
    if(next===2){syncProductionPublicationDefaults();renderMediaManager('productionMediaOrderList');}
    if(changed){const reset=()=>{const dialog=qs('#productionDialog');for(const el of [dialog,qs('.dialog-shell',dialog),qs('.production-builder-body',dialog)])if(el)el.scrollTop=0;};reset();requestAnimationFrame(reset);}
  }
  function productionJobImage(job){return state.products.find(p=>Number(p.id)===Number(job.product_id))?.primary_image_url||'';}
  function productionJobPreviewHtml(job){
    const url=productionJobImage(job);return url?`<button type="button" class="production-job-preview checkerboard" data-production-image-preview="${job.id}" aria-label="Ver imagen de ${escapeHtml(job.product_name||'producto')}"><img src="${escapeHtml(url)}" alt="${escapeHtml(job.product_name||'Producto en producción')}" loading="lazy" decoding="async"></button>`:'<span class="production-job-no-image">Sin imagen</span>';
  }
  function openProductionImagePreview(id){
    const job=state.productionJobs.find(j=>Number(j.id)===Number(id)),url=job&&productionJobImage(job);if(!url)return;
    qs('#productionImagePreviewTitle').textContent=job.product_name||'Producto en producción';
    qs('#productionImagePreviewStage').innerHTML=`<img src="${escapeHtml(url)}" alt="${escapeHtml(job.product_name||'Producto')}"><button type="button" class="btn btn-primary" data-edit-production-mount="${job.id}">Editar montaje</button>`;
    qs('#productionImagePreviewDialog').showModal();
  }
  function productionPageHeader(section){
    return `<div class="production-page-toolbar"><nav class="production-section-tabs" aria-label="Secciones de Producción"><button type="button" class="btn ${section==='jobs'?'btn-primary':'btn-ghost'}" data-production-section="jobs" aria-current="${section==='jobs'?'page':'false'}">Producción</button><button type="button" class="btn ${section==='photos'?'btn-primary':'btn-ghost'}" data-production-section="photos" aria-current="${section==='photos'?'page':'false'}">Fotos de montaje</button></nav><div class="admin-actions production-page-actions">${section==='photos'?'<button class="btn btn-primary" type="button" id="newMontagePhotosBtn">+ Subir foto</button>':'<button class="btn btn-ghost" id="productionAddMaterialBtn">+ Materia prima</button><button class="btn btn-primary" id="newProductionBtn">+ Armar producto</button>'}</div></div>`;
  }
  function renderProductionPhotosPage(){
    const filter=state.productionPhotoFilter??={search:'',category:'',model:'',cut:'',color:''},select=(id,key,label,values)=>`<label class="field">${label}<select class="select" id="${id}" data-montage-filter="${key}"><option value="">Todos</option>${[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true})).map(v=>`<option value="${escapeHtml(v)}" ${filter[key]===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></label>`;
    const variants=state.mockupAssets.map(mockupPhotoVariant).filter(Boolean),hasCuts=state.mockupAssets.some(mockupHasGarmentCut),hasVariants=state.mockupAssets.some(a=>!mockupHasGarmentCut(a)&&mockupPhotoVariant(a)),variantLabel=hasCuts&&hasVariants?'Corte / variante':hasCuts?'Corte':'Variante';
    if(!variants.includes(filter.cut))filter.cut='';
    qs('#adminContent').innerHTML=`${productionPageHeader('photos')}<div class="montage-filter-toolbar"><details class="montage-filter-popover"><summary class="btn btn-ghost">Filtrar</summary><div class="montage-photo-filters"><label class="field">Buscar<input class="input" type="search" id="montagePhotoSearch" value="${escapeHtml(filter.search||'')}" placeholder="Modelo, prenda, color o nombre"></label><label class="field">Fotos<select class="select" id="montagePhotoCategory"><option value="">Todas</option>${['Persona','Producto','Fondo'].map(x=>`<option value="${x}" ${filter.category===x?'selected':''}>${x==='Persona'?'Modelos':x==='Producto'?'Productos':'Fondos'}</option>`).join('')}</select></label>${select('montagePhotoModel','model','Modelo / producto',state.mockupAssets.filter(a=>a.asset_type!=='background').map(a=>a.model_name||a.name))}${select('montagePhotoCut','cut',variantLabel,variants)}${select('montagePhotoColor','color','Color',state.mockupAssets.map(a=>a.color))}<div class="admin-actions montage-filter-actions"><button type="button" class="btn btn-ghost" id="clearMontagePhotoFilters">Limpiar filtros</button></div></div></details><button type="button" class="icon-btn" data-toggle-montage-groups aria-label="Comprimir fotos">⌃</button><small class="muted" id="productionPhotosCount"></small></div><div id="productionPhotosGallery"></div>`;
    const toolbar=qs('.production-page-toolbar'),filters=qs('.montage-filter-toolbar');toolbar.insertBefore(filters,qs('.production-page-actions',toolbar));renderProductionPhotos();
  }
  async function openProductionJobEdit(id){
    const job=state.productionJobs.find(j=>Number(j.id)===Number(id));if(!job)throw new Error('Producción no encontrada.');state.editingProductionJob=job;
    qs('#productionEditTitle').textContent=job.product_name;qs('#productionEditPreview').innerHTML=productionJobPreviewHtml(job);
    qs('#productionEditQuantity').value=String(job.quantity);qs('#productionEditNotes').value=job.notes||'';
    const started=parseAdminDate(job.started_at)||new Date();qs('#productionEditDate').value=today(started);qs('#productionEditTime').value=adminTimeFormatter.format(started).slice(0,5);
    qs('#productionEditVariant').textContent=[job.color,job.size,job.fit].filter(Boolean).join(' · ')||'Única';qs('#productionEditCost').textContent=money(job.unit_cost_cents);qs('#productionEditStatus').textContent=job.status==='completed'?'Terminado':job.status==='cancelled'?'Cancelado':'En producción';qs('#productionEditDialog').showModal();
  }
  async function saveProductionJobEdit(){
    const job=state.editingProductionJob;if(!job)throw new Error('Producción no encontrada.');
    const quantity=Number(qs('#productionEditQuantity').value),day=qs('#productionEditDate').value,time=qs('#productionEditTime').value,previous=parseAdminDate(job.started_at);
    if(!Number.isSafeInteger(quantity)||quantity<1)throw new Error('Ingresá una cantidad entera mayor que cero.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(time))throw new Error('Completá la fecha y hora.');
    const unchanged=previous&&today(previous)===day&&adminTimeFormatter.format(previous).slice(0,5)===time,started=unchanged?job.started_at:new Date(`${day}T${time}:00-03:00`);
    if(!unchanged&&(!Number.isFinite(started.getTime())||today(started)!==day))throw new Error('Ingresá una fecha válida.');
    const data=await api(`/api/admin/production/${job.id}`,{method:'PATCH',body:JSON.stringify({quantity,notes:qs('#productionEditNotes').value,startedAt:unchanged?started:started.toISOString(),expectedRevision:Number(job.revision)||0})});
    Object.assign(job,data.item);state.costingLoaded=false;qs('#productionEditDialog').close();toast('Producción actualizada','success');await renderProduction();
  }
  function productionSavedProductsHtml(){const ids=new Set(state.productionJobs.map(j=>Number(j.product_id))),products=state.products.filter(p=>Number(p.has_production_recipe)&&!ids.has(Number(p.id)));if(!products.length)return '';return `<section class="admin-section"><h3>Productos armados</h3><div class="montage-photo-grid">${products.map(p=>`<article class="montage-photo-card">${p.primary_image_url?`<button class="montage-photo-thumb checkerboard" type="button" data-edit-product-mount="${p.id}"><img src="${escapeHtml(p.primary_image_url)}" alt="${escapeHtml(p.name)}" loading="lazy"></button>`:''}<div class="montage-photo-info"><strong>${escapeHtml(p.name)}</strong><div class="admin-actions"><button type="button" class="btn btn-ghost" data-edit-product-mount="${p.id}">Editar montaje</button><button type="button" class="icon-btn" data-delete-production-product="${p.id}" aria-label="Eliminar producto armado"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></div></div></article>`).join('')}</div></section>`;}
  async function renderProduction(){const seq=state.productionPageSeq=(state.productionPageSeq||0)+1;if(state.productionSection==='photos'){await loadMockupAssets();if(seq===state.productionPageSeq)renderProductionPhotosPage();return;}const [jobs,products]=await Promise.all([api('/api/admin/production'),api('/api/admin/products')]);if(seq!==state.productionPageSeq)return;state.productionJobs=jobs.items||[];state.products=products.items||[];const active=state.productionJobs.filter(x=>x.status==='in_progress');qs('#adminContent').innerHTML=`${productionPageHeader('jobs')}<div class="kpi-grid"><div class="kpi"><small>En producción</small><strong>${active.reduce((s,x)=>s+Number(x.quantity||0),0)}</strong></div><div class="kpi"><small>Trabajos en curso</small><strong>${active.length}</strong></div></div><section class="admin-section"><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Imagen</th><th>Producto</th><th>Variante</th><th>Cantidad</th><th>Costo unitario</th><th>Estado</th></tr></thead><tbody>${state.productionJobs.length?state.productionJobs.map(j=>`<tr><td>${productionJobPreviewHtml(j)}</td><td><strong>${escapeHtml(j.product_name)}</strong><small class="table-sub">${adminDateTimeHtml(j.started_at)}</small></td><td class="production-variant-actions"><span>${escapeHtml([j.color,j.size,j.fit].filter(Boolean).join(' · ')||'Única')}</span><div class="admin-actions"><button type="button" class="btn btn-ghost" data-edit-production-mount="${j.id}">Editar montaje</button><button type="button" class="btn btn-ghost" data-edit-production="${j.id}">Editar datos</button>${j.status==='in_progress'?`<button class="btn btn-primary" data-complete-production="${j.id}">Marcar terminado</button><button class="btn btn-danger" data-cancel-production="${j.id}">Cancelar</button>`:''}<button type="button" class="btn btn-danger small-delete" data-delete-production="${j.id}">Eliminar</button></div></td><td>${Number(j.quantity)||0}</td><td>${money(j.unit_cost_cents)}</td><td><span class="status ${j.status==='completed'?'success':j.status==='cancelled'?'danger':'warning'}">${j.status==='completed'?'Terminado':j.status==='cancelled'?'Cancelado':'En producción'}</span></td></tr>`).join(''):'<tr><td colspan="6">Todavía no hay productos en producción.</td></tr>'}</tbody></table></div></section>${productionSavedProductsHtml()}`;}
  async function openProductionDialog(showDialog=true){state.productionAutoName='';delete state.mockupPreferredBaseId;delete state.mockupPreferredBackgroundId;state.productionEditingProduct=null;state.productionEditingJob=null;state.productionCreatedProductId=null;state.productionCreatedJobId=null;state.productionSavedPhotoBases=[];state.productionMountViews={};state.mockupVisibleLayerIds=null;state.productionRemovedMediaIds=[];state.productionMountRevision=0;state.productionMountSaveToken=crypto.randomUUID();state.productionLimitMaterialPhotos=true;qs('#productionDialogTitle').textContent='Armar producto terminado';qs('#saveProductionBtn').textContent='Guardar producto';qs('#productionStockNote').textContent='Stock físico descuenta la materia prima al iniciar producción. “A stockear” guarda la receta sin consumirla todavía.';await Promise.all([ensureCategories(),ensureCostingData(),loadMockupAssets(),api('/api/admin/products').then(d=>{state.products=d.items||[]})]);syncProductionCustomTypes();state.productionMaterialsSelected=[];state.productionDesignsSelected=[];state.mockupCapDesign=null;state.mockupSelectedLayer='';state.productionPriceDirty=false;state.productionShippingDirty=false;state.mediaItems=[];state.newFiles=[];state.mediaHostId='productionMediaOrderList';qs('#productionQuantity').value='1';qs('#productionWaste').value='10';qs('#productionSalePrice').value='';qs('#productionNotes').value='';qs('#productionProductName').value='';qs('#productionCategory').value='';qs('#productionStockKind').value='physical';qs('#productionStatus').value='draft';state.mockupVariantFilters={};state.mockupPointer=null;state.mockupTool='move';state.mockupCalibration=null;state.productionMeasureEditIndex=null;qs('#mockupBaseSelect').value='';qs('#mockupBackgroundSelect').value='';qs('#mockupCapSalePrice').value='';qs('#mockupCapMaterialSelect').value='';state.mockupZoom=1;state.mockupPanX=0;state.mockupPanY=0;applyMockupZoom();['productionDescription','productionMeaning','productionVerse','productionVerseReference','productionCapacity','productionWeight','productionHeight','productionWidth','productionDepth'].forEach(id=>{const el=qs(`#${id}`);if(el)el.value=''});['productionIsNew','productionFeatured','productionBestseller'].forEach(id=>{const el=qs(`#${id}`);if(el)el.checked=false});renderProductionMaterialGallery();renderProductionSelectedMaterials();renderProductionDesignGallery();renderProductionSelectedDesigns();renderMockupStudioOptions();refreshMockupPreview().catch(()=>{});applyProductionShippingDefaults(true);renderProductionVariantStock();setProductionTab(1);if(showDialog)qs('#productionDialog')?.showModal();applyMockupZoom();}
  async function ensureProductionPreviewMedia(){
    snapshotActiveMockupView();for(const view of Object.values(state.productionMountViews||{}))if(view.included)await captureMockupView(view.baseId);
  }
  async function saveProductionBuilder(){
    const variantUpdates=productionVariantUpdates(),primary=productionPrimaryMaterial(),type=qs('#productionMaterialType')?.value||'shirt',stockKind=qs('#productionStockKind')?.value||'physical',qty=Math.max(1,Number(qs('#productionQuantity')?.value)||1),name=String(qs('#productionProductName')?.value||'').trim(),cost=productionBuilderCostData();
    if(!state.productionMaterialsSelected.length&&!state.productionEditingProduct)throw new Error('Elegí al menos una materia prima.');if(stockKind==='physical'&&!state.productionEditingProduct&&cost.missing.length)throw new Error(cost.missing[0]);if(!name)throw new Error('Completá el nombre del producto.');if(cost.sale<=0)throw new Error('Ingresá el precio de venta.');
    const cat=await ensureProductionCategory(type);if(!cat?.id)throw new Error('No pude determinar la categoría del producto.');
    const capMaterialId=!qs('#productionCapPriceBox')?.classList.contains('hidden')?Number(qs('#mockupCapMaterialSelect')?.value)||0:0,categoryId=Number(cat.id),recipe={baseMaterialType:state.productionMaterialsSelected.length?'':state.productionEditingProduct?.recipe?.base_material_type||'',baseMaterialName:state.productionMaterialsSelected.length?'':state.productionEditingProduct?.recipe?.base_material_name||'',wastePercent:Math.max(0,Number(qs('#productionWaste')?.value)||0),extraCostCents:Number(state.productionEditingProduct?.recipe?.extra_cost_cents)||0,designs:state.productionDesignsSelected.map(x=>({designAssetId:Number(x.designAssetId),quantity:Number(x.quantity)||1,widthCm:Number(x.widthCm)||0,heightCm:Number(x.heightCm)||0,measureOptionId:x.measureOptionId||'',measureLabel:x.measureLabel||'',printSide:x.printSide||'front',unitPrintCostCents:x.unitPrintCostCents??null})),materials:[...state.productionMaterialsSelected.map(x=>({materialId:Number(x.materialId),quantity:Number(x.quantity)||1})),...(capMaterialId?[{materialId:capMaterialId,quantity:1}]:[])]};
    const variant={color:primary?.color||'',size:materialIsGarment(type)?(primary?.size||''):'',stock:stockKind==='to_stock'?qty:0,stockKind,sku:''};
    const variants=[variant];if(materialIsGarment(type)&&['S','M','L','XL','XXL'].includes(variant.size))variants.push(...defaultVariantsForMode('sized',variant.color).filter(v=>v.size!==variant.size));
    const payload={name,category_id:categoryId,status:qs('#productionStatus')?.value||'draft',price_cents:cost.sale,compare_at_cents:0,cost_cents:cost.unitCost,recipe,short_description:qs('#productionDescription')?.value||'',meaning_text:qs('#productionMeaning')?.value||'',verse_text:qs('#productionVerse')?.value||'',verse_reference:qs('#productionVerseReference')?.value||'',fit:primary?.fit||'',audience:primary?.gender||'',sale_mode:'stock',inventory_stage:'to_print',garment_ready:1,print_ready:state.productionDesignsSelected.length?1:0,capacity_ml:Number(qs('#productionCapacity')?.value)||Number(primary?.capacity_ml)||0,is_new:qs('#productionIsNew')?.checked?1:0,is_featured:qs('#productionFeatured')?.checked?1:0,is_bestseller:qs('#productionBestseller')?.checked?1:0,weight_grams:Number(qs('#productionWeight')?.value)||0,height_cm:Number(qs('#productionHeight')?.value)||0,width_cm:Number(qs('#productionWidth')?.value)||0,depth_cm:Number(qs('#productionDepth')?.value)||0,variants};
    await ensureProductionPreviewMedia();
    const editing=state.productionEditingProduct;let productId=Number(editing?.id||state.productionCreatedProductId)||0;
    if(!productId){const created=await api('/api/admin/products',{method:'POST',body:JSON.stringify(payload)});productId=Number(created.item.id);state.productionCreatedProductId=productId;}
    const orderedIds=await persistProductionBuilderMedia(productId);
    const mounted=await api(`/api/admin/products/${productId}/production-mount`,{method:'PATCH',body:JSON.stringify({mount:collectProductionMount(),saveToken:state.productionMountSaveToken,expectedMountRevision:state.productionMountRevision||0,jobId:state.productionEditingJob?.id||0,expectedJobRevision:state.productionEditingJob?.revision,quantity:editing&&!state.productionEditingJob?undefined:qty,variantUpdates,notes:qs('#productionNotes').value,recipe,product:payload,mediaIds:orderedIds,removeMediaIds:state.productionRemovedMediaIds||[]})});state.productionMountRevision=Number(mounted.revision);if(state.productionEditingJob&&mounted.jobRevision!==null)state.productionEditingJob.revision=Number(mounted.jobRevision);
    if(!editing&&stockKind==='physical'&&!state.productionCreatedJobId){const pd=await api(`/api/admin/products/${productId}`),variantId=Number(pd.item?.variants?.[0]?.id);if(!variantId)throw new Error('No se pudo crear la variante del producto.');const job=await api('/api/admin/production',{method:'POST',body:JSON.stringify({productId,variantId,quantity:qty,notes:qs('#productionNotes')?.value||''})});state.productionCreatedJobId=Number(job.item.id);}
    state.costingLoaded=false;return {productId,stockKind,edited:Boolean(state.productionEditingProduct)};
  }
  function materialColorName(color){return uniqOptions([...purchaseColorOptions(),...(state.mockupCatalog?.colors||[])]).find(name=>previewColor(colorSwatch(name))===previewColor(color))||color;}
  function openPurchaseColorDialog(row,button=qs(`[data-open-purchase-color="${row}"]`)){
    const item=state.purchaseItems[row];if(!item||!button)return;const parent=button.closest('[data-purchase-row]');if(parent)syncPurchaseRowFromDom(parent);
    const original=item.color||'',dot=qs('.color-dot',button),label=qs('span:nth-child(2)',button);
    window.SalmosColors.open(button,{value:colorSwatch(original),swatches:purchaseColorOptions().map(colorSwatch),clearLabel:'Sin color',preview:value=>{dot?.style.setProperty('--swatch',value||'transparent');if(label)label.textContent=materialColorName(value)||'Elegí un color';},save:(value,name)=>{
      if(parent)syncPurchaseRowFromDom(parent);item.color=name||materialColorName(value);item._custom??={};item._custom.color=false;if(label)label.textContent=item.color||'Elegí un color';dot?.style.setProperty('--swatch',value||'transparent');const title=qs('[data-purchase-item-title]',parent);if(title)title.textContent=purchaseItemTitle(item,row);if(item.color)addPurchaseOption('colors',item.color);refreshPurchasePhotoField(row);persistAdminOptionSettings().catch(err=>toast(err.message,'error'));
    }});
  }
  function openMaterialFieldColor(button){
    const field=button.closest('.salmos-color-field'),input=qs('[data-material-field="color"]',field);if(!input)return;button=qs('button[data-material-color-palette]',field)||button;const original=input.value;
    window.SalmosColors.open(button,{value:colorSwatch(original),swatches:purchaseColorOptions().map(colorSwatch),clearLabel:'Sin color',preview:value=>button.style.setProperty('--color-swatch',value||'transparent'),save:(value,name)=>{input.value=name||materialColorName(value);input.dispatchEvent(new Event('change',{bubbles:true}));button.style.setProperty('--color-swatch',value||'transparent');}});
  }
  function openMockupColorPalette(button){
    const field=button.closest('.salmos-color-field'),input=qs('[data-mockup-field="color"]',field);if(!input)return;button=qs('button[data-mockup-palette]',field)||button;
    window.SalmosColors.open(button,{value:colorSwatch(input.value),swatches:mockupColorChoices().map(colorSwatch),clearLabel:'Sin color',preview:value=>button.style.setProperty('--color-swatch',value||'transparent'),save:(value,name)=>{input.value=name||materialColorName(value);input.dispatchEvent(new Event('change',{bubbles:true}));button.style.setProperty('--color-swatch',value||'transparent');captureMockupQueue();}});
  }
  function closePurchaseColorDialog(){qs('#purchaseColorDialog')?.close();state.colorEditorRow=null;}
  function openOtherEditor({row,field,label,kind='value'}){state.otherEditor={row:Number(row),field,label,kind};const d=qs('#otherValueDialog');if(!d)return;qs('#otherValueTitle').textContent=`Agregar ${label}`;qs('#otherValueInput').value='';d.showModal();setTimeout(()=>qs('#otherValueInput')?.focus(),30);}
  function saveOtherEditor(){const o=state.otherEditor,v=normalizeOption(qs('#otherValueInput')?.value||'');if(!o||!v)return;if(o.kind==='finance'){qs('#movementCategoryOther').value=v;rememberFinanceReason(v);renderFinanceReasonSelector(v);}else{const x=state.purchaseItems[o.row];if(!x)return;if(o.field==='customTypeLabel'){const code=safeCustomTypeCode(v);x.materialType=code;if(!customTypeEntries().some(t=>t.code===code))state.purchaseOptions.types.push({code,label:v});}else{x[o.field]=v;if(o.field==='fit')addPurchaseOption('fits',v);else if(o.field==='materialClass')addPurchaseOption('classes',v);else if(o.field==='size')addPurchaseOption('sizes',v,normalizePurchaseClass(x.materialClass)||'OTROS');else if(o.field==='color')addPurchaseOption('colors',v);else if(o.field==='name')addPurchaseOption('materials',v,x.materialType);}renderPurchaseItems();persistAdminOptionSettings().catch(()=>{});}qs('#otherValueDialog')?.close();state.otherEditor=null;}

  function financeReasonOptions(current=''){return uniqOptions([...FINANCE_BASIC_REASONS,...(state.purchaseOptions.financeReasons||[]),...(state.recentFinanceReasons||[]),current])}
  function renderFinanceReasonSelector(current=''){
    const select=qs('#movementCategorySelect'),input=qs('#movementCategoryOther');if(!select||!input)return;
    const options=financeReasonOptions(current),known=options.some(v=>v.toLocaleLowerCase('es')===String(current||'').toLocaleLowerCase('es'));
    select.innerHTML='<option value="">Elegir motivo...</option>'+options.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')+'<option value="__other__">＋ Otro...</option>';
    if(current){select.value=known?current:'';input.value=current;}else{select.value='';input.value='';}
    input.classList.add('hidden');
  }
  async function rememberFinanceReason(value){value=normalizeOption(value);if(!value||FINANCE_BASIC_REASONS.includes(value))return;addPurchaseOption('financeReasons',value);try{await persistAdminOptionSettings()}catch{}}

  function financePaymentDetail(m){
    const method=m.payment_method||'',label={cash:'Efectivo',transfer:'Transferencia',mixed:'Efectivo + transferencia'}[method]||'Sin especificar';
    let payments=m.payments||[];if(!payments.length){try{payments=JSON.parse(m.payment_json||'[]')}catch{}}
    const details=payments.map(p=>[p.method==='transfer'?'Transferencia':'Efectivo',money(p.amountCents??p.amount_cents),p.origin,p.destination,p.reference,p.details].filter(Boolean).map(escapeHtml).join(' · ')).join('<br>');
    return `<strong>${label}</strong>${Number(m.surcharge_cents)>0?`<small class="table-sub">Base ${money(m.base_cents)} + recargo ${m.surcharge_type==='percent'?`${Number(m.surcharge_value)}% · `:''}${money(m.surcharge_cents)}</small>`:''}${details?`<details class="finance-row-detail"><summary>Ver pago</summary><div>${details}</div></details>`:''}`;
  }


  function setMovementReadOnly(readOnly){
    const form=qs('#movementForm');state.movementReadOnly=readOnly;
    qsa('.dialog-body input,.dialog-body select,.dialog-body textarea,#movementSaleSection button',form).forEach(el=>el.disabled=readOnly);
    qs('#saveMovementBtn').classList.toggle('hidden',readOnly);qs('#editViewedMovementBtn').classList.toggle('hidden',!readOnly);
    qs('#movementAttachmentUpload').classList.toggle('hidden',readOnly);
    qs('#movementDialogTitle').textContent=readOnly?'Detalle del movimiento':'Editar ingreso / egreso';
    state.editingMovementId=readOnly?null:state.viewingMovementId;
  }
  async function openSourcePurchase(id){
    let purchase=state.purchases.find(x=>Number(x.id)===Number(id));
    if(!purchase){const r=reportRangeDates(),data=await api(`/api/admin/purchases?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);purchase=(data.items||[]).find(x=>Number(x.id)===Number(id));}
    if(!purchase)throw new Error('No encontramos la compra en el período seleccionado.');await openPurchaseDialog(purchase);
  }
  async function openMovementDialog(id,readOnly=false){
    const m=(state.financeMovements||[]).find(x=>Number(x.id)===id);if(!m)return;
    await ensureAdminOptionSettings();const form=qs('#movementForm');setMovementReadOnly(false);form.reset();state.viewingMovementId=id;state.movementOriginalOccurredAt=m.occurred_at||null;
    form.elements.type.value=m.type==='income'?'income':'expense';renderFinanceReasonSelector(m.category||'');form.elements.description.value=m.description||'';
    form.elements.origin.value=m.origin||'';form.elements.destination.value=m.destination||'';loadMovementPayment(m);await loadMovementSale(m);form.elements.date.value=today(parseAdminDate(m.occurred_at)||new Date());
    qs('#movementExistingAttachments').innerHTML=(m.attachments||[]).map(a=>`<a class="btn btn-ghost" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">Abrir comprobante</a>`).join('');
    setMovementReadOnly(readOnly||m.source_kind==='purchase');qs('#editViewedMovementBtn').textContent='Editar';qs('#movementDialog').showModal();
  }

  function openMovementReview(id){
    const m=(state.financeMovements||[]).find(x=>Number(x.id)===Number(id));if(!m)return;
    const dialog=ensureAdminDialog('movementReviewDialog','Detalle del movimiento');
    qs('.dialog-body',dialog).innerHTML=`<div class="movement-review-card"><header><span class="status ${m.type==='income'?'success':'warning'}">${m.type==='income'?'Ingreso':m.type==='investment'?'Inversión':'Egreso'}</span><strong>${money(m.amount_cents)}</strong></header><div>${adminDateTimeHtml(m.occurred_at)}</div><h3>${escapeHtml(m.category||'Movimiento')}</h3>${m.description?`<p>${escapeHtml(m.description)}</p>`:''}<dl><dt>Origen</dt><dd>${escapeHtml(m.origin||'—')}</dd><dt>Destino</dt><dd>${escapeHtml(m.destination||'—')}</dd></dl>${financePaymentDetail(m)}${m.notes?`<p>${escapeHtml(m.notes)}</p>`:''}${(m.saleItems||[]).length?`<section><h4>Productos vendidos</h4>${m.saleItems.map(x=>`<div>${escapeHtml([x.product_name||x.name,x.variant_label||x.label].filter(Boolean).join(' · '))} × ${Number(x.quantity)} · ${money(x.unit_price_cents??x.unitPriceCents)}</div>`).join('')}</section>`:''}<div class="movement-review-attachments">${(m.attachments||[]).map(a=>`<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.url)}" alt="Comprobante"></a>`).join('')}</div><footer><button type="button" class="btn btn-ghost" data-edit-reviewed-movement="${m.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Editar</button></footer></div>`;dialog.showModal();
  }
  async function renderExpenses(){
    const r=reportRangeDates(),d=await api(`/api/admin/finance?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`),s=d.summary||{};state.financeMovements=d.movements||[];state.recentFinanceReasons=uniqOptions((d.movements||[]).map(m=>m.category));
    qs('#adminContent').innerHTML=`<div class="admin-section-head expenses-head">${reportDatePopoverHtml()}<button class="btn btn-primary" id="newMovementBtn">+ Movimiento manual</button></div><div class="kpi-grid"><div class="kpi"><small>Egresos</small><strong>− ${money(s.expensesCents)}</strong></div><div class="kpi"><small>Otros ingresos</small><strong>${money(s.extraIncomeCents)}</strong></div><div class="kpi"><small>Ventas</small><strong>${money(s.productSalesCents)}</strong></div><div class="kpi"><small>Balance</small><strong>${money(s.balanceCents)}</strong></div></div><section class="finance-compact-list">${state.financeMovements.map(m=>`<article class="finance-compact-row"><button type="button" class="finance-row-open" data-open-movement="${m.id}"><span>${adminDateTimeHtml(m.occurred_at)}<small>${m.type==='income'?'Ingreso':m.type==='investment'?'Inversión':'Egreso'}</small></span><span><strong>${escapeHtml(m.category||'Movimiento')}</strong><small>${escapeHtml(m.description||'')}</small></span><span><small>${escapeHtml([m.origin,m.destination].filter(Boolean).join(' → '))}</small><strong class="${m.type==='income'?'':'money-negative'}">${m.type==='income'?'':'− '}${money(m.amount_cents)}</strong></span></button><button type="button" class="icon-btn" data-delete-movement="${m.id}" aria-label="Eliminar movimiento"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></article>`).join('')||'<p>Sin movimientos.</p>'}</section>`;
  }

  function customOrderDesignSummary(o){
    let selected=[];try{selected=JSON.parse(o.selected_designs_json||'[]')}catch{}
    const selectedHtml=(Array.isArray(selected)&&selected.length)?`<div class="notice"><b>Diseños SALMOS elegidos:</b><br>${selected.map(d=>escapeHtml(d.name||`#${d.id}`)).join(' · ')}</div>`:'';
    if(o.kind!=='dtf')return selectedHtml;
    let designs=[];try{designs=JSON.parse(o.designs_json||'[]')}catch{}
    const list=(Array.isArray(designs)?designs:[]).map(d=>`${escapeHtml(d.label||'Diseño')}: ${Number(d.widthCm)||30}×${Number(d.heightCm)||30} cm × ${Number(d.quantity)||1}`).join('<br>');
    const mode=o.design_mode==='different'?'Diseños diferentes':o.design_mode==='same_sizes'?'Mismo diseño · diferentes medidas':'Mismo diseño';
    const sheets=o.subtype==='sheet'?`<br><b>Metros/planchas:</b> solicitados ${Number(o.requested_sheets)||0} · estimados ${Number(o.estimated_sheets)||Number(o.sheets)||0}`:'';
    return `${selectedHtml}<div class="notice"><b>${mode}</b>${list?`<br>${list}`:''}${sheets}${o.subtype==='sheet'?'<br><small>El metraje final queda sujeto al acomodo real de los diseños.</small>':''}</div>`;
  }

  async function renderCustomOrders(){
    const d=await api('/api/admin/custom-orders');state.customOrders=d.items||[];
    const statusLabel={new:'Nuevo',quoted:'Cotizado',deposit_pending:'Esperando seña',confirmed:'Confirmado',preparing:'Preparando',ready:'Listo',delivered:'Entregado',cancelled:'Cancelado'};
    qs('#adminContent').innerHTML=`
      <div class="custom-orders-admin">${state.customOrders.length?state.customOrders.map(o=>`<article class="settings-card custom-admin-card" data-custom-order="${o.id}">
        <div class="admin-section-head"><div><strong>${escapeHtml(o.code)}</strong><div class="muted">${escapeHtml(o.customer_name)} · ${escapeHtml(o.customer_phone)}</div></div><span class="status warning">${escapeHtml(statusLabel[o.status]||o.status)}</span></div>
        <div class="custom-admin-grid"><div><b>Tipo</b><br>${o.kind==='dtf'?'DTF':'Ropa'} · ${escapeHtml(o.subtype||'')}</div><div><b>Diseño</b><br>${escapeHtml(o.design_source||'—')}</div><div><b>Modo archivo</b><br>${escapeHtml(o.file_mode||'—')}</div><div><b>Cantidad</b><br>${Number(o.quantity)||1}</div><div><b>Total cotizado</b><br>${Number(o.quoted_total_cents)?money(o.quoted_total_cents):'Pendiente'}</div><div><b>Seña 50%</b><br>${Number(o.deposit_cents)?money(o.deposit_cents):'Pendiente'}</div></div>
        ${customOrderDesignSummary(o)}
        ${o.notes?`<div class="notice">${escapeHtml(o.notes)}</div>`:''}
        <div class="admin-actions">${(o.files||[]).map(f=>`<a class="btn btn-ghost" href="${apiUrl(`/api/admin/custom-orders/${o.id}/files/${f.id}`)}" target="_blank" rel="noopener">Descargar ${escapeHtml(f.file_name)}</a>`).join('')||'<span class="muted">Sin archivos</span>'}</div>
        <div class="form-grid" style="margin-top:12px"><div class="field"><label>Total acordado ($)</label><input class="input" data-custom-total type="number" min="0" value="${Math.round((Number(o.quoted_total_cents)||0)/100)}"></div><div class="field"><label>Estado</label><select class="select" data-custom-status>${Object.entries(statusLabel).map(([v,l])=>`<option value="${v}" ${o.status===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field" style="align-self:end"><button class="btn btn-primary" data-save-custom="${o.id}">Guardar</button></div></div>
      </article>`).join(''):'<div class="empty-state"><strong>Todavía no hay pedidos.</strong></div>'}</div>`;
  }
  function flyerGalleryCard(f){
    const mime=String(f.mime_type||'');
    const media=mime.startsWith('image/')?`<img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.title||'Flyer')}" loading="lazy">`:mime.startsWith('video/')?`<video src="${escapeHtml(f.url)}" muted playsinline preload="metadata"></video>`:`<div class="flyer-file-icon">PDF</div>`;
    return `<button type="button" class="flyer-gallery-card" data-open-flyer="${f.id}" title="${escapeHtml(f.title||f.file_name||'Flyer')}"><div class="flyer-gallery-media">${media}</div>${Number(f.public)?'<span class="flyer-public-dot" title="Público"></span>':''}</button>`;
  }
  async function renderFlyers(){
    const d=await api('/api/admin/flyers');state.flyers=d.items||[];
    qs('#adminContent').innerHTML=`<div class="admin-section-head"><div><h2 style="margin:0">Flyers</h2></div><button class="btn btn-primary" type="button" id="openFlyerUploadBtn">+ Subir flyer</button></div><section class="admin-section"><div class="horizontal-gallery-shell"><button type="button" class="gallery-arrow gallery-arrow-left" data-scroll-target="flyerAdminGallery" data-scroll-dir="-1" aria-label="Anterior">‹</button><div class="flyer-gallery-horizontal" id="flyerAdminGallery">${state.flyers.length?state.flyers.map(flyerGalleryCard).join(''):'<div class="empty-state"><strong>Sin flyers todavía.</strong></div>'}</div><button type="button" class="gallery-arrow gallery-arrow-right" data-scroll-target="flyerAdminGallery" data-scroll-dir="1" aria-label="Siguiente">›</button></div></section>`;
  }
  function openFlyerDetail(id){
    const f=state.flyers.find(x=>Number(x.id)===Number(id));if(!f)return;state.activeFlyerId=Number(f.id);
    const mime=String(f.mime_type||''),stage=qs('#flyerDetailPreview');
    stage.innerHTML=mime.startsWith('image/')?`<img src="${escapeHtml(f.url)}" alt="">`:mime.startsWith('video/')?`<video src="${escapeHtml(f.url)}" controls playsinline></video>`:`<a class="btn btn-ghost" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">Abrir PDF</a>`;
    qs('#flyerDetailHeading').textContent=f.title||f.file_name||'Flyer';qs('#flyerDetailTitle').value=f.title||'';qs('#flyerDetailSort').value=Number(f.sort_order)||0;qs('#flyerDetailPublic').checked=Boolean(Number(f.public));qs('#flyerDetailDialog')?.showModal();
  }

  const DESIGN_USES=['Todos','Remeras','Tazas','Mates','Gorras','Chombas','Buzos','Vasos','Termos','Bolsos','Otros'];
  function designKindLabel(a){return a.kind==='sheet'?'Plancha':'Individual'}
  function designScopeLabel(a){return a.scope==='clients'?'Clientes':a.scope==='salmos'?'SALMOS':'Planchas mixtas'}
  function parseDesignUses(a){try{return Array.isArray(a.uses)?a.uses:JSON.parse(a.uses_json||'[]')}catch{return []}}
  function parseDesignUseMeasures(a){try{return a.use_measures&&typeof a.use_measures==='object'?a.use_measures:JSON.parse(a.use_measures_json||'{}')}catch{return {}}}
  function parseDesignMeasureOptions(a={}){
    let options=[];try{options=Array.isArray(a.measure_options)?a.measure_options:JSON.parse(a.measure_options_json||'[]')}catch{}
    if(options.length)return options;
    const legacy=Object.entries(parseDesignUseMeasures(a)).filter(([,m])=>Number(m?.widthCm)>0&&Number(m?.heightCm)>0).map(([destination,m],i)=>({id:`legacy-${i}`,destination,size:'',detail:'',widthCm:Number(m.widthCm),heightCm:Number(m.heightCm)}));
    if(Number(a.width_cm)>0&&Number(a.height_cm)>0)for(const destination of parseDesignUses(a))if(!legacy.some(x=>x.destination===destination))legacy.push({id:`legacy-${legacy.length}`,destination,size:'',detail:'',widthCm:Number(a.width_cm),heightCm:Number(a.height_cm)});
    if(!legacy.length&&a.kind!=='sheet'&&Number(a.width_cm)>0&&Number(a.height_cm)>0)legacy.push({id:'original',destination:'Todos',size:'',detail:'',widthCm:Number(a.width_cm),heightCm:Number(a.height_cm)});
    return legacy;
  }
  function designDestinations(o){const arr=Array.isArray(o.destinations)?o.destinations:[o.destination||'Todos'];return [...new Set(arr.filter(Boolean))];}
  function designMeasureLabel(o){return [designDestinations(o).join(' / '),o.size?`Talle ${o.size}`:'',o.detail,`${Number(o.widthCm)} × ${Number(o.heightCm)} cm`].filter(Boolean).join(' · ')}
  function designDestinationPicker(o={}){
    const values=designDestinations(o),choices=[...new Set([...DESIGN_USES,...values])];
    return `<details class="design-destinations"><summary data-destinations-summary>${escapeHtml(values.join(' / '))}</summary><div class="destination-options">${choices.map(v=>`<label><input type="checkbox" data-design-destination value="${escapeHtml(v)}" ${values.includes(v)?'checked':''}>${escapeHtml(v)}</label>`).join('')}<label class="field">Otro destino<input class="input" data-destination-custom placeholder="Ej.: Botellas"></label></div></details>`;
  }
  function designMeasureRow(o={}){
    const id=o.id||crypto.randomUUID();
    return `<div class="design-measure-option-row" data-measure-option data-measure-id="${escapeHtml(id)}" data-measure-sources="${escapeHtml(JSON.stringify(o.sources||[]))}"><div class="field"><label>Destino · podés elegir varios</label>${designDestinationPicker(o)}</div><label class="field">Talle (opcional)<input class="input" data-measure-field="size" value="${escapeHtml(o.size||'')}" placeholder="Ej.: L"></label><label class="field">Ancho / largo (cm)<input class="input" data-measure-field="widthCm" type="number" min=".01" step=".01" value="${Number(o.widthCm)||''}" placeholder="30"></label><label class="field">Alto (cm)<input class="input" data-measure-field="heightCm" type="number" min=".01" step=".01" value="${Number(o.heightCm)||''}" placeholder="40"></label><label class="field measure-detail-field">Detalle (opcional)<input class="input" data-measure-field="detail" value="${escapeHtml(o.detail||'')}" placeholder="Ej.: espalda, pecho o mate de 250 ml"></label>${o.sources?.length?`<div class="field full measure-origin-field"><label>Origen guardado · ${o.sources.reduce((n,s)=>n+Math.max(1,Number(s.quantity)||0),0)} aparición/es</label>${designOriginHtml(o)}</div>`:''}<button class="icon-btn measure-remove" type="button" data-remove-measure-option aria-label="Quitar opción de medidas">×</button></div>`;
  }
  function designMeasureEditor(key,options=[]){return `<div class="design-measure-editor" data-measure-editor="${key}"><div class="admin-section-head"><div><strong>Destinos y medidas</strong><p class="muted">“Todos” deja el uso sin especificar. Podés marcar varios destinos para una misma medida.</p></div><button class="btn btn-ghost" type="button" data-add-measure-option>+ Agregar opción</button></div><div data-measure-rows>${(options.length?options:[{}]).map(designMeasureRow).join('')}</div></div>`}
  function readDesignMeasureOptions(root){
    return qsa('[data-measure-option]',root).flatMap((row,i)=>{
      const field=name=>String(qs(`[data-measure-field="${name}"]`,row)?.value||'').trim();
      const size=field('size'),detail=field('detail'),w=field('widthCm'),h=field('heightCm');if(!size&&!detail&&!w&&!h)return [];
      const custom=String(qs('[data-destination-custom]',row)?.value||'').trim();let destinations=qsa('[data-design-destination]:checked',row).map(x=>x.value);if(custom)destinations=[...destinations.filter(x=>x!=='Todos'),custom];
      if(destinations.includes('Todos'))destinations=['Todos'];if(!destinations.length)destinations=['Todos'];
      const widthCm=Number(w),heightCm=Number(h);if(!Number.isFinite(widthCm)||!Number.isFinite(heightCm)||widthCm<.01||heightCm<.01||widthCm>10000||heightCm>10000)throw new Error(`Completá ancho y alto válidos en la opción ${i+1}.`);
      let sources=[];try{sources=JSON.parse(row.dataset.measureSources||'[]')}catch{}return [{id:row.dataset.measureId,destination:destinations.join(' / '),destinations,size,detail,widthCm,heightCm,sources}];
    });
  }
  function sheetRoot(key){return qs(key==='upload'?'#designUploadDialog':'#designDetailEditor')}
  function sheetKind(key){return qs(key==='upload'?'#designUploadKind':'[data-design-kind]',sheetRoot(key))?.value||'individual'}
  function sheetScope(key){return qs(key==='upload'?'#designUploadScope':'[data-design-scope]',sheetRoot(key))}
  function sheetSize(key){const root=sheetRoot(key);return {width:Number(qs(key==='upload'?'#designUploadWidth':'[data-design-width]',root)?.value)||0,height:Number(qs(key==='upload'?'#designUploadHeight':'[data-design-height]',root)?.value)||0}}
  function sheetComponents(key){return (state.designSheetDrafts?.[key]||[]).map(c=>{const a=state.designAssets.find(x=>Number(x.id)===Number(c.designAssetId)),o=a&&parseDesignMeasureOptions(a).find(x=>x.id===c.measureOptionId)||c.pendingMeasureOption;return {...c,...(o||{}),measureOptionId:c.measureOptionId,name:a?.name||c.name,scope:a?.scope||c.scope}})}
  function sheetMetrics(width,height,components,costCents=1000000){
    const total=width*height,boxes=[];components.forEach((c,i)=>(c.previewBoxes||[]).forEach(b=>boxes.push({x:Number(b.x),y:Number(b.y),x2:Number(b.x)+Number(b.width),y2:Number(b.y)+Number(b.height),i})));
    const marked=components.length>0&&components.every(c=>(c.previewBoxes||[]).length===Number(c.quantity));let used=0;const areas=components.map(()=>0);
    if(marked&&boxes.length){const xs=[...new Set(boxes.flatMap(b=>[b.x,b.x2]))].sort((a,b)=>a-b),ys=[...new Set(boxes.flatMap(b=>[b.y,b.y2]))].sort((a,b)=>a-b);
      for(let x=0;x<xs.length-1;x++)for(let y=0;y<ys.length-1;y++){const cx=(xs[x]+xs[x+1])/2,cy=(ys[y]+ys[y+1])/2,active=boxes.filter(b=>b.x<=cx&&b.x2>=cx&&b.y<=cy&&b.y2>=cy);if(!active.length)continue;const area=(xs[x+1]-xs[x])*(ys[y+1]-ys[y])*total;used+=area;active.forEach(b=>areas[b.i]+=area/active.length)}
    }else components.forEach((c,i)=>{areas[i]=(Number(c.widthCm)||0)*(Number(c.heightCm)||0)*(Number(c.quantity)||0);used+=areas[i]});
    const componentCosts=areas.map(a=>total>0?Math.round(a/total*costCents):0),allocated=componentCosts.reduce((a,b)=>a+b,0);
    return {total,used,waste:Math.max(0,total-used),percent:total>0?Math.max(0,total-used)/total*100:0,valid:total>0&&used>0&&used<=total+.0001,componentCosts,allocated,wasteCost:Math.max(0,costCents-allocated),marked};
  }
  function sheetMetricsHtml(width,height,components,costCents=1000000){
    const m=sheetMetrics(width,height,components,costCents),n=v=>Number(v).toLocaleString('es-AR',{maximumFractionDigits:2});
    if(!width||!height)return '<p class="muted">Ingresá la superficie total para calcular el desperdicio.</p>';
    return `<div class="sheet-surface-summary"><span>Plancha <b>${n(m.total)} cm² · ${money(costCents)}</b></span><span>Diseños <b>${n(m.used)} cm² · ${money(m.allocated)}</b></span><span>Desperdicio <b>${n(m.waste)} cm² · ${n(m.percent)}% · ${money(m.wasteCost)}</b></span></div>${m.used>m.total?'<p class="sheet-area-error" role="alert">Los diseños superan la superficie de la plancha.</p>':''}<small class="field-help">${m.marked?'Costo proporcional a los recuadros marcados. En cruces de recuadros, la superficie compartida se reparte sin cobrarla dos veces.':'Estimación con medidas y cantidades: corregí los recuadros de esta plancha para obtener el cálculo del acomodo.'}</small>`;
  }
  function fitSheetPreview(canvas){
    const viewport=canvas?.closest('.sheet-preview-viewport'),img=qs('img',canvas||document);
    if(!viewport||!img?.naturalWidth||!img.naturalHeight||!viewport.clientWidth||!viewport.clientHeight)return;
    const frame=canvas.closest('.sheet-preview-frame'),key=canvas.dataset.sheetCanvas,automatic=frame&&window.matchMedia?.('(min-width: 701px) and (hover: hover) and (pointer: fine)').matches&&img.naturalHeight>img.naturalWidth?90:0,rotation=Number(state.sheetRotation?.[key]??automatic),rotated=rotation%180!==0;
    const displayWidth=rotated?img.naturalHeight:img.naturalWidth,displayHeight=rotated?img.naturalWidth:img.naturalHeight;
    const scale=Math.min(Math.max(1,viewport.clientWidth-16)/displayWidth,Math.max(1,viewport.clientHeight-16)/displayHeight)*(state.sheetZoom||1);
    const width=Math.max(1,Math.floor(img.naturalWidth*scale)),height=Math.max(1,Math.floor(img.naturalHeight*scale));
    canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
    canvas.dataset.sheetRotated=String(rotated);canvas.dataset.sheetRotation=String(rotation);
    canvas.style.transform=rotation===90?`translateX(${height}px) rotate(90deg)`:rotation===180?`translate(${width}px,${height}px) rotate(180deg)`:rotation===270?`translateY(${width}px) rotate(270deg)`:'none';
    canvas.style.setProperty('--sheet-pin-rotation',`${-rotation}deg`);
    if(frame){frame.style.width=`${rotated?height:width}px`;frame.style.height=`${rotated?width:height}px`;}
  }
  function sheetMissingQueue(key){return (state.sheetMissingUploads??={})[key]??=[];}
  function rememberMissingSheetFields(key){
    const root=sheetRoot(key);if(!root)return;const queue=sheetMissingQueue(key);
    for(const row of qsa('[data-missing-sheet-id]',root)){
      const item=queue.find(item=>item.id===row.dataset.missingSheetId);if(!item)continue;
      const name=qs('[data-missing-sheet-name]',row),scope=qs('[data-missing-sheet-scope]',row);
      if(name)item.name=name.value;if(scope)item.scope=scope.value;
    }
  }
  function renderMissingSheetQueue(key){
    const root=sheetRoot(key);if(!root)return;const queue=sheetMissingQueue(key),host=qs('[data-missing-sheet-queue]',root);if(!host)return;
    host.innerHTML=queue.map(item=>{
      item.id??=crypto.randomUUID();if(!item.previewUrl&&String(item.file.type).startsWith('image/'))item.previewUrl=URL.createObjectURL(item.file);
      return `<article class="sheet-missing-file" data-missing-sheet-id="${item.id}"><div class="sheet-missing-thumb">${item.previewUrl?`<img src="${item.previewUrl}" alt="${escapeHtml(item.name||item.file.name)}">`:'Archivo'}</div><div class="sheet-missing-fields"><small class="sheet-missing-filename" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</small><label class="field"><span>Nombre del diseño</span><input class="input" maxlength="160" data-missing-sheet-name value="${escapeHtml(item.name||'')}" placeholder="Nombre para la biblioteca"></label><label class="field"><span>Sección</span><select class="select" data-missing-sheet-scope><option value="salmos" ${item.scope==='salmos'?'selected':''}>SALMOS</option><option value="clients" ${item.scope==='clients'?'selected':''}>Clientes</option></select></label>${item.error?`<small class="sheet-upload-error" role="alert">${escapeHtml(item.error)}</small>`:''}</div><div class="sheet-missing-file-actions"><button type="button" class="btn btn-ghost" data-remove-missing-sheet-file="${item.id}">Quitar</button><button type="button" class="btn btn-primary" data-upload-missing-sheet-design="${item.id}">Subir y agregar</button></div></article>`;
    }).join('');
    const status=qs('[data-missing-upload-status]',root);
    if(status)status.textContent=queue.length?`${queue.length} archivo${queue.length===1?'':'s'} pendiente${queue.length===1?'':'s'}. Podés subirlos juntos o usar el botón de cada diseño.`:'';
    const all=qs('[data-upload-all-missing-sheet-designs]',root);if(all){all.classList.toggle('hidden',!queue.length);all.disabled=Boolean(state.designUploadBusy);}
  }
  function removeMissingSheetFile(key,id){
    rememberMissingSheetFields(key);const queue=sheetMissingQueue(key),index=queue.findIndex(item=>item.id===id);if(index<0)return;
    const [item]=queue.splice(index,1);if(item.previewUrl)URL.revokeObjectURL(item.previewUrl);renderMissingSheetQueue(key);syncSheetUploadGate(key);
  }
  function clearMissingSheetQueue(key){
    sheetMissingQueue(key).forEach(item=>{if(item.previewUrl)URL.revokeObjectURL(item.previewUrl)});
    (state.sheetMissingUploads??={})[key]=[];(state.sheetMissingUnlocked??={})[key]=false;
    const root=sheetRoot(key);if(!root)return;const input=qs('[data-missing-sheet-file]',root);if(input)input.value='';renderMissingSheetQueue(key);syncSheetUploadGate(key);
  }
  function sheetHasPendingUpload(key){return sheetMissingQueue(key).length>0;}
  function syncSheetUploadGate(key){
    const root=sheetRoot(key),dialog=root?.closest('dialog');if(!dialog)return;
    const pending=sheetHasPendingUpload(key),blocked=pending&&!state.sheetMissingUnlocked?.[key],panel=qs('.sheet-missing-upload',root);
    for(const control of qsa('input,select,textarea,button',dialog)){
      if(panel?.contains(control)||control.matches('[data-design-color-kind]')||control.closest('[data-admin-session-notice]'))continue;
      if(blocked){if(control.dataset.sheetUploadBlocked===undefined)control.dataset.sheetUploadBlocked=control.disabled?'1':'0';control.disabled=true;}
      else if(control.dataset.sheetUploadBlocked!==undefined){control.disabled=control.dataset.sheetUploadBlocked==='1';delete control.dataset.sheetUploadBlocked;}
    }
    qsa('.sheet-design-library,.sheet-preview-viewport,[data-sheet-selected]',root).forEach(el=>el.inert=blocked);
    panel?.classList.toggle('sheet-upload-pending',blocked);
    const cancel=qs('[data-cancel-missing-sheet-design]',panel||root);if(cancel)cancel.classList.toggle('hidden',!pending);
  }
  function filterSheetGallery(key){
    const root=sheetRoot(key),query=String(qs('[data-sheet-search]',root)?.value||'').trim().toLocaleLowerCase();
    (state.sheetSearch??={})[key]=query;
    qsa('[data-add-sheet-design]',root).forEach(button=>{const a=state.designAssets.find(a=>Number(a.id)===Number(button.dataset.addSheetDesign));button.classList.toggle('hidden',!a||a.scope!==(state.sheetGalleryScope?.[key]||'salmos')||!designVisible('sheet-'+key,a)||Boolean(query)&&!`${a.name||''} ${a.file_name||''}`.toLocaleLowerCase().includes(query));});
  }
  function ensureSheetMarkOrder(rows){
    let next=Math.max(0,...rows.flatMap(c=>(c.previewBoxes||[]).map(b=>Number(b.order)||0)));const seen=new Set();
    for(const c of rows)for(const b of c.previewBoxes||[]){if(!Number.isSafeInteger(Number(b.order))||Number(b.order)<1||seen.has(Number(b.order)))b.order=++next;seen.add(Number(b.order));}
  }
  function sheetMarkNumbers(rows){
    ensureSheetMarkOrder(rows);const orders=rows.flatMap(c=>(c.previewBoxes||[]).map(b=>Number(b.order))).sort((a,b)=>a-b);
    return new Map(orders.map((order,i)=>[order,i+1]));
  }
  function sheetMarkNumber(rows,rowIndex,boxIndex){return sheetMarkNumbers(rows).get(Number(rows[rowIndex]?.previewBoxes?.[boxIndex]?.order))||0;}
  function sheetDesignLibraryHtml(key){return `<div class="sheet-sample-gallery">${state.designAssets.filter(a=>a.kind==='individual'&&['salmos','clients'].includes(a.scope)).map(a=>`<button type="button" class="sheet-sample" data-add-sheet-design="${a.id}" data-sheet-key="${key}" title="${escapeHtml(a.name||a.file_name)}"><span ${designVisualAttrs(a)}>${String(a.mime_type||'').startsWith('image/')?`<img crossorigin="use-credentials" src="${designThumbnailUrl(a)}" alt="${escapeHtml(a.name||'Diseño')}" loading="lazy">`:'Archivo'}</span></button>`).join('')}</div>`;}
  function sheetGalleryFilterHtml(key){const html=designTagFilterHtml('sheet-'+key,state.designAssets.filter(a=>a.kind==='individual'));return html.replace('Filtrar etiquetas','Filtrar diseños').replace('Filtrar por etiquetas','Filtrar diseños').replace(/(<summary[^>]*>.*?<\/summary>)/s,`$1<div class="sheet-scope-filter"><label><input type="radio" name="sheet-scope-${key}" value="salmos" data-sheet-gallery-scope ${state.sheetGalleryScope?.[key]!=='clients'?'checked':''}> SALMOS</label><label><input type="radio" name="sheet-scope-${key}" value="clients" data-sheet-gallery-scope ${state.sheetGalleryScope?.[key]==='clients'?'checked':''}> Clientes</label></div>`);}

  function sheetCompositionEditor(key){const missingUpload=`<div class="sheet-missing-upload"><div class="sheet-missing-upload-head"><button class="btn btn-primary" type="button" data-sheet-upload-files>+ Agregar diseños</button><input class="hidden" type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" data-missing-sheet-file aria-label="Subir diseños individuales faltantes"></div><div class="sheet-missing-queue" data-missing-sheet-queue aria-label="Diseños pendientes de subir"></div><div class="sheet-missing-batch-actions"><button type="button" class="btn btn-primary hidden" data-upload-all-missing-sheet-designs>Subir y agregar todos</button><button type="button" class="btn btn-ghost hidden" data-cancel-missing-sheet-design>Descartar archivos pendientes</button></div><small class="sheet-missing-status" data-missing-upload-status role="status" aria-live="polite"></small></div>`;return `<section class="sheet-composition" data-sheet-editor="${key}"><div class="sheet-composition-heading"><div><h3>Diseños que componen la plancha</h3></div></div><div class="sheet-composition-layout"><div class="sheet-preview-column"><aside class="sheet-preview" data-sheet-preview></aside><div class="sheet-design-library">${sheetDesignLibraryHtml(key)}</div><div class="sheet-gallery-controls"><label class="field">Buscar diseños<input class="input" type="search" data-sheet-search value="${escapeHtml(state.sheetSearch?.[key]||'')}" placeholder="Nombre del diseño"></label>${sheetGalleryFilterHtml(key)}${missingUpload}</div></div><div class="sheet-composition-sidebar"><div class="sheet-detection-status" data-sheet-detection-status aria-live="polite"></div><p class="sheet-mark-status" role="status"></p><small class="field-help">Marcá con el mouse y ajustá los bordes al soltar. Usá el zoom y las barras para acercarte.</small><details class="sheet-selected-list" data-sheet-selected-list="${key}" ${state.sheetListsCollapsed?.[key]?'':'open'}><summary data-toggle-sheet-list="${key}"><span>Diseños agregados (<span data-sheet-list-count>0</span>)</span><span class="sheet-list-collapse-label" aria-label="Comprimir">⌃</span><span class="sheet-list-expand-label" aria-label="Expandir">⌄</span></summary><div data-sheet-selected></div></details><div data-sheet-metrics></div>${key==='upload'?'<label class="sheet-confirm-composition"><input type="checkbox" id="designSheetCompositionComplete"><span>Confirmo que marqué cada aparición de todos los diseños de esta plancha y revisé sus medidas.</span></label>':''}</div></div></section>`}
  function sheetCompositionFingerprint(){const file=state.sheetUploadPreview?.file,size=sheetSize('upload');return JSON.stringify({width:size.width,height:size.height,file:file?`${file.name}:${file.size}:${file.lastModified}`:'',components:(state.designSheetDrafts.upload||[]).map(c=>[Number(c.designAssetId),String(c.measureOptionId||c.pendingMeasureOption?.id||''),Number(c.quantity)||0,c.previewBoxes||[],c.previewMarks||[]])});}
  function sheetDraftKey(file){return `salmos_sheet_draft:${JSON.stringify([file.name,file.size,file.lastModified])}`;}
  function sheetDraftNotice(message){const host=qs('#sheetDraftNotice');if(host){host.textContent=message;host.classList.toggle('hidden',!message);}}
  function persistSheetDraft(){
    const record=state.sheetUploadPreview,file=record?.file;
    if(!file||state.sheetDraftRestoring||state.sheetDraftCompleted||sheetKind('upload')!=='sheet')return;
    const fields={};for(const id of ['designUploadName','designUploadWidth','designUploadHeight','designUploadScope','designUploadCost','designUploadPrintType'])fields[id]=qs('#'+id)?.value||'';
    const draft={version:1,fileName:file.name,fields,appearance:state.sheetUploadAppearance||{},tags:designPickerSelections(qs('[data-design-tag-picker="sheet-upload"]')),components:state.designSheetDrafts.upload||[],printed:sheetIsPrinted('upload'),purchaseFields:Object.fromEntries(qsa('#designSheetPurchase input,#designSheetPurchase select').map(el=>[el.id,el.value])),savedPurchaseId:record.savedPurchaseId,uploadId:record.uploadId,uploadMetadata:record.uploadMetadata,savedItem:record.savedItem};
    try{
      const key=sheetDraftKey(file);localStorage.setItem(key,JSON.stringify(draft));localStorage.setItem('salmos_sheet_draft_latest',JSON.stringify({key,fileName:file.name}));
      sheetDraftNotice('Marcas y medidas respaldadas en este navegador. Si cerrás la página, volvé a elegir el mismo archivo para recuperarlas.');
    }catch{sheetDraftNotice('El navegador no pudo guardar el respaldo. Conservá esta ventana abierta hasta terminar la carga.');}
  }
  function scheduleSheetDraftSave(){clearTimeout(state.sheetDraftTimer);state.sheetDraftTimer=setTimeout(persistSheetDraft,350);}
  function restoreSheetDraft(file){
    let draft;try{draft=JSON.parse(localStorage.getItem(sheetDraftKey(file))||'null')}catch{return false;}
    if(draft?.version!==1||!Array.isArray(draft.components))return false;
    state.sheetDraftRestoring=true;
    try{
      for(const [id,value] of Object.entries(draft.fields||{})){const input=qs('#'+id);if(input)input.value=value;}
      qs('#designUploadKind').value='sheet';qs('#designUploadKind').disabled=qs('#designUploadScope').value==='mixed';
      qs('#designUploadTagPicker').innerHTML=designTagPickerHtml('sheet-upload',draft.tags||[]);
      state.sheetUploadAppearance=draft.appearance||{};state.designSheetDrafts.upload=draft.components;state.sheetSizeManual={...state.sheetSizeManual,upload:true};
      Object.assign(state.sheetUploadPreview,{uploadId:draft.uploadId,uploadMetadata:draft.uploadMetadata,savedItem:draft.savedItem,savedPurchaseId:draft.savedPurchaseId});
      qs('#designUploadPrinted').checked=draft.printed!==false;for(const [id,value] of Object.entries(draft.purchaseFields||{})){const input=qs('#'+id);if(input)input.value=value;}syncSheetPurchasePanel('upload');
      state.sheetCompositionConfirmation=null;state.sheetActiveBox=null;state.sheetBoxTarget=null;state.sheetRepeatTarget=null;
      sheetDraftNotice('Borrador recuperado. Revisá las marcas y confirmá la composición para guardar.');
      return true;
    }finally{state.sheetDraftRestoring=false;}
  }
  function clearSheetDraft(){
    clearTimeout(state.sheetDraftTimer);state.sheetDraftCompleted=true;
    const file=state.sheetUploadPreview?.file;if(!file)return;
    try{const key=sheetDraftKey(file);localStorage.removeItem(key);const latest=JSON.parse(localStorage.getItem('salmos_sheet_draft_latest')||'null');if(latest?.key===key)localStorage.removeItem('salmos_sheet_draft_latest');}catch{}
  }
  function renderSheetSelected(key){
    const root=sheetRoot(key),host=qs('[data-sheet-selected]',root);if(!host)return;const components=sheetComponents(key),count=qs('[data-sheet-list-count]',root);if(count)count.textContent=String(components.length);if(key==='upload'){const confirmation=qs('#designSheetCompositionComplete',root);if(confirmation?.checked&&state.sheetCompositionConfirmation!==sheetCompositionFingerprint()){confirmation.checked=false;state.sheetCompositionConfirmation=null;}}
    const size=sheetSize(key),costCents=Number(key==='upload'?qs('#designUploadCost')?.value*100:state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId))?.cost_cents)||1000000;
    const metrics=sheetMetrics(size.width,size.height,components,costCents),markNumbers=sheetMarkNumbers(components);
    host.innerHTML=components.map((c,i)=>({c,i})).sort((a,b)=>Number(!!a.c.previewBoxes?.length)-Number(!!b.c.previewBoxes?.length)||(a.c.previewBoxes?.length&&b.c.previewBoxes?.length?Number(a.c.previewBoxes[0].order)-Number(b.c.previewBoxes[0].order):a.i-b.i)).map(({c,i})=>{const asset=state.designAssets.find(a=>Number(a.id)===Number(c.designAssetId)),options=asset?parseDesignMeasureOptions(asset):[];if(c.pendingMeasureOption&&!options.some(o=>o.id===c.pendingMeasureOption.id))options.push(c.pendingMeasureOption);const chosen=options.find(o=>o.id===c.measureOptionId)||c.pendingMeasureOption,cost=asset&&chosen?designPrintCostCents(asset,chosen.widthCm,chosen.heightCm):null;
      const measure=chosen?`<div class="sheet-exact-measure"><label class="field">Ancho exacto (cm)<input class="input" type="number" min=".01" step=".01" data-sheet-exact="width" value="${Number(chosen.widthCm)}"></label><label class="field">Alto exacto (cm)<input class="input" type="number" min=".01" step=".01" data-sheet-exact="height" value="${Number(chosen.heightCm)}"></label></div>`:'<small class="field-help">Arrastrá un recuadro para medir la primera aparición.</small>';
      const actions=`<button type="button" class="btn btn-ghost" data-sheet-box="${i}" data-sheet-key="${key}">${state.sheetBoxTarget?.key===key&&state.sheetBoxTarget?.index===i?'✓ Marcando':'Marcar este diseño'}</button>${c.previewBoxes?.length?`<button type="button" class="btn btn-ghost" data-sheet-repeat="${i}" data-sheet-key="${key}">${state.sheetRepeatTarget?.key===key&&state.sheetRepeatTarget?.index===i?'Terminar':'Hay más'}</button><button type="button" class="btn btn-ghost" data-sheet-undo="${i}" data-sheet-key="${key}">Anular última marca</button>`:''}<button type="button" class="icon-btn" data-sheet-other-size="${i}" data-sheet-key="${key}" aria-label="Agregar otra aparición del diseño" title="Agregar otra aparición">+</button>`;
      return `<div class="sheet-component-row ${state.sheetBoxTarget?.key===key&&state.sheetBoxTarget?.index===i?'sheet-component-active':''}" data-sheet-component="${i}" data-sheet-key="${key}"><div class="sheet-component-identity">${asset?designSmallImage(asset):''}<strong>${escapeHtml(c.name||asset?.name||'Diseño')}</strong></div>${measure}<div class="sheet-marked-count">${(c.previewBoxes||[]).length} marca${(c.previewBoxes||[]).length===1?'':'s'}<span class="sheet-mark-numbers">${(c.previewBoxes||[]).map((b,j)=>`<button type="button" class="sheet-mark-number" data-sheet-pin="${i}" data-pin-index="${j}" data-sheet-key="${key}" aria-label="Ajustar marca ${markNumbers.get(Number(b.order))}">${markNumbers.get(Number(b.order))}</button>`).join('')}</span></div><div class="admin-actions">${actions}<button type="button" class="icon-btn" data-remove-sheet-component="${i}" data-sheet-key="${key}" aria-label="Quitar diseño">×</button></div><small class="sheet-component-cost">Costo en esta plancha: ${money(metrics.componentCosts[i]||0)}</small></div>`}).join('')||'<p class="muted">Todavía no elegiste diseños.</p>';
    qsa('[data-add-sheet-design]',root).forEach(b=>b.classList.toggle('selected',components.some(c=>Number(c.designAssetId)===Number(b.dataset.addSheetDesign))));updateSheetMetrics(key);renderSheetPreview(key);filterSheetGallery(key);if(!state.designUploadBusy)syncSheetUploadGate(key);if(key==='upload')scheduleSheetDraftSave();
  }
  function toggleSheetSelectedList(key){
    const list=qs('[data-sheet-selected-list]',sheetRoot(key));if(!list)return;
    list.open=!list.open;(state.sheetListsCollapsed??={})[key]=!list.open;
  }
  function designSmallImage(asset){return String(asset.mime_type||'').startsWith('image/')?`<span class="design-small-image" ${designVisualAttrs(asset)}><img crossorigin="use-credentials" src="${designThumbnailUrl(asset)}" alt="${escapeHtml(asset.name||asset.file_name)}" loading="lazy"></span>`:'<span class="design-small-image">Archivo</span>'}
  function sheetPreviewMarks(rows,key){
    const markNumbers=sheetMarkNumbers(rows);
    return rows.flatMap((c,i)=>(c.previewBoxes||[]).map((b,j)=>{
      const markNumber=markNumbers.get(Number(b.order));
      const active=state.sheetActiveBox?.key===key&&state.sheetActiveBox.rowIndex===i&&state.sheetActiveBox.boxIndex===j;
      const pin=`<button type="button" class="sheet-preview-pin" style="left:${(Number(b.x)+Number(b.width)/2)*100}%;top:${(Number(b.y)+Number(b.height)/2)*100}%" data-sheet-pin="${i}" data-pin-index="${j}" data-sheet-key="${key}" title="Ajustar recuadro de ${escapeHtml(c.name||'diseño')}">${markNumber}</button>`;
      if(!active)return pin;
      const handles=['n','s','e','w','ne','nw','se','sw'].map(edge=>`<span class="sheet-resize-handle sheet-handle-${edge}" data-sheet-resize="${edge}" title="Ajustar borde"></span>`).join('');
      return `<div class="sheet-preview-box-active" data-sheet-move style="left:${Number(b.x)*100}%;top:${Number(b.y)*100}%;width:${Number(b.width)*100}%;height:${Number(b.height)*100}%" data-sheet-row="${i}" data-sheet-index="${j}" data-sheet-key="${key}">${handles}</div>${pin}`;
    })).join('');
  }
  function renderSheetPreview(key){
    const root=sheetRoot(key),host=qs('[data-sheet-preview]',root);if(!host)return;host.dataset.designPreviewBackground=designViewerBackground('sheet-'+key);
    const status=qs('.sheet-mark-status',root);if(status)status.textContent=state.sheetBoxTarget?.key===key?state.sheetRepeatTarget?.key===key?`Hacé clic en el centro de cada repetición. Se conserva la medida. Usá Terminar al finalizar.`:`Marcando el diseño ${state.sheetBoxTarget.index+1}`:'';
    const asset=key==='upload'?state.sheetUploadPreview:state.designAssets.find(x=>Number(x.id)===state.activeDesignId),url=key==='upload'?asset?.url:asset?apiUrl(`/api/admin/design-assets/${asset.id}/file`):'',mime=asset?.mime_type||asset?.file?.type||'',rows=state.designSheetDrafts?.[key]||[];
    if(!url){host._sheetResizeObserver?.disconnect();delete host.dataset.sheetSource;host.innerHTML='<p class="muted">Elegí el archivo de la plancha para verla acá.</p>';return;}
    const existing=qs('[data-sheet-canvas]',host),image=/^image\/(png|jpeg|webp|svg\+xml)$/.test(mime);
    if(image&&host.dataset.sheetSource===url&&existing){
      qs('.sheet-preview-marks',existing).innerHTML=sheetPreviewMarks(rows,key);existing.classList.toggle('drawing',state.sheetBoxTarget?.key===key);
      const range=qs('[data-sheet-zoom]',host);if(range)range.value=String(state.sheetZoom||1);
      const label=qs('[data-sheet-zoom-label]',host);if(label)label.textContent=`Zoom ${Math.round((state.sheetZoom||1)*100)}%`;
      const img=qs('img',existing);if(img.naturalWidth&&!syncSheetImageSize(key,img))fitSheetPreview(existing);return;
    }
    const stageImage=key==='detail'?qs('#designPreviewStage img'):null,reusedImage=stageImage&&(stageImage.getAttribute('src')===url||stageImage.getAttribute('src')?.startsWith(url+'?'))?stageImage:null;
    host._sheetResizeObserver?.disconnect();host.dataset.sheetSource=url;
    host.innerHTML=`<strong>Vista previa de la plancha</strong><div data-sheet-size-notice></div>${image?`<div class="sheet-preview-tools">${designBackgroundControlHtml('sheet-'+key)}<span data-sheet-zoom-label>Zoom ${Math.round((state.sheetZoom||1)*100)}%</span><input type="range" min="1" max="5" step=".25" value="${state.sheetZoom||1}" data-sheet-zoom aria-label="Zoom de la plancha"><button type="button" class="btn btn-ghost" data-reset-sheet-zoom>Restablecer</button><button type="button" class="btn btn-ghost" data-rotate-sheet-preview aria-label="Girar vista previa de la plancha 90 grados">↻ Girar</button></div><div data-image-status role="status">Cargando plancha…</div><div class="sheet-preview-viewport"><div class="sheet-preview-frame"><div class="sheet-preview-canvas checkerboard ${state.sheetBoxTarget?.key===key?'drawing':''}" data-sheet-canvas="${key}" ${designVisualAttrs(key==='detail'?asset:'sheet-upload')}><img crossorigin="use-credentials" ${reusedImage?'':`src="${escapeHtml(url)}"`} alt="Plancha a cargar"><div class="sheet-preview-marks">${sheetPreviewMarks(rows,key)}</div></div></div></div>`:mime==='application/pdf'?`<iframe src="${escapeHtml(url)}" title="Plancha"></iframe><small>Usá la lista con miniaturas para revisar los diseños.</small>`:`<a class="btn btn-ghost" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir archivo original</a><small>Este formato no tiene vista previa en el navegador.</small>`}`;
    const viewport=qs('.sheet-preview-viewport',host),canvas=qs('[data-sheet-canvas]',host);if(reusedImage&&canvas){const placeholder=qs('img',canvas);placeholder.before(reusedImage);placeholder.remove();}
    const img=canvas&&qs('img',canvas);
    if(viewport&&img){
      watchDesignPreview(img,host,()=>{if(host.dataset.sheetSource!==url||qs('[data-sheet-canvas]',host)!==canvas)return;if(!syncSheetImageSize(key,img))fitSheetPreview(canvas);if(key==='detail')cacheDesignThumbnail(asset,img).catch(()=>{});});
      if(window.ResizeObserver){host._sheetResizeObserver=new ResizeObserver(()=>{if(qs('[data-sheet-canvas]',host)===canvas)fitSheetPreview(canvas)});host._sheetResizeObserver.observe(viewport);}
    }
  }
  function watchDesignPreview(img,host,onReady=()=>{}){
    const status=qs('[data-image-status]',host),baseUrl=img.src;
    const current=()=>qs('img',host)===img;
    const ready=()=>{if(!current()||!img.naturalWidth)return;status?.classList.add('hidden');onReady();};
    const failed=()=>{if(!current())return;if(status){status.classList.remove('hidden');status.innerHTML='<span>No se pudo cargar la imagen.</span> <button type="button" class="btn btn-ghost" data-retry-preview>Reintentar</button>';}};
    host._retryImage=()=>{if(!current())return;if(status){status.classList.remove('hidden');status.textContent='Cargando imagen…';}if(baseUrl.startsWith('blob:')){img.removeAttribute('src');img.src=baseUrl;}else img.src=baseUrl+(baseUrl.includes('?')?'&':'?')+'retry='+Date.now();};
    img.addEventListener('load',ready);img.addEventListener('error',failed);if(img.complete&&img.naturalWidth)ready();
  }
  function designThumbnailUrl(asset){return apiUrl(`/api/admin/design-assets/${Number(asset.id)}/${asset.has_preview?'preview?v='+encodeURIComponent(asset.preview_version||'1'):'file'}`);}
  async function cacheDesignThumbnail(asset,img){
    if(!asset||asset.has_preview||!img.naturalWidth||!img.naturalHeight)return;
    state.designThumbnailSaves??=new Map();if(state.designThumbnailSaves.has(Number(asset.id)))return state.designThumbnailSaves.get(Number(asset.id));
    const save=(async()=>{const scale=Math.min(1,480/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));if(!blob||blob.type!=='image/webp')return;
      const form=new FormData();form.append('file',blob,'vista.webp');const data=await api(`/api/admin/design-assets/${Number(asset.id)}/preview`,{method:'POST',body:form});if(data?.item){asset.has_preview=data.item.has_preview;asset.preview_version=data.item.preview_version;const current=state.designAssets.find(a=>Number(a.id)===Number(asset.id));if(current&&current!==asset)Object.assign(current,{has_preview:asset.has_preview,preview_version:asset.preview_version});}
    })();state.designThumbnailSaves.set(Number(asset.id),save);try{await save}finally{state.designThumbnailSaves.delete(Number(asset.id));}
  }
  function designThumbnailHtml(asset){return `<img draggable="false" crossorigin="use-credentials" data-design-thumbnail="${asset.id}" data-thumbnail-src="${escapeHtml(designThumbnailUrl(asset))}" alt="${escapeHtml(asset.name||asset.file_name)}" decoding="async">`;}
  function observeDesignThumbnails(){
    state.designThumbnailObserver?.disconnect();state.designThumbnailQueue=(state.designThumbnailQueue||[]).filter(img=>document.contains(img));
    const enqueue=img=>{if(img.dataset.thumbnailQueued)return;img.dataset.thumbnailQueued='1';state.designThumbnailQueue.push(img);drainDesignThumbnails().catch(()=>{});};
    const images=qsa('[data-design-thumbnail]').filter(img=>!img.dataset.thumbnailQueued);
    if(window.IntersectionObserver){state.designThumbnailObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){state.designThumbnailObserver.unobserve(e.target);enqueue(e.target)}},{rootMargin:'80px'});images.forEach(img=>state.designThumbnailObserver.observe(img));}
    else images.forEach(enqueue);
  }
  async function drainDesignThumbnails(){
    if(state.designThumbnailLoading)return;state.designThumbnailLoading=true;
    try{while(state.designThumbnailQueue?.length){const img=state.designThumbnailQueue.shift();if(!document.contains(img))continue;const asset=state.designAssets.find(a=>Number(a.id)===Number(img.dataset.designThumbnail));if(!asset)continue;
      const card=img.closest('.design-gallery-thumb');card?.setAttribute('data-image-state','loading');
      try{await new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(new Error('image')),{once:true});img.src=designThumbnailUrl(asset);if(img.complete&&img.naturalWidth)resolve();});card?.setAttribute('data-image-state','loaded');await cacheDesignThumbnail(asset,img).catch(()=>{});}
      catch{card?.setAttribute('data-image-state','error');}
    }}finally{state.designThumbnailLoading=false;}
  }
  function sheetBoxCoordinate(canvas,event){
    const rect=canvas.getBoundingClientRect(),clamp=n=>Math.max(0,Math.min(1,n));
    const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    const rotation=Number(canvas.dataset.sheetRotation)||0;
    return rotation===90?{x:clamp(y),y:clamp(1-x)}:rotation===180?{x:clamp(1-x),y:clamp(1-y)}:rotation===270?{x:clamp(1-y),y:clamp(x)}:{x:clamp(x),y:clamp(y)};
  }
  function sheetBoxMeasures(box,size){
    const width=box.width*size.width,height=box.height*size.height;
    return Number(box.rotation)%180?{widthCm:height,heightCm:width}:{widthCm:width,heightCm:height};
  }
  function sheetBoxesDuplicate(a,b){
    const overlap=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
    const union=a.width*a.height+b.width*b.height-overlap;return union>0&&overlap/union>.9;
  }
  function addRepeatedSheetBox(key,index,point){const rows=state.designSheetDrafts?.[key]||[],row=rows[index],seed=row?.previewBoxes?.[0];if(!seed)throw new Error('Marcá primero una aparición.');const box={x:Math.max(0,Math.min(1-seed.width,point.x-seed.width/2)),y:Math.max(0,Math.min(1-seed.height,point.y-seed.height/2)),width:seed.width,height:seed.height,rotation:seed.rotation||0};if(rows.some(c=>Number(c.designAssetId)===Number(row.designAssetId)&&(c.previewBoxes||[]).some(b=>sheetBoxesDuplicate(b,box))))throw new Error('Esa aparición ya está marcada.');ensureSheetMarkOrder(rows);box.order=Math.max(0,...rows.flatMap(c=>(c.previewBoxes||[]).map(b=>Number(b.order)||0)))+1;row.previewBoxes.push(box);row.previewMarks??=[];row.previewMarks.push({x:box.x+box.width/2,y:box.y+box.height/2});row.quantity=row.previewBoxes.length;state.sheetActiveBox=null;renderSheetSelected(key);}
  function applySheetBox(index,box,key='upload'){
    const draft=state.designSheetDrafts[key]?.[index],asset=state.designAssets.find(a=>Number(a.id)===Number(draft?.designAssetId)),size=sheetSize(key);
    if(!draft||!asset||!size.width||!size.height||box.width<.005||box.height<.005)throw new Error('Marcá el contorno completo del diseño sobre la imagen.');
    if(draft.previewBoxes?.length&&!(state.sheetRepeatTarget?.key===key&&state.sheetRepeatTarget.index===index))throw new Error('Usá Hay más para marcar otra aparición.');
    const problem=sheetMeasurementProblem(key);if(problem)throw new Error(problem);
    const sheetAsset=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId)),option=detectedMeasureOption(asset,key==='upload'?state.sheetUploadPreview?.file?.name:sheetAsset?.file_name,sheetBoxMeasures(box,size));
    const rows=state.designSheetDrafts[key];
    if(rows.some(c=>Number(c.designAssetId)===Number(asset.id)&&(c.previewBoxes||[]).some(b=>sheetBoxesDuplicate(b,box))))throw new Error('Esa aparición ya está marcada. Quitá su marca si querés corregirla.');
    let target=draft,targetIndex=index;
    const oldOption=draft.pendingMeasureOption||parseDesignMeasureOptions(asset).find(o=>o.id===draft.measureOptionId);
    if(draft.previewBoxes?.length&&oldOption&&(Math.abs(oldOption.widthCm-option.widthCm)>=.2||Math.abs(oldOption.heightCm-option.heightCm)>=.2)){
      target={designAssetId:Number(asset.id),quantity:0,previewBoxes:[],previewMarks:[]};rows.push(target);targetIndex=rows.length-1;
    }
    target.measureOptionId=option.id;target.pendingMeasureOption=option;target.previewBoxes??=[];target.previewMarks??=[];
    ensureSheetMarkOrder(rows);const nextOrder=Math.max(0,...rows.flatMap(c=>(c.previewBoxes||[]).map(b=>Number(b.order)||0)))+1;
    target.previewBoxes.push({...box,rotation:box.rotation||0,order:nextOrder});target.previewMarks.push({x:box.x+box.width/2,y:box.y+box.height/2});
    target.quantity=target.previewBoxes.length;target.sourceMethod='box-selected';
    state.sheetBoxTarget=null;state.sheetActiveBox={key,rowIndex:targetIndex,boxIndex:target.previewBoxes.length-1};renderSheetSelected(key);
    const chosen=target.pendingMeasureOption||option;
    qs('[data-sheet-detection-status]',sheetRoot(key))?.replaceChildren(document.createTextNode('Marca '+sheetMarkNumber(rows,targetIndex,target.previewBoxes.length-1)+': '+chosen.widthCm+' × '+chosen.heightCm+' cm. Revisá el contorno. Usá Hay más para repetir la misma medida.'));
  }
  function resizeSheetBox(key,rowIndex,boxIndex,box){
    const rows=state.designSheetDrafts[key],row=rows?.[rowIndex],previous=row?.previewBoxes?.[boxIndex],asset=state.designAssets.find(a=>Number(a.id)===Number(row?.designAssetId));
    if(!previous||!asset||box.width<.005||box.height<.005)throw new Error('El recuadro debe cubrir toda la estampa.');
    ensureSheetMarkOrder(rows);box={...box,order:previous.order};
    const problem=sheetMeasurementProblem(key);if(problem)throw new Error(problem);
    const collision=rows.some((c,i)=>Number(c.designAssetId)===Number(asset.id)&&(c.previewBoxes||[]).some((b,j)=>{
      if(i===rowIndex&&j===boxIndex)return false;
      return sheetBoxesDuplicate(b,box);
    }));
    if(collision)throw new Error('Ese diseño ya tiene una marca en ese lugar.');
    const sheet=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId)),option=detectedMeasureOption(asset,key==='upload'?state.sheetUploadPreview?.file?.name:sheet?.file_name,sheetBoxMeasures(box,sheetSize(key)));
    const oldOption=row.pendingMeasureOption||parseDesignMeasureOptions(asset).find(o=>o.id===row.measureOptionId);
    const different=oldOption&&(Math.abs(Number(oldOption.widthCm)-option.widthCm)>=.2||Math.abs(Number(oldOption.heightCm)-option.heightCm)>=.2);
    if(different&&row.previewBoxes.length>1){
      row.previewBoxes.splice(boxIndex,1);row.previewMarks?.splice(boxIndex,1);row.quantity=row.previewBoxes.length;
      rows.push({designAssetId:Number(asset.id),measureOptionId:option.id,pendingMeasureOption:option,quantity:1,previewBoxes:[box],previewMarks:[{x:box.x+box.width/2,y:box.y+box.height/2}],sourceMethod:'box-selected'});
      state.sheetActiveBox={key,rowIndex:rows.length-1,boxIndex:0};
    }else{
      row.previewBoxes[boxIndex]=box;row.previewMarks??=[];row.previewMarks[boxIndex]={x:box.x+box.width/2,y:box.y+box.height/2};row.measureOptionId=option.id;row.pendingMeasureOption=option;row.sourceMethod='box-selected';
      state.sheetActiveBox={key,rowIndex,boxIndex};
    }
    const edited=rows[state.sheetActiveBox.rowIndex],editedBox=edited.previewBoxes[state.sheetActiveBox.boxIndex];
    const matching=rows.find(c=>c!==edited&&Number(c.designAssetId)===Number(edited.designAssetId)&&c.measureOptionId===edited.measureOptionId);
    if(matching){
      const offset=matching.previewBoxes?.length||0;matching.previewBoxes=[...(matching.previewBoxes||[]),...edited.previewBoxes];matching.previewMarks=[...(matching.previewMarks||[]),...(edited.previewMarks||[])];matching.quantity=matching.previewBoxes.length;
      matching.pendingMeasureOption=edited.pendingMeasureOption;matching.sourceMethod='box-selected';rows.splice(rows.indexOf(edited),1);
      state.sheetActiveBox={key,rowIndex:rows.indexOf(matching),boxIndex:offset+edited.previewBoxes.indexOf(editedBox)};
    }
    const activeRow=rows[state.sheetActiveBox.rowIndex];
    const firstOrder=c=>Math.min(...(c.previewBoxes?.length?c.previewBoxes.map(b=>Number(b.order)):[Infinity]));
    rows.sort((a,b)=>firstOrder(a)-firstOrder(b));state.sheetActiveBox.rowIndex=rows.indexOf(activeRow);
    state.sheetBoxTarget={key,index:state.sheetActiveBox.rowIndex};
    renderSheetSelected(key);
  }
  function sheetSizeInputs(key){const root=sheetRoot(key);return {width:qs(key==='upload'?'#designUploadWidth':'[data-design-width]',root),height:qs(key==='upload'?'#designUploadHeight':'[data-design-height]',root)};}
  function sheetAspectMatches(size,image){return size.width>0&&size.height>0&&image?.width>0&&image?.height>0&&Math.abs((size.width/size.height)/(image.width/image.height)-1)<=.01;}
  function sheetMeasurementProblem(key){
    const size=sheetSize(key),image=state.sheetImageSizes?.[key];
    if(!size.width||!size.height)return 'Ingresá el ancho y el alto reales de la plancha completa, en centímetros.';
    if(!image)return 'Esperá a que termine de cargar la imagen de la plancha.';
    if(!sheetAspectMatches(size,image))return `La proporción de la imagen no coincide con ${size.width} cm de ancho × ${size.height} cm de alto. Revisá las medidas de la plancha completa antes de marcar o guardar.`;
    return '';
  }
  function renderSheetSizeNotice(key){
    const host=qs('[data-sheet-size-notice]',sheetRoot(key));if(!host)return;
    const size=sheetSize(key),image=state.sheetImageSizes?.[key],problem=sheetMeasurementProblem(key),canSwap=problem&&sheetAspectMatches({width:size.height,height:size.width},image);
    host.innerHTML=`<small class="field-help">Plancha completa: <b>${size.width||'—'} cm de ancho × ${size.height||'—'} cm de alto</b>.</small>${problem?`<p class="sheet-area-error" role="status">${escapeHtml(problem)}</p>${canSwap?`<button type="button" class="btn btn-ghost" data-swap-sheet-size="${key}">Corregir orientación: ${size.height} de ancho × ${size.width} de alto</button>`:''}`:''}`;
  }
  function syncSheetImageSize(key,img){
    if(!img.naturalWidth||!img.naturalHeight)return false;
    const image={width:img.naturalWidth,height:img.naturalHeight};(state.sheetImageSizes??={})[key]=image;
    const size=sheetSize(key),swapped={width:size.height,height:size.width};
    if(key==='upload'&&!state.sheetSizeManual?.upload&&!sheetAspectMatches(size,image)&&sheetAspectMatches(swapped,image)){
      const inputs=sheetSizeInputs(key);inputs.width.value=String(swapped.width);inputs.height.value=String(swapped.height);
      updateDrawnSheetSizes(key);return true;
    }
    renderSheetSizeNotice(key);return false;
  }
  function updateDrawnSheetSizes(key='upload'){
    renderSheetSizeNotice(key);if(sheetMeasurementProblem(key))return;
    const size=sheetSize(key),sheet=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId));
    for(const draft of state.designSheetDrafts?.[key]||[]){
      if(!draft.previewBoxes?.[0])continue;
      const asset=state.designAssets.find(a=>Number(a.id)===Number(draft.designAssetId));if(!asset)continue;
      draft.pendingMeasureOption=detectedMeasureOption(asset,key==='upload'?state.sheetUploadPreview?.file?.name:sheet?.file_name,sheetBoxMeasures(draft.previewBoxes[0],size));
      draft.measureOptionId=draft.pendingMeasureOption.id;draft.sourceMethod='box-selected';
    }
    state.sheetCompositionConfirmation=null;renderSheetSelected(key);
  }
  function detectedMeasureOption(asset,fileName,measurement){
    const options=parseDesignMeasureOptions(asset),widthCm=Number(Number(measurement.widthCm).toFixed(2)),heightCm=Number(Number(measurement.heightCm).toFixed(2)),close=o=>Math.abs(Number(o.widthCm)-widthCm)<.2&&Math.abs(Number(o.heightCm)-heightCm)<.2,metadata=options.find(o=>close(o)&&(o.sources||[]).length)||options.find(close)||{},sourceTag=String(fileName||'plancha').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36)||'plancha',destinations=Array.isArray(metadata.destinations)&&metadata.destinations.length?metadata.destinations:['Todos'];
    const exact=metadata.id&&Math.abs(Number(metadata.widthCm)-widthCm)<.005&&Math.abs(Number(metadata.heightCm)-heightCm)<.005;
    return {...metadata,id:exact?metadata.id:`scan-${asset.id}-${sourceTag}-${Math.round(widthCm*100)}x${Math.round(heightCm*100)}`,widthCm,heightCm,destination:destinations[0]||'Todos',destinations,size:String(metadata.size||''),detail:String(metadata.detail||`Marcado en ${fileName||'plancha'}`),sources:exact?(metadata.sources||[]):[]};
  }
  async function readDesignImagePixels(blob,maxWidth){
    const bitmap=await createImageBitmap(blob),scale=Math.min(1,maxWidth/bitmap.width),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale)),canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0,width,height);bitmap.close?.();
    return {width,height,data:context.getImageData(0,0,width,height).data};
  }
  function cropMarkedDesign(pixels){
    let left=pixels.width,top=pixels.height,right=-1,bottom=-1;
    for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++)if(pixels.data[(y*pixels.width+x)*4+3]>70){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left||bottom<top)return null;
    return {left,top,width:right-left+1,height:bottom-top+1,source:pixels};
  }
  function markedDesignSamples(crop,rotation,grid=9){
    const width=rotation%180?crop.height:crop.width,height=rotation%180?crop.width:crop.height,points=[];
    for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
      const u=(x+.5)/grid,v=(y+.5)/grid,sx=rotation===90?v:rotation===180?1-u:rotation===270?1-v:u,sy=rotation===90?1-u:rotation===180?1-v:rotation===270?u:v;
      const px=crop.left+Math.min(crop.width-1,Math.floor(sx*crop.width)),py=crop.top+Math.min(crop.height-1,Math.floor(sy*crop.height)),offset=(py*crop.source.width+px)*4;
      const alpha=crop.source.data[offset+3];
      if(alpha>160)points.push({u,v,r:crop.source.data[offset],g:crop.source.data[offset+1],b:crop.source.data[offset+2]});
      else if(alpha<30)points.push({u,v,transparent:true});
    }
    const opaque=points.filter(p=>!p.transparent),colors=new Set(opaque.map(p=>[p.r>>5,p.g>>5,p.b>>5].join(':')));
    return opaque.length>=10&&(colors.size>=3||points.length-opaque.length>=4)?{width,height,points}:null;
  }
  function locateMarkedDesign(sheet,crop,point){
    let best=null;const px=point.x*sheet.width,py=point.y*sheet.height;
    const scoreAt=(template,x,y,width,height,cutoff=Infinity)=>{
      if(x<0||y<0||x+width>sheet.width||y+height>sheet.height||px<x||px>x+width||py<y||py>y+height)return Infinity;
      let score=0;
      for(const p of template.points){
        const ix=Math.min(sheet.width-1,Math.floor(x+p.u*width)),iy=Math.min(sheet.height-1,Math.floor(y+p.v*height)),at=(iy*sheet.width+ix)*4;
        score+=p.transparent?(sheet.data[at+3]>100?.24:0):sheet.data[at+3]<65?.55:(Math.abs(sheet.data[at]-p.r)+Math.abs(sheet.data[at+1]-p.g)+Math.abs(sheet.data[at+2]-p.b))/765;
        if(score/template.points.length>cutoff)return Infinity;
      }
      return score/template.points.length;
    };
    for(const rotation of [0,90,180,270]){
      const template=markedDesignSamples(crop,rotation);if(!template)continue;
      const maxWidth=sheet.width;
      for(let width=10;width<=maxWidth;width+=Math.max(1,Math.round(width*.065))){
        const height=Math.max(2,Math.round(width*template.height/template.width));if(height>sheet.height)continue;
        const step=Math.max(2,Math.round(width*.075));
        for(let y=Math.max(0,Math.round(py-height));y<=Math.min(Math.round(py),sheet.height-height);y+=step){
          for(let x=Math.max(0,Math.round(px-width));x<=Math.min(Math.round(px),sheet.width-width);x+=step){
            const score=scoreAt(template,x,y,width,height,best?.score??Infinity);
            if(Number.isFinite(score)&&(!best||score<best.score))best={score,x,y,width,height,rotation};
          }
        }
      }
    }
    if(!best||best.score>.15)return null;
    const template=markedDesignSamples(crop,best.rotation,17);if(!template)return null;
    best.score=scoreAt(template,best.x,best.y,best.width,best.height);
    let step=Math.max(1,Math.round(best.width*.02)),radius=Math.max(3,Math.round(best.width*.1));
    while(true){
      const base={...best};
      for(let width=Math.max(4,base.width-radius);width<=base.width+radius;width+=step){
        const height=Math.max(2,Math.round(width*template.height/template.width));
        for(let y=base.y-radius;y<=base.y+radius;y+=step)for(let x=base.x-radius;x<=base.x+radius;x+=step){
          const score=scoreAt(template,x,y,width,height,best.score);
          if(score<best.score)best={score,x,y,width,height,rotation:base.rotation};
        }
      }
      if(step===1)break;radius=Math.max(2,Math.round(step*1.5));step=Math.max(1,Math.floor(step/4));
    }
    if(best.score>.11)return null;
    return {x:best.x/sheet.width,y:best.y/sheet.height,width:best.width/sheet.width,height:best.height/sheet.height,rotation:best.rotation,score:best.score};
  }
  async function measureMarkedDesignAtPoint(index,point){
    const draft=state.designSheetDrafts.upload?.[index],asset=state.designAssets.find(a=>Number(a.id)===Number(draft?.designAssetId)),file=state.sheetUploadPreview?.file,status=qs('[data-sheet-detection-status]');
    if(!asset||!file)throw new Error('Elegí la plancha y el diseño antes de marcar.');
    if(state.sheetMeasureBusy)return;state.sheetMeasureBusy=true;if(status)status.textContent=`Midiendo ${asset.name||asset.file_name} en el punto señalado…`;
    try{
      const pixels=state.sheetPixels?.file===file?state.sheetPixels.pixels:await readDesignImagePixels(file,1000);
      if(file!==state.sheetUploadPreview?.file)return;state.sheetPixels={file,pixels};
      let crop=state.sheetDesignPixels?.get(Number(asset.id));if(!crop){
        const response=await fetch(apiUrl(`/api/admin/design-assets/${asset.id}/file`),{credentials:'include',redirect:'manual'});if(response.type==='opaqueredirect'||response.status===401)throw adminSessionError();
        if(!response.ok)throw new Error('No se pudo leer el diseño individual.');
        crop=cropMarkedDesign(await readDesignImagePixels(await response.blob(),450));if(!crop)throw new Error('El archivo individual no tiene una imagen reconocible.');
        (state.sheetDesignPixels??=new Map()).set(Number(asset.id),crop);
      }
      await new Promise(resolve=>setTimeout(resolve,0));
      const result=locateMarkedDesign(pixels,crop,point),current=state.designSheetDrafts.upload.indexOf(draft);
      if(file!==state.sheetUploadPreview?.file||current<0)return;
      if(!result)throw new Error('No pude delimitar este diseño con seguridad. Arrastrá un recuadro alrededor de su contorno.');
      applySheetBox(current,result);
    }catch(err){if(status)status.textContent=err.message;}
    finally{state.sheetMeasureBusy=false;}
  }
  function openSheetMeasure(key,id){
    const asset=state.designAssets.find(x=>Number(x.id)===Number(id));if(!asset)return;
    state.sheetMeasureTarget={key,id:Number(id)};let d=qs('#sheetMeasureDialog');if(!d){d=document.createElement('dialog');d.id='sheetMeasureDialog';d.className='admin-dialog';document.body.appendChild(d)}
    d.innerHTML=`<div class="dialog-shell"><div class="dialog-head"><h2>Nueva medida · ${escapeHtml(asset.name||asset.file_name)}</h2></div><div class="dialog-body">${designSmallImage(asset)}${designMeasureEditor('sheet-measure')}</div><div class="dialog-foot"><button type="button" class="btn btn-ghost" data-sheet-measure-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-sheet-measure-save>Guardar y agregar a la plancha</button></div></div>`;d.showModal();
  }
  async function saveSheetMeasure(button){
    const dialog=qs('#sheetMeasureDialog'),options=readDesignMeasureOptions(dialog);if(!options.length)throw new Error('Ingresá las medidas.');button.disabled=true;
    try{const {key,id}=state.sheetMeasureTarget,data=await api(`/api/admin/design-assets/${id}/measures`,{method:'POST',body:JSON.stringify({measureOptions:options})});state.designAssets=state.designAssets.map(a=>Number(a.id)===id?data.item:a);for(const option of options)state.designSheetDrafts[key].push({designAssetId:id,measureOptionId:option.id,quantity:1});dialog.close();syncSheetScope(key);renderSheetSelected(key);toast('Medidas guardadas en el diseño','success')}finally{button.disabled=false}
  }
  function updateSheetMetrics(key){const el=qs('[data-sheet-metrics]',sheetRoot(key)),size=sheetSize(key),sheet=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId)),cost=key==='upload'?pesosToCents(qs('#designUploadCost')?.value||10000):pesosToCents(qs('[data-design-cost]',sheetRoot(key))?.value||0)||Number(sheet?.cost_cents)||1000000;if(el)el.innerHTML=sheetMetricsHtml(size.width,size.height,sheetComponents(key),cost);}
  function syncSheetScope(key){const select=sheetScope(key),scopes=new Set(sheetComponents(key).map(c=>c.scope));if(select&&select.value!=='mixed'&&scopes.size)select.value=scopes.size>1?'mixed':[...scopes][0];if(select?.value==='mixed'){const kind=qs(key==='upload'?'#designUploadKind':'[data-design-kind]',sheetRoot(key));kind.value='sheet';kind.disabled=true;}}
  async function uploadMissingSheetDesign(button,all=false){
    if(state.designUploadBusy)return;
    const key=button.closest?.('[data-sheet-editor]')?.dataset.sheetEditor||'upload',root=sheetRoot(key),queue=sheetMissingQueue(key);
    rememberMissingSheetFields(key);
    const records=all?[...queue]:queue.filter(item=>item.id===button.dataset.uploadMissingSheetDesign);
    if(!records.length)throw new Error('Elegí la imagen del diseño faltante.');
    for(const record of records){if(!record.file||!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(record.file.type))throw new Error(`Usá PNG, JPG, WEBP o SVG para ${record.file?.name||'el diseño faltante'}.`);}
    const controls=qsa('input,select,textarea,button',root.closest('dialog')||root).map(el=>[el,el.disabled]),status=qs('[data-missing-upload-status]',root),originalLabel=button.textContent;
    state.designUploadBusy=true;controls.forEach(([el])=>el.disabled=true);button.disabled=true;button.textContent=all?'Subiendo diseños…':'Subiendo diseño…';
    let cursor=0,completed=0,stop=false;const failures=[];
    const progress=()=>{if(status)status.textContent=`Subiendo y agregando ${completed} de ${records.length}…`;};progress();
    try{
      await Promise.all(Array.from({length:Math.min(2,records.length)},async()=>{
        while(!stop&&cursor<records.length){const record=records[cursor++],file=record.file;delete record.error;
          try{
            const fd=new FormData();fd.append('file',file);fd.append('scope',record.scope==='clients'?'clients':'salmos');fd.append('kind','individual');fd.append('name',String(record.name||'').trim()||file.name.replace(/\.[^.]+$/,''));fd.append('note','');fd.append('printMaterialType',(key==='upload'?qs('#designUploadPrintType')?.value:qs('[data-design-print-type]',root)?.value)||'dtf_textile');fd.append('measureOptions','[]');fd.append('widthCm','0');fd.append('heightCm','0');fd.append('components','[]');
            const asset=record.savedItem||(await uploadDesignForm(fd,record)).item;if(!asset?.id)throw new Error('No recibí la referencia del diseño.');record.savedItem=asset;
            state.designAssets=state.designAssets.filter(a=>Number(a.id)!==Number(asset.id));state.designAssets.unshift(asset);state.sheetUploadRecent=[Number(asset.id),...(state.sheetUploadRecent||[]).filter(id=>id!==Number(asset.id))];
            const index=queue.indexOf(record);if(index>=0)queue.splice(index,1);if(record.previewUrl){URL.revokeObjectURL(record.previewUrl);delete record.previewUrl;}(state.sheetMissingUnlocked??={})[key]=true;completed++;progress();
          }catch(err){record.error=err.message;failures.push(err);if(err.sessionExpired)stop=true;}
        }
      }));
      if(completed){state.costingLoaded=false;if(key==='upload')state.sheetCompositionConfirmation=null;
        for(const record of records)if(record.savedItem)addSheetDesign(key,Number(record.savedItem.id),false,false);
        const library=qs('.sheet-design-library',root);if(library)library.innerHTML=sheetDesignLibraryHtml(key);renderSheetSelected(key);
        toast(`${completed} diseño${completed===1?' subido y agregado':'s subidos y agregados'}. Ya podés marcarlos en la plancha.`,'success');
      }
    }finally{
      controls.forEach(([el,disabled])=>el.disabled=disabled);state.designUploadBusy=false;button.disabled=false;button.textContent=originalLabel;renderMissingSheetQueue(key);syncSheetUploadGate(key);
    }
    if(failures.length){if(status)status.textContent=`${completed} agregado${completed===1?'':'s'}. Los archivos que faltan quedan listos para volver a intentar.`;throw failures[0];}
  }
  function addSheetDesign(key,id,another=false,render=true){state.sheetRepeatTarget=null;
    state.designSheetDrafts??={};const list=state.designSheetDrafts[key]??=[];
    let index=!another?list.findIndex(c=>Number(c.designAssetId)===id):-1;
    if(index<0){const draft={designAssetId:id,measureOptionId:'',quantity:0,previewMarks:[],previewBoxes:[]};list.push(draft);index=list.length-1;}
    if(state.sheetActiveBox?.key!==key||state.sheetActiveBox.rowIndex!==index)state.sheetActiveBox=null;state.sheetBoxTarget={key,index};state.sheetMarkTarget=null;syncSheetScope(key);if(render)renderSheetSelected(key);
  }
  function assignUploadClient(button,client){
    if(button.hasAttribute('data-client-batch')){const record=state.designUploadFiles.find(x=>String(x.id)===button.dataset.clientBatch);if(record)record.clientId=client.id;const name=qs(`[data-client-name-batch="${button.dataset.clientBatch}"]`);if(name)name.textContent=client.name;const scope=qs(`[data-design-batch-scope="${button.dataset.clientBatch}"]`);if(scope)scope.value='clients';}
    else{state.designUploadClientId=client.id;qs('#designUploadScope').value='clients';qsa('[data-design-batch-scope]').forEach(select=>select.value='clients');qs('.design-client-link:not([data-design-batch-row]) [data-design-client-name]')?.replaceChildren(document.createTextNode(client.name));}
  }
  function setUploadKind(kind){
    const select=qs('#designUploadKind');select.value=kind;
    if(kind==='sheet'){
      const record=(state.designUploadFiles||[])[0];
      if(record&&state.sheetUploadPreview?.file!==record.file){if(state.sheetUploadPreview?.url)URL.revokeObjectURL(state.sheetUploadPreview.url);state.sheetUploadPreview={file:record.file,url:URL.createObjectURL(record.file),mime_type:record.file.type};state.sheetPixels=null;state.sheetImageSizes={...state.sheetImageSizes,upload:null};restoreSheetDraft(record.file);}
    }
    refreshDesignKind('upload');renderDesignUploadBatchMeta();
  }
  function refreshDesignKind(key){
    const root=sheetRoot(key),isSheet=sheetKind(key)==='sheet';qsa('[data-sheet-size]',root).forEach(el=>el.classList.toggle('hidden',!isSheet));
    if(isSheet&&key==='upload'){if(!qs('#designUploadWidth').value)qs('#designUploadWidth').value='58';if(!qs('#designUploadHeight').value)qs('#designUploadHeight').value='100';}
    if(key==='upload'){qsa('[data-upload-sheet-only]',root).forEach(el=>el.classList.toggle('hidden',!isSheet));qs('#designUploadFiles').multiple=true;syncSheetPurchasePanel('upload');}
    qs('[data-individual-options]',root)?.classList.toggle('hidden',isSheet);const host=qs('[data-sheet-composition-host]',root);
    if(host){host.classList.toggle('hidden',!isSheet);if(isSheet&&!qs('[data-sheet-editor]',host))host.innerHTML=sheetCompositionEditor(key);if(isSheet)renderSheetSelected(key);}if(key==='detail'){let tags=qs('[data-design-tag-picker="detail"]',root);if(!isSheet&&!tags){qs('.design-edit-grid',root)?.insertAdjacentHTML('beforeend',designTagPickerHtml('detail',state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId))?.tags||[]));tags=qs('[data-design-tag-picker="detail"]',root);}tags?.classList.toggle('hidden',isSheet);syncSheetPurchasePanel('detail');}
  }
  function sheetPayload(key){const kind=sheetKind(key),size=sheetSize(key),confirmed=key==='upload'&&Boolean(qs('#designSheetCompositionComplete',sheetRoot(key))?.checked)&&state.sheetCompositionConfirmation===sheetCompositionFingerprint();return {widthCm:kind==='sheet'?size.width:0,heightCm:kind==='sheet'?size.height:0,measureOptions:kind==='sheet'||key==='upload'?[]:readDesignMeasureOptions(sheetRoot(key)),components:kind==='sheet'?(state.designSheetDrafts?.[key]||[]).map(c=>({designAssetId:Number(c.designAssetId),measureOptionId:c.measureOptionId,quantity:Number(c.quantity),previewMarks:c.previewMarks||[],previewBoxes:c.previewBoxes||[]})):[],complete:confirmed};}
  function openDesignUpload(context='designs'){
    clearTimeout(state.sheetDraftTimer);state.sheetDraftCompleted=false;clearMissingSheetQueue('upload');(state.sheetRotation??={}).upload=undefined;
    syncSheetUploadGate('upload');state.sheetSizeManual={...state.sheetSizeManual,upload:false};state.sheetImageSizes={...state.sheetImageSizes,upload:null};state.sheetSearch={...state.sheetSearch,upload:''};state.designUploadClientId=null;state.designUploadContext=context;state.designSheetDrafts??={};state.designSheetDrafts.upload=[];state.sheetCompositionConfirmation=null;state.designUploadFiles=[];state.designUploadNextId=0;state.designUploadRenderedIds=new Set();state.sheetUploadRecent=[];for(const url of state.designUploadPreviewUrls||[])URL.revokeObjectURL(url);state.designUploadPreviewUrls=[];if(state.sheetUploadPreview?.url)URL.revokeObjectURL(state.sheetUploadPreview.url);state.sheetUploadPreview=null;state.sheetUploadAppearance={};state.sheetBoxTarget=null;state.sheetRepeatTarget=null;state.sheetActiveBox=null;state.sheetPixels=null;state.sheetDesignPixels=new Map();state.sheetMeasureBusy=false;
    for(const id of ['designUploadName','designUploadWidth','designUploadHeight','designUploadFiles'])qs('#'+id).value='';qs('#designUploadCost').value='10000';qs('#designUploadBatchMeta').innerHTML='';qs('#designUploadBatchMeta').classList.add('hidden');qs('#designUploadTagPicker').innerHTML=designTagPickerHtml('sheet-upload',[]);state.sheetZoom=1;
    qs('#designUploadScope').value='salmos';qs('#designUploadKind').value='individual';qs('#designUploadKind').disabled=false;qs('#designUploadPrintType').value='dtf_textile';qs('#designUploadPrinted').checked=true;qs('#designSheetPurchase').open=true;for(const id of ['sheetPurchaseSupplier','sheetPurchaseSurcharge','sheetPurchaseCash','sheetPurchaseTransfer','sheetPurchaseOrigin','sheetPurchaseDestination','sheetPurchaseReference','sheetPurchaseDetails'])qs('#'+id).value='';qs('#sheetPurchaseMethod').value='cash';qs('#sheetPurchaseSurchargeType').value='fixed';qs('#sheetPurchaseSupplier').value='Adrian';
    qs('#designUploadComposition').innerHTML='';refreshDesignKind('upload');qs('#designUploadDialog').showModal();
    try{const latest=JSON.parse(localStorage.getItem('salmos_sheet_draft_latest')||'null');sheetDraftNotice(latest?`Hay un borrador de ${latest.fileName}. Elegí Plancha y volvé a seleccionar esa imagen para recuperar las marcas.`:'');}catch{}
  }
  async function uploadSheetAndAttach(file,scope,detail){
    const name=(qs('#designUploadName').value||'').trim()||file.name.replace(/\.[^.]+$/,''),printMaterialType=qs('#designUploadPrintType').value,drafts=state.designSheetDrafts.upload||[],prepared=[];
    for(const draft of drafts){let asset=state.designAssets.find(a=>Number(a.id)===Number(draft.designAssetId)),measure=asset&&(draft.pendingMeasureOption||parseDesignMeasureOptions(asset).find(o=>o.id===draft.measureOptionId));if(!asset||!measure)throw new Error('Cada diseño de la plancha necesita una medida válida.');if(draft.pendingMeasureOption){const saved=await api(`/api/admin/design-assets/${asset.id}/measures`,{method:'POST',body:JSON.stringify({measureOptions:[measure]})});asset=saved.item;state.designAssets=state.designAssets.map(a=>Number(a.id)===Number(asset.id)?asset:a);measure=parseDesignMeasureOptions(asset).find(o=>o.id===measure.id);draft.measureOptionId=measure?.id;draft.pendingMeasureOption=null;}if(!measure)throw new Error(`No pude guardar la medida de ${asset.name||asset.file_name}.`);prepared.push({draft,asset,measure});}
    const components=prepared.map(({draft,measure,asset})=>({designAssetId:Number(asset.id),measureOptionId:measure.id,quantity:Math.max(1,Number(draft.quantity)||1),previewMarks:draft.previewMarks||[],previewBoxes:draft.previewBoxes||[]}));
    const fd=new FormData();fd.append('file',file);fd.append('scope',scope);fd.append('kind','sheet');fd.append('name',name);fd.append('note','');fd.append('printMaterialType',printMaterialType);fd.append('costCents',String(pesosToCents(qs('#designUploadCost')?.value||10000)));fd.append('tags','[]');fd.append('widthCm',String(detail.widthCm));fd.append('heightCm',String(detail.heightCm));fd.append('measureOptions','[]');fd.append('components',JSON.stringify(components));fd.append('compositionComplete','true');for(const key of ['preview_background','preview_color'])fd.append(key,previewColor(state.sheetUploadAppearance?.[key]));
    const record=state.sheetUploadPreview;
    const created=record.savedItem?await api(`/api/admin/design-assets/${record.savedItem.id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries([...fd.entries()].filter(([key])=>key!=='file')))}):await uploadDesignForm(fd,record,percent=>{qs('#uploadDesignBtn').textContent=`Subiendo plancha · ${percent}%`;});
    const sheet=created.item;if(!sheet?.id)throw new Error('La imagen se subió pero no recibí su referencia. Actualizá la biblioteca antes de volver a cargarla.');
    record.savedItem=sheet;persistSheetDraft();
    for(const {draft,asset,measure} of prepared){const source={sheetAssetId:Number(sheet.id),name:sheet.name||sheet.file_name,fileName:sheet.file_name,box:(draft.previewBoxes||[])[0]||{x:0,y:0,width:0,height:0,rotation:0},boxes:draft.previewBoxes||[],quantity:Math.max(1,Number(draft.quantity)||1),confidence:Number(draft.confidence)||0,method:draft.sourceMethod||'manual'},saved=await api(`/api/admin/design-assets/${asset.id}/measures`,{method:'POST',body:JSON.stringify({measureOptions:[{...measure,sources:[...(measure.sources||[]),source].slice(0,20)}]})});state.designAssets=state.designAssets.map(a=>Number(a.id)===Number(asset.id)?saved.item:a);}
    return sheet;
  }
  async function uploadDesignForm(form,record={},onProgress=()=>{}){
    const file=form.get('file');
    if(file.size<8*1024*1024)return await api('/api/admin/design-assets',{method:'POST',body:form});
    const metadata=Object.fromEntries([...form.entries()].filter(([key])=>key!=='file'));
    const fingerprint=JSON.stringify(metadata);
    if(record.uploadMetadata!==fingerprint){record.uploadId=crypto.randomUUID();record.uploadMetadata=fingerprint;}
    persistSheetDraft();
    const upload=await api('/api/admin/design-asset-uploads',{method:'POST',body:JSON.stringify({id:record.uploadId,fileName:file.name,mimeType:file.type,sizeBytes:file.size,metadata})});
    if(upload.item)return {item:upload.item};
    const received=new Set((upload.parts||[]).map(part=>Number(part.partNumber))),total=Math.ceil(file.size/upload.partSize);
    for(let index=0;index<total;index++){
      if(!received.has(index+1)){
        await api(`/api/admin/design-asset-uploads/${upload.id}/parts/${index+1}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file.slice(index*upload.partSize,Math.min(file.size,(index+1)*upload.partSize))});
      }
      onProgress(Math.round((index+1)/total*100));
    }
    return await api(`/api/admin/design-asset-uploads/${upload.id}/complete`,{method:'POST',body:'{}'});
  }
  function sheetPurchasePrefix(key){return key==='upload'?'sheetPurchase':'detailSheetPurchase';}
  function sheetIsPrinted(key){return Boolean(qs(key==='upload'?'#designUploadPrinted':'[data-design-printed]',sheetRoot(key))?.checked);}
  function sheetPurchaseRequired(key){
    if(sheetKind(key)!=='sheet'||!sheetIsPrinted(key))return false;
    if(key==='upload')return Boolean(state.sheetUploadPreview?.file&&!state.sheetUploadPreview.savedPurchaseId&&!state.sheetUploadPreview.savedItem?.purchase_id);
    const asset=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId));
    return !qs('#designDetailEditor')?.classList.contains('hidden')&&!asset?.purchase_id;
  }
  function sheetPurchasePanelHtml(key){
    const p=sheetPurchasePrefix(key);
    return `<details class="sheet-purchase-panel" id="${key==='upload'?'designSheetPurchase':'detailDesignSheetPurchase'}" open><summary>Compra de la plancha impresa · obligatoria</summary><p class="field-help">Al guardar se registra la compra, el ingreso de DTF y el pago en Caja. Para cargarla sin compra, desmarcá “Impreso”.</p><div class="form-grid"><label class="field">Monto de compra ($)<input class="input" id="${p}Amount" type="number" min="0.01" step=".01" data-sheet-purchase-amount></label><label class="field">Proveedor<input class="input" id="${p}Supplier" list="supplierSuggestions" value="Adrian" placeholder="Adrian"></label><label class="field">Forma de pago<select class="select" id="${p}Method"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="mixed">Efectivo y transferencia</option></select></label><label class="field">Recargo<select class="select" id="${p}SurchargeType"><option value="fixed">Pesos</option><option value="percent">Porcentaje</option></select></label><label class="field">Importe del recargo<input class="input" id="${p}Surcharge" type="number" min="0" step=".01" value="0"></label><label class="field" data-sheet-mixed>Efectivo ($)<input class="input" id="${p}Cash" type="number" min="0" step=".01"></label><label class="field" data-sheet-mixed>Transferencia ($)<input class="input" id="${p}Transfer" type="number" min="0" step=".01"></label><label class="field" data-sheet-transfer>Origen / alias<input class="input" id="${p}Origin" placeholder="Opcional"></label><label class="field" data-sheet-transfer>Destino / alias<input class="input" id="${p}Destination" placeholder="Opcional"></label><label class="field" data-sheet-transfer>N.º de operación<input class="input" id="${p}Reference" placeholder="Opcional"></label><label class="field" data-sheet-transfer>Detalle de la transferencia<input class="input" id="${p}Details" placeholder="Opcional"></label></div><p id="${p}Total" class="field-help"></p></details>`;
  }
  function syncSheetPurchaseAmount(key,source=null){
    const cost=qs(key==='upload'?'#designUploadCost':'[data-design-cost]',sheetRoot(key)),amount=qs('#'+sheetPurchasePrefix(key)+'Amount');
    if(!cost||!amount)return;
    if(source===amount)cost.value=amount.value;else amount.value=cost.value;
  }
  function syncSheetPurchasePanel(key){
    const panel=qs(key==='upload'?'#designSheetPurchase':'#detailDesignSheetPurchase'),p=sheetPurchasePrefix(key);if(!panel)return;
    syncSheetPurchaseAmount(key);
    const record=key==='upload'?state.sheetUploadPreview?.savedItem:state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId));
    const enabled=sheetKind(key)==='sheet'&&sheetIsPrinted(key)&&!record?.purchase_id&&!(key==='upload'&&state.sheetUploadPreview?.savedPurchaseId);
    panel.classList.toggle('hidden',!enabled&&!record?.purchase_id);if(enabled||record?.purchase_id)panel.open=true;if(record?.purchase_id){let summary=qs('[data-registered-purchase]',panel);if(!summary){summary=document.createElement('div');summary.dataset.registeredPurchase='';panel.append(summary);}qsa('.form-grid,.field-help',panel).forEach(el=>el.classList.add('hidden'));const heading=qs('summary',panel);if(heading)heading.textContent='Compra registrada';if(key!=='detail'||summary.dataset.purchaseId!==String(record.purchase_id))summary.textContent=`Compra #${record.purchase_id} · ${money(record.cost_cents||0)}`;if(key==='detail')loadSheetPurchaseSummary(record,summary);else summary.textContent+=[qs('#'+p+'Supplier')?.value,qs('#'+p+'Method')?.selectedOptions?.[0]?.textContent].filter(Boolean).map(v=>' · '+v).join('');}
    const method=qs('#'+p+'Method')?.value||'cash';
    qsa('[data-sheet-mixed]',panel).forEach(el=>el.classList.toggle('hidden',method!=='mixed'));
    qsa('[data-sheet-transfer]',panel).forEach(el=>el.classList.toggle('hidden',method==='cash'));
    const base=pesosToCents(qs(key==='upload'?'#designUploadCost':'[data-design-cost]',sheetRoot(key))?.value);
    const surcharge=Number(qs('#'+p+'Surcharge')?.value)||0,type=qs('#'+p+'SurchargeType')?.value;
    const total=base+Math.round(type==='percent'?base*surcharge/100:surcharge*100),host=qs('#'+p+'Total');
    if(host)host.textContent=`Total de la compra: ${money(total)}`;
  }
  async function loadSheetPurchaseSummary(record,host){if(host.dataset.purchaseId===String(record.purchase_id))return;host.dataset.purchaseId=String(record.purchase_id);try{state.sheetPurchaseRecords??=api('/api/admin/purchases').then(d=>d.items||[]).catch(err=>{state.sheetPurchaseRecords=null;throw err;});const rows=await state.sheetPurchaseRecords,purchase=rows.find(p=>Number(p.id)===Number(record.purchase_id));if(purchase&&host.isConnected)host.textContent=[`Compra #${purchase.id}`,purchase.supplier,money(purchase.total_cents||record.cost_cents),(purchase.payments||[]).map(p=>`${p.method==='cash'?'Efectivo':'Transferencia'}: ${money(p.amount_cents)}`).join(' · ')].filter(Boolean).join(' · ');}catch{delete host.dataset.purchaseId;host.textContent+= ' · No se pudo cargar el detalle. Volvé a abrir la plancha para reintentar.';}}
  function sheetPurchasePayload(sheet,key='upload'){
    const p=sheetPurchasePrefix(key),read=name=>String(qs('#'+p+name)?.value||'').trim();
    const amount=qs('#'+p+'Amount'),base=amount?pesosToCents(amount.value):Number(sheet.cost_cents),quantity=Number(sheet.height_cm)/100;
    if(!Number.isSafeInteger(base)||base<=0)throw new Error('Ingresá un costo de plancha mayor a cero para registrar la compra.');
    if(!Number.isFinite(quantity)||quantity<=0)throw new Error('Ingresá el alto de la plancha para registrar los metros comprados.');
    if(!['dtf_textile','dtf_uv'].includes(sheet.print_material_type))throw new Error('Elegí DTF textil o DTF UV para la compra de la plancha impresa.');
    const type=read('SurchargeType'),value=Number(read('Surcharge')),charge=Math.round(type==='percent'?base*value/100:value*100),total=base+charge,method=read('Method');
    if(!['fixed','percent'].includes(type)||!Number.isFinite(value)||value<0||!Number.isSafeInteger(total))throw new Error('Ingresá un recargo válido, mayor o igual a cero.');
    if(!['cash','transfer','mixed'].includes(method))throw new Error('Elegí la forma de pago de la plancha.');
    const supplier=read('Supplier'),transfer={method:'transfer',origin:read('Origin'),destination:read('Destination'),reference:read('Reference'),details:read('Details')};
    let payments;
    if(method==='mixed'){
      const cash=pesosToCents(read('Cash')),transferred=pesosToCents(read('Transfer'));
      if(cash<=0||transferred<=0||cash+transferred!==total)throw new Error(`Efectivo + transferencia debe sumar ${money(total)}.`);
      payments=[{method:'cash',amountCents:cash,destination:supplier},{...transfer,amountCents:transferred}];
    }else payments=[method==='cash'?{method:'cash',amountCents:total,destination:supplier}:{...transfer,amountCents:total}];
    return {sourceSheetAssetId:Number(sheet.id),supplier,reference:`Plancha #${sheet.id} · ${sheet.name||sheet.file_name||''}`,notes:'DTF registrado desde Diseños',surchargeType:type,surchargeValue:value,payments,occurredAt:new Date().toISOString(),items:[{materialType:sheet.print_material_type,name:sheet.print_material_type==='dtf_uv'?'DTF UV':'DTF textil',features:[sheet.print_material_type==='dtf_uv'?'DTF UV':'DTF textil'],quantity,unit:'meter',widthCm:Number(sheet.width_cm),unitPriceCents:Math.round(base/quantity),lineTotalCents:base,sheetAssetId:Number(sheet.id)}]};
  }
  async function registerSheetPurchase(sheet,key='upload'){
    if(sheet.purchase_id)return;
    const result=await api('/api/admin/purchases',{method:'POST',body:JSON.stringify(sheetPurchasePayload(sheet,key))});
    if(!result.item?.id)throw new Error('No pude confirmar la compra de la plancha. Reintentá el guardado.');
    sheet.purchase_id=Number(result.item.id);sheet.printed=1;
    if(key==='upload'){state.sheetUploadPreview.savedPurchaseId=sheet.purchase_id;state.sheetUploadPreview.savedItem=sheet;persistSheetDraft();}
    state.designAssets=state.designAssets.map(a=>Number(a.id)===Number(sheet.id)?{...a,...sheet}:a);
    state.costingLoaded=false;syncSheetPurchasePanel(key);
  }
  function canCloseDesignDialog(key){
    if(state.designUploadBusy||sheetHasPendingUpload(key)){toast('Primero subí el diseño o descartá el archivo pendiente.');return false;}
    if(sheetPurchaseRequired(key)){syncSheetPurchasePanel(key);toast('Con “Impreso” marcado, guardá la compra de esta plancha. Para salir sin registrarla, desmarcá “Impreso”.','error',6000);return false;}
    return true;
  }
  function appendDesignUploadFiles(files){
    state.designUploadFiles??=[];state.designUploadPreviewUrls??=[];state.designUploadNextId??=0;
    for(const file of files){
      const previewUrl=/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)?URL.createObjectURL(file):'';
      if(previewUrl)state.designUploadPreviewUrls.push(previewUrl);
      state.designUploadFiles.push({id:state.designUploadNextId++,file,previewUrl,savedItem:null});
    }
    renderDesignUploadBatchMeta();
  }
  function lockDesignUpload(){
    state.designUploadBusy=true;
    const controls=qsa('input,select,textarea,button',qs('#designUploadDialog')).map(el=>[el,el.disabled]);
    controls.forEach(([el])=>el.disabled=true);
    return ()=>{controls.forEach(([el,disabled])=>el.disabled=disabled);qs('#designUploadKind').disabled=qs('#designUploadScope').value==='mixed';state.designUploadBusy=false;};
  }
  function renderDesignUploadBatchMeta(){
    const host=qs('#designUploadBatchMeta'),files=state.designUploadFiles||[],visible=qs('#designUploadKind')?.value==='individual'&&files.length>0;if(!host)return;
    host.classList.toggle('hidden',!visible);if(!visible)return;
    state.designUploadRenderedIds??=new Set();
    if(!state.designUploadRenderedIds.size)host.innerHTML='<strong>Un diseño por archivo</strong><p class="muted"><span data-batch-count></span> · Podés elegir más archivos sin perder estos. Las medidas son opcionales.</p>';
    for(const {id,file,previewUrl} of files){
      if(state.designUploadRenderedIds.has(id))continue;
      host.insertAdjacentHTML('beforeend',`<div class="design-upload-file-meta" data-design-batch-row="${id}"><div class="design-upload-file-preview"><span class="design-upload-artwork" ${designVisualAttrs('batch-'+id)}>${previewUrl?`<img src="${escapeHtml(previewUrl)}" alt="Vista previa de ${escapeHtml(file.name)}">`:'<span>Sin vista previa</span>'}</span></div><div class="design-upload-file-fields"><label class="field">Nombre<input class="input" data-design-batch-name="${id}" value="${escapeHtml(file.name.replace(/\.[^.]+$/,''))}" maxlength="160"></label><label class="field">Sección<select class="select" data-design-batch-scope="${id}"><option value="salmos">SALMOS</option><option value="clients">Clientes</option></select></label><div class="design-client-link"><button type="button" class="btn btn-ghost" data-choose-design-client data-client-batch="${id}">Cliente</button><button type="button" class="icon-btn" data-add-design-client data-client-batch="${id}" aria-label="Agregar cliente"><i class="fa-solid fa-circle-plus" aria-hidden="true"></i></button><span data-design-client-name data-client-name-batch="${id}"></span></div>${designBackgroundControlHtml('batch-'+id)}${designTagPickerHtml(`batch-${id}`,[])}<details class="design-upload-file-measures"><summary>Destino y medidas (opcional)</summary>${designMeasureEditor('batch-'+id)}</details><div class="design-upload-file-actions"><small data-upload-file-status>Listo para subir</small><button type="button" class="icon-btn" data-remove-upload-file="${id}" aria-label="Quitar ${escapeHtml(file.name)}">×</button></div></div></div>`);
      state.designUploadRenderedIds.add(id);
    }
    const counter=qs('[data-batch-count]',host);if(counter)counter.textContent=`${files.length} archivo${files.length===1?'':'s'} seleccionados`;
  }
  async function uploadDesignFiles(button){
    if(state.designUploadBusy)return;
    const scope=qs('#designUploadScope').value,kind=scope==='mixed'?'sheet':qs('#designUploadKind').value,records=state.designUploadFiles||[],files=kind==='sheet'?[state.sheetUploadPreview?.file].filter(Boolean):records.map(x=>x.file),detail=kind==='sheet'?sheetPayload('upload'):null;
    if(!files.length)throw new Error('Elegí al menos un archivo.');
    if(kind==='sheet'&&records.length>1)throw new Error('Tenés varios archivos cargados. Quitá los demás o elegí Individual; los archivos se conservan al cambiar de tipo.');
    if(kind==='sheet'&&files.length!==1)throw new Error('Cargá una plancha por vez para indicar su composición.');
    if(kind==='sheet'){
      const problem=sheetMeasurementProblem('upload');if(problem)throw new Error(problem);
      if(!/^image\/(png|jpeg|webp)$/.test(files[0].type))throw new Error('Para marcar los diseños, subí la plancha en PNG, JPG o WEBP.');
      const drafts=state.designSheetDrafts.upload||[];
      if(!detail.complete)throw new Error('Confirmá que marcaste cada diseño y cada aparición de la plancha.');
      if(!drafts.length)throw new Error('Elegí y marcá los diseños que componen la plancha.');
      for(let i=0;i<drafts.length;i++){const d=drafts[i],asset=state.designAssets.find(a=>Number(a.id)===Number(d.designAssetId)),measure=d.pendingMeasureOption||parseDesignMeasureOptions(asset||{}).find(o=>o.id===d.measureOptionId);if(!asset||!measure||!d.previewBoxes?.length||Number(d.quantity)!==d.previewBoxes.length)throw new Error(`Falta marcar en la plancha ${asset?.name||'el diseño '+(i+1)}. Dibujá un recuadro sobre cada aparición.`);}
    }
    const purchaseWanted=kind==='sheet'&&sheetIsPrinted('upload');
    if(purchaseWanted)sheetPurchasePayload({id:state.sheetUploadPreview?.savedItem?.id||0,cost_cents:pesosToCents(qs('#designUploadCost').value),width_cm:detail.widthCm,height_cm:detail.heightCm,print_material_type:qs('#designUploadPrintType').value});
    const uploaded=[],originalLabel=button.textContent,restoreControls=lockDesignUpload();button.disabled=true;
    try{await ensureCostingData();for(let i=0;i<files.length;i++){
      const file=files[i];button.textContent=`Subiendo ${i+1} de ${files.length}…`;
      if(kind==='sheet'){const saved=await uploadSheetAndAttach(file,scope,detail);if(saved){if(scope==='clients'&&state.designUploadClientId)await clientDirectory().linkDesign(state.designUploadClientId,saved.id);uploaded.push(saved);if(purchaseWanted){try{await registerSheetPurchase(saved);toast('Plancha y compra guardadas','success')}catch(err){persistSheetDraft();throw new Error(`La plancha está guardada; falta completar su compra. Reintentá sin volver a cargar el archivo. ${err.message}`);}}}continue;}
      const record=records[i];if(record.savedItem){if(record.clientId||state.designUploadClientId)await clientDirectory().linkDesign(record.clientId||state.designUploadClientId,record.savedItem.id);uploaded.push(record.savedItem);continue;}
      const id=record.id,fileName=String(qs(`[data-design-batch-name="${id}"]`)?.value||'').trim()||file.name.replace(/\.[^.]+$/,''),fileScope=qs(`[data-design-batch-scope="${id}"]`)?.value||'salmos',row=qs(`[data-design-batch-row="${id}"]`),measureOptions=row?readDesignMeasureOptions(row):[],fd=new FormData();
      fd.append('file',file);fd.append('scope',fileScope);fd.append('kind',kind);fd.append('name',fileName);fd.append('note','');fd.append('tags',JSON.stringify(designPickerSelections(qs(`[data-design-tag-picker="batch-${id}"]`))));fd.append('printMaterialType',qs('#designUploadPrintType').value);fd.append('widthCm','0');fd.append('heightCm','0');fd.append('measureOptions',JSON.stringify(measureOptions));fd.append('components','[]');for(const key of ['preview_background','preview_color'])fd.append(key,previewColor(record.appearance?.[key]));
      const saved=await uploadDesignForm(fd,record,percent=>{button.textContent=`Subiendo ${i+1} de ${files.length} · ${percent}%`;});if(!saved.item?.id)throw new Error(`No pude confirmar que se guardó ${file.name}.`);
      record.savedItem=saved.item;if(fileScope==='clients'&&(record.clientId||state.designUploadClientId))await clientDirectory().linkDesign(record.clientId||state.designUploadClientId,saved.item.id);uploaded.push(saved.item);const status=qs('[data-upload-file-status]',row);if(status)status.textContent='Subido ✓';
    }
      if(kind==='sheet')clearSheetDraft();
      qs('#designUploadDialog').close();state.costingLoaded=false;toast('Diseño/s guardado/s','success');
      if(state.designUploadContext==='production'){const data=await api('/api/admin/design-assets');state.designAssets=data.items||[];renderProductionDesignGallery();renderProductionSelectedDesigns();}else await renderDesigns();
    }finally{restoreControls();button.disabled=false;button.textContent=originalLabel;}
  }
  function designTagFilterHtml(key,items){const tags=[...new Set(items.flatMap(a=>a.tags||[]))];const selected=state.designTagFilters?.[key]||[];return designTagPickerHtml('filter-'+key,selected).replace('class="field design-tag-picker"','class="field design-tag-picker design-tag-filter-dropdown"').replace(/data-design-tag-choice value="([^"]*)"/g,(_,tag)=>`data-design-tag-choice data-design-filter="${escapeHtml(key)}" data-tag="${tag}" value="${tag}"`).replace('<label>Etiquetas</label>','<label>Filtrar por etiquetas</label>').replace('Elegir etiquetas','Filtrar etiquetas');}

  function designVisible(key,a){if(a.kind==='sheet')return true;return (state.designTagFilters?.[key]||[]).every(tag=>(a.tags||[]).includes(tag))}
  function updateDesignSelectionUI(){
    const selected=state.selectedDesignAssets??new Set(),button=qs('#deleteSelectedDesignsBtn');
    if(button){button.classList.toggle('is-empty',!selected.size);button.disabled=!selected.size;button.setAttribute('aria-label',selected.size?`Eliminar ${selected.size} seleccionados`:'Eliminar seleccionados');button.title=button.getAttribute('aria-label');}
    qsa('[data-design-select]').forEach(el=>{const active=selected.has(Number(el.dataset.designSelect));el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));el.setAttribute('aria-label',(active?'Desmarcar ':'Marcar ')+(el.dataset.designName||'diseño'));});
    const allButton=qs('#selectAllDesignsBtn');if(allButton){allButton.setAttribute('aria-label',state.designAssets.length&&state.designAssets.every(a=>selected.has(Number(a.id)))?'Desmarcar todos':'Marcar todos');allButton.title=allButton.getAttribute('aria-label');allButton.classList.toggle('active',state.designAssets.length>0&&state.designAssets.every(a=>selected.has(Number(a.id))));allButton.disabled=!state.designAssets.length;}
    qsa('[data-select-all-designs]').forEach(el=>{const ids=qsa('[data-design-card]',qs('#'+el.dataset.selectAllDesigns)).map(card=>Number(card.dataset.designCard));el.textContent=ids.length&&ids.every(id=>selected.has(id))?'Desmarcar todos':'Marcar todos';el.disabled=!ids.length;});
  }
  function designCard(a){return `<article class="design-gallery-card" data-design-card="${a.id}" draggable="true"><button type="button" class="design-bulk-check" data-design-select="${a.id}" data-design-name="${escapeHtml(a.name||a.file_name)}" aria-pressed="${state.selectedDesignAssets?.has(Number(a.id))?'true':'false'}" aria-label="Marcar ${escapeHtml(a.name||a.file_name)}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></button>${a.kind==='sheet'?`<label class="design-sheet-check" title="Seleccionar plancha"><input type="checkbox" data-design-sheet="${a.id}" ${state.selectedDesignSheets?.has(Number(a.id))?'checked':''}><span>✓</span></label>`:''}<button type="button" class="design-gallery-thumb checkerboard" data-image-state="pending" data-preview-design="${a.id}" ${designVisualAttrs(a)} title="${escapeHtml(a.name||a.file_name)}">${String(a.mime_type||'').startsWith('image/')?`${designThumbnailHtml(a)}`:`<div class="design-file-placeholder">${escapeHtml((a.file_name||'ARCHIVO').split('.').pop().toUpperCase())}</div>`}</button></article>`}
  function designSection(title,items,key){const gid=`designGallery-${key}`;return `<details class="design-library-section" data-design-list="${key}" ${state.designListOpen?.[key]===false?'':'open'}><summary class="admin-section-head"><h3>${title}</h3><span class="muted">${items.length} archivo${items.length===1?'':'s'}</span><span class="design-fold-label"><span class="when-open" aria-label="Comprimir">⌃</span><span class="when-closed" aria-label="Expandir">⌄</span></span></summary><div class="design-gallery-actions"><button type="button" class="btn btn-ghost" data-select-all-designs="${gid}">Marcar todos</button>${items.some(a=>a.kind==='individual')?designTagFilterHtml(key,items.filter(a=>a.kind==='individual')):''}</div><div class="horizontal-gallery-shell"><button type="button" class="gallery-arrow gallery-arrow-left" data-scroll-target="${gid}" data-scroll-dir="-1" aria-label="Anterior">‹</button><div class="design-grid" id="${gid}">${items.length?items.filter(a=>designVisible(key,a)).map(designCard).join(''):'<div class="empty-state"><strong>Sin diseños en esta sección.</strong></div>'}</div><button type="button" class="gallery-arrow gallery-arrow-right" data-scroll-target="${gid}" data-scroll-dir="1" aria-label="Siguiente">›</button></div></details>`}
  function designGroup(title,items,key){return `<details class="design-library-group" data-design-list="${key}" ${state.designListOpen?.[key]===false?'':'open'}><summary class="design-group-head"><h2>${title}</h2><span class="design-fold-label"><span class="when-open" aria-label="Comprimir">⌃</span><span class="when-closed" aria-label="Expandir">⌄</span></span></summary><div class="design-group-body">${designSection('Diseños individuales',items.filter(x=>x.kind==='individual'),key+'-individual')}${designSection('Planchas',items.filter(x=>x.kind==='sheet'),key+'-sheet')}</div></details>`}
  function designLibraryHost(){return qs('#designGalleryDialog[open] #designGalleryBody')||qs('#adminContent');}
  function dockDesignGalleryToolbar(){
    const dialog=qs('#designGalleryDialog');if(!dialog?.open)return;
    const toolbar=qs('#designGalleryBody .design-library-toolbar'),dock=qs('#designGalleryToolbar');if(toolbar&&dock)dock.replaceChildren(toolbar);
  }
  function restoreDesignGallery(){
    const content=qs('#designGalleryBody .design-library-content');
    const toolbar=qs('#designGalleryToolbar .design-library-toolbar');if(content&&toolbar)content.prepend(toolbar);
    if(content&&state.view==='designs'){qs('#adminContent').replaceChildren(content);qs('#openDesignGalleryBtn').innerHTML='<i class="fa-solid fa-expand" aria-hidden="true"></i>';qs('#openDesignGalleryBtn').setAttribute('aria-label','Galería en pantalla completa');}
    else content?.remove();
    observeDesignThumbnails();
  }
  function openDesignGallery(){
    let dialog=qs('#designGalleryDialog');if(dialog?.open){dialog.close();return;}
    const content=qs('#adminContent .design-library-content');if(!content)return;
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='designGalleryDialog';dialog.className='admin-dialog design-fullscreen-dialog';
      dialog.innerHTML='<div class="dialog-shell"><div class="dialog-head"><h2>Galería de diseños</h2><div class="admin-actions"><button type="button" class="btn btn-ghost" data-fullscreen-design-collapse="true">Comprimir todo</button><button type="button" class="btn btn-ghost" data-fullscreen-design-collapse="false">Expandir todo</button><button type="button" class="icon-btn" id="closeDesignGalleryBtn" aria-label="Cerrar galería">×</button></div></div><div id="designGalleryToolbar"></div><div class="dialog-body" id="designGalleryBody"></div></div>';
      document.body.append(dialog);dialog.addEventListener('close',restoreDesignGallery);
    }
    qs('#designGalleryBody',dialog).replaceChildren(content);qs('#openDesignGalleryBtn').textContent='Volver a vista horizontal';dialog.showModal();dockDesignGalleryToolbar();observeDesignThumbnails();
  }
  function designLibraryToolbarHtml(){
    return `<div class="admin-section-head design-library-toolbar"><div class="design-library-heading"><h2>Biblioteca de diseños</h2></div><div class="admin-actions design-library-actions"><div class="design-bulk-actions"><button class="btn btn-danger is-empty" disabled type="button" id="deleteSelectedDesignsBtn" aria-label="Eliminar seleccionados"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button><button class="btn btn-ghost" type="button" id="selectAllDesignsBtn" aria-label="Marcar todos"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></button></div><button class="btn btn-ghost" type="button" id="openDesignGalleryBtn" aria-label="Galería en pantalla completa"><i class="fa-solid fa-expand" aria-hidden="true"></i></button><button class="btn btn-primary" type="button" id="openDesignUploadBtn" aria-label="Subir diseño"><i class="fa-solid fa-circle-plus" aria-hidden="true"></i></button><button class="btn btn-ghost" type="button" id="openDesignEmailBtn" aria-label="Enviar planchas por mail"><i class="fa-solid fa-envelope" aria-hidden="true"></i></button></div></div>`;
  }

  async function renderDesigns(){
    state.designListOpen??={};state.designTagFilters??={};qsa('[data-design-list]').forEach(d=>state.designListOpen[d.dataset.designList]=d.open);
    const [d,m,settings]=await Promise.all([api('/api/admin/design-assets'),state.materials.length?Promise.resolve(null):api('/api/admin/materials'),api('/api/admin/settings')]);state.designAssets=d.items||[];for(const asset of state.designAssets){const draft=state.designAppearanceDrafts?.['asset-'+asset.id];if(draft?.current)Object.assign(asset,draft.current);}if(m)state.materials=m.items||[];
    let saved=[];try{saved=JSON.parse(settings.settings?.design_tag_catalog||'[]')}catch{}const hasTagCatalog=Object.prototype.hasOwnProperty.call(settings.settings||{},'design_tag_catalog');state.designTagCatalog=[...new Set((hasTagCatalog?(Array.isArray(saved)?saved:[]):['rosas','salmos','celestes','yeshua','cruz',...state.designAssets.flatMap(a=>a.tags||[])]).map(x=>String(x).trim().toLocaleLowerCase('es-AR')).filter(Boolean))];
    const clients=state.designAssets.filter(x=>x.scope==='clients'),salmos=state.designAssets.filter(x=>x.scope==='salmos'),mixed=state.designAssets.filter(x=>x.scope==='mixed');
    designLibraryHost().innerHTML=`<div class="design-library-content">${designLibraryToolbarHtml()}${designGroup('SALMOS',salmos,'salmos')}${designGroup('Clientes',clients,'clients')}${designSection('Planchas mixtas',mixed,'mixed')}</div>`;state.selectedDesignAssets=new Set([...(state.selectedDesignAssets||[])].filter(id=>state.designAssets.some(a=>Number(a.id)===id)));dockDesignGalleryToolbar();updateDesignSelectionUI();observeDesignThumbnails();
  }
  function designDeleteBlockReason(id){const asset=state.designAssets.find(a=>Number(a.id)===Number(id));if(!asset)return'';if(asset.kind==='individual'){const sheets=state.designAssets.filter(a=>a.kind==='sheet'&&(a.components||[]).some(c=>Number(c.designAssetId)===Number(id)));return sheets.length?`No se puede eliminar “${asset.name||asset.file_name}”: forma parte de ${sheets.map(a=>a.name||a.file_name).join(', ')}. Abrí esa plancha y quitá la referencia primero.`:'';}const owners=state.designAssets.filter(a=>a.kind==='individual'&&parseDesignMeasureOptions(a).some(o=>(o.sources||[]).some(source=>Number(source.sheetAssetId)===Number(id))));return owners.length?`No se puede eliminar la plancha “${asset.name||asset.file_name}”: es origen de medidas en ${owners.map(a=>a.name||a.file_name).join(', ')}. Quitá o actualizá esas referencias primero.`:'';}
  async function refreshDesignAssetsForDelete(){const data=await api('/api/admin/design-assets');state.designAssets=data.items||[];return state.designAssets;}
  function designTags(value){const values=Array.isArray(value)?value:String(value||'').split(',');return [...new Set(values.map(x=>String(x).trim().toLocaleLowerCase('es-AR')).filter(Boolean))]}
  function designPickerSelections(root){return designTags(qsa('[data-design-tag-choice]:checked',root||document).map(el=>el.value))}
  function designTagPickerHtml(key,selected=[]){if(!Array.isArray(state.designTagCatalog)){let saved;try{saved=JSON.parse(state.settings.design_tag_catalog||'null')}catch{}state.designTagCatalog=designTags(Array.isArray(saved)?saved:['rosas','salmos','celestes','yeshua','cruz',...state.designAssets.flatMap(a=>a.tags||[])]);}const tags=designTags(selected),list=[...new Set([...state.designTagCatalog,...tags])];return `<div class="field design-tag-picker" data-design-tag-picker="${escapeHtml(key)}"><label>Etiquetas</label><details><summary>${tags.length?escapeHtml(tags.join(', ')):'Elegir etiquetas'}</summary><div class="design-tag-dropdown"><div class="design-tag-picker-options">${list.map((tag,i)=>`<div class="design-tag-picker-row"><label><span>${escapeHtml(tag)}</span><input type="checkbox" data-design-tag-choice value="${escapeHtml(tag)}" ${tags.includes(tag)?'checked':''}></label><input class="input" data-design-tag-value value="${escapeHtml(tag)}" aria-label="Editar etiqueta ${escapeHtml(tag)}"><button type="button" class="btn btn-ghost" data-design-tag-save data-index="${i}">Guardar</button><button type="button" class="icon-btn" data-design-tag-delete data-index="${i}" aria-label="Eliminar ${escapeHtml(tag)}">×</button></div>`).join('')||'<small class="muted">Todavía no hay opciones.</small>'}</div><button type="button" class="btn btn-ghost" data-design-tag-manage>Editar opciones</button><div class="design-tag-picker-add"><input class="input" data-design-tag-new placeholder="Nueva etiqueta"><button type="button" class="btn btn-ghost" data-design-tag-add>Agregar</button></div></div></details></div>`}
  async function persistDesignTagCatalog(){await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:{design_tag_catalog:JSON.stringify(state.designTagCatalog||[])}})});}
  async function saveDesignTagCatalog(nextCatalog,oldTag=null,replacement=null){const previousCatalog=[...(state.designTagCatalog||[])],changed=[];try{if(oldTag)for(const asset of state.designAssets.filter(a=>(a.tags||[]).includes(oldTag))){const previous=[...(asset.tags||[])],tags=[...new Set(previous.map(tag=>tag===oldTag?replacement:tag).filter(Boolean))];await api(`/api/admin/design-assets/${Number(asset.id)}`,{method:'PATCH',body:JSON.stringify({tags})});changed.push({id:Number(asset.id),previous});asset.tags=tags;}state.designTagCatalog=nextCatalog;await persistDesignTagCatalog();if(oldTag){state.designTagFilters??={};for(const key of Object.keys(state.designTagFilters))state.designTagFilters[key]=[...new Set(state.designTagFilters[key].map(tag=>tag===oldTag?replacement:tag).filter(Boolean))];}}catch(err){state.designTagCatalog=previousCatalog;for(const change of changed.reverse()){try{await api(`/api/admin/design-assets/${change.id}`,{method:'PATCH',body:JSON.stringify({tags:change.previous})});const asset=state.designAssets.find(a=>Number(a.id)===change.id);if(asset)asset.tags=change.previous;}catch{}}throw err;}}
  function refreshDesignTagPicker(picker,selected){const old=qsa('[data-design-tag-picker]').find(el=>el.dataset.designTagPicker===picker);if(old){const open=qs('details',old)?.open,managing=old.classList.contains('managing');if(picker.startsWith('filter-')){const key=picker.slice(7);state.designTagFilters??={};state.designTagFilters[key]=selected;old.outerHTML=designTagFilterHtml(key,[]);}else old.outerHTML=designTagPickerHtml(picker,selected);const next=qsa('[data-design-tag-picker]').find(el=>el.dataset.designTagPicker===picker);if(next){qs('details',next).open=open;next.classList.toggle('managing',managing);}}}
  function designDialogPayload(){const root=qs('#designDetailEditor');return {scope:qs('[data-design-scope]',root)?.value||'salmos',kind:qs('[data-design-kind]',root)?.value||'individual',name:qs('[data-design-name]',root)?.value||'',note:qs('[data-design-note]',root)?.value||'',tags:qs('[data-design-kind]',root)?.value==='sheet'?[]:designPickerSelections(root),costCents:pesosToCents(qs('[data-design-cost]',root)?.value||10000),printMaterialType:qs('[data-design-print-type]',root)?.value||'dtf_textile',printed:Boolean(qs('[data-design-printed]',root)?.checked),...sheetPayload('detail')}}
  function openDesignPreview(id){
    const a=state.designAssets.find(x=>Number(x.id)===Number(id));if(!a)return;qs('#designPreviewDialog')?.classList.remove('sheet-editor-open');state.activeDesignId=Number(a.id);state.designSheetDrafts??={};state.designSheetDrafts.detail=structuredClone(a.components||[]);state.sheetImageSizes={...state.sheetImageSizes,detail:null};state.sheetBoxTarget=null;state.sheetRepeatTarget=null;state.sheetActiveBox=null;state.sheetZoom=1;
    const measures=parseDesignMeasureOptions(a),stage=qs('#designPreviewStage'),url=apiUrl(`/api/admin/design-assets/${a.id}/file`);qs('#designPreviewTitle').textContent=a.name||a.file_name;
    stage.innerHTML=String(a.mime_type||'').startsWith('image/')?`<div data-image-status role="status">Cargando imagen…</div><div class="design-preview-fit checkerboard" ${designVisualAttrs(a)}><img crossorigin="use-credentials" src="${url}" alt="${escapeHtml(a.name||a.file_name||'Diseño')}"></div>`:`<iframe src="${url}" title="Vista previa"></iframe>`;
    const composition=a.kind==='sheet'?`<h3>Superficie: ${Number(a.width_cm)||'—'} × ${Number(a.height_cm)||'—'} cm</h3>${a.components?.length?`<div class="sheet-cost-table">${a.components.map((c,i)=>`<div>${state.designAssets.find(x=>Number(x.id)===Number(c.designAssetId))?designSmallImage(state.designAssets.find(x=>Number(x.id)===Number(c.designAssetId))):''}<span><strong>${escapeHtml(c.name)} × ${c.quantity}</strong><small>${escapeHtml(designMeasureLabel(c))}</small></span><b>${money(a.sheet_metrics?.componentCostsCents?.[i]||0)}</b></div>`).join('')}</div>${sheetMetricsHtml(Number(a.width_cm),Number(a.height_cm),a.components,Number(a.cost_cents)||1000000)}`:'<p class="muted">Agregá la composición para calcular el desperdicio de esta plancha.</p>'}`:measures.length?designMeasuresOriginsHtml(a,measures):'';
    clearMissingSheetQueue('detail');(state.sheetRotation??={}).detail=undefined;
    qs('#designPreviewMeta').innerHTML=`${designBackgroundControlHtml('detail')}<div class="design-detail-summary"><div><strong>${escapeHtml(designScopeLabel(a))} · ${escapeHtml(designKindLabel(a))}</strong>${composition}${a.note?`<p>${escapeHtml(a.note)}</p>`:''}${Number(a.printed)?'<span class="status success">Impreso</span>':''}</div><div class="admin-actions"><a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">Abrir original</a><button class="btn btn-primary" type="button" id="editDesignDetailBtn">Editar</button></div></div>
      <div class="design-detail-editor hidden" id="designDetailEditor"><div class="form-grid design-edit-grid"><div class="field"><label>Sección</label><select class="select" data-design-scope><option value="salmos" ${a.scope==='salmos'?'selected':''}>SALMOS</option><option value="clients" ${a.scope==='clients'?'selected':''}>Clientes</option><option value="mixed" ${a.scope==='mixed'?'selected':''}>Planchas mixtas</option></select></div><div class="field"><label>Tipo</label><select class="select" data-design-kind ${a.scope==='mixed'?'disabled':''}><option value="individual" ${a.kind==='individual'?'selected':''}>Individual</option><option value="sheet" ${a.kind==='sheet'?'selected':''}>Plancha</option></select></div><div class="field"><label>Nombre</label><input class="input" data-design-name value="${escapeHtml(a.name||'')}"></div><div class="field" data-sheet-size><label>Superficie total de la plancha (cm)</label><div class="design-measures"><input class="input" data-design-width type="number" min=".01" step=".01" value="${Number(a.width_cm)||''}" placeholder="Ancho"><span>×</span><input class="input" data-design-height type="number" min=".01" step=".01" value="${Number(a.height_cm)||''}" placeholder="Alto"></div></div><div class="field"><label>Impresión / costo</label><select class="select" data-design-print-type><option value="dtf_textile" ${a.print_material_type!=='dtf_uv'&&a.print_material_type!=='none'?'selected':''}>DTF textil</option><option value="dtf_uv" ${a.print_material_type==='dtf_uv'?'selected':''}>DTF UV</option><option value="none" ${a.print_material_type==='none'?'selected':''}>Sin DTF</option></select></div>${a.kind==='individual'?designTagPickerHtml('detail',a.tags||[]):''}<div class="field" data-sheet-size><label>Costo de la plancha ($)</label><input class="input" type="number" min="0" step=".01" data-design-cost value="${centsToPesos(Number(a.cost_cents)||1000000)}"></div><div class="field full"><label>Nota</label><textarea class="textarea" data-design-note rows="2">${escapeHtml(a.note||'')}</textarea></div></div><div data-individual-options>${designMeasureEditor('detail',measures)}</div><div data-sheet-composition-host></div>${a.kind==='sheet'?sheetPurchasePanelHtml('detail'):''}<div class="design-card-actions"><label class="toggle-label"><input type="checkbox" data-design-printed ${Number(a.printed)?'checked':''}> Impreso</label><button class="btn btn-danger small-delete" type="button" id="deleteDesignDetailBtn">Eliminar</button><span class="dialog-spacer"></span><button class="btn btn-ghost" type="button" id="cancelDesignEditBtn">Cancelar</button><button class="btn btn-primary" type="button" id="saveDesignDetailBtn">Guardar cambios</button></div></div>`;
    const dialog=qs('#designPreviewDialog');dialog.dataset.designPreviewBackground=designViewerBackground('detail');document.body.appendChild(dialog);if(!dialog.open)dialog.showModal();const img=qs('img',stage);if(img){watchDesignPreview(img,stage,()=>cacheDesignThumbnail(a,img).catch(()=>{}));}
  }
  function openDesignEdit(){
    if(state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId))?.kind==='sheet')qs('#designPreviewDialog')?.classList.add('sheet-editor-open');
    qs('#designDetailEditor')?.classList.remove('hidden');qs('.design-detail-summary',qs('#designPreviewMeta'))?.classList.add('editing');refreshDesignKind('detail');
  }
  async function moveDesignCard(id,direction,targetId=0){
    if(state.designOrderPending)return;const asset=state.designAssets.find(a=>Number(a.id)===Number(id));if(!asset)return;
    const group=state.designAssets.filter(a=>a.scope===asset.scope&&a.kind===asset.kind),from=group.findIndex(a=>Number(a.id)===Number(id)),to=targetId?group.findIndex(a=>Number(a.id)===Number(targetId)):from+direction;
    if(to<0||to>=group.length||to===from)return;const [item]=group.splice(from,1);group.splice(to,0,item);state.designOrderPending=true;
    try{await api('/api/admin/design-assets/order',{method:'PATCH',body:JSON.stringify({scope:asset.scope,kind:asset.kind,ids:group.map(a=>Number(a.id))})});let i=0;state.designAssets=state.designAssets.map(a=>a.scope===asset.scope&&a.kind===asset.kind?group[i++]:a);
      const card=qs(`[data-design-card="${id}"]`),gallery=card?.closest('.design-grid');if(gallery){gallery.innerHTML=group.map(designCard).join('');qs(`[data-design-card="${id}"] [data-preview-design]`,gallery)?.focus({preventScroll:true});updateDesignSelectionUI();observeDesignThumbnails();}
    }finally{state.designOrderPending=false;}
  }
  function productionMeasureOptions(d){const options=parseDesignMeasureOptions(d);return options.length?options:Number(d.width_cm)>0&&Number(d.height_cm)>0?[{id:'original',destination:'Medida general',size:'',detail:'',widthCm:Number(d.width_cm),heightCm:Number(d.height_cm)}]:[]}
  function addProductionDesignDefault(id){
    const asset=state.designAssets.find(a=>Number(a.id)===Number(id));if(!asset)return;
    const entry={layerId:crypto.randomUUID(),designAssetId:Number(id),quantity:1,widthCm:10,heightCm:10,measureOptionId:'custom',measureLabel:'Medida estándar · 10 × 10 cm',printSide:mockupCurrentSide()};const options=productionMeasureOptions(asset),known=options.length===1?options[0]:Number(asset.width_cm)>0&&Number(asset.height_cm)>0?{id:'original',widthCm:Number(asset.width_cm),heightCm:Number(asset.height_cm)}:null;if(known)Object.assign(entry,{widthCm:known.widthCm,heightCm:known.heightCm,measureOptionId:known.id,measureLabel:designMeasureLabel(known)});
    state.mockupTool='move';state.mockupPointer=null;state.productionDesignsSelected.push(entry);state.mockupVisibleLayerIds?.add(entry.layerId);state.mockupSelectedLayer=`design-${state.productionDesignsSelected.length-1}`;renderProductionSelectedDesigns();renderProductionDesignGallery();const gallery=qs('#productionDesignGallery');if(gallery)gallery.scrollLeft=0;
  }
  function openProductionMeasureDialog(id,side=mockupCurrentSide(),editIndex=null){
    const d=state.designAssets.find(x=>Number(x.id)===Number(id));if(!d)return;
    state.productionMeasureDesignId=Number(id);state.productionMeasureSideTarget=side;state.productionMeasureEditIndex=editIndex;const selected=Number.isInteger(editIndex)?state.productionDesignsSelected[editIndex]:null,options=productionMeasureOptions(d),choice=selected?.measureOptionId||(options.length===1?options[0].id:options.length?'':'custom');
    qs('#productionMeasureTitle').textContent=`Medidas · ${d.name||d.file_name}`;
    qs('#productionMeasureOptions').innerHTML=options.map(o=>{const cost=designPrintCostCents(d,o.widthCm,o.heightCm,o.id);return `<label class="production-measure-choice"><input type="radio" name="productionMeasureChoice" value="${escapeHtml(o.id)}" ${choice===o.id?'checked':''}><span><strong>${Number(o.widthCm)} × ${Number(o.heightCm)} cm</strong><b>${cost===null?'Costo pendiente':money(cost)}</b><small>${escapeHtml((o.sources||[]).map(s=>s.name||state.designAssets.find(a=>Number(a.id)===Number(s.sheetAssetId))?.name||s.fileName||'Plancha').join(' · ')||'Sin plancha de origen')}</small></span></label>`}).join('')+`<label class="production-measure-choice"><input type="radio" name="productionMeasureChoice" value="custom" ${choice==='custom'?'checked':''}><span>Otra medida</span></label>`;
    qs('#productionCustomMeasure').classList.toggle('hidden',choice!=='custom');qs('#productionMeasureWidth').value=selected?.widthCm||'';qs('#productionMeasureHeight').value=selected?.heightCm||'';state.productionMeasureCostDirty=selected?.unitPrintCostCents!=null;if(qs('#productionMeasureCost'))qs('#productionMeasureCost').value=selected?.unitPrintCostCents!=null?centsToPesos(selected.unitPrintCostCents):'';updateProductionMeasureSuggestion();qs('#productionMeasureDetail').value=selected?.measureOptionId==='custom'?(selected.measureLabel||'').replace(/ · [\d.]+ × [\d.]+ cm$/,''):'';
    const dialog=qs('#productionMeasureDialog');if(dialog.open)dialog.close();document.body.appendChild(dialog);dialog.showModal();const body=qs('.dialog-body',dialog);if(body)body.scrollTop=0;qs('input[name="productionMeasureChoice"]',dialog)?.focus({preventScroll:true});
  }
  function applyProductionMeasure(){
    const id=Number(state.productionMeasureDesignId),d=state.designAssets.find(x=>Number(x.id)===id),choice=qs('input[name="productionMeasureChoice"]:checked')?.value;if(!d||!choice)throw new Error('Elegí una opción de medidas.');
    const option=choice==='custom'?{id:'custom',destination:qs('#productionMeasureDetail')?.value?.trim()||'Medida personalizada',widthCm:Number(qs('#productionMeasureWidth').value),heightCm:Number(qs('#productionMeasureHeight').value)}:productionMeasureOptions(d).find(x=>x.id===choice);
    if(!option||!Number.isFinite(option.widthCm)||!Number.isFinite(option.heightCm)||option.widthCm<.01||option.heightCm<.01||option.widthCm>10000||option.heightCm>10000)throw new Error('Ingresá el ancho y el alto en centímetros.');
    if(choice==='custom'&&(!qs('#productionMeasureCost')?.value||!Number.isFinite(Number(qs('#productionMeasureCost').value))||Number(qs('#productionMeasureCost').value)<0||Number(qs('#productionMeasureCost').value)>10000000))throw new Error('Ingresá un costo válido por estampa.');const side=state.productionMeasureSideTarget||'front',existing=Number.isInteger(state.productionMeasureEditIndex)?state.productionDesignsSelected[state.productionMeasureEditIndex]:null,entry={layerId:existing?.layerId||crypto.randomUUID(),designAssetId:id,quantity:existing?.quantity||1,widthCm:option.widthCm,heightCm:option.heightCm,measureOptionId:option.id,measureLabel:designMeasureLabel(option),printSide:side,unitPrintCostCents:choice==='custom'?pesosToCents(qs('#productionMeasureCost')?.value||0):null};
    if(existing){const oldPlace=existing.mockupPlacement&&{...existing.mockupPlacement},changed=Number(existing.widthCm)!==entry.widthCm||Number(existing.heightCm)!==entry.heightCm;Object.assign(existing,entry);if(oldPlace&&changed){delete existing.mockupPlacement;delete existing.mockupPlacements?.[mockupViewKey()];const canvas=qs('#productionMockupCanvas');if(canvas){const p=mockupPlacement({item:existing,asset:d},canvas);p.x=oldPlace.x+oldPlace.w/2-p.w/2;p.y=oldPlace.y+oldPlace.h/2-p.h/2;p.rotation=oldPlace.rotation||0;clampMockupPlacement(p,canvas);}}state.mockupSelectedLayer=`design-${state.productionDesignsSelected.indexOf(existing)}`;}else{
      const previous=state.productionDesignsSelected.filter(x=>Number(x.designAssetId)===id&&(x.printSide||'front')===side),canvas=qs('#productionMockupCanvas');if(previous.length&&canvas){const p=mockupPlacement({item:previous[previous.length-1],asset:d},canvas),fresh=mockupPlacement({item:entry,asset:d},canvas);fresh.x=p.x+.025;fresh.y=p.y+.025;clampMockupPlacement(fresh,canvas);}state.mockupTool='move';state.mockupPointer=null;state.productionDesignsSelected.push(entry);state.mockupVisibleLayerIds?.add(entry.layerId);state.mockupSelectedLayer=`design-${state.productionDesignsSelected.length-1}`;
    }state.productionMeasureEditIndex=null;
    qs('#productionMeasureDialog').close();renderProductionSelectedDesigns();renderProductionDesignGallery();
    if(state.productionMeasureQueue?.length)openProductionMeasureDialog(state.productionMeasureQueue.shift());
  }

function normalizePromotions(value){
  if(typeof value==='string'){try{value=JSON.parse(value)}catch{throw new Error('Revisá las promociones guardadas.')}}
  if(!Array.isArray(value)||value.length>50)throw new Error('Podés guardar hasta 50 promociones.');
  return value.map((r,i)=>{
    const p={id:String(r.id||`promo-${i+1}`).slice(0,80),name:String(r.name||'').trim().slice(0,100),active:r.active!==false,trigger:r.trigger,threshold:Number(r.threshold),triggerProductId:Number(r.triggerProductId)||0,triggerType:String(r.triggerType||'').slice(0,50),target:r.target,targetProductId:Number(r.targetProductId)||0,targetType:String(r.targetType||'').slice(0,50),benefit:r.benefit,value:Number(r.value),basis:r.basis==='unit'?'unit':'total'};
    if(!p.name||!['amount','quantity','combination'].includes(p.trigger)||!['products','shipping','order'].includes(p.target)||!['percent','fixed','unit_price'].includes(p.benefit)||!Number.isSafeInteger(p.threshold)||p.threshold<(p.trigger==='quantity'?1:0)||!Number.isFinite(p.value)||p.value<0||!Number.isSafeInteger(p.triggerProductId)||p.triggerProductId<0||!Number.isSafeInteger(p.targetProductId)||p.targetProductId<0)throw new Error(`Revisá los campos de la promoción ${i+1}.`);
    if(p.trigger==='combination'){
      if(!Array.isArray(r.requirements)||!r.requirements.length||r.requirements.length>20)throw new Error('Agregá los tipos y cantidades de la combinación.');
      p.requirements=r.requirements.map(x=>({type:String(x.type||'').trim().slice(0,50),quantity:Number(x.quantity)}));
      if(p.requirements.some(x=>!x.type||x.type==='__combination__'||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>10000)||new Set(p.requirements.map(x=>x.type)).size!==p.requirements.length)throw new Error('Cada tipo debe aparecer una sola vez, con una cantidad válida.');
    }
    if(p.targetType==='__combination__'&&p.trigger!=='combination')throw new Error('El beneficio sobre la combinación necesita una condición combinada.');
    if(p.benefit==='percent'&&p.value>100)throw new Error('El porcentaje no puede superar 100.');
    if(p.benefit!=='percent'&&!Number.isSafeInteger(p.value))throw new Error('Revisá el importe de la promoción.');
    if(p.benefit==='unit_price'&&p.target!=='products')throw new Error('El precio por unidad solo se aplica a productos.');
    return p;
  });
}
function promotionProductType(category='',fit=''){const c=String(category).toLowerCase(),f=String(fit).toLowerCase();if(c.includes('remera')||c.includes('shirt'))return f.includes('over')?'shirt_oversize':f.includes('crop')?'shirt_crop':'shirt_classic';if(c.includes('gorra')||c.includes('cap'))return 'cap';if(c.includes('taza')||c.includes('mug'))return 'mug';if(c.includes('vaso')||c.includes('glass'))return 'glass';if(c.includes('termo')||c.includes('thermos'))return 'thermos';return c;}
function calculatePromotions(rules,items,shippingCostCents=0){
  const lines=items.map(x=>({productId:Number(x.productId??x.product_id),type:x.promotionType||promotionProductType(x.category_slug||x.category_name,x.fit),quantity:Number(x.quantity??x.qty)||0,price:Number(x.priceCents??x.price_cents)||0})),subtotal=lines.reduce((s,x)=>s+x.quantity*x.price,0),shipping=Math.max(0,Math.round(Number(shippingCostCents)||0));
  const chosen=new Map();
  for(const rule of rules||[]){if(!rule.active)continue;
    const combined=rule.trigger==='combination',requirements=rule.requirements||[];
    if(combined&&(!requirements.length||requirements.some(r=>lines.filter(x=>x.type===r.type).reduce((n,x)=>n+x.quantity,0)<r.quantity)))continue;
    const condition=lines.filter(x=>(!rule.triggerProductId||x.productId===rule.triggerProductId)&&(!rule.triggerType||x.type===rule.triggerType)),threshold=condition.reduce((s,x)=>s+(rule.trigger==='quantity'?x.quantity:x.quantity*x.price),0);
    if(!combined&&(!condition.length||threshold<rule.threshold))continue;
    const targets=lines.filter(x=>(!rule.targetProductId||x.productId===rule.targetProductId)&&(!rule.targetType||(rule.targetType==='__combination__'?requirements.some(r=>r.type===x.type):x.type===rule.targetType))),productBase=targets.reduce((s,x)=>s+x.quantity*x.price,0),quantity=targets.reduce((s,x)=>s+x.quantity,0);
    const base=rule.target==='shipping'?shipping:rule.target==='order'?subtotal+shipping:productBase;
    let discount=rule.benefit==='unit_price'?targets.reduce((s,x)=>s+Math.max(0,x.price-rule.value)*x.quantity,0):rule.benefit==='percent'?Math.round(base*rule.value/100):rule.value*(rule.target==='products'&&rule.basis==='unit'?quantity:1);
    discount=Math.max(0,Math.min(base,Math.round(discount)));const key=combined?(rule.target==='products'?`products:${rule.targetType||'all'}`:rule.target):rule.target==='products'&&rule.targetType?`products:${rule.targetType}`:rule.targetType||rule.triggerType?rule.target:'legacy';const prior=chosen.get(key);if(prior&&prior.discount>=discount)continue;chosen.set(key,{rule,discount,productBase});
  }
  let pd=0,sd=0;const applied=[];for(const {rule,discount,productBase} of chosen.values()){const remainingProducts=Math.max(0,subtotal-pd),remainingShipping=Math.max(0,shipping-sd);const productPart=rule.target==='shipping'?0:Math.min(discount,rule.target==='products'?Math.min(productBase,remainingProducts):remainingProducts),shippingPart=rule.target==='products'?0:Math.min(remainingShipping,Math.max(0,discount-productPart));if(productPart+shippingPart>0){pd+=productPart;sd+=shippingPart;applied.push(rule)}}
  return {id:applied.map(x=>x.id).join(',')||null,label:applied.map(x=>x.name).join(' + '),applied:applied.map(x=>x.id),productDiscountCents:pd,shippingDiscountCents:sd,totalDiscountCents:pd+sd,subtotalCents:subtotal,finalSubtotalCents:subtotal-pd,finalShippingCostCents:shipping-sd,totalCents:subtotal+shipping-pd-sd};
}
  function settingProductTypeOptions(selected='',includeAll=true){
    const choices=[['','Todos los tipos'],['shirt_classic','Remeras clásicas'],['shirt_oversize','Remeras oversize'],['shirt_crop','Remeras crop'],['cap','Gorras'],['mug','Tazas'],['glass','Vasos'],['thermos','Termos'],['bag','Mochilas / bolsos']];
    for(const p of state.products){const type=promotionProductType(p.category_slug||p.category_name,p.fit);if(type&&!choices.some(x=>x[0]===type))choices.push([type,p.category_name||type]);}
    return choices.filter(([value])=>includeAll||value).map(([value,label])=>`<option value="${escapeHtml(value)}" ${selected===value?'selected':''}>${escapeHtml(label)}</option>`).join('');
  }
  function promotionRequirementRow(r={}){return `<div class="promotion-requirement" data-promo-requirement><label class="field">Tipo de producto<select class="select" data-promo-requirement-type>${settingProductTypeOptions(r.type||'shirt_classic',false)}</select></label><label class="field">Cantidad mínima<input class="input" data-promo-requirement-quantity type="number" min="1" max="10000" step="1" value="${Number(r.quantity)||1}" required></label><button type="button" class="icon-btn" data-remove-promo-requirement aria-label="Quitar tipo">×</button></div>`;}
  function promotionEditorRow(p={}){
    const select=(field,options,value)=>`<select class="select" data-promo-field="${field}">${options.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('')}</select>`;
    const oldTrigger=state.products.find(x=>Number(x.id)===Number(p.triggerProductId)),oldTarget=state.products.find(x=>Number(x.id)===Number(p.targetProductId));
    const triggerType=p.triggerType||(oldTrigger?promotionProductType(oldTrigger.category_slug||oldTrigger.category_name,oldTrigger.fit):''),targetType=p.targetType??(oldTarget?promotionProductType(oldTarget.category_slug||oldTarget.category_name,oldTarget.fit):triggerType);
    return `<fieldset class="promotion-editor-row" data-promotion-row data-promotion-id="${escapeHtml(p.id||crypto.randomUUID())}" data-trigger-product-id="${Number(p.triggerProductId)||0}" data-target-product-id="${Number(p.targetProductId)||0}"><legend>Promoción</legend><div class="promotion-form-grid">
      <label class="field">Nombre<input class="input" data-promo-field="name" value="${escapeHtml(p.name||'')}" placeholder="Nombre de la promoción" required maxlength="100"></label>
      <label class="toggle-label"><input type="checkbox" data-promo-field="active" ${p.active===false?'':'checked'}> Activa</label>
      <label class="field">Condición${select('trigger',[['amount','Importe ($)'],['quantity','Cantidad de unidades'],['combination','Combinación de tipos']],p.trigger||'quantity')}</label>
      <label class="field" data-promo-simple>Tipo que activa<select class="select" data-promo-field="triggerType">${settingProductTypeOptions(triggerType)}</select></label>
      <label class="field" data-promo-simple>A partir de<input class="input" data-promo-field="threshold" type="number" min="0" step="1" required value="${p.threshold===undefined?'':p.trigger==='amount'?p.threshold/100:p.threshold}"></label>
      <div class="promotion-combination" data-promo-combination><strong>La compra debe incluir todos estos tipos</strong><div data-promo-requirements>${(p.requirements?.length?p.requirements:[{}]).map(promotionRequirementRow).join('')}</div><button type="button" class="btn btn-ghost" data-add-promo-requirement>+ Agregar tipo</button><small>El beneficio se aplica una vez al cumplir todas las cantidades mínimas. Para descontar compra y envío, guardá una promoción para cada beneficio con la misma combinación.</small></div>
      <label class="field">Aplicar a${select('target',[['products','Productos'],['shipping','Envío'],['order','Total de la compra']],p.target||'products')}</label>
      <label class="field">Tipo que recibe el beneficio<select class="select" data-promo-field="targetType"><option value="__combination__" ${targetType==='__combination__'?'selected':''}>Tipos de la combinación</option>${settingProductTypeOptions(targetType)}</select></label>
      <label class="field">Beneficio${select('benefit',[['percent','Porcentaje (%)'],['fixed','Pesos ($)'],['unit_price','Precio final por unidad ($)']],p.benefit||'percent')}</label>
      <label class="field">Valor<input class="input" data-promo-field="value" type="number" min="0" step=".01" required value="${p.value===undefined?'':p.benefit==='percent'?p.value:p.value/100}"></label>
      <label class="field">Descuento en pesos${select('basis',[['total','Una vez sobre el conjunto'],['unit','Por cada unidad']],p.basis||'total')}</label>
      <label class="field" data-promo-simple>Simular cantidad<input class="input" data-promo-preview="quantity" type="number" min="1" step="1" value="${p.trigger==='quantity'?Math.max(1,Number(p.threshold)||1):3}"></label>
      <label class="field">Simular envío ($)<input class="input" data-promo-preview="shipping" type="number" min="0" step="1" value="5000"></label>
    </div><div class="promotion-preview" data-promotion-preview></div><div class="promotion-row-actions"><button class="btn btn-ghost" type="button" data-promo-confirm>Guardar y configurar otra</button><button class="btn btn-danger small-delete" type="button" data-remove-promotion>Quitar promoción</button></div></fieldset>`;
  }
  function readPromotionRow(row){
    const get=k=>qs(`[data-promo-field="${k}"]`,row),trigger=get('trigger').value,benefit=get('benefit').value;
    return {id:row.dataset.promotionId,name:get('name').value.trim(),active:get('active').checked,trigger,threshold:trigger==='combination'?0:trigger==='amount'?pesosToCents(get('threshold').value):Number(get('threshold').value),triggerProductId:trigger==='combination'?0:Number(row.dataset.triggerProductId)||0,triggerType:trigger==='combination'?'':get('triggerType').value,requirements:trigger==='combination'?qsa('[data-promo-requirement]',row).map(r=>({type:qs('[data-promo-requirement-type]',r).value,quantity:Number(qs('[data-promo-requirement-quantity]',r).value)})):[],target:get('target').value,targetProductId:Number(row.dataset.targetProductId)||0,targetType:get('target').value==='products'?get('targetType').value:'',benefit,value:benefit==='percent'?Number(get('value').value):pesosToCents(get('value').value),basis:get('basis').value};
  }
  function promotionPreviewImage(p){return p?.primary_image_url?`<img class="promotion-preview-thumb" src="${escapeHtml(p.primary_image_url)}" alt="${escapeHtml(p.name)}" loading="lazy">`:'<span class="promotion-preview-thumb">Sin foto</span>';}
  function renderPromotionPreview(row){
    const host=qs('[data-promotion-preview]',row);if(!host)return;
    const rule=readPromotionRow(row),shipping=pesosToCents(qs('[data-promo-preview="shipping"]',row)?.value||0),typeOf=p=>promotionProductType(p.category_slug||p.category_name,p.fit),matches=(p,type,id)=>!id||Number(p.id)===Number(id);
    const productsFor=(type,id=0)=>state.products.filter(p=>(!type||typeOf(p)===type)&&matches(p,type,id));
    const summary=result=>`<div class="promotion-preview-total"><strong>Descuento en productos: ${money(result.productDiscountCents)}</strong><strong>Descuento en envío: ${money(result.shippingDiscountCents)}</strong><span>Compra: ${money(result.finalSubtotalCents)} · Envío: ${money(result.finalShippingCostCents)}</span><b>Total con beneficio: ${money(result.totalCents)}</b></div>`;
    if(rule.trigger==='combination'){
      const requirements=rule.requirements;
      if(!requirements.length||requirements.some(x=>!Number.isSafeInteger(x.quantity)||x.quantity<1)||new Set(requirements.map(x=>x.type)).size!==requirements.length){host.innerHTML='<small>Elegí tipos diferentes y sus cantidades para ver la combinación.</small>';return;}
      const groups=requirements.map(r=>({...r}));
      if(rule.target==='products'&&rule.targetType&&rule.targetType!=='__combination__'&&!groups.some(g=>g.type===rule.targetType))groups.push({type:rule.targetType,quantity:1});
      row._promotionPreviewProducts??={};const items=[];let incomplete=false;
      const cards=groups.map((g,i)=>{const choices=productsFor(g.type),product=choices.find(p=>Number(p.id)===Number(row._promotionPreviewProducts[g.type]))||choices[0];
        if(!product){incomplete=true;return `<div><strong>${escapeHtml(g.type)}</strong><small>No hay productos cargados de este tipo.</small></div>`;}
        items.push({...product,productId:product.id,quantity:g.quantity});
        return `<div>${promotionPreviewImage(product)}<label class="field">${g.quantity} × <select class="select" data-promo-preview-product="${escapeHtml(g.type)}" aria-label="Producto ${i+1} de la combinación">${choices.map(p=>`<option value="${p.id}" ${p.id===product.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</select></label><small>${money(product.price_cents)} / u · ${money(Number(product.price_cents)*g.quantity)}</small></div>`;
      }).join('');
      const result=calculatePromotions([{...rule,active:true}],items,shipping);
      host.innerHTML=`<strong>Vista previa de la combinación completa</strong><div class="promotion-preview-rows">${cards}</div>${incomplete?'<small>Completá los tipos que faltan en el catálogo para calcular esta combinación.</small>':summary(result)}<small>Podés cambiar cada miniatura por otro producto del mismo tipo. Se muestran las cantidades mínimas; no se multiplica el beneficio por repetir la combinación.</small>`;
      return;
    }
    const targetProducts=rule.target==='products',type=targetProducts?rule.targetType:rule.triggerType,id=targetProducts?rule.targetProductId:rule.triggerProductId,qty=Math.max(1,Math.round(Number(qs('[data-promo-preview="quantity"]',row)?.value)||1)),products=productsFor(type,id);
    if(!products.length){host.innerHTML='<small>No hay productos de este tipo para previsualizar.</small>';return;}
    host.innerHTML=`<strong>Vista previa · ${qty} unidad${qty===1?'':'es'} · al cumplir la condición</strong><div class="promotion-preview-rows">${products.map(p=>{
      const result=calculatePromotions([{...rule,active:true,trigger:'quantity',threshold:1,triggerType:'',triggerProductId:0}],[{...p,productId:p.id,quantity:qty}],shipping);
      return `<div>${promotionPreviewImage(p)}<strong>${escapeHtml(p.name)}</strong><small>${money(p.price_cents)} / u</small>${summary(result)}</div>`;
    }).join('')}</div><small>Solo se muestran los tipos que reciben el beneficio; para envío o compra, los tipos que lo activan.</small>`;
  }
  function syncPromotionFields(row){
    const get=k=>qs(`[data-promo-field="${k}"]`,row),product=get('target').value==='products',combined=get('trigger').value==='combination';
    qsa('[data-promo-simple]',row).forEach(el=>{el.classList.toggle('hidden',combined);qsa('input,select',el).forEach(input=>input.disabled=combined);});
    const group=qs('[data-promo-combination]',row);group.classList.toggle('hidden',!combined);qsa('input,select,button',group).forEach(el=>el.disabled=!combined);
    const option=qs('option[value="__combination__"]',get('targetType'));option.disabled=!combined;option.hidden=!combined;
    if(!combined&&get('targetType').value==='__combination__')get('targetType').value=get('triggerType').value;
    get('targetType').disabled=!product;get('basis').disabled=!product||get('benefit').value!=='fixed';
    const unit=qs('option[value="unit_price"]',get('benefit'));unit.disabled=!product;if(!product&&get('benefit').value==='unit_price')get('benefit').value='percent';
    get('threshold').step=get('trigger').value==='quantity'?'1':'.01';get('threshold').min=get('trigger').value==='quantity'?'1':'0';renderPromotionPreview(row);
  }
  function readPromotionSettings(){return normalizePromotions(qsa('[data-promotion-row]').map(readPromotionRow));}
  function motoBandRow(b={}){const mode=['fixed','per_km','discount_fixed','discount_percent'].includes(b.mode)?b.mode:'fixed',value=b.value??b.pricePesos??'';return `<div class="moto-band-row" data-moto-band><label class="field">Hasta (km)<input class="input" data-band-km type="number" min=".1" step=".1" required value="${Number(b.maxKm)||''}"></label><label class="field">Qué aplicar<select class="select" data-band-mode><option value="fixed" ${mode==='fixed'?'selected':''}>Precio final fijo del envío</option><option value="per_km" ${mode==='per_km'?'selected':''}>Precio fijo por km</option><option value="discount_fixed" ${mode==='discount_fixed'?'selected':''}>Descuento fijo sobre el total</option><option value="discount_percent" ${mode==='discount_percent'?'selected':''}>Descuento porcentual sobre el total</option></select></label><label class="field"><span data-band-value-label>${mode==='per_km'?'Pesos por km ($)':mode==='discount_fixed'?'Descuento ($)':mode==='discount_percent'?'Descuento (%)':'Precio final ($)'}</span><input class="input" data-band-value type="number" min="0" step=".01" required value="${value}"></label><button type="button" class="icon-btn" data-remove-band aria-label="Quitar tramo">×</button></div>`}
  function syncMotoBandRow(row){const mode=qs('[data-band-mode]',row)?.value,labels={fixed:'Precio final ($)',per_km:'Pesos por km ($)',discount_fixed:'Descuento ($)',discount_percent:'Descuento (%)'},input=qs('[data-band-value]',row);const label=qs('[data-band-value-label]',row);if(label)label.textContent=labels[mode]||labels.fixed;if(input){input.max=mode==='discount_percent'?'100':'';input.step=mode==='discount_percent'?'.1':'.01';}}
  async function renderSettings(){
    const [d,rulesData,correoStatus,productsData]=await Promise.all([api('/api/admin/settings'),api('/api/admin/shipping/rules'),api('/api/admin/correo/status').catch(e=>({configured:false,authOk:false,message:e.message,environment:'test'})),api('/api/admin/products')]);state.products=productsData.items||[];state.settings=d.settings||{};window.SalmosColors?.setCatalog(state.settings.named_color_catalog);state.correoStatus=correoStatus;
    const s=state.settings;const shippingRules=rulesData.items||[];const cs=state.correoStatus||{};
    qs('#adminContent').innerHTML=`<form id="settingsForm">
      <div class="settings-grid">
        <section class="settings-card"><h3>Datos de SALMOS</h3><div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" value="${escapeHtml(s.whatsapp||'5491162691341')}"></div><div class="field" style="margin-top:10px"><label>Instagram</label><input class="input" name="instagram" value="${escapeHtml(s.instagram||'')}"></div><div class="field" style="margin-top:10px"><label>Facebook</label><input class="input" name="facebook" value="${escapeHtml(s.facebook||'')}"></div></section>
        <section class="settings-card"><h3>Motomensajería</h3><div class="field"><label>Precio por km</label><input class="input" type="number" name="moto_rate_per_km" value="${escapeHtml(s.moto_rate_per_km||'800')}"></div><div class="field" style="margin-top:10px"><label>Envío mínimo</label><input class="input" type="number" name="moto_min_charge" value="${escapeHtml(s.moto_min_charge||'2000')}"><small class="field-help">Aunque la distancia dé menos, nunca se cobrará menos de este importe.</small></div><div class="field" style="margin-top:10px"><label>Máximo de km</label><input class="input" type="number" name="moto_max_km" value="${escapeHtml(s.moto_max_km||'50')}"></div><div class="field" style="margin-top:10px"><label>Demora mínima / máxima (horas)</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input class="input" type="number" name="moto_min_hours" value="${escapeHtml(s.moto_min_hours||'1')}"><input class="input" type="number" name="moto_max_hours" value="${escapeHtml(s.moto_max_hours||'4')}"></div></div></section>
        <section class="settings-card"><h3>Vía Cargo</h3><label class="toggle-label"><input type="checkbox" name="via_cargo_enabled" ${s.via_cargo_enabled==='true'?'checked':''}> Habilitar envío a coordinar</label><p class="field-help">El cliente paga los productos y coordina el costo del envío por separado.</p><div class="field"><label>Instrucciones</label><textarea class="textarea" name="via_cargo_instructions">${escapeHtml(s.via_cargo_instructions||'Coordinamos el despacho por WhatsApp. El envío se cotiza y abona por separado.')}</textarea></div></section><section class="settings-card"><h3>Retiro</h3><label class="toggle-label"><input type="checkbox" name="pickup_enabled" ${s.pickup_enabled==='true'?'checked':''}> Habilitar retiro</label><div class="field" style="margin-top:10px"><label>Dirección</label><input class="input" name="pickup_address" value="${escapeHtml(s.pickup_address||'')}"></div><div class="field" style="margin-top:10px"><label>Instrucciones / horarios</label><textarea class="textarea" name="pickup_instructions">${escapeHtml(s.pickup_instructions||'')}</textarea></div></section>
        <section class="settings-card moto-settings"><h3>Precios de motomensajería por distancia</h3><p class="field-help">Cada fila se aplica hasta esos kilómetros. Podés fijar el envío, cobrar por km o dar un descuento que se refleja en el carrito. Sin tramos se usa el precio por km general.</p><div id="motoBandsEditor">${JSON.parse(s.moto_distance_bands||'[]').map(motoBandRow).join('')}</div><button type="button" class="btn btn-ghost" id="addMotoBandBtn">+ Agregar tramo</button></section>
        <section class="settings-card promotions-settings"><h3>Promociones automáticas</h3><p>Se aplican cuando el carrito cumple la condición. Para cada tipo de producto se aplica la promoción que más ahorre. Los descuentos de tipos distintos pueden combinarse; los cupones se calculan después. El envío de Vía Cargo se paga aparte.</p><div id="promotionsEditor">${JSON.parse(s.automatic_promotions||'[]').map(promotionEditorRow).join('')}</div><button type="button" class="btn btn-primary" id="addPromotionBtn">+ Agregar promoción</button></section>
        <section class="settings-card zone-settings"><h3>Reglas por zona / calle</h3><p class="muted">Sirven para sumar o descontar según texto de la dirección. Ej.: “Barrio X” +$800 o “Zona Y” −$500.</p><div class="form-grid"><div class="field"><label>Nombre</label><input class="input" id="shippingRuleName" placeholder="Ej.: Calle de tierra conocida"></div><div class="field"><label>Texto que debe contener la dirección</label><input class="input" id="shippingRuleMatch" placeholder="Ej.: Barrio Uno"></div><div class="field"><label>Ajuste ($)</label><input class="input" id="shippingRuleAdjustment" type="number" step="100" placeholder="800 o -500"></div><div class="field" style="align-self:end"><button class="btn btn-primary" type="button" id="addShippingRuleBtn">Agregar regla</button></div></div><div style="display:grid;gap:8px;margin-top:12px">${shippingRules.length?shippingRules.map(r=>`<div class="notice" style="display:flex;gap:10px;align-items:center;justify-content:space-between"><span><strong>${escapeHtml(r.name)}</strong> · “${escapeHtml(r.match_text)}” · ${Number(r.adjustment_cents)>=0?'+':''}${money(r.adjustment_cents)}</span><button type="button" class="btn btn-danger" data-delete-shipping-rule="${r.id}">Eliminar</button></div>`).join(''):'<div class="muted">Todavía no hay reglas especiales.</div>'}</div></section>
        <section class="settings-card correo-settings-card"><div class="admin-section-head"><div><h3>Correo Argentino · PAQ.AR 2.0</h3><small class="muted">${cs.environment==='production'?'PRODUCCIÓN':'TEST'} · ${escapeHtml(cs.message||'Sin probar')}</small></div><span class="status ${cs.authOk?'success':cs.configured?'warning':'danger'}">${cs.authOk?'Credenciales OK':cs.configured?'Revisar':'Sin secretos'}</span></div>
          <div class="notice"><strong>Importante:</strong> Correo Argentino no entrega la tarifa por esta API. Hasta recibir la matriz comercial, en TEST se usa una tarifa técnica de $1 si dejás los importes vacíos. Para TEST, cargá exactamente como te indicó Correo Argentino: <strong>Usuario → CORREO_AGREEMENT</strong> y <strong>Clave → CORREO_API_KEY</strong>. Si responde 401, el rechazo viene del ambiente de prueba de Correo y el panel te lo mostrará claramente.</div>
          <label class="toggle-label"><input type="checkbox" name="correo_enabled" ${s.correo_enabled==='false'?'':(s.correo_enabled==='true'||cs.configured?'checked':'')}> Mostrar Correo Argentino en el checkout</label>
          <label class="toggle-label" style="margin-top:8px"><input type="checkbox" name="correo_auto_create_paid" ${s.correo_auto_create_paid==='true'?'checked':''}> Crear preimposición automáticamente al aprobarse Mercado Pago</label>
          <div class="form-grid" style="margin-top:12px"><div class="field"><label>Tarifa provisoria domicilio ($)</label><input class="input" type="number" min="0" step="1" name="correo_home_rate_pesos" value="${escapeHtml(s.correo_home_rate_pesos||'')}"></div><div class="field"><label>Tarifa provisoria sucursal ($)</label><input class="input" type="number" min="0" step="1" name="correo_agency_rate_pesos" value="${escapeHtml(s.correo_agency_rate_pesos||'')}"></div><div class="field"><label>Service type</label><input class="input" maxlength="2" name="correo_service_type" value="${escapeHtml(s.correo_service_type||'CP')}"></div><div class="field"><label>Rótulo</label><select class="select" name="correo_label_format"><option value="10x15" ${s.correo_label_format!=='label'?'selected':''}>10×15</option><option value="label" ${s.correo_label_format==='label'?'selected':''}>Label</option></select></div></div>
          <hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><strong>Remitente</strong><div class="form-grid" style="margin-top:10px"><div class="field"><label>Nombre / razón social</label><input class="input" name="correo_sender_business_name" value="${escapeHtml(s.correo_sender_business_name||'SALMOS')}"></div><div class="field"><label>Email</label><input class="input" name="correo_sender_email" type="email" value="${escapeHtml(s.correo_sender_email||'')}"></div><div class="field"><label>Teléfono</label><input class="input" name="correo_sender_phone" value="${escapeHtml(s.correo_sender_phone||'')}"></div><div class="field"><label>Calle</label><input class="input" name="correo_sender_street" value="${escapeHtml(s.correo_sender_street||'')}"></div><div class="field"><label>Altura</label><input class="input" name="correo_sender_number" value="${escapeHtml(s.correo_sender_number||'')}"></div><div class="field"><label>Localidad</label><input class="input" name="correo_sender_city" value="${escapeHtml(s.correo_sender_city||'')}"></div><div class="field"><label>Código provincia</label><input class="input" maxlength="1" name="correo_sender_state" placeholder="B" value="${escapeHtml(s.correo_sender_state||'')}"><small class="field-help">B = Provincia de Buenos Aires.</small></div><div class="field"><label>Código postal</label><input class="input" name="correo_sender_zip" value="${escapeHtml(s.correo_sender_zip||'')}"></div></div>
          <details style="margin-top:12px"><summary>Valores de respaldo para peso y paquete</summary><div class="form-grid" style="margin-top:10px"><div class="field"><label>Peso (g)</label><input class="input" type="number" name="correo_fallback_weight_grams" value="${escapeHtml(s.correo_fallback_weight_grams||'500')}"></div><div class="field"><label>Alto (cm)</label><input class="input" type="number" name="correo_fallback_height_cm" value="${escapeHtml(s.correo_fallback_height_cm||'10')}"></div><div class="field"><label>Ancho (cm)</label><input class="input" type="number" name="correo_fallback_width_cm" value="${escapeHtml(s.correo_fallback_width_cm||'20')}"></div><div class="field"><label>Largo (cm)</label><input class="input" type="number" name="correo_fallback_depth_cm" value="${escapeHtml(s.correo_fallback_depth_cm||'30')}"></div></div></details>
          <div class="admin-actions" style="margin-top:12px"><button type="button" class="btn btn-ghost" id="testCorreoBtn">Probar credenciales ahora</button></div>
        </section>
        <section class="settings-card"><h3>Integraciones</h3><div class="notice">Las credenciales sensibles no se guardan acá: se cargan como secretos en Cloudflare. Este panel solo configura comportamiento, remitente y tarifas provisorias.</div></section>
      </div><div style="margin-top:16px;text-align:right"><button class="btn btn-primary" id="saveSettingsBtn">Guardar configuración</button></div>
    </form>`;qsa('[data-promotion-row]').forEach(syncPromotionFields);qsa('[data-moto-band]').forEach(syncMotoBandRow);
  }

  async function saveSettings(){if(!qs('#settingsForm').reportValidity())return false;const f=new FormData(qs('#settingsForm'));const settings={};for(const [k,v] of f.entries())settings[k]=String(v);settings.pickup_enabled=f.get('pickup_enabled')?'true':'false';settings.via_cargo_enabled=f.get('via_cargo_enabled')?'true':'false';settings.correo_enabled=f.get('correo_enabled')?'true':'false';settings.correo_auto_create_paid=f.get('correo_auto_create_paid')?'true':'false';settings.automatic_promotions=JSON.stringify(readPromotionSettings());settings.moto_distance_bands=JSON.stringify(qsa('[data-moto-band]').map(row=>({maxKm:Number(qs('[data-band-km]',row).value),mode:qs('[data-band-mode]',row).value,value:Number(qs('[data-band-value]',row).value)})));await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings})});toast('Configuración guardada','success');await renderSettings();return true;}

  function bind(){
    setupProductionStudioLayout();bindMockupCanvas();
    qsa('.admin-nav-btn').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
    qs('#adminMenuBtn').addEventListener('click',()=>qs('#adminSidebar').classList.toggle('open'));
    document.addEventListener('click',event=>{if(!event.target.closest('#adminSidebar,#adminMenuBtn'))qs('#adminSidebar').classList.remove('open');});
    qs('#mockupAssetDialog')?.addEventListener('close',releaseMockupQueue);
    qs('#mockupAssetDialog')?.addEventListener('cancel',event=>{if(state.mockupUploadBusy)event.preventDefault()});
    qs('#mockupPhotoPreviewDialog')?.addEventListener('close',()=>{qs('#mockupPhotoPreviewStage')?._photoObserver?.disconnect();});
    qs('#mockupPhotoPreviewStage')?.addEventListener('wheel',e=>{if(!qs('#mockupPhotoPreviewDialog')?.open)return;e.preventDefault();setMockupPhotoZoom((state.mockupPhotoZoom||1)*Math.exp(-e.deltaY*.002));},{passive:false});
    qs('#mockupAssetForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await saveMockupAsset(e.currentTarget,qs('#saveMockupAssetBtn'))}catch(err){toast(err.message,'error')}});

    qs('#resetMockupZoomBtn')?.addEventListener('click',()=>{state.mockupZoom=1;state.mockupPanX=0;state.mockupPanY=0;applyMockupZoom()});

    qs('#adminThemeBtn').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
    qs('#collapseAdminListsBtn')?.addEventListener('click',()=>setAdminListsCollapsed(true));
    qs('#expandAdminListsBtn')?.addEventListener('click',()=>setAdminListsCollapsed(false));
    qs('#productionDialog')?.addEventListener('cancel',e=>{if(!confirm('¿Salir sin guardar?'))e.preventDefault();});
    const productDialog=qs('#productDialog');
    const productCancelBtn=qs('#productDialog button[value="cancel"]');
    if(productCancelBtn){productCancelBtn.type='button';productCancelBtn.setAttribute('formnovalidate','');productCancelBtn.addEventListener('click',e=>{e.preventDefault();closeProductDialog();});}
    productDialog?.addEventListener('cancel',e=>{e.preventDefault();closeProductDialog();});
    productDialog?.addEventListener('close',resetProductDialogState);
    qs('#otherValueInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveOtherEditor();}});
    qs('#purchaseColorDialog')?.addEventListener('cancel',e=>{e.preventDefault();closePurchaseColorDialog();});
    qs('#purchaseDialog')?.addEventListener('close',()=>{state.purchaseContext='purchases';});
    qs('#purchaseForm')?.addEventListener('input',e=>{const row=e.target.closest('[data-purchase-row]');if(row)syncPurchaseRowFromDom(row);if(row||['purchaseSurcharge','purchaseCashAmount','purchaseTransferAmount'].includes(e.target.id))updatePurchaseTotal();});
    qs('#purchaseForm')?.addEventListener('focusout',async e=>{
      const input=e.target.closest?.('.purchase-other-input,[data-purchase-field="color"]');if(!input)return;
      const row=input.closest('[data-purchase-row]');if(!row)return;const i=Number(row.dataset.purchaseRow),x=state.purchaseItems[i];if(!x)return;syncPurchaseRowFromDom(row);
      const value=normalizeOption(input.value);if(!value)return;
      if(input.dataset.purchaseField==='customTypeLabel'){const code=safeCustomTypeCode(value);x.materialType=code;x.customTypeLabel='';if(!customTypeEntries().some(t=>t.code===code))state.purchaseOptions.types.push({code,label:value});x._custom={};}
      else{const field=input.dataset.purchaseField;if(field==='fit')addPurchaseOption('fits',value);else if(field==='materialClass')addPurchaseOption('classes',value);else if(field==='size')addPurchaseOption('sizes',value,normalizePurchaseClass(x.materialClass)||'OTROS');else if(field==='name')addPurchaseOption('materials',value,x.materialType);else if(field==='color')addPurchaseOption('colors',value);x._custom??={};x._custom[field]=false;}
      try{await persistAdminOptionSettings()}catch{}renderPurchaseItems();
    });
    qsa('#productionWeight,#productionHeight,#productionWidth,#productionDepth').forEach(el=>el?.addEventListener('input',()=>{state.productionShippingDirty=true;const hint=qs('#productionShippingHint');if(hint)hint.textContent='Editado'}));
    qs('#purchaseForm')?.addEventListener('change',e=>{
      const row=e.target.closest('[data-purchase-row]');
      if(row){
        const i=Number(row.dataset.purchaseRow),x=state.purchaseItems[i];syncPurchaseRowFromDom(row);
        if(e.target.matches('[data-purchase-feature]')){x.features=qsa('[data-purchase-feature]:checked',row).map(el=>el.value);x.name=x.features.join(' · ');updatePurchaseFeatureSummary(row,x.features);return;}
        if(e.target.matches('[data-purchase-type-select]')){
          const type=e.target.value;
          if(type==='__other__'){openOtherEditor({row:i,field:'customTypeLabel',label:'tipo de producto'});e.target.value=x.materialType||'shirt';return;}
          const d=purchaseDefaultItem(type);state.purchaseItems[i]={...state.purchaseItems[i],...d,materialType:type,features:d.name?[d.name]:[],sheetAssetId:null,lineTotalCents:undefined,imageAssetIds:[],imageAssetId:null,_imageTouched:true,_custom:{}};
          renderPurchaseItems();return;
        }
        const choice=e.target.dataset.purchaseChoice;
        if(choice){
          x._custom??={};
          if(e.target.value==='__other__'){
            const labels={fit:'corte',materialClass:'clase',size:'talle',name:'material'};
            openOtherEditor({row:i,field:choice,label:labels[choice]||choice});
            e.target.value=x[choice]||'';
            return;
          }
          x[choice]=e.target.value;x._custom[choice]=false;
          if(choice==='materialClass'){const allowed=purchaseSizeOptions(x);if(x.size&&!allowed.includes(x.size))x.size='';}
          renderPurchaseItems();return;
        }
        updatePurchaseTotal();
      }
      if(['purchasePaymentMethod','purchaseSurchargeType'].includes(e.target.id))updatePurchaseTotal();

    });
    qs('#movementForm')?.addEventListener('change',e=>{
      if(e.target.id==='movementCategorySelect'){const input=qs('#movementCategoryOther');if(e.target.value==='__other__'){e.target.value=input.value||'';openOtherEditor({row:-1,field:'category',label:'motivo / etiqueta',kind:'finance'});}else input.value=e.target.value;}
      if(['movementPaymentMethod','movementType','movementSurchargeType'].includes(e.target.id))updateMovementPayment();
      if(e.target.id==='movementType')renderMovementSales();
      if(e.target.id==='movementSaleEnabled'){if(e.target.checked&&!(state.movementSaleItems||[]).length)state.movementSaleItems=[{variantId:0,quantity:1,unitPriceCents:0}];if(e.target.checked&&!qs('#movementCategoryOther').value)renderFinanceReasonSelector('Venta');renderMovementSales();}
      const saleField=e.target.dataset.saleField;if(saleField){const item=state.movementSaleItems[Number(e.target.closest('[data-sale-row]').dataset.saleRow)];if(saleField==='variantId'){const v=state.saleVariants.find(x=>Number(x.id)===Number(e.target.value));Object.assign(item,{variantId:Number(e.target.value),unitPriceCents:Number(v?.price_cents)||0});}else if(saleField==='price')item.unitPriceCents=pesosToCents(e.target.value);else item.quantity=Number(e.target.value);renderMovementSales();}
    });
    qs('#movementForm')?.addEventListener('input',e=>{if(['movementAmount','movementSurcharge','movementCashAmount','movementTransferAmount'].includes(e.target.id))updateMovementPayment();});
    qs('#movementDialog')?.addEventListener('close',()=>{state.editingMovementId=null;qs('#movementDialogTitle').textContent='Nuevo gasto / ingreso';});
    qs('#productImagesInput')?.addEventListener?.('change',()=>{});
    for(const [id,key] of [['designUploadDialog','upload'],['designPreviewDialog','detail']]){
      qs('#'+id)?.addEventListener('cancel',e=>{if(!canCloseDesignDialog(key)||(key==='detail'&&!qs('#designDetailEditor')?.classList.contains('hidden')&&!confirm('¿Salir sin guardar?')))e.preventDefault();});
      qs('#'+id)?.addEventListener('close',()=>{state.sheetActiveBox=null;state.sheetBoxTarget=null;state.sheetRepeatTarget=null;qs('[data-sheet-preview]',sheetRoot(key)||document)?._sheetResizeObserver?.disconnect();});
    }
    document.addEventListener('change',async e=>{
      if(e.target.matches('[data-material-field="materialClass"]')){const size=qs('[data-material-field="size"]',e.target.closest('dialog')),old=size.value;size.innerHTML='<option value="">Sin especificar</option>'+mergePurchaseOptions(purchaseSizeOptions({materialClass:e.target.value}),[old]).map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');size.value=old;return;}if(e.target.matches('[data-material-feature]')){if(!state.materialEditor)return;const host=qs('#materialEditorFeatures');state.materialEditor.features=qsa('[data-material-feature]:checked',host).map(input=>input.value);qs('.material-feature-chips',host).innerHTML=materialFeatureChips(state.materialEditor.features);return;}
      if(e.target.matches('[data-missing-sheet-name],[data-missing-sheet-scope]')){rememberMissingSheetFields(e.target.closest('[data-sheet-editor]').dataset.sheetEditor);return;}
      if(e.target.matches('[data-montage-filter]')){state.productionPhotoFilter??={};state.productionPhotoFilter[e.target.dataset.montageFilter]=e.target.value;renderProductionPhotos();return;}
      if(e.target.id==='montagePhotoCategory'){(state.productionPhotoFilter??={search:'',category:''}).category=e.target.value;renderProductionPhotos();return;}

      if(e.target.id==='designUploadPrinted'||e.target.matches('[data-design-printed]'))syncSheetPurchasePanel(e.target.id==='designUploadPrinted'?'upload':'detail');
      if(e.target.closest('.sheet-purchase-panel'))syncSheetPurchasePanel(e.target.closest('#designUploadDialog')?'upload':'detail');
      if(e.target.matches('[data-purchase-sheet]')){const item=state.purchaseItems[Number(e.target.dataset.purchaseSheet)];if(item){item.sheetAssetId=Number(e.target.value)||null;delete item.lineTotalCents;renderPurchaseItems();}return;}

      if(e.target.matches('[data-promo-field],[data-promo-requirement-type],[data-promo-requirement-quantity]')){
        const row=e.target.closest('[data-promotion-row]');
        if(e.target.dataset.promoField==='triggerType')row.dataset.triggerProductId='0';
        if(e.target.dataset.promoField==='targetType')row.dataset.targetProductId='0';
        if(e.target.dataset.promoField==='trigger'&&e.target.value==='combination'){qs('[data-promo-field="targetType"]',row).value='__combination__';row.dataset.targetProductId='0';}
        syncPromotionFields(row);
      }
      if(e.target.matches('[data-promo-preview-product]')){const row=e.target.closest('[data-promotion-row]');row._promotionPreviewProducts??={};row._promotionPreviewProducts[e.target.dataset.promoPreviewProduct]=Number(e.target.value);renderPromotionPreview(row);}
      if(e.target.matches('[data-design-sheet]')){state.selectedDesignSheets??=new Set();const id=Number(e.target.dataset.designSheet);if(e.target.checked)state.selectedDesignSheets.add(id);else state.selectedDesignSheets.delete(id);}
      if(e.target.matches('[data-design-tag-choice]')){const picker=e.target.closest('[data-design-tag-picker]'),tags=designPickerSelections(picker),summary=qs(':scope > details > summary',picker);if(summary)summary.textContent=tags.length?tags.join(', '):'Elegir etiquetas';}
      if(e.target.matches('[data-design-destination]')){const root=e.target.closest('.design-destinations');if(e.target.checked)qsa('[data-design-destination]',root).forEach(x=>{if(x!==e.target&&(e.target.value==='Todos'||x.value==='Todos'))x.checked=false;});qs('[data-destinations-summary]',root).textContent=qsa('[data-design-destination]:checked',root).map(x=>x.value).join(' / ')||'Todos';}
      if(e.target.id==='designUploadFiles'){
        const files=[...(e.target.files||[])];if(!files.length)return;
        appendDesignUploadFiles(files);setUploadKind(qs('#designUploadKind').value);e.target.value='';
        qs('#designUploadKindPrompt')?.showModal();
      }
      if(e.target.matches('[data-sheet-gallery-scope]')){const key=e.target.closest('[data-sheet-editor]').dataset.sheetEditor;(state.sheetGalleryScope??={})[key]=e.target.value;filterSheetGallery(key);return;}
      if(e.target.matches('[data-missing-sheet-file]')){
        if(state.designUploadBusy)return;
        const editor=e.target.closest('[data-sheet-editor]'),key=editor.dataset.sheetEditor;
        rememberMissingSheetFields(key);const queue=sheetMissingQueue(key),scope=sheetScope(key)?.value==='clients'?'clients':'salmos';if(!queue.length)(state.sheetMissingUnlocked??={})[key]=false;
        for(const file of e.target.files||[])if(!queue.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))queue.push({id:crypto.randomUUID(),file,name:file.name.replace(/\.[^.]+$/,''),scope});
        e.target.value='';renderMissingSheetQueue(key);syncSheetUploadGate(key);
      }
      if(e.target.id==='designUploadKind'){setUploadKind(e.target.value);}if(e.target.id==='designSheetCompositionComplete')state.sheetCompositionConfirmation=e.target.checked?sheetCompositionFingerprint():null;
      if(e.target.matches('[data-design-kind]'))refreshDesignKind('detail');
      if(e.target.matches('[data-sheet-measure],[data-sheet-quantity]')){const row=e.target.closest('[data-sheet-component]'),key=row.dataset.sheetKey,c=state.designSheetDrafts[key][Number(row.dataset.sheetComponent)];if(e.target.matches('[data-sheet-measure]')){c.measureOptionId=e.target.value;if(c.pendingMeasureOption?.id!==c.measureOptionId)c.pendingMeasureOption=null;}else c.quantity=Number(e.target.value);renderSheetSelected(key);}
      if(e.target.matches('[data-sheet-exact]')){const row=e.target.closest('[data-sheet-component]'),key=row.dataset.sheetKey,c=state.designSheetDrafts[key]?.[Number(row.dataset.sheetComponent)],asset=state.designAssets.find(a=>Number(a.id)===Number(c?.designAssetId)),size=sheetSize(key),old=c?.pendingMeasureOption||parseDesignMeasureOptions(asset||{}).find(o=>o.id===c?.measureOptionId);if(!c?.previewBoxes?.length||!old)return;const problem=sheetMeasurementProblem(key);if(problem){toast(problem,'error');return;}const w=Number(qs('[data-sheet-exact="width"]',row)?.value),h=Number(qs('[data-sheet-exact="height"]',row)?.value);if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w>size.width||h>size.height){toast('Ingresá ancho y alto que entren en la plancha.','error');return;}const resized=c.previewBoxes.map(box=>{const rotated=Number(box.rotation)%180;return {...box,width:(rotated?h:w)/size.width,height:(rotated?w:h)/size.height}});if(resized.some(box=>box.x+box.width>1.001||box.y+box.height>1.001)){toast('La medida exacta se sale de la plancha: corregí el recuadro.','error');return;}c.previewBoxes=resized;const sheet=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId));c.pendingMeasureOption=detectedMeasureOption(asset,key==='upload'?state.sheetUploadPreview?.file?.name:sheet?.file_name,{widthCm:w,heightCm:h});c.measureOptionId=c.pendingMeasureOption.id;renderSheetSelected(key);return;}
      if(e.target.matches('[data-band-mode]'))syncMotoBandRow(e.target.closest('[data-moto-band]'));
      if(e.target.matches('[data-production-design-side]')){const item=state.productionDesignsSelected[Number(e.target.dataset.index)];if(item){item.printSide=e.target.value;renderProductionSelectedDesigns();}}


      if(e.target.id==='mockupBaseSelect'){selectMockupVariant(Number(e.target.value));return;}
      if(e.target.id==='mockupAddCap'){renderMockupCapDesignOptions();renderMockupLayerControls();refreshMockupPreview().catch(err=>toast(err.message,'error'));}
      if(e.target.id==='mockupCapDesignSelect'){const asset=state.designAssets.find(a=>Number(a.id)===Number(e.target.value)),option=asset&&productionMeasureOptions(asset)[0];state.mockupCapDesign=asset&&option?{designAssetId:Number(asset.id),measureOptionId:option.id,widthCm:Number(option.widthCm)||0,heightCm:Number(option.heightCm)||0,measureLabel:designMeasureLabel(option),printSide:'front'}:null;renderMockupCapDesignOptions();renderMockupLayerControls();refreshMockupPreview().catch(err=>toast(err.message,'error'));}
      if(e.target.id==='mockupCapMeasureSelect'){const asset=state.designAssets.find(a=>Number(a.id)===Number(state.mockupCapDesign?.designAssetId)),option=asset&&productionMeasureOptions(asset).find(o=>o.id===e.target.value);if(option&&state.mockupCapDesign){state.mockupCapDesign={...state.mockupCapDesign,measureOptionId:option.id,widthCm:Number(option.widthCm)||0,heightCm:Number(option.heightCm)||0,measureLabel:designMeasureLabel(option),mockupPlacement:null};delete state.mockupCapDesign.mockupPlacement;renderMockupLayerControls();refreshMockupPreview().catch(err=>toast(err.message,'error'));}}
      if(e.target.id==='mockupAssetType')syncMockupAssetForm();
      if(e.target.id==='mockupAssetFile'){addMockupFiles(e.target.files||[]);e.target.value='';}
      if(e.target.id==='mockupCapMaterialSelect'){qs('#mockupCapSalePrice').value='';loadCapPriceSuggestion(e.target.value);calcProductionBuilderCost();}
      if(e.target.matches('[data-mockup-field="category"],[data-mockup-field="productType"],[data-mockup-field="color"],[data-mockup-field="modelName"]'))syncMockupUploadCard(e.target.closest('[data-mockup-upload]'));
      if(e.target.id==='mockupCatalogKind'){state.mockupCatalogKey=e.target.value;renderMockupCatalogEditor();}

      if(e.target.closest?.('#couponForm') && (e.target.name==='applies_to'||e.target.name==='discount_type')){
        const form=qs('#couponForm');if(form){
          const applies=form.elements.applies_to?.value;
          const type=form.elements.discount_type?.value;
          if(applies==='products'&&type==='free')form.elements.discount_type.value='percent';
          const free=form.elements.discount_type?.value==='free';
          if(form.elements.value){form.elements.value.disabled=free;if(free)form.elements.value.value='0';}
        }
      }
      if(e.target.id==='productImagesInput'){addSelectedMedia([...e.target.files],'mediaOrderList');e.target.value=''}
      if(e.target.id==='productionImagesInput'){addSelectedMedia([...e.target.files],'productionMediaOrderList');e.target.value=''}
      if(e.target.matches('[data-recipe-design-id]')){qs('.recipe-measure-note',e.target.closest('[data-recipe-design-row]'))?.remove();}
      if(e.target.matches('[data-design-scope]')){const kind=qs('[data-design-kind]',qs('#designDetailEditor'));kind.disabled=e.target.value==='mixed';if(kind.disabled)kind.value='sheet';refreshDesignKind('detail');}
      if(e.target.id==='purchaseSupplierFilter'){state.purchaseSupplier=e.target.value;await renderPurchases();return;}
      if(e.target.id==='designUploadScope'){const kind=qs('#designUploadKind');if(kind){if(e.target.value==='mixed'){kind.value='sheet';kind.disabled=true}else kind.disabled=false}refreshDesignKind('upload');renderDesignUploadBatchMeta();}
      if(e.target.name==='productionMeasureChoice')qs('#productionCustomMeasure').classList.toggle('hidden',e.target.value!=='custom');
      if(e.target.id==='inventoryStage'){qs('#internalPrepBox')?.classList.toggle('hidden',e.target.value!=='to_print')}
      if(e.target.matches('#productForm [name="category_id"]'))syncProductCategoryForm();
      if(e.target.matches('#productForm [name="fit"],#productBaseMaterialFamily,#productRecipeWaste,#productRecipeExtra,[data-recipe-design-id],[data-recipe-design-qty],[data-recipe-material-id],[data-recipe-material-qty]'))updateProductCostEstimate();
      
      if(e.target.id==='mockupBackgroundSelect'){const view=rememberMockupView();if(view)view.backgroundId=Number(e.target.value)||0;renderMockupStudioOptions();refreshMockupPreview().catch(err=>toast(err.message,'error'));}
      if(e.target.id==='productionCategory'){refreshMockupPreview().catch(err=>toast(err.message,'error'));return;}
      if(e.target.id==='productionMaterialType'){state.productionShippingDirty=false;renderProductionMaterialGallery();renderProductionDesignGallery();renderMockupStudioOptions();syncProductionPublicationDefaults();applyProductionShippingDefaults(true);calcProductionBuilderCost();refreshMockupPreview().catch(()=>{});return}
      if(e.target.id==='productionStockKind'){renderProductionMaterialGallery();calcProductionBuilderCost();return}
      if(e.target.id==='productionCapacity'){state.productionShippingDirty=false;applyProductionShippingDefaults(true);return}
      if(e.target.matches('.order-status-select')){try{await api(`/api/admin/orders/${e.target.dataset.orderId}/status`,{method:'PATCH',body:JSON.stringify({fulfillment_status:e.target.value})});toast('Estado actualizado','success')}catch(err){toast(err.message,'error')}}
    });
    document.addEventListener('click',async e=>{
      if(e.target.closest('[data-admin-session-login]')){openAdminSession();return;}
      if(e.target.closest('[data-admin-session-check]')){try{await resumeAdminSession()}catch(err){toast(err.message,'error',6000)}return;}
      if(e.target.closest('[data-admin-retry]')){clearApiCache();await navigate(state.view);return;}
      if(e.target.closest('[data-edit-material-purchase]')){try{const id=Number(state.materialEditor?.material.id),data=await api('/api/admin/purchases'),purchase=(data.items||[]).filter(p=>(p.items||[]).some(item=>Number(item.material_id)===id)).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at))||Number(b.id)-Number(a.id))[0];if(!purchase)throw new Error('Esta materia prima no tiene una compra registrada.');await openPurchaseDialog(purchase,'production');}catch(err){toast(err.message,'error');}return;}const editMaterial=e.target.closest('[data-edit-production-material]');if(editMaterial){try{await openProductionMaterialEditor(Number(editMaterial.dataset.editProductionMaterial))}catch(err){toast(err.message,'error')}return;}
      if(e.target.closest('[data-close-material-editor]')){if(state.materialEditorBusy)return;qs('#materialEditorDialog')?.close();state.materialEditor=null;return;}
      if(e.target.id==='saveMaterialEditorBtn'){try{await saveMaterialEditor(e.target)}catch(err){toast(err.message,'error')}return;}
      if(e.target.closest('[data-material-add-feature]')){const editor=state.materialEditor,field=qs('[data-material-new-feature]');if(editor&&field?.value.trim()){const value=normalizeOption(field.value);editor.featureOptions=uniqOptions([...editor.featureOptions,value]);editor.features=uniqOptions([...editor.features,value]);qs('#materialEditorFeatures').innerHTML=materialEditorFeaturesHtml();}return;}
      const materialPhoto=e.target.closest('[data-choose-material-photo]');if(materialPhoto){const editor=state.materialEditor,id=Number(materialPhoto.dataset.chooseMaterialPhoto);if(editor){editor.imageAssetIds=editor.imageAssetIds.includes(id)?editor.imageAssetIds.filter(value=>value!==id):[...editor.imageAssetIds,id];renderMaterialEditorPhotos();}return;}
      if(e.target.closest('[data-upload-editor-material-photo]')){if(state.materialEditor)try{await openMockupAssetDialog(null,null,{materialId:state.materialEditor.material.id})}catch(err){toast(err.message,'error')}return;}
      const retry=e.target.closest('[data-retry-preview]');if(retry){retry.closest('[data-sheet-preview],#designPreviewStage')?._retryImage?.();return;}

      if(e.target.id==='openDesignGalleryBtn'){openDesignGallery();return;}
      if(e.target.id==='closeDesignGalleryBtn'){qs('#designGalleryDialog')?.close();return;}
      const fullCollapse=e.target.closest('[data-fullscreen-design-collapse]');if(fullCollapse){setAdminListsCollapsed(fullCollapse.dataset.fullscreenDesignCollapse==='true');return;}
      const productView=e.target.closest('[data-edit-product-view]');if(productView){await editMockupProductView(productView.dataset.editProductView,productView);return;}
      const collapseMontage=e.target.closest('[data-collapse-montage-groups]');if(collapseMontage){setAdminListsCollapsed(collapseMontage.dataset.collapseMontageGroups==='true');return;}
      if(e.target.id==='clearMontagePhotoFilters'){state.productionPhotoFilter={search:'',category:'',model:'',cut:'',color:''};renderProductionPhotosPage();return;}
      closePurchaseFeatureLists(e.target);
      const purchaseImage=e.target.closest('[data-choose-purchase-image]');if(purchaseImage){choosePurchaseImage(Number(purchaseImage.dataset.purchaseImageRow),Number(purchaseImage.dataset.choosePurchaseImage));return;}
      const sheetList=e.target.closest('[data-toggle-sheet-list]');if(sheetList){e.preventDefault();toggleSheetSelectedList(sheetList.dataset.toggleSheetList);return;}
      const productionImage=e.target.closest('[data-production-image-preview]');if(productionImage){openProductionImagePreview(Number(productionImage.dataset.productionImagePreview));return;}
      if(e.target.id==='closeProductionImagePreviewBtn'){qs('#productionImagePreviewDialog')?.close();return;}
      if(['productionAddMaterialBtn','productionAddMaterialFromEditorBtn'].includes(e.target.id)){try{await openProductionMaterialPurchase()}catch(err){toast(err.message,'error')}return;}
      const zoomStep=e.target.closest('[data-mockup-zoom-step]');if(zoomStep){state.mockupZoom=Math.max(1,Math.min(5,(Number(state.mockupZoom)||1)+Number(zoomStep.dataset.mockupZoomStep)*.25));applyMockupZoom();return;}
      const swapSheet=e.target.closest('[data-swap-sheet-size]');if(swapSheet){const key=swapSheet.dataset.swapSheetSize,inputs=sheetSizeInputs(key),width=inputs.width.value;inputs.width.value=inputs.height.value;inputs.height.value=width;(state.sheetSizeManual??={})[key]=true;updateDrawnSheetSizes(key);return;}
      const resetSheetZoom=e.target.closest('[data-reset-sheet-zoom]');if(resetSheetZoom){state.sheetZoom=1;renderSheetPreview(resetSheetZoom.closest('[data-sheet-editor]')?.dataset.sheetEditor||'upload');return;}
      if(e.target.closest('[data-cancel-missing-sheet-design]')){if(state.designUploadBusy)return;clearMissingSheetQueue(e.target.closest('[data-sheet-editor]').dataset.sheetEditor);return;}
      const rotateSheet=e.target.closest('[data-rotate-sheet-preview]');if(rotateSheet){const canvas=qs('[data-sheet-canvas]',rotateSheet.closest('[data-sheet-editor]')),key=canvas?.dataset.sheetCanvas;if(canvas){(state.sheetRotation??={})[key]=((Number(canvas.dataset.sheetRotation)||0)+90)%360;fitSheetPreview(canvas);const viewport=canvas.closest('.sheet-preview-viewport');viewport.scrollTop=0;viewport.scrollLeft=0;}return;}
      const removePending=e.target.closest('[data-remove-missing-sheet-file]');if(removePending){if(state.designUploadBusy)return;removeMissingSheetFile(removePending.closest('[data-sheet-editor]').dataset.sheetEditor,removePending.dataset.removeMissingSheetFile);return;}
      const uploadMissing=e.target.closest('[data-upload-missing-sheet-design],[data-upload-all-missing-sheet-designs]');if(uploadMissing){try{await uploadMissingSheetDesign(uploadMissing,uploadMissing.hasAttribute('data-upload-all-missing-sheet-designs'))}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='addPromotionBtn'){qs('#promotionsEditor').insertAdjacentHTML('beforeend',promotionEditorRow());syncPromotionFields(qsa('[data-promotion-row]').at(-1));return;}
      if(e.target.closest('[data-promo-confirm]')){try{if(!await saveSettings())return;qs('#promotionsEditor').insertAdjacentHTML('beforeend',promotionEditorRow());const row=qsa('[data-promotion-row]').at(-1);syncPromotionFields(row);row.scrollIntoView({block:'start',behavior:'smooth'})}catch(err){toast(err.message,'error')}return;}
      if(e.target.closest('[data-add-promo-requirement]')){const row=e.target.closest('[data-promotion-row]'),used=qsa('[data-promo-requirement-type]',row).map(x=>x.value),type=[...qs('[data-promo-field="triggerType"]',row).options].map(x=>x.value).find(x=>x&&!used.includes(x));if(!type){toast('Ya agregaste todos los tipos.');return;}qs('[data-promo-requirements]',row).insertAdjacentHTML('beforeend',promotionRequirementRow({type}));syncPromotionFields(row);return;}
      if(e.target.closest('[data-remove-promo-requirement]')){const row=e.target.closest('[data-promotion-row]');e.target.closest('[data-promo-requirement]').remove();syncPromotionFields(row);return;}
      if(e.target.closest('[data-remove-promotion]')){e.target.closest('[data-promotion-row]').remove();return;}
      if(e.target.id==='addMotoBandBtn'){qs('#motoBandsEditor').insertAdjacentHTML('beforeend',motoBandRow());return;}
      if(e.target.closest('[data-remove-band]')){e.target.closest('[data-moto-band]').remove();return;}

      const features=e.target.closest('[data-manage-features]');if(features){openFeatureManager(Number(features.dataset.manageFeatures));return;}
      if(e.target.closest('[data-feature-close]')){qs('#featureManagerDialog').close();return;}
      if(e.target.closest('[data-feature-remove]')){e.target.closest('.feature-manager-row').remove();return;}
      if(e.target.closest('[data-feature-add]')){qs('[data-feature-manager-rows]').insertAdjacentHTML('beforeend',featureManagerRow());qsa('[data-feature-value]').at(-1)?.focus();return;}
      const saveFeatures=e.target.closest('[data-feature-save]');if(saveFeatures){await saveFeatureManager(saveFeatures);return;}

      const filter=e.target.closest('[data-design-filter]');if(filter){const key=filter.dataset.designFilter,selected=new Set(state.designTagFilters?.[key]||[]);selected.has(filter.dataset.tag)?selected.delete(filter.dataset.tag):selected.add(filter.dataset.tag);state.designTagFilters??={};state.designTagFilters[key]=[...selected];
        if(key==='production')renderProductionDesignGallery();else if(key.startsWith('sheet-')){filter.parentElement.querySelectorAll('[data-design-filter]').forEach(b=>{const active=selected.has(b.dataset.tag);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});filterSheetGallery(filter.closest('[data-sheet-editor]').dataset.sheetEditor)}
        else{const section=filter.closest('.design-library-section'),gallery=qs('.design-grid',section),parts=key.split('-'),scope=parts[0],kind=parts.at(-1)==='individual'?'individual':'sheet',items=state.designAssets.filter(a=>a.scope===scope&&a.kind===kind);gallery.innerHTML=(scope==='mixed'?state.designAssets.filter(a=>a.scope==='mixed'):items).filter(a=>designVisible(key,a)).map(designCard).join('')||'<div class="empty-state"><strong>Sin diseños con esos filtros.</strong></div>';updateDesignSelectionUI();observeDesignThumbnails();filter.parentElement.querySelectorAll('[data-design-filter]').forEach(b=>{const active=selected.has(b.dataset.tag);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))})}return;}
      const tagManage=e.target.closest('[data-design-tag-manage]');if(tagManage){const picker=tagManage.closest('[data-design-tag-picker]'),managing=picker.classList.toggle('managing');tagManage.textContent=managing?'Terminar edición':'Editar opciones';return;}
      const tagAdd=e.target.closest('[data-design-tag-add]');if(tagAdd){const picker=tagAdd.closest('[data-design-tag-picker]'),key=picker?.dataset.designTagPicker,selected=designPickerSelections(picker),input=qs('[data-design-tag-new]',picker),value=String(input?.value||'').trim().toLocaleLowerCase('es-AR');if(!value)return;const catalog=[...(state.designTagCatalog||[])];if(!catalog.includes(value))catalog.push(value);selected.push(value);try{await saveDesignTagCatalog(catalog);refreshDesignTagPicker(key,selected)}catch(err){toast(err.message,'error')}return;}
      const tagSave=e.target.closest('[data-design-tag-save]');if(tagSave){const picker=tagSave.closest('[data-design-tag-picker]'),key=picker?.dataset.designTagPicker,index=Number(tagSave.dataset.index),selected=designPickerSelections(picker),value=String(qs('[data-design-tag-value]',tagSave.parentElement)?.value||'').trim().toLocaleLowerCase('es-AR');if(!value)return;const old=qs('[data-design-tag-choice]',tagSave.parentElement)?.value||state.designTagCatalog[index];if(old&&old!==value&&state.designTagCatalog.includes(value)){toast('Esa opción ya existe.','error');return;}const catalog=[...(state.designTagCatalog||[])];catalog[index]=value;const next=selected.map(x=>x===old?value:x);try{await saveDesignTagCatalog(catalog,old&&old!==value?old:null,old&&old!==value?value:null);refreshDesignTagPicker(key,next)}catch(err){toast(err.message,'error')}return;}
      const tagDelete=e.target.closest('[data-design-tag-delete]');if(tagDelete){const picker=tagDelete.closest('[data-design-tag-picker]'),key=picker?.dataset.designTagPicker,index=Number(tagDelete.dataset.index),selected=designPickerSelections(picker),removed=qs('[data-design-tag-choice]',tagDelete.parentElement)?.value||state.designTagCatalog[index],catalog=[...(state.designTagCatalog||[])];catalog.splice(index,1);try{await saveDesignTagCatalog(catalog,removed,null);refreshDesignTagPicker(key,selected.filter(x=>x!==removed))}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='selectAllDesignsBtn'){state.selectedDesignAssets??=new Set();const ids=state.designAssets.map(a=>Number(a.id)),all=ids.every(id=>state.selectedDesignAssets.has(id));ids.forEach(id=>all?state.selectedDesignAssets.delete(id):state.selectedDesignAssets.add(id));updateDesignSelectionUI();return;}
      const designSelect=e.target.closest('[data-design-select]');if(designSelect){state.selectedDesignAssets??=new Set();const id=Number(designSelect.dataset.designSelect);state.selectedDesignAssets.has(id)?state.selectedDesignAssets.delete(id):state.selectedDesignAssets.add(id);updateDesignSelectionUI();return;}
      const selectAll=e.target.closest('[data-select-all-designs]');if(selectAll){state.selectedDesignAssets??=new Set();const ids=qsa('[data-design-card]',qs('#'+selectAll.dataset.selectAllDesigns)).map(card=>Number(card.dataset.designCard)),all=ids.every(id=>state.selectedDesignAssets.has(id));ids.forEach(id=>all?state.selectedDesignAssets.delete(id):state.selectedDesignAssets.add(id));updateDesignSelectionUI();return;}
      const order=e.target.closest('[data-move-design],[data-design-step]');if(order){try{await moveDesignCard(Number(order.dataset.designId),Number(order.dataset.moveDesign||order.dataset.designStep))}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='deleteSelectedDesignsBtn'){const ids=[...(state.selectedDesignAssets||[])];if(!ids.length)return;if(!confirm(`¿Eliminar ${ids.length} diseño${ids.length===1?'':'s'} seleccionado${ids.length===1?'':'s'}? Esta acción no se puede deshacer.`))return;try{await refreshDesignAssetsForDelete()}catch(err){toast(err.message,'error');return}let removed=0;const blocked=[];for(const id of ids){const reason=designDeleteBlockReason(id);if(reason){blocked.push(reason);continue}try{await api(`/api/admin/design-assets/${id}`,{method:'DELETE'});state.selectedDesignAssets.delete(id);removed++}catch(err){blocked.push(`${state.designAssets.find(a=>Number(a.id)===id)?.name||id}: ${err.message}`)}}await renderDesigns();if(removed)toast(`${removed} diseño${removed===1?'':'s'} eliminado${removed===1?'':'s'}`,'success');if(blocked.length)toast(blocked.join(' '),'error');return;}
      const removeUpload=e.target.closest('[data-remove-upload-file]');if(removeUpload){
        const id=Number(removeUpload.dataset.removeUploadFile),record=(state.designUploadFiles||[]).find(x=>x.id===id);if(!record)return;
        if(record.savedItem){toast('Este archivo ya se guardó. Podés continuar con los pendientes.');return;}
        state.designUploadFiles=state.designUploadFiles.filter(x=>x.id!==id);state.designUploadRenderedIds.delete(id);
        if(record.previewUrl){URL.revokeObjectURL(record.previewUrl);state.designUploadPreviewUrls=state.designUploadPreviewUrls.filter(url=>url!==record.previewUrl);}
        removeUpload.closest('[data-design-batch-row]')?.remove();
        if(!state.designUploadFiles.length)qs('#designUploadBatchMeta').innerHTML='';
        renderDesignUploadBatchMeta();return;
      }
      const addSheet=e.target.closest('[data-add-sheet-design]');if(addSheet){addSheetDesign(addSheet.dataset.sheetKey,Number(addSheet.dataset.addSheetDesign));return;}
      const otherSheet=e.target.closest('[data-sheet-other-size]');if(otherSheet){const key=otherSheet.dataset.sheetKey,c=state.designSheetDrafts[key][Number(otherSheet.dataset.sheetOtherSize)];addSheetDesign(key,Number(c.designAssetId),true);return;}
      const removeSheet=e.target.closest('[data-remove-sheet-component]');if(removeSheet){state.sheetRepeatTarget=null;const key=removeSheet.dataset.sheetKey,index=Number(removeSheet.dataset.removeSheetComponent);state.designSheetDrafts[key].splice(index,1);state.sheetActiveBox=null;if(state.sheetBoxTarget?.key===key){const active=state.sheetBoxTarget.index;if(active===index){state.sheetBoxTarget=null;state.sheetRepeatTarget=null;}else if(active>index)state.sheetBoxTarget.index--;}renderSheetSelected(key);return;}

      const groupHead=e.target.closest('.inventory-group-head');if(groupHead){const g=groupHead.closest('.inventory-group');if(g){g.classList.toggle('list-collapsed');return;}}
      const newMeasure=e.target.closest('[data-sheet-new-measure]');if(newMeasure){openSheetMeasure(newMeasure.dataset.sheetKey,Number(newMeasure.dataset.sheetNewMeasure));return;}
      if(e.target.closest('[data-sheet-measure-cancel]')){qs('#sheetMeasureDialog').close();return;}
      const saveMeasure=e.target.closest('[data-sheet-measure-save]');if(saveMeasure){try{await saveSheetMeasure(saveMeasure)}catch(err){toast(err.message,'error')}return;}
      const chooseSheetFiles=e.target.closest('[data-sheet-upload-files]');if(chooseSheetFiles){qs('[data-missing-sheet-file]',chooseSheetFiles.closest('[data-sheet-editor]'))?.click();return;}const repeat=e.target.closest('[data-sheet-repeat]');if(repeat){const key=repeat.dataset.sheetKey,index=Number(repeat.dataset.sheetRepeat);state.sheetRepeatTarget=state.sheetRepeatTarget?.key===key&&state.sheetRepeatTarget.index===index?null:{key,index};state.sheetBoxTarget=state.sheetRepeatTarget;state.sheetActiveBox=null;renderSheetSelected(key);return;}const box=e.target.closest('[data-sheet-box]');if(box){state.sheetRepeatTarget=null;const key=box.dataset.sheetKey||'upload';if(state.designSheetDrafts[key]?.[Number(box.dataset.sheetBox)]?.previewBoxes?.length){toast('Usá Hay más para otra aparición.','error');return;}state.sheetBoxTarget={key,index:Number(box.dataset.sheetBox)};state.sheetActiveBox=null;state.sheetMarkTarget=null;renderSheetSelected(key);return;}
      const mark=e.target.closest('[data-sheet-mark]');if(mark){state.sheetMarkTarget={key:mark.dataset.sheetKey,index:Number(mark.dataset.sheetMark)};state.sheetBoxTarget=null;state.sheetRepeatTarget=null;renderSheetPreview(mark.dataset.sheetKey);return;}
      const undoMark=e.target.closest('[data-sheet-undo]');if(undoMark){const key=undoMark.dataset.sheetKey,index=Number(undoMark.dataset.sheetUndo),c=state.designSheetDrafts[key]?.[index];if(!c?.previewBoxes?.length)return;c.previewBoxes.pop();c.previewMarks?.pop();c.quantity=c.previewBoxes.length;if(!c.quantity){c.measureOptionId='';delete c.pendingMeasureOption;}state.sheetActiveBox=null;renderSheetSelected(key);return;}
      const pin=e.target.closest('[data-sheet-pin]');if(pin){const selected={key:pin.dataset.sheetKey,rowIndex:Number(pin.dataset.sheetPin),boxIndex:Number(pin.dataset.pinIndex)};state.sheetActiveBox=selected;state.sheetBoxTarget={key:selected.key,index:selected.rowIndex};renderSheetSelected(selected.key);return;}
      const canvas=e.target.closest('[data-sheet-canvas]');if(canvas){const target=state.sheetMarkTarget,key=canvas.dataset.sheetCanvas;if(target?.key===key){const c=state.designSheetDrafts[key][target.index];if(c){c.previewMarks??=[];if(c.previewMarks.length>=Number(c.quantity)){toast('Ya marcaste todas las unidades de esta fila.','error');return;}c.previewMarks.push(sheetBoxCoordinate(canvas,e));renderSheetSelected(key)}}return;}
      const addMeasure=e.target.closest('[data-add-measure-option]');if(addMeasure){qs('[data-measure-rows]',addMeasure.closest('[data-measure-editor]')).insertAdjacentHTML('beforeend',designMeasureRow());return;}
      const removeMeasure=e.target.closest('[data-remove-measure-option]');if(removeMeasure){removeMeasure.closest('[data-measure-option]').remove();return;}
      if(e.target.id==='applyProductionMeasureBtn'){try{applyProductionMeasure()}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='cancelProductionMeasureBtn'||e.target.id==='closeProductionMeasureBtn'){state.productionMeasureQueue=[];qs('#productionMeasureDialog').close();return;}
      const copyDesign=e.target.closest('[data-copy-production-design]');if(copyDesign){duplicateProductionDesign(Number(copyDesign.dataset.copyProductionDesign));return;}
      const duplicateDesign=e.target.closest('[data-duplicate-production-design]');if(duplicateDesign){duplicateProductionDesign(Number(duplicateDesign.dataset.duplicateProductionDesign),true);return;}
      const tool=e.target.closest('[data-mockup-tool]');if(tool){state.mockupTool=tool.dataset.mockupTool;state.mockupCalibration=null;renderMockupLayerControls();refreshMockupPreview().catch(()=>{});return;}
      if(e.target.closest('[data-mockup-calibrate]')){const cm=Number(qs('#mockupCalibrationCm')?.value);if(!(cm>0&&cm<=10000)){toast('Ingresá una distancia real en centímetros.','error');return;}state.mockupTool='move';state.mockupCalibration={cm};toast('Marcá el primer extremo de la distancia conocida.');return;}
      if(e.target.closest('[data-mockup-mask-undo],[data-mockup-surface-reset]')){const layer=mockupLayers().find(l=>l.key===state.mockupSelectedLayer);if(layer){if(e.target.closest('[data-mockup-mask-undo]'))layer.item.surface?.strokes?.pop();else layer.item.surface={};renderMockupLayerControls();refreshMockupPreview().catch(()=>{});}return;}
      const turn=e.target.closest('[data-mockup-turn]');if(turn){const key=turn.dataset.layer,layer=mockupLayers().find(x=>x.key===key);if(layer){const delta=Number(turn.dataset.mockupTurn);setMockupRotation(key,delta?(layer.item.mockupPlacement?.rotation||0)+delta:0);}return;}
      if(e.target.id==='showAllMockupVariants'){state.productionLimitMaterialPhotos=false;state.mockupVariantFilters={};renderMockupStudioOptions();return;}
      const changeMeasure=e.target.closest('[data-change-production-measure]');if(changeMeasure){const row=state.productionDesignsSelected[Number(changeMeasure.dataset.index)];openProductionMeasureDialog(Number(changeMeasure.dataset.changeProductionMeasure),row?.printSide||'front',Number(changeMeasure.dataset.index));return;}
      const go=e.target.closest('[data-go]');if(go){navigate(go.dataset.go);return}
      if(e.target.id==='openDesignUploadBtn'||e.target.id==='productionUploadDesignBtn'){openDesignUpload(e.target.id==='productionUploadDesignBtn'?'production':'designs');return;}
      if(e.target.id==='openDesignEmailBtn'){const ids=[...(state.selectedDesignSheets||new Set())];if(!ids.length){toast('Marcá al menos una plancha en las galerías.','error');return;}qs('#designEmailSelection').textContent=`${ids.length} plancha${ids.length===1?'':'s'} seleccionada${ids.length===1?'':'s'}`;qs('#designEmailDialog')?.showModal();return;}
      if(e.target.id==='closeDesignUploadBtn'||e.target.id==='cancelDesignUploadBtn'){if(canCloseDesignDialog('upload'))qs('#designUploadDialog')?.close();return}
      if(e.target.id==='closeDesignEmailBtn'||e.target.id==='cancelDesignEmailBtn'){qs('#designEmailDialog')?.close();return}
      if(e.target.id==='closeDesignPreviewBtn'){if(canCloseDesignDialog('detail')&&(qs('#designDetailEditor')?.classList.contains('hidden')||confirm('¿Salir sin guardar?')))qs('#designPreviewDialog')?.close();return}
      if(e.target.id==='openFlyerUploadBtn'){const form=qs('#flyerUploadForm');form?.reset();qs('#flyerUploadDialog')?.showModal();return}
      if(e.target.id==='closeFlyerUploadBtn'||e.target.id==='cancelFlyerUploadBtn'){qs('#flyerUploadDialog')?.close();return}
      if(e.target.id==='closeFlyerDetailBtn'||e.target.id==='cancelFlyerDetailBtn'){qs('#flyerDetailDialog')?.close();return}
      const of=e.target.closest('[data-open-flyer]');if(of){openFlyerDetail(Number(of.dataset.openFlyer));return}
      if(e.target.id==='editDesignDetailBtn'){openDesignEdit();return}
      if(e.target.id==='cancelDesignEditBtn'){if(!canCloseDesignDialog('detail')||!confirm('¿Desea cancelar la edición?'))return;if(state.activeDesignId){qs('#designPreviewDialog')?.close();openDesignPreview(state.activeDesignId)}return}
      if(e.target.id==='saveDesignDetailBtn'){if(!state.activeDesignId)return;try{e.target.disabled=true;const payload=designDialogPayload(),purchaseWanted=payload.kind==='sheet'&&payload.printed&&!state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId))?.purchase_id;
      if(purchaseWanted){sheetPurchasePayload({id:state.activeDesignId,cost_cents:payload.costCents,width_cm:payload.widthCm,height_cm:payload.heightCm,print_material_type:payload.printMaterialType},'detail');payload.printed=false;}
      if(payload.kind==='sheet'){
        const problem=sheetMeasurementProblem('detail');if(problem)throw new Error(problem);
        for(const c of state.designSheetDrafts.detail||[]){if(!c.previewBoxes?.length||c.previewBoxes.length!==c.quantity)throw new Error('Revisá y marcá cada aparición de la plancha. Podés quitar las marcas equivocadas.');if(c.pendingMeasureOption){const saved=await api(`/api/admin/design-assets/${c.designAssetId}/measures`,{method:'POST',body:JSON.stringify({measureOptions:[c.pendingMeasureOption]})});state.designAssets=state.designAssets.map(a=>Number(a.id)===Number(c.designAssetId)?saved.item:a);c.measureOptionId=c.pendingMeasureOption.id;delete c.pendingMeasureOption;}}
        payload.components=sheetPayload('detail').components;
      }const updated=await api(`/api/admin/design-assets/${state.activeDesignId}`,{method:'PATCH',body:JSON.stringify(payload)});if(purchaseWanted)await registerSheetPurchase(updated.item,'detail');toast('Diseño actualizado','success');await renderDesigns();qs('#designPreviewDialog')?.close();openDesignPreview(state.activeDesignId)}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      if(e.target.id==='deleteDesignDetailBtn'){if(!state.activeDesignId)return;try{await refreshDesignAssetsForDelete();const block=designDeleteBlockReason(state.activeDesignId);if(block){toast(block,'error');return}if(!confirm('¿Eliminar este diseño de la biblioteca?'))return;await api(`/api/admin/design-assets/${state.activeDesignId}`,{method:'DELETE'});qs('#designPreviewDialog')?.close();state.activeDesignId=null;toast('Diseño eliminado','success');await renderDesigns()}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='saveFlyerDetailBtn'){if(!state.activeFlyerId)return;try{e.target.disabled=true;await api(`/api/admin/flyers/${state.activeFlyerId}`,{method:'PUT',body:JSON.stringify({title:qs('#flyerDetailTitle')?.value||'',public:Boolean(qs('#flyerDetailPublic')?.checked),sort_order:Number(qs('#flyerDetailSort')?.value)||0})});qs('#flyerDetailDialog')?.close();toast('Flyer actualizado','success');await renderFlyers()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      if(e.target.id==='deleteFlyerDetailBtn'){if(!state.activeFlyerId)return;if(confirm('¿Eliminar este flyer?')){try{await api(`/api/admin/flyers/${state.activeFlyerId}`,{method:'DELETE'});qs('#flyerDetailDialog')?.close();state.activeFlyerId=null;toast('Flyer eliminado','success');await renderFlyers()}catch(err){toast(err.message,'error')}}return}
      const pd=e.target.closest('[data-preview-design]');if(pd){try{openDesignPreview(Number(pd.dataset.previewDesign))}catch(err){toast(err.message,'error')}return}
      const zd=e.target.closest('[data-toggle-design-zoom]');if(zd){zd.classList.toggle('fit');return}
      if(e.target.id==='uploadDesignBtn'){try{await uploadDesignFiles(e.target)}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='emailDesignSheetsBtn'){const ids=[...(state.selectedDesignSheets||new Set())];const to=qs('#designEmailTo')?.value.trim();if(!ids.length){toast('Marcá al menos una plancha.','error');return}if(!to){toast('Ingresá el email destinatario.','error');return}try{e.target.disabled=true;e.target.textContent='Enviando...';await api('/api/admin/design-assets/email',{method:'POST',body:JSON.stringify({ids,to,message:qs('#designEmailMessage')?.value||''})});qs('#designEmailDialog')?.close();toast('Mail enviado con enlaces a los originales','success')}catch(err){toast(err.message,'error')}finally{e.target.disabled=false;e.target.textContent='Enviar planchas seleccionadas'}return}
      const openColor=e.target.closest('[data-open-purchase-color]');if(openColor){try{openPurchaseColorDialog(Number(openColor.dataset.openPurchaseColor),openColor)}catch(err){toast(err.message,'error')}return}
      const sheetPreview=e.target.closest('[data-purchase-sheet-preview]');if(sheetPreview){openPurchaseSheetPreview(Number(sheetPreview.dataset.purchaseSheetPreview),sheetPreview.dataset.sheetName,sheetPreview.dataset.sheetMime);return;}if(e.target.id==='closePurchaseSheetPreviewBtn'){qs('#purchaseSheetPreviewDialog').close();return;}
      if(e.target.id==='newPurchaseBtn'){openPurchaseDialog();return}const ep=e.target.closest('[data-edit-purchase]');if(ep){const p=state.purchases.find(x=>Number(x.id)===Number(ep.dataset.editPurchase));if(p)openPurchaseDialog(p);return}if(e.target.id==='saveOtherValueBtn'){saveOtherEditor();return}if(e.target.id==='cancelOtherValueBtn'||e.target.id==='closeOtherValueBtn'){qs('#otherValueDialog')?.close();state.otherEditor=null;if(qs('#purchaseDialog')?.open)renderPurchaseItems();return}
      if(e.target.id==='closePurchaseDialogBtn'||e.target.id==='cancelPurchaseBtn'){qs('#purchaseDialog')?.close();state.purchaseContext='purchases';return}
      if(e.target.id==='addPurchaseItemBtn'){state.purchaseItems.push(purchaseDefaultItem('shirt'));renderPurchaseItems();return}
      const pstep=e.target.closest('[data-purchase-step]');if(pstep){const i=Number(pstep.dataset.row),x=state.purchaseItems[i];if(x){x.quantity=Math.max(materialIsDtf(x.materialType)?.01:1,(Number(x.quantity)||0)+(Number(pstep.dataset.purchaseStep)||0));delete x.lineTotalCents;renderPurchaseItems();}return}
      const pdup=e.target.closest('[data-duplicate-purchase-item]');if(pdup){const i=Number(pdup.dataset.duplicatePurchaseItem),src=state.purchaseItems[i];if(src){state.purchaseItems.splice(i+1,0,{...src});renderPurchaseItems();}return}
      const prem=e.target.closest('[data-remove-purchase-item]');if(prem){state.purchaseItems.splice(Number(prem.dataset.removePurchaseItem),1);if(!state.purchaseItems.length)state.purchaseItems.push(purchaseDefaultItem('shirt'));renderPurchaseItems();return}
      if(e.target.id==='savePurchaseBtn'){try{e.target.disabled=true;await savePurchaseAndReturn()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      if(e.target.id==='newProductionBtn'){await openProductionDialog();return}
      if(e.target.id==='closeProductionDialogBtn'||e.target.id==='cancelProductionBtn'){if(confirm(e.target.id==='cancelProductionBtn'?'¿Desea cancelar la edición?':'¿Salir sin guardar?'))qs('#productionDialog')?.close();return}
      const materialPalette=e.target.closest('[data-material-color-palette]');if(materialPalette){try{openMaterialFieldColor(materialPalette)}catch(err){toast(err.message,'error')}return;}
      const copyInfo=e.target.closest('[data-mockup-copy-info]');if(copyInfo){copyMockupInfo(copyInfo.dataset.mockupCopyInfo);return;}
      const addModel=e.target.closest('[data-add-mockup-model]');if(addModel){openMockupModelDialog(addModel.dataset.addMockupModel);return;}const mockupPalette=e.target.closest('[data-mockup-palette]');if(mockupPalette){try{openMockupColorPalette(mockupPalette)}catch(err){toast(err.message,'error')}return;}
      const saveAppearance=e.target.closest('[data-save-design-appearance],[data-copy-design-appearance],[data-reset-design-appearance]');if(saveAppearance){try{if(saveAppearance.dataset.resetDesignAppearance)await resetDesignAppearance(saveAppearance.dataset.resetDesignAppearance);else await saveDesignAppearance(saveAppearance.dataset.saveDesignAppearance||saveAppearance.dataset.copyDesignAppearance,!!saveAppearance.dataset.copyDesignAppearance)}catch(err){toast(err.message,'error')}return;}
      const resetChannel=e.target.closest('[data-reset-design-channel]');if(resetChannel){await setDesignAppearance(resetChannel.dataset.designColorOwner,resetChannel.dataset.resetDesignChannel,'',true);return;}
      const kindChoice=e.target.closest('[data-upload-kind-choice]');if(kindChoice){setUploadKind(kindChoice.dataset.uploadKindChoice);qs('#designUploadKindPrompt').close();return;}
      const productionPurchase=e.target.closest('[data-production-purchase]');if(productionPurchase){try{const material=productionPrimaryMaterial(),data=await api('/api/admin/purchases'),purchase=(data.items||[]).filter(p=>(p.items||[]).some(i=>Number(i.material_id)===Number(material?.id))).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at))||Number(b.id)-Number(a.id))[0];await openPurchaseDialog(purchase||null,'production');}catch(err){toast(err.message,'error');}return;}
      const chooseClient=e.target.closest('[data-choose-design-client]');if(chooseClient){await clientDirectory().choose(client=>{assignUploadClient(chooseClient,client);});return;}
      const addClient=e.target.closest('[data-add-design-client]');if(addClient){await clientDirectory().edit(null,client=>{assignUploadClient(addClient,client);});return;}
      const designColor=e.target.closest('[data-design-color-kind]');if(designColor){try{openDesignColorPalette(designColor)}catch(err){toast(err.message,'error')}return;}
      const allPhotos=e.target.closest('[data-purchase-photos-all]');if(allPhotos){const index=Number(allPhotos.dataset.purchasePhotosAll),item=state.purchaseItems[index],row=allPhotos.closest('[data-purchase-row]');if(!item)return;syncPurchaseRowFromDom(row);const ids=photosForItem(item,purchasePhotoIds(item)).map(a=>Number(a.id)),all=ids.length&&ids.every(id=>purchasePhotoIds(item).includes(id));item.imageAssetIds=all?[]:ids;item.imageAssetId=item.imageAssetIds[0]||null;item._imageTouched=true;refreshPurchasePhotoField(index);return;}
      const uploadMaterialImage=e.target.closest('[data-upload-material-image]');if(uploadMaterialImage){const row=uploadMaterialImage.closest('[data-purchase-row]');if(row)syncPurchaseRowFromDom(row);try{await openMockupAssetDialog(Number(uploadMaterialImage.dataset.uploadMaterialImage))}catch(err){toast(err.message,'error')}return}
      const background=e.target.closest('[data-select-mockup-background]');if(background){qs('#mockupBackgroundSelect').value=background.dataset.selectMockupBackground||'';const view=rememberMockupView();if(view)view.backgroundId=Number(background.dataset.selectMockupBackground)||0;renderMockupStudioOptions();refreshMockupPreview().catch(err=>toast(err.message,'error'));return;}
      const variant=e.target.closest('[data-select-mockup-variant]');if(variant){selectMockupVariant(Number(variant.dataset.selectMockupVariant));return;}
      const selectMockupLayer=e.target.closest('[data-select-mockup-layer]');if(selectMockupLayer){selectMockupLayerByKey(selectMockupLayer.dataset.selectMockupLayer);return}
      const editPhoto=e.target.closest('[data-edit-mockup-asset]');if(editPhoto){try{await openMockupAssetDialog(null,Number(editPhoto.dataset.editMockupAsset))}catch(err){toast(err.message,'error')}return;}
      const photoPreview=e.target.closest('[data-open-mockup-queue]');if(photoPreview){openMockupPhotoPreview(Number(photoPreview.dataset.openMockupQueue));return;}
      const photoZoom=e.target.closest('[data-photo-zoom]');if(photoZoom){setMockupPhotoZoom(photoZoom.dataset.photoZoom==='fit'?1:(state.mockupPhotoZoom||1)*Number(photoZoom.dataset.photoZoom));return;}
      if(e.target.id==='closeMockupPhotoPreviewBtn'){qs('#mockupPhotoPreviewDialog').close();return;}
      if(['manageMockupAssetsBtn','productionUploadMockupBtn'].includes(e.target.id)){try{await openMockupAssetDialog(null,null,{production:true})}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='closeMockupAssetsBtn'||e.target.id==='cancelMockupAssetBtn'){if(state.mockupUploadBusy)return;qs('#mockupAssetDialog')?.close();releaseMockupQueue();return}
      
      if(e.target.id==='downloadAllProductViewsBtn'){await downloadAllProductViews(e.target);return;}if(e.target.id==='downloadMockupBtn'){await downloadMockupPreview(e.target);return}
      if(e.target.id==='addMockupToProductBtn'){addMockupPreviewToProduct(e.target);return}
      const deleteMockup=e.target.closest('[data-delete-mockup-asset]');if(deleteMockup){try{await removeMockupAsset(Number(deleteMockup.dataset.deleteMockupAsset))}catch(err){toast(err.message,'error')}return;}
      const removePhoto=e.target.closest('[data-mockup-remove]');if(removePhoto){const id=Number(removePhoto.dataset.mockupRemove),r=state.mockupUploadQueue?.find(x=>x.id===id);if(r?.saved){toast('Esta foto ya se guardó. Podés eliminarla de la biblioteca.','error');return;}if(r)URL.revokeObjectURL(r.url);state.mockupUploadQueue=state.mockupUploadQueue.filter(x=>x.id!==id);removePhoto.closest('[data-mockup-upload]')?.remove();return;}
      if(e.target.matches('[data-mockup-catalog-add],[data-mockup-catalog-save],[data-mockup-catalog-delete]')){const key=state.mockupCatalogKey||'models',list=state.mockupCatalog[key];if(e.target.hasAttribute('data-mockup-catalog-add')){const value=qs('#mockupCatalogNew').value.trim();if(value&&!list.includes(value))list.push(value)}else if(e.target.hasAttribute('data-mockup-catalog-delete'))list.splice(Number(e.target.dataset.mockupCatalogDelete),1);else{const value=qs(`[data-mockup-catalog-value="${e.target.dataset.mockupCatalogSave}"]`)?.value.trim();if(value)list[Number(e.target.dataset.mockupCatalogSave)]=value}try{for(const r of state.mockupUploadQueue||[]){const card=qs(`[data-mockup-upload="${r.id}"]`);if(card)r.values=mockupCardValues(card);}await persistMockupCatalog();renderMockupCatalogEditor();renderMockupUploadQueue();toast('Lista actualizada','success')}catch(err){toast(err.message,'error')}return;}
      const productionSection=e.target.closest('[data-production-section]');if(productionSection){state.productionSection=productionSection.dataset.productionSection;try{await renderProduction()}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='newMontagePhotosBtn'){try{await openMockupAssetDialog()}catch(err){toast(err.message,'error')}return;}
      const editMount=e.target.closest('[data-edit-production-mount],[data-edit-product-mount]');if(editMount){try{qs('#productionImagePreviewDialog')?.close();qs('#productionEditDialog')?.close();const job=state.productionJobs.find(j=>Number(j.id)===Number(editMount.dataset.editProductionMount));await openProductionMount(job?.product_id||Number(editMount.dataset.editProductMount),job?.id||0);}catch(err){toast(err.message,'error')}return;}
      const editProduction=e.target.closest('[data-edit-production]');if(editProduction){try{await openProductionJobEdit(Number(editProduction.dataset.editProduction))}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='closeProductionEditBtn'||e.target.id==='cancelProductionEditBtn'){qs('#productionEditDialog').close();return;}
      if(e.target.id==='saveProductionEditBtn'){try{e.target.disabled=true;await saveProductionJobEdit()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return;}
      if(e.target.id==='editProductionProductBtn'){try{const id=state.editingProductionJob?.product_id;if(id){qs('#productionEditDialog')?.close();await openProductionMount(Number(id),Number(state.editingProductionJob?.id)||0);}}catch(err){toast(err.message,'error')}return;}
      const prodTab=e.target.closest('[data-production-tab]');if(prodTab){setProductionTab(Number(prodTab.dataset.productionTab));return}
      if(e.target.id==='productionNextBtn'){if(!state.productionMaterialsSelected.length){toast('Elegí la materia prima que usaste.','error');return}setProductionTab(2);return}
      if(e.target.id==='productionBackBtn'){setProductionTab(1);return}
      const prodStep=e.target.closest('[data-production-step]');if(prodStep){const input=qs('#productionQuantity');input.value=String(Math.max(Number(input.min)||0,(Number(input.value)||0)+(Number(prodStep.dataset.productionStep)||0)));calcProductionBuilderCost();return}
      const addMat=e.target.closest('[data-add-production-material]');if(addMat){const id=Number(addMat.dataset.addProductionMaterial);if(!state.productionMaterialsSelected.some(x=>Number(x.materialId)===id)){state.productionMaterialsSelected.push({materialId:id,quantity:1});renderProductionSelectedMaterials();renderProductionMaterialGallery();const m=state.materials.find(x=>Number(x.id)===id);if(m?.material_type===(qs('#productionMaterialType')?.value||'shirt')){state.productionLimitMaterialPhotos=true;state.mockupVariantFilters={};const photos=materialPhotos(id);renderMockupStudioOptions();if(photos.length&&!qs('#mockupBaseSelect').value)selectMockupVariant(photos[0].id);loadProductionPriceSuggestion(id);state.productionShippingDirty=false;syncProductionPublicationDefaults();applyProductionShippingDefaults(true);}}return}
      const rmMat=e.target.closest('[data-remove-production-material]');if(rmMat){state.productionMaterialsSelected.splice(Number(rmMat.dataset.removeProductionMaterial),1);renderProductionSelectedMaterials();renderProductionMaterialGallery();return}
      const matStep=e.target.closest('[data-prod-material-step]');if(matStep){const i=Number(matStep.dataset.index),x=state.productionMaterialsSelected[i];if(x){x.quantity=Math.max(.001,(Number(x.quantity)||1)+Number(matStep.dataset.prodMaterialStep||0));renderProductionSelectedMaterials();}return}
      const addDes=e.target.closest('[data-add-production-design]');if(addDes){addProductionDesignDefault(Number(addDes.dataset.addProductionDesign));return}
      const rmDes=e.target.closest('[data-remove-production-design]');if(rmDes){removeProductionDesign(Number(rmDes.dataset.removeProductionDesign));return}
      if(e.target.closest('[data-use-production-measure-suggestion]')){updateProductionMeasureSuggestion(true);return;}const desStep=e.target.closest('[data-prod-design-step]');if(desStep){const i=Number(desStep.dataset.index),x=state.productionDesignsSelected[i];if(x){x.quantity=Math.max(1,(Number(x.quantity)||1)+Number(desStep.dataset.prodDesignStep||0));renderProductionSelectedDesigns();}return}
      if(e.target.id==='saveProductionBtn'){try{e.target.disabled=true;const result=await saveProductionBuilder();qs('#productionDialog')?.close();toast(result.edited?'Montaje actualizado':result.stockKind==='to_stock'?'Producto publicado como A stockear · receta guardada':'Producto creado y producción iniciada · materia prima descontada','success');await renderProduction()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      const pc=e.target.closest('[data-complete-production]');if(pc){if(confirm('¿Marcar esta producción como terminada y sumarla al stock vendible?')){try{await api(`/api/admin/production/${pc.dataset.completeProduction}/complete`,{method:'PATCH',body:'{}'});toast('Producción terminada · stock actualizado','success');await renderProduction()}catch(err){toast(err.message,'error')}}return}
      const delArmed=e.target.closest('[data-delete-production-product]');if(delArmed){if(confirm('¿Eliminar este producto armado, sus vistas y sus producciones de prueba?')){try{await api(`/api/admin/products/${Number(delArmed.dataset.deleteProductionProduct)}`,{method:'DELETE'});state.costingLoaded=false;toast('Producto armado eliminado','success');await renderProduction();}catch(err){toast(err.message,'error');}}return;}const delProduction=e.target.closest('[data-delete-production]');if(delProduction){if(confirm('¿Eliminar esta producción de prueba? Se devuelve la materia prima y se revierte el stock generado. También se elimina el producto armado y sus fotos.')){try{await api(`/api/admin/production/${Number(delProduction.dataset.deleteProduction)}?removeProduct=1`,{method:'DELETE'});state.costingLoaded=false;toast('Producción eliminada','success');await renderProduction();}catch(err){toast(err.message,'error')}}return;}
      const px=e.target.closest('[data-cancel-production]');if(px){if(confirm('¿Cancelar esta producción? Los materiales descontados vuelven a materia prima.')){try{await api(`/api/admin/production/${px.dataset.cancelProduction}/cancel`,{method:'PATCH',body:'{}'});toast('Producción cancelada · materiales restituidos','success');await renderProduction()}catch(err){toast(err.message,'error')}}return}
      if(e.target.id==='addRecipeDesignBtn'){state.productRecipeDesigns=collectRecipeDesigns();state.productRecipeDesigns.push({designAssetId:0,quantity:1});renderProductRecipeDesigns();return}
      if(e.target.id==='addRecipeMaterialBtn'){state.productRecipeMaterials=collectRecipeMaterials();state.productRecipeMaterials.push({materialId:0,quantity:1});renderProductRecipeMaterials();return}
      const rrd=e.target.closest('[data-remove-recipe-design]');if(rrd){state.productRecipeDesigns=collectRecipeDesigns();state.productRecipeDesigns.splice(Number(rrd.dataset.removeRecipeDesign),1);renderProductRecipeDesigns();return}
      const rrm=e.target.closest('[data-remove-recipe-material]');if(rrm){state.productRecipeMaterials=collectRecipeMaterials();state.productRecipeMaterials.splice(Number(rrm.dataset.removeRecipeMaterial),1);renderProductRecipeMaterials();return}
      if(e.target.id==='newProductBtn'){await openProductionDialog();return}
      const edit=e.target.closest('[data-edit-product]');if(edit){await openProductionMount(Number(edit.dataset.editProduct));return}
      const dup=e.target.closest('[data-duplicate-product]');if(dup){await openProductDuplicateDialog(Number(dup.dataset.duplicateProduct));return}
      const move=e.target.closest('[data-move-media]');if(move){moveMedia(move.dataset.mediaKey,Number(move.dataset.moveMedia));return}
      const rm=e.target.closest('[data-remove-media]');if(rm){await removeMediaItem(rm.dataset.removeMedia);return}
      const stockStep=e.target.closest('[data-stock-step]');if(stockStep){const row=stockStep.closest('.variant-row');const input=qs('[data-v="stock"]',row);if(input){const delta=Number(stockStep.dataset.stockStep)||0;input.value=String(Math.max(0,Math.trunc(Number(input.value)||0)+delta));input.dispatchEvent(new Event('input',{bubbles:true}));}return}
      if(e.target.id==='addVariantBtn'){const builder=qs('#variantBuilder');const mode=builder?.dataset.mode||'';if(mode)builder.insertAdjacentHTML('beforeend',variantRow({color:mode==='sized'?'Negro':'',size:'',stock:0,stockKind:'untracked',sku:''},mode));return}
      const rv=e.target.closest('.remove-variant');if(rv){rv.closest('.variant-row').remove();return}
      const rn=e.target.closest('[data-remove-new-image]');if(rn){state.newFiles.splice(Number(rn.dataset.removeNewImage),1);qs('#newImages').innerHTML=state.newFiles.map((f,i)=>`<div class="image-preview"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-remove-new-image="${i}">×</button></div>`).join('');return}
      const di=e.target.closest('[data-delete-image]');if(di){if(confirm('¿Eliminar esta foto?')){await api(`/api/admin/images/${di.dataset.deleteImage}`,{method:'DELETE'});di.closest('.image-preview').remove();toast('Foto eliminada','success')}return}
      if(e.target.id==='saveProductBtn'){e.preventDefault();const btn=e.target;try{btn.disabled=true;await saveProduct()}catch(err){toast(err.message,'error')}finally{btn.disabled=false}return}
      if(e.target.id==='newCategoryBtn'){const name=prompt('Nombre de la categoría:');if(name){try{await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name})});state.categories=[];await renderCategories();toast('Categoría creada','success')}catch(err){toast(err.message,'error')}}return}
      const sc=e.target.closest('[data-save-category]');if(sc){const row=sc.closest('[data-category-row]');try{await api(`/api/admin/categories/${sc.dataset.saveCategory}`,{method:'PUT',body:JSON.stringify({name:qs('[data-category-name]',row).value,sort_order:Number(qs('[data-category-sort]',row).value)||0,active:qs('[data-category-active]',row).checked})});state.categories=[];toast('Categoría guardada','success');await renderCategories()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='clearStockFiltersBtn'){state.stockFilters={category:'',stage:'',size:'',color:'',fit:'',audience:'',sort:'product'};state.productPublication='';state.productSearch='';await renderProducts();return}
      const closeReview=e.target.closest('[data-close-review-dialog]');if(closeReview){closeReview.closest('dialog').close();return;}
      if(e.target.closest('[data-open-balance-chart]')){openBalanceChart();return;}
      const review=e.target.closest('[data-view-purchase]');if(review){try{await openPurchaseReview(Number(review.dataset.viewPurchase));}catch(err){toast(err.message,'error');}return;}
      const reviewArrow=e.target.closest('[data-purchase-review-arrow]');if(reviewArrow){const view=state.purchaseReview;view.index=(view.index+Number(reviewArrow.dataset.purchaseReviewArrow)+view.photos.length)%view.photos.length;renderPurchaseReviewPhoto();return;}
      const reviewedEdit=e.target.closest('[data-edit-reviewed-purchase]');if(reviewedEdit){qs('#purchaseReviewDialog').close();await openPurchaseDialog(state.purchases.find(x=>Number(x.id)===Number(reviewedEdit.dataset.editReviewedPurchase)));return;}
      const colorFilter=e.target.closest('[data-product-global-color]');if(colorFilter){const value=colorFilter.dataset.productGlobalColor;state.stockFilters.color=state.stockFilters.color===value?'':value;const select=qs('#stockFilterColor');if(select)select.value=state.stockFilters.color;renderUnifiedProducts();return;}const cardColor=e.target.closest('[data-product-color-filter]');if(cardColor){state.productColorFilters??={};const id=cardColor.dataset.productColorFilter;state.productColorFilters[id]=state.productColorFilters[id]===cardColor.dataset.color?'':cardColor.dataset.color;renderUnifiedProducts();return;}const sizeFilter=e.target.closest('[data-product-size-filter]');if(sizeFilter){const value=sizeFilter.dataset.productSizeFilter;state.stockFilters.size=state.stockFilters.size===value?'':value;const select=qs('#stockFilterSize');if(select)select.value=state.stockFilters.size;renderUnifiedProducts();return;}
      const editGroup=e.target.closest('[data-stock-edit-group]');if(editGroup){const key=editGroup.closest('[data-stock-group]').dataset.stockGroup;state.stockEditingGroups??=new Set();state.stockEditingGroups.has(key)?state.stockEditingGroups.delete(key):state.stockEditingGroups.add(key);renderStockFiltered();return;}
      const stockLevelStep=e.target.closest('[data-stock-level-step]');if(stockLevelStep){const row=stockLevelStep.closest('[data-stock-level-row]'),input=qs(`[data-stock-level="${stockLevelStep.dataset.kind}"]`,row);input.value=String(Math.max(0,Number(input.value)+Number(stockLevelStep.dataset.stockLevelStep)));rememberStockLevels(row);return;}
      const stockSave=e.target.closest('[data-save-stock-levels]');if(stockSave){try{await saveStockLevels(Number(stockSave.dataset.saveStockLevels));}catch(err){toast(err.message,'error');}return;}
      const stockArrow=e.target.closest('[data-stock-photo-arrow]');if(stockArrow){const group=stockArrow.closest('[data-stock-group]'),key=group.dataset.stockGroup,photos=state.stockGroupPhotos[key];state.stockPhotoIndexes??={};state.stockPhotoIndexes[key]=((state.stockPhotoIndexes[key]||0)+Number(stockArrow.dataset.stockPhotoArrow)+photos.length)%photos.length;renderStockFiltered();return;}
      const montageToggle=e.target.closest('[data-toggle-montage-groups]');if(montageToggle){setAdminListsCollapsed(!state.productionPhotosCollapsed);montageToggle.textContent=state.productionPhotosCollapsed?'⌄':'⌃';montageToggle.setAttribute('aria-label',state.productionPhotosCollapsed?'Expandir fotos':'Comprimir fotos');return;}

      const delOrder=e.target.closest('[data-delete-order]');if(delOrder){if(confirm('¿Borrar esta orden cancelada de prueba? Esta acción no se puede deshacer.')){try{await api(`/api/admin/orders/${delOrder.dataset.deleteOrder}`,{method:'DELETE'});toast('Orden de prueba eliminada','success');await renderOrders()}catch(err){toast(err.message,'error')}}return}
      const cc=e.target.closest('[data-correo-create]');if(cc){if(!confirm('¿Crear la preimposición de este pedido en Correo Argentino?'))return;try{cc.disabled=true;cc.textContent='Creando...';const d=await api(`/api/admin/orders/${cc.dataset.correoCreate}/correo/create`,{method:'POST'});toast(`Envío creado · ${d.trackingNumber}`,'success');await renderOrders()}catch(err){toast(err.message,'error');cc.disabled=false;cc.textContent='Crear envío'}return}
      const cl=e.target.closest('[data-correo-label]');if(cl){try{cl.disabled=true;await downloadAdminFile(`/api/admin/orders/${cl.dataset.correoLabel}/correo/label`,'rotulo-correo.pdf');toast('Rótulo descargado','success')}catch(err){toast(err.message,'error')}finally{cl.disabled=false}return}
      const ct=e.target.closest('[data-correo-track]');if(ct){try{ct.disabled=true;const d=await api(`/api/admin/orders/${ct.dataset.correoTrack}/correo/tracking`);toast(d.status?`Correo: ${d.status}`:'Seguimiento actualizado','success');await renderOrders()}catch(err){toast(err.message,'error');ct.disabled=false}return}
      const cx=e.target.closest('[data-correo-cancel]');if(cx){if(!confirm('¿Cancelar esta preimposición en Correo Argentino?'))return;try{cx.disabled=true;await api(`/api/admin/orders/${cx.dataset.correoCancel}/correo/cancel`,{method:'PATCH'});toast('Preimposición cancelada en Correo Argentino','success');await renderOrders()}catch(err){toast(err.message,'error');cx.disabled=false}return}
      if(e.target.id==='testCorreoBtn'){try{e.target.disabled=true;e.target.textContent='Probando...';const d=await api('/api/admin/correo/status');toast(d.authOk?'Credenciales de Correo válidas':d.message,d.authOk?'success':'error');await renderSettings()}catch(err){toast(err.message,'error');e.target.disabled=false;e.target.textContent='Probar credenciales ahora'}return}
      if(e.target.id==='uploadFlyersBtn'){const form=qs('#flyerUploadForm');const fd=new FormData(form);const files=[...(form.elements.files?.files||[])];if(!files.length){toast('Elegí al menos un archivo.','error');return}const up=new FormData();up.append('title',fd.get('title')||'');up.append('public',fd.get('public')?'1':'0');files.forEach(file=>up.append('files',file));try{e.target.disabled=true;await api('/api/admin/flyers',{method:'POST',body:up});toast('Flyer/s subido/s','success');qs('#flyerUploadDialog')?.close();await renderFlyers()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      const ec=e.target.closest('[data-edit-coupon]');if(ec){state.editingCouponId=Number(ec.dataset.editCoupon);const c=state.coupons.find(x=>Number(x.id)===state.editingCouponId);renderCouponEditor(c||null);qs('#couponForm')?.scrollIntoView({behavior:'smooth',block:'start'});return}
      const dc=e.target.closest('[data-delete-coupon]');if(dc){if(confirm('¿Eliminar este cupón?')){await api(`/api/admin/coupons/${dc.dataset.deleteCoupon}`,{method:'DELETE'});if(Number(state.editingCouponId)===Number(dc.dataset.deleteCoupon))state.editingCouponId=null;toast('Cupón eliminado','success');await renderCoupons()}return}
      if(e.target.id==='saveCouponBtn'){try{e.target.disabled=true;await saveCouponFromForm()}catch(err){toast(err.message,'error');e.target.disabled=false}return}
      if(e.target.id==='cancelCouponEditBtn'){state.editingCouponId=null;renderCouponEditor(null);return}
            const rr=e.target.closest('[data-report-range]');if(rr){if(state.view==='purchases')state.purchaseReportRange=rr.dataset.reportRange;else state.reportRange=rr.dataset.reportRange;if(state.view==='dashboard'){await renderDashboard();if(rr.dataset.reportRange==='custom')qs('.report-date-popover').open=true;}else if(state.view==='expenses'){await renderExpenses();if(rr.dataset.reportRange==='custom')qs('.report-date-popover').open=true;}else if(state.view==='purchases'){await renderPurchases();if(rr.dataset.reportRange==='custom')qs('.purchase-date-popover').open=true;}return}
      if(e.target.id==='applyReportDates'){state.customFrom=qs('#reportFrom')?.value||'';state.customTo=qs('#reportTo')?.value||'';if(state.view==='dashboard')await renderDashboard();else if(state.view==='purchases')await renderPurchases();else await renderExpenses();return}
      const sf=e.target.closest('[data-stock-filter]');if(sf){const wanted=sf.dataset.stockFilter||'';qsa('[data-stock-filter]').forEach(b=>b.classList.toggle('active',b===sf));qsa('[data-stock-product-card]').forEach(card=>card.classList.toggle('hidden',Boolean(wanted)&&card.dataset.stockCategory!==wanted));qs('#dashboardStockGallery')?.scrollTo({left:0,behavior:'smooth'});return}
      const arrow=e.target.closest('[data-scroll-target]');if(arrow){const host=document.getElementById(arrow.dataset.scrollTarget);if(host)host.scrollBy({left:(Number(arrow.dataset.scrollDir)||1)*Math.max(260,host.clientWidth*.78),behavior:'smooth'});return}
      if(e.target.id==='addMovementSaleBtn'){state.movementSaleItems.push({variantId:0,quantity:1,unitPriceCents:0});renderMovementSales();return;}
      const removeSale=e.target.closest('[data-remove-sale]');if(removeSale){state.movementSaleItems.splice(Number(removeSale.dataset.removeSale),1);renderMovementSales();return;}
      if(e.target.id==='newMovementBtn'){setMovementReadOnly(false);qs('#movementExistingAttachments').innerHTML='';await ensureAdminOptionSettings();state.editingMovementId=null;state.movementOriginalOccurredAt=null;const f=qs('#movementForm');f.reset();f.elements.date.value=today();loadMovementPayment();await loadMovementSale();renderFinanceReasonSelector('');qs('#movementDialogTitle').textContent='Nuevo ingreso / egreso';qs('#movementDialog').showModal();return}
      if(e.target.id==='saveMovementBtn'){e.preventDefault();if(state.movementReadOnly)return;const form=qs('#movementForm'),f=new FormData(form);try{e.target.disabled=true;const payload=movementPayload();const editingId=state.editingMovementId,saved=await api(editingId?`/api/admin/finance/${editingId}`:'/api/admin/finance',{method:editingId?'PUT':'POST',body:JSON.stringify(payload)}),id=saved?.item?.id||editingId,files=[...(form.elements.attachments?.files||[])];state.editingMovementId=id;await rememberFinanceReason(payload.category);if(id&&files.length){const up=new FormData();files.forEach(file=>up.append('files',file));await api(`/api/admin/finance/${id}/attachments`,{method:'POST',body:up});}state.editingMovementId=null;qs('#movementDialog').close();toast(editingId?'Movimiento actualizado':'Movimiento guardado','success');await renderExpenses()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      const editReviewedMovement=e.target.closest('[data-edit-reviewed-movement]');if(editReviewedMovement){const id=Number(editReviewedMovement.dataset.editReviewedMovement),m=state.financeMovements.find(x=>Number(x.id)===id);qs('#movementReviewDialog').close();if(m?.source_kind==='purchase')await openSourcePurchase(m.source_id);else await openMovementDialog(id,false);return;}
      const openMovement=e.target.closest('[data-open-movement],[data-edit-movement]');if(openMovement){try{if(openMovement.dataset.openMovement)openMovementReview(Number(openMovement.dataset.openMovement));else await openMovementDialog(Number(openMovement.dataset.editMovement),false)}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='editViewedMovementBtn'){const m=(state.financeMovements||[]).find(x=>Number(x.id)===Number(state.viewingMovementId));if(m){if(m.source_kind==='purchase'){qs('#movementDialog').close();await openSourcePurchase(m.source_id);}else setMovementReadOnly(false);}return;}
      const sourcePurchase=e.target.closest('[data-edit-source-purchase]');if(sourcePurchase){try{await openSourcePurchase(Number(sourcePurchase.dataset.editSourcePurchase))}catch(err){toast(err.message,'error')}return;}
      const dm=e.target.closest('[data-delete-movement]');if(dm){if(confirm('¿Eliminar este movimiento de Caja y sus adjuntos? La compra y el stock, si existen, se conservan.')){await api(`/api/admin/finance/${dm.dataset.deleteMovement}`,{method:'DELETE'});await renderExpenses()}return}
      if(e.target.id==='createCouponBatchBtn'){try{const count=Number(qs('#batchCouponCount')?.value)||5,prefix=qs('#batchCouponPrefix')?.value||'SALMOS',appliesTo=qs('#batchCouponApplies')?.value||'products',discountType=qs('#batchCouponType')?.value||'percent';let value=Number(qs('#batchCouponValue')?.value)||0;if(discountType==='fixed')value=pesosToCents(value);if(discountType==='free')value=0;await api('/api/admin/coupons/batch',{method:'POST',body:JSON.stringify({count,prefix,appliesTo,discountType,value,minSubtotalCents:0,active:true})});toast(`${count} cupones creados`,'success');await renderCoupons()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='toggleBulkPriceBtn'){qs('#bulkPricePanel')?.classList.toggle('hidden');return}
      if(e.target.id==='closeBulkPriceBtn'){qs('#bulkPricePanel')?.classList.add('hidden');return}
      if(e.target.id==='applyBulkPriceBtn'){const value=Number(qs('#bulkValue')?.value)||0;if(!value){toast('Ingresá un valor.','error');return}const ids=state.selectedProductIds?[...state.selectedProductIds]:qsa('[data-bulk-product]:checked').map(x=>Number(x.dataset.bulkProduct));if(!confirm(`¿Aplicar este cambio a ${ids.length?ids.length+' producto(s) marcados':'los productos del filtro'}?`))return;try{const d=await api('/api/admin/products/bulk-price',{method:'POST',body:JSON.stringify({ids,categoryId:ids.length?null:(qs('#bulkCategory')?.value||null),minPriceCents:ids.length?null:(qs('#bulkMinPrice')?.value?pesosToCents(qs('#bulkMinPrice').value):null),maxPriceCents:ids.length?null:(qs('#bulkMaxPrice')?.value?pesosToCents(qs('#bulkMaxPrice').value):null),direction:qs('#bulkDirection')?.value,mode:qs('#bulkMode')?.value,value,roundToPesos:Number(qs('#bulkRound')?.value)||100})});toast(`${d.count} precios actualizados`,'success');await renderProducts()}catch(err){toast(err.message,'error')}return}
      const saveCustom=e.target.closest('[data-save-custom]');if(saveCustom){const card=saveCustom.closest('[data-custom-order]');try{await api(`/api/admin/custom-orders/${saveCustom.dataset.saveCustom}`,{method:'PATCH',body:JSON.stringify({quotedTotalCents:pesosToCents(qs('[data-custom-total]',card)?.value),status:qs('[data-custom-status]',card)?.value})});toast('Pedido actualizado','success');await renderCustomOrders()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='addShippingRuleBtn'){try{const name=qs('#shippingRuleName')?.value.trim(),matchText=qs('#shippingRuleMatch')?.value.trim(),adjustmentCents=pesosToCents(qs('#shippingRuleAdjustment')?.value);await api('/api/admin/shipping/rules',{method:'POST',body:JSON.stringify({name,matchText,adjustmentCents,active:true})});toast('Regla agregada','success');await renderSettings()}catch(err){toast(err.message,'error')}return}
      const dsr=e.target.closest('[data-delete-shipping-rule]');if(dsr){if(confirm('¿Eliminar esta regla de envío?')){await api(`/api/admin/shipping/rules/${dsr.dataset.deleteShippingRule}`,{method:'DELETE'});await renderSettings();toast('Regla eliminada','success')}return}
      if(e.target.id==='saveSettingsBtn'){e.preventDefault();try{await saveSettings()}catch(err){toast(err.message,'error')}return}
    });
    document.addEventListener('pointerdown',e=>{
      closePurchaseFeatureLists(e.target);
      const canvas=e.target.closest?.('[data-sheet-canvas]');if(!canvas||state.sheetMeasureBusy||state.designUploadBusy||sheetHasPendingUpload(canvas.dataset.sheetCanvas)||e.button!==0)return;const problem=sheetMeasurementProblem(canvas.dataset.sheetCanvas);if(problem){toast(problem,'error');return;}
      if(e.target.closest('[data-sheet-pin]'))return;
      if(state.sheetRepeatTarget?.key===canvas.dataset.sheetCanvas){e.preventDefault();try{addRepeatedSheetBox(state.sheetRepeatTarget.key,state.sheetRepeatTarget.index,sheetBoxCoordinate(canvas,e));}catch(err){toast(err.message,'error');}return;}
      const active=e.target.closest('[data-sheet-move]'),edge=e.target.closest('[data-sheet-resize]');
      if(active){
        const rowIndex=Number(active.dataset.sheetRow),boxIndex=Number(active.dataset.sheetIndex),key=active.dataset.sheetKey;
        const box=state.designSheetDrafts[key]?.[rowIndex]?.previewBoxes?.[boxIndex];if(!box)return;
        e.preventDefault();e.stopPropagation();state.sheetResizeDrag={canvas,element:active,pin:canvas.querySelector(`[data-sheet-pin="${rowIndex}"][data-pin-index="${boxIndex}"]`),key,rowIndex,boxIndex,start:sheetBoxCoordinate(canvas,e),original:{...box},box:{...box},edge:edge?.dataset.sheetResize||'move'};
        canvas.setPointerCapture?.(e.pointerId);return;
      }
      if(state.sheetBoxTarget?.key!==canvas.dataset.sheetCanvas)return;
      e.preventDefault();const point=sheetBoxCoordinate(canvas,e),overlay=document.createElement('div');overlay.className='sheet-box-draft';canvas.appendChild(overlay);
      state.sheetDrawStart={canvas,point,overlay,index:state.sheetBoxTarget.index,key:canvas.dataset.sheetCanvas};canvas.setPointerCapture?.(e.pointerId);
    });
    document.addEventListener('pointermove',e=>{
      const resize=state.sheetResizeDrag;
      if(resize){
        const point=sheetBoxCoordinate(resize.canvas,e),dx=point.x-resize.start.x,dy=point.y-resize.start.y,old=resize.original,edge=resize.edge;
        let x=old.x,y=old.y,right=old.x+old.width,bottom=old.y+old.height;
        if(edge==='move'){x=Math.max(0,Math.min(1-old.width,x+dx));y=Math.max(0,Math.min(1-old.height,y+dy));right=x+old.width;bottom=y+old.height}
        else{if(edge.includes('w'))x=Math.max(0,Math.min(right-.005,x+dx));if(edge.includes('e'))right=Math.min(1,Math.max(x+.005,right+dx));if(edge.includes('n'))y=Math.max(0,Math.min(bottom-.005,y+dy));if(edge.includes('s'))bottom=Math.min(1,Math.max(y+.005,bottom+dy))}
        const box={x,y,width:right-x,height:bottom-y,rotation:old.rotation||0};resize.box=box;
        Object.assign(resize.element.style,{left:x*100+'%',top:y*100+'%',width:box.width*100+'%',height:box.height*100+'%'});
        if(resize.pin)Object.assign(resize.pin.style,{left:(x+box.width/2)*100+'%',top:(y+box.height/2)*100+'%'});
        return;
      }
      const drag=state.sheetDrawStart;if(!drag)return;const point=sheetBoxCoordinate(drag.canvas,e),box={x:Math.min(drag.point.x,point.x),y:Math.min(drag.point.y,point.y),width:Math.abs(drag.point.x-point.x),height:Math.abs(drag.point.y-point.y)};
      Object.assign(drag.overlay.style,{left:box.x*100+'%',top:box.y*100+'%',width:box.width*100+'%',height:box.height*100+'%'});
    });
    document.addEventListener('pointerup',e=>{
      const resize=state.sheetResizeDrag;
      if(resize){state.sheetResizeDrag=null;try{resizeSheetBox(resize.key,resize.rowIndex,resize.boxIndex,resize.box)}catch(err){renderSheetPreview(resize.key);toast(err.message,'error')}return}
      const drag=state.sheetDrawStart;if(!drag)return;state.sheetDrawStart=null;drag.overlay.remove();const point=sheetBoxCoordinate(drag.canvas,e),box={x:Math.min(drag.point.x,point.x),y:Math.min(drag.point.y,point.y),width:Math.abs(drag.point.x-point.x),height:Math.abs(drag.point.y-point.y)};
      if(box.width<.005||box.height<.005){toast('Arrastrá desde una esquina hasta la opuesta para medir el diseño.','error');return;}
      try{applySheetBox(drag.index,box,drag.key)}catch(err){toast(err.message,'error')}
    });
    document.addEventListener('pointercancel',()=>{state.sheetDrawStart?.overlay?.remove();state.sheetDrawStart=null;const resize=state.sheetResizeDrag;state.sheetResizeDrag=null;if(resize)renderSheetPreview(resize.key)});
    document.addEventListener('wheel',e=>{
      const viewport=e.target.closest?.('.sheet-preview-viewport');if(!viewport||!e.ctrlKey)return;
      e.preventDefault();const canvas=qs('[data-sheet-canvas]',viewport),old=state.sheetZoom||1,next=Math.max(1,Math.min(5,Math.round((old*(e.deltaY<0?1.12:1/1.12))*100)/100));if(!canvas||next===old)return;
      const before=canvas.getBoundingClientRect(),x=(e.clientX-before.left)/before.width,y=(e.clientY-before.top)/before.height;
      state.sheetZoom=next;fitSheetPreview(canvas);const after=canvas.getBoundingClientRect();viewport.scrollLeft+=after.left+x*after.width-e.clientX;viewport.scrollTop+=after.top+y*after.height-e.clientY;
      const tools=viewport.previousElementSibling,label=tools?.querySelector('span'),slider=tools?.querySelector('[data-sheet-zoom]');if(label)label.textContent=`Zoom ${Math.round(next*100)}%`;if(slider)slider.value=String(next);
    },{passive:false});
    document.addEventListener('input',e=>{if(e.target.matches('[data-stock-level]')){rememberStockLevels(e.target.closest('[data-stock-level-row]'));return;}if(['productionMeasureWidth','productionMeasureHeight'].includes(e.target.id)){updateProductionMeasureSuggestion();return;}if(e.target.id==='productionMeasureCost'){state.productionMeasureCostDirty=true;return;}if(e.target.id==='productionProductName'){syncProductionSaleTitle();return;}if(e.target.matches('[data-surface-field]')){updateMockupSurface(e.target);return;}if(e.target.matches('[data-missing-sheet-name]')){rememberMissingSheetFields(e.target.closest('[data-sheet-editor]').dataset.sheetEditor);return;}if(e.target.matches('[data-mockup-rotation]')){if(e.target.value!=='')setMockupRotation(e.target.dataset.mockupRotation,e.target.value);return;}if(e.target.matches('[data-sheet-search]'))filterSheetGallery(e.target.closest('[data-sheet-editor]').dataset.sheetEditor);if(e.target.matches('[data-promo-field],[data-promo-preview],[data-promo-requirement-quantity]')){const row=e.target.closest('[data-promotion-row]');if(row)renderPromotionPreview(row)}if(e.target.matches('#designUploadWidth,#designUploadHeight')){(state.sheetSizeManual??={}).upload=true;updateDrawnSheetSizes();updateSheetMetrics('upload');state.sheetCompositionConfirmation=null;if(qs('#designSheetCompositionComplete'))qs('#designSheetCompositionComplete').checked=false;}if(e.target.matches('#designUploadCost,[data-design-cost]'))updateSheetMetrics(e.target.closest('#designUploadDialog')?'upload':'detail');if(e.target.matches('[data-design-width],[data-design-height]')){updateDrawnSheetSizes('detail');updateSheetMetrics('detail');}if(e.target.matches('[data-sheet-zoom]')){state.sheetZoom=Number(e.target.value)||1;const canvas=qs(`[data-sheet-canvas="${e.target.closest('[data-sheet-editor]')?.dataset.sheetEditor||'upload'}"]`);if(canvas)fitSheetPreview(canvas);const label=qs('.sheet-preview-tools span',e.target.closest('[data-sheet-editor]'));if(label)label.textContent=`Zoom ${Math.round(state.sheetZoom*100)}%`;}if(e.target.closest?.('#productForm')&&(e.target.matches('[data-v="color"],[data-v="size"],#productRecipeWaste,#productRecipeExtra,[data-recipe-design-qty],[data-recipe-material-qty],#productForm [name="fit"]')))updateProductCostEstimate();if(['productionQuantity','productionWaste','mockupCapSalePrice'].includes(e.target.id))calcProductionBuilderCost();if(e.target.id==='productionSalePrice'){state.productionPriceDirty=true;calcProductionBuilderCost();}if(e.target.matches('[data-purchase-color-native]')){const i=Number(e.target.dataset.row),x=state.purchaseItems[i];if(x){x.color=e.target.value;x._custom??={};x._custom.color=true;const text=qs('[data-purchase-field="color"]',e.target.closest('[data-purchase-row]'));if(text)text.value=e.target.value;}}});

    document.addEventListener('dragstart',e=>{const card=e.target.closest?.('[data-design-card]');if(!card)return;if(e.target.closest?.('[data-design-select]')){e.preventDefault();return;}state.designDragId=Number(card.dataset.designCard);card.classList.add('dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(state.designDragId));}});
    document.addEventListener('dragend',e=>{e.target.closest?.('[data-design-card]')?.classList.remove('dragging');state.designDragId=null;});
    document.addEventListener('dragover',e=>{if(state.designDragId&&e.target.closest?.('[data-design-card]'))e.preventDefault();});
    document.addEventListener('drop',async e=>{const card=e.target.closest?.('[data-design-card]');if(!card||!state.designDragId)return;e.preventDefault();const id=state.designDragId;state.designDragId=null;try{await moveDesignCard(id,0,Number(card.dataset.designCard))}catch(err){toast(err.message,'error')}});
    document.addEventListener('dragstart',e=>{const row=e.target.closest?.('[data-media-key]');if(!row)return;state.mediaDragKey=row.dataset.mediaKey;row.classList.add('dragging');if(e.dataTransfer)e.dataTransfer.effectAllowed='move'});
    document.addEventListener('dragend',e=>{e.target.closest?.('[data-media-key]')?.classList.remove('dragging');state.mediaDragKey=null});
    document.addEventListener('dragover',e=>{if(e.target.closest?.('[data-media-key]'))e.preventDefault()});
    document.addEventListener('drop',e=>{const target=e.target.closest?.('[data-media-key]');if(!target||!state.mediaDragKey)return;e.preventDefault();const from=state.mediaItems.findIndex(x=>x.key===state.mediaDragKey),to=state.mediaItems.findIndex(x=>x.key===target.dataset.mediaKey);if(from<0||to<0||from===to)return;const [item]=state.mediaItems.splice(from,1);state.mediaItems.splice(to,0,item);renderMediaManager()});
    qs('#adminContent').addEventListener('input',e=>{if(e.target.id==='montagePhotoSearch'){(state.productionPhotoFilter??={search:'',category:''}).search=e.target.value;renderProductionPhotos();return;}if(e.target.id==='adminProductSearch'){state.productSearch=e.target.value;renderUnifiedProducts()}});
    qs('#adminContent').addEventListener('change',e=>{
      if(e.target.matches('[data-bulk-product]')){state.selectedProductIds??=new Set();const id=Number(e.target.dataset.bulkProduct);e.target.checked?state.selectedProductIds.add(id):state.selectedProductIds.delete(id);return;}if(e.target.matches('[data-product-publication-filter]')){state.productPublication=e.target.value;renderUnifiedProducts();return;}
      const map={stockFilterCategory:'category',stockFilterStage:'stage',stockFilterSize:'size',stockFilterColor:'color',stockFilterFit:'fit',stockFilterAudience:'audience',stockSort:'sort'};
      const key=map[e.target.id];if(!key)return;state.stockFilters[key]=e.target.value;renderStockFiltered();
    });
  }

  function syncAdminTopbarHeight(){const bar=qs('.admin-topbar');if(bar)document.documentElement.style.setProperty('--admin-topbar-height',`${bar.getBoundingClientRect().height}px`);}
  function handleSheetPurchaseInput(e){
    const key=e.target.closest('#designUploadDialog')?'upload':'detail';
    if(e.target.matches('[data-sheet-purchase-amount]')){syncSheetPurchaseAmount(key,e.target);updateSheetMetrics(key);}
    if(e.target.closest('.sheet-purchase-panel')||e.target.matches('#designUploadCost,[data-design-cost]'))syncSheetPurchasePanel(key);
    if(e.target.closest('#designUploadDialog'))scheduleSheetDraftSave();
  }
  window.addEventListener('beforeunload',persistSheetDraft);
  window.addEventListener('resize',()=>qsa('[data-sheet-canvas]').forEach(fitSheetPreview));
  document.addEventListener('input',handleSheetPurchaseInput);
  document.addEventListener('change',e=>{if(e.target.closest('#designUploadDialog'))scheduleSheetDraftSave();});
  qs('#designUploadDialog')?.addEventListener('close',persistSheetDraft);
  window.addEventListener('message',event=>{if(event.origin!==new URL(API||window.location.origin).origin||event.source!==adminSessionWindow||event.data?.type!=='salmos-admin-session')return;resumeAdminSession().catch(err=>toast(err.message,'error',6000));});
  bindActionIcons();
  bindPhotoReordering();
  initDesignVisuals();
  initTheme();initDesignBackground();bind();navigate('dashboard');syncAdminTopbarHeight();if(window.ResizeObserver)new ResizeObserver(syncAdminTopbarHeight).observe(qs('.admin-topbar'));window.addEventListener('resize',syncAdminTopbarHeight);
})();
