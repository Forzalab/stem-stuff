import numpy as np
def lin(c):
    c = np.asarray(c, float) / 255
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
def relL(c): r, g, b = lin(c); return .2126 * r + .7152 * g + .0722 * b
def cr(a, b): la, lb = relL(a), relL(b); return (max(la, lb) + .05) / (min(la, lb) + .05)
def luma(rgb): return rgb[..., 0] * .299 + rgb[..., 1] * .587 + rgb[..., 2] * .114
