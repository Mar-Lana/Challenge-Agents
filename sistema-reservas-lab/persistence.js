const fs = require('fs');
const path = require('path');

// Ruta al archivo JSON que almacena las reservas
const reservasFile = path.join(__dirname, 'reservas.json');

/**
 * Carga las reservas desde el archivo JSON.
 * Si el archivo no existe, devuelve un arreglo vacío.
 * @returns {Array} Lista de reservas.
 */
function cargarReservas() {
  try {
    const data = fs.readFileSync(reservasFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // Si el archivo no existe, retornamos una lista vacía
    if (err.code === 'ENOENT') {
      return [];
    }
    // Re‑lanzamos cualquier otro error
    throw err;
  }
}

/**
 * Guarda el arreglo de reservas en el archivo JSON.
 * @param {Array} reservas - Lista de reservas a persistir.
 */
function guardarReservas(reservas) {
  const json = JSON.stringify(reservas, null, 2);
  fs.writeFileSync(reservasFile, json, 'utf8');
}

module.exports = { cargarReservas, guardarReservas };
