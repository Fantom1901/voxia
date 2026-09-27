import QtQuick
import Quickshell

Item {
  id: orb

  property real volume: 0.0
  property real smoothVolume: 0.0
  property string currentState: "recording"
  property real animTime: 0.0

  implicitWidth: 100
  implicitHeight: 100

  FrameAnimation {
    running: true

    onTriggered: {
      const input = Math.max(0.0, Number(orb.volume))

      // Поддержка значений 0..1 и 0..255
      const target = input > 1.0 ? input / 255.0 : input

      const smoothing = target > orb.smoothVolume
        ? Math.min(frameTime * 12.0, 1.0)
        : Math.min(frameTime * 2.0, 1.0)

      orb.smoothVolume +=
        (target - orb.smoothVolume) * smoothing

      // Даже тихий голос заметно ускоряет движение
      const speed = 0.8 + orb.smoothVolume * 8.0
      orb.animTime += frameTime * speed
    }
  }

  ShaderEffect {
    anchors.fill: parent

    property real time: orb.animTime
    property real volume: orb.smoothVolume
    property real stateMode:
        orb.currentState === "processing" ? 1.0 : 0.0

    fragmentShader:
      Quickshell.shellDir + "/shaders/orb_noise_v2.frag.qsb"
  }
}