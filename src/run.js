#!/usr/bin/env node
// Rotina diária: coleta → validação → armazenamento → índices → diagnóstico →
// plano comercial → boletim. Uso:
//   node src/run.js              (coleta + análise)
//   node src/run.js --offline    (só análise com os dados já armazenados)
//   ROOT=/caminho node src/run.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { collectSGS, collectFocus } from './collectors/bcb.js';
import { importManualDir } from './collectors/manual.js';
import { analyze } from './analyze.js';
import { evaluateAlerts } from './engine/alerts.js';
import { validateObservations } from './lib/validate.js';
import { collectRegional } from './collectors/ibge.js';
import { collectCepea } from './collectors/cepea.js';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ROOT || path.resolve(here, '..');
const cfg = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'config', f), 'utf8'));

export async function run({ offline = false, agora = new Date(), fetchImpl } = {}) {
  const sources = cfg('sources.json').indicators;
  const store = createStore(ROOT);
  const hoje = agora.toISOString().slice(0, 10);
  const execucao = { inicio: agora.toISOString(), coletas: [], erros: [] };

  if (!offline) {
    for (const ind of sources) {
      const t = ind.coleta.tipo;
      if (t !== 'bcb_sgs' && t !== 'bcb_focus') continue;
      try {
        const ex = store.load(ind.id);
        const { url, observacoes } = t === 'bcb_sgs' ? await collectSGS(ind, ex, { hoje, fetchImpl }) : await collectFocus(ind, ex, { hoje, fetchImpl });
        if (!observacoes.length && !ex.length) throw new Error('fonte respondeu sem observações válidas (verificar código da série)');
        const v = validateObservations(observacoes, ex, ind);
        if (observacoes.length && !v.aceitas.length) throw new Error(`todas as ${observacoes.length} observações fora da faixa plausível — provável código de série errado (ex.: ${v.rejeitadas[0].valor} em ${v.rejeitadas[0].data})`);
        const r = store.merge(ind.id, v.aceitas);
        execucao.coletas.push({ id: ind.id, ok: true, url, verificado_em: new Date().toISOString(), recebidas: observacoes.length, rejeitadas: v.rejeitadas.length, suspeitas: v.suspeitas, ...r, ultima_ref: v.aceitas.at(-1)?.data || null });
        if (v.rejeitadas.length) execucao.erros.push(`${ind.id}: ${v.rejeitadas.length} valor(es) fora da faixa rejeitado(s), ex. ${v.rejeitadas[0].valor} em ${v.rejeitadas[0].data}`);
      } catch (e) {
        execucao.coletas.push({ id: ind.id, ok: false, erro: String(e.message || e) });
        execucao.erros.push(`${ind.id}: ${e.message || e}`);
      }
    }
  }
  // Cepea: uma consulta diária ao widget público para todos os indicadores Cepea.
  const cepeaInds = sources.filter(s => s.coleta.tipo === 'cepea_widget');
  if (!offline && cepeaInds.length) {
    try {
      const r = await collectCepea(cepeaInds, { fetchImpl });
      for (const ind of cepeaInds) {
        const obs = r.porIndicador[ind.id];
        if (!obs.length) { execucao.coletas.push({ id: ind.id, ok: false, erro: `produto "${ind.coleta.produto_cepea}" não veio no widget` }); execucao.erros.push(`${ind.id}: não veio no widget do Cepea`); continue; }
        const v = validateObservations(obs, store.load(ind.id), ind);
        const m = store.merge(ind.id, v.aceitas);
        execucao.coletas.push({ id: ind.id, ok: v.aceitas.length > 0, url: r.url, verificado_em: new Date().toISOString(), recebidas: obs.length, rejeitadas: v.rejeitadas.length, suspeitas: v.suspeitas, ...m, ultima_ref: obs[0].data, ...(v.aceitas.length ? {} : { erro: `valor fora da faixa: ${obs[0].valor}` }) });
        if (v.rejeitadas.length) execucao.erros.push(`${ind.id}: valor ${v.rejeitadas[0].valor} fora da faixa plausível`);
      }
    } catch (e) {
      for (const ind of cepeaInds) execucao.coletas.push({ id: ind.id, ok: false, erro: String(e.message || e) });
      execucao.erros.push(`cepea: ${e.message || e}`);
    }
  }
  // Dados regionais do IBGE (anuais): no máximo 1 coleta a cada 30 dias.
  const anoPamAntes = store.readJSON('data/regional/pam.json')?.ano_referencia ?? null;
  if (!offline) {
    try {
      const r = await collectRegional(store, { fetchImpl, agora });
      execucao.regional = r;
      if (r.erros?.length) execucao.erros.push(...r.erros);
    } catch (e) { execucao.erros.push(`ibge: ${e.message || e}`); }
  }
  // Importação manual (sempre)
  const ids = new Set(sources.map(s => s.id));
  const man = importManualDir(path.join(ROOT, 'data', 'manual'), ids);
  const porInd = {};
  for (const r of man.registros) (porInd[r.indicador] ||= []).push(r);
  const byId = Object.fromEntries(sources.map(s => [s.id, s]));
  for (const [id, regs] of Object.entries(porInd)) {
    const v = validateObservations(regs.map(({ indicador, ...o }) => o), store.load(id), byId[id]);
    const r = store.merge(id, v.aceitas);
    execucao.coletas.push({ id, ok: true, origem: 'manual', rejeitadas: v.rejeitadas.length, suspeitas: v.suspeitas, ...r });
    for (const x of v.rejeitadas) execucao.erros.push(`manual ${id}: ${x.valor} em ${x.data} rejeitado (${x.motivo})`);
  }
  execucao.erros.push(...man.erros.map(e => `manual: ${e}`));

  const series = store.loadAll(sources.map(s => s.id));
  const anteriores = store.readLines('data/history/diagnosticos.jsonl');
  const anterior = [...anteriores].reverse().find(a => a.data !== hoje) || null;
  const catalogoBase = store.readJSON('data/catalogo/produtos.json');
  const regionalData = { municipios: store.readJSON('data/regional/municipios.json'), pam: store.readJSON('data/regional/pam.json'), ppm: store.readJSON('data/regional/ppm.json') };
  const resultado = analyze({ catalogoBase, regionalData,
    sources, series, metodo: cfg('methodology.json'), catalog: cfg('catalog.json'), calendar: cfg('calendar.json'),
    agora: agora.toISOString(), anterior, historico: anteriores
  });
  // Catálogo alterado desde a última execução? (alerta de "nova informação das fabricantes")
  const hashCat = catalogoBase ? crypto.createHash('sha256').update(JSON.stringify(catalogoBase.produtos)).digest('hex').slice(0, 16) : null;
  const metaCat = store.readJSON('data/catalogo/meta.json') || {};
  resultado.catalogo_alterado = !!(hashCat && metaCat.hash && metaCat.hash !== hashCat);
  if (hashCat && metaCat.hash !== hashCat) store.writeJSON('data/catalogo/meta.json', { hash: hashCat, desde: new Date().toISOString() });
  if (resultado._regional_completo) { store.writeJSON('data/regional/potencial.json', resultado._regional_completo); delete resultado._regional_completo; }
  execucao.fim = new Date().toISOString();
  const okAuto = execucao.coletas.filter(c => c.ok && !c.origem).length;
  const totalAuto = sources.filter(s => s.coleta.tipo !== 'manual').length;
  resultado.saude = {
    ultima_execucao: execucao.fim,
    ultima_execucao_ok: offline ? null : okAuto === totalAuto,
    modo: offline ? 'offline (sem coleta)' : 'coleta',
    coletas: execucao.coletas, erros: execucao.erros,
    regional: execucao.regional || (offline ? { pulado: true, motivo: 'modo offline' } : null)
  };

  // Distingue "a fonte foi consultada agora" de "o dado é novo": a data de referência continua a do dado.
  for (const c of resultado.cards) {
    const col = execucao.coletas.find(x => x.id === c.id && x.ok && x.verificado_em);
    c.fonte_consultada_em = col ? col.verificado_em : null;
    c.dado_novo_nesta_execucao = col ? col.novas > 0 : false;
  }
  const anoPamDepois = store.readJSON('data/regional/pam.json')?.ano_referencia ?? null;
  resultado.regional_novo_ano = anoPamDepois != null && anoPamDepois !== anoPamAntes ? anoPamDepois : null;
  resultado.alertas = evaluateAlerts({ regras: cfg('alerts.json').regras, cards: resultado.cards, indices: resultado.indices, diagnostico: resultado.diagnostico, anterior, saude: resultado.saude, resultado });
  const paraIssue = resultado.alertas.filter(a => a.canais.includes('issue'));
  // Arquivo lido pelo agendador (GitHub Actions) para abrir uma issue = notificação por e-mail.
  store.writeText('data/alertas-notificar.md', paraIssue.length
    ? `Alertas de ${hoje}:\n\n${paraIssue.map(a => `- **[${a.prioridade}] ${a.titulo}** — ${a.detalhe}`).join('\n')}\n\nRecomendação do dia: ${resultado.diagnostico.recomendacao}\n`
    : '');

  store.writeJSON('data/latest.json', resultado);
  store.appendLine('data/history/execucoes.jsonl', { ...execucao, modo: resultado.saude.modo });
  // Um diagnóstico por dia (o último do dia substitui o anterior na leitura).
  store.appendLine('data/history/diagnosticos.jsonl', {
    data: hoje, analisado_em: resultado.diagnostico.data_analise, recomendacao: resultado.diagnostico.recomendacao,
    situacao: resultado.diagnostico.situacao, confianca: resultado.diagnostico.confianca,
    geral_valor: resultado.indices.geral.valor, agricola_valor: resultado.indices.agricola.valor, pecuaria_valor: resultado.indices.pecuaria.valor,
    marcas: resultado.marcas ? { PICCIN: resultado.marcas.indices.PICCIN.valor, CRUCIANELLI: resultado.marcas.indices.CRUCIANELLI.valor } : null,
    versao: resultado.indices.agricola.versao
  });
  store.writeText(`reports/${hoje}.md`, resultado.boletim_md);
  return resultado;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const offline = process.argv.includes('--offline');
  run({ offline }).then(r => {
    console.log(`Recomendação: ${r.diagnostico.recomendacao}`);
    console.log(`Índice geral: ${r.indices.geral.valor ?? 'sem nota'} (${r.indices.geral.confianca})`);
    for (const c of r.saude.coletas) console.log(`${c.ok ? 'OK  ' : 'ERRO'} ${c.id} ${c.ok ? `novas=${c.novas} total=${c.total} ultima_ref=${c.ultima_ref ?? '-'}` : c.erro}`);
    // Falha total da coleta automática => código de saída 1 (o agendador registra a falha).
    if (!offline && r.saude.coletas.filter(c => !c.origem).every(c => !c.ok)) process.exit(1);
  }).catch(e => { console.error(e); process.exit(1); });
}
