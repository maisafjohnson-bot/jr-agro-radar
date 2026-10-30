import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSGS, parseFocus } from '../src/collectors/bcb.js';
import { parseManualCSV } from '../src/collectors/manual.js';
import { variations, freshness } from '../src/lib/series.js';
import { analyze } from '../src/analyze.js';
import { RECOMENDACOES as R } from '../src/engine/diagnosis.js';
import { createStore } from '../src/store.js';
import { scenario, dailySeries, monthlySeries } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'config', f), 'utf8'));
const sources = cfg('sources.json').indicators;
const metodo = cfg('methodology.json');
const base = { sources, metodo, catalog: cfg('catalog.json'), calendar: cfg('calendar.json'), agora: '2026-10-29T22:00:00.000Z' };

// ---------- Dados ausentes NUNCA viram zero ----------
test('SGS: valores vazios são descartados, não convertidos em zero', () => {
  const obs = parseSGS([{ data: '01/10/2026', valor: '5.40' }, { data: '02/10/2026', valor: '' }, { data: '03/10/2026', valor: null }], { fonte: 'BCB' });
  assert.equal(obs.length, 1);
  assert.equal(obs[0].valor, 5.4);
  assert.equal(obs[0].data, '2026-10-01');
});

test('CSV manual: valor vazio é rejeitado (não zero), duplicata e data inválida são reportadas', () => {
  const csv = 'indicador;data_referencia;valor;fonte\nsoja_mt;28/10/2026;125,50;Cepea\nsoja_mt;28/10/2026;126,00;Cepea\nsoja_mt;29/10/2026;;Cepea\nsoja_mt;31/02/2026;1,0;Cepea\nxyz;28/10/2026;1;X\nmilho_mt;2026-10-28;1.234,56;IMEA';
  const { registros, erros } = parseManualCSV(csv, new Set(sources.map(s => s.id)));
  assert.equal(registros.length, 2);
  assert.equal(registros[0].valor, 125.5);
  assert.equal(registros[1].valor, 1234.56);
  assert.ok(erros.some(e => /duplicada/.test(e)));
  assert.ok(erros.some(e => /vazio/.test(e)));
  assert.ok(erros.some(e => /desconhecido/.test(e)));
  assert.ok(!registros.some(r => r.valor === 0));
});

test('Focus: usa só baseCalculo 0 e o ano de referência pedido', () => {
  const obs = parseFocus({ value: [
    { Indicador: 'Selic', Data: '2026-10-23', DataReferencia: '2027', Mediana: 12.5, baseCalculo: 0 },
    { Indicador: 'Selic', Data: '2026-10-23', DataReferencia: '2027', Mediana: 12.75, baseCalculo: 1 },
    { Indicador: 'Selic', Data: '2026-10-23', DataReferencia: '2026', Mediana: 15, baseCalculo: 0 }
  ] }, { fonte: 'BCB Focus' }, 2027);
  assert.equal(obs.length, 1);
  assert.equal(obs[0].valor, 12.5);
  assert.equal(obs[0].tipo, 'expectativa');
});

// ---------- Frequências compatíveis ----------
test('Série mensal não recebe variação diária nem semanal', () => {
  const v = variations(monthlySeries({}), 'mensal');
  assert.equal(v.diaria, undefined);
  assert.equal(v.semanal, undefined);
  assert.ok(v.mensal);
});

// ---------- Dados antigos não são apresentados como atuais ----------
test('Dado antigo é marcado como desatualizado e sai do índice', () => {
  const s = scenario(1);
  s.soja_mt = dailySeries({ fim: '2026-08-01', inicio: 120, seed: 5 });
  const r = analyze({ ...base, series: s });
  const card = r.cards.find(c => c.id === 'soja_mt');
  assert.equal(card.status, 'desatualizado');
  assert.ok(card.aviso.some(a => /não representa hoje/.test(a)));
  const v = r.indices.agricola.blocos.find(b => b.id === 'receita').variaveis.find(v => v.id === 'soja_mt');
  assert.equal(v.disponivel, false);
  assert.match(v.motivo, /desatualizado/);
});

