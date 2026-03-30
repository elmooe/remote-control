#!/bin/bash
# Starts the Remote Control server.
cd "$(dirname "$0")"
.venv/bin/python3 server.py
