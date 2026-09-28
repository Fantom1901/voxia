import QtQuick
import Quickshell

Item {
  id: card

  default property alias content: container.data

  property real cornerRadius: 30
  property var backgroundTexture: null
  property vector2d backgroundResolution: Qt.vector2d(1, 1)
  property real backgroundScale: 1.0
  property vector2d backgroundOrigin: Qt.vector2d(0, 0)

  implicitWidth: 200
  implicitHeight: 200

  ShaderEffect {
    anchors.fill: parent
    z: 0
    visible: card.backgroundTexture !== null

    property vector2d u_resolution: card.backgroundResolution
    property vector2d u_origin:
      Qt.vector2d(card.backgroundOrigin.x * card.backgroundScale,
                  card.backgroundOrigin.y * card.backgroundScale)
    property vector2d u_size:
      Qt.vector2d(width * card.backgroundScale,
                  height * card.backgroundScale)
    property real u_dpr: card.backgroundScale
    property real cornerRadius: card.cornerRadius * card.backgroundScale
    property var u_background: card.backgroundTexture

    fragmentShader:
      Quickshell.shellDir + "/shaders/frosted_glass.frag.qsb"
  }

  Item {
    id: container

    anchors.fill: parent
    z: 1
  }
}
