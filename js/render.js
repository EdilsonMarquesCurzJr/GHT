import { config } from './config.js';
import { minutesToX, stationIndexToY, minutesToClock } from './utils.js';

// Render helpers: renderLeft, render (grid + trains), drawTrain (used internally)

export function renderLeft(leftPanel, timeRow, stations) {
  leftPanel.innerHTML = '';
  for (let i = 0; i < stations.length; i++) {
    const div = document.createElement('div');
    div.className = 'station';
    div.style.height = config.height / (stations.length - 1) + 'px';
    div.textContent = stations[i] || '';
    leftPanel.appendChild(div);
  }

  timeRow.innerHTML = '';
  for (let m = config.startTimeMin; m <= config.endTimeMin; m += config.minutesPerTick) {
    const tick = document.createElement('div');
    tick.className = 'time-tick';
    tick.style.left = minutesToX(m) + 'px';
    tick.textContent = minutesToClock(m);
    timeRow.appendChild(tick);
  }
}

function drawTrain(train, parent, handlers) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('data-train-id', train.id);
  const pts = train.stops.map((s) => ({
    x: minutesToX(s.time),
    y: stationIndexToY(s.station) + config.timeRowHeight,
    station: s.station,
    time: s.time,
  }));

  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', p1.x);
    line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x);
    line.setAttribute('y2', p2.y);
    line.setAttribute('stroke', train.color);
    line.setAttribute('stroke-width', 2);
    line.setAttribute('class', 'polyline draggable');
    if (p1.y !== p2.y) line.setAttribute('stroke-dasharray', '6,4');
    if (handlers && handlers.onPolyMouseDown) line.addEventListener('mousedown', handlers.onPolyMouseDown);
    g.appendChild(line);
  }

  if (pts.length > 0) {
    const lab = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lab.setAttribute('x', Math.max(pts[0].x - 40, 2));
    lab.setAttribute('y', pts[0].y - 8);
    lab.setAttribute('class', 'train-label');
    lab.setAttribute('fill', train.color);
    lab.textContent = train.name;
    g.appendChild(lab);
  }

  pts.forEach((p, idx) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', config.pointRadius);
    circle.setAttribute('fill', train.color);
    circle.setAttribute('class', 'point draggable');
    circle.setAttribute('data-train-id', train.id);
    circle.setAttribute('data-stop-idx', idx);
    if (handlers && handlers.onPointMouseDown) circle.addEventListener('mousedown', handlers.onPointMouseDown);

    const tlabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tlabel.setAttribute('x', p.x + 10);
    tlabel.setAttribute('y', p.y + 4);
    tlabel.setAttribute('class', 'small');
    tlabel.setAttribute('fill', '#102734');
    tlabel.textContent = minutesToClock(p.time);
    g.appendChild(tlabel);
    g.appendChild(circle);
  });

  const last = pts[pts.length - 1];
  if (last) {
    const del = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    del.setAttribute('x', last.x + 8);
    del.setAttribute('y', last.y - 50);
    del.setAttribute('width', 18);
    del.setAttribute('height', 18);
    del.setAttribute('rx', 4);
    del.setAttribute('fill', '#ffeded');
    del.setAttribute('stroke', '#ffbcbc');
    del.setAttribute('class', 'draggable');
    del.style.cursor = 'pointer';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (handlers && handlers.onRemoveTrain) handlers.onRemoveTrain(train.id);
    });
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', last.x + 17);
    txt.setAttribute('y', last.y - 38);
    txt.setAttribute('fill', '#b33');
    txt.setAttribute('font-size', '12');
    txt.setAttribute('text-anchor', 'middle');
    txt.style.pointerEvents = 'none';
    txt.textContent = '✕';
    g.appendChild(del);
    g.appendChild(txt);

    const add = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    add.setAttribute('x', last.x + 8);
    add.setAttribute('y', last.y - 25);
    add.setAttribute('width', 18);
    add.setAttribute('height', 18);
    add.setAttribute('rx', 4);
    add.setAttribute('fill', '#29e6498b');
    add.setAttribute('stroke', '#29e6498b');
    add.setAttribute('class', 'draggable');
    add.style.cursor = 'pointer';
    add.addEventListener('click', (e) => {
      e.stopPropagation();
      if (handlers && handlers.onAddVertex) handlers.onAddVertex(train.id);
    });
    const addTxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    addTxt.setAttribute('x', last.x + 17);
    addTxt.setAttribute('y', last.y - 13);
    addTxt.setAttribute('fill', 'rgba(255, 255, 255, 1)');
    addTxt.setAttribute('font-size', '12');
    addTxt.setAttribute('text-anchor', 'middle');
    addTxt.style.pointerEvents = 'none';
    addTxt.textContent = '+';
    g.appendChild(add);
    g.appendChild(addTxt);
  }

  parent.appendChild(g);
}

