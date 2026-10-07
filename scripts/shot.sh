#!/bin/zsh
# Headless Chrome screenshot of a page (WebGL via SwiftShader).
# usage: scripts/shot.sh <url> <out.png> [width,height] [virtual-time-ms]
url=$1; out=$2; size=${3:-1200,900}; budget=${4:-6000}
prof=$(mktemp -d -t mep-chrome)
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rm -f "$out"
"$CH" --headless=new --user-data-dir="$prof" --use-angle=swiftshader --enable-unsafe-swiftshader \
  --hide-scrollbars --force-device-scale-factor=1 --window-size="$size" --virtual-time-budget="$budget" \
  --screenshot="$out" "$url" >/dev/null 2>&1 &
pid=$!
for i in {1..120}; do
  [[ -s "$out" ]] && sleep 0.5 && break
  sleep 0.5
done
kill $pid 2>/dev/null; pkill -f "$prof" 2>/dev/null; rm -rf "$prof"
[[ -s "$out" ]] && echo "saved $out" || { echo "screenshot failed: $url"; exit 1; }
