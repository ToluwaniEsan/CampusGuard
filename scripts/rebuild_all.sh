#!/usr/bin/env bash
# Rebuild everything from raw data: datasets -> models -> JS bundle -> tests -> web + extension packages.
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONWARNINGS=ignore
python3 scripts/synth_campus.py > /dev/null
python3 scripts/build_dataset.py
python3 scripts/train.py
python3 scripts/export_js.py
python3 tests/parity_test.py
python3 tests/test_sender_rules.py
python3 tests/run_battery.py realistic_battery
python3 tests/run_battery.py blind_battery
python3 scripts/evaluate_campus.py
python3 scripts/build_web.py
python3 scripts/build_extension.py
