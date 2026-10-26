# Especificación Técnica – Sistema de Reservas de Laboratorios Locales

**Versión:** 1.0  
**Fecha:** 26‑10‑2026  
**Autor:** Arquitecto de Software (ChatGPT)

---

## 1. Introducción

El presente documento describe la especificación técnica inicial del **Sistema de Reservas de Laboratorios Locales (SRLL)**. El objetivo es ofrecer un servicio sencillo y fiable que permita a los usuarios consultar la disponibilidad de laboratorios (unidades) y crear, cancelar o consultar reservas, garantizando la consistencia del inventario y la persistencia de los datos entre reinicios de la aplicación.

---

## 2. Alcance

| Funcionalidad | Descripción |
|---------------|-------------|
| **Lectura de inventario** | Cargar un archivo JSON/CSV con la lista de unidades (laboratorios) pre‑definidas. No se permite modificar el inventario desde la aplicación. |
| **Consulta de disponibilidad** | Dada una unidad y un intervalo de tiempo, indicar si está libre siguiendo las reglas de solapamiento. |
| **Creación de reserva** | Registrar una reserva con los campos: *identificador (UUID), unidad, solicitante (texto no vacío), fecha‑hora de inicio, fecha‑hora de fin*. Sólo una unidad por reserva. |
| **Cancelación de reserva** | Marcar la reserva como **cancelada** conservando su identificador y datos, liberando el intervalo. |
| **Persistencia** | Guardar todas las reservas (activas y canceladas) en almacenamiento durable (archivo JSON o base de datos SQLite) para recuperarlas al iniciar la aplicación. |
| **Validaciones** | - Unidad debe existir en el inventario. <br> - Solicitante no vacío ni solo espacios. <br> - Fechas y horas válidas (ISO 8601). <br> - Inicio < Fin. <br> - No solapamiento con reservas **activas** de la misma unidad. |
| **Reglas de solapamiento** | - Intervalos consecutivos (fin = inicio de otra) son **permitidos**. <br> - Solapamiento parcial o total con reserva activa de la misma unidad **rechazado**. <br> - Reservas de unidades distintas pueden coincidir en tiempo. |

---

## 3. Requisitos Funcionales

1. **RF‑1** – **Cargar inventario**  
   - Al iniciar, la aplicación lee `inventario.json` (o `.csv`).  
   - Cada registro contiene al menos: `codigo_unidad`, `nombre`, `descripción` (opcional).

2. **RF‑2** – **Consultar disponibilidad**  
   - Entrada: `codigo_unidad`, `fecha_hora_inicio`, `fecha_hora_fin`.  
   - Salida: `disponible: true/false` + mensaje explicativo.  
   - Usa las mismas reglas de validación que la creación de reserva.

3. **RF‑3** – **Crear reserva**  
   - Entrada: `codigo_unidad`, `solicitante`, `fecha_hora_inicio`, `fecha_hora_fin`.  
   - Proceso: validar datos → comprobar disponibilidad → generar `id_reserva` (UUID) → guardar como **activa**.  
   - Salida: `id_reserva`, estado `CREADA`, mensaje.

4. **RF‑4** – **Cancelar reserva**  
   - Entrada: `id_reserva`.  
   - Proceso: buscar reserva → marcar `estado = CANCELADA` → liberar intervalo.  
   - Salida: confirmación de cancelación.

5. **RF‑5** – **Listar reservas**  
   - Opcional (para UI/administración). Filtrado por unidad, solicitante, estado, rango de fechas.

6. **RF‑6** – **Persistencia**  
   - Todas las reservas se guardan en `reservas.db` (SQLite) o `reservas.json`.  
   - En el arranque, se carga el estado completo.

---

## 4. Requisitos No Funcionales

| Categoría | Requisitos |
|-----------|------------|
| **Rendimiento** | Operaciones de consulta/creación deben responder < 200 ms en una carga típica (< 1 000 reservas). |
| **Escalabilidad** | Diseño modular que permita migrar la capa de persistencia a PostgreSQL sin cambiar la lógica de dominio. |
| **Confiabilidad** | Persistencia transaccional (commit/rollback) para evitar pérdidas o estados intermedios. |
| **Seguridad** | - Validación estricta de entradas. <br> - No se almacena información sensible (solicitante es un texto ficticio). |
| **Mantenibilidad** | Código estructurado en capas: **Dominio**, **Aplicación**, **Infraestructura**. Tests unitarios para cada regla de negocio. |
| **Portabilidad** | Aplicación escrita en Node.js (v20) o Python 3.11, sin dependencias de sistema operativo específicas. |
| **Usabilidad** | API RESTful clara (JSON) + posible UI ligera (React/HTML). |

---

## 5. Arquitectura Propuesta

