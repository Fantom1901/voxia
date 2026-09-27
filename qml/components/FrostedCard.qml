import QtQuick
import Quickshell

Item {
  id: card

  default property alias content: container.data

  property real cornerRadius: 30

  implicitWidth: 200
  implicitHeight: 200

  ShaderEffect {
    id: glass

    anchors.fill: parent
    z: 0

    property vector2d size:
      Qt.vector2d(width, height)

    property real cornerRadius: card.cornerRadius
    property real frost: 5.0
    property real refraction: 35.0
    property real lightAngle: 1.3089
    property real lightStrength: 0.55

    fragmentShader:
      Quickshell.shellDir + "/shaders/frosted_glass.frag.qsb"
  }

  Item {
    id: container

    anchors.fill: parent
    z: 1
  }
}