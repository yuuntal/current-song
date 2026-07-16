# current song
display current song on localhost:3333 so you can use it as a stream overlay

# features
- add localhost:3333 as broswer to show current playing song
- go to localhost:3333/customize to custom it as your liking (limited).

# install

## pre-built
go to release tab and download the latest executable

## build it yourself (recommended)

Linux builds require native tray dependencies.

On Arch Linux:

```bash
sudo pacman -S xdotool gtk3 libappindicator
```

On Debian/Ubuntu:

```bash
sudo apt install libxdo-dev libgtk-3-dev libappindicator3-dev
```

then

```bash
cargo build --release
```

# Audio Visualizer Setup

The overlay includes a real-time audio visualizer that captures loopback system audio. Because OBS browser sources run in a sandboxed environment, some configuration is required:

### 1. Enable Browser Source Audio Capture
Launch OBS Studio with the `--enable-media-stream` flag to grant the browser source permission to capture audio:
- **Flatpak (Linux)**: `flatpak run com.obsproject.Studio --enable-media-stream`
- **Native (Linux)**: `obs --enable-media-stream`
- **Windows**: Right-click your OBS shortcut, select **Properties**, and append `--enable-media-stream` to the **Target** field.

### 2. Route System Audio (Linux/PulseAudio)
1. Double-click the browser source pointing to your overlay in OBS and verify **Control audio via OBS** is **unchecked**.
2. Open your system's volume control manager (e.g. `pavucontrol`).
3. Under the **Recording** tab, locate the OBS/Chromium recording stream.
4. Set its input device to the **Monitor** of your active output device (e.g., *Monitor of Built-in Audio Analog Stereo*).


