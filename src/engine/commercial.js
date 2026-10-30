// Inteligência comercial: oportunidades por segmento, plano do dia, objeções e mensagens.
// Regras:
//  - toda afirmação econômica numa mensagem vem de `diag.fatos` (dado coletado, com fonte e data);
//  - nada de urgência falsa, escassez, previsão de preço ou condição de financiamento não confirmada;
//  - preço de commodity em alta NÃO é tratado como caixa disponível: a mensagem pergunta, não presume.
import { RECOMENDACOES as R } from './diagnosis.js';

const MES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const SEGMENTO_VARS = {
  agricola: ['soja_mt', 'milho_mt', 'icbr_agro', 'selic_meta', 'focus_selic_prox_ano', 'diesel_mt', 'fertilizante', 'maquinas_vendas', 'ipca_12m', 'focus_ipca_prox_ano'],
  pecuaria: ['boi_gordo', 'milho_mt', 'selic_meta', 'focus_selic_prox_ano', 'diesel_mt']
};

// Região sugerida por PERFIL PRODUTIVO (conhecimento estrutural), não por indicador regional automático.
const REGIAO = {
  agricola: { texto: 'MT — praças de soja e milho (Médio-Norte, Norte e Oeste); RO — Cone Sul', base: 'perfil produtivo conhecido das regiões; ainda não há indicador regional automático' },
  pecuaria: { texto: 'RO e AC; Norte e Noroeste de MT', base: 'regiões de pecuária bovina relevante; ainda não há indicador regional automático' }
};

export function calendarNow(calendar, mes) {
  const out = [];
  for (const [uf, janelas] of Object.entries(calendar.janelas)) for (const j of janelas) if (j.meses.includes(mes)) out.push({ uf, ...j });
  return out;
}

export function prioritizeCategories({ catalog, calendar, mes, agricola, pecuaria }) {
  const ativos = calendarNow(calendar, mes);
  return catalog.categorias.filter(c => c.ativo).map(cat => {
    const janelas = ativos.filter(j => j.categorias.includes(cat.id));
    let pontos = 0; const motivos = [];
    for (const j of janelas) {
      pontos += (j.papel === 'decisao_compra' ? 2 : 1) * (j.uf === 'MT' ? 1 : 0.6);
      motivos.push(`${j.uf}: ${j.atividade} (${j.papel === 'decisao_compra' ? 'janela de decisão de compra' : 'equipamento em uso — bom para demonstração e levantar gargalos'})`);
    }
    if (!janelas.length) motivos.push(`Sem janela de calendário relevante em ${MES[mes]}`);
    const idx = cat.segmento === 'pecuaria' ? pecuaria : agricola;
    if (idx.suficiente) { pontos += (idx.valor - 50) / 25; motivos.push(`Índice ${cat.segmento === 'pecuaria' ? 'pecuário' : 'agrícola'}: ${idx.valor}/100`); }
    else motivos.push(`Índice ${cat.segmento === 'pecuaria' ? 'pecuário' : 'agrícola'} sem dados suficientes — prioridade só pelo calendário`);
    const marcas = catalog.marcas.filter(m => m.ativo && m.categorias.includes(cat.id)).map(m => m.nome);
    return { id: cat.id, nome: cat.nome, termo: cat.termo, produto: cat.produto || cat.nome.toLowerCase(), segmento: cat.segmento, pontos: +pontos.toFixed(2), motivos, marcas,
      janela_compra: janelas.some(j => j.papel === 'decisao_compra'),
      natureza: 'Hipótese comercial a validar — a relação entre calendário/indicadores e demanda ainda não foi testada com vendas da JR Agro.' };
  }).sort((a, b) => b.pontos - a.pontos);
}

const fatosPara = (diag, ids) => ids.map(id => diag.fatos[id]).filter(Boolean);
function fatosFavoraveis(diag, segmento, n = 2) {
  const ok = new Set(SEGMENTO_VARS[segmento] || []);
  const ids = [...new Set(diag.fatores_favoraveis.filter(f => f.segmento === segmento && ok.has(f.id)).map(f => f.id))];
  return fatosPara(diag, ids).slice(0, n);
}

