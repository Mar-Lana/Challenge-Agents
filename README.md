# Sistema de Reservas de Laboratorio (`sistema-reservas-lab`)

> Documentación técnica alineada con el código, las pruebas y la estructura real del repositorio.
> Rama de trabajo: `Mar-Lana/Maria-Lana`.

---

## 1. Especificación breve

### 1.1 Problema

Un laboratorio dispone de varias unidades de equipo (microscopios, osciloscopios, multímetros, fuentes de alimentación, etc.) que deben compartirse entre distintos usuarios. Sin un registro centralizado es fácil duplicar reservas, perder el historial de cancelaciones y desconocer qué unidad está ocupada en un intervalo concreto.

El proyecto implementa el **núcleo de dominio** de un sistema de reservas: valida las solicitudes, impide solapamientos sobre una misma unidad y conserva el historial completo en un archivo JSON para que sobreviva al reinicio del proceso.

### 1.2 Alcance

| Incluido | No incluido (por ahora) |
|---|---|
| Servicio de reservas en Node.js (CommonJS). | Interfaz de línea de comandos (CLI). |
| Creación de reservas con validación y UUID v4. | API REST / HTTP. |
| Cancelación lógica (estado `CANCELADA`) idempotente. | Interfaz web o aplicación móvil. |
| Listado de reservas con filtro por estado. | Autenticación y autorización de usuarios. |
| Persistencia local en `reservas.json` con escritura atómica. | Base de datos relacional (SQLite/PostgreSQL). |
| Pruebas unitarias y de persistencia con Jest. | Consulta de disponibilidad como operación independiente. |
| Especificación y registros de delegación en `docs/`. | Modificación del inventario desde la aplicación. |

El inventario es **estático**: se lee desde `inventory.json` y no se modifica en tiempo de ejecución.

### 1.3 Requisitos verificables

| ID | Requisito | Verificación en el proyecto | Estado |
|----|-----------|-----------------------------|--------|
| R1 | Crear una reserva válida con ID UUID v4 y estado `ACTIVA`. | `__tests__/reserva-service.test.js`: prueba «crear reserva válida». | Cumple |
| R2 | Rechazar solapamientos parciales, totales o contenidos sobre una reserva `ACTIVA` de la misma unidad. | Bloque «Reglas de solapamiento». | Cumple |
| R3 | Permitir intervalos consecutivos (`fin` de una reserva igual a `inicio` de otra) y reservas simultáneas en unidades distintas. | Dos pruebas del bloque de solapamiento. | Cumple |
| R4 | Rechazar solicitante vacío, en blanco o nulo; fechas inválidas o inexistentes; e `inicio >= fin`. | Bloque «Validación de entradas». | Cumple |
| R5 | Cancelar una reserva sin borrar su historial y liberar el intervalo. | `__tests__/persistence-json.test.js`: «libera el intervalo cancelado sin perder el registro histórico». | Cumple |
| R6 | La cancelación es idempotente y no duplica registros. | Prueba «la cancelación es idempotente y no duplica el historial». | Cumple |
| R7 | Persistir activas y canceladas y recuperarlas tras reiniciar el servicio. | Prueba «guarda reservas activas y canceladas y las recupera al reiniciar». | Cumple |
| R8 | Mantener coherencia memoria/disco si falla el guardado (rollback). | Pruebas de reversión en creación y cancelación. | Cumple |
| R9 | Ejecutar toda la suite con `npm test`. | 2 suites, 22 pruebas aprobadas. | Cumple |

> **Nota de trazabilidad:** `docs/desarrollo-tdd.md` registra 15 pruebas porque documenta el cierre del segundo episodio de delegación. La suite actual suma **22 pruebas** (16 del servicio + 6 de persistencia) tras incorporar el tercer episodio.

### 1.4 Reglas de negocio implementadas

Las reglas coinciden con las definidas en `docs/sdd.md` (U01–U07):

