# Rung poster

The Demo Day poster for hackathon twist 3: 24 by 36 inches, portrait, built from HTML and CSS and
printed to a vector PDF with headless Chrome.

| File | What it holds |
| --- | --- |
| `poster.html`, `poster.css` | The poster. Sizes are in inches and points, so the page prints at 24 by 36 inches |
| `images/` | Crops of real app screenshots: the Tuesday queue, the Harbor Night gate plan, a Hold box card, and a live Retell call |
| `fonts/` | Geist and Geist Mono, the app's fonts, under the SIL Open Font License |
| `qr-repo.svg`, `qr-video.svg` | QR codes to the GitHub repository and the v1.1 release with the demo video |
| `rung-poster.pdf` | The print file |

Rebuild after an edit. It needs Chrome or Chromium on PATH:

```bash
pip install segno pypdf
python3 docs/poster/build.py
```

The script writes the QR codes, `rung-poster.pdf`, and a 2304 by 3456 PNG preview, `rung-poster.png`,
which git ignores. It fails if the PDF is not one 24 by 36 inch page. Content that does not fit is
clipped at the bottom edge, so check the preview after every edit.

The numbers come from the app on Harbor Night at `+00:40`, with lanes 4 to 6 closed and the terminal
feed dark: `GET /api/gate` returns 96 of 129 trucks kept, 20 of 20 reefers, 28 of 28 last free day
boxes, and 750 kg CO2 and 92 idle hours avoided.
