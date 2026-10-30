// Análise pura (sem rede, sem disco): recebe séries e configurações, devolve o resultado completo.
import { buildCards } from './engine/indicators.js';
import { computeIndex, computeGeneral } from './engine/index.js';
import { diagnose } from './engine/diagnosis.js';
import { prioritizeCategories, buildPlan, buildMessages, buildOpportunities, purchaseTimingSignals } from './engine/commercial.js';
import { buildReport } from './engine/report.js';

/** Tendência do índice geral: média dos 5 dias mais recentes vs. os 5 anteriores (1 leitura por dia). */
export function indexTrend(historico, hoje, valorHoje) {
  const porDia = new Map();
  for (const h of historico || []) if (h.data !== hoje && h.geral_valor != null) porDia.set(h.data, h.geral_valor);
  if (valorHoje != null) porDia.set(hoje, valorHoje);
  const vals = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  if (vals.length < 10) return { status: 'insuficiente', texto: `Tendência do índice exige 10 dias com nota; há ${vals.length}.`, dias: vals.length };
  const rec = vals.slice(-5), ant = vals.slice(-10, -5);
  const m = a => a.reduce((x, y) => x + y, 0) / a.length;
  const d = m(rec) - m(ant);
  const rotulo = Math.abs(d) < 3 ? 'estável' : d > 0 ? 'melhorando' : 'piorando';
  return { status: 'ok', rotulo, diferenca: +d.toFixed(1), texto: `Média dos últimos 5 dias: ${m(rec).toFixed(0)}; 5 dias anteriores: ${m(ant).toFixed(0)} (${rotulo}).`, dias: vals.length };
}

export function analyze({ sources, series, metodo, catalog, calendar, agora, anterior = null, historico = [] }) {
  const hoje = agora.slice(0, 10);
  const mes = Number(hoje.slice(5, 7));
  const byId = Object.fromEntries(sources.map(s => [s.id, s]));
  const cards = buildCards(sources, series, hoje, metodo.regras_gerais);
  const agricola = computeIndex(metodo.indices.agricola, byId, series, metodo, hoje);
  const pecuaria = computeIndex(metodo.indices.pecuaria, byId, series, metodo, hoje);
  const geral = computeGeneral(agricola, pecuaria, metodo);
  const diagnostico = diagnose({ geral, agricola, pecuaria, cards, metodo, agora, anterior });
  diagnostico.tendencia_indice = indexTrend(historico, hoje, geral.valor);
  diagnostico.sinais_momento_compra = purchaseTimingSignals(diagnostico, agricola);
  const categorias = prioritizeCategories({ catalog, calendar, mes, agricola, pecuaria });
  const oportunidades = buildOpportunities({ diag: diagnostico, indices: { agricola, pecuaria }, categorias });
  const plano = buildPlan({ diag: diagnostico, categorias, oportunidades });
  const mensagens = buildMessages({ diag: diagnostico, categorias, mes, oportunidades });
  const out = {
    gerado_em: agora, metodologia: { versao: metodo.versao, status: metodo.status },
    indices: { geral, agricola, pecuaria }, diagnostico, cards, categorias, oportunidades, plano, mensagens,
    anterior
  };
  out.boletim_md = buildReport(out);
  return out;
}
