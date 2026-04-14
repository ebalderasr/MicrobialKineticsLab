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


def product_competitive_mu(substrate: float, product: float, mu_max: float, ks: float, kip: float) -> float:
    substrate = max(float(substrate), 0.0)
    product = max(float(product), 0.0)
    kip = max(float(kip), 1e-9)
    denominator = substrate + ks * (1.0 + product / kip)
    if denominator <= 0:
        return 0.0
    return mu_max * substrate / denominator


def product_noncompetitive_mu(substrate: float, product: float, mu_max: float, ks: float, kip: float) -> float:
    substrate = max(float(substrate), 0.0)
    product = max(float(product), 0.0)
    kip = max(float(kip), 1e-9)
    monod = monod_mu(substrate, mu_max, ks)
    return monod * kip / (kip + product)


def product_linear_mu(substrate: float, product: float, mu_max: float, ks: float, kp: float) -> float:
    substrate = max(float(substrate), 0.0)
    product = max(float(product), 0.0)
    kp = max(float(kp), 0.0)
    monod = monod_mu(substrate, mu_max, ks)
    return max(monod * (1.0 - kp * product), 0.0)


def product_exponential_mu(substrate: float, product: float, mu_max: float, ks: float, kp: float) -> float:
    substrate = max(float(substrate), 0.0)
    product = max(float(product), 0.0)
    kp = max(float(kp), 0.0)
    monod = monod_mu(substrate, mu_max, ks)
    return monod * math.exp(-kp * product)


def growth_mu(substrate: float, product: float, params: dict[str, float | str]) -> float:
    model = params["growth_model"]
    if model == "haldane":
        return haldane_mu(substrate, params["mu_max"], params["Ks"], params["Ki"])
    if model == "product_competitive":
        return product_competitive_mu(substrate, product, params["mu_max"], params["Ks"], params["Kip"])
    if model == "product_noncompetitive":
        return product_noncompetitive_mu(substrate, product, params["mu_max"], params["Ks"], params["Kip"])
    if model == "product_linear":
        return product_linear_mu(substrate, product, params["mu_max"], params["Ks"], params["kp"])
    if model == "product_exponential":
        return product_exponential_mu(substrate, product, params["mu_max"], params["Ks"], params["kp"])
    return monod_mu(substrate, params["mu_max"], params["Ks"])


def effective_mu_for_biomass(mu: float, params: dict[str, float | str]) -> float:
    if params["growth_model"] == "monod_cell_death":
        return mu - params["kd"]
    return mu


def qp_value(mu: float, params: dict[str, float | str]) -> float:
    if params["product_mode"] == "growth_associated":
        return params["alpha"] * mu
    return params["beta"]


def rhs(x: float, s: float, p: float, params: dict[str, float | str]) -> tuple[float, float, float, float, float]:
    mu = growth_mu(s, p, params)
    qp = qp_value(mu, params)
    dx_dt = effective_mu_for_biomass(mu, params) * x
    ds_dt = -(mu * x) / params["Yxs"]
    dp_dt = qp * x
    return dx_dt, ds_dt, dp_dt, mu, qp


def rk4_step(
    x: float,
    s: float,
    p: float,
    params: dict[str, float | str],
    dt: float,
) -> tuple[float, float, float, float, float, float, float]:
    k1x, k1s, k1p, mu1, qp1 = rhs(x, s, p, params)
    k2x, k2s, k2p, mu2, qp2 = rhs(x + 0.5 * dt * k1x, s + 0.5 * dt * k1s, p + 0.5 * dt * k1p, params)
    k3x, k3s, k3p, mu3, qp3 = rhs(x + 0.5 * dt * k2x, s + 0.5 * dt * k2s, p + 0.5 * dt * k2p, params)
    k4x, k4s, k4p, mu4, qp4 = rhs(x + dt * k3x, s + dt * k3s, p + dt * k3p, params)

    next_x = x + (dt / 6.0) * (k1x + 2 * k2x + 2 * k3x + k4x)
    next_s = s + (dt / 6.0) * (k1s + 2 * k2s + 2 * k3s + k4s)
    next_p = p + (dt / 6.0) * (k1p + 2 * k2p + 2 * k3p + k4p)

    next_x = max(next_x, 0.0)
    next_s = max(next_s, 0.0)
    next_p = max(next_p, 0.0)

    avg_mu = (mu1 + 2 * mu2 + 2 * mu3 + mu4) / 6.0
    avg_qp = (qp1 + 2 * qp2 + 2 * qp3 + qp4) / 6.0
    avg_dx = (k1x + 2 * k2x + 2 * k3x + k4x) / 6.0
    avg_dp = (k1p + 2 * k2p + 2 * k3p + k4p) / 6.0

    return next_x, next_s, next_p, avg_mu, avg_qp, avg_dx, avg_dp


def simulate_batch(params: dict[str, float | str]) -> dict[str, object]:
    dt = params["dt"]
    t_final = params["t_final"]
    x = params["X0"]
    s = params["S0"]
    p = params["P0"]

    initial_mu = growth_mu(s, p, params)
    initial_qp = qp_value(initial_mu, params)

    times = [0.0]
    biomass = [x]
    substrate = [s]
    product = [p]
    mu_values = [initial_mu]
    qp_values = [initial_qp]
    growth_rates = [initial_mu * x]
    product_rates = [initial_qp * x]

    depletion_time = None
    n_steps = int(math.ceil(t_final / dt))

    for step in range(1, n_steps + 1):
        current_time = min(step * dt, t_final)
        step_dt = current_time - times[-1]
        x, s, p, mu, qp, dx_dt, dp_dt = rk4_step(x, s, p, params, step_dt)
        times.append(current_time)
        biomass.append(x)
        substrate.append(s)
        product.append(p)
        mu_values.append(mu)
        qp_values.append(qp)
        growth_rates.append(dx_dt)
        product_rates.append(dp_dt)
        if depletion_time is None and s <= max(0.02 * params["S0"], 0.05):
            depletion_time = current_time

    return {
        "series": {
            "t": times,
            "X": biomass,
            "S": substrate,
            "P": product,
            "mu": mu_values,
            "qp": qp_values,
            "dXdt": growth_rates,
            "dPdt": product_rates,
        },
        "summary": {
            "final_X": biomass[-1],
            "final_S": substrate[-1],
            "final_P": product[-1],
            "peak_mu": max(mu_values),
            "depletion_time": depletion_time,
        },
    }


def run_simulation(raw_params: str) -> str:
    params = json.loads(raw_params)
    result = simulate_batch(params)
    return json.dumps(result)
