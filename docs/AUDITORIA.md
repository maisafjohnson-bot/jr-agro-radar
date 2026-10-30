# Auditoria técnica, econômica e comercial — JR Agro Radar

**Data:** 29/10/2026 · **Versão auditada:** 0.1 · **Versão após correções:** 0.2-experimental

## Resultado por área

| Área auditada | Resultado | Problemas encontrados | Correções realizadas |
|---|---|---|---|
| Infraestrutura — publicação | NÃO TESTADO | Aplicação não publicada; ambiente de desenvolvimento sem acesso ao BCB nem ao GitHub do usuário | Workflow revisado; publicação depende do usuário |
| Infraestrutura — persistência | APROVADO COM RESSALVAS | Histórico em arquivos versionados no Git (sem banco); chave de mesclagem sobrescreveria dados do Focus de anos de referência diferentes na mesma data | Chave data + ano de referência; testado |
| Infraestrutura — dependência do Claude | APROVADO (projeto) / NÃO TESTADO (execução) | Nenhuma dependência de sessão no código | — |
| Erros de código | APROVADO COM RESSALVAS | Comentário quebrava a importação de Excel (erro de sintaxe); data 31/02 aceita; IDs duplicados entre telas | Corrigidos e verificados |
| Credenciais | APROVADO | Nenhuma credencial no código; workflow usa só o token do próprio GitHub | — |
| Segurança do painel | APROVADO COM RESSALVAS | Parâmetro `?dados=` permitia exibir dados de outro site; SheetJS 0.18.5 com vulnerabilidades conhecidas; sem CSP | Parâmetro removido; SheetJS 0.20.3 oficial; CSP restritiva |
| Dados fictícios apresentados como reais | APROVADO | Nenhum dado fictício em `data/`; séries de teste só em testes e rotuladas "TESTE" | — |
| Fontes — códigos e endpoints | APROVADO COM RESSALVAS | 27575 confirmado só por fonte de terceiros; sem coleta real possível aqui | Faixa plausível por indicador rejeita valores incompatíveis; valores de referência documentados |
| Fontes — consistência | APROVADO COM RESSALVAS | Não havia validação de faixa nem de saltos | Validação de faixa (rejeita) e de salto (marca) |
| Fontes — data de referência | APROVADO | Frescor já usava a data do dado | Painel separa "dado de referência" de "fonte consultada" e indica "sem dado novo" |
| Fontes — virada de ano do Focus | REPROVADO → corrigido | Em janeiro, a série "próximo ano" misturaria 2027 e 2028 e criaria um salto falso | Comparação só dentro do mesmo ano de referência; recarga automática |
| Cálculos — fórmulas | APROVADO COM RESSALVAS | Taxas medidas em "% de %"; histórico de variações incluía janelas sobrepostas à atual (atenuava os sinais) | p.p. para taxas; histórico sem sobreposição; 15 testes com valores feitos à mão |
| Cálculos — metodologia econômica | REPROVADO → corrigido | Índice só via movimento: Selic caindo contava como favorável mesmo em patamar historicamente alto | Componente de nível (50%) para taxas |
| Cálculos — sensibilidade | NÃO EXISTIA → implementado | — | Pesos ±20%; mudança de classificação reduz confiança |
| Cálculos — confiança | APROVADO COM RESSALVAS | Documentação e código divergiam sobre histórico curto | Regra única; regra regional nova |
| Diagnóstico — 5 cenários | APROVADO COM RESSALVAS | Contradição acionada por um único bloco fraco; "contradição" entre segmentos (milho) rebaixava a agricultura; mesmo indicador aparecia "a favor" e "contra" sem explicação | Contradição material por segmento; rótulo do segmento; 6 testes de cenário |
| Diagnóstico — commodity ≠ caixa | APROVADO COM RESSALVAS | Não havia ressalva explícita | Ressalva no resumo, nas limitações e nas objeções |
| Recomendações de vendas | APROVADO COM RESSALVAS | Uma só categoria e mensagem; oportunidade pecuária sumia quando o calendário favorecia plantadeiras; objeções genéricas; sem roteiro de ligação | Oportunidade por segmento, objeções ligadas aos dados, roteiro de ligação, 3 perguntas de diagnóstico, mensagens por segmento |
| Qualidade das mensagens | APROVADO COM RESSALVAS | Nomes técnicos ("Milho — preço em Mato Grosso variou…"), "% de %" para Selic, produto genérico na fala com revenda | Linguagem natural, p.p. para taxas, nome de produto; teste de número sem fonte em todas as mensagens |
| Regional | APROVADO COM RESSALVAS | Todos os indicadores automáticos são nacionais; região das ações era texto fixo | Região por segmento com a base declarada; confiança baixa sem dado regional atual |
| Atualização automática | NÃO TESTADO (nuvem) / APROVADO (simulação) | Issue duplicada a cada execução; publicação tentava rodar mesmo sem site preparado | Uma issue por dia; publicação condicionada; simulação de 2 execuções |
| Notificações | NÃO TESTADO | Dependem do GitHub | — |
| Usabilidade | APROVADO COM RESSALVAS | Ver docs/TESTES.md | Correções visuais e reordenação da tela Hoje |
| Aprendizado comercial | NÃO EXISTIA → estrutura criada | Sem registro de abordagens nem de utilidade | Registro de abordagens e avaliação diária, com percentuais só a partir de 20 casos |

## Limitações que permanecem

1. Integrações reais não executadas: nada foi coletado de fato.
2. Preços regionais (soja, milho, boi, diesel) só por CSV manual. Sem eles, a confiança fica baixa por regra.
3. Pesos heurísticos, sem calibração com vendas. A recomendação "Intensificar" fica bloqueada até lá.
4. Calendário agrícola de referência geral, a validar com a Conab.
5. Repositório público no plano gratuito: dados de mercado visíveis a quem tiver o link; termos do Cepea/IMEA podem restringir a publicação.
6. Abordagens e vendas ficam no aparelho: trocar de celular sem exportar perde o registro.
7. GitHub pode desativar agendamentos de repositórios sem atividade por 60 dias (os commits diários do robô devem contar como atividade, mas convém conferir).
