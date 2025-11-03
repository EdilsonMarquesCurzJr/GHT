// Configuration shared across modules
export const config = {
  // largura da área de desenho (exclui left panel). Pode ser em pixels (number)
  // ou em unidade viewport width (string, ex: '98vw').
  width: '80vw',
  height: 600,
  leftWidth: 140,
  timeRowHeight: 40,
  startTimeMin: 0, // 00:00 em minutos
  endTimeMin: 24 * 60, // 24:00 (meia-noite)
  minutesPerTick: 60, // rótulo maior a cada 60 minutos
  snapMin: 1, // snap (minutos)
  stationHeight: 60,
  pointRadius: 6,
  autoSaveJS: false,
  autoDownloadJSON: true,
  autoSaveToServer: true,
  // opcional: endpoint HTTP remoto (ex: Power Automate) para gravar em SharePoint
  saveEndpoint: "",
  // SharePoint direct save (quando o script roda dentro de uma página SharePoint autenticada)
  sharepointSave: false,
  sharepointFolder: "SiteAssets",
  sharepointFileName: "trens.json",
};
