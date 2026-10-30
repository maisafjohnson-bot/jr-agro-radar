// Monta os "cards" de indicadores: valor, datas, fonte, variações compatíveis,
// tendência, interpretação econômica e possível implicação comercial.
import { latest, variations, trend, freshness } from '../lib/series.js';

const IMPLICACAO = {
  usd_brl: v => v > 0
    ? 'Dólar em alta: melhora a receita em reais de quem vende grão, mas tende a encarecer máquinas, peças e insumos. Pode haver argumento para antecipar compra apenas se houver reajuste de tabela confirmado pelo fabricante.'
    : v < 0 ? 'Dólar em queda: alivia custos de insumos e componentes, mas reduz a receita em reais do exportador de grãos.' : 'Câmbio sem movimento relevante.',
  selic_meta: v => v < 0 ? 'Juros básicos em queda: tende a baratear o crédito livre e favorecer conversas sobre financiamento.' : v > 0 ? 'Juros em alta: crédito livre mais caro; priorizar linhas equalizadas (Plano Safra/BNDES) nas propostas.' : 'Juros estáveis: argumento de financiamento depende da linha disponível, não do movimento da Selic.',
  focus_selic_prox_ano: v => v < 0 ? 'Mercado passou a esperar juros menores: produtores podem estar adiando compras à espera de crédito mais barato, ou planejando para o próximo ciclo.' : v > 0 ? 'Mercado espera juros mais altos: pode haver motivo legítimo para não adiar uma compra já planejada, se a condição de crédito atual for conhecida.' : 'Expectativa de juros estável.',
  ipca_12m: v => v > 0 ? 'Inflação subindo: pressão sobre custos e sobre juros.' : v < 0 ? 'Inflação recuando: abre espaço para juros menores à frente.' : 'Inflação estável.',
  focus_ipca_prox_ano: v => v > 0 ? 'Expectativa de inflação subindo: juros altos por mais tempo.' : v < 0 ? 'Expectativa de inflação caindo.' : 'Expectativa de inflação estável.',
  icbr_agro: v => v > 0 ? 'Commodities agro em alta em reais: sinal nacional de receita mais forte para o produtor.' : v < 0 ? 'Commodities agro em queda: receita sob pressão, decisões de investimento tendem a ser mais cautelosas.' : 'Commodities estáveis.',
  soja_mt: v => v > 0 ? 'Soja valorizada em MT: abre conversa sobre planejamento de investimento, sem presumir caixa disponível.' : v < 0 ? 'Soja desvalorizada: produtor tende a segurar investimento; foco em necessidade operacional.' : 'Soja estável.',
  milho_mt: v => v > 0 ? 'Milho valorizado: melhora a receita da 2ª safra; encarece ração para o pecuarista.' : v < 0 ? 'Milho em queda: margem da 2ª safra pressionada; ração mais barata para o pecuarista.' : 'Milho estável.',
  boi_gordo: v => v > 0 ? 'Arroba em alta: pecuarista com melhor receita, momento para conversar sobre estrutura e alimentação.' : v < 0 ? 'Arroba em queda: pecuarista mais cauteloso.' : 'Arroba estável.',
  diesel_mt: v => v > 0 ? 'Diesel em alta: argumento de eficiência operacional (menos passadas, maior rendimento) ganha peso.' : v < 0 ? 'Diesel em queda: alívio de custo operacional.' : 'Diesel estável.',
  fertilizante: v => v > 0 ? 'Fertilizante em alta: margem comprimida; distribuidores com dosagem precisa ganham argumento.' : v < 0 ? 'Fertilizante em queda: melhora a margem esperada.' : 'Fertilizante estável.',
  soja_cepea: v => v > 0 ? 'Soja em alta na referência nacional: costuma puxar o preço em MT (com defasagem e diferença de frete).' : v < 0 ? 'Soja em queda na referência nacional.' : 'Soja estável na referência nacional.',
  milho_cepea: v => v > 0 ? 'Milho em alta na referência nacional: melhora a perspectiva da safrinha e encarece a ração.' : v < 0 ? 'Milho em queda na referência nacional.' : 'Milho estável na referência nacional.',
  boi_cepea: v => v > 0 ? 'Arroba em alta na referência nacional: pecuarista mais capitalizado para investir em estrutura.' : v < 0 ? 'Arroba em queda na referência nacional.' : 'Arroba estável na referência nacional.',
  algodao_cepea: v => v > 0 ? 'Algodão em alta na referência nacional.' : v < 0 ? 'Algodão em queda na referência nacional.' : 'Algodão estável na referência nacional.',
  algodao_mt: v => v > 0 ? 'Algodão valorizado: receita melhor para quem planta algodão (perfil de grandes áreas e alto investimento em máquinas).' : v < 0 ? 'Algodão em queda: produtor de algodão tende a adiar investimento.' : 'Algodão estável.',
  imea_plantio_soja: v => v > 0 ? 'Plantio avançando: plantadeiras em uso — momento de acompanhar o desempenho em campo e mapear quem vai renovar para a safrinha e a próxima safra.' : 'Sem avanço registrado no plantio.',
  imea_comerc_soja: v => v > 0 ? 'Venda da safra avançando: mais produtores com preço travado e caixa previsível — conversa de investimento fica mais concreta (confirmar com cada cliente).' : 'Comercialização parada: produtor esperando preço, caixa menos previsível.',
  imea_custo_soja: v => v > 0 ? 'Custo de produção subindo: margem por hectare apertada; argumento de eficiência operacional pesa mais que o de expansão.' : v < 0 ? 'Custo de produção caindo: alívio de margem.' : 'Custo estável.',
  maquinas_vendas: v => v > 0 ? 'Vendas do setor em alta: ciclo de investimento ativo.' : v < 0 ? 'Vendas do setor em queda: mercado retraído, priorizar oportunidades qualificadas.' : 'Vendas do setor estáveis.'
};

