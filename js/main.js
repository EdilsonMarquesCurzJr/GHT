import { config } from './config.js';
import {
  genId,
  clamp,
  minutesToX,
  xToMinutes,
  snapMinutes,
  stationIndexToY,
  yToStationIndex,
  minutesToClock,
  setStations,
} from './utils.js';
import * as trainsModel from './models/trains.js';
import * as restrModel from './models/restricoes.js';
import * as storage from './storage.js';
import { stations } from './data/stations.js';
import { palette } from './data/palette.js';
import { render as renderModule, renderLeft as renderLeftModule } from './render.js';

// helper: today's date in local YYYY-MM-DD
const todayISO = (function () {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000; // offset in ms
  const local = new Date(Date.now() - tzOffset);
  return local.toISOString().slice(0, 10);
})();

// Restrições: exemplo [{ station: 2, start: 8*60, end: 9*60, date: 'YYYY-MM-DD' }]
/*
let restricoes = [
  // Exemplo: Estação C (índice 2), das 08:00 às 09:00 na data de hoje
  { station: 2, start: 8 * 60, end: 9 * 60, date: todayISO },
  // Adicione mais restrições conforme necessário
];
*/
// restriction helpers are provided by js/models/restricoes.js (restrModel)
/*
  Implementação do Gráfico Hora–Trem
  - modelo de dados simples: estações + trens com paradas (stationIndex, timeMinutes)
  - renderiza em SVG: linhas + pontos + labels
  - interação: arrastar pontos, arrastar linha inteira, adicionar/remover trens
*/

