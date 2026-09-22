# SALMOS V23

Actualización acumulativa de la tienda y el administrador.

Leé `ACTUALIZAR_V23.txt`: esta versión requiere actualizar tanto la tienda como
el Worker. Conservá las variables, secretos y enlaces actuales de Cloudflare.
Los cambios están detallados en `CAMBIOS_V23.txt`.

No ejecutar `schema.sql` o `seed.sql` sobre la base existente.

Vía Cargo se habilita desde Configuración y se coordina con el costo separado.

Para ejecutar las comprobaciones locales, usá Node con soporte para `node:sqlite`:

```
node tests/backend.cjs
node tests/frontend.cjs
node tests/shipping.cjs
```

Las pruebas usan datos locales y transporte simulado, sin enviar correos ni
modificar la tienda publicada.
