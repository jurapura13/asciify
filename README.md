# ASCIIFY

**ASCIIFY** is a highly customizable image → ASCII art converter that produces more detailed results by combining luminance mapping with **edge detection**.

Instead of relying purely on brightness ramps, ASCIIFY detects edges using a Sobel kernel and renders them with **directional characters** such as `/`, `\`, `|`, and `-`. This preserves structure and contours that traditional ASCII generators usually lose.

The result is ASCII art that keeps **shape, depth, and texture**, rather than just grayscale shading.

---

## Features

* **Edge-aware rendering**

  * Sobel edge detection
  * Directional characters (`/ \ | -`) based on edge orientation
  * Hybrid mode combining edges + luminance

* **Multiple rendering modes**

  * Hybrid (edges + luminance)
  * Luminance only
  * Edge visualization
  * Block rendering

* **Character set options**

  * Standard ASCII ramps
  * Extended Unicode
  * Block characters
  * Braille rendering
  * Minimal ramps
  * Custom character ramp

* **Image processing controls**

  * Adjustable width (character resolution)
  * Edge sensitivity
  * Contrast and brightness
  * Optional Floyd-Steinberg dithering
  * Invert mapping

* **Color modes**

  * Matrix-style green terminal
  * Full color ASCII
  * Monochrome
  * Amber CRT

* **Display controls**

  * Font size
  * Line height
  * Split view (original vs ASCII)

* **Export options**

  * Copy ASCII to clipboard
  * Download `.txt`
  * Download `.html`
  * Render and download `.png`

---

## How It Works

Traditional ASCII converters map pixel brightness to a character ramp.

ASCIIFY adds an extra step:

1. The image is resized to the target ASCII grid.
2. **Sobel edge detection** computes horizontal and vertical gradients.
3. Edge direction is estimated from the gradient vector.
4. Strong edges are rendered using directional characters (`/ \ | -`).
5. Remaining pixels fall back to a luminance character ramp.
6. Optional **Floyd-Steinberg dithering** improves tonal transitions.

This hybrid approach preserves lines and geometry much better than luminance-only rendering.

---

## Usage

1. Open `index.html`
2. Drop an image into the interface
3. Adjust settings
4. Export the ASCII output

Supported formats include:

```
JPG
PNG
GIF
WEBP
BMP
```

---

## Rendering Modes

**Hybrid**
Edges rendered with directional characters while flat regions use luminance shading.

**Luminance**
Classic ASCII shading using brightness ramps.

**Edges**
Displays only detected edges.

**Blocks**
Uses dense block characters for a higher fill ratio.

---

## Character Sets

You can choose between several presets or define your own ramp:

```
 .'-:;!=+*#%@$&█
```

Characters should be ordered **dark → light**.

---

## Tech

* Vanilla JavaScript
* HTML5 Canvas
* Sobel edge detection
* Floyd-Steinberg dithering
* No external dependencies

---

## License

MIT License.

Use it freely in personal or commercial projects as long as attribution is preserved.
