# Microbial Kinetics Lab

Proyecto independiente para enseñanza de cinética microbiana en navegador usando `Pyodide`.

## Enfoque

Esta versión no replica el proyecto original de `BioReact-Lite`. Se rediseñó con un objetivo docente distinto:

- Cultivo `batch`, no quimiostato.
- Sin plano de fases.
- Sin Jacobiana ni análisis de estabilidad local.
- Controles continuos para explorar sensibilidad paramétrica.
- Python ejecutándose en el navegador con `Pyodide`.

## Modelo

La app mantiene operación en `lote` y permite seleccionar distintas ecuaciones de crecimiento:

- `Monod`: `mu(S) = mu_max * S / (Ks + S)`
- `Haldane / inhibición por sustrato`: `mu(S) = mu_max * S / (Ks + S + S^2 / Ki)`
- `Moser`: `mu(S) = mu_max * S^n / (Ks + S^n)`

Además:

- `dX/dt = (mu - kd) * X`
- `dS/dt = -(mu * X) / Yxs`

La integración numérica usa `RK4`.

Los parámetros opcionales se desbloquean según el modelo activo:

- `Ki` para inhibición por sustrato
- `n` para Moser

## Estructura

- `index.html`: interfaz docente
- `styles.css`: identidad visual
- `app.js`: interacción y gráficas con `Plotly`
- `simulator.py`: motor numérico ejecutado por `Pyodide`

## GitHub Pages

Con GitHub Pages configurado como `Deploy from a branch` sobre `main`, la app queda servida directamente desde:

`https://ebalderasr.github.io/MicrobialKineticsLab/`

La app es estática y usa rutas relativas, así que no requiere backend para funcionar en Pages.

## Ejecución local

Como el navegador bloquea `fetch()` desde `file://`, sirve el directorio con un servidor simple:

```bash
python3 -m http.server 8000
```

Luego abre `http://localhost:8000`.

## Siguiente iteración sugerida

- Añadir comparación entre dos escenarios en paralelo.
- Incorporar modo `batch` vs `fed-batch`.
- Agregar panel con preguntas guiadas para clase.
