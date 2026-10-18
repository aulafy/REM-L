#!/bin/bash
# Instala (la primera vez) y arranca Hindsight en local, con Ollama como modelo y escuchando SOLO en 127.0.0.1.
# Uso: scripts/start-hindsight.sh [modelo-ollama]   (por defecto: el primero que tengas instalado)
set -e
DIR="$HOME/hindsight-local"; MODEL="${1:-$(curl -s localhost:11434/api/tags | python3 -c "import sys,json;print(json.load(sys.stdin)['models'][0]['name'])")}"
command -v uv >/dev/null || { echo "Necesitas uv (https://docs.astral.sh/uv/)"; exit 1; }
mkdir -p "$DIR"; cd "$DIR"
[ -x .venv/bin/hindsight-api ] || { uv venv --python 3.12 .venv && VIRTUAL_ENV=.venv uv pip install hindsight-api; }
echo "Hindsight con el modelo $MODEL en http://127.0.0.1:8888"
HINDSIGHT_API_LLM_PROVIDER=ollama HINDSIGHT_API_LLM_BASE_URL=http://localhost:11434/v1 HINDSIGHT_API_LLM_MODEL="$MODEL" HINDSIGHT_API_LLM_TIMEOUT=300 \
  exec .venv/bin/hindsight-api --host 127.0.0.1 --port 8888
