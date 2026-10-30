// CRM, índices por marca, plano do dia e argumentos de venda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCRM, staleNegotiations, crmEvidence, salesSeasonality, pipeline, validate } from '../src/lib/crm.js';
import { combine, COMPONENTES } from '../src/engine/brands.js';
import { regionalPotential, topMunicipios } from '../src/engine/regional.js';
import { parseValores, resolveIds, ALVOS } from '../src/collectors/ibge.js';
import { analyze } from '../src/analyze.js';
import { cenario, CENARIOS } from './fixtures.js';
import { regionalFixture } from './fixtures_regional.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'config', f), 'utf8'));
const catalogoBase = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo/produtos.json'), 'utf8'));
const CAT = catalogoBase.produtos;
const memoria = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), _m: m }; };
const base = (agora, serie = cenario(CENARIOS.agro_favoravel), regionalData = {}) => analyze({ sources: cfg('sources.json').indicators, metodo: cfg('methodology.json'), catalog: cfg('catalog.json'), calendar: cfg('calendar.json'), agora, series: serie, catalogoBase, regionalData });

// ---------------- CRM
test('CRM: criar, editar, recuperar após "reinício" (nova instância sobre o mesmo armazenamento)', () => {
  const st = memoria();
  const crm = createCRM(st, { catalogo: CAT });
  const r = crm.add({ cliente: 'TESTE Fazenda A', marca: 'Crucianelli', municipio: 'Sorriso', uf: 'mt', equipamento: 'Plantor 15 m', etapa: 'proposta', valor_estimado: '1.250.000,00', data_ultimo_contato: '20/10/2026' });
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.registro.equipamento_id, 'crucianelli-plantor');
  assert.equal(r.registro.valor_estimado, 1250000);
  assert.equal(r.registro.data_ultimo_contato, '2026-10-20');
  const e = crm.update(r.registro.id, { etapa: 'negociação', observacoes: 'pediu simulação' });
  assert.equal(e.ok, true);
  const crm2 = createCRM(st, { catalogo: CAT }); // "reinício"
  const rec = crm2.get(r.registro.id);
  assert.equal(rec.etapa, 'negociação');
  assert.equal(rec.observacoes, 'pediu simulação');
});

test('CRM: validações — marca fora do escopo, equipamento inexistente, probabilidade sem justificativa, duplicado', () => {
  const crm = createCRM(memoria(), { catalogo: CAT });
  assert.equal(crm.add({ cliente: 'X', marca: 'SCHEMAQ' }).ok, false);
  const w = crm.add({ cliente: 'Y', marca: 'PICCIN', equipamento: 'GRADE QUE NÃO EXISTE' });
  assert.equal(w.ok, true);
  assert.ok(w.avisos.some(a => /não encontrado no catálogo/.test(a)));
  assert.equal(crm.add({ cliente: 'Z', marca: 'PICCIN', probabilidade: 70 }).ok, false);
  assert.equal(crm.add({ cliente: 'Z', marca: 'PICCIN', probabilidade: 70, probabilidade_justificativa: 'pedido de compra em análise no banco' }).ok, true);
  assert.equal(crm.add({ cliente: 'z ', marca: 'piccin' }).ok, false); // duplicado aberto
  assert.equal(validate({ cliente: 'A', marca: 'PICCIN', data_ultimo_contato: '31/02/2026' }).ok, false);
});

test('CRM: importação CSV com erros por linha, desfazer importação, backup e restauração', () => {
  const st = memoria(); const crm = createCRM(st, { catalogo: CAT });
  const csv = 'cliente;marca;equipamento;etapa;uf;valor_estimado\nTESTE Rev 1;PICCIN;SPCR 500;visita;MT;300000\nTESTE Rev 2;XYZ;;contato;MT;\nTESTE Rev 3;CRUCIANELLI;PLANTOR;prospecção;RO;';
  const r = crm.importCSV(csv, 'teste.csv');
  assert.equal(r.importados, 2);
  assert.ok(r.erros.some(e => /linha 3/.test(e)));
  const backup = crm.exportJSON();
  assert.equal(crm.undoImport(r.lote), 2);
  assert.equal(crm.list().length, 0);
  const rest = crm.importJSON(backup);
  assert.equal(rest.novos, 2);
});

