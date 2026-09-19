# salmos_store
Tienda online oficial de SALMOS

## Correo Argentino · PAQ.AR 2.0 (TEST)

La integración está preparada para PAQ.AR API 2.0 sin exponer secretos en el frontend.

Variables del Worker:
- `CORREO_AGREEMENT` (secret)
- `CORREO_API_KEY` (secret)
- `CORREO_ENV=test` durante las pruebas; cambiar a `production` únicamente cuando Correo Argentino confirme el pase.
- `CORREO_BASE_URL` es opcional y sirve para sobrescribir la URL si Correo Argentino entrega un endpoint distinto al del manual.

Después de cargar los secretos, ir a **Administración > Configuración > Correo Argentino · PAQ.AR 2.0**, probar credenciales, completar el remitente y cargar tarifas provisorias de prueba para domicilio/sucursal. La API PAQ.AR documentada no cotiza el valor del envío; las tarifas reales se reemplazan cuando Correo entregue la matriz comercial.

Funciones incluidas: validación de credenciales, sucursales habilitadas, entrega a domicilio/sucursal, alta de preimposición, Tracking Number, rótulo PDF 10×15, seguimiento y cancelación.


## V20 · cierre profesional
- Domicilio único con Provincia / Localidad / Dirección / Código postal, mapa y cotización automática.
- Compras editables y pagos ordenados; opciones “Otro” en modal flotante.
- Producción compacta con materias primas, medidas por uso de diseños, costos y publicación.
- Administración mobile-first, PWA propia SALMOS Admin y estética rosa/floral.
- Tienda pública con textura negra/dorada sutil.
- Correo Argentino: no se simulan sucursales; /agencies depende del permiso del Agreement TEST.

## V20.1 · corrección de cierre
- Compras: grilla de pago alineada, transferencia abierta, aviso de Caja una sola vez al final.
- Selectores “Otro…”: editor modal flotante para tipo, corte, clase, talle, material, color y motivo de Caja.
- Colores: selector modal con un único swatch coherente por color, sin recortes dentro del modal de Compras.
- Producción: cabecera de campos alineada y sin huecos; explicación de disponibilidad separada.
- Caja: detalles largos plegados por defecto con “Ver detalle”.
- Tienda: cabecera y franja informativa vuelven a quedar unidas al hacer scroll.
- Envíos: motomensajería y Correo muestran la cotización automática; se quitó el botón redundante de recalcular motomensajería.
