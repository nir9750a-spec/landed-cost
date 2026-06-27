#!/usr/bin/env bash
# One-shot deploy for the Seasonal Product Agent backend.
# Run from the repo root on a machine with the Supabase CLI + network access.
#
#   bash scripts/deploy-agent.sh
#
# Prereqs (once):
#   - supabase CLI installed:  https://supabase.com/docs/guides/cli
#   - logged in + linked:      supabase login && supabase link --project-ref eginihtpqahpejnkqznn
#   - secrets set (see below)

set -euo pipefail

PROJECT_REF="eginihtpqahpejnkqznn"

echo "▶ 1/4  Verifying Supabase CLI..."
command -v supabase >/dev/null || { echo "✗ supabase CLI not found. Install: https://supabase.com/docs/guides/cli"; exit 1; }

echo "▶ 2/4  Checking secrets (ANTHROPIC_API_KEY required, HUNTER_API_KEY optional)..."
if ! supabase secrets list 2>/dev/null | grep -q ANTHROPIC_API_KEY; then
  echo "  ⚠ ANTHROPIC_API_KEY not set. Set it now:"
  echo "      supabase secrets set ANTHROPIC_API_KEY=sk-ant-..."
  echo "  (HUNTER_API_KEY is optional — enables verified email enrichment.)"
fi

echo "▶ 3/4  Pushing DB migrations (cache + rate-limit tables)..."
supabase db push

echo "▶ 4/4  Deploying edge functions..."
supabase functions deploy seasonal-agent
supabase functions deploy contact-enrich

echo "✓ Done. The page is live at:  https://<your-domain>/seasonal-agent.html"
echo "  (Static demo always works at: .../seasonal-agent.html?demo=1)"
