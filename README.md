# Auralith Live

Static browser-native DJ visualizer built for GitHub Pages.

## What it does

- Requests camera and audio input with `getUserMedia()`
- Lets you choose a webcam and browser-visible audio input
- Reacts to audio energy, peaks, and frequency bands
- Tracks body pose in the browser with MediaPipe Pose Landmarker
- Renders effects into a fullscreen-ready canvas
- Records the rendered stage output plus selected audio input locally

## GitHub Pages deployment

1. Push this repository to GitHub.
2. In repository settings, enable GitHub Pages from the repository root.
3. Open the published HTTPS URL.
4. Grant camera and audio permissions when prompted.

No backend, database, build step, or API keys are required.

## Performance notes

- GitHub Pages is compatible because the site is plain HTML, CSS, and JavaScript.
- Device access requires a secure context. GitHub Pages provides HTTPS, so browser permissions work there.
- For DJ software audio, route your master bus into a browser-visible virtual input or loopback device.
- Pose tracking uses the MediaPipe web runtime and model hosted from public CDN/storage endpoints.

## Local testing

Any static file server works. For example:

```bash
python3 -m http.server
```
