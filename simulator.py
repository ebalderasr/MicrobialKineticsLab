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


def product_competitive_mu(substrate: float, product: float, mu_max: float, ks: float, kp: float) -> float:
    substrate = max(float(substrate), 0.0)
    product = max(float(product), 0.0)
    kp = max(float(kp), 1e-9)
    denominator = ks * (1.0 + product / kp) + substrate
    if denominator <= 0:
        return 0.0
    return mu_max * substrate / denominator


def product_noncompetitive_mu(substrate: float, product: float, mu_max: float, ks: float, kp: float) -> float:
    substrate = max(float(substrate), 0.0)
    product = max(float(product), 0.0)
    kp = max(float(kp), 1e-9)
    inhibition = 1.0 + product / kp
    denominator = ks + substrate
    if denominator <= 0 or inhibition <= 0:
        return 0.0
    return (mu_max / inhibition) * substrate / denominator


def product_proxy(x: float, x0: float) -> float:
    return max(float(x) - float(x0), 0.0)


def effective_kd(params: dict[str, float | str]) -> float:
    return 0.0 if params["growth_model"] == "monod_simple" else float(params["kd"])


def growth_mu(x: float, substrate: float, params: dict[str, float | str]) -> float:
    model = params["growth_model"]
    if model == "haldane":
        return haldane_mu(substrate, params["mu_max"], params["Ks"], params["Ki"])
    if model == "product_competitive":
        product = product_proxy(x, params["X0"])
        return product_competitive_mu(substrate, product, params["mu_max"], params["Ks"], params["Kp"])
    if model == "product_noncompetitive":
        product = product_proxy(x, params["X0"])
        return product_noncompetitive_mu(substrate, product, params["mu_max"], params["Ks"], params["Kp"])
    return monod_mu(substrate, params["mu_max"], params["Ks"])


def rhs(x: float, s: float, params: dict[str, float | str]) -> tuple[float, float, float]:
    mu = growth_mu(x, s, params)
    net_mu = mu - effective_kd(params)
    dx_dt = net_mu * x
    ds_dt = -(mu * x) / params["Yxs"]
    return dx_dt, ds_dt, mu


def rk4_step(x: float, s: float, params: dict[str, float | str], dt: float) -> tuple[float, float, float, float]:
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
    mu_values = [growth_mu(x, s, params)]
    growth_rates = [(mu_values[0] - effective_kd(params)) * x]

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
