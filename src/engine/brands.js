// Inteligência comercial por fabricante — Piccin e Crucianelli, analisadas separadamente.
// Metodologia do índice por marca: docs/METODOLOGIA.md (seção "Índices por fabricante").
import { calendarNow } from './commercial.js';
import { topMunicipios } from './regional.js';

export const MAPA_CATEGORIA = { Descompactadores: 'preparo_solo', Grades: 'preparo_solo', Distribuidores: 'distribuicao', Plantadeiras: 'plantadeiras', 'Utilitários': null };
export const NOME_CAL = { preparo_solo: 'preparo de solo', distribuicao: 'distribuição de corretivos e fertilizantes', plantadeiras: 'plantio' };

export const COMPONENTES = {
  economia: { nome: 'Condições econômicas', peso: 0.20, origem: 'Blocos receita, custos, inflação e demanda do índice agrícola' },
  credito: { nome: 'Condições de crédito', peso: 0.15, origem: 'Bloco custo do capital (Selic e expectativa Focus)' },
  momento: { nome: 'Momento agrícola regional', peso: 0.20, origem: 'Janela de calendário mais forte para as categorias da marca' },
  aderencia: { nome: 'Aderência do portfólio', peso: 0.10, origem: '% dos produtos da marca cuja categoria está em janela de decisão de compra' },
  demanda: { nome: 'Perfil de demanda', peso: 0.10, origem: 'Variação da área (IBGE PAM, último ano × anterior) das culturas ligadas à marca' },
  sazonalidade: { nome: 'Sazonalidade de vendas', peso: 0.10, origem: 'Histórico de vendas da JR Agro no mês (CRM) — calculado no painel' },
  crm: { nome: 'Evidência de intenção de compra', peso: 0.15, origem: 'Oportunidades abertas no CRM, ponderadas pela etapa — calculado no painel' },
  regional: { nome: 'Potencial comercial regional', peso: 0, origem: 'Constante no curto prazo: usado para escolher a região (Prioridade 3), não para pontuar o dia' }
};
const PONTOS_JANELA = { 'MT:decisao_compra': 90, 'RO:decisao_compra': 70, 'AC:decisao_compra': 70, 'MT:em_uso': 55, 'RO:em_uso': 45, 'AC:em_uso': 45 };

const r1 = x => Math.round(x * 10) / 10;

export function brandProducts(produtos, marca) {
  return produtos.filter(p => p.fabricante === marca && p.marca_ativa !== false);
}

function economiaAgricola(agricola) {
  if (!agricola?.suficiente) return null;
  const b = agricola.blocos.filter(x => ['receita', 'custos', 'macro', 'demanda'].includes(x.id) && x.disponivel);
  const w = b.reduce((a, x) => a + x.peso, 0);
  return w ? 50 + 50 * b.reduce((a, x) => a + x.peso * x.sinal, 0) / w : null;
}
function economiaPecuaria(pecuaria) {
  if (!pecuaria?.suficiente) return null;
  const b = pecuaria.blocos.filter(x => ['receita_pec', 'custo_racao', 'custos_pec'].includes(x.id) && x.disponivel);
  const w = b.reduce((a, x) => a + x.peso, 0);
  return w ? 50 + 50 * b.reduce((a, x) => a + x.peso * x.sinal, 0) / w : null;
}
/**
 * Crucianelli (plantadeiras de grãos): só a economia agrícola.
 * Piccin (preparo de solo e corretivos também em pastagem): 70% agrícola + 30% pecuária, quando houver.
 */
function economia(marca, agricola, pecuaria) {
  const a = economiaAgricola(agricola), p = economiaPecuaria(pecuaria);
  if (marca === 'CRUCIANELLI') return a == null ? null : Math.round(a);
  if (a == null && p == null) return null;
  if (p == null) return Math.round(a);
  if (a == null) return Math.round(p);
  return Math.round(0.7 * a + 0.3 * p);
}
function credito(agricola) {
  const b = agricola?.blocos?.find(x => x.id === 'capital' && x.disponivel);
  return b ? Math.round(50 + 50 * b.sinal) : null;
}

function janelasMarca(produtos, calendar, mes) {
  const cats = [...new Set(produtos.map(p => MAPA_CATEGORIA[p.categoria]).filter(Boolean))];
  return calendarNow(calendar, mes).filter(j => j.categorias.some(c => cats.includes(c)));
}

