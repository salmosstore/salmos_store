/* Copias independientes: nunca escribe en el producto de origen. */
(() => {
  'use strict';
  function prepare(source,name=`${source.name} copia`) {
    const fields=['category_id','price_cents','compare_at_cents','cost_cents','short_description','meaning_text','verse_text','verse_reference','fit','audience','sale_mode','show_all_sizes','inventory_stage','garment_ready','print_ready','capacity_ml','weight_grams','height_cm','width_cm','depth_cm','publication_variant','production_catalog'];
    const payload=Object.fromEntries(fields.filter(key=>source[key]!==undefined).map(key=>[key,structuredClone(source[key])]));
    const recipe=source.recipe||{};
    payload.name=name;payload.status='draft';payload.is_new=0;payload.is_featured=0;payload.is_bestseller=0;
    payload.variants=(source.variants||[]).filter(v=>v.active!==0).map(v=>({color:v.color||'',size:v.size||'',stock:0,stockKind:'untracked',virtualStock:100,sku:''}));
    if(!payload.variants.length)payload.variants=[{color:'',size:'',stock:0,stockKind:'untracked',virtualStock:100,sku:''}];
    payload.recipe={baseMaterialType:recipe.base_material_type||recipe.baseMaterialType||'',baseMaterialName:recipe.base_material_name||recipe.baseMaterialName||'',wastePercent:Number(recipe.waste_percent??recipe.wastePercent??10),extraCostCents:Number(recipe.extra_cost_cents??recipe.extraCostCents)||0,designs:(recipe.designs||[]).map(d=>({designAssetId:Number(d.design_asset_id??d.designAssetId),quantity:Number(d.quantity)||1,widthCm:Number(d.width_cm??d.widthCm)||0,heightCm:Number(d.height_cm??d.heightCm)||0,measureOptionId:d.measure_option_id??d.measureOptionId??'',measureLabel:d.measure_label??d.measureLabel??'',printSide:d.print_side??d.printSide??'front',printMaterialType:d.print_material_type??d.printMaterialType,unitPrintCostCents:d.unit_print_cost_cents??d.unitPrintCostCents})),materials:(recipe.materials||[]).map(m=>({materialId:Number(m.material_id??m.materialId),quantity:Number(m.quantity)||1}))};
    return payload;
  }
  function remapMount(source,mediaIds,saveToken) {
    const project=structuredClone(source),keyMap=new Map([...mediaIds].map(([before,after])=>['saved:'+before,'saved:'+after]));
    const mapId=id=>mediaIds.get(Number(id))||null;
    const mapBase=id=>Number(id)<0?-(mapId(-Number(id))||0):id;
    for(const key of Object.keys(project.views||{}))if(/^saved:\d+$/.test(key)&&mapId(key.slice(6)))keyMap.set(key,'saved:'+mapId(key.slice(6)));
    const remapLayers=layers=>{for(const layer of layers||[])if(Array.isArray(layer.bakedViewKeys))layer.bakedViewKeys=layer.bakedViewKeys.map(key=>keyMap.get(key)||key);};
    project.views=Object.fromEntries(Object.entries(project.views||{}).map(([key,view])=>{
      view.outputMediaId=mapId(view.outputMediaId);view.baseId=mapBase(view.baseId);remapLayers(view.layers);
      return [keyMap.get(key)||key,view];
    }));
    project.activeBaseId=mapBase(project.activeBaseId);project.saveToken=saveToken;
    project.legacySources=(project.legacySources||[]).filter(row=>mapId(row.mediaId)).map(row=>({...row,mediaId:mapId(row.mediaId)}));
    remapLayers(project.layers);remapLayers(project.textLayers);
    return project;
  }
  async function duplicate(source,{request,file,name}) {
    const payload=prepare(source,name),created=await request('/api/admin/products',{method:'POST',body:JSON.stringify(payload)});
    const id=Number(created?.item?.id);
    if(!id||id===Number(source.id))throw new Error('No se confirmó una copia independiente del producto.');
    try{
      const ids=new Map(),ordered=[];
      for(const image of source.images||[]){
        if(!image.url)continue;
        const mediaFile=await file(image.url,image.alt_text||source.name,image.media_type||'image');
        const form=new FormData();form.append('file',mediaFile);form.append('uploadToken',crypto.randomUUID());
        const saved=await request(`/api/admin/products/${id}/media`,{method:'POST',body:form});
        const mediaId=Number(saved.id);if(!mediaId)throw new Error('No se confirmó una imagen de la copia.');
        ids.set(Number(image.id),mediaId);ordered.push(mediaId);
        if(image.foreground_url){const foreground=await file(image.foreground_url,'vista-sin-fondo','image'),fg=new FormData();fg.append('file',foreground);fg.append('uploadToken',crypto.randomUUID());await request(`/api/admin/products/${id}/media/${mediaId}/foreground`,{method:'POST',body:fg});}
      }
      if(ordered.length)await request(`/api/admin/products/${id}/media-order`,{method:'PATCH',body:JSON.stringify({ids:ordered})});
      if(source.mount?.project){
        const saveToken=crypto.randomUUID(),mount=remapMount(source.mount.project,ids,saveToken);
        await request(`/api/admin/products/${id}/production-mount`,{method:'PATCH',body:JSON.stringify({mount,saveToken,expectedMountRevision:0,recipe:payload.recipe,product:payload,mediaIds:ordered,removeMediaIds:[]})});
      }
      return id;
    }catch(error){error.duplicateProductId=id;throw error;}
  }
  window.SalmosProductCopy={prepare,remapMount,duplicate};
})();