```
+-----------------------------------------------------------+
|                     Capa de Presentación                  |
|  (API REST / UI Web)  <--->  HTTP/JSON                     |
+---------------------------|-------------------------------+
                            |
+---------------------------v-------------------------------+
|                     Capa de Aplicación                    |
|  - Servicios: InventarioService, ReservaService           |
|  - Validadores: ReservaValidator, DisponibilidadValidator|
+---------------------------|-------------------------------+
                            |
+---------------------------v-------------------------------+
|                     Capa de Dominio                       |
|  - Entidades: Unidad, Reserva, Intervalo                 |
|  - Reglas de negocio (solapamiento, estado)             |
+---------------------------|-------------------------------+
                            |
+---------------------------v-------------------------------+
|                    Capa de Infraestructura                |
|  - RepositorioReserva (SQLite/JSON)                       |
|  - RepositorioInventario (lectura estática)              |
|  - Logger, Configuración                                 |
+-----------------------------------------------------------+
```

### 5.1. Componentes

| Componente | Responsabilidad |
|------------|-----------------|
| **InventarioService** | Cargar y exponer la lista de unidades. |
| **ReservaService** | Orquestar creación, cancelación, consulta y listado de reservas. |
| **ReservaValidator** | Aplicar todas las reglas de validación (campo obligatorio, solapamiento). |
| **DisponibilidadValidator** | Determinar si un intervalo está libre para una unidad. |
| **ReservaRepository** | Persistir reservas (CRUD) con transacciones. |
| **InventarioRepository** | Lectura única del archivo de inventario. |
| **API Controller** | Exponer endpoints: `GET /disponibilidad`, `POST /reservas`, `DELETE /reservas/{id}`, `GET /reservas`. |

---

## 6. Modelo de Datos

### 6.1. Entidad **Unidad**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `codigo` | string (PK) | Identificador único (ej.: `MIC-01`). |
| `nombre` | string | Nombre descriptivo. |
| `descripcion` | string (opt) | Información adicional. |

### 6.2. Entidad **Reserva**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID (PK) | Identificador único de la reserva. |
| `unidad_codigo` | string (FK) | Código de la unidad reservada. |
| `solicitante` | string | Texto no vacío. |
| `inicio` | datetime (ISO 8601) | Fecha y hora de comienzo. |
| `fin` | datetime (ISO 8601) | Fecha y hora de finalización. |
| `estado` | enum { **ACTIVA**, **CANCELADA** } | Estado actual. |
| `creado_en` | datetime | Timestamp de creación. |
| `actualizado_en` | datetime | Timestamp de última actualización. |

---

## 7. API REST (ejemplo)

| Verbo | Ruta | Descripción | Request Body | Response |
|-------|------|-------------|--------------|----------|
| `GET` | `/inventario` | Lista todas las unidades. | – | `{ unidades: [{codigo, nombre, ...}] }` |
| `GET` | `/disponibilidad?unidad=MIC-01&inicio=2026-10-27T10:00&fin=2026-10-27T11:00` | Verifica disponibilidad. | – | `{ disponible: true, mensaje: "Libre" }` |
| `POST` | `/reservas` | Crea una nueva reserva. | `{ unidad, solicitante, inicio, fin }` | `{ id, estado: "ACTIVA", mensaje }` |
| `DELETE` | `/reservas/{id}` | Cancela la reserva. | – | `{ id, estado: "CANCELADA", mensaje }` |
| `GET` | `/reservas` | Lista reservas (filtros opcionales). | query params | `{ reservas: [...] }` |

*Los códigos de estado HTTP siguen la convención: 200 OK, 201 Created, 400 Bad Request (validación), 404 Not Found, 409 Conflict (solapamiento).*

---

## 8. Flujos de Trabajo

### 8.1. Creación de Reserva
1. Cliente envía `POST /reservas`.  
2. **ReservaService** llama a **ReservaValidator** → valida campos y formato.  
3. **DisponibilidadValidator** busca reservas **ACTIVAS** de la misma unidad y verifica que `inicio`‑`fin` no se solape.  
4. Si es válido, se genera `UUID`, se persiste con estado `ACTIVA`.  
5. Se devuelve `201 Created` con el identificador.

### 8.2. Cancelación
1. Cliente envía `DELETE /reservas/{id}`.  
2. **ReservaService** busca la reserva; si no existe → `404`.  
3. Cambia `estado` a `CANCELADA`, actualiza `actualizado_en`.  
4. Persiste la modificación.  
5. Se devuelve `200 OK`.

### 8.3. Consulta de Disponibilidad
1. Cliente envía `GET /disponibilidad` con parámetros.  
2. **DisponibilidadValidator** aplica las mismas reglas de solapamiento.  
3. Respuesta `200` con `disponible: true/false`.

---

## 9. Persistencia

