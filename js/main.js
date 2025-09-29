/*
  Implementação do Gráfico Hora–Trem
  - modelo de dados simples: estações + trens com paradas (stationIndex, timeMinutes)
  - renderiza em SVG: linhas + pontos + labels
  - interação: arrastar pontos, arrastar linha inteira, adicionar/remover trens
*/

(function () {
  // CONFIG
  const config = {
    width: 1200, // largura da área de desenho (exclui left panel)
    height: 600,
    leftWidth: 140,
    timeRowHeight: 40,
    startTimeMin: 5 * 60, // 05:00 em minutos
    endTimeMin: 26 * 60, // 26:00 -> 02:00 do dia seguinte, por exemplo
    minutesPerTick: 60, // rótulo maior a cada 60 minutos
    snapMin: 5, // snap (minutos)
    stationHeight: 60,
    pointRadius: 6,
  };

  // Estações (exemplo)
  const stations = [
    "Estação A",
    "Estação B",
    "Estação C",
    "Estação D",
    "Estação E",
    "Estação F",
      "Estação D",
    "Estação E",
    "Estação F",

  ];

  // Cores de exemplo
  const palette = [
    "#0b6797",
    "#f05a5a",
    "#20a39e",
    "#8b5cf6",
    "#f59e0b",
    "#10b981",
    "#ef6ab4",
  ];

  // Modelo inicial: alguns trens demo
  const demoTrains = [
    {
      id: genId(),
      name: "Trem 101",
      color: palette[0],
      stops: [
        { station: 0, time: 6 * 60 + 20 },
        { station: 2, time: 7 * 60 + 0 },
        { station: 5, time: 8 * 60 + 15 },
        { station: 7, time: 8 * 60 + 15 },
        { station: 6, time: 8 * 60 + 15 },
      ],
    },
    {
      id: genId(),
      name: "Trem 202",
      color: palette[1],
      stops: [
        { station: 0, time: 5 * 60 + 40 },
        { station: 1, time: 6 * 60 + 10 },
        { station: 3, time: 7 * 60 + 30 },
        { station: 5, time: 9 * 60 + 0 },
      ],
    },
  ];

  // Estado
  let state = {
    trains: loadFromStorage() || demoTrains,
    selected: null, // {trainId, type:'point'|'line', index}
  };

  // DOM refs
  const svg = document.getElementById("stage");
  const leftPanel = document.getElementById("leftPanel");
  const timeRow = document.getElementById("timeRow");
  const jsonArea = document.getElementById("jsonArea");
  const addTrainBtn = document.getElementById("addTrain");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const applyImportBtn = document.getElementById("applyImport");
  const clearBtn = document.getElementById("clearBtn");
  const rangeLabel = document.getElementById("rangeLabel");
  const snapLabel = document.getElementById("snapLabel");

  // initialize sizes
  svg.setAttribute("width", config.width);
  svg.setAttribute("height", config.height + config.timeRowHeight);
  document.documentElement.style.setProperty(
    "--w",
    config.width + config.leftWidth + 20 + "px"
  );
  document.documentElement.style.setProperty("--h", config.height + "px");

  // helpers
  function genId() {
    return "t" + Math.floor(Math.random() * 1e9).toString(36);
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function minutesToX(min) {
    const span = config.endTimeMin - config.startTimeMin;
    const rel = (min - config.startTimeMin) / span;
    return Math.round(rel * config.width);
  }
  function xToMinutes(x) {
    const span = config.endTimeMin - config.startTimeMin;
    const rel = x / config.width;
    return config.startTimeMin + rel * span;
  }
  function snapMinutes(min) {
    const s = config.snapMin;
    return Math.round(min / s) * s;
  }
  function stationIndexToY(idx) {
    const totalStations = stations.length;
    const gap = config.height / (totalStations - 1);
    return Math.round(idx * gap);
  }
  function yToStationIndex(y) {
    // snap to nearest station
    const totalStations = stations.length;
    const gap = config.height / (totalStations - 1);
    const idx = Math.round(y / gap);
    return clamp(idx, 0, totalStations - 1);
  }

  // render left station list and time row
  function renderLeft() {
    leftPanel.innerHTML = "";
    for (let i = 0; i < stations.length; i++) {
      const div = document.createElement("div");
      div.className = "station";
      div.style.height = config.height / (stations.length - 1) + "px";
      div.innerHTML = `<div style="display:flex;align-items:center"><div class="dot" style="background:${
        palette[i % palette.length]
      }"></div><div>${stations[i]}</div></div>`;
      leftPanel.appendChild(div);
    }
    // time labels
    timeRow.innerHTML = "";
    const span = config.endTimeMin - config.startTimeMin;
    const ticks = Math.ceil(span / config.minutesPerTick);
    for (let i = 0; i <= ticks; i++) {
      const m = config.startTimeMin + i * config.minutesPerTick;
      const label = minutesToClock(m);
      const x = minutesToX(m);
      const el = document.createElement("div");
      el.className = "time-label";
      el.style.position = "absolute";
      el.style.left = config.leftWidth + x + 6 + "px";
      el.innerText = label;
      timeRow.appendChild(el);
      // thin tick
      const tick = document.createElement("div");
      tick.style.position = "absolute";
      tick.style.left = config.leftWidth + x + "px";
      tick.style.top = "28px";
      tick.style.width = "1px";
      tick.style.height = "12px";
      tick.style.background = "#dbe7fb";
      timeRow.appendChild(tick);
    }
    rangeLabel.innerText =
      minutesToClock(config.startTimeMin) +
      " — " +
      minutesToClock(config.endTimeMin);
    snapLabel.innerText = config.snapMin + " min";
  }

  function minutesToClock(min) {
    // normaliza para 0..23h
    const hh = Math.floor(min / 60) % 24;
    const mm = Math.floor(min % 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  // main render of trains
  function render() {
    svg.innerHTML = ""; // clear
    // background grid: vertical time grid & horizontal station lines
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
    // horizontal station lines
    for (let i = 0; i < stations.length; i++) {
      const y = stationIndexToY(i) + config.timeRowHeight;
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      line.setAttribute("x1", 0);
      line.setAttribute("x2", config.width);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", "#eef4ff");
      line.setAttribute("stroke-width", 1);
      grid.appendChild(line);
    }
    // vertical thin ticks every 30min
    const span = config.endTimeMin - config.startTimeMin;
    const step = 30;
    for (let m = config.startTimeMin; m <= config.endTimeMin; m += step) {
      const x = minutesToX(m);
      const v = document.createElementNS("http://www.w3.org/2000/svg", "line");
      v.setAttribute("x1", x);
      v.setAttribute("x2", x);
      v.setAttribute("y1", config.timeRowHeight);
      v.setAttribute("y2", config.height + config.timeRowHeight);
      v.setAttribute("stroke", "#f1f5fb");
      v.setAttribute("stroke-width", 1);
      grid.appendChild(v);
    }
    svg.appendChild(grid);

    // group for trains
    const trainsG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    trainsG.setAttribute("transform", `translate(0,0)`);
    svg.appendChild(trainsG);

    // draw each train
    state.trains.forEach((train, ti) => {
      drawTrain(train, trainsG);
    });
  }

  function drawTrain(train, parent) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("data-train-id", train.id);
    // compute points
    const pts = train.stops.map((s) => {
      const x = minutesToX(s.time);
      const y = stationIndexToY(s.station) + config.timeRowHeight;
      return { x, y, station: s.station, time: s.time };
    });

    // polyline
    const poly = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polyline"
    );
    poly.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
    poly.setAttribute("stroke", train.color);
    poly.setAttribute("class", "polyline draggable");
    poly.setAttribute("fill", "none");
    poly.addEventListener("mousedown", onPolyMouseDown);
    g.appendChild(poly);

    // label near first point
    if (pts.length > 0) {
      const lab = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      lab.setAttribute("x", Math.max(pts[0].x - 40, 2));
      lab.setAttribute("y", pts[0].y - 8);
      lab.setAttribute("class", "train-label");
      lab.setAttribute("fill", train.color);
      lab.textContent = train.name;
      g.appendChild(lab);
    }

    // points
    pts.forEach((p, idx) => {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", p.y);
      circle.setAttribute("r", config.pointRadius);
      circle.setAttribute("fill", train.color);
      circle.setAttribute("class", "point draggable");
      circle.setAttribute("data-train-id", train.id);
      circle.setAttribute("data-stop-idx", idx);
      circle.addEventListener("mousedown", onPointMouseDown);
      // label time
      const tlabel = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      tlabel.setAttribute("x", p.x + 10);
      tlabel.setAttribute("y", p.y + 4);
      tlabel.setAttribute("class", "small");
      tlabel.setAttribute("fill", "#102734");
      tlabel.textContent = minutesToClock(p.time);
      g.appendChild(tlabel);
      g.appendChild(circle);
    });

    // add a small delete button (SVG rect) at end
    const last = pts[pts.length - 1];
    if (last) {
      const del = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      del.setAttribute("x", last.x + 14);
      del.setAttribute("y", last.y - 10);
      del.setAttribute("width", 18);
      del.setAttribute("height", 18);
      del.setAttribute("rx", 4);
      del.setAttribute("fill", "#ffeded");
      del.setAttribute("stroke", "#ffbcbc");
      del.setAttribute("class", "draggable");
      del.style.cursor = "pointer";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm('Remover trem "' + train.name + '"?')) {
          removeTrain(train.id);
        }
      });
      const txt = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      txt.setAttribute("x", last.x + 23);
      txt.setAttribute("y", last.y + 4);
      txt.setAttribute("fill", "#b33");
      txt.setAttribute("font-size", "12");
      txt.setAttribute("text-anchor", "middle");
      txt.style.pointerEvents = "none";
      txt.textContent = "✕";
      g.appendChild(del);
      g.appendChild(txt);
    }

    if (last) {
      const del = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      del.setAttribute("x", last.x + 14);
      del.setAttribute("y", last.y - 25);
      del.setAttribute("width", 18);
      del.setAttribute("height", 18);
      del.setAttribute("rx", 4);
      del.setAttribute("fill", "#29e6498b");
      del.setAttribute("stroke", "#29e6498b");
      del.setAttribute("class", "draggable");
      del.style.cursor = "pointer";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        AddVertice(train.id);
      });
      const txt = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      txt.setAttribute("x", last.x + 23);
      txt.setAttribute("y", last.y - 13);
      txt.setAttribute("fill", "rgba(255, 255, 255, 1)");
      txt.setAttribute("font-size", "12");
      txt.setAttribute("text-anchor", "middle");
      txt.style.pointerEvents = "none";
      txt.textContent = "+";
      g.appendChild(del);
      g.appendChild(txt);
    }

    parent.appendChild(g);
  }

  // Interaction state
  let dragState = null; // {type:'point'|'poly', trainId, stopIdx, startX, startY, initialTimes[], initialStations[]}

  // point dragging
  function onPointMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const circle = e.currentTarget;
    const trainId = circle.getAttribute("data-train-id");
    const stopIdx = parseInt(circle.getAttribute("data-stop-idx"), 10);
    const train = getTrainById(trainId);
    if (!train) return;
    const startX = e.clientX;
    const startY = e.clientY;
    dragState = {
      type: "point",
      trainId,
      stopIdx,
      startX,
      startY,
      initialTime: train.stops[stopIdx].time,
      initialStation: train.stops[stopIdx].station,
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  // polyline dragging (move all times)
  function onPolyMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const poly = e.currentTarget;
    const g = poly.parentNode;
    const trainId = g.getAttribute("data-train-id");
    const train = getTrainById(trainId);
    if (!train) return;
    const startX = e.clientX;
    dragState = {
      type: "poly",
      trainId,
      startX,
      initialTimes: train.stops.map((s) => s.time),
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - (dragState.startY || 0);
    const deltaMin = snapMinutes(xToMinutes(dx) - xToMinutes(0)); // dx -> minutes
    if (dragState.type === "point") {
      const train = getTrainById(dragState.trainId);
      const sIdx = dragState.stopIdx;
      // compute new time by mouse x relative to svg left
      const svgRect = svg.getBoundingClientRect();
      const mouseX = e.clientX - svgRect.left;
      const mouseY = e.clientY - svgRect.top;
      let minutes = xToMinutes(mouseX);
      minutes = snapMinutes(minutes);
      // clamp within global range
      minutes = clamp(minutes, config.startTimeMin, config.endTimeMin);
      // also ensure order: can't be earlier than previous stop + 1min, or later than next stop -1min
      const prev = sIdx > 0 ? train.stops[sIdx - 1].time + 1 : -Infinity;
      const next =
        sIdx < train.stops.length - 1
          ? train.stops[sIdx + 1].time - 1
          : Infinity;
      minutes = clamp(minutes, prev, next);
      // vertical -> allow station change
      let stationIdx = yToStationIndex(mouseY - config.timeRowHeight);
      stationIdx = clamp(stationIdx, 0, stations.length - 1);
      // update model
      train.stops[sIdx].time = minutes;
      train.stops[sIdx].station = stationIdx;
      saveToStorage();
      render();
    } else if (dragState.type === "poly") {
      const train = getTrainById(dragState.trainId);
      const shiftMinutes = deltaMin;
      if (shiftMinutes === 0) return;
      // apply shift but clamp so stops stay within global range
      const newTimes = dragState.initialTimes.map((t) =>
        clamp(t + shiftMinutes, config.startTimeMin, config.endTimeMin)
      );
      // if shifting would compress order (due to clamping), maintain relative by computing minimal allowed shift
      // simpler: ensure monotonic by preserving order; if clamp breaks it, ignore
      let ok = true;
      for (let i = 1; i < newTimes.length; i++) {
        if (newTimes[i] <= newTimes[i - 1]) {
          ok = false;
          break;
        }
      }
      if (!ok) return;
      train.stops.forEach((s, idx) => (s.time = newTimes[idx]));
      saveToStorage();
      render();
    }
  }

  function onMouseUp(e) {
    dragState = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  // utils
  function getTrainById(id) {
    return state.trains.find((t) => t.id === id);
  }
  function removeTrain(id) {
    state.trains = state.trains.filter((t) => t.id !== id);
    saveToStorage();
    render();
  }
  function AddVertice(id) {
    const train = state.trains.find((t) => t.id === id);
    if (!train) return;
    let newStop = { station: 0, time: 0 };
    if (train.stops.length > 0) {
      const last = train.stops[train.stops.length - 1];
      newStop = {
        station: last.station,
        time: last.time + 5,
      };
    }
    train.stops.push(newStop);
    saveToStorage();
    render();
  }

  // storage
  function saveToStorage() {
    try {
      localStorage.setItem("timetable_v1", JSON.stringify(state.trains));
    } catch (e) {}
  }
  function loadFromStorage() {
    try {
      const s = localStorage.getItem("timetable_v1");
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }

  // add train
  addTrainBtn.addEventListener("click", () => {
    const name = prompt("Nome do trem:", "Novo Trem");
    if (name === null) return;
    const id = genId();
    // default stops: first and last station
    const t0 = config.startTimeMin + 30;
    const t1 = config.startTimeMin + 90;
    const stops = [
      { station: 0, time: t0 },
      { station: Math.max(1, stations.length - 1), time: t1 },
    ];
    const color = palette[Math.floor(Math.random() * palette.length)];
    state.trains.push({ id, name: name || "Trem " + id, color, stops });
    saveToStorage();
    render();
  });



  clearBtn.addEventListener("click", () => {
    if (confirm("Limpar armazenamento local e restaurar demo?")) {
      localStorage.removeItem("timetable_v1");
      state.trains = demoTrains.slice();
      render();
    }
  });

  // initial render
  renderLeft();
  render();
})();
