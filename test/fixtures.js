// SÉRIES SINTÉTICAS APENAS PARA TESTE. Não são dados de mercado e nunca são gravadas em data/.
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Gera série com histórico sem tendência (passeio aleatório em torno de `inicio`) e um
 * movimento controlado na janela final: `movimento` em fração total (ex.: 0.08 = +8%).
 */
function gerar({ freq, fim, n, inicio, vol, seed, movimento = 0, finais, anoRef }) {
  const r = rng(seed);
  const pts = [];
  const end = Date.parse(fim);
  if (freq === 'diaria') {
    for (let i = n; i >= 0; i--) { const d = new Date(end - i * 864e5); if (d.getUTCDay() % 6) pts.push(d); }
  } else if (freq === 'semanal') {
    for (let i = n; i >= 0; i--) pts.push(new Date(end - i * 7 * 864e5));
  } else {
    const [Y, M] = fim.split('-').map(Number);
    for (let i = n; i >= 0; i--) pts.push(new Date(Date.UTC(Y, M - 1 - i, 1)));
  }
  let v = inicio;
  const k = finais;
  return pts.map((d, i) => {
    const ultimo = i >= pts.length - k;
    v = ultimo ? v * (1 + movimento / k + (r() - 0.5) * vol * 0.2) : v * (1 + (r() - 0.5) * vol) + (inicio - v) * 0.02;
    const o = { data: d.toISOString().slice(0, 10), valor: +v.toFixed(4), fonte: 'TESTE', tipo: freq === 'semanal' && anoRef ? 'expectativa' : 'oficial' };
    if (anoRef) o.ano_referencia = anoRef;
    return o;
  });
}

const D = (inicio, movimento, seed, vol = 0.012) => gerar({ freq: 'diaria', fim: '2026-10-28', n: 1100, inicio, vol, seed, movimento, finais: 21 });
const W = (inicio, movimento, seed, anoRef, vol = 0.01) => gerar({ freq: 'semanal', fim: '2026-10-23', n: 150, inicio, vol, seed, movimento, finais: 4, anoRef });
const M = (inicio, movimento, seed, vol = 0.02) => gerar({ freq: 'mensal', fim: '2026-09-01', n: 100, inicio, vol, seed, movimento, finais: 3 });

/**
 * Cenário: cada chave recebe +1 (alta forte), -1 (queda forte) ou 0 (sem movimento).
 * Taxas usam movimentos menores (em fração), coerentes com a realidade.
 */
export function cenario(m = {}) {
  const g = id => m[id] ?? 0;
  return {
    usd_brl: D(5.2, 0.05 * g('usd_brl'), 11),
    selic_meta: D(12, 0.06 * g('selic_meta'), 12, 0.004),
    ipca_12m: M(5, 0.15 * g('ipca_12m'), 13, 0.03),
    icbr_agro: M(300, 0.10 * g('icbr_agro'), 14),
    focus_selic_prox_ano: W(11, 0.06 * g('focus_selic_prox_ano'), 15, 2027, 0.006),
    focus_ipca_prox_ano: W(4, 0.06 * g('focus_ipca_prox_ano'), 16, 2027, 0.006),
    soja_mt: D(120, 0.10 * g('soja_mt'), 17),
    milho_mt: D(55, 0.10 * g('milho_mt'), 18),
    boi_gordo: D(300, 0.10 * g('boi_gordo'), 19),
    diesel_mt: W(6.2, 0.06 * g('diesel_mt'), 20),
    fertilizante: M(3000, 0.10 * g('fertilizante'), 21),
    maquinas_vendas: M(4000, 0.15 * g('maquinas_vendas'), 22)
  };
}

export const CENARIOS = {
  agro_favoravel: { soja_mt: 1, milho_mt: 1, icbr_agro: 1, selic_meta: -1, focus_selic_prox_ano: -1, diesel_mt: -1, fertilizante: -1, ipca_12m: -1, focus_ipca_prox_ano: -1, maquinas_vendas: 1 },
  agro_desfavoravel: { soja_mt: -1, milho_mt: -1, icbr_agro: -1, selic_meta: 1, focus_selic_prox_ano: 1, diesel_mt: 1, fertilizante: 1, ipca_12m: 1, focus_ipca_prox_ano: 1, maquinas_vendas: -1 },
  pecuaria_favoravel: { boi_gordo: 1, milho_mt: -1 },
  contraditorio: { soja_mt: 1, milho_mt: 1, icbr_agro: 1, selic_meta: 1, focus_selic_prox_ano: 1, diesel_mt: 1, fertilizante: 1 }
};

/** Compatibilidade com testes antigos: +1 favorável, −1 desfavorável. */
export function scenario(t = 1) { return cenario(t > 0 ? CENARIOS.agro_favoravel : CENARIOS.agro_desfavoravel); }

// mantidos para testes de frescor
export const dailySeries = ({ fim = '2026-10-28', inicio = 100, seed = 1, fimDrift = 0 }) => gerar({ freq: 'diaria', fim, n: 900, inicio, vol: 0.01, seed, movimento: fimDrift * 21, finais: 21 });
export const monthlySeries = ({ fim = '2026-09-01', inicio = 100, seed = 2 }) => gerar({ freq: 'mensal', fim, n: 60, inicio, vol: 0.02, seed, finais: 3 });
