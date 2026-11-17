# AnimationClips (mecanim streamed/dense/constant + legacy curves) and AnimatorControllers -> data/clips.json
# Clips are resampled at FPS into per-property tracks: {path, p (px py rz sx sy active a r g b sp en), v:[...] }.
import UnityPy, sys, json, math, struct, zlib, os
env = UnityPy.load(sys.argv[1]); OUT = sys.argv[2]
FPS = 30
def key(o): return '%s:%d' % (o.assets_file.name, o.path_id)
def ext(af, fid): return af.name if fid == 0 else os.path.basename(af.externals[fid - 1].path)
crc = lambda s: zlib.crc32(s.encode()) & 0xffffffff
ATTR = {crc(n): n for n in ['m_IsActive', 'm_Enabled', 'm_Color.r', 'm_Color.g', 'm_Color.b', 'm_Color.a', 'm_Sprite', 'm_FlipX', 'm_FlipY', 'm_SortingOrder',
        'm_LocalPosition.x', 'm_LocalPosition.y', 'm_LocalPosition.z', 'm_AnchoredPosition.x', 'm_AnchoredPosition.y', 'm_SizeDelta.x', 'm_SizeDelta.y', 'm_Alpha', 'm_FillAmount',
        'm_LocalScale.x', 'm_LocalScale.y', 'material._Color.a']}
PROP = {'m_IsActive': 'active', 'm_Enabled': 'en', 'm_Color.r': 'r', 'm_Color.g': 'g', 'm_Color.b': 'b', 'm_Color.a': 'a', 'm_Sprite': 'sp', 'm_FlipX': 'fx', 'm_SortingOrder': 'o',
        'm_LocalPosition.x': 'px', 'm_LocalPosition.y': 'py', 'm_AnchoredPosition.x': 'ax', 'm_AnchoredPosition.y': 'ay', 'm_SizeDelta.x': 'w', 'm_SizeDelta.y': 'h', 'm_Alpha': 'cga', 'm_FillAmount': 'fill',
        'm_LocalScale.x': 'sx', 'm_LocalScale.y': 'sy', 'localEulerAnglesRaw.z': 'rz', 'localEulerAngles.z': 'rz', 'm_LocalEulerAngles.z': 'rz'}
paths = {}
for o in env.objects:
    if o.type.name == 'AnimatorController':
        d = o.read_typetree()
        for h, p in d['m_TOS']: paths[h] = p
def qz(x, y, z, w): return math.degrees(math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))
def herm(k0, k1, t, comp=None):
    g = (lambda v: v[comp] if comp is not None else v)
    v0, v1 = g(k0['value']), g(k1['value']); m0, m1 = g(k0['outSlope']), g(k1['inSlope'])
    if not math.isfinite(m0) or not math.isfinite(m1): return v0
    dt = k1['time'] - k0['time']
    if dt <= 0: return v1
    u = (t - k0['time']) / dt
    return (2*u**3 - 3*u**2 + 1) * v0 + (u**3 - 2*u**2 + u) * dt * m0 + (-2*u**3 + 3*u**2) * v1 + (u**3 - u**2) * dt * m1
def evalc(ks, t, comp=None):
    if not ks: return 0
    g = (lambda v: v[comp] if comp is not None else v)
    if t <= ks[0]['time']: return g(ks[0]['value'])
    for a, b in zip(ks, ks[1:]):
        if a['time'] <= t <= b['time']: return herm(a, b, t, comp)
    return g(ks[-1]['value'])
