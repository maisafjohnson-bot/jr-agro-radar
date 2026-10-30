#!/usr/bin/env python3
"""
Constrói data/catalogo/produtos.json a partir da TRANSCRIÇÃO dos catálogos oficiais.

Fontes:
  - Piccin: Cata_logo_2026.pdf (68 páginas, "Revisão: 01/2026", criado em 10/12/2025)
  - Crucianelli: Apresentac_a_o_Plantor_1.pdf (16 páginas, "brochure_Plantor_crucianelli LECTURA 2024 PORTUGUES")

Regras:
  - Cada número foi copiado da página indicada. O teste test/catalogo.test.js confere que
    os números aparecem no texto extraído daquela página (ou foram conferidos na imagem,
    quando a tabela é imagem — campo `conferido_em_imagem`).
  - Campos que o catálogo NÃO informa ficam ausentes e entram em `pendencias`.
  - `aplicacao` e `culturas` dizem se vieram do catálogo ou se são derivadas da categoria.
  - Disponibilidade e preço NUNCA são inferidos do catálogo.
Uso: python3 scripts/catalogo_build.py
"""
import json, datetime, os, re

HOJE = '2026-10-29'
ARQ_P = 'Cata_logo_2026.pdf'
ARQ_C = 'Apresentac_a_o_Plantor_1.pdf'
produtos = []

def pot(a, b=None, obs=None):
    d = {'min': a, 'max': b if b is not None else a}
    if obs: d['obs'] = obs
    return d

def add(**p):
    p.setdefault('fabricante', 'PICCIN')
    p.setdefault('arquivo', ARQ_P)
    p.setdefault('data_processamento', HOJE)
    p.setdefault('disponibilidade', 'não confirmada — catálogo não informa disponibilidade nem preço')
    p.setdefault('pendencias', [])
    p.setdefault('divergencias', [])
    p.setdefault('opcionais', [])
    p.setdefault('diferenciais', [])
    p.setdefault('especificacoes_comuns', {})
    p.setdefault('variantes', [])
    # Identificador único de variante: prefixa a família quando a tabela só traz o nº (ex.: "14 discos" → "GACR 14 discos")
    for v in p['variantes']:
        if re.match(r'^\d+ (discos|hastes)$', v['modelo']):
            v['modelo'] = f"{p['modelo']} {v['modelo']}"
    # Potência agregada da família (para perfil de cliente)
    pots = [v['potencia_cv'] for v in p['variantes'] if v.get('potencia_cv')]
    if pots:
        p['potencia_requerida_cv'] = {'min': min(x['min'] for x in pots), 'max': max(x['max'] for x in pots)}
    else:
        p['pendencias'].append('Potência requerida não informada no catálogo.')
    larg = [v['specs'].get('largura_trabalho_mm') for v in p['variantes'] if isinstance(v['specs'].get('largura_trabalho_mm'), (int, float))]
    if larg: p['largura_trabalho_mm'] = {'min': min(larg), 'max': max(larg)}
    p['status'] = p.get('status') or ('incompleta' if p['pendencias'] else 'confirmada')
    produtos.append(p)

# ---------------------------------------------------------------- DESCOMPACTADORES
SUB = dict(categoria='Descompactadores', operacao='Preparo de solo — descompactação (subsolagem/escarificação)',
           aplicacao={'texto': 'Rompimento de camadas compactadas do solo antes do plantio.', 'origem': 'derivada da categoria (o catálogo não descreve a aplicação)'},
           culturas={'lista': ['grãos', 'algodão', 'pastagem'], 'origem': 'derivada da categoria — não declarada no catálogo'})

def hastes(rows, keys):
    out = []
    for r in rows:
        d = dict(zip(keys, r))
        v = {'modelo': d.pop('modelo'), 'specs': {}, 'potencia_cv': None}
        if 'pmin' in d: v['potencia_cv'] = pot(d.pop('pmin'), d.pop('pmax'))
        if 'psup_min' in d:
            v['potencia_cv'] = pot(d['psup_min'], d['pprof_max'], 'faixa superficial→profunda')
            v['specs']['potencia_superficial_cv'] = f"{d.pop('psup_min')} a {d.pop('psup_max')}"
            v['specs']['potencia_profunda_cv'] = f"{d.pop('pprof_min')} a {d.pop('pprof_max')}"
        v['specs'].update(d)
        out.append(v)
    return out

add(id='piccin-sp', nome='Arado Subsolador', modelo='SP', subcategoria='Subsoladores', pagina=[5], **SUB,
    especificacoes_comuns={'profundidade_corte_mm': '200 - 450', 'regulagem_profundidade': 'roda manual', 'engate': '3 pontos do trator', 'desarme': 'pino fusível'},
    variantes=hastes([('SP 3/3', 3, 560, 1250, 330, 40, 55, 55, 70), ('SP 5/3', 3, 560, 1700, 370, 40, 55, 55, 70), ('SP 5/5', 5, 400, 1700, 435, 55, 70, 70, 90),
                      ('SP 9/5', 5, 400, 2150, 495, 55, 70, 70, 90), ('SP 9/7', 7, 350, 2150, 560, 70, 90, 90, 115), ('SP 9/9', 9, 250, 2150, 625, 90, 110, 115, 140),
                      ('SP 11/9', 9, 340, 2850, 680, 90, 110, 115, 140), ('SP 11/11', 11, 270, 2850, 745, 110, 130, 140, 165)],
                     ['modelo', 'hastes', 'distancia_hastes_mm', 'largura_trabalho_mm', 'peso_kg', 'psup_min', 'psup_max', 'pprof_min', 'pprof_max']),
    diferenciais=[{'texto': 'Sistema de desarme por pino fusível', 'pagina': 5}, {'texto': 'Regulagem de profundidade por roda manual', 'pagina': 5}])

add(id='piccin-spcd', nome='Subsolador Piccin com desarme', modelo='SPCD', subcategoria='Subsoladores', pagina=[6], **SUB,
    especificacoes_comuns={'profundidade_corte_mm': '200 - 450', 'regulagem_profundidade': 'roda manual', 'engate': '3 pontos do trator', 'desarme': 'automático ação direta (mola helicoidal)'},
    variantes=hastes([('SPCD 3', 3, 400, 1200, 510, 54, 90), ('SPCD 5', 5, 400, 2000, 720, 90, 126), ('SPCD 7', 7, 400, 2800, 965, 126, 162), ('SPCD 9', 9, 400, 3600, 1195, 162, 198)],
                     ['modelo', 'hastes', 'distancia_hastes_mm', 'largura_trabalho_mm', 'peso_kg', 'pmin', 'pmax']),
    diferenciais=[{'texto': 'Desarme automático de ação direta com mola helicoidal', 'pagina': 6}],
    divergencias=[{'texto': 'Na tabela a coluna "Modelo" traz só "SPCD"; o nome por nº de hastes (SPCD 3, 5, 7, 9) foi atribuído na transcrição.', 'pagina': 6}])

add(id='piccin-spda', nome='Subsolador Piccin com desarme automático', modelo='SPDA', subcategoria='Subsoladores', pagina=[7], **SUB,
    especificacoes_comuns={'profundidade_corte_mm': '200 - 450', 'disco_corte_pol': '18', 'engate': '3 pontos do trator', 'desarme': 'automático ação direta'},
    variantes=hastes([('SPDA 3', 3, 400, 1200, 980, 60, 100), ('SPDA 5', 5, 400, 2000, 1480, 100, 140), ('SPDA 7', 7, 400, 2800, 2020, 140, 180)],
                     ['modelo', 'hastes', 'distancia_hastes_mm', 'largura_trabalho_mm', 'peso_kg', 'pmin', 'pmax']),
    opcionais=['Disco de corte individual à frente de cada haste', 'Rolo destorroador'],
    diferenciais=[{'texto': 'Desarme automático de ação direta', 'pagina': 7}, {'texto': 'Disco de corte de 18"', 'pagina': 7}])

add(id='piccin-spcr', nome='Subsolador Piccin controle remoto', modelo='SPCR', subcategoria='Subsoladores', pagina=[8], **SUB,
    especificacoes_comuns={'profundidade_corte_mm': '200 - 450', 'disco_corte_pol': '18', 'engate': 'barra de tração', 'desarme': 'automático ação direta'},
    variantes=hastes([('SPCR 5', 5, 400, 2000, 2160, 110, 154), ('SPCR 7', 7, 400, 2800, 2763, 154, 198), ('SPCR 9', 9, 400, 3600, 3256, 198, 242),
                      ('SPCR 11', 11, 400, 4400, 3623, 242, 286), ('SPCR 13', 13, 415, 5200, 5059, 286, 330), ('SPCR 15', 15, 415, 6750, 5628, 330, 374),
                      ('SPCR 17', 17, 415, 6900, 5881, 374, 418)],
                     ['modelo', 'hastes', 'distancia_hastes_mm', 'largura_trabalho_mm', 'peso_kg', 'pmin', 'pmax']),
    opcionais=['Disco de corte individual à frente de cada haste', 'Rolo destorroador'],
    diferenciais=[{'texto': 'Controle remoto (de arrasto, engate na barra de tração)', 'pagina': 8}, {'texto': 'Desarme automático de ação direta', 'pagina': 8}],
    divergencias=[{'texto': 'SPCR 15 (15 hastes × 415 mm) tem largura 6750 mm e SPCR 17 (17 hastes) 6900 mm: diferença de só 150 mm para 2 hastes a mais — conferir com a fábrica.', 'pagina': 8}])

add(id='piccin-spcr500', nome='Subsolador controle remoto', modelo='SPCR 500', subcategoria='Subsoladores', pagina=[9], **SUB,
    especificacoes_comuns={'profundidade_corte_mm': '200 - 500', 'disco_corte_pol': '24', 'engate': 'barra de tração', 'desarme': 'automático ação direta'},
    variantes=hastes([('SPCR 500-5', 5, 400, 2000, 2294, 180, 270), ('SPCR 500-7', 7, 400, 2800, 2951, 270, 325), ('SPCR 500-9', 9, 400, 3600, 3497, 325, 400),
                      ('SPCR 500-11', 11, 400, 4400, 3917, 400, 480), ('SPCR 500-13', 13, 415, 5200, 5407, 480, 570), ('SPCR 500-15', 15, 415, 6750, 6029, 570, 630),
                      ('SPCR 500-17', 17, 415, 7650, 6340, 630, 680)],
                     ['modelo', 'hastes', 'distancia_hastes_mm', 'largura_trabalho_mm', 'peso_kg', 'pmin', 'pmax']),
    opcionais=['Disco de corte individual à frente de cada haste', 'Rolo destorroador'],
    diferenciais=[{'texto': 'Profundidade de corte até 500 mm', 'pagina': 9}, {'texto': 'Disco de corte de 24"', 'pagina': 9}])

