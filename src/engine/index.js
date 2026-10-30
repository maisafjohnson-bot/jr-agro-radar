// Índices de Oportunidade — metodologia v0.2 (heurística, experimental). Ver docs/METODOLOGIA.md.
//
// Por variável:
//   momento: variação da janela comparada (percentil) com as variações históricas da mesma
//            janela que terminam ANTES da janela atual. Taxas em p.p., preços em %.
//   nivel:   (só taxas) percentil do valor atual nos últimos 10 anos.
//   sinal = Σ componente_peso × (percentil − 0,5) × 2, depois × direção econômica.
// Bloco = média dos sinais disponíveis (variáveis correlacionadas ficam no mesmo bloco).
// Nota = 50 + 50 × média ponderada dos blocos com dado. Cobertura < mínimo → sem nota.
import { windowChange, historicalChanges, percentileRank, freshness, latest, levelPercentile, medidaPara } from '../lib/series.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function variableSignal(obs, ind, metodo, hoje, componentes = { momento: 1 }) {
  const regras = metodo.regras_gerais;
  const fr = freshness(obs, ind.frequencia, hoje, regras.frescor_max_dias);
  if (fr.status !== 'atual') return { disponivel: false, motivo: fr.status === 'ausente' ? 'sem dados' : `desatualizado (${fr.idade_dias} dias)` };
  const janela = metodo.janela_variacao[ind.frequencia];
  const medida = medidaPara(ind.unidade);
  const w = windowChange(obs, ind.frequencia, janela, undefined, medida);
  if (!w) return { disponivel: false, motivo: 'histórico insuficiente para calcular a variação' };

  const partes = {};
  const hist = historicalChanges(obs, ind.frequencia, janela, medida);
  if (hist.length >= regras.historico_minimo_percentil) {
    const p = percentileRank(hist, w.valor);
    partes.momento = { percentil: p, sinal: (p - 0.5) * 2, qualidade: 'percentil', n: hist.length };
  } else {
    // Sem base histórica: só a direção, com metade da força.
    const escala = medida === 'pp' ? 1 : 10;
    partes.momento = { percentil: null, sinal: Math.sign(w.valor) * clamp(Math.abs(w.valor) / escala, 0, 1) * 0.5, qualidade: 'limitada', n: hist.length };
  }
  if (componentes.nivel) {
    const lv = levelPercentile(obs, regras.nivel_anos || 10);
    if (lv && lv.n >= regras.historico_minimo_percentil) partes.nivel = { percentil: lv.percentil, sinal: (lv.percentil - 0.5) * 2, n: lv.n, desde: lv.desde };
  }
  // Se o nível pedido não tiver base, o momento assume o peso todo (registrado em `partes`).
  const pesos = { momento: componentes.momento || 0, nivel: partes.nivel ? (componentes.nivel || 0) : 0 };
  const somaP = pesos.momento + pesos.nivel || 1;
  const sinal = (pesos.momento * partes.momento.sinal + pesos.nivel * (partes.nivel?.sinal || 0)) / somaP;
  return {
    disponivel: true, variacao: w, medida,
    percentil: partes.momento.percentil, percentil_nivel: partes.nivel?.percentil ?? null,
    componentes_usados: partes, sinal_bruto: sinal,
    qualidade: partes.momento.qualidade, n_historico: hist.length, data_referencia: latest(obs).data
  };
}

function aggregate(blocos, pesoOverride) {
  let pesoTotal = 0, pesoDisp = 0, soma = 0;
  for (const b of blocos) {
    const peso = pesoOverride ? pesoOverride[b.id] : b.peso;
    pesoTotal += peso;
    if (b.sinal !== null) { pesoDisp += peso; soma += peso * b.sinal; }
  }
  return { cobertura: pesoTotal ? pesoDisp / pesoTotal : 0, media: pesoDisp ? soma / pesoDisp : null, pesoDisp };
}

