import UnityPy,sys,os,json
env=UnityPy.load(sys.argv[1]); out=sys.argv[2]; res={}
for o in env.objects:
    if o.type.name=='Font':
        f=o.read()
        data=bytes(f.m_FontData) if f.m_FontData else b''
        if data:
            fn=f.m_Name.replace(' ','_')+('.otf' if data[:4]==b'OTTO' else '.ttf')
            open(os.path.join(out,fn),'wb').write(data); print('font',fn,len(data))
        res['%s:%d'%(o.assets_file.name,o.path_id)]=f.m_Name
    elif o.type.name=='MonoBehaviour':
        try:
            n=o.peek_name()
        except Exception: continue
        if n and 'SDF' in n: res['%s:%d'%(o.assets_file.name,o.path_id)]=n
json.dump(res,open(os.path.join(out,'fonts.json'),'w'),indent=0)
