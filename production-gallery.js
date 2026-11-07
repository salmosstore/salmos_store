(() => {
  'use strict';
  const key=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_/]+/g,' ').replace(/\s+/g,' ').trim();
  function bookVariant(value){
    const text=key(value);
    if(/\b(?:album|figuritas?)\b/.test(text))return 'album';
    if(/\b(?:colorear|coloreo)\b/.test(text))return 'colorear';
    if(/\bagendas?\b/.test(text))return 'agenda';
    if(/\b(?:animales|fauna|insectos|salvajes|domesticos)\b/.test(text))return 'animales';
    if(/\bcuadernos?\b/.test(text))return 'cuaderno';
    if(/^(?:libros?|books?)$/.test(text))return 'libro';
    return text;
  }
  function variants(asset){
    const explicit=asset.variant_label||asset.book_variant||asset.book?.kind;
    if(explicit)return String(explicit).split(/\s*·\s*|\n/).map(bookVariant).filter(Boolean);
    const inferred=bookVariant(asset.name||asset.file_name);
    return ['album','colorear','agenda','animales','cuaderno','libro'].includes(inferred)?[inferred]:[];
  }
  function isPerson(asset){return /^(?:hombre|varon|mujer|nino|nina|masculino|femenino)$/.test(key(asset.gender));}
  function compatible(asset,{type,isBookType,fit='',fitKey=key}){
    if(asset.asset_type!=='base'&&asset.asset_type!=='product')return false;
    const book=isBookType(type);
    if(book){if(!isBookType(asset.product_type)||isPerson(asset)&&!asset.source_media_id)return false;}
    else if(asset.product_type!==type)return false;
    return !fit||fitKey(asset.garment_style)===fitKey(fit);
  }
  function matches(asset,filters,{line,kind='',book=false,fitKey=key,colorKey=key}){
    if(filters.line&&line(asset)!==filters.line)return false;
    if(book&&kind&&!variants(asset).includes(bookVariant(kind)))return false;
    if(filters.cut&&fitKey(asset.garment_style)!==fitKey(filters.cut))return false;
    if(filters.color&&colorKey(asset.color)!==colorKey(filters.color))return false;
    if(filters.side&&asset.pose!==filters.side)return false;
    return true;
  }
  window.SalmosProductionGallery={key,bookVariant,variants,compatible,matches};
})();
