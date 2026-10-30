// Argumentos de venda baseados SÓ no catálogo técnico e nos fatos econômicos coletados.
// Nenhuma promessa de produtividade, economia ou resultado; cada argumento técnico cita a página.
const fmt = n => typeof n === 'number' ? n.toLocaleString('pt-BR') : String(n);
const faixa = (a, b, un) => a === b ? `${fmt(a)} ${un}` : `${fmt(a)} a ${fmt(b)} ${un}`;
const rng = (vals) => { const v = vals.filter(x => typeof x === 'number'); return v.length ? [Math.min(...v), Math.max(...v)] : null; };

/** Destaques técnicos objetivos por categoria, com a página de origem. */
export function technicalHighlights(p) {
  const pg = `p. ${p.pagina.join(', ')}`;
  const spec = k => p.variantes.map(v => v.specs[k]);
  const out = [];
  const pot = p.potencia_requerida_cv;
  if (p.categoria === 'Plantadeiras') {
    out.push({ texto: `Modelos de ${p.variantes.map(v => v.modelo.replace('Plantor ', '')).join(', ')} de largura`, fonte: 'p. 5' });
    if (p.especificacoes_comuns.caixas) out.push({ texto: '3 caixas centrais de 2.400 litros, cada uma para semente ou adubo', fonte: 'p. 2 e 6' });
    out.push({ texto: 'Largura de transporte de 3,9 m', fonte: 'p. 5' });
    if (pot) out.push({ texto: `Potência mínima de ${pot.min} a ${pot.max} HP (linhas a 50 cm), conforme o modelo`, fonte: 'p. 5' });
  } else {
    const hastes = rng(spec('hastes')), discos = rng(spec('discos')), carga = rng(spec('capacidade_carga_kg'));
    if (hastes) out.push({ texto: `De ${faixa(hastes[0], hastes[1], 'hastes')}`, fonte: pg });
    if (discos) out.push({ texto: `De ${faixa(discos[0], discos[1], 'discos')}`, fonte: pg });
    if (p.largura_trabalho_mm) out.push({ texto: `Largura de trabalho de ${faixa(p.largura_trabalho_mm.min, p.largura_trabalho_mm.max, 'mm')}`, fonte: pg });
    if (p.especificacoes_comuns.profundidade_corte_mm) out.push({ texto: `Profundidade de corte ${p.especificacoes_comuns.profundidade_corte_mm} mm`, fonte: pg });
    if (carga) out.push({ texto: `Capacidade de carga de ${faixa(carga[0], carga[1], 'kg')}`, fonte: pg });
    const fx = spec('faixa_distribuicao_m').filter(Boolean)[0];
    if (fx) out.push({ texto: `Faixa de distribuição de ${fx} m`, fonte: pg });
    if (pot) out.push({ texto: `Potência no motor de ${faixa(pot.min, pot.max, 'cv')}, conforme o modelo`, fonte: pg });
  }
  for (const d of p.diferenciais.slice(0, 3)) out.push({ texto: d.texto, fonte: `p. ${d.pagina}` });
  if (p.opcionais.length) out.push({ texto: `Opcionais: ${p.opcionais.slice(0, 3).join('; ')}`, fonte: pg });
  return out;
}

const PERGUNTAS = {
  Descompactadores: ['Em quais talhões o senhor percebe compactação (raiz rasa, água empoçando, queda de rendimento em ano seco)?', 'Qual a potência do trator que puxaria o implemento?', 'A descompactação seria feita em que época — antes da soja ou na entressafra?'],
  Grades: ['Quantos hectares o senhor prepara por ano com grade, e com qual trator?', 'É abertura de área, reforma de pastagem ou preparo de lavoura?', 'A grade atual está dando conta do ritmo na janela de preparo?'],
  Distribuidores: ['Quantos hectares recebem calcário ou adubo a lanço por ano?', 'Hoje a aplicação é própria ou terceirizada?', 'O senhor já trabalha com mapa de fertilidade (para taxa variável)?'],
  Plantadeiras: ['Quantos hectares o senhor planta na soja e na safrinha, e em quantos dias?', 'Qual trator puxaria a plantadeira (potência)?', 'Qual espaçamento entre linhas o senhor usa em cada cultura?'],
  'Utilitários': ['Que cargas o senhor movimenta hoje (big bags, insumos) e como?']
};
const NECESSIDADE = {
  Descompactadores: 'Romper camadas compactadas do solo antes do plantio.',
  Grades: 'Preparar e nivelar o solo (abertura de área, reforma de pastagem ou preparo de lavoura).',
  Distribuidores: 'Aplicar calcário, gesso e fertilizantes a lanço, com faixa e vazão documentadas.',
  Plantadeiras: 'Plantar grandes áreas com autonomia de abastecimento e troca rápida entre transporte e trabalho.',
  'Utilitários': 'Movimentar cargas na propriedade.'
};

