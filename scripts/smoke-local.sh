#!/usr/bin/env bash
# Run after npm run build. Requires a local PostgreSQL user with CREATEDB and Playwright Chromium.
set -euo pipefail
cd "$(dirname "$0")/.."
base=${DATABASE_URL:-$(node --env-file=.env -p 'process.env.DATABASE_URL')}
scratchdb="mma_smoke_${RANDOM}_${RANDOM}"
createdb --maintenance-db="$base" "$scratchdb"
server_pid=''
fixture=$(mktemp --suffix=.xlsx)
cleanup(){
  if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  dropdb --if-exists --force --maintenance-db="$base" "$scratchdb" >/dev/null
  rm -f "$fixture"
}
trap cleanup EXIT
export DATABASE_URL=$(node -e 'const u=new URL(process.argv[1]); u.pathname="/"+process.argv[2]; console.log(u.href)' "$base" "$scratchdb")
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/postgresql.sql >/tmp/mma-sql-smoke.log
export MMA_ADMIN_USERNAME=qa.admin MMA_ADMIN_NAME='Workspace QA Administrator'
export MMA_ADMIN_PASSWORD=$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("base64url"))')
export MMA_SAMPLE_PASSWORD=$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("base64url"))')
export MMA_RFID_SECRET=$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')
export MMA_FACE_SECRET=$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')
npm exec tsx -- scripts/setup.ts --sample
python3 - "$fixture" <<'PY'
from zipfile import ZipFile, ZIP_DEFLATED
import sys
content = {'[Content_Types].xml': '''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>''','_rels/.rels': '''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>''','xl/workbook.xml': '''<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Students" sheetId="1" r:id="rId1"/></sheets></workbook>''','xl/_rels/workbook.xml.rels': '''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'''}
rows = [['Student ID','First Name','Last Name','Course','Year Level','House'],['QA-XLS-01','Excel','Import','Test department','2','Red House']]
body=''.join(f'<row r="{n}">'+''.join(f'<c r="{chr(65+i)}{n}" t="inlineStr"><is><t>{v}</t></is></c>' for i,v in enumerate(r))+'</row>' for n,r in enumerate(rows,1))
content['xl/worksheets/sheet1.xml']=f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:F2"/><sheetData>{body}</sheetData></worksheet>'
with ZipFile(sys.argv[1],'w',ZIP_DEFLATED) as worksheet:
 for path,xml in content.items(): worksheet.writestr(path,xml)
PY
export MMA_XLSX_FIXTURE="$fixture"
export MMA_PLAYWRIGHT_PATH=${MMA_PLAYWRIGHT_PATH:-$(find "$HOME/.npm/_npx" -path '*/node_modules/playwright/index.mjs' -print -quit 2>/dev/null || true)}
port=${MMA_TEST_PORT:-3210}
export MMA_TEST_URL="http://127.0.0.1:$port" APP_ORIGIN="http://127.0.0.1:$port"
server_log="/tmp/mma-smoke-server-$port.log"
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$port" >"$server_log" 2>&1 & server_pid=$!
for i in $(seq 1 40); do
  if ! kill -0 "$server_pid" 2>/dev/null; then cat "$server_log"; exit 1; fi
  if curl -fsS "$MMA_TEST_URL/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
curl -fsS "$MMA_TEST_URL/api/health"; echo
suite=scripts/smoke.mjs
if [ "${MMA_SUITE:-}" = attendance ]; then suite=scripts/attendance-smoke.mjs; fi
node "$suite" || { cat "$server_log"; exit 1; }
