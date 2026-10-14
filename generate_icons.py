import math
import os
from PIL import Image, ImageDraw

def create_timesheet_icon(size=512):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background Squircle (Modern App Icon)
    pad = size * 0.04
    radius = size * 0.22

    # Vibrant Indigo/Blue fill
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=radius,
        fill=(37, 99, 235, 255) # #2563eb
    )

    # Subtle inner border for crisp contrast
    inner_pad = pad + size * 0.015
    draw.rounded_rectangle(
        [inner_pad, inner_pad, size - inner_pad, size - inner_pad],
        radius=radius * 0.95,
        outline=(96, 165, 250, 160), # #60a5fa
        width=max(1, int(size * 0.018))
    )

    # 2. Clock Face inside squircle
    center = size / 2
    clock_radius = size * 0.35

    # White clock dial
    draw.ellipse(
        [center - clock_radius, center - clock_radius, center + clock_radius, center + clock_radius],
        fill=(255, 255, 255, 255)
    )

    # Dial rim / border
    dial_rim_width = max(1, int(size * 0.03))
    draw.ellipse(
        [center - clock_radius, center - clock_radius, center + clock_radius, center + clock_radius],
        outline=(203, 213, 225, 255), # #cbd5e1
        width=dial_rim_width
    )

    # 3. Work Track / Timesheet Progress Arc (representing hours logged)
    # Emerald green arc around the dial from 9 o'clock (180 deg) to ~4 o'clock (390 deg)
    arc_radius = clock_radius * 0.85
    arc_width = max(2, int(size * 0.042))
    draw.arc(
        [center - arc_radius, center - arc_radius, center + arc_radius, center + arc_radius],
        start=180,
        end=390,
        fill=(16, 185, 129, 255), # Emerald #10b981
        width=arc_width
    )

    # 4. Hour markers at 12, 3, 6, 9
    marker_len = size * 0.045
    marker_w = max(1, int(size * 0.024))
    for deg in [0, 90, 180, 270]:
        rad = math.radians(deg)
        r_out = clock_radius * 0.72
        r_in = r_out - marker_len
        x1 = center + r_out * math.sin(rad)
        y1 = center - r_out * math.cos(rad)
        x2 = center + r_in * math.sin(rad)
        y2 = center - r_in * math.cos(rad)
        draw.line([(x1, y1), (x2, y2)], fill=(148, 163, 184, 255), width=marker_w)

    # 5. Bold, distinct Clock Hands
    # Hour hand: pointing to 9:00 (work start)
    h_len = clock_radius * 0.52
    h_w = max(2, int(size * 0.055))
    draw.line([(center, center), (center - h_len, center)], fill=(15, 23, 42, 255), width=h_w)

    # Minute hand: pointing to 12:00 (straight up)
    m_len = clock_radius * 0.70
    m_w = max(1, int(size * 0.04))
    draw.line([(center, center), (center, center - m_len)], fill=(15, 23, 42, 255), width=m_w)

    # Second hand: vibrant accent pointing to 4 o'clock
    s_rad = math.radians(120)
    s_len = clock_radius * 0.65
    sx = center + s_len * math.sin(s_rad)
    sy = center - s_len * math.cos(s_rad)
    s_w = max(1, int(size * 0.02))
    draw.line([(center, center), (sx, sy)], fill=(239, 68, 68, 255), width=s_w) # Coral red #ef4444

    # 6. Center Hub
    hub_r = size * 0.045
    draw.ellipse([center - hub_r, center - hub_r, center + hub_r, center + hub_r], fill=(37, 99, 235, 255))
    pin_r = hub_r * 0.45
    draw.ellipse([center - pin_r, center - pin_r, center + pin_r, center + pin_r], fill=(255, 255, 255, 255))

    return img

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), "icons")
    os.makedirs(icons_dir, exist_ok=True)

    master = create_timesheet_icon(1024)

    sizes = [16, 32, 48, 128]
    for sz in sizes:
        resized = master.resize((sz, sz), Image.Resampling.LANCZOS)
        out_path = os.path.join(icons_dir, f"icon{sz}.png")
        resized.save(out_path, "PNG")
        print(f"Generated {out_path} ({sz}x{sz})")

if __name__ == "__main__":
    main()