export function buildCards(sources, series, hoje, regras) {
  return sources.map(ind => {
    const obs = series[ind.id] || [];
    const l = latest(obs);
    const fr = freshness(obs, ind.frequencia, hoje, regras.frescor_max_dias);
    if (!l) {
      return { id: ind.id, nome: ind.nome, unidade: ind.unidade, frequencia: ind.frequencia, fonte: ind.fonte, fonte_url: ind.fonte_url, abrangencia: ind.abrangencia, coleta: ind.coleta.tipo, status: 'ausente', valor: null,
        nota: ind.coleta.tipo === 'manual' ? 'Sem dados importados. Importe um CSV em data/manual/ (ver docs/FONTES.md).' : 'Sem dados coletados ainda.' };
    }
    const vars = variations(obs, ind.frequencia);
    const tr = trend(obs, ind.frequencia === 'diaria' ? 20 : 8);
    const refVar = vars.mensal?.pct ?? vars.semanal?.pct ?? vars.anual?.pct ?? null;
    const sinal = refVar === null ? 0 : Math.abs(refVar) < 0.5 ? 0 : Math.sign(refVar);
    return {
      id: ind.id, nome: ind.nome, curto: ind.curto || ind.nome, unidade: ind.unidade, frequencia: ind.frequencia, fonte: l.fonte || ind.fonte, fonte_url: ind.fonte_url, abrangencia: ind.abrangencia, coleta: ind.coleta.tipo,
      valor: l.valor, data_referencia: l.data, coletado_em: l.coletado_em, tipo_dado: l.tipo, praca: l.praca || null,
      status: fr.status, idade_dias: fr.idade_dias,
      variacoes: vars, tendencia: tr,
      // Sem observação anterior comparável não há movimento a interpretar (não dizer "estável").
      interpretacao: refVar === null ? 'Só há um registro comparável até agora; a leitura de tendência aparece a partir da próxima atualização.' : IMPLICACAO[ind.id] ? `${vars.mensal ? 'No mês' : vars.semanal ? 'Na semana' : 'No ano'}: ${IMPLICACAO[ind.id](sinal).charAt(0).toLowerCase()}${IMPLICACAO[ind.id](sinal).slice(1)}` : null,
      aviso: [
        fr.status === 'desatualizado' ? `Último dado é de ${fr.idade_dias} dias atrás — não representa hoje.` : null,
        l.tipo === 'expectativa' ? 'Expectativa de mercado (Focus), não observação.' : null,
        ind.coleta.needs_validation ? 'Código da série a confirmar no log da primeira coleta.' : null
      ].filter(Boolean),
      sparkline: obs.slice(-60).map(o => [o.data, o.valor]),
      historico_url: `data/observations/${ind.id}.json`
    };
  });
}
