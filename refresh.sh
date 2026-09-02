#!/bin/sh
# Scrape all theaters, then serve the site at http://localhost:8741
set -e
cd "$(dirname "$0")"
.venv/bin/python -m scraper.main
echo
echo "Serving at http://localhost:8741 (ctrl-c to stop)"
python3 -m http.server 8741 -d site
