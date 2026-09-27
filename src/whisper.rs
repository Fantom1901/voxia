use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct WhisperEngine {
    ctx: WhisperContext,
}

impl WhisperEngine {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self, Box<dyn std::error::Error>> {
        let path_str = model_path
            .as_ref()
            .to_str()
            .ok_or("Некорректный путь к файлу модели")?;

        let ctx = WhisperContext::new_with_params(path_str, WhisperContextParameters::default())?;

        Ok(Self { ctx })
    }

    pub fn transcribe(&self, pcm_data: &[f32]) -> Result<String, Box<dyn std::error::Error>> {
        if pcm_data.is_empty() {
            return Ok(String::new());
        }

        let mut state = self.ctx.create_state()?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("auto"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);

        state.full(params, pcm_data)?;

        let mut result_text = String::new();

        for segment in state.as_iter() {
            result_text.push_str(&segment.to_string());
        }

        Ok(result_text.trim().to_string())
    }
}
