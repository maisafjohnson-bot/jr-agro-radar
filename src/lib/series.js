// Funções puras sobre séries temporais. Nenhuma função aqui inventa valores:
// ausência de dado devolve null, nunca zero.
//
// Auditoria 29/10/2026 — mudanças:
//  - taxas (unidade com "%") usam diferença em pontos percentuais (p.p.), não % de %;
//  - a distribuição histórica de variações exclui janelas que se sobrepõem à janela
//    atual (antes, janelas quase idênticas à atual "diluíam" o percentil);
//  - séries de expectativa (Focus) só comparam observações do mesmo ano de referência;
//  - percentil de NÍVEL disponível para taxas (ex.: Selic alta mesmo quando caindo).

export const DAY = 86400000;

export function parseISO(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
}
export function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / DAY); }
export function toISO(ms) { return new Date(ms).toISOString().slice(0, 10); }

/** Ordena, remove inválidos e — se houver ano de referência (Focus) — mantém só o do dado mais recente. */
export function clean(obs) {
  const c = (obs || [])
    .filter(o => o && typeof o.data === 'string' && typeof o.valor === 'number' && Number.isFinite(o.valor))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const last = c[c.length - 1];
  if (last && last.ano_referencia != null) return c.filter(o => String(o.ano_referencia) === String(last.ano_referencia));
  return c;
}

export function latest(obs) { const c = clean(obs); return c.length ? c[c.length - 1] : null; }

export function valueAtOrBefore(obs, isoDate) {
  const c = clean(obs);
  let found = null;
  for (const o of c) { if (o.data <= isoDate) found = o; else break; }
  return found;
}

export function pctChange(from, to) {
  if (!from || !to || from.valor === 0) return null;
  return ((to.valor - from.valor) / Math.abs(from.valor)) * 100;
}

/** 'pp' para taxas (unidade contém %), 'pct' para preços e índices. */
export function medidaPara(unidade) { return /%/.test(unidade || '') ? 'pp' : 'pct'; }

const mk = (a, b) => ({ de: a.data, para: b.data, pct: pctChange(a, b), pp: +(b.valor - a.valor).toFixed(6), valor_de: a.valor, valor_para: b.valor });

/** Variações compatíveis com a frequência. Série mensal NUNCA recebe variação diária/semanal. */
export function variations(obs, frequencia) {
  const c = clean(obs);
  const last = c[c.length - 1];
  if (!last) return {};
  const out = {};
  if (frequencia === 'diaria') {
    const prev = c[c.length - 2];
    if (prev) out.diaria = mk(prev, last);
    for (const [k, d] of [['semanal', 7], ['mensal', 30], ['anual', 365]]) {
      const ref = valueAtOrBefore(c, toISO(parseISO(last.data) - d * DAY));
      if (ref && daysBetween(ref.data, last.data) <= d + 5) out[k] = mk(ref, last);
    }
  } else if (frequencia === 'semanal') {
    const prev = c[c.length - 2];
    if (prev) out.semanal = mk(prev, last);
    for (const [k, d] of [['mensal', 30], ['anual', 365]]) {
      const ref = valueAtOrBefore(c, toISO(parseISO(last.data) - d * DAY));
      if (ref && daysBetween(ref.data, last.data) <= d + 10) out[k] = mk(ref, last);
    }
  } else if (frequencia === 'mensal') {
    const prev = c[c.length - 2];
    if (prev && daysBetween(prev.data, last.data) <= 45) out.mensal = mk(prev, last);
    const ref = valueAtOrBefore(c, toISO(parseISO(last.data) - 365 * DAY));
    if (ref && daysBetween(ref.data, last.data) <= 380) out.anual = mk(ref, last);
  }
  return out;
}

function startIndex(c, frequencia, janela, iEnd) {
  if (frequencia === 'diaria') {
    const target = toISO(parseISO(c[iEnd].data) - janela * DAY);
    for (let i = iEnd; i >= 0; i--) {
      if (c[i].data <= target) return daysBetween(c[i].data, c[iEnd].data) > janela + 10 ? -1 : i;
    }
    return -1;
  }
  return iEnd - janela;
}

/** Variação da janela de análise. Devolve {de, para, pct, pp, valor} onde `valor` está na medida pedida. */
export function windowChange(obs, frequencia, janela, endIndex, medida = 'pct', jaLimpo = false) {
  const c = jaLimpo ? obs : clean(obs);
  const iEnd = endIndex ?? c.length - 1;
  if (iEnd < 0 || !c[iEnd]) return null;
  const iStart = startIndex(c, frequencia, janela, iEnd);
  if (iStart < 0) return null;
  const r = mk(c[iStart], c[iEnd]);
  const valor = medida === 'pp' ? r.pp : r.pct;
  if (valor === null || !Number.isFinite(valor)) return null;
  return { ...r, valor, medida, iStart };
}

/**
 * Distribuição histórica de variações de mesma janela, usando SÓ janelas que terminam
 * antes do início da janela atual (sem sobreposição e sem olhar o futuro).
 */
export function historicalChanges(obs, frequencia, janela, medida = 'pct') {
  const c = clean(obs);
  const atual = windowChange(c, frequencia, janela, c.length - 1, medida, true);
  if (!atual) return [];
  const res = [];
  const step = frequencia === 'diaria' ? 5 : 1; // amostra para reduzir autocorrelação
  for (let i = atual.iStart; i >= 0; i -= step) {
    const w = windowChange(c, frequencia, janela, i, medida, true);
    if (w) res.push(w.valor);
  }
  return res;
}

/** Percentil (0–1) de x dentro de arr; empates contam metade. */
export function percentileRank(arr, x) {
  if (!arr.length) return null;
  let below = 0, equal = 0;
  for (const v of arr) { if (v < x) below++; else if (v === x) equal++; }
  return (below + 0.5 * equal) / arr.length;
}

/** Percentil do nível atual dentro dos últimos `anos` anos da série. */
export function levelPercentile(obs, anos = 10) {
  const c = clean(obs);
  const last = c[c.length - 1];
  if (!last) return null;
  const corte = toISO(parseISO(last.data) - anos * 365 * DAY);
  const hist = c.filter(o => o.data >= corte && o.data < last.data).map(o => o.valor);
  return { percentil: percentileRank(hist, last.valor), n: hist.length, desde: hist.length ? c.find(o => o.data >= corte).data : null };
}

/** Tendência curta: inclinação por regressão linear nas últimas n observações. */
export function trend(obs, n = 10) {
  const c = clean(obs).slice(-n);
  if (c.length < 4) return { rotulo: 'indefinida', motivo: 'histórico curto' };
  const xs = c.map((_, i) => i), ys = c.map(o => o.valor);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slopeRel = my !== 0 ? (num / den) / Math.abs(my) * 100 : 0;
  const total = slopeRel * (c.length - 1);
  if (Math.abs(total) < 1) return { rotulo: 'estável', pct_periodo: total };
  return { rotulo: total > 0 ? 'alta' : 'queda', pct_periodo: total };
}

export function freshness(obs, frequencia, hojeISO, maxDias) {
  const l = latest(obs);
  if (!l) return { status: 'ausente', idade_dias: null };
  const idade = daysBetween(l.data, hojeISO);
  return { status: idade <= maxDias[frequencia] ? 'atual' : 'desatualizado', idade_dias: idade, data_referencia: l.data };
}
