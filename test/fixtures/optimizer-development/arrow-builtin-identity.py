import math


def render_cells(xs, ys, ug, vg, limit, span, anchor, cap_length, cap_width):
    xout = []
    yout = []
    for row_number, ordinate in enumerate(ys):
        ur = ug[row_number]
        vr = vg[row_number]
        if not isinstance(ur, list) or not isinstance(vr, list):
            raise TypeError("rows must be arrays")
        for column_number, abscissa in enumerate(xs):
            u = ur[column_number]
            v = vr[column_number]
            if u is None or v is None:
                continue
            norm = math.hypot(float(u), float(v))
            if norm == 0 or limit == 0:
                continue
            dx = float(u) / limit * span
            dy = float(v) / limit * span
            if anchor == "middle":
                x0, y0 = float(abscissa) - dx / 2, float(ordinate) - dy / 2
            elif anchor == "tip":
                x0, y0 = float(abscissa) - dx, float(ordinate) - dy
            else:
                x0, y0 = float(abscissa), float(ordinate)
            x1, y1 = x0 + dx, y0 + dy
            xout.extend((x0, x1, None))
            yout.extend((y0, y1, None))
            if cap_width > 0 and cap_length > 0:
                dir_x, dir_y = float(u) / norm, float(v) / norm
                rear_x = x1 - dx * cap_length
                rear_y = y1 - dy * cap_length
                cap_norm = math.hypot(dx, dy)
                offset_x = -dir_y * cap_norm * cap_width
                offset_y = dir_x * cap_norm * cap_width
                xout.extend((rear_x + offset_x, x1, rear_x - offset_x, None))
                yout.extend((rear_y + offset_y, y1, rear_y - offset_y, None))
    return xout, yout
