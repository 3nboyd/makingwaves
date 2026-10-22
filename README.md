# Auralith Live

Auralith Live is the DJ visualizer in the `makingwaves` repository. It runs directly in the browser and can be hosted on GitHub Pages.

## What it does

- Requests permission to use your camera and audio input
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
- To react to DJ software audio, send its master output through a virtual audio or loopback device, then select that device as the browser audio input.
- Pose tracking downloads the MediaPipe software and model from public hosting services, so that feature needs an internet connection.

## Local testing

Any static file server works. For example:

```bash
git clone https://github.com/3nboyd/makingwaves.git
cd makingwaves
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000), then choose your camera and audio input.