/** Objeções previsíveis, ligadas aos dados do dia quando possível. */
export function objections({ diag, indice, segmento }) {
  const out = [];
  const vars = (indice.blocos || []).flatMap(b => b.variaveis.map(v => ({ ...v, bloco: b.id })));
  const selic = vars.find(v => v.id === 'selic_meta' && v.disponivel);
  const focus = vars.find(v => v.id === 'focus_selic_prox_ano' && v.disponivel);
  if (selic?.percentil_nivel > 0.7) out.push({ objecao: 'Os juros estão altos demais para financiar agora.', base: diag.fatos.selic_meta?.nivel, resposta: 'Não discutir a Selic: levantar as linhas equalizadas disponíveis para o cliente (Plano Safra/BNDES via banco ou cooperativa) e comparar com o custo de seguir com o equipamento atual. Só citar taxa depois de confirmada pelo agente financeiro.' });
  if (focus && focus.variacao.valor < 0) out.push({ objecao: 'Vou esperar os juros caírem mais.', base: diag.fatos.focus_selic_prox_ano?.variacao, resposta: 'Expectativa não é garantia. Perguntar quanto custa adiar (perda de rendimento, paradas, janela de plantio) e se a decisão pode ser preparada agora para fechar quando fizer sentido.' });
  if (vars.some(v => /^receita/.test(v.bloco) && v.disponivel && v.sinal > 0.15)) out.push({ objecao: 'Ainda não vendi a safra / meu caixa está comprometido.', base: 'Preço em alta não significa caixa disponível.', resposta: 'Perguntar forma de pagamento pretendida, prazo e se há venda futura ou barter; não presumir capacidade de investimento.' });
  if (vars.some(v => /^custos/.test(v.bloco) && v.disponivel && v.sinal < -0.15)) out.push({ objecao: 'Os custos de produção estão subindo.', base: fatosPara(diag, ['diesel_mt', 'fertilizante']).map(f => f.variacao || f.nivel).join('; ') || null, resposta: 'Levar o argumento de eficiência operacional (rendimento, menos passadas, menos paradas) — com números do próprio equipamento, não promessas.' });
  out.push({ objecao: 'Meu equipamento ainda aguenta mais uma safra.', base: null, resposta: 'Perguntar quantas paradas teve na última safra e quanto custaram; se não há perda relevante, registrar a data prevista de renovação e retomar no momento certo.' });
  if (segmento === 'pecuaria') out.push({ objecao: 'Na seca eu resolvo com o que tenho.', base: null, resposta: 'Perguntar quanto tempo e mão de obra o trato consome hoje e qual o plano de suplementação para a próxima seca.' });
  return out;
}

/** Sinais de antecipação ou adiamento de compras (hipóteses, com evidência). */
export function purchaseTimingSignals(diag, agricola) {
  const out = [];
  const v = (agricola.blocos || []).flatMap(b => b.variaveis).find(x => x.id === 'focus_selic_prox_ano' && x.disponivel);
  if (v && v.variacao.valor >= 0.25) out.push({ tipo: 'possível antecipação', texto: `A Selic esperada para o próximo ano subiu ${v.variacao.valor.toFixed(2).replace('.', ',')} p.p. no período analisado. Quem já planeja uma compra financiada pode preferir decidir antes de uma eventual piora do crédito.`, cuidado: 'Hipótese. Só usar com cliente que já tem a compra planejada e com condição de crédito vigente confirmada; nunca como pressão.', evidencia: diag.fatos.focus_selic_prox_ano?.variacao });
  if (v && v.variacao.valor <= -0.25) out.push({ tipo: 'possível adiamento', texto: `A Selic esperada para o próximo ano caiu ${Math.abs(v.variacao.valor).toFixed(2).replace('.', ',')} p.p. Parte dos produtores pode adiar compras esperando crédito mais barato.`, cuidado: 'Trabalhar o custo de adiar e preparar a decisão; não contradizer a expectativa do cliente.', evidencia: diag.fatos.focus_selic_prox_ano?.variacao });
  return out;
}

