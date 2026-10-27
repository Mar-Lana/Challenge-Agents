# Registro de ejecución — Segundo Episodio de Delegación

## Desarrollo TDD y lógica de negocio

| Campo | Valor |
|-------|-------|
| **Proyecto** | `sistema-reservas-lab` |
| **Hito** | Segundo episodio de delegación: desarrollo TDD y lógica de negocio |
| **Fecha de registro** | 2026-10-27 |
| **Rama** | `Mar-Lana/Maria-Lana` |
| **Commit de implementación** | `826164a` — `feat(reservas): integrar persistencia y completar ciclo TDD verde` |
| **Especificación de referencia** | [`docs/sdd.md`](./sdd.md), reglas U01–U07 y RF-3 |
| **Entorno verificado** | Node.js `v24.22.1`, npm `11.19.1`, Jest `30.x` |
| **Estado** | GREEN: 15 pruebas aprobadas. Validación humana pendiente de firma. |

---

## 1. Objetivo y alcance

Implementar la lógica de negocio mínima del servicio de reservas aplicando el ciclo
TDD: primero pruebas que fallan, después el código necesario para ponerlas en verde.

El alcance de este episodio cubre:

1. Creación válida de una reserva.
2. Rechazo de superposiciones de horarios activos en la misma unidad.
3. Permiso de límites consecutivos (`fin === inicio`) y de reservas simultáneas
   en unidades distintas.
4. Validación de entradas: solicitante vacío o en blanco, fechas inválidas,
   fechas inexistentes y rangos incorrectos.
5. Integración de la persistencia síncrona de `persistence.js`
   (`cargarReservas` y `guardarReservas`) con `reservas.json`.

### Artefactos entregados

| Artefacto | Propósito |
|-----------|-----------|
| `__tests__/reserva-service.test.js` | Suite TDD del servicio de reservas. |
| `src/reserva-service.js` | Implementación mínima de validación, solapamiento y creación. |
| `persistence.js` | Carga y guardado síncrono de `reservas.json` (módulo previo reutilizado). |
| `docs/entrega-2-desarrollo-tdd.md` | Este registro formal del episodio. |

---

## 2. Fase RED — Pruebas unitarias iniciales

### 2.1. Contrato definido por las pruebas

Las pruebas se escribieron antes de la implementación y fijaron el siguiente contrato:

```js
const { crearServicioReservas } = require('../src/reserva-service');

const servicio = crearServicioReservas({
  inventario,      // [{ codigo | id, nombre }]
  reservas: [],    // modo en memoria para pruebas unitarias
  persistencia: {  // inyección opcional para pruebas de integración
    cargarReservas,
    guardarReservas,
  },
});

await servicio.crearReserva({
  unidad: 'MIC-01',
  solicitante: 'Ana Pérez',
  inicio: '2026-10-27T10:00:00.000Z',
  fin: '2026-10-27T11:00:00.000Z',
});

servicio.listarReservas();
```

Los rechazos se expresan como promesas rechazadas con mensajes alineados a la
especificación, por ejemplo:

- `Solicitante no puede estar vacío`
- `Formato de fecha/hora inválido`
- `La fecha de inicio debe ser anterior a la de fin`
- `Intervalo solapado con reserva existente`

### 2.2. Cobertura inicial de la fase RED

| ID | Caso de prueba | Resultado esperado |
|----|----------------|--------------------|
| R1 | Creación válida con ID UUID y estado `ACTIVA` | Reserva creada y listada. |
| R2 | Superposición parcial en la misma unidad | Rechazo por solapamiento. |
| R3 | Superposición total o intervalo contenido | Rechazo por solapamiento. |
| R4 | Límite consecutivo: `fin` de una reserva igual a `inicio` de otra | Permitido. |
| R5 | Reservas simultáneas en unidades distintas | Permitido. |
| R6 | Solicitante vacío, solo espacios o nulo | Rechazo de validación. |
| R7 | Fechas no parseables | Rechazo de validación. |
| R8 | Fecha inexistente (`2026-02-30`) | Rechazo de validación. |
| R9 | `inicio >= fin` | Rechazo de validación. |

Las pruebas se ejecutaron antes de crear `src/reserva-service.js`. El resultado
fue el fallo esperado de la suite:

```text
FAIL __tests__/reserva-service.test.js
  ● Test suite failed to run
    Cannot find module '../src/reserva-service'

Test Suites: 1 failed, 1 total
Tests:       0 total
Time:        6.439 s
```

Este fallo es la evidencia RED: la suite existía y describía el comportamiento,
pero la unidad bajo prueba todavía no estaba implementada.

