// Alertas com critérios explícitos (config/alerts.json). Só disparam com dado atual.
import { pct, num, dataBR } from './format.js';

export function evaluateAlerts({ regras, cards, indices, diagnostico, anterior, saude, resultado = {} }) {
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
    } else if (r.tipo === 'catalogo') {
      if (!resultado.catalogo_alterado) continue;
      out.push({ id: r.id, prioridade: r.prioridade, canais: r.canais, titulo: 'Catálogo técnico atualizado', detalhe: 'A base de produtos Piccin/Crucianelli mudou desde a análise anterior. Revise recomendações e argumentos.' });
    } else if (r.tipo === 'regional') {
      if (!resultado.regional_novo_ano) continue;
      out.push({ id: r.id, prioridade: r.prioridade, canais: r.canais, titulo: `Novos dados regionais do IBGE (ano ${resultado.regional_novo_ano})`, detalhe: 'Área plantada e rebanho por município foram atualizados; o ranking de regiões pode ter mudado.' });
    } else if (r.tipo === 'marca') {
      const ant = anterior?.marcas, at = resultado.marcas?.indices;
      if (!ant || !at) continue;
      for (const m of ['PICCIN', 'CRUCIANELLI']) {
        if (ant[m] == null || at[m]?.valor == null || Math.abs(at[m].valor - ant[m]) < r.limite_pontos) continue;
        out.push({ id: `${r.id}_${m.toLowerCase()}`, prioridade: r.prioridade, canais: r.canais, titulo: `Índice ${m === 'PICCIN' ? 'Piccin' : 'Crucianelli'} ${at[m].valor > ant[m] ? 'subiu' : 'caiu'} ${Math.abs(at[m].valor - ant[m])} pontos`, detalhe: `${ant[m]} (${anterior.data}) → ${at[m].valor}. Limite: ${r.limite_pontos} pontos.` });
      }
    } else if (r.tipo === 'saude') {
      if (!saude || !saude.erros?.length) continue;
      out.push({ id: r.id, prioridade: r.prioridade, canais: r.canais, titulo: `Falha em ${saude.erros.length} coleta(s)`, detalhe: saude.erros.slice(0, 5).join(' | ') });
    }
  }
  const ordem = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
}