add(id='piccin-epcr300', nome='Escarificador Piccin controle remoto', modelo='EPCR 300', subcategoria='Escarificadores', pagina=[10],
    categoria='Descompactadores', operacao='Preparo de solo — escarificação',
    aplicacao={'texto': 'Escarificação (descompactação superficial até 260 mm).', 'origem': 'derivada da categoria e da profundidade informada'},
    culturas={'lista': ['grãos', 'algodão', 'pastagem'], 'origem': 'derivada da categoria — não declarada no catálogo'},
    especificacoes_comuns={'profundidade_corte_mm': 'até 260', 'disco_corte_pol': '18 - 22', 'engate': 'barra de tração', 'desarme': 'automático ação direta'},
    variantes=hastes([(f'EPCR 300-{h}', h, 300, w, kg, a, b) for h, w, kg, a, b in [(5, 1500, 1750, 60, 84), (7, 2100, 2040, 84, 108), (9, 2700, 2490, 108, 132), (11, 3300, 2900, 132, 156),
                      (13, 3900, 3190, 156, 180), (15, 4500, 4040, 180, 204), (17, 5100, 4470, 204, 228), (19, 5700, 4920, 228, 252), (21, 6300, 6150, 252, 276),
                      (23, 6900, 6390, 276, 300), (25, 7500, 6825, 300, 324)]],
                     ['modelo', 'hastes', 'distancia_hastes_mm', 'largura_trabalho_mm', 'peso_kg', 'pmin', 'pmax']),
    opcionais=['Disco de corte individual à frente de cada haste'],
    divergencias=[{'texto': 'Coluna "Modelo" traz "EPCR 300" em todas as linhas; o sufixo por nº de hastes foi atribuído na transcrição.', 'pagina': 10}])

add(id='piccin-dsap', nome='Distribuidor de Sementes e Adubo Piccin', modelo='DSAP', categoria='Descompactadores', subcategoria='Escarificadores (acessório)', pagina=[11],
    operacao='Aplicação de sementes ou adubo junto à escarificação',
    aplicacao={'texto': 'Aplicação de sementes ou adubo (dosadores helicoidais).', 'origem': 'catálogo, p. 11'},
    culturas={'lista': [], 'origem': 'não informado'},
    especificacoes_comuns={'dosadores': 'helicoidais', 'vazao_trator_l_min': 'até 60 (ajustar no comando do trator, caso sua vazão seja maior)', 'regulagem_vazao': 'bloco hidráulico com manípulo'},
    variantes=[{'modelo': f'DSAP {h} hastes', 'specs': {'hastes': h, 'volume_carga_l': vol, 'capacidade_carga_kg': cap, 'largura_trabalho_m': larg, 'peso_aprox_kg': kg}, 'potencia_cv': None}
               for h, vol, cap, larg, kg in [(5, 350, 420, 1.5, 190), (7, 490, 588, 2.1, 260), (9, 630, 756, 2.7, 320), (11, 770, 924, 3.3, 380), (13, 910, 1092, 3.9, 450),
                                              (15, 1050, 1260, 4.5, 510), (17, 1190, 1428, 5.1, 570), (19, 1330, 1596, 5.7, 640), (21, 1470, 1764, 6.3, 700),
                                              (23, 1610, 1932, 6.9, 760), (25, 1750, 2100, 7.5, 830)]],
    diferenciais=[{'texto': 'Plataforma antiderrapante e escada de acesso para abastecimento', 'pagina': 11}],
    pendencias=['Potência requerida não informada (depende do implemento em que é montado).'],
    divergencias=[{'texto': 'Cabeçalho diz "Largura de trabalho (mm)", mas os valores (1,5 a 7,5) estão em metros. Título traz "Semenetes" (erro de digitação).', 'pagina': 11},
                  {'texto': 'As larguras coincidem com o EPCR 300 de mesmo nº de hastes (5 hastes = 1,5 m … 25 = 7,5 m); a compatibilidade entre os dois não está declarada.', 'pagina': 11}])

ADV = dict(categoria='Descompactadores', subcategoria='Advanced', operacao='Preparo de solo — descompactação profunda',
           aplicacao={'texto': 'Descompactação profunda (até 550 mm).', 'origem': 'derivada da categoria e da profundidade informada'},
           culturas={'lista': ['grãos', 'algodão', 'pastagem'], 'origem': 'derivada da categoria — não declarada no catálogo'})
add(id='piccin-advanced-mod-tp', nome='Descompactador Piccin Advanced Modular (3 pontos)', modelo='ADVANCED MOD TP', pagina=[12], **ADV,
    especificacoes_comuns={'profundidade_corte_mm': '200 - 550', 'disco_corte_pol': '22', 'engate': '3 pontos', 'espacamento_hastes_mm': '300 / 400 / 500 / 600', 'desarme': 'automático ação direta'},
    variantes=hastes([('MOD TP 3', 3, '300 - 400 - 500 - 600', 1800, 1855, 90, 165), ('MOD TP 4', 4, '600', 2400, 2075, 120, 220), ('MOD TP 5', 5, '300 - 400 - 500 - 600', 3000, 2232, 150, 275)],
                     ['modelo', 'hastes', 'distancia_hastes_mm', 'largura_trabalho_mm', 'peso_kg', 'pmin', 'pmax']),
    diferenciais=[{'texto': 'Modular: espaçamento de hastes de 300, 400, 500 ou 600 mm', 'pagina': 12}],
    divergencias=[{'texto': 'Cabeçalho "Largura de trabalho (min)"; potência descrita como "teórica podendo variar com condições e tipos de solo".', 'pagina': 12}])
add(id='piccin-advanced-mod-bt', nome='Descompactador Piccin Advanced Modular (arrasto)', modelo='ADVANCED MOD BT', pagina=[13], **ADV,
    especificacoes_comuns={'profundidade_corte_mm': '200 - 550', 'disco_corte_pol': '22', 'engate': 'arrasto', 'espacamento_hastes_mm': '300 / 400 / 500 / 600', 'desarme': 'automático ação direta'},
    variantes=hastes([('MOD BT 5', 5, '300 - 400 - 500 - 600', 3000, 2737, 150, 275), ('MOD BT 6', 6, '600', 3600, 3036, 180, 330), ('MOD BT 7', 7, '300 - 400 - 500 - 600', 4200, 3062, 210, 385),
                      ('MOD BT 9', 9, '300 - 400 - 500 - 600', 5400, 3923, 270, 495), ('MOD BT 11', 11, '300 - 400 - 500 - 600', 6600, 4785, 330, 605)],
                     ['modelo', 'hastes', 'distancia_hastes_mm', 'largura_trabalho_mm', 'peso_kg', 'pmin', 'pmax']),
    diferenciais=[{'texto': 'Modular: espaçamento de hastes de 300, 400, 500 ou 600 mm', 'pagina': 13}])
add(id='piccin-advanced-flex', nome='Descompactador Piccin Advanced Dobrável', modelo='ADVANCED FLEX', pagina=[14], **ADV,
    especificacoes_comuns={'profundidade_corte_mm': '200 - 550', 'disco_corte_pol': '22', 'engate': 'barra de tração (arrasto)', 'articulacao_haste': '9 graus para cada lado', 'desarme': 'automático ação direta'},
    variantes=[{'modelo': 'ADVANCED FLEX 9', 'specs': {'hastes': 9, 'distancia_hastes_mm': '450 - 600', 'largura_trabalho_mm': 5400, 'largura_transporte_mm': 3200, 'altura_transporte_mm': 3220,
                'comprimento_transporte_mm': 7380, 'peso_kg': 5381, 'potencia_min_por_haste_cv': 30, 'potencia_max_por_haste_cv': 55}, 'potencia_cv': pot(270, 495)}],
    diferenciais=[{'texto': 'Dobrável para transporte (largura de transporte 3200 mm)', 'pagina': 14}, {'texto': 'Articulação da haste de 9 graus para cada lado', 'pagina': 14}])
add(id='piccin-advanced-flow', nome='Descompactador Piccin Advanced com hastes desencontradas', modelo='ADVANCED FLOW', pagina=[15], **ADV,
    especificacoes_comuns={'profundidade_corte_mm': '200 - 550', 'disco_corte_pol': '24', 'engate': 'arrasto', 'desarme': 'hidráulico com rearme automático (opcional)'},
    variantes=[{'modelo': 'ADVANCED FLOW 7', 'specs': {'hastes': 7, 'distancia_hastes_mm': '400 - 500 - 600', 'largura_trabalho_mm': 4600, 'peso_kg': 4608,
                'potencia_min_por_haste_cv': 30, 'potencia_max_por_haste_cv': 55}, 'potencia_cv': pot(210, 385)}],
    opcionais=['Sistema de desarme hidráulico com rearme automático'],
    diferenciais=[{'texto': 'Hastes desencontradas', 'pagina': 15}])

# ---------------------------------------------------------------- GRADES
def grades(rows, extra=None):
    out = []
    for r in rows:
        n, larg, kg, a, b = r[:5]
        v = {'modelo': f'{n} discos', 'specs': {'discos': n, 'largura_trabalho_mm': larg, 'peso_kg': kg}, 'potencia_cv': pot(a, b)}
        if extra: v['specs'].update(extra(r))
        out.append(v)
    return out

GA = dict(categoria='Grades', subcategoria='Grades Aradoras', operacao='Preparo de solo — gradagem pesada/aradora',
          aplicacao={'texto': 'Preparo primário do solo, incorporação de restos culturais e abertura/reforma de áreas.', 'origem': 'derivada da categoria (o catálogo não descreve a aplicação)'},
          culturas={'lista': ['grãos', 'algodão', 'pastagem'], 'origem': 'derivada da categoria — não declarada no catálogo'})
