export function generateEan13(prefix = '6194000'): string {
  const baseLength = 12;
  const rand = Math.floor(Math.random() * 10 ** (baseLength - prefix.length))
    .toString()
    .padStart(baseLength - prefix.length, '0');
  const withoutCheck = (prefix + rand).slice(0, 12);
  return withoutCheck + ean13CheckDigit(withoutCheck);
}

export function ean13CheckDigit(twelveDigits: string): string {
  const sum = twelveDigits
    .split('')
    .reduce((acc, char, index) => acc + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const body = code.slice(0, 12);
  return code[12] === ean13CheckDigit(body);
}

export function generateSku(prefix = 'MT'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${out}`;
}
