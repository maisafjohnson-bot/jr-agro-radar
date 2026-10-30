export function num(v, casas = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
export function pct(v, casas = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (Math.abs(v) < 0.5 * 10 ** -casas) return `${num(0, casas)}%`;
  return `${v > 0 ? '+' : ''}${num(v, casas)}%`;
}
export function dataBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function casasPara(unidade) {
  return /índice/.test(unidade) ? 1 : 2;
}
