#!/usr/bin/env python3
"""Build ForceFocus using Gradle. Binary APK patching is retired."""
import pathlib
import subprocess
import sys
root = pathlib.Path(__file__).resolve().parents[1]
raise SystemExit(subprocess.call([str(root / "gradlew"), *(sys.argv[1:] or [":app:assembleDebug"])], cwd=root))
