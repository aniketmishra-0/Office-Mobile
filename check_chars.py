import sys
with open(sys.argv[1], 'rb') as f:
    data = f.read()
text = data.decode('utf-8')
allowed = {'\u2014', '\u2013', '\u2192', '\u2018', '\u2019', '\u201c', '\u201d'}
for i, c in enumerate(text):
    cp = ord(c)
    if cp > 127 and c not in allowed:
        start = max(0, i - 20)
        end = min(len(text), i + 20)
        print('Pos', i, 'U+%04X' % cp, repr(c), 'context:', repr(text[start:end]))
