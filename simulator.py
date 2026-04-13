from __future__ import annotations

import json
import math


def monod_mu(substrate: float, mu_max: float, ks: float) -> float:
    substrate = max(float(substrate), 0.0)
    denominator = ks + substrate
    if denominator <= 0:
        return 0.0
    return mu_max * substrate / denominator


def haldane_mu(substrate: float, mu_max: float, ks: float, ki: float) -> float:
    substrate = max(float(substrate), 0.0)
    ki = max(float(ki), 1e-9)
    denominator = ks + substrate + (substrate * substrate / ki)
    if denominator <= 0:
        return 0.0
    return mu_max * substrate / denominator


def moser_mu(substrate: float, mu_max: float, ks: float, exponent: float) -> float:
    substrate = max(float(substrate), 0.0)
    exponent = max(float(exponent), 1e-9)
    powered = substrate ** exponent
    denominator = ks + powered
    if denominator <= 0:
        return 0.0
    return mu_max * powered / denominator


def growth_mu(substrate: float, params: dict[str, float | str]) -> float:
    model = params["growth_model"]
    if model == "haldane":
        return haldane_mu(substrate, params["mu_max"], params["Ks"], params["Ki"])
    if model == "moser":
        return moser_mu(substrate, params["mu_max"], params["Ks"], params["n"])
    return monod_mu(substrate, params["mu_max"], params["Ks"])


def rhs(x: float, s: float, params: dict[str, float]) -> tuple[float, float, float]:
    mu = growth_mu(s, params)
    net_mu = mu - params["kd"]
    dx_dt = net_mu * x
    ds_dt = -(mu * x) / params["Yxs"]
    return dx_dt, ds_dt, mu


def rk4_step(x: float, s: float, params: dict[str, float], dt: float) -> tuple[float, float, float, float]:
    k1x, k1s, mu1 = rhs(x, s, params)
    k2x, k2s, mu2 = rhs(x + 0.5 * dt * k1x, s + 0.5 * dt * k1s, params)
    k3x, k3s, mu3 = rhs(x + 0.5 * dt * k2x, s + 0.5 * dt * k2s, params)
    k4x, k4s, mu4 = rhs(x + dt * k3x, s + dt * k3s, params)

    next_x = x + (dt / 6.0) * (k1x + 2 * k2x + 2 * k3x + k4x)
    next_s = s + (dt / 6.0) * (k1s + 2 * k2s + 2 * k3s + k4s)
    next_x = max(next_x, 0.0)
    next_s = max(next_s, 0.0)
    avg_mu = (mu1 + 2 * mu2 + 2 * mu3 + mu4) / 6.0
    avg_dx = (k1x + 2 * k2x + 2 * k3x + k4x) / 6.0
    return next_x, next_s, avg_mu, avg_dx


def simulate_batch(params: dict[str, float | str]) -> dict[str, object]:
    dt = params["dt"]
    t_final = params["t_final"]
    x = params["X0"]
    s = params["S0"]

    times = [0.0]
    biomass = [x]
    substrate = [s]
    mu_values = [growth_mu(s, params)]
    growth_rates = [(mu_values[0] - params["kd"]) * x]

    depletion_time = None
    n_steps = int(math.ceil(t_final / dt))

    for step in range(1, n_steps + 1):
        current_time = min(step * dt, t_final)
        step_dt = current_time - times[-1]
        x, s, mu, dx_dt = rk4_step(x, s, params, step_dt)
        times.append(current_time)
        biomass.append(x)
        substrate.append(s)
        mu_values.append(mu)
        growth_rates.append(dx_dt)
        if depletion_time is None and s <= max(0.02 * params["S0"], 0.05):
            depletion_time = current_time

    return {
        "series": {
            "t": times,
            "X": biomass,
            "S": substrate,
            "mu": mu_values,
            "dXdt": growth_rates,
        },
        "summary": {
            "final_X": biomass[-1],
            "final_S": substrate[-1],
            "peak_mu": max(mu_values),
            "depletion_time": depletion_time,
        },
    }


def run_simulation(raw_params: str) -> str:
    params = json.loads(raw_params)
    result = simulate_batch(params)
    return json.dumps(result)
