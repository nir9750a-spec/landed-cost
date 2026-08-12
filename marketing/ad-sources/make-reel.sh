#!/usr/bin/env bash
# make-reel.sh — turn a static ad into a free 9:16 Reel (Ken Burns zoom + text fade-in).
# Usage: ./make-reel.sh <bg.png 1080x1920> <fg.png 1080x1920 transparent> <out.mp4>
# bg = product photo full-bleed (no text). fg = text/logo/price/scrims on transparent bg.
# HARD LESSON: feed zoompan a SINGLE (non-looped) frame. -loop 1 on the bg multiplies
# d= per input frame and produces a 9-minute clip. Only the fg is looped (for overlay).
# HOOK (virality data): first 1-3s decide views. So text appears near-instant (fade 0.3s
# instead of fading in at 0.6-1.5s) and the zoom moves FAST early then decelerates ->
# strong motion already in frame 0. Measured: hook_score 38 -> higher after this change.
set -e
BG="$1"; FG="$2"; OUT="$3"
FF=/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2
[ -x "$FF" ] || FF=$(command -v ffmpeg)
# ANTI-CROP: gentle zoom capped at 1.05 (was 1.16 — that cropped product edges).
# Keep the product sized with margin in the bg so even this gentle zoom never cuts it.
"$FF" -y -i "$BG" -loop 1 -i "$FG" -filter_complex "
[0:v]scale=1620:2880:flags=bicubic,zoompan=z='min(1.004+0.0009*on,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=1080x1920:fps=30[bgz];
[1:v]format=rgba,fade=in:st=0:d=0.3:alpha=1[fgf];
[bgz][fgf]overlay=0:0:shortest=1,format=yuv420p[v]
" -map "[v]" -r 30 -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -movflags +faststart "$OUT"
echo "done: $OUT"
"$FF" -i "$OUT" 2>&1 | grep -E "Duration|Stream #"
