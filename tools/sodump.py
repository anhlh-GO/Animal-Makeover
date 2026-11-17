# ScriptableObjects / standalone MonoBehaviours -> dump/so.json
import UnityPy,sys,os,json
sys.path.insert(0,os.path.dirname(__file__))
import mbread
env=UnityPy.load(sys.argv[1]); out=sys.argv[2]
def ext(af,fid): return af.name if fid==0 else os.path.basename(af.externals[fid-1].path)
scripts={}
for o in env.objects:
    if o.type.name=='MonoScript':
        d=o.read_typetree(); scripts[(o.assets_file.name,o.path_id)]=(d['m_Namespace']+'.' if d['m_Namespace'] else '')+d['m_ClassName']
def jsonable(v,af):
    if isinstance(v,dict):
        if set(v.keys())=={'f','p'}: return {'$ref':[ext(af,v['f']),v['p']]}
        return {k:jsonable(x,af) for k,x in v.items()}
    if isinstance(v,list): return [jsonable(x,af) for x in v]
    return v
res={}
for o in env.objects:
    if o.type.name!='MonoBehaviour': continue
    raw=o.get_raw_data(); r=mbread.R(raw); g=r.u('iq'); r.u('B'); r.al(); sf,sp=r.u('iq')
    if g[1]: continue
    cls=scripts.get((ext(o.assets_file,sf),sp))
    if not cls or cls.startswith(('TMPro','UnityEngine')): continue
    try:
        d,q,n=mbread.read_mb(o,cls)
        res['%s:%d'%(o.assets_file.name,o.path_id)]={'cls':cls,'d':jsonable(d,o.assets_file),'ok':q==n}
    except Exception as e: res['%s:%d'%(o.assets_file.name,o.path_id)]={'cls':cls,'err':str(e)[:80]}
json.dump(res,open(out,'w'))
import collections; print(collections.Counter(v['cls'] for v in res.values()).most_common(30))
