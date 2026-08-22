# ============================================================
#  4Elements — הקמת סביבת עבודה מסודרת
#  להריץ פעם אחת ב-PowerShell:  .\setup-workspace.ps1
#  בטוח להריץ שוב — לא מוחק כלום, רק משלים מה שחסר.
# ============================================================

$Root = "C:\Users\Admin\4Elements"
$Repo = "$Root\repo"
$RepoUrl = "https://github.com/nir9750a-spec/landed-cost.git"

Write-Host "`n=== מקים את $Root ===`n" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $Root | Out-Null

# --- 1. הריפו המרכזי (מקור האמת היחיד) ---
if (Test-Path "$Repo\.git") {
    Write-Host "[=] הריפו קיים — מרענן" -ForegroundColor Yellow
    git -C $Repo fetch origin --prune
} else {
    Write-Host "[+] מוריד את הריפו" -ForegroundColor Green
    git clone $RepoUrl $Repo
}

# --- 2. תיקייה לכל פרויקט = worktree של הענף שלו ---
#     כל תיקייה עומדת בפני עצמה, אבל הכול מגובה באותו ריפו.
$Projects = @(
    @{ Dir = "01-אפליקציה";   Branch = "main" },
    @{ Dir = "02-פרסום";      Branch = "claude/daily-conversation-connection-n8ezyf" },
    @{ Dir = "03-ניהול-העסק"; Branch = "claude/israeli-import-agent-3feuk2" },
    @{ Dir = "04-ניהול-מחשב"; Branch = "claude/higgsfield-setup-0ot7ac" }
)

foreach ($p in $Projects) {
    $path = "$Root\$($p.Dir)"
    if (Test-Path $path) {
        Write-Host "[=] $($p.Dir) קיים — מושך עדכונים" -ForegroundColor Yellow
        git -C $path pull --ff-only 2>$null
    } else {
        Write-Host "[+] יוצר $($p.Dir)  ->  $($p.Branch)" -ForegroundColor Green
        git -C $Repo worktree add $path $p.Branch
    }
}

# --- 3. תיקיות שאינן בגיט ---
$Plain = @{
    "05-קטלוג"   = "סקריפטי בניית הקטלוג. מסתנכרן ל-Drive דרך G:"
    "06-סודות"   = "ads/.env וכל מפתח API. לעולם לא לגיט! לגבות לכספת/מנהל סיסמאות."
    "07-תמונות"  = "תמונות אישיות לאווטארים. לא לגיט (הריפו ציבורי)."
    "99-ארכיון"  = "דברים ישנים שלא רוצים למחוק."
}
foreach ($k in $Plain.Keys) {
    $path = "$Root\$k"
    New-Item -ItemType Directory -Force -Path $path | Out-Null
    if (-not (Test-Path "$path\קרא-אותי.txt")) {
        $Plain[$k] | Out-File -FilePath "$path\קרא-אותי.txt" -Encoding utf8
    }
    Write-Host "[+] $k" -ForegroundColor Green
}

# --- 4. קיצור דרך ל-Drive ---
if ((Test-Path "G:\") -and -not (Test-Path "$Root\08-Drive")) {
    cmd /c mklink /D "$Root\08-Drive" "G:\האחסון שלי" 2>$null | Out-Null
    Write-Host "[+] 08-Drive -> G:" -ForegroundColor Green
}

# --- 5. מפת הכל בשורש ---
Copy-Item "$Root\01-אפליקציה\PROJECTS.md" "$Root\00-קרא-אותי-קודם.md" -Force -EA SilentlyContinue

Write-Host "`n=== מוכן ===" -ForegroundColor Cyan
Write-Host "פתח את $Root\00-קרא-אותי-קודם.md כדי לראות את המפה."
Write-Host "להרצת בדיקת מצב:  .\repo\tools\status.ps1`n"