| Regla | Comportamiento real |
|-------|---------------------|
| **U01 – Unidad existente** | La unidad debe figurar en el inventario. El servicio acepta tanto `codigo` como `id`, porque `inventory.json` usa la clave `id`. Error: `Unidad desconocida`. |
| **U02 – Solicitante** | Debe ser una cadena con contenido tras `trim()`. Se rechazan `""`, `"   "` y `null`. Error: `Solicitante no puede estar vacío`. |
| **U03 – Fechas ISO 8601** | Se exige el formato `YYYY-MM-DDTHH:mm:ss[.mmm](Z\|±HH:MM)` y que la fecha de calendario exista. `2026-02-30` se rechaza. Error: `Formato de fecha/hora inválido`. |
| **U04 – Orden del intervalo** | `inicio` debe ser estrictamente anterior a `fin`. Una reserva de duración cero se rechaza. |
| **U05 – Sin solapamiento** | Se compara solo contra reservas `ACTIVA` de la **misma unidad**. Fórmula aplicada: `!(finNuevo <= inicioExistente \|\| inicioNuevo >= finExistente)`. Error: `Intervalo solapado con reserva existente`. |
| **U06 – Intervalos consecutivos** | Se permiten porque el intervalo se trata como semiabierto `[inicio, fin)`. |
| **U07 – Unidades distintas** | Pueden coincidir en el mismo intervalo sin restricción. |
| **Cancelación** | No elimina el registro: cambia `estado` a `CANCELADA` y añade `actualizado_en`. Una reserva cancelada ya no bloquea la unidad. |

### 1.5 Supuestos

1. El proceso se ejecuta en un único proceso Node.js; no hay escritores concurrentes sobre `reservas.json`.
2. `inventory.json` existe y contiene un arreglo de unidades con `id` (o `codigo`) y `nombre`/`name`.
3. Las fechas se expresan en ISO 8601 con zona horaria explícita (`Z` o desplazamiento). El servicio no convierte zonas horarias.
4. El consumidor construye los objetos de entrada; no hay validación de interfaz gráfica.
5. Los datos del solicitante son ficticios y no sensibles.
6. El reloj del sistema es confiable para las marcas `creado_en` y `actualizado_en`.

---

## 2. Solución

### 2.1 Estructura real del proyecto

El `README.md` está en la raíz del repositorio; el proyecto ejecutable vive en `sistema-reservas-lab/`.

```
Maria-Lana/                          # raíz del repositorio
├── README.md                        # este documento
├── .gitignore
└── sistema-reservas-lab/            # proyecto Node.js
    ├── __tests__/
    │   ├── reserva-service.test.js  # 16 pruebas del dominio
    │   └── persistence-json.test.js # 6 pruebas de persistencia
    ├── docs/
    │   ├── sdd.md                   # especificación técnica (SDD)
    │   ├── desarrollo-tdd.md        # registro del episodio TDD
    │   └── persistence-doc.md       # contrato del módulo de persistencia
    ├── src/
    │   └── reserva-service.js       # servicio de dominio
    ├── persistence.js               # adaptador de almacenamiento JSON
    ├── inventory.json               # inventario estático de unidades
    ├── reservas.json                # almacén persistente de reservas
    ├── package.json
    └── package-lock.json
```

Archivos generados y no versionados (ver `.gitignore`): `node_modules/`, `coverage/` y archivos temporales de escritura.

### 2.2 Componentes y responsabilidades

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/reserva-service.js` | Fábrica `crearServicioReservas`: validación, solapamientos, creación, cancelación y listado. Exporta también `parseFecha`. |
| `persistence.js` | `reservasFile`, `cargarReservas`, `guardarReservas` y `crearPersistenciaJson`. Escritura atómica mediante archivo temporal + `rename`. |
| `inventory.json` | Inventario estático con 5 unidades: `MIC-01`, `MIC-02`, `OSC-01`, `MUL-01`, `FUE-01`. |
| `reservas.json` | Arreglo JSON con el historial de reservas activas y canceladas. |
| `__tests__/reserva-service.test.js` | Pruebas unitarias del dominio y de la persistencia inyectada. |
| `__tests__/persistence-json.test.js` | Pruebas de integración con archivos JSON reales en directorios temporales. |
| `docs/sdd.md` | Especificación técnica, requisitos RF-1 a RF-6 y reglas U01–U07. |
| `docs/desarrollo-tdd.md` | Evidencia del ciclo RED–GREEN y validación humana del segundo episodio. |
| `docs/persistence-doc.md` | Formato del archivo, API del módulo y flujo de persistencia. |

### 2.3 Contrato público del servicio

```js
const { crearServicioReservas, parseFecha } = require('./src/reserva-service');
```

```js
const servicio = crearServicioReservas({
  inventario,          // obligatorio: [{ id | codigo, name | nombre }]
  reservas,            // opcional: arreglo en memoria (modo pruebas)
  persistencia,        // opcional: { cargarReservas, guardarReservas }
});

