// Importação manual de indicadores sem API aberta (Cepea, IMEA, ANP, Abimaq...).
// Formato CSV (separador ; ou ,), cabeçalho obrigatório:
//   indicador;data_referencia;valor;fonte;praca;observacao
// data_referencia: AAAA-MM-DD ou DD/MM/AAAA. valor: 123,45 ou 123.45
import fs from 'node:fs';
import path from 'node:path';

const OBRIG = ['indicador', 'data_referencia', 'valor', 'fonte'];

export function parseManualCSV(texto, idsValidos) {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return { registros: [], erros: ['arquivo vazio'] };
  const sep = linhas[0].includes(';') ? ';' : ',';
  const cab = linhas[0].split(sep).map(s => s.trim().toLowerCase());
  const faltando = OBRIG.filter(c => !cab.includes(c));
  if (faltando.length) return { registros: [], erros: [`colunas obrigatórias ausentes: ${faltando.join(', ')}`] };
  const idx = Object.fromEntries(cab.map((c, i) => [c, i]));
  const registros = [], erros = [];
  const vistos = new Set();
  linhas.slice(1).forEach((l, n) => {
    const c = l.split(sep).map(s => s.trim());
    const ln = n + 2;
    const ind = c[idx.indicador];
    if (!idsValidos.has(ind)) { erros.push(`linha ${ln}: indicador desconhecido "${ind}"`); return; }
    let d = c[idx.data_referencia];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dd, mm, yy] = d.split('/'); d = `${yy}-${mm}-${dd}`; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)) || new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) !== d) { erros.push(`linha ${ln}: data inválida "${c[idx.data_referencia]}"`); return; }
    const bruto = c[idx.valor] ?? '';
    if (bruto === '') { erros.push(`linha ${ln}: valor vazio (linha ignorada, NÃO tratada como zero)`); return; }
    const valor = Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto);
    if (!Number.isFinite(valor)) { erros.push(`linha ${ln}: valor inválido "${bruto}"`); return; }
    const fonte = c[idx.fonte];
    if (!fonte) { erros.push(`linha ${ln}: fonte obrigatória`); return; }
    const chave = `${ind}|${d}`;
    if (vistos.has(chave)) { erros.push(`linha ${ln}: duplicada (${ind} em ${d}) — mantida a primeira`); return; }
    vistos.add(chave);
    registros.push({ indicador: ind, data: d, valor, fonte, praca: idx.praca !== undefined ? c[idx.praca] || null : null, observacao: idx.observacao !== undefined ? c[idx.observacao] || null : null, tipo: 'manual', coletado_em: new Date().toISOString() });
  });
  return { registros, erros };
}

export function importManualDir(dir, idsValidos) {
  const res = { arquivos: [], registros: [], erros: [] };
  if (!fs.existsSync(dir)) return res;
  for (const f of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv'))) {
    const { registros, erros } = parseManualCSV(fs.readFileSync(path.join(dir, f), 'utf8'), idsValidos);
    res.arquivos.push(f);
    res.registros.push(...registros);
    res.erros.push(...erros.map(e => `${f}: ${e}`));
  }
  return res;
}
