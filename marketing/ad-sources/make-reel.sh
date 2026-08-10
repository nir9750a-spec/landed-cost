#!/usr/bin/env bash
# make-reel.sh — turn a static ad into a free 9:16 Reel (Ken Burns zoom + text fade-in).
# Usage: ./make-reel.sh <bg.png 1080x1920> <fg.png 1080x1920 transparent> <out.mp4>
# bg = product photo full-bleed (no text). fg = text/logo/price/scrims on transparent bg.
# HARD LESSON: feed zoompan a SINGLE (non-looped) frame. -loop 1 on the bg multiplies
# d= per input frame and produces a 9-minute clip. Only the fg is looped (for overlay).
set -e
BG="$1"; FG="$2"; OUT="$3"
FF=/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2
[ -x "$FF" ] || FF=$(command -v ffmpeg)
"$FF" -y -i "$BG" -loop 1 -i "$FG" -filter_complex "
[0:v]scale=1620:2880:flags=bicubic,zoompan=z='min(1.001+0.00085*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=1080x1920:fps=30[bgz];
[1:v]format=rgba,fade=in:st=0.6:d=0.9:alpha=1[fgf];
[bgz][fgf]overlay=0:0:shortest=1,format=yuv420p[v]
" -map "[v]" -r 30 -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -movflags +faststart "$OUT"
echo "done: $OUT"
"$FF" -i "$OUT" 2>&1 | grep -E "Duration|Stream #"
