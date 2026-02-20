use crate::media_reader::MediaReader;
use crate::models::SongInfo;
use base64::{Engine as _, engine::general_purpose};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, mpsc::UnboundedSender};
use tokio_stream::StreamExt;
use zbus::{Connection, MessageStream, Proxy, zvariant::Value};

#[derive(Debug, Clone)]
struct PlayerState {
    track_id: Option<String>,
    title: String,
    artist: String,
    album: String,
    art_url: Option<String>,
    cached_art_base64: Option<String>,
    length_secs: u64,

    playback_status: String,
    position_microsecs: i64,
    last_update: Instant,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            track_id: None,
            title: "Unknown Title".into(),
            artist: "Unknown Artist".into(),
            album: String::new(),
            art_url: None,
            cached_art_base64: None,
            length_secs: 0,
            playback_status: "Stopped".into(),
            position_microsecs: 0,
            last_update: Instant::now(),
        }
    }
}

/// Maps unique bus names (e.g. ":1.234") to well-known names (e.g. "org.mpris.MediaPlayer2.spotify")
type BusNameMap = Arc<Mutex<HashMap<String, String>>>;

pub struct LinuxMediaReader;

impl MediaReader for LinuxMediaReader {
    fn new() -> Self {
        Self
    }

    fn start_listening(self, sender: UnboundedSender<SongInfo>) {
        tokio::spawn(async move {
            let conn = match Connection::session().await {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("DBus connection failed: {e}");
                    return;
                }
            };

            let players: Arc<Mutex<HashMap<String, PlayerState>>> =
                Arc::new(Mutex::new(HashMap::new()));
            let bus_names: BusNameMap = Arc::new(Mutex::new(HashMap::new()));

            initialize_existing_players(&conn, &players, &bus_names).await;

            spawn_signal_listener(
                conn.clone(),
                players.clone(),
                bus_names.clone(),
                sender.clone(),
            );
            spawn_position_loop(conn, players, sender);
        });
    }
}

async fn initialize_existing_players(
    conn: &Connection,
    players: &Arc<Mutex<HashMap<String, PlayerState>>>,
    bus_names: &BusNameMap,
) {
    if let Ok(dbus_proxy) = zbus::fdo::DBusProxy::new(conn).await {
        if let Ok(names) = dbus_proxy.list_names().await {
            for name in names {
                let name_str = name.as_str().to_string();
                if name_str.starts_with("org.mpris.MediaPlayer2.") {
                    // Resolve the unique bus name for this well-known name
                    if let Ok(owner) = dbus_proxy.get_name_owner(name.inner().clone()).await {
                        bus_names
                            .lock()
                            .await
                            .insert(owner.as_str().to_string(), name_str.clone());
                    }
                    let _ = refresh_full_state(conn, &name_str, players).await;
                }
            }
        }
    }
}

fn spawn_signal_listener(
    conn: Connection,
    players: Arc<Mutex<HashMap<String, PlayerState>>>,
    bus_names: BusNameMap,
    sender: UnboundedSender<SongInfo>,
) {
    tokio::spawn(async move {
        let mut stream = MessageStream::from(&conn);

        while let Some(Ok(msg)) = stream.next().await {
            let header = msg.header();
            let interface = header.interface().map(|i| i.as_str());
            let member = header.member().map(|m| m.as_str());
            let sender_bus = header.sender().map(|s| s.as_str().to_string());

            match (interface, member) {
                (Some("org.freedesktop.DBus"), Some("NameOwnerChanged")) => {
                    if let Ok((name, old_owner, new_owner)) =
                        msg.body().deserialize::<(String, String, String)>()
                    {
                        if name.starts_with("org.mpris.MediaPlayer2.") {
                            if new_owner.is_empty() {
                                // Player went away — remove from both maps
                                players.lock().await.remove(&name);
                                if !old_owner.is_empty() {
                                    bus_names.lock().await.remove(&old_owner);
                                }
                            } else if old_owner.is_empty() {
                                // New player appeared — record its unique-to-well-known mapping
                                bus_names
                                    .lock()
                                    .await
                                    .insert(new_owner.clone(), name.clone());
                                let _ = refresh_full_state(&conn, &name, &players).await;
                            }
                            emit_best_player(&players, &sender).await;
                        }
                    }
                }

                (Some("org.freedesktop.DBus.Properties"), Some("PropertiesChanged")) => {
                    if let Some(unique_name) = sender_bus {
                        if let Ok((iface, changed, _)) =
                            msg.body()
                                .deserialize::<(String, HashMap<String, Value>, Vec<String>)>()
                        {
                            if iface == "org.mpris.MediaPlayer2.Player" {
                                // Resolve the unique bus name to the well-known name
                                let well_known = bus_names.lock().await.get(&unique_name).cloned();
                                if let Some(wk_name) = well_known {
                                    apply_property_changes(&wk_name, changed, &players).await;
                                    emit_best_player(&players, &sender).await;
                                }
                            }
                        }
                    }
                }

                _ => {}
            }
        }
    });
}

fn spawn_position_loop(
    conn: Connection,
    players: Arc<Mutex<HashMap<String, PlayerState>>>,
    sender: UnboundedSender<SongInfo>,
) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));

        loop {
            interval.tick().await;

            emit_best_player(&players, &sender).await;

            let active: Vec<String> = {
                let map = players.lock().await;
                map.iter()
                    .filter(|(_, s)| s.playback_status == "Playing")
                    .map(|(k, _)| k.clone())
                    .collect()
            };

            for name in active {
                let _ = sync_position(&conn, &name, &players).await;
            }
        }
    });
}

