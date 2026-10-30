// Testes de cálculo com valores de referência calculados À MÃO (independentes do código).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pctChange, percentileRank, windowChange, historicalChanges, variations, levelPercentile, clean, trend } from '../src/lib/series.js';
import { computeIndex, computeGeneral } from '../src/engine/index.js';
import { validateObservations } from '../src/lib/validate.js';
import { createStore } from '../src/store.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const mensal = vals => vals.map((v, i) => ({ data: new Date(Date.UTC(2020, i, 1)).toISOString().slice(0, 10), valor: v }));

test('pctChange: 100 → 110 = +10%; 50 → 40 = −20%; base zero = null', () => {
  close(pctChange({ valor: 100 }, { valor: 110 }), 10);
  close(pctChange({ valor: 50 }, { valor: 40 }), -20);
  assert.equal(pctChange({ valor: 0 }, { valor: 1 }), null);
});

test('percentileRank: [1,2,3,4] e x=3 → (2 + 0,5)/4 = 0,625; x=5 → 1; x=0 → 0', () => {
  close(percentileRank([1, 2, 3, 4], 3), 0.625);
  close(percentileRank([1, 2, 3, 4], 5), 1);
  close(percentileRank([1, 2, 3, 4], 0), 0);
});

test('Taxas em p.p.: Selic 14,25 → 13,75 = −0,50 p.p. (não −3,5%)', () => {
  const obs = [{ data: '2026-08-14', valor: 14.25 }, { data: '2026-09-17', valor: 13.75 }];
  const w = windowChange(obs, 'diaria', 30, undefined, 'pp');
  close(w.valor, -0.5);
  close(w.pct, (13.75 - 14.25) / 14.25 * 100);
});

test('Janela mensal de 3 obs: série 1..20 → atual = 20 vs 17 = +17,647%', () => {
  const w = windowChange(mensal([...Array(20)].map((_, i) => i + 1)), 'mensal', 3);
  close(w.valor, (20 - 17) / 17 * 100);
});

test('Histórico de variações não se sobrepõe à janela atual: série de 20 meses, janela 3 → 14 janelas', () => {
  // janela atual: índices 16→19. Históricas terminam em 16,15,…,3 (início ≥ 0) = 14 janelas.
  const h = historicalChanges(mensal([...Array(20)].map((_, i) => i + 1)), 'mensal', 3);
  assert.equal(h.length, 14);
  close(h[0], (17 - 14) / 14 * 100); // a mais recente termina no início da atual (índice 16)
});

test('Nível: Selic com histórico 2..15 (14 valores) e atual 13,75 → 12 abaixo → 12/14', () => {
  const vals = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const obs = vals.map((v, i) => ({ data: `2018-${String(i % 12 + 1).padStart(2, '0')}-0${1 + Math.floor(i / 12)}`, valor: v }))
    .concat([{ data: '2026-09-17', valor: 13.75 }]);
  const lv = levelPercentile(obs, 10);
  assert.equal(lv.n, 14);
  close(lv.percentil, 12 / 14);
});

test('Variações: série mensal não tem diária; anual compara com 12 meses antes', () => {
  const v = variations(mensal([...Array(13)].map((_, i) => 100 + i)), 'mensal');
  assert.equal(v.diaria, undefined);
  close(v.anual.pct, 12);
  close(v.mensal.pct, (112 - 111) / 111 * 100);
});

test('Tendência: série linear crescente é "alta"; constante é "estável"', () => {
  assert.equal(trend(mensal([10, 11, 12, 13, 14, 15])).rotulo, 'alta');
  assert.equal(trend(mensal([10, 10, 10, 10, 10])).rotulo, 'estável');
});

test('Focus: observações de ano de referência anterior não entram na comparação', () => {
  const obs = [
    { data: '2026-12-20', valor: 12, ano_referencia: 2027 },
    { data: '2026-12-27', valor: 12.1, ano_referencia: 2027 },
    { data: '2027-01-03', valor: 11, ano_referencia: 2028 },
    { data: '2027-01-10', valor: 11.2, ano_referencia: 2028 }
  ];
  const c = clean(obs);
  assert.deepEqual(c.map(o => o.valor), [11, 11.2]);
});

