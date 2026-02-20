use crate::media_reader::MediaReader;
use crate::models::SongInfo;
use base64::{Engine as _, engine::general_purpose};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, mpsc::UnboundedSender};
use tokio_stream::StreamExt;
use zbus::{Connection, MessageStream, Proxy, zvariant::Value};

// ---------------------------------------------------------------------------
// Player state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlaybackStatus {
    Playing,
    Paused,
    Stopped,
}

impl PlaybackStatus {
    fn parse(s: &str) -> Self {
        match s {
            "Playing" => Self::Playing,
            "Paused" => Self::Paused,
            _ => Self::Stopped,
        }
    }
}

#[derive(Debug, Clone)]
struct PlayerState {
    track_id: Option<String>,
    title: String,
    artist: String,
    album: String,
    art_url: Option<String>,
    art_base64: Option<String>,
    length_us: i64,
    position_us: i64,
    status: PlaybackStatus,
    updated_at: Instant,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            track_id: None,
            title: "Unknown Title".into(),
            artist: "Unknown Artist".into(),
            album: String::new(),
            art_url: None,
            art_base64: None,
            length_us: 0,
            position_us: 0,
            status: PlaybackStatus::Stopped,
            updated_at: Instant::now(),
        }
    }
}

impl PlayerState {
    fn to_song_info(&self) -> SongInfo {
        let is_playing = self.status == PlaybackStatus::Playing;

        let elapsed_us = if is_playing {
            self.updated_at.elapsed().as_micros() as i64
        } else {
            0
        };

        let length_secs = (self.length_us / 1_000_000).max(0) as u64;
        let mut position_secs = ((self.position_us + elapsed_us).max(0) / 1_000_000) as u64;
        if length_secs > 0 {
            position_secs = position_secs.min(length_secs);
        }

        SongInfo {
            title: self.title.clone(),
            artist: self.artist.clone(),
            album: self.album.clone(),
            album_art_base64: self.art_base64.clone(),
            position_secs,
            length_secs,
            is_playing,
        }
    }
}

// ---------------------------------------------------------------------------
// Shared state aliases
// ---------------------------------------------------------------------------

type Players = Arc<Mutex<HashMap<String, PlayerState>>>;

type BusNames = Arc<Mutex<HashMap<String, String>>>;

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
                    eprintln!("D-Bus session connection failed: {e}");
                    return;
                }
            };

            let players: Players = Arc::new(Mutex::new(HashMap::new()));
            let bus_names: BusNames = Arc::new(Mutex::new(HashMap::new()));
            let last_emitted: Arc<Mutex<Option<SongInfo>>> = Arc::new(Mutex::new(None));

            discover_players(&conn, &players, &bus_names).await;

            spawn_signal_listener(
                conn.clone(),
                players.clone(),
                bus_names.clone(),
                sender.clone(),
                last_emitted.clone(),
            );

            spawn_position_poller(conn, players, sender, last_emitted);
        });
    }
}


async fn discover_players(conn: &Connection, players: &Players, bus_names: &BusNames) {
    let Ok(dbus) = zbus::fdo::DBusProxy::new(conn).await else {
        return;
    };
    let Ok(names) = dbus.list_names().await else {
        return;
    };

    for name in names {
        let well_known = name.as_str().to_string();
        if !well_known.starts_with("org.mpris.MediaPlayer2.") {
            continue;
        }
        if let Ok(owner) = dbus.get_name_owner(name.inner().clone()).await {
            bus_names
                .lock()
                .await
                .insert(owner.as_str().to_string(), well_known.clone());
        }
        let _ = fetch_player_state(conn, &well_known, players).await;
    }
}

// ---------------------------------------------------------------------------
// D-Bus signal listener
// ---------------------------------------------------------------------------

fn spawn_signal_listener(
    conn: Connection,
    players: Players,
    bus_names: BusNames,
    sender: UnboundedSender<SongInfo>,
    last_emitted: Arc<Mutex<Option<SongInfo>>>,
) {
    tokio::spawn(async move {
        let mut stream = MessageStream::from(&conn);

        while let Some(Ok(msg)) = stream.next().await {
            let header = msg.header();
            let iface = header.interface().map(|i| i.as_str());
            let member = header.member().map(|m| m.as_str());
            let msg_sender = header.sender().map(|s| s.as_str().to_string());

            match (iface, member) {
                (Some("org.freedesktop.DBus"), Some("NameOwnerChanged")) => {
                    handle_name_owner_changed(&msg, &conn, &players, &bus_names).await;
                    emit_best(&players, &sender, &last_emitted).await;
                }
                (Some("org.freedesktop.DBus.Properties"), Some("PropertiesChanged")) => {
                    if let Some(unique) = msg_sender {
                        handle_properties_changed(&msg, &unique, &conn, &players, &bus_names).await;
                        emit_best(&players, &sender, &last_emitted).await;
                    }
                }
                _ => {}
            }
        }
    });
}