export function computeIndex(def, sourcesById, series, metodo, hoje) {
  const blocos = def.blocos.map(b => {
    const vars = b.variaveis.map(v => {
      const ind = sourcesById[v.id];
      if (!ind) return { id: v.id, disponivel: false, motivo: 'indicador não cadastrado' };
      const s = variableSignal(series[v.id] || [], ind, metodo, hoje, v.componentes);
      return { id: v.id, nome: ind.nome, direcao: v.direcao, porque: v.porque, ...s, sinal: s.disponivel ? s.sinal_bruto * v.direcao : null };
    });
    const disp = vars.filter(v => v.disponivel);
    const sinal = disp.length ? disp.reduce((a, v) => a + v.sinal, 0) / disp.length : null;
    return { id: b.id, nome: b.nome, peso: b.peso, sinal, disponivel: sinal !== null, variaveis: vars };
  });
  const { cobertura, media, pesoDisp } = aggregate(blocos);
  const todas = blocos.flatMap(b => b.variaveis);
  const base = { nome: def.nome, cobertura, blocos, versao: metodo.versao,
    variaveis_usadas: todas.filter(v => v.disponivel).length, variaveis_total: todas.length,
    indisponiveis: todas.filter(v => !v.disponivel).map(v => ({ id: v.id, nome: v.nome, motivo: v.motivo })) };

  if (cobertura < metodo.regras_gerais.cobertura_minima) {
    return { ...base, suficiente: false, valor: null, classificacao: 'Dados insuficientes', confianca: 'insuficiente',
      motivo_confianca: `Cobertura de ${(cobertura * 100).toFixed(0)}% dos pesos (mínimo ${(metodo.regras_gerais.cobertura_minima * 100).toFixed(0)}%). Não há base para uma classificação confiável.` };
  }
  const bruto = 50 + 50 * media;
  const valor = Math.round(clamp(bruto, 0, 100));
  for (const b of blocos) b.contribuicao_pontos = b.disponivel ? +(50 * b.peso * b.sinal / pesoDisp).toFixed(2) : null;
  const faixa = classify(valor, metodo);
  const sens = sensitivity(blocos, metodo);
  let { confianca, motivo, contraditorio } = confidence(blocos, cobertura, sens, metodo);
  // Regra regional (auditoria): sem nenhum dado estadual/regional atual, a leitura é só macro nacional → confiança baixa.
  const regionais = todas.filter(v => v.disponivel && !/^Brasil/.test(sourcesById[v.id]?.abrangencia || 'Brasil'));
  if (!regionais.length) { confianca = 'baixa'; motivo += '; nenhum indicador regional (MT/RO/AC) atual — leitura baseada só em dados nacionais'; }
  return { ...base, suficiente: true, regionais_usados: regionais.map(v => v.id), valor, valor_bruto: +bruto.toFixed(2), classificacao: faixa.rotulo, confianca, motivo_confianca: motivo, contraditorio, sensibilidade: sens };
}

export function classify(valor, metodo) {
  return metodo.regras_gerais.faixas.find(f => valor >= f.min && valor <= f.max);
}

/** Sensibilidade: recalcula a nota com cada peso de bloco ±20% (renormalizado). */
export function sensitivity(blocos, metodo) {
  const notas = [];
  for (const b of blocos) for (const f of [0.8, 1.2]) {
    const over = Object.fromEntries(blocos.map(x => [x.id, x.id === b.id ? x.peso * f : x.peso]));
    const { media } = aggregate(blocos, over);
    if (media !== null) notas.push(Math.round(clamp(50 + 50 * media, 0, 100)));
  }
  if (!notas.length) return null;
  const min = Math.min(...notas), max = Math.max(...notas);
  const classes = new Set(notas.map(n => classify(n, metodo).rotulo));
  return { min, max, muda_classificacao: classes.size > 1 };
}

