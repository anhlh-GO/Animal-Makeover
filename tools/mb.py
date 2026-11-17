# python mb.py level2 ClassSubstr [pathSubstr]  -> MB data with refs resolved to node paths
import json,sys
fn=sys.argv[1]; pat=sys.argv[2]; ps=sys.argv[3] if len(sys.argv)>3 else ''
F=json.load(open('data/%s.json'%fn)); N=F['nodes']; c2g=F['c2g']
names=json.load(open('dump/names.json'))
def path(i):
    p=[]
    while i is not None and str(i) in N:
        p.append(N[str(i)]['n']); i=N[str(i)].get('par')
    return '/'.join(reversed(p))
def ctype(pid):
    g=c2g.get(pid)
    if g is None: return ''
    for c in N[str(g)].get('c',[]):
        if str(c.get('id'))==pid: return c.get('cls',c['t']).replace('LevelFlow.','')
    return 'GO'
def res(v):
    if isinstance(v,str) and ':' in v:
        f,pid=v.rsplit(':',1)
        if f==fn and pid in c2g: return '@'+path(c2g[pid])+'#'+ctype(pid)
        if f==fn and pid in N: return '@'+path(int(pid))
        return '$'+names.get(v,['?','?'])[1]
    if isinstance(v,list): return [res(x) for x in v]
    if isinstance(v,dict): return {k:res(x) for k,x in v.items() }
    return v
for k,v in N.items():
    for c in v.get('c',[]):
        if c.get('t')=='MB' and pat in c.get('cls','') and ps in path(int(k)):
            print('##',path(int(k)),c['cls'],'' if not c.get('off') else '(disabled)'); print(json.dumps(res(c.get('d')),ensure_ascii=False)[:int(sys.argv[4]) if len(sys.argv)>4 else 4000])
