// Voz mínima: dictado (reconocimiento del navegador) y lectura en voz alta (voz del sistema vía el servidor local).
import { toast } from './core.js';
import { api } from './util.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canDictate = !!SR;
let rec = null;
export function dictate(target, btn) {
  if (!SR) return toast('Tu navegador no admite dictado. Prueba con Safari o Chrome.', 'err');
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = true;
  const start = target.value; let finalText = '';
  btn.setAttribute('aria-pressed', 'true'); btn.classList.add('rec');
  rec.onresult = (e) => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; } target.value = (start ? start.replace(/\s*$/, ' ') : '') + finalText + interim; target.dispatchEvent(new Event('input', { bubbles: true })); };
  const done = () => { btn.setAttribute('aria-pressed', 'false'); btn.classList.remove('rec'); rec = null; };
  rec.onend = done; rec.onerror = (e) => { done(); if (e.error === 'not-allowed') toast('Permite el micrófono para dictar.', 'err'); else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('No se pudo dictar.', 'err'); };
  rec.start();
}
let audio = null;
export async function say(text, btn) {
  if (audio) { audio.pause(); audio = null; btn?.setAttribute('aria-pressed', 'false'); return; }
  try {
    btn?.setAttribute('aria-pressed', 'true');
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: JSON.stringify({ text }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo reproducir');
    audio = new Audio(URL.createObjectURL(await r.blob())); audio.onended = () => { audio = null; btn?.setAttribute('aria-pressed', 'false'); }; await audio.play();
  } catch (e) { audio = null; btn?.setAttribute('aria-pressed', 'false'); toast(e.message, 'err'); }
}