export function confidence(blocos, cobertura, sens, metodo) {
  const disp = blocos.filter(b => b.disponivel);
  const vars = disp.flatMap(b => b.variaveis.filter(v => v.disponivel));
  const pesoLimitado = disp.reduce((a, b) => a + (b.variaveis.some(v => v.disponivel && v.qualidade === 'limitada') ? b.peso : 0), 0);
  const pesoDisp = disp.reduce((a, b) => a + b.peso, 0) || 1;
  const fracLimitada = pesoLimitado / pesoDisp;
  // Contradição material: forças dos dois lados com pelo menos 6 pontos cada, e o lado menor
  // valendo ao menos 40% do maior (um contra fraco diante de muitos a favor não é contradição).
  const pos = disp.reduce((a, b) => a + Math.max(0, b.contribuicao_pontos), 0);
  const neg = -disp.reduce((a, b) => a + Math.min(0, b.contribuicao_pontos), 0);
  const contraditorio = pos >= 6 && neg >= 6 && Math.min(pos, neg) / Math.max(pos, neg) >= 0.4;
  const motivos = [`cobertura ${(cobertura * 100).toFixed(0)}% dos pesos`, `${vars.length} variáveis com dado atual`];
  if (fracLimitada > 0) motivos.push(`${Math.round(fracLimitada * 100)}% do peso com histórico curto (sem percentil)`);
  if (contraditorio) motivos.push('blocos fortes apontando em direções opostas');
  if (sens?.muda_classificacao) motivos.push(`classificação muda com ±20% nos pesos (nota entre ${sens.min} e ${sens.max})`);
  let confianca;
  if (cobertura >= 0.8 && fracLimitada === 0 && !contraditorio && !sens?.muda_classificacao) confianca = 'alta';
  else if (cobertura >= 0.6 && fracLimitada <= 1 / 3) confianca = 'moderada';
  else confianca = 'baixa';
  if (confianca === 'alta') { confianca = 'moderada'; motivos.push('teto "moderada" até a validação com histórico comercial da JR Agro'); }
  else motivos.push('modelo ainda não calibrado com vendas da JR Agro');
  return { confianca, motivo: motivos.join('; '), contraditorio };
}

export function computeGeneral(agricola, pecuaria, metodo) {
  const pesos = metodo.geral.pesos;
  const partes = [['agricola', agricola], ['pecuaria', pecuaria]].filter(([, i]) => i.suficiente);
  if (!partes.length) return { nome: metodo.geral.nome, suficiente: false, valor: null, classificacao: 'Dados insuficientes', confianca: 'insuficiente', motivo_confianca: 'Nenhum índice componente tem cobertura suficiente.', versao: metodo.versao };
  const somaPeso = partes.reduce((a, [k]) => a + pesos[k], 0);
  const valor = Math.round(partes.reduce((a, [k, i]) => a + pesos[k] * i.valor, 0) / somaPeso);
  const ordem = ['insuficiente', 'baixa', 'moderada', 'alta'];
  const conf = partes.map(([, i]) => i.confianca).sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b))[0];
  const nota = partes.length < 2 ? ` Calculado só com o índice ${partes[0][0] === 'agricola' ? 'agrícola' : 'pecuário'} (o outro não tem dados suficientes).` : '';
  // Divergência entre segmentos é informação comercial, não ruído: fica explícita.
  const divergencia = partes.length === 2 && Math.abs(agricola.valor - pecuaria.valor) >= 15;
  return { nome: metodo.geral.nome, suficiente: true, valor, classificacao: classify(valor, metodo).rotulo, confianca: conf,
    componentes: Object.fromEntries(partes.map(([k, i]) => [k, i.valor])),
    // Contradição é avaliada dentro de cada segmento; só marca o geral se o segmento dominante (peso ≥ 50%) for contraditório.
    contraditorio: partes.some(([k, i]) => i.contraditorio && pesos[k] / somaPeso >= 0.5), divergencia_segmentos: divergencia,
    motivo_confianca: `Menor confiança entre os componentes.${nota}${divergencia ? ` Agrícola (${agricola.valor}) e pecuário (${pecuaria.valor}) divergem: a nota geral esconde oportunidades diferentes por segmento.` : ''}`, versao: metodo.versao };
}
