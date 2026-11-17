import UnityPy,sys
env=UnityPy.load(sys.argv[1])
for o in env.objects:
    if o.type.name=='AnimationClip':
        d=o.read_typetree()
        mc=d.get('m_MuscleClip',{}).get('m_Clip',{}).get('data',{})
        sc=mc.get('m_StreamedClip',{}).get('data',[]); dc=mc.get('m_DenseClip',{}); cc=mc.get('m_ConstantClip',{}).get('data',[])
        b=d.get('m_ClipBindingConstant',{}).get('genericBindings',[])
        print(o.assets_file.name,o.path_id,d['m_Name'],'legacy' if d.get('m_Legacy') else 'mecanim','len',round(d['m_MuscleClip']['m_StopTime']-d['m_MuscleClip']['m_StartTime'],2),'pos',len(d.get('m_PositionCurves',[])),'float',len(d.get('m_FloatCurves',[])),'pptr',len(d.get('m_PPtrCurves',[])),'stream',len(sc),'dense',dc.get('m_CurveCount'),'const',len(cc),'bind',len(b))
