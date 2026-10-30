// Inteligência regional: potencial ESTRUTURAL por município para cada marca.
// Estrutural = tamanho da atividade agrícola/pecuária (IBGE). NÃO é oportunidade comprovada:
// oportunidade comprovada só existe quando há registro no CRM.
//
// Crucianelli (plantadeiras): soma da área plantada de soja + milho + algodão (ha).
//   Milho 2ª safra ocupa a mesma terra da soja, mas é uma segunda operação de plantio — por isso soma.
// Piccin (preparo de solo, distribuidores): 60% percentil da área de lavouras (soja+milho+algodão+café)
//   + 40% percentil do rebanho bovino (proxy de pastagem para reforma e correção de solo).
// Notas 0–100 = percentil entre os municípios de MT, RO e AC com dado.

function rankPct(map) {
  const vals = Object.values(map).filter(Number.isFinite).sort((a, b) => a - b);
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    if (!Number.isFinite(v)) continue;
    let below = 0, eq = 0;
    for (const x of vals) { if (x < v) below++; else if (x === v) eq++; }
    out[k] = Math.round(((below + 0.5 * eq) / vals.length) * 100);
  }
  return out;
}

export function regionalPotential({ municipios, pam, ppm }) {
  if (!municipios || !pam) {
    return { disponivel: false, motivo: 'Dados municipais do IBGE ainda não coletados (a coleta roda no agendador da nuvem).', municipios: [] };
  }
  const V = pam.valores || {};
  const bov = ppm?.valores?.bovinos || {};
  const cods = Object.keys(municipios);
  const grao = {}, lavoura = {}, rebanho = {};
  for (const c of cods) {
    const s = V.soja?.[c], m = V.milho?.[c], a = V.algodao?.[c], cf = V.cafe?.[c];
    const temGrao = [s, m, a].some(Number.isFinite);
    if (temGrao) grao[c] = (s || 0) + (m || 0) + (a || 0);
    if (temGrao || Number.isFinite(cf)) lavoura[c] = (grao[c] || 0) + (cf || 0);
    if (Number.isFinite(bov[c])) rebanho[c] = bov[c];
  }
  const pCru = rankPct(grao), pLav = rankPct(lavoura), pReb = rankPct(rebanho);
  const lista = cods.map(c => {
    const piccinPartes = [];
    if (pLav[c] != null) piccinPartes.push([0.6, pLav[c]]);
    if (pReb[c] != null) piccinPartes.push([0.4, pReb[c]]);
    const pesoP = piccinPartes.reduce((x, [w]) => x + w, 0);
    return {
      codigo: c, nome: municipios[c].nome, uf: municipios[c].uf,
      soja_ha: V.soja?.[c] ?? null, milho_ha: V.milho?.[c] ?? null, algodao_ha: V.algodao?.[c] ?? null, cafe_ha: V.cafe?.[c] ?? null, bovinos_cab: bov[c] ?? null,
      potencial_crucianelli: pCru[c] ?? null,
      potencial_piccin: pesoP ? Math.round(piccinPartes.reduce((x, [w, v]) => x + w * v, 0) / pesoP) : null
    };
  });
  return {
    disponivel: true,
    ano_pam: pam.ano_referencia, ano_ppm: ppm?.ano_referencia ?? null,
    fontes: [pam.fonte, ppm?.fonte].filter(Boolean),
    metodo: 'Percentil entre municípios de MT, RO e AC. Crucianelli: área de soja+milho+algodão. Piccin: 60% lavouras + 40% rebanho bovino.',
    aviso: 'Potencial estrutural (tamanho da atividade). Não indica intenção de compra nem oportunidade comprovada.',
    municipios: lista
  };
}

export function topMunicipios(reg, marca, n = 10, uf = null) {
  if (!reg?.disponivel) return [];
  const k = marca === 'CRUCIANELLI' ? 'potencial_crucianelli' : 'potencial_piccin';
  return reg.municipios.filter(m => m[k] != null && (!uf || m.uf === uf)).sort((a, b) => b[k] - a[k] || (b.soja_ha || 0) - (a.soja_ha || 0)).slice(0, n);
}
