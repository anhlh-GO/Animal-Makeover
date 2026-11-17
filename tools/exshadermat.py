# adds LevelFlow/SkinPressSprite and LevelFlow/SwaySprite material params to data/mats.json
# usage: python -I tools/exshadermat.py <dir with sharedassets*.assets> data/mats.json
import UnityPy,sys,json,glob,os
M=json.load(open(sys.argv[2]))
files=sorted(glob.glob(os.path.join(sys.argv[1],'sharedassets*.assets')))
env=UnityPy.load(*files); n=0
for o in env.objects:
    if o.type.name!='Material': continue
    d=o.read_typetree(); sp=d['m_SavedProperties']
    F=dict(sp['m_Floats']); C={k:[round(v[x],4) for x in 'rgba'] for k,v in sp['m_Colors']}
    k='%s:%d'%(o.assets_file.name,o.path_id)
    if '_PressAmount' in F: p={'sh':'skin','press':F['_PressAmount'],'hair':F['_HairAmount'],'sway':C['_HairSway'],'hold':C['_HairSwayHold'],'wave':C['_WaterWave']}
    elif '_SwayTexels' in F: p={'sh':'sway','tex':F['_SwayTexels'],'spd':F['_SwaySpeed'],'waves':F['_SwayWaves'],'piv':C['_SwayPivot']}
    else: continue
    M.setdefault(k,{'n':d['m_Name'],'f':{},'c':{},'kw':None})['fx']=p; n+=1
json.dump(M,open(sys.argv[2],'w')); print(n,'shader materials')