/** Uma oportunidade por segmento com índice calculável. */
export function buildOpportunities({ diag, indices, categorias }) {
  const out = [];
  for (const seg of ['agricola', 'pecuaria']) {
    const idx = indices[seg];
    const cats = categorias.filter(c => c.segmento === seg);
    const top = cats[0];
    if (!idx.suficiente) { out.push({ segmento: seg, status: 'sem dados', titulo: `${seg === 'agricola' ? 'Agricultura' : 'Pecuária'}: sem dados suficientes`, categoria: top?.nome || null }); continue; }
    const status = idx.valor >= 60 && !idx.contraditorio ? 'oportunidade' : idx.valor >= 45 ? 'manutenção' : 'cautela';
    // Evidência coerente com o status: oportunidade mostra o que favorece; cautela/manutenção mostra o que pesa contra.
    const fatos = status === 'oportunidade' ? fatosFavoraveis(diag, seg, 3)
      : fatosPara(diag, [...new Set(diag.fatores_desfavoraveis.filter(f => f.segmento === seg).map(f => f.id))]).slice(0, 3);
    out.push({
      segmento: seg, status, indice: idx.valor, confianca: idx.confianca,
      titulo: { oportunidade: `Oportunidade em ${seg === 'agricola' ? 'agricultura' : 'pecuária'}: ${top?.nome || '—'}`, 'manutenção': `${seg === 'agricola' ? 'Agricultura' : 'Pecuária'}: manter negociações e relacionamento`, cautela: `${seg === 'agricola' ? 'Agricultura' : 'Pecuária'}: cenário adverso, só necessidade confirmada` }[status],
      categoria: top?.nome || null, categoria_id: top?.id || null, marcas: top?.marcas || [],
      publico: seg === 'agricola' ? 'Revendas de implementos e produtores de grãos com renovação ou ampliação prevista' : 'Pecuaristas com confinamento, semiconfinamento ou suplementação a pasto; revendas que atendem pecuária',
      regiao: REGIAO[seg].texto, base_regiao: REGIAO[seg].base,
      evidencias: fatos.map(f => f.variacao || f.nivel),
      argumento_central: status === 'oportunidade'
        ? (seg === 'agricola' ? 'Planejar o investimento da próxima janela com antecedência, validando necessidade e forma de pagamento.' : 'Ganho de eficiência no trato e na alimentação do rebanho, num momento de receita mais favorável para o pecuarista.')
        : status === 'manutenção' ? 'Atender quem já tem necessidade definida; manter presença com informação útil.' : 'Escuta e relacionamento; proposta só para necessidade urgente.',
      objecoes: objections({ diag, indice: idx, segmento: seg })
    });
  }
  const ordem = { oportunidade: 0, 'manutenção': 1, cautela: 2, 'sem dados': 3 };
  return out.sort((a, b) => ordem[a.status] - ordem[b.status] || (b.indice ?? 0) - (a.indice ?? 0));
}

