const { randomUUID } = require('node:crypto');
const {
  cargarReservas: cargarReservasPorDefecto,
  guardarReservas: guardarReservasPorDefecto,
} = require('../persistence');

const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Convierte una cadena ISO 8601 en Date.
 * Devuelve null si el formato o la fecha del calendario no son válidos.
 */
function parseFecha(valor) {
  if (typeof valor !== 'string') {
    return null;
  }

  const match = valor.match(ISO_8601);
  if (!match) {
    return null;
  }

  const [, anio, mes, dia, hora, minuto, segundo, milisegundos] = match;

  // Verificar que la fecha del calendario exista (por ejemplo, 2026-02-30 no existe).
  const wallClock = Date.UTC(
    Number(anio),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    Number(segundo),
    Number((milisegundos || '0').padEnd(3, '0')),
  );
  const comprobacion = new Date(wallClock);

  if (
    comprobacion.getUTCFullYear() !== Number(anio) ||
    comprobacion.getUTCMonth() + 1 !== Number(mes) ||
    comprobacion.getUTCDate() !== Number(dia) ||
    comprobacion.getUTCHours() !== Number(hora) ||
    comprobacion.getUTCMinutes() !== Number(minuto) ||
    comprobacion.getUTCSeconds() !== Number(segundo)
  ) {
    return null;
  }

  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Crea el servicio de reservas.
 *
 * Si se recibe `reservas`, el servicio trabaja sobre ese arreglo en memoria
 * (útil para pruebas unitarias). Si se omite, carga y guarda las reservas
 * usando las funciones síncronas de `persistence.js`.
 *
 * @param {Object} opciones
 * @param {Array<{codigo: string}>} opciones.inventario Unidades disponibles.
 * @param {Array} [opciones.reservas] Reservas iniciales en memoria.
 * @param {{cargarReservas?: Function, guardarReservas?: Function}} [opciones.persistencia]
 *   Implementación de persistencia inyectable para pruebas.
 * @returns {{ crearReserva: Function, cancelarReserva: Function, listarReservas: Function }}
 */
function crearServicioReservas({
  inventario = [],
  reservas,
  persistencia = {},
} = {}) {
  const unidades = new Set(
    inventario
      .map((unidad) => unidad.codigo || unidad.id)
      .filter((codigo) => typeof codigo === 'string' && codigo !== ''),
  );
  const usarPersistencia = !Array.isArray(reservas);
  const cargarReservas =
    persistencia.cargarReservas || cargarReservasPorDefecto;
  const guardarReservas =
    persistencia.guardarReservas || guardarReservasPorDefecto;
  const almacen = usarPersistencia ? cargarReservas() : reservas;

  if (!Array.isArray(almacen)) {
    throw new Error('El almacén de reservas debe ser un arreglo');
  }

  function crearReserva(datos = {}) {
    return Promise.resolve().then(() => {
      const { unidad, solicitante, inicio, fin } = datos;

      if (!unidades.has(unidad)) {
        throw new Error('Unidad desconocida');
      }

      if (typeof solicitante !== 'string' || solicitante.trim() === '') {
        throw new Error('Solicitante no puede estar vacío');
      }

      const fechaInicio = parseFecha(inicio);
      const fechaFin = parseFecha(fin);

      if (!fechaInicio || !fechaFin) {
        throw new Error('Formato de fecha/hora inválido');
      }

      if (fechaInicio.getTime() >= fechaFin.getTime()) {
        throw new Error('La fecha de inicio debe ser anterior a la de fin');
      }

      const haySolapamiento = almacen.some((reserva) => {
        if (reserva.unidad !== unidad || reserva.estado !== 'ACTIVA') {
          return false;
        }

        const inicioExistente = new Date(reserva.inicio).getTime();
        const finExistente = new Date(reserva.fin).getTime();

        return !(
          fechaFin.getTime() <= inicioExistente ||
          fechaInicio.getTime() >= finExistente
        );
      });

      if (haySolapamiento) {
        throw new Error('Intervalo solapado con reserva existente');
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

      almacen.push(reserva);

      if (usarPersistencia) {
        try {
          guardarReservas(almacen);
        } catch (error) {
          // Mantener consistencia entre memoria y disco si falla la escritura.
          almacen.pop();
          throw error;
        }
      }

      return { ...reserva };
    });
  }

  function cancelarReserva(id) {
    return Promise.resolve().then(() => {
      const indice = almacen.findIndex((reserva) => reserva.id === id);

      if (indice === -1) {
        throw new Error('Reserva no encontrada');
      }

      const anterior = almacen[indice];

      // La cancelación es idempotente: conserva el historial sin duplicarlo.
      if (anterior.estado === 'CANCELADA') {
        return { ...anterior };
      }

      const cancelada = {
        ...anterior,
        estado: 'CANCELADA',
        actualizado_en: new Date().toISOString(),
      };

      almacen[indice] = cancelada;

      if (usarPersistencia) {
        try {
          guardarReservas(almacen);
        } catch (error) {
          // Restaurar la reserva activa si no se pudo persistir la cancelación.
          almacen[indice] = anterior;
          throw error;
        }
      }

      return { ...cancelada };
    });
  }

  function listarReservas({ estado } = {}) {
    return almacen
      .filter((reserva) => estado === undefined || reserva.estado === estado)
      .map((reserva) => ({ ...reserva }));
  }

  return { crearReserva, cancelarReserva, listarReservas };
}

module.exports = { crearServicioReservas, parseFecha };