/**
 * Argumentos de venda para um produto, para revenda e para produtor.
 * `contexto`: { marca, indice, fatos (diag.fatos), fatosFavoraveis (ids), regiao (municípios), mes }
 */
export function salesArguments(p, contexto = {}) {
  const tec = technicalHighlights(p);
  const fatosEco = (contexto.fatosFavoraveis || []).map(id => contexto.fatos?.[id]).filter(Boolean).slice(0, 1);
  const reg = (contexto.regiao || [])[0];
  const regTxt = reg ? `${reg.nome} (${reg.uf}) está entre os municípios de maior área de lavoura no IBGE${reg.soja_ha ? ` — ${fmt(reg.soja_ha)} ha de soja em ${contexto.anoPam}` : ''}` : null;
  const pot = p.potencia_requerida_cv;
  const linha = p.variantes.length > 1 ? `${p.variantes.length} modelos` : '1 modelo';
  const curto = p.categoria === 'Plantadeiras' ? 'a Plantor' : `a linha ${p.modelo}`;
  const destaque = tec.slice(0, 2).map(t => t.texto.charAt(0).toLowerCase() + t.texto.slice(1)).join('; ');

  const revenda = {
    oportunidade_mercado: [contexto.momento, ...fatosEco.map(f => f.variacao || f.nivel)].filter(Boolean),
    potencial_comercializacao: [`${linha} no catálogo${pot ? `, para tratores de ${pot.min} a ${pot.max} ${p.categoria === 'Plantadeiras' ? 'HP' : 'cv'}` : ''}`, regTxt].filter(Boolean),
    perfil_cliente: p.perfil_cliente,
    beneficios_revenda: [`Faixa de ${linha} permite atender clientes de portes diferentes com a mesma linha`, 'Ficha técnica completa no catálogo oficial (páginas citadas) para apoiar a venda técnica'].slice(0, p.variantes.length > 1 ? 2 : 1),
    argumentos_tecnicos: tec,
    abordagem: 'Abrir com o momento de calendário, levantar a procura real dos produtores na loja e só então apresentar a linha; nada de condição comercial sem confirmação da fábrica.',
    whatsapp: `Bom dia! Aqui é o Johnson, da JR Agro. ${contexto.momento ? contexto.momento.replace(/\.$/, '') + ', ' : ''}queria conversar sobre ${curto} da ${p.fabricante === 'PICCIN' ? 'Piccin' : 'Crucianelli'}: ${destaque}. Como está a procura dos seus clientes por ${p.categoria.toLowerCase()}? Posso passar aí esta semana para mostrar a ficha técnica.`,
    proxima_acao: 'Agendar visita à revenda com a ficha técnica e levantar os clientes que já perguntaram por esse tipo de equipamento.'
  };
  const produtor = {
    necessidade: NECESSIDADE[p.categoria] || p.operacao,
    beneficios_tecnicos: p.diferenciais.map(d => ({ texto: d.texto, fonte: `p. ${d.pagina}` })),
    aplicacao: `${p.aplicacao.texto} (${p.aplicacao.origem})`,
    caracteristicas_perfil: pot ? `Exige trator de ${pot.min} a ${pot.max} ${p.categoria === 'Plantadeiras' ? 'HP' : 'cv'} conforme o modelo — confirmar a potência disponível antes de indicar o modelo.` : 'Potência não informada no catálogo.',
    perguntas: PERGUNTAS[p.categoria] || [],
    argumento: p.categoria === 'Plantadeiras'
      ? 'Autonomia de abastecimento e mudança rápida entre transporte e trabalho, com especificações documentadas no catálogo — o rendimento por hectare depende da operação e não é informado pelo fabricante.'
      : 'Escolher o modelo pela potência do trator e pela largura desejada, com dados do catálogo oficial — sem promessa de rendimento.',
    whatsapp: `Bom dia! Aqui é o Johnson, da JR Agro. Estou visitando produtores ${contexto.momentoProdutor || 'da região'} e trabalho com ${curto} da ${p.fabricante === 'PICCIN' ? 'Piccin' : 'Crucianelli'} (${destaque}). ${(PERGUNTAS[p.categoria] || ['Como está a sua operação hoje?'])[0]}`
  };
  return { produto: p.id, modelo: p.modelo, nome: p.nome, fabricante: p.fabricante, revenda, produtor,
    aviso: 'Argumentos técnicos extraídos do catálogo (página indicada). Não há promessa de produtividade, economia ou disponibilidade.' };
}