await servicio.crearReserva({ unidad, solicitante, inicio, fin });
await servicio.cancelarReserva(id);
servicio.listarReservas({ estado }); // 'ACTIVA' | 'CANCELADA' | undefined
```

| Operación | Entrada | Salida | Errores |
|-----------|---------|--------|---------|
| `crearReserva(datos)` | `{ unidad, solicitante, inicio, fin }` | `Promise<Reserva>` con `estado: 'ACTIVA'` | `Unidad desconocida`, `Solicitante no puede estar vacío`, `Formato de fecha/hora inválido`, `La fecha de inicio debe ser anterior a la de fin`, `Intervalo solapado con reserva existente` |
| `cancelarReserva(id)` | `id` UUID | `Promise<Reserva>` con `estado: 'CANCELADA'` | `Reserva no encontrada` |
| `listarReservas(filtro)` | `{ estado? }` | `Reserva[]` (copia defensiva) | — |

**Modo de almacenamiento:** si se pasa `reservas` como arreglo, el servicio opera en memoria. Si se omite, carga `reservas.json` al construirse y guarda el arreglo completo tras cada cambio. La persistencia es inyectable para pruebas.

### 2.4 Modelo de datos

Una reserva persistida tiene esta forma:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID v4 | Generado con `randomUUID()` de `node:crypto`. |
| `unidad` | string | Código o ID de la unidad del inventario. |
| `solicitante` | string | Texto no vacío, almacenado con `trim()`. |
| `inicio` | string ISO 8601 | Inicio del intervalo, tal como lo envió el cliente. |
| `fin` | string ISO 8601 | Fin del intervalo, tal como lo envió el cliente. |
| `estado` | `"ACTIVA"` \| `"CANCELADA"` | Estado actual. |
| `creado_en` | string ISO 8601 | Marca de creación generada por el servicio. |
| `actualizado_en` | string ISO 8601 (opcional) | Solo aparece tras la primera cancelación. |

### 2.5 Decisiones técnicas

| Tema | Decisión real | Justificación |
|------|---------------|---------------|
| **Lenguaje y módulos** | Node.js con CommonJS (`require` / `module.exports`). | Simplicidad, compatibilidad con Jest y ejecución directa sin transpilación. |
| **Dependencias** | Solo `jest` como `devDependency`. El runtime usa módulos nativos (`node:crypto`, `fs`, `path`). | Evita dependencias externas y mantiene el prototipo ligero y portable. |
| **Identificadores** | `randomUUID()` de `node:crypto`. | UUID v4 sin paquetes adicionales. |
| **Pruebas** | Jest 30 (`npm test`). | Framework ya configurado en `package.json`, con ejecución de suites y soporte de mocks. |
| **Persistencia** | `fs.readFileSync` / `fs.writeFileSync` y `renameSync` sobre `reservas.json`. | Implementación síncrona sencilla para un único proceso. |
| **Escritura atómica** | Se escribe en `<archivo>.<pid>.<timestamp>.tmp` y se renombra. | Evita dejar el JSON truncado si el proceso falla a mitad de escritura. |
| **Cancelación** | Borrado lógico: se conserva el registro y se cambia `estado`. | Mantiene historial y permite reutilizar el intervalo. |
| **Inyección de dependencias** | El servicio acepta `reservas` o `persistencia` inyectables. | Permite probar el dominio sin tocar el disco y aislar la infraestructura. |
| **Inventario** | Estático en `inventory.json`; se acepta `id` o `codigo`. | Refleja el archivo real y evita acoplar el dominio a una sola clave. |

### 2.6 Instalación

Requisitos: Node.js 18 o superior (verificado con Node.js `v24.22.1`) y npm (verificado con `11.19.1`).

```bash
git clone <url-del-repositorio>
cd Maria-Lana/sistema-reservas-lab

# Instala Jest y las dependencias de desarrollo
npm install
```

No se requieren variables de entorno ni servicios externos.

### 2.7 Ejecución de pruebas

```bash
cd sistema-reservas-lab
npm test
```

Para ejecutar de forma secuencial y ver el detalle:

```bash
npm test -- --runInBand
```

Salida esperada al día de esta documentación:

```text
Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        ~4 s
```

Para generar un informe de cobertura (no hay umbral configurado en el proyecto):

```bash
npx jest --coverage
```

### 2.8 Ejemplos de entrada y salida

El proyecto **no expone una CLI**. El uso real es programático, desde un script Node.js dentro de `sistema-reservas-lab/`:

```js
// ejemplo.js
const inventario = require('./inventory.json');
const { crearServicioReservas } = require('./src/reserva-service');

