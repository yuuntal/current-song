use std::sync::mpsc;
use tray_icon::{
    Icon, TrayIconBuilder,
    menu::{Menu, MenuEvent, MenuItem},
};

pub enum TrayCommand {
    OpenBrowser,
    Quit,
}

// embeded
fn create_icon() -> Icon {
    let png_bytes = include_bytes!("../assets/icon.png");
    let img = image::load_from_memory(png_bytes)
        .expect("Failed to decode icon.png")
        .into_rgba8();
    let (width, height) = img.dimensions();
    Icon::from_rgba(img.into_raw(), width, height).expect("Failed to create tray icon")
}

// spawn tra
pub fn spawn_tray() -> mpsc::Receiver<TrayCommand> {
    let (cmd_tx, cmd_rx) = mpsc::channel();

    std::thread::spawn(move || {
        run_tray_loop(cmd_tx);
    });

    cmd_rx
}

#[cfg(target_os = "linux")]
fn run_tray_loop(cmd_tx: mpsc::Sender<TrayCommand>) {
    gtk::init().expect("Failed to init GTK");

    let _tray = build_tray(&cmd_tx);


    let cmd_tx_clone = cmd_tx.clone();
    glib_recv_menu_events(cmd_tx_clone);

    // block
    gtk::main();
}

#[cfg(target_os = "linux")]
fn glib_recv_menu_events(cmd_tx: mpsc::Sender<TrayCommand>) {
    use gtk::glib;

    glib::timeout_add_local(std::time::Duration::from_millis(100), move || {
        if let Ok(event) = MenuEvent::receiver().try_recv() {
            handle_menu_event(&event.id().0, &cmd_tx);
        }
        glib::ControlFlow::Continue
    });
}

#[cfg(target_os = "windows")]
fn run_tray_loop(cmd_tx: mpsc::Sender<TrayCommand>) {
    let _tray = build_tray(&cmd_tx);

    // poll menu event
    loop {
        if let Ok(event) = MenuEvent::receiver().try_recv() {
            handle_menu_event(&event.id().0, &cmd_tx);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

// menu item id
static OPEN_BROWSER_ID: &str = "open_browser";
static QUIT_ID: &str = "quit";

fn build_tray(_cmd_tx: &mpsc::Sender<TrayCommand>) -> tray_icon::TrayIcon {
    let menu = Menu::new();

    let open_item = MenuItem::with_id(OPEN_BROWSER_ID, "Open in Browser", true, None);
    let quit_item = MenuItem::with_id(QUIT_ID, "Quit", true, None);

    menu.append(&open_item).unwrap();
    menu.append(&quit_item).unwrap();

    let icon = create_icon();

    TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("http://127.0.0.1:3333")
        .with_icon(icon)
        .build()
        .expect("Failed to create tray icon")
}

fn handle_menu_event(id: &str, cmd_tx: &mpsc::Sender<TrayCommand>) {
    match id {
        id if id == OPEN_BROWSER_ID => {
            let _ = cmd_tx.send(TrayCommand::OpenBrowser);
        }
        id if id == QUIT_ID => {
            let _ = cmd_tx.send(TrayCommand::Quit);
        }
        _ => {}
    }
}
