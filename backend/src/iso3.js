/**
 * iso3.js — Mapa de nombres comunes ES/EN → códigos ISO-3
 *
 * Uso:
 *   const ISO3 = require('./iso3');
 *   ISO3["Colombia"]  // "COL"
 *   ISO3["México"]    // "MEX"
 *   ISO3["Mexico"]    // "MEX"
 *
 * Notas:
 * - Se incluyen variantes con y sin acentos, y en inglés/español.
 * - También alias frecuentes (p.ej., "Estados Unidos", "UnitedStates", "UK").
 * - Las claves se buscan EXACTAS; la lógica de normalización (title-case, quitar acentos)
 *   se realiza en data.js (función resolveISO). Este mapa sirve de referencia base.
 */

module.exports = {
  // Latinoamérica
  Colombia: 'COL',
  Chile: 'CHL',
  Mexico: 'MEX',          // variante sin acento
  'México': 'MEX',        // variante con acento
  Argentina: 'ARG',
  Peru: 'PER',            // sin acento
  'Perú': 'PER',          // con acento
  Brasil: 'BRA',
  Brazil: 'BRA',          // inglés

  // España / Europa
  España: 'ESP',          // español
  Spain: 'ESP',           // inglés
  France: 'FRA',          // inglés
  Francia: 'FRA',         // español
  Alemania: 'DEU',        // español
  Germany: 'DEU',         // inglés
  Italia: 'ITA',          // español
  Italy: 'ITA',           // inglés
  Canada: 'CAN',          // sin acento
  'Canadá': 'CAN',        // con acento
  'Reino Unido': 'GBR',   // español
  ReinoUnido: 'GBR',      // variante sin espacio
  UK: 'GBR',              // abreviatura común

  // Norteamérica
  'Estados Unidos': 'USA',  // español con espacio
  EstadosUnidos: 'USA',     // variante sin espacio
  UnitedStates: 'USA',      // inglés sin espacio

  // Asia
  Singapur: 'SGP',        // español
  Singapore: 'SGP',       // inglés
  Japan: 'JPN',           // inglés
  'Japón': 'JPN',         // español con acento
  Japon: 'JPN',           // español sin acento
  China: 'CHN',
  India: 'IND',
  Vietnam: 'VNM',
  'Corea del Sur': 'KOR', // nombre común en español
  'Corea, Rep.': 'KOR',   // denominación usada por el Banco Mundial
  'Emiratos Árabes Unidos': 'ARE',  // con acentos
  'Emiratos Arabes Unidos': 'ARE',  // sin acentos

  // Oriente Medio / Europa del Este
  Venezuela: 'VEN',
  Rusia: 'RUS',           // español
  'Turquía': 'TUR',       // con acento
  Turquia: 'TUR',         // sin acento
};
