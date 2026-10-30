// Coletor IBGE — dados regionais por município de MT (51), RO (11) e AC (12).
//
// APIs públicas do IBGE (servicodados.ibge.gov.br):
//   Metadados:  /api/v3/agregados/{tabela}/metadados
//   Valores:    /api/v3/agregados/{tabela}/periodos/-2/variaveis/{var}?localidades=N6[N3[51,11,12]]&classificacao={cls}[{cats}]
//   Municípios: /api/v1/localidades/estados/{uf}/municipios
//   Malhas:     /api/v3/malhas/estados/{uf}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio
//
// Tabelas: PAM 5457 (área plantada por cultura) e PPM 3939 (efetivo de rebanhos).
// Códigos de variável e de categoria são RESOLVIDOS PELO NOME a partir dos metadados, para não
// depender de códigos digitados à mão. Se o nome não for encontrado, a coleta falha e registra o erro.
// Dados anuais (PAM/PPM saem ~1 ano depois do ano de referência): coleta no máximo 1 vez a cada 30 dias.
import { fetchWithRetry } from './bcb.js';

const BASE = 'https://servicodados.ibge.gov.br/api';
export const UFS = { 51: 'MT', 11: 'RO', 12: 'AC' };

export const ALVOS = {
  pam: {
    tabela: 5457, fonte: 'IBGE — Produção Agrícola Municipal (PAM), tabela 5457',
    variavel: /^Área plantada ou destinada à colheita$/i,
    classificacao: /lavouras temporárias e permanentes/i,
    categorias: { soja: /^Soja \(em grão\)$/i, milho: /^Milho \(em grão\)$/i, algodao: /^Algodão herbáceo \(em caroço\)$/i, cafe: /^Café \(em grão\) Total$/i }
  },
  ppm: {
    tabela: 3939, fonte: 'IBGE — Pesquisa da Pecuária Municipal (PPM), tabela 3939',
    variavel: /^Efetivo dos rebanhos$/i,
    classificacao: /tipo de rebanho/i,
    categorias: { bovinos: /^Bovino$/i }
  }
};

/** Resolve ids de variável, classificação e categorias a partir dos metadados, pelo nome. */
export function resolveIds(meta, alvo) {
  const v = (meta.variaveis || []).find(x => alvo.variavel.test(x.nome));
  if (!v) throw new Error(`variável não encontrada nos metadados da tabela ${alvo.tabela}`);
  const c = (meta.classificacoes || []).find(x => alvo.classificacao.test(x.nome));
  if (!c) throw new Error(`classificação não encontrada nos metadados da tabela ${alvo.tabela}`);
  const cats = {};
  for (const [k, re] of Object.entries(alvo.categorias)) {
    const cat = (c.categorias || []).find(x => re.test(x.nome));
    if (!cat) throw new Error(`categoria "${k}" não encontrada na tabela ${alvo.tabela}`);
    cats[k] = cat.id;
  }
  return { variavel: v.id, unidade: v.unidade, classificacao: c.id, categorias: cats };
}

/**
 * Converte a resposta em { ano, valores: {cat: {mun: n}}, ano_anterior, anterior: {...} }.
 * Pede os 2 últimos anos para medir variação de área. Sem dado ("-", "...", "X") = ausente, nunca zero.
 */
export function parseValores(json, ids) {
  const idParaChave = Object.fromEntries(Object.entries(ids.categorias).map(([k, v]) => [String(v), k]));
  const porAno = {};
  for (const varBloco of json || []) {
    for (const res of varBloco.resultados || []) {
      const catId = Object.keys(res.classificacoes?.[0]?.categoria || {})[0];
      const chave = idParaChave[String(catId)];
      if (!chave) continue;
      for (const s of res.series || []) {
        for (const [periodo, valor] of Object.entries(s.serie || {})) {
          if (valor == null || !/^-?\d+([.,]\d+)?$/.test(String(valor))) continue;
          const n = Number(String(valor).replace(',', '.'));
          if (!Number.isFinite(n)) continue;
          ((porAno[periodo] ||= Object.fromEntries(Object.keys(ids.categorias).map(k => [k, {}])))[chave])[String(s.localidade.id)] = n;
        }
      }
    }
  }
  const anos = Object.keys(porAno).map(Number).sort((a, b) => b - a);
  return { ano: anos[0] ?? null, valores: porAno[anos[0]] || Object.fromEntries(Object.keys(ids.categorias).map(k => [k, {}])),
    ano_anterior: anos[1] ?? null, anterior: anos[1] ? porAno[anos[1]] : null };
}