function demanda(marca, pam, ppm) {
  if (!pam?.anterior) return { valor: null, motivo: 'Requer IBGE PAM de dois anos (coleta regional ainda não feita).' };
  const soma = (vals, cats) => cats.reduce((a, c) => a + Object.values(vals?.[c] || {}).reduce((x, y) => x + y, 0), 0);
  const cats = marca === 'CRUCIANELLI' ? ['soja', 'milho', 'algodao'] : ['soja', 'milho', 'algodao', 'cafe'];
  const atual = soma(pam.valores, cats), ant = soma(pam.anterior, cats);
  if (!ant) return { valor: null, motivo: 'Ano anterior sem área registrada.' };
  const cresc = (atual - ant) / ant * 100;
  // ±10% de variação da área ≈ extremos 0/100 (heurístico, documentado)
  const NOMES = { soja: 'soja', milho: 'milho', algodao: 'algodão', cafe: 'café' };
  return { valor: Math.round(Math.max(0, Math.min(100, 50 + cresc * 5))), detalhe: `Área de ${cats.map(c => NOMES[c]).join(', ')} em MT+RO+AC: ${pam.ano_anterior} → ${pam.ano_referencia}: ${cresc >= 0 ? '+' : ''}${cresc.toFixed(1).replace('.', ',')}% (IBGE PAM).` };
}

export function brandIndex({ marca, produtos, agricola, pecuaria, calendar, mes, regional, pam, ppm, metodo }) {
  const prods = brandProducts(produtos, marca);
  const jan = janelasMarca(prods, calendar, mes);
  const melhor = jan.map(j => ({ ...j, pontos: PONTOS_JANELA[`${j.uf}:${j.papel}`] ?? 30 })).sort((a, b) => b.pontos - a.pontos)[0];
  const decisaoCats = new Set(jan.filter(j => j.papel === 'decisao_compra').flatMap(j => j.categorias));
  const elegiveis = prods.filter(p => MAPA_CATEGORIA[p.categoria] && p.status !== 'pendente de validação');
  const dem = demanda(marca, pam, ppm);
  const comp = {
    economia: { valor: economia(marca, agricola, pecuaria), detalhe: marca === 'CRUCIANELLI'
      ? (agricola?.suficiente ? `Economia agrícola (receita, custos, inflação, demanda); índice agrícola ${agricola.valor}/100.` : 'Índice agrícola sem dados suficientes.')
      : `70% economia agrícola${agricola?.suficiente ? ` (índice ${agricola.valor})` : ' (sem dados)'} + 30% pecuária${pecuaria?.suficiente ? ` (índice ${pecuaria.valor})` : ' (sem dados)'} — portfólio também atende pastagem.` },
    credito: { valor: credito(agricola), detalhe: 'Selic e expectativa Focus (nível e movimento).' },
    momento: { valor: melhor ? melhor.pontos : 15, detalhe: melhor ? `${melhor.uf}: ${melhor.atividade} (${melhor.papel === 'decisao_compra' ? 'janela de decisão de compra' : 'equipamento em uso'}).` : 'Nenhuma janela do calendário de referência para as categorias da marca neste mês.' },
    aderencia: { valor: elegiveis.length ? Math.round(100 * elegiveis.filter(p => decisaoCats.has(MAPA_CATEGORIA[p.categoria])).length / elegiveis.length) : null,
      detalhe: `${elegiveis.filter(p => decisaoCats.has(MAPA_CATEGORIA[p.categoria])).length} de ${elegiveis.length} produtos em janela de decisão de compra.` },
    demanda: { valor: dem.valor, detalhe: dem.detalhe || dem.motivo },
    sazonalidade: { valor: null, detalhe: 'Calculado no painel a partir do histórico de vendas registrado no CRM (este aparelho).' },
    crm: { valor: null, detalhe: 'Calculado no painel a partir das oportunidades abertas no CRM (este aparelho).' },
    regional: { valor: null, detalhe: COMPONENTES.regional.origem }
  };
  const res = combine(comp, metodo);
  const top = topMunicipios(regional, marca, 5, 'MT').concat(topMunicipios(regional, marca, 2, 'RO'), topMunicipios(regional, marca, 1, 'AC'));
  return { marca, ...res, componentes: comp, janelas: jan, regioes: top, regional_disponivel: !!regional?.disponivel };
}

