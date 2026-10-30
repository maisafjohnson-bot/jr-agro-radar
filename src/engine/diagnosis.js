// Diagnóstico do dia: transforma o índice em recomendação + justificativa estruturada.
import { num, pct, dataBR, casasPara } from './format.js';

export const RECOMENDACOES = {
  INTENSIFICAR: 'INTENSIFICAR PROSPECÇÃO E VENDAS',
  QUALIFICADAS: 'PRIORIZAR OPORTUNIDADES QUALIFICADAS',
  CONVERSAO: 'TRABALHAR CONVERSÃO E NEGOCIAÇÕES EM ANDAMENTO',
  CAUTELA: 'ADOTAR UMA ABORDAGEM COMERCIAL MAIS CAUTELOSA',
  MONITORAR: 'MONITORAR O MERCADO ANTES DE AUMENTAR O ESFORÇO',
  INSUFICIENTE: 'DADOS INSUFICIENTES PARA RECOMENDAÇÃO CONFIÁVEL'
};

const IMPACTO_BLOCO = {
  receita: ['Produtor com receita esperada melhor tende a abrir espaço para conversar sobre renovação e ampliação.', 'Receita esperada sob pressão: produtor tende a adiar investimentos não urgentes.'],
  capital: ['Crédito tendendo a ficar menos caro favorece propostas com financiamento.', 'Crédito mais caro: propostas precisam se apoiar em linhas equalizadas e em necessidade real.'],
  custos: ['Alívio de custos melhora a margem do produtor.', 'Custos subindo apertam a margem e reduzem a folga para investir.'],
  macro: ['Inflação/expectativas em melhora abrem espaço para juros menores.', 'Inflação/expectativas piorando sustentam juros altos por mais tempo.'],
  demanda: ['Setor de máquinas com vendas em alta.', 'Setor de máquinas com vendas em queda.'],
  receita_pec: ['Pecuarista com receita melhor.', 'Pecuarista com receita pressionada.'],
  custo_racao: ['Alimentação animal mais barata melhora a margem do pecuarista.', 'Alimentação animal mais cara aperta a margem do pecuarista.'],
  capital_pec: ['Crédito tendendo a ficar menos caro.', 'Crédito mais caro.'],
  custos_pec: ['Alívio de custo operacional.', 'Custo operacional subindo.']
};

/** Fatos verificáveis: cada um carrega o texto exato e a origem. Mensagens comerciais só podem usar estes textos. */
export function buildFacts(cards) {
  const fatos = {};
  for (const c of cards) {
    if (c.valor === null || c.status !== 'atual') continue;
    const v = c.variacoes || {};
    const ref = v.mensal || v.semanal || v.anual;
    const casas = casasPara(c.unidade);
    const valorTxt = /^%/.test(c.unidade) ? `${num(c.valor, casas)}${c.unidade}` : `${num(c.valor, casas)} ${c.unidade}`;
    const fonteCurta = c.fonte.split(' — ')[0];
    const taxa = /%/.test(c.unidade); // para taxas, variação em pontos percentuais é mais honesta que "% de %"
    const un = taxa ? '%' : '';
    fatos[c.id] = {
      id: c.id,
      nivel: `${c.nome}: ${valorTxt} (${fonteCurta}, ref. ${dataBR(c.data_referencia)})`,
      variacao: ref ? (taxa
        ? `${c.nome} passou de ${num(ref.valor_de, casas)}${un} para ${num(ref.valor_para, casas)}${un} entre ${dataBR(ref.de)} e ${dataBR(ref.para)} (${fonteCurta})`
        : `${c.nome} variou ${pct(ref.pct)} entre ${dataBR(ref.de)} e ${dataBR(ref.para)} (${fonteCurta})`) : null,
      direcao: ref ? (ref.pct > 0.5 ? 'alta' : ref.pct < -0.5 ? 'queda' : 'estável') : null,
      // Versão para conversa (mesmos números, linguagem natural)
      msg: ref && taxa ? `${c.curto} ${ref.valor_para < ref.valor_de ? 'recuou' : ref.valor_para > ref.valor_de ? 'subiu' : 'ficou'} de ${num(ref.valor_de, casas)}% para ${num(ref.valor_para, casas)}% entre ${dataBR(ref.de).slice(0, 5)} e ${dataBR(ref.para).slice(0, 5)} (${fonteCurta})`
        : ref ? `${c.curto} ${ref.pct > 0.5 ? 'subiu' : ref.pct < -0.5 ? 'caiu' : 'ficou estável, variando'} ${num(Math.abs(ref.pct), 1)}% entre ${dataBR(ref.de).slice(0, 5)} e ${dataBR(ref.para).slice(0, 5)} (${fonteCurta})` : `${c.curto} está em ${valorTxt} (${fonteCurta}, ${dataBR(c.data_referencia)})`,
      tipo: c.tipo_dado
    };
  }
  return fatos;
}

