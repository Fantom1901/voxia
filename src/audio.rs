use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

pub const WHISPER_SAMPLE_RATE: u32 = 16000;

pub struct AudioRecorder {
    stream: Option<Stream>,
    is_recording: Arc<AtomicBool>,
    audio_buffer: Arc<Mutex<Vec<f32>>>,
}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            stream: None,
            is_recording: Arc::new(AtomicBool::new(false)),
            audio_buffer: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn start(
        &mut self,
        volume_tx: mpsc::Sender<f32>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("Не найдено устройство ввода (микрофон)")?;

        let config = device.default_input_config()?;
        let sample_format = config.sample_format();
        let source_sample_rate = config.sample_rate();
        let stream_config: cpal::StreamConfig = config.into();

        let is_recording = Arc::clone(&self.is_recording);
        let audio_buffer = Arc::clone(&self.audio_buffer);

        audio_buffer.lock().unwrap().clear();
        is_recording.store(true, Ordering::SeqCst);

        let channels = stream_config.channels as usize;

        let err_fn = move |err| eprintln!("[Audio] Ошибка в потоке записи: {}", err);

        let stream = match sample_format {
            SampleFormat::F32 => device.build_input_stream(
                stream_config.clone(),
                move |data: &[f32], _| {
                    process_samples(
                        data,
                        channels,
                        source_sample_rate,
                        &audio_buffer,
                        &is_recording,
                        &volume_tx,
                    );
                },
                err_fn,
                None,
            )?,
            SampleFormat::I16 => device.build_input_stream(
                stream_config.clone(),
                move |data: &[i16], _| {
                    let f32_samples: Vec<f32> =
                        data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
                    process_samples(
                        &f32_samples,
                        channels,
                        source_sample_rate,
                        &audio_buffer,
                        &is_recording,
                        &volume_tx,
                    );
                },
                err_fn,
                None,
            )?,
            _ => return Err("Неподдерживаемый формат аудиосэмплов".into()),
        };

        stream.play()?;
        self.stream = Some(stream);

        Ok(())
    }

    pub fn stop(&mut self) -> Vec<f32> {
        self.is_recording.store(false, Ordering::SeqCst);
        self.stream = None;

        let mut buffer = self.audio_buffer.lock().unwrap();
        std::mem::take(&mut *buffer)
    }
}

fn process_samples(
    samples: &[f32],
    channels: usize,
    source_rate: u32,
    buffer: &Arc<Mutex<Vec<f32>>>,
    is_recording: &Arc<AtomicBool>,
    volume_tx: &mpsc::Sender<f32>,
) {
    if !is_recording.load(Ordering::SeqCst) {
        return;
    }

    let step = source_rate as f32 / WHISPER_SAMPLE_RATE as f32;
    let mut mono_samples = Vec::new();

    let mut i = 0.0f32;
    while (i as usize) < samples.len() / channels {
        let idx = (i as usize) * channels;
        if idx < samples.len() {
            mono_samples.push(samples[idx]);
        }
        i += step;
    }

    if let Ok(mut buf) = buffer.lock() {
        buf.extend_from_slice(&mono_samples);
    }

    if !mono_samples.is_empty() {
        let sum_squares: f32 = mono_samples.iter().map(|&s| s * s).sum();
        let rms = (sum_squares / mono_samples.len() as f32).sqrt();

        let normalized = if rms < 0.01 {
            0.0
        } else {
            ((rms - 0.01) * 6.0).clamp(0.0, 1.0)
        };

        let _ = volume_tx.try_send(normalized);
    }
}
