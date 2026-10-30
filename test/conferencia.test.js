import test from 'node:test';
import assert from 'node:assert/strict';
import { conferirMovimento, fetchRefUSDBRL } from '../src/collectors/conferencia.js';

// Resposta real da api.frankfurter.dev (BCE) consultada em 30/10/2026
const REAL = {"amount":1.0,"base":"USD","start_date":"2026-10-20","end_date":"2026-10-29","rates":{"2026-10-20":{"BRL":5.0235},"2026-10-21":{"BRL":5.0233},"2026-10-22":{"BRL":5.049},"2026-10-23":{"BRL":5.0465},"2026-10-26":{"BRL":5.5884},"2026-10-27":{"BRL":5.3474},"2026-10-28":{"BRL":5.3271},"2026-10-29":{"BRL":5.3516}}};
const fake = async () => ({ ok: true, status: 200, json: async () => REAL, text: async () => JSON.stringify(REAL) });

test('salto do dólar de out/2026 confirmado pelo BCE (dados reais)', async () => {
  const { taxas } = await fetchRefUSDBRL('2026-10-22', '2026-10-29', { fetchImpl: fake });
  // BCB SGS 1: 5,0383 (22/10) → 5,3744 (29/10) = +6,67%; BCE: 5,049 → 5,3516 = +5,99%
  const r = conferirMovimento({ de: '2026-10-22', para: '2026-10-29', pct: 6.6709 }, 5.3744, '2026-10-29', taxas);
  assert.equal(r.status, 'confirmado');
  assert.equal(r.ref_pct, 5.99);
  assert.match(r.texto, /confirmado por 2 fontes/);
});

test('movimento que a 2ª fonte não mostra é marcado como divergente', () => {
  const taxas = { '2026-10-22': 5.049, '2026-10-29': 5.06 };
  const r = conferirMovimento({ de: '2026-10-22', para: '2026-10-29', pct: 6.67 }, 5.3744, '2026-10-29', taxas);
  assert.equal(r.status, 'divergente');
  assert.match(r.texto, /confira antes de usar/);
});

test('sem cotação da referência na data: indisponível, nunca "confirmado"', () => {
  const r = conferirMovimento({ de: '2026-10-22', para: '2026-10-29', pct: 6.67 }, 5.37, '2026-10-29', {});
  assert.equal(r.status, 'indisponivel');
});
