/**
 * Dates de la Coupe Davis — module PUR. Les heures se saisissent et s'affichent à l'heure de Paris
 * (le serveur Vercel tourne en UTC).
 */

const FUSEAU = 'Europe/Paris';

/** Décalage de Paris par rapport à UTC, en minutes, à l'instant donné (60 l'hiver, 120 l'été). */
function decalageParisMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSEAU,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const v = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const enUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'));
  return Math.round((enUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/** « 2026-11-18T14:00 » (heure de Paris, champ datetime-local) -> ISO UTC. Null si illisible. */
export function parisVersIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [annee, mois, jour, heure, minute] = m.slice(1).map(Number);
  const suppose = Date.UTC(annee, mois - 1, jour, heure, minute);
  // Deux passes : le décalage se lit à l'instant corrigé (utile autour du changement d'heure).
  let instant = suppose - decalageParisMinutes(new Date(suppose)) * 60000;
  instant = suppose - decalageParisMinutes(new Date(instant)) * 60000;
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO UTC -> « 2026-11-18T14:00 » à l'heure de Paris (valeur d'un champ datetime-local). */
export function isoVersParis(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const t = new Date(d.getTime() + decalageParisMinutes(d) * 60000).toISOString();
  return t.slice(0, 16);
}

/** « mer. 18 nov., 14:00 » — pour l'affichage. */
export function formaterDebut(iso: string | null | undefined): string {
  if (!iso) return 'Horaire à renseigner';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Horaire à renseigner';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
