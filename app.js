const controls = [
  "mu_max",
  "Ks",
  "Ki",
  "n",
  "Yxs",
  "kd",
  "X0",
  "S0",
  "dt",
  "t_final",
];

const modelMeta = {
  monod: {
    label: "Monod en lote",
    equation: "μ(S) = μmax S / (Ks + S)",
  },
  haldane: {
    label: "Inhibición por sustrato en lote",
    equation: "μ(S) = μmax S / (Ks + S + S² / Ki)",
  },
  moser: {
    label: "Moser en lote",
    equation: "μ(S) = μmax Sⁿ / (Ks + Sⁿ)",
  },
};

const presets = {
  balanced: { growth_model: "monod", mu_max: 0.6, Ks: 0.8, Ki: 25, n: 1.2, Yxs: 0.45, kd: 0.02, X0: 0.15, S0: 18, dt: 0.05, t_final: 24 },
  substrate_limited: { growth_model: "monod", mu_max: 0.65, Ks: 2.8, Ki: 25, n: 1.2, Yxs: 0.42, kd: 0.02, X0: 0.2, S0: 6, dt: 0.05, t_final: 24 },
  fast_growth: { growth_model: "monod", mu_max: 1.2, Ks: 0.35, Ki: 25, n: 1.2, Yxs: 0.52, kd: 0.01, X0: 0.12, S0: 20, dt: 0.03, t_final: 18 },
  high_decay: { growth_model: "haldane", mu_max: 0.95, Ks: 0.8, Ki: 8, n: 1.2, Yxs: 0.45, kd: 0.18, X0: 0.2, S0: 24, dt: 0.05, t_final: 30 },
};

let pyodide;
let isReady = false;

