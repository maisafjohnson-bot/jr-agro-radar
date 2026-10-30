// Auditoria do diagnóstico comercial em 5 cenários (séries sintéticas de teste, não dados de mercado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/analyze.js';
import { RECOMENDACOES as R } from '../src/engine/diagnosis.js';
import { cenario, CENARIOS } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'config', f), 'utf8'));
const base = { sources: cfg('sources.json').indicators, metodo: cfg('methodology.json'), catalog: cfg('catalog.json'), calendar: cfg('calendar.json'), agora: '2026-10-29T22:00:00.000Z' };
const run = series => analyze({ ...base, series });
const numeros = t => (t.match(/\d[\d.,]*/g) || []).map(s => s.replace(/[.,]$/, ''));

function semFatosInventados(r) {
  const fatos = Object.values(r.diagnostico.fatos).flatMap(f => [f.nivel, f.variacao]).filter(Boolean).join(' | ');
  const ok = new Set([...numeros(fatos), ...(fatos.match(/\d{2}\/\d{2}\/\d{4}/g) || []).map(d => d.slice(0, 5))]);
  for (const m of r.mensagens.por_segmento) for (const k of ['revenda', 'produtor', 'abertura_ligacao']) {
    for (const n of numeros(m[k])) assert.ok(ok.has(n), `número "${n}" sem fato de origem em ${m.segmento}/${k}`);
  }
}
function fatoresExplicados(lista) {
  for (const f of lista) {
    assert.ok(f.o_que_aconteceu && f.variacao && f.periodo && f.fonte && f.porque_importa && f.impacto_comercial, `fator incompleto: ${f.id}`);
    assert.ok(f.limitacoes.length >= 2);
  }
}

test('Cenário 1 — agricultura favorável', () => {
  const r = run(cenario(CENARIOS.agro_favoravel));
  assert.ok(r.indices.agricola.valor >= 60);
  assert.equal(r.oportunidades[0].segmento, 'agricola');
  assert.equal(r.oportunidades[0].status, 'oportunidade');
  assert.ok([R.QUALIFICADAS, R.CONVERSAO].includes(r.diagnostico.recomendacao));
  assert.notEqual(r.diagnostico.recomendacao, R.INTENSIFICAR); // sem calibração não intensifica
  fatoresExplicados(r.diagnostico.fatores_favoraveis);
  // commodity em alta ≠ caixa disponível
  assert.ok(r.diagnostico.fatores_favoraveis.some(f => f.limitacoes.some(l => /não significa caixa/.test(l))));
  assert.match(r.diagnostico.resumo_executivo, /não equivale a dinheiro disponível/);
  assert.match(r.diagnostico.resumo_executivo, /não é previsão de venda/);
  assert.ok(r.oportunidades[0].objecoes.some(o => /caixa/.test(o.objecao)));
  assert.ok(!/boi|arroba/i.test(r.mensagens.revenda));
  semFatosInventados(r);
});

test('Cenário 2 — agricultura desfavorável', () => {
  const r = run(cenario(CENARIOS.agro_desfavoravel));
  assert.ok(r.indices.agricola.valor < 40);
  assert.ok([R.CAUTELA, R.MONITORAR].includes(r.diagnostico.recomendacao));
  assert.ok(!r.plano.some(a => /Prospecção seletiva — agricultura/.test(a.titulo)));
  assert.ok(r.plano.some(a => /necessidades urgentes/.test(a.titulo)));
  fatoresExplicados(r.diagnostico.fatores_desfavoraveis);
  const agri = r.mensagens.por_segmento.find(m => m.segmento === 'agricola');
  assert.equal(agri.fatos_usados.length, 0); // não usa dado ruim como argumento de venda
  semFatosInventados(r);
});

test('Cenário 3 — pecuária favorável com agricultura neutra', () => {
  const r = run(cenario(CENARIOS.pecuaria_favoravel));
  assert.ok(r.indices.pecuaria.valor >= 60, `pec=${r.indices.pecuaria.valor}`);
  const op = r.oportunidades.find(o => o.segmento === 'pecuaria');
  assert.equal(op.status, 'oportunidade');
  assert.equal(r.oportunidades[0].segmento, 'pecuaria');
  assert.match(op.regiao, /RO e AC/);
  assert.ok(r.plano.some(a => /Prospecção seletiva — pecuária/.test(a.titulo)));
  const msg = r.mensagens.por_segmento.find(m => m.segmento === 'pecuaria');
  assert.match(msg.produtor, /trato/);
  assert.ok(!/soja/i.test(msg.produtor));
  semFatosInventados(r);
});

test('Cenário 4 — indicadores contraditórios (receita sobe, juros e custos sobem)', () => {
  const r = run(cenario(CENARIOS.contraditorio));
  assert.equal(r.indices.agricola.contraditorio, true);
  assert.ok(![R.QUALIFICADAS, R.INTENSIFICAR].includes(r.diagnostico.recomendacao));
  assert.ok(r.diagnostico.fatores_favoraveis.length > 0 && r.diagnostico.fatores_desfavoraveis.length > 0);
  assert.match(r.indices.agricola.motivo_confianca, /direções opostas/);
  assert.notEqual(r.oportunidades.find(o => o.segmento === 'agricola').status, 'oportunidade');
  semFatosInventados(r);
});

test('Cenário 5a — dados regionais desatualizados: só BCB atual → confiança baixa, sem prospecção', () => {
  const s = cenario(CENARIOS.agro_favoravel);
  const velho = arr => arr.map(o => ({ ...o, data: new Date(Date.parse(o.data) - 150 * 864e5).toISOString().slice(0, 10) }));
  for (const id of ['soja_mt', 'milho_mt', 'boi_gordo', 'diesel_mt', 'fertilizante', 'maquinas_vendas']) s[id] = velho(s[id]);
  const r = run(s);
  for (const id of ['soja_mt', 'milho_mt', 'diesel_mt']) assert.equal(r.cards.find(c => c.id === id).status, 'desatualizado');
  assert.equal(r.indices.agricola.confianca, 'baixa');
  assert.match(r.indices.agricola.motivo_confianca, /nenhum indicador regional/);
  assert.ok([R.MONITORAR, R.CAUTELA, R.INSUFICIENTE].includes(r.diagnostico.recomendacao));
  assert.ok(!r.diagnostico.fatores_favoraveis.some(f => f.id === 'soja_mt')); // dado velho não vira argumento
});

test('Cenário 5b — dados insuficientes: sem nota, sem número inventado, plano de rotina', () => {
  const s = cenario({});
  const r = run({ usd_brl: s.usd_brl, selic_meta: s.selic_meta });
  assert.equal(r.indices.geral.valor, null);
  assert.equal(r.diagnostico.recomendacao, R.INSUFICIENTE);
  assert.ok(r.plano.some(a => /Completar os dados/.test(a.titulo)));
  assert.ok(r.oportunidades.every(o => o.status === 'sem dados'));
  assert.equal(numeros(r.mensagens.revenda).length, 0);
});
