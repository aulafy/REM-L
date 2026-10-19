#!/usr/bin/env python3
"""Convierte docs/tutorial/TUTORIAL.md en los capítulos LaTeX de la Parte III (chapters/17-tutorial.tex) y el glosario."""
import re, subprocess, os, sys
root = os.path.join(os.path.dirname(__file__), '..')
s = open(os.path.join(root, '..', 'docs/tutorial/TUTORIAL.md')).read()
a = s.index('## 1. Principios de partida'); g = s.index('## 20. Glosario')
body, gloss = s[a:g], s[g:]
body = re.sub(r'## Parte II · Ampliaciones[^\n]*\n\nLos capítulos A a D[^\n]*\n\n', '', body)
def shift(t):
    out, fence = [], False
    for line in t.split('\n'):
        if line.startswith('```'): fence = not fence
        if not fence:
            m = re.match(r'^(#{2,4}) (.*)$', line)
            if m: line = '#' * (len(m.group(1)) - 1) + ' ' + m.group(2)
        out.append(line)
    return '\n'.join(out)
def clean(t):
    t = re.sub(r'^\d+\.\s*', '', t); t = re.sub(r'^[A-D]\.\s*', '', t); return re.sub(r'^Paso \d+\s*·\s*', '', t)
body, gloss = shift(body), shift(gloss)
body = re.sub(r'^# (.*)$', lambda m: '# ' + clean(m.group(1)), body, flags=re.M)
gloss = re.sub(r'^# (.*)$', lambda m: '# ' + clean(m.group(1)), gloss, flags=re.M)
REFS = {'capítulo 11': 'cap:agentica', 'capítulo 8': 'cap:importacion', 'capítulo 17': 'cap:pruebas', 'capítulo 15': 'cap:remtec', 'capítulo 13': 'cap:seguridad'}
for k, v in REFS.items(): body = body.replace(k, f'capítulo @@{v}@@')
body = body.replace('(ver el capítulo 17)', '(ver el capítulo @@cap:pruebas@@)')
def conv(md, extra=()):
    r = subprocess.run(['pandoc', '-f', 'markdown-smart', '-t', 'latex', '--top-level-division=chapter', '--wrap=preserve', '--syntax-highlighting=none', *extra], input=md, capture_output=True, text=True, check=True)
    return r.stdout
tex = conv(body)
LABELS = {'Base de datos: SQLite, esquema y migraciones': 'cap:bbdd', 'La parte agéntica': 'cap:agentica', 'Importación de datos': 'cap:importacion', 'Pruebas': 'cap:pruebas', 'Seguridad, de capa': 'cap:seguridad', 'Correo estructurado': 'cap:correoverificado', 'REM Clientes: un canal cifrado': 'cap:remtec', 'RAG: el asistente': 'cap:rag', 'Claude construye ampliaciones': 'cap:modulos'}
def lab(m):
    title = m.group(0); 
    for k, v in LABELS.items():
        if k in title: return title + f'\\label{{{v}}}'
    return title
tex = re.sub(r'\\chapter\{[^\n]*\\label\{[^}]*\}', lambda m: m.group(0), tex)
tex = re.sub(r'\\chapter\{.*?\}(?=\\label|\n)', lab, tex)
tex = re.sub(r'@@(cap:[a-z]+)@@', r'\\ref{\1}', tex)
open(os.path.join(root, 'chapters/17-tutorial.tex'), 'w').write('% Generado por tools/tutorial2tex.py a partir de docs/tutorial/TUTORIAL.md\n' + tex)
gl = conv(gloss)
open(os.path.join(root, 'chapters/91-glosario.tex'), 'w').write('% Generado por tools/tutorial2tex.py\n' + gl.replace('\\chapter{Glosario}', '\\chapter{Glosario}'))
print('ok', len(tex), len(gl))
