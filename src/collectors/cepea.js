// Coletor Cepea (Esalq/USP) — widget público "Cotações do Cepea no seu site"
// (https://www.cepea.org.br/br/widget.aspx), oferecido pelo próprio Cepea para incorporação.
// Licença dos dados: CEPEA, CC BY-NC 4.0 — citar a fonte; uso não comercial.
// Endpoint (capturado do gerador do widget em 30/10/2026):
//   https://www.cepea.org.br/br/widgetproduto.js.php?output=html&id_indicador[]=92&id_indicador[]=77...
// Retorna só o ÚLTIMO valor de cada indicador; o histórico se forma com a coleta diária.
import { fetchWithRetry } from './bcb.js';

const BASE = 'https://www.cepea.org.br/br/widgetproduto.js.php?output=html';
const UA = 'JR-Agro-Radar/0.3 (coleta diaria; uso interno; fonte citada)';

/** Extrai {data, produto, unidade, valor} de cada linha do widget. Valor ausente/ilegível é descartado. */
export function parseCepeaWidget(html) {
  const corpo = String(html).split(/<tbody>/i)[1]?.split(/<\/tbody>/i)[0];
  if (!corpo) throw new Error('resposta do Cepea sem tabela (formato mudou?)');
  const linhas = [];
  for (const tr of corpo.split(/<tr>/i).slice(1)) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (tds.length < 3) continue;
    const data = tds[0].replace(/<[^>]+>/g, '').trim();
    const produto = (tds[1].match(/class="maior">([^<]+)</) || [])[1]?.trim();
    const unidade = (tds[1].match(/class="unidade">([^<]+)</) || [])[1]?.trim() || null;
    const bruto = (tds[2].match(/class="maior">([^<]+)</) || [])[1]?.trim();
    const moeda = tds[2].replace(/<[^>]+>/g, '').replace(bruto || '', '').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data) || !produto || !bruto) continue;
    const valor = Number(bruto.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(valor)) continue;
    const [d, m, y] = data.split('/');
    linhas.push({ data: `${y}-${m}-${d}`, produto, unidade, moeda, valor });
  }
  if (!linhas.length) throw new Error('widget do Cepea sem linhas válidas');
  return linhas;
}

/** Uma consulta para todos os indicadores Cepea configurados; distribui por indicador. */
export async function collectCepea(indicadores, { fetchImpl } = {}) {
  const ids = [...new Set(indicadores.map(i => i.coleta.id_cepea))];
  const url = BASE + ids.map(id => `&id_indicador%5B%5D=${id}`).join('');
  const html = await fetchWithRetry(url, { fetchImpl, texto: true, ua: UA });
  const linhas = parseCepeaWidget(html);
  const agora = new Date().toISOString();
  const out = {};
  for (const ind of indicadores) {
    const l = linhas.find(x => x.produto.toLowerCase() === ind.coleta.produto_cepea.toLowerCase());
    out[ind.id] = l ? [{ data: l.data, valor: l.valor, fonte: 'Cepea/Esalq-USP (CC BY-NC 4.0)', praca: ind.coleta.praca || null, tipo: 'oficial', coletado_em: agora }] : [];
  }
  return { url, linhas, porIndicador: out };
}
