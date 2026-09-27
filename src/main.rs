mod audio;
mod injector;
mod ipc;
mod whisper;

use audio::AudioRecorder;
use ipc::{Command, IpcMessage, IpcServer, SOCKET_PATH};
use std::{
  path::PathBuf,
  process::{Command as ProcessCommand, Stdio},
};
use tokio::sync::mpsc;
use whisper::WhisperEngine;

fn project_root() -> PathBuf {
    if let Some(root) = std::env::var_os("VOXIA_ROOT") {
        return PathBuf::from(root);
    }

    PathBuf::from("/usr/share/voxia")
}

fn start_gui(root: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let qml = root.join("qml/main.qml");

    if !qml.exists() {
        return Err(format!("QML не найден: {}", qml.display()).into());
    }

    ProcessCommand::new("quickshell")
        .arg("-p")
        .arg(&qml)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()?;

    println!("[Voxia] GUI запущен");
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Повторный запуск keybind: переключаем запись у уже работающего процесса.
    if PathBuf::from(SOCKET_PATH).exists() {
        if ipc::send_command("Toggle").await.is_ok() {
            return Ok(());
        }
    }

    let root = project_root();
    let model_path = root.join("assets/ggml-base.bin");

    if !model_path.exists() {
        eprintln!("Модель не найдена: {}", model_path.display());
        return Ok(());
    }

    println!("[Voxia] Загрузка модели...");
    let whisper_engine = WhisperEngine::new(model_path.to_str().unwrap())?;

    println!("[Voxia] Модель загружена");

    let (server, listener) = IpcServer::new().await?;
    println!("[Voxia] IPC запущен: {SOCKET_PATH}");

    let (command_tx, mut command_rx) = mpsc::channel::<Command>(16);

    tokio::spawn(IpcServer::run_listener(
        listener,
        server.tx.clone(),
        command_tx,
    ));

    let (volume_tx, mut volume_rx) = mpsc::channel::<f32>(100);
    let volume_server = server.clone();

    tokio::spawn(async move {
        while let Some(value) = volume_rx.recv().await {
            volume_server.broadcast(&IpcMessage::Volume { value });
        }
    });

    start_gui(&root)?;

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    let mut recorder = AudioRecorder::new();
    recorder.start(volume_tx.clone())?;
    let mut recording = true;

    server.broadcast(&IpcMessage::State {
        status: "recording".into(),
    });

    let mut recording = true;

    while let Some(command) = command_rx.recv().await {
        println!("[Voxia] Команда: {command:?}");

        match command {
            Command::Toggle => {
                if recording {
                    let pcm = recorder.stop();
                    recording = false;

                    server.broadcast(&IpcMessage::State {
                        status: "processing".into(),
                    });

                    let text = whisper_engine.transcribe(&pcm)?;

                    if !text.is_empty() {
                        server.broadcast(&IpcMessage::Result { text: text.clone() });

                        if let Err(error) = injector::inject_text(&text) {
                            eprintln!("[Voxia] Ошибка вставки: {error}");
                        }
                    }

                    server.broadcast(&IpcMessage::State {
                        status: "idle".into(),
                    });
                } else {
                    recorder.start(volume_tx.clone())?;
                    recording = true;

                    server.broadcast(&IpcMessage::State {
                        status: "recording".into(),
                    });
                }
            }

            Command::Start if !recording => {
                recorder.start(volume_tx.clone())?;
                recording = true;

                server.broadcast(&IpcMessage::State {
                    status: "recording".into(),
                });
            }

            Command::Stop if recording => {
                let _ = recorder.stop();
                recording = false;

                server.broadcast(&IpcMessage::State {
                    status: "idle".into(),
                });
            }

            _ => {}
        }
    }

    Ok(())
}
