# Fontes de dados

## Automáticas (coletadas pelo agendador)

| Indicador | Fonte / endpoint | Frequência | Observação |
|---|---|---|---|
| Dólar comercial (venda) | BCB SGS série 1 — `api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados` | diária | Dados abertos BCB |
| Selic meta | BCB SGS série 432 | diária | |
| IPCA 12 meses | BCB SGS série 13522 (IBGE) | mensal | |
| IC-Br Agropecuária | BCB SGS série 27575 | mensal | **Código a confirmar** no log da 1ª execução |
| Selic esperada (próximo ano) | BCB Focus — Olinda `ExpectativasMercadoAnuais`, Indicador = Selic | semanal | Expectativa, não observação |
| IPCA esperado (próximo ano) | BCB Focus — Olinda, Indicador = IPCA | semanal | Expectativa |

### Verificação dos códigos (auditoria de 29/10/2026)

| Série | Como foi verificada | Situação |
|---|---|---|
| SGS 1, 432, 13522 | Códigos amplamente documentados do BCB | Confirmar valores na 1ª execução |
| SGS 27575 (IC-Br Agro) | Referência de terceiros (repositório público) associa 27574/27575 a IC-Br geral/agropecuária; não confirmado em página oficial | **A confirmar** — a faixa plausível rejeita valores incompatíveis |
| Focus (Olinda) | Campos `Indicador, Data, DataReferencia, Mediana, baseCalculo` confirmados na documentação da biblioteca python-bcb | Confirmar na 1ª execução |

**Valores de referência independentes para conferir a 1ª coleta** (fontes jornalísticas, não oficiais):
- Selic meta: 13,75% a.a. desde 16/09/2026 (5º corte seguido; próxima reunião do Copom em novembro).
- IPCA acumulado em 12 meses até setembro/2026: 4,58%.
- Dólar: não obtive cotação diária verificada; como referência grosseira, a expectativa Focus para o fim de 2026 vinha em R$ 5,20 (ago–set/2026). Valores muito fora de R$ 4–7 indicariam problema.
Se a 1ª coleta mostrar valores muito diferentes destes, o código da série está errado.

Regras do coletor: até 3 tentativas com espera crescente; recoleta os últimos 10 dias para captar revisões (valor alterado fica registrado em `revisoes`, nunca sobrescrito em silêncio); primeira carga traz 5 anos (dólar), 9 anos (Selic — o SGS limita séries diárias a 10 anos por consulta) ou 15 anos (mensais) para formar a base de percentis; 2 execuções por dia útil (bem abaixo de qualquer limite razoável). Valor vazio é descartado — nunca vira zero. Valor fora da faixa plausível (`faixa_plausivel` em `config/sources.json`) é rejeitado e registrado; salto acima de `salto_suspeito_pct` entre observações seguidas é mantido e marcado para conferência. No Focus, quando o "próximo ano" muda (ex.: 2027 → 2028), o histórico do novo ano de referência é carregado e as comparações nunca misturam anos de referência diferentes.

## Manuais (CSV em `data/manual/`)

Sem API aberta confirmada ou com termos que exigem cuidado na redistribuição:

| Indicador | Onde obter | Nota |
|---|---|---|
| `soja_mt`, `milho_mt` | Cepea/Esalq (indicadores) ou IMEA (boletins MT) | Cepea autoriza reprodução com citação, mas confira os termos antes de publicar em site aberto |
| `boi_gordo` | Cepea/B3, IMEA ou Acrimat | Informe a praça na coluna `praca` |
| `diesel_mt` | ANP — levantamento semanal de preços (planilha) | Candidato a automação na fase 2 |
| `fertilizante` | IMEA (custo de produção), Conab | Informe a unidade na observação |
| `maquinas_vendas` | Abimaq / Anfavea (publicações mensais) | |

Formato (`;` como separador, vírgula decimal):

```
indicador;data_referencia;valor;fonte;praca;observacao
soja_mt;28/10/2026;125,40;Cepea/Esalq;Paranaguá;
```

O importador rejeita e reporta: indicador desconhecido, data inválida, valor vazio (não vira zero), fonte em branco e linhas duplicadas. Pode-se ir acrescentando linhas ao mesmo arquivo; o que já existe não duplica.

## IMEA — Instituto Mato-grossense de Economia Agropecuária (fonte prioritária para MT)