(async () => {
  const servicio = crearServicioReservas({ inventario });

  const reserva = await servicio.crearReserva({
    unidad: 'MIC-01',
    solicitante: 'Ana Pérez',
    inicio: '2026-10-28T10:00:00.000Z',
    fin: '2026-10-28T11:00:00.000Z',
  });

  console.log(reserva);
  console.log(servicio.listarReservas({ estado: 'ACTIVA' }));
})();
```

**Salida** (valores variables en `id`, `creado_en` y marcas de tiempo):

```json
{
  "id": "dc871fce-b77e-4225-a489-c293372a0dc2",
  "unidad": "MIC-01",
  "solicitante": "Ana Pérez",
  "inicio": "2026-10-28T10:00:00.000Z",
  "fin": "2026-10-28T11:00:00.000Z",
  "estado": "ACTIVA",
  "creado_en": "2026-10-27T09:15:00.000Z"
}
```

**Entrada inválida por solapamiento:**

```js
await servicio.crearReserva({
  unidad: 'MIC-01',
  solicitante: 'Luis Gómez',
  inicio: '2026-10-28T10:30:00.000Z',
  fin: '2026-10-28T11:30:00.000Z',
});
```

**Salida:**

```text
Error: Intervalo solapado con reserva existente
```

**Cancelación y recuperación del historial:**

```js
const cancelada = await servicio.cancelarReserva(reserva.id);

console.log(cancelada);
// {
//   id: "dc871fce-b77e-4225-a489-c293372a0dc2",
//   unidad: "MIC-01",
//   solicitante: "Ana Pérez",
//   inicio: "2026-10-28T10:00:00.000Z",
//   fin: "2026-10-28T11:00:00.000Z",
//   estado: "CANCELADA",
//   creado_en: "2026-10-27T09:15:00.000Z",
//   actualizado_en: "2026-10-27T09:20:00.000Z"
// }

// Tras cancelar, el intervalo queda libre para otra reserva:
const nueva = await servicio.crearReserva({
  unidad: 'MIC-01',
  solicitante: 'Luis Gómez',
  inicio: '2026-10-28T10:00:00.000Z',
  fin: '2026-10-28T11:00:00.000Z',
});
console.log(nueva.id !== reserva.id); // true
```

### 2.9 Persistencia y almacenamiento

**Ubicación:** `sistema-reservas-lab/reservas.json` (resuelta por `persistence.js` con `path.join(__dirname, 'reservas.json')`; la constante se exporta como `reservasFile`).

**Flujo de persistencia:**

1. Al crear el servicio (sin `reservas` en memoria) se ejecuta `cargarReservas()`.
2. Cada creación o cancelación válida ejecuta `guardarReservas(almacen)`, que reescribe el archivo completo de forma atómica.
3. Si el guardado falla, el servicio revierte el cambio en memoria para conservar coherencia memoria/disco.
4. Al reiniciar el proceso, un nuevo servicio carga el mismo archivo y recupera activas, canceladas e historial.

**Formato del archivo** (arreglo JSON; los registros cancelados se conservan):

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
  }
]
```

> **⚠️ Advertencia sobre el almacenamiento**
>
> - El archivo es JSON plano, local y **sin cifrar**. No debe contener datos sensibles.
> - La escritura es **síncrona y reescribe el archivo completo**; no hay bloqueo entre procesos. Es adecuada para el prototipo de un solo proceso, no para alta concurrencia.
> - Si el JSON está corrupto, `cargarReservas` **propaga el error** en lugar de devolver una lista vacía, para no perder silenciosamente el historial. La capa superior debe decidir si notifica o restaura desde una copia.
> - El archivo está versionado en Git y actualmente contiene un registro de ejemplo heredado (`RES-100`) que no cumple el modelo completo. Las pruebas no lo usan (operan con archivos temporales), pero se recomienda vaciarlo a `[]` antes de usar el servicio con persistencia por defecto.
> - Para producción, migrar a SQLite o PostgreSQL manteniendo el mismo contrato de repositorio.