export function diagnose({ geral, agricola, pecuaria, cards, metodo, agora, anterior }) {
  const fatos = buildFacts(cards);
  const cardById = Object.fromEntries(cards.map(c => [c.id, c]));
  let recomendacao, situacao;
  const contraditorio = !!(geral.contraditorio);
  if (!geral.suficiente) { recomendacao = RECOMENDACOES.INSUFICIENTE; situacao = 'inconclusivo'; }
  else {
    const v = geral.valor;
    situacao = contraditorio && v >= 40 && v < 70 ? 'misto (sinais contraditórios)' : v >= 60 ? 'favorável' : v < 40 ? 'desfavorável' : 'misto';
    if (geral.confianca === 'baixa') recomendacao = v < 40 ? RECOMENDACOES.CAUTELA : RECOMENDACOES.MONITORAR;
    else if (v >= 75 && geral.confianca === 'alta' && !contraditorio) recomendacao = RECOMENDACOES.INTENSIFICAR;
    else if (v >= 60 && !contraditorio) recomendacao = RECOMENDACOES.QUALIFICADAS;
    else if (v >= 45) recomendacao = RECOMENDACOES.CONVERSAO; // contraditório cai aqui: foco em quem já tem necessidade
    else recomendacao = RECOMENDACOES.CAUTELA;
  }

  const favor = [], contra = [], neutros = [];
  for (const [seg, idx] of [['agricola', agricola], ['pecuaria', pecuaria]]) {
    for (const b of idx.blocos) for (const v of b.variaveis) {
      if (!v.disponivel) continue;
      const c = cardById[v.id];
      const taxa = v.medida === 'pp';
      const varTxt = taxa
        ? `${v.variacao.pp > 0 ? '+' : ''}${num(v.variacao.pp, 2)} p.p. (${num(v.variacao.valor_de, 2)}% → ${num(v.variacao.valor_para, 2)}%, ${dataBR(v.variacao.de)} → ${dataBR(v.variacao.para)})`
        : `${pct(v.variacao.pct)} (${dataBR(v.variacao.de)} → ${dataBR(v.variacao.para)})`;
      const item = {
        id: v.id, chave: `${seg}:${v.id}`, segmento: seg, indicador: v.nome, curto: c.curto, bloco: b.nome,
        o_que_aconteceu: fatos[v.id]?.nivel,
        variacao: varTxt,
        periodo: `${dataBR(v.variacao.de)} a ${dataBR(v.variacao.para)}`,
        fonte: c.fonte, fonte_url: c.fonte_url,
        porque_importa: v.porque,
        impacto_comercial: (IMPACTO_BLOCO[b.id] || ['', ''])[v.sinal >= 0 ? 0 : 1],
        limitacoes: [
          v.qualidade === 'limitada' ? 'Histórico curto: intensidade do movimento não comparada com o passado.' : `Movimento recente no percentil ${Math.round(v.percentil * 100)} das variações passadas desta série.`,
          v.percentil_nivel != null ? `Nível atual no percentil ${Math.round(v.percentil_nivel * 100)} dos últimos 10 anos${v.percentil_nivel > 0.7 ? ' (alto, mesmo que esteja caindo)' : v.percentil_nivel < 0.3 ? ' (baixo)' : ''}.` : null,
          /^(receita|receita_pec)$/.test(b.id) && v.sinal > 0 ? 'Preço maior não significa caixa disponível: depende de quanto já foi vendido antecipadamente, dos custos e do endividamento de cada produtor.' : null,
          /^Brasil/.test(c.abrangencia) ? 'Dado nacional — não reflete necessariamente MT, RO ou AC.' : `Abrangência: ${c.abrangencia}.`,
          c.tipo_dado === 'expectativa' ? 'É expectativa de mercado, não fato.' : null,
          'Associação econômica esperada, não causalidade comprovada nas vendas da JR Agro.'
        ].filter(Boolean),
        forca: Math.abs(v.sinal)
      };
      if (v.sinal > 0.15) favor.push(item); else if (v.sinal < -0.15) contra.push(item); else neutros.push(item);
    }
  }
  favor.sort((a, b) => b.forca - a.forca); contra.sort((a, b) => b.forca - a.forca);

  const usd = cardById.usd_brl;
  const contexto = usd && usd.valor !== null ? [{ id: 'usd_brl', texto: fatos.usd_brl ? `${fatos.usd_brl.nivel}${fatos.usd_brl.variacao ? '; ' + fatos.usd_brl.variacao : ''}.` : null, nota: metodo.indices.agricola.contexto_ambiguo[0].porque }] : [];

  const resumo = buildSummary({ recomendacao, situacao, geral, favor, contra, agricola, pecuaria });
  const mudancas = anterior ? compareWithPrevious(anterior, { geral, recomendacao }) : ['Primeira análise registrada — sem base de comparação.'];

  return {
    data_analise: agora,
    situacao, recomendacao,
    confianca: geral.confianca, criterio_confianca: geral.motivo_confianca,
    resumo_executivo: resumo,
    fatores_favoraveis: favor, fatores_desfavoraveis: contra, fatores_neutros: neutros,
    contexto_ambiguo: contexto,
    sinais_contraditorios: contraditorio,
    mudancas_vs_anterior: mudancas,
    fatos
  };
}

