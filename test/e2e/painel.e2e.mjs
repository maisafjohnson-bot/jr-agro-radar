// Teste de ponta a ponta do painel num Chrome real (sem interface), via DevTools Protocol.
// Uso: node test/e2e/painel.e2e.mjs <url-base> <pasta-capturas> [caminho-do-chrome]
// Verifica: carregamento, Plano do Dia, Catálogo (pesquisa, ficha, potência), CRM (criar, editar),
// persistência do CRM após FECHAR e REABRIR o navegador com o mesmo perfil, mapa regional.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8101';
const OUT = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
const CHROME = process.argv[4] || '/opt/google/chrome/chrome';
const PERFIL = fs.mkdtempSync(path.join(os.tmpdir(), 'perfil-'));
const PORTA = 9333;
const resultados = [];
const ok = (nome, cond, det = '') => { resultados.push({ nome, ok: !!cond, det }); console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}${det ? ' — ' + det : ''}`); };
const espera = ms => new Promise(r => setTimeout(r, ms));

async function abrirChrome() {
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${PERFIL}`, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORTA}/json/list`); if (r.ok) { const l = await r.json(); const pg = l.find(t => t.type === 'page'); if (pg) return { proc, ws: pg.webSocketDebuggerUrl }; } } catch {} await espera(200); }
  throw new Error('Chrome não abriu');
}
function cliente(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const eventos = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else eventos.push(m); };
  const pronto = new Promise(r => ws.onopen = r);
  const send = async (method, params = {}) => { await pronto; const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); const m = await new Promise(r => pend.set(i, r)); if (m.error) throw new Error(`${method}: ${m.error.message}`); return m.result; };
  const avaliar = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  return { send, avaliar, eventos, fechar: () => ws.close() };
}
async function irPara(c, hash) { await c.send('Page.navigate', { url: `${BASE}/#${hash}` }); await espera(1500); }
async function foto(c, nome, altura = 2200) {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: altura, deviceScaleFactor: 1, mobile: true });
  await espera(300);
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${nome}.png`), Buffer.from(data, 'base64'));
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
}
const texto = c => c.avaliar('document.body.innerText');
const clicar = (c, sel) => c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('não achei ${sel}'); e.click(); return true; })()`);
const preencher = (c, sel, v, evento = 'change') => c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event(${JSON.stringify(evento)}, { bubbles: true })); return true; })()`);

// ------------------------------------------------------------- sessão 1
let { proc, ws } = await abrirChrome();
let c = cliente(ws);
await c.send('Page.enable'); await c.send('Runtime.enable');
const erros = [];
await irPara(c, 'hoje');
let t = await texto(c);
ok('Painel carrega e mostra o Plano comercial do dia', t.includes('Plano comercial do dia'));
ok('Plano do dia tem as 5 prioridades', ['1. Marca', '2. Equipamento', '3. Região', '4. Perfil de cliente', '5. Ação'].every(x => t.includes(x)));
await foto(c, '1-hoje', 2600);

await irPara(c, 'marcas');
t = await texto(c);
ok('Marcas: índice Piccin e Crucianelli', t.includes('Índice de Oportunidade Piccin') && t.includes('Crucianelli ·'));
await foto(c, '2-marcas', 3200);

await irPara(c, 'catalogo');
t = await texto(c);
ok('Catálogo: 60 produtos listados', /60 produtos/.test(t), (t.match(/\d+ produtos/) || [])[0]);
await preencher(c, '#c-q', 'SPCR 500'); await espera(300);
t = await texto(c);
ok('Catálogo: pesquisa por modelo "SPCR 500" → 1 resultado', /1 resultado/.test(t));
await preencher(c, '#c-q', ''); await preencher(c, '#c-fab', 'CRUCIANELLI'); await espera(300);
t = await texto(c);
ok('Catálogo: filtro Crucianelli → 2 produtos', /2 resultado/.test(t));
await preencher(c, '#c-fab', ''); await preencher(c, '#c-ap', 'café'); await espera(300);
t = await texto(c);
ok('Catálogo: aplicação "café" encontra a linha Cafeeira', t.includes('MASTER CAFEEIRA'));
await preencher(c, '#c-ap', ''); await espera(200);
await c.avaliar(`document.querySelector('[data-ver="crucianelli-plantor"]').click()`); await espera(300);
await preencher(c, '#p-cv', '280', 'input'); await espera(200);
t = await texto(c);
ok('Ficha Plantor: potência 280 → Plantor 15 m', t.includes('Maior modelo que cabe: Plantor 15 m'));
ok('Ficha mostra origem e divergências', t.includes('Origem') && t.includes('Divergências a validar'));
await foto(c, '3-ficha-plantor', 3400);

await irPara(c, 'crm');
await clicar(c, '#crm-novo'); await espera(200);
await preencher(c, '#r-cliente', 'TESTE E2E Fazenda Boa Vista');
await preencher(c, '#r-municipio', 'Município Teste MT-1');
await preencher(c, '#r-marca', 'CRUCIANELLI');
await preencher(c, '#r-equipamento', 'Plantor 18 m');
await preencher(c, '#r-etapa', 'proposta');
await preencher(c, '#r-valor_estimado', '1.500.000');
await preencher(c, '#r-data_ultimo_contato', '2026-10-01');
await clicar(c, '#r-salva'); await espera(300);
t = await texto(c);
ok('CRM: cria registro de teste', t.includes('TESTE E2E Fazenda Boa Vista') && t.includes('Oportunidade salva'));
ok('CRM: negociação parada detectada (28 dias)', /negociação\(ões\) paradas/.test(t));
await c.avaliar(`document.querySelector('[data-ed]').click()`); await espera(200);
await preencher(c, '#r-etapa', 'negociação');
await preencher(c, '#r-observacoes', 'Editado no teste E2E');
await clicar(c, '#r-salva'); await espera(300);
t = await texto(c);
ok('CRM: edita registro', t.includes('negociação') && t.includes('Editado no teste E2E'));
await foto(c, '4-crm', 2000);

await irPara(c, 'regional');
await espera(500);
const nPaths = await c.avaliar(`document.querySelectorAll('#regional svg path[data-mun]').length`);
const nPontos = await c.avaliar(`document.querySelectorAll('#regional svg circle').length`);
ok('Mapa regional desenhado', nPaths > 40, `${nPaths} municípios`);
ok('Mapa marca o município com oportunidade do CRM', nPontos >= 1, `${nPontos} ponto(s)`);
await foto(c, '5-regional', 2400);

await irPara(c, 'hoje');
t = await texto(c);
ok('Hoje usa o CRM (Retomar negociação do cliente cadastrado)', t.includes('Retomar TESTE E2E Fazenda Boa Vista'));

// ------------------------------------------------------------- reinício do navegador
await c.send('Browser.close').catch(() => {}); c.fechar(); await espera(1500); try { proc.kill('SIGKILL'); } catch {}
await espera(1000);
({ proc, ws } = await abrirChrome());
c = cliente(ws); await c.send('Page.enable'); await c.send('Runtime.enable');
await irPara(c, 'crm');
t = await texto(c);
ok('CRM persiste após fechar e reabrir o navegador', t.includes('TESTE E2E Fazenda Boa Vista') && t.includes('Editado no teste E2E') && t.includes('negociação'));
await c.send('Browser.close').catch(() => {}); c.fechar(); try { proc.kill('SIGKILL'); } catch {}

fs.writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(resultados, null, 1));
const falhas = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações aprovadas. Capturas em ${OUT}`);
process.exit(falhas ? 1 : 0);
