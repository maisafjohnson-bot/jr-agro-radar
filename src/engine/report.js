// Boletim diário em Markdown, separando Fato / Cálculo / Interpretação / Hipótese / Recomendação.
import { num, pct, dataBR, casasPara } from './format.js';

export function buildReport(r) {
  const { diagnostico: d, indices: ix, cards, categorias, plano, mensagens } = r;
  const L = [];
  const p = s => L.push(s);
  p(`# JR AGRO — BOLETIM ECONÔMICO E COMERCIAL`);
  p(`**Análise:** ${dataBR(d.data_analise)} ${d.data_analise.slice(11, 16)} UTC · Metodologia ${ix.geral.versao || ix.agricola.versao} (experimental)\n`);
  p(`## 1. Resumo executivo`);
  p(`**${d.recomendacao}** · Situação: ${d.situacao} · Confiança: ${d.confianca}`);
  p(`\n_[Interpretação]_ ${d.resumo_executivo}\n`);
  p(`## 2–3. Índices de oportunidade _[Cálculo]_`);
  for (const k of ['geral', 'agricola', 'pecuaria']) {
    const i = ix[k];
    p(`- **${i.nome}:** ${i.suficiente ? `${i.valor}/100 — ${i.classificacao}` : 'sem nota (dados insuficientes)'} · confiança ${i.confianca}${i.cobertura !== undefined ? ` · cobertura ${(i.cobertura * 100).toFixed(0)}%` : ''}`);
  }
  p(`\nCritério de confiança: ${d.criterio_confianca}\n`);
  p(`## 4. Indicadores _[Fato observado]_`);
  p(`| Indicador | Valor | Ref. | Variação | Fonte | Status |`);
  p(`|---|---|---|---|---|---|`);
  for (const c of cards) {
    const v = c.variacoes?.mensal || c.variacoes?.semanal || c.variacoes?.anual;
    const taxa = /%/.test(c.unidade);
    const valTxt = c.valor === null ? '—' : `${num(c.valor, casasPara(c.unidade))}${/^%/.test(c.unidade) ? '' : ' '}${c.unidade}`;
    const varTxt = !v ? '—' : taxa ? `${v.pp > 0 ? '+' : ''}${num(v.pp, 2)} p.p.` : pct(v.pct);
    p(`| ${c.nome} | ${valTxt} | ${dataBR(c.data_referencia)} | ${varTxt} | ${c.fonte.split(' — ')[0]} | ${c.status} |`);
  }
  p(`\n## 5. Fatores favoráveis`);
  if (!d.fatores_favoraveis.length) p('_Nenhum fator favorável forte nos dados disponíveis._');
  for (const f of d.fatores_favoraveis) p(`- **${f.indicador}** — ${f.o_que_aconteceu}; variação ${f.variacao}. _[Interpretação]_ ${f.porque_importa} _Limitações:_ ${f.limitacoes.join(' ')}`);
  p(`\n## 6. Fatores desfavoráveis`);
  if (!d.fatores_desfavoraveis.length) p('_Nenhum fator desfavorável forte nos dados disponíveis._');
  for (const f of d.fatores_desfavoraveis) p(`- **${f.indicador}** — ${f.o_que_aconteceu}; variação ${f.variacao}. _[Interpretação]_ ${f.porque_importa} _Limitações:_ ${f.limitacoes.join(' ')}`);
  if (d.contexto_ambiguo.length) { p(`\n**Contexto (efeito ambíguo, fora da nota):**`); for (const c of d.contexto_ambiguo) p(`- ${c.texto} ${c.nota}`); }
  p(`\n## 7. Mudanças em relação à análise anterior`);
  for (const m of d.mudancas_vs_anterior) p(`- ${m}`);
  if (d.tendencia_indice) p(`- ${d.tendencia_indice.texto}`);
  if (d.sinais_momento_compra?.length) { p(`\n**Sinais de momento de compra _[Hipótese comercial]_:**`); for (const s of d.sinais_momento_compra) p(`- ${s.tipo}: ${s.texto} Cuidado: ${s.cuidado}`); }
  p(`\n## 10–11. Oportunidades por segmento _[Hipótese comercial]_`);
  for (const o of r.oportunidades || []) {
    if (o.status === 'sem dados') { p(`- **${o.titulo}**`); continue; }
    p(`- **${o.titulo}** (índice ${o.indice}, ${o.status}) — público: ${o.publico}; região: ${o.regiao} (${o.base_regiao}). Argumento: ${o.argumento_central}${o.evidencias.length ? ' Base: ' + o.evidencias.join('; ') + '.' : ''}`);
  }
  p(`\n**Categorias por aderência:**`);
  for (const c of categorias.slice(0, 3)) p(`- **${c.nome}** (${c.pontos} pts${c.marcas.length ? ' · ' + c.marcas.join(', ') : ''}): ${c.motivos.join('; ')}`);
  p(`\n## 12. Plano comercial de hoje _[Recomendação]_`);
  for (const a of plano) p(`${a.prioridade}. **${a.titulo}** (${a.execucao}) — ${a.motivo} Próximo passo: ${a.proximo_passo}`);
  p(`\n## 13. Mensagens sugeridas`);
  p(`**Revenda:**\n> ${mensagens.revenda}\n\n**Produtor:**\n> ${mensagens.produtor}\n\n**Abertura de ligação:** ${mensagens.abertura_ligacao}\n\n**Pergunta de diagnóstico:** ${mensagens.pergunta_diagnostico}\n\n**Próximo passo:** ${mensagens.proximo_passo}`);
  p(`\n## 14. Riscos e objeções previsíveis`);
  const obs = (r.oportunidades || []).find(o => o.objecoes)?.objecoes || [];
  for (const o of obs) p(`- "${o.objecao}" — ${o.resposta}${o.base ? ` _(base: ${o.base})_` : ''}`);
  p(`\n## 15. Acompanhar`);
  p([...d.fatores_favoraveis, ...d.fatores_desfavoraveis].map(f => `- ${f.indicador}`).join('\n') || '- Completar indicadores manuais.');
  p(`\n## 16. Fontes e limitações`);
  for (const c of cards.filter(c => c.valor !== null)) p(`- ${c.nome}: ${c.fonte} (${c.fonte_url}) — ref. ${dataBR(c.data_referencia)}${c.aviso?.length ? ' — ' + c.aviso.join(' ') : ''}`);
  const aus = cards.filter(c => c.valor === null).map(c => c.nome);
  if (aus.length) p(`- **Sem dados:** ${aus.join(', ')}.`);
  p(`- O índice é heurístico (v. ${ix.agricola.versao}) e não representa probabilidade de venda nem recomendação financeira.`);
  return L.join('\n');
}