test('CRM: negociações paradas, evidência, sazonalidade e funil', () => {
  const regs = [
    { id: 'a', cliente: 'A', marca: 'PICCIN', etapa: 'proposta', data_ultimo_contato: '2026-10-01', atualizado_em: '2026-10-01' },
    { id: 'b', cliente: 'B', marca: 'PICCIN', etapa: 'negociação', data_ultimo_contato: '2026-10-27', proximo_acompanhamento: '2026-10-28', atualizado_em: '2026-10-27' },
    { id: 'c', cliente: 'C', marca: 'CRUCIANELLI', etapa: 'visita', data_ultimo_contato: '2026-10-28', atualizado_em: '2026-10-28' }
  ];
  const st = staleNegotiations(regs, '2026-10-29', 10);
  assert.deepEqual(st.map(r => r.id), ['a', 'b']); // a: 28 dias; b: acompanhamento vencido
  assert.equal(crmEvidence(regs, 'PICCIN', '2026-10-29').valor, null); // base pequena (< 5)
  const mais = [...regs, ...['d', 'e'].map(i => ({ id: i, cliente: i, marca: 'CRUCIANELLI', etapa: 'perdida', atualizado_em: '2026-10-20' }))];
  // Piccin: proposta (1,5) + negociação (2) = 3,5 → 20 + 15×3,5 = 72,5 → 73
  assert.equal(crmEvidence(mais, 'PICCIN', '2026-10-29').valor, 73);
  assert.equal(salesSeasonality(mais, 'PICCIN', 10).valor, null);
  assert.equal(pipeline(mais, 'CRUCIANELLI').perdida.quantidade, 2);
});

// ---------------- Índices por marca
test('Índice por marca: pesos somam 1 (componente regional com peso 0 explicado) e combinação conferida à mão', () => {
  const soma = Object.values(COMPONENTES).reduce((a, c) => a + c.peso, 0);
  assert.ok(Math.abs(soma - 1) < 1e-9);
  assert.equal(COMPONENTES.regional.peso, 0);
  // economia 80 (0,20), crédito 40 (0,15), momento 90 (0,20), aderência 100 (0,10) → (16+6+18+10)/0,65 = 76,9 → 77
  const r = combine({ economia: { valor: 80 }, credito: { valor: 40 }, momento: { valor: 90 }, aderencia: { valor: 100 } });
  assert.equal(r.valor, 77);
  assert.equal(r.confianca, 'baixa'); // sem regional e sem CRM
  assert.equal(combine({ momento: { valor: 90 }, aderencia: { valor: 100 } }).valor, null); // cobertura 30%
});

test('Piccin e Crucianelli têm análises independentes (economia diferente quando a pecuária diverge)', () => {
  const r = base('2026-10-29T22:00:00.000Z', cenario(CENARIOS.pecuaria_favoravel));
  const P = r.marcas.indices.PICCIN, C = r.marcas.indices.CRUCIANELLI;
  assert.notEqual(P.componentes.economia.valor, C.componentes.economia.valor);
  assert.match(P.componentes.economia.detalhe, /pecuária/);
  assert.doesNotMatch(C.componentes.economia.detalhe, /pecuária/);
});

test('Recomendação Crucianelli (novembro): Plantor, modelos existentes no catálogo, perfil grande, prospectar', () => {
  const s = cenario(CENARIOS.agro_favoravel);
  const desloca = arr => arr.map(o => ({ ...o, data: new Date(Date.parse(o.data) + 23 * 864e5).toISOString().slice(0, 10) }));
  for (const k of Object.keys(s)) s[k] = desloca(s[k]);
  const r = base('2026-11-20T22:00:00.000Z', s, regionalFixture());
  const pl = r.marcas.plano;
  assert.equal(pl.prioridade_marca.marca, 'CRUCIANELLI');
  assert.equal(pl.equipamento.categoria, 'Plantadeiras');
  for (const o of pl.equipamento.opcoes) assert.ok(CAT.some(p => p.id === o.id && p.modelo === o.modelo), `${o.modelo} não existe no catálogo`);
  assert.match(pl.perfil_cliente.porque, /220 a 310 HP/);
  assert.equal(pl.acoes[0].tipo, 'Prospectar produtores');
  assert.equal(pl.regiao.municipios[0].uf, 'MT');
});