// ---------- Índice: aritmética conferida à mão ----------
function serieSalto(direcaoSalto = 1) {
  // 40 meses estáveis em 100, depois +30% em 3 meses: variação atual (30%) maior que todas as históricas (0%) → percentil 1
  const vals = [...Array(40)].fill(100).concat([110, 120, 130].map(v => direcaoSalto > 0 ? v : 200 - v));
  return vals.map((v, i) => ({ data: new Date(Date.UTC(2023, i - 18, 1)).toISOString().slice(0, 10), valor: v }));
}
const metodoMini = {
  versao: 'teste',
  regras_gerais: { frescor_max_dias: { diaria: 7, semanal: 21, mensal: 75 }, cobertura_minima: 0.5, historico_minimo_percentil: 24, nivel_anos: 10,
    faixas: [{ min: 0, max: 19, rotulo: 'Muito desfavorável' }, { min: 20, max: 39, rotulo: 'Desfavorável' }, { min: 40, max: 59, rotulo: 'Misto / neutro' }, { min: 60, max: 79, rotulo: 'Favorável' }, { min: 80, max: 100, rotulo: 'Muito favorável' }] },
  janela_variacao: { diaria: 30, semanal: 4, mensal: 3 },
  geral: { pesos: { agricola: 0.7, pecuaria: 0.3 }, nome: 'Geral' }
};
const src = { x: { id: 'x', nome: 'X', unidade: 'índice', frequencia: 'mensal' }, y: { id: 'y', nome: 'Y', unidade: 'índice', frequencia: 'mensal' } };
const defMini = { nome: 'Mini', blocos: [
  { id: 'A', nome: 'A', peso: 0.6, variaveis: [{ id: 'x', direcao: 1, componentes: { momento: 1 } }] },
  { id: 'B', nome: 'B', peso: 0.4, variaveis: [{ id: 'y', direcao: -1, componentes: { momento: 1 } }] }
] };

test('Índice: A (peso 0,6, sinal +1) e B (peso 0,4, sinal −1) → 50 + 50×(0,6−0,4) = 60', () => {
  const s = serieSalto();
  const hoje = s.at(-1).data;
  const r = computeIndex(defMini, src, { x: s, y: s }, metodoMini, hoje);
  assert.equal(r.blocos[0].sinal, 1);
  assert.equal(r.blocos[1].sinal, -1);
  assert.equal(r.valor, 60);
  // contribuições somam valor − 50: 0,6×50 = +30 e −0,4×50 = −20
  assert.equal(r.blocos[0].contribuicao_pontos, 30);
  assert.equal(r.blocos[1].contribuicao_pontos, -20);
});

test('Sensibilidade (±20% nos pesos) conferida à mão: notas 55, 64, 65, 56 → faixa 55–65, muda classificação', () => {
  // A×0,8: (0,48−0,4)/0,88 = 0,0909 → 54,5 → 55 | A×1,2: (0,72−0,4)/1,12 = 0,2857 → 64
  // B×0,8: (0,6−0,32)/0,92 = 0,3043 → 65       | B×1,2: (0,6−0,48)/1,08 = 0,1111 → 56
  const s = serieSalto();
  const r = computeIndex(defMini, src, { x: s, y: s }, metodoMini, s.at(-1).data);
  assert.deepEqual([r.sensibilidade.min, r.sensibilidade.max], [55, 65]);
  assert.equal(r.sensibilidade.muda_classificacao, true);
  assert.notEqual(r.confianca, 'alta');
});

test('Cobertura: só o bloco B (peso 0,4) disponível → 40% < 50% → sem nota', () => {
  const s = serieSalto();
  const r = computeIndex(defMini, src, { y: s }, metodoMini, s.at(-1).data);
  assert.equal(r.suficiente, false);
  assert.equal(r.valor, null);
  close(r.cobertura, 0.4);
});

test('Índice geral: agrícola 60 e pecuário 40 → 0,7×60 + 0,3×40 = 54; divergência ≥ 15 sinalizada', () => {
  const g = computeGeneral({ suficiente: true, valor: 60, confianca: 'moderada' }, { suficiente: true, valor: 40, confianca: 'baixa' }, metodoMini);
  assert.equal(g.valor, 54);
  assert.equal(g.confianca, 'baixa');
  assert.equal(g.divergencia_segmentos, true);
});

test('Validação: valor fora da faixa é rejeitado; salto acima do limite é mantido e marcado', () => {
  const ind = { faixa_plausivel: [2, 12], salto_suspeito_pct: 8 };
  const ex = [{ data: '2026-10-26', valor: 5.30 }];
  const v = validateObservations([{ data: '2026-10-27', valor: 5.31 }, { data: '2026-10-28', valor: 5.9 }, { data: '2026-10-29', valor: 531 }], ex, ind);
  assert.equal(v.aceitas.length, 2);
  assert.equal(v.rejeitadas[0].valor, 531);
  assert.equal(v.suspeitas.length, 1);
  assert.match(v.aceitas[1].verificar, /salto/);
});

test('Store: mesma data com anos de referência diferentes (Focus) não se sobrescrevem', () => {
  const st = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'radar-')));
  st.merge('f', [{ data: '2027-01-03', valor: 12, ano_referencia: 2027 }]);
  st.merge('f', [{ data: '2027-01-03', valor: 11, ano_referencia: 2028 }]);
  assert.equal(st.load('f').length, 2);
});
