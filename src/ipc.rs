use serde::Serialize;
use std::path::Path;
use tokio::{
  fs,
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
  net::{UnixListener, UnixStream},
  sync::{broadcast, mpsc},
};

pub const SOCKET_PATH: &str = "/tmp/voxia.sock";

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum IpcMessage {
    State { status: String },
    Volume { value: f32 },
    Result { text: String },
}

#[derive(Debug)]
pub enum Command {
    Toggle,
    Start,
    Stop,
}

#[derive(Clone)]
pub struct IpcServer {
    pub tx: broadcast::Sender<String>,
}

impl IpcServer {
    pub async fn new() -> Result<(Self, UnixListener), Box<dyn std::error::Error>> {
        if Path::new(SOCKET_PATH).exists() {
            fs::remove_file(SOCKET_PATH).await?;
        }

        let listener = UnixListener::bind(SOCKET_PATH)?;
        let (tx, _) = broadcast::channel(100);

        Ok((Self { tx }, listener))
    }

    pub fn broadcast(&self, message: &IpcMessage) {
        if let Ok(mut json) = serde_json::to_string(message) {
            json.push('\n');
            let _ = self.tx.send(json);
        }
    }

    pub async fn run_listener(
        listener: UnixListener,
        events: broadcast::Sender<String>,
        commands: mpsc::Sender<Command>,
    ) {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                continue;
            };

            let rx = events.subscribe();
            let commands = commands.clone();

            tokio::spawn(async move {
                let _ = handle_client(stream, rx, commands).await;
            });
        }
    }
}

async fn handle_client(
    stream: UnixStream,
    mut events: broadcast::Receiver<String>,
    commands: mpsc::Sender<Command>,
) -> Result<(), Box<dyn std::error::Error>> {
    let (read_half, mut write_half) = stream.into_split();
    let mut reader = BufReader::new(read_half);
    let mut line = String::new();

    loop {
        tokio::select! {
            result = reader.read_line(&mut line) => {
                if result? == 0 {
                    break;
                }

                let command = match line.trim() {
                    "Toggle" | r#"{"type":"Toggle"}"# => Some(Command::Toggle),
                    "Start"  | r#"{"type":"Start"}"#  => Some(Command::Start),
                    "Stop"   | r#"{"type":"Stop"}"#   => Some(Command::Stop),
                    _ => None,
                };

                if let Some(command) = command {
                    let _ = commands.send(command).await;
                }

                line.clear();
            }

            event = events.recv() => {
                match event {
                    Ok(message) => write_half.write_all(message.as_bytes()).await?,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
    }

    Ok(())
}

pub async fn send_command(command: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut stream = UnixStream::connect(SOCKET_PATH).await?;
    stream.write_all(command.as_bytes()).await?;
    stream.write_all(b"\n").await?;
    Ok(())
}
