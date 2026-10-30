// Simulação da rotina agendada: duas execuções em dias diferentes, rede simulada.
// Comprova armazenamento, preservação do histórico, novas tentativas, registro de erros,
// recálculo e atualização do diagnóstico. NÃO substitui o teste real no GitHub Actions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cenario, CENARIOS } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toBR = d => d.split('-').reverse().join('/');

function fakeFetch(series, ateData, chamadas) {
  return async url => {
    chamadas.push(url);
    if (url.includes('sgs.13522')) throw new Error('ECONNRESET'); // falha persistente simulada
    const m = url.match(/sgs\.(\d+)/);
    if (m) {
      const id = { 1: 'usd_brl', 432: 'selic_meta', 27575: 'icbr_agro' }[m[1]];
      return { ok: true, json: async () => series[id].filter(o => o.data <= ateData).map(o => ({ data: toBR(o.data), valor: String(o.valor) })) };
    }
    const ind = decodeURIComponent(url).includes("'Selic'") ? 'focus_selic_prox_ano' : 'focus_ipca_prox_ano';
    return { ok: true, json: async () => ({ value: series[ind].filter(o => o.data <= ateData).map(o => ({ Data: o.data, DataReferencia: '2027', Mediana: o.valor, baseCalculo: 0 })) }) };
  };
}

test('Rotina: 2 execuções preservam histórico, registram falhas com 3 tentativas e atualizam o diagnóstico', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-rotina-'));
  fs.cpSync(path.join(ROOT, 'config'), path.join(dir, 'config'), { recursive: true });
  process.env.ROOT = dir;
  const { run } = await import(`../src/run.js?rotina=${Date.now()}`);
  const s = cenario(CENARIOS.agro_favoravel);

  const ch1 = [];
  const r1 = await run({ agora: new Date('2026-10-27T22:00:00Z'), fetchImpl: fakeFetch(s, '2026-10-27', ch1) });
  const n1 = JSON.parse(fs.readFileSync(path.join(dir, 'data/observations/usd_brl.json'))).observacoes.length;
  // 3 tentativas para a série que falha
  assert.equal(ch1.filter(u => u.includes('sgs.13522')).length, 3);
  assert.ok(r1.saude.erros.some(e => /ipca_12m: ECONNRESET/.test(e)));

  const ch2 = [];
  const r2 = await run({ agora: new Date('2026-10-28T22:00:00Z'), fetchImpl: fakeFetch(s, '2026-10-28', ch2) });
  delete process.env.ROOT;
  const obs2 = JSON.parse(fs.readFileSync(path.join(dir, 'data/observations/usd_brl.json'))).observacoes;
  assert.equal(obs2.length, n1 + 1, 'um pregão novo, nenhum perdido');
  // coleta incremental: a 2ª execução pede só a partir de 10 dias antes do último dado
  assert.match(ch2.find(u => u.includes('sgs.1/')), /dataInicial=\d{2}\/10\/2026/);
  // histórico de execuções e diagnósticos preservado
  const execs = fs.readFileSync(path.join(dir, 'data/history/execucoes.jsonl'), 'utf8').trim().split('\n');
  const diags = fs.readFileSync(path.join(dir, 'data/history/diagnosticos.jsonl'), 'utf8').trim().split('\n');
  assert.equal(execs.length, 2); assert.equal(diags.length, 2);
  assert.ok(fs.existsSync(path.join(dir, 'reports/2026-10-27.md')) && fs.existsSync(path.join(dir, 'reports/2026-10-28.md')));
  // a 2ª análise compara com a 1ª
  assert.equal(r2.anterior.data, '2026-10-27');
  assert.ok(r2.diagnostico.mudancas_vs_anterior.some(m => /27\/10|2026-10-27/.test(m)));
  // dado que não mudou não é apresentado como novo
  const ipca = r2.cards.find(c => c.id === 'ipca_12m');
  assert.equal(ipca.valor, null); // nunca coletado (falha) → ausente, não zero
  const usd = r2.cards.find(c => c.id === 'usd_brl');
  assert.equal(usd.data_referencia, '2026-10-28');
  assert.ok(usd.fonte_consultada_em);
});
