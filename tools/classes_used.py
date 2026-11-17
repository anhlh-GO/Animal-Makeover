import json,glob,collections,os
cnt=collections.Counter(); lv=collections.defaultdict(set)
for f in glob.glob('dump/*.json'):
    b=os.path.basename(f)
    if b in('names.json','so.json'): continue
    G=json.load(open(f))
    for g in G.values():
        for c in g['c']:
            if c['type']=='MonoBehaviour':
                s=c.get('script'); cnt[s]+=1; lv[s].add(b[:7])
C=json.load(open('classes.json'))
for k,v in sorted(cnt.items(),key=lambda x:-x[1]):
    if k.startswith(('UnityEngine.UI','TMPro','UnityEngine.Event')): continue
    par=C.get(k,{}).get('parent')
    print(v,k,par,len(lv[k]))