async fn handle_name_owner_changed(
    msg: &zbus::Message,
    conn: &Connection,
    players: &Players,
    bus_names: &BusNames,
) {
    let Ok((name, old_owner, new_owner)) = msg.body().deserialize::<(String, String, String)>()
    else {
        return;
    };
    if !name.starts_with("org.mpris.MediaPlayer2.") {
        return;
    }

    if new_owner.is_empty() {

        players.lock().await.remove(&name);
        if !old_owner.is_empty() {
            bus_names.lock().await.remove(&old_owner);
        }
    } else if old_owner.is_empty() {

        bus_names
            .lock()
            .await
            .insert(new_owner.clone(), name.clone());
        let _ = fetch_player_state(conn, &name, players).await;
    }
}

async fn handle_properties_changed(
    msg: &zbus::Message,
    unique_name: &str,
    conn: &Connection,
    players: &Players,
    bus_names: &BusNames,
) {
    let body = msg.body();
    let Ok((iface, changed, invalidated)) =
        body.deserialize::<(String, HashMap<String, Value>, Vec<String>)>()
    else {
        return;
    };
    if iface != "org.mpris.MediaPlayer2.Player" {
        return;
    }

    let refresh_all = !changed.is_empty() || !invalidated.is_empty();
    if !refresh_all {
        return;
    }

    // Prefer targeted refresh when sender resolves to a known player.
    if let Some(name) = bus_names.lock().await.get(unique_name).cloned() {
        let _ = fetch_player_state(conn, &name, players).await;
        return;
    }

    // Fallback: if mapping is missing, refresh all tracked players.
    let names: Vec<String> = {
        let map = players.lock().await;
        map.keys().cloned().collect()
    };

    for name in names {
        let _ = fetch_player_state(conn, &name, players).await;
    }
}

// ---------------------------------------------------------------------------
// Position polling (1 s interval)
// ---------------------------------------------------------------------------

fn spawn_position_poller(
    conn: Connection,
    players: Players,
    sender: UnboundedSender<SongInfo>,
    last_emitted: Arc<Mutex<Option<SongInfo>>>,
) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;

            let active: Vec<String> = {
                let map = players.lock().await;
                map.iter()
                    .filter(|(_, s)| s.status == PlaybackStatus::Playing)
                    .map(|(name, _)| name.clone())
                    .collect()
            };

            for name in active {
                let _ = poll_position(&conn, &name, &players).await;
            }

            emit_best(&players, &sender, &last_emitted).await;
        }
    });
}

