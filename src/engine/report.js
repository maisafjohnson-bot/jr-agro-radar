// JR AGRO RADAR — RELATÓRIO DIÁRIO (Markdown). Curto na abertura, rastreável no anexo.
// Rótulos: [Fato observado] [Cálculo] [Interpretação] [Hipótese comercial] [Recomendação].
import { num, pct, dataBR, casasPara } from './format.js';

const NOME = { PICCIN: 'Piccin', CRUCIANELLI: 'Crucianelli' };

export function buildReport(r) {
  const { diagnostico: d, indices: ix, cards } = r;
  const M = r.marcas;
  const L = [], p = s => L.push(s);
  p('# JR AGRO RADAR — RELATÓRIO DIÁRIO');
  p(`**Análise:** ${dataBR(d.data_analise)} ${d.data_analise.slice(11, 16)} UTC · Metodologia ${ix.agricola.versao} (experimental)\n`);

  p('## 1. Cenário econômico e agrícola');
  p(`**${d.recomendacao}** · situação ${d.situacao} · confiança ${d.confianca}`);
  p(`_[Cálculo]_ Índice geral ${ix.geral.suficiente ? `${ix.geral.valor}/100 (${ix.geral.classificacao})` : 'sem nota (dados insuficientes)'}; agrícola ${ix.agricola.valor ?? '—'}; pecuário ${ix.pecuaria.valor ?? '—'}.`);
  p(`\n_[Interpretação]_ ${d.resumo_executivo}`);
  const fav = d.fatores_favoraveis.slice(0, 3), con = d.fatores_desfavoraveis.slice(0, 3);
  if (fav.length) p(`\n**A favor:** ${fav.map(f => `${f.indicador} (${f.variacao})`).join('; ')}.`);
  if (con.length) p(`**Contra:** ${con.map(f => `${f.indicador} (${f.variacao})`).join('; ')}.`);

  if (M) {
    for (const [i, m] of [[2, 'PICCIN'], [3, 'CRUCIANELLI']]) {
      const I = M.indices[m];
      p(`\n## ${i}. Situação comercial da ${NOME[m]}`);
      p(`_[Cálculo]_ Índice ${NOME[m]}: ${I.valor ?? 'sem nota'}${I.variacao != null ? ` (${I.variacao >= 0 ? '+' : ''}${I.variacao} vs. ${dataBR(I.anterior.data)})` : ''} · confiança ${I.confianca}.`);
      if (I.positivos?.length) p(`- A favor: ${I.positivos.map(f => `${f.nome} (${f.valor}) — ${f.detalhe}`).join(' ')}`);
      if (I.negativos?.length) p(`- Contra: ${I.negativos.map(f => `${f.nome} (${f.valor}) — ${f.detalhe}`).join(' ')}`);
      if (I.faltando?.length) p(`- Sem dado: ${I.faltando.join(', ')}.`);
      const eq = M.plano.por_marca[m].equipamento;
      if (eq) p(`- _[Hipótese comercial]_ Categoria com mais aderência agora: **${eq.categoria}** — ${eq.motivo}`);
    }
    p('\n## 4. Índice de oportunidade por fabricante _[Cálculo]_');
    p('| Componente | Piccin | Crucianelli |');
    p('|---|---|---|');
    for (const k of Object.keys(M.indices.PICCIN.componentes)) {
      p(`| ${k}${k === 'regional' ? ' (peso 0: usado na região)' : ''} | ${M.indices.PICCIN.componentes[k].valor ?? '—'} | ${M.indices.CRUCIANELLI.componentes[k].valor ?? '—'} |`);
    }
    p(`| **Índice** | **${M.indices.PICCIN.valor ?? '—'}** | **${M.indices.CRUCIANELLI.valor ?? '—'}** |`);
    p('\nO índice descreve o ambiente para cada marca; não é intenção de compra confirmada nem probabilidade de venda.');

    const pl = M.plano;
    p('\n## 5. Regiões prioritárias');
    if (pl.regiao.municipios.length) p(pl.regiao.municipios.map(x => `- ${x.nome} (${x.uf}) — potencial ${x.potencial}${x.soja_ha ? `; soja ${num(x.soja_ha, 0)} ha` : ''}${x.bovinos_cab ? `; bovinos ${num(x.bovinos_cab, 0)} cab.` : ''}`).join('\n'));
    else p(`- ${pl.regiao.texto}`);
    p(`\n${pl.regiao.porque}`);

    p('\n## 6. Equipamentos recomendados _[Hipótese comercial]_');
    for (const m of ['PICCIN', 'CRUCIANELLI']) {
      const eq = pl.por_marca[m].equipamento;
      if (eq) p(`- **${NOME[m]} — ${eq.categoria}:** ${eq.opcoes.map(o => `${o.modelo} (${o.porte}, ${o.potencia_cv.min}–${o.potencia_cv.max} ${m === 'CRUCIANELLI' ? 'HP' : 'cv'}, p. ${o.paginas.join(', ')})`).join('; ')}`);
    }

    p('\n## 7. Perfil de clientes a prospectar');
    p(`- ${pl.perfil_cliente.publicos.join('; ')} — ${pl.perfil_cliente.portes.join(', ')}.`);
    p(`- ${pl.perfil_cliente.porque}`);
  }

  p(`\n## ${M ? 8 : 2}. Principais oportunidades identificadas`);
  for (const o of r.oportunidades || []) p(`- ${o.titulo}${o.indice != null ? ` (índice ${o.indice})` : ''}`);
  for (const s of d.sinais_momento_compra || []) p(`- _[Hipótese comercial]_ ${s.tipo}: ${s.texto}`);

  p(`\n## ${M ? 9 : 3}. Riscos e pontos de atenção`);
  const obs = (r.oportunidades || []).find(o => o.objecoes)?.objecoes || [];
  for (const o of obs.slice(0, 4)) p(`- "${o.objecao}" — ${o.resposta}`);
  const aus = cards.filter(c => c.valor === null).map(c => c.nome);
  if (aus.length) p(`- Sem dados: ${aus.join(', ')}.`);
  if (M && !M.regional.disponivel) p(`- ${M.regional.motivo}`);

  p(`\n## ${M ? 10 : 4}. Plano de ação comercial _[Recomendação]_`);
  if (M) {
    const pl = M.plano;
    p(`1. **Marca:** ${pl.prioridade_marca.nome} — ${pl.prioridade_marca.porque}`);
    if (pl.equipamento) p(`2. **Equipamento:** ${pl.equipamento.recomendado?.modelo || pl.equipamento.categoria} — ${pl.equipamento.porque}`);
    p(`3. **Região:** ${pl.regiao.municipios.slice(0, 3).map(x => x.nome).join(', ') || pl.regiao.texto}.`);
    p(`4. **Perfil:** ${pl.perfil_cliente.portes.join(', ')}.`);
    p(`5. **Ação:** ${pl.acoes.map(a => a.texto).join(' / ')}`);
  } else {
    for (const a of r.plano) p(`${a.prioridade}. **${a.titulo}** — ${a.proximo_passo}`);
  }

  p(`\n## ${M ? 11 : 5}. Mensagens comerciais sugeridas`);
  const arg = M?.plano?.argumentos;
  if (arg) {
    p(`**Revenda (${arg.fabricante === 'PICCIN' ? 'Piccin' : 'Crucianelli'} ${arg.modelo}):**\n> ${arg.revenda.whatsapp}`);
    p(`\n**Produtor:**\n> ${arg.produtor.whatsapp}`);
  } else {
    p(`**Revenda:**\n> ${r.mensagens.revenda}\n\n**Produtor:**\n> ${r.mensagens.produtor}`);
  }

  p('\n## Anexo — indicadores, fontes e limitações _[Fato observado]_');
  p('| Indicador | Valor | Ref. | Variação | Fonte | Status |');
  p('|---|---|---|---|---|---|');
  for (const c of cards) {
    const v = c.variacoes?.mensal || c.variacoes?.semanal || c.variacoes?.anual;
    const taxa = /%/.test(c.unidade);
    const valTxt = c.valor === null ? '—' : `${num(c.valor, casasPara(c.unidade))}${/^%/.test(c.unidade) ? '' : ' '}${c.unidade}`;
    const varTxt = !v ? '—' : taxa ? `${v.pp > 0 ? '+' : ''}${num(v.pp, 2)} p.p.` : pct(v.pct);
    p(`| ${c.nome} | ${valTxt} | ${dataBR(c.data_referencia)} | ${varTxt} | ${c.fonte.split(' — ')[0]} | ${c.status} |`);
  }
  if (M) p(`\nCatálogo técnico: ${M.catalogo.produtos} produtos (Piccin ${M.catalogo.por_fabricante.PICCIN}, Crucianelli ${M.catalogo.por_fabricante.CRUCIANELLI}). Dados regionais: ${M.regional.disponivel ? `IBGE PAM ${M.regional.ano_pam}, PPM ${M.regional.ano_ppm}` : 'não coletados'}.`);
  p(`O índice é heurístico (v. ${ix.agricola.versao}) e não representa probabilidade de venda nem recomendação financeira.`);
  return L.join('\n');
}