Site: https://www.imea.com.br/imea-site/ — indicadores diários (soja, milho, algodão, boi, vaca, leite), boletins semanais, custo de produção, estimativa de safra, semeadura, colheita e comercialização.

| Indicador no Radar | O que lançar do IMEA | Frequência |
|---|---|---|
| `soja_mt`, `milho_mt`, `algodao_mt`, `boi_gordo` | Indicador de preço disponível MT ("Cotação do dia") | diária |
| `imea_plantio_soja` | % da área semeada (boletim de semeadura) | semanal, set–dez |
| `imea_comerc_soja` | % da safra comercializada (boletim de comercialização) | mensal |
| `imea_custo_soja` | Custo total R$/ha (custo de produção) | quando o IMEA atualizar |

**Por que manual:** a página de indicadores carrega os valores por JavaScript e a API do IMEA (portal.imea.com.br) exige usuário e senha; não há termos públicos de redistribuição (bibliotecas de terceiros classificam o IMEA como licença "zona cinza"). Se você tiver acesso ao portal e autorização do IMEA para uso automatizado, a coleta pode ser automatizada com as credenciais guardadas em *Secrets* do GitHub — nunca no código.

Os indicadores de plantio, comercialização e custo entram no painel como **contexto** (aba Mercado) e ainda não pesam nos índices — isso exige alguns meses de histórico para calibrar.

Dados já lançados (30/10/2026, de reportagem que cita o IMEA): plantio da soja 75,81% em 23/10/2026 (Médio-Norte 96,60%, Oeste 86,78%, Sudeste 59,04%); custo total da soja 2026/27 R$ 8.210,31/ha (atualização de outubro, +6,96%). Fonte: [Revista Cultivar, 23/10/2026](https://revistacultivar.com.br/noticias/mt-safra-2026-27-plantio-da-soja-chega-a-75-81). Substitua pelo dado direto do IMEA quando lançar a planilha.

## Regionais automáticas — IBGE (implementadas, ainda não executadas)

| Dado | API | Frequência | Observação |
|---|---|---|---|
| Municípios de MT, RO, AC | `servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios` | anual | |
| Área plantada: soja, milho, algodão, café | Agregados v3, tabela 5457 (PAM), 2 últimos anos | anual, ~1 ano de defasagem | Códigos resolvidos **pelo nome** nos metadados |
| Rebanho bovino | Agregados v3, tabela 3939 (PPM) | anual | Idem |
| Malha municipal | `api/v3/malhas/estados/{uf}` (GeoJSON, qualidade mínima) | rara | Precisão reduzida a 3 casas |

Coleta no máximo uma vez a cada 30 dias. O formato das respostas foi implementado conforme a documentação pública, mas **só será confirmado na primeira execução real**.

## Catálogos técnicos (base local)

| Fabricante | Arquivo | Páginas | Revisão | Produtos |
|---|---|---|---|---|
| Piccin | Cata_logo_2026.pdf | 68 | 01/2026 (criado 10/12/2025) | 58 |
| Crucianelli | Apresentac_a_o_Plantor_1.pdf | 16 | LECTURA 2024 (07/2024) | 2 (só plantadeiras) |

Base em `data/catalogo/produtos.json`, gerada por `scripts/catalogo_build.py`; texto de cada página em `data/catalogo/fontes/` (para auditoria). Sites oficiais (piccin.com.br, crucianelli.com) **não foram consultados** — não estavam acessíveis no ambiente de desenvolvimento. Fonte de terceiros consultada para a Plantor: [Revista Cultivar, 01/12/2025](https://revistacultivar.com.br/artigos/test-drive-exclusivo-com-a-semeadora-plantor-2450-da-crucianelli) — divergências registradas na ficha.

## Ainda não integradas (próximas fases)

| Fonte | O que traria | Caminho |
|---|---|---|
| BCB SICOR (Olinda) | Crédito rural contratado por UF/município e finalidade (investimento) | API aberta; recorte MT/RO/AC é a próxima integração recomendada |
| Conab | Safra, área, produtividade por UF | Planilhas/boletins; avaliar estabilidade dos arquivos |
| BNDES / Plano Safra | Linhas e condições de financiamento | Publicações oficiais; condições mudam por portaria — exigem revisão humana |
| WhatsApp | Envio de alertas | Requer conta WhatsApp Business API (paga) |