def r4(v): return round(v, 4)
clips = {}
for o in env.objects:
    if o.type.name != 'AnimationClip': continue
    d = o.read_typetree(); name = d['m_Name']
    tracks = []
    if d.get('m_Legacy'):
        ln = 0
        for grp in ('m_PositionCurves', 'm_ScaleCurves', 'm_EulerCurves', 'm_RotationCurves', 'm_FloatCurves'):
            for c in d.get(grp, []):
                ks = c['curve']['m_Curve']
                if ks: ln = max(ln, ks[-1]['time'])
        n = max(1, int(round(ln * FPS)) + 1)
        T = [i / FPS for i in range(n)]
        for c in d.get('m_PositionCurves', []):
            ks = c['curve']['m_Curve']
            tracks.append({'path': c['path'], 'p': 'px', 'v': [r4(evalc(ks, t, 'x')) for t in T]})
            tracks.append({'path': c['path'], 'p': 'py', 'v': [r4(evalc(ks, t, 'y')) for t in T]})
        for c in d.get('m_ScaleCurves', []):
            ks = c['curve']['m_Curve']
            tracks.append({'path': c['path'], 'p': 'sx', 'v': [r4(evalc(ks, t, 'x')) for t in T]})
            tracks.append({'path': c['path'], 'p': 'sy', 'v': [r4(evalc(ks, t, 'y')) for t in T]})
        for c in d.get('m_EulerCurves', []):
            ks = c['curve']['m_Curve']; tracks.append({'path': c['path'], 'p': 'rz', 'v': [r4(evalc(ks, t, 'z')) for t in T]})
        for c in d.get('m_RotationCurves', []):
            ks = c['curve']['m_Curve']
            tracks.append({'path': c['path'], 'p': 'rz', 'v': [r4(qz(evalc(ks, t, 'x'), evalc(ks, t, 'y'), evalc(ks, t, 'z'), evalc(ks, t, 'w'))) for t in T]})
        for c in d.get('m_FloatCurves', []):
            p = PROP.get(c['attribute'])
            if not p: continue
            ks = c['curve']['m_Curve']; tracks.append({'path': c['path'], 'p': p, 'v': [r4(evalc(ks, t)) for t in T], 'cls': c['classID']})
        clips[key(o)] = {'n': name, 'len': round(ln, 4), 'loop': d.get('m_WrapMode') == 2, 'legacy': 1, 't': tracks}
        continue
    mc = d['m_MuscleClip']; cl = mc['m_Clip']['data']
    t0, t1 = mc['m_StartTime'], mc['m_StopTime']; ln = max(0, t1 - t0)
    sc = cl['m_StreamedClip']; scount = sc['curveCount']
    raw = struct.pack('<%dI' % len(sc['data']), *sc['data'])
    keys = {}
    p = 0
    while p + 8 <= len(raw):
        tm, cnt = struct.unpack_from('<fI', raw, p); p += 8
        for _ in range(cnt):
            idx = struct.unpack_from('<I', raw, p)[0]; cf = struct.unpack_from('<4f', raw, p + 4); p += 20
            keys.setdefault(idx, []).append((tm, cf))
    dc = cl['m_DenseClip']; dcount = dc['m_CurveCount']
    cc = cl['m_ConstantClip']['data']
    def val(ci, t):
        if ci < scount:
            ks = keys.get(ci)
            if not ks: return 0
            cur = ks[0]
            for k in ks:
                if k[0] <= t: cur = k
                else: break
            dt = t - cur[0] if math.isfinite(cur[0]) else 0
            c0, c1, c2, c3 = cur[1]
            return ((c0 * dt + c1) * dt + c2) * dt + c3
        ci -= scount
        if ci < dcount:
            fr = (t - dc['m_BeginTime']) * dc['m_SampleRate']; f0 = int(max(0, min(dc['m_FrameCount'] - 1, math.floor(fr))))
            f1 = min(dc['m_FrameCount'] - 1, f0 + 1); u = max(0, min(1, fr - f0)); A = dc['m_SampleArray']
            return A[f0 * dcount + ci] * (1 - u) + A[f1 * dcount + ci] * u
        ci -= dcount
        return cc[ci] if ci < len(cc) else 0
    bc = d['m_ClipBindingConstant']; pptr = bc.get('pptrCurveMapping', [])
    n = max(1, int(round(ln * FPS)) + 1); T = [t0 + i / FPS for i in range(n)]
    ci = 0
    for b in bc['genericBindings']:
        path = paths.get(b['path'], '#%d' % b['path'])
        if b['typeID'] == 4:
            a = b['attribute']; nc = 4 if a == 2 else 3
            if a == 1:
                tracks.append({'path': path, 'p': 'px', 'v': [r4(val(ci, t)) for t in T]}); tracks.append({'path': path, 'p': 'py', 'v': [r4(val(ci + 1, t)) for t in T]})
            elif a == 3:
                tracks.append({'path': path, 'p': 'sx', 'v': [r4(val(ci, t)) for t in T]}); tracks.append({'path': path, 'p': 'sy', 'v': [r4(val(ci + 1, t)) for t in T]})
            elif a == 4:
                tracks.append({'path': path, 'p': 'rz', 'v': [r4(val(ci + 2, t)) for t in T]})
            elif a == 2:
                tracks.append({'path': path, 'p': 'rz', 'v': [r4(qz(val(ci, t), val(ci + 1, t), val(ci + 2, t), val(ci + 3, t))) for t in T]})
            ci += nc
            continue
        an = ATTR.get(b['attribute']); pr = PROP.get(an) if an else None
        if b['isPPtrCurve']:
            vs = []
            for t in T:
                i = int(round(val(ci, t)))
                ref = pptr[i] if 0 <= i < len(pptr) else None
                vs.append('%s:%d' % (ext(o.assets_file, ref['m_FileID']), ref['m_PathID']) if ref and ref['m_PathID'] else None)
            tracks.append({'path': path, 'p': 'sp', 'v': vs})
        elif pr:
            tracks.append({'path': path, 'p': pr, 'v': [r4(val(ci, t)) for t in T], 'cls': b['typeID']})
        ci += 1
    clips[key(o)] = {'n': name, 'len': round(ln, 4), 'loop': bool(mc.get('m_LoopTime')), 't': tracks}
