#!/usr/bin/env bash
# ==============================================================================
# Verificación del script de pruebas aisladas (FARM-AUD-014)
#
#   bash tests/infra/check-test-runner.sh
#
# Ejecuta infra/scripts/test-with-ephemeral-db.sh en los escenarios de riesgo y comprueba
# que no deja contenedores, directorios temporales ni procesos de la ejecución, y que no
# toca contenedores ajenos (un señuelo con otra etiqueta debe sobrevivir). Requiere Docker y
# el cliente PostgreSQL 18; tarda unos minutos.
# ==============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNNER="${REPO_ROOT}/infra/scripts/test-with-ephemeral-db.sh"
LABEL_KEY="com.farmacontrol.test-run"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/farmacontrol-runner-check.XXXXXX")"
REAL_DOCKER="$(command -v docker)"
DECOY_NAME="farmacontrol-test-decoy-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
DECOY_LABEL="19990101000000-000000000000"
PASSED=0
FAILED=0

ok() { echo "  ✅ $*"; PASSED=$((PASSED + 1)); }
ko() { echo "  ❌ $*"; FAILED=$((FAILED + 1)); }

finish() {
  # Solo se elimina el señuelo creado aquí (nombre y etiqueta propios)
  local identity
  identity="$("${REAL_DOCKER}" inspect -f "{{.Name}}|{{index .Config.Labels \"${LABEL_KEY}\"}}" "${DECOY_NAME}" 2>/dev/null || true)"
  [ "${identity}" = "/${DECOY_NAME}|${DECOY_LABEL}" ] && "${REAL_DOCKER}" rm -f -v "${DECOY_NAME}" >/dev/null
  rm -rf "${WORK}"
}
trap finish EXIT

run_id_of() { sed -n 's/^\[test-db\] Ejecución \([0-9]\{14\}-[0-9a-f]\{12\}\):.*/\1/p' "$1" | head -1; }

# Comprueba que no quedó nada de la ejecución: contenedor, directorio temporal ni procesos
assert_no_leftovers() {
  local id="$1" label="$2"
  if [ -z "${id}" ]; then
    ko "${label}: no se obtuvo el identificador de ejecución"
    return
  fi
  if [ -n "$("${REAL_DOCKER}" ps -aq --filter "label=${LABEL_KEY}=${id}")" ]; then
    ko "${label}: quedó el contenedor de la ejecución ${id}"
  else
    ok "${label}: sin contenedor remanente"
  fi
  if compgen -G "${TMPDIR:-/tmp}/farmacontrol-test-${id}.*" >/dev/null; then
    ko "${label}: quedó el directorio temporal"
  else
    ok "${label}: sin directorio temporal remanente"
  fi
  sleep 2
  if grep -lsz "FARMACIA_TEST_RUN_ID=${id}" /proc/[0-9]*/environ >/dev/null 2>&1; then
    ko "${label}: quedaron procesos de la ejecución"
  else
    ok "${label}: sin procesos remanentes"
  fi
}

# Arranca el script en segundo plano, espera a Vitest y envía la señal solo al script
signal_scenario() {
  local signal="$1" expected="$2" out="${WORK}/${1}.out" pid start elapsed status ignored
  # Sin control de trabajos bash lanza los comandos en segundo plano con SIGINT ignorado y esa
  # señal ya no podría capturarse: se lanza como trabajo propio, igual que desde una terminal
  set -m
  bash "${RUNNER}" --project @farmacia/api > "${out}" 2>&1 < /dev/null &
  pid=$!
  set +m
  ignored="$(awk '/^SigIgn:/ {print $2}' "/proc/${pid}/status" 2>/dev/null)"
  if [ -n "${ignored}" ] && (( (16#${ignored} & 0x2) != 0 )); then
    ko "SIG${signal}: el script arrancó con SIGINT ignorado (escenario no concluyente)"
  fi
  until grep -q "Ejecutando Vitest" "${out}" 2>/dev/null || ! kill -0 "${pid}" 2>/dev/null; do sleep 1; done
  sleep 5
  start=$(date +%s)
  kill -s "${signal}" "${pid}"
  wait "${pid}"
  status=$?
  elapsed=$(( $(date +%s) - start ))
  [ "${status}" = "${expected}" ] && ok "SIG${signal}: código ${status}" || ko "SIG${signal}: código ${status}, se esperaba ${expected}"
  [ "${elapsed}" -le 30 ] && ok "SIG${signal}: terminó en ${elapsed} s" || ko "SIG${signal}: tardó ${elapsed} s"
  assert_no_leftovers "$(run_id_of "${out}")" "SIG${signal}"
}

echo "== Señuelo de otra ejecución (no debe eliminarse)"
VOLUMES_BEFORE="$("${REAL_DOCKER}" volume ls -q | sort)"
# En tmpfs, como los contenedores del script: sin volumen anónimo para VOLUME /var/lib/postgresql
"${REAL_DOCKER}" create --name "${DECOY_NAME}" --label "${LABEL_KEY}=${DECOY_LABEL}" \
  --tmpfs /var/lib/postgresql postgres:18-alpine >/dev/null \
  && ok "señuelo ${DECOY_NAME} creado"

echo "== 1. Cliente PostgreSQL anterior a 18"
mkdir -p "${WORK}/old-pg"
for tool in pg_dump pg_restore pg_isready psql; do
  printf '#!/usr/bin/env bash\necho "%s (PostgreSQL) 16.4"\n' "${tool}" > "${WORK}/old-pg/${tool}"
  chmod +x "${WORK}/old-pg/${tool}"
done
before="$("${REAL_DOCKER}" ps -aq --filter "label=${LABEL_KEY}" | sort)"
PATH="${WORK}/old-pg:${PATH}" bash "${RUNNER}" > "${WORK}/old-pg.out" 2>&1 < /dev/null
status=$?
after="$("${REAL_DOCKER}" ps -aq --filter "label=${LABEL_KEY}" | sort)"
[ "${status}" = "1" ] && grep -q "se requiere 18" "${WORK}/old-pg.out" \
  && ok "rechazado antes de empezar (código 1)" || ko "código ${status}: $(tail -1 "${WORK}/old-pg.out")"
[ "${before}" = "${after}" ] && ok "no se creó ningún contenedor" || ko "se creó un contenedor"

echo "== 2. docker run crea el contenedor pero falla al iniciarlo"
mkdir -p "${WORK}/fake-docker"
cat > "${WORK}/fake-docker/docker" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "run" ]; then
  shift
  args=()
  for arg in "\$@"; do [ "\${arg}" = "-d" ] || args+=("\${arg}"); done
  "${REAL_DOCKER}" create "\${args[@]}" >/dev/null
  echo "simulado: el contenedor se creó pero no pudo iniciarse" >&2
  exit 125
fi
exec "${REAL_DOCKER}" "\$@"
EOF
chmod +x "${WORK}/fake-docker/docker"
PATH="${WORK}/fake-docker:${PATH}" bash "${RUNNER}" > "${WORK}/partial.out" 2>&1 < /dev/null
status=$?
[ "${status}" != "0" ] && ok "falla con código ${status}" || ko "terminó con código 0"
grep -q "Contenedor temporal eliminado" "${WORK}/partial.out" \
  && ok "el contenedor creado a medias se recuperó por nombre y etiqueta" || ko "no se informó la eliminación"
assert_no_leftovers "$(run_id_of "${WORK}/partial.out")" "creación parcial"

echo "== 3. Vitest falla"
bash "${RUNNER}" --project @farmacia/worker no-existe.spec.ts > "${WORK}/vitest-fail.out" 2>&1 < /dev/null
status=$?
[ "${status}" = "1" ] && ok "propaga el código de Vitest (1)" || ko "código ${status}"
assert_no_leftovers "$(run_id_of "${WORK}/vitest-fail.out")" "fallo de Vitest"

echo "== 4. SIGINT enviado solo al script"
signal_scenario INT 130

echo "== 5. SIGTERM enviado solo al script"
signal_scenario TERM 143

echo "== 6. Ejecución correcta"
bash "${RUNNER}" --project @farmacia/worker > "${WORK}/ok.out" 2>&1 < /dev/null
status=$?
# Sin fijar el número de pruebas: crece con el worker; basta que todas pasen
[ "${status}" = "0" ] && grep -Eq "Tests  [0-9]+ passed" "${WORK}/ok.out" \
  && ! grep -Eq "Tests  .*failed" "${WORK}/ok.out" \
  && ok "worker: pruebas aprobadas (código 0)" || ko "código ${status}"
assert_no_leftovers "$(run_id_of "${WORK}/ok.out")" "ejecución correcta"

echo "== Señuelo"
"${REAL_DOCKER}" inspect "${DECOY_NAME}" >/dev/null 2>&1 \
  && ok "el contenedor de otra ejecución sigue intacto" || ko "el señuelo fue eliminado"

echo "== Volúmenes"
[ "$("${REAL_DOCKER}" volume ls -q | sort)" = "${VOLUMES_BEFORE}" ] \
  && ok "ningún volumen Docker nuevo" || ko "aparecieron volúmenes Docker nuevos"

echo
echo "Resultado: ${PASSED} verificaciones correctas, ${FAILED} fallidas."
[ "${FAILED}" = "0" ]
