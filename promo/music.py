#!/usr/bin/env python3
"""Música original del vídeo (sintetizada aquí, sin muestras ni derechos de terceros): 100 BPM, Do mayor.
Uso: python3 promo/music.py salida.wav [duración_s=80]"""
import sys, wave
import numpy as np
SR = 44100; DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 80.0; BPM = 100; BEAT = 60 / BPM; N = int(SR * DUR)
rng = np.random.default_rng(7)
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
t_all = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N); FX_L = np.zeros(N); FX_R = np.zeros(N)
def add(buf, start, sig, gain=1.0):
    i = int(start * SR)
    if i >= N: return
    j = min(N, i + len(sig)); buf[i:j] += sig[: j - i] * gain
def env(n, a, d, sustain=0.0, rel=0.0):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / max(d, 1e-4))
    return e
# acordes: Cmaj7 · Am7 · Fmaj7 · G6  (2 compases cada ciclo de 4 acordes = 4 compases de 2.4 s)
BAR = 4 * BEAT
CH = [[48, 55, 59, 64, 67], [45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [43, 50, 55, 59, 64]]
ARP = [[0, 2, 3, 4, 3, 2, 3, 1], [0, 2, 3, 4, 3, 2, 4, 3], [0, 2, 3, 4, 2, 3, 4, 3], [0, 1, 2, 3, 4, 3, 2, 1]]
def section_level(t):  # energía por tramos del vídeo
    return 0.0 if t < 5 else (0.7 if t < 27 else (0.35 if t < 29.5 else (1.0 if t < 62 else (0.6 if t < 68.4 else (1.1 if t < DUR - 4.6 else 0.2)))))
nbars = int(DUR / BAR) + 1
for b in range(nbars):
    t0 = b * BAR; ch = CH[b % 4]; lvl = section_level(t0 + 0.1)
    # pad: seno + armónicos suaves, ataque lento, ligero coro por desafinación
    n = int(SR * (BAR + 1.4)); tt = np.arange(n) / SR; e = np.minimum(1, tt / 1.1) * np.minimum(1, (BAR + 1.4 - tt) / 1.2)
    for k, m in enumerate(ch):
        for det, pan in ((-0.0025, -0.5), (0.0025, 0.5), (0, 0)):
            f = midi(m + 12 * (k > 2) - 0) * (1 + det); s = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) + 0.12 * np.sin(6 * np.pi * f * tt)) * e * 0.045
            add(L, t0, s, 1 - max(0, pan)); add(R, t0, s, 1 + min(0, pan)); add(FX_L, t0, s, .5); add(FX_R, t0, s, .5)
    # bajo (a partir del segundo tramo)
    if lvl > 0.3 and t0 > 4:
        for beat in range(4):
            if beat in (0, 2) or lvl > 0.9:
                nn = int(SR * BEAT * 0.9); tt2 = np.arange(nn) / SR; f = midi(ch[0] - 12); s = np.sin(2 * np.pi * f * tt2) * np.exp(-tt2 / 0.42) * 0.20 * lvl
                add(L, t0 + beat * BEAT, s); add(R, t0 + beat * BEAT, s)
    # arpegio (plucks)
    if lvl > 0.0 and t0 >= 4.8:
        step = BEAT / 2
        for i, idx in enumerate(ARP[b % 4]):
            m = ch[idx] + 12 + (12 if (lvl > 0.95 and i % 4 == 2) else 0); ts = t0 + i * step
            if lvl < 0.5 and i % 2: continue
            nn = int(SR * 1.2); tt3 = np.arange(nn) / SR; f = midi(m)
            s = (np.sin(2 * np.pi * f * tt3) + 0.4 * np.sin(4 * np.pi * f * tt3) * np.exp(-tt3 / .15) + 0.15 * np.sin(6 * np.pi * f * tt3) * np.exp(-tt3 / .08)) * np.exp(-tt3 / 0.28) * np.minimum(1, tt3 / 0.004)
            g = 0.10 * min(1, lvl) * (0.8 if i % 2 else 1.0); pan = -0.4 if i % 2 else 0.4
            add(L, ts, s, g * (1 - max(0, pan))); add(R, ts + 0.012, s, g * (1 + min(0, pan))); add(FX_L, ts, s, g * .7); add(FX_R, ts, s, g * .7)
    # campanilla en la intro/outro
    if t0 < 5 or t0 >= DUR - 5:
        for i, m in enumerate([ch[3] + 24, ch[4] + 12]):
            ts = t0 + i * BEAT * 2 + .3; nn = int(SR * 2.4); tt4 = np.arange(nn) / SR; f = midi(m)
            s = (np.sin(2 * np.pi * f * tt4) + 0.5 * np.sin(2 * np.pi * f * 2.76 * tt4) * np.exp(-tt4 / .4)) * np.exp(-tt4 / 0.9) * 0.08
            add(L, ts, s); add(R, ts, s); add(FX_L, ts, s, 1.3); add(FX_R, ts, s, 1.3)
