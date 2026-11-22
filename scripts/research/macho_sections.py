"""Fingerprint selected Mach-O sections without executing the binary."""
import hashlib
import struct


def fingerprint(path):
    data = path.read_bytes()
    if struct.unpack_from('<I', data)[0] != 0xfeedfacf:
        raise ValueError('Expected thin 64-bit little-endian Mach-O')
    position, sections = 32, []
    for _ in range(struct.unpack_from('<I', data, 16)[0]):
        command, size = struct.unpack_from('<II', data, position)
        if size < 8 or position + size > len(data):
            raise ValueError('Invalid command bounds')
        if command == 0x19:
            for index in range(struct.unpack_from('<I', data, position + 64)[0]):
                at = position + 72 + index * 80
                name = data[at:at + 16].split(b'\0')[0].decode()
                segment = data[at + 16:at + 32].split(b'\0')[0].decode()
                _, length, offset = struct.unpack_from('<QQI', data, at + 32)
                if segment == '__TEXT' and name in ('__text', '__cstring', '__objc_methname'):
                    if offset + length > len(data):
                        raise ValueError('Section exceeds file')
                    sections.append({'segment': segment, 'section': name, 'bytes': length,
                                     'sha256': hashlib.sha256(data[offset:offset + length]).hexdigest()})
        position += size
    if not any(section['section'] == '__text' for section in sections):
        raise ValueError('Missing executable text section')
    return {'fileSHA256': hashlib.sha256(data).hexdigest(), 'sections': sections}
