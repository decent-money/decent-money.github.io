#!/bin/sh
set -eu

# The calculation host and consumer UI live together so the website and the
# downloadable offline artifact always execute the exact same implementation.
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cp "$script_dir/bip39-standalone.html" "$script_dir/seed-tester-standalone.html"
echo "Updated seed-tester-standalone.html"