GN = dict(categoria='Grades', subcategoria='Grades Niveladoras', operacao='Preparo de solo — nivelamento e destorroamento',
          aplicacao={'texto': 'Nivelamento e destorroamento após o preparo primário.', 'origem': 'derivada da categoria (o catálogo não descreve a aplicação)'},
          culturas={'lista': ['grãos', 'algodão', 'pastagem'], 'origem': 'derivada da categoria — não declarada no catálogo'})

add(id='piccin-gacr', nome='Grade Aradora Controle Remoto', modelo='GACR', pagina=[17], **GA,
    especificacoes_comuns={'diametro_eixo_pol': '1.5/8', 'espacamento_discos_mm': 230, 'discos_opcoes': '24" x 6,00 mm ou 26" x 6,00 mm ou 28" x 6,00 mm', 'obs_potencia': 'potência mínima no motor para trator 4x4; 4x2: 12 discos 72 a 84 CV, 14 discos 84 a 96 CV'},
    variantes=grades([(12, 1300, 1563, 65, 75), (14, 1500, 1629, 75, 96), (16, 1730, 1772, 96, 108), (18, 1960, 1975, 108, 120), (20, 2190, 2055, 120, 132), (22, 2420, 2347, 132, 144), (24, 2650, 2438, 144, 156)]))
add(id='piccin-gacr-l', nome='Grade Aradora Controle Remoto Leve', modelo='GACR-L', pagina=[18], **GA,
    especificacoes_comuns={'diametro_eixo_pol': '1.5/8', 'espacamento_discos_mm': 230, 'discos_opcoes': '24" x 6,00 mm ou 26" x 6,00 mm ou 28" x 6,00 mm'},
    variantes=grades([(10, 1030, 1058, 40, 56), (14, 1500, 1283, 56, 64), (16, 1730, 1460, 72, 96), (18, 1960, 1626, 72, 96), (19, 2320, 1665, 76, 96), (20, 2320, 1742, 80, 96),
                      (21, 2520, 1795, 84, 96), (22, 2520, 1825, 88, 96), (23, 2750, 1860, 92, 96), (24, 2750, 2021, 96, 100), (25, 2980, 2059, 100, 104), (26, 2980, 2090, 104, 108),
                      (27, 3190, 2124, 108, 112), (28, 3190, 2159, 112, 120), (30, 3340, 2300, 120, 128), (32, 3500, 2394, 128, 144), (36, 3900, 2531, 144, 160)]),
    divergencias=[{'texto': 'Coluna "Potência Mínima requerida" traz o valor "4" em todas as linhas, sem unidade — significado não identificado.', 'pagina': 18}])
add(id='piccin-gaicr', nome='Grade Aradora Intermediária Controle Remoto', modelo='GAICR', pagina=[19], **GA,
    especificacoes_comuns={'diametro_eixo_pol': '1.5/8 (até 18 discos); 1.3/4 (a partir de 20 discos)', 'espacamento_discos_mm': 270, 'discos_opcoes': '26" x 6,00 mm ou 28" x 6,00 mm ou 28" x 7,50 mm', 'obs_potencia': 'trator 4x4; 4x2: 12 discos 78 a 91 CV, 14 discos 91 a 104 CV'},
    variantes=grades([(12, 1480, 1575, 70, 81), (14, 1900, 1690, 81, 93), (16, 2020, 2010, 104, 117), (18, 2290, 2070, 117, 130), (20, 2560, 2300, 130, 143), (22, 2830, 2480, 143, 156), (24, 3100, 2590, 156, 169), (26, 3370, 2695, 169, 182), (28, 3640, 2805, 182, 195)]))
add(id='piccin-gapicr', nome='Grade Aradora Piccin Intermediária Controle Remoto', modelo='GAPICR', pagina=[20], **GA,
    especificacoes_comuns={'diametro_eixo_pol': '1.3/4', 'espacamento_discos_mm': 290, 'discos_opcoes': '28" x 6,00 mm ou 28" x 7,50 mm ou 30" x 7,50 mm'},
    variantes=grades([(14, 2120, 1720, 91, 104), (16, 2360, 2036, 104, 117), (18, 2640, 2132, 117, 130), (20, 2920, 2371, 130, 143), (22, 3180, 2557, 143, 156), (24, 3460, 2785, 156, 169),
                      (26, 3715, 2908, 169, 182), (28, 3995, 3005, 182, 195), (30, 4280, 3833, 195, 208), (32, 4550, 3891, 208, 234), (36, 5120, 4378, 234, 260), (40, 6335, 4829, 260, 286)]))
add(id='piccin-gcrp', nome='Grade Controle Remoto Pesada', modelo='GCRP', pagina=[21], **GA,
    especificacoes_comuns={'diametro_eixo_pol': '2.1/8', 'espacamento_discos_mm': 340, 'discos_opcoes': '32" x 9,00 mm ou 34" x 9,00 mm'},
    variantes=grades([(12, 1870, 2424, 120, 140, 76, 88), (14, 2210, 2904, 140, 160, 88, 101), (16, 2550, 3219, 160, 180, 101, 113), (18, 2900, 3801, 180, 200, 113, 126), (20, 3230, 4057, 200, 220, 126, 139)],
                     extra=lambda r: {'potencia_esteiras_cv': f'{r[5]} a {r[6]}'}),
    divergencias=[{'texto': 'Largura de trabalho sem unidade na tabela (valores compatíveis com mm).', 'pagina': 21}])
add(id='piccin-gspcr', nome='Grade Super Pesada Controle Remoto', modelo='GSPCR', pagina=[22], **GA, conferido_em_imagem=True,
    especificacoes_comuns={'diametro_eixo_pol': '2.1/2', 'espacamento_discos_mm': 400, 'discos_opcoes': '34" x 9,00 mm ou 34" x 12,00 mm ou 36" x 9,00 mm ou 36" x 12,00 mm'},
    variantes=grades([(14, 2695, 4734, 196, 224, 122, 139), (16, 3060, 5465, 224, 252, 139, 157), (18, 3390, 5785, 252, 280, 157, 174), (20, 3770, 6485, 280, 308, 174, 191), (22, 4175, 7175, 308, 336, 191, 209), (24, 4520, 7881, 336, 364, 209, 226)],
                     extra=lambda r: {'potencia_esteiras_cv': f'{r[5]} a {r[6]}'}),
    divergencias=[{'texto': 'Tabela é imagem no PDF (sem texto extraível): valores transcritos da imagem da página 22.', 'pagina': 22}])

add(id='piccin-gnpcr', nome='Grade Niveladora Piccin Controle Remoto', modelo='GNPCR', pagina=[23], **GN,
    especificacoes_comuns={'diametro_eixo_pol': '1.1/4 ou 1.1/2', 'espacamento_discos_mm': 195, 'discos_opcoes': '20" x 4,00 mm ou 22" x 4,00 mm ou 22" x 4,50 mm'},
    variantes=grades([(24, 2300, 1350, 72, 84), (28, 2658, 1453, 84, 96), (32, 3026, 1535, 96, 108), (36, 3403, 1688, 108, 120), (40, 3764, 1982, 120, 126), (42, 3950, 2028, 126, 132),
                      (44, 4115, 2144, 132, 144), (48, 4511, 2366, 144, 156), (52, 4890, 2515, 156, 168), (56, 5257, 2876, 168, 180), (60, 5612, 2973, 180, 192), (64, 5985, 3063, 192, 204)]))
add(id='piccin-gnpcre', nome='Grade Niveladora Piccin Controle Remoto Especial', modelo='GNPCRE', pagina=[24], **GN,
    especificacoes_comuns={'diametro_eixo_pol': '1.5/8', 'espacamento_discos_mm': 210, 'discos_opcoes': '24" x 6,00 mm'},
    variantes=grades([(36, 3572, 2791, 126, 140), (40, 3976, 2954, 140, 154), (44, 4359, 3305, 154, 168), (48, 4740, 3463, 168, 182), (52, 5115, 3628, 182, 196), (56, 5589, 4318, 224, 240),
                      (60, 5980, 4656, 240, 256), (64, 6350, 5087, 256, 272), (68, 6732, 5261, 272, 288), (72, 7080, 6697, 288, 304), (76, 7480, 7069, 304, 320)]))
add(id='piccin-ganfp-r', nome='Grade Niveladora Flutuante com pneu', modelo='GANFP (R)', pagina=[25], **GN,
    especificacoes_comuns={'diametro_eixo_pol': '1.1/4', 'espacamento_discos_mm': 185, 'discos_opcoes': '22" x 4,00 mm ou 22" x 4,50 mm', 'transporte': 'longitudinal'},
    variantes=grades([(36, 3140, 1235, 83, 92), (40, 3510, 1325, 92, 101), (44, 3880, 1510, 101, 110), (48, 4250, 1610, 110, 120), (52, 4620, 1775, 120, 129), (56, 4990, 1875, 129, 138),
                      (60, 5360, 2055, 138, 147), (64, 5730, 2185, 147, 156), (68, 6100, 2400, 156, 166), (72, 6470, 2530, 166, 184), (80, 7200, 2850, 184, 202)]),
    diferenciais=[{'texto': 'Flutuante, com sistema de transporte longitudinal', 'pagina': 25}])
add(id='piccin-ganf-d', nome='Grade Niveladora Flutuante dupla com pneu', modelo='GANF (P)(R) D', pagina=[26], **GN,
    especificacoes_comuns={'diametro_eixo_pol': '1.1/4', 'espacamento_discos_mm': 185, 'discos_opcoes': '22" x 4,00 mm ou 22" x 4,50 mm'},
    variantes=grades([(88, 7950, 3350, 202, 221), (96, 8780, 3525, 221, 239), (104, 9430, 3790, 239, 276), (120, 10910, 4360, 276, 368)]))
add(id='piccin-ganfp-d160', nome='Grade Niveladora Flutuante dupla com pneu 160 discos', modelo='GANFP (R) D 160', pagina=[27], **GN,
    especificacoes_comuns={'diametro_eixo_pol': '1.1/4', 'espacamento_discos_mm': 185, 'discos_opcoes': '22" x 4,50 mm'},
    variantes=grades([(160, 14000, 6480, 368, 377)]))
