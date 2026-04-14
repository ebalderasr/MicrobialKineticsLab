const controls = [
  "mu_max",
  "Ks",
  "Ki",
  "Kip",
  "kp",
  "Yxs",
  "kd",
  "alpha",
  "beta",
  "X0",
  "S0",
  "P0",
  "dt",
  "t_final",
];

const modelMeta = {
  monod: {
    label: "Monod en lote",
    cardTitle: "Ecuación de crecimiento: Monod",
    equationHtml: "μ(S) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub>S</span><span class=\"bottom\">K<sub>s</sub> + S</span></span>",
    description: "Modelo de saturación simple. La tasa específica aumenta con el sustrato y se aproxima a μmax cuando el medio deja de ser limitante.",
  },
  monod_cell_death: {
    label: "Monod con muerte celular",
    cardTitle: "Ecuación de crecimiento: Monod con muerte celular",
    equationHtml: "μ(S) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub>S</span><span class=\"bottom\">K<sub>s</sub> + S</span></span>",
    description: "Mantiene la cinética de Monod, pero el balance de biomasa incorpora un término de muerte o decaimiento celular k<sub>d</sub>.",
  },
  haldane: {
    label: "Haldane / Andrews en lote",
    cardTitle: "Ecuación de crecimiento: Haldane / Andrews",
    equationHtml: "μ(S) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub>S</span><span class=\"bottom\">K<sub>s</sub> + S + S<sup>2</sup>/K<sub>i</sub></span></span>",
    description: "Representa inhibición por sustrato. A concentraciones altas de sustrato, el término S²/Ki frena el crecimiento.",
  },
  product_competitive: {
    label: "Inhibición competitiva por producto",
    cardTitle: "Ecuación de crecimiento: inhibición competitiva por producto",
    equationHtml: "μ(S,P) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub>S</span><span class=\"bottom\">S + K<sub>s</sub>(1 + P/K<sub>ip</sub>)</span></span>",
    description: "El producto compite con el sustrato y aumenta la constante aparente de saturación.",
  },
  product_noncompetitive: {
    label: "Inhibición no competitiva por producto",
    cardTitle: "Ecuación de crecimiento: inhibición no competitiva por producto",
    equationHtml: "μ(S,P) = <span class=\"frac\"><span class=\"top\">μ<sub>max</sub>S</span><span class=\"bottom\">K<sub>s</sub> + S</span></span><span class=\"frac\"><span class=\"top\">K<sub>ip</sub></span><span class=\"bottom\">K<sub>ip</sub> + P</span></span>",
    description: "El producto reduce la μmax efectiva independientemente de cuánto sustrato siga habiendo en el medio.",
  },
  product_linear: {
    label: "Inhibición lineal por producto",
    cardTitle: "Ecuación de crecimiento: inhibición lineal por producto",
    equationHtml: "μ(S,P) = μ<sub>Monod</sub>(S)(1 - k<sub>p</sub>P)",
    description: "La presencia de producto reduce la tasa de crecimiento de manera lineal. El crecimiento se anula cuando P = 1/kp.",
  },
  product_exponential: {
    label: "Inhibición exponencial por producto",
    cardTitle: "Ecuación de crecimiento: inhibición exponencial por producto",
    equationHtml: "μ(S,P) = μ<sub>Monod</sub>(S)e<sup>-k<sub>p</sub>P</sup>",
    description: "La velocidad específica decae exponencialmente con la acumulación de producto.",
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
  params.product_mode = document.getElementById("product_mode").value;
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

function updateConditionalControls() {
  const model = document.getElementById("growth_model").value;
  const productMode = document.getElementById("product_mode").value;
  document.querySelectorAll(".parameter-conditional").forEach((node) => {
    const enabledFlags = node.dataset.models.split(",");
    const isActive = enabledFlags.includes(model) || enabledFlags.includes(`product_mode_${productMode}`);
    node.classList.toggle("parameter-hidden", !isActive);
    const input = node.querySelector("input");
    if (input) {
      input.disabled = !isActive;
    }
  });
}

function updateModelText(model, productMode) {
  const meta = modelMeta[model];
  document.getElementById("model-status").textContent = meta.label;
  document.getElementById("hero-model-name").textContent = meta.label;
  document.getElementById("equation-card-title").textContent = meta.cardTitle;
  document.getElementById("equation-label").innerHTML = meta.equationHtml;
  document.getElementById("equation-description").textContent = meta.description;
  document.getElementById("biomass-balance").innerHTML =
    model === "monod_cell_death"
      ? "<span class=\"derivative\">dX/dt</span> = (μ - k<sub>d</sub>)X"
      : "<span class=\"derivative\">dX/dt</span> = μX";
  document.getElementById("product-balance").innerHTML = "<span class=\"derivative\">dP/dt</span> = q<sub>p</sub>X";
  document.getElementById("product-mode-equation").innerHTML =
    productMode === "growth_associated"
      ? "q<sub>p</sub> = αμ"
      : "q<sub>p</sub> = β";
}

function setRuntimeStatus(message, ready = false) {
  const node = document.getElementById("runtime-status");
  node.textContent = message;
  node.classList.toggle("neutral", !ready);
}

function updateInsight(summary, params) {
  let message;
  if (params.growth_model === "haldane" && params.S0 > params.Ki) {
    message = "El sistema arranca en una zona de inhibición por sustrato. Más sustrato no implica necesariamente más crecimiento.";
  } else if (params.growth_model === "product_competitive") {
    message = "El producto acumulado aumenta la K_s aparente. El cultivo se comporta como si perdiera afinidad por el sustrato.";
  } else if (params.growth_model === "product_noncompetitive") {
    message = "El producto acumulado reduce la μ_max efectiva. Aun con sustrato disponible, la capacidad de crecer cae.";
  } else if (params.growth_model === "product_linear") {
    message = "La inhibición crece proporcionalmente con P. El modelo predice anulación del crecimiento cuando P alcanza 1/k_p.";
  } else if (params.growth_model === "product_exponential") {
    message = "La inhibición por producto es progresiva y asintótica: la tasa cae de forma exponencial conforme aumenta P.";
  } else if (params.growth_model === "monod_cell_death" && params.kd >= params.mu_max * 0.35) {
    message = "El término de muerte celular compite fuertemente con el crecimiento. La biomasa neta puede frenarse aun con sustrato disponible.";
  } else if (summary.depletion_time !== null) {
    message = `El sustrato cae a niveles casi agotados cerca de t=${fmt(summary.depletion_time, 2, " h")}.`;
  } else {
    message = "La tasa específica queda dominada por la relación entre μmax, Ks y la acumulación de producto en el lote.";
  }
  document.getElementById("insight-text").textContent = message;
}

function updateMetrics(summary) {
  document.getElementById("final-x").textContent = fmt(summary.final_X, 3, " g/L");
  document.getElementById("final-s").textContent = fmt(summary.final_S, 3, " g/L");
  document.getElementById("final-p").textContent = fmt(summary.final_P, 3, " g/L");
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
        y: series.P,
        type: "scatter",
        mode: "lines",
        name: "Producto P",
        line: { color: "#4285f4", width: 3 },
      },
      {
        x: series.t,
        y: series.mu,
        type: "scatter",
        mode: "lines",
        name: "μ",
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

function renderRatePlot(series) {
  Plotly.newPlot(
    "rate-plot",
    [
      {
        x: series.t,
        y: series.dXdt,
        type: "scatter",
        mode: "lines",
        name: "dX/dt",
        line: { color: "#0d7c66", width: 3 },
      },
      {
        x: series.t,
        y: series.dPdt,
        type: "scatter",
        mode: "lines",
        name: "dP/dt",
        line: { color: "#4285f4", width: 3 },
      },
      {
        x: series.t,
        y: series.qp,
        type: "scatter",
        mode: "lines",
        name: "q_p",
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
      yaxis: { title: "Velocidades (g/L/h)", gridcolor: "rgba(31,42,31,0.08)" },
      yaxis2: {
        title: "q_p",
        overlaying: "y",
        side: "right",
        showgrid: false,
      },
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
  renderRatePlot(result.series);
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
  updateModelText(
    document.getElementById("growth_model").value,
    document.getElementById("product_mode").value,
  );
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
  updateModelText(
    document.getElementById("growth_model").value,
    document.getElementById("product_mode").value,
  );
  runSimulation();
});

document.getElementById("product_mode").addEventListener("input", () => {
  updateConditionalControls();
  updateModelText(
    document.getElementById("growth_model").value,
    document.getElementById("product_mode").value,
  );
  runSimulation();
});

initPyodideApp().catch((error) => {
  console.error(error);
  setRuntimeStatus("Error al inicializar Pyodide", false);
  document.getElementById("insight-text").textContent =
    "La app no pudo cargar el runtime de Python. Revisa el acceso a la red o ejecuta desde un servidor local.";
});