export async function collectTabela(alvo, { fetchImpl } = {}) {
  const meta = await fetchWithRetry(`${BASE}/v3/agregados/${alvo.tabela}/metadados`, { fetchImpl });
  const ids = resolveIds(meta, alvo);
  const cats = Object.values(ids.categorias).join(',');
  const url = `${BASE}/v3/agregados/${alvo.tabela}/periodos/-2/variaveis/${ids.variavel}?localidades=N6[N3[${Object.keys(UFS).join(',')}]]&classificacao=${ids.classificacao}[${cats}]`;
  const json = await fetchWithRetry(url, { fetchImpl });
  const { ano, valores, ano_anterior, anterior } = parseValores(json, ids);
  const n = Object.values(valores).reduce((a, o) => a + Object.keys(o).length, 0);
  if (!n) throw new Error(`tabela ${alvo.tabela} respondeu sem valores municipais`);
  return { fonte: alvo.fonte, tabela: alvo.tabela, ano_referencia: ano, ano_anterior, unidade: ids.unidade, ids, url, valores, anterior, coletado_em: new Date().toISOString() };
}

export async function collectMunicipios({ fetchImpl } = {}) {
  const out = {};
  for (const [uf, sigla] of Object.entries(UFS)) {
    const lista = await fetchWithRetry(`${BASE}/v1/localidades/estados/${uf}/municipios`, { fetchImpl });
    for (const m of lista) out[String(m.id)] = { nome: m.nome, uf: sigla };
  }
  if (Object.keys(out).length < 100) throw new Error('lista de municípios incompleta');
  return out;
}

export async function collectMalha(uf, { fetchImpl } = {}) {
  const gj = await fetchWithRetry(`${BASE}/v3/malhas/estados/${uf}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`, { fetchImpl });
  if (gj?.type !== 'FeatureCollection' || !gj.features?.length) throw new Error(`malha da UF ${uf} inválida`);
  // Reduz precisão para 3 casas (~100 m) — suficiente para o mapa e deixa o arquivo leve.
  const arred = c => Array.isArray(c[0]) ? c.map(arred) : [+c[0].toFixed(3), +c[1].toFixed(3)];
  return { type: 'FeatureCollection', features: gj.features.map(f => ({ type: 'Feature', properties: { codarea: String(f.properties?.codarea) }, geometry: { type: f.geometry.type, coordinates: arred(f.geometry.coordinates) } })) };
}

/** Executa a coleta regional se os dados tiverem mais de `dias` dias (ou não existirem). */
export async function collectRegional(store, { fetchImpl, agora = new Date(), dias = 30, forcar = false } = {}) {
  const meta = store.readJSON('data/regional/meta.json') || {};
  if (!forcar && meta.ultima_coleta_ok && (agora - Date.parse(meta.ultima_coleta_ok)) / 864e5 < dias) {
    return { pulado: true, motivo: `dados regionais coletados em ${meta.ultima_coleta_ok.slice(0, 10)}; próxima coleta após ${dias} dias (fonte anual)` };
  }
  const res = { erros: [], ok: [] };
  const tenta = async (nome, fn) => { try { await fn(); res.ok.push(nome); } catch (e) { res.erros.push(`ibge ${nome}: ${e.message || e}${e.cause ? ` (causa: ${e.cause.code || ''} ${e.cause.message || e.cause})` : ''}`); } };
  await tenta('municipios', async () => store.writeJSON('data/regional/municipios.json', await collectMunicipios({ fetchImpl })));
  await tenta('pam', async () => store.writeJSON('data/regional/pam.json', await collectTabela(ALVOS.pam, { fetchImpl })));
  await tenta('ppm', async () => store.writeJSON('data/regional/ppm.json', await collectTabela(ALVOS.ppm, { fetchImpl })));
  for (const uf of Object.keys(UFS)) await tenta(`malha ${UFS[uf]}`, async () => store.writeJSON(`data/geo/uf-${uf}.json`, await collectMalha(uf, { fetchImpl })));
  if (!res.erros.length) meta.ultima_coleta_ok = agora.toISOString();
  meta.ultima_tentativa = agora.toISOString();
  meta.ultimos_erros = res.erros;
  store.writeJSON('data/regional/meta.json', meta);
  return res;
}