add(id='piccin-gndl', nome='Grade Niveladora e Destorroadora Leve', modelo='GNDL', pagina=[28], **GN,
    especificacoes_comuns={'diametro_eixo_pol': '1.1/4', 'espacamento_discos_mm': 175, 'engate': '3 pontos do trator ou barra de tração', 'discos_opcoes': '20" x 3,50 mm ou 22" x 3,50 mm ou 22" x 4,00 mm ou 22" x 4,50 mm'},
    variantes=grades([(20, 1797, 514, 50, 60), (24, 2135, 607, 60, 70), (28, 2435, 670, 70, 80), (32, 2735, 831, 80, 90), (36, 3136, 894, 90, 100), (40, 3477, 959, 100, 105), (42, 3620, 1029, 105, 110), (44, 3910, 1094, 110, 120)]),
    opcionais=['Pistão de abertura'])
add(id='piccin-gnd', nome='Grade Niveladora Destorroadora', modelo='GND', pagina=[29], **GN,
    especificacoes_comuns={'diametro_eixo_pol': '1.1/4 ou 1.1/2', 'espacamento_discos_mm': 195, 'discos_opcoes': '22" x 4,00 mm ou 22" x 4,50 mm', 'transporte': 'sem pneus de transporte'},
    variantes=grades([(24, 2290, 720, 65, 76), (28, 2680, 795, 76, 86), (32, 3043, 1110, 86, 97), (36, 3423, 1295, 97, 108), (40, 3789, 1375, 108, 113), (42, 3974, 1420, 113, 119), (44, 4134, 1485, 119, 130)]))
add(id='piccin-gndm', nome='Grade Niveladora Destorroadora Mecânica', modelo='GNDM', pagina=[30], **GN,
    especificacoes_comuns={'diametro_eixo_pol': '1.1/4 ou 1.1/2', 'espacamento_discos_mm': 195, 'discos_opcoes': '22" x 4,00 mm ou 22" x 4,50 mm', 'transporte': 'sistema de transporte'},
    variantes=grades([(40, 3789, 1533, 108, 113), (42, 3974, 1575, 113, 119), (44, 4134, 1640, 119, 130), (48, 4525, 1725, 130, 140), (52, 4908, 1995, 140, 151), (56, 5282, 2085, 151, 162),
                      (60, 5651, 2175, 162, 173), (64, 5900, 2270, 173, 184), (68, 6170, 2410, 184, 194), (72, 6570, 2995, 194, 205), (76, 6935, 3235, 205, 216), (80, 7300, 3355, 216, 227), (84, 7665, 3435, 227, 232)]))
add(id='piccin-gndmh195', nome='Grade Niveladora Destorroadora Hidráulica 195', modelo='GNDMH 195', pagina=[31], **GN,
    especificacoes_comuns={'discos_opcoes': '20" x 4,00 mm ou 22" x 4,00 mm ou 20" x 4,50 mm ou 22" x 4,50 mm', 'transporte': 'longitudinal hidráulico'},
    variantes=grades([(52, 4908, 2145, 140, 151), (56, 5282, 2231, 151, 162), (60, 5651, 2317, 162, 173), (64, 5900, 2426, 173, 184), (68, 6170, 2582, 184, 194), (72, 6570, 3278, 194, 205), (84, 7665, 3521, 227, 232)]),
    pendencias=['Diâmetro do eixo e espaçamento entre discos aparecem em branco no catálogo (p. 31).'])
add(id='piccin-gndmh210', nome='Grade Niveladora Destorroadora Hidráulica 210', modelo='GNDMH 210', pagina=[32], **GN,
    especificacoes_comuns={'discos_opcoes': '24" x 6,00 mm', 'transporte': 'longitudinal hidráulico'},
    variantes=grades([(44, 4475, 2656, 145, 158), (48, 4865, 2787, 158, 172), (52, 5260, 3060, 172, 185), (56, 5635, 3318, 185, 198), (60, 6025, 3634, 198, 211)]),
    pendencias=['Diâmetro do eixo e espaçamento entre discos aparecem em branco no catálogo (p. 32).'])
add(id='piccin-gndhf', nome='Grade Niveladora Destorroadora Hidráulica Flutuante', modelo='GNDHF', pagina=[33], **GN,
    especificacoes_comuns={'discos_opcoes': '22" x 4,5 mm', 'flutuacao': 'sistema de flutuação', 'transporte': 'longitudinal hidráulico'},
    variantes=grades([(64, 5900, 2426, 173, 184), (68, 6170, 2582, 184, 194), (72, 6570, 3550, 194, 205), (84, 7665, 3521, 227, 232)]),
    pendencias=['Diâmetro do eixo e espaçamento entre discos aparecem em branco no catálogo (p. 33).'],
    divergencias=[{'texto': '72 discos pesa 3550 kg e 84 discos 3521 kg (maior com menos peso) — conferir.', 'pagina': 33}])
add(id='piccin-gh', nome='Grade Hidráulica', modelo='GH', pagina=[34], **GN,
    especificacoes_comuns={'eixo': 'quadrado 1"', 'espacamento_discos_mm': 185, 'discos_opcoes': '18" x 3,00 mm ou 18" x 3,50 mm ou 20" x 3,50 mm ou 22" x 4,00 mm'},
    variantes=grades([(16, 1500, 312, 32, 40), (20, 1930, 362, 40, 48), (24, 2300, 412, 48, 56), (28, 2670, 497, 56, 64), (32, 3040, 585, 64, 72)]))

# ---------------------------------------------------------------- UTILITÁRIOS
UT = dict(categoria='Utilitários', subcategoria='Guinchos Agrícolas', operacao='Movimentação de cargas (big bags, insumos)',
          aplicacao={'texto': 'Levantamento e movimentação de cargas na propriedade.', 'origem': 'derivada da categoria (o catálogo não descreve a aplicação)'},
          culturas={'lista': [], 'origem': 'não se aplica'})
def guincho(mods, giro, alt, bitola, potmin):
    return [{'modelo': m, 'specs': {'capacidade_levante_kg': cap, 'pneus': pn, 'bitola_mm': bitola, 'peso_kg': kg, 'angulo_giro_graus': giro, 'altura_max_levante_mm': alt}, 'potencia_cv': pot(potmin)} for m, cap, pn, kg in mods]
add(id='piccin-gahg', nome='Guincho Agrícola Hidráulico Giratório', modelo='GAHG', pagina=[36], **UT,
    variantes=guincho([('GAHG 1200', 1200, '7.50/16', 750), ('GAHG 2000', 2000, '11L16', 843)], 90, 6100, 2400, 65))
add(id='piccin-gahg-ro', nome='Guincho Agrícola Hidráulico Giratório — Roda Oscilante', modelo='GAHG (RO)', pagina=[37], **UT,
    variantes=guincho([('GAHG-RO 1200', 1200, '11L15', 846), ('GAHG-RO 2000', 2000, '11L15', 977)], 90, 6100, 2400, 65))
add(id='piccin-gahg-ro-br', nome='Guincho Agrícola Hidráulico Giratório — Roda Oscilante — Bitola Regulável', modelo='GAHG RO BR', pagina=[38], **UT,
    variantes=guincho([('GAHG-RO 1200 BR', 1200, '11L15', 957), ('GAHG-RO 2000 BR', 2000, '11L15', 1042)], 90, 6100, '2000 a 3000', 65))
add(id='piccin-gahg-t-ro-br', nome='Guincho Agrícola Hidráulico Giratório — Telescópico — Roda Oscilante — Bitola Regulável', modelo='GAHG T RO BR', pagina=[39], **UT,
    variantes=[{'modelo': 'GAHG-T RO 2000 BR', 'specs': {'capacidade_levante_kg': '1000 a 2000', 'pneus': '11L15', 'bitola_mm': '2000 a 3000', 'peso_kg': 1050, 'angulo_giro_graus': 90,
                'altura_max_levante_mm': 7050, 'capacidade_por_ponto_kg': 'P1 1000; P2 1250; P3 1500; P4 1750; P5 2000'}, 'potencia_cv': pot(65)}],
    divergencias=[{'texto': 'Potência mínima aparece como "65 V" (provável "65 CV").', 'pagina': 39}])
add(id='piccin-gt800', nome='Guincho Traseiro', modelo='GT 800', pagina=[40], **UT,
    variantes=[{'modelo': 'GT 800', 'specs': {'capacidade_levante_kg': 800, 'comprimento_total_mm': 2200, 'peso_kg': 48, 'altura_levante_mm': 2000}, 'potencia_cv': None}],
    opcionais=['Engate Massey Ferguson'],
    pendencias=['Potência requerida não informada.'],
    divergencias=[{'texto': 'Peso informado de 48 kg para guincho de 800 kg de capacidade — valor a confirmar com a fábrica.', 'pagina': 40}])

# ---------------------------------------------------------------- DISTRIBUIDORES
DIST = dict(categoria='Distribuidores', operacao='Distribuição a lanço de corretivos e fertilizantes',
            aplicacao={'texto': 'Aplicação de calcário (faixa em L/ha informada no catálogo) e fertilizantes.', 'origem': 'catálogo (linha "Aplicação de Calcário")'},
            culturas={'lista': ['grãos', 'algodão', 'pastagem', 'café'], 'origem': 'derivada da categoria — o catálogo cita café só na linha Cafeeira'})
def tabela(cols, linhas, potkey='potencia_cv'):
    """cols: lista de modelos; linhas: dict campo -> lista de valores (mesma ordem)."""
    out = []
    for i, m in enumerate(cols):
        specs = {k: v[i] for k, v in linhas.items() if v[i] not in (None, '-')}
        p = specs.pop(potkey, None)
        out.append({'modelo': m, 'specs': specs, 'potencia_cv': pot(p) if isinstance(p, (int, float)) else None})
    return out