### 2.3. Decisiones de diseño de las pruebas

- Se usa un almacén en memoria (`reservas: []`) para aislar la lógica de negocio
  del sistema de archivos.
- Las fechas se expresan en ISO 8601 UTC para evitar dependencias de zona horaria.
- Se valida el UUID con una expresión regular compatible con UUID v4.
- Las pruebas de solapamiento verifican tanto el rechazo como la no persistencia
  de reservas inválidas.
- La integración con persistencia se prueba con funciones inyectadas, sin
  escribir archivos reales durante `npm test`.

---

## 3. Fase GREEN — Implementación mínima

### 3.1. Reglas implementadas

`src/reserva-service.js` implementa las siguientes reglas de la especificación:

| Regla SDD | Implementación |
|-----------|----------------|
| U01 | La unidad debe existir en el inventario. Se acepta `codigo` o `id` porque `inventory.json` usa `id`. |
| U02 | El solicitante debe ser una cadena con contenido después de `trim()`. |
| U03 | Las fechas deben cumplir ISO 8601 y representar una fecha de calendario real. |
| U04 | `inicio` debe ser estrictamente anterior a `fin`. |
| U05 | Se rechaza toda intersección no vacía con reservas `ACTIVA` de la misma unidad. |
| U06 | `fin === inicio` es válido porque el intervalo se evalúa como `[inicio, fin)`. |
| U07 | Las reservas de unidades distintas no se comparan entre sí. |

La condición de solapamiento implementada es:

```js
!(finNuevo <= inicioExistente || inicioNuevo >= finExistente)
```

Esto permite intervalos consecutivos y rechaza cualquier intersección parcial,
total o contenida.

### 3.2. Creación y validación

```js
const fechaInicio = parseFecha(inicio);
const fechaFin = parseFecha(fin);

if (!fechaInicio || !fechaFin) {
  throw new Error('Formato de fecha/hora inválido');
}

if (fechaInicio.getTime() >= fechaFin.getTime()) {
  throw new Error('La fecha de inicio debe ser anterior a la de fin');
}

const reserva = {
  id: randomUUID(),
  unidad,
  solicitante: solicitante.trim(),
  inicio,
  fin,
  estado: 'ACTIVA',
  creado_en: new Date().toISOString(),
};
```

`parseFecha` no solo aplica una expresión regular ISO 8601: también reconstruye
la fecha con `Date.UTC` y compara año, mes, día, hora, minuto y segundo. Así se
rechaza, por ejemplo, `2026-02-30T10:00:00.000Z`, que `new Date()` normalizaría
silenciosamente al 2 de marzo.

### 3.3. Integración con `persistence.js`

El servicio importa las funciones síncronas existentes:

```js
const {
  cargarReservas: cargarReservasPorDefecto,
  guardarReservas: guardarReservasPorDefecto,
} = require('../persistence');
```

El modo de almacenamiento se selecciona de forma explícita:

```js
const usarPersistencia = !Array.isArray(reservas);
const cargarReservas =
  persistencia.cargarReservas || cargarReservasPorDefecto;
const guardarReservas =
  persistencia.guardarReservas || guardarReservasPorDefecto;
const almacen = usarPersistencia ? cargarReservas() : reservas;
```

- Si el consumidor pasa `reservas`, el servicio opera en memoria. Este es el modo
  usado por las pruebas unitarias.
- Si `reservas` se omite, el servicio carga `reservas.json` al inicializarse y
  guarda el arreglo completo después de cada creación válida.
- Si `guardarReservas` falla, la reserva recién añadida se elimina del arreglo en
  memoria antes de propagar el error, evitando una divergencia entre memoria y
  disco.

```js
almacen.push(reserva);

if (usarPersistencia) {
  try {
    guardarReservas(almacen);
  } catch (error) {
    almacen.pop();
    throw error;
  }
}
```

### 3.4. Pruebas añadidas durante la fase GREEN

Además de las 12 pruebas RED iniciales, se añadieron 3 pruebas de protección
para la integración y el inventario real:

| Prueba | Propósito |
|--------|-----------|
| Inventario con clave `id` | Evitar incompatibilidad con `inventory.json`. |
| Carga inicial y guardado tras crear | Verificar la conexión con las funciones de persistencia. |
| Rollback si falla el guardado | Garantizar consistencia entre memoria y disco. |

### 3.5. Evidencia GREEN

Comando ejecutado:

```bash
cd sistema-reservas-lab
npm test -- --runInBand
```

Resultado:

