/**
 * Pruebas unitarias (TDD) del servicio de reservas.
 *
 * Estas pruebas describen el comportamiento esperado en la especificación
 * (docs/sdd.md) y deben fallar inicialmente hasta que se implemente
 * `src/reserva-service.js`.
 *
 * Contrato acordado para la implementación:
 *   - crearServicioReservas({ inventario, reservas }) -> servicio
 *   - servicio.crearReserva(datos) -> Promise<Reserva>
 *   - servicio.listarReservas() -> Reserva[]
 *
 * Los errores de validación se rechazan con un Error cuyo mensaje coincide
 * con el indicado en la especificación.
 */

const { crearServicioReservas } = require('../src/reserva-service');

const INVENTARIO = [
  { codigo: 'MIC-01', nombre: 'Microscopio digital' },
  { codigo: 'MIC-02', nombre: 'Microscopio digital' },
  { codigo: 'OSC-01', nombre: 'Osciloscopio' },
];

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function crearServicio(reservas = []) {
  return crearServicioReservas({
    inventario: INVENTARIO,
    reservas,
  });
}

function reservaValida(overrides = {}) {
  return {
    unidad: 'MIC-01',
    solicitante: 'Ana Pérez',
    inicio: '2026-10-27T10:00:00.000Z',
    fin: '2026-10-27T11:00:00.000Z',
    ...overrides,
  };
}

describe('Creación de reservas', () => {
  test('crea una reserva válida con id UUID y estado ACTIVA', async () => {
    const servicio = crearServicio();

    const reserva = await servicio.crearReserva(reservaValida());

    expect(reserva).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(UUID_V4),
        unidad: 'MIC-01',
        solicitante: 'Ana Pérez',
        inicio: '2026-10-27T10:00:00.000Z',
        fin: '2026-10-27T11:00:00.000Z',
        estado: 'ACTIVA',
      }),
    );
    expect(servicio.listarReservas()).toHaveLength(1);
    expect(servicio.listarReservas()[0].id).toBe(reserva.id);
  });
});

describe('Reglas de solapamiento', () => {
  test('rechaza una superposición parcial con una reserva activa de la misma unidad', async () => {
    const servicio = crearServicio();
    await servicio.crearReserva(reservaValida());

    await expect(
      servicio.crearReserva(
        reservaValida({
          inicio: '2026-10-27T10:30:00.000Z',
          fin: '2026-10-27T11:30:00.000Z',
        }),
      ),
    ).rejects.toThrow(/solap/i);

    expect(servicio.listarReservas()).toHaveLength(1);
  });

  test('rechaza una superposición total o contenida en una reserva activa', async () => {
    const servicio = crearServicio();
    await servicio.crearReserva(reservaValida());

    await expect(
      servicio.crearReserva(
        reservaValida({
          inicio: '2026-10-27T10:15:00.000Z',
          fin: '2026-10-27T10:45:00.000Z',
        }),
      ),
    ).rejects.toThrow(/solap/i);

    await expect(
      servicio.crearReserva(
        reservaValida({
          inicio: '2026-10-27T09:00:00.000Z',
          fin: '2026-10-27T12:00:00.000Z',
        }),
      ),
    ).rejects.toThrow(/solap/i);
  });

  test('permite intervalos consecutivos en la misma unidad (fin === inicio)', async () => {
    const servicio = crearServicio();

    const primera = await servicio.crearReserva(reservaValida());
    const segunda = await servicio.crearReserva(
      reservaValida({
        solicitante: 'Luis Gómez',
        inicio: '2026-10-27T11:00:00.000Z',
        fin: '2026-10-27T12:00:00.000Z',
      }),
    );

    expect(primera.id).not.toBe(segunda.id);
    expect(servicio.listarReservas()).toHaveLength(2);
  });

  test('permite reservas simultáneas en unidades distintas', async () => {
    const servicio = crearServicio();

    const primera = await servicio.crearReserva(reservaValida());
    const segunda = await servicio.crearReserva(
      reservaValida({
        unidad: 'OSC-01',
        solicitante: 'Luis Gómez',
      }),
    );

    expect(primera.id).not.toBe(segunda.id);
    expect(servicio.listarReservas()).toHaveLength(2);
  });
});

describe('Validación de entradas', () => {
  test.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['nulo', null],
  ])('rechaza un solicitante %s', async (_caso, solicitante) => {
    const servicio = crearServicio();

    await expect(
      servicio.crearReserva(reservaValida({ solicitante })),
    ).rejects.toThrow(/solicitante no puede estar vacío/i);

    expect(servicio.listarReservas()).toHaveLength(0);
  });

  test.each([
    ['inicio no parseable', 'no-es-una-fecha', '2026-10-27T11:00:00.000Z'],
    ['fin no parseable', '2026-10-27T10:00:00.000Z', 'fecha-invalida'],
    ['fecha inexistente', '2026-02-30T10:00:00.000Z', '2026-10-27T11:00:00.000Z'],
  ])('rechaza fechas inválidas: %s', async (_caso, inicio, fin) => {
    const servicio = crearServicio();

    await expect(
      servicio.crearReserva(reservaValida({ inicio, fin })),
    ).rejects.toThrow(/formato de fecha\/hora inválido/i);

    expect(servicio.listarReservas()).toHaveLength(0);
  });

  test('rechaza una reserva cuyo inicio no es anterior al fin', async () => {
    const servicio = crearServicio();

    await expect(
      servicio.crearReserva(
        reservaValida({
          inicio: '2026-10-27T11:00:00.000Z',
          fin: '2026-10-27T11:00:00.000Z',
        }),
      ),
    ).rejects.toThrow(/inicio debe ser anterior/i);

    expect(servicio.listarReservas()).toHaveLength(0);
  });
});