add(id='piccin-master', nome='Distribuidor Master (mecânico)', modelo='MASTER', subcategoria='Mecânicos', pagina=[42], conferido_em_imagem=True, **DIST,
    variantes=tabela(['MASTER 3000', 'MASTER 5500', 'MASTER 7500'], {
        'volume_carga_m3': [1.8, 2.5, 3.75], 'capacidade_carga_kg': [3000, 5500, 7500], 'altura_mm': [1565, 1805, 2005], 'largura_mm': [1730, 1850, 1855], 'comprimento_mm': [4155, 4655, 4655],
        'bitola_mm': [1440, 1560, 1620], 'rodado': ['Fixo', 'Balancin', 'Balancin'], 'roda': ['Aro 16" x 5,50', 'Aro 16" x 5,50', 'Aro 16" x 6,00'], 'pneu': ['7,50 x 16"', '7,50 x 16"', '9,00 x 16"'],
        'aplicacao_calcario_l_ha': ['100 a 16300'] * 3, 'vazao_regulavel_l_min': ['15 a 1200'] * 3, 'faixa_distribuicao_m': ['7 a 15'] * 3, 'largura_esteira_mm': [400] * 3,
        'peso_kg': [810, 1086, 1135], 'potencia_cv': [50, 75, 90]}),
    opcionais=['Kit direcionador', 'Abafador', 'Opcional de pneu'],
    divergencias=[{'texto': 'Tabela é imagem no PDF: valores transcritos da imagem da página 42.', 'pagina': 42}])
add(id='piccin-master-cafeeira', nome='Distribuidor Master Cafeeira', modelo='MASTER CAFEEIRA', subcategoria='Mecânicos', pagina=[43], **{**DIST, 'culturas': {'lista': ['café'], 'origem': 'catálogo (nome da linha)'}},
    variantes=tabela(['3000 CAFEEIRA', '3000 D CAFEEIRA', '3000 DH1 CAFEEIRA'], {
        'volume_carga_m3': [1.8] * 3, 'capacidade_carga_kg': [3000] * 3, 'altura_mm': ['1470 e 1570', '1550 e 1650', '1550 e 1650'], 'largura_mm': [1720, 1795, 1795], 'comprimento_mm': [4150, 3955, 3955],
        'bitola_mm': ['1240 e 1670', '1241 e 1670', '1241 e 1670'], 'rodado': ['Regulável'] * 3, 'roda': ['Aro 16" x 5,50'] * 3, 'pneu': ['7,50 x 16"'] * 3,
        'aplicacao_calcario_l_ha': ['100 a 16300', '100 a 21600', '100 a 21600'], 'vazao_regulavel_l_min': ['15 a 1200', '15 a 2400', '15 a 2400'], 'faixa_distribuicao_m': ['7 a 15'] * 3,
        'largura_esteira_mm': ['400', '400 e 800', '400 e 800'], 'peso_kg': [822, 1075, 1075], 'potencia_cv': [50, 50, 50]}),
    opcionais=['Kit direcionador'],
    diferenciais=[{'texto': 'Linha específica para cafeicultura, com bitola/rodado regulável', 'pagina': 43}],
    divergencias=[{'texto': 'Bitola "1240 e 1670" no modelo 3000 e "1241 e 1670" nos demais — provável erro de digitação.', 'pagina': 43}])
add(id='piccin-master-d', nome='Distribuidor Master D (mecânico)', modelo='MASTER D', subcategoria='Mecânicos', pagina=[44], conferido_em_imagem=True, **DIST,
    variantes=tabela(['3000 D', '5500 D', '7500 D', '10000 D'], {
        'volume_carga_m3': [1.8, 2.8, 3.75, 5.3], 'capacidade_carga_kg': [3000, 5500, 7500, 10000], 'altura_mm': [1645, 1860, 1945, 2145], 'largura_mm': [1790, 1850, 1920, 2200],
        'comprimento_mm': [3955, 4955, 4955, 5080], 'bitola_mm': [1440, 1560, 1620, 1800], 'rodado': ['Fixo', 'Balancin', 'Balancin', 'Balancin'],
        'roda': ['Aro 16" x 5,50', 'Aro 16" x 5,50', 'Aro 16" x 6,00', 'Aro 13" x 15,5'], 'pneu': ['7,50 x 16"', '7,50 x 16"', '9,00 x 16"', '400/60 15.5'],
        'aplicacao_calcario_l_ha': ['100 a 21600'] * 4, 'vazao_regulavel_l_min': ['15 a 2400'] * 4, 'faixa_distribuicao_m': ['7 a 15', '7 a 20', '7 a 20', '7 a 20'],
        'largura_esteira_mm': ['400 e 800'] * 4, 'peso_kg': [1065, 1453, 1541, 1930], 'potencia_cv': [50, 75, 90, 90]}),
    opcionais=['Kit direcionador', 'Abafador', 'Opcional de pneu'],
    divergencias=[{'texto': 'Tabela é imagem no PDF: valores transcritos da imagem da página 44.', 'pagina': 44}])
add(id='piccin-master-dh1', nome='Distribuidor Master DH1 (semi-hidráulico)', modelo='MASTER DH 1', subcategoria='Semi Hidráulicos', pagina=[45], **DIST,
    variantes=tabela(['3000 DH1', '5500 DH1', '7500 DH1', '10000 DH1', '12000 DH1'], {
        'volume_carga_m3': [1.8, 2.8, 3.75, 5.3, 7.0], 'capacidade_carga_kg': [3000, 5500, 7500, 10000, 12000], 'altura_mm': [1560, 1790, 1950, 2144, 2500], 'largura_mm': [1780, 1900, 1900, 2220, 3010],
        'comprimento_mm': [3830, 4830, 4955, 4890, 5900], 'bitola_mm': [144, 1560, 1620, 1800, '1400 a 2700'], 'rodado': ['Fixo', 'balancin', 'balancin', 'balancin', 'Regulável'],
        'roda': ['Aro 16" x 5,50', 'Aro 16" x 5,50', 'Aro 16" x 6,00', '13" x 15,5', 'w09I x 18"'], 'pneu': ['7,50 x 16"', '7,50 x 16"', '9,00 x 16"', '400/600x 15,5', '12,5/80 x 18"'],
        'aplicacao_calcario_l_ha': ['100 a 21600'] * 5, 'vazao_regulavel_l_min': ['15 a 2400'] * 5, 'faixa_distribuicao_m': ['7 a 20'] * 5, 'largura_esteira_mm': ['400 e 800', '400 e 800', '400 e 800', '800', '400 e 800'],
        'vazao_hidraulica_trator_l_min': ['45 a 60', '45 a 60', '45 a 60', '55 a 65', '55 a 70'], 'peso_kg': [1055, 1370, 1527, 1950, 2340], 'potencia_cv': [50, 75, 90, 90, 100]}),
    opcionais=['Kit direcionador', 'Bica central', 'Abafador', 'Pneu 14.9 x 28'],
    divergencias=[{'texto': 'Bitola do 3000 DH1 aparece como "144" (provável 1440 mm). Linha "Vazão Regulável" com unidade L/ha no cabeçalho e L/min nas células.', 'pagina': 45}])
add(id='piccin-master-tp-rb', nome='Distribuidor Master 1500 TP RB', modelo='MASTER TP RB', subcategoria='Hidráulicos', pagina=[46], **DIST,
    variantes=tabela(['MASTER 1500 TP RB'], {'volume_carga_m3': [1.3], 'capacidade_carga_kg': [1500], 'altura_mm': [1784], 'largura_mm': [2000], 'comprimento_mm': [1730], 'bitola_mm': [1640],
        'rodado': ['Eixo Fixo'], 'roda': ['Aro 5.1/2" x 16" 05 furos - (110x140)'], 'pneu': ['7.50/16'], 'aplicacao_kg_ha': ['13 a 1500'], 'faixa_distribuicao_m': ['7 a 36'],
        'largura_esteira_mm': [500], 'peso_kg': [644], 'potencia_cv': [65]}),
    divergencias=[{'texto': 'Potência indicada como "65 (min)". Aplicação expressa em kg/ha nesta linha (L/ha nas linhas D/DH).', 'pagina': 46}])
add(id='piccin-master-dh-ei', nome='Distribuidor Master 5500 DH EI', modelo='MASTER DH EI', subcategoria='Hidráulicos', pagina=[47], **DIST,
    variantes=tabela(['5500 DH EI'], {'volume_carga_m3': [2.8], 'capacidade_carga_kg': [5500], 'altura_mm': [1790], 'largura_mm': [2940], 'comprimento_mm': [4890], 'bitola_mm': [1560], 'rodado': ['Balancin'],
        'roda': ['Aro 16" x 5,50'], 'pneu': ['7,50 x 16"'], 'aplicacao_calcario_l_ha': ['20 a 16300'], 'vazao_regulavel': ['10 a 500 gramas por metro linear'], 'faixa_distribuicao_m': ['5 a 25'],
        'largura_esteira_mm': ['2 de 400 (equivalente a 1 de 800)'], 'peso_kg': [1960], 'potencia_cv': [75]}),
    opcionais=['Taxa variável', 'Sensor ultrassônico'],
    diferenciais=[{'texto': 'Distribuição de fertilizantes em taxa variável (implemento pronto para taxa variável)', 'pagina': 47}])
add(id='piccin-master-6000-rb', nome='Distribuidor Master 6000 RB', modelo='MASTER 6000 RB', subcategoria='Hidráulicos', pagina=[48], **DIST,
    variantes=tabela(['MASTER 6000 RB'], {'comprimento_mm': [5684], 'altura_mm': [2644], 'largura_mm': [3000], 'peso_kg': [3150], 'volume_carga_m3': [4.6], 'aplicacao_kg_ha': ['13 a 6000'],
        'velocidade_trabalho': ['4 a 18 km/h teórico; c/ Dual Control variação a mais 40%; determinados produtos até 40 km/h'], 'discos_distribuicao': ['Ø24" (padrão modelo único)'],
        'largura_distribuicao': ['produtos em pó até 14 m'], 'transmissao': ['acionamento hidráulico'], 'reservatorio_oleo_l': [200], 'sistema_hidraulico': ['dependente do trator; bomba conforme versão'], 'potencia_cv': [80]}),
    pendencias=['Capacidade de carga em kg não informada.'])
