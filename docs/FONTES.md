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

## Ainda não integradas (próximas fases)

| Fonte | O que traria | Caminho |
|---|---|---|
| BCB SICOR (Olinda) | Crédito rural contratado por UF/município e finalidade (investimento) | API aberta; recorte MT/RO/AC é a próxima integração recomendada |
| Conab | Safra, área, produtividade por UF | Planilhas/boletins; avaliar estabilidade dos arquivos |
| IBGE SIDRA (PAM/PPM) | Produção agrícola e rebanho por município | API aberta; dado anual, útil para o mapa regional |
| BNDES / Plano Safra | Linhas e condições de financiamento | Publicações oficiais; condições mudam por portaria — exigem revisão humana |
| WhatsApp | Envio de alertas | Requer conta WhatsApp Business API (paga) |
