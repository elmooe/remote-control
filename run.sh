#!/bin/bash
# Starts the Remote Mouse server using the local virtual environment.
# Usage:  ./run.sh
cd "$(dirname "$0")"
venv/bin/python3 server.py
