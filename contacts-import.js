// Local parsing only: the original address book file is never uploaded.
(() => {
  'use strict';
  const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function csvRows(text){
    text=String(text).replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0],delimiter=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!cell||quoted)quoted=!quoted;else cell+=c;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
    if(quoted)throw Error('El CSV tiene comillas sin cerrar.');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
  }
  function fromCSV(text){
    const rows=csvRows(text);if(!rows.length)return [];const headers=rows.shift().map(key),find=(row,names)=>{for(const n of names){const i=headers.indexOf(key(n));if(i>=0&&row[i]?.trim())return row[i].trim();}return '';};
    const phones=headers.map((h,i)=>({h,i})).filter(({h})=>/^(phone\d*(value|number)?|mobilephone|homephone|businessphone|telefono\d*|celular|phone|phonenumber|numerodetelefono)$/.test(h));
    if(!phones.length)throw Error('No encuentro la columna de teléfono. Usá el CSV de Google o columnas Nombre y Teléfono.');
    return rows.map(row=>({name:find(row,['Name','Full Name','Nombre','Nombre completo'])||[find(row,['First Name','Given Name','Nombre de pila']),find(row,['Middle Name','Additional Name']),find(row,['Last Name','Family Name','Apellido'])].filter(Boolean).join(' '),phone:phones.map(({i})=>row[i]?.trim()).find(Boolean)||'',email:find(row,['E-mail 1 - Value','Email 1 - Value','Email','Mail','Correo electrónico','E-mail Address']),address:find(row,['Address 1 - Formatted','Address 1 - Street','Street Address','Dirección','Address']),locality:find(row,['Address 1 - City','City','Localidad','Ciudad']),province:find(row,['Address 1 - Region','State','Provincia','Region']),zone:find(row,['Zona','Zone']),usual_shipping:find(row,['Envío habitual','Usual shipping'])}));
  }
  const split=(value,delimiter)=>{const parts=[];let current='';for(let i=0;i<value.length;i++){if(value[i]==='\\'&&i+1<value.length){current+=value[i]+value[++i];}else if(value[i]===delimiter){parts.push(current);current='';}else current+=value[i];}parts.push(current);return parts;};
  const unescape=value=>value.replace(/\\[nN]/g,'\n').replace(/\\([,;\\])/g,'$1');
  function quotedPrintable(value){const bytes=[];for(let i=0;i<value.length;i++){if(value[i]==='='&&/^[\da-f]{2}$/i.test(value.slice(i+1,i+3))){bytes.push(parseInt(value.slice(i+1,i+3),16));i+=2;}else bytes.push(...new TextEncoder().encode(value[i]));}return new TextDecoder().decode(new Uint8Array(bytes));}
  function fromVCF(text){
    const normalized=String(text).replace(/^\uFEFF/,'').replace(/=\r?\n/g,'').replace(/\r?\n[ \t]/g,''),contacts=[];
    for(const card of normalized.split(/BEGIN:VCARD\s*\r?\n/i).slice(1)){const record={name:'',phone:'',email:'',address:'',locality:'',province:''};let parts=[],phones=[];
      for(const line of card.split(/\r?\n/)){const colon=line.indexOf(':');if(colon<0)continue;const descriptor=line.slice(0,colon),type=descriptor.split(';')[0].split('.').pop().toUpperCase();let value=line.slice(colon+1);if(/ENCODING=QUOTED-PRINTABLE/i.test(descriptor))value=quotedPrintable(value);
        if(type==='FN')record.name=unescape(value);if(type==='N')parts=split(value,';').map(unescape);if(type==='TEL'){value=unescape(value).replace(/^tel:/i,'');phones.push({value,cell:/CELL/i.test(descriptor)});}if(type==='EMAIL'&&!record.email)record.email=unescape(value);if(type==='ADR'&&!record.address){const address=split(value,';').map(unescape);record.address=address.slice(0,3).filter(Boolean).join(' ');record.locality=address[3]||'';record.province=address[4]||'';}}
      record.name=record.name||[parts[1],parts[2],parts[0]].filter(Boolean).join(' ');record.phone=(phones.find(p=>p.cell)||phones[0])?.value||'';contacts.push(record);
    }
    if(!contacts.length)throw Error('No encuentro contactos dentro del archivo VCF.');return contacts;
  }
  function parse(text,name){if(/\.vcf$/i.test(name)||/BEGIN:VCARD/i.test(String(text).slice(0,100)))return fromVCF(text);if(!/\.csv$/i.test(name))throw Error('Elegí un archivo CSV o VCF.');return fromCSV(text);}
  window.SalmosContacts={parse};
})();
