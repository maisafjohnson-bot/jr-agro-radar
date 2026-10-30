// Validação de consistência das observações antes de gravar.
//  - faixa_plausivel: fora da faixa => REJEITADA (provável código de série errado ou digitação).
//  - salto_suspeito_pct: variação entre observações consecutivas acima do limite => mantida e marcada.
export function validateObservations(novas, existentes, ind) {
  const aceitas = [], rejeitadas = [], suspeitas = [];
  const [min, max] = ind.faixa_plausivel || [-Infinity, Infinity];
  for (const o of novas) {
    if (o.valor < min || o.valor > max) rejeitadas.push({ data: o.data, valor: o.valor, motivo: `fora da faixa plausível [${min}; ${max}]` });
    else aceitas.push(o);
  }
  if (ind.salto_suspeito_pct) {
    const todas = [...existentes, ...aceitas].filter((o, i, a) => a.findIndex(x => x.data === o.data && x.ano_referencia === o.ano_referencia) === i)
      .sort((a, b) => a.data.localeCompare(b.data));
    const novasDatas = new Set(aceitas.map(o => o.data));
    for (let i = 1; i < todas.length; i++) {
      const a = todas[i - 1], b = todas[i];
      if (!novasDatas.has(b.data) || a.valor === 0) continue;
      const v = (b.valor - a.valor) / Math.abs(a.valor) * 100;
      if (Math.abs(v) > ind.salto_suspeito_pct) {
        suspeitas.push({ data: b.data, valor: b.valor, anterior: a.valor, variacao_pct: +v.toFixed(2) });
        const alvo = aceitas.find(o => o.data === b.data);
        if (alvo) alvo.verificar = `salto de ${v.toFixed(1)}% vs. ${a.data}`;
      }
    }
  }
  return { aceitas, rejeitadas, suspeitas };
}