add(id='piccin-master-8000-bi-rb', nome='Distribuidor Master 8000 BI RB', modelo='MASTER 8000 BI RB', subcategoria='Hidráulicos', pagina=[49], **DIST,
    variantes=tabela(['MASTER 8000 BI RB'], {'volume_carga_m3': [4.6], 'capacidade_carga_kg': [8000], 'altura_mm': [2644], 'largura_mm': [3000], 'comprimento_mm': [5684], 'bitola_mm': ['3000 com bitola (2500) = 3465'],
        'rodado': ['Tandem'], 'roda': ['W8,00" x 18,00" 8F'], 'pneu': ['10.5/80-18 (10 lonas)'], 'aplicacao_kg_ha': ['13 a 6000'], 'faixa_distribuicao_m': ['7 a 36'], 'largura_esteira_mm': [600], 'peso_kg': [2700], 'potencia_cv': [80]}))
add(id='piccin-master-10000-bi-rb', nome='Distribuidor Master 10000 BI RB', modelo='MASTER 10000 BI RB', subcategoria='Hidráulicos', pagina=[50], **DIST,
    variantes=tabela(['MASTER 10000 BI RB'], {'volume_carga_m3': [6], 'capacidade_carga_kg': [10000], 'altura_mm': [2956], 'largura_mm': [3000], 'comprimento_mm': [6219], 'bitola_mm': ['3000 com bitola (2500) = 3465'],
        'rodado': ['Tandem'], 'roda': ['10 W x 24" - 8 furos (210x275)'], 'pneu': ['12.4-24 ou 14.9-28'], 'aplicacao_kg_ha': ['13 a 6000; c/ Dual Control 1 a 8000'], 'faixa_distribuicao_m': ['10 a 36'],
        'largura_esteira_mm': [600], 'peso_kg': [4450], 'potencia_cv': [140]}),
    diferenciais=[{'texto': 'Dual Control: vazão de 1 a 8000 kg/ha', 'pagina': 50}])
add(id='piccin-master-dh-s', nome='Distribuidor Master DH S', modelo='MASTER DH S', subcategoria='Hidráulicos', pagina=[51], **DIST,
    variantes=tabela(['7500 DH S', '10000 DH S', '12000 DH S'], {'volume_carga_m3': [3.75, 5.3, 7], 'capacidade_carga_kg': [7500, 10000, 12000], 'altura_mm': [1990, 2145, 2540], 'largura_mm': [1870, 2200, 3690],
        'comprimento_mm': [4955, 5080, 6100], 'bitola_mm': [1620, 1800, '1400 a 3000'], 'rodado': ['balancin', 'Balancin', 'Regulável'], 'roda': ['Aro 16" x 6,00', 'Aro 13" x 15,5', 'w09I x 18"'],
        'pneu': ['9,00 x 16"', '400/60 x 15,5"', '12,5/80 x 18"'], 'aplicacao_calcario_l_ha': ['50 a 21600'] * 3, 'vazao_regulavel_l_min': ['8 a 2400'] * 3, 'faixa_distribuicao_m': ['7 a 30', '7 a 35', '7 a 35'],
        'largura_esteira_mm': ['400 e 800'] * 3, 'vazao_hidraulica_trator_l_min': ['55 a 70'] * 3, 'peso_kg': [1608, 2007, 2742], 'potencia_cv': [90, 90, 100]}),
    opcionais=['Taxa variável', 'Bitola regulável (BR)', 'Pneu 14.9 x 26'],
    diferenciais=[{'texto': 'Pronto para distribuição de fertilizantes em taxa variável', 'pagina': 51}])
INOX_ROWS = lambda pesos: {'volume_carga_m3': [3.75, 3.75, 7.0], 'capacidade_carga_kg': [7500, 7500, 12000], 'altura_sem_arco_mm': [2370, 1945, 2470], 'altura_com_arco_mm': ['-', '-', 2670],
    'largura_viga_mm': [3015, 1375, 3315], 'largura_interna_pneu_mm': ['2090 a 2390', 1375, '1081 a 2681'], 'bitola_mm': ['1400 a 2700', 1620, '1400 a 3000'], 'largura_externa_pneu_mm': ['2380 a 2980', 1830, '1700 a 3300'],
    'largura_externa_rodado_mm': ['2970 a 3270', '-', '2000 a 3600'], 'comprimento_mm': [5060, 4950, 6000], 'vao_livre_mm': [686, 440, 668], 'altura_disco_solo_mm': [886, 640, 870],
    'rodado': ['Regulável', 'Balancin', 'Regulável e Articulado'], 'roda': ['Aro 15" x 10', 'Aro 16" x 6,00', 'w09I x 18"'], 'pneu': ['11L15', '9,00 x 16"', '12,5/80 x 18"'],
    'aplicacao_calcario_l_ha': ['50 a 21600'] * 3, 'vazao_regulavel_l_min': ['8 a 2400'] * 3, 'faixa_distribuicao_m': ['7 a 32', '7 a 32', '7 a 35'], 'largura_esteira_mm': ['400 e 800'] * 3,
    'peso_kg': pesos, 'potencia_cv': [90, 90, 100]}
NOVIDADES_INOX = 'Lona fácil (opcional), esticador com mola, assoalho revestido em inox (opcional), calha central e suplementos em inox, calha para coleta de calibração, mangueiras com proteção e vedação O-ring, discos de fácil regulagem e remoção'
add(id='piccin-master-dh-s-inox', nome='Distribuidor Master DH S INOX', modelo='MASTER DH S INOX', subcategoria='Hidráulicos', pagina=[52], **DIST,
    variantes=tabela(['7500 DH S BR INOX', '7500 DH S INOX', '12000 DH S INOX'], {**INOX_ROWS([2187, 1808, 3049]), 'faixa_vazao_vcr_l_min': ['50 a 70'] * 3}),
    opcionais=['Lona fácil', 'Bitola regulável (BR)', 'Taxa variável', 'Pneu 14.9 x 26'],
    diferenciais=[{'texto': 'Pronto para taxa variável', 'pagina': 52}, {'texto': NOVIDADES_INOX, 'pagina': 52}])
add(id='piccin-master-dh-bi-s', nome='Distribuidor Master 12000 DH BI S', modelo='MASTER DH BI S', subcategoria='Hidráulicos', pagina=[53], **DIST,
    variantes=tabela(['12000 DH BI S'], {'volume_carga_m3': [7], 'capacidade_carga_kg': [12000], 'altura_mm': [2540], 'largura_mm': [3690], 'comprimento_mm': [5980], 'bitola_mm': ['1400 a 3000'],
        'rodado': ['Regulável'], 'roda': ['w09I x 18"'], 'pneu': ['12,5/80 x 18"'], 'aplicacao_calcario_l_ha': ['50 a 21600'], 'vazao_regulavel_l_min': ['8 a 2400'], 'faixa_distribuicao_m': ['7 a 35'],
        'largura_esteira_mm': ['400 e 800'], 'peso_kg': [2830], 'potencia_cv': [100]}),
    opcionais=['Taxa variável', 'Bitola regulável (BR)', 'Pneu 14.9 x 26', 'Abafador'],
    diferenciais=[{'texto': 'Pronto para taxa variável', 'pagina': 53}])
add(id='piccin-master-dh-bi-s-inox', nome='Distribuidor Master DH BI S INOX', modelo='MASTER DH BI S INOX', subcategoria='Hidráulicos', pagina=[54], **DIST,
    variantes=tabela(['7500 DH BI S BR INOX', '7500 DH BI S INOX', '12000 DH BI S INOX'], INOX_ROWS([2260, 1920, 3195])),
    opcionais=['Lona fácil', 'Bitola regulável (BR)', 'Taxa variável', 'Pneu 14.9 x 26', 'Abafador'],
    diferenciais=[{'texto': 'Pronto para taxa variável', 'pagina': 54}, {'texto': NOVIDADES_INOX, 'pagina': 54}],
    pendencias=['Faixa de vazão na VCR em branco ("-") no catálogo.'])
add(id='piccin-master-15000-bi-rb', nome='Distribuidor Master 15000 BI RB', modelo='MASTER 15000 BI RB', subcategoria='Hidráulicos', pagina=[55], **DIST,
    variantes=tabela(['MASTER 15000 BI RB'], {'volume_carga_m3': ['5,4 (sem fominha) / 7,5 (com fominha)'], 'capacidade_carga_kg': [15000], 'altura_mm': [2957], 'largura_mm': [3000], 'comprimento_mm': [6214],
        'bitola_mm': ['3000 a 3465'], 'rodado': ['Tandem – coxilha'], 'roda': ['10 W x 24" - 8 furos (210x275)'], 'pneu': ['12.4-24 12 lonas'], 'aplicacao_kg_ha': ['13 a 6000; c/ Dual Control 1 a 8000'],
        'faixa_distribuicao_m': ['7 a 36'], 'largura_esteira_mm': [600], 'peso_kg': [4362], 'potencia_cv': [160]}))
add(id='piccin-master-17000-precision-tech', nome='Distribuidor Master 17000 Precision Tech', modelo='MASTER 17000 PRECISION TECH', subcategoria='Hidráulicos', pagina=[56], **DIST,
    variantes=tabela(['MASTER 17000 PRECISION TECH'], {'volume_carga_m3': [8.5], 'capacidade_carga_kg': [17000], 'altura_mm': [3060], 'largura_mm': [3260], 'comprimento_mm': [6300], 'bitola_mm': ['2300 a 2700'],
        'rodado': ['Regulável e Articulado'], 'roda': ['W9 x 24 x 10 F.'], 'pneu': ['14.00-24 16 lonas'], 'aplicacao_calcario_l_ha': ['50 a 21600'], 'vazao_regulavel_l_min': ['8 a 2400'],
        'faixa_distribuicao_m': ['4 a 36'], 'largura_esteira_mm': ['2 de 400'], 'peso_kg': [4415], 'potencia_cv': [150]}),
    diferenciais=[{'texto': 'Com taxa variável e rodeiro articulado', 'pagina': 56}])
