# current song
display current song on localhost:3333 so you can use it as a stream overlay

# features
- add localhost:3333 as broswer to show current playing song
- go to localhost:3333/customize to custom it as your liking.
## custom css
- you can import your own css, documentation coming soon(tm)

# install

Linux builds require native tray dependencies.

On Arch Linux:

```bash
sudo pacman -S xdotool gtk3 libappindicator
```

On Debian/Ubuntu:

```bash
sudo apt install libxdo-dev libgtk-3-dev libappindicator3-dev
```

```bash
cargo build --release
```
