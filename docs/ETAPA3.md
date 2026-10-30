# Etapa 3 — Catálogo técnico e inteligência por marca (Piccin e Crucianelli)

**Data:** 29/10/2026 · **Versão:** 0.3 · **Base anterior preservada:** tag Git `v0.2`.

## O que foi reaproveitado
Coleta do BCB, índices econômicos (agrícola, pecuário, geral), diagnóstico, frescor dos dados, alertas, boletim, agendamento no GitHub Actions, histórico versionado no Git, identidade visual. Nenhuma funcionalidade validada foi removida — os 40 testes anteriores continuam passando.

## O que mudou
- Navegação: **Hoje · Marcas · Catálogo · CRM · Mais** (Mais reúne Economia, Plano por segmento, Regional/mapa, Histórico, Relatório, Fontes, Configurações).
- Tela Hoje abre com o **Plano comercial do dia** (5 prioridades) antes do cenário econômico.
- Relatório reescrito no formato "JR AGRO RADAR — RELATÓRIO DIÁRIO" (11 seções + anexo).
- Registro de abordagens e importação de vendas da etapa 2 foram **substituídos pelo CRM**, que cobre os mesmos dados com mais estrutura.
- Marcas SCHEMAQ, RUBEMAQ e GRAZMEC desativadas (escopo exclusivo Piccin e Crucianelli; reativação por configuração).

## O que foi adicionado
| Módulo | Arquivos |
|---|---|
| Base técnica dos catálogos | `scripts/catalogo_build.py`, `data/catalogo/produtos.json`, `data/catalogo/fontes/*.json`, `src/lib/catalogo.js` |
| Coletor regional IBGE | `src/collectors/ibge.js` |
| Potencial regional | `src/engine/regional.js` |
| Índices e prioridades por marca | `src/engine/brands.js`, `src/engine/plano_marcas.js` |
| Argumentos de venda | `src/engine/argumentos.js` |
| CRM | `src/lib/crm.js` (painel) |
| Alertas novos | índice por marca, catálogo alterado, novo ano do IBGE, negociação parada (no painel) |
| Teste no navegador real | `test/e2e/painel.e2e.mjs` |

## Catálogos
| | Piccin | Crucianelli |
|---|---|---|
| Arquivo / páginas | Cata_logo_2026.pdf / 68 | Apresentac_a_o_Plantor_1.pdf / 16 |
| Produtos (famílias) | 58 | 2 (só plantadeiras) |
| Modelos/configurações | 256 | 3 (Plantor 12, 15, 18 m) |
| Categorias | Descompactadores 11 · Grades 18 · Distribuidores 24 · Utilitários 5 | Plantadeiras 2 |

**Total:** 60 produtos e 259 modelos cadastrados. Status: 50 confirmados, 9 incompletos, 1 pendente de validação (Plantor Leaf).
**Conferência com o PDF:** 2.065 números conferidos automaticamente com o texto das páginas; 187 transcritos de 3 tabelas que são imagem (GSPCR p. 22, MASTER p. 42, MASTER D p. 44) e conferidos visualmente.

**Não extraído / não informado no catálogo** (registrado nas fichas): potência do DSAP, GT 800 e Truck 15000 ("consultar"); eixo e espaçamento das GNDMH 195, 210 e GNDHF (em branco no PDF); capacidade em kg do Master 6000 RB; especificações da Plantor Leaf; capacidade operacional (ha/h) e velocidade de qualquer equipamento; preço e disponibilidade de todos.
**Divergências registradas para validar com a fábrica:** 25, em 21 produtos (ex.: largura da Plantor 12,6–18,9 m × 13/16/19 m; 3456 × 3450 kg; peso de 48 kg do GT 800; SPCR 17 com só 150 mm a mais que o SPCR 15; Plantor fabricada em São Carlos × Plantor Leaf "integralmente na Argentina"; dados de terceiros sobre "Plantor 2450").

## Classificação das funcionalidades
| Funcionalidade | Status | Evidência / limitação |
|---|---|---|
| Processamento dos catálogos | **APROVADA** | Todas as páginas extraídas; 60 produtos; teste de conferência com o PDF |
| Base técnica persistente | **APROVADA** | Arquivo versionado no Git; sobrevive a reinício por construção |
| Catálogo no painel (filtros, busca, ficha, origem) | **APROVADA** | Teste no Chrome: busca "SPCR 500" = 1; Crucianelli = 2; "café" → Cafeeira |
| Editar/cadastrar no painel | **PARCIAL** | Salvo no aparelho e exportável; vira permanente só ao gravar no repositório |
| Duplicados e desatualização | **APROVADA** | Testes; Plantor (07/2024) marcada como >12 meses |
| Comparação técnica | **APROVADA** | Só dentro da categoria; teste recusa Grade × Distribuidor |
| Consulta aos sites oficiais | **PENDENTE** | Sites não acessíveis no ambiente; registrado no catálogo |
| Índices Piccin e Crucianelli | **PARCIAL** | Cálculo testado com valores feitos à mão; sem dados reais ainda (economia, IBGE, CRM) |
| Recomendação Piccin / Crucianelli | **APROVADA** (lógica) | Testes: modelos existem no catálogo, páginas citadas, perfil por potência |
| Argumentos de venda e mensagens | **APROVADA** (lógica) | Teste: todo número das mensagens vem do catálogo ou dos fatos coletados; sem promessas |
| Dados regionais IBGE | **PARCIAL** | Coletor e cálculo testados com respostas simuladas; formato real só na 1ª execução |
| Mapa interativo | **PARCIAL** | Desenhado e testado no Chrome com malha fictícia; malha real depende do IBGE |
| Plano comercial do dia | **APROVADA** (lógica) / **PARCIAL** (dados) | 5 prioridades no Chrome; usa CRM; depende de dados reais para valer na prática |
| CRM (criar, editar, histórico, venda, importar, backup) | **APROVADA** | Testes unitários + Chrome |
| Persistência do CRM após reinício | **APROVADA** | Chrome fechado e reaberto com o mesmo perfil: registro editado continua lá |
| CRM em vários aparelhos | **PENDENTE** | Fica no aparelho; troca entre aparelhos por backup |
| Alertas novos | **PARCIAL** | Testados localmente; envio por issue depende do GitHub |
| Relatório diário | **APROVADA** | Gerado na execução offline de ponta a ponta |
| Execução na nuvem / publicação | **PENDENTE** | Projeto ainda não publicado |

## Testes executados
- **61 testes automatizados — 61 aprovados, 0 reprovados** (`npm test`).
- **16 verificações no Chrome real — 16 aprovadas** (`npm run e2e`), incluindo fechar e reabrir o navegador.
- **Reprovados durante o desenvolvimento e corrigidos:** nomes de modelo duplicados entre grades ("14 discos" em 6 linhas); navegação por endereço `#tela` não trocava de tela; perfil de cliente da Plantor saía como "médios e grandes" apesar de exigir 220 HP; negociação parada de outra marca não aparecia no plano.

## Dependências pendentes
1. Publicar no GitHub e rodar a primeira coleta (BCB e IBGE).
2. Preços regionais por CSV (soja, milho, boi, diesel).
3. Cadastrar as negociações reais no CRM (ou importar a planilha).
4. Validar com a Piccin e a Crucianelli as divergências e as informações faltantes, e pedir a versão atual da apresentação da Plantor.
