# print node tree of data/<file>.json: python tree.py level2 [maxdepth] [rootname]
import json,sys
F=json.load(open('data/%s.json'%sys.argv[1])); N=F['nodes']
names=json.load(open('dump/names.json'))
md=int(sys.argv[2]) if len(sys.argv)>2 else 99
root=sys.argv[3] if len(sys.argv)>3 else None
def cs(n):
    out=[]
    for c in n.get('c',[]):
        t=c['t']
        if t=='MB': out.append(c['cls'].replace('LevelFlow.',''))
        elif t=='SR': out.append('SR(%s,o%s)'%(names.get(c['sp'],['',''])[1] if c.get('sp') else '-',c.get('o')))
        elif t=='Img': out.append('Img(%s)'%(names.get(c['sp'],['',''])[1] if c.get('sp') else '-'))
        elif t=='Txt': out.append('Txt(%r)'%c.get('s','')[:30])
        else: out.append(t)
    return ' '.join(out)
def pr(k,d):
    n=N[str(k)]
    print('  '*d+('-' if n.get('off') else '')+n['n']+'  ['+cs(n)+']')
    if d<md:
        for ch in n.get('ch',[]): pr(ch,d+1)
roots=[k for k,n in N.items() if n.get('par') is None]
for r in roots:
    if root and N[r]['n']!=root: continue
    pr(r,0)
