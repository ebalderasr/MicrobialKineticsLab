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
  "V_max",
  "S_r",
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

const growthHeroMeta = {
  monod: {
    note: "Con limitación por sustrato, las células consumen S y logran duplicarse con claridad: tres células iniciales terminan como seis.",
  },
  monod_cell_death: {
    note: "Aunque el sustrato se consume, la muerte celular reduce el crecimiento neto y deja menos células hijas visibles.",
  },
  haldane: {
    note: "A S alta hay más sustrato disponible, pero también aparece inhibición por sustrato: el crecimiento neto se frena y la duplicación llega solo a cinco células.",
  },
  product_competitive: {
    note: "Las células convierten sustrato en producto, pero el producto acumulado compite y reduce la expansión neta de la población.",
  },
  product_noncompetitive: {
    note: "El producto acumulado frena la capacidad de crecimiento aunque siga habiendo sustrato, por eso aparecen menos células nuevas.",
  },
  product_linear: {
    note: "El aumento de producto recorta de forma progresiva la duplicación: se consume sustrato, se forma producto y el número de células hijas baja.",
  },
  product_exponential: {
    note: "La inhibición por producto amortigua cada vez más el crecimiento: la producción sigue, pero la expansión celular visible es menor.",
  },
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
  params.vmax_mode = document.getElementById("vmax_mode").value;
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
  const vmaxMode = document.getElementById("vmax_mode").value;
  const volumeLabel = document.getElementById("working-volume-label");

  if (volumeLabel) {
    volumeLabel.innerHTML =
      cultureMode === "fedbatch"
        ? "Volumen inicial de operación V<sub>0</sub> (L)"
        : "Volumen de trabajo V<sub>0</sub> (L)";
  }

  document.querySelectorAll(".parameter-conditional").forEach((node) => {
    let isActive = true;

    if (node.dataset.models) {
      const modelFlags = node.dataset.models.split(",");
      isActive = modelFlags.includes(model)
        || modelFlags.includes(`product_mode_${productMode}`)
        || modelFlags.includes(`vmax_${vmaxMode}`);
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
  const dilutionTerm =
    cultureMode === "fedbatch"
      ? `<span class="frac"><span class="top">F</span><span class="bottom">V</span></span>`
      : "D";

  // System title
  const titleEl = document.getElementById("system-title");
  if (titleEl) titleEl.textContent = cultureMeta[cultureMode].systemTitle;

  // Biomass balance
  let biomassHtml = `<span class="derivative">dX/dt</span> = `;
  if (hasDilution && hasDeathTerm) {
    biomassHtml += `(μ &minus; k<sub>d</sub> &minus; ${dilutionTerm})X`;
  } else if (hasDilution) {
    biomassHtml += `(μ &minus; ${dilutionTerm})X`;
  } else if (hasDeathTerm) {
    biomassHtml += "(μ &minus; k<sub>d</sub>)X";
  } else {
    biomassHtml += "μX";
  }
  document.getElementById("biomass-balance").innerHTML = biomassHtml;

  // Substrate balance
  let substrateHtml = `<span class="derivative">dS/dt</span> = &minus;<span class="frac"><span class="top">μX</span><span class="bottom">Y<sub>x/s</sub></span></span>`;
  if (hasDilution) {
    substrateHtml += ` + ${dilutionTerm}(S<sub>r</sub> &minus; S)`;
  }
  document.getElementById("substrate-balance").innerHTML = substrateHtml;

  // Product balance
  let productHtml = `<span class="derivative">dP/dt</span> = `;
  if (productMode === "none" && hasDilution) {
    productHtml += `&minus; ${dilutionTerm}P`;
  } else if (productMode === "none") {
    productHtml += "0";
  } else {
    productHtml += "q<sub>p</sub>X";
    if (hasDilution) {
      productHtml += ` &minus; ${dilutionTerm}P`;
    }
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
  const heroModelSelect = document.getElementById("hero-model-select");
  const heroCultureSelect = document.getElementById("hero-culture-select");

  if (modelStatus) modelStatus.textContent = meta.label;
  if (cultureStatus) cultureStatus.textContent = cultureMeta[cultureMode].label;
  if (heroModelSelect) heroModelSelect.value = model;
  if (heroCultureSelect) heroCultureSelect.value = cultureMode;
  document.getElementById("equation-card-title").textContent = meta.cardTitle;
  document.getElementById("equation-label").innerHTML       = meta.equationHtml;
  document.getElementById("equation-description").textContent = meta.description;
  updateCultureText(model, productMode, cultureMode);
  document.getElementById("product-mode-equation").innerHTML =
    productMode === "none"
      ? "q<sub>p</sub> = 0"
      : productMode === "growth_associated"
        ? "q<sub>p</sub> = αμ"
        : "q<sub>p</sub> = β";
  updateGrowthHero(model);
}

function updateGrowthHero(model) {
  const svg = document.getElementById("growth-svg");
  const note = document.getElementById("growth-hero-note");
  const meta = growthHeroMeta[model] ?? growthHeroMeta.monod;
  if (!svg) return;
  for (const key of Object.keys(growthHeroMeta)) {
    svg.classList.remove(`model-${key}`);
  }
  svg.classList.add(`model-${model}`);
  if (note) {
    note.textContent = meta.note;
  }
}

function handleGrowthModelChange(model) {
  const growthModel = document.getElementById("growth_model");
  if (growthModel && growthModel.value !== model) {
    growthModel.value = model;
  }
  updateConditionalControls();
  updateModelText(
    model,
    document.getElementById("product_mode").value,
    document.getElementById("culture_mode").value,
  );
  debouncedRun();
}

function handleCultureModeChange(mode) {
  const cultureMode = document.getElementById("culture_mode");
  if (cultureMode && cultureMode.value !== mode) {
    cultureMode.value = mode;
  }
  updateConditionalControls();
  updateReactorMode(mode);
  updateModelText(
    document.getElementById("growth_model").value,
    document.getElementById("product_mode").value,
    mode,
  );
  debouncedRun();
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
    const vFinal = summary.final_V != null ? fmt(summary.final_V, 1) : "?";
    const limited = params.vmax_mode === "limited";
    if (limited && params.V_working >= params.V_max) {
      message = `El volumen inicial (${fmt(params.V_working, 1)} L) ya alcanza el Vmax del reactor (${fmt(params.V_max, 1)} L). No hay espacio para alimentar.`;
    } else if (d0 > mu_max * 0.5) {
      message = `La dilución inicial (F/V₀ = ${fmt(d0, 3)} h⁻¹) es alta. La alimentación puede superar la capacidad de crecimiento al inicio.`;
    } else if (limited) {
      message = `El fed-batch alimenta sustrato hasta el límite del reactor (${fmt(params.V_max, 1)} L). El volumen llegó a ${vFinal} L al final de la simulación.`;
    } else {
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
  const insightNode = document.getElementById("insight-text");
  if (insightNode) {
    insightNode.textContent = message;
  }
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

function computeAxisRange(values, { includeZero = false, minPad = 0.1, padRatio = 0.12 } = {}) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) {
    return undefined;
  }

  let min = Math.min(...finiteValues);
  let max = Math.max(...finiteValues);

  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }

  const span = max - min;
  const pad = Math.max(span * padRatio, minPad);

  if (span < 1e-9) {
    return [min - pad, max + pad];
  }

  return [min - pad, max + pad];
}

// ── Shared plot palette (consistent across all charts) ───────────────────────
const C = {
  biomass:   "#0d7c66",  // teal  — X, dX/dt
  substrate: "#ee8b42",  // amber — S, dS/dt
  product:   "#4285f4",  // blue  — P, dP/dt, F
  kinetics:  "#9a3d57",  // rose  — μ, qp, D
  volume:    "#795548",  // brown — V
};

function isNarrow() { return window.innerWidth < 680; }

/** Base layout shared by every plot. */
function basePlotLayout() {
  const n = isNarrow();
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor:  "rgba(0,0,0,0)",
    margin: { l: n ? 46 : 58, r: n ? 90 : 222, t: 18, b: n ? 44 : 50 },
    font:   { family: "IBM Plex Sans, sans-serif", size: n ? 10 : 11, color: "#1f2a1f" },
    legend: {
      orientation: "h",
      y: n ? -0.30 : 1.12,
      x: 0,
      font: { size: n ? 9 : 11 },
      bgcolor: "rgba(0,0,0,0)",
      itemsizing: "constant",
    },
  };
}

/** Shared x-axis (time). */
function xAxisCfg(extra = {}) {
  return {
    title: "t (h)",
    gridcolor: "rgba(31,42,31,0.08)",
    linecolor: "rgba(31,42,31,0.15)",
    automargin: true,
    ...extra,
  };
}

/** Primary (left) y-axis. */
function leftAxisCfg(title, color, extra = {}) {
  return {
    title,
    gridcolor: "rgba(31,42,31,0.08)",
    linecolor: "rgba(31,42,31,0.15)",
    automargin: true,
    titlefont: { color },
    tickfont:  { color },
    ...extra,
  };
}

/**
 * Secondary (right) y-axis.
 * desktopShift: extra px offset on wide screens (0 = inner, 68 = outer).
 */
function rightAxisCfg(title, color, desktopShift, extra = {}) {
  const n = isNarrow();
  const axis = {
    title,
    overlaying:    "y",
    anchor:        "free",
    side:          "right",
    showgrid:      false,
    autoshift:     true,
    automargin:    true,
    title_standoff: n ? 5 : 10,
    titlefont:     { color },
    tickfont:      { color },
    ...extra,
  };
  if (!n) axis.shift = desktopShift;
  return axis;
}

const PLOT_CONFIG = { responsive: true, displayModeBar: false };

// ── Chart 1 — Concentration time series ──────────────────────────────────────
function renderTimeSeries(series) {
  const productRange = computeAxisRange(series.P,  { minPad: 0.25 });
  const muRange      = computeAxisRange(series.mu, { includeZero: true, minPad: 0.05 });

  Plotly.newPlot("time-series-plot", [
    {
      x: series.t, y: series.X,
      name: "X", type: "scatter", mode: "lines",
      line: { color: C.biomass,   width: 2.5 },
    },
    {
      x: series.t, y: series.S,
      name: "S", type: "scatter", mode: "lines",
      line: { color: C.substrate, width: 2.5 },
    },
    {
      x: series.t, y: series.P,
      name: "P", type: "scatter", mode: "lines", yaxis: "y2",
      line: { color: C.product,   width: 2.5 },
    },
    {
      x: series.t, y: series.mu,
      name: "μ", type: "scatter", mode: "lines", yaxis: "y3",
      line: { color: C.kinetics,  width: 2, dash: "dot" },
    },
  ], {
    ...basePlotLayout(),
    xaxis:  xAxisCfg(),
    yaxis:  leftAxisCfg("X, S (g L<sup>−1</sup>)", C.biomass),
    yaxis2: rightAxisCfg("P (g L<sup>−1</sup>)",    C.product,  60,  { range: productRange }),
    yaxis3: rightAxisCfg("μ (h<sup>−1</sup>)",      C.kinetics, 128, { range: muRange }),
  }, PLOT_CONFIG);
}

// ── Chart 2 — Formation rates ─────────────────────────────────────────────────
function renderRatePlot(series) {
  const dPdtRange = computeAxisRange(series.dPdt, { includeZero: true, minPad: 0.05 });
  const qpRange   = computeAxisRange(series.qp,   { includeZero: true, minPad: 0.02 });

  Plotly.newPlot("rate-plot", [
    {
      x: series.t, y: series.dXdt,
      name: "dX/dt", type: "scatter", mode: "lines",
      line: { color: C.biomass,   width: 2.5 },
    },
    {
      x: series.t, y: series.dSdt,
      name: "dS/dt", type: "scatter", mode: "lines",
      line: { color: C.substrate, width: 2.5 },
    },
    {
      x: series.t, y: series.dPdt,
      name: "dP/dt", type: "scatter", mode: "lines", yaxis: "y2",
      line: { color: C.product,   width: 2.5, dash: "dash" },
    },
    {
      x: series.t, y: series.qp,
      name: "q<sub>p</sub>", type: "scatter", mode: "lines", yaxis: "y3",
      line: { color: C.kinetics,  width: 2, dash: "dot" },
    },
  ], {
    ...basePlotLayout(),
    xaxis:  xAxisCfg(),
    yaxis:  leftAxisCfg(
      "dX/dt, dS/dt (g L<sup>−1</sup> h<sup>−1</sup>)", C.biomass,
      { zeroline: true, zerolinecolor: "rgba(31,42,31,0.25)", zerolinewidth: 1.5 },
    ),
    yaxis2: rightAxisCfg(
      "dP/dt (g L<sup>−1</sup> h<sup>−1</sup>)", C.product, 60,
      { range: dPdtRange },
    ),
    yaxis3: rightAxisCfg(
      "q<sub>p</sub> (g<sub>P</sub> g<sub>X</sub><sup>−1</sup> h<sup>−1</sup>)", C.kinetics, 128,
      { range: qpRange },
    ),
  }, PLOT_CONFIG);
}

// ── Chart 3 — Volume, flow and dilution ───────────────────────────────────────
function renderVolumePlot(series) {
  const volumeValues  = Array.isArray(series.V) ? series.V : [];
  const flowRange     = computeAxisRange(series.F,        { includeZero: true, minPad: 0.05 });
  const dilutionRange = computeAxisRange(series.dilution, { includeZero: true, minPad: 0.02 });
  const vMin = Math.min(...volumeValues);
  const vMax = Math.max(...volumeValues);
  const isConstantV = volumeValues.length > 0 && Math.abs(vMax - vMin) < 1e-9;
  const vPad = Math.max(vMax * 0.12, 0.5);

  Plotly.newPlot("volume-plot", [
    {
      x: series.t, y: series.V,
      name: "V", type: "scatter", mode: "lines",
      line: { color: C.volume, width: 2.5 },
      fill: isConstantV ? "none" : "tozeroy",
      fillcolor: "rgba(121,85,72,0.10)",
    },
    {
      x: series.t, y: series.F,
      name: "F", type: "scatter", mode: "lines", yaxis: "y2",
      line: { color: C.product, width: 2.5 },
    },
    {
      x: series.t, y: series.dilution,
      name: "D", type: "scatter", mode: "lines", yaxis: "y3",
      line: { color: C.kinetics, width: 2.5, dash: "dot" },
    },
  ], {
    ...basePlotLayout(),
    xaxis:  xAxisCfg(),
    yaxis:  leftAxisCfg("V (L)", C.volume, isConstantV
      ? { range: [Math.max(0, vMin - vPad), vMax + vPad] }
      : { rangemode: "tozero" },
    ),
    yaxis2: rightAxisCfg("F (L h<sup>−1</sup>)", C.product,  60,  { range: flowRange }),
    yaxis3: rightAxisCfg("D (h<sup>−1</sup>)",   C.kinetics, 128, { range: dilutionRange }),
  }, PLOT_CONFIG);
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
  enforceVolumeConstraint();
  updateReactorMode(document.getElementById("culture_mode").value);
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

// ── Reactor diagram ───────────────────────────────────────────────────────────
function updateReactorMode(mode) {
  const svg = document.getElementById("reactor-svg");
  const eq  = document.getElementById("r-eq-text");
  if (!svg) return;
  svg.classList.remove("mode-batch", "mode-fedbatch", "mode-continuous");
  svg.classList.add(`mode-${mode}`);
  if (eq) {
    const labels = {
      batch:      "Sin flujos \xB7 V constante",
      fedbatch:   "dV/dt = F \xB7 D(t) = F/V(t) decrece",
      continuous: "Fin = Fout \xB7 D = F/V = cte.",
    };
    eq.textContent = labels[mode] ?? "";
  }
}

// Enforce V_max >= V_working so the reactor can never start above its own capacity
function enforceVolumeConstraint() {
  const vwInput = document.getElementById("V_working");
  const vmInput = document.getElementById("V_max");
  if (!vwInput || !vmInput) return;
  const vw = Number(vwInput.value);
  vmInput.min = vw;
  if (Number(vmInput.value) < vw) {
    vmInput.value = vw;
    const out = document.getElementById("V_max_value");
    if (out) out.textContent = fmt(vw);
  }
}

for (const id of controls) {
  const input = document.getElementById(id);
  input.addEventListener("input", () => {
    if (id === "V_working" || id === "V_max") enforceVolumeConstraint();
    syncOutputs();
    debouncedRun();
  });
}

document.getElementById("growth_model").addEventListener("input", () => {
  handleGrowthModelChange(document.getElementById("growth_model").value);
});

document.getElementById("hero-model-select").addEventListener("input", () => {
  handleGrowthModelChange(document.getElementById("hero-model-select").value);
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

document.getElementById("vmax_mode").addEventListener("input", () => {
  updateConditionalControls();
  debouncedRun();
});

document.getElementById("culture_mode").addEventListener("input", () => {
  handleCultureModeChange(document.getElementById("culture_mode").value);
});

document.getElementById("hero-culture-select").addEventListener("input", () => {
  handleCultureModeChange(document.getElementById("hero-culture-select").value);
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
  const insightNode = document.getElementById("insight-text");
  if (insightNode) {
    insightNode.textContent =
      "La app no pudo cargar el runtime de Python. Revisa el acceso a la red o ejecuta desde un servidor local.";
  }
});