ctrls = {}
for o in env.objects:
    if o.type.name != 'AnimatorController': continue
    d = o.read_typetree(); C = d['m_Controller']; tos = dict(d['m_TOS'])
    cl = ['%s:%d' % (ext(o.assets_file, c['m_FileID']), c['m_PathID']) for c in d['m_AnimationClips']]
    layers = []
    for li, L in enumerate(C['m_LayerArray']):
        sm = C['m_StateMachineArray'][L['data']['m_StateMachineIndex']]['data']
        states = []
        for s in sm['m_StateConstantArray']:
            s = s['data']; clip = None
            for bt in s['m_BlendTreeConstantArray']:
                for nd in bt['data']['m_NodeArray']:
                    if nd['data']['m_ClipID'] < len(cl) and nd['data']['m_ClipID'] != 4294967295: clip = cl[nd['data']['m_ClipID']]; break
            trs = []
            for t in s['m_TransitionConstantArray']:
                t = t['data']
                trs.append({'dst': t['m_DestinationState'], 'exit': t['m_ExitTime'], 'hasExit': t['m_HasExitTime'], 'dur': t['m_TransitionDuration'],
                            'cond': [[c['data']['m_ConditionMode'], tos.get(c['data']['m_EventID'], c['data']['m_EventID']), c['data']['m_EventThreshold']] for c in t['m_ConditionConstantArray']]})
            states.append({'n': tos.get(s['m_NameID'], ''), 'clip': clip, 'speed': s['m_Speed'], 'loop': s['m_Loop'], 'tr': trs})
        anys = [{'dst': t['data']['m_DestinationState'], 'cond': [[c['data']['m_ConditionMode'], tos.get(c['data']['m_EventID'], c['data']['m_EventID']), c['data']['m_EventThreshold']] for c in t['data']['m_ConditionConstantArray']]} for t in sm['m_AnyStateTransitionConstantArray']]
        layers.append({'def': sm['m_DefaultState'], 'states': states, 'any': anys})
    ctrls[key(o)] = {'n': d['m_Name'], 'layers': layers}
txt = json.dumps({'clips': clips, 'ctrls': ctrls}, separators=(',', ':')).replace('NaN', '0').replace('-Infinity', '-1e30').replace('Infinity', '1e30')
open(OUT, 'w').write(txt)
print(len(clips), 'clips', len(ctrls), 'controllers', len(txt) // 1024, 'KB')
for k, v in list(ctrls.items())[:3]: print(k, json.dumps(v)[:400])