```text
> sistema-reservas-lab@1.0.0 test
> jest --runInBand

PASS __tests__/reserva-service.test.js

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        4.709 s
```

### 3.6. Prueba de humo de persistencia real

Se ejecutó un script temporal que creó el servicio sin pasar `reservas`, usando
`inventory.json` y el módulo `persistence.js`. El script comprobó que
`reservas.json` se escribiera y eliminó el archivo temporal al finalizar.

Salida:

```json
{
  "id": "dc871fce-b77e-4225-a489-c293372a0dc2",
  "estado": "ACTIVA",
  "guardadas": 1
}
```

Conclusión: la integración con `persistence.js` funciona y el flujo por defecto
persiste correctamente en `reservas.json`.

---

## 4. Trazabilidad con la especificación

| Requisito / regla | Prueba asociada | Estado |
|-------------------|-----------------|--------|
| RF-3 Crear reserva con UUID y estado `ACTIVA` | R1 | ✅ |
| U01 Unidad existente | Inventario `id` + R1 | ✅ |
| U02 Solicitante no vacío | R6 | ✅ |
| U03 Fechas ISO válidas | R7, R8 | ✅ |
| U04 `inicio < fin` | R9 | ✅ |
| U05 Sin solapamiento activo en la misma unidad | R2, R3 | ✅ |
| U06 Intervalos consecutivos permitidos | R4 | ✅ |
| U07 Unidades distintas simultáneas | R5 | ✅ |
| RF-6 Persistencia JSON | Pruebas de integración y prueba de humo | ✅ |

---

## 5. Validación humana

### 5.1. Requisitos previos

- Node.js 20 o superior.
- Dependencias instaladas:

```bash
cd sistema-reservas-lab
npm install
```

### 5.2. Ejecutar la suite

```bash
npm test -- --runInBand
```

Criterio de aceptación:

```text
Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
```

### 5.3. Verificar el historial de Git

```bash
cd sistema-reservas-lab
git status
git log --oneline -5
git show --stat 826164a
```

El commit de implementación debe mostrar:

- `__tests__/reserva-service.test.js`
- `src/reserva-service.js`

### 5.4. Verificar la persistencia manualmente

Desde `sistema-reservas-lab`, ejecutar:

```bash
node - <<'NODE'
const fs = require('fs');
const inventario = require('./inventory.json');
const { crearServicioReservas } = require('./src/reserva-service');

(async () => {
  const servicio = crearServicioReservas({ inventario });
  const reserva = await servicio.crearReserva({
    unidad: 'MIC-01',
    solicitante: 'Validación humana',
    inicio: '2026-10-28T10:00:00.000Z',
    fin: '2026-10-28T11:00:00.000Z',
  });
  console.log(reserva);
  console.log(fs.readFileSync('reservas.json', 'utf8'));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
NODE
```

Comprobar que `reservas.json` contiene la reserva con estado `ACTIVA`.
Eliminar el archivo si se desea dejar el repositorio limpio:

```bash
rm reservas.json
```

### 5.5. Checklist de aprobación humana

- [ ] La suite `npm test` termina con 15 pruebas aprobadas.
- [ ] El commit `826164a` contiene la implementación y las pruebas.
- [ ] Se revisó que `reservas.json` se crea al omitir `reservas` en el servicio.
- [ ] Se revisó que los intervalos consecutivos son aceptados.
- [ ] Se revisó que las superposiciones activas son rechazadas.
- [ ] Se revisó que las unidades distintas pueden coincidir en horario.
- [ ] Se validó que las entradas inválidas no generan reservas persistidas.

---

## 6. Registro del commit

Comando utilizado para consolidar la implementación:

```bash
git add src/reserva-service.js __tests__/reserva-service.test.js
git commit -m "feat(reservas): integrar persistencia y completar ciclo TDD verde"
```

Identificador resultante:

```text
826164a feat(reservas): integrar persistencia y completar ciclo TDD verde
```

---

## 7. Limitaciones y próximos pasos

- La persistencia sigue siendo síncrona y escribe el archivo completo. Es
  suficiente para el prototipo de un solo proceso, pero no para alta concurrencia.
- Un `reservas.json` corrupto propaga el error de parseo; la capa superior debe
  decidir si notifica o reinicia el almacenamiento.
- La suite actual es unitaria y de integración ligera. El siguiente paso es cubrir
  cancelación de reservas, consulta de disponibilidad y flujo HTTP completo.
- La validación humana debe firmarse en la sección 5.5 antes de considerar el
  hito cerrado.

---

**Fin del registro del Segundo Episodio de Delegación.**
