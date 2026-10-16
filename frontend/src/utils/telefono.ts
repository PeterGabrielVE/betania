// Enlaces de un teléfono guardado como "0414-1234567" (Venezuela) o
// "+57 300 1234567" (otro país).

const CELULARES_VE = /^0?(412|414|416|422|424|426)\d{7}$/;

// tel: para llamar, con el + si es internacional.
export function enlaceLlamar(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  return `tel:${numero.trim().startsWith("+") ? "+" : ""}${digitos}`;
}

// wa.me con el número internacional sin "+". Solo celulares venezolanos o
// números internacionales: un fijo (0212…) no tiene WhatsApp.
export function enlaceWhatsApp(numero: string): string | null {
  const digitos = numero.replace(/\D/g, "");
  if (numero.trim().startsWith("+")) {
    return digitos.length >= 8 ? `https://wa.me/${digitos}` : null;
  }
  if (CELULARES_VE.test(digitos)) {
    return `https://wa.me/58${digitos.replace(/^0/, "")}`;
  }
  return null;
}
