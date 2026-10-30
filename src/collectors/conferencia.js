// Conferência diária do dólar com uma segunda fonte independente:
// taxa de referência do Banco Central Europeu (BCE), servida pela API aberta Frankfurter
// (https://api.frankfurter.dev — código aberto, sem chave). O BCE publica às 14h10 de Frankfurt;
// a PTAX do BCB é do fim do dia — por isso os NÍVEIS diferem um pouco, mas o MOVIMENTO deve coincidir.
import { fetchWithRetry } from './bcb.js';

export const FONTE_REF = 'Banco Central Europeu (taxa de referência, via api.frankfurter.dev)';

export async function fetchRefUSDBRL(de, ate, { fetchImpl } = {}) {
  const url = `https://api.frankfurter.dev/v1/${de}..${ate}?from=USD&to=BRL`;
  const j = await fetchWithRetry(url, { fetchImpl });
  if (!j?.rates || typeof j.rates !== 'object') throw new Error('resposta do BCE/Frankfurter sem "rates"');
  const out = {};
  for (const [d, o] of Object.entries(j.rates)) if (Number.isFinite(o?.BRL)) out[d] = o.BRL;
  return { url, taxas: out };
}

/**
 * Compara a variação do BCB com a da fonte de referência entre as mesmas datas.
 * Confirmado: mesmo sentido e diferença ≤ tolerancia_pp; níveis com diferença ≤ tolerancia_nivel_pct.
 */
export function conferirMovimento(variacao, nivelBCB, dataNivel, taxas, { tolerancia_pp = 2, tolerancia_nivel_pct = 3 } = {}) {
  if (!variacao) return { status: 'sem_comparacao', texto: 'Sem variação semanal para conferir.' };
  const a = taxas[variacao.de], b = taxas[variacao.para];
  if (a == null || b == null) return { status: 'indisponivel', texto: `Conferência indisponível: a fonte de referência não tem cotação em ${variacao.de} e/ou ${variacao.para}.` };
  const refPct = (b / a - 1) * 100;
  const difPP = variacao.pct - refPct;
  const ref = taxas[dataNivel];
  const difNivel = ref != null ? (nivelBCB / ref - 1) * 100 : null;
  const mesmoSentido = Math.sign(refPct) === Math.sign(variacao.pct) || Math.abs(refPct) < 0.5;
  const ok = mesmoSentido && Math.abs(difPP) <= tolerancia_pp && (difNivel == null || Math.abs(difNivel) <= tolerancia_nivel_pct);
  const f = (x, d = 1) => x.toFixed(d).replace('.', ',');
  return {
    status: ok ? 'confirmado' : 'divergente', fonte: FONTE_REF,
    ref_pct: +refPct.toFixed(2), dif_pp: +difPP.toFixed(2), dif_nivel_pct: difNivel == null ? null : +difNivel.toFixed(2),
    texto: ok
      ? `Conferido com o BCE: ${refPct > 0 ? '+' : ''}${f(refPct)}% no mesmo período (BCB ${variacao.pct > 0 ? '+' : ''}${f(variacao.pct)}%) — movimento confirmado por 2 fontes.`
      : `ATENÇÃO: o BCE mostra ${refPct > 0 ? '+' : ''}${f(refPct)}% no mesmo período, contra ${variacao.pct > 0 ? '+' : ''}${f(variacao.pct)}% no BCB${difNivel != null ? ` (nível difere ${f(difNivel)}%)` : ''} — confira antes de usar.`
  };
}
