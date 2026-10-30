// DADOS REGIONAIS SINTÉTICOS — só para teste. Municípios com nomes de teste, nunca gravados em data/.
export function regionalFixture() {
  const municipios = {}, soja = {}, milho = {}, algodao = {}, cafe = {}, bov = {}, sojaAnt = {}, milhoAnt = {};
  const ufs = [['51', 'MT', 30], ['11', 'RO', 15], ['12', 'AC', 6]];
  let k = 0;
  for (const [cod, uf, n] of ufs) for (let i = 1; i <= n; i++) {
    const c = `${cod}000${String(i).padStart(2, '0')}`; k++;
    municipios[c] = { nome: `Município Teste ${uf}-${i}`, uf };
    if (uf !== 'AC') { soja[c] = 1000 * (n - i + 1) * (uf === 'MT' ? 10 : 2); milho[c] = soja[c] * 0.6; sojaAnt[c] = soja[c] * 0.95; milhoAnt[c] = milho[c] * 0.95; }
    if (uf === 'MT' && i < 5) algodao[c] = 5000 * (5 - i);
    if (uf === 'RO' && i < 6) cafe[c] = 800 * (6 - i);
    bov[c] = 20000 * ((i * 7) % 11 + 1) * (uf === 'MT' ? 1 : 1.5);
  }
  return {
    municipios,
    pam: { fonte: 'TESTE PAM', ano_referencia: 2025, ano_anterior: 2024, valores: { soja, milho, algodao, cafe }, anterior: { soja: sojaAnt, milho: milhoAnt, algodao, cafe } },
    ppm: { fonte: 'TESTE PPM', ano_referencia: 2025, valores: { bovinos: bov } }
  };
}
