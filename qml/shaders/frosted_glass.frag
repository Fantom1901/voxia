#version 440

layout (location = 0) in vec2 qt_TexCoord0;
layout (location = 0) out vec4 fragColor;

layout (std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 size;
    float cornerRadius;
    float frost;
    float refraction;
    float lightAngle;
    float lightStrength;
};

layout (binding = 1) uniform sampler2D source;

float sdRoundedBox(vec2 p, vec2 b, float r)
{
    vec2 q = abs(p) - b + vec2(r);
    return min(max(q.x, q.y), 0.0)
    + length(max(q, 0.0)) - r;
}

vec3 sampleBlurred(vec2 uv, vec2 pixel)
{
    vec3 result = vec3(0.0);

    result += texture(source, uv + pixel * vec2(-2.0, -2.0)).rgb;
    result += texture(source, uv + pixel * vec2(0.0, -2.0)).rgb;
    result += texture(source, uv + pixel * vec2(2.0, -2.0)).rgb;
    result += texture(source, uv + pixel * vec2(-2.0, 0.0)).rgb;
    result += texture(source, uv).rgb;
    result += texture(source, uv + pixel * vec2(2.0, 0.0)).rgb;
    result += texture(source, uv + pixel * vec2(-2.0, 2.0)).rgb;
    result += texture(source, uv + pixel * vec2(0.0, 2.0)).rgb;
    result += texture(source, uv + pixel * vec2(2.0, 2.0)).rgb;

    return result / 9.0;
}

void main()
{
    vec2 safeSize = max(size, vec2(1.0));
    vec2 pos = qt_TexCoord0 * safeSize;
    vec2 halfSize = safeSize * 0.5;
    vec2 p = pos - halfSize;

    float dist = sdRoundedBox(
        p,
        halfSize - vec2(1.0),
        min(cornerRadius, min(halfSize.x, halfSize.y))
    );

    float alpha = 1.0 - smoothstep(0.0, 1.5, dist);

    if (alpha <= 0.001)
    discard;

    float edgeDistance = abs(dist);

    // Мягкий внутренний кант
    float bevel = 1.0 - smoothstep(0.0, 10.0, edgeDistance);

    // Тонкое рассеянное свечение границы
    float rimLight = 1.0 - smoothstep(0.0, 3.0, edgeDistance);

    vec2 normalizedP = p / max(halfSize, vec2(1.0));
    float distanceFromCenter = length(normalizedP);

    vec2 lightDir = vec2(cos(lightAngle), sin(lightAngle));
    vec2 direction = p / max(length(p), 0.001);

    float surfaceGlow = max(dot(direction, lightDir), 0.0);
    surfaceGlow *= 1.0 - smoothstep(0.15, 1.0, distanceFromCenter);

    float grain = fract(
        sin(dot(pos, vec2(12.9898, 78.233))) * 43758.5453
    );

    vec3 glassBase = vec3(0.012, 0.018, 0.040);

    // Тёмное матовое затемнение вместо белого свечения
    vec3 color = glassBase;
    color += vec3(0.018, 0.026, 0.060) * clamp(frost / 5.0, 0.0, 1.0);

    color += vec3(0.025, 0.040, 0.090)
    * rimLight
    * lightStrength
    * 0.10;

    color += vec3(0.010, 0.018, 0.045)
    * surfaceGlow
    * lightStrength
    * 0.08;

    color += vec3(grain - 0.5) * 0.004;

    float glassAlpha =
    (0.72 + bevel * 0.08 + rimLight * 0.04)
    * alpha
    * qt_Opacity;

    vec2 uv = qt_TexCoord0;
    vec2 pixel = 1.0 / safeSize;

    vec3 background = sampleBlurred(uv, pixel);

    // Тёмное матовое затемнение поверх размытого фона.
    color = background * 0.38;
    color += vec3(0.008, 0.012, 0.030);
    color += vec3(grain - 0.5) * 0.006;

    glassAlpha =
    (0.94 + bevel * 0.04 + rimLight * 0.02)
    * alpha
    * qt_Opacity;

    fragColor = vec4(color * glassAlpha, glassAlpha);
}