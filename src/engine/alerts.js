// Alertas com critérios explícitos (config/alerts.json). Só disparam com dado atual.
import { pct, num, dataBR } from './format.js';

export function evaluateAlerts({ regras, cards, indices, diagnostico, anterior, saude }) {
  const out = [];
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));
  for (const r of regras) {
    if (r.tipo === 'variacao') {
      const c = byId[r.indicador];
      if (!c || c.status !== 'atual') continue;
      const v = c.variacoes?.[r.periodo];
      const emPP = r.limite_pp != null;
      const x = emPP ? v?.pp : v?.pct;
      if (!v || x == null || Math.abs(x) < (emPP ? r.limite_pp : r.limite_pct)) continue;
      const txt = emPP ? `${x > 0 ? '+' : ''}${num(x, 2)} p.p. (${num(v.valor_de, 2)}% → ${num(v.valor_para, 2)}%)` : pct(x);
      out.push({ id: r.id, prioridade: r.prioridade, canais: r.canais,
        titulo: `${c.nome}: ${txt} (${r.periodo})`,
        detalhe: `Entre ${dataBR(v.de)} e ${dataBR(v.para)}; limite configurado ±${emPP ? r.limite_pp + ' p.p.' : r.limite_pct + '%'}. Fonte: ${c.fonte}.` });
    } else if (r.tipo === 'indice') {
      const atual = indices.geral.valor, ant = anterior?.geral_valor;
      if (atual == null || ant == null || Math.abs(atual - ant) < r.limite_pontos) continue;
      out.push({ id: r.id, prioridade: r.prioridade, canais: r.canais, titulo: `Índice geral ${atual > ant ? 'subiu' : 'caiu'} ${Math.abs(atual - ant)} pontos`, detalhe: `${ant} (${anterior.data}) → ${atual}. Limite: ${r.limite_pontos} pontos.` });
    } else if (r.tipo === 'recomendacao') {
      if (!anterior || anterior.recomendacao === diagnostico.recomendacao) continue;
      out.push({ id: r.id, prioridade: r.prioridade, canais: r.canais, titulo: 'Mudou a recomendação do dia', detalhe: `"${anterior.recomendacao}" → "${diagnostico.recomendacao}". Revise o plano comercial.` });
    } else if (r.tipo === 'saude') {
      if (!saude || !saude.erros?.length) continue;
      out.push({ id: r.id, prioridade: r.prioridade, canais: r.canais, titulo: `Falha em ${saude.erros.length} coleta(s)`, detalhe: saude.erros.slice(0, 5).join(' | ') });
    }
  }
  const ordem = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
}
