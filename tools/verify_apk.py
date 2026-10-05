#!/usr/bin/env python3
"""Validate real DEX definitions, packaged components and frozen APK assets."""
import argparse
import hashlib
import json
import pathlib
import struct
import zipfile


def uleb(data, offset):
    value = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, offset
        shift += 7


def dex_classes(data):
    if not data.startswith(b'dex\n'):
        raise ValueError('Not a DEX file')
    strings_count, strings_offset = struct.unpack_from('<II', data, 56)
    strings = []
    for i in range(strings_count):
        offset = struct.unpack_from('<I', data, strings_offset + i * 4)[0]
        _, offset = uleb(data, offset)
        end = data.index(0, offset)
        strings.append(data[offset:end].decode('utf-8', errors='replace'))
    types_count, types_offset = struct.unpack_from('<II', data, 64)
    types = [strings[struct.unpack_from('<I', data, types_offset + i * 4)[0]] for i in range(types_count)]
    classes_count, classes_offset = struct.unpack_from('<II', data, 96)
    return [types[struct.unpack_from('<I', data, classes_offset + i * 32)[0]][1:-1].replace('/', '.')
            for i in range(classes_count)]


def manifest_components(data):
    """Read names from the APK's binary Android XML, not source declarations."""
    strings = []
    package = ''
    components = []
    position = 8
    while position + 8 <= len(data):
        kind, header, size = struct.unpack_from('<HHI', data, position)
        if size < 8:
            raise ValueError('Invalid binary XML chunk')
        if kind == 0x0001:
            count, _, flags, start = struct.unpack_from('<IIII', data, position + 8)
            offsets = struct.unpack_from('<' + 'I' * count, data, position + header)
            for offset in offsets:
                offset += position + start
                if flags & 256:
                    for length_index in range(2):
                        length = data[offset]; offset += 1
                        if length & 128:
                            length = ((length & 127) << 8) | data[offset]; offset += 1
                    strings.append(data[offset:offset + length].decode('utf-8'))
                else:
                    length = struct.unpack_from('<H', data, offset)[0]; offset += 2
                    if length & 32768:
                        length = ((length & 32767) << 16) | struct.unpack_from('<H', data, offset)[0]; offset += 2
                    strings.append(data[offset:offset + length * 2].decode('utf-16le'))
        elif kind == 0x0102:
            extension = position + header
            _, tag_index, attribute_start, attribute_size, count = struct.unpack_from('<IIHHH', data, extension)
            tag = strings[tag_index]
            attributes = {}
            for i in range(count):
                at = extension + attribute_start + i * attribute_size
                _, name, raw, _, _, value_type, value = struct.unpack_from('<IIIHBBI', data, at)
                if raw != 0xffffffff:
                    attributes[strings[name]] = strings[raw]
                elif value_type == 3:
                    attributes[strings[name]] = strings[value]
            if tag == 'manifest': package = attributes.get('package', '')
            if tag in ('activity', 'service', 'receiver', 'provider') and 'name' in attributes:
                name = attributes['name']
                components.append(package + name if name.startswith('.') else package + '.' + name if '.' not in name else name)
        position += size
    return package, components


def asset_hashes(archive):
    result = {}
    for info in archive.infolist():
        name = info.filename
        # AGP zipflinger writes UTF-8 filename bytes without always setting bit 11.
        # Android and Java read those bytes as UTF-8; Python otherwise assumes CP437.
        if not info.flag_bits & 0x800:
            try: name = name.encode('cp437').decode('utf-8')
            except (UnicodeEncodeError, UnicodeDecodeError): pass
        if name.startswith('assets/') and not name.endswith('/'):
            result[name[7:]] = hashlib.sha256(archive.read(info)).hexdigest()
    return result


def verify(apk_path, manifest_path, baseline):
    with zipfile.ZipFile(apk_path) as apk:
        definitions = sorted({name for path in apk.namelist() if path.startswith('classes') and path.endswith('.dex')
                              for name in dex_classes(apk.read(path))})
        package, components = manifest_components(apk.read('AndroidManifest.xml'))
        assert package == 'com.forcefocus.app', package
        missing = sorted(set(components) - set(definitions))
        assert not missing, f'Manifest components missing from DEX: {missing}'
        required = {'com.forcefocus.app.MainActivity', 'com.forcefocus.app.NativeBridge',
                    'com.forcefocus.app.ForceFocusAccessibilityService', 'com.forcefocus.app.HistoryBackupActivity',
                    'com.forcefocus.app.FocusDeadlineReceiver'}
        assert required <= set(definitions), f'Missing native classes: {required - set(definitions)}'
        assets = asset_hashes(apk)
        expected = json.loads(pathlib.Path(manifest_path).read_text())['files']
        assert assets == expected, 'Packaged assets differ from frozen manifest'
        if baseline:
            with zipfile.ZipFile(baseline) as old:
                old_assets = asset_hashes(old)
                assert assets == old_assets, 'Packaged assets differ from original APK'
    return {'apk': str(apk_path), 'sha256': hashlib.sha256(pathlib.Path(apk_path).read_bytes()).hexdigest(),
            'packageName': package, 'manifestComponents': components, 'dexClasses': definitions,
            'assetCount': len(assets), 'frozenAssetsUnchanged': True,
            'deviceAccessibilityEnabled': 'not tested', 'deviceLogcat': 'not available',
            'deviceWhitelistBlocking': 'not tested', 'deviceVisualRegression': 'not tested'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('apk')
    parser.add_argument('--frozen-manifest', default='frozen-assets/manifest.json')
    parser.add_argument('--baseline')
    parser.add_argument('--output')
    args = parser.parse_args()
    result = verify(args.apk, args.frozen_manifest, args.baseline)
    rendered = json.dumps(result, indent=2, ensure_ascii=False) + '\n'
    if args.output: pathlib.Path(args.output).write_text(rendered)
    print(rendered)
