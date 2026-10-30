# Metodologia dos índices — versão 0.2-experimental

**Status:** heurística transparente. Os pesos vêm de raciocínio econômico, **não** de calibração com as vendas da JR Agro. O índice descreve o ambiente; não é probabilidade de venda, previsão de receita nem recomendação financeira.

## Três índices

| Índice | Blocos (peso) |
|---|---|
| Agrícola | Receita do produtor (30%) · Custo do capital (25%) · Custos de produção (20%) · Demanda por máquinas (15%) · Inflação e expectativas (10%) |
| Pecuário | Receita do pecuarista (45%) · Custo do capital (25%) · Custo de alimentação animal (20%) · Custos operacionais (10%) |
| Geral | 70% agrícola + 30% pecuário (reflete o portfólio; ajustável). Se um componente não tiver dados, o geral usa só o outro e avisa. |

Variáveis e direção esperada estão em `config/methodology.json`, cada uma com a justificativa econômica.

## Cálculo, passo a passo

1. **Frescor**: a variável só entra se o último dado tiver no máximo 7 dias (diária), 21 (semanal) ou 75 (mensal). Dado antigo aparece no painel como "antigo", mas sai da nota.
2. **Variação da janela**: 30 dias corridos (diária), 4 observações (semanal) ou 3 (mensal).
3. **Intensidade relativa**: a variação atual é comparada com todas as variações de mesma janela no histórico da própria série (percentil). Ex.: percentil 90 = movimento de alta mais forte que 90% dos movimentos passados. Isso evita comparar "1% no dólar" com "1% na Selic".
   Sem pelo menos 24 variações históricas, usa um sinal amortecido (metade da força) e marca a qualidade como "limitada".
   **Taxas** (Selic, IPCA e expectativas) são medidas em **pontos percentuais**; preços e índices, em %. Só entram no histórico janelas que terminam **antes** do início da janela atual (sem sobreposição).
4. **Sinal de momento** = (percentil − 0,5) × 2, no intervalo −1 a +1.
   **Sinal de nível** (só taxas): percentil do valor atual nos últimos 10 anos, também levado a −1…+1. Selic e IPCA usam 50% momento + 50% nível — juros caindo mas ainda altos não contam como "favorável" pleno. Preços nominais não usam nível (a inflação inflaria o percentil).
   O sinal combinado é multiplicado pela direção econômica (+1 favorece vendas, −1 prejudica).
5. **Bloco** = média dos sinais disponíveis. Variáveis correlacionadas (Selic meta e Selic esperada, por exemplo) ficam no mesmo bloco para não serem contadas duas vezes.
6. **Nota** = 50 + 50 × média ponderada dos blocos com dado. 50 = neutro.
7. **Cobertura** = soma dos pesos dos blocos com dado. Abaixo de 50%: **sem nota** e recomendação "Dados insuficientes".

### Variáveis de efeito ambíguo

O **dólar** não entra na nota: eleva a receita em reais de quem vende grão, mas encarece máquinas, peças, diesel e fertilizante. Aparece como contexto.

## Confiança

- **Moderada**: cobertura ≥ 60% e no máximo 1/3 do peso com histórico curto.
- **Baixa**: cobertura < 60%, mais de 1/3 do peso sem histórico, **ou nenhum indicador regional (MT/RO/AC) atual** — leitura só com dados nacionais não sustenta recomendação comercial regional.
- **Alta** exige cobertura ≥ 80%, todas as variáveis com percentil, ausência de contradição material e classificação estável na análise de sensibilidade; fica **bloqueada em "moderada" até a validação com histórico comercial**. Consequência deliberada: "Intensificar prospecção e vendas" só aparece depois da calibração.

**Contradição material**: forças a favor e contra com pelo menos 6 pontos cada, e o lado menor valendo ao menos 40% do maior. Avaliada dentro de cada segmento (o milho ajuda a agricultura e encarece a ração: isso não é contradição, é divergência entre segmentos). Com contradição, a recomendação não passa de "Trabalhar conversão".

**Sensibilidade**: cada peso de bloco é variado ±20%. Se a classificação muda, isso é dito no critério de confiança.

**Divergência entre segmentos**: quando agrícola e pecuário diferem 15+ pontos, o painel mostra uma oportunidade para cada segmento em vez de confiar só na nota geral.

## Do índice à recomendação

| Condição | Recomendação |
|---|---|
| Cobertura < 50% | Dados insuficientes para recomendação confiável |
| Confiança baixa e nota < 40 | Adotar abordagem mais cautelosa |
| Confiança baixa e nota ≥ 40 | Monitorar o mercado antes de aumentar o esforço |
| Nota ≥ 75 e confiança alta | Intensificar prospecção e vendas |
| Nota ≥ 60 | Priorizar oportunidades qualificadas |
| Nota 45–59 | Trabalhar conversão e negociações em andamento |
| Nota < 45 | Adotar abordagem mais cautelosa |

## Mensagens comerciais

- Só citam números que existem em `diagnostico.fatos` (dado coletado, com fonte e data) — há teste automático para isso.
- Usam só fatos do segmento da categoria (boi gordo não entra na conversa sobre plantadeira).
- Para taxas (Selic, IPCA), mostram "de X% para Y%", nunca "% de %".
- Não prometem preço, prazo, escassez ou condição de financiamento — também testado.

## Validação futura (quando houver histórico de vendas)

1. Reunir ao menos ~60 oportunidades encerradas (ganhas/perdidas) com data.
2. Associar a cada uma o índice do dia do contato (o painel já registra o índice diário em `data/history/diagnosticos.jsonl`).
3. Separar em ordem cronológica: primeiros 70% para ajustar, últimos 30% para testar (sem olhar o futuro).
4. Testar se faixas do índice se associam a taxas de conversão diferentes. Só então ajustar pesos, liberar a confiança "alta" e registrar a nova versão. As versões anteriores ficam no histórico do Git.

## Histórico de versões

| Versão | Data | Mudança |
|---|---|---|
| 0.1-experimental | 29/10/2026 | Versão inicial heurística. |
| 0.2-experimental | 29/10/2026 | Auditoria: taxas em p.p.; componente de nível para taxas; histórico sem sobreposição; Focus por ano de referência; contradição material por segmento; regra regional de confiança; sensibilidade dos pesos. |