function msgsSegmento({ diag, op, categorias, mes }) {
  const cat = categorias.find(c => c.id === op.categoria_id) || categorias.find(c => c.segmento === op.segmento);
  const termo = cat?.termo || 'equipamentos';
  const produto = cat?.produto || termo;
  const jan = cat?.motivos.find(m => /^(MT|RO|AC):/.test(m))?.split(': ')[1]?.split(' (')[0];
  const momento = jan ? `com ${jan.charAt(0).toLowerCase() + jan.slice(1)} em andamento` : `neste mês de ${MES[mes]}`;
  const Momento = momento.charAt(0).toUpperCase() + momento.slice(1);
  const fatos = fatosFavoraveis(diag, op.segmento, 2);
  const linhaFatos = fatos.length ? `Tenho acompanhado o mercado: ${fatos.map(f => f.msg).join(' e ')}. ` : '';
  const pec = op.segmento === 'pecuaria';
  const fav = op.status === 'oportunidade';
  const revenda = fav
    ? `Bom dia! Aqui é o Johnson, da JR Agro. ${linhaFatos}${pec ? 'É um cenário que costuma abrir conversa com pecuarista sobre estrutura de trato.' : 'É um cenário que costuma abrir conversa com produtor sobre o planejamento da próxima safra.'} Como está a procura por ${produto} aí na loja? Se fizer sentido, passo aí esta semana para alinharmos demanda e disponibilidade.`
    : op.status === 'manutenção'
      ? `Bom dia! Aqui é o Johnson, da JR Agro. Queria retomar com vocês as negociações em aberto de ${produto} — tem alguma proposta que precise de revisão ou de uma simulação de pagamento? Qual delas está mais perto de fechar?`
      : `Bom dia! Aqui é o Johnson, da JR Agro. ${Momento}, queria entender como está o movimento: tem cliente com necessidade concreta de ${produto} ou com equipamento dando problema? Posso ajudar a montar uma proposta sob medida para quem já tem a necessidade definida.`;
  const produtor = pec
    ? (fav
      ? `Bom dia! Aqui é o Johnson, da JR Agro. ${linhaFatos}Estou conversando com pecuaristas sobre o trato do rebanho. Como está o seu trato hoje — quanto tempo e mão de obra ele consome por dia?`
      : `Bom dia! Aqui é o Johnson, da JR Agro. Estou passando para saber como está a lida com o rebanho. O trato e a alimentação estão dando conta, ou tem algo travando a rotina?`)
    : (fav
      ? `Bom dia! Aqui é o Johnson, da JR Agro. ${linhaFatos}Estou conversando com produtores sobre o planejamento da próxima safra. Na operação de ${termo}, tem algo hoje que limita seu ritmo ou rendimento?`
      : `Bom dia! Aqui é o Johnson, da JR Agro. ${Momento}, estou passando para saber como está a operação. Algum equipamento de ${termo} dando trabalho ou limitando o ritmo? Se tiver, vale a gente olhar junto as alternativas.`);
  return {
    segmento: op.segmento, status: op.status,
    revenda, produtor,
    abertura_ligacao: fav
      ? `Aqui é o Johnson, da JR Agro. Estou ligando porque os números do mercado desta semana trazem sinais que valem uma conversa sobre ${produto}. Tem dois minutos?`
      : `Aqui é o Johnson, da JR Agro. Estou ligando para entender como está a sua operação ${momento}. Tem dois minutos?`,
    roteiro_ligacao: [
      'Abertura: apresentar-se e pedir dois minutos.',
      fav && fatos.length ? `Contexto: citar um dado verificado — ${fatos[0].msg}.` : 'Contexto: perguntar como está a operação nesta época.',
      `Diagnóstico: ${pec ? 'como é feito o trato hoje, quantas cabeças, quanto tempo por dia' : 'qual operação mais limita o rendimento e como está a frota'}.`,
      'Capacidade: forma de pagamento pretendida (recurso próprio, financiamento, barter) e prazo de decisão.',
      'Fechamento: propor visita/demonstração só se houver necessidade confirmada; senão, registrar data para retomar.'
    ],
    perguntas_diagnostico: pec
      ? ['Como é feito o trato hoje e quanto tempo ele consome por dia?', 'Qual o plano de suplementação para a próxima seca?', 'Se fosse investir, seria com recurso próprio ou financiado?']
      : ['Hoje, qual operação mais limita seu ritmo ou rendimento?', 'Existe plano de renovar ou ampliar algum equipamento nesta safra ou na próxima?', 'Se fosse investir, seria com recurso próprio, financiamento ou barter?'],
    pergunta_diagnostico: pec ? 'Como é feito o trato hoje e quanto tempo ele consome por dia?' : 'Hoje, qual operação mais limita seu ritmo ou rendimento — e já existe plano para resolver isso nesta safra ou na próxima?',
    proximo_passo: fav
      ? 'Com necessidade concreta: agendar visita ou demonstração e levantar a forma de pagamento antes de montar proposta. Sem necessidade: registrar a data prevista de renovação e retomar no momento certo.'
      : 'Registrar a resposta (necessidade, prazo, forma de pagamento). Proposta só para quem confirmou necessidade; os demais ficam em acompanhamento.',
    fatos_usados: fatos.map(f => f.id)
  };
}

