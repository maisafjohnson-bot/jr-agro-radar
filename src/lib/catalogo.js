// Catálogo técnico: busca, duplicados, desatualização e comparação.
// Módulo puro (sem DOM, sem disco) — usado pelo painel (navegador) e pelos testes (Node).

export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Aplica alterações locais (edições e cadastros feitos no painel) sobre a base oficial. */
export function mergeOverrides(base, overrides = {}) {
  const porId = new Map(base.map(p => [p.id, p]));
  for (const [id, alt] of Object.entries(overrides.editados || {})) {
    if (porId.has(id)) porId.set(id, { ...porId.get(id), ...alt, _editado_localmente: true });
  }
  for (const novo of overrides.novos || []) if (!porId.has(novo.id)) porId.set(novo.id, { ...novo, _cadastro_local: true });
  return [...porId.values()];
}

function textoBusca(p) {
  return norm([p.fabricante, p.nome, p.modelo, p.categoria, p.subcategoria, p.operacao, p.aplicacao?.texto,
    ...(p.culturas?.lista || []), ...(p.variantes || []).map(v => v.modelo), ...(p.opcionais || []), ...(p.diferenciais || []).map(d => d.texto)].join(' | '));
}

/** Busca por fabricante, categoria, texto livre (modelo, nome) e aplicação. Todos os critérios combinados (E). */
export function search(produtos, { fabricante, categoria, q, aplicacao, status } = {}) {
  const termos = norm(q).split(' ').filter(Boolean);
  const ap = norm(aplicacao);
  return produtos.filter(p => {
    if (fabricante && norm(p.fabricante) !== norm(fabricante)) return false;
    if (categoria && norm(p.categoria) !== norm(categoria)) return false;
    if (status && p.status !== status) return false;
    if (ap && !norm([p.aplicacao?.texto, p.operacao, ...(p.culturas?.lista || [])].join(' ')).includes(ap)) return false;
    if (termos.length) { const t = textoBusca(p); if (!termos.every(x => t.includes(x))) return false; }
    return true;
  });
}

/** Possíveis duplicados: mesmo fabricante e mesmo modelo de variante em produtos diferentes. */
export function duplicates(produtos) {
  const vistos = new Map(), out = [];
  for (const p of produtos) {
    for (const k of [p.modelo, ...(p.variantes || []).map(v => v.modelo)]) {
      const chave = `${norm(p.fabricante)}|${norm(k).replace(/[\s-]/g, '')}`;
      const outro = vistos.get(chave);
      if (outro && outro !== p.id) out.push({ chave: k, produtos: [outro, p.id] });
      else vistos.set(chave, p.id);
    }
  }
  return out;
}

/** Fonte desatualizada: catálogo de origem com mais de `meses` meses. */
export function outdated(base, hojeISO, meses = 12) {
  const hoje = Date.parse(hojeISO);
  return (base.fontes || []).map(f => {
    const idadeMeses = Math.floor((hoje - Date.parse(f.criado_em)) / (30.44 * 864e5));
    return { ...f, idade_meses: idadeMeses, desatualizado: idadeMeses > meses };
  });
}

/** Tabela comparativa das variantes de um produto (mesma família). */
export function compareVariants(p) {
  const campos = [...new Set((p.variantes || []).flatMap(v => Object.keys(v.specs)))];
  return { colunas: ['modelo', ...campos, 'potencia_cv'], linhas: (p.variantes || []).map(v => ({ modelo: v.modelo, ...v.specs, potencia_cv: v.potencia_cv ? `${v.potencia_cv.min}${v.potencia_cv.max !== v.potencia_cv.min ? ' a ' + v.potencia_cv.max : ''}` : null })) };
}

/** Compara dois produtos SÓ se forem da mesma categoria; campos sem dado ficam null (não zero). */
export function compareProducts(a, b) {
  if (norm(a.categoria) !== norm(b.categoria)) return { comparavel: false, motivo: `Categorias diferentes (${a.categoria} × ${b.categoria}) — comparação não faz sentido técnico.` };
  const linha = p => ({
    produto: `${p.fabricante} ${p.modelo}`,
    variantes: p.variantes?.length || 0,
    potencia_cv: p.potencia_requerida_cv ? `${p.potencia_requerida_cv.min} a ${p.potencia_requerida_cv.max}` : null,
    largura_trabalho_mm: p.largura_trabalho_mm ? `${p.largura_trabalho_mm.min} a ${p.largura_trabalho_mm.max}` : null,
    profundidade_mm: p.especificacoes_comuns?.profundidade_corte_mm ?? null,
    engate: p.especificacoes_comuns?.engate ?? null,
    opcionais: (p.opcionais || []).join('; ') || null,
    paginas: (p.pagina || []).join(', ')
  });
  return { comparavel: true, linhas: [linha(a), linha(b)], aviso: 'Comparação só com dados do catálogo; não indica superioridade.' };
}

/** Variante cuja potência mínima cabe no trator informado (para sugerir configuração). */
export function fitByPower(p, cvTrator) {
  if (!Number.isFinite(cvTrator)) return [];
  return (p.variantes || []).filter(v => v.potencia_cv && v.potencia_cv.min <= cvTrator)
    .sort((x, y) => y.potencia_cv.min - x.potencia_cv.min);
}
