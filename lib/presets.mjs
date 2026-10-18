// Reconocimiento de exportaciones conocidas por su firma de cabeceras. Un preset es: firma + (opcional) plan declarativo + guía de exportación.
// REGLA: no se añade ningún preset de un programa sin una exportación real delante (anonimizada). Hoy solo hay los que se pueden afirmar con certeza.
import { norm } from './importer.mjs';

export const PRESETS = [
  { id: 'google-contacts', name: 'Google Contactos', kind: 'clientes', sig: ['given name', 'family name', 'e mail 1 value', 'phone 1 value'], min: 3,
    howto: ['Abre contacts.google.com.', 'Pulsa «Exportar» (menú de la izquierda) y elige «Google CSV».', 'Sube aquí el archivo descargado.'] },
  { id: 'outlook-contacts-en', name: 'Outlook (inglés)', kind: 'clientes', sig: ['first name', 'last name', 'e mail address', 'mobile phone', 'business street'], min: 3,
    howto: ['En Outlook: Archivo → Abrir y exportar → Importar/Exportar → «Exportar a un archivo» → «Valores separados por comas».', 'Elige la carpeta Contactos y guarda el .csv.', 'Sube aquí el archivo (o exporta los contactos como vCard desde «Personas»).'] },
  { id: 'outlook-contacts-es', name: 'Outlook (español)', kind: 'clientes', sig: ['nombre', 'apellidos', 'direccion de correo electronico', 'telefono movil', 'calle del trabajo'], min: 3,
    howto: ['En Outlook: Archivo → Abrir y exportar → Importar o exportar → «Exportar a un archivo» → «Valores separados por comas».', 'Elige la carpeta Contactos y guarda el .csv.', 'Sube aquí el archivo.'] },
];
// Guías de exportación para quien aún no tiene el archivo (sin firma: no se afirma nada sobre sus cabeceras).
export const GUIDES = [
  { id: 'apple-contacts', name: 'Contactos de macOS', steps: ['En la app de escritorio de REM: paso «Traer tus datos» → «Leer mis Contactos».', 'O en Contactos: selecciona los contactos → Archivo → Exportar → «Exportar vCard…» y sube el .vcf.'] },
  { id: 'pipedrive', name: 'Pipedrive', steps: ['Ajustes → Exportar datos.', 'Elige Personas y/o Organizaciones y descarga el CSV.', 'Sube el archivo: si las columnas no se reconocen solas, usa «Ordenar con IA».'] },
  { id: 'hubspot', name: 'HubSpot', steps: ['Contactos → Exportar.', 'Elige «CSV» y las propiedades que quieras; recibirás el archivo por correo.', 'Sube el archivo: si las columnas no se reconocen solas, usa «Ordenar con IA».'] },
  { id: 'zoho', name: 'Zoho CRM', steps: ['Configuración → Administración de datos → Exportar.', 'Elige el módulo Contactos y descarga el CSV.', 'Sube el archivo: si las columnas no se reconocen solas, usa «Ordenar con IA».'] },
  { id: 'facturae', name: 'Programas de facturación (Holded, Quipu, Billin…)', steps: ['Si tu programa exporta facturas en formato Facturae (XML), usa «Facturas electrónicas (Facturae XML)».', 'Si no, exporta a Excel/CSV desde el listado de facturas o de contactos y sube el archivo; con «Ordenar con IA» se entiende casi cualquier exportación.'] },
];

export function detectPreset(kind, headers) {
  const H = new Set(headers.map((h) => norm(h)));
  let best = null; for (const p of PRESETS) { if (p.kind !== kind) continue; const hit = p.sig.filter((s) => H.has(s)).length; if (hit >= p.min && (!best || hit > best.hit)) best = { hit, p }; }
  return best ? { id: best.p.id, name: best.p.name, howto: best.p.howto, matched: best.hit } : null;
}
