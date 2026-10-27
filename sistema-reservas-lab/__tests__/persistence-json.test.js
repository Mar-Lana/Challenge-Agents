const fs = require('fs');
const os = require('os');
const path = require('path');

const { crearServicioReservas } = require('../src/reserva-service');
const {
  cargarReservas,
  guardarReservas,
  crearPersistenciaJson,
} = require('../persistence');

const INVENTARIO = [
  { codigo: 'MIC-01', nombre: 'Microscopio digital' },
  { codigo: 'MIC-02', nombre: 'Microscopio digital' },
];

function reservaValida(overrides = {}) {
  return {
    unidad: 'MIC-01',
    solicitante: 'Ana Pérez',
    inicio: '2026-10-27T10:00:00.000Z',
    fin: '2026-10-27T11:00:00.000Z',
    ...overrides,
  };
}

describe('Persistencia local JSON de reservas', () => {
  let directorioTemporal;
  let rutaArchivo;
  let persistencia;

  beforeEach(() => {
    directorioTemporal = fs.mkdtempSync(
      path.join(os.tmpdir(), 'reservas-json-'),
    );
    rutaArchivo = path.join(directorioTemporal, 'reservas.json');
    persistencia = crearPersistenciaJson(rutaArchivo);
  });

  afterEach(() => {
    fs.rmSync(directorioTemporal, { recursive: true, force: true });
  });

  function crearServicio() {
    return crearServicioReservas({ inventario: INVENTARIO, persistencia });
  }

  test('guarda reservas activas y canceladas y las recupera al reiniciar', async () => {
    const servicio = crearServicio();

    const activa = await servicio.crearReserva(reservaValida());
    const otraActiva = await servicio.crearReserva(
      reservaValida({ unidad: 'MIC-02', solicitante: 'Luis Gómez' }),
    );
    const cancelada = await servicio.cancelarReserva(activa.id);

    expect(cancelada.estado).toBe('CANCELADA');
    expect(cancelada.actualizado_en).toEqual(expect.any(String));

    const contenidoEnDisco = JSON.parse(
      fs.readFileSync(rutaArchivo, 'utf8'),
    );
    expect(contenidoEnDisco).toHaveLength(2);
    expect(
      contenidoEnDisco.find((reserva) => reserva.id === activa.id).estado,
    ).toBe('CANCELADA');
    expect(
      contenidoEnDisco.find((reserva) => reserva.id === otraActiva.id).estado,
    ).toBe('ACTIVA');

    // Simula reiniciar la aplicación creando un servicio nuevo desde el JSON.
    const servicioReiniciado = crearServicio();
    const historial = servicioReiniciado.listarReservas();

    expect(historial).toHaveLength(2);
    expect(servicioReiniciado.listarReservas({ estado: 'ACTIVA' })).toEqual([
      expect.objectContaining({
        id: otraActiva.id,
        unidad: 'MIC-02',
        solicitante: 'Luis Gómez',
        estado: 'ACTIVA',
      }),
    ]);
    expect(servicioReiniciado.listarReservas({ estado: 'CANCELADA' })).toEqual([
      expect.objectContaining({
        id: activa.id,
        unidad: 'MIC-01',
        solicitante: 'Ana Pérez',
        inicio: activa.inicio,
        fin: activa.fin,
        estado: 'CANCELADA',
      }),
    ]);
  });

  test('libera el intervalo cancelado sin perder el registro histórico', async () => {
    const servicio = crearServicio();
    const primera = await servicio.crearReserva(reservaValida());

    await servicio.cancelarReserva(primera.id);

    const reutilizada = await servicio.crearReserva(
      reservaValida({ solicitante: 'Luis Gómez' }),
    );

    expect(reutilizada.id).not.toBe(primera.id);

    const historial = crearServicio().listarReservas();
    expect(historial).toHaveLength(2);
    expect(historial.find((reserva) => reserva.id === primera.id).estado).toBe(
      'CANCELADA',
    );
    expect(historial.find((reserva) => reserva.id === reutilizada.id).estado).toBe(
      'ACTIVA',
    );
  });

  test('la cancelación es idempotente y no duplica el historial', async () => {
    const servicio = crearServicio();
    const reserva = await servicio.crearReserva(reservaValida());

    const primeraCancelacion = await servicio.cancelarReserva(reserva.id);
    const segundaCancelacion = await servicio.cancelarReserva(reserva.id);

    expect(segundaCancelacion.estado).toBe('CANCELADA');
    expect(segundaCancelacion.actualizado_en).toBe(
      primeraCancelacion.actualizado_en,
    );
    expect(crearServicio().listarReservas()).toHaveLength(1);
  });

  test('rechaza la cancelación de una reserva inexistente', async () => {
    const servicio = crearServicio();

    await expect(
      servicio.cancelarReserva('00000000-0000-4000-8000-000000000000'),
    ).rejects.toThrow('Reserva no encontrada');
  });

  test('cargarReservas devuelve un arreglo vacío si el archivo no existe', () => {
    expect(cargarReservas(rutaArchivo)).toEqual([]);
  });

  test('guardarReservas rechaza datos que no sean un arreglo', () => {
    expect(() => guardarReservas({}, rutaArchivo)).toThrow(
      'Las reservas deben ser un arreglo',
    );
  });
});
