#!/bin/bash
# One-command setup: creates venv, installs deps, launches the app.
# Usage:  ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "Remote Control — Setup"
echo ""

PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        ver=$("$cmd" -c 'import sys; print(sys.version_info >= (3, 10))' 2>/dev/null || echo "False")
        if [ "$ver" = "True" ]; then
            PYTHON="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo "Python 3.10+ is required."
    echo "   Install it:  brew install python3"
    exit 1
fi

echo "   Using $($PYTHON --version) at $(which $PYTHON)"

if [ ! -d "venv" ]; then
    echo "   Creating virtual environment …"
    "$PYTHON" -m venv venv
fi

echo "   Installing dependencies …"
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt

echo ""
echo "Setup complete"
echo ""
echo "   Run the app:  ./run.sh"
echo ""
