#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
test_output="$(mktemp -d)"
trap 'rm -rf "$test_output"' EXIT
java -m jdk.compiler/com.sun.tools.javac.Main -d "$test_output" \
  "$repo_root/app/src/main/java/com/forcefocus/app/FocusWindowPolicy.java" \
  "$repo_root/tools/tests/FocusWindowPolicyTest.java"
java -cp "$test_output" com.forcefocus.app.FocusWindowPolicyTest
