const controls = [
  "mu_max",
  "Ks",
  "Ki",
  "Kp",
  "Yxs",
  "kd",
  "X0",
  "S0",
  "dt",
  "t_final",
];

const modelMeta = {
  monod_simple: {
    label: "Monod en lote",
    cardTitle: "Ecuación de crecimiento: Monod sin muerte celular",
    equationHtml: "μ(S) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub>S</span><span class=\"bottom\">K<sub>s</sub> + S</span></span>",
    description: "La forma clásica de Monod asume que el crecimiento está limitado solo por la disponibilidad de sustrato.",
    biomassBalanceHtml: "<span class=\"derivative\">dX/dt</span> = μX",
    productBalanceHtml: "",
    showProductBalance: false,
  },
  monod_decay: {
    label: "Monod con muerte celular",
    cardTitle: "Ecuación de crecimiento: Monod con muerte celular",
    equationHtml: "μ(S) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub>S</span><span class=\"bottom\">K<sub>s</sub> + S</span></span>",
    description: "La cinética de Monod se conserva, pero la biomasa neta disminuye por el término de decaimiento celular k<sub>d</sub>.",
    biomassBalanceHtml: "<span class=\"derivative\">dX/dt</span> = (μ - k<sub>d</sub>)X",
    productBalanceHtml: "",
    showProductBalance: false,
  },
  haldane: {
    label: "Haldane / Andrews en lote",
    cardTitle: "Ecuación de crecimiento: Haldane / Andrews",
    equationHtml: "μ(S) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub>S</span><span class=\"bottom\">K<sub>s</sub> + S + S<sup>2</sup>/K<sub>i</sub></span></span>",
    description: "Describe inhibición por sustrato: al inicio más sustrato favorece el crecimiento, pero a concentraciones altas lo frena.",
    biomassBalanceHtml: "<span class=\"derivative\">dX/dt</span> = (μ - k<sub>d</sub>)X",
    productBalanceHtml: "",
    showProductBalance: false,
  },
  product_competitive: {
    label: "Inhibición competitiva por producto",
    cardTitle: "Ecuación de crecimiento: inhibición competitiva por producto",
    equationHtml: "μ(S,P) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub>S</span><span class=\"bottom\">K<sub>s</sub>(1 + P/K<sub>p</sub>) + S</span></span>",
    description: "El producto acumulado hace que el sistema se comporte como si aumentara la constante aparente de saturación por sustrato.",
    biomassBalanceHtml: "<span class=\"derivative\">dX/dt</span> = (μ - k<sub>d</sub>)X",
    productBalanceHtml: "P &asymp; X - X<sub>0</sub>",
    showProductBalance: true,
  },
  product_noncompetitive: {
    label: "Inhibición no competitiva por producto",
    cardTitle: "Ecuación de crecimiento: inhibición no competitiva por producto",
    equationHtml: "μ(S,P) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub></span><span class=\"bottom\">1 + P/K<sub>p</sub></span></span><span class=\"frac\"><span class=\"top\">S</span><span class=\"bottom\">K<sub>s</sub> + S</span></span>",
    description: "El producto acumulado reduce la capacidad máxima de crecimiento sin desplazar directamente la afinidad por sustrato.",
    biomassBalanceHtml: "<span class=\"derivative\">dX/dt</span> = (μ - k<sub>d</sub>)X",
    productBalanceHtml: "P &asymp; X - X<sub>0</sub>",
    showProductBalance: true,
  },
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
    const node = document.getElementById(`${id}_value`);
    if (node) {
      node.textContent = fmt(document.getElementById(id).value);
    }
  }
}

function effectiveKd(params) {
  return params.growth_model === "monod_simple" ? 0 : params.kd;
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
  document.getElementById("hero-model-name").textContent = meta.label;
  document.getElementById("equation-card-title").textContent = meta.cardTitle;
  document.getElementById("equation-label").innerHTML = meta.equationHtml;
  document.getElementById("equation-description").innerHTML = meta.description;
  document.getElementById("biomass-balance").innerHTML = meta.biomassBalanceHtml;
  document.getElementById("product-balance").innerHTML = meta.productBalanceHtml;
  document.getElementById("product-balance").classList.toggle("parameter-hidden", !meta.showProductBalance);
}

function setRuntimeStatus(message, ready = false) {
  const node = document.getElementById("runtime-status");
  node.textContent = message;
  node.classList.toggle("neutral", !ready);
}

function updateInsight(summary, params) {
  let message;
  if (params.growth_model === "haldane" && params.S0 > params.Ki) {
    message = "La concentración inicial de sustrato cae en la zona inhibitoria. Esta es la idea central del modelo de Haldane o Andrews.";
  } else if (params.growth_model === "product_competitive") {
    message = "El producto acumulado desplaza la cinética de forma competitiva: el cultivo parece necesitar más sustrato para sostener la misma tasa.";
  } else if (params.growth_model === "product_noncompetitive") {
    message = "El producto acumulado reduce la capacidad global de crecimiento. Aunque aún haya sustrato, μ cae conforme aumenta P.";
  } else if (params.growth_model === "monod_decay" && params.kd >= params.mu_max * 0.35) {
    message = "El decaimiento celular compite fuertemente con el crecimiento. La biomasa neta puede estancarse o incluso disminuir.";
  } else if (summary.depletion_time !== null) {
    message = `El sustrato cae a niveles casi agotados cerca de t=${fmt(summary.depletion_time, 2, " h")}. La afinidad definida por Ks controla qué tan rápido ocurre.`;
  } else if (params.Ks > params.S0 * 0.2) {
    message = "Ks es grande respecto al sustrato inicial. El cultivo opera lejos de saturación y la tasa específica queda limitada desde el inicio.";
  } else {
    message = "El cultivo arranca en una zona favorable: el sustrato inicial permite una tasa específica alta y la biomasa crece con rapidez.";
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
        name: "μ(S,P)",
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
  const kd = effectiveKd(params);
  const netMu = series.mu.map((value) => value - kd);
  Plotly.newPlot(
    "rate-plot",
    [
      {
        x: series.t,
        y: netMu,
        type: "scatter",
        mode: "lines",
        name: "μ neta",
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

initPyodideApp().catch((error) => {
  console.error(error);
  setRuntimeStatus("Error al inicializar Pyodide", false);
  document.getElementById("insight-text").textContent =
    "La app no pudo cargar el runtime de Python. Revisa el acceso a la red o ejecuta desde un servidor local.";
});
