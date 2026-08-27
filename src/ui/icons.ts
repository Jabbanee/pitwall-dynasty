/* Tiny inline SVG icon set used across the UI. All icons are simple,
 * original, monochromatic, and recoloured via `currentColor`. */

const stroke = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'

export function iconCheckered(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M4 5h16v14H4z"/><path d="M4 9h4v4H4zM10 5h4v4h-4zM16 9h4v4h-4zM4 17h4v2H4zM16 17h4v2h-4z"/></svg>`
}

export function iconBolt(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z"/></svg>`
}

export function iconUsers(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><circle cx="9" cy="8" r="3.4"/><circle cx="17" cy="9" r="2.6"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M14 20c0-2 1.6-3.6 4-3.6 1 0 2 .4 3 1"/></svg>`
}

export function iconCar(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M3 14h18l-1.6-5.4a2 2 0 0 0-1.9-1.6H6.5a2 2 0 0 0-1.9 1.6L3 14z"/><path d="M3 14v3h3v-2M21 14v3h-3v-2M6 18h12"/><circle cx="7" cy="14" r="1.4" fill="currentColor"/><circle cx="17" cy="14" r="1.4" fill="currentColor"/></svg>`
}

export function iconCarFront(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M3 16h18M5 16v-3l2-5h10l2 5v3M7 8h10"/><circle cx="7.5" cy="13" r="1.2" fill="currentColor"/><circle cx="16.5" cy="13" r="1.2" fill="currentColor"/><path d="M3 16v3M21 16v3M6 19h12"/></svg>`
}

export function iconRoute(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 6h6a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8h6"/></svg>`
}

export function iconWrench(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4 2.6-2.6z"/></svg>`
}

export function iconTrophy(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M8 3h8v4a4 4 0 0 1-8 0V3z"/><path d="M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 14h6v3H9zM7 20h10"/></svg>`
}

export function iconRadio(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><rect x="9" y="3" width="6" height="12" rx="1.5"/><path d="M5 5a8 8 0 0 1 0 14M19 5a8 8 0 0 1 0 14M8 8a4 4 0 0 1 0 8M16 8a4 4 0 0 1 0 8"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>`
}

export function iconNewspaper(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 8h18M7 12h6M7 15h6M7 18h4M16 12h3v6h-3z"/></svg>`
}

export function iconHelmet(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M5 14a7 7 0 0 1 14 0v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3z"/><path d="M5 14h14M9 5l3 3 3-3M11 12h2"/></svg>`
}

export function iconTrophyStand(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M6 4v6a6 6 0 0 0 12 0V4zM4 4h2M18 4h2M9 18h6M12 16v4M5 20h14"/></svg>`
}

export function iconFlask(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M9 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-10V3M8 3h8"/><path d="M7 15h10"/></svg>`
}

export function iconCpu(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>`
}

export function iconLayers(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`
}

export function iconCloud(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M7 18a4 4 0 0 1-1-7.9 6 6 0 0 1 11.7-1.6A4 4 0 0 1 19 18H7z"/></svg>`
}

export function iconFlag(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M5 21V4l9 3-9 3"/></svg>`
}

export function iconFactory(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M3 21V11l5 3V11l5 3V8l8 4v9zM3 21h18M7 17h2M11 17h2M15 17h2"/></svg>`
}

export function iconTarget(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`
}

export function iconChart(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M3 3v18h18M7 14l4-4 3 3 7-7"/></svg>`
}

export function iconNewspaperEdit(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><rect x="3" y="4" width="14" height="17" rx="1.5"/><path d="M17 8l4-2v13a1 1 0 0 1-1 1H7"/></svg>`
}

export function iconWarning(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01"/></svg>`
}

export function iconContract(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M5 3h11l3 3v15H5zM8 8h8M8 12h8M8 16h5M14 16l-1 2 3 1 2-3-2-1-2 1z"/></svg>`
}

export function iconFrontWing(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M3 14h18l-2-3-3 1-2-1H6l-2 1-1-1-1 2z"/><path d="M5 14v2M19 14v2"/></svg>`
}

export function iconRearWing(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M3 18h18l-1-4-2 1H6l-2-1-1 4z"/><path d="M5 18v2M19 18v2"/></svg>`
}

export function iconNose(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M10 4h4l3 6v3H7v-3z"/><path d="M7 13l-3 4h16l-3-4"/></svg>`
}

export function iconFloor(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M3 16h18M5 16v-2h14v2M9 14V8M15 14V8"/></svg>`
}

export function iconSidepods(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M3 10h6v4H3zM15 10h6v4h-6z"/><path d="M9 10V8M15 10V8M9 14v2M15 14v2M11 11h2"/></svg>`
}

export function iconCooling(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>`
}

export function iconSuspension(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/><path d="M6 15V8l12 4M18 12l-2-4-5 1"/></svg>`
}

export function iconHeart(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M12 21s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.4-7 10-7 10z"/></svg>`
}

export function iconFist(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M9 11V6a2 2 0 0 1 4 0v5M13 11V4a2 2 0 0 1 4 0v8M17 12V7a2 2 0 0 1 4 0v9a7 7 0 0 1-7 7H11a4 4 0 0 1-4-4v-3a3 3 0 0 1 3-3h7zM5 12a2 2 0 0 1 4 0v3"/></svg>`
}

export function iconLock(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`
}

export function iconCalendar(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><rect x="4" y="6" width="16" height="14" rx="1.5"/><path d="M4 10h16M8 4v4M16 4v4"/></svg>`
}

export function iconSearch(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>`
}

export function iconStar(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z"/></svg>`
}

export function iconStarOutline(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1zM12 5.5L10 9.5 5 10.3l4 3.5-.8 5.2 4.8-2.5 4.8 2.5-.8-5.2 4-3.5-5-.8z"/></svg>`
}

export function iconDocument(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3M9 12h6M9 16h6M9 8h3"/></svg>`
}

export function iconTrend(s: number) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${stroke}><path d="M3 17l5-5 4 4 9-9"/><path d="M14 7h7v7"/></svg>`
}
