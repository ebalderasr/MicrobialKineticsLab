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
  "V_working",
  "F",
  "S_in",
  "D",
  "dt",
  "t_final",
];

const modelMeta = {
  monod: {
    label: "Monod",
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
    label: "Haldane / Andrews",
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

const cultureMeta = {
  batch:      { label: "Lote (Batch)",               systemTitle: "Balances del cultivo en lote" },
  fedbatch:   { label: "Lote alimentado (Fed-batch)", systemTitle: "Balances del lote alimentado" },
  continuous: { label: "Continuo (Chemostat)",        systemTitle: "Balances del cultivo continuo" },
};

let pyodide;
let isReady = false;

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const debouncedRun = debounce(runSimulation, 100);

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
  params.growth_model  = document.getElementById("growth_model").value;
  params.product_mode  = document.getElementById("product_mode").value;
  params.culture_mode  = document.getElementById("culture_mode").value;
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
  const model       = document.getElementById("growth_model").value;
  const productMode = document.getElementById("product_mode").value;
  const cultureMode = document.getElementById("culture_mode").value;
  const volumeLabel = document.getElementById("working-volume-label");

  if (volumeLabel) {
    volumeLabel.innerHTML =
      cultureMode === "fedbatch"
        ? "Volumen de trabajo inicial (L)"
        : "Volumen de trabajo (L)";
  }

  document.querySelectorAll(".parameter-conditional").forEach((node) => {
    let isActive = true;

    if (node.dataset.models) {
      const modelFlags = node.dataset.models.split(",");
      isActive = modelFlags.includes(model) || modelFlags.includes(`product_mode_${productMode}`);
    }

    if (node.dataset.culture) {
      const cultureFlags = node.dataset.culture.split(",");
      isActive = isActive && cultureFlags.includes(cultureMode);
    }

    node.classList.toggle("parameter-hidden", !isActive);
    const input = node.querySelector("input");
    if (input) {
      input.disabled = !isActive;
    }
  });

  // V_final metric card: only visible in fed-batch
  const vCard = document.getElementById("final-v-card");
  if (vCard) {
    vCard.classList.toggle("parameter-hidden", cultureMode !== "fedbatch");
  }
}

function updateCultureText(model, productMode, cultureMode) {
  const hasDeathTerm = model === "monod_cell_death";
  const hasDilution  = cultureMode === "fedbatch" || cultureMode === "continuous";

  // System title
  const titleEl = document.getElementById("system-title");
  if (titleEl) titleEl.textContent = cultureMeta[cultureMode].systemTitle;

  // Biomass balance
  let biomassHtml = `<span class="derivative">dX/dt</span> = `;
  if (hasDilution && hasDeathTerm) {
    biomassHtml += "(μ &minus; k<sub>d</sub> &minus; D)X";
  } else if (hasDilution) {
    biomassHtml += "(μ &minus; D)X";
  } else if (hasDeathTerm) {
    biomassHtml += "(μ &minus; k<sub>d</sub>)X";
  } else {
    biomassHtml += "μX";
  }
  document.getElementById("biomass-balance").innerHTML = biomassHtml;

  // Substrate balance
  let substrateHtml = `<span class="derivative">dS/dt</span> = &minus;<span class="frac"><span class="top">μX</span><span class="bottom">Y<sub>x/s</sub></span></span>`;
  if (hasDilution) {
    substrateHtml += " + D(S<sub>in</sub> &minus; S)";
  }
  document.getElementById("substrate-balance").innerHTML = substrateHtml;

  // Product balance
  let productHtml = `<span class="derivative">dP/dt</span> = q<sub>p</sub>X`;
  if (hasDilution) {
    productHtml += " &minus; DP";
  }
  document.getElementById("product-balance").innerHTML = productHtml;

  // Volume balance (fed-batch only)
  const volEl = document.getElementById("volume-balance");
  if (volEl) {
    volEl.classList.toggle("parameter-hidden", cultureMode !== "fedbatch");
  }
}

function updateModelText(model, productMode, cultureMode) {
  const meta = modelMeta[model];
  const modelStatus = document.getElementById("model-status");
  const cultureStatus = document.getElementById("culture-status");
  const heroModelName = document.getElementById("hero-model-name");
  const heroCultureName = document.getElementById("hero-culture-name");

  if (modelStatus) modelStatus.textContent = meta.label;
  if (cultureStatus) cultureStatus.textContent = cultureMeta[cultureMode].label;
  if (heroModelName) heroModelName.textContent = meta.label;
  if (heroCultureName) heroCultureName.textContent = cultureMeta[cultureMode].label;
  document.getElementById("equation-card-title").textContent = meta.cardTitle;
  document.getElementById("equation-label").innerHTML       = meta.equationHtml;
  document.getElementById("equation-description").textContent = meta.description;
  updateCultureText(model, productMode, cultureMode);
  document.getElementById("product-mode-equation").innerHTML =
    productMode === "growth_associated"
      ? "q<sub>p</sub> = αμ"
      : "q<sub>p</sub> = β";
}

function setRuntimeStatus(message, ready = false) {
  const node = document.getElementById("runtime-status");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.toggle("neutral", !ready);
}

function updateInsight(summary, params) {
  let message;
  const { culture_mode, growth_model, mu_max, Ki, S0, kd, Kip, kp } = params;

  if (culture_mode === "continuous") {
    if (params.D >= mu_max * 0.9) {
      message = `La tasa de dilución está cerca del lavado (D ≈ μmax). Si D supera μ, la biomasa tenderá a cero.`;
    } else {
      message = `En continuo el sistema tiende a un estado estacionario donde μ = D. El sustrato residual depende de K_s y la cinética elegida.`;
    }
  } else if (culture_mode === "fedbatch") {
    const d0 = params.F / params.V_working;
    if (d0 > mu_max * 0.5) {
      message = `La dilución inicial (F/V₀ = ${fmt(d0, 3)} h⁻¹) es alta. La alimentación puede superar la capacidad de crecimiento al inicio.`;
    } else {
      const vFinal = summary.final_V != null ? fmt(summary.final_V, 1) : "?";
      message = `El fed-batch extiende la fase productiva reponiendo sustrato. El volumen crece de ${fmt(params.V_working, 1)} a ${vFinal} L.`;
    }
  } else if (growth_model === "haldane" && S0 > Ki) {
    message = "El sistema arranca en una zona de inhibición por sustrato. Más sustrato no implica necesariamente más crecimiento.";
  } else if (growth_model === "product_competitive") {
    message = "El producto acumulado aumenta la K_s aparente. El cultivo se comporta como si perdiera afinidad por el sustrato.";
  } else if (growth_model === "product_noncompetitive") {
    message = "El producto acumulado reduce la μ_max efectiva. Aun con sustrato disponible, la capacidad de crecer cae.";
  } else if (growth_model === "product_linear") {
    message = "La inhibición crece proporcionalmente con P. El modelo predice anulación del crecimiento cuando P alcanza 1/k_p.";
  } else if (growth_model === "product_exponential") {
    message = "La inhibición por producto es progresiva y asintótica: la tasa cae de forma exponencial conforme aumenta P.";
  } else if (growth_model === "monod_cell_death" && kd >= mu_max * 0.35) {
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
  const vEl = document.getElementById("final-v");
  if (vEl && summary.final_V !== null && summary.final_V !== undefined) {
    vEl.textContent = fmt(summary.final_V, 2, " L");
  }
}

function renderTimeSeries(series) {
  const traces = [
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
  ];

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor:  "rgba(0,0,0,0)",
    margin: { l: 52, r: 52, t: 14, b: 52 },
    font: { family: "IBM Plex Sans, sans-serif", color: "#1f2a1f" },
    legend: { orientation: "h", y: 1.12, x: 0 },
    xaxis:  { title: "Tiempo (h)", gridcolor: "rgba(31,42,31,0.08)" },
    yaxis:  { title: "Concentración (g/L)", gridcolor: "rgba(31,42,31,0.08)" },
    yaxis2: { title: "μ (h⁻¹)", overlaying: "y", side: "right", showgrid: false },
  };

  Plotly.newPlot("time-series-plot", traces, layout, { responsive: true, displayModeBar: false });
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
      plot_bgcolor:  "rgba(0,0,0,0)",
      margin: { l: 52, r: 52, t: 14, b: 52 },
      font: { family: "IBM Plex Sans, sans-serif", color: "#1f2a1f" },
      legend: { orientation: "h", y: 1.12, x: 0 },
      xaxis:  { title: "Tiempo (h)", gridcolor: "rgba(31,42,31,0.08)" },
      yaxis:  { title: "Velocidades (g/L/h)", gridcolor: "rgba(31,42,31,0.08)" },
      yaxis2: { title: "q_p", overlaying: "y", side: "right", showgrid: false },
    },
    { responsive: true, displayModeBar: false },
  );
}

