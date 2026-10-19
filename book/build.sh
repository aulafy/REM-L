#!/usr/bin/env bash
# Compila el libro con XeLaTeX (dos pasadas + índice). Uso: book/build.sh
set -e
cd "$(dirname "$0")"
xelatex -interaction=nonstopmode -halt-on-error main.tex >/tmp/book-build.log || { tail -40 /tmp/book-build.log; exit 1; }
xelatex -interaction=nonstopmode main.tex >>/tmp/book-build.log
xelatex -interaction=nonstopmode main.tex >>/tmp/book-build.log
echo "OK -> $(pwd)/main.pdf ($(pdfinfo main.pdf 2>/dev/null | grep Pages))"
