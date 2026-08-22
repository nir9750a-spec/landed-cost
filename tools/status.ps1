# ============================================================
#  "האם זה בוצע?" — בדיקת מצב יומית
#  להריץ:  .\status.ps1
#  עונה על: מה עודכן מתי · מה לא נדחף · מה תקוע
# ============================================================

$Root = "C:\Users\Admin\4Elements"
$Now  = Get-Date

Write-Host "`n================ מצב 4Elements ================" -ForegroundColor Cyan
Write-Host ("נכון ל: " + $Now.ToString("dd.MM.yyyy HH:mm")) -ForegroundColor Gray
Write-Host ""

$Projects = @("01-אפליקציה","02-פרסום","03-ניהול-העסק","04-ניהול-מחשב")

foreach ($p in $Projects) {
    $path = "$Root\$p"
    if (-not (Test-Path "$path")) { Write-Host "[?] $p — לא קיים. הרץ setup-workspace.ps1" -ForegroundColor DarkGray; continue }

    $last    = git -C $path log -1 --format="%ad|%s" --date=iso 2>$null
    if (-not $last) { continue }
    $parts   = $last -split '\|',2
    $when    = [datetime]::Parse($parts[0])
    $days    = [math]::Floor(($Now - $when).TotalDays)
    $dirty   = (git -C $path status --porcelain 2>$null | Measure-Object).Count
    $ahead   = (git -C $path rev-list '@{u}..HEAD' --count 2>$null)
    if (-not $ahead) { $ahead = 0 }

    # צבע לפי גיל
    $color = if ($days -le 2) { "Green" } elseif ($days -le 7) { "Yellow" } else { "Red" }
    Write-Host ("{0,-16} " -f $p) -NoNewline
    Write-Host ("לפני {0} ימים" -f $days) -ForegroundColor $color -NoNewline
    Write-Host ("   {0}" -f $parts[1])

    if ($dirty -gt 0) { Write-Host ("      !! $dirty קבצים לא שמורים בגיט") -ForegroundColor Red }
    if ($ahead -gt 0) { Write-Host ("      !! $ahead קומיטים לא נדחפו ל-GitHub") -ForegroundColor Red }
}

# --- גיבוי הסודות ---
Write-Host ""
$env_ok = Test-Path "$Root\06-סודות\.env"
if ($env_ok) { Write-Host "[v] קובץ סודות קיים" -ForegroundColor Green }
else         { Write-Host "[X] אין 06-סודות\.env — הפרסום לא יעבוד" -ForegroundColor Red }

# --- אוטומציות: מה שאי אפשר לבדוק מכאן ---
Write-Host "`n--- אוטומציות (בדיקה ידנית) ---" -ForegroundColor Cyan
Write-Host "1. Make Publisher   https://eu1.make.com/1499942/scenarios/6869166"
Write-Host "   -> 'Scheduling' חייב להיות ON. אם OFF = אפס פרסומים."
Write-Host "2. Make Reels       https://eu1.make.com/1499942/scenarios/6903724"
Write-Host "3. Routines         סרגל Routines באפליקציית Claude"
Write-Host "4. חיבור Meta       פג תוקף 07.10.2026 — לחדש לפני!"
Write-Host ""
Write-Host "כלל אצבע: אם פרסום רץ — נוצר קומיט ב-02-פרסום." -ForegroundColor Yellow
Write-Host "אין קומיט חדש = לא רץ, לא משנה מה הלוח אומר.`n" -ForegroundColor Yellow
