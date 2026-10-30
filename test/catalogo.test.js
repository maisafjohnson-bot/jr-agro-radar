// Testes do catálogo técnico: cada número cadastrado deve existir na página de origem do PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, duplicates, outdated, compareProducts, compareVariants, fitByPower, mergeOverrides } from '../src/lib/catalogo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo/produtos.json'), 'utf8'));
const P = base.produtos;
const fontes = {
  'Cata_logo_2026.pdf': JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo/fontes/piccin_catalogo_2026_paginas.json'), 'utf8')).paginas,
  'Apresentac_a_o_Plantor_1.pdf': JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo/fontes/crucianelli_plantor_2024_paginas.json'), 'utf8')).paginas
};
// "4 1 5mm" no PDF = 415; colunas separadas por vários espaços continuam separadas.
const normPagina = t => t.replace(/(\d) (?=\d)/g, '$1');
function formas(n) {
  const f = new Set([String(n)]);
  if (!Number.isInteger(n)) { f.add(String(n).replace('.', ',')); f.add(n.toFixed(2).replace('.', ',')); f.add(n.toFixed(1).replace('.', ',')); }
  else { f.add(n.toFixed(2).replace('.', ',')); if (n >= 1000) f.add(n.toLocaleString('pt-BR')); }
  return [...f];
}
function numerosDe(v) {
  if (typeof v === 'number') return [v];
  if (typeof v === 'string') return (v.match(/\d+(?:[.,]\d+)?/g) || []).map(s => Number(s.replace(',', '.')));
  if (Array.isArray(v)) return v.flatMap(numerosDe);
  return [];
}

test('Catálogos processados: 2 arquivos, Piccin 68 páginas, Plantor 16 páginas', () => {
  assert.equal(base.fontes.length, 2);
  assert.equal(base.fontes[0].paginas, 68);
  assert.equal(base.fontes[1].paginas, 16);
  assert.ok(Object.keys(fontes['Cata_logo_2026.pdf']).length >= 60);
});

test('Quantidade de produtos e escopo: Piccin completo; Crucianelli só plantadeiras', () => {
  const pic = P.filter(p => p.fabricante === 'PICCIN'), cru = P.filter(p => p.fabricante === 'CRUCIANELLI');
  assert.equal(pic.length, 58);
  assert.equal(cru.length, 2);
  assert.ok(cru.every(p => p.categoria === 'Plantadeiras'));
  assert.deepEqual([...new Set(pic.map(p => p.categoria))].sort(), ['Descompactadores', 'Distribuidores', 'Grades', 'Utilitários']);
});

test('Cada produto tem a estrutura mínima de cadastro', () => {
  for (const p of P) {
    for (const k of ['fabricante', 'nome', 'modelo', 'categoria', 'aplicacao', 'culturas', 'operacao', 'especificacoes_comuns', 'diferenciais', 'beneficios', 'perfil_cliente', 'pagina', 'arquivo', 'data_processamento', 'status', 'disponibilidade'])
      assert.ok(p[k] !== undefined, `${p.id} sem ${k}`);
    assert.ok(['confirmada', 'incompleta', 'pendente de validação'].includes(p.status));
    assert.match(p.disponibilidade, /não confirmada/);
    assert.ok(!('preco' in p), 'preço nunca é cadastrado a partir do catálogo');
  }
});

test('Conferência com o PDF: todo número das variantes aparece na página de origem', () => {
  let conferidos = 0, imagem = 0;
  const falhas = [];
  for (const p of P) {
    if (p.conferido_em_imagem) { imagem += p.variantes.length; continue; }
    const texto = normPagina(p.pagina.map(n => fontes[p.arquivo][String(n)] || '').join('\n'));
    for (const v of p.variantes) {
      const valores = [...Object.values(v.specs).flatMap(numerosDe), ...(v.potencia_cv ? [v.potencia_cv.min, v.potencia_cv.max] : [])];
      for (const n of valores) {
        if (formas(n).some(f => texto.includes(f))) conferidos++;
        else falhas.push(`${p.id} / ${v.modelo}: ${n} não encontrado na(s) página(s) ${p.pagina.join(',')}`);
      }
    }
  }
  assert.deepEqual(falhas, []);
  assert.ok(conferidos > 1500, `conferidos=${conferidos}`);
  assert.ok(imagem > 0);
});

test('Tabelas que são imagem no PDF (p. 22, 42, 44) estão marcadas e explicadas', () => {
  const img = P.filter(p => p.conferido_em_imagem);
  assert.deepEqual(img.map(p => p.pagina[0]).sort((a, b) => a - b), [22, 42, 44]);
  assert.ok(img.every(p => p.divergencias.some(d => /imagem/.test(d.texto))));
});

test('Pesquisa por fabricante, modelo, categoria e aplicação', () => {
  assert.equal(search(P, { fabricante: 'crucianelli' }).length, 2);
  assert.deepEqual(search(P, { q: 'SPCR 500' }).map(p => p.id), ['piccin-spcr500']);
  assert.ok(search(P, { q: 'gsp' }).some(p => p.id === 'piccin-gspcr'));
  assert.equal(search(P, { categoria: 'Grades' }).length, 18);
  assert.ok(search(P, { aplicacao: 'calcario' }).every(p => p.categoria === 'Distribuidores'));
  assert.ok(search(P, { aplicacao: 'cafe' }).some(p => p.id === 'piccin-master-cafeeira'));
  assert.ok(search(P, { q: 'taxa variavel' }).length >= 5);
  assert.equal(search(P, { q: 'modelo inexistente xyz' }).length, 0);
});

test('Duplicados: base oficial sem duplicados; cadastro local repetido é detectado', () => {
  assert.deepEqual(duplicates(P), []);
  const comNovo = mergeOverrides(P, { novos: [{ id: 'teste-dup', fabricante: 'PICCIN', modelo: 'SPCR', variantes: [] }] });
  assert.ok(duplicates(comNovo).some(d => d.produtos.includes('teste-dup')));
});

test('Desatualização: apresentação da Plantor (07/2024) tem mais de 12 meses', () => {
  const o = outdated(base, '2026-10-29');
  assert.equal(o.find(f => f.fabricante === 'CRUCIANELLI').desatualizado, true);
  assert.equal(o.find(f => f.fabricante === 'PICCIN').desatualizado, false);
});

test('Comparação: só dentro da mesma categoria', () => {
  const g = id => P.find(p => p.id === id);
  assert.equal(compareProducts(g('piccin-gacr'), g('piccin-master')).comparavel, false);
  const c = compareProducts(g('piccin-spcr'), g('piccin-spcr500'));
  assert.equal(c.comparavel, true);
  assert.equal(c.linhas[1].profundidade_mm, '200 - 500');
  assert.equal(compareVariants(g('crucianelli-plantor')).linhas.length, 3);
});

test('Configuração por potência do trator: 280 cv → Plantor 15 m (270 HP) é a maior que cabe', () => {
  const pl = P.find(p => p.id === 'crucianelli-plantor');
  assert.equal(fitByPower(pl, 280)[0].modelo, 'Plantor 15 m');
  assert.equal(fitByPower(pl, 200).length, 0);
});