export function buildMessages({ diag, categorias, mes, oportunidades }) {
  const ops = (oportunidades || []).filter(o => o.status !== 'sem dados');
  const lista = ops.length ? ops : [{ segmento: 'agricola', status: 'cautela', categoria_id: categorias[0]?.id }];
  const porSeg = lista.map(op => msgsSegmento({ diag, op, categorias, mes }));
  const principal = porSeg[0];
  return { ...principal, por_segmento: porSeg,
    aviso: 'Revise antes de enviar. As mensagens citam apenas dados coletados, com fonte e data; não prometem preço, prazo ou condição de financiamento.' };
}

export function buildPlan({ diag, categorias, oportunidades }) {
  const conf = diag.confianca;
  const monitorar = [...new Set([...diag.fatores_favoraveis, ...diag.fatores_desfavoraveis].map(f => f.indicador))].slice(0, 4);
  const acoes = [];
  const add = a => acoes.push({ prioridade: acoes.length + 1, confianca: conf, indicadores_monitorar: monitorar, ...a });
  const op1 = oportunidades.find(o => o.status === 'oportunidade');
  const principal = oportunidades.find(o => o.status !== 'sem dados');

  add({ titulo: 'Retomar negociações qualificadas', execucao: 'imediata',
    motivo: 'Negociações em andamento têm a maior chance de conversão em qualquer cenário; o contexto do dia serve para atualizar a conversa, não para pressionar.',
    segmento: 'Revendas e produtores com proposta aberta', regiao: 'Onde houver proposta aberta (MT primeiro)',
    categoria: principal?.categoria || '—', evidencias: principal?.evidencias?.length ? principal.evidencias : ['Ação de rotina — vale em qualquer cenário.'],
    argumento: 'Atualizar a necessidade do cliente e verificar se a proposta precisa de revisão ou de simulação de pagamento.',
    pergunta: 'O que falta para essa decisão andar — prazo, forma de pagamento ou validação técnica?',
    proximo_passo: 'Atualizar etapa e data prevista de decisão no histórico comercial.' });

  if (diag.recomendacao === R.INSUFICIENTE) {
    add({ titulo: 'Completar os dados que faltam no painel', execucao: 'imediata',
      motivo: 'Sem preços regionais e custos, o índice não tem base para recomendação confiável.',
      segmento: '—', regiao: 'MT, RO, AC', categoria: '—', evidencias: ['Cobertura de dados abaixo do mínimo.'],
      argumento: '—', pergunta: '—', proximo_passo: 'Importar CSV de soja, milho e boi gordo (Cepea/IMEA) e diesel (ANP) — ver docs/FONTES.md.' });
  }

  for (const op of oportunidades.filter(o => o.status === 'oportunidade')) {
    const prod = categorias.find(c => c.id === op.categoria_id)?.produto || op.categoria;
    add({ titulo: `Prospecção seletiva — ${op.segmento === 'agricola' ? 'agricultura' : 'pecuária'}: ${prod}`, execucao: 'depende de validação comercial',
      motivo: `Índice ${op.segmento === 'agricola' ? 'agrícola' : 'pecuário'} em ${op.indice}/100 (confiança ${op.confianca}) e categoria com maior aderência ao calendário.`,
      segmento: op.publico, regiao: `${op.regiao} (${op.base_regiao})`, categoria: op.categoria, evidencias: op.evidencias,
      argumento: op.argumento_central, pergunta: op.segmento === 'pecuaria' ? 'Como é feito o trato hoje?' : 'Qual operação hoje mais limita seu rendimento?',
      proximo_passo: 'Agendar visita ou demonstração só com quem confirmar necessidade.' });
  }
  if (op1) {
    add({ titulo: 'Alinhar demanda com revendas', execucao: 'imediata',
      motivo: 'Revendas precisam se posicionar antes da janela de decisão dos produtores.', segmento: 'Revendas', regiao: op1.regiao,
      categoria: op1.categoria, evidencias: op1.evidencias, argumento: 'Trocar informação sobre a procura real dos produtores, sem prometer condição comercial não confirmada pela fábrica.',
      pergunta: 'Quantos clientes perguntaram por esse tipo de equipamento nas últimas semanas?', proximo_passo: 'Registrar a demanda relatada pela revenda.' });
  }
  if ([R.CONVERSAO, R.CAUTELA, R.MONITORAR, R.INSUFICIENTE].includes(diag.recomendacao)) {
    // Ação de cautela mira o segmento em pior momento (não o da oportunidade).
    const opC = oportunidades.find(o => o.status === 'cautela') || oportunidades.find(o => o.status === 'manutenção') || principal;
    add({ titulo: 'Mapear necessidades urgentes e objeções', execucao: 'imediata',
      motivo: diag.sinais_contraditorios ? 'Sinais contraditórios: foco em quem já tem necessidade definida.' : diag.recomendacao === R.CONVERSAO ? 'Cenário misto: foco em quem já tem necessidade definida.' : 'Cenário sem base para ampliar esforço: priorizar necessidade concreta e entender o que trava as decisões.',
      segmento: opC?.segmento === 'pecuaria' ? 'Pecuaristas com estrutura de trato em uso' : 'Produtores com equipamento em uso na safra atual', regiao: opC?.regiao || 'MT, RO', categoria: opC?.categoria || '—',
      evidencias: diag.fatores_desfavoraveis.slice(0, 2).map(f => f.o_que_aconteceu).filter(Boolean).length ? diag.fatores_desfavoraveis.slice(0, 2).map(f => f.o_que_aconteceu) : ['Calendário agrícola do mês.'],
      argumento: 'Escuta: problemas em campo, gargalos, planos de renovação.', pergunta: 'Tem algum equipamento limitando a operação agora?', proximo_passo: 'Separar quem tem necessidade imediata e montar proposta só para esses.' });
    add({ titulo: 'Levantar alternativas de pagamento', execucao: 'depende de validação comercial',
      motivo: 'Quando o ambiente não é claramente favorável, a forma de pagamento costuma decidir a venda.', segmento: 'Clientes com proposta aberta', regiao: 'MT, RO, AC',
      categoria: '—', evidencias: fatosPara(diag, ['selic_meta', 'focus_selic_prox_ano']).map(f => f.nivel), argumento: 'Comparar linhas disponíveis (banco, cooperativa de crédito, BNDES/Plano Safra) — confirmar as condições vigentes antes de citar qualquer taxa.',
      pergunta: 'Como pretende pagar: recurso próprio, financiamento ou barter?', proximo_passo: 'Pedir simulação ao banco ou cooperativa do cliente.' });
  }
  add({ titulo: 'Manter relacionamento com revendas', execucao: 'imediata',
    motivo: 'Relacionamento constante sustenta a geração de oportunidades em qualquer cenário.', segmento: 'Revendas', regiao: 'MT, RO, AC', categoria: '—',
    evidencias: ['Ação de rotina.'], argumento: 'Contato curto, útil e com informação de mercado verificada.', pergunta: 'O que os produtores estão perguntando mais esta semana?', proximo_passo: 'Anotar os sinais de demanda relatados.' });
  return acoes.slice(0, 7);
}
