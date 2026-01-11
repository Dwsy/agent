#!/bin/bash
#
# Fetch latest Vercel Design Guidelines content
# Usage: ./fetch-updates.sh [--output json|markdown]
#

set -e

OUTPUT_FORMAT="${2:-markdown}"
URL="https://vercel.com/design/guidelines"

echo "Fetching Vercel Design Guidelines from $URL..."

CONTENT=$(curl -s "$URL")

# Extract the Next.js data from the page
# The data is embedded in script tags with JSON

if [ "$OUTPUT_FORMAT" = "json" ]; then
  # Output raw JSON data
  echo "$CONTENT" | grep -o '{".*"}' | head -100
else
  # Output summary of sections found
  echo "Sections found in Vercel Design Guidelines:"
  echo ""
  
  # Check for common section indicators in the JSON data
  echo "$CONTENT" | grep -oE '"sectionId":"[^"]*"' | sort -u
fi