function fmt(value, digits = 3, unit = "") {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${Number(value).toFixed(digits)}${unit}`;
}

function collectParams() {
  const params = Object.fromEntries(
    controls.map((id) => [id, Number(document.getElementById(id).value)]),
  );
  params.growth_model = document.getElementById("growth_model").value;
  return params;
}

function syncOutputs() {
  for (const id of controls) {
    document.getElementById(`${id}_value`).textContent = fmt(document.getElementById(id).value);
  }
}

function updateConditionalControls() {
  const model = document.getElementById("growth_model").value;
  document.querySelectorAll(".parameter-conditional").forEach((node) => {
    const enabledModels = node.dataset.models.split(",");
    const isActive = enabledModels.includes(model);
    node.classList.toggle("parameter-hidden", !isActive);
    node.querySelector("input").disabled = !isActive;
  });
}

function updateModelText(model) {
  const meta = modelMeta[model];
  document.getElementById("model-status").textContent = meta.label;
  document.getElementById("equation-label").textContent = meta.equation;
}

function setRuntimeStatus(message, ready = false) {
  const node = document.getElementById("runtime-status");
  node.textContent = message;
  node.classList.toggle("neutral", !ready);
}

function updateInsight(summary, params) {
  let message;
  if (params.growth_model === "haldane" && params.S0 > params.Ki) {
    message = "La concentración inicial de sustrato entra a la zona inhibitoria. El alumno puede ver que más sustrato no siempre implica más crecimiento.";
  } else if (params.growth_model === "moser" && params.n > 1.5) {
    message = "El exponente n hace más abrupta la transición entre limitación y saturación. La respuesta del cultivo se vuelve más sensible al sustrato.";
  } else if (summary.depletion_time !== null) {
    message = `El sustrato cae a niveles casi agotados cerca de t=${fmt(summary.depletion_time, 2, " h")}. La afinidad definida por Ks y el rendimiento Yx/s controlan qué tan rápido ocurre.`;
  } else if (params.kd >= params.mu_max * 0.35) {
    message = "La muerte celular es suficientemente alta como para frenar la acumulación de biomasa, aunque todavía exista sustrato disponible.";
  } else if (params.Ks > params.S0 * 0.2) {
    message = "Ks es grande respecto al sustrato inicial. El cultivo opera lejos de saturación y la tasa específica queda limitada desde el inicio.";
  } else {
    message = "La cinética arranca en una zona favorable: el sustrato inicial permite una tasa específica cercana a μmax y la biomasa crece con rapidez.";
  }
  document.getElementById("insight-text").textContent = message;
}

function updateMetrics(summary) {
  document.getElementById("final-x").textContent = fmt(summary.final_X, 3, " g/L");
  document.getElementById("final-s").textContent = fmt(summary.final_S, 3, " g/L");
  document.getElementById("peak-mu").textContent = fmt(summary.peak_mu, 3, " h⁻¹");
  document.getElementById("depletion-time").textContent =
    summary.depletion_time === null ? "No agotado" : fmt(summary.depletion_time, 2, " h");
}

function renderTimeSeries(series) {
  Plotly.newPlot(
    "time-series-plot",
    [
      {
        x: series.t,
        y: series.X,
        type: "scatter",
        mode: "lines",
        name: "Biomasa X",
        line: { color: "#0d7c66", width: 3 },
      },
      {
        x: series.t,
        y: series.S,
        type: "scatter",
        mode: "lines",
        name: "Sustrato S",
        line: { color: "#ee8b42", width: 3 },
      },
      {
        x: series.t,
        y: series.mu,
        type: "scatter",
        mode: "lines",
        name: "μ(S)",
        yaxis: "y2",
        line: { color: "#9a3d57", width: 2, dash: "dot" },
      },
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 52, r: 52, t: 14, b: 52 },
      font: { family: "IBM Plex Sans, sans-serif", color: "#1f2a1f" },
      legend: { orientation: "h", y: 1.12, x: 0 },
      xaxis: { title: "Tiempo (h)", gridcolor: "rgba(31,42,31,0.08)" },
      yaxis: { title: "Concentración (g/L)", gridcolor: "rgba(31,42,31,0.08)" },
      yaxis2: {
        title: "μ (h⁻¹)",
        overlaying: "y",
        side: "right",
        showgrid: false,
      },
    },
    { responsive: true, displayModeBar: false },
  );
}

function renderRatePlot(series, params) {
  const netMu = series.mu.map((value) => value - params.kd);
  Plotly.newPlot(
    "rate-plot",
    [
      {
        x: series.t,
        y: netMu,
        type: "scatter",
        mode: "lines",
        name: "μ - kd",
        line: { color: "#0d7c66", width: 3 },
      },
      {
        x: series.t,
        y: series.dXdt,
        type: "scatter",
        mode: "lines",
        name: "dX/dt",
        line: { color: "#9a3d57", width: 3 },
      },
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 52, r: 24, t: 14, b: 52 },
      font: { family: "IBM Plex Sans, sans-serif", color: "#1f2a1f" },
      legend: { orientation: "h", y: 1.12, x: 0 },
      xaxis: { title: "Tiempo (h)", gridcolor: "rgba(31,42,31,0.08)" },
      yaxis: { title: "Velocidad", gridcolor: "rgba(31,42,31,0.08)" },
      shapes: [
        {
          type: "line",
          x0: 0,
          x1: Math.max(...series.t),
          y0: 0,
          y1: 0,
          line: { color: "rgba(31,42,31,0.25)", dash: "dash" },
        },
      ],
    },
    { responsive: true, displayModeBar: false },
  );
}

async function runSimulation() {
  if (!isReady) {
    return;
  }
  const params = collectParams();
  setRuntimeStatus("Ejecutando simulación...", false);
  const raw = await pyodide.globals.get("run_simulation")(JSON.stringify(params));
  const result = JSON.parse(raw);
  updateMetrics(result.summary);
  updateInsight(result.summary, params);
  renderTimeSeries(result.series);
  renderRatePlot(result.series, params);
  setRuntimeStatus("Pyodide listo", true);
}

function applyPreset(name) {
  const preset = presets[name];
  for (const [key, value] of Object.entries(preset)) {
    document.getElementById(key).value = value;
  }
  updateConditionalControls();
  updateModelText(document.getElementById("growth_model").value);
  syncOutputs();
  runSimulation();
}

async function initPyodideApp() {
  syncOutputs();
  setRuntimeStatus("Cargando runtime de Python...", false);
  pyodide = await loadPyodide();
  const response = await fetch("./simulator.py");
  const source = await response.text();
  pyodide.runPython(source);
  isReady = true;
  setRuntimeStatus("Pyodide listo", true);
  updateConditionalControls();
  updateModelText(document.getElementById("growth_model").value);
  runSimulation();
}

for (const id of controls) {
  const input = document.getElementById(id);
  input.addEventListener("input", () => {
    syncOutputs();
    runSimulation();
  });
}

document.getElementById("growth_model").addEventListener("input", () => {
  updateConditionalControls();
  updateModelText(document.getElementById("growth_model").value);
  runSimulation();
});

document.querySelectorAll(".preset-button").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});

initPyodideApp().catch((error) => {
  console.error(error);
  setRuntimeStatus("Error al inicializar Pyodide", false);
  document.getElementById("insight-text").textContent =
    "La app no pudo cargar el runtime de Python. Revisa el acceso a la red o ejecuta desde un servidor local.";
});
