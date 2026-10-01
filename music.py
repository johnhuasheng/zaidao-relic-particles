# 合成配乐：低音铺底 + 古筝式拨弦 + 编钟 + 风声，输出 out/music.wav（90 秒，与画面时间轴对齐）
import numpy as np, wave, os, sys

# --bgm：只输出铺底与拨弦（交互演示用，钟声/风声由网页实时合成）
BGM = '--bgm' in sys.argv

SR = 44100
DUR = 90.0
n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(7)

def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)

def put(sig, t0, pan=0.0, gain=1.0):
    i = int(t0 * SR)
    if i >= n: return
    sig = sig[: n - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))

# ---- 铺底和声（按段落换和弦，交叉淡化）----
sections = [  # (起点, 终点, 音符 midi)
    (0, 21.2, [38, 45, 50, 53]),       # D  A  D  F
    (21.2, 36.6, [43, 50, 55, 57]),    # G  D  G  A
    (36.6, 52.0, [45, 52, 57, 60]),    # A  E  A  C
    (52.0, 67.6, [41, 48, 53, 57]),    # F  C  F  A
    (67.6, 80.6, [38, 45, 50, 57, 62]),  # D  A  D  A  D
    (80.6, 90.0, [38, 45, 50, 52, 57, 64]),  # D  A  D  E  A  E（空灵收束）
]
t_all = np.arange(n) / SR
for (a, b, notes) in sections:
    s0, s1 = int(max(0, a - 2.0) * SR), int(min(DUR, b + 2.0) * SR)
    t = t_all[s0:s1]
    env = np.clip((t - (a - 2.0)) / 3.0, 0, 1) * np.clip(((b + 2.0) - t) / 3.0, 0, 1)
    sig = np.zeros_like(t)
    for k, m in enumerate(notes):
        f = hz(m)
        for det in (-0.12, 0.12):
            ph = rng.uniform(0, 2 * np.pi)
            ff = f * 2 ** (det / 12 * 0.5)
            sig += (np.sin(2 * np.pi * ff * t + ph) + 0.3 * np.sin(4 * np.pi * ff * t + ph) + 0.12 * np.sin(6 * np.pi * ff * t)) / (1 + k * 0.35)
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * t + a)
    sig *= env * lfo * 0.05
    L[s0:s1] += sig * (0.9 + 0.1 * np.sin(t * 0.3)); R[s0:s1] += sig * (0.9 + 0.1 * np.cos(t * 0.3))

# ---- 古筝式拨弦 ----
def pluck(f, dur=3.5, bright=1.0):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for h in range(1, 13):
        amp = (1.0 / h ** 1.1) * (1 if h < 7 else 0.5) * bright ** (h - 1)
        dec = 0.9 + 0.55 * h
        out += amp * np.sin(2 * np.pi * f * h * (1 + 0.0004 * h * h) * t) * np.exp(-dec * t)
    # 轻微揉弦
    out *= 1 + 0.02 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t - 0.3, 0, 1)
    att = np.clip(t / 0.004, 0, 1)
    return out * att * 0.22

scale = {  # 每段的五声音阶（midi）
    0: [62, 65, 67, 69, 72, 74, 77],
    1: [62, 67, 69, 71, 74, 79],
    2: [64, 67, 69, 72, 76, 79],
    3: [60, 65, 67, 69, 72, 77],
    4: [62, 64, 66, 69, 71, 74, 76, 78, 81],
    5: [62, 64, 69, 71, 74, 76],
}
def section_of(t):
    for i, (a, b, _) in enumerate(sections):
        if a <= t < b: return i
    return 5

t = 2.2
while t < 86.5:
    sc = scale[section_of(t)]
    busy = 67.6 < t < 80
    m = sc[rng.integers(len(sc))]
    put(pluck(hz(m), bright=0.85), t, pan=rng.uniform(-0.5, 0.5), gain=0.8 + rng.uniform(0, 0.4))
    if rng.random() < 0.35:  # 双音 / 八度点缀
        m2 = sc[min(len(sc) - 1, sc.index(m) + 2)]
        put(pluck(hz(m2), bright=0.8), t + 0.18, pan=rng.uniform(-0.6, 0.6), gain=0.6)
    t += (rng.choice([0.6, 0.9, 1.2]) if busy else rng.choice([1.4, 1.8, 2.4, 3.0]))

# ---- 编钟 ----
def bell(f, dur=6.0):
    t = np.arange(int(dur * SR)) / SR
    parts = [(0.5, 0.6, 0.5), (1.0, 1.0, 0.8), (1.183, 0.45, 1.1), (1.506, 0.35, 1.4), (2.0, 0.3, 1.8), (2.74, 0.25, 2.6), (4.07, 0.15, 4.0)]
    out = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-d * t) for r, a, d in parts)
    strike = rng.normal(0, 1, len(t)) * np.exp(-t * 60) * 0.3
    out = (out + strike) * np.clip(t / 0.002, 0, 1)
    return out * 0.18
for tt, m in [] if BGM else [(8.3, 62), (24.2, 55), (39.6, 57), (55.0, 53), (69.8, 62), (70.4, 66), (71.0, 69), (71.6, 74), (85.0, 50)]:
    put(bell(hz(m)), tt, pan=0.0, gain=1.0 if tt < 80 else 1.4)

# ---- 风声 / 粒子扩散 ----
def whoosh(dur):
    k = int(dur * SR)
    x = rng.normal(0, 1, k)
    # 一阶低通，截止频率随包络上扬
    tt = np.arange(k) / k
    env = np.sin(np.pi * tt) ** 2
    alpha = 0.02 + 0.12 * env
    y = np.zeros(k); acc = 0.0
    for i in range(k):
        acc += alpha[i] * (x[i] - acc); y[i] = acc
    return y * env * 0.9
for a, b in [] if BGM else [(4.6, 8.8), (19.0, 21.4), (21.2, 24.6), (34.4, 36.8), (36.6, 40.0), (49.8, 52.2), (52.0, 55.4), (65.4, 67.8), (74.6, 79.2), (80.4, 85.6)]:
    put(whoosh(b - a), a, pan=rng.uniform(-0.3, 0.3), gain=0.9)

# ---- 混响（合成脉冲响应，FFT 卷积）----
def reverb(x, seed, secs=3.2):
    k = int(secs * SR)
    ir = np.random.default_rng(seed).normal(0, 1, k) * np.exp(-np.arange(k) / SR * 2.2)
    ir[:int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    ir /= np.sqrt(np.sum(ir ** 2))
    N = 1 << int(np.ceil(np.log2(len(x) + k)))
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:len(x)]
dry = 0.72
L2 = dry * L + 0.55 * reverb(L, 1); R2 = dry * R + 0.55 * reverb(R, 2)

# 母带：淡入淡出 + 软限幅 + 归一化
fade = np.clip(t_all / 1.5, 0, 1) * np.clip((DUR - t_all) / 2.5, 0, 1)
L2 *= fade; R2 *= fade
peak = max(np.abs(L2).max(), np.abs(R2).max())
L2 = np.tanh(L2 / peak * 1.3) / np.tanh(1.3) * 0.8
R2 = np.tanh(R2 / peak * 1.3) / np.tanh(1.3) * 0.8

os.makedirs('out', exist_ok=True)
data = (np.stack([L2, R2], 1) * 32767).astype(np.int16)
with wave.open('out/bgm.wav' if BGM else 'out/music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())
print('ok', data.shape)
