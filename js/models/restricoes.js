// Restrição helpers that operate on a provided restricoes array
// Each restrição object shape: { station: number, start: minutes, end: minutes, date: 'YYYY-MM-DD' }

export function segmentoProibido(restricoes, stationIdx, t1, t2, date, todayISO) {
  if (t2 < t1) [t1, t2] = [t2, t1];
  return (restricoes || []).some((r) => {
    const rDate = r.date || todayISO;
    if (r.station !== stationIdx) return false;
    if (rDate !== (date || todayISO)) return false;
    return t1 < r.end && t2 > r.start;
  });
}

export function isRestrito(restricoes, stationIdx, timeMin, date, todayISO) {
  return (restricoes || []).some((r) => {
    const rDate = r.date || todayISO;
    if (r.station !== stationIdx) return false;
    if (rDate !== (date || todayISO)) return false;
    return timeMin >= r.start && timeMin < r.end;
  });
}

export function addRestricao(restricoes, obj) {
  restricoes.push(obj);
}

export function removeRestricao(restricoes, index) {
  if (index >= 0 && index < restricoes.length) restricoes.splice(index, 1);
}