### 2.10 Limitaciones pendientes

- No hay CLI, API REST ni interfaz web: el consumo es programático.
- La consulta de disponibilidad (RF-2 del SDD) no está expuesta como función independiente; la lógica de solapamiento solo se aplica al crear.
- No se validan reservas en el pasado (el SDD no lo exige, pero sería deseable).
- No hay conversión ni normalización de zonas horarias: se respeta el offset enviado por el cliente.
- Persistencia síncrona de archivo completo, sin bloqueo interproceso ni mecanismo de reparación automática.
- Sin umbral de cobertura configurado en Jest ni pruebas de carga.
- El inventario no puede modificarse desde la aplicación.

---

## 3. Preparación del agente

| Aspecto | Detalle |
|---------|---------|
| **Entorno de ejecución** | Windows con Git Bash; Node.js `v24.22.1`; npm `11.19.1`; Jest `^30.5.2` (devDependency). Repositorio remoto en GitHub, rama de trabajo `Mar-Lana/Maria-Lana`. |
| **Modelo utilizado** | Agente de codificación Pi con modelo LLM de OpenAI (GPT‑4o), operando como arquitecto de software y documentador. |
| **Instrucciones recibidas** | 1) Actuar como arquitecto de software. 2) Generar el `README.md` con las cuatro secciones de la rúbrica (especificación breve, solución, preparación del agente, registro de decisiones y delegación). 3) Asegurar que la documentación coincida íntegramente con los archivos y la arquitectura reales del proyecto. |
| **Contexto proporcionado** | Árbol completo del repositorio; contenido de `src/reserva-service.js`, `persistence.js`, ambos archivos de prueba, `package.json`, `inventory.json`, `reservas.json` y los tres documentos de `docs/`; historial de commits de Git; ejecución real de `npm test -- --runInBand` (22 pruebas aprobadas). |
| **Permisos usados** | Lectura de todos los archivos del proyecto; ejecución de comandos de solo lectura (`ls`, `cat`, `git log`, `npm test`); escritura limitada a `README.md`. No se modificó código fuente ni se accedió a la red más allá de las operaciones de Git ya configuradas. |
| **Gestión de la retención del progreso** | El progreso se retiene en tres niveles: (1) **commits de Git**, que conservan cada episodio con mensajes descriptivos; (2) **documentos de `docs/`**, que registran evidencias por episodio (SDD, TDD, persistencia); (3) **este `README.md`**, que consolida el estado actual. Cualquier sesión futura debe partir de la versión versionada del repositorio, no del historial de la conversación. |

---

## 4. Registro de decisiones y delegación

### 4.1 Decisiones significativas

| Nº | Decisión | Alternativas evaluadas | Consecuencias |
|---|----------|------------------------|---------------|
| 1 | Implementar el dominio en **Node.js (CommonJS)**. | Python + pytest; TypeScript; Bash. | Ejecución sin transpilación y compatibilidad directa con Jest; sacrifica tipado estático. |
| 2 | **Jest** como único `devDependency`. | Mocha + Chai; `node:test` nativo. | Suite madura con mocks integrados; añade una dependencia de desarrollo. |
| 3 | Persistencia en **JSON plano con `fs` síncrono**. | SQLite (recomendado en el SDD para producción); CSV. | Cero dependencias de runtime y trazabilidad trivial del archivo; limita concurrencia y escalabilidad. |
| 4 | **Escritura atómica** (temporal + `rename`). | Escritura directa con `writeFileSync`. | Evita archivos truncados ante fallos; añade la gestión de temporales. |
| 5 | **Borrado lógico** en la cancelación (estado `CANCELADA`). | Eliminación física del registro. | Conserva el historial y permite auditoría; el archivo crece con el tiempo. |
| 6 | **Inyección de dependencias** (`reservas` o `persistencia`). | Uso directo del módulo `persistence` en el servicio. | Pruebas unitarias sin disco y adaptadores por ruta (`crearPersistenciaJson`); ligeramente más parámetros en la fábrica. |
| 7 | **UUID v4 con `node:crypto`**. | IDs incrementales (`RES-100`); paquete `uuid`. | Sin colisiones ni dependencias externas; los IDs no son ordenables cronológicamente. |
| 8 | Inventario **estático** aceptando `id` o `codigo`. | Validar solo `codigo`; inventario en base de datos. | Compatible con el `inventory.json` real (`id`/`name`); exige normalizar claves si cambia el formato. |