function buildSummary({ recomendacao, situacao, geral, favor, contra, agricola, pecuaria }) {
  if (recomendacao === RECOMENDACOES.INSUFICIENTE) {
    return 'Ainda não há dados suficientes e atuais para classificar o mercado com segurança. O painel mostra os indicadores disponíveis, mas não emite nota. A ação mais racional é seguir com o trabalho de rotina (negociações em andamento e relacionamento) e completar os dados que faltam — principalmente preços regionais de soja, milho e boi.';
  }
  // Uma variável pode ajudar um segmento e prejudicar outro (milho: receita agrícola × ração): explicita o segmento.
  const ambos = new Set(favor.map(x => x.id).filter(id => contra.some(y => y.id === id)));
  const rotulo = x => `${(x.curto || x.indicador.toLowerCase())}${ambos.has(x.id) ? (x.segmento === 'agricola' ? ' (para a agricultura)' : ' (para a pecuária)') : ''}`;
  const nomes = arr => [...new Set(arr.map(rotulo))].slice(0, 2).join(' e ');
  const f = nomes(favor), c = nomes(contra);
  let t = `Índice geral em ${geral.valor}/100 (${geral.classificacao.toLowerCase()}), confiança ${geral.confianca}. `;
  if (f) t += `Pesam a favor: ${f}. `;
  if (c) t += `Pesam contra: ${c}. `;
  if (!f && !c) t += 'Nenhum indicador teve movimento forte em relação ao próprio histórico. ';
  if (geral.contraditorio) t += 'Os sinais são contraditórios — há forças relevantes nos dois sentidos —, por isso a recomendação é concentrar esforço em quem já tem necessidade definida, não ampliar a prospecção. ';
  if (geral.divergencia_segmentos) t += `Agricultura (${agricola.valor}) e pecuária (${pecuaria.valor}) estão em momentos diferentes; veja as oportunidades por segmento. `;
  if (favor.some(x => /^Receita/.test(x.bloco))) t += 'Preço de commodity em alta melhora a perspectiva de receita, mas não equivale a dinheiro disponível para investir. ';
  t += `Leitura do dia: ${situacao}. Isso descreve o ambiente, não é previsão de venda — a decisão de cada cliente depende da situação financeira e operacional dele.`;
  return t;
}

function compareWithPrevious(ant, atual) {
  const out = [];
  if (ant.geral_valor == null && atual.geral.valor != null) out.push('O índice geral passou a ter base suficiente para cálculo.');
  else if (ant.geral_valor != null && atual.geral.valor == null) out.push('O índice geral deixou de ter base suficiente (dados ausentes ou desatualizados).');
  else if (ant.geral_valor != null) {
    const d = atual.geral.valor - ant.geral_valor;
    out.push(d === 0 ? `Índice geral estável em ${atual.geral.valor} (anterior: ${dataBR(ant.data)}).` : `Índice geral ${d > 0 ? 'subiu' : 'caiu'} ${Math.abs(d)} ponto(s) desde ${dataBR(ant.data)} (${ant.geral_valor} → ${atual.geral.valor}).`);
  }
  if (ant.recomendacao !== atual.recomendacao) out.push(`Recomendação mudou de "${ant.recomendacao}" para "${atual.recomendacao}".`);
  return out;
}
