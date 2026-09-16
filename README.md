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
