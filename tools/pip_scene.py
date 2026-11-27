"""Scene shell for the Pip (Hedgehog) level: data/level11.json from the Bunny scene (level8).

Keeps the level's frame (camera, UI canvas and tool bar, screen fade, hint hand, finale photo / posts, effects,
dress-up room) and a few reusable props (shower, soap brush, comb with their particles; three sets of choice cards).
Drops the Bunny's own character, tools and steps; js/pip.js builds Pip's stage and steps into this shell at load.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = json.load(open(os.path.join(ROOT, 'data', 'level8.json'), encoding='utf-8'))
N = F['nodes']

removed = set()


def drop(pid):
    pid = str(pid)
    n = N.get(pid)
    if not n:
        return
    for ch in list(n.get('ch', [])):
        drop(ch)
    par = n.get('par')
    if par is not None and str(par) in N:
        N[str(par)]['ch'] = [c for c in N[str(par)].get('ch', []) if str(c) != pid]
    removed.add(int(pid))
    del N[pid]


def keep_only(parent, keep):
    for ch in list(N[str(parent)].get('ch', [])):
        if ch not in keep:
            drop(ch)


# Tools: reusable props and the choice cards
SHOWER, SOAP, COMB = 403, 98, 329
CARDS = [288, 284, 278, 11, 267, 224, 16, 493, 134]
keep_only(34, [SHOWER, SOAP, COMB] + CARDS)
for c in CARDS:  # no rewarded-video lock badges
    for ch in list(N[str(c)].get('ch', [])):
        if N[str(ch)]['n'].startswith('Reward Btn'):
            drop(ch)

# the Bunny's steps
keep_only(317, [])
# her salon stage (Pip's is built by js/pip.js under the same root)
keep_only(347, [])
N['347']['c'] = [c for c in N['347']['c'] if c.get('cls') != 'LevelFlow.StageLift']
# dress-up room: keep the room, empty the character
keep_only(25, [])      # backdrop fill tiles
keep_only(106, [])     # Character/Bounce/Breath parts
# Feel: hair push needs her hair area
N['154']['c'] = [c for c in N['154']['c'] if c.get('cls') != 'LevelFlow.HairDisturbance']

F['c2g'] = {k: v for k, v in F['c2g'].items() if v not in removed and int(v) not in removed}
s = json.dumps(F, ensure_ascii=False, separators=(',', ':')).replace('"level8:', '"level11:')
open(os.path.join(ROOT, 'data', 'level11.json'), 'w', encoding='utf-8').write(s)
print('nodes', len(N), 'removed', len(removed))
