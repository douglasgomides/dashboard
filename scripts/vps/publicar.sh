#!/usr/bin/env bash
# Publicação do Nexo por seção na VPS (serviço Docker "doctor-creator-hub", atrás de nexo, dash e sap).
#
#   scripts/vps/publicar.sh --conferir   só lê: imagem no ar, commit de vps/producao, /healthz dos 3 domínios e o
#                                        tamanho da chave publicável no pacote servido. Termina com "conferir: ok"
#                                        só quando tudo bate. Não escreve nada em lugar nenhum da VPS.
#   scripts/vps/publicar.sh --publicar   junta o commit atual em vps/producao, constrói a imagem nova na VPS, confere a
#                                        chave antes de trocar, troca só o serviço do Nexo e volta sozinho para a
#                                        imagem anterior se a conferência depois da troca falhar.
#   (sem opção)                          só mostra esta ajuda.
#
# A chave publicável (VITE_SUPABASE_PUBLISHABLE_KEY) é lida do pacote que já está no ar, com a regra de 10 ou mais
# caracteres depois de "sb_publishable_" (o texto solto "sb_publishable_" existe no código da biblioteca do Supabase e
# sairia vazio, o que derrubou o login em 10/11/2026). O valor da chave nunca é impresso: só o tamanho.
#
# O que este script NUNCA faz: desligar ou reiniciar a máquina, o Docker ou outro serviço, apagar imagens antigas, nem
# mexer em n8n, Evolution ou EasyPanel. Só a troca da imagem do serviço do Nexo.
set -euo pipefail

SERVIDOR="hermes-vps"                      # alias do ssh
SERVICO="doctor-creator-hub"               # serviço Docker Swarm do Nexo
RAMO="vps/producao"                        # ramo que a VPS publica
DOMINIO_BASE="doctorcreator.com.br"
DOMINIOS="nexo dash sap"                   # /healthz precisa dar 200 nos 3
TAMANHO_MINIMO_CHAVE=30                    # a chave publicável tem mais que isto
PASTA_NA_VPS="/opt/doctor-creator-hub-publicacoes"   # só para o código desta publicação (some no fim)
TRAVA_NA_VPS="/var/lock/doctor-creator-hub-publicar.lock"
ESPERA_SEGUNDOS=120                        # quanto esperar o site responder depois da troca
TMP_PUBLICAR=""                            # pasta temporária desta publicação (limpa na saída)

ajuda() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
}

falha() {
  echo "ERRO: $*" >&2
  exit 1
}

# Remove só a pasta temporária desta publicação (a worktree que junta o commit em vps/producao).
limpar_tmp() {
  [ -n "$TMP_PUBLICAR" ] || return 0
  git worktree remove --force "$TMP_PUBLICAR/wt" >/dev/null 2>&1 || true
  rm -rf -- "$TMP_PUBLICAR"
}

# ---------- leitura (usada por --conferir e por --publicar) ----------

# Imagem em uso pelo serviço (sem o resumo sha256 que o Docker acrescenta).
imagem_no_ar() {
  ssh -o BatchMode=yes -o ConnectTimeout=20 "$SERVIDOR" \
    "docker service inspect $SERVICO --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'" | sed 's/@sha256:.*$//'
}

# Último commit de origin/vps/producao (só lê o GitHub; atualiza apenas a referência local).
sha_de_producao() {
  git fetch --quiet origin "$RAMO"
  git rev-parse --verify "origin/$RAMO"
}

# Código HTTP de /healthz num dos domínios (000 quando não responde).
healthz_de() {
  curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$1.$DOMINIO_BASE/healthz" || true
}

# Chaves publicáveis achadas no pacote principal servido por nexo (uma por linha, sem repetir). Vazio = não achou.
chaves_do_pacote_servido() {
  local pagina script
  pagina=$(curl -fsS -m 20 "https://nexo.$DOMINIO_BASE/") || return 0
  script=$(printf '%s' "$pagina" | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)
  [ -n "$script" ] || return 0
  curl -fsS -m 90 "https://nexo.$DOMINIO_BASE$script" | LC_ALL=C grep -o 'sb_publishable_[A-Za-z0-9_-]\{10,\}' | sort -u || true
}

# A tag da imagem termina com o começo do commit (7 a 12 caracteres)?
tag_e_do_commit() {
  local tag="$1" sha="$2" sufixo
  sufixo="${tag##*:}"
  [ -n "$sufixo" ] || return 1
  case "$sha" in
    "$sufixo"*) return 0 ;;
  esac
  return 1
}

