// Plano Comercial do Dia por marca: 5 prioridades objetivas e justificadas.
// O painel complementa com o CRM do aparelho (negociações paradas, clientes, índice com evidência de CRM).
import { equipmentPriority, NOME_CAL } from './brands.js';
import { salesArguments } from './argumentos.js';

const NOME = { PICCIN: 'Piccin', CRUCIANELLI: 'Crucianelli' };

export function brandDayPlan({ indices, produtos, calendar, mes, regional, diag }) {
  const marcas = ['PICCIN', 'CRUCIANELLI'];
  const equip = Object.fromEntries(marcas.map(m => [m, equipmentPriority({ marca: m, produtos, calendar, mes })]));

  // ---- Prioridade 1: marca
  const v = m => indices[m].valor;
  const mom = m => indices[m].componentes.momento.valor;
  let marca, porque;
  if (v('PICCIN') != null && v('CRUCIANELLI') != null && Math.abs(v('PICCIN') - v('CRUCIANELLI')) >= 5) {
    marca = v('PICCIN') > v('CRUCIANELLI') ? 'PICCIN' : 'CRUCIANELLI';
    const outra = marca === 'PICCIN' ? 'CRUCIANELLI' : 'PICCIN';
    const dif = Object.keys(indices[marca].componentes).filter(k => Number.isFinite(indices[marca].componentes[k].valor) && Number.isFinite(indices[outra].componentes[k].valor))
      .map(k => ({ k, d: indices[marca].componentes[k].valor - indices[outra].componentes[k].valor })).sort((a, b) => b.d - a.d)[0];
    porque = `Índice ${NOME[marca]} ${v(marca)} × ${NOME[outra]} ${v(outra)}. Maior diferença: ${indices[marca].componentes[dif.k].detalhe}`;
  } else {
    marca = mom('CRUCIANELLI') > mom('PICCIN') ? 'CRUCIANELLI' : 'PICCIN';
    porque = v('PICCIN') == null || v('CRUCIANELLI') == null
      ? `Índices sem cobertura suficiente; decisão pelo calendário: ${indices[marca].componentes.momento.detalhe}`
      : `Índices próximos (${v('PICCIN')} × ${v('CRUCIANELLI')}); desempate pelo calendário: ${indices[marca].componentes.momento.detalhe}`;
  }
  const outra = marca === 'PICCIN' ? 'CRUCIANELLI' : 'PICCIN';

  // ---- Prioridade 2: equipamento
  const eq = equip[marca];
  const opcaoPadrao = eq?.opcoes?.find(o => o.status === 'confirmada') || eq?.opcoes?.[0];
  const produto = opcaoPadrao ? produtos.find(p => p.id === opcaoPadrao.id) : null;

  // ---- Prioridade 3: região
  const regs = indices[marca].regioes || [];
  const regiao = regs.length
    ? { municipios: regs.map(r => ({ nome: r.nome, uf: r.uf, potencial: marca === 'CRUCIANELLI' ? r.potencial_crucianelli : r.potencial_piccin, soja_ha: r.soja_ha, milho_ha: r.milho_ha, bovinos_cab: r.bovinos_cab })),
        porque: `Maior potencial estrutural para ${NOME[marca]} segundo o IBGE (${regional?.ano_pam ? 'PAM ' + regional.ano_pam : 'dados anuais'}). Potencial estrutural não é oportunidade comprovada — cruze com os clientes do CRM.`, base: 'IBGE' }
    : { municipios: [], texto: marca === 'CRUCIANELLI' ? 'MT — praças de soja e milho (Médio-Norte, Norte e Oeste)' : 'MT — praças de lavoura; RO e AC — áreas de pastagem e abertura',
        porque: 'Dados municipais do IBGE ainda não coletados: indicação pelo perfil produtivo conhecido das regiões. Priorize municípios onde você já tem clientes no CRM.', base: 'perfil produtivo (sem dado municipal)' };

  // ---- Prioridade 4: perfil de cliente
  const portes = (eq?.opcoes || []).map(o => o.porte);
  const decisao = (indices[marca].janelas || []).some(j => j.papel === 'decisao_compra');
  const perfil = {
    publicos: [decisao ? 'Produtores rurais em decisão de compra' : 'Produtores com o equipamento em uso agora', 'Revendas agrícolas que atendem esse público'],
    portes: marca === 'CRUCIANELLI' ? ['Grandes propriedades e grupos agrícolas'] : portes.map(pt => ({ 'pequeno/médio': 'Pequenos e médios produtores', 'médio/grande': 'Médios e grandes produtores', grande: 'Grandes propriedades e grupos agrícolas' }[pt])),
    porque: marca === 'CRUCIANELLI'
      ? `A Plantor exige de ${produto?.potencia_requerida_cv?.min ?? 220} a ${produto?.potencia_requerida_cv?.max ?? 310} HP (catálogo, p. 5) — perfil de grandes áreas e frotas de alta potência.`
      : `${eq?.categoria || 'A categoria'} tem opções de ${(eq?.opcoes || []).map(o => `${o.modelo} (${o.potencia_cv.min === o.potencia_cv.max ? o.potencia_cv.min : o.potencia_cv.min + '–' + o.potencia_cv.max} cv)`).join(', ')}: o porte do cliente define o modelo (catálogo).`
  };

  // ---- Prioridade 5: ação
  const acoes = [];
  if (decisao) acoes.push({ tipo: 'Prospectar produtores', texto: `Prospectar produtores para ${eq?.categoria?.toLowerCase() || NOME_CAL[eq?.calendario]} — janela de decisão de compra aberta.`, porque: indices[marca].componentes.momento.detalhe });
  else if ((indices[marca].janelas || []).length) acoes.push({ tipo: 'Agendar visita', texto: `Agendar visita a produtor com ${eq?.categoria?.toLowerCase()} em operação para levantar gargalos e preparar a próxima compra.`, porque: indices[marca].componentes.momento.detalhe });
  acoes.push({ tipo: 'Ligar para uma revenda', texto: `Ligar para uma revenda de ${regiao.municipios[0]?.nome || 'MT'} e levantar a procura por ${eq?.categoria?.toLowerCase() || 'equipamentos'} ${NOME[marca]}.`, porque: 'Revenda concentra a demanda de vários produtores; uma ligação valida se a oportunidade é real.' });
  if ((indices[marca].componentes.credito.valor ?? 0) >= 60) acoes.push({ tipo: 'Trabalhar financiamento', texto: 'Levantar a condição de crédito vigente com o banco/cooperativa dos clientes em negociação.', porque: indices[marca].componentes.credito.detalhe });
  acoes.push({ tipo: 'Retomar uma negociação', texto: 'Retomar a negociação mais antiga sem contato (ver CRM).', porque: 'Negociação parada perde força; o CRM do aparelho mostra quais estão sem atualização.', depende_crm: true });

  const fatosFav = [...new Set((diag?.fatores_favoraveis || []).filter(f => f.segmento === 'agricola').map(f => f.id))];
  const momentoTxt = (indices[marca].janelas || [])[0] ? `Com ${indices[marca].janelas[0].atividade.charAt(0).toLowerCase() + indices[marca].janelas[0].atividade.slice(1)} em ${indices[marca].janelas[0].uf}` : null;
  const argumentos = produto ? salesArguments(produto, { fatos: diag?.fatos, fatosFavoraveis: fatosFav, regiao: regs, anoPam: regional?.ano_pam, momento: momentoTxt, momentoProdutor: regs[0] ? `de ${regs[0].nome}` : null }) : null;

  return {
    prioridade_marca: { marca, nome: NOME[marca], porque, outra: { marca: outra, valor: v(outra) } },
    equipamento: eq ? { ...eq, recomendado: opcaoPadrao, porque: eq.motivo + (opcaoPadrao ? ` Modelo do catálogo: ${opcaoPadrao.modelo} (p. ${opcaoPadrao.paginas.join(', ')}); escolha a opção pelo trator do cliente.` : '') } : null,
    regiao, perfil_cliente: perfil, acoes,
    argumentos,
    por_marca: Object.fromEntries(marcas.map(m => [m, { equipamento: equip[m] }]))
  };
}

/** Argumentos para todos os equipamentos recomendados (uma opção por porte, por marca). */
export function argumentsForRecommended({ plano, produtos, diag, indices, regional }) {
  const out = [];
  for (const [marca, x] of Object.entries(plano.por_marca)) {
    for (const o of x.equipamento?.opcoes || []) {
      const p = produtos.find(q => q.id === o.id);
      if (!p) continue;
      const jan = (indices[marca].janelas || [])[0];
      out.push(salesArguments(p, { fatos: diag?.fatos, fatosFavoraveis: [...new Set((diag?.fatores_favoraveis || []).filter(f => f.segmento === 'agricola').map(f => f.id))],
        regiao: indices[marca].regioes, anoPam: regional?.ano_pam, momento: jan ? `Com ${jan.atividade.charAt(0).toLowerCase() + jan.atividade.slice(1)} em ${jan.uf}` : null }));
    }
  }
  return out;
}
