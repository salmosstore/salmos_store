Actualización actual: `INSTRUCCIONES_25.42.txt`. El Worker vigente es `worker.js`.

# SALMOS 25.12

Actualización puntual de la tienda y el administrador: carga de diseños por
partes, respaldo local de marcas, disponibilidad por defecto en los talles,
control interno opcional, galerías junto al visor y descarga PNG de Producción
con la resolución de la foto original.

Leé `ACTUALIZAR_25_12.txt`. Actualizá el Worker con `worker.js` y los siete
archivos de la tienda allí indicados. Si aún conservás la plancha abierta,
seguí primero los pasos de `GUARDAR_PLANCHA_ABIERTA.js` para guardarla sin
recargar la pestaña.

La base existente se conserva mediante migraciones automáticas. No ejecutar
`schema.sql` ni `seed.sql` sobre ella.

Comprobaciones locales (Node 24, sin dependencias adicionales):

```
node checks/backend.cjs
node checks/frontend.cjs
```

Usan una base temporal, transporte simulado y un DOM de prueba. No envían
correos ni acceden a los datos de la tienda publicada.
