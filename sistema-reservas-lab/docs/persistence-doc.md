# Persistencia local JSON de reservas

## Propósito

El módulo `persistence.js` conserva en `reservas.json` el **historial completo**
de reservas del sistema: tanto las `ACTIVA` como las `CANCELADA`. Al volver a
iniciar la aplicación, el servicio carga ese archivo y reconstruye su estado sin
perder reservas ni historial.

La persistencia es deliberadamente simple y síncrona, adecuada para el prototipo
local de un solo proceso descrito en `docs/sdd.md` (RF-6).

---

## Formato de almacenamiento

`reservas.json` contiene un arreglo JSON con todas las reservas. No se eliminan
los registros cancelados; únicamente cambia su campo `estado`.

```json
[
  {
    "id": "3f9c2b7e-6b5a-4a0e-9f60-2a7d9c1e4b11",
    "unidad": "MIC-01",
    "solicitante": "Ana Pérez",
    "inicio": "2026-10-27T10:00:00.000Z",
    "fin": "2026-10-27T11:00:00.000Z",
    "estado": "CANCELADA",
    "creado_en": "2026-10-27T01:30:00.000Z",
    "actualizado_en": "2026-10-27T01:35:00.000Z"
  },
  {
    "id": "c2d4e6f8-1a3b-4c5d-8e7f-9a0b1c2d3e4f",
    "unidad": "OSC-01",
    "solicitante": "Luis Gómez",
    "inicio": "2026-10-27T10:00:00.000Z",
    "fin": "2026-10-27T11:00:00.000Z",
    "estado": "ACTIVA",
    "creado_en": "2026-10-27T01:31:00.000Z"
  }
]
```

Una reserva cancelada conserva su identificador, solicitante, unidad, fechas y
timestamp de creación. Se añade `actualizado_en` al cancelarla.

---

## API del módulo

### `cargarReservas(rutaArchivo?)`

Lee el archivo JSON y devuelve el arreglo completo de reservas.

- Si el archivo no existe, devuelve `[]`.
- Si el JSON está corrupto o no es un arreglo, propaga el error para evitar
  perder silenciosamente el historial.
- La ruta por defecto es `sistema-reservas-lab/reservas.json`.

### `guardarReservas(reservas, rutaArchivo?)`

Serializa y guarda el arreglo completo.

- Exige que el argumento sea un arreglo.
- Escribe primero en un archivo temporal y luego lo renombra de forma atómica.
- Si falla la escritura o el renombrado, elimina el temporal y propaga el error.
- La ruta por defecto es `sistema-reservas-lab/reservas.json`.

### `crearPersistenciaJson(rutaArchivo?)`

Devuelve un adaptador ligado a una ruta concreta:

```js
const { crearPersistenciaJson } = require('./persistence');

const persistencia = crearPersistenciaJson('/ruta/a/reservas.json');
// persistencia.cargarReservas()
// persistencia.guardarReservas(reservas)
// persistencia.rutaArchivo
```

Este adaptador permite inyectar una ruta temporal en las pruebas sin tocar el
archivo real del proyecto.

---

## Integración con el servicio de reservas

El servicio usa la persistencia por defecto cuando **no** recibe el arreglo
`reservas`:

```js
const { crearServicioReservas } = require('./src/reserva-service');
const inventario = require('./inventory.json');

const servicio = crearServicioReservas({ inventario });

await servicio.crearReserva({
  unidad: 'MIC-01',
  solicitante: 'Ana Pérez',
  inicio: '2026-10-28T10:00:00.000Z',
  fin: '2026-10-28T11:00:00.000Z',
});

await servicio.cancelarReserva(idReserva);
```

Flujo de persistencia:

1. Al crear el servicio se ejecuta `cargarReservas()`.
2. Cada creación válida agrega la reserva y ejecuta `guardarReservas(almacen)`.
3. Cada cancelación cambia `estado` a `CANCELADA`, agrega `actualizado_en` y
   vuelve a guardar el arreglo completo.
4. Si el guardado falla, el servicio revierte el cambio en memoria para mantener
   coherencia entre memoria y disco.
5. Al reiniciar, un nuevo servicio carga el mismo arreglo y conserva activas,
   canceladas e historial.

### Liberación del intervalo

El algoritmo de solapamiento solo considera reservas con `estado === 'ACTIVA'`.
Por lo tanto, una reserva cancelada:

- permanece en el historial;
- ya no bloquea la unidad;
- permite crear una nueva reserva en el mismo intervalo.

---

## Pruebas

La persistencia se verifica en `__tests__/persistence-json.test.js` con archivos
temporales reales:

- guardado y recuperación de reservas activas y canceladas;
- simulación de reinicio creando un servicio nuevo desde el JSON;
- liberación del intervalo cancelado sin pérdida del registro histórico;
- cancelación idempotente;
- reversión de la cancelación si falla el guardado;
- error al cancelar una reserva inexistente;
- archivo inexistente devuelve `[]`;
- rechazo de datos que no sean un arreglo.

Comando:

```bash
cd sistema-reservas-lab
npm test -- --runInBand
```

Resultado esperado:

```text
Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
```

---

## Limitaciones

- La escritura es síncrona y reescribe el archivo completo; es suficiente para
  el prototipo de un solo proceso, no para alta concurrencia.
- El archivo es local y no está cifrado. No debe contener datos sensibles.
- Un JSON corrupto se propaga como error; la capa superior debe decidir si
  notifica, repara o restaura desde una copia.
- Para producción se recomienda migrar a SQLite o PostgreSQL manteniendo el
  mismo contrato de repositorio.
