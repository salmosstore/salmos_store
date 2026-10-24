(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SalmosReelsCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,Number(n)||0));
  const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
  function uid(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();const bytes=new Uint8Array(16);if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes);else for(let i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;return [...bytes].map((v,i)=>([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join('');}
  const templates=[
    ['pencil','Lápiz SALMOS','La estampa aparece siguiendo al lápiz.'],
    ['brush','Pincel','Pasadas anchas revelan el diseño.'],
    ['wipe','Revelación','El diseño aparece de izquierda a derecha.'],
    ['before','Antes y después','Comparación de la base y el producto estampado.'],
    ['zoom','Detalle de la estampa','Acercamiento suave hacia el diseño.'],
    ['pulse','Presentación','Entrada, pausa y salida del producto.'],
    ['slide','Deslizamiento','El producto entra desde un costado.'],
    ['orbit','Movimiento suave','Desplazamiento de la foto sobre el fondo.'],
    ['spotlight','Luz y detalle','Un halo recorre el producto.'],
    ['polaroid','Foto de colección','Marco fotográfico con movimiento suave.'],
    ['countdown','Cuenta regresiva','3, 2, 1 y presentación del producto.'],
    ['mirror','Espejo doble','Frente y espalda con tus fotos originales.'],
    ['clean','Catálogo','Producto completo, mensaje y cierre.']
  ].map(([id,name,description])=>({id,name,description}));
  const palettes={gold:['#101112','#29251b','#e6c47a','#fff8e8'],cream:['#f6f2ea','#e9dec9','#9b702e','#241f19'],pink:['#fff0f7','#ead8e5','#a74471','#34242f'],blue:['#111b2d','#253e5b','#87cfee','#ffffff'],white:['#ffffff','#e9edef','#3d6970','#19252a'],green:['#0f2725','#234d43','#bcd6a5','#ffffff'],lilac:['#f1edf9','#d6caec','#785598','#2d2340'],red:['#2e1017','#662333','#f2c4a5','#fff4ec']};
  const niches=[
    ['fe','Fe cotidiana','Llevá un mensaje que te acompañe','una frase que conecta con lo que creés'],
    ['jovenes','Jóvenes','Tu estilo también tiene algo para decir','un diseño con identidad'],
    ['mujeres','Mujeres','Un detalle que habla de vos','una prenda para tus días'],
    ['hombres','Hombres','Simple, con carácter y propósito','un diseño que se hace presente'],
    ['familias','Familias','Mensajes que nos unen','un detalle para compartir en familia'],
    ['parejas','Parejas','Dos estilos, algo en común','un regalo con significado'],
    ['amistad','Amistad','Pensé en vos cuando vi esto','un detalle para esa amistad'],
    ['mama','Regalos para mamá','Para quien siempre está','un regalo elegido con cariño'],
    ['papa','Regalos para papá','Un detalle que lo represente','algo para acompañar sus días'],
    ['cumple','Cumpleaños','Un regalo que diga algo más','un detalle pensado para esa persona'],
    ['iglesias','Iglesias y grupos','Una identidad para compartir','una propuesta para tu grupo'],
    ['eventos','Eventos y encuentros','Un recuerdo de lo que vivimos','un producto para tu encuentro'],
    ['musica','Música y adoración','Lo que cantás también puede acompañarte','un mensaje para quienes aman la música'],
    ['deporte','Deporte','Identidad dentro y fuera de la cancha','un diseño para seguir en movimiento'],
    ['trabajo','Trabajo y equipos','Que tu equipo tenga su identidad','una propuesta para tu lugar de trabajo'],
    ['emprendimientos','Emprendimientos','Tu marca también se puede vestir','una idea para tu emprendimiento'],
    ['negocios','Comercios','Hacé visible la identidad de tu negocio','una propuesta de personalización'],
    ['docentes','Docentes','Un detalle para quien deja huella','un regalo para agradecer'],
    ['estudiantes','Estudiantes','Tu nueva etapa, tu estilo','un producto para acompañar tus días'],
    ['ninos','Infancias','Pequeños detalles, grandes sonrisas','un diseño para compartir con la familia'],
    ['minimal','Estilo minimalista','Un mensaje, sin vueltas','un diseño simple con significado'],
    ['oversize','Estilo oversize','Tu estilo en primer plano','una prenda con presencia'],
    ['tazas','Rituales y tazas','Tu pausa también puede tener un mensaje','un detalle para cada café'],
    ['personalizados','Personalización','Una idea tuya puede convertirse en algo real','un producto hecho a partir de tu idea']
  ].map(([id,name,hook,angle])=>({id,name,hook,angle}));
  const formats=[
    ['reveal','De lisa a estampada','pencil','Mostrá la base lisa, revelá el diseño y terminá con el resultado.'],
    ['detail','Un detalle que importa','zoom','Mostrá la estampa de cerca y luego el producto completo.'],
    ['gift','Idea de regalo','polaroid','Presentá el producto, contá para quién lo imaginaste y cerrá con una invitación.'],
    ['choice','Elegí tu favorito','slide','Usá dos o más escenas con variantes reales y preguntá cuál elegirían.'],
    ['meaning','Historia del diseño','clean','Contá el significado que vos le das a la estampa y mostrá sus detalles.'],
    ['faq','Respondemos una pregunta','before','Escribí una pregunta real sobre el producto y respondela con tus datos.'],
    ['process','Así lo imaginamos','brush','Mostrá una propuesta digital y su resultado. Si es una simulación, aclaralo en el texto.'],
    ['collection','Una colección para vos','pulse','Agregá varias escenas con productos relacionados y un cierre común.'],
    ['use','Para acompañar tus días','orbit','Mostrá el producto y describí una ocasión en la que lo usarías.'],
    ['intro','Conocé SALMOS','spotlight','Presentá qué hacés, qué personalizás y cómo pueden consultarte.']
  ].map(([id,name,template,story])=>({id,name,template,story}));
  function idea(niche,format,product='remera',custom=''){
    const n=niches.find(n=>n.id===niche)||{id:'custom',name:custom||'Tu público',hook:custom?`Una idea para ${custom}`:'Una idea para vos',angle:'un producto que te represente'};
    const f=formats.find(f=>f.id===format)||formats[0];
    const headline=f.id==='gift'?`Un regalo para ${n.name.toLowerCase()}`:f.id==='choice'?'¿Cuál elegirías?':f.id==='faq'?`¿Qué querés saber de este producto?`:n.hook;
    const narration=`En SALMOS creamos ${n.angle}. Mirá esta propuesta de ${product}. Consultanos por los diseños y las opciones disponibles.`;
    return {id:n.id+'-'+f.id,niche:n.name,format:f.name,headline,detail:`${product} · SALMOS`,cta:'Consultanos por WhatsApp',template:f.template,story:f.story,narration,caption:`${headline}\n\n${n.angle.charAt(0).toUpperCase()+n.angle.slice(1)}. Descubrí esta propuesta de ${product} de SALMOS.\n\nConsultanos por opciones, talles y colores disponibles.\n\n#SALMOS #Personalizados #TristanSuarez`};
  }
  function totalDuration(scenes){return scenes.reduce((sum,s)=>sum+clamp(s.duration,2,30),0);}
  function sceneAt(scenes,time){let start=0;for(let i=0;i<scenes.length;i++){const duration=clamp(scenes[i].duration,2,30);if(time<start+duration||i===scenes.length-1)return {scene:scenes[i],index:i,start,local:clamp(time-start,0,duration),progress:clamp((time-start)/duration)};start+=duration;}return null;}
  function revealProgress(progress){return ease((progress-.17)/.57);}
  function pencilPoint(progress,box,rows=18){const p=clamp(progress),amount=p*rows,row=Math.min(rows-1,Math.floor(amount)),fraction=p===1?1:amount-row;return{x:box.x+box.w*(row%2?1-fraction:fraction),y:box.y+box.h*(row+.5)/rows,row,fraction};}
  function unionBounds(layers){if(!layers.length)return{x:.28,y:.18,w:.44,h:.46};const x=Math.min(...layers.map(p=>p.x)),y=Math.min(...layers.map(p=>p.y)),r=Math.max(...layers.map(p=>p.x+p.w)),b=Math.max(...layers.map(p=>p.y+p.h));return{x:clamp(x-.015),y:clamp(y-.015),w:clamp(r-x+.03,.01,1),h:clamp(b-y+.03,.01,1)};}
  function sanitizeText(value,max=1000){return String(value??'').replace(/\u0000/g,'').slice(0,max);}
  function formatTime(seconds){seconds=Math.max(0,seconds);return Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');}
  function validateProject(data){if(!data||data.format!=='SALMOS_REELS'||data.version!==1||!Array.isArray(data.scenes)||!data.scenes.length||data.scenes.length>12||!data.audio||!palettes[data.palette]||!['9:16','4:5','1:1'].includes(data.ratio))throw new Error('Este archivo no es un proyecto válido de SALMOS Reels.');for(const s of data.scenes){if(!templates.some(t=>t.id===s.template)||!Number.isFinite(Number(s.duration))||s.duration<2||s.duration>30||!s.placement)throw new Error('Una escena tiene datos inválidos.');for(const k of ['base','stamp','final','video','background','back'])if(s[k]&&!/^data:(image\/(png|jpeg|webp|gif)|video\/(mp4|webm));base64,[a-z0-9+/=\s]+$/i.test(s[k]))throw new Error('El proyecto contiene un archivo de imagen o video no compatible.');for(const key of ['x','y','w','rotation'])if(!Number.isFinite(Number(s.placement[key])))throw new Error('Una ubicación de estampa tiene datos inválidos.');}if(data.scenes.some(s=>s.components&&(!Array.isArray(s.components)||s.components.length>30)))throw new Error('Demasiados componentes en una escena.');for(const s of data.scenes)for(const l of s.components||[]){if(!['text','print'].includes(l.kind)||!l.id)throw new Error('Componente inválido.');if(l.kind==='text'){if(typeof l.text!=='string'||l.text.length>2000||!['x','y','w','rotation'].every(k=>Number.isFinite(Number(l[k])))||l.w<=0||l.w>3)throw new Error('Cuadro de texto inválido.');delete l.render;}else if(!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(l.src||''))throw new Error('Estampa inválida.');if(l.fx&&!['none','pencil','brush','wipe','before','fade','zoom','slide','pulse'].includes(l.fx))throw new Error('Efecto de componente inválido.');} for(const key of ['music','voice'])if(data.audio[key]&&!/^data:audio\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.+-]+)?;base64,[a-z0-9+/=\s]+$/i.test(data.audio[key]))throw new Error('El proyecto contiene un audio no compatible.');if(data.logo&&!/^data:image\/(png|webp|jpeg);base64,[a-z0-9+/=\s]+$/i.test(data.logo))throw new Error('El logo no tiene un formato compatible.');return data;}
  return {uid,clamp,ease,templates,palettes,niches,formats,idea,totalDuration,sceneAt,revealProgress,pencilPoint,unionBounds,sanitizeText,formatTime,validateProject};
});
