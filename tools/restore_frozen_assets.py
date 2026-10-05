#!/usr/bin/env python3
"""Restore exact frozen assets from the original APK or image ZIP."""
import argparse
import hashlib
import json
import pathlib
import zipfile
root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('archive')
args = parser.parse_args()
expected = json.loads((root / 'frozen-assets/manifest.json').read_text())['files']
destination = root / 'app/src/main/assets'
count = 0
with zipfile.ZipFile(args.archive) as archive:
    for entry in archive.namelist():
        name = entry[7:] if entry.startswith('assets/') else entry
        if name not in expected: continue
        data = archive.read(entry)
        if hashlib.sha256(data).hexdigest() != expected[name]:
            raise SystemExit('Frozen resource hash mismatch: ' + name)
        target = destination / name
        if target.exists() and target.read_bytes() != data:
            raise SystemExit('Existing resource differs; refusing to overwrite: ' + name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        count += 1
missing = [name for name, digest in expected.items() if not (destination / name).is_file()
           or hashlib.sha256((destination / name).read_bytes()).hexdigest() != digest]
if missing: raise SystemExit('Resources missing or changed: ' + ', '.join(missing))
print(f'Restored {count} assets; all {len(expected)} frozen assets verified')