async fn poll_position(conn: &Connection, bus_name: &str, players: &Players) -> zbus::Result<()> {
    let proxy: Proxy<'_> = player_proxy(conn, bus_name).await?;
    if let Ok(val) = proxy.get_property::<Value>("Position").await {
        if let Some(pos) = value_to_i64(&val) {
            let mut map = players.lock().await;
            if let Some(state) = map.get_mut(bus_name) {
                state.position_us = pos;
                state.updated_at = Instant::now();
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Fetch full player state via D-Bus properties
// ---------------------------------------------------------------------------

async fn fetch_player_state(
    conn: &Connection,
    bus_name: &str,
    players: &Players,
) -> zbus::Result<()> {
    let proxy: Proxy<'_> = player_proxy(conn, bus_name).await?;

    let metadata = proxy.get_property::<Value>("Metadata").await.ok();
    let playback = proxy.get_property::<Value>("PlaybackStatus").await.ok();
    let position = proxy.get_property::<Value>("Position").await.ok();

    let mut map = players.lock().await;
    let state = map.entry(bus_name.to_string()).or_default();

    if let Some(ref val) = metadata {
        apply_metadata(val, state);
    }
    if let Some(ref val) = playback {
        if let Some(s) = value_to_string(val) {
            state.status = PlaybackStatus::parse(&s);
        }
    }
    if let Some(ref val) = position {
        if let Some(pos) = value_to_i64(val) {
            state.position_us = pos;
            state.updated_at = Instant::now();
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Emit the best (most-relevant) player to the channel
// ---------------------------------------------------------------------------

async fn emit_best(
    players: &Players,
    sender: &UnboundedSender<SongInfo>,
    last_emitted: &Arc<Mutex<Option<SongInfo>>>,
) {
    let info = {
        let map = players.lock().await;
        // Prefer a currently-playing player; fall back to most recently updated
        let best = map
            .values()
            .filter(|p| p.status == PlaybackStatus::Playing)
            .max_by_key(|p| p.updated_at)
            .or_else(|| map.values().max_by_key(|p| p.updated_at));
        best.map(PlayerState::to_song_info)
    };

    if let Some(info) = info {
        let mut last = last_emitted.lock().await;
        if last.as_ref() != Some(&info) {
            let _ = sender.send(info.clone());
            *last = Some(info);
        }
    }
}

// ---------------------------------------------------------------------------
// Metadata parsing
// ---------------------------------------------------------------------------

/// Try to apply metadata from a Value. Returns `true` if it was successfully
/// parsed as a dict, `false` if it couldn't be (caller should re-fetch).
fn apply_metadata(val: &Value, state: &mut PlayerState) -> bool {
    let inner = unwrap_variant(val);
    if let Value::Dict(dict) = inner {
        parse_metadata_dict(&dict, state);
        true
    } else {
        false
    }
}

fn parse_metadata_dict(dict: &zbus::zvariant::Dict<'_, '_>, state: &mut PlayerState) {
    // Detect track changes to invalidate cached art
    if let Some(id) = dict_string(dict, "mpris:trackid") {
        if state.track_id.as_deref() != Some(&id) {
            state.art_url = None;
            state.art_base64 = None;
        }
        state.track_id = Some(id);
    }

    if let Some(s) = dict_string(dict, "xesam:title") {
        state.title = s;
    }
    if let Some(artists) = dict_string_list(dict, "xesam:artist") {
        state.artist = artists.join(", ");
    }
    if let Some(s) = dict_string(dict, "xesam:album") {
        state.album = s;
    }
    if let Some(len) = dict_i64(dict, "mpris:length") {
        state.length_us = len;
    }

    if let Some(url) = dict_string(dict, "mpris:artUrl") {
        if state.art_url.as_deref() != Some(&url) {
            state.art_base64 = load_art_base64(&url);
            state.art_url = Some(url);
        }
    }
}

// ---------------------------------------------------------------------------
// Value helpers — D-Bus variants are often nested; unwrap before reading
// ---------------------------------------------------------------------------

/// Recursively strip `Value::Value(inner)` wrappers that D-Bus variant types produce.
fn unwrap_variant<'a>(val: &'a Value<'a>) -> &'a Value<'a> {
    match val {
        Value::Value(inner) => unwrap_variant(inner),
        other => other,
    }
}

/// Try to read a string from a Value (handles Str, ObjectPath, and nested variants).
fn value_to_string(val: &Value) -> Option<String> {
    let val = unwrap_variant(val);
    match val {
        Value::Str(s) => Some(s.to_string()),
        Value::ObjectPath(p) => Some(p.to_string()),
        _ => String::try_from(val).ok(),
    }
}

/// Try to read an integer from a Value (handles i64, u64, i32, u32, and nested variants).
fn value_to_i64(val: &Value) -> Option<i64> {
    let val = unwrap_variant(val);
    match val {
        Value::I64(n) => Some(*n),
        Value::U64(n) => Some(*n as i64),
        Value::I32(n) => Some(*n as i64),
        Value::U32(n) => Some(*n as i64),
        _ => i64::try_from(val).ok(),
    }
}

// ---------------------------------------------------------------------------
// Dict helpers — extract typed fields from an MPRIS metadata a{sv}
// ---------------------------------------------------------------------------

fn dict_string(dict: &zbus::zvariant::Dict<'_, '_>, key: &str) -> Option<String> {
    let val = dict.get::<&str, Value>(&key).ok()??;
    value_to_string(&val)
}

fn dict_string_list(dict: &zbus::zvariant::Dict<'_, '_>, key: &str) -> Option<Vec<String>> {
    let val = dict.get::<&str, Value>(&key).ok()??;
    let inner = unwrap_variant(&val);

    if let Value::Array(arr) = inner {
        let items: Vec<String> = arr.iter().filter_map(|v| value_to_string(v)).collect();
        if !items.is_empty() {
            return Some(items);
        }
    }
    // Some players send a single string instead of an array
    value_to_string(inner).map(|s| vec![s])
}

fn dict_i64(dict: &zbus::zvariant::Dict<'_, '_>, key: &str) -> Option<i64> {
    let val = dict.get::<&str, Value>(&key).ok()??;
    value_to_i64(&val)
}

// ---------------------------------------------------------------------------
// Album art
// ---------------------------------------------------------------------------

fn load_art_base64(url: &str) -> Option<String> {
    let path = url.strip_prefix("file://")?;
    let data = std::fs::read(path).ok()?;
    Some(general_purpose::STANDARD.encode(&data))
}

// ---------------------------------------------------------------------------
// Proxy helper
// ---------------------------------------------------------------------------

async fn player_proxy<'a>(conn: &'a Connection, bus_name: &'a str) -> zbus::Result<Proxy<'a>> {
    Proxy::new(
        conn,
        bus_name,
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
    )
    .await
}
