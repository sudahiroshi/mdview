# 数式の描画と書き出し {#sec:math}

数式が SVG で描かれ、図と同じように PDF / SVG / PNG に書き出せるかを確かめるファイル。
本文中の $a^2 + b^2 = c^2$ や $\theta \in [0, 2\pi)$ のようなインライン数式には
ボタンを出さない。$\sum_{i=1}^{n} x_i$ のような少し背の高いものも行内に収める。

## 基本

$$
E = mc^2
$$

$$
\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

## 分数・総和・極限

$$
\lim_{n \to \infty} \left( 1 + \frac{1}{n} \right)^{n} = e
$$

$$
\sum_{k=0}^{n} \binom{n}{k} x^{k} y^{n-k} = (x + y)^{n}
$$

## 行列

$$
\mathbf{A} =
\begin{pmatrix}
a_{11} & a_{12} & \cdots & a_{1n} \\
a_{21} & a_{22} & \cdots & a_{2n} \\
\vdots & \vdots & \ddots & \vdots \\
a_{m1} & a_{m2} & \cdots & a_{mn}
\end{pmatrix}
$$

## 複数行・記号まじり

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
$$

## 日本語を含む式

$$
\text{残響時間} \; T_{60} = 0.161 \cdot \frac{V}{A} \quad [\mathrm{s}]
$$

## 横に長い式

$$
f(x) = a_0 + a_1 x + a_2 x^2 + a_3 x^3 + a_4 x^4 + a_5 x^5 + a_6 x^6 + a_7 x^7 + a_8 x^8 + a_9 x^9 + a_{10} x^{10}
$$

## 壊れた式

$$
\frac{1}{
$$

この行が表示されていれば、壊れた式でも描画が止まっていない。
