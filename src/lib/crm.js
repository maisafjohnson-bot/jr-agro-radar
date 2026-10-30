// CRM da JR Agro — oportunidades por fabricante. Módulo puro; o armazenamento é injetado
// (no painel: localStorage do aparelho; nos testes: memória). Nada é enviado a servidor.

export const MARCAS = ['PICCIN', 'CRUCIANELLI'];
export const ETAPAS = ['prospecção', 'contato', 'visita', 'proposta', 'negociação', 'ganha', 'perdida'];
export const ABERTAS = ['prospecção', 'contato', 'visita', 'proposta', 'negociação'];
export const PERFIS = ['revenda', 'pequeno produtor', 'médio produtor', 'grande propriedade', 'grupo agrícola'];
const PESO_ETAPA = { 'prospecção': 0.25, contato: 0.5, visita: 1, proposta: 1.5, 'negociação': 2 };
export const CAMPOS_CSV = ['cliente', 'revenda', 'municipio', 'uf', 'marca', 'equipamento', 'perfil', 'valor_estimado', 'etapa', 'data_ultimo_contato', 'proximo_acompanhamento', 'observacoes'];

const hojeISO = () => new Date().toISOString().slice(0, 10);
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
function paraISO(d) {
  d = String(d ?? '').trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dd, mm, yy] = d.split('/'); d = `${yy}-${mm}-${dd}`; }
  return d;
}