(function () {

  // inform utilities sobre o número de estações para calcular espaçamento
  setStations(stations);

  // Modelo inicial: alguns trens demo
  /*const demoTrains = [
    {
      id: genId(),
      name: "Trem 101",
      color: palette[0],
      stops: [
        { station: 0, time: 6 * 60 + 20, date: todayISO },
        { station: 2, time: 7 * 60 + 0, date: todayISO },
        { station: 5, time: 8 * 60 + 15, date: todayISO },
        { station: 7, time: 8 * 60 + 15, date: todayISO },
        { station: 6, time: 8 * 60 + 15, date: todayISO },
      ],
    },
    {
      id: genId(),
      name: "Trem 202",
      color: palette[1],
      stops: [
        { station: 0, time: 5 * 60 + 40, date: todayISO },
        { station: 1, time: 6 * 60 + 10, date: todayISO },
        { station: 3, time: 7 * 60 + 30, date: todayISO },
        { station: 5, time: 9 * 60 + 0, date: todayISO },
      ],
    },
  ];*/

  // Estado (carrega do localStorage se existir um backup)
  const _stored = storage.loadFromStorage();
  let restricoes = [];
  if (_stored && _stored.restricoes) {
    // atualiza restricoes a partir do storage
    restricoes = _stored.restricoes;
  }
  let state = {
    trains: (_stored && _stored.trains) || [],
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
  // File System Access API handle for local trens.json (session only)
  let localFileHandle = null;
  // Directory handle for writing JS collections (js/data/*.js)
  let localDirHandle = null;
  // IndexedDB key name for persisted handle
  const IDB_DB_NAME = "ght_fs_handles";
  const IDB_STORE = "handles";
  const IDB_KEY = "trens_file";

  // FileSystem handle persistence is implemented in js/storage.js

  // Button to configure remote save endpoint (Power Automate URL)
  let saveEndpointBtn = document.getElementById("saveEndpointBtn");
  if (!saveEndpointBtn) {
    saveEndpointBtn = document.createElement("button");
    saveEndpointBtn.id = "saveEndpointBtn";
    saveEndpointBtn.textContent = "Configurar endpoint";
    saveEndpointBtn.style.margin = "8px 0 8px 8px";
    saveEndpointBtn.style.padding = "6px 12px";
    saveEndpointBtn.style.background = "#e6f7ff";
    saveEndpointBtn.style.border = "1px solid #7cc7ff";
    saveEndpointBtn.style.borderRadius = "6px";
    saveEndpointBtn.style.cursor = "pointer";
    document.body.insertBefore(saveEndpointBtn, document.body.firstChild);
  }
  saveEndpointBtn.onclick = function () {
    const current =
      localStorage.getItem("saveEndpoint") || config.saveEndpoint || "";
    const url = prompt(
      "Cole a URL do endpoint HTTP (ex: Power Automate) para salvar trens.json\nDeixe vazio para limpar:",
      current
    );
    if (url === null) return; // cancel
    if (!url) {
      localStorage.removeItem("saveEndpoint");
      alert("Endpoint removido. O app usará o servidor local (se ativado).");
      return;
    }
    localStorage.setItem("saveEndpoint", url.trim());
    alert("Endpoint salvo: " + url.trim());
  };

  // Button to select a local file (File System Access API). If selected, app will write directly to it on each change.
  let selectLocalBtn = document.getElementById("selectLocalBtn");
  if (!selectLocalBtn) {
    selectLocalBtn = document.createElement("button");
    selectLocalBtn.id = "selectLocalBtn";
    selectLocalBtn.textContent = "Selecionar arquivo local";
    selectLocalBtn.style.margin = "8px 0 8px 8px";
    selectLocalBtn.style.padding = "6px 12px";
    selectLocalBtn.style.background = "#fffbe6";
    selectLocalBtn.style.border = "1px solid #ffe08a";
    selectLocalBtn.style.borderRadius = "6px";
    selectLocalBtn.style.cursor = "pointer";
    document.body.insertBefore(selectLocalBtn, document.body.firstChild);
  }
  selectLocalBtn.onclick = async function () {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: config.sharepointFileName || "trens.json",
          types: [
            {
              description: "JSON",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        localFileHandle = handle;
        // persist the handle so it can be reused across reloads
        try {
          await storage._persistHandle(handle);
        } catch (err) {
          console.warn(
            "persistHandle failed:",
            err && err.message ? err.message : err
          );
        }
        // Immediately write current state to the selected file (overwrites it)
        try {
          storage.saveToStorage({ trains: state.trains, restricoes }, handle);
        } catch (e) {
          console.warn('initial write to selected file failed:', e && e.message ? e.message : e);
        }
        // if a directory for JS collections is set and enabled, write collections too
        try {
          if (localDirHandle) {
            await storage.saveCollectionsToDir(localDirHandle, { trains: state.trains, restricoes });
          }
        } catch (e) {
          console.warn('initial write to dir failed:', e && e.message ? e.message : e);
        }
        try {
          selectLocalBtn.textContent =
            "Arquivo: " + (handle.name || "trens.json");
        } catch (e) {}
        alert(
          "Arquivo selecionado. As alterações serão gravadas nele enquanto a página estiver aberta."
        );
      } catch (e) {
        console.warn("Seleção de arquivo cancelada", e);
      }
    } else {
      alert(
        "API de arquivos não suportada no seu navegador. Será usado download automático como fallback."
      );
    }
  };

  // try to restore previously selected handle (if any)
  (async function () {
    try {
      const restored = await storage._restoreHandle();
      if (restored) {
        localFileHandle = restored;
        try {
          selectLocalBtn.textContent =
            "Arquivo: " + (restored.name || "trens.json");
        } catch (e) {}
      }
      // try to restore directory handle too
      try {
        const drest = await storage._restoreDirHandle();
        if (drest) {
          localDirHandle = drest;
          try {
            // display short name
            const disp = drest.name || 'js/data';
            // create/select button text when we add the button below
          } catch (e) {}
        }
      } catch (e) {
        console.warn('restoreDirHandle failed:', e && e.message ? e.message : e);
      }
    } catch (e) {
      console.warn("restoreHandle failed:", e && e.message ? e.message : e);
    }
  })();

  // small UI for enabling SharePoint direct save
  let spSaveBtn = document.getElementById("spSaveBtn");
  if (!spSaveBtn) {
    spSaveBtn = document.createElement("button");
    spSaveBtn.id = "spSaveBtn";
    spSaveBtn.textContent = "Salvar no SharePoint: OFF";
    spSaveBtn.style.margin = "8px 0 8px 8px";
    spSaveBtn.style.padding = "6px 12px";
    spSaveBtn.style.background = "#fff3f3";
    spSaveBtn.style.border = "1px solid #f4b6b6";
    spSaveBtn.style.borderRadius = "6px";
    spSaveBtn.style.cursor = "pointer";
    document.body.insertBefore(spSaveBtn, document.body.firstChild);
  }
  // initialize from config/localStorage
  try {
    const spOn =
      localStorage.getItem("sharepointSave") === "true" ||
      config.sharepointSave;
    if (spOn) {
      spSaveBtn.textContent = "Salvar no SharePoint: ON";
      spSaveBtn.style.background = "#e6ffef";
    }
  } catch (e) {}
  spSaveBtn.onclick = function () {
    const cur = localStorage.getItem("sharepointSave") === "true";
    const next = !cur;
    localStorage.setItem("sharepointSave", next ? "true" : "false");
    spSaveBtn.textContent = next
      ? "Salvar no SharePoint: ON"
      : "Salvar no SharePoint: OFF";
    spSaveBtn.style.background = next ? "#e6ffef" : "#fff3f3";
    if (next)
      alert(
        "SharePoint save ligado. Verifique config.sharepointFolder e cole o script dentro de uma página SharePoint autenticada."
      );
  };

  // Botão para adicionar restrição
  let restrBtn = document.getElementById("addRestrBtn");
  if (!restrBtn) {
    restrBtn = document.createElement("button");
    restrBtn.id = "addRestrBtn";
    restrBtn.textContent = "Adicionar restrição";
    restrBtn.style.margin = "8px 0 8px 8px";
    restrBtn.style.padding = "6px 12px";
    restrBtn.style.background = "#ffe4b2";
    restrBtn.style.border = "1px solid #f59e0b";
    restrBtn.style.borderRadius = "6px";
    restrBtn.style.cursor = "pointer";
    document.body.insertBefore(restrBtn, document.body.firstChild);
  }

  restrBtn.onclick = function () {
    let est = prompt("Nome da estação para bloquear (ex: Estação C):");
    if (!est) return;
    let idx = stations.findIndex(
      (s) => s.toLowerCase() === est.trim().toLowerCase()
    );
    if (idx === -1) {
      alert("Estação não encontrada!");
      return;
    }
    let hIni = prompt("Hora inicial (ex: 08:00):");
    let hFim = prompt("Hora final (ex: 09:00):");
    if (!hIni || !hFim) return;
    function parseHora(h) {
      let [hh, mm] = h.split(":").map(Number);
      return hh * 60 + (mm || 0);
    }
    let start = parseHora(hIni);
    // storage functions moved to js/storage.js; use storage.saveToStorage(...) when needed
  };

  // Button to select a directory where JS collection files will be written (js/data/*.js)
  let selectDirBtn = document.getElementById('selectDirBtn');
  if (!selectDirBtn) {
    selectDirBtn = document.createElement('button');
    selectDirBtn.id = 'selectDirBtn';
    selectDirBtn.textContent = 'Selecionar pasta (JS)';
    selectDirBtn.style.margin = '8px 0 8px 8px';
    selectDirBtn.style.padding = '6px 12px';
    selectDirBtn.style.background = '#f0f7ff';
    selectDirBtn.style.border = '1px solid #a7d1ff';
    selectDirBtn.style.borderRadius = '6px';
    selectDirBtn.style.cursor = 'pointer';
    document.body.insertBefore(selectDirBtn, document.body.firstChild);
  }

  // toggle to enable/disable writing JS collections on every save
  let dirSaveBtn = document.getElementById('dirSaveBtn');
  let dirSaveEnabled = false;
  if (!dirSaveBtn) {
    dirSaveBtn = document.createElement('button');
    dirSaveBtn.id = 'dirSaveBtn';
    dirSaveBtn.textContent = 'Salvar JS em pasta: OFF';
    dirSaveBtn.style.margin = '8px 0 8px 8px';
    dirSaveBtn.style.padding = '6px 12px';
    dirSaveBtn.style.background = '#fff3f3';
    dirSaveBtn.style.border = '1px solid #f4b6b6';
    dirSaveBtn.style.borderRadius = '6px';
    dirSaveBtn.style.cursor = 'pointer';
    document.body.insertBefore(dirSaveBtn, document.body.firstChild);
  }
  dirSaveBtn.onclick = async function () {
    dirSaveEnabled = !dirSaveEnabled;
    dirSaveBtn.textContent = dirSaveEnabled
      ? 'Salvar JS em pasta: ON'
      : 'Salvar JS em pasta: OFF';
    dirSaveBtn.style.background = dirSaveEnabled ? '#e6ffef' : '#fff3f3';
    if (dirSaveEnabled && !localDirHandle) {
      alert('Escolha uma pasta onde os arquivos js/data/*.js serão gravados.');
      try {
        await selectDirBtn.onclick();
      } catch (e) {}
    }
  };

  selectDirBtn.onclick = async function () {
    if (!window.showDirectoryPicker) {
      alert('showDirectoryPicker não suportado neste navegador.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker();
      if (!handle) return;
      localDirHandle = handle;
      try {
        await storage._persistDirHandle(handle);
      } catch (e) {
        console.warn('persistDirHandle failed:', e && e.message ? e.message : e);
      }
      try {
        selectDirBtn.textContent = 'Pasta: ' + (handle.name || 'js');
      } catch (e) {}
      // if enabled, write files immediately
      if (dirSaveEnabled) {
        try {
          await storage.saveCollectionsToDir(localDirHandle, { trains: state.trains, restricoes });
          alert('Arquivos JS escritos em ' + (handle.name || 'pasta selecionada'));
        } catch (e) {
          console.warn('write collections failed:', e && e.message ? e.message : e);
          alert('Falha ao gravar arquivos JS: ' + (e && e.message ? e.message : e));
        }
      }
    } catch (e) {
      console.warn('selectDir cancelled or failed', e);
    }
  };

  // Use render module to draw left panel and main svg. We wrap it so other code can keep calling `render()`.
  function renderLeft() {
    renderLeftModule(leftPanel, timeRow, stations);
  }

  function render() {
    const handlers = {
      onPolyMouseDown,
      onPointMouseDown,
      onRemoveTrain: removeTrain,
      onAddVertex: AddVertice,
      onRemoveRestr: (ri) => {
        restricoes.splice(ri, 1);
        // use wrapper (respects autosave flag)
        saveToStorage();
        render();
      },
    };
    renderModule(svg, state, restricoes, stations, handlers);
  }

  // Interaction state
  let dragState = null; // {type:'point'|'poly', trainId, stopIdx, startX, startY, initialTimes[], initialStations[]}

  // Autosave control: when false the app will not write to the file on every change.
  // You can set this to true to re-enable automatic writes.
  let autoSaveEnabled = false;

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
    // Use the shared onMouseMove / onMouseUp handlers so dragging is active
    // only while the mouse button is pressed. onMouseUp will remove listeners.
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
      // Checa segmento anterior
      /*if (sIdx > 0) {
        const prevStop = train.stops[sIdx - 1];
        if (
          prevStop.station === stationIdx &&
          segmentoProibido(
            stationIdx,
            prevStop.time,
            minutes,
            prevStop.date || todayISO
          )
        ) {
          alert("Restrição: o segmento anterior atravessa uma faixa proibida!");
          return;
        }
      }
      // Checa segmento seguinte
      if (sIdx < train.stops.length - 1) {
        const nextStop = train.stops[sIdx + 1];
        if (
          nextStop.station === stationIdx &&
          segmentoProibido(
            stationIdx,
            minutes,
            nextStop.time,
            nextStop.date || todayISO
          )
        ) {
          alert("Restrição: o segmento seguinte atravessa uma faixa proibida!");
          return;
        }
      }*/
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
        // Checa segmento para cada estação
        /*if (
          train.stops[i].station === train.stops[i - 1].station &&
          segmentoProibido(
            train.stops[i].station,
            newTimes[i - 1],
            newTimes[i],
            train.stops[i].date || todayISO
          )
        ) {
          alert("Restrição: um segmento do trem atravessa uma faixa proibida!");
          return;
        }*/
      }
      if (!ok) return;
      train.stops.forEach((s, idx) => (s.time = newTimes[idx]));
      // use wrapper (respects autosave flag)
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
    return trainsModel.getTrainById(state.trains, id);
  }
  function removeTrain(id) {
    const ok = trainsModel.removeTrain(state.trains, id);
    if (ok) {
      // use wrapper so autosave can be disabled
      saveToStorage();
      render();
    }
  }
  function AddVertice(id) {
    const train = trainsModel.getTrainById(state.trains, id);
    if (!train) return;
    const newStop = trainsModel.createVertexForTrain(train, todayISO);
    if (restrModel.isRestrito(restricoes, newStop.station, newStop.time, newStop.date, todayISO)) {
      alert('Restrição: não pode adicionar parada nesta estação neste horário!');
      return;
    }
    train.stops.push(newStop);
    // use wrapper (respects autosave flag)
    saveToStorage();
    render();
  }

  // storage is provided by js/storage.js
  function saveToStorage() {
    // Respect autosave flag: do not write automatically on every change when disabled.
    if (!autoSaveEnabled) {
      // autosave disabled - skip writing
      // console.debug('autosave disabled — skipping write');
      return;
    }
    storage.saveToStorage({ trains: state.trains, restricoes }, localFileHandle);
    // additionally write JS collection files into selected directory when enabled
    if (dirSaveEnabled && localDirHandle) {
      try {
        storage.saveCollectionsToDir(localDirHandle, { trains: state.trains, restricoes });
      } catch (e) {
        console.warn('saveCollectionsToDir failed:', e && e.message ? e.message : e);
      }
    }
  }
  function loadFromStorage() {
    return storage.loadFromStorage();
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
      { station: 0, time: t0, date: todayISO },
      { station: Math.max(1, stations.length - 1), time: t1, date: todayISO },
    ];
    const color = palette[Math.floor(Math.random() * palette.length)];
    state.trains.push({ id, name: name || "Trem " + id, color, stops });
    saveToStorage();
    render();
  });

  clearBtn.addEventListener("click", () => {
    if (confirm("Limpar armazenamento local e restaurar demo?")) {
      localStorage.removeItem("timetable_v1");
      state.trains = [];
      render();
    }
  });

  // export current trains + restrictions to a downloadable JSON file
  exportBtn.addEventListener("click", () => {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        trains: state.trains,
        restricoes,
        stations,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const fn = `timetable-${new Date().toISOString().slice(0, 10)}.json`;
      a.href = url;
      a.download = fn;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erro ao exportar JSON: " + e.message);
    }
  });

  // import JSON file (opens file picker)
  importBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          applyImported(parsed);
        } catch (err) {
          alert("Arquivo inválido: " + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  function applyImported(payload) {
    // payload may be the full object or just trains array
    let trains = [];
    let newRestr = [];
    if (Array.isArray(payload)) {
      trains = payload;
    } else if (payload && typeof payload === "object") {
      trains = payload.trains || payload.data || [];
      newRestr = payload.restricoes || payload.restrictions || [];
    }
    if (!Array.isArray(trains)) {
      alert("Formato inválido: 'trains' não é um array");
      return;
    }
    // normalize stops to include date
    trains.forEach((t) => {
      if (!Array.isArray(t.stops)) t.stops = [];
      t.stops.forEach((s) => {
        if (!s.date) s.date = todayISO;
      });
    });
    // normalize restrictions
    if (!Array.isArray(newRestr)) newRestr = [];
    newRestr.forEach((r) => {
      if (!r.date) r.date = todayISO;
    });
    // apply
    state.trains = trains;
    restricoes = newRestr;
    saveToStorage();
    render();
    alert("Dados importados com sucesso.");
  }

  // initial render: render svg first (sets svg width) then render left panel which depends on minutesToX
  render();
  renderLeft();
})();