# percusión
kicks = []
t = 5.0
while t < DUR - 5.0:
    kicks.append(t); t += BEAT
for k, tk in enumerate(kicks):
    if 27 <= tk < 29.5 and k % 2: continue
    nn = int(SR * 0.32); tt = np.arange(nn) / SR; f = 45 + 95 * np.exp(-tt / 0.045); ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-tt / 0.11) * 0.55; add(L, tk, s); add(R, tk, s)
# hi-hat a contratiempo desde 10 s; palmada en 2 y 4 desde 29.5 s
def hp(x): return np.concatenate([[0], np.diff(x)])
t = 10.0
while t < DUR - 5.0:
    nn = int(SR * 0.05); tt = np.arange(nn) / SR; s = hp(rng.standard_normal(nn)) * np.exp(-tt / 0.010) * 0.04
    add(L, t + BEAT / 2, s, .9); add(R, t + BEAT / 2, s, 1.1); t += BEAT
bar_i = 0; t = 29.5
while t < DUR - 5.0:
    for beat in (1, 3):
        tc = t + beat * BEAT; nn = int(SR * 0.18); tt = np.arange(nn) / SR; s = hp(rng.standard_normal(nn)) * np.exp(-tt / 0.03) * 0.045
        add(L, tc, s); add(R, tc, s); add(FX_L, tc, s, .8); add(FX_R, tc, s, .8)
    t += BAR
# riser antes del tramo del cliente (27–29.5)
nn = int(SR * 2.5); tt = np.arange(nn) / SR; ns = hp(rng.standard_normal(nn)); s = ns * (tt / 2.5) ** 2.6 * 0.05; add(L, 27, s); add(R, 27, s)
# reverb por convolución (IR de ruido que decae)
ir_n = int(SR * 2.2); ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR / 0.55); ir /= np.sqrt(np.sum(ir ** 2))
def conv(x):
    n = 1 << int(np.ceil(np.log2(len(x) + len(ir)))); return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[:N]
irR = ir[::-1].copy()
wl = conv(FX_L); ir = irR; wr = conv(FX_R)
L += wl * 0.55; R += wr * 0.55
# pumping suave con el bombo (5–55 s)
duck = np.ones(N)
for tk in kicks:
    i = int(tk * SR); n = int(SR * 0.35); tt = np.arange(min(n, N - i)) / SR; duck[i:i + len(tt)] *= 1 - 0.28 * np.exp(-tt / 0.11)
# la percusión no se atenúa: aplicamos el duck solo al conjunto armónico estimado (mezcla simple: global ligero)
L *= 0.75 + 0.25 * duck; R *= 0.75 + 0.25 * duck
# fundidos y normalización
fi = np.minimum(1, t_all / 1.2); fo = np.minimum(1, (DUR - t_all) / 3.2); L *= fi * fo; R *= fi * fo
pk = max(np.abs(L).max(), np.abs(R).max()); L *= 0.89 / pk; R *= 0.89 / pk
out = np.stack([L, R], 1); data = (np.clip(out, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[1], 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())
print('música ok', sys.argv[1])
