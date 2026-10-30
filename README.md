# JR Agro Radar Econômico & Inteligência Comercial

Painel que transforma dados econômicos e agropecuários em decisões comerciais para a JR Agro Representações (MT, RO e AC): diagnóstico do dia, índices de oportunidade, plano comercial, mensagens prontas para WhatsApp e boletim diário — tudo com fonte, data de referência e limitações explícitas.

## Como funciona

```
GitHub Actions (nuvem, 2×/dia útil)
  └─ npm test                       → trava a publicação se um cálculo quebrar
  └─ node src/run.js
       ├─ coleta BCB (SGS + Focus)  → data/observations/*.json  (histórico completo, versionado)
       ├─ importa data/manual/*.csv → preços Cepea/IMEA/ANP/Abimaq
       ├─ índices → diagnóstico → plano → mensagens → alertas
       ├─ data/latest.json          → o que o painel mostra
       ├─ data/history/*.jsonl      → diagnósticos e execuções anteriores
       └─ reports/AAAA-MM-DD.md     → Boletim Econômico e Comercial
  └─ commit no repositório (histórico auditável)
  └─ issue no GitHub se houver alerta (o GitHub envia e-mail)
  └─ publica o painel (index.html + data/) no GitHub Pages
```

Nada depende do seu computador ou de uma sessão do Claude aberta. Não há dependências de npm: só Node.js 20+.

## Publicar (≈15 minutos, sem custo)

1. Crie uma conta no GitHub (se ainda não tiver) e um repositório novo, por exemplo `jr-agro-radar`.
2. Envie todos os arquivos desta pasta para o repositório (no site: **Add file → Upload files**, arrastando a pasta descompactada).
3. Em **Settings → Pages**, em *Build and deployment*, escolha **Source: GitHub Actions**.
4. Em **Actions**, abra *Radar diário* e clique em **Run workflow** para a primeira execução.
5. Abra o log da execução e confira o bloco "Coletar e analisar": cada indicador aparece como `OK` ou `ERRO`. **Este é o primeiro teste real das integrações** — veja docs/TESTES.md.
6. O endereço do painel aparece em **Settings → Pages** (algo como `https://seu-usuario.github.io/jr-agro-radar/`). Salve na tela inicial do celular.

### Privacidade e acesso

- GitHub Pages gratuito exige repositório **público**: qualquer pessoa com o link vê os dados de **mercado** (nunca os de clientes — esses ficam só no seu aparelho).
- Se os preços Cepea/IMEA importados não puderem ser exibidos publicamente pelos termos dessas instituições, ou se quiser login: use repositório **privado** + **Cloudflare Pages** (grátis, conecta direto no GitHub privado) + **Cloudflare Access** (login por código no e-mail, grátis até 50 usuários). Nesse caso, apague o job `publicar` do workflow e configure o Cloudflare Pages com "Build output directory" = `/` e sem comando de build.

## Uso diário

- **Hoje**: recomendação, índice, motivos (a favor / contra, com fonte), 3 primeiras ações e mensagens com botão Copiar.
- **Mercado**: indicadores agrícolas, pecuários, economia/crédito e a decomposição dos índices.
- **Plano**: as 3–7 ações do dia e as categorias com mais aderência.
- **Histórico**: gráficos 30/90/180/365 dias/máximo, comparação base 100 entre indicadores, diagnósticos anteriores.
- **Mais**: boletim completo, produtos, importação do histórico de vendas (fica só no aparelho), saúde das fontes e configurações.

## Manutenção

| O que mudar | Onde |
|---|---|
| Marcas, categorias, territórios | `config/catalog.json` |
| Preços sem API (soja, milho, boi, diesel, fertilizante, vendas do setor) | CSV em `data/manual/` (modelo em `MODELO-precos.csv.exemplo`) |
| Limites e canais de alerta | `config/alerts.json` |
| Pesos e variáveis dos índices | `config/methodology.json` (registrar em `historico_versoes`) |
| Calendário agrícola | `config/calendar.json` |

Editar qualquer um desses arquivos pelo site do GitHub dispara uma nova análise automaticamente.

Rodar localmente: `npm test`, `npm run coletar`, `npm run servir` (abre em http://localhost:8080).

Documentação: [Metodologia](docs/METODOLOGIA.md) · [Fontes](docs/FONTES.md) · [Testes](docs/TESTES.md) · [Auditoria](docs/AUDITORIA.md)