// ---------- Índice sem dados mínimos ----------
test('Sem dados suficientes: índice sem nota e recomendação "dados insuficientes"', () => {
  const s = scenario(1);
  const only = { usd_brl: s.usd_brl, selic_meta: s.selic_meta }; // só câmbio (fora da nota) e Selic
  const r = analyze({ ...base, series: only });
  assert.equal(r.indices.agricola.suficiente, false);
  assert.equal(r.indices.agricola.valor, null);
  assert.equal(r.indices.geral.valor, null);
  assert.equal(r.diagnostico.recomendacao, R.INSUFICIENTE);
  assert.ok(r.plano.length >= 3 && r.plano.length <= 7);
});

test('Sem nenhum dado: nada de números inventados', () => {
  const r = analyze({ ...base, series: {} });
  assert.equal(r.indices.geral.valor, null);
  assert.ok(r.cards.every(c => c.valor === null));
  assert.equal(r.diagnostico.fatores_favoraveis.length, 0);
});

// ---------- Coerência das recomendações ----------
test('Cenário favorável x desfavorável produzem índices e recomendações coerentes', () => {
  const fav = analyze({ ...base, series: scenario(1) });
  const des = analyze({ ...base, series: scenario(-1) });
  assert.ok(fav.indices.geral.valor > 60, `fav=${fav.indices.geral.valor}`);
  assert.ok(des.indices.geral.valor < 40, `des=${des.indices.geral.valor}`);
  assert.equal(fav.diagnostico.recomendacao, R.QUALIFICADAS);
  assert.equal(des.diagnostico.recomendacao, R.CAUTELA);
  assert.ok(fav.diagnostico.fatores_favoraveis.length > des.diagnostico.fatores_favoraveis.length);
  // Cenário desfavorável não sugere prospecção agressiva
  assert.ok(!des.plano.some(a => /Prospecção seletiva/.test(a.titulo)));
});

test('Confiança nunca é "alta" antes da calibração; INTENSIFICAR não aparece sem confiança alta', () => {
  const r = analyze({ ...base, series: scenario(1) });
  for (const k of ['geral', 'agricola', 'pecuaria']) assert.notEqual(r.indices[k].confianca, 'alta');
  assert.notEqual(r.diagnostico.recomendacao, R.INTENSIFICAR);
});

test('Câmbio (efeito ambíguo) não entra na nota', () => {
  const a = scenario(1);
  const b = { ...a, usd_brl: dailySeries({ inicio: 5, seed: 99, fimDrift: 0.01 }) };
  assert.equal(analyze({ ...base, series: a }).indices.geral.valor, analyze({ ...base, series: b }).indices.geral.valor);
});

// ---------- Mensagens sem fatos não sustentados ----------
function numeros(txt) { return (txt.match(/\d[\d.,]*/g) || []).map(s => s.replace(/[.,]$/, '')); }

for (const t of [1, -1]) {
  test(`Mensagens (cenário ${t > 0 ? 'favorável' : 'desfavorável'}): todo número citado vem de um fato com fonte`, () => {
    const r = analyze({ ...base, series: scenario(t) });
    const fatosTxt = Object.values(r.diagnostico.fatos).flatMap(f => [f.nivel, f.variacao]).filter(Boolean).join(' | ');
    // datas abreviadas dd/mm usadas na versão de conversa também precisam vir das datas dos fatos
    const datasCurtas = (fatosTxt.match(/\d{2}\/\d{2}\/\d{4}/g) || []).map(d => d.slice(0, 5));
    const permitidos = new Set([...numeros(fatosTxt), ...datasCurtas]);
    for (const k of ['revenda', 'produtor', 'abertura_ligacao']) for (const seg of r.mensagens.por_segmento) {
      for (const n of numeros(seg[k])) assert.ok(permitidos.has(n), `"${n}" em ${seg.segmento}/${k}`);
      for (const n of numeros(r.mensagens[k])) assert.ok(permitidos.has(n), `"${n}" em ${k} não vem de fato verificado: ${r.mensagens[k]}`);
    }
  });
}

