#!/bin/bash
# One-command setup: creates venv and installs deps.
# Usage:  ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v python3 &>/dev/null; then
    echo "python3 is required.  Install it:  brew install python3"
    exit 1
fi

echo "Using $(python3 --version)"

[ -d .venv ] || python3 -m venv .venv

.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt

echo "Setup complete — run the app with:  ./run.sh"