- **Opción 1 – SQLite** (recomendado):  
  - Tabla `reservas` con columnas idénticas al modelo.  
  - Índices en `unidad_codigo`, `inicio`, `fin` para búsquedas rápidas.  
  - Operaciones envueltas en transacciones (`BEGIN`, `COMMIT`).

- **Opción 2 – JSON plano** (para prototipo rápido):  
  - Archivo `reservas.json` con arreglo de objetos.  
  - Cada operación escribe el archivo completo (usando `fs.writeFileSync` con bloqueo).  
  - Limitación de concurrencia, pero suficiente para entornos de un solo proceso.

Al iniciar la aplicación, el **RepositorioReserva** carga el archivo o tabla y mantiene una copia en memoria (mapa de reservas por unidad) para consultas rápidas; cualquier cambio se refleja inmediatamente en el almacenamiento duradero.

---

## 10. Validaciones Detalladas

| Regla | Detalle | Acción en caso de incumplimiento |
|-------|---------|-----------------------------------|
| **U01** | `unidad_codigo` debe existir en `inventario`. | 400 Bad Request, mensaje “Unidad desconocida”. |
| **U02** | `solicitante` ≠ `null` y `trim(solicitante)` ≠ `""`. | 400, “Solicitante no puede estar vacío”. |
| **U03** | `inicio` y `fin` deben ser fechas ISO válidas. | 400, “Formato de fecha/hora inválido”. |
| **U04** | `inicio` < `fin`. | 400, “La fecha de inicio debe ser anterior a la de fin”. |
| **U05** | No existir **Reserva ACTIVA** de la misma unidad cuyo intervalo intersecte con `[inicio, fin)`. | 409 Conflict, “Intervalo solapado con reserva existente”. |
| **U06** | Se permite `fin` == `inicio` de otra reserva (intervalos consecutivos). | — |
| **U07** | Reservas de unidades distintas pueden coincidir sin restricción. | — |

**Algoritmo de solapamiento (U05):**

```
para cada reserva r en reservas_activas where r.unidad_codigo == unidad:
    si !(fin <= r.inicio OR inicio >= r.fin)  // intersección no vacía
        conflicto → rechazar
```

---

## 11. Tecnologías Sugeridas

| Capa | Herramienta / Librería |
|------|------------------------|
| **Lenguaje** | Node.js v20 (TypeScript) **o** Python 3.11 |
| **Framework API** | Express (Node) **o** FastAPI (Python) |
| **Persistencia** | SQLite 3 (via `sqlite3` o `SQLModel`), o JSON para prototipo |
| **Validación** | `class-validator` (TS) / `pydantic` (Python) |
| **UUID** | `uuid` npm / `uuid` Python |
| **Testing** | Jest (TS) / pytest (Python) |
| **Documentación API** | OpenAPI/Swagger UI |
| **Gestión de configuración** | `dotenv` (archivos `.env`) |

---

## 12. Plan de Pruebas

1. **Unitarias**  
   - Validadores de campos (U02‑U04).  
   - Algoritmo de solapamiento (U05) con casos: superposición total, parcial, límite consecutivo, diferentes unidades.

2. **Integración**  
   - Flujo completo de creación → consulta → cancelación → nueva creación.  
   - Persistencia: reiniciar la aplicación y verificar que las reservas activas se recargan.

3. **Carga**  
   - Simular 10 000 reservas y medir tiempos de consulta/creación.

4. **Seguridad**  
   - Inyección de datos malformados (fecha, JSON) → asegurar rechazo limpio.

---

## 13. Consideraciones de Futuro

| Tema | Acción prevista |
|------|-----------------|
| **Autenticación / Roles** | Añadir JWT y permisos de admin para gestión del inventario. |
| **Calendario externo** | Integración con Outlook/Google Calendar vía iCal. |
| **Notificaciones** | Email o push cuando se crea o cancela una reserva. |
| **UI avanzada** | Calendario interactivo con drag‑&‑drop para crear reservas. |
| **Multi‑tenant** | Soporte para distintas organizaciones con su propio inventario. |

---

## 14. Glosario

- **Unidad**: Laboratorio o espacio físico que se puede reservar (ej.: `MIC-01`).
- **Reserva**: Registro que asocia una unidad, un solicitante y un intervalo de tiempo.
- **Estado**: `ACTIVA` (bloquea disponibilidad) o `CANCELADA` (libera intervalo).
- **Solapamiento**: Intersección no vacía entre intervalos de tiempo de reservas activas de la misma unidad.

---

## 15. Aprobación

| Rol | Nombre | Firma | Fecha |
|-----|--------|-------|-------|
| Arquitecto de Software | — | — | 26‑10‑2026 |
| Product Owner | — | — | — |
| Equipo de Desarrollo | — | — | — |

---

**Fin del documento**