test('Mensagens não prometem resultado, preço ou escassez', () => {
  for (const t of [1, -1]) {
    const r = analyze({ ...base, series: scenario(t) });
    const txt = [r.mensagens.revenda, r.mensagens.produtor, r.mensagens.abertura_ligacao, r.boletim_md].join(' ').toLowerCase();
    // "não é garantia" é ressalva legítima; promessas de garantia são proibidas.
    const semRessalvas = txt.replace(/não (é|são) garantia/g, '');
    for (const proibido of [/garant/, /últimas unidades/, /vai subir/, /aproveite antes/, /imperdível/, /retorno certo/, /preço vai/, /antes que acabe/]) {
      assert.ok(!proibido.test(semRessalvas), `texto contém ${proibido}`);
    }
  }
});

test('Mensagem sobre categoria agrícola não usa fatos da pecuária', () => {
  const r = analyze({ ...base, series: scenario(1) });
  assert.equal(r.categorias[0].segmento, 'agricola');
  assert.ok(!r.mensagens.fatos_usados.includes('boi_gordo'));
  assert.ok(!/boi/i.test(r.mensagens.revenda));
});

test('Mensagens mudam quando o diagnóstico muda', () => {
  const a = analyze({ ...base, series: scenario(1) }).mensagens.revenda;
  const b = analyze({ ...base, series: scenario(-1) }).mensagens.revenda;
  assert.notEqual(a, b);
});

// ---------- Boletim ----------
test('Boletim separa fato, cálculo, interpretação, hipótese e recomendação', () => {
  const md = analyze({ ...base, series: scenario(1) }).boletim_md;
  for (const tag of ['[Fato observado]', '[Cálculo]', '[Interpretação]', '[Hipótese comercial]', '[Recomendação]']) assert.ok(md.includes(tag), tag);
  assert.match(md, /não representa probabilidade de venda/);
});

// ---------- Persistência e execução completa com rede simulada ----------
test('Store registra revisões de valores em vez de sobrescrever silenciosamente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  const st = createStore(dir);
  st.merge('x', [{ data: '2026-10-01', valor: 1, coletado_em: 'a' }]);
  const r = st.merge('x', [{ data: '2026-10-01', valor: 2, coletado_em: 'b' }, { data: '2026-10-02', valor: NaN }]);
  assert.equal(r.alteradas, 1);
  const o = st.load('x');
  assert.equal(o.length, 1);
  assert.equal(o[0].revisoes[0].valor_anterior, 1);
});

test('Execução completa: coleta simulada, falha parcial registrada, saída gravada', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  fs.cpSync(path.join(ROOT, 'config'), path.join(dir, 'config'), { recursive: true });
  process.env.ROOT = dir;
  const { run } = await import(`../src/run.js?x=${Date.now()}`);
  const s = scenario(1);
  const toBR = d => d.split('-').reverse().join('/');
  const fakeFetch = async url => {
    if (url.includes('sgs.27575')) return { ok: false, status: 404, json: async () => ({}) }; // falha simulada
    const m = url.match(/sgs\.(\d+)/);
    if (m) {
      const id = { 1: 'usd_brl', 432: 'selic_meta', 13522: 'ipca_12m' }[m[1]];
      return { ok: true, json: async () => s[id].map(o => ({ data: toBR(o.data), valor: String(o.valor) })) };
    }
    const ind = decodeURIComponent(url).includes("'Selic'") ? 'focus_selic_prox_ano' : 'focus_ipca_prox_ano';
    return { ok: true, json: async () => ({ value: s[ind].map(o => ({ Data: o.data, DataReferencia: '2027', Mediana: o.valor, baseCalculo: 0 })) }) };
  };
  const r = await run({ agora: new Date('2026-10-29T22:00:00Z'), fetchImpl: fakeFetch });
  delete process.env.ROOT;
  assert.ok(fs.existsSync(path.join(dir, 'data/latest.json')));
  assert.ok(fs.existsSync(path.join(dir, 'reports/2026-10-29.md')));
  assert.equal(r.saude.ultima_execucao_ok, false);
  assert.ok(r.saude.erros.some(e => /icbr_agro/.test(e)));
  assert.ok(r.cards.find(c => c.id === 'usd_brl').valor > 0);
  assert.equal(r.cards.find(c => c.id === 'icbr_agro').valor, null);
  assert.equal(r.cards.find(c => c.id === 'soja_mt').status, 'ausente');
  assert.ok(r.alertas.some(a => a.id === 'coleta_falhou'));
  assert.match(fs.readFileSync(path.join(dir, 'data/alertas-notificar.md'), 'utf8'), /Falha/);
});