add(id='piccin-master-25000-hd-rb', nome='Distribuidor Master 25000 Heavy Duty RB', modelo='MASTER 25000 HEAVY DUTY RB', subcategoria='Hidráulicos', pagina=[57], **DIST,
    variantes=tabela(['MASTER 25000 HEAVY DUTY RB'], {'volume_carga_m3': [12], 'capacidade_carga_kg': [25000], 'altura_mm': [3240], 'largura_mm': [3560], 'comprimento_mm': [8573], 'bitola_mm': [2500],
        'rodado': ['Eixo transversal'], 'roda': ['DW 20X26'], 'pneu': ['23.1/26'], 'aplicacao_kg_ha': ['20 a 6000; c/ Dual Control 1 a 8000'], 'faixa_distribuicao_m': ['7 a 36'], 'largura_esteira_mm': [600],
        'peso_kg': [6340], 'potencia_cv': [200]}))
HD = {'volume_carga_m3': [15.0], 'capacidade_carga_kg': [30000], 'altura_sem_arco_mm': [3075], 'altura_com_arco_mm': [3322], 'altura_abafador_recolhido_mm': [4225], 'largura_interna_rodado_mm': [2273],
      'largura_externa_rodado_mm': [3710], 'largura_abafador_recolhido_mm': [5060], 'largura_abafador_aberto_mm': [9000], 'comprimento_mm': [7760], 'bitola_mm': [3000], 'vao_livre_mm': [400],
      'rodado': ['Dianteiro balancim e traseiro fixo'], 'roda': ['AG 24" x 22,5" x 10 F.'], 'pneu': ['710/40 x 22,5" 16 lonas'], 'aplicacao_calcario_l_ha': ['50 a 21600'], 'vazao_regulavel_l_min': ['8 a 2400'],
      'faixa_distribuicao_m': ['7 a 35'], 'largura_esteira_mm': ['400 e 800']}
add(id='piccin-master-30000-hd', nome='Distribuidor Master 30000 Heavy Duty', modelo='MASTER 30000 HEAVY DUTY', subcategoria='Hidráulicos', pagina=[58], **DIST,
    variantes=tabela(['MASTER 30000 HEAVY DUTY'], {**HD, 'peso_com_abafador_kg': [5608], 'peso_sem_abafador_kg': [5134], 'potencia_cv': [220]}),
    opcionais=['Taxa variável', 'Abafador'], especificacoes_comuns={'obs_potencia': 'potência MÍNIMA no motor'})
add(id='piccin-master-30000-hd-inox', nome='Distribuidor Master 30000 Heavy Duty INOX', modelo='MASTER 30000 HEAVY DUTY INOX', subcategoria='Hidráulicos', pagina=[59], **DIST,
    variantes=tabela(['MASTER 30000 HEAVY DUTY INOX'], {**HD, 'peso_com_abafador_kg': [5656], 'peso_sem_abafador_kg': [5188], 'potencia_cv': [220]}),
    diferenciais=[{'texto': 'Com taxa variável; versão em inox', 'pagina': 59}], especificacoes_comuns={'obs_potencia': 'potência MÍNIMA no motor'})
add(id='piccin-master-12000-dh-bi-s-truck', nome='Distribuidor Master 12000 DH BI S Truck', modelo='MASTER DH BI S TRUCK', subcategoria='Linha Caminhão', pagina=[60], **DIST,
    variantes=tabela(['MASTER 12000 DH BI S TRUCK'], {'volume_carga_m3': [7.0], 'capacidade_carga_kg': [12000], 'altura_mm': [2100], 'largura_mm': [3010], 'comprimento_mm': [4870],
        'aplicacao_calcario_l_ha': ['50 a 21600'], 'vazao_regulavel_l_min': ['8 a 2400'], 'faixa_distribuicao_m': ['7 a 35'], 'largura_esteira_mm': [800], 'peso_kg': [1900], 'potencia_cv': [100]}),
    diferenciais=[{'texto': 'Montado em caminhão; bomba independente e adaptação no chassi são de responsabilidade do cliente', 'pagina': 60}],
    divergencias=[{'texto': 'Página traz o subtítulo "Hidráulicos", mas o sumário a coloca em "Linha Caminhão" (p. 60).', 'pagina': 60}])
add(id='piccin-master-truck-15000-rb', nome='Distribuidor Master Truck 15000 RB', modelo='MASTER TRUCK 15000 RB', subcategoria='Linha Caminhão', pagina=[61], **DIST,
    variantes=tabela(['MASTER TRUCK 15000 RB'], {'volume_carga_m3': ['4,9 (sem fominha) - 6,2 (com fominha)'], 'capacidade_carga_kg': [15000], 'altura_mm': [1700], 'largura_mm': [3000], 'comprimento_mm': [5210],
        'aplicacao_kg_ha': ['13 a 6000; c/ Dual Control 1 a 8000'], 'faixa_distribuicao_m': ['7 a 36'], 'largura_esteira_mm': [600], 'peso_kg': [2750], 'potencia_cv': ['-']}),
    pendencias=['Potência: "consultar" (não informada).'])
add(id='piccin-master-truck-25000-rb', nome='Distribuidor Master Truck 25000 RB', modelo='MASTER TRUCK 25000 RB', subcategoria='Linha Caminhão', pagina=[62], **DIST,
    variantes=tabela(['MASTER TRUCK 25000 RB'], {'volume_carga_m3': [12], 'capacidade_carga_kg': [25000], 'altura_mm': [2876], 'largura_mm': [2600], 'comprimento_mm': [6366],
        'aplicacao_kg_ha': ['20 a 6000; c/ Dual Control 1 a 8000'], 'faixa_distribuicao_m': ['7 a 36'], 'largura_esteira_mm': [600], 'peso_kg': [4130], 'potencia_cv': [200]}),
    divergencias=[{'texto': 'Equipamento de caminhão com "Potência no Motor 200 cv" — conferir se é exigência do caminhão.', 'pagina': 62}])
add(id='piccin-master-roll-on-roll-off', nome='Distribuidor Master Roll On Roll Off', modelo='MASTER ROLL ON ROLL OFF', subcategoria='Linha Caminhão', pagina=[63], **DIST,
    variantes=tabela(['MASTER ROLL ON ROLL OFF'], {'volume_carga_m3': [12], 'capacidade_carga_kg': [25000], 'altura_mm': [3260], 'largura_mm': [2600], 'comprimento_mm': [6366],
        'aplicacao_kg_ha': ['20 a 6000; c/ Dual Control 1 a 8000'], 'faixa_distribuicao_m': ['7 a 36'], 'largura_esteira_mm': [600], 'peso_kg': [4685], 'potencia_cv': [220]}),
    opcionais=['Chassi (opcional p. 66)'])
add(id='piccin-master-aup', nome='Distribuidor Master Autopropelido', modelo='MASTER AUP', subcategoria='Linha Autopropelido', pagina=[64], **DIST,
    variantes=tabela(['MASTER 3000 AUP', 'MASTER 4000 AUP', 'MASTER 5000 AUP', 'MASTER 6000 AUP'], {'volume_carga_m3': [3, 4, 5, 6], 'capacidade_carga_kg': [3000, 4000, 5000, 6000],
        'altura_mm': [1961, 1478, 2115, 2033], 'largura_mm': [2500, 3301, 2500, 2661], 'comprimento_mm': [2905, 3849, 3548, 4420], 'aplicacao_kg_ha': ['13 a 6000'] * 4, 'faixa_distribuicao_m': ['7 a 36'] * 4,
        'largura_esteira_mm': [600] * 4, 'peso_kg': [1350, 1670, 1830, 1915], 'potencia_cv': [220] * 4}),
    divergencias=[{'texto': 'Altura do 4000 AUP (1478 mm) menor que a do 3000 AUP (1961 mm) — conferir.', 'pagina': 64}])
add(id='piccin-esteira-precisa', nome='Esteira Precisa Piccin', modelo='ESTEIRA PRECISA', categoria='Distribuidores', subcategoria='Opcionais', pagina=[65],
    operacao='Transporte e distribuição de materiais no distribuidor',
    aplicacao={'texto': 'Transporte de calcário, gesso, adubos químicos e outros materiais.', 'origem': 'catálogo, p. 65'},
    culturas={'lista': [], 'origem': 'não se aplica'},
    especificacoes_comuns={'largura_esteira_mm': '400 e 800', 'regulagens_velocidade': 3},
    diferenciais=[{'texto': 'Esteiras de 400 mm e 800 mm com três regulagens de velocidade', 'pagina': 65}],
    pendencias=['Componente/opcional — sem potência, sem tabela de modelos. Benefícios descritos pelo fabricante em linguagem promocional, sem números.'],
    status='incompleta')

# ---------------------------------------------------------------- CRUCIANELLI (somente plantadeiras)
PLANT = dict(fabricante='CRUCIANELLI', arquivo=ARQ_C, categoria='Plantadeiras', operacao='Plantio (semeadura) e adubação')
linhas = {'12 m': ['26 / 50', '27 / 45', '33 / 38.1', '16 / 76.2'], '15 m': ['32 / 50', '35 / 45', '41 / 38.1', '20 / 76.2'], '18 m': ['38 / 50', '41 / 45', None, '24 / 76.2']}
dados = {'12 m': (13, 8.4, 12.5, 13900, 20470, 220), '15 m': (16, 9.0, 14, 15700, 22270, 270), '18 m': (19, 10.5, 16.5, 17800, 24300, 310)}
variantes = []
for m, (l50, comp, comp_t, vazia, cheia, hp) in dados.items():
    variantes.append({'modelo': f'Plantor {m}', 'specs': {
        'linhas_espacamento_cm': [x for x in linhas[m] if x], 'largura_trabalho_50cm_m': l50, 'comprimento_trabalho_m': comp, 'altura_trabalho_m': 3.2, 'largura_transporte_m': 3.9,
        'comprimento_transporte_m': comp_t, 'altura_transporte_m': 3.8, 'peso_vazia_kg': vazia, 'peso_max_capacidade_kg': cheia, 'potencia_min_hp_linhas_50cm': hp},
        'potencia_cv': pot(hp, hp, 'HP mínimo com linhas a 50 cm (unidade HP no catálogo)')})