/** Combina componentes disponíveis. Usado no pipeline e de novo no painel (com CRM). */
export function combine(comp, metodo) {
  let w = 0, s = 0, wTot = 0;
  for (const [k, def] of Object.entries(COMPONENTES)) {
    if (!def.peso) continue;
    wTot += def.peso;
    const v = comp[k]?.valor;
    if (Number.isFinite(v)) { w += def.peso; s += def.peso * v; }
  }
  const cobertura = w / wTot;
  const minimo = metodo?.regras_gerais?.cobertura_minima ?? 0.5;
  const faltando = Object.entries(COMPONENTES).filter(([k, d]) => d.peso && !Number.isFinite(comp[k]?.valor)).map(([, d]) => d.nome);
  if (cobertura < minimo) return { valor: null, cobertura: r1(cobertura), confianca: 'insuficiente', motivo_confianca: `Cobertura ${Math.round(cobertura * 100)}% (mínimo ${minimo * 100}%). Faltam: ${faltando.join(', ')}.` };
  const valor = Math.round(s / w);
  const temRegional = Number.isFinite(comp.demanda?.valor), temCRM = Number.isFinite(comp.crm?.valor) || Number.isFinite(comp.sazonalidade?.valor);
  const confianca = cobertura >= 0.8 && temRegional && temCRM ? 'moderada' : 'baixa';
  const motivos = [`cobertura ${Math.round(cobertura * 100)}% dos pesos`];
  if (!temRegional) motivos.push('sem dado regional de área (IBGE)');
  if (!temCRM) motivos.push('sem histórico comercial no CRM');
  motivos.push('pesos heurísticos, não calibrados com vendas');
  const fatores = Object.entries(COMPONENTES).filter(([k, d]) => d.peso && Number.isFinite(comp[k]?.valor))
    .map(([k, d]) => ({ id: k, nome: d.nome, valor: comp[k].valor, detalhe: comp[k].detalhe, efeito: comp[k].valor - 50 }));
  return { valor, cobertura: r1(cobertura), confianca, motivo_confianca: motivos.join('; '), faltando,
    positivos: fatores.filter(f => f.efeito >= 10).sort((a, b) => b.efeito - a.efeito), negativos: fatores.filter(f => f.efeito <= -10).sort((a, b) => a.efeito - b.efeito) };
}

/** Porte do cliente a partir da potência do produto (catálogo). */
export function porte(cv) {
  // Mesma regra do perfil de cliente do catálogo (scripts/catalogo_build.py).
  if (cv <= 100) return 'pequeno/médio';
  if (cv < 200) return 'médio/grande';
  return 'grande';
}

/** Equipamento prioritário: categoria da marca com janela mais forte e, nela, uma opção por porte de trator. */
export function equipmentPriority({ marca, produtos, calendar, mes }) {
  // Opções por porte de TRATOR: linhas de caminhão, autopropelido e opcionais ficam fora (outro tipo de cliente).
  const FORA = ['Linha Caminhão', 'Linha Autopropelido', 'Opcionais'];
  const prods = brandProducts(produtos, marca).filter(p => p.status !== 'pendente de validação' && p.potencia_requerida_cv && !FORA.includes(p.subcategoria));
  const jan = calendarNow(calendar, mes);
  const forca = cat => Math.max(0, ...jan.filter(j => j.categorias.includes(cat)).map(j => PONTOS_JANELA[`${j.uf}:${j.papel}`] ?? 30));
  const porCat = {};
  for (const p of prods) { const c = MAPA_CATEGORIA[p.categoria]; if (c) (porCat[p.categoria] ||= { calendario: c, produtos: [] }).produtos.push(p); }
  const cats = Object.entries(porCat).map(([categoria, x]) => ({ categoria, calendario: x.calendario, forca: forca(x.calendario), produtos: x.produtos }))
    .sort((a, b) => b.forca - a.forca || b.produtos.length - a.produtos.length);
  const top = cats[0];
  if (!top) return null;
  const opcoes = {}, todos = {};
  for (const p of top.produtos) {
    const k = porte(p.potencia_requerida_cv.min);
    (todos[k] ||= []).push(p.modelo);
    // Destaque do porte: status confirmado e, depois, mais modelos na linha (mais opções para a revenda).
    const atual = opcoes[k];
    if (!atual || (p.status === 'confirmada' && atual.status !== 'confirmada') || (p.status === atual.status && p.variantes.length > atual.variantes.length)) opcoes[k] = p;
  }
  const janelaTxt = jan.filter(j => j.categorias.includes(top.calendario)).map(j => `${j.uf}: ${j.atividade}`);
  return {
    categoria: top.categoria, forca_calendario: top.forca, janelas: janelaTxt,
    motivo: janelaTxt.length ? `Categoria com a janela de calendário mais forte agora (${janelaTxt[0]}).` : 'Nenhuma categoria em janela de calendário neste mês; escolhida a de maior portfólio.',
    opcoes: ['pequeno/médio', 'médio/grande', 'grande'].filter(k => opcoes[k]).map(k => ({ porte: k, id: opcoes[k].id, modelo: opcoes[k].modelo, nome: opcoes[k].nome,
      potencia_cv: opcoes[k].potencia_requerida_cv, paginas: opcoes[k].pagina, status: opcoes[k].status, variantes: opcoes[k].variantes.length,
      outros_no_porte: todos[k].filter(m => m !== opcoes[k].modelo) })),
    outras_categorias: cats.slice(1).map(c => ({ categoria: c.categoria, forca_calendario: c.forca }))
  };
}