### 4.2 Crónica de los tres episodios de delegación

#### Episodio 1 — Configuración del entorno

- **Objetivo:** disponer de un workspace reproducible con Node.js, npm y Jest operativos.
- **Acciones del agente:** verificación de versiones (`node -v`, `npm -v`); creación de `package.json` con `"test": "jest"` y `jest` como `devDependency`; `npm install` y confirmación de `node_modules/`; primer commit de la especificación (`5cd2ec1` — *docs(sdd): Inicialización de Especificaciones y reglas de negocio*, seguido del `persistence.js` inicial en `e04c04c`).
- **Verificación:** ejecución de `npm test` antes de existir código de dominio; la suite no podía correr, lo que dejó preparado el terreno para el ciclo TDD.
- **Resultado:** entorno estable y documentado; especificación técnica `docs/sdd.md` con reglas U01–U07 como contrato previo al código.

#### Episodio 2 — Desarrollo TDD con ciclos RED–GREEN

- **Objetivo:** implementar la lógica de negocio escribiendo primero las pruebas.
- **Fase RED:** se creó `__tests__/reserva-service.test.js` describiendo el contrato (`crearServicioReservas`, `crearReserva`, `listarReservas`) antes de implementar nada. Evidencia registrada en `docs/desarrollo-tdd.md`:

  ```text
  FAIL __tests__/reserva-service.test.js
    ● Test suite failed to run
      Cannot find module '../src/reserva-service'
  ```

- **Fase GREEN:** implementación mínima en `src/reserva-service.js` hasta poner la suite en verde: validación U01–U04, algoritmo de solapamiento U05–U07 (`!(finNuevo <= inicioExistente || inicioNuevo >= finExistente)`), generación de UUID con `randomUUID()` y `parseFecha` con verificación de calendario real (`Date.UTC` comparado componente a componente). Commit de consolidación: `826164a` — *feat(reservas): integrar persistencia y completar ciclo TDD verde*.
- **Pruebas añadidas durante GREEN:** compatibilidad con el inventario real (clave `id`), carga inicial/guardado tras crear y rollback si falla el guardado.
- **Refactor:** extracción de validaciones a funciones puras y rollback en memoria (`almacen.pop()` / restauración del índice) cuando `guardarReservas` lanza error.
- **Resultado:** suite del servicio en verde con 16 pruebas actuales; registro formal y checklist de validación humana en `docs/desarrollo-tdd.md`.

#### Episodio 3 — Pruebas de persistencia tras reinicio

- **Objetivo:** garantizar que las reservas activas y canceladas sobreviven al reinicio del proceso, sin perder el historial.
- **Acciones del agente:**
  1. Se completó `persistence.js` con `cargarReservas` (devuelve `[]` si el archivo no existe; propaga JSON corrupto), `guardarReservas` (valida arreglo, escritura atómica temporal + `rename`, limpieza del temporal en caso de fallo) y `crearPersistenciaJson` (adaptador por ruta).
  2. Se creó `__tests__/persistence-json.test.js` con directorios temporales reales (`fs.mkdtempSync` + limpieza en `afterEach`).
  3. La prueba clave simula el reinicio: crear servicio → crear y cancelar reservas → **crear un servicio nuevo desde el mismo archivo** → verificar que el historial completo se recupera con los estados correctos.
  4. Se cubrieron: liberación del intervalo cancelado, cancelación idempotente (mismo `actualizado_en`, sin duplicados), error al cancelar un ID inexistente, archivo inexistente → `[]` y rechazo de datos que no sean arreglo.
- **Commits:** `b14f2c8` — *feat(persistencia): conservar historial de reservas activas y canceladas*; `6de3a0f` — *feat(persistence): implement JSON persistence and restart verification tests*. Documentación en `docs/persistence-doc.md`.
- **Verificación final (ejecución real):**

  ```text
  Test Suites: 2 passed, 2 total
  Tests:       22 passed, 22 total
  ```

- **Resultado:** el requisito de persistencia (RF-6 / R7) queda cubierto por pruebas automatizadas, y el registro `docs/persistence-doc.md` describe el contrato para futuras migraciones (SQLite/PostgreSQL) sin cambiar el dominio.

---

*Documentación generada y verificada contra el estado real del repositorio (rama `Mar-Lana/Maria-Lana`, commit `6de3a0f`).*