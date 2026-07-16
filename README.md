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

The overlay features a real-time loopback audio visualizer. Since OBS browser sources run in a sandbox, follow these steps to route system audio:

### 1. Enable OBS Media Streams
Launch OBS Studio with the `--enable-media-stream` flag to allow browser sources to capture loopback devices.
- **Flatpak OBS**: Run `flatpak run com.obsproject.Studio --enable-media-stream` (or use the configured desktop launcher which now passes this flag automatically).
- **Native OBS**: Run `obs --enable-media-stream`.

### 2. Route Desktop Audio
1. In OBS, double-click the browser source pointing to your overlay.
2. Ensure **Control audio via OBS** is **unchecked**.
3. Open `pavucontrol` (Volume Control) -> **Recording** tab.
4. Locate the OBS / Chromium recording stream and select **Monitor of [your audio output]** (e.g. Headphones Monitor).