function renderVolumePlot(series) {
  const volumeValues = Array.isArray(series.V) ? series.V : [];
  const vMin = Math.min(...volumeValues);
  const vMax = Math.max(...volumeValues);
  const isConstantVolume = volumeValues.length > 0 && Math.abs(vMax - vMin) < 1e-9;
  const constantPadding = Math.max(vMax * 0.12, 0.5);

  const yaxis = {
    title: "Volumen (L)",
    gridcolor: "rgba(31,42,31,0.08)",
  };

  if (isConstantVolume) {
    yaxis.range = [Math.max(0, vMin - constantPadding), vMax + constantPadding];
  } else {
    yaxis.rangemode = "tozero";
  }

  Plotly.newPlot(
    "volume-plot",
    [
      {
        x: series.t,
        y: series.V,
        type: "scatter",
        mode: "lines",
        name: "Volumen V",
        line: { color: "#795548", width: 3 },
        fill: isConstantVolume ? "none" : "tozeroy",
        fillcolor: "rgba(121,85,72,0.12)",
      },
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor:  "rgba(0,0,0,0)",
      margin: { l: 52, r: 24, t: 14, b: 52 },
      font: { family: "IBM Plex Sans, sans-serif", color: "#1f2a1f" },
      legend: { orientation: "h", y: 1.12, x: 0 },
      xaxis:  { title: "Tiempo (h)", gridcolor: "rgba(31,42,31,0.08)" },
      yaxis,
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
  renderVolumePlot(result.series);
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
    document.getElementById("culture_mode").value,
  );
  runSimulation();
}

for (const id of controls) {
  const input = document.getElementById(id);
  input.addEventListener("input", () => {
    syncOutputs();
    debouncedRun();
  });
}

document.getElementById("growth_model").addEventListener("input", () => {
  updateConditionalControls();
  updateModelText(
    document.getElementById("growth_model").value,
    document.getElementById("product_mode").value,
    document.getElementById("culture_mode").value,
  );
  debouncedRun();
});

document.getElementById("product_mode").addEventListener("input", () => {
  updateConditionalControls();
  updateModelText(
    document.getElementById("growth_model").value,
    document.getElementById("product_mode").value,
    document.getElementById("culture_mode").value,
  );
  debouncedRun();
});

document.getElementById("culture_mode").addEventListener("input", () => {
  updateConditionalControls();
  updateModelText(
    document.getElementById("growth_model").value,
    document.getElementById("product_mode").value,
    document.getElementById("culture_mode").value,
  );
  debouncedRun();
});

// ── Guide section toggle ──────────────────────────────────────────────────────
(function () {
  const banner = document.getElementById("guide-banner");
  const panel  = document.getElementById("guide-panel");
  const label  = banner.querySelector(".guide-action-label");

  function toggle() {
    const open = panel.classList.toggle("open");
    banner.setAttribute("aria-expanded", open);
    panel.setAttribute("aria-hidden", !open);
    label.textContent = open ? "Cerrar guía" : "Abrir guía";
  }

  banner.addEventListener("click", toggle);
  banner.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });
})();

initPyodideApp().catch((error) => {
  console.error(error);
  setRuntimeStatus("Error al inicializar Pyodide", false);
  document.getElementById("insight-text").textContent =
    "La app no pudo cargar el runtime de Python. Revisa el acceso a la red o ejecuta desde un servidor local.";
});
