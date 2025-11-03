import { genId } from "../utils.js";

// Train-related helpers. These are pure helpers that operate on a trains array

export function getTrainById(trains, id) {
  return trains.find((t) => t.id === id);
}

export function removeTrain(trains, id) {
  const idx = trains.findIndex((t) => t.id === id);
  if (idx >= 0) trains.splice(idx, 1);
  return idx >= 0;
}

export function createVertexForTrain(train, todayISO) {
  if (!train) return null;
  let newStop = { station: 0, time: 0, date: todayISO };
  if (Array.isArray(train.stops) && train.stops.length > 0) {
    const last = train.stops[train.stops.length - 1];
    newStop = {
      station: last.station,
      time: last.time + 5,
      date: last.date || todayISO,
    };
  }
  return newStop;
}

export function addTrain(trains, opts = {}) {
  const t = {
    id: opts.id || genId('t'),
    name: opts.name || `Trem ${Math.floor(Math.random() * 900) + 100}`,
    color: opts.color || "#0b6797",
    stops: opts.stops || [],
  };
  trains.push(t);
  return t;
}
