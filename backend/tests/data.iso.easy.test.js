const { resolveISO } = require('../src/data');

describe('resolveISO (prueba simple)', () => {
  test('mapea nombres comunes a ISO-3', () => {
    expect(resolveISO('Colombia')).toBe('COL');
    expect(resolveISO('México')).toBe('MEX');
    expect(resolveISO('Spain')).toBe('ESP');
  });

  test('acepta ISO-3 en minúsculas y devuelve mayúsculas', () => {
    expect(resolveISO('chl')).toBe('CHL');
  });

  test('desconocido devuelve null', () => {
    expect(resolveISO('Narnia')).toBeNull();
  });
});