add(id='crucianelli-plantor', nome='Plantor — plantadeira com caixa central', modelo='PLANTOR', subcategoria='Plantadeira de grãos graúdos de caixa central', pagina=[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], **PLANT,
    aplicacao={'texto': 'Plantio de grãos com dosagem monogrão; fertilização na linha ou fora de linha.', 'origem': 'catálogo, p. 7, 9 e 12'},
    culturas={'lista': ['soja', 'milho'], 'origem': 'catálogo, p. 7 (exemplos de disposição das caixas: soja e milho)'},
    especificacoes_comuns={'caixas': '3 caixas centrais de polietileno de 2.400 L cada (semente ou adubo)', 'capacidade_sementes_2_tolvas': '4800 L / 3456 kg', 'capacidade_adubo_1_tolva': '2400 L / 3120 kg',
        'rodados': '6 pneus 400 / 55-22.5', 'afastamento_solo_transporte_m': '0,40 (com linhas sem travar)',
        'requisitos_hidraulicos': 'Centro fechado; 4 válvulas de controle remoto; vazão mínima 185 L/min; pressão 200 bar',
        'requisitos_eletricos_vdrive': '12 V / 1,25 A por linha de plantio; antena e piloto 5 ou 10 Hz; 19.200 ou 38.400 bps; SF1, SF2, RTK',
        'saidas_hidraulicas': 'Saída 1 (prioritária) movimentação 70 L/min; Saída 2 — 2 turbinas de vácuo 35 a 40 L/min; Saída 3 — 1 turbina de ar positivo 34 a 40 L/min; Load sensing: motor de adubo/semente e alternador 30 a 45 L/min; Delta Force 1 L/min por linha',
        'unidade_plantio': 'Rodas compactadoras em V com banda de borracha trapezoidal; afirmador de grãos (roda compactadora ou lingueta, opcional); duas rodas de controle de profundidade 2 ⅛" x 15 ou 4" x 15; disco duplo plantador de 16"; disco de corte com linguetas afirmadoras',
        'discos_corte': 'Disco liso de 19"; disco tango filo liso 19"',
        'disco_duplo_fertilizador': 'Disco recortado de 17" + disco liso de 15"; distância mínima da linha de plantio 13 cm'},
    variantes=variantes,
    configuracoes=[
        {'nome': 'Três caixas para sementes', 'detalhe': 'Máxima autonomia de plantio — sementes 7200 L / 5180 kg', 'pagina': 7},
        {'nome': 'Fertilizante na caixa dianteira (ex.: soja)', 'detalhe': 'Fertilizante 2400 L / 3120 kg; sementes 4800 L / 3450 kg', 'pagina': 7},
        {'nome': 'Fertilizante nas duas caixas traseiras (ex.: milho)', 'detalhe': 'Fertilizante 4800 L / 6240 kg; sementes 2400 L / 1730 kg', 'pagina': 7},
        {'nome': 'Fertilização fora de linha', 'detalhe': 'Fertilizante 1: 2400 L; fertilizante 2: 2400 L; sementes 2400 L', 'pagina': 7},
        {'nome': 'Nível de equipamento Plantor Precision Planting', 'detalhe': 'Controle elétrico vDrive (plantio variável + corte linha a linha); dosagem pneumática Precision Planting; monitor 20/20 SeedSense; fertilização vApply; Delta Force (controle hidráulico de pressão linha a linha)', 'pagina': 10}],
    opcionais=['Kit varredura (limpa a palhada à frente do disco duplo)', 'Kit central hidráulica independente (TDP 540 rpm; não usa a saída 3 do trator)', 'Disco duplo fertilizador', 'Afirmador de grãos (roda compactadora ou lingueta)'],
    diferenciais=[
        {'texto': 'Transporte → trabalho em menos de 3 minutos, com um operador', 'pagina': 3},
        {'texto': 'Sistema de transporte patenteado, comandado da cabine: 18 m de trabalho em menos de 4 m de largura de transporte (tabela: 3,9 m)', 'pagina': 4},
        {'texto': '6 pneus (2 pares balancim + 2 articulados giratórios) distribuem o peso sem sobrecarregar o engate do trator', 'pagina': 4},
        {'texto': 'Sistema dual de dosagem e abastecimento (patenteado e premiado): as 3 caixas servem para semente ou adubo; conversão sem ferramentas', 'pagina': 8},
        {'texto': 'Abastecimento de sementes sob demanda até os dosadores monogrão; dosador de fertilizante por roda dentada tipo Chevron com motor hidráulico', 'pagina': 9},
        {'texto': 'Nível Precision Planting: vDrive, monitor 20/20 SeedSense, vApply e Delta Force', 'pagina': 10}],
    divergencias=[
        {'texto': 'Largura de trabalho: p. 2 diz "12,60 a 18,90 metros"; a tabela da p. 5 traz 13 / 16 / 19 m "a 50 cm" e os modelos se chamam 12 m / 15 m / 18 m.', 'pagina': 5},
        {'texto': 'Capacidade de sementes em 2 caixas: 3456 kg (p. 5) × 3450 kg (p. 7).', 'pagina': 7},
        {'texto': 'Potência mínima em HP (p. 5), não em cv.', 'pagina': 5},
        {'texto': 'Fonte de terceiros (Revista Cultivar, 01/12/2025) chama o modelo de "Plantor 2450", cita versão de transporte de 3,2 m (12 m/24 linhas e 15 m/30 linhas) e monitor ISOBUS — nada disso aparece no catálogo de 2024. Validar com a fábrica.', 'pagina': None}],
    pendencias=['Capacidade operacional (ha/h) não informada.', 'Velocidade de plantio não informada.', 'Site oficial (crucianelli.com) não pôde ser consultado nesta sessão.'],
    status='confirmada')
add(id='crucianelli-plantor-leaf', nome='Plantor Leaf', modelo='PLANTOR LEAF', subcategoria='Plantadeira (trem de plantio Leaf)', pagina=[15, 16], **PLANT,
    aplicacao={'texto': 'Plantio — versão com Monitor Orizon.', 'origem': 'catálogo, p. 16'},
    culturas={'lista': [], 'origem': 'não informado'},
    especificacoes_comuns={'trem_plantio': 'Duplo tampão de rodas (trapezoidal com banda de borracha ou fundição); barra de calda ou rodas compactadoras (opcional); dupla roda niveladora 2(1/8) x 15" ou 4 x 15"; duplo disco de 16"; lâmina de corte de restolho com patins; paralelogramos; controle flexível; disco duplo fertilizador; mini caixa Crucianelli',
                           'monitor': 'Orizon'},
    variantes=[],
    pendencias=['Sem tabela de especificações (larguras, linhas, potência).', 'Disponibilidade no Brasil não informada.'],
    divergencias=[{'texto': 'P. 16 diz que o "novo Plantor com Monitor Orizon é integralmente fabricado na Argentina"; p. 13 diz que a Plantor é fabricada em São Carlos (SP). Provavelmente versões diferentes — validar.', 'pagina': 16}],
    status='pendente de validação')

# ---------------------------------------------------------------- perfil e benefícios (derivados, rotulados)
def perfil(p):
    pr = p.get('potencia_requerida_cv')
    un = 'HP' if p['fabricante'] == 'CRUCIANELLI' else 'cv'
    if not pr:
        return {'texto': 'Não determinado (potência não informada no catálogo).', 'base': 'sem dado'}
    lo, hi = pr['min'], pr['max']
    faixas = []
    if lo <= 100: faixas.append(f'pequenos e médios produtores (tratores até ~100 {un})')
    if lo < 200 and hi > 100: faixas.append(f'médios e grandes produtores (tratores de 100 a 250 {un})')
    if hi > 250 or lo >= 200: faixas.append(f'grandes propriedades e grupos agrícolas (tratores acima de 200 {un})')
    return {'texto': '; '.join(faixas), 'base': f'Derivado da potência requerida no catálogo ({lo} a {hi} {un}): indica o porte do trator, não a área da propriedade. Confirmar com o cliente.'}

BENEF = {
    'Descompactadores': 'Rompe camadas compactadas, condição que limita o desenvolvimento de raízes e a infiltração de água (benefício agronômico geral; o catálogo não traz números de desempenho).',
    'Grades': 'Prepara e nivela o solo para o plantio; a variedade de larguras permite casar o implemento com a potência do trator disponível (catálogo traz potência por modelo).',
    'Distribuidores': 'Aplica corretivos e fertilizantes com faixa de vazão e de distribuição documentadas; modelos com taxa variável permitem aplicação conforme mapa (quando o produtor tiver mapa).',
    'Utilitários': 'Movimenta cargas na propriedade (capacidade de levante documentada por modelo).',
    'Plantadeiras': 'Maior autonomia por abastecimento (3 caixas de 2.400 L) e troca rápida entre transporte e trabalho, documentadas no catálogo; o catálogo não informa rendimento em ha/h.'}
for p in produtos:
    p['perfil_cliente'] = perfil(p)
    p['beneficios'] = [{'texto': BENEF.get(p['categoria'], ''), 'base': 'derivado da categoria e dos dados do catálogo — não é promessa de desempenho'}]
    p['marca_ativa'] = True

out = {'versao_base': 1, 'gerado_em': HOJE, 'gerado_por': 'scripts/catalogo_build.py',
       'fontes': [{'fabricante': 'PICCIN', 'arquivo': ARQ_P, 'paginas': 68, 'revisao': '01/2026', 'criado_em': '2025-12-10'},
                  {'fabricante': 'CRUCIANELLI', 'arquivo': ARQ_C, 'paginas': 16, 'revisao': 'LECTURA 2024 (português)', 'criado_em': '2024-07-08'}],
       'sites_oficiais': [{'fabricante': 'PICCIN', 'url': 'https://www.piccin.com.br/', 'consultado': False, 'motivo': 'não acessível nesta sessão de desenvolvimento'},
                          {'fabricante': 'CRUCIANELLI', 'url': 'https://www.crucianelli.com', 'consultado': False, 'motivo': 'não acessível nesta sessão de desenvolvimento'}],
       'produtos': produtos}
dest = os.path.join(os.path.dirname(__file__), '..', 'data', 'catalogo', 'produtos.json')
json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print('produtos:', len(produtos), Counter(p['fabricante'] for p in produtos))
print('variantes:', sum(len(p['variantes']) for p in produtos), Counter(p['status'] for p in produtos))
