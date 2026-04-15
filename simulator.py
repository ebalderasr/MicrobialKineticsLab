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


def growth_mu(substrate: float, product: float, params: dict) -> float:
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


def effective_mu_for_biomass(mu: float, params: dict) -> float:
    if params["growth_model"] == "monod_cell_death":
        return mu - params["kd"]
    return mu


def qp_value(mu: float, params: dict) -> float:
    if params["product_mode"] == "none":
        return 0.0
    if params["product_mode"] == "growth_associated":
        return params["alpha"] * mu
    return params["beta"]


def rhs(
    x: float, s: float, p: float, params: dict, d_dilution: float = 0.0
) -> tuple[float, float, float, float, float]:
    s_r = params.get("S_r", 0.0)
    mu = growth_mu(s, p, params)
    qp = qp_value(mu, params)
    dx_dt = effective_mu_for_biomass(mu, params) * x - d_dilution * x
    ds_dt = -(mu * x) / params["Yxs"] + d_dilution * (s_r - s)
    dp_dt = qp * x - d_dilution * p
    return dx_dt, ds_dt, dp_dt, mu, qp


def _d_fedbatch(params: dict, v: float) -> float:
    """Instantaneous dilution rate for fed-batch given current volume."""
    return params.get("F", 0.0) / max(v, 1e-9)


def _use_vmax(params: dict) -> bool:
    return params.get("vmax_mode") == "limited"


def _effective_fedbatch_flow(params: dict, v: float, dt: float) -> float:
    flow = max(params.get("F", 0.0), 0.0)
    if not _use_vmax(params):
        return flow

    vmax = max(params.get("V_max", 0.0), 0.0)
    if vmax <= 0.0:
        return flow
    if v >= vmax:
        return 0.0
    if dt <= 0.0:
        return flow

    return min(flow, max(vmax - v, 0.0) / dt)


def _flow_rate(params: dict, mode: str, v: float | None) -> float:
    if mode == "fedbatch":
        return _effective_fedbatch_flow(params, max(v or 0.0, 0.0), params.get("dt", 0.0))
    if mode == "continuous":
        return params.get("D", 0.0) * max(v or 0.0, 0.0)
    return 0.0


def _dilution_rate(params: dict, mode: str, v: float | None) -> float:
    if mode == "fedbatch":
        flow = _effective_fedbatch_flow(params, max(v or 0.0, 0.0), params.get("dt", 0.0))
        return flow / max(v or 1.0, 1e-9)
    if mode == "continuous":
        return params.get("D", 0.0)
    return 0.0


def rk4_step(
    x: float,
    s: float,
    p: float,
    params: dict,
    dt: float,
    v: float | None = None,
) -> tuple[float, float, float, float, float, float, float, float, float | None]:
    mode = params.get("culture_mode", "batch")
    F = params.get("F", 0.0)

    if mode == "fedbatch" and v is not None:
        effective_flow = _effective_fedbatch_flow(params, v, dt)
        # V varies linearly within step (dV/dt = F = const), so we can compute
        # the exact volume at each RK4 sub-step without integrating V itself.
        d1 = effective_flow / max(v, 1e-9)
        d2 = effective_flow / max(v + 0.5 * dt * effective_flow, 1e-9)
        d3 = d2
        d4 = effective_flow / max(v + dt * effective_flow, 1e-9)
        v_next = v + dt * effective_flow
    elif mode == "continuous":
        d1 = d2 = d3 = d4 = params.get("D", 0.0)
        v_next = v
    else:
        d1 = d2 = d3 = d4 = 0.0
        v_next = v

    k1x, k1s, k1p, mu1, qp1 = rhs(x, s, p, params, d1)
    k2x, k2s, k2p, mu2, qp2 = rhs(x + 0.5 * dt * k1x, s + 0.5 * dt * k1s, p + 0.5 * dt * k1p, params, d2)
    k3x, k3s, k3p, mu3, qp3 = rhs(x + 0.5 * dt * k2x, s + 0.5 * dt * k2s, p + 0.5 * dt * k2p, params, d3)
    k4x, k4s, k4p, mu4, qp4 = rhs(x + dt * k3x, s + dt * k3s, p + dt * k3p, params, d4)

    next_x = x + (dt / 6.0) * (k1x + 2 * k2x + 2 * k3x + k4x)
    next_s = s + (dt / 6.0) * (k1s + 2 * k2s + 2 * k3s + k4s)
    next_p = p + (dt / 6.0) * (k1p + 2 * k2p + 2 * k3p + k4p)

    next_x = max(next_x, 0.0)
    next_s = max(next_s, 0.0)
    next_p = max(next_p, 0.0)

    avg_mu = (mu1 + 2 * mu2 + 2 * mu3 + mu4) / 6.0
    avg_qp = (qp1 + 2 * qp2 + 2 * qp3 + qp4) / 6.0
    avg_dx = (k1x + 2 * k2x + 2 * k3x + k4x) / 6.0
    avg_ds = (k1s + 2 * k2s + 2 * k3s + k4s) / 6.0
    avg_dp = (k1p + 2 * k2p + 2 * k3p + k4p) / 6.0

    return next_x, next_s, next_p, avg_mu, avg_qp, avg_dx, avg_ds, avg_dp, v_next


