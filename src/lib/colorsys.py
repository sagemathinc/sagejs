"""Conversions between RGB, YIQ, HLS, and HSV color systems.

Inputs and outputs are triples of floats, normally in the interval from zero
to one.  The implementation follows Python's :mod:`colorsys` module.
"""

__all__ = [
    "rgb_to_yiq",
    "yiq_to_rgb",
    "rgb_to_hls",
    "hls_to_rgb",
    "rgb_to_hsv",
    "hsv_to_rgb",
]

ONE_THIRD = 1.0 / 3.0
ONE_SIXTH = 1.0 / 6.0
TWO_THIRD = 2.0 / 3.0


def rgb_to_yiq(r, g, b):
    y = 0.30 * r + 0.59 * g + 0.11 * b
    i = 0.74 * (r - y) - 0.27 * (b - y)
    q = 0.48 * (r - y) + 0.41 * (b - y)
    return y, i, q


def yiq_to_rgb(y, i, q):
    r = y + 0.9468822170900693 * i + 0.6235565819861433 * q
    g = y - 0.27478764629897834 * i - 0.6356910791873801 * q
    b = y - 1.1085450346420322 * i + 1.7090069284064666 * q
    return (
        min(max(r, 0.0), 1.0),
        min(max(g, 0.0), 1.0),
        min(max(b, 0.0), 1.0),
    )


def rgb_to_hls(r, g, b):
    maxc = max(r, g, b)
    minc = min(r, g, b)
    sumc = maxc + minc
    rangec = maxc - minc
    lightness = sumc / 2.0
    if minc == maxc:
        return 0.0, lightness, 0.0
    if lightness <= 0.5:
        saturation = rangec / sumc
    else:
        saturation = rangec / (2.0 - maxc - minc)
    rc = (maxc - r) / rangec
    gc = (maxc - g) / rangec
    bc = (maxc - b) / rangec
    if r == maxc:
        hue = bc - gc
    elif g == maxc:
        hue = 2.0 + rc - bc
    else:
        hue = 4.0 + gc - rc
    hue = (hue / 6.0) % 1.0
    return hue, lightness, saturation


def hls_to_rgb(h, l, s):
    if s == 0.0:
        return l, l, l
    if l <= 0.5:
        m2 = l * (1.0 + s)
    else:
        m2 = l + s - l * s
    m1 = 2.0 * l - m2
    return (
        _hue_to_rgb(m1, m2, h + ONE_THIRD),
        _hue_to_rgb(m1, m2, h),
        _hue_to_rgb(m1, m2, h - ONE_THIRD),
    )


def _hue_to_rgb(m1, m2, hue):
    hue %= 1.0
    if hue < ONE_SIXTH:
        return m1 + (m2 - m1) * hue * 6.0
    if hue < 0.5:
        return m2
    if hue < TWO_THIRD:
        return m1 + (m2 - m1) * (TWO_THIRD - hue) * 6.0
    return m1


def rgb_to_hsv(r, g, b):
    maxc = max(r, g, b)
    minc = min(r, g, b)
    rangec = maxc - minc
    value = maxc
    if minc == maxc:
        return 0.0, 0.0, value
    saturation = rangec / maxc
    rc = (maxc - r) / rangec
    gc = (maxc - g) / rangec
    bc = (maxc - b) / rangec
    if r == maxc:
        hue = bc - gc
    elif g == maxc:
        hue = 2.0 + rc - bc
    else:
        hue = 4.0 + gc - rc
    hue = (hue / 6.0) % 1.0
    return hue, saturation, value


def hsv_to_rgb(h, s, v):
    if s == 0.0:
        return v, v, v
    section = int(h * 6.0)
    fraction = h * 6.0 - section
    p = v * (1.0 - s)
    q = v * (1.0 - s * fraction)
    t = v * (1.0 - s * (1.0 - fraction))
    section %= 6
    if section == 0:
        return v, t, p
    if section == 1:
        return q, v, p
    if section == 2:
        return p, v, t
    if section == 3:
        return p, q, v
    if section == 4:
        return t, p, v
    return v, p, q