conferir() {
  local ok=1 tag sha dom codigo chaves quantas tamanho
  tag=$(imagem_no_ar) || falha "não consegui ler a imagem no ar pelo ssh ($SERVIDOR)."
  echo "imagem no ar: $tag"
  sha=$(sha_de_producao) || falha "não consegui ler origin/$RAMO."
  echo "vps/producao: ${sha:0:12}"
  for dom in $DOMINIOS; do
    codigo=$(healthz_de "$dom")
    echo "healthz $dom: $codigo"
    [ "$codigo" = "200" ] || ok=0
  done
  chaves=$(chaves_do_pacote_servido)
  quantas=$(printf '%s' "$chaves" | grep -c . || true)
  if [ "$quantas" = "1" ]; then
    tamanho=${#chaves}
    echo "chave publicável no pacote servido: $tamanho caracteres"
    [ "$tamanho" -gt "$TAMANHO_MINIMO_CHAVE" ] || ok=0
  else
    echo "chave publicável no pacote servido: $quantas candidatas (era para ser 1)"
    ok=0
  fi
  if tag_e_do_commit "$tag" "$sha"; then
    echo "a imagem no ar é a do último commit de $RAMO"
  else
    echo "a imagem no ar NÃO é a do último commit de $RAMO"
    ok=0
  fi
  if [ "$ok" = "1" ]; then
    echo "conferir: ok"
  else
    echo "conferir: falhou"
    return 1
  fi
}

# ---------- publicação ----------

# Script que roda na VPS (recebido pela entrada do ssh). As variáveis chegam por um cabeçalho gerado aqui.
corpo_remoto() {
  cat <<'REMOTO'
set -euo pipefail
exec 9>"$TRAVA"
if ! flock -n 9; then echo "ERRO: outra publicação está em andamento." >&2; exit 3; fi
ANTERIOR=$(docker service inspect "$SERVICO" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' | sed 's/@sha256:.*$//')
[ -n "$ANTERIOR" ] || { echo "ERRO: não achei a imagem no ar." >&2; exit 4; }
echo "ANTERIOR=$ANTERIOR"
DIR="$PASTA/$SHA12"
mkdir -p "$DIR"
tar -xf "$PASTA/$SHA12.tar" -C "$DIR"
cd "$DIR"
export VITE_SUPABASE_URL="$URL" VITE_SUPABASE_PUBLISHABLE_KEY="$CHAVE" VITE_LINK_BASE_URL="$LINK"
docker build --build-arg VITE_SUPABASE_URL --build-arg VITE_SUPABASE_PUBLISHABLE_KEY --build-arg VITE_LINK_BASE_URL \
  -t "doctor-creator-hub:$SHA12" . </dev/null
echo "IMAGEM_CONSTRUIDA=doctor-creator-hub:$SHA12"
export CHAVE
if ! docker run --rm --entrypoint sh -e CHAVE "doctor-creator-hub:$SHA12" -c 'grep -rlF -- "$CHAVE" /app/dist > /dev/null' </dev/null; then
  echo "ERRO: a imagem nova não tem a chave publicável; nada foi trocado." >&2
  exit 5
fi
echo "CHAVE_NA_IMAGEM=ok"
cd /
rm -f -- "$PASTA/$SHA12.tar"
case "$DIR" in "$PASTA"/[0-9a-f]*) rm -rf -- "$DIR" ;; esac
docker service update --image "doctor-creator-hub:$SHA12" "$SERVICO" </dev/null
echo "TROCADO=doctor-creator-hub:$SHA12"
REMOTO
}

# Espera os 3 domínios responderem 200 em /healthz (até ESPERA_SEGUNDOS).
esperar_healthz() {
  local limite=$((SECONDS + ESPERA_SEGUNDOS)) dom codigo tudo
  while :; do
    tudo=1
    for dom in $DOMINIOS; do
      codigo=$(healthz_de "$dom")
      [ "$codigo" = "200" ] || tudo=0
    done
    [ "$tudo" = "1" ] && return 0
    [ "$SECONDS" -lt "$limite" ] || return 1
    sleep 5
  done
}

# Volta o serviço para a imagem anterior (só troca a imagem; não mexe em mais nada).
voltar_para() {
  local anterior="$1"
  echo "VOLTANDO para a imagem anterior: $anterior" >&2
  ssh -o BatchMode=yes -o ConnectTimeout=20 "$SERVIDOR" "docker service update --image $anterior $SERVICO" </dev/null
}

publicar() {
  command -v git >/dev/null || falha "git não encontrado."

  # (a) árvore sem mudança sem commit
  [ -z "$(git status --porcelain)" ] || falha "a árvore local tem mudança sem commit. Faça o commit antes de publicar."

  # (b) o commit que vai ao ar é o HEAD (vale na branch e na worktree de um executor)
  local sha sha12
  sha=$(git rev-parse HEAD)
  sha12=${sha:0:12}

  # Dados públicos do build, lidos do que já está no ar. O valor da chave nunca é impresso.
  local chaves quantas chave url link
  chaves=$(chaves_do_pacote_servido)
  quantas=$(printf '%s' "$chaves" | grep -c . || true)
  [ "$quantas" = "1" ] || falha "achei $quantas chaves publicáveis no pacote servido (era para ser 1). Nada foi feito."
  chave="$chaves"
  [ "${#chave}" -gt "$TAMANHO_MINIMO_CHAVE" ] || falha "a chave publicável achada tem ${#chave} caracteres (precisa passar de $TAMANHO_MINIMO_CHAVE). Nada foi feito."
  echo "chave publicável: ${#chave} caracteres"

  url="${NEXO_VITE_SUPABASE_URL:-}"
  link="${NEXO_VITE_LINK_BASE_URL:-}"
  local atual hist
  atual=$(imagem_no_ar) || falha "não consegui ler a imagem no ar pelo ssh ($SERVIDOR)."
  hist=$(ssh -o BatchMode=yes -o ConnectTimeout=20 "$SERVIDOR" "docker history --no-trunc --format '{{.CreatedBy}}' $atual" </dev/null || true)
  [ -n "$url" ] || url=$(printf '%s' "$hist" | grep -o 'VITE_SUPABASE_URL=[^ ]*' | head -1 | cut -d= -f2- || true)
  [ -n "$link" ] || link=$(printf '%s' "$hist" | grep -o 'VITE_LINK_BASE_URL=[^ ]*' | head -1 | cut -d= -f2- || true)
  [ -n "$url" ] || falha "não achei VITE_SUPABASE_URL na imagem no ar. Passe NEXO_VITE_SUPABASE_URL=... e tente de novo."
  [ -n "$link" ] || falha "não achei VITE_LINK_BASE_URL na imagem no ar. Passe NEXO_VITE_LINK_BASE_URL=... e tente de novo."

  # (c) juntar em vps/producao numa worktree temporária e empurrar; conflito para tudo sem publicar
  local tmp novo
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/publicar-nexo-XXXXXX")
  TMP_PUBLICAR="$tmp"
  trap limpar_tmp EXIT
  git fetch --quiet origin "$RAMO"
  git worktree add --quiet --detach "$tmp/wt" "origin/$RAMO"
  if ! git -C "$tmp/wt" merge --no-edit -m "Merge $sha12 em $RAMO (publicar.sh)" "$sha" >/dev/null; then
    git -C "$tmp/wt" merge --abort >/dev/null 2>&1 || true
    falha "conflito ao juntar $sha12 em $RAMO. Nada foi publicado."
  fi
  novo=$(git -C "$tmp/wt" rev-parse HEAD)
  git -C "$tmp/wt" push --quiet origin "HEAD:refs/heads/$RAMO"
  echo "vps/producao agora em ${novo:0:12}"
  local tag="doctor-creator-hub:${novo:0:12}"

  # (d) o código chega à VPS como um arquivo do commit (não depende de credencial do GitHub na VPS) e o resto roda
  # dentro de uma trava (uma publicação por vez).
  git archive --format=tar "$novo" | ssh -o BatchMode=yes "$SERVIDOR" "mkdir -p $PASTA_NA_VPS && cat > $PASTA_NA_VPS/${novo:0:12}.tar"
  local cabecalho log
  cabecalho=$(printf 'SHA12=%q\nURL=%q\nCHAVE=%q\nLINK=%q\nSERVICO=%q\nPASTA=%q\nTRAVA=%q\n' "${novo:0:12}" "$url" "$chave" "$link" "$SERVICO" "$PASTA_NA_VPS" "$TRAVA_NA_VPS")
  log="$tmp/remoto.log"
  : > "$log"
  if ! { printf '%s\n' "$cabecalho"; corpo_remoto; } | ssh -o BatchMode=yes "$SERVIDOR" 'bash -s' 2>&1 | tee "$log"; then
    # Se o serviço chegou a trocar de imagem, volta. Se não, nada mudou.
    local anterior agora
    anterior=$(grep '^ANTERIOR=' "$log" | head -1 | cut -d= -f2- || true)
    agora=$(imagem_no_ar || true)
    if [ -n "$anterior" ] && [ -n "$agora" ] && [ "$agora" != "$anterior" ]; then
      voltar_para "$anterior"
      falha "a publicação falhou e o serviço voltou para $anterior."
    fi
    falha "a publicação falhou antes da troca; o serviço continua em ${agora:-a imagem anterior}."
  fi
  local anterior_ok
  anterior_ok=$(grep '^ANTERIOR=' "$log" | head -1 | cut -d= -f2- || true)
  [ -n "$anterior_ok" ] || falha "a troca foi feita, mas não li a imagem anterior no registro da VPS; confira o serviço à mão."

  # conferência depois da troca: 3 domínios e a chave no pacote servido; senão volta sozinho
  local falhou=0 novas
  esperar_healthz || { echo "depois da troca: /healthz não deu 200 nos 3 domínios." >&2; falhou=1; }
  if [ "$falhou" = "0" ]; then
    novas=$(chaves_do_pacote_servido)
    if [ "$novas" != "$chave" ]; then
      echo "depois da troca: a chave publicável do pacote servido não bate com a esperada." >&2
      falhou=1
    fi
  fi
  if [ "$falhou" = "1" ]; then
    voltar_para "$anterior_ok"
    falha "a conferência depois da troca falhou; o serviço voltou para $anterior_ok."
  fi

  # (e)
  echo "publicado: $tag"
}

case "${1:-}" in
  --conferir) conferir ;;
  --publicar) publicar ;;
  *) ajuda ;;
esac
