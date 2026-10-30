// Carga dos dados do IBGE a partir de respostas obtidas fora do GitHub Actions
// (o IBGE não responde aos servidores do GitHub, fora do Brasil).
// Uso: node scripts/ibge_carga_local.mjs <pasta com mun.txt, pam.txt, ppm.txt>
// Formato (gerado no navegador, em servicodados.ibge.gov.br):
//   mun.txt  "codigo|nome" (ordem MT, RO, AC)
//   pam.txt  "codigo@ano:soja,milho,algodao,cafe" (área plantada, ha; "-" ou "..." = sem dado)
//   ppm.txt  "codigo@ano:bovinos" (cabeças)
// Reconstrói as respostas da API e passa pelo MESMO coletor da rotina diária.
import fs from 'node:fs';
import path from 'node:path';
import { createStore } from '../src/store.js';
import { collectMunicipios, collectTabela, ALVOS } from '../src/collectors/ibge.js';

const dir = process.argv[2];
if (!dir) { console.error('Informe a pasta com mun.txt, pam.txt e ppm.txt'); process.exit(1); }
const ler = f => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n');
const B = 'https://servicodados.ibge.gov.br/api';
const resp = {};
const mun = ler('mun.txt').map(l => { const [id, nome] = l.split('|'); return { id: Number(id), nome }; });
for (const uf of ['51', '11', '12']) resp[`${B}/v1/localidades/estados/${uf}/municipios`] = mun.filter(m => String(m.id).startsWith(uf));
// Metadados mínimos com os ids e nomes oficiais conferidos em 30/10/2026
const META = {
  5457: { variaveis: [{ id: 8331, nome: 'Área plantada ou destinada à colheita', unidade: 'Hectares' }], classificacoes: [{ id: 782, nome: 'Produto das lavouras temporárias e permanentes', categorias: [{ id: 40124, nome: 'Soja (em grão)' }, { id: 40122, nome: 'Milho (em grão)' }, { id: 40099, nome: 'Algodão herbáceo (em caroço)' }, { id: 40139, nome: 'Café (em grão) Total' }] }] },
  3939: { variaveis: [{ id: 105, nome: 'Efetivo dos rebanhos', unidade: 'Cabeças' }], classificacoes: [{ id: 79, nome: 'Tipo de rebanho', categorias: [{ id: 2670, nome: 'Bovino' }] }] }
};
const valores = (arquivo, variavel, cats) => {
  const res = cats.map(c => ({ classificacoes: [{ id: 0, categoria: { [c]: '' } }], series: {} }));
  for (const l of ler(arquivo)) {
    const [chave, vs] = l.split(':'); const [loc, ano] = chave.split('@');
    vs.split(',').forEach((v, i) => { ((res[i].series[loc] ||= { localidade: { id: loc }, serie: {} }).serie)[ano] = v; });
  }
  return [{ id: variavel, resultados: res.map(r => ({ ...r, series: Object.values(r.series) })) }];
};
resp[`${B}/v3/agregados/5457/metadados`] = META[5457];
resp[`${B}/v3/agregados/3939/metadados`] = META[3939];
resp[`${B}/v3/agregados/5457/periodos/-2/variaveis/8331?localidades=N6[N3[11,12,51]]&classificacao=782[40124,40122,40099,40139]`] = valores('pam.txt', 8331, [40124, 40122, 40099, 40139]);
resp[`${B}/v3/agregados/3939/periodos/-2/variaveis/105?localidades=N6[N3[11,12,51]]&classificacao=79[2670]`] = valores('ppm.txt', 105, [2670]);
const fetchImpl = async url => { if (!(url in resp)) throw new Error('URL não prevista: ' + url); return { ok: true, status: 200, json: async () => resp[url], text: async () => JSON.stringify(resp[url]) }; };

const store = createStore(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'));
const m = await collectMunicipios({ fetchImpl });
const pam = await collectTabela(ALVOS.pam, { fetchImpl });
const ppm = await collectTabela(ALVOS.ppm, { fetchImpl });
const origem = 'carga local pelo navegador do usuário (servicodados.ibge.gov.br), ' + new Date().toISOString().slice(0, 10);
store.writeJSON('data/regional/municipios.json', m);
store.writeJSON('data/regional/pam.json', { ...pam, origem_carga: origem });
store.writeJSON('data/regional/ppm.json', { ...ppm, origem_carga: origem });
const meta = store.readJSON('data/regional/meta.json') || {};
store.writeJSON('data/regional/meta.json', { ...meta, ultima_coleta_ok: new Date().toISOString(), ultimos_erros: [], carga_local: origem });
console.log('municípios', Object.keys(m).length, '| PAM', pam.ano_referencia, '/', pam.ano_anterior, '| PPM', ppm.ano_referencia);
console.log('Brasnorte soja 2025:', pam.valores.soja['5101902'], 'ha; bovinos:', ppm.valores.bovinos['5101902']);