async fn refresh_full_state(
    conn: &Connection,
    bus_name: &str,
    players: &Arc<Mutex<HashMap<String, PlayerState>>>,
) -> zbus::Result<()> {
    let proxy = Proxy::new(
        conn,
        bus_name,
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
    )
    .await?;

    let metadata = proxy.get_property::<Value>("Metadata").await.ok();
    let playback = proxy.get_property::<Value>("PlaybackStatus").await.ok();
    let position = proxy.get_property::<Value>("Position").await.ok();

    let mut map = players.lock().await;
    let state = map.entry(bus_name.to_string()).or_default();

    if let Some(val) = metadata {
        if let Ok(dict) = zbus::zvariant::Dict::try_from(&val) {
            parse_metadata(&dict, state);
        }
    }

    if let Some(val) = playback {
        if let Ok(status) = String::try_from(&val) {
            state.playback_status = status;
        }
    }

    if let Some(val) = position {
        if let Ok(pos) = i64::try_from(&val) {
            state.position_microsecs = pos;
            state.last_update = Instant::now();
        }
    }

    Ok(())
}

async fn apply_property_changes(
    bus_name: &str,
    changed: HashMap<String, Value<'_>>,
    players: &Arc<Mutex<HashMap<String, PlayerState>>>,
) {
    let mut map = players.lock().await;
    let state = map.entry(bus_name.to_string()).or_default();

    if let Some(val) = changed.get("Metadata") {
        if let zbus::zvariant::Value::Dict(dict) = val {
            parse_metadata(&dict, state);
        }
    }

    if let Some(val) = changed.get("PlaybackStatus") {
        if let Ok(s) = zbus::zvariant::Str::try_from(val) {
            state.playback_status = s.as_str().to_string();
            state.last_update = Instant::now();
        }
    }
}

async fn sync_position(
    conn: &Connection,
    bus_name: &str,
    players: &Arc<Mutex<HashMap<String, PlayerState>>>,
) -> zbus::Result<()> {
    let proxy = Proxy::new(
        conn,
        bus_name,
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
    )
    .await?;

    if let Ok(val) = proxy.get_property::<Value>("Position").await {
        if let Ok(pos) = i64::try_from(&val) {
            let mut map = players.lock().await;
            if let Some(state) = map.get_mut(bus_name) {
                state.position_microsecs = pos;
                state.last_update = Instant::now();
            }
        }
    }

    Ok(())
}

async fn emit_best_player(
    players: &Arc<Mutex<HashMap<String, PlayerState>>>,
    sender: &UnboundedSender<SongInfo>,
) {
    let map = players.lock().await;

    let best = map
        .values()
        .filter(|p| p.playback_status == "Playing")
        .max_by_key(|p| p.last_update)
        .or_else(|| map.values().max_by_key(|p| p.last_update));

    if let Some(p) = best {
        let is_playing = p.playback_status == "Playing";

        let position_secs = (p.position_microsecs as f64 / 1_000_000.0)
            + if is_playing {
                p.last_update.elapsed().as_secs_f64()
            } else {
                0.0
            };

        let mut position_secs = position_secs as u64;

        if p.length_secs > 0 {
            position_secs = position_secs.min(p.length_secs);
        }

        let _ = sender.send(SongInfo {
            title: p.title.clone(),
            artist: p.artist.clone(),
            album: p.album.clone(),
            album_art_base64: p.cached_art_base64.clone(),
            position_secs,
            length_secs: p.length_secs,
            is_playing,
        });
    }
}

fn parse_metadata(dict: &zbus::zvariant::Dict<'_, '_>, state: &mut PlayerState) {
    // TITLE
    if let Ok(Some(val)) = dict.get::<&str, Value>(&"xesam:title") {
        if let Ok(s) = String::try_from(val) {
            state.title = s;
        }
    }

    // ARTIST (ARRAY OF STRINGS)
    if let Ok(Some(val)) = dict.get::<&str, Value>(&"xesam:artist") {
        if let Ok(array) = <Vec<String>>::try_from(val) {
            state.artist = array.join(", ");
        }
    }

    // ALBUM
    if let Ok(Some(val)) = dict.get::<&str, Value>(&"xesam:album") {
        if let Ok(s) = String::try_from(val) {
            state.album = s;
        }
    }

    // LENGTH
    if let Ok(Some(val)) = dict.get::<&str, Value>(&"mpris:length") {
        if let Ok(len) = i64::try_from(val) {
            state.length_secs = (len as u64) / 1_000_000;
        }
    }

    // ALBUM ART
    if let Ok(Some(val)) = dict.get::<&str, Value>(&"mpris:artUrl") {
        if let Ok(url) = String::try_from(val) {
            if state.art_url.as_ref() != Some(&url) {
                state.art_url = Some(url.clone());
                state.cached_art_base64 = get_album_art_base64(&url);
            }
        }
    }
}

fn get_album_art_base64(art_url: &str) -> Option<String> {
    let path = Path::new(art_url.strip_prefix("file://")?);

    if let Ok(mut file) = File::open(path) {
        let mut buf = Vec::new();
        if file.read_to_end(&mut buf).is_ok() {
            return Some(general_purpose::STANDARD.encode(buf));
        }
    }

    None
}
