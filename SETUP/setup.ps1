# ═══════════════════════════════════════════════════════════════════════════
#  Importly — סקריפט הפעלה אוטומטי (Windows / PowerShell)
#
#  מה הוא עושה:
#    1. בודק ש-Node ו-Git מותקנים
#    2. מסנכרן את הקוד לגרסה העדכנית מ-GitHub (מקור האמת)
#    3. מריץ npm install
#    4. פותח את המדריך START_HERE.md
#    5. שואל אם להריץ את האפליקציה (npm start)
#
#  איך מריצים (פעם ראשונה צריך לאשר הרצת סקריפטים):
#    powershell -ExecutionPolicy Bypass -File .\SETUP\setup.ps1
# ═══════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$BRANCH = "claude/israeli-import-agent-3feuk2"
$REPO   = "https://github.com/nir9750a-spec/landed-cost.git"

function Say($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Ok($msg)   { Say "  [OK] $msg" "Green" }
function Warn($msg) { Say "  [!]  $msg" "Yellow" }
function Fail($msg) { Say "  [X]  $msg" "Red" }

Say ""
Say "═══════════════════════════════════════════" "Cyan"
Say "   Importly — הפעלה אוטומטית" "Cyan"
Say "═══════════════════════════════════════════" "Cyan"
Say ""

# ── 1. בדיקת כלים ─────────────────────────────────────────────────────────────
Say "1/5  בודק כלים..." "White"
$nodeOk = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
$gitOk  = $null -ne (Get-Command git  -ErrorAction SilentlyContinue)

if ($nodeOk) { Ok ("Node " + (node --version)) } else { Fail "Node.js לא מותקן — הורד מ-https://nodejs.org (LTS) והרץ שוב" }
if ($gitOk)  { Ok ("Git "  + ((git --version) -replace 'git version ','')) } else { Fail "Git לא מותקן — הורד מ-https://git-scm.com והרץ שוב" }
if (-not ($nodeOk -and $gitOk)) { Say ""; Fail "חסרים כלים. התקן אותם ונסה שוב."; exit 1 }

# ── 2. איתור / סנכרון המאגר ───────────────────────────────────────────────────
Say ""
Say "2/5  מסנכרן קוד מ-GitHub..." "White"

# הסקריפט יושב ב-<repo>\SETUP — שורש המאגר הוא תיקיית האב.
$repoRoot = Split-Path -Parent $PSScriptRoot
$insideRepo = Test-Path (Join-Path $repoRoot ".git")

if (-not $insideRepo) {
  # לא בתוך מאגר — נשכפל לתיקייה חדשה תחת הבית.
  $repoRoot = Join-Path $HOME "landed-cost"
  if (Test-Path (Join-Path $repoRoot ".git")) {
    Ok "נמצא מאגר קיים ב-$repoRoot"
  } else {
    Say "  משכפל אל $repoRoot ..." "Gray"
    git clone $REPO $repoRoot
    Ok "שוכפל"
  }
}

Set-Location $repoRoot
Say "  מאגר: $repoRoot" "Gray"

git fetch origin $BRANCH 2>&1 | Out-Null
# יישור מלא לענף המרוחק (מקור האמת). מבטל שינויים מקומיים לא-שמורים.
$dirty = git status --porcelain
if ($dirty) { Warn "יש שינויים מקומיים לא-שמורים — מדלג על reset כדי לא לאבד אותם."; git checkout $BRANCH 2>&1 | Out-Null }
else { git checkout $BRANCH 2>&1 | Out-Null; git reset --hard "origin/$BRANCH" 2>&1 | Out-Null; Ok "מסונכרן לגרסה העדכנית" }

# ── 3. התקנת תלויות ───────────────────────────────────────────────────────────
Say ""
Say "3/5  מתקין תלויות (npm install)... זה יכול לקחת דקה-שתיים" "White"
try { npm install --no-audit --no-fund; Ok "הותקן" }
catch { Warn "npm install נכשל — מנסה עם --legacy-peer-deps"; npm install --legacy-peer-deps --no-audit --no-fund; Ok "הותקן" }

# ── 4. פתיחת המדריך ───────────────────────────────────────────────────────────
Say ""
Say "4/5  פותח את המדריך..." "White"
$guide = Join-Path $repoRoot "SETUP\START_HERE.md"
if (Test-Path $guide) { Invoke-Item $guide; Ok "START_HERE.md נפתח" } else { Warn "לא נמצא START_HERE.md" }

# ── 5. הרצה ───────────────────────────────────────────────────────────────────
Say ""
Say "═══════════════════════════════════════════" "Cyan"
Ok "הכול מוכן!"
Say ""
Warn "תזכורת: להפעלה מלאה ודא ב-Supabase שהוגדר ANTHROPIC_API_KEY,"
Warn "ושהרצת את 2 המיגרציות (20260711_finance, 20260712_inventory) — פרטים ב-START_HERE.md"
Say ""
$run = Read-Host "5/5  להריץ את האפליקציה עכשיו? (npm start) [y/N]"
if ($run -eq "y" -or $run -eq "Y") {
  Say "  מפעיל... הדפדפן ייפתח ב-http://localhost:3000 (Ctrl+C לעצירה)" "Gray"
  npm start
} else {
  Say ""
  Say "  להפעלה מאוחר יותר:  cd `"$repoRoot`"  ואז  npm start" "Gray"
  Say ""
}
