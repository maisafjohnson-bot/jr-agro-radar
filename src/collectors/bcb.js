// Coletores do Banco Central do Brasil.
// SGS:   https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=dd/MM/aaaa&dataFinal=dd/MM/aaaa
//        (séries diárias aceitam janela máxima de 10 anos por consulta)
// Focus: https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais

const UA = 'JR-Agro-Radar/0.1 (coleta diaria; contato: JR Agro Representacoes)';

export function brToISO(d) {
  const [dd, mm, yy] = d.split('/');
  return `${yy}-${mm}-${dd}`;
}
function isoToBR(d) {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

/** Converte resposta SGS em observações. Valores vazios/invalidos são descartados (nunca viram zero). */
export function parseSGS(json, meta) {
  if (!Array.isArray(json)) throw new Error('Resposta SGS inesperada (não é lista)');
  const agora = new Date().toISOString();
  return json
    .map(r => ({ data: brToISO(r.data), valor: r.valor === '' || r.valor == null ? NaN : Number(String(r.valor).replace(',', '.')) }))
    .filter(o => Number.isFinite(o.valor))
    .map(o => ({ ...o, fonte: meta.fonte, tipo: 'oficial', coletado_em: agora }));
}

export async function fetchWithRetry(url, { tentativas = 3, espera = 2000, fetchImpl = fetch, texto = false, ua = UA } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetchImpl(url, { headers: { 'User-Agent': ua, Accept: texto ? 'text/html' : 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return texto ? await r.text() : await r.json();
    } catch (e) {
      ultimoErro = e;
      if (i < tentativas - 1) await new Promise(res => setTimeout(res, espera * (i + 1)));
    }
  }
  throw ultimoErro;
}

export async function collectSGS(ind, existentes, { hoje, fetchImpl } = {}) {
  const ultimo = existentes.length ? existentes[existentes.length - 1].data : null;
  const fim = hoje;
  // Primeira carga: 5 anos (diária) / 15 anos (mensal) para ter base de percentis.
  // Séries diárias do SGS aceitam no máximo 10 anos por consulta.
  const anos = Math.min(ind.coleta.carga_inicial_anos || (ind.frequencia === 'diaria' ? 5 : 15), ind.frequencia === 'diaria' ? 9 : 30);
  const inicioPadrao = `${Number(hoje.slice(0, 4)) - anos}${hoje.slice(4)}`;
  // Incremental: recoleta 10 dias antes do último dado para capturar revisões.
  const inicio = ultimo ? new Date(Date.parse(ultimo) - 10 * 86400000).toISOString().slice(0, 10) : inicioPadrao;
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${ind.coleta.codigo}/dados?formato=json&dataInicial=${isoToBR(inicio)}&dataFinal=${isoToBR(fim)}`;
  const json = await fetchWithRetry(url, { fetchImpl });
  return { url, observacoes: parseSGS(json, ind) };
}

export function parseFocus(json, meta, anoRef) {
  const rows = json && Array.isArray(json.value) ? json.value : null;
  if (!rows) throw new Error('Resposta Focus inesperada');
  const agora = new Date().toISOString();
  // Uma observação por data de pesquisa (baseCalculo 0 = todas as instituições)
  const porData = new Map();
  for (const r of rows) {
    if (String(r.DataReferencia) !== String(anoRef)) continue;
    if (r.baseCalculo !== undefined && r.baseCalculo !== 0) continue;
    if (typeof r.Mediana !== 'number') continue;
    if (!porData.has(r.Data)) porData.set(r.Data, { data: r.Data, valor: r.Mediana, ano_referencia: anoRef, fonte: meta.fonte, tipo: 'expectativa', coletado_em: agora });
  }
  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}

export async function collectFocus(ind, existentes, { hoje, fetchImpl } = {}) {
  const anoRef = Number(hoje.slice(0, 4)) + (ind.coleta.ano_relativo || 0);
  // Virada de ano: quando o "próximo ano" muda (ex.: 2027 → 2028), recarrega o histórico do novo ano de referência.
  const doAno = existentes.filter(o => String(o.ano_referencia) === String(anoRef));
  const desde = doAno.length ? doAno[doAno.length - 1].data : `${Number(hoje.slice(0, 4)) - 3}-01-01`;
  const filtro = `Indicador eq '${ind.coleta.indicador}' and DataReferencia eq '${anoRef}' and Data ge '${desde}'`;
  const url = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais'
    + `?$filter=${encodeURIComponent(filtro)}&$orderby=${encodeURIComponent('Data desc')}&$top=2000&$format=json`
    + `&$select=${encodeURIComponent('Indicador,Data,DataReferencia,Mediana,baseCalculo')}`;
  const json = await fetchWithRetry(url, { fetchImpl });
  return { url, observacoes: parseFocus(json, ind, anoRef) };
}
