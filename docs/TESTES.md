# Testes — situação após a etapa 3 (29/10/2026)

**Atual:** `npm test` → 61/61 aprovados; `npm run e2e` → 16/16 aprovados (Chrome real, inclusive reinício do navegador). Novos arquivos: `test/catalogo.test.js` (10), `test/crm_marcas.test.js` (11), `test/e2e/painel.e2e.mjs` (16 verificações). Detalhes em docs/ETAPA3.md.

## Histórico da auditoria (etapa 2)

`npm test` → **40 de 40 aprovados**. Arquivos:

| Arquivo | O que comprova |
|---|---|
| `test/calculos.test.js` (15) | Cálculos contra **valores calculados à mão**: variação %, p.p. para taxas (Selic 14,25 → 13,75 = −0,50 p.p.), percentil (0,625), janela mensal, histórico sem sobreposição (14 janelas), percentil de nível (12/14), índice 50 + 50×(0,6−0,4) = 60, contribuições +30/−20, sensibilidade 55–65, cobertura 40% sem nota, geral 0,7×60+0,3×40 = 54, validação de faixa e salto, Focus por ano de referência |
| `test/cenarios.test.js` (6) | Diagnóstico nos 5 cenários: agro favorável, agro desfavorável, pecuária favorável, contraditório, dados desatualizados e insuficientes |
| `test/radar.test.js` (18) | Dados ausentes ≠ zero, frescor, mensagens sem números sem fonte, sem promessa/garantia/escassez, boletim separando fato/cálculo/interpretação/hipótese/recomendação, persistência com revisões |
| `test/rotina.test.js` (1) | Duas execuções seguidas com rede simulada: histórico preservado (+1 pregão, nenhum perdido), coleta incremental, 3 tentativas na fonte que falha, erro registrado, diagnóstico comparado com o dia anterior, data de referência preservada |

Séries usadas nos testes são **sintéticas** (`test/fixtures.js`) e nunca são gravadas em `data/`.

## Teste visual

Painel aberto no Chrome sem interface (versão 153) com dados de teste rotulados "TESTE", em 390×844 (celular) e 1280 px (computador). Corrigidos: número do índice escondido atrás da barra, "−0,0%", "12,06 %", IDs de mensagem duplicados entre abas, evidência favorável mostrada em segmento "cautela", ordem da tela Hoje (mensagens estavam no fim). DOM renderizado conferido (mensagens presentes e copiáveis).

## Não testado (depende da publicação)

| Item | Como testar |
|---|---|
| Coleta real no BCB (SGS e Focus) | 1ª execução manual do workflow; conferir com os valores de referência em docs/FONTES.md |
| Código 27575 (IC-Br Agro) | Mesmo log; se for rejeitado por faixa plausível, o código está errado |
| Execução agendada sem o computador | Ver em Actions as execuções de 05:47 e 18:13 (Cuiabá) |
| Publicação no GitHub Pages | Abrir o endereço no celular |
| Issue/e-mail de alerta | Na primeira ocorrência de alerta |
| Importação de Excel | Usa a biblioteca oficial da SheetJS via internet; não foi possível carregá-la neste ambiente |
| Toque/cópia em aparelho real | A cópia usa a API de área de transferência do navegador; testada só a renderização |
