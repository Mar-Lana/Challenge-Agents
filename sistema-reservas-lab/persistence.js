const fs = require('fs');
const path = require('path');

// Ruta por defecto del archivo JSON que almacena las reservas.
const reservasFile = path.join(__dirname, 'reservas.json');

/**
 * Carga las reservas desde un archivo JSON.
 * Si el archivo no existe, devuelve un arreglo vacío.
 *
 * @param {string} [rutaArchivo=reservasFile] Ruta del archivo a leer.
 * @returns {Array} Lista completa de reservas, activas y canceladas.
 */
function cargarReservas(rutaArchivo = reservasFile) {
  try {
    const data = fs.readFileSync(rutaArchivo, 'utf8');
    const reservas = JSON.parse(data);

    if (!Array.isArray(reservas)) {
      throw new Error('El archivo de reservas debe contener un arreglo JSON');
    }

    return reservas;
  } catch (err) {
    // Si el archivo no existe, retornamos una lista vacía.
    if (err.code === 'ENOENT') {
      return [];
    }
    // Un JSON corrupto o una estructura inválida se propagan para no perder
    // silenciosamente el historial de reservas.
    throw err;
  }
}

/**
 * Guarda el arreglo completo de reservas en un archivo JSON.
 *
 * La escritura se realiza primero en un archivo temporal y después se renombra
 * de forma atómica. Así se evita dejar `reservas.json` truncado si el proceso
 * falla durante la escritura.
 *
 * @param {Array} reservas Lista completa de reservas a persistir.
 * @param {string} [rutaArchivo=reservasFile] Ruta del archivo a escribir.
 */
function guardarReservas(reservas, rutaArchivo = reservasFile) {
  if (!Array.isArray(reservas)) {
    throw new TypeError('Las reservas deben ser un arreglo');
  }

  const json = JSON.stringify(reservas, null, 2);
  const archivoTemporal = `${rutaArchivo}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(archivoTemporal, json, 'utf8');
    fs.renameSync(archivoTemporal, rutaArchivo);
  } catch (error) {
    // Limpiar el temporal si la escritura o el renombrado fallaron.
    if (fs.existsSync(archivoTemporal)) {
      fs.unlinkSync(archivoTemporal);
    }
    throw error;
  }
}

/**
 * Crea un adaptador de persistencia ligado a una ruta concreta.
 * Facilita el uso de un archivo temporal en pruebas y permite inyectar la
 * persistencia en el servicio de reservas.
 *
 * @param {string} [rutaArchivo=reservasFile] Ruta del archivo JSON.
 * @returns {{
 *   rutaArchivo: string,
 *   cargarReservas: () => Array,
 *   guardarReservas: (reservas: Array) => void,
 * }}
 */
function crearPersistenciaJson(rutaArchivo = reservasFile) {
  return {
    rutaArchivo,
    cargarReservas: () => cargarReservas(rutaArchivo),
    guardarReservas: (reservas) => guardarReservas(reservas, rutaArchivo),
  };
}

module.exports = {
  reservasFile,
  cargarReservas,
  guardarReservas,
  crearPersistenciaJson,
};