def simulate(params: dict) -> dict:
    dt = params["dt"]
    t_final = params["t_final"]
    x = params["X0"]
    s = params["S0"]
    p = params["P0"]
    mode = params.get("culture_mode", "batch")
    working_volume = params.get("V_working", 1.0)

    if mode == "fedbatch":
        v: float | None = working_volume
    else:
        v = working_volume

    if mode == "fedbatch" and v is not None:
        d0 = _d_fedbatch(params, v)
    elif mode == "continuous":
        d0 = params.get("D", 0.0)
    else:
        d0 = 0.0

    initial_mu = growth_mu(s, p, params)
    initial_qp = qp_value(initial_mu, params)

    times = [0.0]
    biomass = [x]
    substrate = [s]
    product = [p]
    mu_values = [initial_mu]
    qp_values = [initial_qp]
    growth_rates = [effective_mu_for_biomass(initial_mu, params) * x - d0 * x]
    substrate_rates = [-(initial_mu * x) / params["Yxs"] + d0 * (params.get("S_r", 0.0) - s)]
    product_rates = [initial_qp * x - d0 * p]
    volumes = [v if v is not None else 0.0]
    flow_rates = [_flow_rate(params, mode, v)]
    dilution_rates = [_dilution_rate(params, mode, v)]

    depletion_time = None
    n_steps = int(math.ceil(t_final / dt))

    for step in range(1, n_steps + 1):
        current_time = min(step * dt, t_final)
        step_dt = current_time - times[-1]
        x, s, p, mu, qp, dx_dt, ds_dt, dp_dt, v = rk4_step(x, s, p, params, step_dt, v)
        times.append(current_time)
        biomass.append(x)
        substrate.append(s)
        product.append(p)
        mu_values.append(mu)
        qp_values.append(qp)
        growth_rates.append(dx_dt)
        substrate_rates.append(ds_dt)
        product_rates.append(dp_dt)
        volumes.append(v if v is not None else 0.0)
        flow_rates.append(_flow_rate(params, mode, v))
        dilution_rates.append(_dilution_rate(params, mode, v))
        if depletion_time is None and s <= max(0.02 * params["S0"], 0.05):
            depletion_time = current_time

    result: dict = {
        "series": {
            "t": times,
            "X": biomass,
            "S": substrate,
            "P": product,
            "mu": mu_values,
            "qp": qp_values,
            "dXdt": growth_rates,
            "dSdt": substrate_rates,
            "dPdt": product_rates,
            "V": volumes,
            "F": flow_rates,
            "dilution": dilution_rates,
        },
        "summary": {
            "final_X": biomass[-1],
            "final_S": substrate[-1],
            "final_P": product[-1],
            "peak_mu": max(mu_values),
            "depletion_time": depletion_time,
            "final_V": volumes[-1] if mode == "fedbatch" else None,
        },
    }
    return result


def run_simulation(raw_params: str) -> str:
    params = json.loads(raw_params)
    result = simulate(params)
    return json.dumps(result)
