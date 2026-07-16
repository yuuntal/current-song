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

# visualizer (optional)
real-time audio visualizer that react to your music, but OBS block this by default. to make it work:

## 1. enable media stream inside OBS
you must launch OBS with `--enable-media-stream` flag so browser source can hear your sound:
- flatpak (linux): `flatpak run com.obsproject.Studio --enable-media-stream`
- native (linux): `obs --enable-media-stream`
- windows: right click OBS shortcut -> properties -> add `--enable-media-stream` to the end of Target field

## 2. route your desktop audio to the browser (linux)
- in OBS, double-click browser source and make sure `Control audio via OBS` is unchecked.
- open volume control (`pavucontrol`), go to `Recording` tab.
- find OBS/Chromium recording and select `Monitor of [your output device]`.


# faq

### why is the visualizer flat?
make sure you started OBS with `--enable-media-stream` and routed the desktop monitor source to the browser inside your volume control settings. it only works with real audio.

### how to use it without browser source in OBS?
open it in app mode (so it has no window frame) and capture the window in OBS:
`google-chrome --app=http://localhost:3333 --window-size=450,150`

### how does the accent color work?
by default it uses color thief to extract colors from your song album art automatically. you can change it to manual colors in `/customize`.