export function render(svg, state, restricoes, stations, handlers) {
  // Ensure svg has the correct pixel dimensions based on config.width (supports 'vw')
  try {
    let desiredWidth = config.width;
    if (typeof desiredWidth === 'string' && desiredWidth.trim().toLowerCase().endsWith('vw')) {
      const pct = parseFloat(desiredWidth);
      if (!isNaN(pct) && typeof window !== 'undefined') desiredWidth = Math.round((pct / 100) * window.innerWidth);
      else desiredWidth = parseInt(desiredWidth) || 800;
    }
    desiredWidth = Number(desiredWidth) || svg.clientWidth || 800;
    svg.setAttribute('width', desiredWidth);
    svg.setAttribute('height', config.height + config.timeRowHeight);
  } catch (e) {
    // ignore
  }

  svg.innerHTML = '';
  const grid = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  restricoes.forEach((r, ri) => {
    const y = stationIndexToY(r.station) + config.timeRowHeight;
    const h = 18;
    const x1 = minutesToX(r.start);
    const x2 = minutesToX(r.end);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x1);
    rect.setAttribute('y', y - h / 2);
    rect.setAttribute('width', Math.max(1, x2 - x1));
    rect.setAttribute('height', h);
    rect.setAttribute('fill', '#f05a5a');
    rect.setAttribute('fill-opacity', '0.18');
    rect.setAttribute('stroke', '#f05a5a');
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('rx', '4');
    grid.appendChild(rect);

    const bx = Math.round((x1 + x2) / 2) - 10;
    const by = y - h / 2 - 20;
    const btn = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    btn.setAttribute('class', 'restr-del');
    const brect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    brect.setAttribute('x', bx);
    brect.setAttribute('y', by);
    brect.setAttribute('width', 20);
    brect.setAttribute('height', 16);
    brect.setAttribute('rx', 4);
    brect.setAttribute('fill', '#ffeded');
    brect.setAttribute('stroke', '#ffbcbc');
    brect.style.cursor = 'pointer';
    btn.appendChild(brect);
    const btxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    btxt.setAttribute('x', bx + 10);
    btxt.setAttribute('y', by + 12);
    btxt.setAttribute('fill', '#b33');
    btxt.setAttribute('font-size', '12');
    btxt.setAttribute('text-anchor', 'middle');
    btxt.style.pointerEvents = 'none';
    btxt.textContent = '✕';
    btn.appendChild(btxt);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (handlers && handlers.onRemoveRestr) handlers.onRemoveRestr(ri);
    });
    grid.appendChild(btn);
  });

  for (let i = 0; i < stations.length; i++) {
    const y = stationIndexToY(i) + config.timeRowHeight;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 0);
    // use minutesToX for the rightmost x so it follows the same scale as points
    line.setAttribute('x2', minutesToX(config.endTimeMin));
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#eef4ff');
    line.setAttribute('stroke-width', 1);
    grid.appendChild(line);
  }

  const span = config.endTimeMin - config.startTimeMin;
  const step = 30;
  for (let m = config.startTimeMin; m <= config.endTimeMin; m += step) {
    const x = minutesToX(m);
    const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    v.setAttribute('x1', x);
    v.setAttribute('x2', x);
    v.setAttribute('y1', config.timeRowHeight);
    v.setAttribute('y2', config.height + config.timeRowHeight);
    v.setAttribute('stroke', '#f1f5fb');
    v.setAttribute('stroke-width', 1);
    grid.appendChild(v);
  }

  svg.appendChild(grid);

  const trainsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  trainsG.setAttribute('transform', `translate(0,0)`);
  svg.appendChild(trainsG);

  (state.trains || []).forEach((t) => drawTrain(t, trainsG, handlers));
}
