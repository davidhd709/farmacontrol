/**
 * Conversión de importes monetarios a letras en español según el estándar contable colombiano.
 * Ejemplo: 185000 -> "CIENTO OCHENTA Y CINCO MIL PESOS M/CTE."
 */

const UNIDADES = [
  '',
  'UN ',
  'DOS ',
  'TRES ',
  'CUATRO ',
  'CINCO ',
  'SEIS ',
  'SIETE ',
  'OCHO ',
  'NUEVE ',
];

const DECENAS = [
  'DIEZ ',
  'ONCE ',
  'DOCE ',
  'TRECE ',
  'CATORCE ',
  'QUINCE ',
  'DIECISEIS ',
  'DIECISIETE ',
  'DIECIOCHO ',
  'DIECINUEVE ',
  'VEINTE ',
  'VEINTIUNO ',
  'VEINTIDOS ',
  'VEINTITRES ',
  'VEINTICUATRO ',
  'VEINTICINCO ',
  'VEINTISEIS ',
  'VEINTISIETE ',
  'VEINTIOCHO ',
  'VEINTINUEVE ',
];

const DECENAS_MAYORES = [
  '',
  '',
  '',
  'TREINTA ',
  'CUARENTA ',
  'CINCUENTA ',
  'SESENTA ',
  'SETENTA ',
  'OCHENTA ',
  'NOVENTA ',
];

const CENTENAS = [
  '',
  'CIENTO ',
  'DOSCIENTOS ',
  'TRESCIENTOS ',
  'CUATROCIENTOS ',
  'QUINIENTOS ',
  'SEISCIENTOS ',
  'SETECIENTOS ',
  'OCHOCIENTOS ',
  'NOVECIENTOS ',
];

function leerCentenas(num: number): string {
  if (num === 0) return '';
  if (num === 100) return 'CIEN ';

  const c = Math.floor(num / 100);
  const d = Math.floor((num % 100) / 10);
  const u = num % 10;
  const dec = num % 100;

  let resultado = CENTENAS[c];

  if (dec >= 10 && dec <= 29) {
    resultado += DECENAS[dec - 10];
  } else if (dec > 29) {
    resultado += DECENAS_MAYORES[d];
    if (u > 0) {
      resultado += 'Y ' + UNIDADES[u];
    }
  } else if (u > 0) {
    resultado += UNIDADES[u];
  }

  return resultado;
}

function leerMiles(num: number): string {
  const miles = Math.floor(num / 1000);
  const resto = num % 1000;

  let resultado = '';

  if (miles === 1) {
    resultado = 'MIL ';
  } else if (miles > 1) {
    resultado = leerCentenas(miles) + 'MIL ';
  }

  resultado += leerCentenas(resto);
  return resultado;
}

function leerMillones(num: number): string {
  const millones = Math.floor(num / 1_000_000);
  const resto = num % 1_000_000;

  let resultado = '';

  if (millones === 1) {
    resultado = 'UN MILLÓN ';
  } else if (millones > 1) {
    resultado = leerMiles(millones) + 'MILLONES ';
  }

  resultado += leerMiles(resto);
  return resultado;
}

/**
 * Convierte un número en formato monetario a su representación en letras en pesos colombianos.
 * @param amount Valor numérico o texto con decimales
 * @returns Cadena formal en mayúsculas (ej. "CIENTO CINCUENTA MIL PESOS M/CTE.")
 */
export function numberToWordsCop(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(num) || num <= 0) {
    return 'CERO PESOS M/CTE.';
  }

  const enteros = Math.floor(Math.abs(num));
  const centavos = Math.round((Math.abs(num) - enteros) * 100);

  let texto = '';

  if (enteros === 0) {
    texto = 'CERO ';
  } else if (enteros < 1000) {
    texto = leerCentenas(enteros);
  } else if (enteros < 1_000_000) {
    texto = leerMiles(enteros);
  } else if (enteros < 1_000_000_000) {
    texto = leerMillones(enteros);
  } else {
    // Si excede 1000 millones, fallback formateado
    return `$${num.toLocaleString('es-CO')} PESOS M/CTE.`;
  }

  texto = texto.trim();

  // Singular o plural de PESO
  const moneda = enteros === 1 ? 'PESO' : 'PESOS';

  if (centavos > 0) {
    const centavosStr = centavos.toString().padStart(2, '0');
    return `${texto} ${moneda} CON ${centavosStr}/100 M/CTE.`;
  }

  return `${texto} ${moneda} M/CTE.`;
}

