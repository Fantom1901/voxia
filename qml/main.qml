import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "components"

PanelWindow {
  id: root
  WlrLayershell.namespace: "liquid-glass"

  readonly property bool devMode: false

  anchors {
    top: true
    bottom: true
    left: true
    right: true
  }
  implicitWidth: Screen.width
  implicitHeight: Screen.height
  color: "transparent"
  visible: devMode || currentState !== "idle" || glassVisible

  property string currentState: "idle"
  property real audioVolume: 0.0
  property bool glassVisible: false

  Component.onCompleted: {
    if (devMode) {
      currentState = "recording"
    }
  }

  onCurrentStateChanged: {
    if (currentState === "idle") {
      glassCaptureTimer.stop()
      glassCloseTimer.restart()
    } else if (!glassVisible) {
      glassCloseTimer.stop()
      glassCaptureTimer.restart()
    } else {
      glassCloseTimer.stop()
    }
  }

  Timer {
    id: glassCaptureTimer
    interval: 100

    onTriggered: {
      if (screenCapture.hasContent) {
        root.glassVisible = true
      } else {
        restart()
      }
    }
  }

  Timer {
    id: glassCloseTimer
    interval: 260

    onTriggered: {
      if (root.currentState === "idle") {
        root.glassVisible = false
      }
    }
  }

  Timer {
    id: devAudioTimer
    interval: 16
    running: root.devMode
    repeat: true
    property real phase: 0.0

    onTriggered: {
      phase += 0.08
      let rawVol = (Math.sin(phase) + Math.sin(phase * 2.3) + 2.0) / 4.0
      root.audioVolume = Math.max(0.0, Math.min(1.0, rawVol))
    }
  }

  Timer {
    id: devStateTimer
    interval: 6000
    running: root.devMode
    repeat: true

    onTriggered: {
      root.currentState = (root.currentState === "recording") ? "processing" : "recording"
    }
  }

  Socket {
    id: voxiaSocket
    path: "/tmp/voxia.sock"
    connected: !root.devMode

    parser: SplitParser {
      onRead: data => {
        if (root.devMode) return;
        try {
          let msg = JSON.parse(data);
          if (msg.type === "State") {
            root.currentState = msg.payload.status;
          } else if (msg.type === "Volume") {
            console.log("Volume message:", JSON.stringify(msg))
            root.audioVolume = Number(msg.payload.value) || 0.0
            root.audioVolume = Math.max(
              0.0,
              Math.min(1.0, root.audioVolume)
            )
          }
        } catch (e) {
          console.log("Error parsing IPC JSON:", e);
        }
      }
    }
  }

  ScreencopyView {
    id: screenCapture

    anchors.fill: parent
    captureSource: root.screen
    live: !root.glassVisible
  }

  ShaderEffectSource {
    id: desktopTexture

    anchors.fill: parent
    sourceItem: screenCapture
    sourceRect: Qt.rect(0, 0, root.width, root.height)
    textureSize: screenCapture.sourceSize
    hideSource: true
    live: !root.glassVisible
    visible: false
  }

  Item {
    id: card

    anchors.centerIn: parent
    width: 180
    height: 180
    visible: root.glassVisible
    opacity: root.currentState === "idle" || !root.glassVisible ? 0.0 : 1.0
    scale: root.currentState === "idle" || !root.glassVisible ? 0.72 : 1.0
    transformOrigin: Item.Center

    Behavior on opacity {
      NumberAnimation {
        duration: 220
        easing.type: Easing.OutCubic
      }
    }

    Behavior on scale {
      NumberAnimation {
        duration: 260
        easing.type: Easing.OutBack
        easing.overshoot: 1.15
      }
    }

    FrostedCard {
      anchors.fill: parent
      backgroundTexture: desktopTexture
      backgroundCenter: Qt.vector2d(root.width / 2, root.height / 2)
      backgroundResolution: Qt.vector2d(
        Math.max(screenCapture.sourceSize.width, 1),
        Math.max(screenCapture.sourceSize.height, 1)
      )
      backgroundScale: screenCapture.sourceSize.width > 0
        ? screenCapture.sourceSize.width / Math.max(root.width, 1)
        : Screen.devicePixelRatio

      Orb {
        anchors.fill: parent
        volume: root.audioVolume
        currentState: root.currentState
      }
    }
  }

  // Не перехватывать управление мышью и клавиатурой
  mask: Region {
  }
}