/** Valida e normaliza uma oportunidade. Devolve { ok, registro, erros, avisos }. */
export function validate(o, catalogo = []) {
  const erros = [], avisos = [];
  const r = { ...o };
  r.cliente = String(r.cliente ?? '').trim();
  if (!r.cliente) erros.push('cliente é obrigatório');
  r.marca = String(r.marca ?? '').toUpperCase().trim();
  if (!MARCAS.includes(r.marca)) erros.push(`marca deve ser PICCIN ou CRUCIANELLI (veio "${o.marca ?? ''}")`);
  r.etapa = norm(r.etapa) ? ETAPAS.find(e => norm(e) === norm(r.etapa)) : 'prospecção';
  if (!r.etapa) erros.push(`etapa inválida: "${o.etapa}" (use: ${ETAPAS.join(', ')})`);
  r.uf = String(r.uf ?? '').toUpperCase().trim();
  if (r.uf && !['MT', 'RO', 'AC'].includes(r.uf)) avisos.push(`UF ${r.uf} fora do território (MT, RO, AC)`);
  if (r.perfil && !PERFIS.includes(r.perfil)) { const p = PERFIS.find(x => norm(x) === norm(r.perfil)); if (p) r.perfil = p; else avisos.push(`perfil "${r.perfil}" fora da lista`); }
  for (const k of ['data_ultimo_contato', 'proximo_acompanhamento']) {
    if (r[k]) { r[k] = paraISO(r[k]); if (!dataOk(r[k])) erros.push(`${k} inválida: "${o[k]}"`); }
  }
  if (r.valor_estimado !== undefined && r.valor_estimado !== null && r.valor_estimado !== '') {
    const v = typeof r.valor_estimado === 'number' ? r.valor_estimado : Number(String(r.valor_estimado).replace(/[R$\s]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) erros.push(`valor_estimado inválido: "${o.valor_estimado}"`); else r.valor_estimado = v;
  } else r.valor_estimado = null;
  // Equipamento: deve existir no catálogo da marca (aceita id, modelo da família ou modelo da variante)
  if (r.equipamento) {
    const q = norm(r.equipamento).replace(/[\s-]/g, '');
    const achado = catalogo.find(p => p.fabricante === r.marca && (norm(p.id) === norm(r.equipamento) || norm(p.modelo).replace(/[\s-]/g, '') === q || (p.variantes || []).some(v => norm(v.modelo).replace(/[\s-]/g, '') === q)));
    if (achado) r.equipamento_id = achado.id;
    else if (catalogo.length) avisos.push(`equipamento "${r.equipamento}" não encontrado no catálogo ${r.marca}`);
  }
  // Probabilidade só com justificativa (não inventar chance de fechamento)
  if (r.probabilidade != null && r.probabilidade !== '') {
    const p = Number(r.probabilidade);
    if (!Number.isFinite(p) || p < 0 || p > 100) erros.push('probabilidade deve estar entre 0 e 100');
    else if (!String(r.probabilidade_justificativa ?? '').trim()) erros.push('probabilidade exige justificativa');
    else r.probabilidade = p;
  } else { r.probabilidade = null; }
  return { ok: !erros.length, registro: r, erros, avisos };
}

export function createCRM(storage, { chave = 'radar.crm', catalogo = [], agora = () => new Date().toISOString() } = {}) {
  const ler = () => { try { const v = storage.getItem(chave); return v ? JSON.parse(v) : { versao: 1, registros: [], importacoes: [] }; } catch { return { versao: 1, registros: [], importacoes: [] }; } };
  const gravar = db => { storage.setItem(chave, JSON.stringify(db)); return db; };
  const id = () => `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    list(filtro = {}) {
      return ler().registros.filter(r => (!filtro.marca || r.marca === filtro.marca) && (!filtro.etapa || r.etapa === filtro.etapa) && (!filtro.abertas || ABERTAS.includes(r.etapa)));
    },
    get(i) { return ler().registros.find(r => r.id === i) || null; },
    add(o) {
      const v = validate(o, catalogo);
      if (!v.ok) return v;
      const db = ler();
      const dup = db.registros.find(r => ABERTAS.includes(r.etapa) && norm(r.cliente) === norm(v.registro.cliente) && r.marca === v.registro.marca && (r.equipamento_id || '') === (v.registro.equipamento_id || ''));
      if (dup) return { ok: false, erros: [`oportunidade aberta já existe para ${dup.cliente} / ${dup.marca} (id ${dup.id})`], avisos: v.avisos };
      const reg = { ...v.registro, id: id(), criado_em: agora(), atualizado_em: agora(), historico: [], propostas: [], vendas: [] };
      db.registros.push(reg); gravar(db);
      return { ok: true, registro: reg, avisos: v.avisos };
    },
    update(i, patch) {
      const db = ler(); const k = db.registros.findIndex(r => r.id === i);
      if (k < 0) return { ok: false, erros: ['registro não encontrado'] };
      const v = validate({ ...db.registros[k], ...patch }, catalogo);
      if (!v.ok) return v;
      db.registros[k] = { ...db.registros[k], ...v.registro, atualizado_em: agora() };
      gravar(db); return { ok: true, registro: db.registros[k], avisos: v.avisos };
    },
    remove(i) { const db = ler(); const n = db.registros.length; db.registros = db.registros.filter(r => r.id !== i); gravar(db); return n !== db.registros.length; },
    /** Visita, contato ou proposta: entra no histórico e atualiza o último contato. */
    addInteraction(i, { tipo = 'contato', data = hojeISO(), nota = '', valor = null } = {}) {
      const db = ler(); const r = db.registros.find(x => x.id === i);
      if (!r) return { ok: false, erros: ['registro não encontrado'] };
      if (!dataOk(paraISO(data))) return { ok: false, erros: ['data inválida'] };
      const ev = { tipo, data: paraISO(data), nota, valor: valor == null || valor === '' ? null : Number(valor) };
      (tipo === 'proposta' ? r.propostas : r.historico).push(ev);
      if (!r.data_ultimo_contato || ev.data > r.data_ultimo_contato) r.data_ultimo_contato = ev.data;
      r.atualizado_em = agora(); gravar(db); return { ok: true, registro: r };
    },
    registerSale(i, { data = hojeISO(), valor = null, nota = '' } = {}) {
      const db = ler(); const r = db.registros.find(x => x.id === i);
      if (!r) return { ok: false, erros: ['registro não encontrado'] };
      r.vendas.push({ data: paraISO(data), valor: valor == null || valor === '' ? null : Number(valor), nota });
      r.etapa = 'ganha'; r.atualizado_em = agora(); gravar(db); return { ok: true, registro: r };
    },
    importCSV(texto, nomeArquivo = 'planilha.csv') {
      const linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
      if (!linhas.length) return { ok: false, importados: 0, erros: ['arquivo vazio'] };
      const sep = linhas[0].includes(';') ? ';' : ',';
      const cab = linhas[0].split(sep).map(c => norm(c).replace(/\s+/g, '_'));
      if (!cab.includes('cliente') || !cab.includes('marca')) return { ok: false, importados: 0, erros: ['colunas obrigatórias: cliente, marca'] };
      const lote = `imp-${Date.now().toString(36)}`; const erros = [], avisos = []; let importados = 0;
      linhas.slice(1).forEach((l, n) => {
        const c = l.split(sep); const o = Object.fromEntries(cab.map((h, i) => [h, (c[i] ?? '').trim()]));
        const r = this.add({ ...o, importacao: lote });
        if (r.ok) { importados++; avisos.push(...(r.avisos || []).map(a => `linha ${n + 2}: ${a}`)); }
        else erros.push(...r.erros.map(e => `linha ${n + 2}: ${e}`));
      });
      const db = ler(); db.importacoes.push({ id: lote, arquivo: nomeArquivo, em: agora(), importados, erros: erros.length }); gravar(db);
      return { ok: importados > 0, importados, erros, avisos, lote };
    },
    undoImport(lote) { const db = ler(); const n = db.registros.length; db.registros = db.registros.filter(r => r.importacao !== lote); db.importacoes = db.importacoes.filter(x => x.id !== lote); gravar(db); return n - db.registros.length; },
    exportJSON() { return JSON.stringify({ exportado_em: agora(), ...ler() }, null, 1); },
    /** Restaura um backup: mescla por id (o registro mais recente vence). */
    importJSON(texto) {
      let dados; try { dados = JSON.parse(texto); } catch { return { ok: false, erros: ['JSON inválido'] }; }
      if (!Array.isArray(dados.registros)) return { ok: false, erros: ['backup sem lista de registros'] };
      const db = ler(); const porId = new Map(db.registros.map(r => [r.id, r])); let novos = 0, atualizados = 0;
      for (const r of dados.registros) {
        const atual = porId.get(r.id);
        if (!atual) { porId.set(r.id, r); novos++; } else if ((r.atualizado_em || '') > (atual.atualizado_em || '')) { porId.set(r.id, r); atualizados++; }
      }
      db.registros = [...porId.values()]; gravar(db); return { ok: true, novos, atualizados };
    },
    raw: ler
  };
}

/** Negociações sem atualização: etapas avançadas sem contato há `dias` dias ou com acompanhamento vencido. */
export function staleNegotiations(registros, hoje = hojeISO(), dias = 10) {
  const lim = Date.parse(hoje) - dias * 864e5;
  return registros.filter(r => ['visita', 'proposta', 'negociação'].includes(r.etapa))
    .map(r => {
      const ultimo = r.data_ultimo_contato ? Date.parse(r.data_ultimo_contato) : null;
      const vencido = r.proximo_acompanhamento && r.proximo_acompanhamento < hoje;
      const parado = ultimo == null || ultimo < lim;
      return (vencido || parado) ? { ...r, dias_sem_contato: ultimo == null ? null : Math.floor((Date.parse(hoje) - ultimo) / 864e5), acompanhamento_vencido: !!vencido } : null;
    }).filter(Boolean).sort((a, b) => (b.dias_sem_contato ?? 999) - (a.dias_sem_contato ?? 999));
}

/** Componente "evidência de intenção de compra" do índice da marca (0–100) ou null com base pequena. */
export function crmEvidence(registros, marca, hoje = hojeISO(), minimo = 5) {
  if (registros.length < minimo) return { valor: null, detalhe: `CRM com ${registros.length} registro(s); são necessários ${minimo} para usar como evidência.` };
  const lim = Date.parse(hoje) - 60 * 864e5;
  const ativos = registros.filter(r => r.marca === marca && ABERTAS.includes(r.etapa) && Date.parse(r.atualizado_em || r.criado_em || 0) >= lim);
  const soma = ativos.reduce((a, r) => a + (PESO_ETAPA[r.etapa] || 0), 0);
  return { valor: Math.max(0, Math.min(100, Math.round(20 + 15 * soma))),
    detalhe: `${ativos.length} oportunidade(s) ${marca === 'PICCIN' ? 'Piccin' : 'Crucianelli'} abertas e atualizadas nos últimos 60 dias (peso por etapa: prospecção 0,25 … negociação 2).` };
}

/** Componente "sazonalidade de vendas": participação do mês nas vendas registradas. Exige 12 meses e 10 vendas. */
export function salesSeasonality(registros, marca, mes) {
  const vendas = registros.filter(r => r.marca === marca).flatMap(r => r.vendas || []).filter(v => v.data);
  if (vendas.length < 10) return { valor: null, detalhe: `${vendas.length} venda(s) ${marca === 'PICCIN' ? 'Piccin' : 'Crucianelli'} registradas; são necessárias 10 para medir sazonalidade.` };
  const datas = vendas.map(v => Date.parse(v.data)).sort((a, b) => a - b);
  if ((datas.at(-1) - datas[0]) / 864e5 < 330) return { valor: null, detalhe: 'Histórico de vendas com menos de 12 meses.' };
  const noMes = vendas.filter(v => Number(v.data.slice(5, 7)) === mes).length / vendas.length;
  return { valor: Math.max(0, Math.min(100, Math.round(50 + 50 * (noMes - 1 / 12) / (1 / 12)))), detalhe: `${Math.round(noMes * 100)}% das vendas registradas caíram neste mês (média de um mês: 8%).` };
}

/** Resumo do funil por marca. */
export function pipeline(registros, marca) {
  const rs = registros.filter(r => r.marca === marca);
  return Object.fromEntries(ETAPAS.map(e => { const x = rs.filter(r => r.etapa === e); return [e, { quantidade: x.length, valor: x.reduce((a, r) => a + (r.valor_estimado || 0), 0) }]; }));
}