test('Recomendação Piccin (junho): categoria em janela de decisão, opções por porte existentes no catálogo', () => {
  const s = cenario(CENARIOS.agro_favoravel);
  const desloca = arr => arr.map(o => ({ ...o, data: new Date(Date.parse(o.data) - 136 * 864e5).toISOString().slice(0, 10) }));
  for (const k of Object.keys(s)) s[k] = desloca(s[k]);
  const r = base('2026-06-15T22:00:00.000Z', s, regionalFixture());
  const eq = r.marcas.plano.por_marca.PICCIN.equipamento;
  assert.ok(['Descompactadores', 'Grades', 'Distribuidores'].includes(eq.categoria));
  assert.ok(eq.janelas.some(j => /Correção e preparo|Planejamento/.test(j)));
  for (const o of eq.opcoes) assert.ok(CAT.some(p => p.id === o.id && p.fabricante === 'PICCIN'));
  assert.ok(eq.opcoes.every(o => !['Linha Caminhão', 'Linha Autopropelido'].includes(CAT.find(p => p.id === o.id).subcategoria)));
});

test('Argumentos de venda: técnicos com página; números das mensagens existem no catálogo ou nos fatos', () => {
  const r = base('2026-10-29T22:00:00.000Z', cenario(CENARIOS.agro_favoravel), regionalFixture());
  assert.ok(r.marcas.argumentos.length >= 2);
  for (const a of r.marcas.argumentos) {
    const p = CAT.find(x => x.id === a.produto);
    assert.ok(a.revenda.argumentos_tecnicos.every(t => /^p\. \d/.test(t.fonte)), `${a.produto} sem página`);
    const permitido = JSON.stringify(p) + JSON.stringify(r.diagnostico.fatos) + JSON.stringify(regionalFixture());
    const nums = s => (s.match(/\d[\d.,]*/g) || []).map(x => x.replace(/[.,]$/, ''));
    const semMilhar = x => x.replace(/\.(?=\d{3}\b)/g, '');
    for (const msg of [a.revenda.whatsapp, a.produtor.whatsapp]) {
      for (const n of nums(msg)) assert.ok(permitido.includes(n) || permitido.includes(semMilhar(n)), `"${n}" sem origem em: ${msg}`);
      assert.doesNotMatch(msg.toLowerCase().replace(/não (é|são) garantia/g, ''), /garant|aumenta(r)? (a )?produtividade|economiza|últimas unidades|imperdível/);
    }
  }
});

// ---------------- Regional
test('IBGE: códigos resolvidos pelo nome; valores sem dado não viram zero; dois anos lidos', () => {
  const meta = { variaveis: [{ id: 214, nome: 'Quantidade produzida' }, { id: 8331, nome: 'Área plantada ou destinada à colheita', unidade: 'Hectares' }],
    classificacoes: [{ id: 782, nome: 'Produto das lavouras temporárias e permanentes', categorias: [{ id: 40124, nome: 'Soja (em grão)' }, { id: 40122, nome: 'Milho (em grão)' }, { id: 40099, nome: 'Algodão herbáceo (em caroço)' }, { id: 40139, nome: 'Café (em grão) Total' }] }] };
  const ids = resolveIds(meta, ALVOS.pam);
  assert.equal(ids.variavel, 8331);
  assert.equal(ids.categorias.soja, 40124);
  const json = [{ id: '8331', resultados: [
    { classificacoes: [{ id: '782', categoria: { '40124': 'Soja (em grão)' } }], series: [{ localidade: { id: '5107925', nome: 'Sorriso - MT' }, serie: { '2024': '600000', '2025': '620000' } }, { localidade: { id: '1100015', nome: 'X - RO' }, serie: { '2024': '-', '2025': '...' } }] }
  ] }];
  const p = parseValores(json, ids);
  assert.equal(p.ano, 2025); assert.equal(p.ano_anterior, 2024);
  assert.equal(p.valores.soja['5107925'], 620000);
  assert.equal(p.valores.soja['1100015'], undefined);
  assert.throws(() => resolveIds({ variaveis: [], classificacoes: [] }, ALVOS.pam));
});

test('Potencial regional: percentil por marca; sem dados → indisponível, sem números inventados', () => {
  assert.equal(regionalPotential({}).disponivel, false);
  const reg = regionalPotential(regionalFixture());
  assert.equal(reg.disponivel, true);
  const topC = topMunicipios(reg, 'CRUCIANELLI', 3);
  assert.equal(topC[0].nome, 'Município Teste MT-1');
  assert.ok(reg.municipios.filter(m => m.uf === 'AC').every(m => m.potencial_crucianelli === null)); // AC sem soja/milho → sem nota
  assert.match(reg.aviso, /não indica intenção de compra/i);
});
