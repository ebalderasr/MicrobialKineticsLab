<div align="center">

# Microbial Kinetics Lab

### Interactive microbial kinetics simulator for batch, fed-batch, and continuous culture — entirely in your browser

<br>

**[→ Open the live app](https://ebalderasr.github.io/MicrobialKineticsLab/)**

<br>

[![Stack](https://img.shields.io/badge/Stack-Pyodide_·_Python_·_Plotly-4A90D9?style=for-the-badge)]()
[![Focus](https://img.shields.io/badge/Focus-Microbial_Kinetics_·_Teaching-34C759?style=for-the-badge)]()
[![Modes](https://img.shields.io/badge/Modes-Batch_·_Fed--batch_·_Continuous-F59E0B?style=for-the-badge)]()
[![Part of](https://img.shields.io/badge/Part_of-HostCell_Lab_Suite-5856D6?style=for-the-badge)](https://www.hostcell.app)

</div>

---

## What is Microbial Kinetics Lab?

Microbial Kinetics Lab is a **browser-based teaching simulator** for bioprocess kinetics. It lets you explore how biomass, substrate, product, volume, flow, and dilution evolve over time under different culture modes and growth models, with interactive controls and plots that respond instantly in the browser.

It runs entirely client-side through [Pyodide](https://pyodide.org), which brings Python to the browser via WebAssembly. **No installation. No backend. No local Python environment required for the app itself.**

---

## Why it matters

Kinetic models are usually introduced through static equations on slides or spreadsheet exercises that make it hard to build intuition. Students may see the formulas, but not immediately grasp how a higher feed rate, stronger product inhibition, or a larger dilution rate changes the trajectory of a culture.

Microbial Kinetics Lab turns those equations into an interactive environment:

- Switch between **batch**, **fed-batch**, and **continuous** operation
- Compare different **growth-limitation and inhibition models**
- Enable or disable **product formation**
- Inspect the resulting trajectories in real time through interactive charts
- Use the built-in interpretation guide to connect the math with the biology

What is usually explained abstractly becomes something you can manipulate and observe directly.

---

## How it works

Four steps. No installation. No notebook setup.

<br>

**Step 1 — Choose the culture mode**

Select **Lote (Batch)**, **Fed-batch**, or **Continuo (Chemostat)**. The interface updates the reactor diagram, the relevant balances, and the available process parameters.

<br>

**Step 2 — Choose the kinetic model**

Pick a growth expression such as **Monod**, **Monod + cell death**, **Haldane / Andrews**, or one of several **product inhibition** models. Then define whether product formation is absent, growth-associated, or non-growth-associated.

<br>

**Step 3 — Adjust organism, reactor, and simulation parameters**

Tune parameters such as `mu_max`, `Ks`, `Ki`, `Kip`, `kp`, `Yxs`, `kd`, `alpha`, `beta`, `F`, `S_r`, `D`, `V0`, `Vmax`, `dt`, and final simulation time with continuous sliders.

<br>

**Step 4 — Explore the response**

The app simulates the system in Python using **RK4 integration** and renders:

- a **time-series chart** for `X`, `S`, `P`, and `mu`
- a **phase plot** for biomass vs substrate
- a **volume / flow / dilution plot**
- summary metrics and an automatically generated teaching insight

<br>

---

## Methods

The simulator solves dynamic mass balances for biomass `X`, substrate `S`, product `P`, and, when relevant, reactor volume `V`.

### Core kinetic terms

The app computes a specific growth rate `mu` from the selected model, then uses it in the process balances.

**Monod**

$$\mu(S) = \mu_{max}\frac{S}{K_s + S}$$

**Monod with cell death**

Growth follows Monod kinetics, while biomass includes a decay term `k_d`.

**Haldane / Andrews**

$$\mu(S) = \mu_{max}\frac{S}{K_s + S + S^2/K_i}$$

This introduces **substrate inhibition**, so excessive substrate can reduce growth instead of enhancing it.

**Product inhibition models**

The app also supports:

- competitive inhibition by product
- noncompetitive inhibition by product
- linear inhibition by product
- exponential inhibition by product

### Product formation modes

Three product modes are available:

- `none`: `q_p = 0`
- `growth_associated`: `q_p = alpha * mu`
- `nongrowth_associated`: `q_p = beta`

### Batch mode

No inlet or outlet streams are present:

$$\frac{dX}{dt} = \mu X$$

$$\frac{dS}{dt} = -\frac{\mu X}{Y_{x/s}}$$

$$\frac{dP}{dt} = q_p X$$

If the selected model includes cell death, biomass becomes:

$$\frac{dX}{dt} = (\mu - k_d)X$$

### Fed-batch mode

In fed-batch, the reactor receives an inlet flow `F`, so volume changes with time:

$$\frac{dV}{dt} = F$$

The dilution term is time-dependent:

$$D(t) = \frac{F}{V(t)}$$

Balances become:

$$\frac{dX}{dt} = (\mu - D)X$$

$$\frac{dS}{dt} = -\frac{\mu X}{Y_{x/s}} + D(S_r - S)$$

$$\frac{dP}{dt} = q_p X - DP$$

The simulator can run in an **idealized** fed-batch mode or enforce a **reactor volume cap `Vmax`**, automatically stopping the effective feed when the vessel reaches capacity.

### Continuous mode

For chemostat operation, inflow and outflow are balanced and dilution is constant:

$$D = \frac{F}{V}$$

$$\frac{dX}{dt} = (\mu - D)X$$

$$\frac{dS}{dt} = -\frac{\mu X}{Y_{x/s}} + D(S_r - S)$$

$$\frac{dP}{dt} = q_p X - DP$$

At steady state, the central teaching idea is that **growth must match dilution**:

$$\mu = D$$

### Numerical integration

The ODE system is integrated with **fourth-order Runge-Kutta (RK4)** in `simulator.py`, using the user-defined `dt` and total simulation time.

---

## Features

| | |
|---|---|
| **Zero installation** | Runs fully in the browser through Pyodide |
| **3 culture modes** | Batch, fed-batch, and continuous |
| **7 growth models** | Monod, Monod + death, Haldane, and four product inhibition variants |
| **3 product modes** | No product, growth-associated, and non-growth-associated |
| **Interactive controls** | Continuous sliders and selectors for kinetic and process parameters |
| **3 interactive plots** | Time series, phase portrait, and volume/flow/dilution view |
| **Live teaching feedback** | Automatic summary metrics plus contextual interpretation text |
| **Built-in guide** | Explanations of `mu`, dilution, mass balances, and reactor modes |
| **Static deployment** | Can be hosted directly on GitHub Pages |

---

## Tech stack

**Analysis (in-browser via WebAssembly)**

![Pyodide](https://img.shields.io/badge/Pyodide-3776AB?style=flat-square&logo=python&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Plotly](https://img.shields.io/badge/Plotly-3F4F75?style=flat-square&logo=plotly&logoColor=white)

**Frontend**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

---

## Project structure

```text
MicrobialKineticsLab/
├── index.html      ← UI, controls, guide content, and plot containers
├── styles.css      ← visual design and layout
├── app.js          ← Pyodide init, UI logic, and Plotly rendering
├── simulator.py    ← kinetic models, balances, and RK4 solver
└── README.md
```

---

## GitHub Pages

With GitHub Pages configured as **Deploy from a branch** on `main`, the app is served directly at:

`https://ebalderasr.github.io/MicrobialKineticsLab/`

Because the project is fully static and uses relative paths, it does not require a backend.

---

## Run locally

Because browsers block `fetch()` requests from `file://`, serve the folder with a local HTTP server:

```bash
python3 -m http.server 8000
```

Then open:

`http://localhost:8000`

---

## Teaching use cases

- Introduce Monod kinetics and substrate limitation
- Show why **more substrate is not always better** under Haldane inhibition
- Compare batch depletion against fed-batch extension of the productive phase
- Explain washout risk in a chemostat when `D` approaches or exceeds `mu`
- Contrast growth-associated and non-growth-associated product formation

---

## Notes

- The app needs network access to load Pyodide and Plotly from their CDNs.
- If the runtime cannot initialize, the interface reports the error in-browser.
- The current repository is focused on **interactive simulation for teaching**, not experimental data ingestion or report export.
