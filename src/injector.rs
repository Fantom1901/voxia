use std::process::Command;

pub fn inject_text(text: &str) -> Result<(), Box<dyn std::error::Error>> {
    if text.is_empty() {
        return Ok(());
    }

    // 1. Копируем текст в клипборд Wayland
    let mut child = Command::new("wl-copy")
        .stdin(std::process::Stdio::piped())
        .spawn()?;

    if let Some(mut stdin) = child.stdin.take() {
      use std::io::Write;
      stdin.write_all(text.as_bytes())?;
    }
    child.wait()?;

    // 2. Симулируем Shift+Insert или Ctrl+V через wtype (или ydotool)
    Command::new("wtype")
        .arg("-M")
        .arg("ctrl")
        .arg("-k")
        .arg("v")
        .arg("-m")
        .arg("ctrl")
        .status()?;

    Ok(())
}
