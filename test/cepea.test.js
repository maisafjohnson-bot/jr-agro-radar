// Coletor Cepea testado com a resposta REAL do widget capturada em 30/10/2026 (dados de 29/10/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCepeaWidget, collectCepea } from '../src/collectors/cepea.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'test/fixtures_reais/cepea_widget_2026-10-29.html'), 'utf8');
const fontes = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/sources.json'), 'utf8')).indicators;

test('Cepea: lê os 5 valores reais de 29/10/2026 com data, unidade e moeda', () => {
  const l = parseCepeaWidget(HTML);
  assert.equal(l.length, 5);
  const g = p => l.find(x => x.produto === p);
  assert.deepEqual([g('Soja Paranaguá').data, g('Soja Paranaguá').valor, g('Soja Paranaguá').unidade], ['2026-10-29', 158.28, 'sc de 60kg']);
  assert.equal(g('Milho').valor, 65.59);
  assert.equal(g('Boi Gordo').valor, 389.2);
  assert.equal(g('Algodão').valor, 412.15);
  assert.match(g('Algodão').moeda, /¢R\$/);
  assert.equal(g('Soja - PR').valor, 152.47);
});

test('Cepea: formato inesperado gera erro (não grava lixo nem zero)', () => {
  assert.throws(() => parseCepeaWidget('<html>manutenção</html>'), /sem tabela/);
  assert.throws(() => parseCepeaWidget('<tbody><tr><td>--</td><td></td><td></td></tr></tbody>'), /sem linhas válidas/);
});

test('Cepea: uma única consulta para os 4 indicadores, valores dentro da faixa plausível', async () => {
  const inds = fontes.filter(s => s.coleta.tipo === 'cepea_widget');
  assert.equal(inds.length, 4);
  const urls = [];
  const r = await collectCepea(inds, { fetchImpl: async u => { urls.push(u); return { ok: true, text: async () => HTML }; } });
  assert.equal(urls.length, 1);
  for (const id of [92, 77, 2, 54]) assert.match(urls[0], new RegExp(`id_indicador%5B%5D=${id}(&|$)`));
  for (const ind of inds) {
    const o = r.porIndicador[ind.id][0];
    assert.ok(o, ind.id);
    assert.ok(o.valor >= ind.faixa_plausivel[0] && o.valor <= ind.faixa_plausivel[1], `${ind.id}=${o.valor}`);
    assert.match(o.fonte, /CC BY-NC/);
  }
});

test('Cepea na rotina: coleta grava, e 2ª execução no mesmo dia não duplica', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-cepea-'));
  fs.cpSync(path.join(ROOT, 'config'), path.join(dir, 'config'), { recursive: true });
  process.env.ROOT = dir;
  const { run } = await import(`../src/run.js?cepea=${Date.now()}`);
  // Outras fontes respondem vazio (falham rápido, sem esperar novas tentativas).
  const fake = async u => u.includes('cepea') ? { ok: true, text: async () => HTML } : { ok: true, json: async () => [] };
  await run({ agora: new Date('2026-10-30T12:00:00Z'), fetchImpl: fake });
  const r2 = await run({ agora: new Date('2026-10-30T22:00:00Z'), fetchImpl: fake });
  delete process.env.ROOT;
  const soja = JSON.parse(fs.readFileSync(path.join(dir, 'data/observations/soja_cepea.json'))).observacoes;
  assert.equal(soja.length, 1);
  assert.equal(soja[0].valor, 158.28);
  const card = r2.cards.find(c => c.id === 'soja_cepea');
  assert.equal(card.data_referencia, '2026-10-29');
  assert.equal(card.status, 'atual');
  assert.ok(r2.saude.coletas.some(c => c.id === 'soja_cepea' && c.ok && c.novas === 0));
});
