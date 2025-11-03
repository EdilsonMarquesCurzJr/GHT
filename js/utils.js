import { config } from './config.js';

export function genId(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function minutesToX(min) {
  const range = config.endTimeMin - config.startTimeMin;
  // prefer using the actual SVG width if present in the DOM so scale matches rendering area
  let svgWidth = config.width;
  try {
    const svg = document.getElementById('stage');
    if (svg) {
      const attrW = svg.getAttribute('width');
      const w = (attrW && !isNaN(parseInt(attrW))) ? parseInt(attrW) : svg.clientWidth;
      if (w && !isNaN(w)) svgWidth = w;
    }
  } catch (e) {}

  // if config.width is a string like '98vw', convert to pixels using window.innerWidth
  if (typeof svgWidth === 'string' && svgWidth.trim().toLowerCase().endsWith('vw')) {
    const pct = parseFloat(svgWidth);
    if (!isNaN(pct) && typeof window !== 'undefined') {
      svgWidth = Math.round((pct / 100) * window.innerWidth);
    } else {
      svgWidth = config.width = parseInt(config.width) || 800;
    }
  }

  const usable = Math.max(10, (Number(svgWidth) || 0) - config.leftWidth);
  const frac = (min - config.startTimeMin) / Math.max(1, range);
  return config.leftWidth + Math.round(frac * usable);
}

export function xToMinutes(x) {
  // read SVG width to invert the same mapping used in minutesToX
  let svgWidth = config.width;
  try {
    const svg = document.getElementById('stage');
    if (svg) {
      const attrW = svg.getAttribute('width');
      const w = (attrW && !isNaN(parseInt(attrW))) ? parseInt(attrW) : svg.clientWidth;
      if (w && !isNaN(w)) svgWidth = w;
    }
  } catch (e) {}

  if (typeof svgWidth === 'string' && svgWidth.trim().toLowerCase().endsWith('vw')) {
    const pct = parseFloat(svgWidth);
    if (!isNaN(pct) && typeof window !== 'undefined') {
      svgWidth = Math.round((pct / 100) * window.innerWidth);
    } else {
      svgWidth = config.width = parseInt(config.width) || 800;
    }
  }

  const usable = Math.max(10, (Number(svgWidth) || 0) - config.leftWidth);
  const px = clamp(x - config.leftWidth, 0, usable);
  const range = Math.max(1, config.endTimeMin - config.startTimeMin);
  return Math.round((px / usable) * range + config.startTimeMin);
}

export function snapMinutes(min) {
  const s = config.snapMin || 1;
  return Math.round(min / s) * s;
}

let TOTAL_STATIONS = 9;
export function setStations(arrOrCount) {
  if (Array.isArray(arrOrCount)) TOTAL_STATIONS = arrOrCount.length;
  else if (typeof arrOrCount === 'number') TOTAL_STATIONS = arrOrCount;
}

export function stationIndexToY(i) {
  // match previous behavior: spread stations evenly across config.height
  const gap = config.height / (Math.max(1, TOTAL_STATIONS - 1));
  return Math.round(i * gap);
}

export function yToStationIndex(y) {
  const gap = config.height / (Math.max(1, TOTAL_STATIONS - 1));
  const idx = Math.round(y / gap);
  return clamp(idx, 0, Math.max(0, TOTAL_STATIONS - 1));
}

export function minutesToClock(min) {
  if (min >= 24 * 60) return '24:00';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
