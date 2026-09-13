#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Importly — סקריפט הפעלה אוטומטי (Mac / Linux)
#
#  מסנכרן קוד מ-GitHub, מריץ npm install, פותח את המדריך, ומציע להפעיל.
#
#  איך מריצים:
#    bash SETUP/setup.sh
# ═══════════════════════════════════════════════════════════════════════════
set -e

BRANCH="claude/israeli-import-agent-3feuk2"
REPO="https://github.com/nir9750a-spec/landed-cost.git"

green() { printf "\033[32m  [OK] %s\033[0m\n" "$1"; }
warn()  { printf "\033[33m  [!]  %s\033[0m\n" "$1"; }
fail()  { printf "\033[31m  [X]  %s\033[0m\n" "$1"; }

echo ""
echo "═══════════════════════════════════════════"
echo "   Importly — הפעלה אוטומטית"
echo "═══════════════════════════════════════════"
echo ""

# 1. כלים
echo "1/5  בודק כלים..."
command -v node >/dev/null 2>&1 && green "Node $(node --version)" || { fail "Node.js לא מותקן — https://nodejs.org"; exit 1; }
command -v git  >/dev/null 2>&1 && green "Git $(git --version | sed 's/git version //')" || { fail "Git לא מותקן — https://git-scm.com"; exit 1; }

# 2. סנכרון מאגר
echo ""
echo "2/5  מסנכרן קוד מ-GitHub..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
if [ ! -d "$REPO_ROOT/.git" ]; then
  REPO_ROOT="$HOME/landed-cost"
  if [ ! -d "$REPO_ROOT/.git" ]; then
    echo "  משכפל אל $REPO_ROOT ..."
    git clone "$REPO" "$REPO_ROOT"
  fi
fi
cd "$REPO_ROOT"
echo "  מאגר: $REPO_ROOT"
git fetch origin "$BRANCH" >/dev/null 2>&1
if [ -n "$(git status --porcelain)" ]; then
  warn "יש שינויים מקומיים לא-שמורים — מדלג על reset."
  git checkout "$BRANCH" >/dev/null 2>&1 || true
else
  git checkout "$BRANCH" >/dev/null 2>&1 || true
  git reset --hard "origin/$BRANCH" >/dev/null 2>&1
  green "מסונכרן לגרסה העדכנית"
fi

# 3. התקנה
echo ""
echo "3/5  מתקין תלויות (npm install)..."
npm install --no-audit --no-fund || npm install --legacy-peer-deps --no-audit --no-fund
green "הותקן"

# 4. פתיחת המדריך
echo ""
echo "4/5  המדריך: $REPO_ROOT/SETUP/START_HERE.md"
if command -v open >/dev/null 2>&1; then open "$REPO_ROOT/SETUP/START_HERE.md" || true
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$REPO_ROOT/SETUP/START_HERE.md" || true; fi

# 5. הרצה
echo ""
echo "═══════════════════════════════════════════"
green "הכול מוכן!"
warn "תזכורת: הגדר ANTHROPIC_API_KEY ב-Supabase והרץ את 2 המיגרציות — פרטים ב-START_HERE.md"
echo ""
read -r -p "5/5  להריץ את האפליקציה עכשיו? (npm start) [y/N] " run
if [ "$run" = "y" ] || [ "$run" = "Y" ]; then
  echo "  מפעיל... http://localhost:3000 (Ctrl+C לעצירה)"
  npm start
else
  echo ""
  echo "  להפעלה מאוחר יותר:  cd \"$REPO_ROOT\"  &&  npm start"
  echo ""
fi
