# Documentación del módulo `persistence.js`

## Entorno de ejecución
- **Sistema operativo:** Windows 10 (ruta del workspace: `C:/Users/LANA/orca/workspaces/Challenge-Agents/Maria-Lana`)
- **Node.js version:** La versión disponible en el contenedor de CI de este proyecto (compatibilidad con ES5/CommonJS).
- **Herramientas usadas por el agente:**
  - `write` (para crear/sobrescribir archivos).
  - `read` y `bash` no fueron necesarios en este paso.
- **Modelo de agente:** `gpt-4o-mini` (según la variable de entorno `PI_MODEL`).

## Funcionalidad implementada
Se creó el archivo **`sistema-reservas-lab/persistence.js`** que exporta dos funciones **síncronas**:
- `cargarReservas()` – Lee `reservas.json` y devuelve un arreglo de reservas. Si el archivo no existe, devuelve `[]`.
- `guardarReservas(reservas)` – Serializa el arreglo recibido a JSON (formato legible con indentación de 2 espacios) y lo escribe en `reservas.json`.

```js
const fs = require('fs');
const path = require('path');
const reservasFile = path.join(__dirname, 'reservas.json');

function cargarReservas() { /* ... */ }
function guardarReservas(reservas) { /* ... */ }

module.exports = { cargarReservas, guardarReservas };
```

## Errores detectados y cómo se manejaron
- **Archivo `reservas.json` inexistente:** `fs.readFileSync` lanzaría `ENOENT`. Se captura este error y se devuelve un arreglo vacío, permitiendo que la aplicación arranque sin datos previos.
- **Errores de JSON inválido:** Si el contenido no se puede parsear, el error se propaga (`throw err`). Esto es intencional para que la capa de negocio pueda decidir cómo reaccionar (p. ej., resetear datos o notificar al usuario).
- **Permisos de escritura/lectura:** Se asume que el proceso tiene permisos de lectura y escritura en el directorio del proyecto (situación típica en entornos de desarrollo y CI).

## Decisiones técnicas y supuestos razonables
| Decisión | Motivo / Justificación |
|----------|------------------------|
| **Uso de API síncrona (`readFileSync` / `writeFileSync`)** | Simplicidad y determinismo en scripts de prueba y en la lógica de negocio que no es altamente concurrente. Evita la necesidad de callbacks o promesas en el resto del código.
| **Ruta relativa al módulo (`__dirname`)** | Garantiza que el archivo `reservas.json` siempre se ubique junto a `persistence.js`, independiente del directorio de ejecución actual.
| **Formato JSON con indentación de 2 espacios** | Facilita la inspección manual del archivo durante desarrollo y debugging.
| **Devolver `[]` cuando el archivo no existe** | Permite que la aplicación empiece con una lista vacía de reservas sin necesidad de crear el archivo previamente.
| **No capturar errores de parseo** | Un JSON corrupto indica un problema grave (p. ej., edición manual incorrecta). Propagar la excepción obliga a quien consuma la función a manejar el caso de forma explícita.

## Evidencia concreta de la creación del archivo
- **Comando interno del agente:** `write` con la ruta `sistema-reservas-lab/persistence.js` y el contenido mostrado arriba.
- **Respuesta del agente:** `Successfully wrote to sistema-reservas-lab/persistence.js` (confirmación de la operación).

## Próximos pasos recomendados
1. **Añadir pruebas unitarias** que verifiquen la carga y guardado de reservas, incluyendo los casos de archivo inexistente y JSON corrupto.
2. **Integrar el módulo** en la capa de negocio existente (por ejemplo, en `services/reservaService.js`).
3. **Configurar CI** para ejecutar `npm test` y asegurar que todas las pruebas pasen.

---
*Este documento fue generado automáticamente por el agente de programación dentro del repositorio `sistema-reservas-lab`.*