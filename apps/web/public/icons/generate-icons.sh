#!/bin/bash
# Generate PWA icons from a source image
#
# Prerequisites: ImageMagick (convert command)
#   sudo apt-get install imagemagick   # Debian/Ubuntu
#   brew install imagemagick           # macOS
#
# Usage:
#   ./generate-icons.sh [source-image]
#
# If no source image is provided, the placeholder.svg in this directory is used.
# Replace placeholder.svg with the official NPC/CPCB logo before running.
#
# The manifest.json expects the following icon sizes:
#   72, 96, 128, 144, 152, 192, 384, 512

set -euo pipefail

SOURCE="${1:-$(dirname "$0")/placeholder.svg}"
OUTDIR="$(dirname "$0")"

SIZES=(72 96 128 144 152 192 384 512)

for size in "${SIZES[@]}"; do
  echo "Generating icon-${size}x${size}.png ..."
  convert "$SOURCE" -resize "${size}x${size}" -background none -gravity center -extent "${size}x${size}" "$OUTDIR/icon-${size}x${size}.png"
done

echo "Done. Icons generated in $OUTDIR"
echo ""
echo "NOTE: Replace placeholder.svg with the official NPC/CPCB logo and re-run"
echo "this script to produce production-quality icons."
