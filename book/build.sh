#!/usr/bin/env bash
# Compila el libro con XeLaTeX (dos pasadas + índice). Uso: book/build.sh
set -e
cd "$(dirname "$0")"
xelatex -interaction=nonstopmode -halt-on-error main.tex >/tmp/book-build.log || { tail -40 /tmp/book-build.log; exit 1; }
xelatex -interaction=nonstopmode main.tex >>/tmp/book-build.log
xelatex -interaction=nonstopmode main.tex >>/tmp/book-build.log
# Versión ligera para publicar (GitHub no previsualiza PDF muy grandes): imágenes a JPEG de 220 ppp
gs -q -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dCompatibilityLevel=1.6 -dDownsampleColorImages=true -dColorImageDownsampleType=/Bicubic -dColorImageResolution=220 -dAutoFilterColorImages=false -dColorImageFilter=/DCTEncode -dJPEGQ=88 -dDownsampleGrayImages=true -dGrayImageResolution=220 -dDetectDuplicateImages=true -sOutputFile=../ebook/Manual-del-usuario-de-REM.pdf main.pdf && echo "ebook ligero -> ../ebook/Manual-del-usuario-de-REM.pdf ($(du -h ../ebook/Manual-del-usuario-de-REM.pdf | cut -f1))"
echo "OK -> $(pwd)/main.pdf ($(pdfinfo main.pdf 2>/dev/null | grep Pages))"
